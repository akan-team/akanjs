import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeText } from "@akanjs/devkit/test/testHelpers";
import { VerifyCommentLedger } from "./verifyCommentLedger";
import { VerifyComments } from "./verifyComments";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const git = async (root: string, ...args: string[]) => {
  const proc = Bun.spawn(
    ["git", "-c", "user.email=dev@example.com", "-c", "user.name=dev", "-c", "commit.gpgsign=false", ...args],
    { cwd: root, stdout: "ignore", stderr: "ignore" },
  );
  expect(await proc.exited).toBe(0);
};

const repo = async (files: Record<string, string>) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-comment-ledger-"));
  roots.push(root);
  await git(root, "init", "-q");
  for (const [file, text] of Object.entries(files)) await writeText(path.join(root, file), text);
  await git(root, "add", "-A");
  await git(root, "commit", "-q", "-m", "init");
  return root;
};

const settle = async (root: string, files: string[], repeat = false) =>
  (await VerifyCommentLedger.settle(root, files, await VerifyComments.found(root, files), { repeat })).map(
    ({ file, line, code, message, fix }) => [file ? `${file}:${line}` : "-", code, message, fix ? "fix" : ""].join(" "),
  );

describe("VerifyCommentLedger", () => {
  test("lists a comment the first time and says nothing of it from then on, wherever it moves", async () => {
    const root = await repo({ "a.ts": "export const a = 1;\n", "b.ts": "export const b = 1;\n" });
    await writeText(path.join(root, "a.ts"), "// why a\nexport const a = 1;\n// tail\n");
    await writeText(path.join(root, "b.ts"), "// why b\nexport const b = 1;\n");
    const files = ["a.ts", "b.ts"];

    expect(await settle(root, files)).toEqual([
      "a.ts:1 akan.comment.added // why a fix",
      "a.ts:3 akan.comment.added // tail ",
      "b.ts:1 akan.comment.added // why b ",
    ]);
    expect(await settle(root, files)).toEqual([]);

    await writeText(path.join(root, "a.ts"), "export const zero = 0;\n// why a\nexport const a = 1;\n// tail\n");
    expect(await settle(root, files)).toEqual([]);

    await writeText(path.join(root, "b.ts"), "// why b\nexport const b = 1;\n// more\n");
    expect(await settle(root, files)).toEqual([
      "b.ts:3 akan.comment.added // more fix",
      "- akan.comment.kept 3 comments added since the last commit, reported by an earlier run, are still in 2 files; akan verify --comments lists them ",
    ]);
    expect(await settle(root, ["a.ts"])).toEqual([]);
  });

  test("lists a new or reworded comment beside the count, and everything again when asked to repeat", async () => {
    const root = await repo({ "a.ts": "export const a = 1;\n" });
    await writeText(path.join(root, "a.ts"), "// why a\nexport const a = 1;\n");
    await settle(root, ["a.ts"]);

    await writeText(path.join(root, "a.ts"), "// why a\nexport const a = 1;\n// new\n");
    expect(await settle(root, ["a.ts"])).toEqual([
      "a.ts:3 akan.comment.added // new fix",
      "- akan.comment.kept 1 comment added since the last commit, reported by an earlier run, is still in 1 file; akan verify --comments lists them ",
    ]);

    await writeText(path.join(root, "a.ts"), "// why a, reworded\nexport const a = 1;\n// new\n");
    expect((await settle(root, ["a.ts"]))[0]).toBe("a.ts:1 akan.comment.added // why a, reworded fix");

    expect(await settle(root, ["a.ts"], true)).toEqual([
      "a.ts:1 akan.comment.added // why a, reworded fix",
      "a.ts:3 akan.comment.added // new ",
    ]);
  });

  test("forgets a deleted comment and starts over after a commit, so what the commit left out is listed once more", async () => {
    const root = await repo({ "a.ts": "export const a = 1;\n", "b.ts": "export const b = 1;\n" });
    await writeText(path.join(root, "a.ts"), "// why a\nexport const a = 1;\n");
    await writeText(path.join(root, "b.ts"), "// why b\nexport const b = 1;\n");
    await settle(root, ["a.ts", "b.ts"]);

    await writeText(path.join(root, "a.ts"), "export const a = 1;\n");
    expect(await settle(root, ["a.ts", "b.ts"])).toEqual([]);
    await writeText(path.join(root, "a.ts"), "// why a\nexport const a = 1;\n");
    expect((await settle(root, ["a.ts", "b.ts"]))[0]).toBe("a.ts:1 akan.comment.added // why a fix");

    await git(root, "add", "a.ts");
    await git(root, "commit", "-q", "-m", "a");
    expect(await settle(root, ["b.ts"])).toEqual(["b.ts:1 akan.comment.added // why b fix"]);
  });

  test("reports everything when the ledger file is unreadable", async () => {
    const root = await repo({ "a.ts": "export const a = 1;\n" });
    await writeText(path.join(root, "a.ts"), "// why a\nexport const a = 1;\n");
    await writeText(path.join(root, VerifyCommentLedger.file), "not json");
    expect(await settle(root, ["a.ts"])).toEqual(["a.ts:1 akan.comment.added // why a fix"]);
    expect(await settle(root, ["a.ts"])).toEqual([]);
  });
});
