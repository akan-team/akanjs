import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { DeprecatedCommentScanner } from "./deprecatedCommentScanner";
import type { SourceFileInfo } from "./qualityScanner";

const fileOf = (file: string, content: string): SourceFileInfo => ({
  file,
  absolutePath: `/repo/${file}`,
  content,
  sourceFile: ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
});

const scan = (file: string, lines: string[]) =>
  new DeprecatedCommentScanner().scan([fileOf(file, `${lines.join("\n")}\n`)]);

describe("DeprecatedCommentScanner", () => {
  test("flags a trailing, a leading and a block deprecated comment", () => {
    const warnings = scan("apps/demo/lib/court/court.constant.ts", [
      "export class CourtInput extends via((field) => ({",
      "  legacyVenue: field(String).optional(), // deprecated",
      "  // Deprecated: use courtId",
      "  legacyCourt: field(String).optional(),",
      "  /* DEPRECATED */ oldName: field(String).optional(),",
      "  /** deprecated, read venueId */ oldVenue: field(String).optional(),",
      "})) {}",
    ]);

    expect(warnings.map((warning) => warning.line)).toEqual([2, 3, 5, 6]);
    expect(warnings[0]).toMatchObject({ rule: "akan.comment.deprecated-marker", scope: "comment" });
    expect(warnings[0]?.message).toContain('"// deprecated"');
  });

  test("leaves a JSDoc @deprecated tag and prose that only mentions deprecation", () => {
    expect(
      scan("libs/demo/ui/field.type.ts", [
        "export interface FieldProps {",
        "  /** @deprecated Ignored: the field renders `value`. */",
        "  defaultValue?: string;",
        "  /**",
        "   * Old name.",
        "   * @deprecated use `value`",
        "   */",
        "  initial?: string;",
        "}",
        "// Replaces the deprecated upstream plugin.",
        "export const notice = '// deprecated';",
      ]),
    ).toEqual([]);
  });

  test("stays out of tests", () => {
    expect(scan("apps/demo/lib/court/court.signal.test.ts", ["const venue = 1; // deprecated"])).toEqual([]);
  });
});
