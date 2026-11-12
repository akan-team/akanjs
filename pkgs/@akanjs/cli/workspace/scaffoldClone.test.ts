import { describe, expect, spyOn, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { AppExecutor, LibExecutor, WorkspaceExecutor } from "@akanjs/devkit/executors";
import { makeCliTempWorkspace, tempRoots } from "@akanjs/devkit/test/testHelpers";
import { Logger } from "akanjs/common";

const track = tempRoots();

const git = (cwd: string, args: string[]) => {
  const proc = Bun.spawnSync(
    ["git", "-c", "user.email=dev@example.com", "-c", "user.name=dev", "-c", "commit.gpgsign=false", ...args],
    { cwd, env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(cwd) } },
  );
  if (proc.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${proc.stderr.toString()}`);
  return proc.stdout.toString();
};

const envFilesOf = async (root: string, sysDir: string) => {
  const envDir = path.join(root, sysDir, "env");
  const names = (await readdir(envDir)).sort();
  return Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await readFile(path.join(envDir, name), "utf8")] as const)),
  );
};

const syncAll = async (workspace: WorkspaceExecutor) => {
  await LibExecutor.from(workspace, "mylib").scan();
  await AppExecutor.from(workspace, "myapp").scan();
};

describe("a clone of a scaffolded workspace", () => {
  test("gets back, on its first sync, the env files the scaffold's .gitignore keeps out of git", async () => {
    spyOn(Logger, "rawLog").mockImplementation(() => undefined);
    const { root } = track(await makeCliTempWorkspace());
    const { root: cloneParent } = track(await makeCliTempWorkspace());
    const workspace = WorkspaceExecutor.fromRoot({ workspaceRoot: root, repoName: "myrepo" });
    const dict = { repoName: "myrepo", appName: "myapp", serveDomain: "localhost", owner: "" };
    await workspace.applyTemplate({ basePath: ".", template: "workspaceRoot", dict });
    await workspace.applyTemplate({ basePath: "apps/myapp", template: "app", dict, options: { libs: [] } });
    await workspace.applyTemplate({ basePath: "libs/mylib", template: "libRoot", dict: { libName: "mylib" } });
    await syncAll(workspace);
    git(root, ["init", "-q"]);
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "scaffold"]);
    const cloneRoot = path.join(cloneParent, "clone");
    git(cloneParent, ["clone", "-q", root, cloneRoot]);
    const ignored = git(root, ["ls-files", "--others", "--ignored", "--exclude-standard", "--", "*/env/*"]);

    expect(ignored.split("\n").filter(Boolean).sort()).toEqual([
      "apps/myapp/env/env.client.debug.ts",
      "apps/myapp/env/env.client.develop.ts",
      "apps/myapp/env/env.client.local.ts",
      "apps/myapp/env/env.client.main.ts",
      "apps/myapp/env/env.client.testing.ts",
      "apps/myapp/env/env.server.debug.ts",
      "apps/myapp/env/env.server.develop.ts",
      "apps/myapp/env/env.server.local.ts",
      "apps/myapp/env/env.server.main.ts",
      "apps/myapp/env/env.server.testing.ts",
      "apps/myapp/env/env.server.type.ts",
      "libs/mylib/env/env.server.testing.ts",
      "libs/mylib/env/env.server.type.ts",
    ]);
    expect(Object.keys(await envFilesOf(cloneRoot, "apps/myapp"))).toEqual([
      "env.client.ts",
      "env.client.type.ts",
      "env.server.ts",
    ]);

    await syncAll(WorkspaceExecutor.fromRoot({ workspaceRoot: cloneRoot, repoName: "myrepo" }));

    expect(await envFilesOf(cloneRoot, "apps/myapp")).toEqual(await envFilesOf(root, "apps/myapp"));
    expect(await envFilesOf(cloneRoot, "libs/mylib")).toEqual(await envFilesOf(root, "libs/mylib"));
    expect(git(cloneRoot, ["status", "--porcelain", "--", "apps/myapp/env", "libs/mylib/env"])).toBe("");
  }, 60_000);
});
