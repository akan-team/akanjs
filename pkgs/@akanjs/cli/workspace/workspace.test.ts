import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  AppExecutor,
  CommandContainer,
  getArgMetas,
  getTargetMetas,
  LibExecutor,
  PkgExecutor,
  WorkspaceExecutor,
} from "@akanjs/devkit";
import {
  cleanupCliTempWorkspace,
  createCallRecorder,
  createFakeExecutor,
  createTempApp,
  writeJson,
  writeText,
} from "../testHelpers";
import { WorkspaceCommand } from "./workspace.command";
import { WorkspaceRunner } from "./workspace.runner";
import { WorkspaceScript } from "./workspace.script";

const tempRoots: string[] = [];

afterEach(async () => {
  CommandContainer.clear();
  mock.restore();
  await Promise.all(tempRoots.splice(0).map((root) => cleanupCliTempWorkspace(root)));
});

describe("WorkspaceCommand", () => {
  test("normalizes workspace/app names and delegates createWorkspace", async () => {
    const [allArgs] = getArgMetas(WorkspaceCommand, "createWorkspace");
    expect(allArgs.map((arg) => [arg.type, arg.idx])).toEqual([
      ["Argument", 0],
      ["Option", 1],
      ["Option", 2],
      ["Option", 3],
      ["Option", 4],
      ["Option", 5],
      ["Option", 6],
    ]);

    const command = CommandContainer.get(WorkspaceCommand);
    const calls: unknown[] = [];
    command.workspaceScript.createWorkspace = async (...args: unknown[]) => {
      calls.push(args);
    };
    const handler = getTargetMetas(WorkspaceCommand).find((meta) => meta.key === "createWorkspace")?.handler;
    await handler?.call(command, "My Repo", "My App", "local", true, false, "http://127.0.0.1:4873");

    expect(calls).toEqual([
      ["my-repo", "my-app", { dirname: "local", installLibs: true, init: false, registryUrl: "http://127.0.0.1:4873" }],
    ]);
  });

  test("uses a safe default app name when app option is missing", async () => {
    const command = CommandContainer.get(WorkspaceCommand);
    const calls: unknown[] = [];
    command.workspaceScript.createWorkspace = async (...args: unknown[]) => {
      calls.push(args);
    };
    const handler = getTargetMetas(WorkspaceCommand).find((meta) => meta.key === "createWorkspace")?.handler;
    await handler?.call(command, "My Repo", undefined, ".", false, false);

    expect(calls).toEqual([["my-repo", "app", { dirname: ".", installLibs: false, init: false }]]);
  });

  test("delegates generateAgentRules with overwrite options", async () => {
    const command = CommandContainer.get(WorkspaceCommand);
    const workspace = createFakeExecutor("workspace");
    const calls: unknown[] = [];
    command.workspaceScript.generateAgentRules = async (...args: unknown[]) => {
      calls.push(args);
    };
    const handler = getTargetMetas(WorkspaceCommand).find((meta) => meta.key === "generateAgentRules")?.handler;
    await handler?.call(command, true, false, workspace);

    expect(calls).toEqual([[workspace, { overwrite: true, cursorRules: false }]]);
  });
});

describe("WorkspaceScript", () => {
  test("creates workspace, optionally installs libs, and creates the first app", async () => {
    const script = CommandContainer.get(WorkspaceScript);
    const recorder = createCallRecorder();
    const previousUseAkanjsPkgs = process.env.USE_AKANJS_PKGS;
    delete process.env.USE_AKANJS_PKGS;
    const workspace = createFakeExecutor(
      "workspace",
      {
        commit: async (...args: unknown[]) => recorder.record("commit", ...args),
        applyTemplate: async (...args: unknown[]) => recorder.record("applyTemplate", ...args),
      },
      recorder,
    );
    script.workspaceRunner.createWorkspace = async (...args: unknown[]) => {
      recorder.record("createWorkspace", ...args);
      return workspace as never;
    };
    script.libraryScript.installLibrary = async (...args: unknown[]) => {
      recorder.record("installLibrary", ...args);
    };
    script.applicationScript.createApplication = async (...args: unknown[]) => {
      recorder.record("createApplication", ...args);
    };
    script.packageScript.version = async (...args: unknown[]) => {
      recorder.record("version", ...args);
      return "2.0.0-beta.0";
    };

    try {
      await script.createWorkspace("repo", "demo", { dirname: "local", installLibs: true, init: false });
      expect(recorder.names()).toEqual([
        "version",
        "createWorkspace",
        "installLibrary",
        "installLibrary",
        "createApplication",
        "applyTemplate",
        "workspace.spinning",
        "commit",
        "spinner.succeed",
      ]);
      expect(recorder.calls.find((call) => call.name === "createWorkspace")?.args).toEqual([
        "repo",
        "demo",
        { dirname: "local", init: false, akanVersion: "2.0.0-beta.0" },
      ]);
      expect(recorder.calls.find((call) => call.name === "createApplication")?.args).toEqual([
        "demo",
        workspace,
        { libs: ["util", "shared"] },
      ]);
      expect(recorder.calls.find((call) => call.name === "commit")?.args).toEqual(["Initial commit", { init: true }]);
    } finally {
      if (previousUseAkanjsPkgs === undefined) delete process.env.USE_AKANJS_PKGS;
      else process.env.USE_AKANJS_PKGS = previousUseAkanjsPkgs;
    }
  });

  test("lints all apps/libs/packages except contract after syncing apps and libs", async () => {
    const script = CommandContainer.get(WorkspaceScript);
    const recorder = createCallRecorder();
    const workspace = Object.setPrototypeOf(
      createFakeExecutor(
        "workspace",
        {
          getExecs: async () => [["app"], ["lib"], ["pkg", "contract"]],
        },
        recorder,
      ),
      WorkspaceExecutor.prototype,
    ) as WorkspaceExecutor;
    script.applicationScript.sync = (async (target: unknown) => recorder.record("sync", target)) as never;
    script.libraryScript.syncLibrary = (async (target: unknown) => recorder.record("syncLibrary", target)) as never;
    script.workspaceRunner.lint = async (...args: unknown[]) => recorder.record("lint", ...args);

    await script.lintAll(workspace, { fix: false });

    expect(recorder.names()).toEqual(["sync", "syncLibrary", "lint", "lint", "lint"]);
    expect(
      recorder.calls.filter((call) => call.name === "lint").map((call) => (call.args[0] as { name: string }).name),
    ).toEqual(["app", "lib", "pkg"]);
  });

  test("delegates agent rule generation to the workspace runner", async () => {
    const script = CommandContainer.get(WorkspaceScript);
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace", {}, recorder);
    script.workspaceRunner.generateAgentRules = async (...args: unknown[]) => {
      recorder.record("generateAgentRules", ...args);
      return [{ filePath: "/workspace/AGENTS.md", content: "" }];
    };

    await script.generateAgentRules(workspace as never, { overwrite: true, cursorRules: false });

    expect(recorder.names()).toEqual(["workspace.spinning", "generateAgentRules", "spinner.succeed"]);
    expect(recorder.calls.find((call) => call.name === "generateAgentRules")?.args).toEqual([
      workspace,
      { overwrite: true, cursorRules: false },
    ]);
  });
});

describe("WorkspaceRunner", () => {
  test("uses the provided akan version", async () => {
    const runner = new WorkspaceRunner();
    const cwd = process.cwd();
    const { root } = await createTempApp("seed");
    tempRoots.push(root);
    process.chdir(root);
    try {
      await runner.createWorkspace("repo", "demo", {
        dirname: "generated",
        init: false,
        akanVersion: "2.0.0-beta.0",
      });

      const workspacePackageJson = (await Bun.file(`${root}/generated/repo/package.json`).json()) as {
        scripts: Record<string, string>;
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      expect(workspacePackageJson.scripts).toMatchObject({
        "setup:agent": "akan agent install all --force",
        "agent:doctor": "akan doctor --strict --format json",
        "agent:mcp:plan": "akan mcp-install all --mode plan --force",
        "agent:sample:service": "akan create-service billing demo --format json",
        "agent:sample:module": "akan create-module project demo --page=true --format json",
        "agent:sample:field":
          "akan add-field --app demo --module project --field budget --type Int --default 0 --format json",
        "agent:sample:status":
          "akan add-enum-field --app demo --module project --field status --values draft,active,archived --default draft --format json",
        "agent:sample:workflow:plan":
          "akan workflow plan add-field --app demo --module task --field priority --type enum --values low,medium,high --default medium --format json --out .akan/workflows/plans/task-priority.json",
        "agent:sample:workflow:dry-run":
          "akan workflow apply .akan/workflows/plans/task-priority.json --dry-run --format json",
      });
      expect(workspacePackageJson.dependencies.akanjs).toBe("2.0.0-beta.0");
      expect(workspacePackageJson.dependencies).toMatchObject({
        "@react-spring/web": expect.any(String),
        "@use-gesture/react": expect.any(String),
        chance: expect.any(String),
        croner: expect.any(String),
        react: expect.any(String),
        "react-dom": expect.any(String),
        "react-icons": expect.any(String),
        "react-refresh": expect.any(String),
        "react-server-dom-webpack": expect.any(String),
        "react-spring": expect.any(String),
        scheduler: expect.any(String),
        tailwindcss: expect.any(String),
      });
      expect(workspacePackageJson.dependencies).not.toHaveProperty("typescript");
      expect(workspacePackageJson.devDependencies).toMatchObject({
        "@biomejs/biome": expect.any(String),
        "@types/bun": expect.any(String),
        typescript: expect.any(String),
      });
      expect(workspacePackageJson.dependencies).not.toHaveProperty("@capacitor/core");
      expect(workspacePackageJson.dependencies).not.toHaveProperty("@capacitor/cli");
      expect(workspacePackageJson.dependencies).not.toHaveProperty("@libsql/client");
      expect(workspacePackageJson.dependencies).not.toHaveProperty("postgres");
      expect(workspacePackageJson.dependencies).not.toHaveProperty("ioredis");
      expect(workspacePackageJson.dependencies).not.toHaveProperty("bullmq");
      expect(workspacePackageJson.dependencies).not.toHaveProperty("protobufjs");
      expect(workspacePackageJson.dependencies).not.toHaveProperty("@playwright/test");
      expect(workspacePackageJson.dependencies).not.toHaveProperty("cordova-plugin-purchase");
      expect(workspacePackageJson.dependencies).not.toHaveProperty("capacitor-plugin-safe-area");
    } finally {
      process.chdir(cwd);
    }
  });

  test("generates agent rule files without overwriting by default", async () => {
    const runner = new WorkspaceRunner();
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);

    await runner.generateAgentRules(workspace);
    const agentsGuide = await Bun.file(`${root}/AGENTS.md`).text();
    const cursorRules = await Bun.file(`${root}/.cursor/rules/akan.mdc`).text();
    const claudeGuide = await Bun.file(`${root}/CLAUDE.md`).text();
    expect(claudeGuide).toContain("@AGENTS.md");
    expect(agentsGuide).toContain("repo Agent Guide");
    expect(agentsGuide).toContain("Prefer Akan MCP workflows before direct source edits");
    expect(agentsGuide).toContain("apply_workflow({ planPath })");
    expect(agentsGuide).toContain("validationTarget");
    expect(agentsGuide).toContain("create-module` plan/apply first, then `add-field");
    expect(agentsGuide).toContain("akan mcp --mode plan");
    expect(agentsGuide).toContain("akan repair generated");
    // The Cursor rule is a thin reference to AGENTS.md, not a duplicate of its content.
    expect(cursorRules).toContain("alwaysApply: true");
    expect(cursorRules).toContain("single source of truth");
    expect(cursorRules).toContain("@AGENTS.md");

    await Bun.write(`${root}/AGENTS.md`, "custom\n");
    await runner.generateAgentRules(workspace);
    expect(await Bun.file(`${root}/AGENTS.md`).text()).toBe("custom\n");

    await runner.generateAgentRules(workspace, { overwrite: true, cursorRules: false });
    expect(await Bun.file(`${root}/AGENTS.md`).text()).toContain("repo Agent Guide");
  });

  test("writes local registry config before installing generated workspace dependencies", async () => {
    const runner = new WorkspaceRunner();
    const cwd = process.cwd();
    const originalFetch = globalThis.fetch;
    const { root } = await createTempApp("seed");
    tempRoots.push(root);
    process.chdir(root);
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            "dist-tags": { latest: "1.0.0" },
          }),
        ),
    ) as never;
    try {
      await runner.createWorkspace("repo", "demo", {
        dirname: "generated",
        init: false,
        akanVersion: "2.0.0-beta.0",
        registryUrl: "http://127.0.0.1:4873/",
      });

      await expect(Bun.file(`${root}/generated/repo/.npmrc`).text()).resolves.toBe("registry=http://127.0.0.1:4873/\n");
    } finally {
      globalThis.fetch = originalFetch;
      process.chdir(cwd);
    }
  });

  test("invokes biome check with optional write flag", async () => {
    const runner = new WorkspaceRunner();
    const workspace = createFakeExecutor("workspace");
    const exec = { cwdPath: "/workspace/apps/demo" };
    const spawn = mock(async () => "");
    workspace.spawn = spawn;

    await runner.lint(exec as never, workspace as never, { fix: true });
    expect(spawn).toHaveBeenCalledWith("./node_modules/.bin/biome", [
      "check",
      "--write",
      "--no-errors-on-unmatched",
      "/workspace/apps/demo",
    ]);

    await runner.lint(exec as never, workspace as never, { fix: false });
    expect(spawn).toHaveBeenLastCalledWith("./node_modules/.bin/biome", [
      "check",
      "--no-errors-on-unmatched",
      "/workspace/apps/demo",
    ]);
  });

  test("discovers apps/libs/packages through workspace executors", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);
    await writeJson(`${root}/libs/shared/akan.config.ts`, {});
    await writeJson(`${root}/pkgs/@sample/tool/package.json`, {
      name: "@sample/tool",
      version: "0.1.0",
      description: "tool",
    });

    expect(await workspace.getApps()).toEqual(["demo"]);
    expect(await workspace.getLibs()).toEqual(["shared"]);
    expect(await workspace.getPkgs()).toEqual(["@sample/tool"]);
    expect(AppExecutor.from(workspace, "demo")).toBeInstanceOf(AppExecutor);
    expect(LibExecutor.from(workspace, "shared")).toBeInstanceOf(LibExecutor);
    expect(PkgExecutor.from(workspace, "@sample/tool")).toBeInstanceOf(PkgExecutor);
  });
});

describe("Scan convention validation", () => {
  test("rejects files that do not follow the <module>.<type>.(ts|tsx) convention", async () => {
    const { root, app } = await createTempApp("demo");
    tempRoots.push(root);

    await writeText(`${app.cwdPath}/lib/task/task.constant.ts`, "export const TaskStatus = {};\n");
    await writeText(`${app.cwdPath}/lib/task/TaskHelpComponent.tsx`, "export const TaskHelp = () => null;\n");

    await expect(app.scanSync({ write: false })).rejects.toThrow(
      /apps\/demo\/lib\/task\/TaskHelpComponent.tsx: unsupported module file/,
    );
  });

  test("rejects UI files with wrong module name prefix", async () => {
    const { root, app } = await createTempApp("demo");
    tempRoots.push(root);

    await writeText(`${app.cwdPath}/lib/task/task.constant.ts`, "export const TaskStatus = {};\n");
    await writeText(`${app.cwdPath}/lib/task/WrongName.Zone.tsx`, "export const WrongZone = () => null;\n");

    await expect(app.scanSync({ write: false })).rejects.toThrow(
      /apps\/demo\/lib\/task\/WrongName.Zone.tsx: module name mismatch: expected 'Task', got 'WrongName'/,
    );
  });

  test("rejects non-UI files with wrong module name prefix", async () => {
    const { root, app } = await createTempApp("demo");
    tempRoots.push(root);

    await writeText(`${app.cwdPath}/lib/task/task.constant.ts`, "export const TaskStatus = {};\n");
    await writeText(`${app.cwdPath}/lib/task/wrongName.constant.ts`, "export const Wrong = {};\n");

    await expect(app.scanSync({ write: false })).rejects.toThrow(
      /apps\/demo\/lib\/task\/wrongName.constant.ts: module name mismatch: expected 'task', got 'wrongName'/,
    );
  });

  test("allows properly named files in domain folders", async () => {
    const { root, app } = await createTempApp("demo");
    tempRoots.push(root);

    await writeText(`${app.cwdPath}/lib/task/task.constant.ts`, "export const TaskStatus = {};\n");
    await writeText(`${app.cwdPath}/lib/task/task.dictionary.ts`, "export const TaskDict = {};\n");
    await writeText(`${app.cwdPath}/lib/task/Task.Zone.tsx`, "export const TaskZone = () => null;\n");

    const scanInfo = await app.scanSync({ write: false });
    expect(scanInfo.type).toBe("app");
  });
});
