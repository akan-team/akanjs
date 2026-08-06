import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AbstractDoc } from "./abstractDoc";
import { AkanQualityScanner } from "./qualityScanner";

const tempRoots: string[] = [];

const makeWorkspace = async (files: Record<string, string>) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-quality-scanner-"));
  tempRoots.push(root);
  for (const [filePath, content] of Object.entries({ ".gitignore": "node_modules\n", ...files })) {
    const absolutePath = path.join(root, filePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }
  return root;
};

const abstractOf = (lineNum: number) =>
  ["# post Abstract", ...Array.from({ length: lineNum - 1 }, (_, idx) => `- rule ${idx}`)].join("\n");

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("AkanQualityScanner abstract rule", () => {
  test("warns on an abstract over the line limit and points at akan compact", async () => {
    const root = await makeWorkspace({
      "apps/demo/lib/post/post.abstract.md": abstractOf(AbstractDoc.maxLines + 1),
      "apps/demo/lib/post/post.constant.ts": "export class Post {}\n",
      "libs/shared/lib/user/user.abstract.md": abstractOf(AbstractDoc.maxLines),
      "libs/shared/lib/user/user.constant.ts": "export class User {}\n",
    });

    const result = await new AkanQualityScanner().scan(root);
    const warnings = result.warnings.filter((warning) => warning.rule === "akan.file.abstract-max-lines");

    expect(result.scannedFiles).toBe(4);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.file).toBe("apps/demo/lib/post/post.abstract.md");
    expect(warnings[0]?.message).toContain(`${AbstractDoc.maxLines + 1} lines`);
    expect(warnings[0]?.fix).toContain("akan compact");
  });
});
