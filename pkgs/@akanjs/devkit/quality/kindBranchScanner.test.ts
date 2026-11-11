import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { KindBranchScanner } from "./kindBranchScanner";
import type { SourceFileInfo } from "./qualityScanner";

const filesOf = (files: Record<string, string>): SourceFileInfo[] =>
  Object.entries(files).map(([file, content]) => ({
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
  }));

const pinConstant = `import { enumOf } from "akanjs/base";
export class PinKind extends enumOf("pinKind", ["videoScene", "videoTake", "memo"] as const) {}
export class PinStatus extends enumOf("pinStatus", ["active", "videoTake"] as const) {}
`;
const comparing = (expression: string) => `export const isIt = (pin: { kind: string }) => ${expression};\n`;

describe("KindBranchScanner", () => {
  test("warns on a kind value compared in three files outside its module, naming them and the table to declare", () => {
    const warnings = new KindBranchScanner().scan(
      filesOf({
        "apps/demo/lib/pin/pin.constant.ts": pinConstant,
        "apps/demo/lib/pin/Pin.Zone.tsx": comparing('pin.kind === "videoScene"'),
        "apps/demo/lib/board/Board.Zone.tsx": comparing('pin.kind === "videoScene"'),
        "apps/demo/lib/take/take.store.ts": comparing('"videoScene" !== pin.kind'),
        "apps/demo/ui/PinCard.tsx": `export const label = (kind: string) => {\n  switch (kind) {\n    case "videoScene":\n      return 1;\n  }\n};\n`,
        "apps/demo/ui/PinCard.test.tsx": comparing('pin.kind === "videoScene"'),
      }),
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      rule: "akan.global.kind-branch",
      severity: "warning",
      file: "apps/demo/lib/pin/pin.constant.ts",
      line: 2,
      message: '"videoScene" of cnst.PinKind is branched on in 3 files outside the enum\'s module.',
      locations: [
        { file: "apps/demo/lib/board/Board.Zone.tsx", line: 1 },
        { file: "apps/demo/lib/take/take.store.ts", line: 1 },
        { file: "apps/demo/ui/PinCard.tsx", line: 3 },
      ],
    });
    expect(warnings[0]?.fix).toContain('{ [kind in cnst.PinKind["value"]]: … }');
  });

  test("reads only a subject named for a kind, and only enums named for one", () => {
    const warnings = new KindBranchScanner().scan(
      filesOf({
        "apps/demo/lib/pin/pin.constant.ts": pinConstant,
        "apps/demo/lib/a/A.Zone.tsx": comparing('pin.status === "active" || label === "videoScene"'),
        "apps/demo/lib/b/B.Zone.tsx": comparing('pin.status === "active" || label === "videoScene"'),
        "apps/demo/lib/c/C.Zone.tsx": comparing('pin.status === "active" || label === "videoScene"'),
      }),
    );

    expect(warnings).toEqual([]);
  });

  test("groups the enums sharing a value, reached from the app's own lib or a lib, never another app or lib", () => {
    const warnings = new KindBranchScanner().scan(
      filesOf({
        "apps/demo/lib/pin/pin.constant.ts": pinConstant,
        "libs/media/lib/clip/clip.constant.ts": `export class ClipType extends enumOf("clipType", ["videoTake"] as const) {}\n`,
        "apps/demo/lib/a/A.Zone.tsx": comparing('pin.kind === "videoTake"'),
        "apps/demo/lib/b/B.Zone.tsx": comparing('pin.kind === "videoTake"'),
        "apps/demo/lib/c/C.Zone.tsx": comparing('pin.kind === "videoTake"'),
        "apps/other/lib/a/A.Zone.tsx": comparing('pin.kind === "videoTake"'),
        "apps/other/lib/b/B.Zone.tsx": comparing('pin.kind === "videoTake"'),
        "libs/shared/lib/a/A.Zone.tsx": comparing('pin.kind === "videoTake"'),
      }),
    );

    expect(warnings.map(({ file, message }) => ({ file, message }))).toEqual([
      {
        file: "apps/demo/lib/pin/pin.constant.ts",
        message: '"videoTake" of cnst.PinKind / cnst.ClipType is branched on in 3 files outside the enum\'s module.',
      },
    ]);
  });
});
