import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

// Type-only (erased) so the module under test is still first evaluated by the in-test dynamic import,
// after `mock.module` has replaced react / akanjs.
import { pushNavigateMessage } from "../common/pushNavigateMessage";
import type { PushNotificationGlobals } from "./usePushNotification";

const pushGlobals = globalThis as unknown as PushNotificationGlobals;

const originalWindow = globalThis.window;
const effectCleanups: Array<() => void> = [];

const shell = {
  native: false,
  display: "granted" as "granted" | "denied" | "prompt",
  requested: 0,
  registered: 0,
  tokenListeners: [] as Array<
    (token: { token: string; provider: "apns" | "fcm"; platform: "ios" | "android" }) => void
  >,
};
const stored = new Map<string, string>();
const deepLinks: string[] = [];
const swMessageListeners: Array<(event: { data: unknown }) => void> = [];
let firebaseImports = 0;

beforeAll(() => {
  mock.module("react", () => ({
    useEffect: (fn: () => (() => undefined) | undefined) => {
      const cleanup = fn();
      if (cleanup) effectCleanups.push(cleanup);
    },
  }));
  mock.module("akanjs/client", () => ({
    router: {
      enterDeepLink: (href: string) => {
        deepLinks.push(href);
        return true;
      },
    },
    storage: {
      getItem: async (key: string) => stored.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        stored.set(key, value);
      },
    },
  }));
  mock.module("akanjs/client/native", () => ({
    isNativeApp: () => shell.native,
    push: {
      isSupported: () => shell.native,
      checkPermission: async () => ({ display: shell.display }),
      requestPermission: async () => {
        shell.requested += 1;
        return { display: shell.display };
      },
      register: async () => {
        shell.registered += 1;
        return { token: "apns-token", provider: "apns", platform: "ios" };
      },
      listen: (_event: "token", listener: (typeof shell.tokenListeners)[number]) => {
        shell.tokenListeners.push(listener);
        return () => {
          shell.tokenListeners = shell.tokenListeners.filter((each) => each !== listener);
        };
      },
    },
  }));
  mock.module("firebase/app", () => {
    firebaseImports += 1;
    return { getApps: () => [], initializeApp: () => ({}) };
  });
  mock.module("firebase/messaging", () => ({
    getMessaging: () => ({}),
    getToken: async () => "",
    onMessage: () => undefined,
  }));
});

const installWindow = () => {
  const window = {
    location: { origin: "https://example.test" },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as Window & typeof globalThis;
  Object.defineProperty(globalThis, "window", { value: window, configurable: true });
  Object.defineProperty(globalThis, "navigator", {
    value: {
      serviceWorker: {
        addEventListener: (eventName: string, listener: (event: { data: unknown }) => void) => {
          if (eventName === "message") swMessageListeners.push(listener);
        },
        getRegistration: async () => undefined,
      },
    },
    configurable: true,
  });
};

const hookOf = async () => {
  const { usePushNotification } = await import("./usePushNotification");
  return usePushNotification();
};

afterEach(() => {
  Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
  Object.assign(shell, { native: false, display: "granted", requested: 0, registered: 0, tokenListeners: [] });
  stored.clear();
  deepLinks.length = 0;
  swMessageListeners.length = 0;
  firebaseImports = 0;
  pushGlobals.__AKAN_PUSH_WEB_CLICK__ = undefined;
  pushGlobals.__AKAN_PUSH_FOREGROUND__ = undefined;
  pushGlobals.__AKAN_CLIENT_ENV__ = undefined;
  effectCleanups.splice(0).forEach((cleanup) => {
    cleanup();
  });
});

describe("usePushNotification", () => {
  test("registers a native shell with its provider and one installation id, and never loads firebase", async () => {
    installWindow();
    shell.native = true;
    const push = await hookOf();

    const first = await push.register();
    const again = await push.getToken();

    expect(first).toMatchObject({ token: "apns-token", provider: "apns", platform: "ios" });
    expect(first?.deviceId).toHaveLength(32);
    expect(again?.deviceId).toBe(first?.deviceId);
    expect(stored.get("akan:pushDeviceId")).toBe(first?.deviceId);
    expect([shell.requested, shell.registered]).toEqual([1, 2]);
    expect(firebaseImports).toBe(0);
  });

  test("hands back nothing when the person refuses, and asks for nothing just to read the token", async () => {
    installWindow();
    shell.native = true;
    shell.display = "denied";
    const push = await hookOf();

    expect(await push.register()).toBeUndefined();
    expect(shell.registered).toBe(0);
    expect(await push.getPermission()).toBe("denied");
    expect(shell.requested).toBe(1);
  });

  test("passes each rotated native token on with the same installation id", async () => {
    installWindow();
    shell.native = true;
    const push = await hookOf();
    const { deviceId } = (await push.getToken()) ?? {};
    const received: unknown[] = [];

    const stop = push.onTokenChange((pushToken) => received.push(pushToken));
    shell.tokenListeners[0]?.({ token: "fcm-token", provider: "fcm", platform: "android" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();

    expect(received).toEqual([{ token: "fcm-token", provider: "fcm", platform: "android", deviceId }]);
    expect(shell.tokenListeners).toHaveLength(0);
  });

  test("leaves a native shell's taps to the framework and watches no service worker", async () => {
    installWindow();
    shell.native = true;
    const push = await hookOf();

    expect(await push.initClickBridge()).toBe(true);
    expect(swMessageListeners).toHaveLength(0);
  });

  test("routes a worker's notification-click handover through the client router", async () => {
    installWindow();
    const push = await hookOf();

    expect(await push.initClickBridge()).toBe(true);
    expect(swMessageListeners).toHaveLength(1);

    swMessageListeners[0]?.({ data: { type: pushNavigateMessage, url: "/notified" } });
    swMessageListeners[0]?.({ data: { type: "unrelated", url: "/ignored" } });
    swMessageListeners[0]?.({ data: { type: pushNavigateMessage } });
    swMessageListeners[0]?.({ data: { type: pushNavigateMessage, url: "https://elsewhere.test/x" } });
    expect(deepLinks).toEqual(["/notified"]);
  });

  test("offers no web push without the firebase config", async () => {
    installWindow();
    const push = await hookOf();

    expect(await push.isSupported()).toBe(false);
    expect(await push.getToken()).toBeUndefined();
    expect(push.onTokenChange(() => undefined)()).toBeUndefined();
  });
});
