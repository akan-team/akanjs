import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";
import type { NativeBackState } from "./nativeNavigation";

const routerState = {
  isInitialized: true,
  entered: [] as { href: string; resetStack: boolean }[],
  fallbacks: [] as string[],
};
const events = { exits: 0, backs: 0, dismissed: 0 };
let host: MockHost | null = null;

beforeAll(() => {
  mock.module("akanjs/client", () => ({
    debugFrame: () => undefined,
    normalizeDeepLinkHref: (url: string) => url.replace(/^[a-z]+:\/\//, "/"),
    router: {
      get isInitialized() {
        return routerState.isInitialized;
      },
      enterDeepLink: (href: string, { resetStack }: { resetStack: boolean }) => {
        routerState.entered.push({ href, resetStack });
        return true;
      },
      backOrFallback: (path: string) => {
        routerState.fallbacks.push(path);
      },
    },
  }));
});

const installShell = (platform: "ios" | "android" = "android") => {
  host = installMockHost({
    platform,
    plugins: {
      app: {
        methods: {
          exit: () => {
            events.exits += 1;
          },
        },
        events: ["urlOpen", "backButton"],
      },
    },
  });
  Object.defineProperty(globalThis, "window", {
    value: { __AKAN_MOBILE_TARGET__: { name: "default", basePath: "admin", indexPath: "/explore" }, setTimeout },
    configurable: true,
  });
  return host;
};

const navigationOf = async (state: Partial<NativeBackState> & { historyIdx?: number } = {}) => {
  const { NativeNavigation } = await import("./nativeNavigation");
  const backState: NativeBackState = {
    path: "/:lang/admin/explore",
    keyboardHeight: 0,
    keyboardVisible: false,
    router: {
      back: () => {
        events.backs += 1;
      },
    },
    ...state,
  };
  return new NativeNavigation({
    historyIdx: () => state.historyIdx ?? 0,
    backState: () => backState,
    dismissKeyboard: () => {
      events.dismissed += 1;
    },
  });
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  host?.uninstall();
  host = null;
  routerState.isInitialized = true;
  routerState.entered.length = 0;
  routerState.fallbacks.length = 0;
  Object.assign(events, { exits: 0, backs: 0, dismissed: 0 });
  Object.defineProperty(globalThis, "window", { value: undefined, configurable: true });
});

describe("NativeNavigation", () => {
  test("the launch link starts a fresh stack and a later one pushes, each once", async () => {
    const shell = installShell();
    const stop = (await navigationOf()).listen();
    await settle();

    shell.emit("app", "urlOpen", { url: "minimal://en/orders/1" });
    shell.emit("app", "urlOpen", { url: "minimal://en/orders/1" });
    await settle();
    expect(routerState.entered).toEqual([{ href: "/en/orders/1", resetStack: true }]);

    shell.emit("app", "urlOpen", { url: "minimal://en/orders/2" });
    await settle();
    expect(routerState.entered.at(-1)).toEqual({ href: "/en/orders/2", resetStack: false });

    stop();
    await settle();
    expect(shell.subscriptions("app", "urlOpen")).toBe(0);
  });

  test("a link that arrives before the router is up waits for it", async () => {
    installShell();
    routerState.isInitialized = false;
    const navigation = await navigationOf();

    navigation.openDeepLink("minimal://en/orders/1");
    expect(routerState.entered).toEqual([]);
    routerState.isInitialized = true;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(routerState.entered).toEqual([{ href: "/en/orders/1", resetStack: true }]);
  });

  test("back puts the keyboard away, walks the history, falls back to the index, then leaves the app", async () => {
    installShell();
    (await navigationOf({ keyboardVisible: true, historyIdx: 2 })).back();
    (await navigationOf({ historyIdx: 2 })).back();
    (await navigationOf({ path: "/:lang/admin/orders/1" })).back();
    (await navigationOf()).back();
    await settle();

    expect(events).toEqual({ dismissed: 1, backs: 1, exits: 1 });
    expect(routerState.fallbacks).toEqual(["/explore"]);
  });

  test("back on a stack a deep link started leaves the app", async () => {
    installShell();
    const navigation = await navigationOf({ path: "/:lang/admin/orders/1" });
    navigation.openDeepLink("minimal://en/orders/1");
    navigation.back();
    await settle();

    expect(events.exits).toBe(1);
    expect(routerState.fallbacks).toEqual([]);
  });

  test("a page outside a native shell listens to nothing", async () => {
    const stop = (await navigationOf()).listen();
    stop();
    expect(routerState.entered).toEqual([]);
  });
});
