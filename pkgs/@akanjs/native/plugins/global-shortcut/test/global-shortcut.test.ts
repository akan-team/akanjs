import { describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { fakeHost } from "../../menu/test/fake-host.ts";
import manifest from "../native-plugin.json";
import desktop from "../src/desktop.ts";

describe("global-shortcut plugin", () => {
  test("desktop only", () => {
    const plugin = { spec: "global-shortcut", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "ios")).toEqual({});
    expect(pluginDecls([plugin], "macos")).toEqual({
      "global-shortcut": { methods: manifest.methods, events: ["pressed"] },
    });
  });

  test("maps to hotkey ops; pressed goes to the focused window", async () => {
    const host = fakeHost(desktop, (op) =>
      op === "hotkey.register" ? { accelerator: "CmdOrCtrl+Shift+K" } : { registered: true },
    );
    expect(await host.call("register", { accelerator: "commandorcontrol+shift+k" })).toMatchObject({
      ok: true,
      result: { accelerator: "CmdOrCtrl+Shift+K" },
    });
    await host.call("isRegistered", { accelerator: "CmdOrCtrl+Shift+K" });
    await host.call("unregister", { accelerator: "CmdOrCtrl+Shift+K" });
    await host.call("unregisterAll");
    expect(host.shell.map((c) => c.op)).toEqual([
      "hotkey.register",
      "hotkey.isRegistered",
      "hotkey.unregister",
      "hotkey.unregisterAll",
    ]);
    expect(await host.call("register", { accelerator: "" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGS" },
    });
    await host.call("$listen", { event: "pressed" }, 1);
    await host.call("$listen", { event: "pressed" }, 2);
    host.fire("hotkey", { accelerator: "commandorcontrol+shift+k" });
    expect(host.emitted).toEqual([
      { event: "pressed", data: { accelerator: "commandorcontrol+shift+k" }, windows: [2] },
    ]);
  });
});
