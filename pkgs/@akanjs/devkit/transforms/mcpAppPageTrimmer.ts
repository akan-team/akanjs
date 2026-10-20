import { realpathSync } from "node:fs";
import path from "node:path";
import type { BunPlugin } from "bun";
import ts from "typescript";
import { PureLazyMarker } from "./pureLazyMarker";

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
        //? The bundler loads a module by the path a link points at: a synced lib page is one under `page/(libs)`.
        const loadedPaths = new Set(
          pagePaths.flatMap((pagePath) => [pagePath, McpAppPageTrimmer.#realPathOf(pagePath)]),
        );
        const filter = new RegExp(`^(?:${[...loadedPaths].map((pagePath) => RegExp.escape(pagePath)).join("|")})$`);
        //? The bundler runs one onLoad per module, so this one also marks the page's own `lazy()` components.
        build.onLoad({ filter }, async (args) => ({
          contents: PureLazyMarker.mark(McpAppPageTrimmer.trim(await Bun.file(args.path).text(), args.path), args.path),
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
