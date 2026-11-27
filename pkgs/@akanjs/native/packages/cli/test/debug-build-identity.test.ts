import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AkanNativeConfig, validateConfig } from "../src/api.ts";
import { type BuildContext, iosAppId, nativeAppName } from "../src/lib/prepare.ts";

const dir = mkdtempSync(join(tmpdir(), "akan-native-ios-debug-id-"));
mkdirSync(join(dir, "web"), { recursive: true });
writeFileSync(join(dir, "web", "index.html"), "<!doctype html><html><head></head><body></body></html>");
const base: AkanNativeConfig = {
  app: { id: "com.akanjs.release", name: "Release", version: "1.2.3", build: 42 },
  web: { dir: "web" },
};

describe("debug build id and name", () => {
  test("debugAppIdSuffix applies to debug builds only, so a dev build installs next to the App Store app", () => {
    const ctx = (dev: boolean, ios?: AkanNativeConfig["ios"]) =>
      ({ dev, project: { config: { app: base.app, ios } } }) as unknown as BuildContext;
    expect(iosAppId(ctx(true, { debugAppIdSuffix: ".debug" }))).toBe("com.akanjs.release.debug");
    expect(iosAppId(ctx(false, { debugAppIdSuffix: ".debug" }))).toBe("com.akanjs.release");
    expect(iosAppId(ctx(true))).toBe("com.akanjs.release");
  });

  test("debugAppNameSuffix names a debug build apart on the home screen and launcher, release builds keep app.name", () => {
    const ctx = (dev: boolean) =>
      ({
        dev,
        project: {
          config: { app: base.app, ios: { debugAppNameSuffix: " Dev" }, android: { debugAppNameSuffix: " Dev" } },
        },
      }) as unknown as BuildContext;
    expect(nativeAppName(ctx(true), "ios")).toBe("Release Dev");
    expect(nativeAppName(ctx(true), "android")).toBe("Release Dev");
    expect(nativeAppName(ctx(false), "ios")).toBe("Release");
    expect(nativeAppName({ dev: true, project: { config: { app: base.app } } } as unknown as BuildContext, "ios")).toBe(
      "Release",
    );
  });

  test("the config checks both suffixes", () => {
    const suffixes = { debugAppIdSuffix: ".debug", debugAppNameSuffix: " Dev" };
    expect(validateConfig({ ...base, ios: suffixes, android: suffixes }, { appDir: dir })).toEqual([]);
    expect(validateConfig({ ...base, ios: { debugAppIdSuffix: "debug" } }, { appDir: dir })).toEqual([
      expect.stringContaining("ios.debugAppIdSuffix"),
    ]);
    expect(validateConfig({ ...base, android: { debugAppNameSuffix: " Dev/" } }, { appDir: dir })).toEqual([
      expect.stringContaining("android.debugAppNameSuffix"),
    ]);
    expect(validateConfig({ ...base, ios: { debugAppNameSuffix: " Dev " } }, { appDir: dir })).toEqual([
      expect.stringContaining("ios.debugAppNameSuffix"),
    ]);
  });
});
