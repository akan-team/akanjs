import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AkanNativeConfig } from "../src/api.ts";
import { type BuildProfile, prepare } from "../src/lib/prepare.ts";
import { projectFromConfig } from "../src/lib/project.ts";
import { writeDesktopResources } from "../src/platforms/desktop.ts";

const root = mkdtempSync(join(tmpdir(), "akan-native-desktop-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const HOOKS = {
  AKAN_NATIVE_WEBVIEW2_DEBUG_PORT: "9222",
  AKAN_NATIVE_TEST_PANELS: "auto",
  AKAN_NATIVE_TEST_NO_THROTTLING: "1",
};

async function resources(name: string, profile: BuildProfile): Promise<{ boot: { dev: boolean }; shell: object }> {
  const dir = join(root, name);
  mkdirSync(join(dir, "web"), { recursive: true });
  writeFileSync(join(dir, "web", "index.html"), "<!doctype html><html><head></head><body>hi</body></html>");
  const config: AkanNativeConfig = {
    app: { id: "com.akanjs.desktoptest", name: "Desktop Test", version: "1.0.0" },
    web: { dir: "web" },
    shell: { devtools: true },
  };
  const outDir = join(dir, "out");
  mkdirSync(outDir, { recursive: true });
  const options = { mode: "production", profile, skipWebBuild: true, outDir, api: true, envFiles: false };
  const ctx = await prepare(projectFromConfig(config, dir), "windows", options);
  const folder = join(dir, "resources");
  writeDesktopResources(ctx, folder, "windows");
  const read = (file: string) => JSON.parse(readFileSync(join(folder, file), "utf8"));
  return { boot: read("boot.json"), shell: read("shell.json") };
}

describe("desktop resources", () => {
  test("devtools in a release build is the inspector alone: the build's environment never makes it a dev build", async () => {
    const saved = Object.keys(HOOKS).map((key) => [key, process.env[key]] as const);
    Object.assign(process.env, HOOKS);
    try {
      const release = await resources("release", "release");
      // main.ts hands boot.json's dev to akan_native_init, the only switch for the shell's test hooks and debug port.
      expect(release.boot.dev).toBe(false);
      expect(release.shell).toMatchObject({ devtools: true });
      expect(JSON.stringify(release)).not.toContain("AKAN_NATIVE_");
      expect(Object.keys(release.shell)).not.toContain("devServer");
      expect((await resources("debug", "debug")).boot.dev).toBe(true);
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
