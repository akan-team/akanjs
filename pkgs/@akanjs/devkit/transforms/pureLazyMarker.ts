import type { BunPlugin } from "bun";
import ts from "typescript";

//* A view inlines every module its loads reach, so a `lazy()` component that nothing renders (one of a barrel's, or
//* of an `_overrides.tsx` manifest's) would still carry its chunk. `lazy()` only builds a component, so its call is
//* marked pure, and the bundler drops it, chunk and all, wherever its result goes unread.
export class PureLazyMarker {
  static plugin(): BunPlugin {
    return {
      name: "akan-pure-lazy",
      setup(build) {
        build.onLoad({ filter: /\.tsx?$/ }, async (args) => {
          const file = Bun.file(args.path);
          //? A view's own entry lives only in the build's `files`, where the bundler reads it without a plugin.
          if (!(await file.exists())) return undefined;
          const source = await file.text();
          const marked = PureLazyMarker.mark(source, args.path);
          return marked === source
            ? undefined
            : { contents: marked, loader: args.path.endsWith(".tsx") ? "tsx" : "ts" };
        });
      },
    };
  }

  static mark(source: string, filePath: string): string {
    if (!source.includes("lazy(")) return source;
    const kind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, kind);
    const starts: number[] = [];
    const visit = (node: ts.Node) => {
      const call = ts.isVariableDeclaration(node) ? node.initializer : undefined;
      if (call && ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === "lazy")
        starts.push(call.getStart(sourceFile));
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return starts
      .sort((a, b) => b - a)
      .reduce((marked, start) => `${marked.slice(0, start)}/* @__PURE__ */ ${marked.slice(start)}`, source);
  }
}
