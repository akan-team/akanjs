import { describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { fakeHost } from "../../menu/test/fake-host.ts";
import manifest from "../native-plugin.json";
import desktop from "../src/desktop.ts";

describe("tray plugin", () => {
  test("desktop only", () => {
    const plugin = { spec: "tray", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "android")).toEqual({});
    expect(pluginDecls([plugin], "macos")).toEqual({
      tray: { methods: manifest.methods, events: ["click", "menuClick"] },
    });
  });

  test("create names trays; setters send only their fields", async () => {
    const host = fakeHost(desktop, (_op, args) => ({ id: args?.id }));
    expect(await host.call("create", { icon: "/tray.png", iconAsTemplate: true, tooltip: "Hi" })).toMatchObject({
      ok: true,
      result: { id: "tray-1" },
    });
    await host.call("create", { id: "main", title: "M", menu: [{ id: "quit", role: "quit" }] });
    await host.call("setTitle", { id: "main", title: "N" });
    await host.call("setIcon", { id: "main", icon: null });
    await host.call("setMenu", { id: "main", menu: null });
    await host.call("trigger", { id: "main", button: "right" });
    await host.call("remove", { id: "main" });
    expect(host.shell.map((c): [string, Record<string, unknown>] => [c.op, { ...c.args, window: undefined }])).toEqual([
      ["tray.create", { icon: "/tray.png", iconAsTemplate: true, tooltip: "Hi", id: "tray-1", window: undefined }],
      ["tray.create", { title: "M", menu: [{ id: "quit", role: "quit" }], id: "main", window: undefined }],
      ["tray.update", { title: "N", id: "main", window: undefined }],
      ["tray.update", { icon: null, id: "main", window: undefined }],
      ["tray.update", { menu: null, id: "main", window: undefined }],
      ["tray.trigger", { id: "main", button: "right", window: undefined }],
      ["tray.remove", { id: "main", window: undefined }],
    ]);
  });

  test("bad arguments", async () => {
    const host = fakeHost(desktop);
    for (const args of [{ id: "" }, { id: 3 }, { icon: 7 }, { menu: "x" }, { title: 1 }, { menuOnLeftClick: "yes" }]) {
      expect(await host.call(args.id === undefined ? "create" : "update", args)).toMatchObject({
        ok: false,
        error: { code: "INVALID_ARGS" },
      });
    }
    expect(await host.call("trigger", { id: "a", button: "middle" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGS" },
    });
    expect(host.shell).toEqual([]);
  });

  test("clicks and menu choices go to the focused window", async () => {
    const host = fakeHost(desktop);
    await host.call("$listen", { event: "click" }, 1);
    await host.call("$listen", { event: "menuClick" }, 1);
    host.fire("tray", { event: "click", tray: "main", button: "right" });
    host.fire("tray", { event: "menuClick", tray: "main", item: "quit" });
    expect(host.emitted).toEqual([
      { event: "click", data: { id: "main", button: "right" }, windows: [1] },
      { event: "menuClick", data: { id: "main", item: "quit" }, windows: [1] },
    ]);
  });
});
