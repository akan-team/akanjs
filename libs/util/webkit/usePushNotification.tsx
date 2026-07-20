"use client";

import { router } from "akanjs/client";
import { loadCapacitorDevice, loadCapacitorFcm, loadCapacitorPushNotifications } from "akanjs/client/capacitor";

import { useEffect } from "react";

export type PushNotificationPlatform = "web" | "ios" | "android";
export type PushNotificationProvider = "fcm";

// Minimal mirror of firebase's `FirebaseOptions` so this module never statically
// depends on the optional `firebase` package (it is loaded lazily in getWebToken).
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

declare global {
  // eslint-disable-next-line no-var
  var __AKAN_PUSH_CLICK_BRIDGE__: Promise<boolean> | undefined;
  // eslint-disable-next-line no-var
  var __AKAN_CLIENT_ENV__: PushNotificationClientEnv | undefined;
}

const getClientEnv = () => globalThis.__AKAN_CLIENT_ENV__;

const getFirebaseConfig = () => getClientEnv()?.firebase;

// `firebase` is an optional peer that is not part of the bootstrap install, so it
// must never appear as a statically-analyzable import — otherwise the app bundler
// tries to resolve it and fails with "Could not resolve firebase/app" when it is
// absent. Loading through an indirect specifier keeps it invisible to the bundler
// (same idea as akanjs/client/capacitor, which reaches plugins via the global
// Capacitor registry instead of importing the optional native packages). The
// modules resolve at runtime only on the web platform, where firebase is present.
const firebaseAppPackage = "firebase/app";
const firebaseMessagingPackage = "firebase/messaging";

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
  const [{ getApps, initializeApp }, { getToken: getFirebaseToken, getMessaging }] = await Promise.all([
    null as unknown as typeof import("firebase/app"), //! temporary disabled
    null as unknown as typeof import("firebase/messaging"), //@ temporary disabled
    // import("firebase/app"),
    // import("firebase/messaging"),
  ]);
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
  if (globalThis.__AKAN_PUSH_CLICK_BRIDGE__) return await globalThis.__AKAN_PUSH_CLICK_BRIDGE__;

  try {
    const platform = await getNativePlatform();
    if (!platform || platform === "web") return true;

    globalThis.__AKAN_PUSH_CLICK_BRIDGE__ = (async () => {
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

    return await globalThis.__AKAN_PUSH_CLICK_BRIDGE__;
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
