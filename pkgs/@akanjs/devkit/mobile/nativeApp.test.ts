import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { AkanPlugin } from "akanjs";
import type { AkanNativeTarget } from "../akanConfig";
import type { App } from "../commandDecorators";
import { tempDirs, writeText } from "../testHelpers";
import { NativeApp } from "./nativeApp";
import { NativeConfig } from "./nativeConfig";

const makeTempRoot = tempDirs("akan-native-app-");

const target = (config: Partial<AkanNativeTarget> = {}) => ({
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
    name: "portal",
    cwdPath: appDir,
    workspace: { workspaceRoot: "/repo" },
    getScanInfo: () => ({ getLibs: () => [] }),
    dist: { cwdPath: "/repo/dist/apps/portal" },
    getConfig: async () => ({ i18n: { locales: ["en", "ko"] }, api: { prefix: "/api", websocketPrefix: "/ws" } }),
    collectPlugins: async () => plugins,
    logger: { warn: () => undefined },
  }) as unknown as App;

describe("NativeApp", () => {
  test("keeps each target's web root and each platform's output apart", () => {
    const admin = new NativeApp(fakeApp(), target({ name: "admin", basePath: "admin" }));

    expect(admin.web.dir).toBe(path.join(appDir, ".akan/native/admin/web"));
    expect(admin.outDir("ios")).toBe(path.join(appDir, ".akan/native/admin/build/ios"));
    expect(admin.outDir("android")).toBe(path.join(appDir, ".akan/native/admin/build/android"));
    expect(admin.devOutDir("macos")).toBe(path.join(appDir, ".akan/native/admin/dev/macos"));
  });

  test("a dev build bundles no page a release build left, and builds apart from the release it would empty", async () => {
    const app = {
      ...fakeApp(),
      cwdPath: await makeTempRoot(),
      logger: { info: () => undefined, debug: () => undefined, warn: () => undefined },
    } as unknown as App;
    const nativeApp = new NativeApp(app, target());
    await writeText(path.join(nativeApp.web.dir, "index.html"), "<html>the last release</html>");
    const seen: { outDir?: string; leftover: boolean }[] = [];
    nativeApp.prepare = async () =>
      ({
        config: {},
        api: {
          dev: async ({ outDir }: { outDir?: string }) => {
            seen.push({ outDir, leftover: await Bun.file(path.join(nativeApp.web.dir, "index.html")).exists() });
            return { gateway: "http://127.0.0.1:9", exited: Promise.resolve(0), stop: async () => undefined };
          },
        },
      }) as never;

    await nativeApp.dev("windows", { upstream: "http://localhost:8282", lang: "en" });

    expect(seen).toEqual([{ outDir: nativeApp.devOutDir("windows"), leftover: false }]);
    expect(path.relative(nativeApp.outDir("windows"), nativeApp.devOutDir("windows"))).toStartWith("..");
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

  test("an installer is what a person downloads, on the desktops that have one", () => {
    expect(() => NativeApp.assertInstaller("windows", true)).not.toThrow();
    expect(() => NativeApp.assertInstaller("macos", true)).not.toThrow();
    expect(() => NativeApp.assertInstaller("linux", true)).not.toThrow();
    expect(() => NativeApp.assertInstaller("ios", true)).toThrow(/not for ios/);
  });

  test("opens a dev build on its target's home, the CSR shell under the locale", () => {
    expect(new NativeApp(fakeApp(), target({ indexPath: "/explore" })).startPath("en", "ios")).toBe(
      "/en/explore?csr=true&akanMobileTarget=default&akanMobileIndexPath=%2Fexplore",
    );
    expect(new NativeApp(fakeApp(), target({ name: "admin", basePath: "/admin/" })).startPath("ko", "android")).toBe(
      "/ko/admin?csr=true&akanMobileTarget=admin&akanMobileBasePath=admin",
    );
  });

  test("a platform section's indexPath wins on that platform, and the others keep the target's", () => {
    const app = new NativeApp(fakeApp(), target({ indexPath: "/mobile", desktop: { indexPath: "/", server: true } }));

    expect(app.indexPath("ios")).toBe("/mobile");
    expect(app.indexPath("android")).toBe("/mobile");
    expect(app.indexPath("macos")).toBe("/");
    expect(app.indexPath("windows")).toBe("/");
    expect(app.startPath("en", "macos")).toBe("/en?csr=true&akanMobileTarget=default&akanMobileIndexPath=%2F");
    expect(app.startPath("en", "ios")).toBe(
      "/en/mobile?csr=true&akanMobileTarget=default&akanMobileIndexPath=%2Fmobile",
    );
  });

  test("assembles each platform's web root with that platform's indexPath", async () => {
    const root = await makeTempRoot();
    await writeText(path.join(root, "dist/csr/index.html"), "<html><head></head><body></body></html>");
    const app = { ...fakeApp(), cwdPath: root, dist: { cwdPath: path.join(root, "dist") } } as unknown as App;
    const nativeApp = new NativeApp(app, target({ indexPath: "/mobile", desktop: { indexPath: "/console" } }));
    const injected = async () => await Bun.file(path.join(nativeApp.web.dir, "index.html")).text();

    await nativeApp.assembleWeb("linux");
    expect(await injected()).toContain('"indexPath":"/console"');
    await nativeApp.assembleWeb("android");
    expect(await injected()).toContain('"indexPath":"/mobile"');
  });

  test("builds its config from the app's locales and the plugins' native contributions", async () => {
    const push: AkanPlugin = { name: "push-notification", native: { permission: "push", plugins: ["push"] } };
    const app = new NativeApp(
      fakeApp([push, { name: "other" }]),
      target({ basePath: undefined, permissions: ["push"] }),
    );

    const { config, warnings } = await app.config({ platform: "android" });

    expect(warnings).toEqual([]);
    expect(config.plugins).toEqual([...NativeConfig.basePlugins, "push"]);
    expect(config.web.dir).toBe(path.join(appDir, ".akan/native/default/web"));
  });

  test("a config nothing is built from (the update key's) stages no desktop bin", async () => {
    const { config } = await new NativeApp(fakeApp(), target({ basePath: undefined })).config({
      platform: "macos",
      stageBin: false,
    });
    expect(config.desktop?.bin).toBeUndefined();
  });

  test("follows the updates channel of the backend env it is built for", async () => {
    const updates = { url: "https://releases.example.com/portal", publicKey: `${"a".repeat(43)}=` };
    const built = async (env?: "debug" | "main") =>
      (await new NativeApp(fakeApp(), target({ basePath: undefined, updates }), env).config({ platform: "android" }))
        .config.updates;

    expect(await built("main")).toEqual({ ...updates, channel: "main" });
    expect(await built("debug")).toEqual({ ...updates, channel: "debug" });
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
