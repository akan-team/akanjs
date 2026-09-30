import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { AkanPlugin } from "akanjs";
import type { AkanMobileTargetConfig } from "../akanConfig";
import type { App } from "../commandDecorators";
import { NativeApp } from "./nativeApp";
import { NativeConfig } from "./nativeConfig";

const target = (config: Partial<AkanMobileTargetConfig> = {}) => ({
  name: config.name ?? "default",
  config: {
    name: config.name ?? "default",
    appName: "Portal",
    appId: "com.portal.app",
    version: "1.0.0",
    buildNum: 1,
    ...config,
  },
});

const appDir = "/repo/apps/portal";

const fakeApp = (plugins: AkanPlugin[] = []) =>
  ({
    cwdPath: appDir,
    dist: { cwdPath: "/repo/dist/apps/portal" },
    getConfig: async () => ({ i18n: { locales: ["en", "ko"] }, api: { prefix: "/api", websocketPrefix: "/ws" } }),
    collectPlugins: async () => plugins,
    logger: { warn: () => undefined },
  }) as unknown as App;

describe("NativeApp", () => {
  test("keeps each target's web root and each platform's output apart", () => {
    const admin = new NativeApp(fakeApp(), target({ name: "admin", basePath: "admin" }));

    expect(admin.web.dir).toBe(path.join(appDir, ".akan/mobile/admin/web"));
    expect(admin.outDir("ios")).toBe(path.join(appDir, ".akan/mobile/admin/native/ios"));
    expect(admin.outDir("android")).toBe(path.join(appDir, ".akan/mobile/admin/native/android"));
  });

  test("a dev boot that came up says so in one line: platform, device, dev server, time", () => {
    const app = { ...fakeApp(), name: "portal" } as unknown as App;
    const startedAt = performance.now() - 12_400;
    expect(new NativeApp(app, target()).readyLine("macos", { upstream: "http://localhost:8283", startedAt })).toMatch(
      /^portal desktop ready · http:\/\/localhost:8283 · 12\.\ds$/,
    );
    expect(
      new NativeApp(app, target({ name: "admin" })).readyLine("ios", {
        upstream: "http://localhost:8283",
        device: { name: "iPhone 16" },
        startedAt,
      }),
    ).toMatch(/^portal\/admin ios ready · iPhone 16 · http:\/\/localhost:8283 · 12\.\ds$/);
  });

  test("opens a dev build on its target's home, the CSR shell under the locale", () => {
    expect(new NativeApp(fakeApp(), target({ indexPath: "/explore" })).startPath("en")).toBe(
      "/en/explore?csr=true&akanMobileTarget=default&akanMobileIndexPath=%2Fexplore",
    );
    expect(new NativeApp(fakeApp(), target({ name: "admin", basePath: "/admin/" })).startPath("ko")).toBe(
      "/ko/admin?csr=true&akanMobileTarget=admin&akanMobileBasePath=admin",
    );
  });

  test("builds its config from the app's locales and the plugins' native contributions", async () => {
    const push: AkanPlugin = { name: "push-notification", native: { permission: "push", plugins: ["push"] } };
    const app = new NativeApp(
      fakeApp([push, { name: "other" }]),
      target({ basePath: undefined, permissions: ["push"] }),
    );

    const { config, warnings } = await app.config("android");

    expect(warnings).toEqual([]);
    expect(config.plugins).toEqual([...NativeConfig.basePlugins, "push"]);
    expect(config.web.dir).toBe(path.join(appDir, ".akan/mobile/default/web"));
  });

  test("a desktop app is this computer's platform", () => {
    expect(["darwin", "win32", "linux"].map((host) => NativeApp.desktopPlatform(host as NodeJS.Platform))).toEqual([
      "macos",
      "windows",
      "linux",
    ]);
    expect(() => NativeApp.desktopPlatform("freebsd")).toThrow("A desktop app builds on macOS, Windows or Linux");
  });

  test("signs an Android release with the upload key the environment names, and says which part is missing", () => {
    expect(
      NativeApp.androidSigning({
        MYAPP_RELEASE_STORE_FILE: "keys/upload.jks",
        MYAPP_RELEASE_STORE_PASSWORD: "store",
        MYAPP_RELEASE_KEY_ALIAS: "upload",
      }),
    ).toEqual({ keystore: "keys/upload.jks", storePassword: "store", alias: "upload" });
    expect(() => NativeApp.androidSigning({ MYAPP_RELEASE_STORE_FILE: "keys/upload.jks" })).toThrow(
      "set MYAPP_RELEASE_STORE_PASSWORD, MYAPP_RELEASE_KEY_ALIAS in the environment",
    );
  });
});
