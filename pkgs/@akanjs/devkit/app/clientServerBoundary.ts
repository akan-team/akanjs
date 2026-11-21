import path from "node:path";
import ts from "typescript";
import { CliError } from "../commandDecorators/cliError";

export interface ServerImport {
  file: string;
  line: number;
  specifier: string;
  hint: string;
}

export class ClientServerBoundary {
  static readonly rules = [
    {
      patterns: [String.raw`.*\.(?:document|dictionary|service|signal)`],
      hint: "Server module. A client or shared file must not import a *.document, *.dictionary, *.service, or *.signal file — take the model from the package client entrypoint ('@libs/<lib>/client') or from its *.constant instead. Write 'import type' if only the type is needed.",
    },
    {
      patterns: [String.raw`(?:.*/)?srvkit(?:/.*)?`, String.raw`.*/server(?:/.*)?`],
      hint: "Server entrypoint. A client or shared file must not import srvkit/ or a package server entrypoint such as '@apps/<app>/server' or 'akanjs/server' — import the matching client entrypoint instead.",
    },
    {
      patterns: [String.raw`(?:.*/)?(?:db|srv|sig|dict|option|useServer)`],
      hint: "Server barrel. A client or shared file must not import db, srv, sig, dict, option, or useServer — read models from cnst, state from st, and Err from the package client entrypoint.",
    },
  ].map((rule) => ({ ...rule, pattern: new RegExp(`^(?:${rule.patterns.join("|")})$`) }));
  static readonly #sources = new Bun.Glob("**/*.{ts,tsx}");
  static readonly #skippedDir = /(?:^|\/)(?:node_modules|dist|dump|local)\//;
  static readonly #silencedFile = /biome-ignore-all\b[^:\n]*\blint\/plugin\b/;
  static readonly #silencedImport = /biome-ignore\s[^:\n]*\blint\/plugin\b/;

  static isClientFile(relativePath: string) {
    if (/\.(?:test|spec)\.tsx?$/.test(relativePath)) return false;
    return (
      relativePath.endsWith(".tsx") ||
      relativePath.endsWith(".store.ts") ||
      relativePath.endsWith(".constant.ts") ||
      /(?:^|\/)(?:ui|webkit|page|common)\//.test(relativePath)
    );
  }

  static serverImportsOf(file: string, text: string): ServerImport[] {
    if (ClientServerBoundary.#silencedFile.test(text)) return [];
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind);
    return source.statements.flatMap((statement) => {
      if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) return [];
      if (!ts.isStringLiteral(statement.moduleSpecifier)) return [];
      const specifier = statement.moduleSpecifier.text;
      const found = ClientServerBoundary.rules.find(({ pattern }) => pattern.test(specifier));
      const comments = ts.getLeadingCommentRanges(text, statement.pos) ?? [];
      if (!found || comments.some(({ pos, end }) => ClientServerBoundary.#silencedImport.test(text.slice(pos, end))))
        return [];
      const { line } = source.getLineAndCharacterOfPosition(statement.getStart(source));
      return [{ file, line: line + 1, specifier, hint: found.hint }];
    });
  }

  static async find(dirs: string[], workspaceRoot: string): Promise<{ files: number; found: ServerImport[] }> {
    let files = 0;
    const found: ServerImport[] = [];
    for (const dir of dirs)
      for await (const relativePath of ClientServerBoundary.#sources.scan({ cwd: dir, followSymlinks: false })) {
        const posix = relativePath.split(path.sep).join("/");
        if (ClientServerBoundary.#skippedDir.test(posix) || !ClientServerBoundary.isClientFile(posix)) continue;
        files++;
        const absolute = path.join(dir, relativePath);
        const file = path.relative(workspaceRoot, absolute).split(path.sep).join("/");
        found.push(...ClientServerBoundary.serverImportsOf(file, await Bun.file(absolute).text()));
      }
    return { files, found };
  }

  static async assert(dirs: string[], workspaceRoot: string): Promise<number> {
    const { files, found } = await ClientServerBoundary.find(dirs, workspaceRoot);
    if (!found.length) return files;
    const lines = ClientServerBoundary.rules.flatMap(({ hint }) => {
      const each = found.filter((serverImport) => serverImport.hint === hint);
      return each.length ? [hint, ...each.map(({ file, line, specifier }) => `  ${file}:${line} "${specifier}"`)] : [];
    });
    throw new CliError(
      "checkFailed",
      [
        `${found.length} import${found.length === 1 ? "" : "s"} would put server code in the browser bundle (\`akan lint\` reports ${found.length === 1 ? "it" : "them"} as no-import-server-in-client):`,
        ...lines,
      ].join("\n"),
    );
  }
}
