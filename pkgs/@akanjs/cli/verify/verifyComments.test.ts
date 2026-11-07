import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeText } from "@akanjs/devkit/testHelpers";
import ts from "typescript";
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
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-comments-"));
  roots.push(root);
  await git(root, "init", "-q");
  for (const [file, text] of Object.entries(files)) await writeText(path.join(root, file), text);
  await git(root, "add", "-A");
  await git(root, "commit", "-q", "-m", "init");
  return root;
};

describe("VerifyComments", () => {
  test("reads comments the parser sees, not comment-looking text", () => {
    const source = [
      "// line",
      'const url = "https://example.com"; // trailing',
      "const re = /a\\/\\/b/;",
      "const tpl = `// not a comment`;",
      "/** doc */",
      "export const View = () => (",
      "  <div>",
      "    // jsx text",
      "    {/* jsx comment */}",
      "  </div>",
      ");",
      "/* last */",
    ].join("\n");
    const comments = VerifyComments.commentsOf(ts, "view.tsx", source).map(({ text, line }) => [line, text]);
    expect(comments).toEqual([
      [1, "// line"],
      [2, "// trailing"],
      [5, "/** doc */"],
      [9, "/* jsx comment */"],
      [12, "/* last */"],
    ]);
  });

  test("reads the added lines of each file from a zero-context diff", () => {
    const diff = [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,0 +2,2 @@",
      "+x",
      "+y",
      "@@ -9 +11 @@",
      "-old",
      "+new",
      "@@ -20,3 +22,0 @@",
      "diff --git a/gone.ts b/gone.ts",
      "--- a/gone.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
    ].join("\n");
    expect([...VerifyComments.parseDiff(diff)].map(([file, lines]) => [file, [...lines]])).toEqual([
      ["a.ts", [2, 3, 11]],
    ]);
  });

  test("warns on comments added since the last commit, skipping directives and committed ones", async () => {
    const root = await repo({ "src/kept.ts": "// committed\nexport const a = 1;\n", "notes.md": "# notes\n" });
    await writeText(
      path.join(root, "src/kept.ts"),
      "// committed\n// added\nexport const a = 1; // also added\n// biome-ignore lint/plugin: reason\nexport const b = 2;\n",
    );
    await writeText(
      path.join(root, "src/new.ts"),
      "/*\n * a block whose first line is empty\n */\nexport const c = 3;\n",
    );
    await writeText(path.join(root, "notes.md"), "# notes\n// not code\n");

    const found = await VerifyComments.added(root, ["src/kept.ts", "src/new.ts", "notes.md", "src/missing.ts"]);

    expect(found.map(({ file, line, message }) => [file, line, message])).toEqual([
      ["src/kept.ts", 2, "// added"],
      ["src/kept.ts", 3, "// also added"],
      ["src/new.ts", 1, "* a block whose first line is empty"],
    ]);
    expect(found.every((entry) => entry.code === "akan.comment.added" && entry.severity === "warning")).toBe(true);
    expect(found.map((entry) => !!entry.fix)).toEqual([true, false, false]);
  });

  test("reports nothing outside a git repository", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akan-comments-"));
    roots.push(root);
    await writeText(path.join(root, "a.ts"), "// added\nexport const a = 1;\n");
    expect(await VerifyComments.added(root, ["a.ts"])).toEqual([]);
  });
});
