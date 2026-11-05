import type { QualityWarning, SourceFileInfo } from "./qualityScanner";
import { type SourceComment, SourceComments } from "./sourceComments";

export class DeprecatedCommentScanner {
  static readonly rule = "akan.comment.deprecated-marker";
  static #marker = /^[!?*\s]*(?:(?:TODO|FIXME|XXX|NOTE)\b\s*:?\s*)?@?deprecated\b/i;

  scan(sourceFiles: SourceFileInfo[]): QualityWarning[] {
    return sourceFiles
      .filter(({ file }) => /^(apps|libs)\//.test(file) && !/\.(test|spec)\.tsx?$/.test(file))
      .flatMap(({ file, sourceFile }) =>
        SourceComments.of(sourceFile)
          .filter((comment) => DeprecatedCommentScanner.#isLooseMarker(comment))
          .map((comment) => ({
            rule: DeprecatedCommentScanner.rule,
            scope: "comment" as const,
            severity: "warning" as const,
            file,
            line: comment.line,
            message: `"${comment.raw.split(/\r?\n/)[0]?.trim().slice(0, 80)}" marks nothing at the use sites; editors strike through only a JSDoc @deprecated tag.`,
          })),
      );
  }

  static #isLooseMarker({ isJsDoc, body }: SourceComment) {
    const text = body.filter((line) => line !== "").join(" ");
    if (isJsDoc && /(^|\s)@deprecated\b/.test(text)) return false;
    return DeprecatedCommentScanner.#marker.test(text);
  }
}
