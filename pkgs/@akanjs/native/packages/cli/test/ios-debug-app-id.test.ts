import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AkanNativeConfig, validateConfig } from "../src/api.ts";
import type { BuildContext } from "../src/lib/prepare.ts";
import { iosAppId } from "../src/platforms/ios.ts";

const dir = mkdtempSync(join(tmpdir(), "akan-native-ios-debug-id-"));
mkdirSync(join(dir, "web"), { recursive: true });
writeFileSync(join(dir, "web", "index.html"), "<!doctype html><html><head></head><body></body></html>");
const base: AkanNativeConfig = {
  app: { id: "com.akanjs.release", name: "Release", version: "1.2.3", build: 42 },
  web: { dir: "web" },
};

describe("iOS debug bundle id", () => {
  test("debugAppIdSuffix applies to debug builds only, so a dev build installs next to the App Store app", () => {
    const ctx = (dev: boolean, ios?: AkanNativeConfig["ios"]) =>
      ({ dev, project: { config: { app: base.app, ios } } }) as unknown as BuildContext;
    expect(iosAppId(ctx(true, { debugAppIdSuffix: ".debug" }))).toBe("com.akanjs.release.debug");
    expect(iosAppId(ctx(false, { debugAppIdSuffix: ".debug" }))).toBe("com.akanjs.release");
    expect(iosAppId(ctx(true))).toBe("com.akanjs.release");
  });

  test("the config checks the suffix", () => {
    expect(validateConfig({ ...base, ios: { debugAppIdSuffix: ".debug" } }, { appDir: dir })).toEqual([]);
    expect(validateConfig({ ...base, ios: { debugAppIdSuffix: "debug" } }, { appDir: dir })).toEqual([
      expect.stringContaining("ios.debugAppIdSuffix"),
    ]);
  });
});
