import path from "node:path";
import ts from "typescript";
import type { QualityWarning, SourceFileInfo } from "./qualityScanner";
import { type SourceComment, SourceComments } from "./sourceComments";

interface CommentedFile {
  file: string;
  line: number;
  commentLineNum: number;
}

interface CommentTally {
  lineNum: number;
  commentLineNum: number;
  files: CommentedFile[];
}

export class CommentDensityScanner {
  static readonly rule = "akan.comment.density";
  static readonly maxShare = 0.01;
  static readonly minCommentLineNum = 5;
  static #directive =
    /^(?:biome-ignore|@ts-(?:expect-error|ignore|nocheck|check)\b|eslint-(?:disable|enable)|<reference\b)/;
  static #scaffoldMarkers = new Set(["state", "action"]);

  scan(sourceFiles: SourceFileInfo[]): QualityWarning[] {
    const tallies = new Map<string, CommentTally>();
    for (const sourceFile of sourceFiles) {
      const unit = CommentDensityScanner.#unitOf(sourceFile.file);
      if (!unit || !CommentDensityScanner.#isMeasured(sourceFile)) continue;
      const tally = tallies.get(unit) ?? { lineNum: 0, commentLineNum: 0, files: [] };
      const commentLines = CommentDensityScanner.#commentLinesOf(sourceFile);
      tally.lineNum += sourceFile.content.split(/\r?\n/).filter((line) => line.trim() !== "").length;
      tally.commentLineNum += commentLines.length;
      if (commentLines[0] !== undefined)
        tally.files.push({ file: sourceFile.file, line: commentLines[0], commentLineNum: commentLines.length });
      tallies.set(unit, tally);
    }
    return [...tallies]
      .filter(([, tally]) => CommentDensityScanner.#isDense(tally))
      .map(([unit, tally]) => CommentDensityScanner.#warningOf(unit, tally));
  }

  static #commentLinesOf({ file, sourceFile }: SourceFileInfo) {
    const isRecipe = file.includes("/ui/Recipe/");
    const lines = new Set<number>();
    for (const comment of SourceComments.of(sourceFile)) {
      if (CommentDensityScanner.#isExempt(comment)) continue;
      const contentIdxs = comment.body.flatMap((text, idx) => (text ? [idx] : []));
      //? A recipe's first JSDoc line is its description in the generated AGENTS.md recipe index.
      const countedIdxs = isRecipe && comment.isJsDoc ? contentIdxs.slice(1) : contentIdxs;
      for (const idx of countedIdxs) lines.add(comment.line + idx);
    }
    return [...lines].sort((a, b) => a - b);
  }

  static #isExempt({ raw, body }: SourceComment) {
    const head = body.find((text) => text !== "") ?? "";
    if (CommentDensityScanner.#directive.test(head)) return true;
    return raw.startsWith("//") && CommentDensityScanner.#scaffoldMarkers.has(head.toLowerCase());
  }

  static #isDense({ lineNum, commentLineNum }: CommentTally) {
    return (
      commentLineNum >= CommentDensityScanner.minCommentLineNum &&
      commentLineNum > lineNum * CommentDensityScanner.maxShare
    );
  }

  static #warningOf(unit: string, { lineNum, commentLineNum, files }: CommentTally): QualityWarning {
    const [primary] = [...files].sort((a, b) => b.commentLineNum - a.commentLineNum);
    const share = ((commentLineNum / lineNum) * 100).toFixed(2);
    return {
      rule: CommentDensityScanner.rule,
      scope: "comment",
      severity: "warning",
      file: primary?.file ?? unit,
      line: primary?.line,
      message: `${unit} is ${share}% comments (${commentLineNum} of ${lineNum} non-blank lines); product lib/ and ui/ code stays under ${CommentDensityScanner.maxShare * 100}%.`,
      ...(files.length > 1 ? { locations: files.map(({ file, line }) => ({ file, line })) } : {}),
    };
  }

  static #unitOf(file: string) {
    const segments = file.split("/");
    if ((segments[0] !== "apps" && segments[0] !== "libs") || segments.length < 4) return null;
    if (segments[2] === "ui") return segments.slice(0, 4).join("/");
    if (segments[2] !== "lib") return null;
    const depth = segments[3] === "__scalar" ? 5 : 4;
    return segments.length > depth ? segments.slice(0, depth).join("/") : null;
  }

  static #isMeasured({ file, sourceFile }: SourceFileInfo) {
    if (/\.(test|spec)\.tsx?$/.test(file) || path.basename(file) === "guards.ts") return false;
    return !sourceFile.statements.every(
      (statement) =>
        ts.isExportDeclaration(statement) ||
        (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)),
    );
  }
}
