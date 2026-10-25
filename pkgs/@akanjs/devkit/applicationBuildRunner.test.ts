import { describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AkanAppConfig } from "./akanConfig";
import { AKAN_BACKEND_MINIFY, AKAN_OPTIONAL_BACKEND_EXTERNALS, ApplicationBuildRunner } from "./applicationBuildRunner";
import type { App } from "./commandDecorators";
import { AppExecutor, Executor } from "./executors";
import { bundleDefine } from "./frontendBuild/bundleDefine";
import { createTempApp } from "./testHelpers";

describe("ApplicationBuildRunner", () => {
  test("externalizes Akan optional backend dependencies", () => {
    expect(AKAN_OPTIONAL_BACKEND_EXTERNALS).toEqual(
      expect.arrayContaining(["bullmq", "ioredis", "postgres", "protobufjs"]),
    );
  });

  test("keeps backend identifiers so a class names its own logger and stack frames", () => {
    expect(AKAN_BACKEND_MINIFY.identifiers).toBe(false);
    expect(AKAN_BACKEND_MINIFY.whitespace).toBe(true);
    expect(AKAN_BACKEND_MINIFY.syntax).toBe(true);
  });

  test("a bundler that mangles identifiers loses the class name a Logger reads", async () => {
    const dir = path.join(os.tmpdir(), `akan-minify-${Bun.randomUUIDv7()}`);
    const entry = path.join(dir, "entry.ts");
    await Bun.write(
      entry,
      `const serve = () => class Service { readonly name = this.constructor.name; };
export class SampleService extends serve() {}
console.info(new SampleService().name);
`,
    );
    const build = async (minify: Bun.BuildConfig["minify"]) => {
      const result = await Bun.build({ entrypoints: [entry], target: "bun", minify, outdir: path.join(dir, "out") });
      expect(result.success).toBe(true);
      const proc = Bun.spawn([process.execPath, result.outputs[0].path], { stdout: "pipe" });
      return (await new Response(proc.stdout).text()).trim();
    };
    try {
      expect(await build(AKAN_BACKEND_MINIFY)).toBe("SampleService");
      expect(await build(true)).not.toBe("SampleService");
      // Bun 1.4.2 accepts `keepNames` and ignores it; drop this expectation once it keeps the name.
      expect(await build({ whitespace: true, syntax: true, identifiers: true, keepNames: true })).not.toBe(
        "SampleService",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("an image of a --env build boots the env its server carries, not the root .env's", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akan-build-meta-"));
    const baseDevEnv = {
      repoName: "akanjs",
      serveDomain: "akanjs.com",
      env: "local" as const,
      portOffset: 0,
      workspaceRoot: root,
    };
    const config = new AkanAppConfig(
      { name: "portal" } as never,
      [],
      { name: "repo", version: "1.0.0", description: "repo" },
      {},
      baseDevEnv,
    );
    const app = {
      getConfig: async () => config,
      dist: new Executor("dist", root),
      workspace: { workspaceRoot: root },
    } as unknown as App;
    try {
      await new ApplicationBuildRunner(app, { environment: "debug" }).buildAppMeta();
      expect(await readFile(path.join(root, "Dockerfile"), "utf8")).toContain("ENV AKAN_PUBLIC_ENV=debug\n");
      await new ApplicationBuildRunner(app).buildAppMeta();
      expect(await readFile(path.join(root, "Dockerfile"), "utf8")).toContain("ENV AKAN_PUBLIC_ENV=local\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("bakes into the route bundles the env their server env is, not the shell's that the root .env outranks", async () => {
    const { root, workspace } = await createTempApp("portal");
    const shellEnv = process.env.AKAN_PUBLIC_ENV;
    const stoppedBeforePhases = (app: AppExecutor) => {
      app.prepareCommand = async () => {
        throw new Error("stopped before the phases");
      };
      return app;
    };
    const bakedEnv = (app: AppExecutor) =>
      (bundleDefine(app, "build", "ssr") as { [key: string]: string })["process.env.AKAN_PUBLIC_ENV"];
    try {
      process.env.AKAN_PUBLIC_ENV = "main";
      const app = stoppedBeforePhases(AppExecutor.from(workspace, "portal"));
      await expect(new ApplicationBuildRunner(app).build()).rejects.toThrow("stopped before the phases");
      expect(bakedEnv(app)).toBe(JSON.stringify("local"));

      process.env.AKAN_PUBLIC_ENV = "main";
      const desktop = stoppedBeforePhases(AppExecutor.from(workspace, "portal"));
      await expect(new ApplicationBuildRunner(desktop, { environment: "debug" }).build()).rejects.toThrow(
        "stopped before the phases",
      );
      expect(bakedEnv(desktop)).toBe(JSON.stringify("debug"));
    } finally {
      if (shellEnv === undefined) delete process.env.AKAN_PUBLIC_ENV;
      else process.env.AKAN_PUBLIC_ENV = shellEnv;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("bakes into the bundles every AKAN_PUBLIC_* its Dockerfile carries, and names the shell values it outranked", async () => {
    const { root, workspace } = await createTempApp("portal");
    const keys = ["AKAN_PUBLIC_ENV", "AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"] as const;
    const shellEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    await writeFile(
      path.join(root, ".env"),
      "AKAN_PUBLIC_ENV=main\nAKAN_PUBLIC_REPO_NAME=repo\nAKAN_PUBLIC_SERVE_DOMAIN=akanjs.com\n",
    );
    await Promise.all(["private", "public"].map((dir) => mkdir(path.join(root, "apps", "portal", dir))));
    Object.assign(process.env, {
      AKAN_PUBLIC_ENV: "local",
      AKAN_PUBLIC_REPO_NAME: "shell-repo",
      AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
    });
    const app = AppExecutor.from(workspace, "portal");
    const warn = spyOn(app.logger, "warn").mockImplementation(() => undefined);
    const runner = new ApplicationBuildRunner(app);
    runner.typecheck = async () => {
      throw new Error("stopped after prepare");
    };
    try {
      await expect(runner.build()).rejects.toThrow("stopped after prepare");
      const define = bundleDefine(app, "build", "csr") as { [key: string]: string };
      const imageEnv = (await app.getConfig()).getProductionEnv();
      for (const key of keys) expect(define[`process.env.${key}`]).toBe(JSON.stringify(imageEnv[key]));
      expect(imageEnv.AKAN_PUBLIC_SERVE_DOMAIN).toBe("akanjs.com");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toBe(
        "The workspace .env outranks this process's environment: the bundles and the image take AKAN_PUBLIC_ENV=main (not local), AKAN_PUBLIC_REPO_NAME=repo (not shell-repo), AKAN_PUBLIC_SERVE_DOMAIN=akanjs.com (not localhost).",
      );
    } finally {
      for (const key of keys) {
        if (shellEnv[key] === undefined) delete process.env[key];
        else process.env[key] = shellEnv[key];
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a build for a real environment stops before any phase when the serve domain is only the local default", async () => {
    const { root, workspace } = await createTempApp("portal");
    await writeFile(path.join(root, ".env"), "AKAN_PUBLIC_REPO_NAME=repo\n");
    const shellDomain = process.env.AKAN_PUBLIC_SERVE_DOMAIN;
    delete process.env.AKAN_PUBLIC_SERVE_DOMAIN;
    const app = AppExecutor.from(workspace, "portal");
    let prepared = false;
    app.prepareCommand = async () => {
      prepared = true;
      throw new Error("prepared");
    };
    try {
      await expect(new ApplicationBuildRunner(app, { environment: "main" }).build()).rejects.toThrow(
        'akan build for the "main" environment needs AKAN_PUBLIC_SERVE_DOMAIN (would be "localhost") set',
      );
      expect(prepared).toBe(false);
      await expect(new ApplicationBuildRunner(app, { environment: "local" }).build()).rejects.toThrow("prepared");
    } finally {
      if (shellDomain !== undefined) process.env.AKAN_PUBLIC_SERVE_DOMAIN = shellDomain;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("asks the bundler for a metafile with AKAN_BUILD_METAFILE=1, and not with 0, false or an empty value", async () => {
    const { root, workspace } = await createTempApp("portal");
    const keys = [
      "AKAN_BUILD_METAFILE",
      "AKAN_PUBLIC_ENV",
      "AKAN_PUBLIC_REPO_NAME",
      "AKAN_PUBLIC_SERVE_DOMAIN",
    ] as const;
    const shellEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    await Promise.all(["main.ts", "server.ts"].map((file) => writeFile(path.join(root, "apps", "portal", file), "")));
    const app = AppExecutor.from(workspace, "portal");
    app.prepareCommand = async () => ({ env: {} });
    const bundle = spyOn(Bun, "build").mockImplementation(async () => {
      throw new Error("stopped at the first bundle");
    });
    const asksForMetafile = async (flag: string) => {
      process.env.AKAN_BUILD_METAFILE = flag;
      await expect(new ApplicationBuildRunner(app, { fast: true }).build()).rejects.toThrow(
        "stopped at the first bundle",
      );
      return bundle.mock.lastCall?.[0].metafile === true;
    };
    try {
      const asked: { [flag: string]: boolean } = {};
      for (const flag of ["1", "0", "false", ""]) asked[flag] = await asksForMetafile(flag);
      expect(asked).toEqual({ "1": true, "0": false, false: false, "": false });
    } finally {
      bundle.mockRestore();
      for (const key of keys) {
        if (shellEnv[key] === undefined) delete process.env[key];
        else process.env[key] = shellEnv[key];
      }
      await rm(root, { recursive: true, force: true });
    }
  });
});
