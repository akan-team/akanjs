import path from "node:path";
import ts from "typescript";
import { RuntimeScopeReport } from "../quality/runtimeScopeReport";
import { RuntimeUse } from "../quality/runtimeUse";
import type { RouteRuntime } from "../transforms/routeRuntime";

export interface RouteHandoffRead {
  referenceFiles: string[];
  unread: { file: string; why: string } | null;
}

interface FileRead {
  models: string[];
  unread: string | null;
}

const capitalize = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);
const serverFetchSource =
  /^(?:@(?:apps|libs)\/[^/]+\/(?:server|lib\/(?:sig|useServer))|\.{1,2}\/(?:.+\/)?(?:server|sig|useServer))$/;
const generatedFile = /^(?:apps|libs)\/[^/]+\/(?:(?:server|client)\.ts$|lib\/[^/]+\.ts$|lib\/__client\/)/;
const handoffName = /\b(?:init|view|edit)[A-Z]|\bget[A-Z]\w*(?:Init|View|Edit)\b|\bslice\b/;
const handoffMember = /^(?:(?:init|view|edit)[A-Z]|get[A-Z]\w*(?:Init|View|Edit)$|slice$)/;

//? Only `fetch.init<Model>`, `view<Model>`, `edit<Model>`, their `get` forms and `fetch.slice` build a handoff object.
export class RouteHandoffs {
  readonly #workspaceRoot: string;
  readonly #runtime: RouteRuntime;
  readonly #references: Map<string, string>;
  readonly #files = new Map<string, Promise<FileRead>>();

  constructor(workspaceRoot: string, runtime: RouteRuntime, references: Map<string, string>) {
    this.#workspaceRoot = workspaceRoot;
    this.#runtime = runtime;
    this.#references = references;
  }

  async read(serverModules: string[]): Promise<RouteHandoffRead> {
    const models = new Set<string>();
    for (const file of serverModules) {
      const read = await this.#fileOf(file);
      if (read.unread)
        return {
          referenceFiles: [...this.#references.values()].sort(),
          unread: { file: path.relative(this.#workspaceRoot, file).split(path.sep).join("/"), why: read.unread },
        };
      for (const model of read.models) models.add(model);
    }
    return { referenceFiles: [...models].flatMap((model) => this.#references.get(model) ?? []).sort(), unread: null };
  }

  #fileOf(absPath: string): Promise<FileRead> {
    const known = this.#files.get(absPath);
    if (known) return known;
    const read = (async (): Promise<FileRead> => {
      const fileName = this.#runtime.fileNameOf(absPath);
      if (!fileName || generatedFile.test(fileName)) return { models: [], unread: null };
      const text = await Bun.file(absPath).text();
      const serverFetchLine = RouteHandoffs.#serverFetchLineOf(fileName, text);
      if (serverFetchLine)
        return {
          models: [],
          unread: `line ${serverFetchLine}: \`fetch\` comes from the server barrel, where the names read from it are not checked; take it from the client barrel`,
        };
      if (!RuntimeScopeReport.isRuntimeSource(fileName)) return { models: [], unread: null };
      const verdict = RuntimeUse.analyze({ fileName, text }, this.#runtime.table);
      if (!verdict.resolvable) return { models: [], unread: `line ${verdict.line}: ${verdict.message}` };
      const named = verdict.owners.map(({ module }) => module).filter((module) => this.#references.has(module));
      //? Every name of a readable file is written out in it, so a model none of these names can hand nothing over.
      const anySlice = /slice/i.test(text);
      const hands = (module: string) => new RegExp(`(?:init|view|edit|get)${capitalize(module)}`).test(text);
      return { models: named.filter((module) => anySlice || hands(module)), unread: null };
    })();
    this.#files.set(absPath, read);
    return read;
  }

  //? The server barrel's `fetch` hands the same references over, and the analysis reads only a client barrel's.
  static #serverFetchLineOf(fileName: string, text: string): number | null {
    if (!text.includes("fetch") || !handoffName.test(text)) return null;
    const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly || !serverFetchSource.test(statement.moduleSpecifier.text)) continue;
      const bindings = clause.namedBindings;
      if (!bindings) continue;
      const line = source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1;
      if (ts.isNamespaceImport(bindings)) return line;
      const taken = bindings.elements.find((el) => !el.isTypeOnly && (el.propertyName ?? el.name).text === "fetch");
      if (taken && RouteHandoffs.#handsOver(source, taken.name.text)) return line;
    }
    return null;
  }

  //? Text alone took `ips.slice(0, 1)` in a service that calls an endpoint for a slice handed over, on every route.
  static #handsOver(source: ts.SourceFile, local: string): boolean {
    const visit = (node: ts.Node): boolean => {
      if (ts.isImportDeclaration(node)) return false;
      if (ts.isIdentifier(node) && node.text === local) {
        const { parent } = node;
        const named =
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) &&
            parent.name === node);
        if (named) return false;
        if (ts.isPropertyAccessExpression(parent) && parent.expression === node)
          return handoffMember.test(parent.name.text);
        return true;
      }
      return ts.forEachChild(node, visit) ?? false;
    };
    return visit(source);
  }
}
