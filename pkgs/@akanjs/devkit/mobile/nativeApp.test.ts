import { describe, expect, test } from "bun:test";
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

const fakeApp = (plugins: AkanPlugin[] = []) =>
  ({
    cwdPath: "/repo/apps/portal",
    dist: { cwdPath: "/repo/dist/apps/portal" },
    getConfig: async () => ({ i18n: { locales: ["en", "ko"] }, api: { prefix: "/api", websocketPrefix: "/ws" } }),
    collectPlugins: async () => plugins,
    logger: { warn: () => undefined },
  }) as unknown as App;

describe("NativeApp", () => {
  test("keeps each target's web root and each platform's output apart", () => {
    const admin = new NativeApp(fakeApp(), target({ name: "admin", basePath: "admin" }));

    expect(admin.web.dir).toBe("/repo/apps/portal/.akan/mobile/admin/web");
    expect(admin.outDir("ios")).toBe("/repo/apps/portal/.akan/mobile/admin/native/ios");
    expect(admin.outDir("android")).toBe("/repo/apps/portal/.akan/mobile/admin/native/android");
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

    const { config, warnings } = await app.config();

    expect(warnings).toEqual([]);
    expect(config.plugins).toEqual([...NativeConfig.basePlugins, "push"]);
    expect(config.web.dir).toBe("/repo/apps/portal/.akan/mobile/default/web");
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
