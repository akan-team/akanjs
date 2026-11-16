import { describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AkanAppConfig } from "../akanConfig";
import { ProductionLockfile } from "../akanConfig/productionLockfile";
import type { App } from "../commandDecorators";
import { AppExecutor, Executor } from "../executors";
import { AllRoutesBuilder, type BuildAllRoutesResult, VendorNarrowing } from "../frontendBuild";
import { bundleDefine } from "../frontendBuild/bundleDefine";
import {
  computedSecretKeys,
  computedSecrets,
  holdsSentinel,
  secretEnvSentinels,
  twinSecretEnv,
  twinSecrets,
  writeComputedSecretFixture,
  writeSecretEnvFixture,
} from "../test/secretEnvFixture";
import { createTempApp } from "../test/testHelpers";
import { ProjectTypecheck } from "../typecheck/projectTypecheck";
import { AKAN_BACKEND_MINIFY, AKAN_OPTIONAL_BACKEND_EXTERNALS, ApplicationBuildRunner } from "./applicationBuildRunner";

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
      logger: { warn: () => undefined },
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

  test("writes beside main.js the env its Dockerfile sets, so a host without the image runs the build as is", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akan-build-meta-"));
    const config = new AkanAppConfig(
      { name: "portal" } as never,
      [],
      { name: "repo", version: "1.0.0", description: "repo" },
      {},
      { repoName: "akanjs", serveDomain: "akanjs.com", env: "local", portOffset: 0, workspaceRoot: root },
    );
    const app = {
      getConfig: async () => config,
      dist: new Executor("dist", root),
      workspace: { workspaceRoot: root },
      logger: { warn: () => undefined },
    } as unknown as App;
    const builtEnv = async () => JSON.parse(await readFile(path.join(root, "akan.env.json"), "utf8")) as object;
    const dockerfileEnv = async () =>
      Object.fromEntries(
        (await readFile(path.join(root, "Dockerfile"), "utf8"))
          .split("\n")
          .filter((line) => line.startsWith("ENV "))
          .map((line) => line.slice("ENV ".length).split(/=(.*)/s).slice(0, 2)),
      );
    try {
      await new ApplicationBuildRunner(app, { environment: "debug" }).buildAppMeta();
      expect(await builtEnv()).toEqual(config.getProductionEnv("debug"));
      expect(await builtEnv()).toEqual(await dockerfileEnv());
      expect(await builtEnv()).toMatchObject({ AKAN_PUBLIC_APP_NAME: "portal", AKAN_PUBLIC_ENV: "debug" });
      await new ApplicationBuildRunner(app).buildAppMeta();
      expect(await builtEnv()).toMatchObject({ AKAN_PUBLIC_ENV: "local" });
      expect(await builtEnv()).toEqual(await dockerfileEnv());
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("an image build names the secrets its server reads beside main.js and in its Dockerfile, and holds no value of them", async () => {
    const { root, workspace } = await createTempApp("portal");
    await writeSecretEnvFixture(root, { app: "portal" });
    const keys = ["AKAN_PUBLIC_ENV", "AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"] as const;
    const shellEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    await writeFile(
      path.join(root, ".env"),
      "AKAN_PUBLIC_ENV=main\nAKAN_PUBLIC_REPO_NAME=repo\nAKAN_PUBLIC_SERVE_DOMAIN=akanjs.com\n",
    );
    const metaOf = async (options: ConstructorParameters<typeof ApplicationBuildRunner>[1]) => {
      const app = AppExecutor.from(workspace, "portal");
      spyOn(app.logger, "warn").mockImplementation(() => undefined);
      app.prepareCommand = async () => {
        throw new Error("stopped before the phases");
      };
      const runner = new ApplicationBuildRunner(app, options);
      await expect(runner.build()).rejects.toThrow("stopped before the phases");
      await runner.buildAppMeta();
      const env = JSON.parse(await readFile(path.join(app.dist.cwdPath, "akan.env.json"), "utf8")) as {
        [key: string]: string;
      };
      const dockerfile = await readFile(path.join(app.dist.cwdPath, "Dockerfile"), "utf8");
      const dockerfileEnv = Object.fromEntries(
        dockerfile
          .split("\n")
          .filter((line) => line.startsWith("ENV "))
          .map((line) => line.slice("ENV ".length).split(/=(.*)/s).slice(0, 2)),
      );
      expect(env).toEqual(dockerfileEnv);
      expect(holdsSentinel(`${JSON.stringify(env)}${dockerfile}`)).toBe(false);
      return env;
    };
    const names =
      "JWT_SECRET,SECURITY__SSO__GOOGLE__CLIENT_SECRET,MAILER__AUTH__PASS,OBJECT_STORAGE__ENDPOINT,DISCORD__TOKENS:json,DISCORD__WEBHOOK,PUSH_NOTI__FIREBASE__PRIVATE_KEY:multiline,MESSAGE__API_SECRET,MESSAGE__SENDER_PASSWORD,POSTGRES_URL";
    try {
      const read = await metaOf({ secretEnv: "read" });
      expect(read.AKAN_ENV_NAMES).toBe(names);
      expect(read).not.toHaveProperty("AKAN_ENV_FALLBACK");
      expect(await metaOf({ secretEnv: "inline" })).toMatchObject({
        AKAN_ENV_NAMES: names,
        AKAN_ENV_FALLBACK: "image",
      });
      const carried = await metaOf({});
      expect(carried).not.toHaveProperty("AKAN_ENV_NAMES");
      expect(carried).not.toHaveProperty("AKAN_ENV_FALLBACK");
    } finally {
      for (const key of keys) {
        if (shellEnv[key] === undefined) delete process.env[key];
        else process.env[key] = shellEnv[key];
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  test("an image build stops before any phase at a secret whose variable the platform owns, without printing it", async () => {
    const { root, workspace } = await createTempApp("portal");
    await writeSecretEnvFixture(root, { app: "portal", mainExtra: '\n  pwd: "sentinel-pwd-1b84",' });
    const keys = ["AKAN_PUBLIC_ENV", "AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"] as const;
    const shellEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    await writeFile(
      path.join(root, ".env"),
      "AKAN_PUBLIC_ENV=main\nAKAN_PUBLIC_REPO_NAME=repo\nAKAN_PUBLIC_SERVE_DOMAIN=akanjs.com\n",
    );
    const app = AppExecutor.from(workspace, "portal");
    let prepared = false;
    app.prepareCommand = async () => {
      prepared = true;
      throw new Error("prepared");
    };
    try {
      const failure = await new ApplicationBuildRunner(app, { secretEnv: "read" })
        .build()
        .catch((error: Error) => error.message);
      expect(failure).toContain("`pwd` is a secret a build would read from the environment variable PWD");
      expect(holdsSentinel(String(failure))).toBe(false);
      expect(prepared).toBe(false);
    } finally {
      for (const key of keys) {
        if (shellEnv[key] === undefined) delete process.env[key];
        else process.env[key] = shellEnv[key];
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  test("an env file that needs a variable of the shell to load builds with it set; without it a build stops at the place, and an --inline-secrets build warns and holds the env as written", async () => {
    const { root, workspace } = await createTempApp("portal");
    await writeSecretEnvFixture(root, { app: "portal", mainExtra: '\n  hosts: process.env.ZQ_HOSTS!.split(","),' });
    const keys = ["AKAN_PUBLIC_ENV", "AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN", "ZQ_HOSTS"] as const;
    const shellEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    await writeFile(
      path.join(root, ".env"),
      "AKAN_PUBLIC_ENV=main\nAKAN_PUBLIC_REPO_NAME=repo\nAKAN_PUBLIC_SERVE_DOMAIN=akanjs.com\n",
    );
    const started = async (secretEnv: "read" | "inline") => {
      const app = AppExecutor.from(workspace, "portal");
      const warnings: string[] = [];
      spyOn(app.logger, "warn").mockImplementation((message: string) => {
        warnings.push(message);
      });
      app.prepareCommand = async () => {
        throw new Error("stopped before the phases");
      };
      const runner = new ApplicationBuildRunner(app, { secretEnv });
      const failure = await runner.build().then(
        () => "",
        (error: Error) => error.message,
      );
      return { app, runner, failure, warnings };
    };
    const envOf = async ({ app, runner }: Awaited<ReturnType<typeof started>>) => {
      await runner.buildAppMeta();
      return JSON.parse(await readFile(path.join(app.dist.cwdPath, "akan.env.json"), "utf8")) as {
        [key: string]: string;
      };
    };
    const place =
      /env\.server\.ts could not be evaluated to check it for secrets: TypeError at .*env\.server\.main\.ts:\d+/;
    try {
      const stopped = await started("read");
      expect(stopped.failure).toMatch(place);
      expect(stopped.failure).toContain("Make the file load at that line");
      expect(holdsSentinel(stopped.failure)).toBe(false);

      const inlined = await started("inline");
      expect(inlined.failure).toBe("stopped before the phases");
      expect(inlined.warnings).toHaveLength(1);
      expect(inlined.warnings[0]).toMatch(place);
      expect(inlined.warnings[0]).toStartWith("--inline-secrets: env.server.ts could not be evaluated");
      expect(holdsSentinel(inlined.warnings.join())).toBe(false);
      const written = await envOf(inlined);
      expect(written).not.toHaveProperty("AKAN_ENV_NAMES");
      expect(written).not.toHaveProperty("AKAN_ENV_FALLBACK");

      process.env.ZQ_HOSTS = "a.example.test,b.example.test";
      const built = await started("read");
      expect(built.failure).toBe("stopped before the phases");
      expect((await envOf(built)).AKAN_ENV_NAMES).toStartWith("JWT_SECRET,SECURITY__SSO__GOOGLE__CLIENT_SECRET,");
    } finally {
      for (const key of keys) {
        if (shellEnv[key] === undefined) delete process.env[key];
        else process.env[key] = shellEnv[key];
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  test("an image build stops before any phase at a secret the env file imports or computes, short or plain as it may be, naming the file and the keys alone", async () => {
    const { root, workspace } = await createTempApp("portal");
    await writeComputedSecretFixture(root, "portal");
    const keys = ["AKAN_PUBLIC_ENV", "AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"] as const;
    const shellEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    await writeFile(
      path.join(root, ".env"),
      "AKAN_PUBLIC_ENV=main\nAKAN_PUBLIC_REPO_NAME=repo\nAKAN_PUBLIC_SERVE_DOMAIN=akanjs.com\n",
    );
    const started = async (secretEnv: "read" | "inline") => {
      const app = AppExecutor.from(workspace, "portal");
      spyOn(app.logger, "warn").mockImplementation(() => undefined);
      let prepared = false;
      app.prepareCommand = async () => {
        prepared = true;
        throw new Error("stopped before the phases");
      };
      const failure = await new ApplicationBuildRunner(app, { secretEnv }).build().then(
        () => "",
        (error: Error) => error.message,
      );
      return { failure, prepared: () => prepared };
    };
    try {
      const stopped = await started("read");
      expect(stopped.prepared()).toBe(false);
      expect(stopped.failure).toStartWith(
        `The server env of portal (main) holds 4 secret values this build cannot leave out, so it stops here: ${computedSecretKeys.join(", ")} (apps/portal/env/env.server.ts and what it imports).\n`,
      );
      expect(holdsSentinel(stopped.failure)).toBe(false);
      for (const value of Object.values(computedSecrets)) expect(stopped.failure).not.toContain(value);
      const inlined = await started("inline");
      expect(inlined.prepared()).toBe(true);
      expect(inlined.failure).toBe("stopped before the phases");
    } finally {
      for (const key of keys) {
        if (shellEnv[key] === undefined) delete process.env[key];
        else process.env[key] = shellEnv[key];
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  test("an image build stops before its metadata when a file it wrote holds a secret it left out of the env, and warns of a short one a plain key holds as well", async () => {
    const { root, workspace } = await createTempApp("portal");
    await writeSecretEnvFixture(root, { app: "portal", mainExtra: twinSecretEnv.split("\n").slice(0, 3).join("\n") });
    const keys = ["AKAN_PUBLIC_ENV", "AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"] as const;
    const shellEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    await writeFile(
      path.join(root, ".env"),
      "AKAN_PUBLIC_ENV=main\nAKAN_PUBLIC_REPO_NAME=repo\nAKAN_PUBLIC_SERVE_DOMAIN=akanjs.com\n",
    );
    const runnerOf = async (secretEnv: "read" | "inline") => {
      const app = AppExecutor.from(workspace, "portal");
      const warnings: string[] = [];
      spyOn(app.logger, "warn").mockImplementation((message: string) => {
        warnings.push(message);
      });
      app.prepareCommand = async () => {
        throw new Error("stopped before the phases");
      };
      const runner = new ApplicationBuildRunner(app, { secretEnv });
      await expect(runner.build()).rejects.toThrow("stopped before the phases");
      return { app, runner, warnings };
    };
    try {
      const { app, runner, warnings } = await runnerOf("read");
      await mkdir(app.dist.cwdPath, { recursive: true });
      await writeFile(path.join(app.dist.cwdPath, "server.js"), 'const env = { hostname: "app.example.test" };\n');
      await runner.assertSecretsLeftOut();
      expect(warnings).toEqual([]);
      await writeFile(
        path.join(app.dist.cwdPath, "chunk-a.js"),
        `const cache = { name: ${JSON.stringify(twinSecrets.plain)} };\n`,
      );
      await runner.assertSecretsLeftOut();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(
        "\n  cache.password (CACHE__PASSWORD): chunk-a.js; the env's cache.name holds the same string\n",
      );
      expect(holdsSentinel(warnings[0] ?? "")).toBe(false);
      await writeFile(
        path.join(app.dist.cwdPath, "chunk-b.js"),
        `const key = ${JSON.stringify(secretEnvSentinels.google)};\nconst label = ${JSON.stringify(twinSecrets.long)};\n`,
      );
      const failure = await runner.assertSecretsLeftOut().then(
        () => "",
        (error: Error) => error.message,
      );
      expect(failure).toStartWith(
        [
          "The build holds secret values the server reads from its process env, so it stops here:",
          "  chunk-b.js holds the value of security.sso.google.clientSecret (SECURITY__SSO__GOOGLE__CLIENT_SECRET)",
          "  chunk-b.js holds the value of audit.password (AUDIT__PASSWORD), which the env's audit.label holds as well",
          "",
        ].join("\n"),
      );
      expect(holdsSentinel(failure)).toBe(false);
      const inlined = await runnerOf("inline");
      await inlined.runner.assertSecretsLeftOut();
      expect(inlined.warnings.join("\n")).not.toContain("also in what this build wrote");
    } finally {
      for (const key of keys) {
        if (shellEnv[key] === undefined) delete process.env[key];
        else process.env[key] = shellEnv[key];
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  test("writes the pruned lockfile beside package.json, or warns and leaves the image's install unlocked", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akan-build-meta-"));
    const config = new AkanAppConfig(
      { name: "portal" } as never,
      [],
      { name: "repo", version: "1.0.0", description: "repo" },
      {},
      { repoName: "akanjs", serveDomain: "akanjs.com", env: "local", portOffset: 0, workspaceRoot: root },
    );
    const warnings: string[] = [];
    const app = {
      getConfig: async () => config,
      dist: new Executor("dist", root),
      workspace: { workspaceRoot: root },
      logger: { warn: (message: string) => warnings.push(message) },
    } as unknown as App;
    const prune = spyOn(ProductionLockfile, "prune");
    try {
      prune.mockResolvedValueOnce('{ "lockfileVersion": 1 }\n');
      await new ApplicationBuildRunner(app).buildAppMeta();
      expect(prune.mock.calls[0]?.[1]).toEqual(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")));
      expect(await readFile(path.join(root, "bun.lock"), "utf8")).toBe('{ "lockfileVersion": 1 }\n');
      expect(await readFile(path.join(root, "Dockerfile"), "utf8")).toContain("--frozen-lockfile");
      expect(warnings).toEqual([]);

      await rm(path.join(root, "bun.lock"));
      prune.mockRejectedValueOnce(new Error("the workspace root has no bun.lock"));
      await new ApplicationBuildRunner(app).buildAppMeta();
      expect(await Bun.file(path.join(root, "bun.lock")).exists()).toBe(false);
      expect(await readFile(path.join(root, "Dockerfile"), "utf8")).toContain("RUN bun install --production\n");
      expect(warnings).toEqual([
        "The image installs its dependencies unlocked, at the newest versions package.json allows: the workspace root has no bun.lock",
      ]);
    } finally {
      prune.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("builds for the shell's AKAN_PUBLIC_ENV over the root .env's, and for --env over both", async () => {
    const { root, workspace } = await createTempApp("portal");
    const shellEnv = process.env.AKAN_PUBLIC_ENV;
    const otherShellEnv = { repo: process.env.AKAN_PUBLIC_REPO_NAME, domain: process.env.AKAN_PUBLIC_SERVE_DOMAIN };
    delete process.env.AKAN_PUBLIC_REPO_NAME;
    delete process.env.AKAN_PUBLIC_SERVE_DOMAIN;
    const stoppedBeforePhases = (app: AppExecutor) => {
      app.prepareCommand = async () => {
        throw new Error("stopped before the phases");
      };
      return app;
    };
    const bakedEnv = (app: AppExecutor) =>
      (bundleDefine(app, "build", "ssr") as { [key: string]: string })["process.env.AKAN_PUBLIC_ENV"];
    try {
      expect(await readFile(path.join(root, ".env"), "utf8")).toContain("AKAN_PUBLIC_ENV=local\n");
      process.env.AKAN_PUBLIC_ENV = "main";
      const app = stoppedBeforePhases(AppExecutor.from(workspace, "portal"));
      const warn = spyOn(app.logger, "warn").mockImplementation(() => undefined);
      const runner = new ApplicationBuildRunner(app);
      await expect(runner.build()).rejects.toThrow("stopped before the phases");
      expect(bakedEnv(app)).toBe(JSON.stringify("main"));
      expect(warn.mock.calls.map(([line]) => line)).toEqual([
        "The shell (or a .env.local) outranks the workspace .env: the bundles and the image take AKAN_PUBLIC_ENV=main (.env: local). Unset it there to build what the .env says.",
      ]);
      await runner.buildAppMeta();
      expect(JSON.parse(await readFile(path.join(app.dist.cwdPath, "akan.env.json"), "utf8"))).toMatchObject({
        AKAN_PUBLIC_ENV: "main",
      });
      expect(await readFile(path.join(app.dist.cwdPath, "Dockerfile"), "utf8")).toContain("ENV AKAN_PUBLIC_ENV=main\n");

      process.env.AKAN_PUBLIC_ENV = "main";
      const desktop = stoppedBeforePhases(AppExecutor.from(workspace, "portal"));
      const desktopWarn = spyOn(desktop.logger, "warn").mockImplementation(() => undefined);
      await expect(new ApplicationBuildRunner(desktop, { environment: "debug" }).build()).rejects.toThrow(
        "stopped before the phases",
      );
      expect(bakedEnv(desktop)).toBe(JSON.stringify("debug"));
      expect(desktopWarn).not.toHaveBeenCalled();

      process.env.AKAN_PUBLIC_ENV = "";
      const unset = stoppedBeforePhases(AppExecutor.from(workspace, "portal"));
      await expect(new ApplicationBuildRunner(unset, { environment: "debug" }).build()).rejects.toThrow(
        "stopped before the phases",
      );
      expect(bakedEnv(unset)).toBe(JSON.stringify("debug"));
    } finally {
      if (shellEnv === undefined) delete process.env.AKAN_PUBLIC_ENV;
      else process.env.AKAN_PUBLIC_ENV = shellEnv;
      if (otherShellEnv.repo !== undefined) process.env.AKAN_PUBLIC_REPO_NAME = otherShellEnv.repo;
      if (otherShellEnv.domain !== undefined) process.env.AKAN_PUBLIC_SERVE_DOMAIN = otherShellEnv.domain;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("bakes into the bundles every AKAN_PUBLIC_* its Dockerfile carries, each the shell's over the root .env's", async () => {
    const { root, workspace } = await createTempApp("portal");
    const keys = ["AKAN_PUBLIC_ENV", "AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"] as const;
    const shellEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    await writeFile(
      path.join(root, ".env"),
      "AKAN_PUBLIC_ENV=main\nAKAN_PUBLIC_REPO_NAME=repo\nAKAN_PUBLIC_SERVE_DOMAIN=akanjs.com\n",
    );
    await Promise.all(["private", "public"].map((dir) => mkdir(path.join(root, "apps", "portal", dir))));
    for (const key of keys) delete process.env[key];
    process.env.AKAN_PUBLIC_REPO_NAME = "shell-repo";
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
      expect(imageEnv).toMatchObject({
        AKAN_PUBLIC_ENV: "main",
        AKAN_PUBLIC_REPO_NAME: "shell-repo",
        AKAN_PUBLIC_SERVE_DOMAIN: "akanjs.com",
      });
      expect(warn.mock.calls.map(([line]) => line)).toEqual([
        "The shell (or a .env.local) outranks the workspace .env: the bundles and the image take AKAN_PUBLIC_REPO_NAME=shell-repo (.env: repo). Unset it there to build what the .env says.",
      ]);
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

  const buildSsrUntilVendors = async (routeChunkWritten: boolean) => {
    const { root, workspace } = await createTempApp("portal");
    const keys = ["AKAN_PUBLIC_ENV", "AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"] as const;
    const shellEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    await Promise.all(["main.ts", "server.ts"].map((file) => writeFile(path.join(root, "apps", "portal", file), "")));
    const app = AppExecutor.from(workspace, "portal");
    app.prepareCommand = async () => ({ env: {} });
    app.getPageKeys = async () => ["_index.tsx"];
    const order: string[] = [];
    let narrowed: Record<string, readonly string[]> = {};
    const entryExports = VendorNarrowing.prototype.entryExports;
    const bundle = spyOn(Bun, "build").mockImplementation(
      async () => ({ success: true, outputs: [], logs: [] }) as unknown as Bun.BuildOutput,
    );
    const routes = spyOn(AllRoutesBuilder.prototype, "build").mockImplementation(async () => {
      order.push("routes");
      if (routeChunkWritten)
        await Bun.write(
          path.join(app.dist.cwdPath, ".akan/artifact/client/page-a1.js"),
          'import{st}from"akanjs/store";',
        );
      const clientManifest = { "page#default": { id: "/_akan/client/page-a1.js", chunks: [], name: "default" } };
      return { manifest: { routeIds: ["/"], clientManifest } } as unknown as BuildAllRoutesResult;
    });
    const vendors = spyOn(VendorNarrowing.prototype, "entryExports").mockImplementation(function (
      this: VendorNarrowing,
      entries,
    ) {
      order.push("vendors");
      narrowed = entryExports.call(this, entries);
      throw new Error("stopped at the vendor build");
    });
    try {
      const failure = await new ApplicationBuildRunner(app, { fast: true }).build().then(
        () => "built",
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      );
      return { failure, order, narrowed };
    } finally {
      bundle.mockRestore();
      routes.mockRestore();
      vendors.mockRestore();
      for (const key of keys) {
        if (shellEnv[key] === undefined) delete process.env[key];
        else process.env[key] = shellEnv[key];
      }
      await rm(root, { recursive: true, force: true });
    }
  };

  test("bundles the routes before the vendor entries, which export only the names the route chunks import", async () => {
    const { failure, order, narrowed } = await buildSsrUntilVendors(true);

    expect(failure).toBe("stopped at the vendor build");
    expect(order).toEqual(["routes", "vendors"]);
    expect(Object.entries(narrowed).find(([entry]) => entry.endsWith("akanjs-store.ts"))?.[1]).toEqual(["st"]);
  });

  test("stops before the vendor entries when a route's client entry is not where the scan reads", async () => {
    const { failure, order } = await buildSsrUntilVendors(false);

    expect(failure).toContain("no file under");
    expect(failure).toContain("/_akan/client/page-a1.js");
    expect(order).toEqual(["routes"]);
  });

  test("akan typecheck names the script/ files nothing imports, and a build's typecheck leaves them out", async () => {
    const { root, app } = await createTempApp("portal");
    const run = spyOn(ProjectTypecheck.prototype, "run").mockImplementation(async () => "");
    try {
      const runner = new ApplicationBuildRunner(app);
      await runner.typecheck({ tests: true });
      await runner.typecheck();
      const [checked, built] = run.mock.calls.map(([entries]) => entries);
      expect(checked).toContain("../../script/**/*.ts");
      expect(built).not.toContain("../../script/**/*.ts");
    } finally {
      run.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a verify build stops after the backend and SSR route compile but still measures the route JS budget", async () => {
    const { root, workspace } = await createTempApp("portal");
    const keys = ["AKAN_PUBLIC_ENV", "AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"] as const;
    const shellEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    await Promise.all(["main.ts", "server.ts"].map((file) => writeFile(path.join(root, "apps", "portal", file), "")));
    const app = AppExecutor.from(workspace, "portal");
    app.prepareCommand = async () => ({ env: {} });
    const bundle = spyOn(Bun, "build").mockImplementation(
      async () => ({ success: true, outputs: [], logs: [] }) as unknown as Bun.BuildOutput,
    );
    try {
      const { phases } = await new ApplicationBuildRunner(app, { verify: true }).build();
      expect(phases.map((phase) => phase.id)).toEqual(["prepare", "backend", "ssr", "budget"]);
      expect(await Bun.file(path.join(app.dist.cwdPath, "package.json")).exists()).toBe(false);
    } finally {
      bundle.mockRestore();
      for (const key of keys) {
        if (shellEnv[key] === undefined) delete process.env[key];
        else process.env[key] = shellEnv[key];
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  test("marks a verify build's output and makes its main.js refuse to boot", async () => {
    const { root, workspace } = await createTempApp("portal");
    const keys = ["AKAN_PUBLIC_ENV", "AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"] as const;
    const shellEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    await Promise.all(["main.ts", "server.ts"].map((file) => writeFile(path.join(root, "apps", "portal", file), "")));
    const app = AppExecutor.from(workspace, "portal");
    app.prepareCommand = async () => ({ env: {} });
    const bundle = spyOn(Bun, "build").mockImplementation(
      async () => ({ success: true, outputs: [], logs: [] }) as unknown as Bun.BuildOutput,
    );
    try {
      await new ApplicationBuildRunner(app, { verify: true }).build();
      const main = bundle.mock.calls.find(([config]) => config.entrypoints.some((entry) => entry.endsWith("main.ts")));
      const banner = main?.[0].banner ?? "";
      const mainPath = path.join(root, "main.js");
      await writeFile(mainPath, `${banner}\nconsole.log("booted");\n`);
      const proc = Bun.spawnSync([process.execPath, mainPath], { stdout: "pipe", stderr: "pipe" });

      expect(proc.exitCode).toBe(1);
      expect(proc.stdout.toString()).toBe("");
      expect(proc.stderr.toString()).toContain(
        `${path.join("dist", "verify", "portal")} holds the partial output of akan verify, not a build. Run \`akan build portal\` and start dist/apps/portal.`,
      );
      expect(await Bun.file(path.join(app.dist.cwdPath, "akan.build.json")).json()).toMatchObject({
        profile: "verify",
      });
    } finally {
      bundle.mockRestore();
      for (const key of keys) {
        if (shellEnv[key] === undefined) delete process.env[key];
        else process.env[key] = shellEnv[key];
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a verify build writes to dist/verify/<app> and leaves the full build in dist/apps/<app> as it was", async () => {
    const { root, workspace } = await createTempApp("portal");
    const keys = ["AKAN_PUBLIC_ENV", "AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"] as const;
    const shellEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    const appDir = path.join(root, "apps", "portal");
    await Promise.all(["main.ts", "server.ts"].map((file) => writeFile(path.join(appDir, file), "")));
    await mkdir(path.join(appDir, "public"));
    await writeFile(path.join(appDir, "public", "hero.png"), "image");
    const built = path.join(root, "dist", "apps", "portal");
    const fullBuild = {
      "main.js": 'console.log("booted");\n',
      "akan.build.json": '{ "buildId": "abc123" }\n',
      "akan.env.json": '{ "AKAN_PUBLIC_ENV": "local" }\n',
      "public/hero.png": "image",
    };
    for (const [file, content] of Object.entries(fullBuild)) {
      await mkdir(path.dirname(path.join(built, file)), { recursive: true });
      await writeFile(path.join(built, file), content);
    }
    const app = AppExecutor.from(workspace, "portal");
    const bundle = spyOn(Bun, "build").mockImplementation(
      async () => ({ success: true, outputs: [], logs: [] }) as unknown as Bun.BuildOutput,
    );
    try {
      const { outputDir } = await new ApplicationBuildRunner(app, { verify: true }).build();

      for (const [file, content] of Object.entries(fullBuild))
        expect(await readFile(path.join(built, file), "utf8").catch(() => null)).toBe(content);
      const verified = path.join(root, "dist", "verify", "portal");
      expect(outputDir).toBe(verified);
      expect(await Bun.file(path.join(verified, "akan.build.json")).json()).toMatchObject({ profile: "verify" });
      expect(await Bun.file(path.join(verified, "console.js")).exists()).toBe(true);
      expect(await Bun.file(path.join(verified, "public", "hero.png")).exists()).toBe(false);
      const outdirs = bundle.mock.calls.map(([config]) => config.outdir);
      expect(outdirs.length).toBeGreaterThan(0);
      expect(outdirs.every((outdir) => outdir === verified)).toBe(true);
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
