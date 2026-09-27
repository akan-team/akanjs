import { afterEach, describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import manifest from "../native-plugin.json";
import { checkLock, ORIENTATION_LOCKS, type OrientationState, screenOrientation } from "../src/index.ts";

const g = globalThis as { screen?: unknown; matchMedia?: unknown };
let host: MockHost | null = null;

afterEach(() => {
  host?.uninstall();
  host = null;
  delete g.screen;
  delete g.matchMedia;
});

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );
const tick = () => new Promise((r) => setTimeout(r, 1));

describe("screen-orientation arguments and manifest", () => {
  test("lock accepts the W3C lock types this plugin supports", () => {
    expect(ORIENTATION_LOCKS).toEqual([
      "any",
      "portrait",
      "landscape",
      "portrait-primary",
      "portrait-secondary",
      "landscape-primary",
      "landscape-secondary",
    ]);
    expect(checkLock("landscape")).toBe("landscape");
    for (const bad of ["natural", "portrait-left", "", 90, undefined]) {
      try {
        checkLock(bad);
        throw new Error(`accepted ${bad}`);
      } catch (e) {
        expect(isAkanNativeError(e, "INVALID_ARGS")).toBe(true);
      }
    }
  });

  test("mobile hosts implement everything, desktop nothing", () => {
    const plugin = { spec: "screen-orientation", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    const all = { methods: ["get", "lock", "unlock"], events: ["change"] };
    expect(pluginDecls([plugin], "ios")).toEqual({ "screen-orientation": all });
    expect(pluginDecls([plugin], "android")).toEqual({ "screen-orientation": all });
    expect(pluginDecls([plugin], "macos")).toEqual({});
  });

  test("desktop: UNSUPPORTED", async () => {
    host = installMockHost({ platform: "macos", plugins: {} });
    expect(screenOrientation.isSupported("get")).toBe(false);
    expect(isAkanNativeError(await rejection(screenOrientation.lock({ orientation: "portrait" })), "UNSUPPORTED")).toBe(
      true,
    );
  });
});

describe("screen-orientation routing", () => {
  test("native hosts get { orientation } and push change events", async () => {
    let locked = null as string | null;
    host = installMockHost({
      platform: "android",
      plugins: {
        "screen-orientation": {
          methods: {
            get: () => ({ type: "portrait-primary" }),
            lock: ({ orientation }: { orientation: string }) => {
              locked = orientation;
            },
            unlock: () => {
              locked = null;
            },
          },
          events: ["change"],
        },
      },
    });
    expect(await screenOrientation.get()).toEqual({ type: "portrait-primary" });
    await screenOrientation.lock({ orientation: "landscape" });
    expect(locked).toBe("landscape");
    const seen: OrientationState[] = [];
    const stop = screenOrientation.listen("change", (s) => seen.push(s));
    await tick();
    host.emit("screen-orientation", "change", { type: "landscape-secondary" });
    await screenOrientation.unlock();
    expect(locked).toBeNull();
    expect(seen).toEqual([{ type: "landscape-secondary" }]);
    stop();
  });
});

describe("screen-orientation web implementation", () => {
  function fakeScreen(options: { lock?: (o: string) => Promise<void>; type?: string } = {}) {
    const orientation = Object.assign(new EventTarget(), {
      type: options.type ?? "portrait-primary",
      angle: 0,
      unlocked: 0,
      ...(options.lock ? { lock: options.lock } : {}),
      unlock() {
        orientation.unlocked++;
      },
    });
    g.screen = { orientation };
    return orientation;
  }
  const domError = (name: string) => Object.assign(new Error(`${name} message`), { name });

  test("get and change from screen.orientation", async () => {
    host = installMockHost({ platform: "web" });
    const o = fakeScreen({ type: "landscape-primary" });
    expect(await screenOrientation.get()).toEqual({ type: "landscape-primary" });
    const seen: OrientationState[] = [];
    const stop = screenOrientation.listen("change", (s) => seen.push(s));
    o.type = "landscape-secondary";
    o.dispatchEvent(new Event("change"));
    o.dispatchEvent(new Event("change")); // same type: nothing new
    stop();
    expect(seen).toEqual([{ type: "landscape-secondary" }]);
  });

  test("without screen.orientation the media query decides", async () => {
    host = installMockHost({ platform: "web" });
    g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    expect(await screenOrientation.get()).toEqual({ type: "landscape-primary" });
    expect(isAkanNativeError(await rejection(screenOrientation.lock({ orientation: "portrait" })), "UNSUPPORTED")).toBe(
      true,
    );
    await screenOrientation.unlock();
  });

  test("lock: synchronous call, DOMException names mapped", async () => {
    host = installMockHost({ platform: "web" });
    const asked: string[] = [];
    let failure: Error | null = null;
    const o = fakeScreen({
      lock: (x) => {
        asked.push(x);
        return failure ? Promise.reject(failure) : Promise.resolve();
      },
    });
    const pending = screenOrientation.lock({ orientation: "landscape" });
    expect(asked).toEqual(["landscape"]); // inside the click that entered fullscreen
    await pending;
    for (const [name, code] of [
      ["NotSupportedError", "UNSUPPORTED"],
      ["SecurityError", "PERMISSION_DENIED"],
      ["NotAllowedError", "PERMISSION_DENIED"],
      ["AbortError", "CANCELLED"],
    ] as const) {
      failure = domError(name);
      expect(isAkanNativeError(await rejection(screenOrientation.lock({ orientation: "portrait" })), code)).toBe(true);
    }
    expect(
      isAkanNativeError(await rejection(screenOrientation.lock({ orientation: "natural" as never })), "INVALID_ARGS"),
    ).toBe(true);
    await screenOrientation.unlock();
    expect(o.unlocked).toBe(1);
  });

  test("browsers without lock(): UNSUPPORTED", async () => {
    host = installMockHost({ platform: "web" });
    fakeScreen();
    expect(isAkanNativeError(await rejection(screenOrientation.lock({ orientation: "portrait" })), "UNSUPPORTED")).toBe(
      true,
    );
  });
});
