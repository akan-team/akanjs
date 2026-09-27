import { afterEach, describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import manifest from "../native-plugin.json";
import { badge, checkCount, MAX_BADGE_COUNT } from "../src/index.ts";

const nav = navigator as { setAppBadge?: unknown; clearAppBadge?: unknown };
let host: MockHost | null = null;

afterEach(() => {
  host?.uninstall();
  host = null;
  delete nav.setAppBadge;
  delete nav.clearAppBadge;
});

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

function stubBadging(refuse = false): (string | number)[] {
  const calls: (string | number)[] = [];
  const answer = () =>
    refuse
      ? Promise.reject(Object.assign(new Error("The user agent does not allow badges"), { name: "NotAllowedError" }))
      : Promise.resolve();
  Object.defineProperty(nav, "setAppBadge", { configurable: true, value: (n: number) => (calls.push(n), answer()) });
  Object.defineProperty(nav, "clearAppBadge", { configurable: true, value: () => (calls.push("clear"), answer()) });
  return calls;
}

describe("badge arguments", () => {
  test("count: an integer from 0 to 2^31-1", () => {
    expect(checkCount(0)).toBe(0);
    expect(checkCount(MAX_BADGE_COUNT)).toBe(MAX_BADGE_COUNT);
    for (const bad of [-1, 1.5, MAX_BADGE_COUNT + 1, Number.NaN, Infinity, "3", null, undefined]) {
      try {
        checkCount(bad);
        throw new Error(`accepted ${String(bad)}`);
      } catch (e) {
        expect(isAkanNativeError(e, "INVALID_ARGS")).toBe(true);
      }
    }
  });

  test("manifest: native on iOS and macOS (the Dock), nothing on Android", () => {
    const plugin = { spec: "badge", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    const all = { badge: { methods: ["set", "clear", "checkPermission", "requestPermission"], events: [] } };
    expect(pluginDecls([plugin], "ios")).toEqual(all);
    expect(pluginDecls([plugin], "android")).toEqual({});
    expect(pluginDecls([plugin], "macos")).toEqual(all);
  });
});

describe("badge routing", () => {
  test("iOS gets every method", async () => {
    let count = 0;
    host = installMockHost({
      platform: "ios",
      plugins: {
        badge: {
          methods: {
            set: (args: { count: number }) => {
              count = args.count;
            },
            clear: () => {
              count = 0;
            },
            checkPermission: () => ({ badge: "prompt" }),
            requestPermission: () => ({ badge: "granted" }),
          },
        },
      },
    });
    expect(await badge.checkPermission()).toEqual({ badge: "prompt" });
    expect(await badge.requestPermission()).toEqual({ badge: "granted" });
    await badge.set({ count: 7 });
    expect(count).toBe(7);
    await badge.clear();
    expect(count).toBe(0);
    expect(host.requests.map((r) => [r.method, r.args ?? null])).toEqual([
      ["checkPermission", null],
      ["requestPermission", null],
      ["set", { count: 7 }],
      ["clear", null],
    ]);
  });

  test("Android and macOS: UNSUPPORTED", async () => {
    for (const platform of ["android", "macos"] as const) {
      host = installMockHost({ platform, plugins: {} });
      expect(badge.isSupported("set")).toBe(false);
      expect(isAkanNativeError(await rejection(badge.set({ count: 1 })), "UNSUPPORTED")).toBe(true);
      expect(isAkanNativeError(await rejection(badge.checkPermission()), "UNSUPPORTED")).toBe(true);
      host.uninstall();
      host = null;
    }
  });
});

describe("badge web implementation", () => {
  test("without the Badging API every method is UNSUPPORTED", async () => {
    expect(badge.implementation("set")).toBe("web");
    for (const call of [
      () => badge.set({ count: 1 }),
      () => badge.clear(),
      () => badge.checkPermission(),
      () => badge.requestPermission(),
    ]) {
      expect(isAkanNativeError(await rejection(call()), "UNSUPPORTED")).toBe(true);
    }
  });

  test("setAppBadge / clearAppBadge; 0 clears; the API has no permission of its own", async () => {
    const calls = stubBadging();
    await badge.set({ count: 3 });
    await badge.set({ count: 0 });
    await badge.clear();
    expect(calls).toEqual([3, "clear", "clear"]);
    expect(await badge.checkPermission()).toEqual({ badge: "granted" });
    expect(await badge.requestPermission()).toEqual({ badge: "granted" });
    expect(isAkanNativeError(await rejection(badge.set({ count: -2 })), "INVALID_ARGS")).toBe(true);
    expect(calls).toHaveLength(3);
  });

  test("a browser refusing the badge is PERMISSION_DENIED", async () => {
    stubBadging(true);
    expect(isAkanNativeError(await rejection(badge.set({ count: 1 })), "PERMISSION_DENIED")).toBe(true);
  });
});
