import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GitRevision } from "./gitRevision";

const roots: string[] = [];
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const repoOf = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "akan-git-"));
  roots.push(root);
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(
      ["git", "-c", "user.name=akan", "-c", "user.email=akan@example.com", "-c", "commit.gpgsign=false", ...args],
      { cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } },
    );
    expect(result.exitCode).toBe(0);
    return result.stdout.toString().trim();
  };
  const write = async (file: string, text: string) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  };
  git("init", "-q", "-b", "main");
  return { root, git, write };
};

describe("GitRevision", () => {
  it("lists each changed file with its change, a rename as a removal and an addition", async () => {
    const { root, git, write } = await repoOf();
    await write(".gitignore", "apps/*/scripts\n");
    await write("apps/demo/lib/memo/memo.constant.ts", "a\n");
    await write("apps/demo/lib/memo/memo.service.ts", "b\n");
    await write("apps/demo/lib/memo/memo.store.ts", "c\n");
    git("add", "-A");
    git("commit", "-q", "--no-verify", "-m", "base");
    const base = git("rev-parse", "HEAD");
    await write("apps/demo/lib/memo/memo.constant.ts", "a2\n");
    await unlink(path.join(root, "apps/demo/lib/memo/memo.service.ts"));
    git("mv", "apps/demo/lib/memo/memo.store.ts", "apps/demo/lib/memo/memo2.store.ts");
    await write("apps/demo/lib/memo/memo.signal.ts", "d\n");
    await write("apps/demo/scripts/seed.ts", "e\n");
    const git2 = new GitRevision(root);
    expect(await git2.changedFilesSince(base)).toEqual([
      { file: "apps/demo/lib/memo/memo.constant.ts", change: "changed" },
      { file: "apps/demo/lib/memo/memo.service.ts", change: "removed" },
      { file: "apps/demo/lib/memo/memo.signal.ts", change: "added" },
      { file: "apps/demo/lib/memo/memo.store.ts", change: "removed" },
      { file: "apps/demo/lib/memo/memo2.store.ts", change: "added" },
    ]);
    expect((await git2.workingFiles()).sort(byName)).toEqual([
      "apps/demo/lib/memo/memo.constant.ts",
      "apps/demo/lib/memo/memo.service.ts",
      "apps/demo/lib/memo/memo.signal.ts",
      "apps/demo/lib/memo/memo2.store.ts",
    ]);
    expect([...(await git2.filesAt(base, () => true)).keys()].sort(byName)).toEqual([
      "apps/demo/lib/memo/memo.constant.ts",
      "apps/demo/lib/memo/memo.service.ts",
      "apps/demo/lib/memo/memo.store.ts",
    ]);
  });

  it("says so when HEAD shares no commit with the revision, instead of comparing with its tip", async () => {
    const { git, write, root } = await repoOf();
    await write("apps/demo/a.ts", "a\n");
    git("add", "-A");
    git("commit", "-q", "--no-verify", "-m", "main");
    git("checkout", "-q", "--orphan", "other");
    await write("apps/demo/b.ts", "b\n");
    git("add", "-A");
    git("commit", "-q", "--no-verify", "-m", "other");
    const revision = new GitRevision(root);
    expect((await revision.forkPointOf("main")).error).toContain("shares no commit with main");
    expect((await revision.forkPointOf(null)).error).toContain("shares no commit with main");
    expect((await revision.forkPointOf("-x")).error).toBe("-x is not a commit in this repository.");
  });
});
