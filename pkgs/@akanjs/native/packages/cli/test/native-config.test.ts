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

describe("desktop.server", () => {
  const dir = mkdtempSync(join(tmpdir(), "akan-native-server-config-"));
  mkdirSync(join(dir, "web"), { recursive: true });
  writeFileSync(join(dir, "web", "index.html"), "<!doctype html>");
  mkdirSync(join(dir, "server", "node_modules", "addon", "build"), { recursive: true });
  writeFileSync(join(dir, "server", "main.js"), "");
  mkdirSync(join(dir, "server", "bin"), { recursive: true });
  writeFileSync(join(dir, "server", "node_modules", "addon", "build", "addon.node"), "");
  writeFileSync(join(dir, "server", "node_modules", "addon", "index.js"), "");
  const base: AkanNativeConfig = { app: { id: "com.akanjs.x", name: "X", version: "1.0.0" }, web: { dir: "web" } };

  test("a folder with its entry and string env values is a server the app can carry", () => {
    expect(
      validateConfig(
        { ...base, desktop: { server: { dir: "server", entry: "main.js", env: { AKAN_PUBLIC_ENV: "main" } } } },
        { appDir: dir },
      ),
    ).toEqual([]);
  });

  test("names a missing folder or entry, an entry outside the folder, and the variables the launcher owns", () => {
    const problems = (server: unknown) =>
      validateConfig({ ...base, desktop: { server } } as AkanNativeConfig, { appDir: dir });
    expect(problems({ dir: "nowhere", entry: "main.js" })).toEqual([expect.stringContaining("is not a folder")]);
    expect(problems({ dir: "server", entry: "missing.js" })).toEqual([expect.stringContaining("not found")]);
    expect(problems({ dir: "server", entry: "../web/index.html" })).toEqual([
      expect.stringContaining("must be a file inside desktop.server.dir"),
    ]);
    expect(problems({ dir: "server", entry: "main.js", env: { PORT: "8282", JWT_SECRET: "x", A: 1 } })).toEqual([
      "desktop.server.env.PORT: the launcher sets it at every start",
      "desktop.server.env.JWT_SECRET: the launcher sets it at every start",
      "desktop.server.env.A must be a string",
    ]);
    expect(
      problems({ dir: "server", entry: "main.js", env: { Port: "1", jwt_secret: "x", Path: "C:\\x", A: "1", a: "2" } }),
    ).toEqual([
      "desktop.server.env.Port: the launcher sets it at every start",
      "desktop.server.env.jwt_secret: the launcher sets it at every start",
      "desktop.server.env.Path: write it as PATH",
      "desktop.server.env.a: Windows reads it as the same variable as another one here",
    ]);
    expect(problems({ dir: "server", entry: "main.js", env: { PATH: "/opt/x" } })).toEqual([]);
    expect(problems({ dir: "server", entry: "main.js", cwd: "/" })).toEqual([
      expect.stringContaining("unknown key desktop.server.cwd"),
    ]);
  });

  test("desktop.bin is a folder, with or without a server", () => {
    const problems = (bin: unknown) =>
      validateConfig({ ...base, desktop: { bin } } as AkanNativeConfig, { appDir: dir });
    expect(problems("server/bin")).toEqual([]);
    expect(problems("server/main.js")).toEqual([expect.stringContaining("desktop.bin must be a folder")]);
    expect(problems("missing")).toEqual([expect.stringContaining("desktop.bin must be a folder")]);
    expect(
      validateConfig({ ...base, desktop: { server: { dir: "server", entry: "main.js", bin: "bin" } } } as never, {
        appDir: dir,
      }),
    ).toEqual([expect.stringContaining("unknown key desktop.server.bin")]);
  });

  test("macOS signs every Mach-O file the server and bin carry, whatever its name, and nothing else", async () => {
    const { carriedNativeCode } = await import("../src/platforms/macos.ts");
    const resources = join(dir, "Resources");
    mkdirSync(resources, { recursive: true });
    expect(carriedNativeCode(resources)).toEqual([]);
    const server = join(resources, "server");
    const file = (rel: string, head: number[]) => {
      mkdirSync(join(server, rel, ".."), { recursive: true });
      writeFileSync(join(server, rel), Buffer.concat([Buffer.from(head), Buffer.alloc(64)]));
    };
    file("node_modules/addon/build/addon.node", [0xcf, 0xfa, 0xed, 0xfe]);
    file("../bin/ffmpeg", [0xcf, 0xfa, 0xed, 0xfe]);
    file("../bin/run.sh", [0x23, 0x21, 0x2f, 0x62]);
    file("node_modules/tool/universal", [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 2]);
    file("node_modules/addon/prebuilds/linux-x64/addon.node", [0x7f, 0x45, 0x4c, 0x46]);
    file("node_modules/tool/Main.class", [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 52]);
    file("main.js", [0xcf, 0xfa, 0xed, 0xfe]);
    expect(carriedNativeCode(resources).sort()).toEqual(
      [
        join(resources, "bin", "ffmpeg"),
        join(server, "node_modules", "addon", "build", "addon.node"),
        join(server, "node_modules", "tool", "universal"),
      ].sort(),
    );
  });
});
