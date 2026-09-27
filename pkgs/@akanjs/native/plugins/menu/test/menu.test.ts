import { describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import manifest from "../native-plugin.json";
import desktop from "../src/desktop.ts";
import { fakeHost } from "./fake-host.ts";

describe("menu plugin", () => {
  test("desktop only", () => {
    const plugin = { spec: "menu", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "ios")).toEqual({});
    expect(pluginDecls([plugin], "macos")).toEqual({ menu: { methods: manifest.methods, events: ["click"] } });
  });

  test("maps methods to shell ops; popups go to the calling window", async () => {
    const host = fakeHost(desktop, (op) => (op === "menu.get" ? [{ role: "appMenu", label: "Test" }] : null));
    const items = [{ label: "File", submenu: [{ id: "open", label: "Open", accelerator: "CmdOrCtrl+O" }] }];
    await host.call("setAppMenu", { items });
    expect(await host.call("getAppMenu")).toMatchObject({
      ok: true,
      result: { items: [{ role: "appMenu", label: "Test" }] },
    });
    await host.call("popupContextMenu", { items: [{ id: "copy", label: "Copy" }], x: 10, y: 20 }, 3);
    await host.call("triggerItem", { id: "open" });
    await host.call("resetAppMenu");
    // Method calls carry the calling window (the dispatcher adds it; SH-6).
    expect(host.shell).toEqual([
      { op: "menu.setApp", args: { items, window: 1 } },
      { op: "menu.get", args: { window: 1 } },
      {
        op: "menu.popup",
        args: { items: [{ id: "copy", label: "Copy" }], x: 10, y: 20, closeAfterMs: undefined, window: 3 },
      },
      { op: "menu.trigger", args: { id: "open", window: 1 } },
      { op: "menu.reset", args: { window: 1 } },
    ]);
  });

  test("rejects bad arguments before the shell", async () => {
    const host = fakeHost(desktop);
    for (const [method, args] of [
      ["setAppMenu", { items: "File" }],
      ["popupContextMenu", { items: [], x: 1 }],
      ["popupContextMenu", { items: [], x: "1", y: 2 }],
      ["triggerItem", {}],
    ] as const) {
      expect(await host.call(method, args)).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
    }
    expect(host.shell).toEqual([]);
  });

  test("app menu clicks go to the focused window, context menu clicks to their window", async () => {
    const host = fakeHost(desktop);
    await host.call("$listen", { event: "click" }, 1);
    await host.call("$listen", { event: "click" }, 2);
    host.fire("menu", { source: "app", id: "open" });
    host.fire("menu", { source: "context", window: 1, id: "copy" });
    host.fire("menu", { source: "app", id: "wrap", checked: true });
    expect(host.emitted).toEqual([
      { event: "click", data: { id: "open", source: "app" }, windows: [2] },
      { event: "click", data: { id: "copy", source: "context" }, windows: [1] },
      { event: "click", data: { id: "wrap", source: "app", checked: true }, windows: [2] },
    ]);
  });
});
