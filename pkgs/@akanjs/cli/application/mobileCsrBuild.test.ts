import { describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AppExecutor } from "@akanjs/devkit/executors";

const built: { environment?: string; budget?: string; publicEnv?: string }[] = [];
let buildFails = true;
let afterBuild: (() => Promise<void>) | null = null;
mock.module("@akanjs/devkit/app/applicationBuildRunner", () => ({
  ApplicationBuildRunner: class {
    constructor(
      _app: unknown,
      readonly options: { environment?: string; budget?: string } = {},
    ) {}
    async build() {
      built.push({
        environment: this.options.environment,
        budget: this.options.budget,
        publicEnv: process.env.AKAN_PUBLIC_ENV,
      });
      if (buildFails) throw new Error("built");
      await afterBuild?.();
    }
  },
}));
const { ApplicationRunner } = await import("./application.runner");
const { NativeApp, NativePublicEnv } = await import("@akanjs/devkit/mobile");
const { CsrArtifactBuilder } = await import("@akanjs/devkit/frontendBuild/csrArtifactBuilder");
const { WorkspaceExecutor } = await import("@akanjs/devkit/executors");
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
  test("the backend of a mobile or desktop build is built for the command's --env, with no route JS budget", async () => {
    const runner = new ApplicationRunner();
    const shellEnv = process.env.AKAN_PUBLIC_ENV;
    await expect(runner.buildDesktop(app, { env: "develop" })).rejects.toThrow("built");
    await expect(runner.publishUpdate(app, "desktop", { env: "main" })).rejects.toThrow("built");
    await expect(runner.releaseIos(app, { env: "debug" })).rejects.toThrow("built");
    await expect(runner.startDesktop(app, { operation: "release", env: "local" })).rejects.toThrow("built");
    expect(built).toEqual([
      { environment: "develop", budget: "off", publicEnv: "develop" },
      { environment: "main", budget: "off", publicEnv: "main" },
      { environment: "debug", budget: "off", publicEnv: "debug" },
      { environment: "local", budget: "off", publicEnv: "local" },
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

  describe("the public env a pack inlines", () => {
    const recorded = {
      AKAN_PUBLIC_ENV: "main",
      AKAN_PUBLIC_REPO_NAME: "softs2",
      AKAN_PUBLIC_SERVE_DOMAIN: "akamir.com",
    };
    const bundleOf = (publicEnv: Record<string, string>) =>
      JSON.stringify({ schema: 1, web: { hash: "w", files: 1, publicEnv } });
    //? The build inlines the AKAN_PUBLIC_* on process.env, less the ports and operation mode prepareCommand drops.
    const packing = async (extra: Record<string, string> = {}) => {
      const root = await mkdtemp(path.join(tmpdir(), "akan-pack-env-"));
      const saved = { ...process.env };
      const seen: Record<string, string>[] = [];
      const packApp = {
        ...app,
        dist: { cwdPath: path.join(root, "dist") },
        logger: { info: () => undefined },
      } as unknown as AppExecutor;
      buildFails = false;
      afterBuild = async () => {
        const { AKAN_PUBLIC_OPERATION_MODE: _mode, ...publicEnv } = { ...NativePublicEnv.of(process.env), ...extra };
        seen.push(publicEnv);
        await CsrArtifactBuilder.writePublicEnv(
          packApp,
          Object.fromEntries(
            Object.entries(publicEnv).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)]),
          ),
        );
      };
      const out = path.join(root, "out");
      const packed = spyOn(NativeApp.prototype, "packUpdate").mockImplementation(async () => {
        await Bun.write(path.join(out, "bundle.json"), bundleOf(seen[0] ?? {}));
        return { pack: { schema: 1, app: "demo", target: "default", platform: "android", out } } as never;
      });
      const compared = spyOn(NativeApp, "compareBundles").mockResolvedValue({ compatible: true, problems: [] });
      const against = path.join(root, "store/bundle.json");
      await Bun.write(against, bundleOf(recorded));
      const done = async () => {
        buildFails = true;
        afterBuild = null;
        packed.mockRestore();
        compared.mockRestore();
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
        WorkspaceExecutor.publicEnvPin = null;
        await rm(root, { recursive: true, force: true });
      };
      return { packApp, out, against, seen, done };
    };

    test("repeats what its --against store build recorded, and not the shell's or .env's other values", async () => {
      const { packApp, out, against, seen, done } = await packing();
      Object.assign(process.env, { AKAN_PUBLIC_SERVE_DOMAIN: "try.akanjs.com", AKAN_PUBLIC_LOG_LEVEL: "debug" });
      try {
        await new ApplicationRunner().packUpdate(packApp, "android", { out, against });
        expect(seen).toEqual([recorded]);
        expect(await Bun.file(path.join(out, "compat.json")).json()).toMatchObject({ compatible: true, problems: [] });
      } finally {
        await done();
      }
    });

    test("refuses an --env the public env disagrees with before it builds", async () => {
      const { packApp, out, against, seen, done } = await packing();
      try {
        await expect(
          new ApplicationRunner().packUpdate(packApp, "android", { out, env: "develop", publicEnv: against }),
        ).rejects.toThrow("--env develop differs from the public env's AKAN_PUBLIC_ENV main");
        expect(seen).toEqual([]);
      } finally {
        await done();
      }
    });

    test("fails when the build inlined other values than the ones pinned", async () => {
      const { packApp, out, against, done } = await packing({ AKAN_PUBLIC_EXTRA: "1" });
      try {
        await expect(
          new ApplicationRunner().packUpdate(packApp, "android", { out, publicEnv: against }),
        ).rejects.toThrow("The web build inlined other values than --public-env gave for AKAN_PUBLIC_EXTRA");
      } finally {
        await done();
      }
    });
  });
});
