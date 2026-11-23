import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CodeTuiFiles } from "./CodeTuiFiles";

//? A repo of its own: CI unpacks the workspace from a tarball without `.git`, so the checkout lists nothing.
describe("CodeTuiFiles", () => {
  let repoRoot: string;

  beforeAll(async () => {
    repoRoot = await mkdtemp(path.join(os.tmpdir(), "akan-code-tui-files-"));
    for (const file of ["pkg/code/CodeTuiFiles.ts", "pkg/code/codeTuiFiles.test.ts", "pkg/other.ts"]) {
      await mkdir(path.dirname(path.join(repoRoot, file)), { recursive: true });
      await writeFile(path.join(repoRoot, file), "");
    }
    await Bun.spawn(["git", "init", "--quiet"], { cwd: repoRoot }).exited;
  });

  afterAll(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  test("matches a file by any part of its path, shortest first", async () => {
    const files = new CodeTuiFiles(repoRoot);
    await files.load();
    expect(files.ready).toBe(true);
    const hits = files.match("CodeTuiFiles");
    expect(hits).toEqual(["pkg/code/CodeTuiFiles.ts", "pkg/code/codeTuiFiles.test.ts"]);
  });

  test("paths are relative to the root the agent was given", async () => {
    const files = new CodeTuiFiles(path.join(repoRoot, "pkg"));
    await files.load();
    expect(files.match("CodeTuiFiles")).toContain("code/CodeTuiFiles.ts");
  });

  test("an untracked directory lists nothing rather than walking the disk", async () => {
    const files = new CodeTuiFiles("/");
    await files.load();
    expect(files.match("a")).toEqual([]);
  });
});
