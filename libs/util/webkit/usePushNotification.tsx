"use client";

import { router } from "akanjs/client";
import { loadCapacitorDevice, loadCapacitorFcm, loadCapacitorPushNotifications } from "akanjs/client/capacitor";
import { getApps, initializeApp } from "firebase/app";
import { getToken as getFirebaseToken, getMessaging } from "firebase/messaging";
import { useEffect } from "react";

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

/** The two runtime globals this integration touches: the injected client env, and the click-bridge promise
 *  cached on `globalThis` so repeated `initPushNotificationClickBridge` calls register the native listener
 *  once per page. */
export interface PushNotificationGlobals {
  __AKAN_PUSH_CLICK_BRIDGE__?: Promise<boolean>;
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
  if (!token) return undefined;
  return { token, platform: "web", provider: "fcm" };
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
    const platform = await getNativePlatform();
    if (!platform || platform === "web") return true;

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
