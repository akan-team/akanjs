import { describe, expect, test } from "bun:test";
import ts from "typescript";
import type { SourceFileInfo } from "./qualityScanner";
import { TestOnlyExportScanner } from "./testOnlyExportScanner";

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

const scan = (files: Record<string, string>) =>
  new TestOnlyExportScanner().scan(Object.entries(files).map(([file, content]) => fileOf(file, content)));

const layout = [
  "export const groupLabelHeight = 30;",
  "export const computeGroupBoxes = () => [groupLabelHeight];",
  "export const groupEdgeStrips = (pad: number): number[] => (pad > 0 ? groupEdgeStrips(pad - 1) : []);",
  "export const layoutBoard = () => 1;",
  "",
].join("\n");

const layoutTest = [
  'import { computeGroupBoxes, groupEdgeStrips, groupLabelHeight, layoutBoard } from "./boardLayout";',
  "test(() => [computeGroupBoxes(), groupEdgeStrips(1), groupLabelHeight, layoutBoard()]);",
  "",
].join("\n");

describe("TestOnlyExportScanner", () => {
  test("flags an export only tests reference, even when it calls itself", () => {
    const warnings = scan({
      "apps/demo/webkit/boardLayout.ts": layout,
      "apps/demo/webkit/boardLayout.test.ts": layoutTest,
      "apps/demo/ui/Board.tsx":
        'import { layoutBoard } from "@apps/demo/webkit";\nexport const Board = () => layoutBoard();\n',
    });

    expect(warnings.map((warning) => warning.message)).toEqual([
      'Exported "computeGroupBoxes" is referenced only by tests: apps/demo/webkit/boardLayout.test.ts.',
      'Exported "groupEdgeStrips" is referenced only by tests: apps/demo/webkit/boardLayout.test.ts.',
    ]);
    expect(warnings[0]).toMatchObject({
      rule: "akan.global.test-only-export",
      scope: "global",
      file: "apps/demo/webkit/boardLayout.ts",
      line: 2,
      locations: [{ file: "apps/demo/webkit/boardLayout.test.ts", line: 1 }],
    });
  });

  test("passes an export another source file uses, or that a function in its own file uses", () => {
    const warnings = scan({
      "apps/demo/webkit/boardLayout.ts": layout,
      "apps/demo/webkit/boardLayout.test.ts": layoutTest,
      "apps/demo/ui/Board.tsx": [
        'import * as webkit from "@apps/demo/webkit";',
        "export const Board = () => [webkit.computeGroupBoxes(), webkit.groupEdgeStrips(2), webkit.layoutBoard()];",
        "",
      ].join("\n"),
    });

    expect(warnings).toEqual([]);
  });

  test("passes an export no test references, and leaves lib facets and lib modules alone", () => {
    expect(
      scan({
        "apps/demo/common/unused.ts": "export const unused = 1;\n",
        "libs/demo/webkit/signedIn.ts": "export const signedIn = () => true;\n",
        "libs/demo/webkit/signedIn.test.ts": 'import { signedIn } from "./signedIn";\ntest(() => signedIn());\n',
        "apps/demo/lib/post/post.constant.ts": "export class PostInput {}\n",
        "apps/demo/lib/post/post.signal.test.ts": "const input = new PostInput();\n",
      }),
    ).toEqual([]);
  });
});
