import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { Executor, WorkspaceExecutor } from "./executors";
import { FileSys } from "./fileSys";
import { Subspace } from "./subspace";
import { SubspaceClone } from "./subspaceClone";
import { SubspaceConfig } from "./subspaceConfig";
import { SubspaceReport } from "./subspaceReport";
import { isolateEnv, tempDirs, writeText as write } from "./testHelpers";

//? Each case drives several real git clones and pushes; on a 4-core Windows VM that alone lands at 2-5s.
setDefaultTimeout(20_000);

//? Subspace commits in its clone with the host's identity, and a CI host has none configured.
isolateEnv({
  AKAN_PUBLIC_REPO_NAME: "workspace",
  AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
  AKAN_PUBLIC_ENV: "local",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
});
const makeTempRoot = tempDirs("akan-subspace-");

const git = async (cwd: string, args: string[]) =>
  await new Executor("fixture", cwd).spawn("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args]);

const wsGitignore = [
  "node_modules",
  "**/.akan",
  "**/bun.lock",
  "apps/*/lib/cnst.ts",
  "**/env.server.local.ts",
  "**/akan.app.json",
  "",
  "# akan:secrets (managed by akan.config.ts — do not edit)",
  "apps/served/secrets/**/*",
  "apps/private/secrets/**",
  "# akan:secrets:end",
].join("\n");

const wsAgents = [
  "# Workspace",
  "",
  "## Workspace",
  "",
  "- Repo: workspace",
  "- Apps: private, served",
  "- Libraries: kit",
  "",
].join("\n");

const makeSys = async (root: string, member: "apps" | "libs", name: string, extra: Record<string, string> = {}) => {
  await write(path.join(root, member, name, "akan.config.ts"), "export default {};\n");
  await write(path.join(root, member, name, "tsconfig.json"), "{}\n");
  await write(path.join(root, member, name, "package.json"), `{ "name": "@${name}", "version": "0.0.1" }\n`);
  await mkdir(path.join(root, member, name, "lib"), { recursive: true });
  for (const [relative, content] of Object.entries(extra))
    await write(path.join(root, member, name, relative), content);
};

const makeMirror = async (servedApp: string, privateApp: string, libName: string) => {
  const workRoot = await makeTempRoot();
  const wsRoot = path.join(workRoot, "workspace");
  const bareRoot = path.join(workRoot, "subspace.git");
  await mkdir(wsRoot, { recursive: true });

  await write(
    path.join(wsRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "workspace",
        version: "0.0.1",
        description: "workspace",
        dependencies: { lodash: "4.0.0", "another-app-dep": "1.0.0", ioredis: "5.0.0" },
        devDependencies: { typescript: "6.0.0" },
      },
      null,
      2,
    )}\n`,
  );
  await write(path.join(wsRoot, ".gitignore"), `${wsGitignore}\n`);
  await write(path.join(wsRoot, "AGENTS.md"), wsAgents);
  await write(path.join(wsRoot, "biome.json"), "{}\n");
  await write(
    path.join(wsRoot, "node_modules/akanjs/package.json"),
    '{ "name": "akanjs", "version": "3.0.0", "peerDependencies": { "ioredis": "5.0.0" } }\n',
  );
  await write(path.join(wsRoot, "benchmarks/bench.ts"), "export {};\n");
  await write(
    path.join(wsRoot, "akan.config.ts"),
    `export default { subspace: { pushableBranches: ["develop"], exclude: ["benchmarks"], subspaces: [{ name: "acme", repo: ${JSON.stringify(bareRoot)}, apps: ["${servedApp}"] }] } };\n`,
  );
  await write(path.join(wsRoot, "Jenkinsfile"), "pipeline { agent any }\n");

  await makeSys(wsRoot, "apps", servedApp, {
    "lib/task/task.constant.ts": [
      `import { helper } from "@libs/${libName}/common";`,
      'import lodash from "lodash";',
      "",
      "export { helper, lodash };",
      "",
    ].join("\n"),
    "lib/cnst.ts": "export {};\n",
    "env/env.server.local.ts": "export const env = { from: 'workspace' };\n",
    "env/env.server.ts": "export const env = {};\n",
  });
  await makeSys(wsRoot, "apps", privateApp, { "lib/task/task.constant.ts": "export const task = 1;\n" });
  await makeSys(wsRoot, "libs", libName, { "common/helper.ts": "export const helper = 1;\n" });

  await git(wsRoot, ["init", "--quiet", "--initial-branch=develop"]);
  await git(wsRoot, ["add", "-A"]);
  await git(wsRoot, ["commit", "--quiet", "-m", "workspace"]);

  await git(workRoot, ["init", "--bare", "--quiet", "--initial-branch=develop", bareRoot]);
  const seedRoot = path.join(workRoot, "seed");
  await git(workRoot, ["clone", "--quiet", bareRoot, seedRoot]);
  await write(path.join(seedRoot, "README.md"), "subspace\n");
  await git(seedRoot, ["checkout", "--quiet", "-B", "develop"]);
  await git(seedRoot, ["add", "-A"]);
  await git(seedRoot, ["commit", "--quiet", "-m", "seed"]);
  await git(seedRoot, ["push", "--quiet", "origin", "develop"]);

  const workspace = WorkspaceExecutor.fromRoot({ workspaceRoot: wsRoot, repoName: `workspace-${servedApp}` });
  const config = await SubspaceConfig.from(workspace);
  if (!config) throw new Error("fixture config missing");
  const declaration = config.subspaces[0];
  if (!declaration) throw new Error("fixture subspace missing");
  const subspace = new Subspace(workspace, config, declaration);
  const clonePath = path.join(wsRoot, ".akan/subspace/acme");
  return { workRoot, wsRoot, bareRoot, workspace, subspace, clonePath };
};

/** A working copy of the subspace, as a customer developer would have. */
const cloneSubspace = async (workRoot: string, bareRoot: string, name: string) => {
  const root = path.join(workRoot, name);
  await git(workRoot, ["clone", "--quiet", bareRoot, root]);
  await git(root, ["checkout", "--quiet", "develop"]);
  return root;
};

describe("Subspace push", () => {
  test("ships the slice, holds back everything workspace-only, and preserves the subspace's env", async () => {
    const { wsRoot, bareRoot, workRoot, subspace, clonePath } = await makeMirror("served", "private", "kit");

    const result = await subspace.push("develop", { verify: false });
    expect(result.outcome).toBe("pushed");

    const subspaceRoot = await cloneSubspace(workRoot, bareRoot, "check");
    const entries = await readdir(subspaceRoot);

    expect(await FileSys.fileExists(path.join(subspaceRoot, "apps/served/lib/task/task.constant.ts"))).toBe(true);
    expect(await FileSys.fileExists(path.join(subspaceRoot, "libs/kit/common/helper.ts"))).toBe(true);
    expect(await FileSys.dirExists(path.join(subspaceRoot, "apps/private"))).toBe(false);
    expect(entries).not.toContain("benchmarks");
    expect(entries).not.toContain("akan.config.ts");
    expect(entries).not.toContain("Jenkinsfile");
    expect(await FileSys.fileExists(path.join(subspaceRoot, "apps/served/lib/cnst.ts"))).toBe(false);
    expect(await FileSys.fileExists(path.join(subspaceRoot, "apps/served/env/env.server.local.ts"))).toBe(false);
    expect(await FileSys.fileExists(path.join(subspaceRoot, "apps/served/env/env.server.ts"))).toBe(true);
    expect(await FileSys.fileExists(path.join(subspaceRoot, "README.md"))).toBe(true);
    void wsRoot;
    void clonePath;
  });

  test("filters the leaky generated blocks down to this subspace", async () => {
    const { bareRoot, workRoot, subspace } = await makeMirror("leak-served", "leak-private", "leak-kit");
    await subspace.push("develop", { verify: false });
    const subspaceRoot = await cloneSubspace(workRoot, bareRoot, "check");

    const gitignore = await FileSys.readText(path.join(subspaceRoot, ".gitignore"));
    expect(gitignore).not.toContain("apps/private/secrets");
    expect(gitignore).not.toContain("**/bun.lock");

    const agents = await FileSys.readText(path.join(subspaceRoot, "AGENTS.md"));
    expect(agents).toContain("- Apps: leak-served");
    expect(agents).toContain("- Libraries: leak-kit");
    expect(agents).not.toContain("leak-private");
  });

  test("writes the anchor file and stamps the library it shipped", async () => {
    const { bareRoot, workRoot, subspace } = await makeMirror("stamp-served", "stamp-private", "stamp-kit");
    await subspace.push("develop", { verify: false });
    const subspaceRoot = await cloneSubspace(workRoot, bareRoot, "check");

    const anchor = (await FileSys.readJson(path.join(subspaceRoot, SubspaceClone.anchorFile))) as {
      branch: string;
      apps: string[];
    };
    expect(anchor.branch).toBe("develop");
    expect(anchor.apps).toEqual(["stamp-served"]);

    const manifest = (await FileSys.readJson(path.join(subspaceRoot, "libs/stamp-kit/package.json"))) as {
      akan: { source: { origin: string; hash: string } };
    };
    expect(manifest.akan.source.origin).toContain("#develop");
    expect(manifest.akan.source.hash).toMatch(/^[0-9a-f]{32}$/);
  });

  test("ships a library file the workspace deleted, instead of reading it off the clone's stale index", async () => {
    const { wsRoot, bareRoot, workRoot, subspace } = await makeMirror("moved-served", "moved-private", "moved-kit");
    expect((await subspace.push("develop", { verify: false })).outcome).toBe("pushed");

    await rm(path.join(wsRoot, "libs/moved-kit/common/helper.ts"));
    await write(path.join(wsRoot, "libs/moved-kit/common/renamed.ts"), "export const helper = 1;\n");
    await git(wsRoot, ["add", "-A"]);
    await git(wsRoot, ["commit", "--quiet", "-m", "move the helper"]);

    expect((await subspace.push("develop", { verify: false })).outcome).toBe("pushed");
    const subspaceRoot = await cloneSubspace(workRoot, bareRoot, "moved-check");
    expect(await FileSys.fileExists(path.join(subspaceRoot, "libs/moved-kit/common/helper.ts"))).toBe(false);
    expect(await FileSys.fileExists(path.join(subspaceRoot, "libs/moved-kit/common/renamed.ts"))).toBe(true);
  });

  test("is idempotent — a second push with no workspace change is skipped", async () => {
    const { subspace } = await makeMirror("idem-served", "idem-private", "idem-kit");
    expect((await subspace.push("develop", { verify: false })).outcome).toBe("pushed");
    expect((await subspace.push("develop", { verify: false })).outcome).toBe("skipped");
  });

  test("skips a push after an unrelated workspace commit, and re-stamps a library only when its content moves", async () => {
    const { wsRoot, workRoot, bareRoot, subspace } = await makeMirror("calm-served", "calm-private", "calm-kit");
    expect((await subspace.push("develop", { verify: false })).outcome).toBe("pushed");
    const stampOf = async (root: string) =>
      (
        (await FileSys.readJson(path.join(root, "libs/calm-kit/package.json"))) as {
          akan: { source: { sha: string; hash: string } };
        }
      ).akan.source;
    const first = await stampOf(await cloneSubspace(workRoot, bareRoot, "calm-first"));

    await write(path.join(wsRoot, "apps/calm-private/lib/task/task.constant.ts"), "export const task = 2;\n");
    await git(wsRoot, ["add", "-A"]);
    await git(wsRoot, ["commit", "--quiet", "-m", "outside the slice"]);
    expect((await subspace.push("develop", { verify: false })).outcome).toBe("skipped");

    await write(path.join(wsRoot, "libs/calm-kit/common/helper.ts"), "export const helper = 2;\n");
    await git(wsRoot, ["add", "-A"]);
    await git(wsRoot, ["commit", "--quiet", "-m", "inside the slice"]);
    expect((await subspace.push("develop", { verify: false })).outcome).toBe("pushed");
    const second = await stampOf(await cloneSubspace(workRoot, bareRoot, "calm-second"));
    expect(second.hash).not.toBe(first.hash);
    expect(second.sha).not.toBe(first.sha);
  });

  test("keeps the subspace's own root config and drops a Jenkinsfile an earlier push left there", async () => {
    const { workRoot, bareRoot, subspace } = await makeMirror("own-served", "own-private", "own-kit");
    const customer = await cloneSubspace(workRoot, bareRoot, "own-customer");
    await write(path.join(customer, "akan.config.ts"), "export default { pipeline: {} };\n");
    await git(customer, ["add", "-A"]);
    await git(customer, ["commit", "--quiet", "-m", "our own global stages"]);
    await write(path.join(customer, "Jenkinsfile"), "pipeline { agent none }\n");
    await git(customer, ["add", "-A"]);
    await git(customer, ["commit", "--quiet", "-m", `${SubspaceClone.syncSubjectPrefix}workspace@0000000`]);
    await git(customer, ["push", "--quiet", "origin", "develop"]);

    expect((await subspace.push("develop", { verify: false })).outcome).toBe("pushed");
    const subspaceRoot = await cloneSubspace(workRoot, bareRoot, "own-check");
    expect(await FileSys.readText(path.join(subspaceRoot, "akan.config.ts"))).toContain(
      "export default { pipeline: {} };",
    );
    expect(await FileSys.fileExists(path.join(subspaceRoot, "Jenkinsfile"))).toBe(false);
  });

  test("refuses a lock that resolves from a registry only this machine reaches, before it clones", async () => {
    const { wsRoot, subspace, clonePath } = await makeMirror("lock-served", "lock-private", "lock-kit");
    await write(
      path.join(wsRoot, "bun.lock"),
      '{ "packages": { "lodash": ["lodash@4.0.0", "http://127.0.0.1:4873/lodash/-/lodash-4.0.0.tgz"] } }\n',
    );
    await git(wsRoot, ["add", "-f", "bun.lock"]);
    await git(wsRoot, ["commit", "--quiet", "-m", "a verdaccio lock"]);
    const result = (await subspace.push("develop", { verify: false })) as { outcome: string; reason?: string };
    expect(result.outcome).toBe("refused");
    expect(result.reason).toContain("http://127.0.0.1:4873");
    expect(await FileSys.dirExists(clonePath)).toBe(false);
  });

  test("refuses a push and a pull while akan.subspace.ts is left at the workspace root", async () => {
    const { wsRoot, workRoot, bareRoot, subspace } = await makeMirror("left-served", "left-private", "left-kit");
    await write(
      path.join(wsRoot, Subspace.retiredConfigFile),
      'export default { subspaces: [{ name: "globex", repo: "git@example.com:globex/app.git", apps: ["left-private"] }] };\n',
    );
    await git(wsRoot, ["add", "-A"]);
    await git(wsRoot, ["commit", "--quiet", "-m", "moved the declaration, kept the file"]);

    const result = await subspace.push("develop", { verify: false });
    expect(result.outcome).toBe("refused");
    expect(result.reason).toContain("move it under `subspace` in akan.config.ts and delete it");
    await expect(subspace.pull("develop")).rejects.toThrow("delete it");
    const subspaceRoot = await cloneSubspace(workRoot, bareRoot, "left-check");
    expect(await FileSys.fileExists(path.join(subspaceRoot, Subspace.retiredConfigFile))).toBe(false);
  });

  test("removes an akan.subspace.ts an earlier push left in the subspace", async () => {
    const { workRoot, bareRoot, subspace } = await makeMirror("leaked-served", "leaked-private", "leaked-kit");
    const customer = await cloneSubspace(workRoot, bareRoot, "leaked-customer");
    await write(
      path.join(customer, Subspace.retiredConfigFile),
      'export default { subspaces: [{ name: "globex" }] };\n',
    );
    await git(customer, ["add", "-A"]);
    await git(customer, ["commit", "--quiet", "-m", `${SubspaceClone.syncSubjectPrefix}workspace@0000000`]);
    await git(customer, ["push", "--quiet", "origin", "develop"]);

    expect((await subspace.push("develop", { verify: false })).outcome).toBe("pushed");
    const subspaceRoot = await cloneSubspace(workRoot, bareRoot, "leaked-check");
    expect(await FileSys.fileExists(path.join(subspaceRoot, Subspace.retiredConfigFile))).toBe(false);
  });

  test("refuses a branch the subspace does not have, and one the config does not allow", async () => {
    const { subspace } = await makeMirror("refuse-served", "refuse-private", "refuse-kit");
    const missing = await subspace.push("release", { verify: false }).catch((error: Error) => error);
    expect((missing as Error).message).toContain("not pushable");
  });

  //? The fixture workspace deliberately does not gitignore `.env`, so this also proves the clone-local exclude.
  test("leaves the clone a runnable workspace root without shipping the file that makes it one", async () => {
    const { bareRoot, workRoot, subspace, clonePath } = await makeMirror("env-served", "env-private", "env-kit");
    await subspace.push("develop", { verify: false });

    const localEnv = await FileSys.readText(path.join(clonePath, ".env"));
    expect(localEnv).toContain("AKAN_PUBLIC_REPO_NAME=acme");
    expect(localEnv).toContain("AKAN_PUBLIC_SERVE_DOMAIN=example.com");
    expect(localEnv).not.toContain("AKAN_PUBLIC_REPO_NAME=workspace");
    expect(await FileSys.readText(path.join(clonePath, ".git/info/exclude"))).toContain("/.env");

    const subspaceRoot = await cloneSubspace(workRoot, bareRoot, "env-check");
    expect(await FileSys.fileExists(path.join(subspaceRoot, ".env"))).toBe(false);
  });

  test("rebuilds the root manifest from this subspace's own slices", async () => {
    const { bareRoot, workRoot, subspace } = await makeMirror("dep-served", "dep-private", "dep-kit");
    const result = await subspace.push("develop", { verify: false });
    const subspaceRoot = await cloneSubspace(workRoot, bareRoot, "dep-check");

    const manifest = (await FileSys.readJson(path.join(subspaceRoot, "package.json"))) as {
      name: string;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(manifest.dependencies).toEqual({ lodash: "4.0.0", ioredis: "5.0.0" });
    expect(manifest.devDependencies).toEqual({ typescript: "6.0.0" });
    expect(manifest.name).toBe("acme");
    expect(result.prunedDependencies).toEqual(["another-app-dep"]);
  });

  test("reports a refusal's whole reason, indented, instead of one truncated line", () => {
    const report = SubspaceReport.pushResults([
      { name: "acme", outcome: "refused", reason: "verification failed\nexit code: 1", changedFiles: 12 },
      { name: "beta", outcome: "pushed", commit: "abc1234", changedFiles: 3 },
    ]);
    expect(report).toContain("refused  acme  verification failed");
    expect(report).toContain("    exit code: 1");
    expect(report).toContain("pushed   beta  abc1234 (3 files)");
  });
});

describe("Subspace status", () => {
  test("reads clean right after a push, despite the stamp only the subspace carries", async () => {
    const { subspace } = await makeMirror("status-served", "status-private", "status-kit");
    await subspace.push("develop", { verify: false });

    const status = await subspace.status("develop");

    expect(status.hasBranch).toBe(true);
    expect(status.behindPaths).toEqual([]);
    expect(status.driftedLibs).toEqual([]);
    expect(status.anchor.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(status.anchor.incoming).toEqual([]);
    expect(SubspaceReport.statuses([status])).toContain("up to date, no customer commits");
  });

  test("names the drifted library and counts the customer commits", async () => {
    const { bareRoot, workRoot, subspace } = await makeMirror("sdrift-served", "sdrift-private", "sdrift-kit");
    await subspace.push("develop", { verify: false });

    const subspaceRoot = await cloneSubspace(workRoot, bareRoot, "customer");
    await write(path.join(subspaceRoot, "libs/sdrift-kit/common/helper.ts"), "export const helper = 99;\n");
    await git(subspaceRoot, ["add", "-A"]);
    await git(subspaceRoot, ["commit", "--quiet", "-m", "lib hack"]);
    await git(subspaceRoot, ["push", "--quiet", "origin", "develop"]);

    const status = await subspace.status("develop");

    expect(status.driftedLibs).toEqual(["sdrift-kit"]);
    expect(status.anchor.incoming.map((commit) => commit.subject)).toEqual(["lib hack"]);
    expect(SubspaceReport.statuses([status])).toContain("DRIFTED LIBS: sdrift-kit");
  });

  test("reports a subspace with no such branch instead of creating one", async () => {
    const { subspace } = await makeMirror("nobranch-served", "nobranch-private", "nobranch-kit");
    const status = await subspace.status("main");

    expect(status.hasBranch).toBe(false);
    expect(SubspaceReport.statuses([status])).toContain("no such branch");
  });
});

describe("Subspace diff", () => {
  test("reads as what a push would apply, with library changes split out", async () => {
    const { bareRoot, workRoot, subspace } = await makeMirror("diff-served", "diff-private", "diff-kit");
    await subspace.push("develop", { verify: false });

    const subspaceRoot = await cloneSubspace(workRoot, bareRoot, "customer");
    await write(path.join(subspaceRoot, "libs/diff-kit/common/helper.ts"), "export const helper = 99;\n");
    await write(path.join(subspaceRoot, "apps/diff-served/lib/task/task.service.ts"), "export const fixed = true;\n");
    await git(subspaceRoot, ["add", "-A"]);
    await git(subspaceRoot, ["commit", "--quiet", "-m", "customer work"]);
    await git(subspaceRoot, ["push", "--quiet", "origin", "develop"]);

    const result = await subspace.diff("develop");

    expect(result.libs.files).toEqual(["libs/diff-kit/common/helper.ts"]);
    expect(result.app.files).toEqual(["apps/diff-served/lib/task/task.service.ts"]);
    //? Direction: the workspace would restore `helper = 1` and delete the file the subspace added.
    expect(result.libs.patch).toContain("-export const helper = 99;");
    expect(result.libs.patch).toContain("+export const helper = 1;");
    expect(SubspaceReport.diff(result)).toContain("LIBRARY changes (1)");
  });

  test("is empty right after a push", async () => {
    const { subspace } = await makeMirror("quietdiff-served", "quietdiff-private", "quietdiff-kit");
    await subspace.push("develop", { verify: false });

    const result = await subspace.diff("develop");
    expect(result.app.files).toEqual([]);
    expect(result.libs.files).toEqual([]);
    expect(SubspaceReport.diff(result)).toContain("identical to the workspace");
  });
});

describe("Subspace pull", () => {
  test("applies the customer's app commits and holds their library edits back", async () => {
    const { wsRoot, bareRoot, workRoot, subspace } = await makeMirror("pull-served", "pull-private", "pull-kit");
    await subspace.push("develop", { verify: false });

    const subspaceRoot = await cloneSubspace(workRoot, bareRoot, "customer");
    await write(path.join(subspaceRoot, "apps/pull-served/lib/task/task.service.ts"), "export const fixed = true;\n");
    await write(path.join(subspaceRoot, "libs/pull-kit/common/helper.ts"), "export const helper = 99;\n");
    await write(path.join(subspaceRoot, "apps/pull-served/env/env.server.local.ts"), "export const env = {};\n");
    await git(subspaceRoot, ["add", "-A"]);
    await git(subspaceRoot, ["commit", "--quiet", "-m", "customer hotfix"]);
    await git(subspaceRoot, ["push", "--quiet", "origin", "develop"]);

    const result = await subspace.pull("develop");

    expect(result.incoming.map((commit) => commit.subject)).toEqual(["customer hotfix"]);
    expect(result.applied).toEqual(["apps/pull-served/lib/task/task.service.ts"]);
    expect(await FileSys.fileExists(path.join(wsRoot, "apps/pull-served/lib/task/task.service.ts"))).toBe(true);

    expect(result.libPatch?.files).toEqual(["libs/pull-kit/common/helper.ts"]);
    expect(await FileSys.readText(path.join(wsRoot, "libs/pull-kit/common/helper.ts"))).toContain("helper = 1;");
    expect(await FileSys.fileExists(path.join(wsRoot, result.libPatch?.path ?? "missing"))).toBe(true);
  });

  test("adopts library edits only when asked", async () => {
    const { wsRoot, bareRoot, workRoot, subspace } = await makeMirror("adopt-served", "adopt-private", "adopt-kit");
    await subspace.push("develop", { verify: false });

    const subspaceRoot = await cloneSubspace(workRoot, bareRoot, "customer");
    await write(path.join(subspaceRoot, "libs/adopt-kit/common/helper.ts"), "export const helper = 99;\n");
    await git(subspaceRoot, ["add", "-A"]);
    await git(subspaceRoot, ["commit", "--quiet", "-m", "lib tweak"]);
    await git(subspaceRoot, ["push", "--quiet", "origin", "develop"]);

    const result = await subspace.pull("develop", { adoptLibs: true });

    expect(result.applied).toEqual(["libs/adopt-kit/common/helper.ts"]);
    expect(result.libPatch).toBeNull();
    expect(await FileSys.readText(path.join(wsRoot, "libs/adopt-kit/common/helper.ts"))).toContain("helper = 99;");
  });

  test("is a no-op when the subspace has no commits of its own", async () => {
    const { subspace } = await makeMirror("quiet-served", "quiet-private", "quiet-kit");
    await subspace.push("develop", { verify: false });

    const result = await subspace.pull("develop");
    expect(result.incoming).toEqual([]);
    expect(result.applied).toEqual([]);
  });
});

describe("SubspaceConfig", () => {
  test("refuses one app claimed by two subspaces", () => {
    expect(
      () =>
        new SubspaceConfig({
          subspaces: [
            { name: "a", repo: "a.git", apps: ["shared"] },
            { name: "b", repo: "b.git", apps: ["shared"] },
          ],
        }),
    ).toThrow(/claimed by both/);
  });

  test("refuses a subspace with no apps and a duplicate name", () => {
    expect(() => new SubspaceConfig({ subspaces: [{ name: "a", repo: "a.git", apps: [] }] })).toThrow(
      /declares no apps/,
    );
    expect(
      () =>
        new SubspaceConfig({
          subspaces: [
            { name: "a", repo: "a.git", apps: ["one"] },
            { name: "a", repo: "b.git", apps: ["two"] },
          ],
        }),
    ).toThrow(/duplicate subspace/);
  });

  test("refuses two subspaces on one cloud workspace, and takes a declaration with none", () => {
    expect(
      () =>
        new SubspaceConfig({
          subspaces: [
            { name: "a", repo: "a.git", apps: ["one"], workspaceId: "project" },
            { name: "b", repo: "b.git", apps: ["two"], workspaceId: "project" },
          ],
        }),
    ).toThrow(/same workspaceId/);
    expect(
      () =>
        new SubspaceConfig({
          subspaces: [
            { name: "a", repo: "a.git", apps: ["one"] },
            { name: "b", repo: "b.git", apps: ["two"], workspaceId: "project" },
          ],
        }),
    ).not.toThrow();
  });

  test("defaults the pushable branches and rejects anything else", () => {
    const config = new SubspaceConfig({ subspaces: [{ name: "a", repo: "a.git", apps: ["one"] }] });
    expect(config.pushableBranches).toEqual(SubspaceConfig.defaultPushableBranches);
    expect(() => config.assertPushable("feature/x")).toThrow(/not pushable/);
    expect(() => config.assertPushable("develop")).not.toThrow();
  });

  test("names the setting that allows a branch when it refuses one", () => {
    const config = new SubspaceConfig({
      pushableBranches: ["main"],
      subspaces: [{ name: "a", repo: "a.git", apps: ["one"] }],
    });
    expect(() => config.assertPushable("develop")).toThrow(
      'Branch "develop" is not pushable. `subspace.pushableBranches` in the workspace root akan.config.ts allows: main',
    );
  });
});

describe("Subspace.plan", () => {
  test("reports the slice a push ships without adding a remote or a clone", async () => {
    const { wsRoot, subspace, clonePath } = await makeMirror("served", "private", "kit");
    const plan = await subspace.plan("develop");
    expect(plan).toMatchObject({
      name: "acme",
      branch: "develop",
      branchRefusal: null,
      apps: ["served"],
      libs: [{ name: "kit", apps: ["served"] }],
      excludedRootEntries: ["benchmarks"],
      subspaceOwnedRootEntries: ["akan.config.ts", "Jenkinsfile"],
      prunedDependencies: ["another-app-dep"],
      lockProblem: null,
    });
    expect(plan.rootEntries).toEqual(expect.arrayContaining([".gitignore", "AGENTS.md", "biome.json", "package.json"]));
    expect(plan.rootEntries).not.toContain("benchmarks");
    expect(plan.rootEntries).not.toContain("Jenkinsfile");
    expect(plan.files).toBeGreaterThan(0);
    expect((await git(wsRoot, ["remote"])).trim()).toBe("");
    expect(await FileSys.dirExists(clonePath)).toBe(false);
    expect(SubspaceReport.plan(plan)).toContain("Nothing here would make a push refuse.");
  });

  test("names what a push would refuse: a branch it may not push and a loopback-registry lock", async () => {
    const { wsRoot, subspace } = await makeMirror("served", "private", "kit");
    await write(
      path.join(wsRoot, "bun.lock"),
      '{ "packages": { "x": ["x@1.0.0", "http://127.0.0.1:4873/x/-/x-1.0.0.tgz"] } }\n',
    );
    await git(wsRoot, ["add", "-f", "bun.lock"]);
    await git(wsRoot, ["commit", "--quiet", "-m", "lock"]);
    const plan = await subspace.plan("main");
    expect(plan.branchRefusal).toContain('Branch "main" is not pushable');
    expect(plan.branchRefusal).toContain("`subspace.pushableBranches`");
    expect(plan.lockProblem).toContain("http://127.0.0.1:4873");
    expect(SubspaceReport.plan(plan)).toContain("A push would be refused:");
  });

  test("names a dirty tree as a blocker, as push refuses one, and judges HEAD's lock, the one a push ships", async () => {
    const { wsRoot, subspace } = await makeMirror("served", "private", "kit");
    await write(path.join(wsRoot, "bun.lock"), '{ "packages": {} }\n');
    await git(wsRoot, ["add", "-f", "bun.lock"]);
    await git(wsRoot, ["commit", "--quiet", "-m", "a public lock"]);
    await write(
      path.join(wsRoot, "bun.lock"),
      '{ "packages": { "x": ["x@1.0.0", "http://127.0.0.1:4873/x/-/x-1.0.0.tgz"] } }\n',
    );

    const plan = await subspace.plan("develop");

    expect(plan.workspaceRefusal).toBe("workspace working tree is dirty");
    expect(plan.lockProblem).toBeNull();
    expect(Subspace.planBlockers(plan)).toEqual(["workspace working tree is dirty"]);
    expect(SubspaceReport.plan(plan)).toContain("  - workspace working tree is dirty");
  });

  test("names a leftover akan.subspace.ts as a blocker and never as an entry a push ships", async () => {
    const { wsRoot, subspace } = await makeMirror("served", "private", "kit");
    await write(path.join(wsRoot, Subspace.retiredConfigFile), "export default {};\n");
    await git(wsRoot, ["add", "-A"]);
    await git(wsRoot, ["commit", "--quiet", "-m", "kept the old declaration"]);

    const plan = await subspace.plan("develop");

    expect(plan.workspaceRefusal).toContain("delete it");
    expect(plan.rootEntries).not.toContain(Subspace.retiredConfigFile);
  });
});
