import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { RuntimeImports } from "../quality/runtimeImports";
import { RuntimeNameTable } from "../quality/runtimeNameTable";
import { RuntimeScopeReport } from "../quality/runtimeScopeReport";
import { RuntimeUse, type RuntimeUseVerdict } from "../quality/runtimeUse";

export interface RouteRuntimeResult {
  source: string;
  perModule: boolean;
  //? Workspace paths without an extension.
  pieces: string[];
}

interface TextEdit {
  start: number;
  end: number;
  text: string;
}

const handleNames = new Set(["fetch", "sig", "st"]);
const macroAttribute = /with\s*\{\s*type\s*:\s*["']macro["']\s*\}/;
const storeFile = /^((?:apps|libs)\/[^/]+)\/lib\/_?[^/]+\/([^/]+)\.store\.ts$/;
const wholeFile = /^((?:apps|libs)\/[^/]+)\/lib\/(useClient|st)\.ts$/;
const storePiece = /^((?:apps|libs)\/[^/]+)\/lib\/__client\/([^/_][^/]*)\.st$/;
const assembled = { useClient: "_useClient", st: "_st" } as const;
//? The tab's one store: a scope's `lib/st.ts` exports this same object, and a key answers once its module has loaded.
const tabStore = '"akanjs/store"';

//* What a client module imports under `clientRuntime: "route"`: the page runtime's handles plus the pieces of the
//* modules it names, or the app's whole runtime assembled from the same pieces. Each piece is imported by a name the
//* module passes to `loadedAfter`, never for its side effect alone, so the piece's chunk loads before the module's.
export class RouteRuntime {
  readonly #workspaceRoot: string;
  readonly #table: RuntimeNameTable;
  readonly #pieces: ReadonlySet<string>;
  readonly #read: (absPath: string) => string | null;
  readonly #storeNeeds = new Map<string, string[] | null>();

  static async read(workspaceRoot: string, appScope: string): Promise<RouteRuntime | null> {
    const table = await RuntimeNameTable.read(workspaceRoot, appScope);
    if (!table) return null;
    const pieces = await Promise.all(
      table.layers.map(async ({ scope }) => {
        const files = await readdir(path.join(workspaceRoot, scope, "lib/__client")).catch(() => []);
        return files.filter((file) => file.endsWith(".ts")).map((file) => `${scope}/lib/__client/${file.slice(0, -3)}`);
      }),
    );
    const runtime = new RouteRuntime(workspaceRoot, table, new Set(pieces.flat()));
    return runtime.#wholePieces.every((piece) => runtime.#pieces.has(piece)) ? runtime : null;
  }

  constructor(
    workspaceRoot: string,
    table: RuntimeNameTable,
    pieces: ReadonlySet<string>,
    read: (absPath: string) => string | null = RouteRuntime.#readFile,
  ) {
    this.#workspaceRoot = workspaceRoot;
    this.#table = table;
    this.#pieces = pieces;
    this.#read = read;
  }

  static #readFile(absPath: string) {
    try {
      return readFileSync(absPath, "utf8");
    } catch {
      return null;
    }
  }

  get table() {
    return this.#table;
  }

  get #wholePieces() {
    return Object.values(assembled).map((file) => `${this.#table.scope}/lib/__client/${file}`);
  }

  //? Absolute paths: a framework file imports these too, and neither `akanjs` nor a consumer's node_modules maps `@apps/*`.
  #absoluteOf(piece: string) {
    return `${path.join(this.#workspaceRoot, piece).split(path.sep).join("/")}.ts`;
  }

  static #exportOf(piece: string) {
    const name = piece.slice(piece.lastIndexOf("/") + 1);
    if (name === assembled.st) return "st";
    if (name === assembled.useClient) return "sig";
    return name.endsWith(".st") ? name.slice(0, -".st".length) : "loaded";
  }

  #after(pieces: string[], specifierOf: (piece: string) => string): string[] {
    if (!pieces.length) return [];
    const names = pieces.map((_, index) => `__akanLoaded${index}`);
    return [
      'import { loadedAfter as __akanLoadedAfter } from "akanjs/base";',
      ...pieces.map(
        (piece, index) =>
          `import { ${RouteRuntime.#exportOf(piece)} as ${names[index]} } from ${JSON.stringify(specifierOf(piece))};`,
      ),
      `__akanLoadedAfter(${names.join(", ")});`,
    ];
  }

  get wholeImports(): string[] {
    return this.#after(this.#wholePieces, (piece) => this.#absoluteOf(piece));
  }

  get wholeSource() {
    return `${this.wholeImports.join("\n")}\n`;
  }

  fileNameOf(absPath: string): string | null {
    const relative = path.relative(this.#workspaceRoot, absPath).split(path.sep).join("/");
    return /^(?:apps|libs)\//.test(relative) ? relative : null;
  }

  //? A scope's `lib/useClient.ts` holds every descriptor in one macro call: answered from the pieces, none ships twice.
  redirectOf(absPath: string): string | null {
    const [, scope, file] = this.fileNameOf(absPath)?.match(wholeFile) ?? [];
    if (!scope || !file) return null;
    const piece = assembled[file as keyof typeof assembled];
    if (!this.#pieces.has(`${scope}/lib/__client/${piece}`)) return null;
    const own = `export * from "./__client/${piece}";\n`;
    //? A lib's store root built after an app store's piece puts the lib's actions back over the app's, so the app's root follows it.
    return file === "st" && scope !== this.#table.scope
      ? `${own}import ${JSON.stringify(this.#absoluteOf(`${this.#table.scope}/lib/__client/${piece}`))};\n`
      : own;
  }

  transform(source: string, absPath: string): RouteRuntimeResult | null {
    const fileName = this.fileNameOf(absPath);
    if (!fileName || !RuntimeScopeReport.isRuntimeSource(fileName) || macroAttribute.test(source)) return null;
    const [, storeScope, storeModule] = fileName.match(storeFile) ?? [];
    if (!storeModule && !RuntimeImports.mayUseRuntime(source, fileName)) return { source, perModule: true, pieces: [] };
    const sourceFile = RouteRuntime.#parse(fileName, source);
    if (!sourceFile) return null;
    const verdict = RuntimeUse.analyze({ fileName, text: source, sourceFile }, this.#table);
    const aliasOf = (piece: string) => `@${piece}`;
    if (storeScope && storeModule) {
      const pieces = this.#descriptorsOf(verdict, { scope: storeScope, module: storeModule }) ?? [];
      const edits = sourceFile.statements.flatMap((statement) =>
        this.#importEdit(statement, sourceFile, fileName, !verdict.resolvable),
      );
      if (pieces.length) edits.push(this.#leading(sourceFile, this.#after(pieces, aliasOf)));
      return { source: RouteRuntime.#apply(source, edits), perModule: true, pieces };
    }
    const pieces = this.#piecesOf(verdict);
    if (!pieces) {
      const edit = this.#leading(sourceFile, this.wholeImports);
      return { source: RouteRuntime.#apply(source, [edit]), perModule: false, pieces: [] };
    }
    const edits = sourceFile.statements.flatMap((statement) => this.#importEdit(statement, sourceFile, fileName));
    if (pieces.length) edits.push(this.#leading(sourceFile, this.#after(pieces, aliasOf)));
    return { source: RouteRuntime.#apply(source, edits), perModule: true, pieces };
  }

  static #parse(fileName: string, source: string): ts.SourceFile | null {
    const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
    return (sourceFile as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics.length ? null : sourceFile;
  }

  #descriptorOf(scope: string, module: string) {
    return [this.#table.scope, scope]
      .map((holder) => `${holder}/lib/__client/${module}.fetch`)
      .find((piece) => this.#pieces.has(piece));
  }

  //? Null where a descriptor the file names has no piece: only the whole runtime answers it then.
  #descriptorsOf(verdict: RuntimeUseVerdict, store?: { scope: string; module: string }): string[] | null {
    const descriptors = new Set<string>();
    if (verdict.resolvable && verdict.baseDescriptor) descriptors.add(`${this.#table.scope}/lib/__client/_base.fetch`);
    const own = store ? [...this.#table.dependenciesOf(store.scope, store.module), store] : [];
    for (const { scope, module } of own) {
      const descriptor = this.#descriptorOf(scope, module);
      if (descriptor) descriptors.add(descriptor);
    }
    for (const { scope, module, needs } of verdict.resolvable ? verdict.owners : []) {
      const descriptor = this.#descriptorOf(scope, module);
      if (descriptor) descriptors.add(descriptor);
      else if (needs === "descriptor" && !store) return null;
    }
    return [...descriptors];
  }

  //? A store file imports no store piece: the piece of a store it names imports that store's file, which may name
  //? this one back. What its actions reach when they run is loaded by each file naming this store instead.
  #piecesOf(verdict: RuntimeUseVerdict): string[] | null {
    if (!verdict.resolvable) return null;
    const descriptors = this.#descriptorsOf(verdict);
    if (!descriptors) return null;
    const stores = new Set<string>();
    for (const { scope, module, needs } of verdict.owners) {
      if (needs !== "store") continue;
      const store = `${scope}/lib/__client/${module}.st`;
      if (!this.#pieces.has(store) || !this.#reaches(store, stores)) return null;
    }
    return [...descriptors, ...stores];
  }

  //? False where a store reached from this one picks a name at run time, so only the whole runtime answers it.
  #reaches(store: string, reached: Set<string>): boolean {
    if (reached.has(store)) return true;
    reached.add(store);
    const [, , module] = store.match(storePiece) ?? [];
    if (!module) return true;
    return this.#table.layers
      .filter(({ scope }) => this.#pieces.has(`${scope}/lib/__client/${module}.st`))
      .every(({ scope }) => {
        const needs = this.#needsOf(scope, module);
        return !!needs && needs.every((need) => this.#reaches(need, reached));
      });
  }

  //? What a file naming a store loads besides the pieces of the names it writes: a save of a store file can change it.
  get storeNeeds(): Record<string, string[] | null> {
    const needs: Record<string, string[] | null> = {};
    for (const piece of [...this.#pieces].sort()) {
      const [, scope, module] = piece.match(storePiece) ?? [];
      if (scope && module) needs[piece] = this.#needsOf(scope, module);
    }
    return needs;
  }

  //? The store pieces a store file's own code names: null where they cannot be told.
  #needsOf(scope: string, module: string): string[] | null {
    const key = `${scope}/${module}`;
    const known = this.#storeNeeds.get(key);
    if (known !== undefined) return known;
    const needs = this.#readNeeds(scope, module);
    this.#storeNeeds.set(key, needs);
    return needs;
  }

  #readNeeds(scope: string, module: string): string[] | null {
    const files = [module, `_${module}`].map((dir) => `${scope}/lib/${dir}/${module}.store.ts`);
    const read = files.flatMap((fileName) => {
      const text = this.#read(path.join(this.#workspaceRoot, fileName));
      return text === null ? [] : [{ fileName, text }];
    });
    const [file] = read;
    if (!file) return [];
    const sourceFile = macroAttribute.test(file.text) ? null : RouteRuntime.#parse(file.fileName, file.text);
    if (!sourceFile) return null;
    const verdict = RuntimeUse.analyze({ ...file, sourceFile }, this.#table);
    if (!verdict.resolvable) return null;
    const stores: string[] = [];
    for (const owner of verdict.owners) {
      if (owner.needs === "descriptor" && !this.#descriptorOf(owner.scope, owner.module)) return null;
      if (owner.needs !== "store" || owner.module === module) continue;
      const store = `${owner.scope}/lib/__client/${owner.module}.st`;
      if (!this.#pieces.has(store)) return null;
      stores.push(store);
    }
    return stores;
  }

  //? `handlesOnly`: in a file whose names cannot be told, an import is repointed only where it takes nothing but handles.
  #importEdit(statement: ts.Statement, sourceFile: ts.SourceFile, fileName: string, handlesOnly = false): TextEdit[] {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
    const clause = statement.importClause;
    const target = RuntimeImports.targetOf(statement.moduleSpecifier.text, fileName);
    if (!target?.scope || !clause || clause.isTypeOnly) return [];
    const pageRuntime = JSON.stringify(`@${target.scope}/lib/usePage`);
    const specifier = statement.moduleSpecifier;
    const named = !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings);
    const onlyStore =
      named &&
      (clause.namedBindings as ts.NamedImports).elements.every(
        (element) => element.isTypeOnly || (element.propertyName ?? element.name).text === "st",
      );
    if (handlesOnly && ((target.kind === "st" && !onlyStore) || (target.kind === "useClient" && !named))) return [];
    if (target.kind === "useClient" || target.kind === "st")
      return [
        {
          start: specifier.getStart(sourceFile),
          end: specifier.end,
          text: target.kind === "st" ? tabStore : pageRuntime,
        },
      ];
    if (target.kind !== "client" || clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings))
      return [];
    const { elements } = clause.namedBindings;
    const handleOf = (element: ts.ImportSpecifier) =>
      element.isTypeOnly ? "" : (element.propertyName ?? element.name).text;
    const isHandle = (element: ts.ImportSpecifier) => handleNames.has(handleOf(element));
    const [handles, rest] = [elements.filter(isHandle), elements.filter((element) => !isHandle(element))];
    if (!handles.length) return [];
    const namesOf = (list: ts.ImportSpecifier[]) => list.map((element) => element.getText(sourceFile)).join(", ");
    const typesOnly = rest.every((element) => element.isTypeOnly);
    const restNames = typesOnly
      ? rest.map((element) => element.getText(sourceFile).replace(/^type\s+/, "")).join(", ")
      : namesOf(rest);
    const [stores, descriptors] = [
      handles.filter((element) => handleOf(element) === "st"),
      handles.filter((element) => handleOf(element) !== "st"),
    ];
    const lines = [
      ...(descriptors.length ? [`import { ${namesOf(descriptors)} } from ${pageRuntime};`] : []),
      ...(stores.length ? [`import { ${namesOf(stores)} } from ${tabStore};`] : []),
      ...(rest.length
        ? [`import ${typesOnly ? "type " : ""}{ ${restNames} } from ${specifier.getText(sourceFile)};`]
        : []),
    ];
    const [start, end] = [statement.getStart(sourceFile), statement.end];
    const newlines = sourceFile.text.slice(start, end).split("\n").length - 1;
    return [{ start, end, text: `${lines.join(" ")}${"\n".repeat(newlines)}` }];
  }

  //? After the directives, on the first statement's own line: `"use client"` stays first and no line moves.
  #leading(sourceFile: ts.SourceFile, imports: string[]): TextEdit {
    const first = sourceFile.statements.find(
      (statement) => !ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression),
    );
    const at = first ? first.getStart(sourceFile) : sourceFile.text.length;
    return { start: at, end: at, text: `${imports.join(" ")} ` };
  }

  static #apply(source: string, edits: TextEdit[]) {
    return [...edits]
      .sort((a, b) => b.start - a.start || b.end - a.end)
      .reduce(
        (text, { start, end, text: replacement }) => text.slice(0, start) + replacement + text.slice(end),
        source,
      );
  }
}
