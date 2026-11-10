import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CommandContainer, getArgMetas, getTargetMetas } from "@akanjs/devkit/commandDecorators";
import { AppExecutor, LibExecutor, PkgExecutor, WorkspaceExecutor } from "@akanjs/devkit/executors";
import {
  createCallRecorder,
  createFakeExecutor,
  createTempApp,
  createTempPackage,
  tempRoots,
  writeJson,
  writeText,
} from "@akanjs/devkit/testHelpers";
import type { PackageJson } from "@akanjs/devkit/types";
import { Logger } from "akanjs/common";
import { WorkspaceCommand } from "./workspace.command";
import { defaultMaxDiagnostics, WorkspaceRunner } from "./workspace.runner";
import { WorkspaceScript } from "./workspace.script";

const originalCwd = process.cwd();
const originalFetch = globalThis.fetch;
const repoRoot = path.resolve(import.meta.dir, "../../../..");

const stubNpmLatest = (latest = "1.0.0") => {
  globalThis.fetch = mock(
    async () =>
      new Response(
        JSON.stringify({
          "dist-tags": { latest },
        }),
      ),
  ) as never;
};

afterEach(() => {
  CommandContainer.clear();
  mock.restore();
  globalThis.fetch = originalFetch;
  try {
    process.chdir(originalCwd);
  } catch {
    // A timed-out createWorkspace can leave cwd on a deleted temp dir.
  }
});
const track = tempRoots();

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
      ["Option", 7],
      ["Option", 8],
      ["Option", 9],
      ["Option", 10],
    ]);

    const command = CommandContainer.get(WorkspaceCommand);
    const calls: unknown[] = [];
    command.workspaceScript.createWorkspace = async (...args: unknown[]) => {
      calls.push(args);
    };
    const handler = getTargetMetas(WorkspaceCommand).find((meta) => meta.key === "createWorkspace")?.handler;
    await handler?.call(command, "My Repo", "My App", "local", true, false, "http://127.0.0.1:4873");

    expect(calls).toEqual([
      [
        "my-repo",
        "my-app",
        { dirname: "local", inPlace: false, installLibs: true, init: false, registryUrl: "http://127.0.0.1:4873" },
      ],
    ]);
  });

  test('creates the workspace in --dir itself when its name is ".", naming it after that folder', async () => {
    const command = CommandContainer.get(WorkspaceCommand);
    const calls: unknown[] = [];
    command.workspaceScript.createWorkspace = async (...args: unknown[]) => {
      calls.push(args);
    };
    const handler = getTargetMetas(WorkspaceCommand).find((meta) => meta.key === "createWorkspace")?.handler;
    const dir = path.join(repoRoot, "local", "My App");
    await handler?.call(command, ".", "web", dir, false, true, undefined, undefined, true, true, false);

    expect(calls).toEqual([
      [
        "my-app",
        "web",
        {
          dirname: dir,
          inPlace: true,
          installLibs: false,
          init: true,
          sample: false,
          mcpInstall: true,
          agentInstall: true,
        },
      ],
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

    expect(calls).toEqual([["my-repo", "app", { dirname: ".", inPlace: false, installLibs: false, init: false }]]);
  });

  test("forwards --bun-dependency to the script", async () => {
    const command = CommandContainer.get(WorkspaceCommand);
    const calls: unknown[][] = [];
    command.workspaceScript.createWorkspace = async (...args: unknown[]) => {
      calls.push(args);
    };
    const handler = getTargetMetas(WorkspaceCommand).find((meta) => meta.key === "createWorkspace")?.handler;
    await handler?.call(command, "repo", "demo", ".", false, true, null, null, true, true, false, "1.4.4");

    expect(calls[0]?.[2]).toMatchObject({ bunDependency: "1.4.4" });
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
    script.agentScript.agent = async (...args: unknown[]) => {
      recorder.record("agent", ...args);
    };
    script.contextScript.mcpInstall = async (...args: unknown[]) => {
      recorder.record("mcpInstall", ...args);
    };
    script.workspaceRunner.commitWorkspace = async (...args: unknown[]) => {
      recorder.record("commitWorkspace", ...args);
      return { committed: true, repository: "/workspace", identity: null };
    };

    const printed = spyOn(Logger, "rawLog").mockImplementation(() => undefined);

    try {
      await script.createWorkspace("repo", "demo", { dirname: "local", installLibs: true, init: false });
      expect(printed.mock.calls.map(([line]) => String(line)).join("\n")).toContain(
        "Run `cd /workspace && akan start demo`",
      );
      expect(recorder.names()).toEqual([
        "version",
        "createWorkspace",
        "installLibrary",
        "installLibrary",
        "createApplication",
        "applyTemplate",
        "agent",
        "mcpInstall",
        "workspace.spinning",
        "commitWorkspace",
        "spinner.succeed",
      ]);
      expect(recorder.calls.find((call) => call.name === "createWorkspace")?.args).toEqual([
        "repo",
        "demo",
        { dirname: "local", inPlace: false, init: false, akanVersion: "2.0.0-beta.0", libs: ["util", "shared"] },
      ]);
      expect(recorder.calls.find((call) => call.name === "createApplication")?.args).toEqual([
        "demo",
        workspace,
        { libs: ["util", "shared"] },
      ]);
      expect(recorder.calls.find((call) => call.name === "agent")?.args).toEqual([
        workspace,
        "install",
        "all",
        { force: true },
      ]);
      expect(recorder.calls.find((call) => call.name === "mcpInstall")?.args).toEqual([
        workspace,
        "all",
        { force: true },
      ]);
      expect(recorder.calls.find((call) => call.name === "commitWorkspace")?.args).toEqual([workspace]);
      expect(recorder.calls.find((call) => call.name === "spinner.succeed")?.args).toEqual([
        "Git repository initialized and committed",
      ]);
    } finally {
      if (previousUseAkanjsPkgs === undefined) delete process.env.USE_AKANJS_PKGS;
      else process.env.USE_AKANJS_PKGS = previousUseAkanjsPkgs;
    }
  });

  test("tells a host whose Bun is not on PATH to run akan through npm", async () => {
    const script = CommandContainer.get(WorkspaceScript);
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor(
      "workspace",
      { applyTemplate: async (...args: unknown[]) => recorder.record("applyTemplate", ...args) },
      recorder,
    );
    script.workspaceRunner.createWorkspace = async (...args: unknown[]) => {
      recorder.record("createWorkspace", ...args);
      return workspace as never;
    };
    script.applicationScript.createApplication = async () => {};
    script.packageScript.version = async () => "2.0.0-beta.0";
    script.agentScript.agent = async () => {};
    script.contextScript.mcpInstall = async () => {};
    script.workspaceRunner.commitWorkspace = async () => ({
      committed: true,
      repository: "/workspace",
      identity: null,
    });
    const printed = spyOn(Logger, "rawLog").mockImplementation(() => undefined);

    await script.createWorkspace("repo", "demo", { dirname: "local", sample: false, bunDependency: "1.4.4" });

    const output = printed.mock.calls.map(([line]) => String(line)).join("\n");
    expect(output).toContain("Run `cd /workspace && npx akan start demo`");
    expect(output).toContain("`npm run build`");
    expect(output).not.toContain("&& akan start");
    expect(recorder.calls.find((call) => call.name === "createWorkspace")?.args.at(2)).toMatchObject({
      bunDependency: "1.4.4",
    });
  });

  test("skips agent and mcp install when opted out", async () => {
    const script = CommandContainer.get(WorkspaceScript);
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor(
      "workspace",
      {
        commit: async (...args: unknown[]) => recorder.record("commit", ...args),
        applyTemplate: async (...args: unknown[]) => recorder.record("applyTemplate", ...args),
      },
      recorder,
    );
    script.workspaceRunner.createWorkspace = async () => workspace as never;
    script.applicationScript.createApplication = async () => {};
    script.packageScript.version = async () => "2.0.0-beta.0";
    script.agentScript.agent = async (...args: unknown[]) => {
      recorder.record("agent", ...args);
    };
    script.contextScript.mcpInstall = async (...args: unknown[]) => {
      recorder.record("mcpInstall", ...args);
    };
    script.workspaceRunner.commitWorkspace = async () => ({
      committed: true,
      repository: "/workspace",
      identity: null,
    });

    await script.createWorkspace("repo", "demo", {
      dirname: "local",
      init: false,
      mcpInstall: false,
      agentInstall: false,
    });

    expect(recorder.names()).not.toContain("agent");
    expect(recorder.names()).not.toContain("mcpInstall");
  });

  test("skips the sample module, pages and helpers with sample false", async () => {
    const script = CommandContainer.get(WorkspaceScript);
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor(
      "workspace",
      { applyTemplate: async (...args: unknown[]) => recorder.record("applyTemplate", ...args) },
      recorder,
    );
    script.workspaceRunner.createWorkspace = async () => workspace as never;
    script.applicationScript.createApplication = async (...args: unknown[]) => {
      recorder.record("createApplication", ...args);
    };
    script.packageScript.version = async () => "2.0.0-beta.0";
    script.workspaceRunner.commitWorkspace = async () => ({
      committed: true,
      repository: "/workspace",
      identity: null,
    });

    await script.createWorkspace("repo", "demo", {
      init: false,
      sample: false,
      mcpInstall: false,
      agentInstall: false,
    });

    expect(recorder.calls.find((call) => call.name === "createApplication")?.args).toEqual([
      "demo",
      workspace,
      { libs: [] },
    ]);
    expect(recorder.names()).not.toContain("applyTemplate");
  });

  test("says why the first commit was left to the user or made under a stand-in identity", async () => {
    const script = CommandContainer.get(WorkspaceScript);
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace", { applyTemplate: async () => [] }, recorder);
    script.workspaceRunner.createWorkspace = async () => workspace as never;
    script.applicationScript.createApplication = async () => {};
    script.packageScript.version = async () => "2.0.0-beta.0";
    const options = { init: false, mcpInstall: false, agentInstall: false };
    const succeeded = () =>
      recorder.calls.filter((call) => call.name === "spinner.succeed").map((call) => call.args[0]);
    spyOn(Logger, "rawLog").mockImplementation(() => undefined);

    script.workspaceRunner.commitWorkspace = async () => ({ committed: false, repository: "/repo" });
    await script.createWorkspace("repo", "demo", options);
    script.workspaceRunner.commitWorkspace = async () => ({
      committed: true,
      repository: "/workspace",
      identity: WorkspaceRunner.fallbackGitIdentity,
    });
    await script.createWorkspace("repo", "demo", options);

    expect(succeeded()).toEqual([
      "Left the new files uncommitted in the git repository at /repo",
      expect.stringContaining("committed as Akan.js <noreply@akanjs.com>, since git has no identity here"),
    ]);
    expect(succeeded()[1]).toContain("git commit --amend --reset-author");
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

  test("machine-keygen prints only the public key, and claims mode 600 only where the mode holds", async () => {
    const script = CommandContainer.get(WorkspaceScript);
    script.workspaceRunner.machineKeygen = async () => ({ file: "/keys/cloud.pem", publicKey: "PUBLIC-KEY" });
    const printed = spyOn(Logger, "rawLog").mockImplementation(() => undefined);
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    const keygenOn = async (os: NodeJS.Platform) => {
      Object.defineProperty(process, "platform", { value: os });
      printed.mockClear();
      await script.machineKeygen({} as never, "keys/cloud.pem");
      return printed.mock.calls.map(([line]) => String(line)).join("\n");
    };
    try {
      expect(await keygenOn("linux")).toContain("Wrote the private key to /keys/cloud.pem (mode 600).");
      const windows = await keygenOn("win32");
      expect(windows).not.toContain("mode 600");
      expect(windows).toContain("Windows gives it the permissions of its folder");
      expect(windows).toContain("AKAN_MACHINE_PUBLIC_KEY=PUBLIC-KEY");
    } finally {
      if (platform) Object.defineProperty(process, "platform", platform);
    }
  });

  test("delegates agent rule generation to the workspace runner", async () => {
    const script = CommandContainer.get(WorkspaceScript);
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace", {}, recorder);
    script.workspaceRunner.generateAgentRules = async (...args: unknown[]) => {
      recorder.record("generateAgentRules", ...args);
      return [{ filePath: "/workspace/AGENTS.md", content: "" }];
    };
    script.agentScript.agent = async (...args: unknown[]) => {
      recorder.record("agent", ...args);
    };

    await script.generateAgentRules(workspace as never, { overwrite: true, cursorRules: false });

    expect(recorder.names()).toEqual(["workspace.spinning", "generateAgentRules", "agent", "spinner.succeed"]);
    expect(recorder.calls.find((call) => call.name === "generateAgentRules")?.args).toEqual([
      workspace,
      { overwrite: true, cursorRules: false },
    ]);
  });
});

describe("WorkspaceRunner", () => {
  test("machine-keygen writes a private key only the owner reads, refuses to overwrite it, and returns the public key", async () => {
    const { mkdtemp, rm, stat } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const root = await mkdtemp(path.join(tmpdir(), "akan-machine-keygen-"));
    try {
      const runner = new WorkspaceRunner();
      const workspace = { workspaceRoot: root } as never;
      const { file, publicKey } = await runner.machineKeygen(workspace, "local/keys/cloud.pem");
      expect(file).toBe(path.join(root, "local/keys/cloud.pem"));
      if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);
      const { createPrivateKey, createPublicKey } = await import("node:crypto");
      const derived = createPublicKey(createPrivateKey(await Bun.file(file).text()));
      expect(derived.export({ format: "jwk" }).x).toBe(publicKey);
      await expect(runner.machineKeygen(workspace, "local/keys/cloud.pem")).rejects.toThrow("never overwrites a key");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("uses the provided akan version", async () => {
    const runner = new WorkspaceRunner();
    stubNpmLatest();
    const { root } = track(await createTempApp("seed"));
    process.chdir(root);
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
    });
    expect(workspacePackageJson.dependencies.akanjs).toBe("2.0.0-beta.0");
    expect(workspacePackageJson.dependencies).toMatchObject({
      chance: expect.any(String),
      react: expect.any(String),
      "react-dom": expect.any(String),
      "react-icons": expect.any(String),
      "react-server-dom-webpack": expect.any(String),
      tailwindcss: expect.any(String),
    });
    for (const shippedByAkanjs of [
      "@react-spring/web",
      "@use-gesture/react",
      "react-refresh",
      "react-spring",
      "scheduler",
      "tailwind-scrollbar",
    ])
      expect(workspacePackageJson.dependencies).not.toHaveProperty(shippedByAkanjs);
    expect(workspacePackageJson.dependencies).not.toHaveProperty("typescript");
    expect(workspacePackageJson.devDependencies).toMatchObject({
      "@biomejs/biome": expect.any(String),
      "@types/bun": expect.any(String),
      typescript: expect.any(String),
    });
    expect(workspacePackageJson.dependencies).not.toHaveProperty("@capacitor/core");
    expect(workspacePackageJson.dependencies).not.toHaveProperty("@capacitor/cli");
    expect(workspacePackageJson.dependencies).not.toHaveProperty("postgres");
    expect(workspacePackageJson.dependencies).not.toHaveProperty("ioredis");
    expect(workspacePackageJson.dependencies).not.toHaveProperty("bullmq");
    expect(workspacePackageJson.dependencies).not.toHaveProperty("protobufjs");
    expect(workspacePackageJson.dependencies).not.toHaveProperty("@playwright/test");
    expect(workspacePackageJson.dependencies).not.toHaveProperty("cordova-plugin-purchase");
    expect(workspacePackageJson.dependencies).not.toHaveProperty("capacitor-plugin-safe-area");
  });

  test("lists bun and the app's build and start scripts only for a host whose Bun is not on PATH", async () => {
    const runner = new WorkspaceRunner();
    stubNpmLatest();
    const { root } = track(await createTempApp("seed"));
    process.chdir(root);
    await runner.createWorkspace("repo", "demo", {
      dirname: "nodeOnly",
      init: false,
      akanVersion: "2.0.0-beta.0",
      bunDependency: "1.4.4",
    });
    await runner.createWorkspace("repo", "demo", { dirname: "withBun", init: false, akanVersion: "2.0.0-beta.0" });

    const nodeOnly = (await Bun.file(`${root}/nodeOnly/repo/package.json`).json()) as PackageJson;
    expect(nodeOnly.dependencies?.bun).toBe("1.4.4");
    expect(nodeOnly.scripts?.build).toBe("akan build demo");
    expect(nodeOnly.scripts?.start).toBe("cd dist/apps/demo && bun main.js");
    expect(nodeOnly.scripts?.sync).toBe("akan sync");
    const withBun = (await Bun.file(`${root}/withBun/repo/package.json`).json()) as PackageJson;
    expect(withBun.dependencies).not.toHaveProperty("bun");
    expect(withBun.scripts?.build).toBe("akan build");
    expect(withBun.scripts).not.toHaveProperty("start");
  });

  test("lists each script once, under the name the workspace's AGENTS.md tells an agent to run", async () => {
    const runner = new WorkspaceRunner();
    stubNpmLatest();
    const { root } = track(await createTempApp("seed"));
    process.chdir(root);
    await runner.createWorkspace("repo", "demo", { dirname: "generated", init: false, akanVersion: "2.0.0-beta.0" });

    const { scripts = {} } = (await Bun.file(`${root}/generated/repo/package.json`).json()) as PackageJson;
    const commands = Object.values(scripts);
    const named = [...(await Bun.file(`${root}/generated/repo/AGENTS.md`).text()).matchAll(/`bun run ([\w:-]+)`/g)].map(
      ([, name = ""]) => name,
    );
    expect(commands.filter((command, idx) => commands.indexOf(command) !== idx)).toEqual([]);
    expect(named).toContain("setup:agent");
    expect(named.filter((name) => !(name in scripts))).toEqual([]);
  });

  test("pins @akanjs/cli at the akan version, so `akan` in the new workspace runs its own bin", async () => {
    const runner = new WorkspaceRunner();
    stubNpmLatest();
    const { root } = track(await createTempApp("seed"));
    process.chdir(root);
    await runner.createWorkspace("repo", "demo", { dirname: "generated", init: false, akanVersion: "2.0.0-beta.0" });

    const { devDependencies } = (await Bun.file(`${root}/generated/repo/package.json`).json()) as PackageJson;
    expect(devDependencies?.["@akanjs/cli"]).toBe("2.0.0-beta.0");
    expect(devDependencies?.["@akanjs/devkit"]).toBe("2.0.0-beta.0");
  });

  test("creates the workspace under an absolute --dir, not under the current directory", async () => {
    const runner = new WorkspaceRunner();
    stubNpmLatest();
    const { root } = track(await createTempApp("seed"));
    const cwd = path.join(root, "cwd");
    await writeText(path.join(cwd, ".keep"), "");
    process.chdir(cwd);
    const target = path.join(root, "target");
    const workspace = await runner.createWorkspace("repo", "demo", {
      dirname: target,
      init: false,
      akanVersion: "2.0.0-beta.0",
    });

    expect(workspace.workspaceRoot).toBe(path.join(target, "repo"));
    expect(await Bun.file(path.join(target, "repo", "package.json")).exists()).toBe(true);
    expect(await Bun.file(path.join(cwd, target, "repo", "package.json")).exists()).toBe(false);
  });

  test("creates the workspace in an existing folder itself, keeping the files it does not write", async () => {
    const runner = new WorkspaceRunner();
    stubNpmLatest();
    const { root } = track(await createTempApp("seed"));
    const target = path.join(root, "app");
    await writeText(path.join(target, "notes.txt"), "keep\n");
    await writeText(path.join(target, ".vscode", "launch.json"), "{}\n");
    process.chdir(root);
    const workspace = await runner.createWorkspace("app", "demo", {
      dirname: "app",
      inPlace: true,
      init: false,
      akanVersion: "2.0.0-beta.0",
    });

    expect(await realpath(workspace.workspaceRoot)).toBe(await realpath(target));
    expect(await Bun.file(path.join(target, "package.json")).exists()).toBe(true);
    expect(await Bun.file(path.join(target, ".vscode", "settings.json")).exists()).toBe(true);
    expect(await Bun.file(path.join(target, "notes.txt")).text()).toBe("keep\n");
    expect(await Bun.file(path.join(target, ".vscode", "launch.json")).text()).toBe("{}\n");
    expect(existsSync(path.join(target, "app"))).toBe(false);
  });

  test("refuses a folder holding files a new workspace would overwrite, before writing any of its own", async () => {
    const runner = new WorkspaceRunner();
    stubNpmLatest();
    const { root } = track(await createTempApp("seed"));
    const target = path.join(root, "app");
    await writeText(path.join(target, "README.md"), "# mine\n");
    await writeText(path.join(target, ".vscode", "settings.json"), "{}\n");
    await writeText(path.join(target, "apps", "demo", "keep.ts"), "export {};\n");
    const error = await runner
      .createWorkspace("app", "demo", { dirname: target, inPlace: true, init: false, akanVersion: "2.0.0-beta.0" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    const { message } = error as Error;
    expect(message).toStartWith(`${target} already holds `);
    for (const occupied of ["README.md", path.join(".vscode", "settings.json"), path.join("apps", "demo")])
      expect(message).toContain(occupied);
    expect(message).toContain("which a new workspace would overwrite");
    expect(await Bun.file(path.join(target, "package.json")).exists()).toBe(false);
    expect(await Bun.file(path.join(target, "README.md")).text()).toBe("# mine\n");
  });

  test("refuses the home folder and a filesystem root before writing anything", async () => {
    const runner = new WorkspaceRunner();
    stubNpmLatest();
    const { root } = track(await createTempApp("seed"));
    const home = path.join(root, "home");
    await writeText(path.join(home, "notes.txt"), "keep\n");
    spyOn(os, "homedir").mockReturnValue(home);
    const applied = spyOn(WorkspaceExecutor.prototype, "applyTemplate").mockImplementation(async () => {
      throw new Error("planned a template");
    });
    const fsRoot = path.parse(home).root;
    const refusals = await Promise.all(
      [home, fsRoot].map((dirname) =>
        runner
          .createWorkspace("repo", "demo", { dirname, inPlace: true, init: false, akanVersion: "2.0.0-beta.0" })
          .catch((caught: unknown) => (caught as Error).message),
      ),
    );

    expect(refusals[0]).toStartWith(`${home} is your home folder, and a workspace there would commit every file`);
    expect(refusals[1]).toStartWith(`${fsRoot} is a filesystem root, and a workspace there would commit every file`);
    expect(applied).not.toHaveBeenCalled();
    expect(await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: home, dot: true }))).toEqual(["notes.txt"]);
  });

  test("refuses a folder whose path ends the way a path the workspace writes begins", async () => {
    const runner = new WorkspaceRunner();
    stubNpmLatest();
    const { root } = track(await createTempApp("seed"));
    const refusal = async (dirname: string, appName: string) =>
      await runner
        .createWorkspace(path.basename(dirname), appName, {
          dirname,
          inPlace: true,
          init: false,
          akanVersion: "2.0.0-beta.0",
        })
        .catch((caught: unknown) => (caught as Error).message);
    const misplaced = [
      { dirname: path.join(root, "apps"), appName: "web", paths: "apps/web" },
      { dirname: path.join(root, "nested", "apps", "web"), appName: "web", paths: "apps/web" },
    ];

    for (const { dirname, appName, paths } of misplaced) {
      expect(await refusal(dirname, appName)).toStartWith(`Akan would write ${paths} to the wrong place in ${dirname}`);
      expect(existsSync(path.join(dirname, "package.json"))).toBe(false);
    }
    const named = await runner.createWorkspace("web", "web", {
      dirname: path.join(root, "web"),
      inPlace: true,
      init: false,
      akanVersion: "2.0.0-beta.0",
    });
    expect(await Bun.file(path.join(named.workspaceRoot, "package.json")).exists()).toBe(true);
  });

  test("gives a new workspace React's type packages at the versions the repo root uses", async () => {
    const runner = new WorkspaceRunner();
    stubNpmLatest();
    const { root } = track(await createTempApp("seed"));
    process.chdir(root);
    await runner.createWorkspace("repo", "demo", { dirname: "generated", init: false, akanVersion: "2.0.0-beta.0" });

    const { devDependencies } = (await Bun.file(`${root}/generated/repo/package.json`).json()) as PackageJson;
    const repoPackageJson = (await Bun.file(path.join(repoRoot, "package.json")).json()) as PackageJson;
    for (const typesPackage of ["@types/react", "@types/react-dom"])
      expect([typesPackage, devDependencies?.[typesPackage]]).toEqual([
        typesPackage,
        repoPackageJson.devDependencies?.[typesPackage] ?? `${typesPackage} missing from the repo root`,
      ]);
  });

  test("pins react-dom and react-server-dom-webpack in a new workspace to react's exact version", async () => {
    const runner = new WorkspaceRunner();
    stubNpmLatest();
    const { root } = track(await createTempApp("seed"));
    process.chdir(root);
    await runner.createWorkspace("repo", "demo", { dirname: "generated", init: false, akanVersion: "2.0.0-beta.0" });

    const { dependencies } = (await Bun.file(`${root}/generated/repo/package.json`).json()) as PackageJson;
    expect(dependencies?.react).toMatch(/^\d+\.\d+\.\d+$/);
    expect(dependencies?.["react-dom"]).toBe(dependencies?.react);
    expect(dependencies?.["react-server-dom-webpack"]).toBe(dependencies?.react);
  });

  test("generates agent rule files without overwriting by default", async () => {
    const runner = new WorkspaceRunner();
    const { root, workspace } = track(await createTempApp("demo"));

    await runner.generateAgentRules(workspace);
    const agentsGuide = await Bun.file(`${root}/AGENTS.md`).text();
    const cursorRules = await Bun.file(`${root}/.cursor/rules/akan.mdc`).text();
    const claudeGuide = await Bun.file(`${root}/CLAUDE.md`).text();
    expect(claudeGuide).toContain("@AGENTS.md");
    // The template carries the comment rule too, so a workspace scaffolded without `agent install` still has it.
    expect(claudeGuide).toContain("## Comments — Overrides Your Default");
    expect(agentsGuide).toContain("repo Agent Guide");
    // The conventions inside the managed block are rendered by `akan agent install`, which the script composes.
    expect(agentsGuide).toContain("<!-- akan:agent:start -->");
    expect(agentsGuide).toContain("<!-- akan:agent:end -->");
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
    stubNpmLatest();
    const { root } = track(await createTempApp("seed"));
    process.chdir(root);
    await runner.createWorkspace("repo", "demo", {
      dirname: "generated",
      init: false,
      akanVersion: "2.0.0-beta.0",
      registryUrl: "http://127.0.0.1:4873/",
    });

    await expect(Bun.file(`${root}/generated/repo/.npmrc`).text()).resolves.toBe("registry=http://127.0.0.1:4873/\n");
  });

  test("invokes biome check with optional write flag", async () => {
    const runner = new WorkspaceRunner();
    const workspace = createFakeExecutor("workspace");
    const exec = { cwdPath: "/workspace/apps/demo" };
    const spawn = mock(async () => "");
    workspace.spawn = spawn;

    await runner.lint(exec as never, workspace as never, { fix: true });
    expect(spawn).toHaveBeenCalledWith("biome", [
      "check",
      "--write",
      "--no-errors-on-unmatched",
      `--max-diagnostics=${defaultMaxDiagnostics}`,
      "/workspace/apps/demo",
    ]);

    await runner.lint(exec as never, workspace as never, { fix: false, maxDiagnostics: 0 });
    expect(spawn).toHaveBeenLastCalledWith("biome", [
      "check",
      "--no-errors-on-unmatched",
      "--max-diagnostics=none",
      "/workspace/apps/demo",
    ]);
  });

  test("pins the biome config so a malformed one is reported at its own line", async () => {
    const runner = new WorkspaceRunner();
    const { root } = track(await createTempApp("demo"));
    const workspace = createFakeExecutor("workspace");
    workspace.workspaceRoot = root;
    const spawn = mock(async () => "");
    workspace.spawn = spawn;
    await Bun.write(`${root}/biome.jsonc`, "{}\n");
    const biomeWrapper = path.join(root, "node_modules/@biomejs/biome/bin/biome");
    await Bun.write(biomeWrapper, "#!/usr/bin/env node\n");

    await runner.lint({ cwdPath: `${root}/apps/demo` } as never, workspace as never, { fix: false });

    expect(spawn).toHaveBeenCalledWith(process.execPath, [
      biomeWrapper,
      "check",
      "--no-errors-on-unmatched",
      `--max-diagnostics=${defaultMaxDiagnostics}`,
      "--config-path",
      path.join(root, "biome.jsonc"),
      `${root}/apps/demo`,
    ]);
  });

  test("refuses a recipe with nothing to pick, and says what to make of it instead", async () => {
    const runner = new WorkspaceRunner();
    const { root } = track(await createTempApp("demo"));
    const workspace = createFakeExecutor("workspace");
    workspace.spawn = mock(async () => "");
    await writeText(
      `${root}/apps/demo/ui/Recipe/flatPanel.ts`,
      'import { recipe, tv } from "akanjs/ui";\n\nexport const flatPanel = recipe(tv({ base: "rounded-box border" }));\n',
    );

    await expect(
      runner.lint({ cwdPath: `${root}/apps/demo` } as never, workspace as never, { fix: false }),
    ).rejects.toThrow(
      "[recipeGate] variant-less recipe(s): flatPanel\nA look with nothing to pick is not a recipe: promote one that has its own markup to a component, and keep a skin passed into another component's className as a shared class constant.",
    );
  });

  test("refuses an AGENTS.md whose recipe index no longer matches the sources, and names the sync that fixes it", async () => {
    const runner = new WorkspaceRunner();
    const { app } = track(await createTempApp("stale"));
    const workspace = createFakeExecutor("workspace");
    workspace.spawn = mock(async () => "");

    await expect(runner.lint(app, workspace as never, { fix: false })).rejects.toThrow(
      "[agentsIndex] The recipe index in apps/stale/AGENTS.md is stale: it differs from the recipe sources. Run `akan sync stale` to regenerate it.",
    );
  });

  test("holds a package to its structure budget, and reports the breach to verify as an entry", async () => {
    const runner = new WorkspaceRunner();
    const { root, pkg } = track(await createTempPackage());
    const workspace = createFakeExecutor("workspace");
    workspace.spawn = mock(async () => "");
    const body = Array.from({ length: 160 }, (_, idx) => `  // line ${idx}`).join("\n");
    await writeText(`${root}/pkgs/@sample/tool/boot.ts`, `export function boot() {\n${body}\n}\n`);

    await expect(runner.lint(pkg, workspace as never, { fix: false })).rejects.toThrow(
      "[maintainability] 1 violation(s) in pkgs/@sample/tool:\n  pkgs/@sample/tool/boot.ts:1  akan.size.function  function boot has 162 lines, over the 150-line limit",
    );
    expect((await runner.lintGateFailures(pkg, false)).maintainability).toMatchObject([
      { file: "pkgs/@sample/tool/boot.ts", rule: "akan.size.function", path: null },
    ]);
  });

  test("discovers apps/libs/packages through workspace executors", async () => {
    const { root, workspace } = track(await createTempApp("demo"));
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

describe("WorkspaceRunner.commitWorkspace", () => {
  const isolatedEnv = ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "EMAIL"];
  const withGitConfig = async <Result>(root: string, config: string, run: () => Promise<Result>) => {
    const saved = Object.fromEntries(
      [...isolatedEnv, "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_CEILING_DIRECTORIES"].map((key) => [
        key,
        process.env[key],
      ]),
    );
    await writeText(path.join(root, "gitconfig"), config);
    for (const key of isolatedEnv) delete process.env[key];
    Object.assign(process.env, {
      GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CEILING_DIRECTORIES: path.dirname(root),
    });
    try {
      return await run();
    } finally {
      for (const [key, value] of Object.entries(saved))
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
  };
  const git = (cwd: string, ...args: string[]) => {
    const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    return { ok: proc.exitCode === 0, out: proc.stdout.toString().trim() };
  };
  const scratch = async () => track({ root: await realpath(await mkdtemp(path.join(os.tmpdir(), "akan-git-"))) }).root;
  const workspaceIn = async (workspaceRoot: string) => {
    await writeText(path.join(workspaceRoot, "apps", "demo", "main.ts"), "export const demo = 1;\n");
    return WorkspaceExecutor.fromRoot({ workspaceRoot, repoName: "repo" });
  };
  const userIdentity = "[user]\n\tname = Dev\n\temail = dev@example.com\n";

  test("commits under a stand-in identity only when git has none", async () => {
    const root = await scratch();
    const bare = await workspaceIn(path.join(root, "bare"));
    const named = await workspaceIn(path.join(root, "named"));

    const anonymous = await withGitConfig(root, "[user]\n\tuseConfigOnly = true\n", () =>
      new WorkspaceRunner().commitWorkspace(bare),
    );
    const configured = await withGitConfig(root, userIdentity, () => new WorkspaceRunner().commitWorkspace(named));

    expect(anonymous).toEqual({
      committed: true,
      repository: bare.workspaceRoot,
      identity: WorkspaceRunner.fallbackGitIdentity,
    });
    expect(git(bare.workspaceRoot, "log", "--format=%an <%ae> %s").out).toBe(
      "Akan.js <noreply@akanjs.com> Initial commit",
    );
    expect(git(bare.workspaceRoot, "status", "--porcelain").out).toBe("");
    expect(configured).toEqual({ committed: true, repository: named.workspaceRoot, identity: null });
    expect(git(named.workspaceRoot, "log", "--format=%an <%ae>").out).toBe("Dev <dev@example.com>");
  });

  test("leaves a workspace inside another repository to it, unless that repository ignores its folder", async () => {
    const outer = await scratch();
    expect(git(outer, "init", "-q").ok).toBe(true);
    await writeText(path.join(outer, ".gitignore"), "scratch/\nvendored/*\n!vendored/.gitkeep\n");
    await writeText(path.join(outer, "vendored", ".gitkeep"), "");
    const tracked = await workspaceIn(path.join(outer, "app"));
    const ignored = await workspaceIn(path.join(outer, "scratch", "app"));
    const contentsIgnored = await workspaceIn(path.join(outer, "vendored"));

    const [inTracked, inIgnored, inContentsIgnored] = await withGitConfig(outer, userIdentity, async () => [
      await new WorkspaceRunner().commitWorkspace(tracked),
      await new WorkspaceRunner().commitWorkspace(ignored),
      await new WorkspaceRunner().commitWorkspace(contentsIgnored),
    ]);

    expect(inTracked).toEqual({ committed: false, repository: outer });
    expect(existsSync(path.join(tracked.workspaceRoot, ".git"))).toBe(false);
    expect(git(outer, "rev-parse", "--verify", "HEAD").ok).toBe(false);
    expect(git(outer, "status", "--porcelain", "--untracked-files=all").out).toContain("?? app/apps/demo/main.ts");
    expect(inIgnored).toEqual({ committed: true, repository: ignored.workspaceRoot, identity: null });
    expect(git(ignored.workspaceRoot, "log", "--format=%s").out).toBe("Initial commit");
    expect(inContentsIgnored).toEqual({ committed: true, repository: contentsIgnored.workspaceRoot, identity: null });
    expect(git(contentsIgnored.workspaceRoot, "log", "--format=%s").out).toBe("Initial commit");
  });
});

describe("Scan convention validation", () => {
  test("rejects files that do not follow the <module>.<type>.(ts|tsx) convention", async () => {
    const { app } = track(await createTempApp("demo"));

    await writeText(`${app.cwdPath}/lib/task/task.constant.ts`, "export const TaskStatus = {};\n");
    await writeText(`${app.cwdPath}/lib/task/TaskHelpComponent.tsx`, "export const TaskHelp = () => null;\n");

    await expect(app.scanSync({ write: false })).rejects.toThrow(
      /apps\/demo\/lib\/task\/TaskHelpComponent.tsx: unsupported module file/,
    );
  });

  test("rejects UI files with wrong module name prefix", async () => {
    const { app } = track(await createTempApp("demo"));

    await writeText(`${app.cwdPath}/lib/task/task.constant.ts`, "export const TaskStatus = {};\n");
    await writeText(`${app.cwdPath}/lib/task/WrongName.Zone.tsx`, "export const WrongZone = () => null;\n");

    await expect(app.scanSync({ write: false })).rejects.toThrow(
      /apps\/demo\/lib\/task\/WrongName.Zone.tsx: module name mismatch: expected 'Task', got 'WrongName'/,
    );
  });

  test("rejects non-UI files with wrong module name prefix", async () => {
    const { app } = track(await createTempApp("demo"));

    await writeText(`${app.cwdPath}/lib/task/task.constant.ts`, "export const TaskStatus = {};\n");
    await writeText(`${app.cwdPath}/lib/task/wrongName.constant.ts`, "export const Wrong = {};\n");

    await expect(app.scanSync({ write: false })).rejects.toThrow(
      /apps\/demo\/lib\/task\/wrongName.constant.ts: module name mismatch: expected 'task', got 'wrongName'/,
    );
  });

  test("allows properly named files in domain folders", async () => {
    const { app } = track(await createTempApp("demo"));

    await writeText(`${app.cwdPath}/lib/task/task.constant.ts`, "export const TaskStatus = {};\n");
    await writeText(`${app.cwdPath}/lib/task/task.dictionary.ts`, "export const TaskDict = {};\n");
    await writeText(`${app.cwdPath}/lib/task/Task.Zone.tsx`, "export const TaskZone = () => null;\n");

    const scanInfo = await app.scanSync({ write: false });
    expect(scanInfo.type).toBe("app");
  });

  test("allows one test per module file, named after the file it covers", async () => {
    const { app } = track(await createTempApp("demo"));

    await writeText(`${app.cwdPath}/lib/task/task.constant.ts`, "export const TaskStatus = {};\n");
    await writeText(`${app.cwdPath}/lib/task/task.signal.spec.ts`, "export const spec = 1;\n");
    await writeText(`${app.cwdPath}/lib/task/task.signal.test.ts`, "export const test = 1;\n");
    await writeText(`${app.cwdPath}/lib/task/task.service.test.ts`, "export const test = 1;\n");
    await writeText(`${app.cwdPath}/lib/task/Task.Zone.test.tsx`, "export const test = 1;\n");

    const scanInfo = await app.scanSync({ refresh: true, write: false });
    expect(scanInfo.type).toBe("app");
  });

  test("rejects a role's tests split across several topic suites", async () => {
    const { app } = track(await createTempApp("demo"));

    await writeText(`${app.cwdPath}/lib/task/task.constant.ts`, "export const TaskStatus = {};\n");
    await writeText(`${app.cwdPath}/lib/task/task.signal.test.ts`, "export const test = 1;\n");
    await writeText(`${app.cwdPath}/lib/task/task.trim.signal.test.ts`, "export const test = 1;\n");
    await writeText(`${app.cwdPath}/lib/task/task.security.test.ts`, "export const test = 1;\n");

    const message = await app.scanSync({ refresh: true, write: false }).then(
      () => "",
      (error: Error) => error.message,
    );
    expect(message).toContain("apps/demo/lib/task/task.trim.signal.test.ts: a module test is named after the one");
    expect(message).toContain("apps/demo/lib/task/task.security.test.ts: a module test is named after the one");
    expect(message).not.toContain("task/task.signal.test.ts");
  });

  test("rejects a test at the lib root and points it at its module folder or srvkit", async () => {
    const { app } = track(await createTempApp("demo"));

    await writeText(`${app.cwdPath}/lib/task/task.constant.ts`, "export const TaskStatus = {};\n");
    await writeText(`${app.cwdPath}/lib/task.signal.test.ts`, "export const test = 1;\n");

    await expect(app.scanSync({ refresh: true, write: false })).rejects.toThrow(
      /apps\/demo\/lib\/task.signal.test.ts: a test beside the generated barrels; .*srvkit\//,
    );
  });
});
