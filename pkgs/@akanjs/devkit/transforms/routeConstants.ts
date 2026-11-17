import path from "node:path";
import ts from "typescript";
import type { RuntimeConstantGraph } from "../quality/runtimeConstantGraph";
import { RuntimeImports } from "../quality/runtimeImports";
import type { RuntimeOwner } from "../quality/runtimeNameTable";
import type { RuntimeConstantName, RuntimeConstantUse } from "../quality/runtimeUse";

export interface ConstantEdit {
  start: number;
  end: number;
  text: string;
}

export interface ConstantRewrite {
  edits: ConstantEdit[];
  imports: string[];
  pieces: string[];
}

const scopeOf = (fileName: string) => fileName.match(/^((?:apps|libs)\/[^/]+)\//)?.[1] ?? null;

export class RouteConstants {
  readonly #graph: RuntimeConstantGraph;
  readonly #pieces: ReadonlySet<string>;

  constructor(graph: RuntimeConstantGraph, pieces: ReadonlySet<string>) {
    this.#graph = graph;
    this.#pieces = pieces;
  }

  get graph() {
    return this.#graph;
  }

  static pieceOf({ owner }: { owner: RuntimeOwner }) {
    return `${owner.scope}/lib/__client/${owner.module}.cnst`;
  }

  static isConstantImport(statement: ts.ImportDeclaration, fileName: string) {
    return ts.isStringLiteral(statement.moduleSpecifier)
      ? !!RuntimeImports.constantTargetOf(statement.moduleSpecifier.text, fileName)
      : false;
  }

  //? A constant file never loads a piece of its own scope: that piece imports the file back.
  rewrite(
    sourceFile: ts.SourceFile,
    fileName: string,
    use: RuntimeConstantUse,
    { constantFile = false }: { constantFile?: boolean } = {},
  ): ConstantRewrite | null {
    if (use.problems.length) return null;
    const named = use.reads.flatMap((read): RuntimeConstantName[] => (read.kind === "member" ? [read] : read.keys));
    if (constantFile && named.some(({ owner }) => owner.scope === scopeOf(fileName))) return null;
    const registered = constantFile
      ? named.map(({ owner }) => owner)
      : [...use.imports, ...named.map(({ owner }) => owner)];
    if (!registered.length) return { edits: [], imports: [], pieces: [] };
    const pieces = [
      ...new Set(
        (constantFile ? registered : this.#graph.closureOf(registered)).map((owner) =>
          RouteConstants.pieceOf({ owner }),
        ),
      ),
    ];
    const needed = [...pieces, ...named.filter(({ model }) => model).map((read) => RouteConstants.pieceOf(read))];
    if (needed.some((piece) => !this.#pieces.has(piece))) return null;
    const aliases = new Map<string, { alias: string; line: string }>();
    const aliasOf = (read: RuntimeConstantName) => {
      const piece = RouteConstants.pieceOf(read);
      const [key, specifier] = read.model
        ? [`${piece}#${read.name}`, `@${piece}`]
        : [`${read.file}#${read.name}`, RouteConstants.#relative(fileName, read.file)];
      const known = aliases.get(key);
      if (known) return known.alias;
      const alias = `__akanCnst${aliases.size}`;
      aliases.set(key, { alias, line: `import { ${read.name} as ${alias} } from ${JSON.stringify(specifier)};` });
      return alias;
    };
    const edits = use.reads.map((read): ConstantEdit => {
      if (read.kind === "member") return { start: read.start, end: read.end, text: aliasOf(read) };
      const fields = read.keys.map((key) => `${JSON.stringify(key.key)}: ${aliasOf(key)}`);
      return { start: read.start, end: read.end, text: `{ ${fields.join(", ")} }` };
    });
    for (const statement of sourceFile.statements)
      if (ts.isImportDeclaration(statement) && RouteConstants.isConstantImport(statement, fileName))
        edits.push(...RouteConstants.typedEdits(statement, sourceFile, (element) => element === "cnst"));
    return { edits, imports: [...aliases.values()].map(({ line }) => line), pieces };
  }

  static #relative(fileName: string, file: string) {
    const relative = path.posix.relative(path.posix.dirname(fileName), file);
    return relative.startsWith(".") ? relative : `./${relative}`;
  }

  //? Bun drops an import left only to types even under `verbatimModuleSyntax`; `import type` keeps that off the bundler.
  static typedEdits(
    statement: ts.ImportDeclaration,
    sourceFile: ts.SourceFile,
    isConstant: (imported: string) => boolean,
  ): ConstantEdit[] {
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) return [];
    const bindings = clause.namedBindings;
    const at = statement.getStart(sourceFile) + "import".length;
    if (!bindings || !ts.isNamedImports(bindings)) return clause.name ? [] : [{ start: at, end: at, text: " type" }];
    const constant = (element: ts.ImportSpecifier) =>
      !element.isTypeOnly && isConstant((element.propertyName ?? element.name).text);
    const targets = bindings.elements.filter(constant);
    if (!targets.length) return [];
    if (clause.name || bindings.elements.some((element) => !element.isTypeOnly && !constant(element)))
      return targets.map((element) => {
        const start = element.getStart(sourceFile);
        return { start, end: start, text: "type " };
      });
    const names = bindings.elements.map((element) => element.getText(sourceFile).replace(/^type\s+/, ""));
    const [start, end] = [statement.getStart(sourceFile), statement.end];
    const newlines = sourceFile.text.slice(start, end).split("\n").length - 1;
    const specifier = statement.moduleSpecifier.getText(sourceFile);
    return [{ start, end, text: `import type { ${names.join(", ")} } from ${specifier};${"\n".repeat(newlines)}` }];
  }
}
