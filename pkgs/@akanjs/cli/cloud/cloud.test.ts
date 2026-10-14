import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CloudApi, CloudHttpError, GlobalConfig, PipelineSecrets } from "@akanjs/devkit/cloud";
import { CommandContainer, ExitCodeError, getArgMetas, getTargetMetas } from "@akanjs/devkit/commandDecorators";
import { AppExecutor } from "@akanjs/devkit/executors";
import { NativeApp, type NativeUpdatePack } from "@akanjs/devkit/mobile";
import { PlatformTestRun } from "@akanjs/devkit/platformTest/PlatformTestRun";
import {
  createCallRecorder,
  createFakeExecutor,
  makeCliTempWorkspace,
  tempRoots,
  writeJson,
  writeText,
} from "@akanjs/devkit/testHelpers";
import { CloudCommand } from "./cloud.command";
import { CloudRunner } from "./cloud.runner";
import { CloudScript } from "./cloud.script";

const stubAppConfigs = (secretsByApp: Record<string, string[]>) =>
  spyOn(AppExecutor, "from").mockImplementation(
    (_executor, appName) => ({ getConfig: async () => ({ secrets: secretsByApp[appName] ?? [] }) }) as never,
  );

afterEach(() => {
  CommandContainer.clear();
  mock.restore();
});
const track = tempRoots();
const statusTexts: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  503: "Service Unavailable",
};
const httpError = (status: number, body: string) =>
  new CloudHttpError(status, statusTexts[status] ?? "", "/uploadSecret/project-1", body);
const makeTempRoot = async () => track(await makeCliTempWorkspace()).root;

describe("CloudCommand", () => {
  test("selects npm or local registry target instead of accepting raw registry URLs", async () => {
    const command = CommandContainer.get(CloudCommand);
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace");
    const previousRegistry = process.env.AKAN_NPM_REGISTRY;
    process.env.AKAN_NPM_REGISTRY = "http://127.0.0.1:4873";
    command.cloudScript.deployAkan = async (...args) => recorder.record("deployAkan", ...args);

    try {
      const [, metas] = getArgMetas(CloudCommand, "deployAkan");
      const registryMeta = metas.find((meta) => meta.name === "registry");
      expect(registryMeta?.argsOption.enum).toContainEqual({ label: "npm", value: "npm" });
      expect(registryMeta?.argsOption.enum).toContainEqual({ label: "local", value: "local" });
      expect(registryMeta?.argsOption.enum).toHaveLength(2);
      expect(getArgMetas(CloudCommand, "update")[1].find((meta) => meta.name === "registry")?.argsOption.enum).toEqual([
        { label: "npm", value: "npm" },
        { label: "local", value: "local" },
      ]);

      const handler = getTargetMetas(CloudCommand).find((meta) => meta.key === "deployAkan")?.handler;
      await handler?.call(command, true, "npm", "linux,windows", workspace);
      await handler?.call(command, false, "local", "none", workspace);
    } finally {
      if (previousRegistry === undefined) delete process.env.AKAN_NPM_REGISTRY;
      else process.env.AKAN_NPM_REGISTRY = previousRegistry;
    }

    expect(recorder.calls).toEqual([
      {
        name: "deployAkan",
        args: [workspace, { test: true, registryUrl: undefined, platforms: ["linux", "windows"] }],
      },
      {
        name: "deployAkan",
        args: [workspace, { test: false, registryUrl: "http://127.0.0.1:4873", platforms: [] }],
      },
    ]);
  });
});

describe("CloudScript", () => {
  test("update delegates to runner then prints global CLI version", async () => {
    const script = CommandContainer.get(CloudScript);
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace", {}, recorder);
    script.cloudRunner.update = async (...args) => recorder.record("update", ...args);

    await script.update(workspace as never, "dev");

    expect(recorder.names()).toEqual(["workspace.spinning", "update", "spinner.succeed", "workspace.spawn"]);
    expect(recorder.calls.at(-1)?.args).toEqual(["akan", ["--version"], { stdio: "inherit" }]);
  });

  test("verifies dist packages before deploying Akan packages", async () => {
    const script = CommandContainer.get(CloudScript);
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace", {}, recorder);
    script.cloudRunner.getAkanPkgs = async (...args) => {
      recorder.record("getAkanPkgs", ...args);
      return ["akanjs", "@akanjs/cli"];
    };
    script.packageScript.updateWorskpaceRootPackageJson = async (...args) =>
      recorder.record("updateRootPackageJson", ...args);
    script.applicationScript.test = async (...args) => recorder.record("test", ...args);
    script.packageScript.buildPackage = async (...args) => recorder.record("buildPackage", ...args);
    script.packageScript.verifyAkanPublishPackages = async (...args) =>
      recorder.record("verifyAkanPublishPackages", ...args);
    script.cloudRunner.deployAkan = async (...args) => recorder.record("deployAkan", ...args);

    await script.deployAkan(workspace as never, { test: true, registryUrl: "http://127.0.0.1:4873" });

    expect(recorder.names()).toEqual([
      "getAkanPkgs",
      "updateRootPackageJson",
      "test",
      "test",
      "buildPackage",
      "buildPackage",
      "verifyAkanPublishPackages",
      "deployAkan",
    ]);
    expect(recorder.calls.at(-2)?.args).toEqual([workspace]);
    expect(recorder.calls.at(-1)?.args).toEqual([
      workspace,
      ["akanjs", "@akanjs/cli"],
      { registryUrl: "http://127.0.0.1:4873" },
    ]);
  });
});

describe("CloudScript platform tests", () => {
  const stubDeploy = (recorder: ReturnType<typeof createCallRecorder>, { failLocalTest = false } = {}) => {
    const script = CommandContainer.get(CloudScript);
    script.cloudRunner.getAkanPkgs = async () => ["akanjs"];
    script.packageScript.updateWorskpaceRootPackageJson = async () => undefined;
    script.cloudRunner.startPlatformTests = async (...args) => {
      recorder.record("startPlatformTests", ...args);
      return "run" as never;
    };
    script.cloudRunner.settlePlatformTests = async (...args) => {
      recorder.record("settlePlatformTests", ...args);
      return [];
    };
    script.applicationScript.test = async () => {
      recorder.record("test");
      if (failLocalTest) throw new Error("local suite failed");
    };
    script.packageScript.buildPackage = async () => recorder.record("buildPackage");
    script.packageScript.verifyAkanPublishPackages = async () => recorder.record("verify");
    script.cloudRunner.deployAkan = async () => recorder.record("deployAkan");
    return script;
  };

  test("starts the remote platforms before the local suites and settles them before anything is built", async () => {
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace");
    await stubDeploy(recorder).deployAkan(workspace as never, { platforms: ["linux", "windows"] });

    expect(recorder.names()).toEqual([
      "startPlatformTests",
      "test",
      "settlePlatformTests",
      "buildPackage",
      "verify",
      "deployAkan",
    ]);
    expect(recorder.calls[0]?.args.slice(1)).toEqual([["linux", "windows"], ["akanjs"]]);
    expect(recorder.calls[2]?.args[1]).toEqual({ interactive: true, recordStreaks: true, checkDrift: true });
  });

  test("still settles the remote run when a local suite fails, without prompting, then fails the deploy", async () => {
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace");

    await expect(
      stubDeploy(recorder, { failLocalTest: true }).deployAkan(workspace as never, { platforms: ["linux"] }),
    ).rejects.toThrow("local suite failed");
    expect(recorder.names()).toEqual(["startPlatformTests", "test", "settlePlatformTests"]);
    expect(recorder.calls[2]?.args[1]).toEqual({ interactive: false, recordStreaks: false, checkDrift: true });
  });

  test("runs no remote platform when none is asked for", async () => {
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace");
    await stubDeploy(recorder).deployAkan(workspace as never, { platforms: [] });

    expect(recorder.names()).not.toContain("startPlatformTests");
  });
});

describe("CloudRunner", () => {
  test("login opens its session through CloudApi.fromHost, so one in its last hour is refreshed, not signed in again", async () => {
    const host = "https://cloud.test";
    const self = { id: "u1", nickname: "akan" };
    const fromHost = spyOn(CloudApi, "fromHost").mockResolvedValue({ host, getRemoteSelf: async () => self } as never);
    spyOn(GlobalConfig, "getHostConfig").mockResolvedValue({ host, auth: {} });
    spyOn(CloudApi.prototype, "getRemoteSelf").mockResolvedValue(self);
    const workspace = createFakeExecutor("workspace");

    expect(await new CloudRunner().login(host, workspace as never)).toBe(true);
    expect(fromHost).toHaveBeenCalledWith(workspace, host);
  });

  test("filters Akan packages from workspace package list", async () => {
    const workspace = {
      getPkgs: async () => ["akanjs", "create-akan-workspace", "@sample/tool"],
      readJson: async () => ({}),
    };

    await expect(new CloudRunner().getAkanPkgs(workspace as never)).resolves.toEqual([
      "akanjs",
      "create-akan-workspace",
    ]);
  });

  test("leaves out a private Akan package, which ships inside another one's dist", async () => {
    const workspace = {
      getPkgs: async () => ["akanjs", "@akanjs/cli", "@akanjs/native"],
      readJson: async (filePath: string) => (filePath === "pkgs/@akanjs/native/package.json" ? { private: true } : {}),
    };

    await expect(new CloudRunner().getAkanPkgs(workspace as never)).resolves.toEqual(["akanjs", "@akanjs/cli"]);
  });

  test("update installs the package that ships the akan binary at the requested tag", async () => {
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace", { exists: async () => false }, recorder);

    await new CloudRunner().update(workspace as never, "dev");

    expect(recorder.calls).toEqual([
      { name: "workspace.spawn", args: ["bun", ["add", "-g", "@akanjs/cli@dev"], { env: process.env }] },
    ]);
  });

  test("publishes to a custom registry and normalizes internal Akan dependency versions", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ "dist-tags": { rc: "2.1.0-rc.10" } }))) as never;
    const recorder = createCallRecorder();
    const files = new Map<string, unknown>([
      ["pkgs/akanjs/package.json", { name: "akanjs", version: "2.1.0-rc.10" }],
      [
        "pkgs/@akanjs/cli/package.json",
        {
          name: "@akanjs/cli",
          version: "2.1.0-rc.10",
          dependencies: { akanjs: "2.1.0-rc.9" },
        },
      ],
      ["dist/pkgs/akanjs/package.json", { name: "akanjs", version: "2.1.0-rc.10" }],
      [
        "dist/pkgs/@akanjs/cli/package.json",
        {
          name: "@akanjs/cli",
          version: "2.1.0-rc.10",
          dependencies: { akanjs: "2.1.0-rc.9" },
        },
      ],
    ]);
    const workspace = createFakeExecutor(
      "workspace",
      {
        workspaceRoot: "/repo",
        readJson: async (path: string) => files.get(path),
        writeFile: async (path: string, content: string) => files.set(path, JSON.parse(content)),
        writeJson: async (path: string, content: unknown) => files.set(path, content),
      },
      recorder,
    );

    try {
      await new CloudRunner().deployAkan(workspace as never, ["akanjs", "@akanjs/cli"], {
        registryUrl: "http://127.0.0.1:4873/",
        confirmPublish: false,
        tag: "rc",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(files.get("dist/pkgs/@akanjs/cli/package.json")).toMatchObject({
      version: "2.1.0-rc.11",
      dependencies: { akanjs: "2.1.0-rc.11" },
    });
    expect(recorder.calls.filter((call) => call.name === "workspace.spawn").map((call) => call.args)).toEqual([
      [
        "npm",
        [
          "publish",
          "--tag",
          "rc",
          "--registry",
          "http://127.0.0.1:4873",
          "--//127.0.0.1:4873/:_authToken=akan-local-registry",
        ],
        {
          cwd: path.join("/repo", "dist/pkgs", "akanjs"),
          env: expect.objectContaining({
            AKAN_NPM_REGISTRY: "http://127.0.0.1:4873",
            NPM_CONFIG_REGISTRY: "http://127.0.0.1:4873",
          }),
          stdio: "inherit",
        },
      ],
      [
        "npm",
        [
          "publish",
          "--tag",
          "rc",
          "--registry",
          "http://127.0.0.1:4873",
          "--//127.0.0.1:4873/:_authToken=akan-local-registry",
        ],
        {
          cwd: path.join("/repo", "dist/pkgs", "@akanjs/cli"),
          env: expect.objectContaining({
            AKAN_NPM_REGISTRY: "http://127.0.0.1:4873",
            NPM_CONFIG_REGISTRY: "http://127.0.0.1:4873",
          }),
          stdio: "inherit",
        },
      ],
    ]);
  });

  test("writes each package.json it versions as the formatter prints it, ending in a newline", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ "dist-tags": { rc: "2.1.0-rc.3" } }))) as never;
    const { root, workspace } = track(await makeCliTempWorkspace());
    for (const dir of ["pkgs/akanjs", "dist/pkgs/akanjs"])
      await writeJson(path.join(root, dir, "package.json"), { name: "akanjs", version: "2.1.0-rc.3" });
    spyOn(workspace, "spawn").mockResolvedValue("");

    try {
      await new CloudRunner().deployAkan(workspace, ["akanjs"], {
        registryUrl: "http://127.0.0.1:4873/",
        confirmPublish: false,
        tag: "rc",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    for (const dir of ["pkgs/akanjs", "dist/pkgs/akanjs"])
      expect(await readFile(path.join(root, dir, "package.json"), "utf8")).toBe(
        `${JSON.stringify({ name: "akanjs", version: "2.1.0-rc.4" }, null, 2)}\n`,
      );
  });

  const createEnvWorkspace = (
    root: string,
    recorder = createCallRecorder(),
    {
      execs = [["demo"], [], []],
      envFiles = (dirPath: string) =>
        dirPath === "apps/demo/env"
          ? ["env.client.local.ts", "env.server.local.ts", "env.client.type.ts", "env.client.example.ts"]
          : [],
    }: { execs?: string[][]; envFiles?: (dirPath: string) => string[] } = {},
  ) =>
    createFakeExecutor(
      "workspace",
      {
        workspaceRoot: root,
        getExecs: async () => execs,
        readdir: async (dirPath: string) => envFiles(dirPath),
        mkdir: async (...args: unknown[]) => recorder.record("workspace.mkdir", ...args),
        remove: async (...args: unknown[]) => recorder.record("workspace.remove", ...args),
        exists: async (filePath: string) => existsSync(path.join(root, filePath)),
        readFile: async (filePath: string) => readFile(path.join(root, filePath), "utf8"),
        writeFile: async (filePath: string, content: string) => {
          recorder.record("workspace.writeFile", filePath);
          await writeText(path.join(root, filePath), content);
        },
      },
      recorder,
    );

  test("archives one subspace's slice while the managed .gitignore block still names every app", async () => {
    const root = await makeTempRoot();
    await writeText(`${root}/apps/demo/secrets/token.json`, "{}");
    await writeText(`${root}/apps/other/secrets/other.json`, "{}");
    stubAppConfigs({ demo: ["secrets/**/*"], other: ["secrets/**/*"] });
    const recorder = createCallRecorder();
    const workspace = createEnvWorkspace(root, recorder, {
      execs: [["demo", "other"], ["kit", "unused"], []],
      envFiles: (dirPath) =>
        ["apps/demo/env", "apps/other/env", "libs/kit/env", "libs/unused/env"].includes(dirPath)
          ? ["env.server.local.ts"]
          : [],
    });

    const result = await new CloudRunner().gatherEnvFiles(workspace as never, {
      scope: { apps: ["demo"], libs: ["kit"] },
      archivePath: "local/env.acme.tar",
    });

    const expectedFiles = [
      "apps/demo/env/env.server.local.ts",
      "apps/demo/secrets/token.json",
      "libs/kit/env/env.server.local.ts",
    ];
    expect(result).toEqual({ files: expectedFiles, path: "local/env.acme.tar" });
    const tarCall = recorder.calls.find((call) => call.name === "workspace.spawn");
    expect(tarCall?.args).toEqual(["tar", ["-cf", "local/env.acme.tar", ...expectedFiles], { cwd: root }]);
    const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");
    expect(gitignore).toContain("apps/demo/secrets/**/*");
    expect(gitignore).toContain("apps/other/secrets/**/*");
  });

  test("archives custom secret files resolved from app config globs alongside default env files", async () => {
    const root = await makeTempRoot();
    await writeText(`${root}/apps/demo/secrets/token.json`, "{}");
    await writeText(`${root}/apps/demo/secrets/nested/key.pem`, "key");
    // A duplicate glob and a glob overlapping the first ensure results are deduped.
    stubAppConfigs({ demo: ["secrets/**/*", "secrets/token.json"] });
    const recorder = createCallRecorder();
    const workspace = createEnvWorkspace(root, recorder);

    const result = await new CloudRunner().gatherEnvFiles(workspace as never);

    const expectedFiles = [
      "apps/demo/env/env.client.local.ts",
      "apps/demo/env/env.server.local.ts",
      "apps/demo/secrets/nested/key.pem",
      "apps/demo/secrets/token.json",
    ];
    expect(result).toEqual({ files: expectedFiles, path: "local/env.tar" });
    const tarCall = recorder.calls.find((call) => call.name === "workspace.spawn");
    expect(tarCall?.args).toEqual(["tar", ["-cf", "local/env.tar", ...expectedFiles], { cwd: root }]);
    // Secret globs are synced (not the resolved files) so newly added secrets stay ignored.
    const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");
    expect(gitignore).toContain("# akan:secrets (managed by akan.config.ts — do not edit)");
    expect(gitignore).toContain("apps/demo/secrets/**/*");
    expect(gitignore).toContain("apps/demo/secrets/token.json");
    expect(gitignore).toContain("# akan:secrets:end");
  });

  test("syncs secret globs into an existing .gitignore without clobbering user entries", async () => {
    const root = await makeTempRoot();
    await writeText(`${root}/.gitignore`, "node_modules\ndist\n");
    await writeText(`${root}/apps/demo/secrets/token.json`, "{}");
    stubAppConfigs({ demo: ["secrets/**/*"] });
    const workspace = createEnvWorkspace(root);

    await new CloudRunner().gatherEnvFiles(workspace as never);

    const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");
    expect(gitignore).toBe(
      "node_modules\ndist\n\n# akan:secrets (managed by akan.config.ts — do not edit)\napps/demo/secrets/**/*\n# akan:secrets:end\n",
    );
  });

  test("re-running upload-env leaves the managed .gitignore block unchanged (idempotent)", async () => {
    const root = await makeTempRoot();
    await writeText(`${root}/.gitignore`, "node_modules\n");
    await writeText(`${root}/apps/demo/secrets/token.json`, "{}");
    stubAppConfigs({ demo: ["secrets/**/*"] });

    const first = createCallRecorder();
    await new CloudRunner().gatherEnvFiles(createEnvWorkspace(root, first) as never);
    const afterFirst = await readFile(path.join(root, ".gitignore"), "utf8");

    const second = createCallRecorder();
    await new CloudRunner().gatherEnvFiles(createEnvWorkspace(root, second) as never);
    const afterSecond = await readFile(path.join(root, ".gitignore"), "utf8");

    expect(afterSecond).toBe(afterFirst);
    expect(first.names()).toContain("workspace.writeFile");
    expect(second.names()).not.toContain("workspace.writeFile");
  });

  test("removes the managed .gitignore block when no secrets are configured", async () => {
    const root = await makeTempRoot();
    await writeText(
      `${root}/.gitignore`,
      "node_modules\n\n# akan:secrets (managed by akan.config.ts — do not edit)\napps/demo/secrets/**/*\n# akan:secrets:end\n",
    );
    stubAppConfigs({ demo: [] });
    const workspace = createEnvWorkspace(root);

    await new CloudRunner().gatherEnvFiles(workspace as never);

    const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");
    expect(gitignore).toBe("node_modules\n");
  });

  test("archives only default env files when no secrets are configured", async () => {
    const root = await makeTempRoot();
    stubAppConfigs({ demo: [] });
    const recorder = createCallRecorder();
    const workspace = createEnvWorkspace(root, recorder);

    const result = await new CloudRunner().gatherEnvFiles(workspace as never);

    expect(result.files).toEqual(["apps/demo/env/env.client.local.ts", "apps/demo/env/env.server.local.ts"]);
  });

  test("ignores secret globs that match no files", async () => {
    const root = await makeTempRoot();
    await writeText(`${root}/apps/demo/package.json`, "{}");
    stubAppConfigs({ demo: ["secrets/**/*"] });
    const recorder = createCallRecorder();
    const workspace = createEnvWorkspace(root, recorder);

    const result = await new CloudRunner().gatherEnvFiles(workspace as never);

    expect(result.files).toEqual(["apps/demo/env/env.client.local.ts", "apps/demo/env/env.server.local.ts"]);
  });

  test("throws when no env files and no secret matches exist", async () => {
    const root = await makeTempRoot();
    await writeText(`${root}/apps/demo/package.json`, "{}");
    stubAppConfigs({ demo: ["secrets/**/*"] });
    const recorder = createCallRecorder();
    const workspace = createEnvWorkspace(root, recorder, { envFiles: () => [] });

    await expect(new CloudRunner().gatherEnvFiles(workspace as never)).rejects.toThrow(
      "No environment files found to archive",
    );
  });
});

describe("pipeline secrets", () => {
  const fakeApi = () => {
    const recorder = createCallRecorder();
    const api = {
      uploadSecret: async (devProjectId: string, secret: { scope: string; name: string; value: string }) => {
        recorder.record("uploadSecret", devProjectId, secret);
        return { name: secret.name, scope: secret.scope, updatedAt: "2026-10-10T00:00:00.000Z" };
      },
      listSecrets: async () => [
        { name: "NPM_TOKEN", scope: "*", updatedAt: "2026-10-09", updatedBy: "kim" },
        { name: "DISCORD_WEBHOOK", scope: "main", updatedAt: "2026-10-10", updatedBy: "lee" },
        { name: "DISCORD_WEBHOOK", scope: "develop", updatedAt: "2026-10-10", updatedBy: "lee" },
      ],
      removeSecret: async (devProjectId: string, secret: { scope: string; name: string }) => {
        recorder.record("removeSecret", devProjectId, secret);
        return true;
      },
    };
    return { api: api as unknown as CloudApi, recorder };
  };

  test("no command takes the value as an argument or option", () => {
    for (const key of ["uploadSecret", "listSecrets", "removeSecret"]) {
      const [args, options] = getArgMetas(CloudCommand, key);
      const names = [...args, ...options].map((meta) => ("name" in meta ? meta.name : ""));
      expect(names).not.toContain("value");
    }
  });

  test("uploads to the branch scope or every branch, and refuses a reserved or malformed name first", async () => {
    const { api, recorder } = fakeApi();
    const log = spyOn(console, "log").mockImplementation(() => {});
    await new CloudRunner().uploadSecret(api, "project-1", { name: "NPM_TOKEN", branch: null, value: "t" });
    await new CloudRunner().uploadSecret(api, "project-1", { name: "NPM_TOKEN", branch: "main", value: "t" });
    await expect(
      new CloudRunner().uploadSecret(api, "project-1", { name: "AKAN_CI_BRANCH", branch: null, value: "t" }),
    ).rejects.toThrow("reserved for the executor");
    await expect(new CloudRunner().removeSecret(api, "project-1", { name: "lower", branch: null })).rejects.toThrow(
      "not a secret name",
    );
    const pasted = await new CloudRunner()
      .uploadSecret(api, "project-1", { name: "npm_live_value", branch: null, value: "t" })
      .catch((error: Error) => error.message);
    expect(pasted).toStartWith("The name is not a secret name");
    expect(pasted).not.toContain("npm_live_value");
    log.mockRestore();
    expect(recorder.calls).toEqual([
      { name: "uploadSecret", args: ["project-1", { scope: "*", name: "NPM_TOKEN", value: "t" }] },
      { name: "uploadSecret", args: ["project-1", { scope: "main", name: "NPM_TOKEN", value: "t" }] },
    ]);
  });

  test("lists names and scopes only, a branch narrowing to its own and the every-branch ones", () => {
    const rows = PipelineSecrets.format([
      { name: "NPM_TOKEN", scope: "*", updatedAt: "2026-10-09", updatedBy: "kim" },
      { name: "DISCORD_WEBHOOK", scope: "main", updatedAt: "2026-10-10", updatedBy: "lee" },
    ]).split("\n");
    expect(rows).toEqual([
      "NAME             SCOPE         UPDATED     BY",
      "DISCORD_WEBHOOK  main          2026-10-10  lee",
      "NPM_TOKEN        every branch  2026-10-09  kim",
    ]);
    expect(PipelineSecrets.format([])).toBe("No pipeline secrets.");
  });

  test("a secret whose last writer is gone lists with a dash instead of failing the listing", () => {
    expect(
      PipelineSecrets.format([{ name: "NPM_TOKEN", scope: "main", updatedAt: "2026-10-09", updatedBy: null }]).split(
        "\n",
      ),
    ).toEqual(["NAME       SCOPE  UPDATED     BY", "NPM_TOKEN  main   2026-10-09  -"]);
  });

  test("upload-secret and remove-secret refuse a bad name or branch before reading a value or signing in", async () => {
    const script = CommandContainer.get(CloudScript);
    const recorder = createCallRecorder();
    script.cloudRunner.projectOf = async (...args) => recorder.record<string>("projectOf", ...args);
    script.cloudRunner.readSecretValue = async (...args) => recorder.record<string>("readSecretValue", ...args);
    script.cloudRunner.login = async (...args) => recorder.record<boolean>("login", ...args);
    const workspace = createFakeExecutor("workspace") as never;
    const upload = { branch: null, file: null, subspace: null };

    await expect(script.uploadSecret(workspace, { ...upload, name: "lower" })).rejects.toThrow("not a secret name");
    await expect(script.uploadSecret(workspace, { ...upload, name: "NPM_TOKEN", branch: "feature" })).rejects.toThrow(
      "not a deployed branch",
    );
    await expect(script.removeSecret(workspace, { name: "lower", branch: null, subspace: null })).rejects.toThrow(
      "not a secret name",
    );
    await expect(script.listSecrets(workspace, { branch: "release", subspace: null })).rejects.toThrow(
      "not a deployed branch",
    );
    expect(recorder.calls).toEqual([]);
  });

  test("a file value loses one trailing newline, and an empty or oversized value is refused", async () => {
    const root = await makeTempRoot();
    const file = path.join(root, "token.txt");
    await writeText(file, "line one\nline two\n");
    expect(await new CloudRunner().readSecretValue("TOKEN", file)).toBe("line one\nline two");
    await writeText(file, "\n");
    await expect(new CloudRunner().readSecretValue("TOKEN", file)).rejects.toThrow("is empty");
    await writeText(file, "x".repeat(64 * 1024 + 1));
    await expect(new CloudRunner().readSecretValue("TOKEN", file)).rejects.toThrow("over 65536");
  });

  test("a value read from a piped stdin is announced on stderr first, without the value", async () => {
    const ownIsTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { value: undefined, configurable: true });
    spyOn(Bun.stdin, "text").mockResolvedValue("s3cret-value\n");
    const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(await new CloudRunner().readSecretValue("NPM_TOKEN", null)).toBe("s3cret-value");
      expect(stderr.mock.calls).toEqual([
        ["Reading the value of NPM_TOKEN from stdin until it closes (or pass --file <path>).\n"],
      ]);
    } finally {
      stderr.mockRestore();
      if (ownIsTTY) Object.defineProperty(process.stdin, "isTTY", ownIsTTY);
      else Reflect.deleteProperty(process.stdin, "isTTY");
    }
  });

  test("a subspace's secrets go to the project its workspaceId names", async () => {
    const root = await makeTempRoot();
    await writeText(
      path.join(root, "akan.config.ts"),
      'export default { subspace: { subspaces: [{ name: "acme", repo: "a.git", apps: ["web"], workspaceId: "acme-project" }, { name: "bare", repo: "b.git", apps: ["api"] }] } };\n',
    );
    const { WorkspaceExecutor } = await import("@akanjs/devkit/executors");
    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    expect(await new CloudRunner().projectOf(workspace as never, "acme")).toBe("acme-project");
    await expect(new CloudRunner().projectOf(workspace as never, "bare")).rejects.toThrow("declares no workspaceId");
    expect(await new CloudRunner().projectOf(workspace as never, "acme", "web")).toBe("acme-project");
    await expect(new CloudRunner().projectOf(workspace as never, "acme", "api")).rejects.toThrow(
      'Subspace "acme" declares no app api in subspace in the workspace root akan.config.ts; it serves web.',
    );
  });

  test("each refusal status reads as what to do about it", async () => {
    const failing = (error: Error) =>
      ({
        uploadSecret: async () => {
          throw error;
        },
      }) as unknown as CloudApi;
    const upload = (api: CloudApi) =>
      new CloudRunner().uploadSecret(api, "project-1", { name: "NPM_TOKEN", branch: null, value: "t" });
    await expect(upload(failing(httpError(401, "no token")))).rejects.toThrow("run `akan login`");
    await expect(
      upload(failing(httpError(400, '{"error":"pipelineSecret.error.tooMany","statusCode":400}'))),
    ).rejects.toThrow("The project refused the request: pipelineSecret.error.tooMany.");
    await expect(
      upload(
        failing(httpError(400, JSON.stringify({ details: "x".repeat(400), error: "pipelineSecret.error.tooMany" }))),
      ),
    ).rejects.toThrow("The project refused the request: pipelineSecret.error.tooMany.");
    await expect(
      upload(failing(httpError(503, '{"error":"pipelineSecret.error.unconfigured","statusCode":503}'))),
    ).rejects.toThrow("The server is not configured for pipeline secrets yet: pipelineSecret.error.unconfigured.");
    await expect(upload(failing(new Error("socket hang up")))).rejects.toThrow("socket hang up");
  });

  test("only the server's own 503 reads as no pipeline secrets; a proxy's or a restarting gateway's keeps its cause", async () => {
    const answering = (body: string) =>
      new CloudRunner().uploadSecret(
        {
          uploadSecret: async () => {
            throw httpError(503, body);
          },
        } as unknown as CloudApi,
        "project-1",
        { name: "NPM_TOKEN", branch: null, value: "t" },
      );
    for (const body of [
      "<html><title>503 Service Temporarily Unavailable</title></html>",
      "No healthy federation child is ready",
      '{"error":"base.error.serverUnavailable","statusCode":503,"data":{"status":503}}',
      "{}",
    ]) {
      await expect(answering(body)).rejects.toThrow(`503 Service Unavailable from /uploadSecret/project-1: ${body}`);
    }
  });

  test("a secret's branch is one the server deploys", async () => {
    const { api } = fakeApi();
    await expect(
      new CloudRunner().uploadSecret(api, "project-1", { name: "NPM_TOKEN", branch: "feature-x", value: "t" }),
    ).rejects.toThrow("--branch feature-x is not a deployed branch: debug, develop, main.");
    await expect(new CloudRunner().listSecrets(api, "project-1", "release")).rejects.toThrow("not a deployed branch");
  });

  test("a 403 from the project's guard says who may make the call", async () => {
    const api = {
      uploadSecret: async () => {
        throw httpError(403, "denied");
      },
    } as unknown as CloudApi;
    await expect(
      new CloudRunner().uploadSecret(api, "project-1", { name: "NPM_TOKEN", branch: null, value: "t" }),
    ).rejects.toThrow("The project refused: a secret is written by a project member signed in with `akan login`.");
  });
});

describe("OTA uploads", () => {
  test("push-update sends the files the pack lists as one tgz with the target's channel, and leaves no archive behind", async () => {
    const out = mkdtempSync(path.join(os.tmpdir(), "akan-pack-test-"));
    mkdirSync(path.join(out, "files"));
    writeFileSync(path.join(out, "files", "a".repeat(64)), "<html></html>");
    writeFileSync(path.join(out, "files", "b".repeat(64)), "an earlier pack's file");
    writeFileSync(path.join(out, "notes.txt"), "not part of the pack");
    const listed = { path: "index.html", sha256: "a".repeat(64), size: 13 };
    writeFileSync(
      path.join(out, "manifest.template.json"),
      JSON.stringify({ files: [listed, { ...listed, path: "a" }] }),
    );
    for (const name of ["bundle.json", "pack.json"]) writeFileSync(path.join(out, name), "{}");
    const pack = {
      schema: 1 as const,
      app: "lu",
      target: "default",
      platform: "android" as const,
      env: "main" as const,
      channel: "main",
      appId: "com.lu",
      appVersion: "1.0.0",
      nativeApi: "0123456789abcdef",
      webHash: "f".repeat(64),
      files: 1,
      size: 13,
      out,
    };
    const stored: Uint8Array[] = [];
    const storage = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: async (request) => {
        stored.push(new Uint8Array(await request.arrayBuffer()));
        return new Response(null);
      },
    });
    const announced: Record<string, unknown>[] = [];
    const tmpdir = process.env.TMPDIR;
    const scratch = mkdtempSync(path.join(os.tmpdir(), "akan-tmpdir-test-"));
    process.env.TMPDIR = scratch;
    const apiAnswering = (release: Record<string, unknown>) =>
      ({
        requestUpdateUpload: async (devProjectId: string, upload: Record<string, unknown>) => {
          announced.push({ devProjectId, ...upload });
          return {
            uploadId: "upload-1",
            uploadUrl: `http://127.0.0.1:${storage.port}/upload-1`,
            expiresAt: new Date(Date.now() + 900_000).toISOString(),
            contentType: "application/gzip",
          };
        },
        commitUpdateUpload: async () => release,
      }) as unknown as CloudApi;

    try {
      const published = { id: "release-1", status: "published", problems: [] };
      const release = await new CloudRunner().pushUpdate(apiAnswering(published), "project-1", pack, {
        channel: null,
        notes: "fix",
      });

      expect(release).toEqual(published);
      expect(announced[0]).toMatchObject({
        devProjectId: "project-1",
        appName: "lu",
        target: "default",
        platform: "android",
        channel: "main",
        notes: "fix",
      });
      const copy = path.join(out, "..", `${path.basename(out)}-sent.tgz`);
      await Bun.write(copy, stored[0] ?? new Uint8Array());
      const entries = Bun.spawnSync(["tar", "-tzf", copy]).stdout.toString().split(/\r?\n/).filter(Boolean);
      expect(entries.sort()).toEqual([
        "./bundle.json",
        `./files/${"a".repeat(64)}`,
        "./manifest.template.json",
        "./pack.json",
      ]);
      expect(announced[0]?.size).toBe(stored[0]?.byteLength);
      expect(readdirSync(scratch)).toEqual([]);

      const rejected = { id: "release-2", status: "rejected", problems: ["deepLinks differ from the app's"] };
      const refusal = await new CloudRunner()
        .pushUpdate(apiAnswering(rejected), "project-1", pack, { channel: "pilot", notes: null })
        .catch((error: unknown) => error);
      expect(refusal).toBeInstanceOf(ExitCodeError);
      expect(refusal).toMatchObject({
        exitCode: 2,
        message:
          "The project rejected lu default android on channel pilot: release release-2:\n  - deepLinks differ from the app's",
      });
      expect(announced[1]).toMatchObject({ channel: "pilot", notes: null });

      const refused = {
        requestUpdateUpload: async () => {
          throw new CloudHttpError(401, "Unauthorized", "/requestUpdateUpload/project-1", "{}");
        },
      } as unknown as CloudApi;
      await expect(
        new CloudRunner().pushUpdate(refused, "project-1", pack, { channel: "pilot", notes: null }),
      ).rejects.toThrow("run `akan login`");

      writeFileSync(
        path.join(out, "manifest.template.json"),
        JSON.stringify({ files: [{ ...listed, sha256: "../pack.json" }] }),
      );
      await expect(
        new CloudRunner().pushUpdate(apiAnswering(published), "project-1", pack, { channel: null, notes: null }),
      ).rejects.toThrow("not 64 hex digits");

      writeFileSync(
        path.join(out, "manifest.template.json"),
        JSON.stringify({ files: [{ ...listed, sha256: "c".repeat(64) }] }),
      );
      const asked = announced.length;
      await expect(
        new CloudRunner().pushUpdate(apiAnswering(published), "project-1", pack, { channel: null, notes: null }),
      ).rejects.toThrow(`tar of ${out} failed`);
      expect(announced).toHaveLength(asked);
      expect(readdirSync(scratch)).toEqual([]);
    } finally {
      storage.stop(true);
      if (tmpdir === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = tmpdir;
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

const packFixture = async (out: string, fields: Partial<NativeUpdatePack> = {}): Promise<NativeUpdatePack> => {
  const hash = "a".repeat(64);
  await writeText(path.join(out, "files", hash), "<html></html>");
  await writeJson(path.join(out, "manifest.template.json"), {
    files: [{ path: "index.html", sha256: hash, size: 13 }],
  });
  await writeJson(path.join(out, "bundle.json"), { schema: 1, web: { hash: "f".repeat(64) } });
  const pack: NativeUpdatePack = {
    schema: 1,
    app: "lu",
    target: "default",
    platform: "android",
    env: "main",
    channel: "main",
    appId: "com.lu",
    appVersion: "1.0.0",
    nativeApi: "0123456789abcdef",
    webHash: "f".repeat(64),
    files: 1,
    size: 13,
    out,
    ...fields,
  };
  await writeJson(path.join(out, "pack.json"), pack);
  return pack;
};

const appOf = (
  root: string,
  {
    name = "lu",
    targets = { default: {} },
    basePaths = [],
  }: { name?: string; targets?: object; basePaths?: string[] } = {},
) =>
  ({
    name,
    cwdPath: path.join(root, "apps", name),
    workspace: { workspaceRoot: root },
    getConfig: async () => ({ native: { targets }, basePaths: new Set(basePaths) }),
  }) as never;

describe("push-update --pack", () => {
  const none = { platform: null, target: null, env: null, allowLocalRelease: false };

  test("takes the platform, target and env from pack.json, and refuses a flag given beside it that disagrees", async () => {
    const root = await makeTempRoot();
    const { out } = await packFixture(path.join(root, "pack"));
    const app = appOf(root, { targets: { default: {}, kiosk: {} } });
    const runner = new CloudRunner();

    expect(await runner.readPack(app, out, none)).toMatchObject({
      platform: "android",
      target: "default",
      env: "main",
    });
    expect(
      await runner.readPack(app, out, {
        platform: "android",
        target: "default",
        env: "main",
        allowLocalRelease: false,
      }),
    ).toMatchObject({ target: "default" });
    await expect(runner.readPack(app, out, { ...none, platform: "ios" })).rejects.toThrow(
      `The pack in ${out} is lu default android --env main, not ios.`,
    );
    await expect(runner.readPack(app, out, { ...none, env: "debug" })).rejects.toThrow("not --env debug.");
    await expect(runner.readPack(app, out, { ...none, target: "kiosk" })).rejects.toThrow(
      "not --target kiosk (kiosk).",
    );
    await expect(runner.readPack(app, out, { ...none, target: "all" })).rejects.toThrow(
      "not --target all (default, kiosk).",
    );
    await expect(runner.readPack(appOf(root, { name: "globex" }), out, none)).rejects.toThrow("not globex's.");
  });

  test("compares --target with the target it resolves to, so a basePath or `all` naming the pack's target passes", async () => {
    const root = await makeTempRoot();
    const runner = new CloudRunner();
    const admin = await packFixture(path.join(root, "admin"), { target: "adminApp" });
    const app = appOf(root, { targets: { default: {}, adminApp: { basePath: "admin" } }, basePaths: ["admin"] });
    expect(await runner.readPack(app, admin.out, { ...none, target: "admin" })).toMatchObject({ target: "adminApp" });

    const single = await packFixture(path.join(root, "single"));
    expect(await runner.readPack(appOf(root), single.out, { ...none, target: "all" })).toMatchObject({
      target: "default",
    });
  });

  test("a pack built with --env local is refused unless --allow-local-release is given", async () => {
    const root = await makeTempRoot();
    const { out } = await packFixture(path.join(root, "pack"), { env: "local", channel: "local" });
    await expect(new CloudRunner().readPack(appOf(root), out, none)).rejects.toThrow(
      "and a local pack is blocked. Pass --allow-local-release only for explicit local release testing.",
    );
    await expect(new CloudRunner().readPack(appOf(root), out, { ...none, env: "main" })).rejects.toThrow(
      "not --env main.",
    );
    expect(await new CloudRunner().readPack(appOf(root), out, { ...none, allowLocalRelease: true })).toMatchObject({
      env: "local",
    });
  });
});

describe("push-update", () => {
  const options = {
    platform: null,
    target: null,
    env: null,
    channel: null,
    notes: null,
    subspace: null,
    write: false,
    allowLocalRelease: false,
    pack: null,
  };
  const stubPush = (pack: NativeUpdatePack) => {
    const script = CommandContainer.get(CloudScript);
    const recorder = createCallRecorder();
    script.cloudRunner.projectOf = async (...args) => {
      recorder.record("projectOf", ...args);
      return "project-1";
    };
    script.applicationScript.packUpdate = async (...args) => {
      recorder.record("packUpdate", ...args);
      return pack;
    };
    script.cloudRunner.login = async () => true;
    script.cloudRunner.pushUpdate = async (...args) => {
      recorder.record("pushUpdate", ...args);
      return { id: "release-1" };
    };
    spyOn(GlobalConfig, "hostFor").mockResolvedValue("https://cloud.test");
    spyOn(CloudApi, "fromHost").mockResolvedValue({} as never);
    return { script, recorder };
  };

  test("packs for the target --target resolves to, without comparing the raw flag with the target's name", async () => {
    const root = await makeTempRoot();
    const pack = await packFixture(path.join(root, "pack"), { target: "adminApp" });
    const { script, recorder } = stubPush(pack);

    await script.pushUpdate(createFakeExecutor("workspace") as never, appOf(root), {
      ...options,
      platform: "android",
      target: "admin",
    });

    expect(recorder.names()).toEqual(["projectOf", "packUpdate", "pushUpdate"]);
    expect(recorder.calls[0]?.args.slice(1)).toEqual([null, "lu"]);
    expect(recorder.calls[1]?.args.slice(1)).toEqual([
      "android",
      { target: "admin", env: "main", write: false, allowLocalRelease: false },
    ]);
    expect(recorder.calls[2]?.args[2]).toBe(pack);
  });

  test("uploads a --pack folder given no other flag, the way a CI step runs it", async () => {
    const root = await makeTempRoot();
    const pack = await packFixture(path.join(root, "pack"));
    const { script, recorder } = stubPush(pack);

    await script.pushUpdate(createFakeExecutor("workspace") as never, appOf(root), { ...options, pack: pack.out });

    expect(recorder.names()).toEqual(["projectOf", "pushUpdate"]);
    expect(recorder.calls[1]?.args[2]).toMatchObject({ app: "lu", target: "default", platform: "android" });
  });

  test("a --pack folder its --against check refused exits 2 without uploading", async () => {
    const root = await makeTempRoot();
    const compat = { against: "store/bundle.json", compatible: false, problems: ["deepLinks differ"] };
    const pack = await packFixture(path.join(root, "pack"), { compat });
    const { script, recorder } = stubPush(pack);

    const refusal = await script
      .pushUpdate(createFakeExecutor("workspace") as never, appOf(root), { ...options, pack: pack.out })
      .catch((error: unknown) => error);

    expect(refusal).toMatchObject({
      exitCode: 2,
      message: `The pack in ${pack.out} needs a new store build; it differs from the one store/bundle.json came from:\n- deepLinks differ`,
    });
    expect(recorder.names()).toEqual(["projectOf"]);
  });

  test("without --pack, a missing --platform is named instead of asked for", async () => {
    const root = await makeTempRoot();
    const { script, recorder } = stubPush(await packFixture(path.join(root, "pack")));
    await expect(script.pushUpdate(createFakeExecutor("workspace") as never, appOf(root), options)).rejects.toThrow(
      "push-update needs --platform ios or android to pack, or --pack <dir>",
    );
    expect(recorder.names()).toEqual(["projectOf"]);
  });
});

describe("register-binary", () => {
  const storeBuild = async (root: string, bundle: Record<string, unknown> = {}) => {
    const bundlePath = path.join(root, "dist", "native", "lu", "default", "build", "android", "bundle.json");
    await writeJson(bundlePath, { schema: 1, web: { hash: "f".repeat(64) }, updates: { channel: "main" }, ...bundle });
    return bundlePath;
  };
  const uploadless = {
    requestUpdateUpload: async () => {
      throw new Error("nothing is uploaded for a refused store build");
    },
  } as unknown as CloudApi;
  const rebuild = "Run `akan release-android lu --target default --env main`, then register that build.";

  //? Every native build rewrites build/<platform>/bundle.json: a debug build after the release took its place.
  test("refuses a store build whose web bundle or channel is not the pack's", async () => {
    const root = await makeTempRoot();
    const pack = await packFixture(path.join(root, "pack"));
    const compare = spyOn(NativeApp, "compareBundles").mockResolvedValue({ compatible: true, problems: [] });
    const register = () =>
      new CloudRunner().registerBinary(uploadless, "project-1", appOf(root), pack, {
        distribution: "playStore",
        env: "main",
      });

    await storeBuild(root, { web: { hash: "e".repeat(64) }, updates: { channel: "debug" } });
    await expect(register()).rejects.toThrow(
      `is not this commit's --env main build: its web bundle differs from the pack's. ${rebuild}`,
    );
    expect(compare).not.toHaveBeenCalled();

    await storeBuild(root, { updates: { channel: "debug" } });
    await expect(register()).rejects.toThrow(
      `reads updates channel debug, and this commit's --env main pack is for main. ${rebuild}`,
    );
  });

  test("names how the store build differs natively, as pack-update --against does", async () => {
    const root = await makeTempRoot();
    const pack = await packFixture(path.join(root, "pack"));
    const bundlePath = await storeBuild(root);
    const compare = spyOn(NativeApp, "compareBundles").mockResolvedValue({
      compatible: false,
      problems: ["deep link schemes [lu] vs [] in the app"],
    });

    const refusal = await new CloudRunner()
      .registerBinary(uploadless, "project-1", appOf(root), pack, { distribution: "playStore", env: "main" })
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ExitCodeError);
    expect(refusal).toMatchObject({
      exitCode: 2,
      message: `The pack in ${pack.out} needs a new store build; it differs from the one ${bundlePath} came from:\n- deep link schemes [lu] vs [] in the app\n${rebuild}`,
    });
    expect(String(refusal)).not.toContain("provides native API");
    expect(compare).toHaveBeenCalledWith(path.join(root, "apps", "lu"), bundlePath, path.join(pack.out, "bundle.json"));
  });

  test("registers a matching store build on the pack's channel, and leaves no archive behind", async () => {
    const root = await makeTempRoot();
    const pack = await packFixture(path.join(root, "pack"));
    await storeBuild(root);
    spyOn(NativeApp, "compareBundles").mockResolvedValue({ compatible: true, problems: [] });
    const storage = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(null) });
    const registered: Record<string, unknown>[] = [];
    const api = {
      requestUpdateUpload: async () => ({
        uploadId: "upload-1",
        uploadUrl: `http://127.0.0.1:${storage.port}/upload-1`,
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        contentType: "application/gzip",
      }),
      registerAppBinary: async (_devProjectId: string, binary: Record<string, unknown>) => {
        registered.push(binary);
        return { id: "binary-1" };
      },
    } as unknown as CloudApi;
    const tmpdir = process.env.TMPDIR;
    const scratch = path.join(root, "tmp");
    mkdirSync(scratch);
    process.env.TMPDIR = scratch;

    try {
      const binary = await new CloudRunner().registerBinary(api, "project-1", appOf(root), pack, {
        distribution: "playStore",
        env: "main",
      });
      expect(binary).toEqual({ id: "binary-1" });
      expect(registered).toMatchObject([
        { appName: "lu", target: "default", distribution: "playStore", packUploadId: "upload-1", channel: "main" },
      ]);
      expect(readdirSync(scratch)).toEqual([]);
    } finally {
      storage.stop(true);
      if (tmpdir === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = tmpdir;
    }
  });
});

describe("upload-secret on a piped stdin", () => {
  test("names the missing NAME and exits 1 at once, never printing the piped value", async () => {
    const root = await makeTempRoot();
    await writeText(path.join(root, "package.json"), '{ "name": "repo", "version": "1.0.0" }\n');
    await writeText(path.join(root, "tsconfig.json"), "{}\n");
    const entry = path.join(root, "cli.ts");
    await writeText(
      entry,
      [
        `import { runCommands } from ${JSON.stringify(Bun.resolveSync("@akanjs/devkit/commandDecorators", import.meta.dir))};`,
        `import { CloudCommand } from ${JSON.stringify(path.join(import.meta.dir, "cloud.command.ts"))};`,
        "await runCommands(CloudCommand);",
        "",
      ].join("\n"),
    );
    const secret = "npm_FAKEtoken0123456789abcdefFAKE";
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("AKAN_")));
    const proc = Bun.spawn(["bun", entry, "upload-secret", "--host", "http://127.0.0.1:9"], {
      cwd: root,
      stdin: new Blob([secret]),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...env, HOME: path.join(root, "home"), GIT_CEILING_DIRECTORIES: path.dirname(root) },
    });
    const hung = setTimeout(() => proc.kill(), 45_000);
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(hung);

    expect(`${stdout}${stderr}`).not.toContain(secret);
    expect(stdout).toContain("Missing argument 'name': stdin is not a terminal to prompt on");
    expect(code).toBe(1);
  }, 60_000);
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

  test("an scp env download names the setting to use instead of asking for a server", async () => {
    const servers = spyOn(GlobalConfig, "getRemoteEnvServers").mockResolvedValue({});
    const workspace = createFakeExecutor("workspace", { workspaceRoot: "/repo" });

    await expect(new CloudRunner().downloadEnvByScp(workspace as never)).rejects.toThrow(
      "stdin is not a terminal to prompt on, so set AKAN_WORKSPACE_ID in the workspace .env to use Akan Cloud",
    );
    expect(servers).not.toHaveBeenCalled();
  });

  test("a Windows platform run with no target configured asks for none", async () => {
    spyOn(GlobalConfig, "getTestTargets").mockResolvedValue({});
    const save = spyOn(GlobalConfig, "setTestTargets").mockResolvedValue(undefined as never);

    await expect(
      new CloudRunner().startPlatformTests({ workspaceRoot: "/repo" } as never, ["windows"], ["akanjs"]),
    ).rejects.toThrow("No Windows test target is configured: stdin is not a terminal to prompt on");
    expect(save).not.toHaveBeenCalled();
  });

  test("a platform that did not pass stops the deploy instead of asking to go on without it", async () => {
    const result = { platform: "windows", policy: "warn", infraError: "unreachable", packages: [] };
    spyOn(PlatformTestRun, "verdict").mockReturnValue({ blocking: [], warning: [result] } as never);
    const run = { results: async () => [result], format: () => "", logDir: "/repo/local/platform-tests/1" };
    const log = spyOn(console, "log").mockImplementation(() => {});

    await expect(
      new CloudRunner().settlePlatformTests(run as never, {
        interactive: true,
        recordStreaks: false,
        checkDrift: false,
      }),
    ).rejects.toThrow("windows did not pass (unreachable) — /repo/local/platform-tests/1: stdin is not a terminal");
    log.mockRestore();
  });

  test("publishing asks for no confirmation it cannot get", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ "dist-tags": { rc: "2.1.0-rc.3" } }))) as never;
    const { root, workspace } = track(await makeCliTempWorkspace());
    for (const dir of ["pkgs/akanjs", "dist/pkgs/akanjs"])
      await writeJson(path.join(root, dir, "package.json"), { name: "akanjs", version: "2.1.0-rc.3" });
    const spawn = spyOn(workspace, "spawn").mockResolvedValue("");

    try {
      await expect(
        new CloudRunner().deployAkan(workspace, ["akanjs"], { registryUrl: "http://127.0.0.1:4873/", tag: "rc" }),
      ).rejects.toThrow("Publishing akanjs@2.1.0-rc.4 asks for a confirmation: stdin is not a terminal to prompt on");
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(spawn).not.toHaveBeenCalled();
  });
});
