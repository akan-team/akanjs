import { describe, expect, test } from "bun:test";
import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { tempDirs, writeText } from "../test/testHelpers";
import { MainCheckout } from "./mainCheckout";

const makeRoot = tempDirs("akan-main-checkout-");

const git = async (cwd: string, ...args: string[]) => {
  const identity = ["-c", "user.name=akan", "-c", "user.email=akan@example.com", "-c", "commit.gpgsign=false"];
  const proc = Bun.spawn(["git", ...identity, ...args], { cwd, stdout: "ignore", stderr: "pipe" });
  if ((await proc.exited) !== 0) throw new Error(await new Response(proc.stderr).text());
};

const makeWorktree = async () => {
  const root = await realpath(await makeRoot());
  const main = path.join(root, "main");
  const worktree = path.join(root, "linked");
  await mkdir(main);
  await git(main, "init", "-q", "-b", "main");
  await git(main, "commit", "-q", "--allow-empty", "-m", "init");
  await git(main, "worktree", "add", "-q", worktree, "-b", "linked");
  return { main, worktree };
};

describe("MainCheckout", () => {
  test("finds the main checkout from any folder of a linked worktree, and none from the main checkout itself", async () => {
    const { main, worktree } = await makeWorktree();
    await mkdir(path.join(worktree, "apps/portal/env"), { recursive: true });

    expect(await MainCheckout.rootsOf(path.join(worktree, "apps/portal/env"))).toEqual({ worktree, main });
    expect(await MainCheckout.rootsOf(worktree)).toEqual({ worktree, main });
    expect(await MainCheckout.rootsOf(main)).toBeNull();
  });

  test("names the main checkout's file of the same path only when it is there", async () => {
    const { main, worktree } = await makeWorktree();
    await writeText(path.join(main, "apps/portal/env/env.server.local.ts"), "export const env = {};\n");

    expect(await MainCheckout.counterpartOf(path.join(worktree, "apps/portal/env/env.server.local.ts"))).toBe(
      path.join(main, "apps/portal/env/env.server.local.ts"),
    );
    expect(await MainCheckout.counterpartOf(path.join(worktree, "apps/portal/env/env.server.debug.ts"))).toBeNull();
  });

  test("takes a folder under no repository, and a submodule's .git file, for no linked worktree", async () => {
    const root = await realpath(await makeRoot());
    const submodule = path.join(root, "vendor");
    await mkdir(path.join(root, "modules/vendor"), { recursive: true });
    await writeText(path.join(submodule, ".git"), "gitdir: ../modules/vendor\n");

    expect(await MainCheckout.rootsOf(path.join(root, "nowhere"))).toBeNull();
    expect(await MainCheckout.rootsOf(submodule)).toBeNull();
  });
});
