import "../test/registerDom";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";

let host: MockHost | null = null;
let backs = 0;

beforeAll(() => {
  mock.module("akanjs/client", () => ({
    debugFrame: () => undefined,
    normalizeDeepLinkHref: (url: string) => url,
    router: { isInitialized: true },
  }));
});

afterEach(() => {
  host?.uninstall();
  host = null;
  backs = 0;
  document.body.innerHTML = "";
});

const listenOn = async (platform: "macos" | "windows") => {
  host = installMockHost({ platform, plugins: { app: { methods: {}, events: ["urlOpen", "backButton"] } } });
  const { NativeNavigation } = await import("./nativeNavigation");
  return new NativeNavigation({
    historyIdx: () => 1,
    backState: () => ({
      path: "/:lang/orders/1",
      keyboardHeight: 0,
      keyboardVisible: false,
      router: {
        back: () => {
          backs += 1;
        },
      },
    }),
    dismissKeyboard: () => undefined,
  }).listen();
};

const press = (target: EventTarget, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));

describe("NativeNavigation on a desktop shell", () => {
  test("on macOS ⌘[, ⌘← and the mouse back button go back, while a field keeps its own keys", async () => {
    const stop = await listenOn("macos");
    press(document.body, { key: "[", metaKey: true });
    press(document.body, { key: "ArrowLeft", metaKey: true });
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 3 }));
    expect(backs).toBe(3);

    const field = document.createElement("input");
    document.body.appendChild(field);
    press(field, { key: "ArrowLeft", metaKey: true });
    press(document.body, { key: "[", metaKey: true, shiftKey: true });
    expect(backs).toBe(3);
    stop();
    press(document.body, { key: "[", metaKey: true });
    expect(backs).toBe(3);
  });

  test("elsewhere the engine keeps its own back keys", async () => {
    const stop = await listenOn("windows");
    press(document.body, { key: "ArrowLeft", altKey: true });
    document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 3 }));
    expect(backs).toBe(0);
    stop();
  });
});
