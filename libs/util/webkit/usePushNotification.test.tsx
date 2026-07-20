import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

type RenderHookResult<T> = {
  get current(): T;
  unmount: () => void;
};

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const effectCleanups: Array<() => void> = [];

const pushState = {
  platform: "web",
  receive: "granted" as "granted" | "denied",
  registered: 0,
  autoInit: 0,
  actionListeners: [] as Array<(event: { notification?: { data?: Record<string, unknown> } }) => void>,
  registrationListeners: [] as Array<(event: { value?: string }) => void>,
};
const deepLinks: string[] = [];

beforeAll(() => {
  mock.module("react", () => ({
    Fragment: ({ children }: { children: unknown }) => children,
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
  }));
});

const installCapacitorBridge = () => {
  Object.defineProperty(globalThis, "Capacitor", {
    value: {
      Plugins: {
        Device: {
          getInfo: async () => ({ platform: pushState.platform }),
        },
        PushNotifications: {
          requestPermissions: async () => ({ receive: pushState.receive }),
          checkPermissions: async () => ({ receive: pushState.receive }),
          register: async () => {
            pushState.registered += 1;
            pushState.registrationListeners.forEach((listener) => {
              listener({ value: "native-token" });
            });
          },
          addListener: async (
            eventName: string,
            listener: (event: { value?: string; notification?: { data?: Record<string, unknown> } }) => void,
          ) => {
            if (eventName === "registration") pushState.registrationListeners.push(listener);
            else if (eventName === "pushNotificationActionPerformed") pushState.actionListeners.push(listener);
            return { remove: () => undefined };
          },
        },
        FCM: {
          setAutoInit: async () => {
            pushState.autoInit += 1;
          },
          getToken: async () => ({ token: "token-1" }),
        },
      },
    },
    configurable: true,
  });
};

const installWindow = () => {
  const window = {
    location: { origin: "https://example.test" },
    Capacitor: (globalThis as typeof globalThis & { Capacitor?: unknown }).Capacitor,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as Window & typeof globalThis;
  installCapacitorBridge();
  (window as unknown as { Capacitor: unknown }).Capacitor = (
    globalThis as typeof globalThis & { Capacitor?: unknown }
  ).Capacitor;
  Object.defineProperty(globalThis, "window", { value: window, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: { serviceWorker: {} }, configurable: true });
  Object.defineProperty(globalThis, "location", { value: window.location, configurable: true });
};

const renderHook = <T,>(hook: () => T): RenderHookResult<T> => {
  const current = hook();
  return {
    get current() {
      return current;
    },
    unmount: () =>
      effectCleanups.splice(0).forEach((cleanup) => {
        cleanup();
      }),
  };
};

afterEach(() => {
  Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
  Object.defineProperty(globalThis, "document", { value: originalDocument, configurable: true });
  Object.defineProperty(globalThis, "location", { value: originalWindow?.location, configurable: true });
  Object.defineProperty(globalThis, "Capacitor", { value: undefined, configurable: true });
  pushState.platform = "web";
  pushState.receive = "granted";
  pushState.registered = 0;
  pushState.autoInit = 0;
  pushState.actionListeners = [];
  pushState.registrationListeners = [];
  deepLinks.length = 0;
  globalThis.__AKAN_PUSH_CLICK_BRIDGE__ = undefined;
  globalThis.__AKAN_CLIENT_ENV__ = undefined;
  effectCleanups.splice(0);
});

describe("usePushNotification", () => {
  test("returns PushToken, no-ops on web, and bridges native push clicks", async () => {
    installWindow();
    const { usePushNotification } = await import("./usePushNotification");
    const hook = renderHook(() => usePushNotification());

    expect(await hook.current.register()).toBeUndefined();
    expect(pushState.registered).toBe(0);

    pushState.platform = "ios";
    await hook.current.initClickBridge();
    const pushToken = await hook.current.register();
    expect(pushState.autoInit).toBe(1);
    expect(pushState.registered).toBe(1);
    expect(pushToken).toEqual({ token: "token-1", platform: "ios", provider: "fcm" });
    expect(await hook.current.getToken()).toEqual({ token: "token-1", platform: "ios", provider: "fcm" });
    pushState.actionListeners[0]?.({ notification: { data: { url: "/push-target" } } });
    expect(deepLinks).toEqual(["/push-target"]);

    pushState.receive = "denied";
    expect(await hook.current.register()).toBeUndefined();
    hook.unmount();
  });
});
