import { describe, expect, mock, test } from "bun:test";
import type { AppExecutor } from "@akanjs/devkit/executors";

const built: { environment?: string; publicEnv?: string }[] = [];
mock.module("@akanjs/devkit/applicationBuildRunner", () => ({
  ApplicationBuildRunner: class {
    constructor(
      _app: unknown,
      readonly options: { environment?: string } = {},
    ) {}
    async build() {
      built.push({ environment: this.options.environment, publicEnv: process.env.AKAN_PUBLIC_ENV });
      throw new Error("built");
    }
  },
}));
const { ApplicationRunner } = await import("./application.runner");
const { NativeApp } = await import("@akanjs/devkit/mobile");
//? What publish-update refuses before building is application.test.ts's; here the build itself is the point.
NativeApp.prototype.assertPublishable = async () => undefined;

const target = { name: "default", appName: "Demo", appId: "com.demo.app", version: "1.0.0", buildNum: 1 };
const app = {
  name: "demo",
  cwdPath: "/repo/apps/demo",
  getConfig: async () => ({
    app: { name: "demo" },
    basePaths: new Set<string>(),
    database: { modes: ["single"] },
    native: { targets: { default: target } },
  }),
} as unknown as AppExecutor;

describe("ApplicationRunner mobile builds", () => {
  //? Without `environment` the build reads the root .env's AKAN_PUBLIC_ENV, and a carried server ships only that env.
  test("the backend of a mobile or desktop build is built for the command's --env", async () => {
    const runner = new ApplicationRunner();
    const shellEnv = process.env.AKAN_PUBLIC_ENV;
    await expect(runner.buildDesktop(app, { env: "develop" })).rejects.toThrow("built");
    await expect(runner.publishUpdate(app, "desktop", { env: "main" })).rejects.toThrow("built");
    await expect(runner.releaseIos(app, { env: "debug" })).rejects.toThrow("built");
    await expect(runner.startDesktop(app, { operation: "release", env: "local" })).rejects.toThrow("built");
    expect(built).toEqual([
      { environment: "develop", publicEnv: "develop" },
      { environment: "main", publicEnv: "main" },
      { environment: "debug", publicEnv: "debug" },
      { environment: "local", publicEnv: "local" },
    ]);
    expect(process.env.AKAN_PUBLIC_ENV).toBe(shellEnv);
  });
});
