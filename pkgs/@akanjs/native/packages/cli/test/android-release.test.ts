import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AkanNativeConfig, validateConfig } from "../src/api.ts";
import type { BuildContext } from "../src/lib/prepare.ts";
import { androidAppId } from "../src/platforms/android.ts";

// akanjs readiness O1-5 and O1-1: the Android options a release needs.

const dir = mkdtempSync(join(tmpdir(), "akan-native-android-release-"));
mkdirSync(join(dir, "web"), { recursive: true });
writeFileSync(join(dir, "web", "index.html"), "<!doctype html><html><head></head><body></body></html>");
const base: AkanNativeConfig = {
  app: { id: "com.akanjs.release", name: "Release", version: "1.2.3", build: 42 },
  web: { dir: "web" },
};

describe("Android release options", () => {
  test("debugAppIdSuffix applies to debug builds only", () => {
    const ctx = (dev: boolean) =>
      ({
        dev,
        project: { config: { app: base.app, android: { debugAppIdSuffix: ".debug" } } },
      }) as unknown as BuildContext;
    expect(androidAppId(ctx(true))).toBe("com.akanjs.release.debug");
    expect(androidAppId(ctx(false))).toBe("com.akanjs.release");
    expect(androidAppId({ dev: true, project: { config: { app: base.app } } } as unknown as BuildContext)).toBe(
      "com.akanjs.release",
    );
  });

  test("the config checks the suffix, the WebView floor and the versionCode range", () => {
    expect(
      validateConfig({ ...base, android: { debugAppIdSuffix: ".debug", minWebViewVersion: 107 } }, { appDir: dir }),
    ).toEqual([]);
    expect(validateConfig({ ...base, android: { debugAppIdSuffix: "debug" } }, { appDir: dir })).toEqual([
      expect.stringContaining("android.debugAppIdSuffix"),
    ]);
    expect(validateConfig({ ...base, android: { minWebViewVersion: 80 } }, { appDir: dir })).toEqual([
      expect.stringContaining("at least 94"),
    ]);
    expect(validateConfig({ ...base, app: { ...base.app, build: 3_000_000_000 } }, { appDir: dir })).toEqual([
      expect.stringContaining("versionCode"),
    ]);
  });
});
