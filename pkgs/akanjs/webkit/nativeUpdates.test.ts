import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { AkanNativeError } from "@akanjs/native/core";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";

const calls = { notifyReady: 0, check: 0, download: 0 };
let found: { available: boolean; bundle: string | null } | "nothing published" = { available: true, bundle: "b1" };
let host: MockHost | null = null;

beforeAll(() => {
  mock.module("akanjs/client", () => ({ debugFrame: () => undefined }));
  Object.defineProperty(globalThis, "window", { value: { setTimeout, clearTimeout }, configurable: true });
});

afterEach(() => {
  host?.uninstall();
  host = null;
  delete (globalThis as { __AKAN_NATIVE_DEV__?: unknown }).__AKAN_NATIVE_DEV__;
});

const installShell = (platform: "ios" | "android" | "web" | "macos" | "windows" = "android") => {
  host = installMockHost({
    platform,
    plugins: {
      updates: {
        methods: {
          notifyReady: () => {
            calls.notifyReady += 1;
          },
          check: () => {
            calls.check += 1;
            if (found === "nothing published") throw new AkanNativeError("NOT_FOUND", "no manifest");
            return { ...found, version: "1.0.0", sequence: 1, downloadSize: 10 };
          },
          download: () => {
            calls.download += 1;
            return { bundle: "b1" };
          },
        },
        events: ["progress"],
      },
      "app-state": { methods: { getState: () => ({ state: "active" }) }, events: ["change"] },
    },
  });
  return host;
};

describe("NativeUpdates", () => {
  test("confirms the running release once in any native shell, and never on the web or on a dev gateway's page", async () => {
    const { NativeUpdates } = await import("./nativeUpdates");
    installShell("web");
    NativeUpdates.confirm();
    host?.uninstall();
    installShell("windows");
    (globalThis as { __AKAN_NATIVE_DEV__?: unknown }).__AKAN_NATIVE_DEV__ = { gateway: "http://localhost:5000" };
    NativeUpdates.confirm();
    await Bun.sleep(5);
    expect(calls.notifyReady).toBe(0);
    delete (globalThis as { __AKAN_NATIVE_DEV__?: unknown }).__AKAN_NATIVE_DEV__;
    NativeUpdates.confirm();
    NativeUpdates.confirm();
    await Bun.sleep(5);
    expect(calls.notifyReady).toBe(1);
  });

  test("a return to the front checks and downloads what it finds, then waits ten minutes before looking again", async () => {
    const { NativeUpdates } = await import("./nativeUpdates");
    const shell = installShell("android");
    const stop = new NativeUpdates().listen();
    await Bun.sleep(5);
    shell.emit("app-state", "change", { state: "active" });
    await Bun.sleep(5);
    expect({ check: calls.check, download: calls.download }).toEqual({ check: 1, download: 1 });
    shell.emit("app-state", "change", { state: "active" });
    await Bun.sleep(5);
    expect(calls.check).toBe(1);
    stop();
  });

  test("a channel nothing was published to is checked quietly, and nothing is downloaded", async () => {
    const { NativeUpdates } = await import("./nativeUpdates");
    installShell("ios");
    found = "nothing published";
    const before = { ...calls };
    await new NativeUpdates().check();
    expect(calls.check - before.check).toBe(1);
    expect(calls.download - before.download).toBe(0);
  });

  test("a desktop app looks for nothing by itself: its release is the whole app, applied when the app says", async () => {
    const { NativeUpdates } = await import("./nativeUpdates");
    const shell = installShell("macos");
    const before = { ...calls };
    const stop = new NativeUpdates().listen();
    shell.emit("app-state", "change", { state: "active" });
    await Bun.sleep(5);
    expect(calls.check - before.check).toBe(0);
    stop();
  });
});
