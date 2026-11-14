import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AkanAppConfig, DatabaseMode } from "@akanjs/devkit/akanConfig";
import {
  type ArgMeta,
  CliError,
  CommandContainer,
  getArgMetas,
  getArgumentValue,
  getTargetMetas,
} from "@akanjs/devkit/commandDecorators";
import { AppExecutor, LibExecutor, PkgExecutor } from "@akanjs/devkit/executors";
import { NativeApp } from "@akanjs/devkit/mobile";
import {
  createCallRecorder,
  createFakeExecutor,
  createTempApp,
  createTempLib,
  createTempPackage,
  tempRoots,
  writeText,
} from "@akanjs/devkit/test/testHelpers";
import { DatabaseModes } from "akanjs/base";
import { Logger } from "akanjs/common";
import { ApplicationCommand } from "./application.command";
import { ApplicationRunner } from "./application.runner";
import { ApplicationScript } from "./application.script";

type CallRecorder = ReturnType<typeof createCallRecorder>;

const repoRoot = path.resolve(import.meta.dir, "../../../..");

const createRecordedWorkspace = (recorder: CallRecorder) =>
  createFakeExecutor(
    "workspace",
    {
      getPackageJson: async (...args: unknown[]) => {
        recorder.record("workspace.getPackageJson", ...args);
        return {};
      },
    },
    recorder,
  );

const stubStart = (script: ApplicationScript, recorder: CallRecorder, { confirmed = true } = {}) => {
  script.confirmDatabaseModeDependencyInstall = async (...args: unknown[]) => {
    recorder.record("confirmInstall", ...args);
    return confirmed;
  };
  script.dbup = async (...args: unknown[]) => {
    recorder.record("dbup", ...args);
    return true;
  };
  Object.assign(script.applicationRunner, {
    start: async (...args: unknown[]) => {
      recorder.record("runner.start", ...args);
      return {};
    },
  });
};

const createStartApp = ({
  databaseMode = "single",
  modes = [databaseMode],
  installSpecsByMode = {},
}: {
  databaseMode?: DatabaseMode;
  modes?: DatabaseMode[];
  installSpecsByMode?: Partial<Record<DatabaseMode, string[]>>;
} = {}) => {
  const recorder = createCallRecorder();
  const workspace = createRecordedWorkspace(recorder);
  const getMissingDatabaseModeDependencySpecs = mock((mode: DatabaseMode) => installSpecsByMode[mode] ?? []);
  const akanConfig = {
    database: { modes },
    resolveDatabaseMode: () =>
      DatabaseModes.resolve({ requested: process.env.AKAN_DATABASE_MODE, declared: modes.join(","), local: true }),
    getMissingDatabaseModeDependencySpecs,
  } as unknown as AkanAppConfig;
  const app = createFakeExecutor(
    "app",
    {
      getConfig: async () => akanConfig,
      getEnv: () => "local",
      workspace,
    },
    recorder,
  );
  return {
    app,
    akanConfig,
    getMissingDatabaseModeDependencySpecs,
    recorder,
    workspace,
  };
};

afterEach(() => {
  CommandContainer.clear();
  mock.restore();
});
const track = tempRoots();

describe("ApplicationCommand", () => {
  test("exposes command metadata and delegates normalized app creation", async () => {
    const metas = Object.fromEntries(
      getArgMetas(ApplicationCommand, "createApplication")[0].map((arg) => [arg.idx, arg.type]),
    );
    expect(metas).toEqual({ 0: "Argument", 1: "Option", 2: "Workspace" });

    const command = CommandContainer.get(ApplicationCommand);
    const calls: unknown[] = [];
    command.applicationScript.createApplication = async (...args: unknown[]) => {
      calls.push(args);
    };
    const handler = getTargetMetas(ApplicationCommand).find((meta) => meta.key === "createApplication")?.handler;
    await handler?.call(command, "My App", true, { name: "workspace" });
    expect(calls).toEqual([["my-app", { name: "workspace" }, { start: true }]]);
  });

  test("build takes --env for the environment its server runs in, and leaves it to the workspace .env without one", async () => {
    const env = getArgMetas(ApplicationCommand, "build")[1].find((meta) => meta.name === "env");
    expect(env?.argsOption).toMatchObject({ enum: ["local", "debug", "develop", "main"], nullable: true });

    const command = CommandContainer.get(ApplicationCommand);
    const calls: unknown[] = [];
    command.applicationScript.build = async (...args: unknown[]) => {
      calls.push(args);
    };
    const handler = getTargetMetas(ApplicationCommand).find((meta) => meta.key === "build")?.handler;
    await handler?.call(command, { name: "demo" }, true, false, false, null, "main");
    await handler?.call(command, { name: "demo" }, true, false, false, null, null);
    expect(calls).toEqual([
      [{ name: "demo" }, { write: true, fast: false, quiet: false, env: "main", budget: "report" }],
      [{ name: "demo" }, { write: true, fast: false, quiet: false, budget: "report" }],
    ]);
  });

  test("build takes --check-budget, --update-budget or --raise-budget, off unless given, as one budget mode", async () => {
    const options = getArgMetas(ApplicationCommand, "build")[1];
    for (const name of ["checkBudget", "updateBudget", "raiseBudget"])
      expect(options.find((meta) => meta.name === name)?.argsOption).toMatchObject({ default: false });

    const command = CommandContainer.get(ApplicationCommand);
    const calls: unknown[] = [];
    command.applicationScript.build = async (...args: unknown[]) => {
      calls.push(args);
    };
    const handler = getTargetMetas(ApplicationCommand).find((meta) => meta.key === "build")?.handler;
    await handler?.call(command, { name: "demo" }, true, false, false, null, null, true, false, false);
    await handler?.call(command, { name: "demo" }, true, false, false, null, null, false, true, false);
    await handler?.call(command, { name: "demo" }, true, false, false, null, null, false, false, true);
    expect(calls.map((args) => (args as [unknown, { budget?: string }])[1].budget)).toEqual([
      "enforce",
      "update",
      "raise",
    ]);
    await expect(
      handler?.call(command, { name: "demo" }, true, false, false, null, null, true, false, true),
    ).rejects.toThrow("Pass at most one of --check-budget, --update-budget and --raise-budget.");
    expect(calls).toHaveLength(3);
  });

  test("studio passes the runtime and framework views through, and opens the ERD for anything else", async () => {
    const view = getArgMetas(ApplicationCommand, "studio")[1].find((meta) => meta.name === "view");
    expect(view?.argsOption).toMatchObject({ enum: ["erd", "signals", "changes", "runtime", "framework"] });

    const command = CommandContainer.get(ApplicationCommand);
    const calls: unknown[] = [];
    command.applicationScript.studio = async (...args: unknown[]) => {
      calls.push(args);
    };
    const handler = getTargetMetas(ApplicationCommand).find((meta) => meta.key === "studio")?.handler;
    for (const asked of ["runtime", "framework", "nope"])
      await handler?.call(command, { name: "demo" }, null, asked, null, "vscode", false, "text");
    expect(calls.map((call) => (call as [unknown, { view: string }])[1].view)).toEqual(["runtime", "framework", "erd"]);
  });

  test("the Capacitor-era commands and flags are gone", () => {
    const keys = getTargetMetas(ApplicationCommand).map((meta) => meta.key);
    for (const removed of ["codepush", "configureApp", "releaseSource"]) expect(keys).not.toContain(removed);
    const optionNames = (key: string) => getArgMetas(ApplicationCommand, key)[1].map((meta) => meta.name);
    for (const key of ["buildIos", "buildAndroid", "startIos", "startAndroid", "releaseIos", "releaseAndroid"])
      for (const removed of ["regenerate", "open", "allowProvisioningUpdates"])
        expect(optionNames(key)).not.toContain(removed);
    expect(optionNames("startIos")).toEqual(expect.arrayContaining(["device", "team"]));
    expect(optionNames("startAndroid")).toContain("device");
    expect(optionNames("releaseIos")).toEqual(expect.arrayContaining(["team", "adHoc"]));
  });

  test("migrate leaves a bad action to the app, which refuses it as ops migrate does", async () => {
    const action = getArgMetas(ApplicationCommand, "migrate")[0].find(
      (meta): meta is ArgMeta => meta.type === "Argument" && meta.name === "action",
    );
    if (!action) throw new Error("migrate takes an action");
    expect(await getArgumentValue(action, "frobnicate")).toBe("frobnicate");
    expect(await getArgumentValue(action, undefined)).toBe("list");
  });

  test("migrate ends a --json caller's output in the app's result shape when it fails before the app ran", async () => {
    const onFailure = getTargetMetas(ApplicationCommand).find((meta) => meta.key === "migrate")?.targetOption.onFailure;
    if (!onFailure) throw new Error("migrate reports its failures");
    const lines: string[] = [];
    const write = spyOn(process.stdout, "write").mockImplementation(((chunk: string, callback?: () => void) => {
      lines.push(chunk);
      callback?.();
      return true;
    }) as typeof process.stdout.write);
    try {
      await onFailure(new Error("unknown option '--frob'"), { usage: true, given: { json: true } });
      await onFailure(new Error("Unknown app 'shop'"), { usage: false, given: { json: true } });
      await onFailure(new CliError("unknownTarget", "Unknown app 'shop'"), { usage: false, given: { json: true } });
      await onFailure(new CliError("usage", "Missing argument 'action'"), { usage: false, given: { json: true } });
      await onFailure(new Error("unknown option '--frob'"), { usage: true, given: { json: false } });
    } finally {
      write.mockRestore();
    }
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { ok: false, action: null, code: "usage", error: "unknown option '--frob'", runId: null },
      { ok: false, action: null, code: "failed", error: "Unknown app 'shop'", runId: null },
      { ok: false, action: null, code: "notFound", error: "Unknown app 'shop'", runId: null },
      { ok: false, action: null, code: "usage", error: "Missing argument 'action'", runId: null },
    ]);
  });

  test("test takes the target, then an optional comma-separated file list, then its options", async () => {
    expect(getArgMetas(ApplicationCommand, "test")[0].map((arg) => [arg.idx, arg.type])).toEqual([
      [0, "Exec"],
      [1, "Argument"],
      [2, "Option"],
      [3, "Option"],
      [4, "Option"],
      [5, "Option"],
    ]);

    const command = CommandContainer.get(ApplicationCommand);
    const calls: unknown[] = [];
    command.applicationScript.test = async (...args: unknown[]) => {
      calls.push(args);
    };
    const handler = getTargetMetas(ApplicationCommand).find((meta) => meta.key === "test")?.handler;
    await handler?.call(command, { name: "demo" }, "lib/a/a.test.ts, lib/b/b.test.ts,", false, false, 1, null);
    await handler?.call(command, { name: "demo" }, null, true, true, 2, "local/junit/demo.xml");
    expect(calls).toEqual([
      [
        { name: "demo" },
        { write: false, files: ["lib/a/a.test.ts", "lib/b/b.test.ts"], coverage: false, parallel: 1, junit: null },
      ],
      [{ name: "demo" }, { write: true, files: [], coverage: true, parallel: 2, junit: "local/junit/demo.xml" }],
    ]);
  });

  test("typecheck picks an app or a library as sync does, and never offers a package", () => {
    const targetsOf = (key: string) => getArgMetas(ApplicationCommand, key)[2].map((meta) => meta.type);
    expect(targetsOf("typecheck")).toEqual(["Sys"]);
    expect(targetsOf("typecheck")).toEqual(targetsOf("sync"));
  });

  test("no command gives two options the same short flag", () => {
    for (const { key } of getTargetMetas(ApplicationCommand)) {
      const flags = getArgMetas(ApplicationCommand, key)[1].map(
        (meta) => (meta.argsOption as { flag?: string } | undefined)?.flag ?? meta.name.slice(0, 1).toLowerCase(),
      );
      expect({ key, flags: [...new Set(flags)] }).toEqual({ key, flags });
    }
  });

  test("uses the same native target selector metadata across native commands", async () => {
    const mobileCommandKeys = [
      "buildIos",
      "buildAndroid",
      "buildDesktop",
      "startIos",
      "startAndroid",
      "startDesktop",
      "releaseIos",
      "releaseAndroid",
    ];
    const app = {
      getConfig: async () => ({
        basePaths: new Set(["store", "admin"]),
        native: {
          targets: {
            store: { name: "store", basePath: "store" },
          },
        },
      }),
    };

    for (const key of mobileCommandKeys) {
      const [, optionMetas] = getArgMetas(ApplicationCommand, key);
      const targetOption = optionMetas.find((meta) => meta.name === "target")?.argsOption;

      expect(targetOption?.ask).toBe("Select native target");
      expect(typeof targetOption?.enum).toBe("function");
      if (typeof targetOption?.enum === "function") {
        await expect(targetOption.enum({ values: {}, app: app as never })).resolves.toEqual(["store"]);
      }
    }
  });
});

describe("ApplicationScript", () => {
  test("test refuses a file outside its target before preparing anything", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const { root, app } = track(await createTempApp("demo"));
    await writeText(path.join(root, "libs", "shared", "lib", "x.test.ts"), "");
    const scanSync = mock(async () => undefined);
    app.scanSync = scanSync as never;

    await expect(script.test(app, { files: ["libs/shared/lib/x.test.ts"] })).rejects.toThrow("is outside apps/demo");
    expect(scanSync).not.toHaveBeenCalled();
  });

  test("createApplication refuses an app name that is not one plain path segment before writing", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace", {}, recorder);
    script.applicationRunner.createApplication = async (...args) => {
      recorder.record("createApplication", ...args);
      return createFakeExecutor("app", { scanSync: async () => undefined }, recorder) as never;
    };

    for (const name of ["..", "../x", "a/b", "/tmp/x", ""])
      await expect(script.createApplication(name, workspace as never)).rejects.toThrow(
        `${JSON.stringify(name)} is no app name; use letters, digits, - and _, starting with a lowercase letter or digit`,
      );

    expect(recorder.names()).toEqual([]);
  });

  test("studio prints the URL of the view asked for on the app's running dev server", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const { app } = track(await createTempApp("demo"));
    app.getDevPort = mock(async () => 8654) as never;
    const answers = spyOn(ApplicationRunner, "answers").mockImplementation(async () => true);
    const printed = spyOn(Logger, "rawLog").mockImplementation(() => undefined);
    try {
      await script.studio(app, { module: null, view: "runtime", editor: "cursor", open: false, format: "json" });
      expect(printed.mock.calls[0]?.[0]).toBe(
        JSON.stringify({ url: "http://localhost:8654/_akan/studio?view=runtime&editor=cursor" }),
      );
      await expect(
        script.studio(app, {
          module: null,
          view: "runtime",
          since: "main",
          editor: "vscode",
          open: false,
          format: "text",
        }),
      ).rejects.toThrow("pass `--view changes` with it");
    } finally {
      answers.mockRestore();
      printed.mockRestore();
    }
  });

  test("build hands its --env to the build runner", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const { app } = track(await createTempApp("demo"));
    app.scanSync = mock(async () => undefined) as never;
    const build = spyOn(script.applicationRunner, "build").mockImplementation(async () => {
      throw new Error("stopped");
    });
    try {
      await expect(script.build(app, { quiet: true, env: "main" })).rejects.toThrow("stopped");
      expect(build.mock.calls[0]?.[1]).toMatchObject({ environment: "main" });
    } finally {
      build.mockRestore();
    }
  });

  test("build prints the route JS budget warnings of a --quiet build, and nothing else of its summary", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const { app } = track(await createTempApp("demo"));
    app.scanSync = mock(async () => undefined) as never;
    const warning = { file: "apps/demo/akan.budget.json", message: "/:lang loads 9 bytes brotli", fix: "shrink it" };
    const build = spyOn(script.applicationRunner, "build").mockImplementation(async () => ({
      phases: [],
      durationMs: 1,
      outputDir: "dist/apps/demo",
      artifactDir: "dist/apps/demo/.akan/artifact",
      environment: "main",
      routeJs: [{ routeId: "/:lang", files: 1, rawBytes: 27, brotliBytes: 9 }],
      routeJsWarnings: [warning],
    }));
    const printed = spyOn(Logger, "rawLog").mockImplementation(() => undefined);
    try {
      await script.build(app, { quiet: true });
      expect(printed.mock.calls.map(([line]) => line)).toEqual([
        "demo built in dist/apps/demo",
        "Warning: apps/demo/akan.budget.json: /:lang loads 9 bytes brotli (shrink it)",
      ]);
    } finally {
      build.mockRestore();
      printed.mockRestore();
    }
  });

  test("build reports the route JS budget unless handed another budget mode", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const { app } = track(await createTempApp("demo"));
    app.scanSync = mock(async () => undefined) as never;
    const build = spyOn(script.applicationRunner, "build").mockImplementation(async () => {
      throw new Error("stopped");
    });
    try {
      await expect(script.build(app, { quiet: true })).rejects.toThrow("stopped");
      for (const budget of ["enforce", "update", "raise"] as const)
        await expect(script.build(app, { quiet: true, budget })).rejects.toThrow("stopped");
      expect(build.mock.calls.map(([, options]) => options?.budget)).toEqual(["report", "enforce", "update", "raise"]);
    } finally {
      build.mockRestore();
    }
  });

  test("startOne skips dependency install for single database mode", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const { app, getMissingDatabaseModeDependencySpecs, recorder } = createStartApp();
    stubStart(script, recorder);

    await script.startOne(app as never, { write: false });

    expect(getMissingDatabaseModeDependencySpecs).toHaveBeenCalledWith("single");
    expect(recorder.names()).not.toContain("confirmInstall");
    expect(recorder.names()).not.toContain("workspace.spawn");
    expect(recorder.names()).not.toContain("dbup");
    expect(recorder.names()).toContain("runner.start");
  });

  test("startOne confirms and installs missing multiple-mode dependencies before dbup", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const installSpecs = ["bullmq@^5.76.10", "ioredis@^5.10.1"];
    const { app, recorder } = createStartApp({
      databaseMode: "multiple",
      installSpecsByMode: { multiple: installSpecs },
    });
    stubStart(script, recorder);

    await script.startOne(app as never, { write: false });

    expect(recorder.calls).toContainEqual({
      name: "confirmInstall",
      args: ["multiple", installSpecs],
    });
    expect(recorder.calls).toContainEqual({
      name: "workspace.spawn",
      args: ["bun", ["add", ...installSpecs], { stdio: "inherit" }],
    });
    expect(recorder.calls).toContainEqual({
      name: "workspace.getPackageJson",
      args: [{ refresh: true }],
    });
    expect(recorder.names().indexOf("workspace.spawn")).toBeLessThan(recorder.names().indexOf("dbup"));
    expect(recorder.names().indexOf("dbup")).toBeLessThan(recorder.names().indexOf("runner.start"));
  });

  test("startOne aborts before install and startup when dependency install is declined", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const installSpecs = ["ioredis@^5.10.1"];
    const { app, recorder } = createStartApp({
      databaseMode: "multiple",
      installSpecsByMode: { multiple: installSpecs },
    });
    stubStart(script, recorder, { confirmed: false });

    await expect(script.startOne(app as never, { write: false })).rejects.toThrow(
      "Database mode 'multiple' requires missing dependencies",
    );

    expect(recorder.calls).toContainEqual({
      name: "confirmInstall",
      args: ["multiple", installSpecs],
    });
    expect(recorder.names()).not.toContain("workspace.spawn");
    expect(recorder.names()).not.toContain("dbup");
    expect(recorder.names()).not.toContain("runner.start");
  });

  test("startOne does not reinstall existing database-mode dependencies", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const { app, recorder } = createStartApp({ databaseMode: "multiple" });
    stubStart(script, recorder);

    await script.startOne(app as never, { write: false });

    expect(recorder.names()).not.toContain("confirmInstall");
    expect(recorder.names()).not.toContain("workspace.spawn");
    expect(recorder.names()).toContain("dbup");
    expect(recorder.names()).toContain("runner.start");
  });

  test("startOne uses AKAN_DATABASE_MODE override for dependency install", async () => {
    const previousDatabaseMode = process.env.AKAN_DATABASE_MODE;
    process.env.AKAN_DATABASE_MODE = "cluster";
    try {
      const script = CommandContainer.get(ApplicationScript);
      const clusterSpecs = ["bullmq@^5.76.10", "ioredis@^5.10.1", "postgres@^3.4.9"];
      const { app, getMissingDatabaseModeDependencySpecs, recorder } = createStartApp({
        modes: ["multiple", "cluster"],
        installSpecsByMode: { cluster: clusterSpecs },
      });
      stubStart(script, recorder);

      await script.startOne(app as never, { write: false });

      expect(getMissingDatabaseModeDependencySpecs).toHaveBeenCalledWith("cluster");
      expect(recorder.calls).toContainEqual({
        name: "confirmInstall",
        args: ["cluster", clusterSpecs],
      });
      expect(recorder.calls).toContainEqual({
        name: "workspace.spawn",
        args: ["bun", ["add", ...clusterSpecs], { stdio: "inherit" }],
      });
    } finally {
      if (previousDatabaseMode === undefined) delete process.env.AKAN_DATABASE_MODE;
      else process.env.AKAN_DATABASE_MODE = previousDatabaseMode;
    }
  });

  test("startOne refuses a database mode the app does not declare", async () => {
    const previousDatabaseMode = process.env.AKAN_DATABASE_MODE;
    process.env.AKAN_DATABASE_MODE = "cluster";
    try {
      const script = CommandContainer.get(ApplicationScript);
      const { app, recorder } = createStartApp({ databaseMode: "multiple" });
      Object.assign(script.applicationRunner, {
        start: async (...args: unknown[]) => {
          recorder.record("runner.start", ...args);
          return {};
        },
      });

      await expect(script.startOne(app as never, { write: false })).rejects.toThrow('Add "cluster" to database.modes');
      expect(recorder.names()).not.toContain("runner.start");
    } finally {
      if (previousDatabaseMode === undefined) delete process.env.AKAN_DATABASE_MODE;
      else process.env.AKAN_DATABASE_MODE = previousDatabaseMode;
    }
  });

  test("prepares apps, libs, and packages before running tests", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const recorder = createCallRecorder();
    const app = Object.setPrototypeOf(
      createFakeExecutor("app", { type: "app" }, recorder),
      AppExecutor.prototype,
    ) as AppExecutor;
    const lib = Object.setPrototypeOf(
      createFakeExecutor("lib", { type: "lib" }, recorder),
      LibExecutor.prototype,
    ) as LibExecutor;
    const pkg = Object.setPrototypeOf(createFakeExecutor("pkg", {}, recorder), PkgExecutor.prototype) as PkgExecutor;

    script.libraryScript.syncLibrary = async (target: unknown) => {
      recorder.record("syncLibrary", target);
      return undefined as never;
    };
    script.applicationRunner.test = async (target: unknown) => {
      recorder.record("runner.test", target);
    };

    await script.test(app, { write: false });
    await script.test(lib, { write: true });
    await script.test(pkg, { write: true });

    expect(recorder.names()).toEqual([
      "app.spinning",
      "app.scanSync",
      "spinner.succeed",
      "runner.test",
      "syncLibrary",
      "lib.spinning",
      "spinner.succeed",
      "runner.test",
      "pkg.spinning",
      "pkg.scan",
      "spinner.succeed",
      "runner.test",
    ]);
  });

  test("with coverage, has bun write lcov under local/coverage at the target's own path", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const recorder = createCallRecorder();
    const { root, pkg } = track(await createTempPackage());
    pkg.scan = (async () => undefined) as never;
    const workspace = { workspaceRoot: root };
    const app = Object.setPrototypeOf(
      createFakeExecutor("demo", { type: "app", workspace, cwdPath: path.join(root, "apps", "demo") }, recorder),
      AppExecutor.prototype,
    ) as AppExecutor;
    const lib = Object.setPrototypeOf(
      createFakeExecutor("shared", { type: "lib", workspace, cwdPath: path.join(root, "libs", "shared") }, recorder),
      LibExecutor.prototype,
    ) as LibExecutor;
    script.applicationRunner.resolveTestPaths = () => [];
    script.applicationRunner.test = async (target: { name: string }, _paths?: string[], flags?: string[]) => {
      recorder.record("runner.test", target.name, flags);
    };
    const coverageOf = (...dirs: string[]) => [
      "--coverage",
      "--coverage-reporter=text",
      "--coverage-reporter=lcov",
      `--coverage-dir=${path.join(root, "local", "coverage", ...dirs)}`,
    ];

    await script.test(app, { write: false, coverage: true });
    await script.test(lib, { write: false, coverage: true });
    await script.test(pkg, { write: false, coverage: true });
    await script.test(pkg, { write: false });

    expect(recorder.calls.filter(({ name }) => name === "runner.test").map(({ args }) => args)).toEqual([
      ["demo", coverageOf("apps", "demo")],
      ["shared", coverageOf("libs", "shared")],
      ["@sample/tool", coverageOf("pkgs", "@sample", "tool")],
      ["@sample/tool", []],
    ]);
  });

  test("with --parallel, has bun spread the files over that many processes by the target's own timings", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const { root, pkg } = track(await createTempPackage());
    pkg.scan = (async () => undefined) as never;
    script.applicationRunner.resolveTestPaths = () => [];
    const flagsOf: string[][] = [];
    script.applicationRunner.test = async (_target: unknown, _paths?: string[], flags?: string[]) => {
      flagsOf.push(flags ?? []);
    };

    await script.test(pkg, { write: false, parallel: 2 });
    await script.test(pkg, { write: false, parallel: 1 });
    for (const parallel of [0, 1.5, Number.NaN])
      await expect(script.test(pkg, { write: false, parallel })).rejects.toMatchObject({
        code: "usage",
        exitCode: 2,
        message: expect.stringContaining("--parallel takes a whole number"),
      });

    expect(flagsOf).toEqual([
      [
        "--parallel=2",
        `--timings=${path.join(root, "local", "test-timings", "pkgs", "@sample", "tool", "timings.json")}`,
        "--update-timings",
      ],
      [],
    ]);
  });

  test("with --parallel, drops a timings file bun would refuse, so the run records it again instead of failing", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const { root, pkg } = track(await createTempPackage());
    pkg.scan = (async () => undefined) as never;
    script.applicationRunner.resolveTestPaths = () => [];
    script.applicationRunner.test = async () => undefined;
    const timings = path.join(root, "local", "test-timings", "pkgs", "@sample", "tool", "timings.json");
    await mkdir(path.dirname(timings), { recursive: true });
    const kept = ["", '{"version":1,"files":{"./a.test.ts":120}}'];
    const dropped = [
      "{bad",
      " ",
      "[]",
      '{"version":2,"files":{}}',
      '{"version":1,"files":[]}',
      '{"version":1,"files":{"a":"x"}}',
    ];

    for (const text of kept) {
      await Bun.write(timings, text);
      await script.test(pkg, { write: false, parallel: 2 });
      expect(await Bun.file(timings).text()).toBe(text);
    }
    for (const text of dropped) {
      await Bun.write(timings, text);
      await script.test(pkg, { write: false, parallel: 2 });
      expect(existsSync(timings)).toBe(false);
    }
  });

  test("with --junit, has bun write the report to that path from the caller's folder, creating its folder", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const { root, pkg } = track(await createTempPackage());
    pkg.scan = (async () => undefined) as never;
    script.applicationRunner.resolveTestPaths = () => [];
    const flagsOf: string[][] = [];
    script.applicationRunner.test = async (_target: unknown, _paths?: string[], flags?: string[]) => {
      flagsOf.push(flags ?? []);
    };
    const outfile = path.join(root, "local", "junit", "tool.xml");

    await script.test(pkg, { write: false, junit: path.relative(process.cwd(), outfile) });

    expect(flagsOf).toEqual([["--reporter=junit", `--reporter-outfile=${outfile}`]]);
    expect(existsSync(path.dirname(outfile))).toBe(true);
  });

  test("tests a library with --write false by scanning it, not syncing it", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const recorder = createCallRecorder();
    const lib = Object.setPrototypeOf(
      createFakeExecutor("lib", { type: "lib" }, recorder),
      LibExecutor.prototype,
    ) as LibExecutor;
    script.libraryScript.syncLibrary = async (target: unknown) => {
      recorder.record("syncLibrary", target);
      return undefined as never;
    };
    script.applicationRunner.test = async (target: unknown) => {
      recorder.record("runner.test", target);
    };

    await script.test(lib, { write: false });

    expect(recorder.names()).toEqual(["lib.scan", "lib.spinning", "spinner.succeed", "runner.test"]);
    expect(recorder.calls).toContainEqual({ name: "lib.scan", args: [{ write: false }] });
  });

  test("typecheck syncs an app or a library first, and with --write false writes neither", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const recorder = createCallRecorder();
    const app = Object.setPrototypeOf(
      createFakeExecutor("app", { type: "app" }, recorder),
      AppExecutor.prototype,
    ) as AppExecutor;
    const lib = Object.setPrototypeOf(
      createFakeExecutor("lib", { type: "lib" }, recorder),
      LibExecutor.prototype,
    ) as LibExecutor;
    script.libraryScript.syncLibrary = async (target: unknown) => {
      recorder.record("syncLibrary", target);
      return undefined as never;
    };
    script.applicationRunner.typecheck = async () => recorder.record("runner.typecheck");
    script.applicationRunner.typecheckLibrary = async () => recorder.record("runner.typecheckLibrary");

    await script.typecheck(lib, { write: false });
    await script.typecheck(lib, { write: true });
    await script.typecheck(app, { write: false });

    expect(recorder.names().filter((name) => name !== "spinner.succeed" && !name.endsWith(".spinning"))).toEqual([
      "lib.scan",
      "runner.typecheckLibrary",
      "syncLibrary",
      "runner.typecheckLibrary",
      "app.scanSync",
      "runner.typecheck",
    ]);
    expect(recorder.calls).toContainEqual({ name: "lib.scan", args: [{ write: false }] });
    expect(recorder.calls).toContainEqual({ name: "app.scanSync", args: [{ write: false }] });
  });

  test("blocks local Android release without explicit opt-in", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const recorder = createCallRecorder();
    const app = createFakeExecutor(
      "demo",
      {
        scanSync: async (...args: unknown[]) => recorder.record("scanSync", ...args),
      },
      recorder,
    );

    await expect(script.releaseAndroid(app as never, "apk", { env: "local" })).rejects.toThrow(
      "--env local is blocked",
    );
    expect(recorder.names()).toEqual(["scanSync"]);
  });

  test("startIos hands the device and team to the runner for iOS", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const recorder = createCallRecorder();
    const app = createFakeExecutor(
      "demo",
      { scanSync: async (...args: unknown[]) => recorder.record("scanSync", ...args) },
      recorder,
    );
    script.applicationRunner.startMobile = async (...args: unknown[]) => {
      recorder.record("runner.startMobile", ...args);
    };

    await script.startIos(app as never, { target: "default", device: "iPhone 17", teamId: "TEAM1", write: false });

    expect(recorder.calls).toContainEqual({ name: "scanSync", args: [{ write: false }] });
    expect(recorder.calls).toContainEqual({
      name: "runner.startMobile",
      args: [app, "ios", { target: "default", device: "iPhone 17", teamId: "TEAM1" }],
    });
  });
});

describe("ApplicationScript desktop", () => {
  test("startDesktop runs the target on this computer's desktop platform, with no device or team to pick", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const recorder = createCallRecorder();
    const app = createFakeExecutor(
      "demo",
      { scanSync: async (...args: unknown[]) => recorder.record("scanSync", ...args) },
      recorder,
    );
    const startMobile = script.applicationRunner.startMobile;
    script.applicationRunner.startMobile = async (...args: unknown[]) => {
      recorder.record("runner.startMobile", ...args);
    };
    try {
      await script.startDesktop(app as never, { target: "default", operation: "release", write: false });
    } finally {
      script.applicationRunner.startMobile = startMobile;
    }

    expect(recorder.calls).toContainEqual({ name: "scanSync", args: [{ write: false }] });
    expect(recorder.calls).toContainEqual({
      name: "runner.startMobile",
      args: [app, NativeApp.desktopPlatform(), { target: "default", operation: "release" }],
    });
    const optionNames = getArgMetas(ApplicationCommand, "startDesktop")[1].map((meta) => meta.name);
    expect(optionNames).toEqual(["target", "env", "release", "write"]);
  });

  const desktopDevHarness = ({
    answers,
    carries = true,
    modes = ["single"],
  }: {
    answers: boolean;
    carries?: boolean;
    modes?: DatabaseMode[];
  }) => {
    const script = CommandContainer.get(ApplicationScript);
    const recorder = createCallRecorder();
    const app = createFakeExecutor(
      "demo",
      {
        scanSync: async () => undefined,
        getDevPort: async () => 8482,
        getConfig: async () => ({ app: { name: "demo" }, database: { modes } }),
        log: () => undefined,
        workspace: { workspaceRoot: "/workspace" },
      },
      recorder,
    );
    const saved = {
      answers: ApplicationRunner.answers,
      startTarget: ApplicationRunner.startTarget,
      startOne: script.startOne,
      startDesktop: script.applicationRunner.startDesktop,
      timeout: ApplicationScript.devServerReadyTimeoutMs,
    };
    ApplicationRunner.startTarget = async () => ({
      name: "default",
      config: { desktop: { server: carries } } as never,
    });
    ApplicationRunner.answers = async (url: string, _appName: string, workspaceRoot: string) => {
      recorder.record("answers", url, workspaceRoot);
      return answers;
    };
    script.applicationRunner.startDesktop = async (...args: unknown[]) => {
      recorder.record("runner.startDesktop", ...args);
    };
    const restore = () => {
      ApplicationRunner.answers = saved.answers;
      ApplicationRunner.startTarget = saved.startTarget;
      script.startOne = saved.startOne;
      script.applicationRunner.startDesktop = saved.startDesktop;
      ApplicationScript.devServerReadyTimeoutMs = saved.timeout;
    };
    return { script, recorder, app, restore };
  };

  test("a desktop app carrying its server follows a dev server that already answers, and starts none", async () => {
    const { script, recorder, app, restore } = desktopDevHarness({ answers: true });
    script.startOne = async () => {
      recorder.record("startOne");
      return undefined as never;
    };
    try {
      await script.startDesktop(app as never, { target: "default", write: false });
    } finally {
      restore();
    }

    expect(recorder.names()).toEqual(["answers", "runner.startDesktop"]);
    expect(recorder.calls[0]?.args).toEqual(["http://localhost:8482", "/workspace"]);
    expect(recorder.calls[1]?.args[1]).toMatchObject({ target: "default", interrupt: expect.any(Object) });
  });

  test("a desktop app carrying its server needs database mode single in dev too, and says so before a dev server boots", async () => {
    const { script, recorder, app, restore } = desktopDevHarness({ answers: false, modes: ["cluster"] });
    script.startOne = async () => {
      recorder.record("startOne");
      return undefined as never;
    };
    try {
      await expect(script.startDesktop(app as never, { write: false })).rejects.toThrow(
        "only database mode single runs (no Redis or Postgres); apps/demo/akan.config.ts declares cluster",
      );
    } finally {
      restore();
    }

    expect(recorder.names()).toEqual([]);
  });

  test("a desktop app carrying its server stops the local database the dev server brought up when that fails to start", async () => {
    const { script, recorder, app, restore } = desktopDevHarness({ answers: false });
    Object.assign(app, {
      getConfig: async () =>
        ({
          app: { name: "demo" },
          database: { modes: ["multiple", "single"] },
          resolveDatabaseMode: () => "multiple",
          getMissingDatabaseModeDependencySpecs: () => [],
        }) as unknown as AkanAppConfig,
      getEnv: () => "local",
      spinning: () => ({ succeed: () => undefined, fail: () => undefined }),
    });
    const dbup = script.dbup;
    const dbdown = script.dbdown;
    script.dbup = async (...args: unknown[]) => {
      recorder.record("dbup", ...args);
      return false;
    };
    script.dbdown = async () => {
      recorder.record("dbdown");
    };
    const start = script.applicationRunner.start;
    script.applicationRunner.start = async () => {
      throw new Error("the dev host did not start");
    };
    try {
      await expect(script.startDesktop(app as never, { write: false })).rejects.toThrow("the dev host did not start");
    } finally {
      restore();
      Object.assign(script, { dbup, dbdown });
      script.applicationRunner.start = start;
    }

    expect(recorder.names()).toEqual(["answers", "dbup", "dbdown"]);
  });

  test("a desktop app carrying its server starts akan start, opens the app once it serves, and stops it when the app ends", async () => {
    const { script, recorder, app, restore } = desktopDevHarness({ answers: false });
    script.startOne = async (_app, options) => {
      recorder.record("startOne", options?.write);
      setTimeout(() => options?.onDevEvent?.({ app: "demo", state: "ready" }), 5);
      return {
        stop: async () => {
          recorder.record("devServer.stop");
        },
      } as never;
    };
    try {
      await script.startDesktop(app as never, { target: "default", write: false });
    } finally {
      restore();
    }

    expect(recorder.names()).toEqual(["answers", "startOne", "runner.startDesktop", "devServer.stop"]);
    expect(recorder.calls[1]?.args).toEqual([false]);
  });

  test("a desktop app carrying its server stops the dev server it started when that never serves", async () => {
    const { script, recorder, app, restore } = desktopDevHarness({ answers: false });
    ApplicationScript.devServerReadyTimeoutMs = 20;
    script.startOne = async () =>
      ({
        stop: async () => {
          recorder.record("devServer.stop");
        },
      }) as never;
    try {
      await expect(script.startDesktop(app as never, { write: false })).rejects.toThrow(
        "akan start demo did not answer within",
      );
    } finally {
      restore();
    }

    expect(recorder.names()).toEqual(["answers", "devServer.stop"]);
  });

  test("a desktop app carrying its server stops at once when the dev server it started gives up", async () => {
    const { script, recorder, app, restore } = desktopDevHarness({ answers: false });
    script.startOne = async (_app, options) => {
      setTimeout(() => options?.onDevEvent?.({ app: "demo", state: "failed" }), 5);
      return {
        stop: async () => {
          recorder.record("devServer.stop");
        },
      } as never;
    };
    const startedAt = Date.now();
    try {
      await expect(script.startDesktop(app as never, { write: false })).rejects.toThrow(
        "akan start demo gave up restarting its server",
      );
    } finally {
      restore();
    }

    expect(Date.now() - startedAt).toBeLessThan(5_000);
    expect(recorder.names()).toEqual(["answers", "devServer.stop"]);
  });

  test("a desktop app carrying its server asks for one target before it starts a dev server", async () => {
    const { script, recorder, app, restore } = desktopDevHarness({ answers: false });
    ApplicationRunner.startTarget = async () => {
      throw new Error("start-desktop runs one native target at a time; pass --target <name>.");
    };
    script.startOne = async () => {
      recorder.record("startOne");
      return undefined as never;
    };
    try {
      await expect(script.startDesktop(app as never, { write: false })).rejects.toThrow(
        "start-desktop runs one native target at a time",
      );
    } finally {
      restore();
    }

    expect(recorder.names()).toEqual([]);
  });

  test("a release build starts no dev server: the runner builds the server into the app", async () => {
    const { script, recorder, app, restore } = desktopDevHarness({ answers: false });
    try {
      await script.startDesktop(app as never, { operation: "release", write: false });
    } finally {
      restore();
    }

    expect(recorder.names()).toEqual(["runner.startDesktop"]);
    expect(recorder.calls[0]?.args[1]).toEqual({ operation: "release" });
  });

  test("a desktop app with no server of its own follows akan start without starting one", async () => {
    const { script, recorder, app, restore } = desktopDevHarness({ answers: false, carries: false });
    script.startOne = async () => {
      recorder.record("startOne");
      return undefined as never;
    };
    try {
      await script.startDesktop(app as never, { target: "default", write: false });
    } finally {
      restore();
    }

    expect(recorder.names()).toEqual(["runner.startDesktop"]);
    expect(recorder.calls[0]?.args[1]).toEqual({ target: "default" });
  });

  test("buildDesktop builds the targets for this computer's desktop platform", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const recorder = createCallRecorder();
    const app = createFakeExecutor(
      "demo",
      { scanSync: async (...args: unknown[]) => recorder.record("scanSync", ...args) },
      recorder,
    );
    const buildMobile = script.applicationRunner.buildMobile;
    script.applicationRunner.buildMobile = async (...args: unknown[]) => {
      recorder.record("runner.buildMobile", ...args);
    };
    const command = CommandContainer.get(ApplicationCommand);
    const handler = getTargetMetas(ApplicationCommand).find((meta) => meta.key === "buildDesktop")?.handler;
    try {
      await script.buildDesktop(app as never, { target: "default", env: "develop", profile: "debug", write: false });
      await handler?.call(command, app, "default", "main", false, true, false);
    } finally {
      script.applicationRunner.buildMobile = buildMobile;
    }

    expect(recorder.calls).toContainEqual({ name: "scanSync", args: [{ write: false }] });
    expect(recorder.calls).toContainEqual({
      name: "runner.buildMobile",
      args: [app, NativeApp.desktopPlatform(), { target: "default", env: "develop", profile: "debug" }],
    });
    expect(recorder.calls).toContainEqual({
      name: "runner.buildMobile",
      args: [app, NativeApp.desktopPlatform(), { target: "default", env: "main", profile: "release", installer: true }],
    });
    const optionNames = getArgMetas(ApplicationCommand, "buildDesktop")[1].map((meta) => meta.name);
    expect(optionNames).toEqual(["target", "env", "debug", "installer", "arch", "sign", "notarize", "write"]);
  });
});

describe("ApplicationRunner mobile", () => {
  const mobileApp = (targets: Record<string, object>) =>
    ({
      name: "demo",
      cwdPath: "/repo/apps/demo",
      workspace: { workspaceRoot: "/repo" },
      getDevPort: async () => 1,
      getConfig: async () => ({
        basePaths: new Set<string>(),
        i18n: { defaultLocale: "en", locales: ["en"] },
        native: { targets },
      }),
    }) as unknown as AppExecutor;
  const target = (name: string) => ({ name, appName: "Demo", appId: "com.demo.app", version: "1.0.0", buildNum: 1 });

  test("a dev build needs `akan start` answering first", async () => {
    await expect(new ApplicationRunner().startMobile(mobileApp({ default: target("default") }), "ios")).rejects.toThrow(
      "No dev server answers on http://localhost:1; run `akan start demo` first.",
    );
  });

  test("a dev server is reused only when it is this app's", async () => {
    const serve = (appName?: string, pid?: number) =>
      Bun.serve({
        port: 0,
        fetch: (req) => {
          const { pathname } = new URL(req.url);
          if (pathname === "/_akan/app/health") return Response.json({ status: "running", ...(pid ? { pid } : {}) });
          if (pathname === "/_akan/app/info" && appName) return Response.json({ appName, environment: "local" });
          return new Response("not found", { status: 404 });
        },
      });
    const own = serve("demo");
    const other = serve("admin");
    const older = serve(undefined, 4242);
    const foreign = serve();
    try {
      expect(await ApplicationRunner.answers(`http://localhost:${own.port}`, "demo", "/repo")).toBe(true);
      await expect(ApplicationRunner.answers(`http://localhost:${other.port}`, "demo", "/repo")).rejects.toThrow(
        `http://localhost:${other.port} is the dev server of admin, not demo.`,
      );
      await expect(ApplicationRunner.answers(`http://localhost:${older.port}`, "demo", "/repo")).rejects.toThrow(
        `http://localhost:${older.port} is an akan dev server (pid 4242) too old to say which app it serves. Stop it (\`akan start demo --kill\` takes the port over)`,
      );
      await expect(ApplicationRunner.answers(`http://localhost:${foreign.port}`, "demo", "/repo")).rejects.toThrow(
        "answers, but not as an akan dev server",
      );
    } finally {
      for (const server of [own, other, older, foreign]) server.stop(true);
    }
    expect(await ApplicationRunner.answers(`http://localhost:${own.port}`, "demo", "/repo")).toBe(false);
  });

  test("a dev server of the same app is followed only from the checkout it runs from", async () => {
    const [here, there] = [track(await createTempApp("demo")).root, track(await createTempApp("demo")).root];
    const serve = (workspaceRoot?: string) =>
      Bun.serve({
        port: 0,
        fetch: (req) => {
          const { pathname } = new URL(req.url);
          if (pathname === "/_akan/app/health") return Response.json({ status: "running" });
          if (pathname === "/_akan/app/info")
            return Response.json({
              appName: "demo",
              operationMode: "local",
              ...(workspaceRoot ? { workspaceRoot } : {}),
            });
          return new Response("not found", { status: 404 });
        },
      });
    const own = serve(here);
    const other = serve(there);
    const unnamed = serve();
    try {
      expect(await ApplicationRunner.answers(`http://localhost:${own.port}`, "demo", here)).toBe(true);
      expect(await ApplicationRunner.answers(`http://localhost:${own.port}`, "demo", `${here}/apps/..`)).toBe(true);
      await expect(ApplicationRunner.answers(`http://localhost:${other.port}`, "demo", here)).rejects.toThrow(
        `http://localhost:${other.port} is the dev server of demo in ${there}, not in ${here}. Stop it (\`akan start demo --kill\` takes the port over)`,
      );
      expect(await ApplicationRunner.answers(`http://localhost:${unnamed.port}`, "demo", here)).toBe(true);
    } finally {
      for (const server of [own, other, unnamed]) server.stop(true);
    }
  });

  test("publish-update checks every target's updates settings and signing key before it builds anything", async () => {
    const home = track({ root: await mkdtemp(path.join(os.tmpdir(), "akan-native-home-")) }).root;
    const pem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    await writeText(path.join(home, "keys", "com.demo.app.update.key"), pem);
    const { x } = createPublicKey(createPrivateKey(pem)).export({ format: "jwk" });
    const updates = {
      url: "https://releases.example.com/demo",
      publicKey: Buffer.from(x ?? "", "base64url").toString("base64"),
    };
    const recorder = createCallRecorder();
    const publishing = (admin: object) =>
      ({
        name: "demo",
        cwdPath: path.join(repoRoot, "apps/minimal"),
        dist: { cwdPath: home },
        workspace: { workspaceRoot: repoRoot },
        getScanInfo: () => ({ getLibs: () => [] }),
        collectPlugins: async () => [],
        getConfig: async () => ({
          basePaths: new Set<string>(),
          i18n: { defaultLocale: "en", locales: ["en"] },
          native: { targets: { store: { ...target("store"), updates }, admin: { ...target("admin"), ...admin } } },
        }),
        prepareCommand: async () => {
          recorder.record("build");
          throw new Error("built");
        },
        logger: { warn: () => undefined },
      }) as unknown as AppExecutor;
    const saved = {
      AKAN_NATIVE_HOME: process.env.AKAN_NATIVE_HOME,
      AKAN_NATIVE_UPDATE_KEY: process.env.AKAN_NATIVE_UPDATE_KEY,
    };
    process.env.AKAN_NATIVE_HOME = home;
    delete process.env.AKAN_NATIVE_UPDATE_KEY;
    try {
      await expect(new ApplicationRunner().publishUpdate(publishing({}), "android", { target: "all" })).rejects.toThrow(
        "Native target 'admin' has no updates: add native.updates: { url, publicKey } to akan.config.ts",
      );
      const otherKey = generateKeyPairSync("ed25519")
        .publicKey.export({ format: "der", type: "spki" })
        .subarray(12)
        .toString("base64");
      await expect(
        new ApplicationRunner().publishUpdate(publishing({ updates: { ...updates, publicKey: otherKey } }), "android", {
          target: "all",
        }),
      ).rejects.toThrow("Native target 'admin': the key at");
      await expect(
        new ApplicationRunner().publishUpdate(publishing({ updates }), "android", {
          target: "all",
          revoke: ["0123456789abcdef"],
        }),
      ).rejects.toThrow("Native target 'store': --revoke 0123456789abcdef: updates.publicKeys holds");
      await expect(
        new ApplicationRunner().publishUpdate(publishing({ updates }), "android", {
          target: "all",
          resetSequence: true,
        }),
      ).rejects.toThrow("Native target 'store': --reset-sequence counts only in a release that revokes a key");
    } finally {
      for (const [key, value] of Object.entries(saved))
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    expect(recorder.names()).toEqual([]);
  });

  test("update-keygen says where a desktop app's url comes from, and prints a phone's key as before", async () => {
    const home = track({ root: await mkdtemp(path.join(os.tmpdir(), "akan-native-home-")) }).root;
    const pem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    await writeText(path.join(home, "keys", "com.demo.app.update.key"), pem);
    const { x } = createPublicKey(createPrivateKey(pem)).export({ format: "jwk" });
    const publicKey = Buffer.from(x ?? "", "base64url").toString("base64");
    const logged: string[] = [];
    const keygen = {
      name: "demo",
      cwdPath: path.join(repoRoot, "apps/minimal"),
      dist: { cwdPath: home },
      workspace: { workspaceRoot: repoRoot },
      getScanInfo: () => ({ getLibs: () => [] }),
      collectPlugins: async () => [],
      getConfig: async () => ({
        basePaths: new Set<string>(),
        i18n: { defaultLocale: "en", locales: ["en"] },
        native: { targets: { store: target("store") } },
      }),
      log: (message: string) => logged.push(message),
      logger: { warn: () => undefined },
    } as unknown as AppExecutor;
    const saved = {
      AKAN_NATIVE_HOME: process.env.AKAN_NATIVE_HOME,
      AKAN_NATIVE_UPDATE_KEY: process.env.AKAN_NATIVE_UPDATE_KEY,
    };
    process.env.AKAN_NATIVE_HOME = home;
    delete process.env.AKAN_NATIVE_UPDATE_KEY;
    try {
      await new ApplicationRunner().updateKeygen(keygen, "android");
      const phone = logged.splice(0);
      await new ApplicationRunner().updateKeygen(keygen, "desktop");

      const placeholder = `  native: { updates: { url: "https://…/demo", publicKeys: [${JSON.stringify(publicKey)}] } }`;
      expect(phone).toHaveLength(3);
      expect(phone[1]).toBe(placeholder);
      expect(phone[2]).toStartWith("  keyId ");
      expect(logged).toEqual([
        phone[0],
        placeholder,
        "  url: hosted on Akan Cloud, register this public key as an external key on the release screen and use the URL it gives; self-hosted, the public address you upload the release to",
        phone[2],
      ]);
    } finally {
      for (const [key, value] of Object.entries(saved))
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
  });

  test("only a desktop build of a target that declares desktop.server carries the server", () => {
    const carrying = { name: "kiosk", config: { ...target("kiosk"), desktop: { server: true } } };
    expect(ApplicationRunner.carriesServer(carrying, "windows")).toBe(true);
    expect(ApplicationRunner.carriesServer(carrying, "macos")).toBe(true);
    expect(ApplicationRunner.carriesServer(carrying, "android")).toBe(false);
    expect(ApplicationRunner.carriesServer(carrying, "ios")).toBe(false);
    expect(ApplicationRunner.carriesServer({ name: "store", config: target("store") }, "linux")).toBe(false);
    const omitting = { name: "kiosk", config: { ...target("kiosk"), desktop: { server: { omit: ["rclnodejs"] } } } };
    expect(ApplicationRunner.carriesServer(omitting, "macos")).toBe(true);
    expect(
      ApplicationRunner.carriesServer({ ...omitting, config: { ...target("k"), desktop: { server: false } } }),
    ).toBe(false);
  });

  test("the targets that carry one build's server agree on its packages, env profile and modules", () => {
    const carrying = (name: string, server: boolean | { omit?: string[]; profile?: string; modules?: string[] }) => ({
      name,
      config: { ...target(name), desktop: { server } },
    });
    expect(ApplicationRunner.carriedServer([carrying("a", { omit: ["rclnodejs"] })], "macos").omit).toEqual([
      "rclnodejs",
    ]);
    expect(ApplicationRunner.carriedServer([carrying("a", true), { name: "b", config: target("b") }], "macos")).toEqual(
      { omit: [], modules: [] },
    );
    expect(ApplicationRunner.carriedServer([carrying("a", { profile: "edge", modules: ["@edge"] })], "macos")).toEqual({
      omit: [],
      profile: "edge",
      modules: ["@edge"],
    });
    expect(() =>
      ApplicationRunner.carriedServer([carrying("a", { omit: ["rclnodejs"] }), carrying("b", true)], "macos"),
    ).toThrow("omit different packages (a: rclnodejs; b: none)");
    expect(() =>
      ApplicationRunner.carriedServer([carrying("a", { profile: "edge" }), carrying("b", true)], "macos"),
    ).toThrow("name different env profiles (a: edge; b: none)");
    expect(() =>
      ApplicationRunner.carriedServer([carrying("a", { modules: ["@edge"] }), carrying("b", true)], "macos"),
    ).toThrow("mount different modules (a: @edge; b: none)");
  });

  test("the targets that carry one build's server agree on an env whatever order its keys are written in", () => {
    const carrying = (name: string, env: Record<string, string>) => ({
      name,
      config: { ...target(name), desktop: { server: { env } } },
    });
    const sameEnv = [carrying("a", { SITE: "north", LANE: "2" }), carrying("b", { LANE: "2", SITE: "north" })];
    expect(ApplicationRunner.carriedServer(sameEnv, "macos").env).toEqual({ SITE: "north", LANE: "2" });
    expect(() =>
      ApplicationRunner.carriedServer([carrying("a", { SITE: "north" }), carrying("b", { SITE: "south" })], "macos"),
    ).toThrow('set a different env (a: {"SITE":"north"}; b: {"SITE":"south"})');
  });

  test("a dev build runs one target at a time", async () => {
    const app = mobileApp({ store: target("store"), admin: target("admin") });
    await expect(new ApplicationRunner().startMobile(app, "android", { target: "all" })).rejects.toThrow(
      "start-android runs one native target at a time",
    );
  });

  test("a desktop dev build names its own command when it is handed several targets", async () => {
    const app = mobileApp({ store: target("store"), admin: target("admin") });
    await expect(new ApplicationRunner().startDesktop(app, { target: "all" })).rejects.toThrow(
      "start-desktop runs one native target at a time",
    );
  });

  test("a desktop app carries its server only in database mode single, and says so before it builds", async () => {
    const app = {
      name: "demo",
      cwdPath: "/repo/apps/demo",
      workspace: { workspaceRoot: "/repo" },
      getConfig: async () => ({
        app: { name: "demo" },
        basePaths: new Set<string>(),
        database: { modes: ["cluster"] },
        native: { targets: { default: { ...target("default"), desktop: { server: true } } } },
      }),
    } as unknown as AppExecutor;
    await expect(new ApplicationRunner().buildDesktop(app)).rejects.toThrow(
      "only database mode single runs (no Redis or Postgres); apps/demo/akan.config.ts declares cluster",
    );
    await expect(new ApplicationRunner().startDesktop(app, { operation: "release" })).rejects.toThrow(
      "only database mode single runs",
    );
  });

  test("an Android release says which signing keys are missing before it builds anything", async () => {
    const saved = { ...process.env };
    for (const key of Object.keys(process.env)) if (key.startsWith("MYAPP_RELEASE_")) delete process.env[key];
    try {
      await expect(
        new ApplicationRunner().releaseAndroid(mobileApp({ default: target("default") }), "aab"),
      ).rejects.toThrow("set MYAPP_RELEASE_STORE_FILE, MYAPP_RELEASE_STORE_PASSWORD, MYAPP_RELEASE_KEY_ALIAS");
    } finally {
      Object.assign(process.env, saved);
    }
  });
});

const runsPackageTests = async () => {
  const { pkg } = track(await createTempPackage());
  await writeText(path.join(pkg.cwdPath, "src", "a.test.ts"), "");
  const runner = new ApplicationRunner();
  const spawn = mock(async () => "");
  pkg.spawn = spawn as never;

  await runner.test(pkg);
  expect(spawn).toHaveBeenCalledWith("bun", ["test", "--isolate"], {
    stdio: "inherit",
  });
};

const runsSignalTargetTests = async () => {
  const { root, lib } = track(await createTempLib("shared"));
  await writeText(
    `${root}/node_modules/akanjs/package.json`,
    JSON.stringify({
      name: "akanjs",
      version: "0.0.0",
      exports: { "./package.json": "./package.json" },
    }),
  );
  await writeText(`${root}/node_modules/akanjs/test/signalTest.preload.ts`, "export {};\n");
  await writeText(path.join(lib.cwdPath, "lib", "user", "user.signal.test.ts"), "");
  const runner = new ApplicationRunner();
  const spawn = mock(async () => "");
  lib.spawn = spawn as never;

  await runner.test(lib);

  expect(spawn).toHaveBeenCalledWith(
    "bun",
    [
      "test",
      "--isolate",
      "--preload",
      expect.stringContaining(path.join("node_modules", "akanjs", "test", "signalTest.preload.ts")),
    ],
    {
      env: {
        ...process.env,
        AKAN_TEST_SIGNAL: "1",
        AKAN_TEST_TARGET_TYPE: "lib",
        AKAN_TEST_TARGET_NAME: "shared",
        AKAN_TEST_LIBS: "",
        AKAN_RUNTIME_DIR: path.join(root, "local", "libs", "shared", "runtime"),
      },
      stdio: "inherit",
    },
  );
};

describe("ApplicationRunner", () => {
  test("dbup brings up only what a mode runs on", async () => {
    const { app } = track(await createTempApp("demo"));
    const runner = new ApplicationRunner();
    const calls: string[][] = [];
    app.workspace.spawn = (async (_command: string, args: string[]) => {
      calls.push(args);
      return "";
    }) as never;

    expect(await runner.dbup(app.workspace, "multiple")).toBe(false);
    expect(calls.at(-1)).toEqual(["compose", "up", "-d", "redis"]);
    await runner.dbup(app.workspace, "cluster");
    expect(calls.at(-1)).toEqual(["compose", "up", "-d", "redis", "postgres"]);
  });

  test("dbup names the service an older local compose file lacks instead of failing inside docker", async () => {
    const { app } = track(await createTempApp("demo"));
    await writeText(
      `${app.workspace.workspaceRoot}/local/docker-compose.yaml`,
      "services:\n  redis:\n    image: redis\n",
    );
    const runner = new ApplicationRunner();
    const spawn = mock(async () => "");
    app.workspace.spawn = spawn as never;

    await expect(runner.dbup(app.workspace, "cluster")).rejects.toThrow(
      "local/docker-compose.yaml declares no postgres service",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  test("transfers a database by booting the app as a script in the mode the shell names", async () => {
    const { app } = track(await createTempApp("demo"));
    await writeText(`${app.cwdPath}/server.ts`, "export const server = {};\n");
    const runner = new ApplicationRunner();
    const spawn = mock(async () => "");
    app.spawn = spawn as never;
    app.getCommandEnv = (env: Record<string, string>) => ({ ...env, AKAN_PUBLIC_APP_NAME: "demo" });
    app.getDatabaseModeEnv = async () => ({ AKAN_DATABASE_MODE: "cluster", AKAN_DATABASE_MODES: "single,cluster" });

    await runner.transferDatabase(app, "import", "local/transfer");

    const [command, args, options] = spawn.mock.calls[0] as unknown as [
      string,
      string[],
      { env: Record<string, string> },
    ];
    expect(command).toBe("bun");
    expect(args[1]).toContain(
      `importFrom(${JSON.stringify(path.join(app.workspace.workspaceRoot, "local/transfer"))})`,
    );
    expect(options.env).toMatchObject({ AKAN_COMMAND_TYPE: "script", AKAN_DATABASE_MODE: "cluster" });
  });

  test("validates app script filenames and spawns bun with command env", async () => {
    const { app } = track(await createTempApp("demo"));
    await writeText(`${app.cwdPath}/script/hello.ts`, "export default 1;\n");
    const runner = new ApplicationRunner();
    const spawn = mock(async () => "");
    app.spawn = spawn as never;
    app.getCommandEnv = (env: Record<string, string>) => ({
      ...env,
      AKAN_PUBLIC_APP_NAME: "demo",
    });
    app.getDatabaseModeEnv = async () => ({ AKAN_DATABASE_MODE: "cluster", AKAN_DATABASE_MODES: "single,cluster" });

    await expect(runner.runScript(app, "../secret")).rejects.toThrow("Invalid script filename");
    await expect(runner.runScript(app, "missing")).rejects.toThrow("Script file not found");

    await runner.runScript(app, "hello.ts");
    expect(spawn).toHaveBeenCalledWith("bun", [`${app.cwdPath}/script/hello.ts`], {
      cwd: app.workspace.workspaceRoot,
      env: {
        AKAN_COMMAND_TYPE: "script",
        AKAN_DATABASE_MODE: "cluster",
        AKAN_DATABASE_MODES: "single,cluster",
        AKAN_PUBLIC_APP_NAME: "demo",
      },
      stdio: "inherit",
    });
  });

  test("boots the app from the workspace root, where `akan start` keeps its local database", async () => {
    const { app } = track(await createTempApp("demo"));
    await writeText(`${app.cwdPath}/server.ts`, "export const server = {};\n");
    await writeText(`${app.cwdPath}/script/hello.ts`, "export default 1;\n");
    const runner = new ApplicationRunner();
    const spawn = mock(async () => "");
    app.spawn = spawn as never;
    app.getCommandEnv = (env: Record<string, string>) => env;
    app.getDatabaseModeEnv = async () => ({ AKAN_DATABASE_MODE: "single", AKAN_DATABASE_MODES: "single" });

    await runner.runScript(app, "hello");
    await runner.runConsole(app);
    await runner.transferDatabase(app, "export", "local/transfer");
    await runner.migrate(app, ["list"]);

    const calls = spawn.mock.calls as unknown as [string, string[], { cwd: string }][];
    expect(calls.map(([, , options]) => options.cwd)).toEqual(Array(4).fill(app.workspace.workspaceRoot));
  });

  test("runs bun test through the resolved executor", runsPackageTests);
  test("runs signal target tests with preload resolved from installed akanjs", runsSignalTargetTests);

  test("passes the flags it is given to bun test, before the named files", async () => {
    const { pkg } = track(await createTempPackage());
    const runner = new ApplicationRunner();
    const spawn = mock(async () => "");
    pkg.spawn = spawn as never;

    await runner.test(pkg, ["./tool.test.ts"], ["--coverage"]);

    expect(spawn).toHaveBeenCalledWith("bun", ["test", "--isolate", "--coverage", "./tool.test.ts"], {
      stdio: "inherit",
    });
  });

  test("names test files to bun as paths inside the target, from the target or the workspace root", async () => {
    const { root, app } = track(await createTempApp("demo"));
    await writeText(path.join(app.cwdPath, "lib", "user", "user.signal.test.ts"), "");
    await writeText(path.join(root, "libs", "shared", "lib", "x.test.ts"), "");
    await writeText(path.join(root, "apps", "other", "x.test.ts"), "");
    const runner = new ApplicationRunner();

    expect(
      runner.resolveTestPaths(app, [
        "lib/user/user.signal.test.ts",
        "apps/demo/lib/user/user.signal.test.ts",
        path.join(app.cwdPath, "lib", "user"),
        "./lib",
      ]),
    ).toEqual(["./lib/user/user.signal.test.ts", "./lib/user/user.signal.test.ts", "./lib/user", "./lib"]);
    expect(() => runner.resolveTestPaths(app, ["libs/shared/lib/x.test.ts"])).toThrow(
      "libs/shared/lib/x.test.ts is outside apps/demo",
    );
    expect(() => runner.resolveTestPaths(app, ["../other/x.test.ts"])).toThrow("is outside apps/demo");
    expect(() => runner.resolveTestPaths(app, [path.join(root, "package.json")])).toThrow("is outside apps/demo");
    expect(() => runner.resolveTestPaths(app, ["lib/user/missing.test.ts"])).toThrow(
      "lib/user/missing.test.ts names no file or folder in apps/demo",
    );
  });

  test("an app with no test file says so and runs nothing, instead of failing in bun", async () => {
    const { app } = track(await createTempApp("demo"));
    await writeText(path.join(app.cwdPath, "lib", "user", "user.signal.ts"), "");
    await writeText(path.join(app.cwdPath, "node_modules", "dep", "dep.test.ts"), "");
    await writeText(path.join(app.cwdPath, ".cache", "x.test.ts"), "");
    const spawn = mock(async () => "");
    app.spawn = spawn as never;
    const printed = spyOn(Logger, "rawLog").mockImplementation(() => undefined);

    await new ApplicationRunner().test(app);

    expect(spawn).not.toHaveBeenCalled();
    expect(printed).toHaveBeenCalledWith(
      "No *.test.ts or *.spec.ts file in apps/demo, so no test ran. A signal test goes beside its module, as lib/<model>/<model>.signal.test.ts.",
    );
  });

  test("a package with no test file says so without the signal test hint", async () => {
    const { pkg } = track(await createTempPackage());
    const spawn = mock(async () => "");
    pkg.spawn = spawn as never;
    const printed = spyOn(Logger, "rawLog").mockImplementation(() => undefined);

    await new ApplicationRunner().test(pkg);

    expect(spawn).not.toHaveBeenCalled();
    expect(printed).toHaveBeenCalledWith("No *.test.ts or *.spec.ts file in pkgs/@sample/tool, so no test ran.");
  });

  test("a test file under any of bun's suffixes still runs bun", async () => {
    for (const name of ["a.spec.tsx", "a_test.js", "a_spec.mts"]) {
      const { pkg } = track(await createTempPackage());
      await writeText(path.join(pkg.cwdPath, "src", "deep", name), "");
      const spawn = mock(async () => "");
      pkg.spawn = spawn as never;

      await new ApplicationRunner().test(pkg);
      expect(spawn).toHaveBeenCalledTimes(1);
    }
  });

  test("a test file bun runs in a linked folder, under an upper-case suffix or a dot name still runs bun", async () => {
    const layouts: ((root: string, cwd: string) => Promise<void>)[] = [
      async (root, cwd) => {
        await writeText(path.join(root, "libs", "shared", "page", "route.test.ts"), "");
        await mkdir(path.join(cwd, "page"), { recursive: true });
        await symlink(path.join(root, "libs", "shared", "page"), path.join(cwd, "page", "shared"));
      },
      async (_root, cwd) => await writeText(path.join(cwd, "src", "User.Test.TS"), ""),
      async (_root, cwd) => await writeText(path.join(cwd, "src", ".user.test.ts"), ""),
    ];
    for (const layout of layouts) {
      const { root, pkg } = track(await createTempPackage());
      await layout(root, pkg.cwdPath);
      const spawn = mock(async () => "");
      pkg.spawn = spawn as never;

      await new ApplicationRunner().test(pkg);
      expect(spawn).toHaveBeenCalledTimes(1);
    }
  });

  test("a linked folder that loops back is read once", async () => {
    const { pkg } = track(await createTempPackage());
    await mkdir(path.join(pkg.cwdPath, "src"), { recursive: true });
    await symlink(pkg.cwdPath, path.join(pkg.cwdPath, "src", "loop"));
    const spawn = mock(async () => "");
    pkg.spawn = spawn as never;
    spyOn(Logger, "rawLog").mockImplementation(() => undefined);

    await new ApplicationRunner().test(pkg);
    expect(spawn).not.toHaveBeenCalled();
  });

  test("named paths reach bun even when the target has no test file, so bun still fails on them", async () => {
    const { pkg } = track(await createTempPackage());
    await writeText(path.join(pkg.cwdPath, "src", "a.ts"), "");
    const spawn = mock(async () => "");
    pkg.spawn = spawn as never;
    const runner = new ApplicationRunner();

    await runner.test(pkg, runner.resolveTestPaths(pkg, ["src"]));
    expect(spawn).toHaveBeenCalledWith("bun", ["test", "--isolate", "./src"], { stdio: "inherit" });
  });

  test("passes the resolved test paths to bun after its own flags", async () => {
    const { pkg } = track(await createTempPackage());
    await writeText(path.join(pkg.cwdPath, "src", "a.test.ts"), "");
    const runner = new ApplicationRunner();
    const spawn = mock(async () => "");
    pkg.spawn = spawn as never;

    await runner.test(pkg, runner.resolveTestPaths(pkg, ["pkgs/@sample/tool/src/a.test.ts"]));
    expect(spawn).toHaveBeenCalledWith("bun", ["test", "--isolate", "./src/a.test.ts"], { stdio: "inherit" });
  });
});

describe("runner prompts on a stdin that is not a terminal", () => {
  const ownIsTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  beforeEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: undefined, configurable: true });
  });
  afterEach(() => {
    if (ownIsTTY) Object.defineProperty(process.stdin, "isTTY", ownIsTTY);
    else Reflect.deleteProperty(process.stdin, "isTTY");
  });

  test("a script left unnamed is refused with the scripts there are", async () => {
    const { app } = track(await createTempApp("demo"));
    await writeText(path.join(app.cwdPath, "script", "seed.ts"), "");
    await writeText(path.join(app.cwdPath, "script", "migrate.ts"), "");

    await expect(new ApplicationRunner().getScriptFilename(app)).rejects.toThrow(
      /^Missing argument 'filename': stdin is not a terminal to prompt on, so pass it on the command line \(choices: (seed, migrate|migrate, seed)\)\.$/,
    );
  });

  test("a database mode's missing packages are named to install instead of asked about", async () => {
    await expect(
      new ApplicationScript().confirmDatabaseModeDependencyInstall("cluster", ["postgres@3.4.5"]),
    ).rejects.toThrow(
      "Database mode 'cluster' requires missing dependencies: postgres@3.4.5: stdin is not a terminal to prompt on, so install them first with `bun add postgres@3.4.5`.",
    );
  });
});
