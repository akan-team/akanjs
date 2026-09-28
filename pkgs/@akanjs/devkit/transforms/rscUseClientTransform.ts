import path from "node:path";
import ts from "typescript";
import { loaderFor } from "./moduleSyntax";

const USE_CLIENT_RE = /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/;
const IMPLICIT_ROOT_LAYOUT_RE =
  /[/\\]\.akan[/\\]generated[/\\](?:implicit-root-layout|root-layouts[/\\].*__root_layout)\.(tsx|ts|jsx|js)$/;
const STAR_REEXPORT_HINT_RE = /\bexport\s*\*\s*from\b/;

export interface UseClientTransformArgs {
  path: string;
  workspaceRoot?: string;
  /** Told each `"use client"` module's export names, the only part of it the server graph holds. */
  onClientModule?: (path: string, exports: string[]) => void;
}

export const hasUseClientDirective = (source: string): boolean => USE_CLIENT_RE.test(source);

export function toClientReferencePath(absPath: string, workspaceRoot: string): string {
  return path.relative(path.resolve(workspaceRoot), path.resolve(absPath)).split(path.sep).join("/");
}

const starReexportSpecifiers = (source: string, filePath: string) =>
  ts
    .createSourceFile(filePath, source, ts.ScriptTarget.Latest)
    .statements.filter(
      (statement): statement is ts.ExportDeclaration & { moduleSpecifier: ts.StringLiteral } =>
        ts.isExportDeclaration(statement) &&
        !statement.exportClause &&
        !statement.isTypeOnly &&
        !!statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier),
    )
    .map((statement) => statement.moduleSpecifier.text);

// `Bun.Transpiler.scan` reports no name through `export *`, so the server could register none of a star's names as
// client references; they would be undefined in a server component. Refused as Next.js refuses it.
export const scanUseClientExports = (source: string, filePath: string, workspaceRoot?: string): string[] => {
  const stars =
    USE_CLIENT_RE.test(source) && STAR_REEXPORT_HINT_RE.test(source) ? starReexportSpecifiers(source, filePath) : [];
  if (stars.length) {
    const file = workspaceRoot ? toClientReferencePath(filePath, workspaceRoot) : filePath;
    const listed = stars.slice(0, 3).map((specifier) => `\`export * from ${JSON.stringify(specifier)}\``);
    const written = stars.length > 3 ? `${listed.join(", ")} (and ${stars.length - 3} more)` : listed.join(", ");
    throw new Error(
      `${file} is a "use client" module, so it cannot ${written}: the server sees only the names a client module ` +
        `declares, and a star re-export declares none. Re-export them by name — \`export { … } from ${JSON.stringify(stars[0])}\`.`,
    );
  }
  return new Bun.Transpiler({ loader: loaderFor(filePath) }).scan(source).exports;
};

/** `null` unless `source` is a `"use client"` module; the stub source is valid under loader `"ts"`. */
export function transformUseClient(source: string, args: UseClientTransformArgs): string | null {
  if (!USE_CLIENT_RE.test(source)) return null;
  if (IMPLICIT_ROOT_LAYOUT_RE.test(args.path)) return null;
  const exports = scanUseClientExports(source, args.path, args.workspaceRoot);
  //? Not reported without exports: the module then stays in the server bundle as it is, so a save of it changes what
  //? the server runs, which a client module's edit that kept its export names does not.
  if (exports.length === 0) return null;
  args.onClientModule?.(args.path, exports);

  const referencePath = args.workspaceRoot ? toClientReferencePath(args.path, args.workspaceRoot) : args.path;
  const filePathLit = JSON.stringify(referencePath);
  const lines: string[] = [`import { registerClientReference } from "react-server-dom-webpack/server.node";`];

  for (const name of exports) {
    const nameLit = JSON.stringify(name);
    const errMsg = JSON.stringify(
      `Attempted to call '${name}' from '${referencePath}' on the server, but it is a client-only export.`,
    );
    const proxy = `() => { throw new Error(${errMsg}); }`;
    const binding =
      name === "default"
        ? `export default registerClientReference(${proxy}, ${filePathLit}, ${nameLit});`
        : `export const ${name} = registerClientReference(${proxy}, ${filePathLit}, ${nameLit});`;
    lines.push(binding);
  }

  return lines.join("\n");
}
