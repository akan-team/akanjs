import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

type RenderHookResult<T> = {
  get current(): T;
  unmount: () => void;
};

type Permission = "prompt" | "granted" | "denied";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const effectCleanups: Array<() => void> = [];
let hookIndex = 0;
const hookStates: unknown[] = [];
let hookMemoStates: Array<{ deps: unknown[]; value: unknown }> = [];

const sameDeps = (a: unknown[] | undefined, b: unknown[] | undefined) =>
  !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

const cameraState = {
  permissions: { camera: "prompt" as Permission, photos: "prompt" as Permission },
  requested: 0,
  photoSource: "",
  cancelled: false,
};
const contactsState = {
  platform: "web",
  permissions: { contacts: "prompt" as Permission },
  checked: 0,
  requested: 0,
};
const geolocationState = {
  permissions: { location: "granted", coarseLocation: "granted" },
};
const pushState = {
  platform: "web",
  receive: "granted" as "granted" | "denied",
  registered: 0,
  autoInit: 0,
  actionListeners: [] as Array<(event: { notification?: { data?: Record<string, unknown> } }) => void>,
};
const assigned: string[] = [];
const deepLinks: string[] = [];

beforeAll(() => {
  mock.module("react", () => ({
    Fragment: ({ children }: { children: unknown }) => children,
    useCallback: <T,>(fn: T, deps?: unknown[]) => {
      const index = hookIndex++;
      const memo = hookMemoStates[index];
      if (memo && sameDeps(memo.deps, deps)) return memo.value as T;
      hookMemoStates[index] = { deps: deps ?? [], value: fn };
      return fn;
    },
    useMemo: <T,>(factory: () => T, deps?: unknown[]) => {
      const index = hookIndex++;
      const memo = hookMemoStates[index];
      if (memo && sameDeps(memo.deps, deps)) return memo.value as T;
      const value = factory();
      hookMemoStates[index] = { deps: deps ?? [], value };
      return value;
    },
    useRef: <T,>(initial: T) => {
      const index = hookIndex++;
      if (!hookStates[index]) hookStates[index] = { current: initial };
      return hookStates[index] as { current: T };
    },
    useState: <T,>(initial: T) => {
      const index = hookIndex++;
      if (hookStates[index] === undefined)
        hookStates[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      const setState = (next: T | ((prev: T) => T)) => {
        const state = hookStates[index] as T;
        const nextState = typeof next === "function" ? (next as (prev: T) => T)(state) : next;
        if (typeof state === "object" && state && typeof nextState === "object" && nextState) {
          Object.assign(state, nextState);
        } else {
          hookStates[index] = nextState;
        }
      };
      return [hookStates[index] as T, setState] as const;
    },
    useEffect: (fn: () => (() => undefined) | undefined) => {
      const cleanup = fn();
      if (cleanup) effectCleanups.push(cleanup);
    },
    forwardRef: (fn: unknown) => fn,
    lazy: (loader: unknown) => ({ loader }),
    memo: <T,>(component: T) => component,
    act: async (fn: () => void | Promise<void>) => await fn(),
  }));
  mock.module("akanjs/client", () => ({
    DEFAULT_BOTTOM_INSET: 34,
    DEFAULT_TOP_INSET: 44,
    csrContext: { Provider: ({ children }: { children: unknown }) => children },
    defaultPageState: {
      transition: "none",
      topSafeArea: 0,
      bottomSafeArea: 0,
      topInset: 0,
      bottomInset: 0,
      gesture: true,
      cache: false,
    },
    Device: {
      load: async () => ({
        lang: "en",
        info: { platform: contactsState.platform },
        topSafeArea: 11,
        bottomSafeArea: 22,
      }),
      getDevice: () => ({
        info: { platform: contactsState.platform },
      }),
    },
    initAuth: () => undefined,
    router: {
      state: {},
      set: () => undefined,
      emit: () => undefined,
      on: () => undefined,
      off: () => undefined,
      enterDeepLink: (href: string) => {
        deepLinks.push(href);
        return true;
      },
    },
    storage: {
      getItem: async () => null,
    },
    isMobileDevice: () => true,
  }));
});

const installCapacitorBridge = () => {
  Object.defineProperty(globalThis, "Capacitor", {
    value: {
      Plugins: {
        Camera: {
          checkPermissions: async () => cameraState.permissions,
          requestPermissions: async () => {
            cameraState.requested += 1;
            return cameraState.permissions;
          },
          getPhoto: async (options: { source: string }) => {
            cameraState.photoSource = options.source;
            if (cameraState.cancelled) throw "User cancelled photos app";
            return { dataUrl: "data:image/png;base64,test" };
          },
          pickImages: async () => ({ photos: [{ webPath: "image.png" }] }),
        },
        Contacts: {
          checkPermissions: async () => {
            contactsState.checked += 1;
            return contactsState.permissions;
          },
          requestPermissions: async () => {
            contactsState.requested += 1;
            return contactsState.permissions;
          },
          getContacts: async () => ({ contacts: [{ name: { display: "Ada" }, phones: [{ number: "123" }] }] }),
        },
        Geolocation: {
          requestPermissions: async () => geolocationState.permissions,
          getCurrentPosition: async () => ({ coords: { latitude: 37, longitude: 127 } }),
        },
        Device: {
          getInfo: async () => ({ platform: pushState.platform }),
        },
        PushNotifications: {
          requestPermissions: async () => ({ receive: pushState.receive }),
          checkPermissions: async () => ({ receive: pushState.receive }),
          register: async () => {
            pushState.registered += 1;
          },
          addListener: async (_eventName: string, listener: (event: { notification?: { data?: Record<string, unknown> } }) => void) => {
            pushState.actionListeners.push(listener);
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
  const createElement = (tagName = "div") =>
    ({
      nodeType: 1,
      nodeName: tagName.toUpperCase(),
      tagName: tagName.toUpperCase(),
      namespaceURI: "http://www.w3.org/1999/xhtml",
      ownerDocument: null,
      style: {},
      childNodes: [],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      appendChild: () => undefined,
      removeChild: () => undefined,
      insertBefore: () => undefined,
      setAttribute: () => undefined,
      removeAttribute: () => undefined,
    }) as unknown as HTMLDivElement;
  const document = {
    nodeType: 9,
    documentElement: createElement("html"),
    defaultView: null,
    createElement,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as Document;
  (document.documentElement as unknown as { ownerDocument: Document }).ownerDocument = document;
  const window = {
    location: { assign: (href: string) => assigned.push(href), origin: "https://example.test" },
    document,
    Capacitor: (globalThis as typeof globalThis & { Capacitor?: unknown }).Capacitor,
    HTMLIFrameElement: class HTMLIFrameElement {},
    Node: class Node {},
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as Window & typeof globalThis;
  (document as unknown as { defaultView: Window }).defaultView = window;
  installCapacitorBridge();
  (window as unknown as { Capacitor: unknown }).Capacitor = (
    globalThis as typeof globalThis & { Capacitor?: unknown }
  ).Capacitor;
  Object.defineProperty(globalThis, "window", { value: window, configurable: true });
  Object.defineProperty(globalThis, "document", { value: document, configurable: true });
  Object.defineProperty(globalThis, "location", { value: window.location, configurable: true });
};

const renderHook = <T,>(hook: () => T): RenderHookResult<T> => {
  hookIndex = 0;
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
  globalThis.__AKAN_CAPACITOR_IMPORTS__ = undefined;
  cameraState.permissions = { camera: "prompt", photos: "prompt" };
  cameraState.requested = 0;
  cameraState.photoSource = "";
  cameraState.cancelled = false;
  contactsState.platform = "web";
  contactsState.permissions = { contacts: "prompt" };
  contactsState.checked = 0;
  contactsState.requested = 0;
  geolocationState.permissions = { location: "granted", coarseLocation: "granted" };
  pushState.platform = "web";
  pushState.receive = "granted";
  pushState.registered = 0;
  pushState.autoInit = 0;
  pushState.actionListeners = [];
  assigned.length = 0;
  deepLinks.length = 0;
  globalThis.__AKAN_PUSH_CLICK_BRIDGE__ = undefined;
  globalThis.__AKAN_CLIENT_ENV__ = undefined;
  effectCleanups.splice(0);
  hookIndex = 0;
  hookStates.length = 0;
  hookMemoStates = [];
});

describe("native hooks", () => {
  test("useCamera requests permissions, uses web photo source, opens settings, and handles cancellation", async () => {
    installWindow();
    const { useCamera } = await import("./useCamera");
    const hook = renderHook(() => useCamera());

    expect(await hook.current.getPhoto("prompt")).toEqual({ dataUrl: "data:image/png;base64,test" });
    expect(cameraState.photoSource).toBe("PHOTOS");
    expect(cameraState.requested).toBe(1);

    cameraState.permissions = { camera: "denied", photos: "denied" };
    await hook.current.checkPermission("all");
    await hook.current.checkPermission("all");
    expect(assigned).toEqual(["app-settings:"]);

    cameraState.cancelled = true;
    expect(await hook.current.getPhoto("photos")).toBeUndefined();
    hook.unmount();
  });

  test("useContact skips web initial check, requests permission, opens settings, and returns contacts", async () => {
    installWindow();
    const { useContact } = await import("./useContact");
    const hook = renderHook(() => useContact());

    expect(contactsState.checked).toBe(0);
    expect(await hook.current.getContacts()).toEqual([{ name: { display: "Ada" }, phones: [{ number: "123" }] }]);
    expect(contactsState.requested).toBe(1);

    contactsState.permissions = { contacts: "denied" };
    await hook.current.checkPermission();
    await hook.current.checkPermission();
    expect(assigned).toEqual(["app-settings:"]);
    hook.unmount();
  });

  test("useGeoLocation returns permission and current position or opens settings", async () => {
    installWindow();
    const { useGeoLocation } = await import("./useGeoLocation");
    const hook = renderHook(() => useGeoLocation());

    expect(await hook.current.checkPermission()).toEqual({ geolocation: "granted", coarseLocation: "granted" });
    expect(await hook.current.getPosition()).toEqual({ coords: { latitude: 37, longitude: 127 } });
    geolocationState.permissions = { location: "denied", coarseLocation: "granted" };
    expect(await hook.current.getPosition()).toBeUndefined();
    expect(assigned).toEqual(["app-settings:"]);
    hook.unmount();
  });

  test("usePushNotification returns PushToken, no-ops on web, and bridges native push clicks", async () => {
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
