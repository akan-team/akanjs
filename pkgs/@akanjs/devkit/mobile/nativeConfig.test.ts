import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AkanMobileTargetConfig } from "../akanConfig";
import { tempDirs } from "../testHelpers";
import { NativeApi } from "./nativeApi";
import { NativeConfig } from "./nativeConfig";

const makeTempRoot = tempDirs("akan-native-config-");
const repoApp = path.resolve(import.meta.dir, "../../../../apps/minimal");

const minimalTarget: AkanMobileTargetConfig = {
  name: "default",
  indexPath: "/explore",
  appName: "minimal",
  appId: "com.minimal.dev.app",
  version: "0.0.1",
  buildNum: 1,
  permissions: ["push"],
  native: { android: { googleServices: "secrets/google-services.json" } },
  deepLinks: {
    schemes: ["minimal"],
    domains: ["example.com"],
    ios: { teamId: "TEAMID" },
    android: { sha256CertFingerprints: ["00:11"] },
  },
};

const adminTarget: AkanMobileTargetConfig = {
  name: "admin",
  basePath: "admin",
  appName: "Portal Admin",
  appId: "com.portal.admin",
  fileName: "portal-admin",
  version: "2.1.0",
  buildNum: 42,
  assets: { icon: "assets/icon.png", splash: "assets/splash.png" },
  permissions: ["camera", "location", "contacts"],
  deepLinks: { domains: ["portal.example"] },
  files: { "android/res/raw/chime.mp3": "assets/chime.mp3" },
  native: {
    plugins: ["iap"],
    ios: { infoPlist: { ITSAppUsesNonExemptEncryption: false } },
    android: { manifest: ['<queries><package android:name="com.kakao.talk" /></queries>'] },
  },
};

describe("NativeConfig.build", () => {
  test("turns the minimal app's push target into the runtime's config", () => {
    const { config, warnings } = NativeConfig.build({
      appPath: "/repo/apps/minimal",
      target: minimalTarget,
      webDir: "/repo/apps/minimal/.akan/mobile/default/web",
      contributions: [{ permission: "push", plugins: ["push"] }],
      locales: ["en", "ko"],
    });

    expect(warnings).toEqual([]);
    expect(config).toEqual({
      app: { id: "com.minimal.dev.app", name: "minimal", fileName: "minimal", version: "0.0.1", build: 1 },
      web: { dir: "/repo/apps/minimal/.akan/mobile/default/web" },
      plugins: [...NativeConfig.basePlugins, "push"],
      deepLinks: { schemes: ["minimal"], domains: ["example.com"] },
      android: { debugAppIdSuffix: ".debug", googleServices: "/repo/apps/minimal/secrets/google-services.json" },
      keyboard: { resize: "none" },
    });
  });

  test("falls back to the builtin permission plugins, names the app in their texts, and lists basePath links per locale", () => {
    const { config, warnings } = NativeConfig.build({
      appPath: "/repo/apps/portal",
      target: adminTarget,
      webDir: "/repo/apps/portal/.akan/mobile/admin/web",
      contributions: [],
      locales: ["en", "ko"],
    });

    expect(warnings).toEqual(["Permission 'contacts' has no native plugin yet; the app ships without it."]);
    expect(config).toEqual({
      app: { id: "com.portal.admin", name: "Portal Admin", fileName: "portal-admin", version: "2.1.0", build: 42 },
      web: { dir: "/repo/apps/portal/.akan/mobile/admin/web" },
      plugins: [...NativeConfig.basePlugins, "camera", "geolocation", "iap"],
      usageDescriptions: {
        NSCameraUsageDescription: "Portal Admin requires access to the camera to take photos.",
        NSPhotoLibraryAddUsageDescription: "Portal Admin requires access to the photo library to take photos.",
        NSPhotoLibraryUsageDescription: "Portal Admin requires access to the photo library to take photos.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "Portal Admin requires access to the location to get the user's location.",
        NSLocationAlwaysUsageDescription: "Portal Admin requires access to the location to get the user's location.",
        NSLocationWhenInUseUsageDescription: "Portal Admin requires access to the location to get the user's location.",
      },
      deepLinks: { domains: [{ host: "portal.example", pathPrefixes: ["/en/admin", "/ko/admin"] }] },
      native: {
        ios: { infoPlist: { ITSAppUsesNonExemptEncryption: false } },
        android: { manifest: ['<queries><package android:name="com.kakao.talk" /></queries>'] },
        resources: [{ from: "/repo/apps/portal/assets/chime.mp3", to: "android/res/raw/chime.mp3" }],
      },
      android: { debugAppIdSuffix: ".debug" },
      keyboard: { resize: "none" },
      icon: "/repo/apps/portal/assets/icon.png",
      splash: { image: "/repo/apps/portal/assets/splash.png" },
    });
  });

  test("a plugin that claims a permission replaces the builtin one and adds its Android entries", () => {
    const { config } = NativeConfig.build({
      appPath: "/repo/apps/portal",
      target: { ...adminTarget, permissions: ["camera"], native: undefined, files: undefined, assets: undefined },
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

    for (const target of [minimalTarget, adminTarget]) {
      const { config } = NativeConfig.build({
        appPath: root,
        target,
        webDir: path.join(root, "web"),
        contributions: [],
        locales: ["en", "ko"],
      });
      expect(api.validateConfig(config, { appDir: root })).toEqual([]);
    }
  });

  test("keeps a file name the runtime accepts", () => {
    expect(NativeConfig.fileNameOf("minimal")).toBe("minimal");
    expect(NativeConfig.fileNameOf("my app!")).toBe("my-app");
    expect(NativeConfig.fileNameOf("...")).toBe("app");
  });
});

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
