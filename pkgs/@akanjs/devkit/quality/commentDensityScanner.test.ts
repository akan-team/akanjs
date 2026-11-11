import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { CommentDensityScanner } from "./commentDensityScanner";
import type { SourceFileInfo } from "./qualityScanner";

const fileOf = (file: string, content: string): SourceFileInfo => ({
  file,
  absolutePath: `/repo/${file}`,
  content,
  sourceFile: ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  ),
});

const codeOf = (lineNum: number) => Array.from({ length: lineNum }, (_, idx) => `const value${idx} = ${idx};`);
const commentsOf = (lineNum: number) => Array.from({ length: lineNum }, (_, idx) => `// note ${idx}`);
const scan = (files: Record<string, string[]>) =>
  new CommentDensityScanner().scan(Object.entries(files).map(([file, lines]) => fileOf(file, `${lines.join("\n")}\n`)));

describe("CommentDensityScanner", () => {
  test("flags a module over 1% with at least five comment lines, summed across its files", () => {
    const warnings = scan({
      "apps/demo/lib/post/post.service.ts": [...commentsOf(3), ...codeOf(100)],
      "apps/demo/lib/post/post.document.ts": [...codeOf(50), ...commentsOf(2)],
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      rule: "akan.comment.density",
      scope: "comment",
      file: "apps/demo/lib/post/post.service.ts",
      line: 1,
    });
    expect(warnings[0]?.message).toContain("apps/demo/lib/post is 3.23% comments (5 of 155 non-blank lines)");
    expect(warnings[0]?.locations).toEqual([
      { file: "apps/demo/lib/post/post.service.ts", line: 1 },
      { file: "apps/demo/lib/post/post.document.ts", line: 51 },
    ]);
  });

  test("passes a module under 1%, and a small module with fewer than five comment lines", () => {
    expect(
      scan({
        "apps/demo/lib/post/post.service.ts": [...commentsOf(5), ...codeOf(600)],
        "apps/demo/lib/tag/tag.service.ts": [...commentsOf(4), ...codeOf(10)],
      }),
    ).toEqual([]);
  });

  test("does not count lint and TS directives or the store scaffold markers", () => {
    expect(
      scan({
        "apps/demo/lib/post/post.store.ts": [
          "export class PostStore extends store(sig.post, () => ({",
          "  // state",
          "})) {",
          "  // action",
          "}",
          "// biome-ignore lint/style/noNonNullAssertion: vendor typing",
          "/* biome-ignore lint/plugin: fixed brand color */",
          "// @ts-expect-error vendor typing",
          "// @ts-ignore vendor typing",
          ...codeOf(5),
        ],
      }),
    ).toEqual([]);
  });

  test("does not count comment syntax inside strings or JSX text", () => {
    expect(
      scan({
        "apps/demo/ui/Links.tsx": [
          'export const home = "https://host//home";',
          'export const docs = "https://host//docs";',
          `export const api = \`https://host//\${home}\`;`,
          "export const Links = () => (",
          "  <p>",
          "    // not a comment",
          "    // still text",
          "  </p>",
          ");",
        ],
      }),
    ).toEqual([]);
  });

  test("measures neither srvkit nor guards.ts nor tests", () => {
    expect(
      scan({
        "apps/demo/srvkit/vendorApi.ts": [...commentsOf(20), ...codeOf(10)],
        "apps/demo/lib/post/guards.ts": [...commentsOf(20), ...codeOf(10)],
        "apps/demo/lib/post/post.signal.test.ts": [...commentsOf(20), ...codeOf(10)],
        "apps/demo/ui/Card.test.tsx": [...commentsOf(20), ...codeOf(10)],
      }),
    ).toEqual([]);
  });

  test("aggregates a ui folder as one entry and a ui file as its own", () => {
    const warnings = scan({
      "apps/demo/ui/Chart/Bar.tsx": [...commentsOf(3), ...codeOf(20)],
      "apps/demo/ui/Chart/Pie.tsx": [...commentsOf(3), ...codeOf(20)],
      "apps/demo/ui/Badge.tsx": [...commentsOf(4), ...codeOf(20)],
    });

    expect(warnings.map((warning) => warning.message.split(" is ")[0])).toEqual(["apps/demo/ui/Chart"]);
  });

  test("leaves a recipe's one-line JSDoc description uncounted", () => {
    const recipeOf = (name: string) => [`/** ${name} look. */`, `export const ${name}Recipe = recipe(tv({}));`];
    expect(
      scan({
        "apps/demo/ui/Recipe/panel.ts": [...recipeOf("panel"), ...recipeOf("tile"), ...recipeOf("card")],
        "apps/demo/ui/Recipe/chip.ts": [...recipeOf("chip"), ...recipeOf("pill"), ...recipeOf("tag")],
      }),
    ).toEqual([]);
  });
});
