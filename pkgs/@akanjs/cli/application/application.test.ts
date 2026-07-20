import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  type AkanAppConfig,
  AppExecutor,
  CommandContainer,
  type DatabaseMode,
  getArgMetas,
  getTargetMetas,
  LibExecutor,
  PkgExecutor,
} from "@akanjs/devkit";
import {
  cleanupCliTempWorkspace,
  createCallRecorder,
  createFakeExecutor,
  createTempApp,
  createTempLib,
  createTempPackage,
  writeText,
} from "../testHelpers";
import { ApplicationCommand } from "./application.command";
import { ApplicationRunner } from "./application.runner";
import { ApplicationScript } from "./application.script";

const tempRoots: string[] = [];

const createStartApp = ({
  databaseMode = "single",
  installSpecsByMode = {},
}: {
  databaseMode?: DatabaseMode;
  installSpecsByMode?: Partial<Record<DatabaseMode, string[]>>;
} = {}) => {
  const recorder = createCallRecorder();
  const workspace = createFakeExecutor(
    "workspace",
    {
      getPackageJson: async (...args: unknown[]) => {
        recorder.record("workspace.getPackageJson", ...args);
        return {};
      },
    },
    recorder,
  );
  const getMissingDatabaseModeDependencySpecs = mock((mode: DatabaseMode) => installSpecsByMode[mode] ?? []);
  const akanConfig = {
    defaultDatabaseMode: databaseMode,
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

const createMobileApp = ({ missingMobileSpecs = [] }: { missingMobileSpecs?: string[] } = {}) => {
  const recorder = createCallRecorder();
  const workspace = createFakeExecutor(
    "workspace",
    {
      getPackageJson: async (...args: unknown[]) => {
        recorder.record("workspace.getPackageJson", ...args);
        return {};
      },
    },
    recorder,
  );
  const getMissingMobileDependencySpecs = mock(() => missingMobileSpecs);
  const akanConfig = {
    getMissingMobileDependencySpecs,
  } as unknown as AkanAppConfig;
  const app = createFakeExecutor(
    "app",
    {
      scanSync: async (...args: unknown[]) => recorder.record("scanSync", ...args),
      getConfig: async () => akanConfig,
      workspace,
    },
    recorder,
  );
  return { app, akanConfig, getMissingMobileDependencySpecs, recorder, workspace };
};

afterEach(async () => {
  CommandContainer.clear();
  mock.restore();
  await Promise.all(tempRoots.splice(0).map((root) => cleanupCliTempWorkspace(root)));
});

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

  test("uses the same mobile target selector metadata across mobile commands", async () => {
    const mobileCommandKeys = ["buildIos", "buildAndroid", "startIos", "startAndroid", "releaseIos", "releaseAndroid"];
    const app = {
      getConfig: async () => ({
        basePaths: new Set(["store", "admin"]),
        mobile: {
          targets: {
            store: { name: "store", basePath: "store" },
          },
        },
      }),
    };

    for (const key of mobileCommandKeys) {
      const [, optionMetas] = getArgMetas(ApplicationCommand, key);
      const targetOption = optionMetas.find((meta) => meta.name === "target")?.argsOption;

      expect(targetOption?.ask).toBe("Select mobile target");
      expect(typeof targetOption?.enum).toBe("function");
      if (typeof targetOption?.enum === "function") {
        await expect(targetOption.enum({ values: {}, app: app as never })).resolves.toEqual(["store"]);
      }
    }
  });
});

describe("ApplicationScript", () => {
  test("start skips dependency install for single database mode", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const { app, getMissingDatabaseModeDependencySpecs, recorder } = createStartApp();
    script.confirmDatabaseModeDependencyInstall = async (...args: unknown[]) => {
      recorder.record("confirmInstall", ...args);
      return true;
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

    await script.start(app as never, { write: false });

    expect(getMissingDatabaseModeDependencySpecs).toHaveBeenCalledWith("single");
    expect(recorder.names()).not.toContain("confirmInstall");
    expect(recorder.names()).not.toContain("workspace.spawn");
    expect(recorder.names()).not.toContain("dbup");
    expect(recorder.names()).toContain("runner.start");
  });

  test("start confirms and installs missing multiple-mode dependencies before dbup", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const installSpecs = ["@libsql/client@^0.17.3", "bullmq@^5.76.10", "ioredis@^5.10.1", "protobufjs@^8.4.0"];
    const { app, recorder } = createStartApp({
      databaseMode: "multiple",
      installSpecsByMode: { multiple: installSpecs },
    });
    script.confirmDatabaseModeDependencyInstall = async (...args: unknown[]) => {
      recorder.record("confirmInstall", ...args);
      return true;
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

    await script.start(app as never, { write: false });

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

  test("start aborts before install and startup when dependency install is declined", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const installSpecs = ["@libsql/client@^0.17.3"];
    const { app, recorder } = createStartApp({
      databaseMode: "multiple",
      installSpecsByMode: { multiple: installSpecs },
    });
    script.confirmDatabaseModeDependencyInstall = async (...args: unknown[]) => {
      recorder.record("confirmInstall", ...args);
      return false;
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

    await expect(script.start(app as never, { write: false })).rejects.toThrow(
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

  test("start does not reinstall existing database-mode dependencies", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const { app, recorder } = createStartApp({ databaseMode: "multiple" });
    script.confirmDatabaseModeDependencyInstall = async (...args: unknown[]) => {
      recorder.record("confirmInstall", ...args);
      return true;
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

    await script.start(app as never, { write: false });

    expect(recorder.names()).not.toContain("confirmInstall");
    expect(recorder.names()).not.toContain("workspace.spawn");
    expect(recorder.names()).toContain("dbup");
    expect(recorder.names()).toContain("runner.start");
  });

  test("start uses AKAN_DATABASE_MODE override for dependency install", async () => {
    const previousDatabaseMode = process.env.AKAN_DATABASE_MODE;
    process.env.AKAN_DATABASE_MODE = "cluster";
    try {
      const script = CommandContainer.get(ApplicationScript);
      const clusterSpecs = ["bullmq@^5.76.10", "ioredis@^5.10.1", "postgres@^3.4.9", "protobufjs@^8.4.0"];
      const { app, getMissingDatabaseModeDependencySpecs, recorder } = createStartApp({
        databaseMode: "multiple",
        installSpecsByMode: { cluster: clusterSpecs },
      });
      script.confirmDatabaseModeDependencyInstall = async (...args: unknown[]) => {
        recorder.record("confirmInstall", ...args);
        return true;
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

      await script.start(app as never, { write: false });

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

  test("passes iOS provisioning opt-out from script to runner", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const recorder = createCallRecorder();
    const app = createFakeExecutor(
      "demo",
      {
        scanSync: async (...args: unknown[]) => recorder.record("scanSync", ...args),
        getConfig: async () => ({ getMissingMobileDependencySpecs: () => [] }) as unknown as AkanAppConfig,
      },
      recorder,
    );
    script.applicationRunner.startIos = async (...args: unknown[]) => {
      recorder.record("runner.startIos", ...args);
    };

    await script.startIos(app as never, {
      target: "default",
      env: "local",
      write: false,
      noAllowProvisioningUpdates: true,
    });

    expect(recorder.calls).toContainEqual({ name: "scanSync", args: [{ write: false }] });
    expect(recorder.calls).toContainEqual({
      name: "runner.startIos",
      args: [
        app,
        {
          open: false,
          operation: "local",
          env: "local",
          target: "default",
          regenerate: false,
          noAllowProvisioningUpdates: true,
        },
      ],
    });
  });

  test("startIos skips mobile dependency install when nothing is missing", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const { app, getMissingMobileDependencySpecs, recorder } = createMobileApp();
    script.confirmMobileDependencyInstall = async (...args: unknown[]) => {
      recorder.record("confirmMobileInstall", ...args);
      return true;
    };
    script.applicationRunner.startIos = async (...args: unknown[]) => {
      recorder.record("runner.startIos", ...args);
    };

    await script.startIos(app as never, { write: false });

    expect(getMissingMobileDependencySpecs).toHaveBeenCalled();
    expect(recorder.names()).not.toContain("confirmMobileInstall");
    expect(recorder.names()).not.toContain("workspace.spawn");
    expect(recorder.names()).toContain("runner.startIos");
  });

  test("startAndroid confirms and installs missing mobile dependencies before launch", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const installSpecs = ["firebase@^12.13.0"];
    const { app, recorder } = createMobileApp({ missingMobileSpecs: installSpecs });
    script.confirmMobileDependencyInstall = async (...args: unknown[]) => {
      recorder.record("confirmMobileInstall", ...args);
      return true;
    };
    script.applicationRunner.startAndroid = async (...args: unknown[]) => {
      recorder.record("runner.startAndroid", ...args);
    };

    await script.startAndroid(app as never, { write: false });

    expect(recorder.calls).toContainEqual({ name: "confirmMobileInstall", args: [installSpecs] });
    expect(recorder.calls).toContainEqual({
      name: "workspace.spawn",
      args: ["bun", ["add", ...installSpecs], { stdio: "inherit" }],
    });
    expect(recorder.calls).toContainEqual({ name: "workspace.getPackageJson", args: [{ refresh: true }] });
    expect(recorder.names().indexOf("workspace.spawn")).toBeLessThan(recorder.names().indexOf("runner.startAndroid"));
  });

  test("startIos aborts before launch when mobile dependency install is declined", async () => {
    const script = CommandContainer.get(ApplicationScript);
    const installSpecs = ["firebase@^12.13.0"];
    const { app, recorder } = createMobileApp({ missingMobileSpecs: installSpecs });
    script.confirmMobileDependencyInstall = async (...args: unknown[]) => {
      recorder.record("confirmMobileInstall", ...args);
      return false;
    };
    script.applicationRunner.startIos = async (...args: unknown[]) => {
      recorder.record("runner.startIos", ...args);
    };

    await expect(script.startIos(app as never, { write: false })).rejects.toThrow(
      "Mobile builds require missing dependencies",
    );

    expect(recorder.calls).toContainEqual({ name: "confirmMobileInstall", args: [installSpecs] });
    expect(recorder.names()).not.toContain("workspace.spawn");
    expect(recorder.names()).not.toContain("runner.startIos");
  });
});

describe("ApplicationRunner", () => {
  test("validates app script filenames and spawns bun with command env", async () => {
    const { root, app } = await createTempApp("demo");
    tempRoots.push(root);
    await writeText(`${app.cwdPath}/script/hello.ts`, "export default 1;\n");
    const runner = new ApplicationRunner();
    const spawn = mock(async () => "");
    app.spawn = spawn as never;
    app.getCommandEnv = (env: Record<string, string>) => ({
      ...env,
      AKAN_PUBLIC_APP_NAME: "demo",
    });

    await expect(runner.runScript(app, "../secret")).rejects.toThrow("Invalid script filename");
    await expect(runner.runScript(app, "missing")).rejects.toThrow("Script file not found");

    await runner.runScript(app, "hello.ts");
    expect(spawn).toHaveBeenCalledWith("bun", ["script/hello.ts"], {
      env: { AKAN_COMMAND_TYPE: "script", AKAN_PUBLIC_APP_NAME: "demo" },
      stdio: "inherit",
    });
  });

  test("runs bun test through the resolved executor", async () => {
    const { root, pkg } = await createTempPackage();
    tempRoots.push(root);
    const runner = new ApplicationRunner();
    const spawn = mock(async () => "");
    pkg.spawn = spawn as never;

    await runner.test(pkg);
    expect(spawn).toHaveBeenCalledWith("bun", ["test", "--isolate"], {
      stdio: "inherit",
    });
  });

  test("runs signal target tests with preload resolved from installed akanjs", async () => {
    const { root, lib } = await createTempLib("shared");
    tempRoots.push(root);
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
      ["test", "--isolate", "--preload", expect.stringContaining("node_modules/akanjs/test/signalTest.preload.ts")],
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
  });

  test("runs bun test through the resolved executor", async () => {
    const { root, pkg } = await createTempPackage();
    tempRoots.push(root);
    const runner = new ApplicationRunner();
    const spawn = mock(async () => "");
    pkg.spawn = spawn as never;

    await runner.test(pkg);
    expect(spawn).toHaveBeenCalledWith("bun", ["test", "--isolate"], {
      stdio: "inherit",
    });
  });

  test("runs signal target tests with preload resolved from installed akanjs", async () => {
    const { root, lib } = await createTempLib("shared");
    tempRoots.push(root);
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
      ["test", "--isolate", "--preload", expect.stringContaining("node_modules/akanjs/test/signalTest.preload.ts")],
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
  });
});
