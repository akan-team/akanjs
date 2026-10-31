import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";
import type { NativeBackProgress, NativeBackState } from "./nativeNavigation";

let host: MockHost | null = null;
const reported: boolean[] = [];
const routerState = { navigation: Promise.resolve() };

beforeAll(() => {
  mock.module("akanjs/client", () => ({
    debugFrame: () => undefined,
    normalizeDeepLinkHref: (url: string) => url,
    router: { isInitialized: true, backOrFallback: () => undefined, navigation: () => routerState.navigation },
  }));
});

afterEach(() => {
  host?.uninstall();
  host = null;
  reported.length = 0;
  routerState.navigation = Promise.resolve();
  Object.defineProperty(globalThis, "window", { value: undefined, configurable: true });
});

const installAndroid = () => {
  host = installMockHost({
    platform: "android",
    plugins: {
      app: {
        methods: {
          exit: () => undefined,
          setBackEnabled: ({ enabled }: { enabled: boolean }) => {
            reported.push(enabled);
          },
        },
        events: ["urlOpen", "backButton", "backProgress"],
      },
      "app-state": { methods: {}, events: ["change", "memoryWarning"] },
    },
  });
  Object.defineProperty(globalThis, "window", {
    value: { __AKAN_MOBILE_TARGET__: { name: "default", indexPath: "/explore" }, setTimeout },
    configurable: true,
  });
  return host;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("NativeNavigation on Android", () => {
  test("hands back to the system only where the page has nothing to go back to", async () => {
    installAndroid();
    const state: { idx: number; back: NativeBackState } = {
      idx: 0,
      back: { path: "/:lang/explore", keyboardHeight: 0, keyboardVisible: false, router: { back: () => undefined } },
    };
    const { NativeNavigation } = await import("./nativeNavigation");
    const navigation = new NativeNavigation({
      historyIdx: () => state.idx,
      backState: () => state.back,
      dismissKeyboard: () => undefined,
    });
    const stop = navigation.listen();
    await settle();
    expect(reported).toEqual([false]);

    state.idx = 1;
    navigation.syncBack();
    navigation.syncBack();
    state.idx = 0;
    state.back = { ...state.back, keyboardVisible: true };
    navigation.syncBack();
    state.back = { ...state.back, keyboardVisible: false, path: "/:lang/orders/1" };
    navigation.syncBack();
    await settle();
    expect(reported).toEqual([false, true]);
    stop();
  });

  test("forwards the swipe of a back and a memory warning to the frame", async () => {
    const shell = installAndroid();
    const swipes: NativeBackProgress[] = [];
    let warnings = 0;
    const { NativeNavigation } = await import("./nativeNavigation");
    const stop = new NativeNavigation({
      historyIdx: () => 1,
      backState: () => ({
        path: "/:lang/orders/1",
        keyboardHeight: 0,
        keyboardVisible: false,
        router: { back: () => undefined },
      }),
      dismissKeyboard: () => undefined,
      onBackProgress: (swipe) => swipes.push(swipe),
      onMemoryWarning: () => {
        warnings += 1;
      },
    }).listen();
    await settle();
    shell.emit("app", "backProgress", { phase: "started", progress: 0, swipeEdge: "left" });
    shell.emit("app", "backProgress", { phase: "progressed", progress: 0.4, swipeEdge: "left" });
    shell.emit("app-state", "memoryWarning", { level: "critical" });
    await settle();
    expect(swipes).toEqual([
      { phase: "started", progress: 0 },
      { phase: "progressed", progress: 0.4 },
    ]);
    expect(warnings).toBe(1);
    stop();
  });

  test("a swiped back the page refuses slides the page back, and an allowed one leaves it to the move", async () => {
    const shell = installAndroid();
    const swipes: NativeBackProgress[] = [];
    const { NativeNavigation } = await import("./nativeNavigation");
    const stop = new NativeNavigation({
      historyIdx: () => 1,
      backState: () => ({
        path: "/:lang/orders/1",
        keyboardHeight: 0,
        keyboardVisible: false,
        router: { back: () => undefined },
      }),
      dismissKeyboard: () => undefined,
      onBackProgress: (swipe) => swipes.push(swipe),
    }).listen();
    await settle();

    shell.emit("app", "backProgress", { phase: "progressed", progress: 0.6, swipeEdge: "left" });
    shell.emit("app", "backButton", {});
    await settle();
    expect(swipes).toEqual([{ phase: "progressed", progress: 0.6 }]);

    routerState.navigation = Promise.reject(new Error("NavigationRefused"));
    shell.emit("app", "backProgress", { phase: "progressed", progress: 0.6, swipeEdge: "left" });
    shell.emit("app", "backButton", {});
    await settle();
    expect(swipes.at(-1)).toEqual({ phase: "cancelled", progress: 0 });
    stop();
  });
});
