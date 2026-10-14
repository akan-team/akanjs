import { describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AppExecutor } from "@akanjs/devkit/executors";

const built: { environment?: string; publicEnv?: string }[] = [];
let buildFails = true;
mock.module("@akanjs/devkit/applicationBuildRunner", () => ({
  ApplicationBuildRunner: class {
    constructor(
      _app: unknown,
      readonly options: { environment?: string } = {},
    ) {}
    async build() {
      built.push({ environment: this.options.environment, publicEnv: process.env.AKAN_PUBLIC_ENV });
      if (buildFails) throw new Error("built");
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
  workspace: { workspaceRoot: "/repo" },
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

  test("pack-update drops the previous pack's record before it builds, so a failed build leaves none behind", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "akan-pack-update-"));
    try {
      for (const name of ["pack.json", "compat.json", "manifest.template.json"])
        await Bun.write(path.join(out, name), "{}");
      await expect(new ApplicationRunner().packUpdate(app, "android", { out })).rejects.toThrow("built");
      expect(await Bun.file(path.join(out, "pack.json")).exists()).toBe(false);
      expect(await Bun.file(path.join(out, "compat.json")).exists()).toBe(false);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  test("pack-update records a pack its --against check refuses, then exits 2", async () => {
    const out = await mkdtemp(path.join(tmpdir(), "akan-pack-update-"));
    buildFails = false;
    const pack = { schema: 1 as const, app: "demo", target: "default", platform: "android" as const, out };
    const packed = spyOn(NativeApp.prototype, "packUpdate").mockResolvedValue({ pack } as never);
    const compared = spyOn(NativeApp, "compareBundles").mockResolvedValue({
      compatible: false,
      problems: ["deepLinks differ"],
    });
    const logged = { ...app, logger: { info: () => undefined } } as unknown as AppExecutor;
    try {
      const refusal = await new ApplicationRunner()
        .packUpdate(logged, "android", { out, against: "store/bundle.json" })
        .catch((error: unknown) => error);
      expect(refusal).toMatchObject({
        exitCode: 2,
        message: `The pack in ${out} needs a new store build; it differs from the one store/bundle.json came from:\n- deepLinks differ`,
      });
      const compat = { against: "store/bundle.json", compatible: false, problems: ["deepLinks differ"] };
      expect(await Bun.file(path.join(out, "compat.json")).json()).toEqual(compat);
      expect(await Bun.file(path.join(out, "pack.json")).json()).toMatchObject({ app: "demo", compat });
    } finally {
      buildFails = true;
      packed.mockRestore();
      compared.mockRestore();
      await rm(out, { recursive: true, force: true });
    }
  });
});
