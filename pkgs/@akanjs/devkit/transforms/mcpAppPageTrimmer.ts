import path from "node:path";
import type { BunPlugin } from "bun";
import ts from "typescript";

type ChainStage = ts.CallExpression & { expression: ts.PropertyAccessExpression };

//* An MCP App's view runs its page's `.app()` loads and no other stage, so the view build hands each such stage a
//* function that draws nothing, and the bundler drops what only the page's own markup reached.
export class McpAppPageTrimmer {
  static readonly #unused = new Set(["render", "head", "loading", "guard"]);

  /** Trims exactly `pagePaths`: the rest of the graph loads as it does for the CSR shell. */
  static plugin(pagePaths: string[]): BunPlugin {
    return {
      name: "akan-mcp-app-page",
      setup(build) {
        if (!pagePaths.length) return;
        const filter = new RegExp(`^(?:${pagePaths.map((pagePath) => RegExp.escape(pagePath)).join("|")})$`);
        build.onLoad({ filter }, async (args) => ({
          contents: McpAppPageTrimmer.trim(await Bun.file(args.path).text(), args.path),
          loader: path.extname(args.path).slice(1) as "tsx" | "ts" | "jsx" | "js",
        }));
      },
    };
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
