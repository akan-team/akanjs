import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CloudApi, GlobalConfig } from "@akanjs/devkit/cloud";
import { CommandContainer, getArgMetas, getTargetMetas } from "@akanjs/devkit/commandDecorators";
import { AppExecutor } from "@akanjs/devkit/executors";
import {
  createCallRecorder,
  createFakeExecutor,
  makeCliTempWorkspace,
  tempRoots,
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
    log.mockRestore();
    expect(recorder.calls).toEqual([
      { name: "uploadSecret", args: ["project-1", { scope: "*", name: "NPM_TOKEN", value: "t" }] },
      { name: "uploadSecret", args: ["project-1", { scope: "main", name: "NPM_TOKEN", value: "t" }] },
    ]);
  });

  test("lists names and scopes only, a branch narrowing to its own and the every-branch ones", () => {
    const rows = CloudRunner.formatSecrets([
      { name: "NPM_TOKEN", scope: "*", updatedAt: "2026-10-09", updatedBy: "kim" },
      { name: "DISCORD_WEBHOOK", scope: "main", updatedAt: "2026-10-10", updatedBy: "lee" },
    ]).split("\n");
    expect(rows).toEqual([
      "NAME             SCOPE         UPDATED     BY",
      "DISCORD_WEBHOOK  main          2026-10-10  lee",
      "NPM_TOKEN        every branch  2026-10-09  kim",
    ]);
    expect(CloudRunner.formatSecrets([])).toBe("No pipeline secrets.");
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

  test("a subspace's secrets go to the project its workspaceId names", async () => {
    const root = await makeTempRoot();
    await writeText(
      path.join(root, "akan.config.ts"),
      'export default { subspace: { subspaces: [{ name: "acme", repo: "a.git", apps: ["web"], workspaceId: "acme-project" }, { name: "bare", repo: "b.git", apps: ["api"] }] } };\n',
    );
    const { WorkspaceExecutor } = await import("@akanjs/devkit/executors");
    const workspace = new WorkspaceExecutor({ workspaceRoot: root, repoName: "repo" });
    expect(await new CloudRunner().secretProject(workspace as never, "acme")).toBe("acme-project");
    await expect(new CloudRunner().secretProject(workspace as never, "bare")).rejects.toThrow(
      "declares no workspaceId",
    );
  });

  test("each refusal status reads as what to do about it", async () => {
    const failing = (message: string) =>
      ({
        uploadSecret: async () => {
          throw new Error(message);
        },
      }) as unknown as CloudApi;
    const upload = (api: CloudApi) =>
      new CloudRunner().uploadSecret(api, "project-1", { name: "NPM_TOKEN", branch: null, value: "t" });
    await expect(upload(failing("401 Unauthorized from /uploadSecret/project-1: no token"))).rejects.toThrow(
      "run `akan login`",
    );
    await expect(
      upload(
        failing(
          '400 Bad Request from /uploadSecret/project-1: {"error":"pipelineSecret.error.tooMany","statusCode":400}',
        ),
      ),
    ).rejects.toThrow("The project refused the request: pipelineSecret.error.tooMany.");
    await expect(upload(failing("503 Service Unavailable from /uploadSecret/project-1: {}"))).rejects.toThrow(
      "The server is not configured for pipeline secrets yet.",
    );
    await expect(upload(failing("socket hang up"))).rejects.toThrow("socket hang up");
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
        throw new Error("403 Forbidden from /uploadSecret/project-1: denied");
      },
    } as unknown as CloudApi;
    await expect(
      new CloudRunner().uploadSecret(api, "project-1", { name: "NPM_TOKEN", branch: null, value: "t" }),
    ).rejects.toThrow("The project refused: a secret is written by a project member signed in with `akan login`.");
  });
});

describe("OTA uploads", () => {
  test("push-update sends the pack folder as one tgz with the target's channel, and leaves no archive behind", async () => {
    const os = await import("node:os");
    const { mkdtempSync, writeFileSync, mkdirSync } = await import("node:fs");
    const out = mkdtempSync(path.join(os.tmpdir(), "akan-pack-test-"));
    mkdirSync(path.join(out, "files"));
    writeFileSync(path.join(out, "files", "a".repeat(64)), "<html></html>");
    for (const name of ["manifest.template.json", "bundle.json", "pack.json"])
      writeFileSync(path.join(out, name), "{}");
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
      expect(entries).toEqual(
        expect.arrayContaining([
          "./bundle.json",
          "./manifest.template.json",
          "./pack.json",
          `./files/${"a".repeat(64)}`,
        ]),
      );
      expect(announced[0]?.size).toBe(stored[0]?.byteLength);
      expect(existsSync(path.join(os.tmpdir(), `akan-pack-lu-default-android-${process.pid}.tgz`))).toBe(false);

      const exitCode = process.exitCode;
      const rejected = { id: "release-2", status: "rejected", problems: ["deepLinks differ from the app's"] };
      await new CloudRunner().pushUpdate(apiAnswering(rejected), "project-1", pack, { channel: "pilot", notes: null });
      expect(process.exitCode).toBe(2);
      //? Bun ignores `process.exitCode = undefined`, so restoring an unset code needs the 0.
      process.exitCode = exitCode ?? 0;
      expect(announced[1]).toMatchObject({ channel: "pilot", notes: null });

      const refused = {
        requestUpdateUpload: async () => {
          throw new Error("401 Unauthorized from /requestUpdateUpload/project-1: {}");
        },
      } as unknown as CloudApi;
      await expect(
        new CloudRunner().pushUpdate(refused, "project-1", pack, { channel: "pilot", notes: null }),
      ).rejects.toThrow("run `akan login`");
    } finally {
      storage.stop(true);
    }
  });
});
