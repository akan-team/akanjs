"use client";

import { isNativeApp, router } from "akanjs/client";
import type { NativePushToken } from "akanjs/client/native";
import { Logger } from "akanjs/common";
import type { Messaging } from "firebase/messaging";
import { useEffect } from "react";
import { pushColdOpenParam } from "../common/pushColdOpenParam";
import { pushNavigateMessage } from "../common/pushNavigateMessage";
import { getPushDeviceId } from "./pushDeviceId";

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

//? Loaded on first use too: a static import puts @akanjs/native/core on every web page that renders this hook.
const loadPush = async () => {
  try {
    return (await import("akanjs/client/native/push")).push;
  } catch (error) {
    Logger.warn(`The native push plugin did not load, so push is off on this page: ${String(error)}`);
    return null;
  }
};

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

type TokenListener = (pushToken: PushToken) => void;

//? One native subscription per page, kept: an effect re-run swaps the listener without a $unlisten/$listen round trip.
const tokenListeners = new Set<TokenListener>();
//? The shell keeps the latest token no page heard for the next listener; with the subscription kept, the page must.
let heldToken: NativePushToken | null = null;
let latestToken: NativePushToken | null = null;
let tokenSubscription: Promise<void> | null = null;

//? Listeners are read at delivery, not arrival: a remount or effect re-run while the device id resolves swaps them.
const handOn = (nativeToken: NativePushToken) =>
  void withDeviceId(nativeToken)
    .then((pushToken) => {
      if (tokenListeners.size) for (const listener of [...tokenListeners]) listener(pushToken);
      else if (nativeToken === latestToken) heldToken = nativeToken;
    })
    .catch((error: unknown) => Logger.warn(`A rotated push token was not handed on: ${String(error)}`));

const subscribeTokens = () =>
  (tokenSubscription ??= loadPush().then((push) => {
    if (!push) {
      tokenSubscription = null;
      return;
    }
    try {
      push.listen("token", (nativeToken) => {
        latestToken = nativeToken;
        if (tokenListeners.size) handOn(nativeToken);
        else heldToken = nativeToken;
      });
    } catch (error) {
      tokenSubscription = null;
      Logger.warn(`The native push token subscription failed: ${String(error)}`);
    }
  }));

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

//? akanjs steps its own deep-link stack 450ms apart, so each pushed screen finishes its transition before the next.
const coldOpenStepMs = 450;

/**
 * A window a notification opened has nothing behind it, so Back left the app on a blank screen. When the worker
 * marked this load as such, lays the screens `parentsOf` names under the target and drops the mark.
 */
export const enterPushColdOpen = (parentsOf: (href: string) => string[]) => {
  if (!isWebRuntime()) return false;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(pushColdOpenParam)) return false;
  url.searchParams.delete(pushColdOpenParam);
  const target = `${url.pathname}${url.search}${url.hash}`;
  const [first, ...rest] = [...parentsOf(target), target];
  router.replace(first);
  rest.forEach((href, idx) => {
    setTimeout(() => router.push(href), coldOpenStepMs * (idx + 1));
  });
  return true;
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
    if (isNativeApp()) return (await loadPush())?.isSupported("register") ?? false;
    return Boolean(getFirebaseConfig()?.apiKey && "Notification" in window && "serviceWorker" in navigator);
  };

  const getPermission = async (): Promise<PushNotificationPermission> => {
    if (isNativeApp()) {
      const push = await loadPush();
      if (!push?.isSupported("checkPermission")) return "denied";
      return (await push.checkPermission()).display;
    }
    if (!isWebRuntime() || !("Notification" in window)) return "denied";
    return Notification.permission;
  };

  const requestPermission = async (): Promise<PushNotificationPermission> => {
    if (isNativeApp()) {
      const push = await loadPush();
      if (!push?.isSupported("requestPermission")) return "denied";
      return (await push.requestPermission()).display;
    }
    if (!isWebRuntime() || !("Notification" in window)) return "denied";
    return await Notification.requestPermission();
  };

  //? Asks for nothing: registering with APNs or FCM shows no prompt, so callers check the permission first.
  const getToken = async () => {
    try {
      if (isNativeApp()) {
        const push = await loadPush();
        return push ? await withDeviceId(await push.register()) : undefined;
      }
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
    const each: TokenListener = (pushToken) => listener(pushToken);
    tokenListeners.add(each);
    if (heldToken) handOn(heldToken);
    heldToken = null;
    void subscribeTokens();
    return () => {
      tokenListeners.delete(each);
    };
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
