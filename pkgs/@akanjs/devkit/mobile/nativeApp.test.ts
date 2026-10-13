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
const nativeDir = "/repo/dist/native/portal";

const fakeApp = (plugins: AkanPlugin[] = []) =>
  ({
    name: "portal",
    cwdPath: appDir,
    workspace: { workspaceRoot: "/repo" },
    getScanInfo: () => ({ getLibs: () => [] }),
    dist: { cwdPath: "/repo/dist/apps/portal" },
    getConfig: async () => ({ i18n: { locales: ["en", "ko"] }, api: { prefix: "/api", websocketPrefix: "/ws" } }),
    getDevPort: async () => 8284,
    collectPlugins: async () => plugins,
    logger: { warn: () => undefined },
  }) as unknown as App;

describe("NativeApp", () => {
  test("keeps each target's web root and each platform's output apart, outside the dist akan build empties", () => {
    const admin = new NativeApp(fakeApp(), target({ name: "admin", basePath: "admin" }));

    expect(admin.web.dir).toBe(path.join(nativeDir, "admin/web"));
    expect(admin.outDir("ios")).toBe(path.join(nativeDir, "admin/build/ios"));
    expect(admin.outDir("android")).toBe(path.join(nativeDir, "admin/build/android"));
    expect(admin.devOutDir("macos")).toBe(path.join(nativeDir, "admin/dev/macos"));
    expect(admin.updatesDir).toBe(path.join(nativeDir, "admin/updates"));
    expect(path.relative("/repo/dist/apps/portal", admin.targetRoot)).toStartWith("..");
  });

  describe("the server a release build's page calls", () => {
    const runtimeEnvOf = async (env: "local" | "debug", options: { server?: boolean } = {}) => {
      const nativeApp = new NativeApp(fakeApp(), target(), env);
      let seen: Record<string, string> | undefined;
      nativeApp.assembleWeb = async () => undefined as never;
      nativeApp.prepare = async () =>
        ({
          config: {},
          api: {
            requestedDistribution: () => ({ notice: null, unused: [] }),
            build: async ({ env }: { env?: Record<string, string> }) => {
              seen = env;
              return { artifacts: [], warnings: [] };
            },
          },
        }) as never;
      await nativeApp.build("linux", options.server ? { server: { dir: "/s", entry: "main.js", env: {} } } : {});
      return seen;
    };

    test("a local release calls the app's own dev server, not 8282", async () => {
      expect(await runtimeEnvOf("local")).toEqual({ PUBLIC_AKAN_SERVER_URL: "http://localhost:8284" });
    });

    test("a cloud release and a release carrying its server name none", async () => {
      expect(await runtimeEnvOf("debug")).toEqual({});
      expect(await runtimeEnvOf("local", { server: true })).toEqual({});
    });

    test("an AKAN_PUBLIC_SERVER_URL the bundle was built with is left to win", async () => {
      process.env.AKAN_PUBLIC_SERVER_URL = "http://192.168.0.10:8284";
      try {
        expect(await runtimeEnvOf("local")).toEqual({});
      } finally {
        delete process.env.AKAN_PUBLIC_SERVER_URL;
      }
    });
  });

  test("a dev build bundles no page a release build left, and builds apart from the release it would empty", async () => {
    const root = await makeTempRoot();
    const app = {
      ...fakeApp(),
      cwdPath: path.join(root, "apps/portal"),
      workspace: { workspaceRoot: root },
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
    const app = {
      ...fakeApp(),
      cwdPath: root,
      workspace: { workspaceRoot: root },
      dist: { cwdPath: path.join(root, "dist") },
    } as unknown as App;
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
    expect(config.web.dir).toBe(path.join(nativeDir, "default/web"));
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

describe("a pack read back from its folder", () => {
  test("takes the folder as the pack's place, and refuses what is not a takeable pack", async () => {
    const root = await makeTempRoot();
    const pack = {
      schema: 1,
      app: "lu",
      target: "default",
      platform: "android",
      env: "main",
      channel: "main",
      appId: "com.lu",
      appVersion: "1.0.0",
      nativeApi: "0123456789abcdef",
      webHash: "f".repeat(64),
      files: 1,
      size: 13,
      out: "/elsewhere/updates/android",
    };
    const moved = path.join(root, "moved");
    await writeText(path.join(moved, "pack.json"), JSON.stringify(pack));
    expect(await NativeApp.readPack(moved)).toEqual({ ...pack, out: moved } as never);

    await expect(NativeApp.readPack(path.join(root, "empty"))).rejects.toThrow("holds no pack.json");
    const later = path.join(root, "later");
    await writeText(path.join(later, "pack.json"), JSON.stringify({ ...pack, schema: 2 }));
    await expect(NativeApp.readPack(later)).rejects.toThrow("schema 2");
    const refused = path.join(root, "refused");
    const compat = { against: "store/bundle.json", compatible: false, problems: ["deepLinks differ"] };
    await writeText(path.join(refused, "pack.json"), JSON.stringify({ ...pack, compat }));
    await expect(NativeApp.readPack(refused)).rejects.toThrow("needs a new store build: deepLinks differ");
  });
});
