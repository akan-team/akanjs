import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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

const updatesKey = Buffer.alloc(32, 7).toString("base64");

describe("NativeConfig.build", () => {
  test("turns the minimal app's push target into the runtime's config, single-instance carrying its link scheme", () => {
    const { config, warnings } = NativeConfig.build({
      appPath: "/repo/apps/minimal",
      target: minimalTarget,
      webDir: "/repo/apps/minimal/.akan/native/default/web",
      contributions: [{ permission: "push", plugins: ["push"] }],
      locales: ["en", "ko"],
      platform: "android",
    });

    expect(warnings).toEqual([]);
    expect(config).toEqual({
      app: { id: "com.minimal.dev.app", name: "minimal", fileName: "minimal", version: "0.0.1", build: 1 },
      web: { dir: "/repo/apps/minimal/.akan/native/default/web" },
      plugins: [...NativeConfig.basePlugins, "single-instance", "push"],
      capabilities: [
        {
          identifier: "app",
          description: "The plugins minimal ships, each with its default permissions",
          permissions: [...NativeConfig.basePlugins, "single-instance", "push"].map((plugin) => `${plugin}:default`),
        },
      ],
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
      webDir: "/repo/apps/portal/.akan/native/admin/web",
      contributions: [],
      locales: ["en", "ko"],
      platform: "android",
    });

    expect(warnings).toEqual(["Permission 'speech' has no native plugin yet; the app ships without it."]);
    expect(config).toEqual({
      app: { id: "com.portal.admin", name: "Portal Admin", fileName: "portal-admin", version: "2.1.0", build: 42 },
      web: { dir: "/repo/apps/portal/.akan/native/admin/web" },
      plugins: [...NativeConfig.basePlugins, "camera", "geolocation", "contacts", "iap"],
      capabilities: [
        {
          identifier: "app",
          description: "The plugins Portal Admin ships, each with its default permissions",
          permissions: [...NativeConfig.basePlugins, "camera", "geolocation", "contacts", "iap"].map(
            (plugin) => `${plugin}:default`,
          ),
        },
      ],
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
    });
    expect(build({ url, publicKey: updatesKey, channel: "beta", readyTimeout: 15_000 }, "main").updates).toEqual({
      url,
      publicKey: updatesKey,
      channel: "beta",
      readyTimeout: 15_000,
    });
    expect(build({ url, publicKey: updatesKey }).updates).toEqual({ url, publicKey: updatesKey });
    expect(build({ url, publicKey: updatesKey }, "main").plugins).toContain("updates");
    expect(build(undefined, "main").plugins).not.toContain("updates");
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
      [...NativeConfig.basePlugins, "led-panel", "kiosk"].map((id) => `${id}:default`),
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
        desktop: { recovery: "reload", window: { fullscreen: true, skipTaskbar: true }, screenCapture: "auto" },
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
    expect(config.updates).toEqual(updates);
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

    expect(build("debug")).toEqual({ ...updates, channel: "debug" });
    expect(build("main")).toEqual({ ...updates, channel: "main" });
    expect(build("debug", "pilot")).toEqual({ ...updates, channel: "pilot" });
    expect(build()).toEqual(updates);
  });

  test("keeps a file name the runtime accepts", () => {
    expect(NativeConfig.fileNameOf("minimal")).toBe("minimal");
    expect(NativeConfig.fileNameOf("my app!")).toBe("my-app");
    expect(NativeConfig.fileNameOf("...")).toBe("app");
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
