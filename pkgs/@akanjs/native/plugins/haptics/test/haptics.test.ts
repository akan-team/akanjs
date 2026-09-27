import { afterEach, describe, expect, test } from "bun:test";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import { haptics } from "../src/index.ts";

let host: MockHost | null = null;
const nav = navigator as { vibrate?: unknown };

afterEach(() => {
  host?.uninstall();
  host = null;
  delete nav.vibrate;
});

function stubVibrate(result = true): (number | number[])[] {
  const calls: (number | number[])[] = [];
  Object.defineProperty(nav, "vibrate", {
    value: (p: number | number[]) => (calls.push(p), result),
    configurable: true,
  });
  return calls;
}

describe("web", () => {
  test("without navigator.vibrate every method rejects UNSUPPORTED", async () => {
    expect(haptics.implementation("impact")).toBe("web");
    for (const call of [
      () => haptics.impact(),
      () => haptics.notification(),
      () => haptics.selection(),
      () => haptics.vibrate(),
    ]) {
      expect(isAkanNativeError(await call().catch((e) => e), "UNSUPPORTED")).toBe(true);
    }
  });

  test("maps feedback to vibration lengths and patterns", async () => {
    const calls = stubVibrate();
    await haptics.impact();
    await haptics.impact({ style: "heavy" });
    await haptics.notification({ type: "error" });
    await haptics.selection();
    await haptics.vibrate({ duration: 250.4 });
    await haptics.vibrate();
    expect(calls).toEqual([20, 30, [60, 100, 40, 80, 50], 10, 250, 300]);
  });

  test("resolves when the browser drops the vibration (no user gesture)", async () => {
    stubVibrate(false);
    await expect(haptics.selection()).resolves.toBeUndefined();
  });

  test("rejects bad arguments", async () => {
    stubVibrate();
    const bad = [
      haptics.impact({ style: "huge" as never }),
      haptics.notification({ type: 1 as never }),
      haptics.vibrate({ duration: 0 }),
      haptics.vibrate({ duration: 20000 }),
      haptics.vibrate({ duration: "5" as never }),
    ];
    for (const p of bad) expect(isAkanNativeError(await p.catch((e) => e), "INVALID_ARGS")).toBe(true);
  });
});

describe("native hosts", () => {
  test("routes every method to the host with its arguments", async () => {
    const seen: unknown[] = [];
    const record = (args: unknown) => void seen.push(args ?? null);
    host = installMockHost({
      platform: "ios",
      plugins: { haptics: { methods: { impact: record, notification: record, selection: record, vibrate: record } } },
    });
    await haptics.impact({ style: "rigid" });
    await haptics.notification({ type: "warning" });
    await haptics.selection();
    await haptics.vibrate({ duration: 50 });
    expect(host.requests.map((r) => r.method)).toEqual(["impact", "notification", "selection", "vibrate"]);
    expect(seen).toEqual([{ style: "rigid" }, { type: "warning" }, null, { duration: 50 }]);
  });

  test("macOS has no implementation (desktop: null)", async () => {
    host = installMockHost({ platform: "macos", plugins: {} });
    expect(haptics.isSupported("impact")).toBe(false);
    expect(isAkanNativeError(await haptics.impact().catch((e) => e), "UNSUPPORTED")).toBe(true);
  });
});
