import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AkanAppConfig } from "../akanConfig";
import { tempDirs } from "../testHelpers";
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
  dependencies: { "@external/runtime": "2.0.0", pg: "8.0.0" },
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
      AKAN_SHUTDOWN_TIMEOUT_MS: "1500",
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

  test("keeps the image's trusted packages, so their install scripts run in the app's server too", () => {
    const config = appConfig({ trustedDependencies: ["@external/runtime"], externalLibs: ["@external/runtime"] });
    expect(DesktopServerStage.packageJson(config, config.getProductionPackageJson()).trustedDependencies).toEqual([
      "@external/runtime",
    ]);
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
