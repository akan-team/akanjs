import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const plugins = path.resolve(import.meta.dir, "../../@akanjs/native/plugins");
const shims = path.join(import.meta.dir, "native");

describe("akanjs/client/native/<plugin>", () => {
  test("every builtin plugin with a page API has its path, and nothing else does", () => {
    const withApi = readdirSync(plugins)
      .filter((id) => existsSync(path.join(plugins, id, "src", "index.ts")))
      .sort();
    const shimmed = readdirSync(shims)
      .map((file) => file.replace(/\.ts$/, ""))
      .sort();
    expect(shimmed).toEqual(withApi);
  });

  test("resolves through the package's exports to the plugin's page API", async () => {
    const window = await import("akanjs/client/native/window");
    const shortcut = await import("akanjs/client/native/global-shortcut");
    expect(typeof window.appWindow.setFullscreen).toBe("function");
    expect(typeof shortcut.globalShortcut.register).toBe("function");
  });
});
