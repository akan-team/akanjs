"use client";

import { router } from "akanjs/client";
import { loadCapacitorDevice, loadCapacitorFcm, loadCapacitorPushNotifications } from "akanjs/client/capacitor";
import { getApps, initializeApp } from "firebase/app";
import { getToken as getFirebaseToken, getMessaging, type Messaging, onMessage } from "firebase/messaging";
import { useEffect } from "react";
import { pushNavigateMessage } from "../common/pushNavigateMessage";

export type PushNotificationPlatform = "web" | "ios" | "android";
export type PushNotificationProvider = "fcm";

// Client env shape for firebase web push; mirrors the fields of firebase's `FirebaseOptions`.
export interface FirebaseOptions {
  apiKey?: string;
  authDomain?: string;
  databaseURL?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
}

export interface PushToken {
  token: string;
  platform: PushNotificationPlatform;
  provider: PushNotificationProvider;
  deviceId?: string;
}

export type PushNotificationPermission = "prompt" | "granted" | "denied" | string;

export interface PushNotificationClientEnv {
  firebase?: FirebaseOptions & {
    vapidKey?: string;
  };
}

/** The runtime globals this integration touches: the injected client env, plus the two install guards cached
 *  on `globalThis` so repeated calls register the click and foreground listeners once per page. */
export interface PushNotificationGlobals {
  __AKAN_PUSH_CLICK_BRIDGE__?: Promise<boolean>;
  __AKAN_PUSH_WEB_CLICK__?: boolean;
  __AKAN_PUSH_FOREGROUND__?: boolean;
  __AKAN_CLIENT_ENV__?: PushNotificationClientEnv;
}

/** Typed view of those globals. An explicit accessor instead of `declare global` keeps the augmentation
 *  local to this low-level integration rather than merging `var` declarations into every compilation. */
export const pushNotificationGlobals = (): PushNotificationGlobals => globalThis as unknown as PushNotificationGlobals;

const getClientEnv = () => pushNotificationGlobals().__AKAN_CLIENT_ENV__;

const getFirebaseConfig = () => getClientEnv()?.firebase;

const normalizePlatform = (platform: string): PushNotificationPlatform | null => {
  if (platform === "web" || platform === "ios" || platform === "android") return platform;
  return null;
};

const isWebRuntime = () => typeof window !== "undefined" && typeof navigator !== "undefined";

const isInternalDeepLink = (url: string) => {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  if (!isWebRuntime()) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
};

const enterDeepLink = (url: string) => {
  if (!isInternalDeepLink(url)) return false;
  const parsed = new URL(url, isWebRuntime() ? window.location.origin : "http://localhost");
  return router.enterDeepLink(`${parsed.pathname}${parsed.search}${parsed.hash}`);
};

export const applyPushBadge = (count: string | number | undefined) => {
  // Firefox and desktop Safari ship no setAppBadge; calling it unguarded is a synchronous TypeError.
  if (count === undefined || !isWebRuntime() || !("setAppBadge" in navigator)) return;
  const parsed = typeof count === "number" ? count : Number.parseInt(count, 10);
  if (Number.isNaN(parsed)) return;
  void navigator.setAppBadge(parsed);
};

const getNativePlatform = async () => {
  const { Device } = await loadCapacitorDevice();
  const device = await Device.getInfo();
  return normalizePlatform(device.platform);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getNativeToken = async (options?: { retries?: number }): Promise<PushToken | undefined> => {
  const [{ FCM }, platform] = await Promise.all([loadCapacitorFcm(), getNativePlatform()]);
  if (!platform || platform === "web") return undefined;

  const retries = options?.retries ?? 0;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { token } = await FCM.getToken();
    if (token) return { token, platform, provider: "fcm" };
    if (attempt < retries) await sleep(500 * (attempt + 1));
  }

  return undefined;
};

//* FCM SDK 는 보이는 window client 가 하나라도 있으면 워커에서 그리지 않고 페이지로 payload 를 넘긴다.
//* 이 경로가 없으면 앱 창을 보고 있는 동안 푸시가 통째로 사라진다 — FCM 응답은 성공이라 서버 쪽은 정상으로 보인다.
const initForegroundDisplay = (messaging: Messaging, registration: ServiceWorkerRegistration) => {
  const globals = pushNotificationGlobals();
  if (globals.__AKAN_PUSH_FOREGROUND__) return;
  globals.__AKAN_PUSH_FOREGROUND__ = true;
  onMessage(messaging, (payload) => {
    const data: Record<string, string | undefined> = payload.data ?? {};
    applyPushBadge(data.badgeCount);
    const title = payload.notification?.title ?? data.title;
    const body = payload.notification?.body ?? data.body;
    if (!title && !body) return;
    // Drawing through the worker's own registration keeps the click on `notificationclick`, so a foreground
    // and a background notification take the one deep-link path instead of two that can drift apart.
    void registration.showNotification(title ?? "", {
      body,
      icon: payload.notification?.icon ?? data.icon,
      tag: data.tag,
      data: { url: data.url ?? payload.fcmOptions?.link, FCM_MSG: payload },
    });
  });
};

const getWebToken = async (): Promise<PushToken | undefined> => {
  if (!isWebRuntime() || !("serviceWorker" in navigator)) return undefined;
  const firebaseConfig = getFirebaseConfig();
  if (
    !firebaseConfig?.apiKey ||
    !firebaseConfig.projectId ||
    !firebaseConfig.messagingSenderId ||
    !firebaseConfig.appId
  ) {
    return undefined;
  }
  const firebase = getApps()[0] ?? initializeApp(firebaseConfig);
  const messaging = getMessaging(firebase);
  const serviceWorkerRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const token = await getFirebaseToken(messaging, {
    vapidKey: firebaseConfig.vapidKey,
    serviceWorkerRegistration,
  });
  initForegroundDisplay(messaging, serviceWorkerRegistration);
  if (!token) return undefined;
  return { token, platform: "web", provider: "fcm" };
};

//* 워커가 이미 열린 탭을 찾아 넘긴 알림 클릭을 받아 클라이언트 라우팅으로 잇는다(풀 리로드 방지).
const initWebClickBridge = () => {
  const globals = pushNotificationGlobals();
  if (globals.__AKAN_PUSH_WEB_CLICK__) return;
  if (!isWebRuntime() || typeof navigator.serviceWorker?.addEventListener !== "function") return;
  globals.__AKAN_PUSH_WEB_CLICK__ = true;
  navigator.serviceWorker.addEventListener("message", (event) => {
    const message = event.data as { type?: unknown; url?: unknown } | null;
    if (message?.type !== pushNavigateMessage || typeof message.url !== "string") return;
    try {
      enterDeepLink(message.url);
    } catch {
      // Router may not be initialized yet when the click wakes a backgrounded tab.
    }
  });
};

//* 이미 워커가 설치된 재방문에서는 register() 가 다시 불리지 않으므로, 여기서 포그라운드 경로를 복구한다.
const restoreForegroundDisplay = async () => {
  if (!isWebRuntime() || typeof navigator.serviceWorker?.getRegistration !== "function") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const firebaseConfig = getFirebaseConfig();
  if (!firebaseConfig?.apiKey) return;
  const registration = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
  if (!registration) return;
  initForegroundDisplay(getMessaging(getApps()[0] ?? initializeApp(firebaseConfig)), registration);
};

const getPushUrlFromNativeEvent = (event: { notification?: { data?: Record<string, unknown> } }) => {
  const data = event.notification?.data;
  const fcmMessage = data?.FCM_MSG as { data?: { url?: unknown }; fcmOptions?: { link?: unknown } } | undefined;
  const directUrl = data?.url;
  const nestedUrl = fcmMessage?.data?.url ?? fcmMessage?.fcmOptions?.link;
  return typeof directUrl === "string" ? directUrl : typeof nestedUrl === "string" ? nestedUrl : undefined;
};

const waitForNativeRegistration = async (
  PushNotifications: Awaited<ReturnType<typeof loadCapacitorPushNotifications>>["PushNotifications"],
): Promise<string | undefined> => {
  let registrationHandle: { remove?: () => Promise<void> | void } | void;
  let errorHandle: { remove?: () => Promise<void> | void } | void;

  const cleanup = async () => {
    await registrationHandle?.remove?.();
    await errorHandle?.remove?.();
  };

  return await new Promise<string | undefined>((resolve) => {
    let settled = false;
    const finish = (token?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void cleanup();
      resolve(token);
    };

    const timeout = setTimeout(() => finish(), 8000);

    Promise.resolve(
      PushNotifications.addListener("registration", (event) => {
        finish(typeof event.value === "string" ? event.value : undefined);
      }),
    ).then((handle) => {
      registrationHandle = handle;
    });
    Promise.resolve(PushNotifications.addListener("registrationError", () => finish())).then((handle) => {
      errorHandle = handle;
    });
    Promise.resolve(PushNotifications.register()).catch(() => finish());
  });
};

export const initPushNotificationClickBridge = async () => {
  const globals = pushNotificationGlobals();
  if (globals.__AKAN_PUSH_CLICK_BRIDGE__) return await globals.__AKAN_PUSH_CLICK_BRIDGE__;

  try {
    // A page with no native bridge is the web: the Device loader rejects there rather than answering "web".
    const platform = await getNativePlatform().catch(() => "web" as const);
    if (!platform || platform === "web") {
      initWebClickBridge();
      await restoreForegroundDisplay();
      return true;
    }

    globals.__AKAN_PUSH_CLICK_BRIDGE__ = (async () => {
      const { PushNotifications } = await loadCapacitorPushNotifications();
      await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
        const url = getPushUrlFromNativeEvent(event);
        if (!url) return;
        try {
          enterDeepLink(url);
        } catch {
          // Router may not be initialized yet during very early native resumes.
        }
      });
      return true;
    })();

    return await globals.__AKAN_PUSH_CLICK_BRIDGE__;
  } catch {
    return false;
  }
};

export const usePushNotification = () => {
  useEffect(() => {
    void initPushNotificationClickBridge();
  }, []);

  const isSupported = async () => {
    if (!isWebRuntime()) return false;
    try {
      const platform = await getNativePlatform();
      if (platform && platform !== "web") {
        await Promise.all([loadCapacitorFcm(), loadCapacitorPushNotifications()]);
        return true;
      }
    } catch {
      // Fall through to web support checks.
    }
    return Boolean(getFirebaseConfig()?.apiKey && "Notification" in window && "serviceWorker" in navigator);
  };

  const getPermission = async (): Promise<PushNotificationPermission> => {
    try {
      const platform = await getNativePlatform();
      if (platform && platform !== "web") {
        const { PushNotifications } = await loadCapacitorPushNotifications();
        const { receive } = await PushNotifications.checkPermissions();
        return receive;
      }
    } catch {
      // Fall through to web permission checks.
    }
    if (!isWebRuntime() || !("Notification" in window)) return "denied";
    return Notification.permission;
  };

  const requestPermission = async (): Promise<PushNotificationPermission> => {
    try {
      const platform = await getNativePlatform();
      if (platform && platform !== "web") {
        const { PushNotifications } = await loadCapacitorPushNotifications();
        const { receive } = await PushNotifications.requestPermissions();
        return receive;
      }
    } catch {
      // Fall through to web permission checks.
    }
    if (!isWebRuntime() || !("Notification" in window)) return "denied";
    return await Notification.requestPermission();
  };

  const getToken = async () => {
    try {
      const platform = await getNativePlatform();
      if (platform && platform !== "web") return await getNativeToken();
    } catch {
      // Fall through to web token lookup.
    }
    try {
      return await getWebToken();
    } catch {
      return undefined;
    }
  };

  const register = async () => {
    try {
      const permission = await requestPermission();

      const platform = await getNativePlatform().catch(() => null);
      if (platform && platform !== "web") {
        const [{ FCM }, { PushNotifications }] = await Promise.all([
          loadCapacitorFcm(),
          loadCapacitorPushNotifications(),
        ]);
        await FCM.setAutoInit({ enabled: true });

        if (platform === "android") {
          return await getNativeToken({ retries: 5 });
        }

        if (permission !== "granted") return undefined;
        await waitForNativeRegistration(PushNotifications);
        return await getNativeToken({ retries: 5 });
      }

      if (permission !== "granted") return undefined;
      return await getWebToken();
    } catch {
      return undefined;
    }
  };

  return {
    isSupported,
    getPermission,
    requestPermission,
    register,
    getToken,
    initClickBridge: initPushNotificationClickBridge,
  };
};
