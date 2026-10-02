import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AkanAppConfig } from "../akanConfig";
import type { App } from "../commandDecorators";
import { tempDirs, writeText as write } from "../testHelpers";
import type { PackageJson } from "../types";
import { DesktopServerStage } from "./desktopServerStage";
import { NativeApi } from "./nativeApi";
import { NativeApp } from "./nativeApp";
import { NativeConfig } from "./nativeConfig";

const makeTempRoot = tempDirs("akan-desktop-server-");
const repoApp = path.resolve(import.meta.dir, "../../../../apps/minimal");
const baseDevEnv = {
  repoName: "akanjs",
  serveDomain: "akanjs.com",
  env: "debug" as const,
  portOffset: 0,
  workspaceRoot: "/w",
};
const rootPackageJson: PackageJson = {
  name: "repo",
  version: "1.0.0",
  description: "repo",
  dependencies: { "@external/runtime": "2.0.0", pg: "8.0.0", rclnodejs: "1.0.0" },
};
const appConfig = (config: object = {}) =>
  new AkanAppConfig({ name: "portal" } as never, [], rootPackageJson, config, baseDevEnv);

describe("DesktopServerStage", () => {
  test("starts from the image's env, as an API-only edge server on SQLite that the launcher gives a port", () => {
    const env = DesktopServerStage.env(appConfig({ database: { modes: ["single", "cluster"] } }), "main");

    expect(env).toMatchObject({
      NODE_ENV: "production",
      AKAN_PUBLIC_APP_NAME: "portal",
      AKAN_PUBLIC_ENV: "main",
      AKAN_PUBLIC_OPERATION_MODE: "edge",
      AKAN_DATABASE_MODE: "single",
      AKAN_DATABASE_MODES: "single",
      AKAN_SSR: "false",
      AKAN_CSR: "false",
      AKAN_MCP: "false",
      AKAN_SHUTDOWN_TIMEOUT_MS: "1000",
    });
    expect(env.PORT).toBeUndefined();
    expect(env.AKAN_LOG_TO_FILE).toBeUndefined();
  });

  test("installs what the image does, minus the RSC renderer and the other modes' drivers", () => {
    const config = appConfig({ database: { modes: ["single", "cluster"] }, externalLibs: ["@external/runtime"] });
    const built = config.getProductionPackageJson();
    const drivers = config.getDatabaseModeRuntimePackages("cluster");

    const { dependencies } = DesktopServerStage.packageJson(config, built);

    expect(Object.keys(dependencies ?? {}).sort()).toEqual(["@external/runtime", "react", "react-dom"]);
    for (const driver of drivers) expect(Object.keys(built.dependencies ?? {})).toContain(driver);
  });

  test("leaves out what desktop.server.omit names, an external lib included, while the image keeps it", () => {
    const config = appConfig({ externalLibs: ["rclnodejs", "@external/runtime"] });
    const built = config.getProductionPackageJson();

    const { dependencies } = DesktopServerStage.packageJson(config, built, ["rclnodejs"]);

    expect(Object.keys(dependencies ?? {})).toContain("@external/runtime");
    expect(Object.keys(dependencies ?? {})).not.toContain("rclnodejs");
    expect(Object.keys(config.getProductionPackageJson().dependencies ?? {})).toContain("rclnodejs");
  });

  test("keeps the image's trusted packages, so their install scripts run in the app's server too", () => {
    const config = appConfig({ trustedDependencies: ["@external/runtime"], externalLibs: ["@external/runtime"] });
    expect(DesktopServerStage.packageJson(config, config.getProductionPackageJson()).trustedDependencies).toEqual([
      "@external/runtime",
    ]);
  });

  test("says what the image installs that the desktop app's server goes without", () => {
    const notice = (docker: unknown, carried: string[] = []) =>
      DesktopServerStage.imageStepsNotice({ app: { name: "portal" }, docker } as never, carried);
    const steps = { image: "oven/bun", preRuns: ["apt-get install -y ffmpeg"], postRuns: [], command: [] };
    expect(notice({ ...steps, preRuns: [] })).toBeNull();
    expect(notice(steps)).toEqual({
      level: "warn",
      message: expect.stringContaining(
        "The image runs 1 docker step from the app and its libs, and a desktop app's server runs none of them",
      ),
    });
    expect(notice("FROM ros:humble-ros-core")?.message).toStartWith(
      "apps/portal/akan.config.ts writes its own Dockerfile",
    );
    expect(notice(steps, ["ffmpeg"])).toEqual({
      level: "info",
      message: expect.stringContaining("carries only bin: ffmpeg"),
    });
  });

  const stageApp = async (spawn: (...args: unknown[]) => Promise<string> = async () => "") => {
    const root = await makeTempRoot();
    const dist = path.join(root, "dist/apps/portal");
    const config = appConfig();
    const app = {
      cwdPath: path.join(root, "apps/portal"),
      dist: { cwdPath: dist },
      getConfig: async () => config,
      getScanInfo: () => ({ getLibs: () => [] }),
      logger: { info: () => undefined, warn: () => undefined },
      spawn,
    } as unknown as App;
    return { dist, app, stage: new DesktopServerStage(app) };
  };

  test("carries everything the backend build wrote beside main.js but what only the image reads", async () => {
    const { dist, stage } = await stageApp();
    const carried = [
      "main.js",
      "server.js",
      "chunk-5eap2n9b.js",
      "akan.build.json",
      "better-sqlite3-a1b2c3d4.node",
      "engine-e5f6a7b8.wasm",
      "model-c9d0e1f2.bin",
      "private/service-account.json",
    ];
    const imageOnly = [
      "Dockerfile",
      "package.json",
      "rscWorker.js",
      "console.js",
      "console-runtime.js",
      "csr/index.html",
      "public/favicon.ico",
      ".akan/artifact/base-artifact.json",
    ];
    for (const file of [...carried, ...imageOnly]) await write(path.join(dist, file), file);

    await stage.prepare("main");

    const staged = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: stage.dir, dot: true }));
    expect(staged.map((file) => file.split(path.sep).join("/")).sort()).toEqual(carried.sort());
    expect(await Bun.file(path.join(stage.dir, "better-sqlite3-a1b2c3d4.node")).text()).toBe(
      "better-sqlite3-a1b2c3d4.node",
    );
  });

  test("installs from the config alone, offline when Bun's cache holds the packages", async () => {
    const spawned: unknown[][] = [];
    const { stage } = await stageApp(async (...args) => {
      spawned.push(args);
      return "";
    });

    await stage.install();

    expect(spawned).toEqual([[process.execPath, ["install", "--production", "--prefer-offline"], { cwd: stage.dir }]]);
    const installed = (await Bun.file(path.join(stage.dir, "package.json")).json()) as PackageJson;
    expect(Object.keys(installed.dependencies ?? {}).sort()).toEqual(["react", "react-dom"]);
  });

  test("an omitted package another dependency still installs stops the stage, naming who needs it", async () => {
    const installing =
      (pulled: boolean) =>
      async (...args: unknown[]) => {
        const nodeModules = path.join((args[2] as { cwd: string }).cwd, "node_modules");
        await write(path.join(nodeModules, "react/package.json"), JSON.stringify({ name: "react" }));
        if (pulled) {
          await write(path.join(nodeModules, "rclnodejs/package.json"), JSON.stringify({ name: "rclnodejs" }));
          await write(
            path.join(nodeModules, "@robot/bridge/package.json"),
            JSON.stringify({ name: "@robot/bridge", dependencies: { rclnodejs: "^1" } }),
          );
        }
        return "";
      };
    await (await stageApp(installing(false))).stage.install(undefined, ["rclnodejs"]);
    await expect((await stageApp(installing(true))).stage.install(undefined, ["rclnodejs"])).rejects.toThrow(
      "another dependency still installs: rclnodejs (needed by @robot/bridge)",
    );
  });

  test("installs another CPU's optional packages for that CPU", () => {
    const other = process.arch === "arm64" ? "x64" : "arm64";
    expect(DesktopServerStage.installArgs()).toEqual(["install", "--production", "--prefer-offline"]);
    expect(DesktopServerStage.installArgs(process.arch as "arm64" | "x64")).toEqual([
      "install",
      "--production",
      "--prefer-offline",
    ]);
    expect(DesktopServerStage.installArgs(other)).toEqual([
      "install",
      "--production",
      "--prefer-offline",
      `--cpu=${other}`,
    ]);
  });

  test("an install that fails says it needs the registry or a Bun cache that holds the packages", async () => {
    const { stage } = await stageApp(async () => {
      throw new Error("error: GET https://registry.npmjs.org/scheduler - ConnectionRefused");
    });

    const failed = stage.install();

    await expect(failed).rejects.toThrow(
      "it needs the npm registry, or a Bun cache that already holds every one of them.\nerror: GET https://registry.npmjs.org/scheduler",
    );
  });

  test("refuses an app whose database modes leave out single", () => {
    expect(() => DesktopServerStage.assertCarriable(appConfig({ database: { modes: ["cluster"] } }))).toThrow(
      "only database mode single runs",
    );
    expect(() =>
      DesktopServerStage.assertCarriable(appConfig({ database: { modes: ["single", "cluster"] } })),
    ).not.toThrow();
  });

  test("the runtime accepts a desktop config that carries the server, with single-instance on", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "web"), { recursive: true });
    await writeFile(path.join(root, "web/index.html"), "<html><head></head><body></body></html>");
    await mkdir(path.join(root, "server"), { recursive: true });
    await writeFile(path.join(root, "server/main.js"), "");
    const server = { dir: path.join(root, "server"), entry: "main.js", env: { AKAN_PUBLIC_ENV: "main" } };

    const { config } = NativeConfig.build({
      appPath: root,
      target: { name: "default", appName: "Portal", appId: "com.portal.app", version: "1.0.0", buildNum: 1 },
      webDir: path.join(root, "web"),
      contributions: [],
      locales: ["en"],
      platform: "macos",
      desktopServer: server,
    });

    expect(config.plugins).toContain("single-instance");
    expect(config.desktop).toEqual({ server });
    expect((await NativeApi.load(repoApp)).validateConfig(config, { appDir: root })).toEqual([]);
  });

  test("a phone build cannot carry the server", async () => {
    const app = new NativeApp({ cwdPath: "/repo/apps/portal" } as never, {
      name: "default",
      config: { name: "default", appName: "Portal", appId: "com.portal.app", version: "1.0.0", buildNum: 1 },
    });
    const server = { dir: "/tmp/server", entry: "main.js", env: {} };
    await expect(app.build("ios", { server })).rejects.toThrow("Only a desktop app carries its server");
    await expect(app.run("android", { server })).rejects.toThrow("Only a desktop app carries its server");
  });
});
