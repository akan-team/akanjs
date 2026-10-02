import { afterEach, describe, expect, mock, test } from "bun:test";
import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AkanAppConfig, DatabaseMode } from "@akanjs/devkit/akanConfig";
import { CommandContainer, getArgMetas, getTargetMetas } from "@akanjs/devkit/commandDecorators";
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
} from "@akanjs/devkit/testHelpers";
import { DatabaseModes } from "akanjs/base";
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
    expect(optionNames).toEqual(["target", "env", "debug", "installer", "arch", "write"]);
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
      const otherKey = Buffer.alloc(32, 7).toString("base64");
      await expect(
        new ApplicationRunner().publishUpdate(publishing({ updates: { ...updates, publicKey: otherKey } }), "android", {
          target: "all",
        }),
      ).rejects.toThrow("Native target 'admin': the key at");
    } finally {
      for (const [key, value] of Object.entries(saved))
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    expect(recorder.names()).toEqual([]);
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

  test("the targets that carry one build's server leave the same packages out of it", () => {
    const carrying = (name: string, server: boolean | { omit: string[] }) => ({
      name,
      config: { ...target(name), desktop: { server } },
    });
    expect(ApplicationRunner.serverOmit([carrying("a", { omit: ["rclnodejs"] })], "macos")).toEqual(["rclnodejs"]);
    expect(ApplicationRunner.serverOmit([carrying("a", true), { name: "b", config: target("b") }], "macos")).toEqual(
      [],
    );
    expect(() =>
      ApplicationRunner.serverOmit([carrying("a", { omit: ["rclnodejs"] }), carrying("b", true)], "macos"),
    ).toThrow("omit different packages (a: rclnodejs; b: none)");
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
    expect(spawn).toHaveBeenCalledWith("bun", ["script/hello.ts"], {
      env: {
        AKAN_COMMAND_TYPE: "script",
        AKAN_DATABASE_MODE: "cluster",
        AKAN_DATABASE_MODES: "single,cluster",
        AKAN_PUBLIC_APP_NAME: "demo",
      },
      stdio: "inherit",
    });
  });

  test("runs bun test through the resolved executor", runsPackageTests);
  test("runs signal target tests with preload resolved from installed akanjs", runsSignalTargetTests);
});
