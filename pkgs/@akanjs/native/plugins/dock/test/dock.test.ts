import { afterEach, describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import { fakeHost } from "../../menu/test/fake-host.ts";
import manifest from "../native-plugin.json";
import desktop from "../src/desktop.ts";
import { dock } from "../src/index.ts";

let mock: MockHost | null = null;
afterEach(() => {
  mock?.uninstall();
  mock = null;
});

const STATE = { visible: true, policy: "regular", badge: null, progress: null, progressState: null };

describe("dock plugin", () => {
  test("desktop only", async () => {
    const plugin = { spec: "dock", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "ios")).toEqual({});
    expect(pluginDecls([plugin], "android")).toEqual({});
    expect(pluginDecls([plugin], "macos")).toEqual({ dock: { methods: manifest.methods, events: [] } });
    mock = installMockHost({ platform: "web", plugins: {} });
    expect(dock.isSupported("setBadge")).toBe(false);
    expect(await dock.setBadge({ label: "1" }).catch((e) => e.code)).toBe("UNSUPPORTED");
  });

  test("maps to dock ops with checked arguments", async () => {
    const host = fakeHost(desktop, () => STATE);
    expect(await host.call("getState")).toMatchObject({ ok: true, result: STATE });
    await host.call("setBadge", { label: "3" });
    await host.call("setBadge", { label: null });
    await host.call("setBadge", {});
    await host.call("setProgress", { progress: 0.5 });
    await host.call("setProgress", { progress: 1, state: "error" });
    await host.call("setProgress", { progress: null });
    await host.call("setVisible", { visible: false });
    expect(host.shell.map((c): [string, Record<string, unknown>] => [c.op, { ...c.args, window: undefined }])).toEqual([
      ["dock.getState", { window: undefined }],
      ["dock.setBadge", { label: "3", window: undefined }],
      ["dock.setBadge", { label: null, window: undefined }],
      ["dock.setBadge", { label: null, window: undefined }],
      ["dock.setProgress", { progress: 0.5, state: "normal", window: undefined }],
      ["dock.setProgress", { progress: 1, state: "error", window: undefined }],
      ["dock.setProgress", { progress: null, state: "normal", window: undefined }],
      ["dock.setVisible", { visible: false, window: undefined }],
    ]);
  });

  test("bad arguments never reach the shell", async () => {
    const host = fakeHost(desktop, () => STATE);
    const bad: [string, unknown][] = [
      ["setBadge", { label: 3 }],
      ["setProgress", { progress: 1.5 }],
      ["setProgress", { progress: -0.1 }],
      ["setProgress", { progress: "0.5" }],
      ["setProgress", { progress: 0.5, state: "indeterminate" }],
      ["setVisible", {}],
      ["setVisible", { visible: "yes" }],
    ];
    for (const [method, args] of bad) {
      expect(await host.call(method, args)).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
    }
    expect(host.shell).toEqual([]);
  });
});
