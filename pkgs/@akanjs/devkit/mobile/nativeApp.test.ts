import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { AkanPlugin } from "akanjs";
import type { AkanNativeTarget } from "../akanConfig";
import type { App } from "../commandDecorators";
import { CsrArtifactBuilder } from "../frontendBuild/csrArtifactBuilder";
import { tempDirs, writeText } from "../testHelpers";
import { NativeApp } from "./nativeApp";
import { NativeConfig } from "./nativeConfig";
import { NativePublicEnv } from "./nativePublicEnv";

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

  describe("the server a release carries, signed or not", () => {
    const releasing = async () => {
      const root = await makeTempRoot();
      const appPath = path.join(root, "apps/portal");
      await writeText(
        path.join(appPath, "env/env.server.main.ts"),
        'export const env = { security: { jwtSecret: "main-jwt-0123456789" } };\n',
      );
      const server = { dir: path.join(root, "server"), entry: "main.js", env: {} };
      await writeText(path.join(server.dir, "main.js"), 'const jwt = "main-jwt-0123456789";\n');
      const app = {
        ...fakeApp(),
        cwdPath: appPath,
        workspace: { workspaceRoot: root },
        logger: { info: () => undefined, warn: () => undefined },
      } as unknown as App;
      const updates = { url: "https://releases.example.com/portal", publicKey: `${"a".repeat(43)}=` };
      const nativeApp = new NativeApp(app, target({ updates }), "main");
      const built: string[] = [];
      nativeApp.assembleWeb = async () => undefined as never;
      nativeApp.prepare = async () =>
        ({
          config: {},
          api: {
            requestedDistribution: () => ({ notice: null, unused: [] }),
            build: async ({ profile }: { profile: string }) => {
              built.push(profile);
              return { artifacts: [], warnings: [] };
            },
            publishUpdate: async () => {
              built.push("update");
              return {};
            },
          },
        }) as never;
      return { appPath, server, nativeApp, built };
    };

    test("an unsigned release build and an unsigned update are refused when it holds a secret, a debug build is not searched", async () => {
      const { server, nativeApp, built } = await releasing();
      await expect(nativeApp.build("linux", { server })).rejects.toThrow(
        "main.js holds apps/portal/env/env.server.main.ts security.jwtSecret",
      );
      await expect(nativeApp.publishUpdate("linux", { server })).rejects.toThrow("security.jwtSecret");
      await nativeApp.build("linux", { server, profile: "debug" });
      expect(built).toEqual(["debug"]);
    });

    test("an env file that cannot be evaluated stops the release instead of going unsearched", async () => {
      const { appPath, server, nativeApp, built } = await releasing();
      await writeText(path.join(server.dir, "main.js"), "\n");
      await writeText(path.join(appPath, "env/env.server.develop.ts"), 'export { env } from "./missing";\n');
      await expect(nativeApp.build("linux", { server })).rejects.toThrow(
        "The server this app carries was not searched for the secret values of apps/portal/env/env.server.develop.ts",
      );
      expect(built).toEqual([]);
    });
  });

  describe("the public env a build inlined, recorded in its bundle.json", () => {
    const publicEnv = { AKAN_PUBLIC_ENV: "main", AKAN_PUBLIC_SERVE_DOMAIN: "akamir.com" };
    const building = async (inlined: Record<string, string>, updates: AkanNativeTarget["updates"]) => {
      const root = await makeTempRoot();
      const warned: string[] = [];
      const app = {
        ...fakeApp(),
        workspace: { workspaceRoot: root },
        dist: { cwdPath: path.join(root, "dist/apps/portal") },
        logger: { info: () => undefined, warn: (message: string) => warned.push(message) },
      } as unknown as App;
      await CsrArtifactBuilder.writePublicEnv(
        app,
        Object.fromEntries(
          Object.entries({ ...inlined, AKAN_PUBLIC_APP_NAME: "portal", AKAN_PUBLIC_RENDER_ENV: "csr" }).map(
            ([key, value]) => [`process.env.${key}`, JSON.stringify(value)],
          ),
        ),
      );
      const nativeApp = new NativeApp(app, target(updates ? { updates } : {}), "main");
      const built: string[] = [];
      const writeBundle = async (dir: string) =>
        await writeText(path.join(dir, "bundle.json"), JSON.stringify({ schema: 1, web: { hash: "w", files: 1 } }));
      nativeApp.assembleWeb = async () => undefined as never;
      nativeApp.prepare = async () =>
        ({
          config: { updates: { channel: "production" } },
          api: {
            packUpdate: async ({ out }: { out: string }) => {
              built.push("pack");
              await writeBundle(out);
              return { out, manifest: { app: "com.portal.app", version: "1.0.0", nativeApi: "n", files: [] } };
            },
            release: async ({ outDir }: { outDir: string }) => {
              built.push("release");
              await writeBundle(outDir);
              return {};
            },
          },
        }) as never;
      return { root, nativeApp, built, warned };
    };
    const updates = { url: "https://releases.example.com/portal", publicKey: `${"a".repeat(43)}=` };

    test("a pack and a release record what the CSR build inlined, and the pack's record carries its hash", async () => {
      const { root, nativeApp } = await building(publicEnv, updates);
      const { pack } = await nativeApp.packUpdate("android", { out: path.join(root, "out") });
      const bundle = await Bun.file(path.join(root, "out/bundle.json")).json();
      expect(bundle.web).toEqual({
        hash: "w",
        files: 1,
        publicEnv,
        publicEnvHash: NativePublicEnv.hash(publicEnv),
      });
      expect(pack.publicEnvHash).toBe(NativePublicEnv.hash(publicEnv));
      await nativeApp.releaseIos();
      const release = await Bun.file(path.join(nativeApp.outDir("ios"), "bundle.json")).json();
      expect(release.web.publicEnvHash).toBe(NativePublicEnv.hash(publicEnv));
    });

    test("an env an update cannot carry stops a target with updates before it builds, and only warns without", async () => {
      const refused = { ...publicEnv, AKAN_PUBLIC_MAP_TOKEN: "pk.x" };
      const withUpdates = await building(refused, updates);
      await expect(withUpdates.nativeApp.releaseIos()).rejects.toThrow("AKAN_PUBLIC_MAP_TOKEN names a token");
      expect(withUpdates.built).toEqual([]);
      const without = await building(refused, undefined);
      await without.nativeApp.releaseIos();
      expect(without.built).toEqual(["release"]);
      expect(without.warned.join("\n")).toContain("bundle.json records none");
      const release = await Bun.file(path.join(without.nativeApp.outDir("ios"), "bundle.json")).json();
      expect(release.web.publicEnv).toBeUndefined();
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
