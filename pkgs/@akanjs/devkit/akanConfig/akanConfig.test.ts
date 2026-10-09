import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppExecutor, WorkspaceExecutor } from "../executors";
import type { PackageJson } from "../types";
import { AkanAppConfig, AkanLibConfig, deriveDefaultAppId } from "./akanConfig";
import type { LibConfigInput } from "./types";

const akanPackageJson = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../akanjs/package.json"), "utf8"),
) as PackageJson;

const packageJson: PackageJson = {
  name: "repo",
  version: "1.0.0",
  description: "repo",
  dependencies: {
    react: "19.0.0",
    "react-dom": "19.0.0",
    "react-server-dom-webpack": "19.0.0",
    "@external/runtime": "2.0.0",
  },
};

const app = { name: "portal" } as never;
const baseDevEnv = {
  repoName: "akanjs",
  serveDomain: "akanjs.com",
  env: "debug" as const,
  portOffset: 0,
  workspaceRoot: "/workspace",
};

const loadExtAppConfig = async (tmpPrefix: string, appConfig: string, libConfig: string) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), tmpPrefix));
  try {
    fs.mkdirSync(path.join(root, "apps/extapp"), { recursive: true });
    fs.mkdirSync(path.join(root, "libs/extlib"), { recursive: true });
    fs.writeFileSync(path.join(root, "apps/extapp/akan.config.ts"), appConfig);
    fs.writeFileSync(path.join(root, "libs/extlib/akan.config.ts"), libConfig);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "extrepo", version: "1.0.0" }));
    fs.writeFileSync(path.join(root, ".env"), "AKAN_PUBLIC_REPO_NAME=extrepo\nAKAN_PUBLIC_SERVE_DOMAIN=ext.test\n");
    const workspace = WorkspaceExecutor.fromRoot({ workspaceRoot: root, repoName: "extrepo" });
    return await AppExecutor.from(workspace, "extapp").getConfig();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

describe("AkanAppConfig", () => {
  test("applies defaults for route domains, i18n, image, native, and imports", () => {
    const config = new AkanAppConfig(app, ["shared"], packageJson, {}, baseDevEnv);

    expect([...config.domains].sort()).toEqual([
      "portal-debug.akanjs.com",
      "portal-develop.akanjs.com",
      "portal-main.akanjs.com",
    ]);
    expect(config.basePaths.size).toBe(0);
    expect(config.i18n.defaultLocale).toBe("en");
    expect(config.i18n.locales).toContain("en");
    expect(config.images.formats).toEqual(["image/webp"]);
    expect(config.native).toMatchObject({
      appName: "portal",
      appId: "com.akanjs.portal",
      version: "0.0.1",
      buildNum: 1,
      targets: {
        default: {
          name: "default",
          appName: "portal",
          appId: "com.akanjs.portal",
          version: "0.0.1",
          buildNum: 1,
        },
      },
    });
    expect(config.barrelImports).toEqual(
      expect.arrayContaining(["@apps/portal/ui", "@libs/shared/server", "akanjs/common", "akanjs/server"]),
    );
    expect(config.dockerfile).toContain("ENV AKAN_PUBLIC_APP_NAME=portal");
    expect(config.dockerfile).toContain("ENV AKAN_LOG_TO_FILE=0");
    expect(process.env.AKAN_PUBLIC_DEFAULT_LOCALE).toBe("en");
  });

  test("normalizes explicit routes, branch domains, base paths, and docker options", () => {
    const config = new AkanAppConfig(
      app,
      [],
      packageJson,
      {
        routes: [
          { domains: { debug: ["Root.Local:8282"], qa: ["QA.Root.Local"] } },
          {
            basePath: "/admin/",
            domains: {
              debug: ["Admin.Local:8282"],
              main: ["Admin.Main.Local"],
            },
          },
        ],
        i18n: { locales: ["ko", "en"], defaultLocale: "ko" },
        native: {
          appName: "Portal App",
          appId: "com.portal.mobile",
          version: "1.2.3",
          buildNum: 7,
        },
        images: { qualities: [80, 90], dangerouslyAllowSVG: true },
        docker: {
          image: { amd64: "oven/bun:amd64", arm64: "oven/bun:arm64" },
          preRuns: ["echo before", { arm64: "echo arm" }],
          postRuns: ["echo after"],
          command: ["bun", "server.js"],
        },
        optimizeImports: ["custom-icons"],
        publicEnv: ["AKAN_PUBLIC_FEATURE"],
      },
      baseDevEnv,
    );

    expect([...config.domains].sort()).toEqual(["qa.root.local", "root.local"]);
    expect([...config.basePaths]).toEqual(["admin"]);
    expect([...(config.subRoutes.get("admin") ?? [])].sort()).toEqual([
      "admin-debug.akanjs.com",
      "admin-develop.akanjs.com",
      "admin-main.akanjs.com",
      "admin-qa.akanjs.com",
      "admin.local",
      "admin.main.local",
    ]);
    expect([...config.branches].sort()).toEqual(["debug", "develop", "main", "qa"]);
    expect(config.i18n.defaultLocale).toBe("ko");
    expect(config.images.qualities).toEqual([80, 90]);
    expect(config.images.dangerouslyAllowSVG).toBe(true);
    expect(config.native.buildNum).toBe(7);
    expect(config.native.targets.default).toMatchObject({
      name: "default",
      appName: "Portal App",
      appId: "com.portal.mobile",
      version: "1.2.3",
      buildNum: 7,
    });
    expect(config.publicEnv).toEqual(["AKAN_PUBLIC_FEATURE"]);
    expect(config.optimizeImports).toContain("custom-icons");
    expect(config.dockerfile).toContain('CMD ["bun","server.js"]');
    expect(config.dockerfile).toContain("FROM oven/bun:amd64 AS amd64");
    expect(config.dockerfile).toContain('RUN if [ "$TARGETARCH" = "arm64"');
  });

  test("defaults both web surfaces on and keeps the image free of web env overrides", () => {
    const config = new AkanAppConfig(app, [], packageJson, {}, baseDevEnv);

    expect(config.web).toEqual({ ssr: true, csr: true });
    expect(config.dockerfile).not.toContain("AKAN_SSR");
    expect(config.dockerfile).not.toContain("AKAN_CSR");
  });

  test("bakes the disabled surface into the image env so the default matches what was built", () => {
    const ssrOnly = new AkanAppConfig(app, [], packageJson, { web: { csr: false } }, baseDevEnv);
    expect(ssrOnly.web).toEqual({ ssr: true, csr: false });
    expect(ssrOnly.dockerfile).toContain("ENV AKAN_CSR=false");
    expect(ssrOnly.dockerfile).not.toContain("ENV AKAN_SSR=false");

    const apiOnly = new AkanAppConfig(app, [], packageJson, { web: false }, baseDevEnv);
    expect(apiOnly.web).toEqual({ ssr: false, csr: false });
    expect(apiOnly.dockerfile).toContain("ENV AKAN_SSR=false");
    expect(apiOnly.dockerfile).toContain("ENV AKAN_CSR=false");

    expect(new AkanAppConfig(app, [], packageJson, { web: true }, baseDevEnv).web).toEqual({ ssr: true, csr: true });
  });

  test("writes the image env from getProductionEnv, one ENV line per key in its order", () => {
    const config = new AkanAppConfig(
      app,
      [],
      packageJson,
      { routes: [{ basePath: "admin", domains: {} }], web: false, database: { modes: ["single", "cluster"] } },
      baseDevEnv,
    );

    expect(config.getProductionEnv()).toEqual({
      PORT: "8282",
      NODE_ENV: "production",
      AKAN_PUBLIC_REPO_NAME: "akanjs",
      AKAN_PUBLIC_SERVE_DOMAIN: "akanjs.com",
      AKAN_PUBLIC_APP_NAME: "portal",
      AKAN_PUBLIC_ENV: "debug",
      AKAN_PUBLIC_BASE_PATHS: "admin",
      AKAN_PUBLIC_DEFAULT_LOCALE: "en",
      AKAN_PUBLIC_LOCALES: config.i18n.locales.join(","),
      AKAN_PUBLIC_API_PREFIX: "/api",
      AKAN_PUBLIC_WS_PREFIX: "/ws",
      AKAN_PUBLIC_OPERATION_MODE: "cloud",
      AKAN_DATABASE_MODES: "single,cluster",
      AKAN_LOG_TO_FILE: "0",
      AKAN_SSR: "false",
      AKAN_CSR: "false",
    });
    const envBlock = Object.entries(config.getProductionEnv())
      .map(([key, value]) => `ENV ${key}=${value}`)
      .join("\n");
    expect(config.dockerfile).toContain(`COPY . .\n${envBlock}\nCMD ["bun","main.js"]`);
  });

  test("writes the Dockerfile instructions it wrote before its env came from getProductionEnv", () => {
    //? 9adfb95c's output for this config; only the blank lines its empty interpolations left are gone since.
    const before = [
      "FROM oven/bun:1-slim",
      "RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends ca-certificates tzdata && rm -rf /var/lib/apt/lists/*",
      "RUN ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime",
      "ARG TARGETARCH",
      "",
      "RUN mkdir -p /workspace",
      "WORKDIR /workspace",
      "COPY ./package.json ./package.json",
      "RUN bun install --production",
      "",
      "COPY . .",
      "ENV PORT=8282",
      "ENV NODE_ENV=production",
      "ENV AKAN_PUBLIC_REPO_NAME=akanjs",
      "ENV AKAN_PUBLIC_SERVE_DOMAIN=akanjs.com",
      "ENV AKAN_PUBLIC_APP_NAME=portal",
      "ENV AKAN_PUBLIC_ENV=debug",
      "",
      "ENV AKAN_PUBLIC_DEFAULT_LOCALE=en",
      "ENV AKAN_PUBLIC_LOCALES=en,ko",
      "ENV AKAN_PUBLIC_API_PREFIX=/api",
      "ENV AKAN_PUBLIC_WS_PREFIX=/ws",
      "ENV AKAN_PUBLIC_OPERATION_MODE=cloud",
      "ENV AKAN_DATABASE_MODES=single",
      "ENV AKAN_LOG_TO_FILE=0",
      "",
      'CMD ["bun","main.js"]',
    ];
    const lines = (text: string) => text.split("\n").filter((line) => line !== "");

    expect(lines(new AkanAppConfig(app, [], packageJson, {}, baseDevEnv).dockerfile)).toEqual(lines(before.join("\n")));
  });

  test("refuses a csr-less build that ships a native app", () => {
    expect(
      () => new AkanAppConfig(app, [], packageJson, { web: { csr: false }, native: { appName: "portal" } }, baseDevEnv),
    ).toThrow("the native apps ship that bundle");
  });

  test("installs only ca-certificates and tzdata in the default image", () => {
    const config = new AkanAppConfig(app, [], packageJson, {}, baseDevEnv);

    expect(config.dockerfile).toContain(
      "RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends ca-certificates tzdata && rm -rf /var/lib/apt/lists/*",
    );
    // The Chromium/ffmpeg toolchain moved to per-app `preRuns`; keeping it here paid for it in every image.
    for (const dropped of ["libnss3", "ffmpeg", "build-essential", "redis", "xdg-utils"])
      expect(config.dockerfile).not.toContain(dropped);
  });

  test("keeps a declared Dockerfile string verbatim", () => {
    const dockerfile = 'FROM oven/bun:1-slim\nCOPY . .\nCMD ["bun","main.js"]';
    const config = new AkanAppConfig(app, [], packageJson, { docker: dockerfile }, baseDevEnv);

    expect(config.docker).toBe(dockerfile);
    expect(config.dockerfile).toBe(dockerfile);
  });

  test("resolves the image parts, defaulting the base image and the command", () => {
    const config = new AkanAppConfig(app, [], packageJson, { docker: { preRuns: ["echo hi"] } }, baseDevEnv);

    expect(config.docker).toEqual({
      image: "oven/bun:1-slim",
      preRuns: ["echo hi"],
      postRuns: [],
      command: ["bun", "main.js"],
    });
  });

  test("creates production package json and reports missing external versions", () => {
    const config = new AkanAppConfig(app, [], packageJson, { externalLibs: ["@external/runtime"] }, baseDevEnv);

    expect(config.getProductionPackageJson({ scripts: { start: "bun main.js" } })).toMatchObject({
      name: "portal",
      main: "./main.js",
      scripts: { start: "bun main.js" },
      dependencies: {
        react: "19.0.0",
        "react-dom": "19.0.0",
        "react-server-dom-webpack": "19.0.0",
        "@external/runtime": "2.0.0",
      },
    });

    const brokenConfig = new AkanAppConfig(
      app,
      [],
      { ...packageJson, dependencies: { react: "19.0.0" } },
      { externalLibs: ["missing-lib"] },
      baseDevEnv,
    );
    expect(() => brokenConfig.getProductionPackageJson()).toThrow("Dependency missing-lib not found");
  });

  test("falls back to akanjs package versions for built-in runtime dependencies", () => {
    const runtimeDependencies = {
      ...akanPackageJson.dependencies,
      ...akanPackageJson.peerDependencies,
    };
    const config = new AkanAppConfig(
      app,
      [],
      {
        name: "repo",
        version: "1.0.0",
        description: "repo",
        dependencies: {
          akanjs: "2.0.5-canary.0",
        },
      },
      {},
      baseDevEnv,
    );

    expect(config.getProductionPackageJson().dependencies).toEqual({
      react: runtimeDependencies.react,
      "react-dom": runtimeDependencies["react-dom"],
      "react-server-dom-webpack": runtimeDependencies["react-server-dom-webpack"],
    });
  });

  test("adds backend runtime packages by database mode", () => {
    const runtimeDependencies = {
      ...akanPackageJson.dependencies,
      ...akanPackageJson.peerDependencies,
    };
    const configOf = (database: { modes: ("single" | "multiple" | "cluster")[] }) =>
      new AkanAppConfig(app, [], packageJson, { database }, baseDevEnv);
    const dependenciesOf = (config: AkanAppConfig) => config.getProductionPackageJson().dependencies ?? {};
    const singleConfig = configOf({ modes: ["single"] });
    const multipleConfig = configOf({ modes: ["multiple"] });
    const clusterConfig = configOf({ modes: ["cluster"] });
    const edgeAndCloud = configOf({ modes: ["single", "cluster"] });

    for (const driver of ["ioredis", "bullmq", "postgres", "protobufjs"])
      expect(dependenciesOf(singleConfig)).not.toHaveProperty(driver);
    expect(dependenciesOf(multipleConfig)).toMatchObject({
      bullmq: runtimeDependencies.bullmq,
      ioredis: runtimeDependencies.ioredis,
    });
    expect(dependenciesOf(clusterConfig)).toMatchObject({
      bullmq: runtimeDependencies.bullmq,
      ioredis: runtimeDependencies.ioredis,
      postgres: runtimeDependencies.postgres,
    });
    // Redis replaced protobuf on the wire, so it ships with no mode.
    for (const config of [multipleConfig, clusterConfig])
      expect(dependenciesOf(config)).not.toHaveProperty("protobufjs");
    expect(dependenciesOf(multipleConfig)).not.toHaveProperty("postgres");
    // One image for an edge site and a cloud cluster carries both modes' drivers, and says which it carries.
    expect(dependenciesOf(edgeAndCloud)).toMatchObject({ postgres: runtimeDependencies.postgres });
    expect(edgeAndCloud.dockerfile).toContain("ENV AKAN_DATABASE_MODES=single,cluster");
    expect(singleConfig.dockerfile).toContain("ENV AKAN_DATABASE_MODES=single");
  });

  test("runs single when the app declares no mode", () => {
    expect(new AkanAppConfig(app, [], packageJson, {}, baseDevEnv).database.modes).toEqual(["single"]);
  });

  test("refuses a mode name that is not one of the three, naming the file", () => {
    expect(
      () => new AkanAppConfig(app, [], packageJson, { database: { modes: ["clsuter" as "cluster"] } }, baseDevEnv),
    ).toThrow("database.modes in apps/portal/akan.config.ts");
  });

  test("resolves a command's mode within the declared ones", () => {
    const previous = process.env.AKAN_DATABASE_MODE;
    try {
      const config = new AkanAppConfig(
        app,
        [],
        packageJson,
        { database: { modes: ["single", "cluster"] } },
        baseDevEnv,
      );
      delete process.env.AKAN_DATABASE_MODE;
      expect(config.resolveDatabaseMode()).toBe("single");
      process.env.AKAN_DATABASE_MODE = "cluster";
      expect(config.resolveDatabaseMode()).toBe("cluster");
      process.env.AKAN_DATABASE_MODE = "multiple";
      expect(() => config.resolveDatabaseMode()).toThrow('Add "multiple" to database.modes');
    } finally {
      if (previous === undefined) delete process.env.AKAN_DATABASE_MODE;
      else process.env.AKAN_DATABASE_MODE = previous;
    }
  });

  test("resolves database mode runtime packages and missing install specs", () => {
    const runtimeDependencies = {
      ...akanPackageJson.dependencies,
      ...akanPackageJson.peerDependencies,
    };
    const config = new AkanAppConfig(
      app,
      [],
      {
        name: "repo",
        version: "1.0.0",
        description: "repo",
        dependencies: {
          bullmq: "5.0.0",
        },
        devDependencies: {
          ioredis: "5.0.0",
        },
      },
      {},
      baseDevEnv,
    );

    expect(config.getDatabaseModeRuntimePackages("single")).toEqual([]);
    expect(config.getDatabaseModeRuntimePackages("multiple")).toEqual(["bullmq", "ioredis"]);
    expect(config.getDatabaseModeRuntimePackages("cluster")).toEqual(["bullmq", "ioredis", "postgres"]);
    expect(config.getMissingDatabaseModeDependencySpecs("multiple")).toEqual([]);
    expect(config.getMissingDatabaseModeDependencySpecs("cluster")).toEqual([
      `postgres@${runtimeDependencies.postgres}`,
    ]);
  });

  test("normalizes the native targets and validates base paths", () => {
    const config = new AkanAppConfig(
      app,
      [],
      packageJson,
      {
        routes: [{ basePath: "admin", domains: {} }],
        native: {
          appName: "Portal",
          appId: "com.portal.app",
          version: "1.0.0",
          buildNum: 3,
          targets: {
            admin: {
              basePath: "admin",
              indexPath: "/admin/home/",
              appName: "Portal Admin",
              appId: "com.portal.admin",
              buildNum: 8,
              permissions: ["camera"],
              deepLinks: { schemes: ["portal-admin", "portal-admin"], domains: ["https://Portal.Admin/"] },
              ios: { teamId: " TEAMID " },
              android: { sha256CertFingerprints: ["AA:BB", "AA:BB"] },
            },
          },
        },
      },
      baseDevEnv,
    );

    expect(config.native.targets.admin).toMatchObject({
      name: "admin",
      basePath: "admin",
      indexPath: "/admin/home",
      appName: "Portal Admin",
      appId: "com.portal.admin",
      version: "1.0.0",
      buildNum: 8,
      permissions: ["camera"],
      deepLinks: { schemes: ["portal-admin"], domains: ["portal.admin"] },
      ios: { teamId: "TEAMID" },
      android: { sha256CertFingerprints: ["AA:BB"] },
    });

    expect(
      () =>
        new AkanAppConfig(app, [], packageJson, { native: { targets: { bad: { basePath: "missing" } } } }, baseDevEnv),
    ).toThrow("unknown basePath");
  });

  test("a desktop server is true or { omit }, its names trimmed, deduplicated and sorted", () => {
    const resolve = (server: unknown) =>
      new AkanAppConfig(app, [], packageJson, { native: { desktop: { server } } } as never, baseDevEnv).native.targets
        .default.desktop?.server;

    expect(resolve(true)).toBe(true);
    expect(resolve({ omit: [" rclnodejs", "protobufjs", "rclnodejs"] })).toEqual({ omit: ["protobufjs", "rclnodejs"] });
    expect(resolve({})).toEqual({ omit: [] });
    expect(() => resolve({ omit: "rclnodejs" })).toThrow("native.desktop.server.omit in apps/");
    expect(() => resolve({ exclude: ["rclnodejs"] })).toThrow("native.desktop.server.exclude in apps/");
  });

  test("an app without basePaths has one target, default, with no basePath and the section's settings", () => {
    const config = new AkanAppConfig(
      app,
      [],
      packageJson,
      { native: { indexPath: "/explore", desktop: { server: true } } },
      baseDevEnv,
    );

    expect(Object.keys(config.native.targets)).toEqual(["default"]);
    expect(config.native.targets.default.basePath).toBeUndefined();
    expect(config.native.targets.default).toMatchObject({ indexPath: "/explore", desktop: { server: true } });
  });

  test("a platform section may name its own indexPath, normalized like the section's", () => {
    const config = new AkanAppConfig(
      app,
      [],
      packageJson,
      {
        native: {
          indexPath: "/mobile",
          ios: { indexPath: "cockpit/" },
          desktop: { indexPath: " / ", server: true },
        },
      },
      baseDevEnv,
    );

    expect(config.native.targets.default).toMatchObject({
      indexPath: "/mobile",
      ios: { indexPath: "/cockpit" },
      desktop: { indexPath: "/", server: true },
    });
    expect(config.native.targets.default.android).toBeUndefined();
  });

  test("a target takes the native section with its own fields over it: objects merge, lists and values replace", () => {
    const config = new AkanAppConfig(
      app,
      [],
      packageJson,
      {
        native: {
          fileName: "portal",
          plugins: ["iap"],
          ios: { infoPlist: { ITSAppUsesNonExemptEncryption: false }, files: { "sound.caf": "assets/sound.caf" } },
          android: {
            manifest: ["<queries/>"],
            googleServices: "secrets/google-services.json",
            files: { "res/raw/chime.mp3": "assets/chime.mp3" },
          },
          targets: {
            default: {
              plugins: ["share"],
              ios: { files: { "extra.caf": "assets/extra.caf" } },
              android: { manifest: ["<uses-feature/>"] },
            },
          },
        },
      },
      baseDevEnv,
    );

    expect(config.native.targets.default).toMatchObject({
      fileName: "portal",
      plugins: ["share"],
      ios: {
        infoPlist: { ITSAppUsesNonExemptEncryption: false },
        files: { "sound.caf": "assets/sound.caf", "extra.caf": "assets/extra.caf" },
      },
      android: {
        manifest: ["<uses-feature/>"],
        googleServices: "secrets/google-services.json",
        files: { "res/raw/chime.mp3": "assets/chime.mp3" },
      },
    });
  });

  test("gives every target the section's updates, a target overriding a field", () => {
    const updates = { url: "https://releases.example.com/portal", publicKey: "key=" };
    const config = new AkanAppConfig(
      app,
      [],
      packageJson,
      { native: { updates, targets: { default: {}, pilot: { updates: { channel: "pilot" } } } } },
      baseDevEnv,
    );

    expect(config.native.targets.default.updates).toEqual(updates);
    expect(config.native.targets.pilot.updates).toEqual({ ...updates, channel: "pilot" });
    expect(
      () =>
        new AkanAppConfig(
          app,
          [],
          packageJson,
          { native: { targets: { pilot: { updates: { channel: "pilot" } } } } },
          baseDevEnv,
        ),
    ).toThrow("native.targets.pilot.updates in apps/portal/akan.config.ts has no url or publicKey");
    expect(
      () => new AkanAppConfig(app, [], packageJson, { native: { updates: { channel: "pilot" } } }, baseDevEnv),
    ).toThrow("native.updates in apps/portal/akan.config.ts has no url or publicKey.");
  });

  test("merges the desktop settings field by field, the target winning", () => {
    const config = new AkanAppConfig(
      app,
      [],
      packageJson,
      {
        native: {
          desktop: { recovery: "reload", window: { fullscreen: true } },
          targets: { default: { desktop: { window: { skipTaskbar: true } } } },
        },
      },
      baseDevEnv,
    );

    expect(config.native.targets.default.desktop).toEqual({
      recovery: "reload",
      window: { fullscreen: true, skipTaskbar: true },
    });
  });

  test("merges the section's push and privacy into each target field by field; an icon object is one value", () => {
    const publicKey = Buffer.alloc(32, 7).toString("base64");
    const config = new AkanAppConfig(
      app,
      [],
      packageJson,
      {
        native: {
          updates: { url: "https://updates.example.com/portal", publicKey },
          icon: { image: "assets/icon.png", backgroundColor: "#000000" },
          android: { push: { color: "#ff5a5f" } },
          ios: { privacy: { tracking: false } },
          targets: {
            default: {},
            beta: {
              updates: { channel: "beta" },
              icon: { image: "assets/beta.png" },
              android: { push: { smallIcon: "assets/noti.png" } },
            },
          },
        },
      },
      baseDevEnv,
    );

    expect(config.native.targets.default.updates).toEqual({ url: "https://updates.example.com/portal", publicKey });
    expect(config.native.targets.beta).toMatchObject({
      updates: { url: "https://updates.example.com/portal", publicKey, channel: "beta" },
      android: { push: { color: "#ff5a5f", smallIcon: "assets/noti.png" } },
      ios: { privacy: { tracking: false } },
    });
    expect(config.native.targets.beta.icon).toEqual({ image: "assets/beta.png" });
  });

  test("refuses `mobile` and every setting that moved, naming where it went", () => {
    const make = (config: Record<string, unknown>) => () =>
      new AkanAppConfig(app, [], packageJson, config as never, baseDevEnv);

    expect(make({ mobile: { appName: "portal" } })).toThrow("declares `mobile`, which is now `native`");
    expect(make({ native: { assets: { icon: "assets/icon.png" } } })).toThrow(
      "native.assets in apps/portal/akan.config.ts has moved: icon and splash sit directly in the native section.",
    );
    expect(make({ native: { targets: { default: { native: { desktop: { server: true } } } } } })).toThrow(
      "native.targets.default.native in apps/portal/akan.config.ts has moved",
    );
    expect(make({ native: { files: { "ios/sound.caf": "assets/sound.caf" } } })).toThrow(
      "native.files in apps/portal/akan.config.ts has moved: ios.files",
    );
    expect(make({ native: { deepLinks: { ios: { teamId: "TEAMID" } } } })).toThrow(
      "native.deepLinks.ios in apps/portal/akan.config.ts has moved: ios.teamId.",
    );
    expect(make({ native: { android: { files: { "App/x.json": "x.json" } } } })).toThrow(
      'native.android.files["App/x.json"] in apps/portal/akan.config.ts must land at res/<type>/<file> or assets/<path>.',
    );
    expect(make({ native: { targets: { kiosk: { ios: { files: { "../x.caf": "x.caf" } } } } } })).toThrow(
      'native.targets.kiosk.ios.files["../x.caf"] in apps/portal/akan.config.ts must land at <path in the app bundle>.',
    );
    expect(make({ native: { ios: { scheme: "App" } } })).toThrow(
      "native.ios.scheme in apps/portal/akan.config.ts is not a native setting",
    );
    expect(make({ native: { server: { url: "http://x" } } })).toThrow(
      "native.server in apps/portal/akan.config.ts is not a native setting",
    );
    expect(make({ native: { desktop: { dmg: { backgroundImage: "bg.png" } } } })).toThrow(
      "native.desktop.dmg.backgroundImage in apps/portal/akan.config.ts is not a native setting",
    );
  });

  test("derives a repo-scoped default appId and records an explicit native section", () => {
    const withoutNative = new AkanAppConfig(app, [], packageJson, {}, baseDevEnv);
    expect(withoutNative.native.appId).toBe("com.akanjs.portal");
    expect(withoutNative.hasNativeConfig).toBe(false);

    const withNative = new AkanAppConfig(app, [], packageJson, { native: { version: "2.0.0" } }, baseDevEnv);
    expect(withNative.native.appId).toBe("com.akanjs.portal");
    expect(withNative.hasNativeConfig).toBe(true);
  });
});

describe("deriveDefaultAppId", () => {
  test("sanitizes org/app names into a valid reverse-DNS bundle id", () => {
    expect(deriveDefaultAppId("my-org", "myapp")).toBe("com.myorg.myapp");
    expect(deriveDefaultAppId("Acme Corp", "Store")).toBe("com.acmecorp.store");
    // Empty org and digit-leading segments stay valid package identifiers.
    expect(deriveDefaultAppId("", "app")).toBe("com.app.app");
    expect(deriveDefaultAppId("123repo", "9app")).toBe("com.app123repo.app9app");
  });
});

describe("AkanAppConfig lib externalLibs", () => {
  test("merges lib-declared external libs into the app's own, deduped", () => {
    const libAwarePackageJson: PackageJson = {
      ...packageJson,
      dependencies: { ...packageJson.dependencies, puppeteer: "24.0.0" },
    };
    const config = new AkanAppConfig(
      app,
      ["shared"],
      libAwarePackageJson,
      { externalLibs: ["@external/runtime"] },
      baseDevEnv,
      [],
      { externalLibs: ["@external/runtime", "puppeteer"], docker: { preRuns: [], postRuns: [] } },
    );

    expect(config.externalLibs).toEqual(["@external/runtime", "puppeteer"]);
    expect(config.getProductionPackageJson().dependencies).toMatchObject({
      "@external/runtime": "2.0.0",
      puppeteer: "24.0.0",
    });
  });

  test("reads them off every workspace lib config on load", async () => {
    const config = await loadExtAppConfig(
      "akan-config-libext-",
      "export default { externalLibs: ['shiki'] };\n",
      "export default { externalLibs: ['puppeteer'] };\n",
    );

    expect(config.externalLibs).toEqual(["shiki", "puppeteer"]);
  });
});

describe("AkanAppConfig lib docker runs", () => {
  const libDocker = (preRuns: string[], postRuns: string[] = []) => ({
    externalLibs: [],
    docker: { preRuns, postRuns },
  });

  test("runs lib steps before the app's own, deduped", () => {
    const config = new AkanAppConfig(
      app,
      ["shared"],
      packageJson,
      { docker: { preRuns: ["apt-get install -y ffmpeg", "echo app"], postRuns: ["echo app-post"] } },
      baseDevEnv,
      [],
      libDocker(["apt-get install -y ffmpeg", "echo lib"], ["echo lib-post"]),
    );

    expect(config.docker).toMatchObject({
      preRuns: ["apt-get install -y ffmpeg", "echo lib", "echo app"],
      postRuns: ["echo lib-post", "echo app-post"],
    });
    expect(config.dockerfile).toContain("RUN echo lib\nRUN echo app\n");
    expect(config.dockerfile.match(/RUN apt-get install -y ffmpeg/g)).toHaveLength(1);
  });

  test("drops them when the app hands over a whole Dockerfile", () => {
    const config = new AkanAppConfig(
      app,
      ["shared"],
      packageJson,
      { docker: "FROM scratch" },
      baseDevEnv,
      [],
      libDocker(["echo lib"]),
    );

    expect(config.dockerfile).toBe("FROM scratch");
  });

  test("reads them off every workspace lib config on load", async () => {
    const config = await loadExtAppConfig(
      "akan-config-libdocker-",
      "export default {};\n",
      "export default { docker: { preRuns: ['echo from-lib'], postRuns: [{ arm64: 'echo arm-only' }] } };\n",
    );

    expect(config.dockerfile).toContain("RUN echo from-lib");
    expect(config.dockerfile).toContain('RUN if [ "$TARGETARCH" = "arm64"');
  });
});

describe("AkanAppConfig trustedDependencies and bin", () => {
  const sha256 = "b".repeat(64);
  const libBin = { ffmpeg: { "linux-x64": { url: "https://files.test/ffmpeg.tar.xz", sha256, file: "bin/ffmpeg" } } };

  test("the production package.json trusts the app's and its libs' packages, and nothing when none are named", () => {
    const withTrusted = new AkanAppConfig(
      app,
      [],
      packageJson,
      { trustedDependencies: [" rclnodejs ", "sharp"] },
      baseDevEnv,
      [],
      {
        externalLibs: [],
        trustedDependencies: ["sharp", "@serialport/bindings-cpp"],
        docker: { preRuns: [], postRuns: [] },
      },
    );
    expect(withTrusted.getProductionPackageJson().trustedDependencies).toEqual([
      "rclnodejs",
      "sharp",
      "@serialport/bindings-cpp",
    ]);
    expect(new AkanAppConfig(app, [], packageJson, {}, baseDevEnv).getProductionPackageJson()).not.toHaveProperty(
      "trustedDependencies",
    );
    expect(() => new AkanAppConfig(app, [], packageJson, { trustedDependencies: [""] }, baseDevEnv)).toThrow(
      "apps/portal/akan.config.ts: trustedDependencies lists package names",
    );
  });

  test("keeps the app's bin apart from each lib's, with paths made absolute where they were declared", () => {
    const config = new AkanAppConfig(
      { name: "portal", cwdPath: "/repo/apps/portal" } as never,
      [],
      packageJson,
      { bin: { ffmpeg: { "darwin-arm64": { path: "tools/ffmpeg" } } } },
      baseDevEnv,
      [],
      { externalLibs: [], docker: { preRuns: [], postRuns: [] }, bin: [{ lib: "media", bin: libBin }] },
    );
    expect(config.bin).toEqual({
      ffmpeg: { "darwin-arm64": { path: path.resolve("/repo/apps/portal/tools/ffmpeg") } },
    });
    expect(config.libBins).toEqual([{ lib: "media", bin: libBin }]);
    expect(
      new AkanLibConfig({ name: "media", cwdPath: "/repo/libs/media" } as never, {
        bin: { ffprobe: { "linux-x64": { path: "../../tools/ffprobe" } } },
      }).bin,
    ).toEqual({ ffprobe: { "linux-x64": { path: path.resolve("/repo/tools/ffprobe") } } });
  });

  test("reads them off every workspace lib config on load", async () => {
    const config = await loadExtAppConfig(
      "akan-config-libbin-",
      "export default { trustedDependencies: ['sharp'] };\n",
      `export default { trustedDependencies: ['rclnodejs'], bin: ${JSON.stringify(libBin)} };\n`,
    );
    expect(config.trustedDependencies).toEqual(["sharp", "rclnodejs"]);
    expect(config.libBins).toEqual([{ lib: "extlib", bin: libBin }]);
  });
});

describe("AkanLibConfig", () => {
  test("uses empty external libs by default and preserves explicit libs", () => {
    const lib = { name: "shared" } as never;
    expect(new AkanLibConfig(lib, {}).externalLibs).toEqual([]);

    const config: LibConfigInput = {
      externalLibs: ["firebase-admin"],
    };
    expect(new AkanLibConfig(lib, config).externalLibs).toEqual(["firebase-admin"]);
  });

  test("defaults docker runs to empty lists and preserves declared ones", () => {
    const lib = { name: "shared" } as never;
    expect(new AkanLibConfig(lib, {}).docker).toEqual({ preRuns: [], postRuns: [] });
    expect(new AkanLibConfig(lib, { docker: { preRuns: ["echo lib"] } }).docker).toEqual({
      preRuns: ["echo lib"],
      postRuns: [],
    });
  });
});

describe("AkanAppConfig.importConfigModule", () => {
  test("busting the import cache re-evaluates an edited config module", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "akan-config-bust-"));
    try {
      const configPath = path.join(root, "akan.config.ts");
      fs.writeFileSync(configPath, "export default { basePaths: ['first'] };\n");
      const first = await AkanAppConfig.importConfigModule<{ basePaths: string[] }>(root);
      expect(first.basePaths).toEqual(["first"]);

      fs.writeFileSync(configPath, "export default { basePaths: ['second'] };\n");
      const stale = await AkanAppConfig.importConfigModule<{ basePaths: string[] }>(root);
      expect(stale.basePaths).toEqual(["first"]);

      const busted = await AkanAppConfig.importConfigModule<{ basePaths: string[] }>(root, {
        bustImportCache: true,
      });
      expect(busted.basePaths).toEqual(["second"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
