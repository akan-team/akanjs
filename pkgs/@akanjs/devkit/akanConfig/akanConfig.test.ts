import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppExecutor, WorkspaceExecutor } from "../executors";
import type { PackageJson } from "../types";
import { AkanAppConfig, AkanLibConfig, deriveDefaultAppId } from "./akanConfig";
import type { DeepPartial, LibConfigResult } from "./types";

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

describe("AkanAppConfig", () => {
  test("applies defaults for route domains, i18n, image, mobile, and imports", () => {
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
    expect(config.mobile).toMatchObject({
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
        mobile: {
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
    expect(config.mobile.buildNum).toBe(7);
    expect(config.mobile.targets.default).toMatchObject({
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

  test("refuses a csr-less build that ships a mobile app", () => {
    expect(
      () => new AkanAppConfig(app, [], packageJson, { web: { csr: false }, mobile: { appName: "portal" } }, baseDevEnv),
    ).toThrow("the Capacitor build ships that bundle");
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
    const singleConfig = new AkanAppConfig(app, [], packageJson, { defaultDatabaseMode: "single" }, baseDevEnv);
    const multipleConfig = new AkanAppConfig(app, [], packageJson, { defaultDatabaseMode: "multiple" }, baseDevEnv);
    const clusterConfig = new AkanAppConfig(app, [], packageJson, { defaultDatabaseMode: "cluster" }, baseDevEnv);

    expect(singleConfig.getProductionPackageJson().dependencies).not.toHaveProperty("ioredis");
    expect(singleConfig.getProductionPackageJson().dependencies).not.toHaveProperty("bullmq");
    expect(singleConfig.getProductionPackageJson().dependencies).not.toHaveProperty("@libsql/client");
    expect(singleConfig.getProductionPackageJson().dependencies).not.toHaveProperty("postgres");
    expect(singleConfig.getProductionPackageJson().dependencies).not.toHaveProperty("protobufjs");

    expect(multipleConfig.getProductionPackageJson().dependencies).toMatchObject({
      "@libsql/client": runtimeDependencies["@libsql/client"],
      bullmq: runtimeDependencies.bullmq,
      ioredis: runtimeDependencies.ioredis,
      protobufjs: runtimeDependencies.protobufjs,
    });
    expect(multipleConfig.getProductionPackageJson().dependencies).not.toHaveProperty("postgres");

    expect(clusterConfig.getProductionPackageJson().dependencies).toMatchObject({
      bullmq: runtimeDependencies.bullmq,
      ioredis: runtimeDependencies.ioredis,
      postgres: runtimeDependencies.postgres,
      protobufjs: runtimeDependencies.protobufjs,
    });
    expect(clusterConfig.getProductionPackageJson().dependencies).not.toHaveProperty("@libsql/client");
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
    expect(config.getDatabaseModeRuntimePackages("multiple")).toEqual([
      "@libsql/client",
      "bullmq",
      "ioredis",
      "protobufjs",
    ]);
    expect(config.getDatabaseModeRuntimePackages("cluster")).toEqual(["bullmq", "ioredis", "postgres", "protobufjs"]);
    expect(config.getMissingDatabaseModeDependencySpecs("multiple")).toEqual([
      `@libsql/client@${runtimeDependencies["@libsql/client"]}`,
      `protobufjs@${runtimeDependencies.protobufjs}`,
    ]);
    expect(config.getMissingDatabaseModeDependencySpecs("cluster")).toEqual([
      `postgres@${runtimeDependencies.postgres}`,
      `protobufjs@${runtimeDependencies.protobufjs}`,
    ]);
    // The workspace-root install covers the toolchain/runtime plus every app Capacitor plugin
    // (deduped — "@capacitor/core" appears in both source lists).
    const expectedMobilePackages: string[] = [
      "@capacitor/cli",
      "@capacitor/core",
      "@capacitor/ios",
      "@capacitor/android",
      "@capacitor/assets",
      "@capacitor/app",
      "@capacitor/browser",
      "@capacitor/camera",
      "@capacitor/device",
      "@capacitor/geolocation",
      "@capacitor/haptics",
      "@capacitor/inappbrowser",
      "@capacitor/keyboard",
      "@capacitor/preferences",
      "@capacitor/push-notifications",
      "capacitor-plugin-safe-area",
    ];
    expect(config.getMobileRuntimePackages() as string[]).toEqual(expectedMobilePackages);
    expect(config.getMissingMobileDependencySpecs()).toEqual(
      expectedMobilePackages.map((lib) => `${lib}@${runtimeDependencies[lib as keyof typeof runtimeDependencies]}`),
    );
    expect(config.getMobileAppCapacitorPlugins()).toEqual([
      "@capacitor/app",
      "@capacitor/browser",
      "@capacitor/camera",
      "@capacitor/core",
      "@capacitor/device",
      "@capacitor/geolocation",
      "@capacitor/haptics",
      "@capacitor/inappbrowser",
      "@capacitor/keyboard",
      "@capacitor/preferences",
      "@capacitor/push-notifications",
      "capacitor-plugin-safe-area",
    ]);
  });

  test("normalizes multiple mobile targets and validates base paths", () => {
    const config = new AkanAppConfig(
      app,
      [],
      packageJson,
      {
        routes: [{ basePath: "admin", domains: {} }],
        mobile: {
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
              deepLinks: {
                schemes: ["portal-admin", "portal-admin"],
                domains: ["https://Portal.Admin/"],
                ios: { teamId: " TEAMID " },
                android: { sha256CertFingerprints: ["AA:BB", "AA:BB"] },
              },
            },
          },
        },
      },
      baseDevEnv,
    );

    expect(config.mobile.targets.admin).toMatchObject({
      name: "admin",
      basePath: "admin",
      indexPath: "/admin/home",
      appName: "Portal Admin",
      appId: "com.portal.admin",
      version: "1.0.0",
      buildNum: 8,
      permissions: ["camera"],
      deepLinks: {
        schemes: ["portal-admin"],
        domains: ["portal.admin"],
        ios: { teamId: "TEAMID" },
        android: { sha256CertFingerprints: ["AA:BB"] },
      },
    });

    expect(
      () =>
        new AkanAppConfig(
          app,
          [],
          packageJson,
          {
            mobile: { targets: { bad: { basePath: "missing" } } },
          },
          baseDevEnv,
        ),
    ).toThrow("unknown basePath");
  });

  test("derives a repo-scoped default appId and records explicit-mobile intent", () => {
    // No mobile section: appId defaults to the repo-scoped reverse-DNS id, and mobile is not explicit.
    const withoutMobile = new AkanAppConfig(app, [], packageJson, {}, baseDevEnv);
    expect(withoutMobile.mobile.appId).toBe("com.akanjs.portal");
    expect(withoutMobile.hasMobileConfig).toBe(false);

    // Explicit mobile section without appId still uses the repo-scoped default but marks intent.
    const withMobile = new AkanAppConfig(app, [], packageJson, { mobile: { version: "2.0.0" } }, baseDevEnv);
    expect(withMobile.mobile.appId).toBe("com.akanjs.portal");
    expect(withMobile.hasMobileConfig).toBe(true);
  });
});

describe("deriveDefaultAppId", () => {
  test("sanitizes org/app names into a valid reverse-DNS bundle id", () => {
    expect(deriveDefaultAppId("leading-flight-guidance", "myapp")).toBe("com.leadingflightguidance.myapp");
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
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "akan-config-libext-"));
    try {
      fs.mkdirSync(path.join(root, "apps/extapp"), { recursive: true });
      fs.mkdirSync(path.join(root, "libs/extlib"), { recursive: true });
      fs.writeFileSync(path.join(root, "apps/extapp/akan.config.ts"), "export default { externalLibs: ['shiki'] };\n");
      fs.writeFileSync(
        path.join(root, "libs/extlib/akan.config.ts"),
        "export default { externalLibs: ['puppeteer'] };\n",
      );
      fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "extrepo", version: "1.0.0" }));
      fs.writeFileSync(path.join(root, ".env"), "AKAN_PUBLIC_REPO_NAME=extrepo\nAKAN_PUBLIC_SERVE_DOMAIN=ext.test\n");

      const workspace = WorkspaceExecutor.fromRoot({ workspaceRoot: root, repoName: "extrepo" });
      const config = await AppExecutor.from(workspace, "extapp").getConfig();

      expect(config.externalLibs).toEqual(["shiki", "puppeteer"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "akan-config-libdocker-"));
    try {
      fs.mkdirSync(path.join(root, "apps/extapp"), { recursive: true });
      fs.mkdirSync(path.join(root, "libs/extlib"), { recursive: true });
      fs.writeFileSync(path.join(root, "apps/extapp/akan.config.ts"), "export default {};\n");
      fs.writeFileSync(
        path.join(root, "libs/extlib/akan.config.ts"),
        "export default { docker: { preRuns: ['echo from-lib'], postRuns: [{ arm64: 'echo arm-only' }] } };\n",
      );
      fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "extrepo", version: "1.0.0" }));
      fs.writeFileSync(path.join(root, ".env"), "AKAN_PUBLIC_REPO_NAME=extrepo\nAKAN_PUBLIC_SERVE_DOMAIN=ext.test\n");

      const workspace = WorkspaceExecutor.fromRoot({ workspaceRoot: root, repoName: "extrepo" });
      const config = await AppExecutor.from(workspace, "extapp").getConfig();

      expect(config.dockerfile).toContain("RUN echo from-lib");
      expect(config.dockerfile).toContain('RUN if [ "$TARGETARCH" = "arm64"');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("AkanLibConfig", () => {
  test("uses empty external libs by default and preserves explicit libs", () => {
    const lib = { name: "shared" } as never;
    expect(new AkanLibConfig(lib, {}).externalLibs).toEqual([]);

    const config: DeepPartial<LibConfigResult> = {
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
