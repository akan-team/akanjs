"use client";

import { router, storage } from "akanjs/client";
import { isNativeApp, type NativePushToken, push } from "akanjs/client/native";
import type { Messaging } from "firebase/messaging";
import { useEffect } from "react";
import { pushNavigateMessage } from "../common/pushNavigateMessage";

export type PushNotificationPlatform = "web" | "ios" | "android";
export type PushNotificationProvider = "apns" | "fcm";

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
  // This installation, so the server replaces the token a device had instead of keeping both.
  deviceId: string;
}

export type PushNotificationPermission = "prompt" | "prompt-with-rationale" | "granted" | "denied" | "default";

export interface PushNotificationClientEnv {
  firebase?: FirebaseOptions & {
    vapidKey?: string;
  };
}

/** The runtime globals this integration touches: the injected client env, plus the two install guards cached
 *  on `globalThis` so repeated calls register the click and foreground listeners once per page. */
export interface PushNotificationGlobals {
  __AKAN_PUSH_WEB_CLICK__?: boolean;
  __AKAN_PUSH_FOREGROUND__?: boolean;
  __AKAN_CLIENT_ENV__?: PushNotificationClientEnv;
}

/** Typed view of those globals. An explicit accessor instead of `declare global` keeps the augmentation
 *  local to this low-level integration rather than merging `var` declarations into every compilation. */
export const pushNotificationGlobals = (): PushNotificationGlobals => globalThis as unknown as PushNotificationGlobals;

const getClientEnv = () => pushNotificationGlobals().__AKAN_CLIENT_ENV__;

const getFirebaseConfig = () => getClientEnv()?.firebase;

const isWebRuntime = () => typeof window !== "undefined" && typeof navigator !== "undefined";

//? firebase is web push only; loaded on first use so a native shell's bundle never evaluates it.
let firebaseLoad: Promise<[typeof import("firebase/app"), typeof import("firebase/messaging")]> | null = null;
const loadFirebase = () => (firebaseLoad ??= Promise.all([import("firebase/app"), import("firebase/messaging")]));

const pushDeviceIdKey = "akan:pushDeviceId";
let deviceIdLoad: Promise<string> | null = null;

//? Kept in the app's own storage, so a reinstall or cleared site data starts a new installation along with its token.
export const getPushDeviceId = () =>
  (deviceIdLoad ??= (async () => {
    const stored = await storage.getItem(pushDeviceIdKey);
    if (stored) return stored;
    const created = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    await storage.setItem(pushDeviceIdKey, created);
    return created;
  })().catch((error: unknown) => {
    deviceIdLoad = null;
    throw error;
  }));

/** The installation id if this device ever registered for push, without making one. */
export const loadPushDeviceId = async () => (await storage.getItem(pushDeviceIdKey)) ?? null;

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

const withDeviceId = async ({ token, provider, platform }: NativePushToken): Promise<PushToken> => ({
  token,
  provider,
  platform,
  deviceId: await getPushDeviceId(),
});

//* FCM SDK 는 보이는 window client 가 하나라도 있으면 워커에서 그리지 않고 페이지로 payload 를 넘긴다.
//* 이 경로가 없으면 앱 창을 보고 있는 동안 푸시가 통째로 사라진다 — FCM 응답은 성공이라 서버 쪽은 정상으로 보인다.
const initForegroundDisplay = async (messaging: Messaging, registration: ServiceWorkerRegistration) => {
  const globals = pushNotificationGlobals();
  if (globals.__AKAN_PUSH_FOREGROUND__) return;
  globals.__AKAN_PUSH_FOREGROUND__ = true;
  const [, { onMessage }] = await loadFirebase();
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

const getWebMessaging = async () => {
  const firebaseConfig = getFirebaseConfig();
  if (!firebaseConfig?.apiKey) return null;
  const [{ getApps, initializeApp }, { getMessaging }] = await loadFirebase();
  return getMessaging(getApps()[0] ?? initializeApp(firebaseConfig));
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
  const messaging = await getWebMessaging();
  if (!messaging) return undefined;
  const [, { getToken }] = await loadFirebase();
  const serviceWorkerRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const token = await getToken(messaging, { vapidKey: firebaseConfig.vapidKey, serviceWorkerRegistration });
  await initForegroundDisplay(messaging, serviceWorkerRegistration);
  if (!token) return undefined;
  return { token, platform: "web", provider: "fcm", deviceId: await getPushDeviceId() };
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
  const registration = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
  if (!registration) return;
  const messaging = await getWebMessaging();
  if (messaging) await initForegroundDisplay(messaging, registration);
};

/** The web's notification clicks. A native shell's taps are deep links the framework routes from boot. */
export const initPushNotificationClickBridge = async () => {
  if (isNativeApp()) return true;
  try {
    initWebClickBridge();
    await restoreForegroundDisplay();
    return true;
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
    if (isNativeApp()) return push.isSupported("register");
    return Boolean(getFirebaseConfig()?.apiKey && "Notification" in window && "serviceWorker" in navigator);
  };

  const getPermission = async (): Promise<PushNotificationPermission> => {
    if (isNativeApp()) {
      if (!push.isSupported("checkPermission")) return "denied";
      return (await push.checkPermission()).display;
    }
    if (!isWebRuntime() || !("Notification" in window)) return "denied";
    return Notification.permission;
  };

  const requestPermission = async (): Promise<PushNotificationPermission> => {
    if (isNativeApp()) {
      if (!push.isSupported("requestPermission")) return "denied";
      return (await push.requestPermission()).display;
    }
    if (!isWebRuntime() || !("Notification" in window)) return "denied";
    return await Notification.requestPermission();
  };

  //? Asks for nothing: registering with APNs or FCM shows no prompt, so callers check the permission first.
  const getToken = async () => {
    try {
      if (isNativeApp()) return await withDeviceId(await push.register());
      return await getWebToken();
    } catch {
      return undefined;
    }
  };

  const register = async () => {
    try {
      if ((await requestPermission()) !== "granted") return undefined;
      return await getToken();
    } catch {
      return undefined;
    }
  };

  /** A native shell's token rotates on its own (FCM refreshes, APNs after a restore); hand each new one to the server. */
  const onTokenChange = (listener: (pushToken: PushToken) => void) => {
    if (!isNativeApp()) return () => undefined;
    return push.listen("token", (nativeToken) => {
      void withDeviceId(nativeToken).then(listener);
    });
  };

  return {
    isSupported,
    getPermission,
    requestPermission,
    register,
    getToken,
    onTokenChange,
    initClickBridge: initPushNotificationClickBridge,
  };
};
