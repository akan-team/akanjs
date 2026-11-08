import { realpathSync } from "node:fs";
import ts from "typescript";
import { PureLazyMarker } from "./pureLazyMarker";

type ChainStage = ts.CallExpression & { expression: ts.PropertyAccessExpression };

//* An MCP App's view runs its page's `.app()` loads and no other stage, so the view build hands each such stage a
//* function that draws nothing, and the bundler drops what only the page's own markup reached.
export class McpAppPageTrimmer {
  static readonly #unused = new Set(["render", "head", "loading", "guard"]);

  static pipe(pagePaths: string[]): (source: string, args: { path: string }) => string {
    //? The bundler loads a module by the path a link points at: a synced lib page is one under `page/(libs)`.
    const loadedPaths = new Set(pagePaths.flatMap((pagePath) => [pagePath, McpAppPageTrimmer.#realPathOf(pagePath)]));
    return (source, { path: filePath }) =>
      PureLazyMarker.mark(loadedPaths.has(filePath) ? McpAppPageTrimmer.trim(source, filePath) : source, filePath);
  }

  static trim(source: string, filePath: string): string {
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const spans = McpAppPageTrimmer.#stagesOf(sourceFile)
      .flatMap((stage) => {
        const [first] = stage.arguments;
        if (!first || !McpAppPageTrimmer.#unused.has(stage.expression.name.text)) return [];
        return [{ start: first.getStart(sourceFile), end: first.getEnd() }];
      })
      .sort((a, b) => b.start - a.start);
    let trimmed = source;
    for (const { start, end } of spans) trimmed = `${trimmed.slice(0, start)}() => null${trimmed.slice(end)}`;
    return trimmed;
  }

  static #realPathOf(filePath: string) {
    try {
      return realpathSync(filePath);
    } catch {
      return filePath;
    }
  }

  static #stagesOf(sourceFile: ts.SourceFile): ChainStage[] {
    const stages: ChainStage[] = [];
    for (const statement of sourceFile.statements) {
      if (!ts.isExportAssignment(statement) || statement.isExportEquals) continue;
      let node: ts.Expression = statement.expression;
      while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node))
        node = node.expression;
      while (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        stages.push(node as ChainStage);
        node = node.expression.expression;
      }
    }
    return stages;
  }
}
