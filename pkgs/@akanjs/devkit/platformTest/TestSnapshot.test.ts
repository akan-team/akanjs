import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TestSnapshot } from "./TestSnapshot";

const roots: string[] = [];
const git = async (cwd: string, ...args: string[]) => {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "ignore",
    stderr: "ignore",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  });
  expect(await proc.exited).toBe(0);
};
const write = async (root: string, file: string, content: string) => {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), content);
};
const makeRepo = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-snapshot-"));
  roots.push(root);
  await git(root, "init", "-q");
  await write(root, ".gitignore", "ignored/\nlocal/\n.env\n");
  await write(root, "tracked.ts", "export {};\n");
  await write(root, "gone.ts", "export {};\n");
  await git(root, "add", ".");
  await git(root, "commit", "-q", "-m", "init");
  await unlink(path.join(root, "gone.ts"));
  await write(root, "untracked.ts", "export const a = 1;\n");
  await write(root, "ignored/secret.ts", "export {};\n");
  await write(root, ".env", "OPENAI_API_KEY=nope\n");
  return root;
};
const tarEntries = async (tarPath: string) => {
  const proc = Bun.spawn(["tar", "-tf", tarPath], { stdout: "pipe" });
  return (await new Response(proc.stdout).text()).split(/\r?\n/).filter(Boolean).sort();
};

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("TestSnapshot", () => {
  test("packs what git would show — tracked and untracked, never ignored or deleted", async () => {
    const root = await makeRepo();
    const snapshot = await TestSnapshot.create(root, path.join(root, "local", "run"));

    expect(await tarEntries(snapshot.tarPath)).toEqual([".gitignore", "tracked.ts", "untracked.ts"]);
    expect(snapshot.fileCount).toBe(3);
  });

  test("reports what changed underneath it", async () => {
    const root = await makeRepo();
    const snapshot = await TestSnapshot.create(root, path.join(root, "local", "run"));
    await write(root, "tracked.ts", "export const changed = true;\n");
    await write(root, "added.ts", "export {};\n");
    await unlink(path.join(root, "untracked.ts"));

    expect(await snapshot.drift()).toEqual({ changed: ["tracked.ts"], added: ["added.ts"], removed: ["untracked.ts"] });
  });

  test("refuses an env file git does not ignore instead of shipping it to a test host", async () => {
    const root = await makeRepo();
    await write(root, "apps/demo/env/env.server.local.ts", "export default {};\n");
    await write(root, "apps/demo/env/env.server.example.ts", "export default {};\n");
    await write(root, "templates/.env.template", "KEY=\n");

    await expect(TestSnapshot.create(root, path.join(root, "local", "run"))).rejects.toThrow(
      "apps/demo/env/env.server.local.ts",
    );
  });
});
