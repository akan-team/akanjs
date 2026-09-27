import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AkanNativeConfig, validateConfig } from "../src/api.ts";
import { iosEntitlements, iosInfoPlist } from "../src/lib/native-plugins.ts";
import type { BuildContext } from "../src/lib/prepare.ts";
import { type IosManifest, resourceTargetProblem } from "../src/lib/project.ts";
import { androidManifest } from "../src/platforms/android.ts";

// akanjs readiness O5: the app's own Info.plist, entitlements, manifest XML, links and resources.

const plugin = (id: string, native: Partial<IosManifest>) => ({
  plugin: { spec: id, dir: "/tmp", manifest: { id, apiVersion: 1 as const, methods: [], events: [] } },
  native: { sources: [], class: "X", ...native },
  sources: [],
});

describe("iOS native config", () => {
  test("entitlements: akan-native's id, plugins, associated-domains from deepLinks.domains, the app last, Xcode variables filled", () => {
    const push = plugin("push", { entitlements: { "aps-environment": "development" } });
    const e = iosEntitlements(
      "com.akanjs.x",
      [push as never],
      [{ host: "a.example.com" }],
      { "keychain-access-groups": ["$(AppIdentifierPrefix)com.akanjs.x"], "aps-environment": "production" },
      "ABCDE12345",
    );
    expect(e).toEqual({
      "application-identifier": "ABCDE12345.com.akanjs.x",
      "aps-environment": "production",
      "com.apple.developer.associated-domains": ["applinks:a.example.com"],
      "keychain-access-groups": ["ABCDE12345.com.akanjs.x"],
    });
    expect(iosEntitlements("com.akanjs.x", [], [], { "keychain-access-groups": ["$(AppIdentifierPrefix)g"] })).toEqual({
      "application-identifier": "com.akanjs.x",
      "keychain-access-groups": ["g"],
    });
    expect(() => iosEntitlements("com.akanjs.x", [], [], { "application-identifier": "other" })).toThrow(
      /may not change/,
    );
  });

  test("Info.plist: two plugins' background modes stay, the app adds to them, owned keys are refused", () => {
    const a = plugin("a", { infoPlist: { UIBackgroundModes: ["remote-notification"] } });
    const b = plugin("b", { infoPlist: { UIBackgroundModes: ["audio"] } });
    const plist = iosInfoPlist(
      [a, b] as never,
      {},
      {},
      {
        base: { CFBundleIdentifier: "com.akanjs.x" },
        app: { UIBackgroundModes: ["fetch"] },
        owned: ["CFBundleIdentifier"],
      },
    );
    expect(plist.UIBackgroundModes).toEqual(["remote-notification", "audio", "fetch"]);
    expect(() =>
      iosInfoPlist(
        [],
        {},
        {},
        {
          base: { CFBundleIdentifier: "com.akanjs.x" },
          app: { CFBundleIdentifier: "evil" },
          owned: ["CFBundleIdentifier"],
        },
      ),
    ).toThrow(/CFBundleIdentifier/);
  });
});

describe("Android native config", () => {
  test("app links per domain (verified, with path prefixes) and the app's XML in manifest, application and activity", () => {
    const ctx = {
      dev: true,
      project: {
        config: {
          app: { id: "com.akanjs.x", name: "X", version: "1.0.0", build: 1 },
          android: { debugAppIdSuffix: ".debug" },
          deepLinks: {
            schemes: ["x"],
            domains: [
              { host: "a.example.com", pathPrefixes: [] },
              { host: "b.example.com", pathPrefixes: ["/en"] },
            ],
          },
        },
      },
    } as unknown as BuildContext;
    const xml = androidManifest(
      ctx,
      [],
      ['<meta-data android:name="k" android:value="${applicationId}" />'],
      ["<queries />"],
      false,
      ['<intent-filter><action android:name="x.Y" /></intent-filter>'],
    );
    expect(xml).toContain('package="com.akanjs.x.debug"');
    expect(xml.match(/android:autoVerify="true"/g)).toHaveLength(2);
    expect(xml).toContain('<data android:host="b.example.com" />\n                <data android:pathPrefix="/en" />');
    expect(xml).toContain('android:value="com.akanjs.x.debug"');
    expect(xml).toContain("    <queries />");
    expect(xml).toContain('<action android:name="x.Y" />');
  });
});

describe("validation", () => {
  const dir = mkdtempSync(join(tmpdir(), "akan-native-native-"));
  mkdirSync(join(dir, "web"), { recursive: true });
  writeFileSync(join(dir, "web", "index.html"), "<!doctype html>");
  writeFileSync(join(dir, "chime.mp3"), "x");
  const base: AkanNativeConfig = { app: { id: "com.akanjs.x", name: "X", version: "1.0.0" }, web: { dir: "web" } };

  test("resource targets", () => {
    expect(resourceTargetProblem("ios/sounds/chime.caf")).toBeNull();
    expect(resourceTargetProblem("android/res/raw/chime.mp3")).toBeNull();
    expect(resourceTargetProblem("android/assets/data/x.json")).toBeNull();
    expect(resourceTargetProblem("ios/Info.plist")).toContain("akan-native writes");
    expect(resourceTargetProblem("android/assets/app/index.html")).toContain("akan-native's");
    expect(resourceTargetProblem("android/res/raw/Chime.mp3")).toContain("lowercase");
    expect(resourceTargetProblem("ios/../x")).toContain(". or ..");
    expect(resourceTargetProblem("web/x")).toContain("must start with");
  });

  test("the config checks domains, native XML and resources", () => {
    expect(
      validateConfig(
        {
          ...base,
          deepLinks: { domains: ["a.example.com", { host: "b.example.com", pathPrefixes: ["/en"] }] },
          native: { resources: [{ from: "chime.mp3", to: "android/res/raw/chime.mp3" }] },
        },
        { appDir: dir },
      ),
    ).toEqual([]);
    const problems = validateConfig(
      {
        ...base,
        deepLinks: { domains: ["https://a.example.com", { host: "b.example.com", pathPrefixes: ["en"] }] },
        native: { android: { application: ["meta-data"] }, resources: [{ from: "missing.mp3", to: "ios/x" }] },
      },
      { appDir: dir },
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("not a host name"),
        expect.stringContaining('starting with "/"'),
        expect.stringContaining("XML fragments"),
        expect.stringContaining("not found"),
      ]),
    );
  });
});
