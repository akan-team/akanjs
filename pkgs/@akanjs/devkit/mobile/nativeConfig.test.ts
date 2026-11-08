import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCsp, cspHash, parseCsp } from "../../native/packages/cli/src/lib/csp";
import { rewriteDevHtml } from "../../native/packages/cli/src/lib/hmr";
import type { AkanNativeTarget } from "../akanConfig";
import { tempDirs } from "../testHelpers";
import { NativeApi } from "./nativeApi";
import { NativeConfig } from "./nativeConfig";

const makeTempRoot = tempDirs("akan-native-config-");
const repoApp = path.resolve(import.meta.dir, "../../../../apps/minimal");

const minimalTarget: AkanNativeTarget = {
  name: "default",
  indexPath: "/explore",
  appName: "minimal",
  appId: "com.minimal.dev.app",
  version: "0.0.1",
  buildNum: 1,
  permissions: ["push"],
  deepLinks: { schemes: ["minimal"], domains: ["example.com"] },
  ios: { teamId: "TEAMID" },
  android: { googleServices: "secrets/google-services.json", sha256CertFingerprints: ["00:11"] },
};

const adminTarget: AkanNativeTarget = {
  name: "admin",
  basePath: "admin",
  appName: "Portal Admin",
  appId: "com.portal.admin",
  fileName: "portal-admin",
  version: "2.1.0",
  buildNum: 42,
  icon: "assets/icon.png",
  splash: "assets/splash.png",
  permissions: ["camera", "location", "contacts", "speech"],
  deepLinks: { domains: ["portal.example"] },
  plugins: ["iap"],
  ios: { infoPlist: { ITSAppUsesNonExemptEncryption: false } },
  android: {
    manifest: ['<queries><package android:name="com.kakao.talk" /></queries>'],
    files: { "res/raw/chime.mp3": "assets/chime.mp3" },
  },
};

const cloudEnv = { AKAN_PUBLIC_APP_NAME: "minimal", AKAN_PUBLIC_ENV: "main", AKAN_PUBLIC_SERVE_DOMAIN: "example.com" };
const policy = (extra: Record<string, string[]> = {}) =>
  Object.fromEntries(
    Object.entries(NativeConfig.defaultCsp).map(([directive, sources]) => [
      directive,
      [...sources, ...(extra[directive] ?? [])],
    ]),
  );
const permissionOf = (id: string) =>
  id === "opener"
    ? { identifier: "opener:default", allow: NativeConfig.defaultOpenUrls.map((url) => ({ url })) }
    : `${id}:default`;

const ed25519Key = () =>
  generateKeyPairSync("ed25519").publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64");
const updatesKey = ed25519Key();

describe("NativeConfig.build", () => {
  test("hands the dmg window over with its pictures resolved against the app folder", () => {
    const build = (dmg: NonNullable<AkanNativeTarget["desktop"]>["dmg"]) =>
      NativeConfig.build({
        appPath: "/repo/apps/minimal",
        target: { ...minimalTarget, desktop: { dmg } },
        webDir: "/repo/dist/native/minimal/default/web",
        contributions: [],
        locales: ["en"],
        platform: "macos",
      }).config.desktop?.dmg;

    expect(build({ background: "assets/dmg.png", background2x: "assets/dmg@2x.png", app: { x: 150, y: 190 } })).toEqual(
      {
        background: path.resolve("/repo/apps/minimal", "assets/dmg.png"),
        background2x: path.resolve("/repo/apps/minimal", "assets/dmg@2x.png"),
        app: { x: 150, y: 190 },
      },
    );
    expect(build({ background: false, iconSize: 96 })).toEqual({ background: false, iconSize: 96 });
    expect(build(undefined)).toBeUndefined();
  });

  test("paints the window before its page with backgroundColor, and names the Windows publisher", () => {
    const build = (target: Partial<AkanNativeTarget>) =>
      NativeConfig.build({
        appPath: "/repo/apps/minimal",
        target: { ...minimalTarget, ...target },
        webDir: "/repo/dist/native/minimal/default/web",
        contributions: [],
        locales: ["en"],
        platform: "windows",
      }).config;

    expect(build({ backgroundColor: "#000000" }).shell).toEqual({ backgroundColor: "#000000" });
    expect(build({ backgroundColor: { light: "#fafafa", dark: "#111111" } }).shell).toEqual({
      backgroundColor: "#fafafa",
      backgroundColorDark: "#111111",
    });
    expect(build({}).shell).toBeUndefined();
    expect(build({ backgroundColor: "#000000", devtools: true }).shell).toEqual({
      backgroundColor: "#000000",
      devtools: true,
    });
    expect(build({ desktop: { publisher: "Leading Flight" } }).desktop?.publisher).toBe("Leading Flight");
  });

  test("turns the minimal app's push target into the runtime's config, single-instance carrying its link scheme", () => {
    const { config, warnings } = NativeConfig.build({
      appPath: "/repo/apps/minimal",
      target: minimalTarget,
      webDir: "/repo/dist/native/minimal/default/web",
      contributions: [{ permission: "push", plugins: ["push"] }],
      locales: ["en", "ko"],
      platform: "android",
      publicEnv: cloudEnv,
    });

    expect(warnings).toEqual([]);
    expect(config).toEqual({
      app: { id: "com.minimal.dev.app", name: "minimal", fileName: "minimal", version: "0.0.1", build: 1 },
      web: { dir: "/repo/dist/native/minimal/default/web" },
      plugins: [...NativeConfig.basePlugins, "single-instance", "push"],
      capabilities: [
        {
          identifier: "app",
          description: "The plugins minimal ships, each with its default permissions",
          permissions: [...NativeConfig.basePlugins, "single-instance", "push"].map(permissionOf),
        },
      ],
      security: { csp: policy() },
      deepLinks: { schemes: ["minimal"], domains: ["example.com"] },
      android: {
        debugAppIdSuffix: ".debug",
        googleServices: path.resolve("/repo/apps/minimal", "secrets/google-services.json"),
      },
      keyboard: { resize: "none" },
    });
  });

  test("falls back to the builtin permission plugins, names the app in their texts, and lists basePath links per locale", () => {
    const { config, warnings } = NativeConfig.build({
      appPath: "/repo/apps/portal",
      target: adminTarget,
      webDir: "/repo/dist/native/portal/admin/web",
      contributions: [],
      locales: ["en", "ko"],
      platform: "android",
    });

    expect(warnings).toEqual(["Permission 'speech' has no native plugin yet; the app ships without it."]);
    expect(config).toEqual({
      app: { id: "com.portal.admin", name: "Portal Admin", fileName: "portal-admin", version: "2.1.0", build: 42 },
      web: { dir: "/repo/dist/native/portal/admin/web" },
      plugins: [...NativeConfig.basePlugins, "camera", "geolocation", "contacts", "iap"],
      capabilities: [
        {
          identifier: "app",
          description: "The plugins Portal Admin ships, each with its default permissions",
          permissions: [...NativeConfig.basePlugins, "camera", "geolocation", "contacts", "iap"].map(permissionOf),
        },
      ],
      security: { csp: policy() },
      usageDescriptions: {
        NSCameraUsageDescription: "Portal Admin requires access to the camera to take photos.",
        NSPhotoLibraryAddUsageDescription: "Portal Admin requires access to the photo library to take photos.",
        NSPhotoLibraryUsageDescription: "Portal Admin requires access to the photo library to take photos.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "Portal Admin requires access to the location to get the user's location.",
        NSLocationAlwaysUsageDescription: "Portal Admin requires access to the location to get the user's location.",
        NSLocationWhenInUseUsageDescription: "Portal Admin requires access to the location to get the user's location.",
        NSContactsUsageDescription: "Portal Admin requires access to the contacts to find people you know.",
      },
      deepLinks: { domains: [{ host: "portal.example", pathPrefixes: ["/en/admin", "/ko/admin"] }] },
      native: {
        ios: { infoPlist: { ITSAppUsesNonExemptEncryption: false } },
        android: { manifest: ['<queries><package android:name="com.kakao.talk" /></queries>'] },
        resources: [{ from: path.resolve("/repo/apps/portal", "assets/chime.mp3"), to: "android/res/raw/chime.mp3" }],
      },
      android: { debugAppIdSuffix: ".debug" },
      keyboard: { resize: "none" },
      icon: path.resolve("/repo/apps/portal", "assets/icon.png"),
      splash: { image: path.resolve("/repo/apps/portal", "assets/splash.png") },
    });
  });

  test("a plugin that claims a permission replaces the builtin one and adds its Android entries", () => {
    const { config } = NativeConfig.build({
      appPath: "/repo/apps/portal",
      target: {
        ...adminTarget,
        permissions: ["camera"],
        plugins: undefined,
        ios: undefined,
        android: undefined,
        icon: undefined,
        splash: undefined,
      },
      webDir: "/web",
      contributions: [
        {
          permission: "camera",
          plugins: ["camera"],
          usageDescriptions: { cameraUsageDescription: "Scan receipts with $(PRODUCT_NAME)." },
          androidPermissions: ["CAMERA"],
          androidFeatures: ["android.hardware.camera"],
        },
        { permission: "push", plugins: ["push"] },
      ],
      locales: ["en"],
      platform: "android",
    });

    expect(config.plugins).toEqual([...NativeConfig.basePlugins, "camera"]);
    expect(config.usageDescriptions).toEqual({ NSCameraUsageDescription: "Scan receipts with Portal Admin." });
    expect(config.native).toEqual({
      android: {
        manifest: [
          '<uses-permission android:name="android.permission.CAMERA" />',
          '<uses-feature android:name="android.hardware.camera" android:required="false" />',
        ],
      },
    });
  });

  test("updates bring their plugin and follow the binary's backend unless a channel is named", () => {
    const build = (updates: AkanNativeTarget["updates"], env?: "main" | "develop") =>
      NativeConfig.build({
        appPath: "/repo/apps/portal",
        target: { ...adminTarget, updates },
        webDir: "/web",
        contributions: [],
        locales: ["en"],
        platform: "android",
        env,
      }).config;
    const url = "https://updates.example.com/portal";
    expect(build({ url, publicKey: updatesKey }, "develop").updates).toEqual({
      url,
      publicKey: updatesKey,
      channel: "develop",
      target: "admin",
    });
    expect(build({ url, publicKey: updatesKey, channel: "beta", readyTimeout: 15_000 }, "main").updates).toEqual({
      url,
      publicKey: updatesKey,
      channel: "beta",
      readyTimeout: 15_000,
      target: "admin",
    });
    expect(build({ url, publicKey: updatesKey }).updates).toEqual({ url, publicKey: updatesKey, target: "admin" });
    const spare = ed25519Key();
    expect(build({ url, publicKeys: [updatesKey, spare] }, "main").updates).toEqual({
      url,
      publicKeys: [updatesKey, spare],
      channel: "main",
      target: "admin",
    });
    const report = { url: "https://cloud.example.com/api/ota/report/abcdefghijklmnop" };
    expect(build({ url, publicKey: updatesKey, report }, "main").updates).toEqual({
      url,
      publicKey: updatesKey,
      channel: "main",
      report,
      target: "admin",
    });
    expect(build({ url, publicKey: updatesKey }, "main").plugins).toContain("updates");
    expect(build(undefined, "main").plugins).not.toContain("updates");
  });

  test("devtools opens the web inspector of a release build only when a target asks for it", () => {
    const build = (devtools?: boolean) =>
      NativeConfig.build({
        appPath: "/repo/apps/portal",
        target: { ...adminTarget, ...(devtools === undefined ? {} : { devtools }) },
        webDir: "/web",
        contributions: [],
        locales: ["en"],
        platform: "android",
      }).config.shell;
    expect(build(true)).toEqual({ devtools: true });
    expect(build(false)).toBeUndefined();
    expect(build()).toBeUndefined();
  });

  test("push, privacy and the icon and splash objects reach the runtime, paths from the app folder", () => {
    const { config } = NativeConfig.build({
      appPath: "/repo/apps/portal",
      target: {
        ...adminTarget,
        icon: { image: "assets/icon.png", backgroundColor: "#ffffff" },
        splash: { backgroundColor: { light: "#ffffff", dark: "#000000" }, autoHide: false },
        android: { push: { smallIcon: "assets/noti.png", color: "#ff5a5f", channel: { id: "chat", name: "Chat" } } },
        ios: { privacy: { tracking: false, accessedApis: { DiskSpace: ["E174.1"] } } },
      },
      webDir: "/web",
      contributions: [],
      locales: ["en"],
      platform: "android",
    });
    const abs = (relative: string) => path.resolve("/repo/apps/portal", relative);
    expect(config.icon).toEqual({ image: abs("assets/icon.png"), backgroundColor: "#ffffff" });
    expect(config.splash).toEqual({ backgroundColor: { light: "#ffffff", dark: "#000000" }, autoHide: false });
    expect(config.push).toEqual({
      android: { smallIcon: abs("assets/noti.png"), color: "#ff5a5f", channel: { id: "chat", name: "Chat" } },
    });
    expect(config.privacy).toEqual({ tracking: false, accessedApis: { DiskSpace: ["E174.1"] } });
  });

  test("an app id per platform gives each build its own", () => {
    const idOn = (platform: "ios" | "android") =>
      NativeConfig.build({
        appPath: "/repo/apps/portal",
        target: { ...adminTarget, appId: { ios: "com.puffinplanet.admin", android: "com.portal.admin" } },
        webDir: "/web",
        contributions: [],
        locales: ["en"],
        platform,
      }).config.app.id;
    expect([idOn("ios"), idOn("android")]).toEqual(["com.puffinplanet.admin", "com.portal.admin"]);
  });

  test("the runtime accepts both configs as they are", async () => {
    const root = await makeTempRoot();
    for (const file of ["secrets/google-services.json", "assets/chime.mp3"])
      await mkdir(path.dirname(path.join(root, file)), { recursive: true }).then(() =>
        writeFile(path.join(root, file), file.endsWith(".json") ? googleServicesJson : "x"),
      );
    for (const image of ["assets/icon.png", "assets/splash.png"])
      await writeFile(path.join(root, image), Buffer.from(onePixelPng, "base64"));
    await mkdir(path.join(root, "web"), { recursive: true });
    await writeFile(path.join(root, "web/index.html"), "<html><head></head><body></body></html>");
    const api = await NativeApi.load(repoApp);

    const adminWithEverything: AkanNativeTarget = {
      ...adminTarget,
      updates: { url: "https://updates.example.com/portal", publicKey: updatesKey },
      ios: { ...adminTarget.ios, privacy: { tracking: false } },
      android: { ...adminTarget.android, push: { smallIcon: "assets/icon.png", color: "#ff5a5f" } },
    };
    for (const target of [minimalTarget, adminWithEverything]) {
      const { config } = NativeConfig.build({
        appPath: root,
        env: "main",
        target,
        webDir: path.join(root, "web"),
        contributions: [],
        locales: ["en", "ko"],
        platform: "android",
      });
      expect(api.validateConfig(config, { appDir: root })).toEqual([]);
    }
  });

  test("ships the app's own native plugins by folder and names each by its id in the capability", async () => {
    const root = await makeTempRoot();
    const kiosk = await writeManifest(path.join(root, "native", "kiosk"), "kiosk");
    await writeManifest(path.join(root, "vendor", "led-panel"), "led-panel");
    const { config } = NativeConfig.build({
      appPath: root,
      target: {
        ...minimalTarget,
        permissions: [],
        plugins: ["./vendor/led-panel"],
        deepLinks: undefined,
        android: undefined,
      },
      webDir: path.join(root, "web"),
      contributions: [],
      locales: ["en"],
      platform: "macos",
      nativePlugins: [{ id: "kiosk", dir: kiosk, owner: "apps/board" }],
    });

    expect(config.plugins).toEqual([...NativeConfig.basePlugins, "./vendor/led-panel", kiosk]);
    expect(config.capabilities?.[0]?.permissions).toEqual(
      [...NativeConfig.basePlugins, "led-panel", "kiosk"].map(permissionOf),
    );
    await mkdir(path.join(root, "web"), { recursive: true });
    await writeFile(path.join(root, "web/index.html"), "<html><head></head><body></body></html>");
    const api = await NativeApi.load(repoApp);
    expect(api.validateConfig(config, { appDir: root })).toEqual([]);
  });

  test("ships a native/ folder once when the target also lists it by path or by id", async () => {
    const root = await makeTempRoot();
    const kiosk = await writeManifest(path.join(root, "native", "kiosk"), "kiosk");
    const { config } = NativeConfig.build({
      appPath: root,
      target: {
        ...minimalTarget,
        permissions: [],
        plugins: ["./native/kiosk/", "kiosk", "haptics"],
        deepLinks: undefined,
        android: undefined,
      },
      webDir: path.join(root, "web"),
      contributions: [],
      locales: ["en"],
      platform: "macos",
      nativePlugins: [{ id: "kiosk", dir: kiosk, owner: "apps/board" }],
    });

    expect(config.plugins).toEqual([...NativeConfig.basePlugins, kiosk]);
  });

  test("hands an unattended app's settings on: page recovery, a kiosk window, screen capture and Android autoplay", async () => {
    const root = await makeTempRoot();
    const { config } = NativeConfig.build({
      appPath: root,
      target: {
        ...minimalTarget,
        permissions: [],
        deepLinks: undefined,
        android: { autoplay: true },
        desktop: {
          recovery: "reload",
          window: { fullscreen: true, skipTaskbar: true },
          screenCapture: "auto",
          webview2: "standalone",
        },
      },
      webDir: path.join(root, "web"),
      contributions: [],
      locales: ["en"],
      platform: "macos",
      desktopBin: root,
    });

    expect(config.desktop).toEqual({
      recovery: "reload",
      window: { fullscreen: true, skipTaskbar: true },
      screenCapture: "auto",
      webview2: "standalone",
      bin: root,
    });
    expect(config.android).toEqual({ debugAppIdSuffix: ".debug", autoplay: true });
    await mkdir(path.join(root, "web"), { recursive: true });
    await writeFile(path.join(root, "web/index.html"), "<html><head></head><body></body></html>");
    expect((await NativeApi.load(repoApp)).validateConfig(config, { appDir: root })).toEqual([]);
  });

  test("a desktop app's own entitlements reach the macOS build, and the runtime accepts them", async () => {
    const root = await makeTempRoot();
    const entitlements = { "com.apple.security.cs.disable-library-validation": true };
    const { config } = NativeConfig.build({
      appPath: root,
      target: {
        ...minimalTarget,
        permissions: [],
        deepLinks: undefined,
        android: undefined,
        desktop: { entitlements },
      },
      webDir: path.join(root, "web"),
      contributions: [],
      locales: ["en"],
      platform: "macos",
    });

    expect(config.native?.macos).toEqual({ entitlements });
    await mkdir(path.join(root, "web"), { recursive: true });
    await writeFile(path.join(root, "web/index.html"), "<html><head></head><body></body></html>");
    expect((await NativeApi.load(repoApp)).validateConfig(config, { appDir: root })).toEqual([]);
  });

  test("an app with updates ships the updates plugin and its settings", () => {
    const updates = { url: "https://releases.example.com/board", publicKey: `${"a".repeat(43)}=`, channel: "pilot" };
    const { config } = NativeConfig.build({
      appPath: "/repo/apps/board",
      target: { ...minimalTarget, permissions: [], deepLinks: undefined, android: undefined, updates },
      webDir: "/web",
      contributions: [],
      locales: ["en"],
      platform: "macos",
    });

    expect(config.plugins).toEqual([...NativeConfig.basePlugins, "updates"]);
    expect(config.updates).toEqual({ ...updates, target: minimalTarget.name });
  });

  test("an updates channel left unnamed is the backend env the binary is built for", () => {
    const updates = { url: "https://releases.example.com/board", publicKey: `${"a".repeat(43)}=` };
    const build = (env?: "debug" | "main", channel?: string) =>
      NativeConfig.build({
        appPath: "/repo/apps/board",
        target: {
          ...minimalTarget,
          permissions: [],
          deepLinks: undefined,
          android: undefined,
          updates: { ...updates, ...(channel ? { channel } : {}) },
        },
        webDir: "/web",
        contributions: [],
        locales: ["en"],
        platform: "macos",
        ...(env ? { env } : {}),
      }).config.updates;

    const target = minimalTarget.name;
    expect(build("debug")).toEqual({ ...updates, channel: "debug", target });
    expect(build("main")).toEqual({ ...updates, channel: "main", target });
    expect(build("debug", "pilot")).toEqual({ ...updates, channel: "pilot", target });
    expect(build()).toEqual({ ...updates, target });
  });

  describe("the page's content security policy", () => {
    const build = (
      target: Partial<AkanNativeTarget> = {},
      more: Partial<Parameters<typeof NativeConfig.build>[0]> = {},
    ) =>
      NativeConfig.build({
        appPath: "/repo/apps/minimal",
        target: { ...minimalTarget, ...target },
        webDir: "/web",
        contributions: [],
        locales: ["en"],
        platform: "ios",
        publicEnv: cloudEnv,
        ...more,
      }).config.security?.csp as Record<string, string[]> | string | undefined;

    test("lets a local build reach the dev server on any port, and a carried server on loopback", () => {
      const local = build({}, { publicEnv: { AKAN_PUBLIC_ENV: "local" } }) as Record<string, string[]>;
      expect(local["connect-src"]).toEqual([
        ...(NativeConfig.defaultCsp["connect-src"] ?? []),
        "http://localhost:*",
        "ws://localhost:*",
      ]);
      expect(local["script-src"]).toEqual(["'self'", "'wasm-unsafe-eval'"]);
      const desktopServer = { dir: "/srv", entry: "main.js", env: {} };
      const carried = build({}, { platform: "macos", desktopServer }) as Record<string, string[]>;
      expect(carried["connect-src"]).toContain("http://127.0.0.1:*");
      expect(carried["connect-src"]).toContain("ws://127.0.0.1:*");
    });

    test("a dev page under the default policy reaches the dev gateway's socket, on this computer or over the LAN", () => {
      const csp = build({}, { publicEnv: { AKAN_PUBLIC_ENV: "local" } });
      const devPolicy = (wsOrigin?: string) => {
        const { html } = rewriteDevHtml(
          '<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="/_akan/client/main.js"></script></body></html>',
          {
            platform: "ios",
            port: 4321,
            hmrPath: "/_akan/hmr",
            wsPaths: ["/ws"],
            ...(wsOrigin ? { wsOrigin } : {}),
            csp,
          },
        );
        const content = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";
        return parseCsp(content.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
      };

      const loopback = devPolicy();
      expect(loopback.get("connect-src")).toEqual(
        expect.arrayContaining(["'self'", "http://localhost:*", "ws://localhost:*", "ws://127.0.0.1:4321"]),
      );
      expect(loopback.get("script-src")).toEqual(expect.arrayContaining(["'self'", "blob:"]));
      const lan = devPolicy("ws://192.168.0.12:4321");
      expect(lan.get("connect-src")).toEqual(
        expect.arrayContaining(["'self'", "ws://192.168.0.12:4321", "http://192.168.0.12:4321"]),
      );
      expect(lan.get("object-src")).toEqual(["'none'"]);
    });

    test("reaches any https or wss origin and loads https images, media, fonts and stylesheets, while scripts stay the app's", () => {
      const csp = build() as Record<string, string[]>;
      expect(csp["connect-src"]).toEqual(["'self'", "blob:", "data:", "https:", "wss:"]);
      for (const directive of ["img-src", "media-src", "font-src"]) expect(csp[directive]).toContain("https:");
      expect(csp["style-src"]).toEqual(["'self'", "'unsafe-inline'", "https:"]);
      expect(csp["script-src"]).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    });

    test("names a pinned AKAN_PUBLIC_SERVER_URL only when it is plain http", () => {
      const connect = (url: string) =>
        (build({}, { publicEnv: { ...cloudEnv, AKAN_PUBLIC_SERVER_URL: url } }) as Record<string, string[]>)[
          "connect-src"
        ];
      expect(connect("https://api.example.com/x")).toEqual(["'self'", "blob:", "data:", "https:", "wss:"]);
      expect(connect("http://192.168.0.5:8080/api")).toEqual([
        "'self'",
        "blob:",
        "data:",
        "https:",
        "wss:",
        "http://192.168.0.5:8080",
        "ws://192.168.0.5:8080",
      ]);
    });

    test("a directive map adds to the default, a string replaces it, and false ships none", () => {
      const added = build({
        csp: { "script-src": "https://sdk.example.com", "object-src": ["https://embed.example.com"] },
      }) as Record<string, string[]>;
      expect(added["script-src"]).toEqual(["'self'", "'wasm-unsafe-eval'", "https://sdk.example.com"]);
      expect(added["object-src"]).toEqual(["https://embed.example.com"]);
      expect(build({ csp: "strict" })).toBe("strict");
      expect(build({ csp: false })).toBeUndefined();
    });

    test("a directive the default lacks starts from its CSP fallback, so the bundle and init.js still run", () => {
      const csp = build({
        csp: {
          "script-src": "https://sdk.example.com",
          "script-src-elem": ["https://cdn.example.com"],
          "style-src-attr": "https://styles.example.com",
          "manifest-src": ["https://manifest.example.com"],
          "upgrade-insecure-requests": [],
        },
      }) as Record<string, string[]>;
      expect(csp["script-src-elem"]).toEqual([
        "'self'",
        "'wasm-unsafe-eval'",
        "https://sdk.example.com",
        "https://cdn.example.com",
      ]);
      expect(csp["style-src-attr"]).toEqual(["'self'", "'unsafe-inline'", "https:", "https://styles.example.com"]);
      expect(csp["manifest-src"]).toEqual(["'self'", "https://manifest.example.com"]);
      expect(csp["upgrade-insecure-requests"]).toEqual([]);

      const page =
        '<html><head><meta charset="utf-8"><script src="/__akan_native/init.js"></script></head><body><script type="module">boot()</script></body></html>';
      expect(parseCsp(buildCsp(csp, page).policy).get("script-src-elem")).toEqual(
        expect.arrayContaining(["'self'", cspHash("boot()")]),
      );
    });

    test("directive names ignore case, and a default-src entry reaches every fetch directive but object-src", () => {
      const csp = build({
        csp: { "Connect-Src": ["https://upload.example.com"], "default-src": "https://cdn.example.com" },
      }) as Record<string, string[]>;
      expect(Object.keys(csp)).not.toContain("Connect-Src");
      expect(csp["connect-src"]).toEqual([
        "'self'",
        "blob:",
        "data:",
        "https:",
        "wss:",
        "https://cdn.example.com",
        "https://upload.example.com",
      ]);
      expect(csp["default-src"]).toEqual(["'self'", "https://cdn.example.com"]);
      for (const directive of ["script-src", "style-src", "img-src", "font-src", "worker-src", "frame-src"])
        expect(csp[directive]).toContain("https://cdn.example.com");
      expect(csp["object-src"]).toEqual(["'none'"]);
      expect(csp["base-uri"]).toEqual(["'self'"]);
    });

    test("refuses an empty policy string and names csp: false", () => {
      expect(() => build({ csp: "" })).toThrow("`csp: false`");
      expect(() => build({ csp: " " })).toThrow("`csp: false`");
    });
  });

  test("opener opens https, mailto and tel links unless the app names its own", () => {
    const opener = (openUrls?: string[]) =>
      NativeConfig.build({
        appPath: "/repo/apps/minimal",
        target: { ...minimalTarget, ...(openUrls ? { openUrls } : {}) },
        webDir: "/web",
        contributions: [],
        locales: ["en"],
        platform: "android",
        publicEnv: cloudEnv,
      }).config.capabilities?.[0]?.permissions.find((permission) => JSON.stringify(permission).includes("opener"));

    expect(opener()).toEqual({
      identifier: "opener:default",
      allow: [{ url: "https://*:*" }, { url: "mailto:*" }, { url: "tel:*" }],
    });
    expect(opener(["https://*.example.com/*"])).toEqual({
      identifier: "opener:default",
      allow: [{ url: "https://*.example.com/*" }],
    });
    expect(opener(["*"])).toBe("opener:default");
  });

  test("keeps a file name the runtime accepts", () => {
    expect(NativeConfig.fileNameOf("minimal")).toBe("minimal");
    expect(NativeConfig.fileNameOf("my app!")).toBe("my-app");
    expect(NativeConfig.fileNameOf("...")).toBe("app");
    expect(NativeConfig.fileNameOf(".-my app!-.")).toBe("my-app");
    expect(NativeConfig.fileNameOf("-a-")).toBe("a");
    expect(NativeConfig.fileNameOf(`a${"-".repeat(50_000)}b`)).toHaveLength(50_002);
  });
});

const writeManifest = async (dir: string, id: string) => {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "native-plugin.json"),
    JSON.stringify({ id, apiVersion: 1, methods: [], events: [], web: null, desktop: null, ios: null, android: null }),
  );
  return dir;
};

const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

const googleServicesJson = JSON.stringify({
  project_info: { project_number: "1", project_id: "demo", storage_bucket: "demo.appspot.com" },
  client: [
    {
      client_info: { mobilesdk_app_id: "1:1:android:1", android_client_info: { package_name: "com.minimal.dev.app" } },
      api_key: [{ current_key: "demo-key" }],
    },
    {
      client_info: { mobilesdk_app_id: "1:1:android:2", android_client_info: { package_name: "com.portal.admin" } },
      api_key: [{ current_key: "demo-key" }],
    },
  ],
});
