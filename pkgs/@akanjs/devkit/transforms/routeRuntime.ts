import { readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { RuntimeImports } from "../quality/runtimeImports";
import { RuntimeNameTable } from "../quality/runtimeNameTable";
import { RuntimeScopeReport } from "../quality/runtimeScopeReport";
import { RuntimeUse, type RuntimeUseVerdict } from "../quality/runtimeUse";
import { ModelReference } from "./modelReference";

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
const assembled = { useClient: "_useClient", st: "_st" } as const;
//? The tab's one store: a scope's `lib/st.ts` exports this same object, and a key answers once its module has loaded.
const tabStore = '"akanjs/store"';

//* What a client module imports under `clientRuntime: "route"`: the page runtime's handles plus the pieces of the
//* modules it names, or the app's whole runtime assembled from the same pieces.
export class RouteRuntime {
  readonly #workspaceRoot: string;
  readonly #table: RuntimeNameTable;
  readonly #pieces: ReadonlySet<string>;

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

  constructor(workspaceRoot: string, table: RuntimeNameTable, pieces: ReadonlySet<string>) {
    this.#workspaceRoot = workspaceRoot;
    this.#table = table;
    this.#pieces = pieces;
  }

  get table() {
    return this.#table;
  }

  get #wholePieces() {
    return Object.values(assembled).map((file) => `${this.#table.scope}/lib/__client/${file}`);
  }

  //? Absolute paths: a framework file imports these too, and neither `akanjs` nor a consumer's node_modules maps `@apps/*`.
  #importOf(piece: string) {
    return `import ${JSON.stringify(`${path.join(this.#workspaceRoot, piece).split(path.sep).join("/")}.ts`)};`;
  }

  get wholeImports(): string[] {
    return this.#wholePieces.map((piece) => this.#importOf(piece));
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
      ? `${own}${this.#importOf(`${this.#table.scope}/lib/__client/${piece}`)}\n`
      : own;
  }

  transform(source: string, absPath: string): RouteRuntimeResult | null {
    const fileName = this.fileNameOf(absPath);
    const scopes = this.#table.layers.map(({ scope }) => scope);
    const reference = fileName ? ModelReference.sourceOf(source, fileName, scopes, this.#pieces) : null;
    if (reference) return { ...reference, perModule: true };
    if (!fileName || !RuntimeScopeReport.isRuntimeSource(fileName) || macroAttribute.test(source)) return null;
    const isStore = storeFile.test(fileName);
    if (!isStore && !RuntimeImports.mayUseRuntime(source, fileName)) return { source, perModule: true, pieces: [] };
    const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
    if ((sourceFile as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics.length) return null;
    const verdict = RuntimeUse.analyze({ fileName, text: source, sourceFile }, this.#table);
    const pieces = verdict.resolvable ? this.#piecesOf(fileName, verdict) : null;
    if (!pieces) {
      const whole = isStore ? this.#wholeBesides(fileName) : this.wholeImports;
      return { source: RouteRuntime.#apply(source, [this.#leading(sourceFile, whole)]), perModule: false, pieces: [] };
    }
    const edits = sourceFile.statements.flatMap((statement) => this.#importEdit(statement, sourceFile, fileName));
    const imports = pieces.map((piece) => `import ${JSON.stringify(`@${piece}`)};`);
    if (imports.length) edits.push(this.#leading(sourceFile, imports));
    return { source: RouteRuntime.#apply(source, edits), perModule: true, pieces };
  }

  //? The assembled store root imports every store file: imported from one, it runs before that file's class exists.
  #wholeBesides(fileName: string): string[] {
    const [, , ownModule] = fileName.match(storeFile) ?? [];
    const others = [...this.#pieces].filter(
      (piece) => /\/lib\/__client\/[^/_][^/]*\.st$/.test(piece) && !piece.endsWith(`/${ownModule}.st`),
    );
    return [`${this.#table.scope}/lib/__client/${assembled.useClient}`, ...others].map((piece) =>
      this.#importOf(piece),
    );
  }

  #piecesOf(fileName: string, verdict: RuntimeUseVerdict & { resolvable: true }): string[] | null {
    const [, ownScope, ownModule] = fileName.match(storeFile) ?? [];
    const descriptors = new Set<string>();
    const stores = new Set<string>();
    const descriptorOf = (scope: string, module: string) =>
      [this.#table.scope, scope]
        .map((holder) => `${holder}/lib/__client/${module}.fetch`)
        .find((piece) => this.#pieces.has(piece));
    if (verdict.baseDescriptor) descriptors.add(`${this.#table.scope}/lib/__client/_base.fetch`);
    const own =
      ownScope && ownModule
        ? [...this.#table.dependenciesOf(ownScope, ownModule), { scope: ownScope, module: ownModule }]
        : [];
    for (const { scope, module } of own) {
      const descriptor = descriptorOf(scope, module);
      if (descriptor) descriptors.add(descriptor);
    }
    for (const { scope, module, needs } of verdict.owners) {
      const descriptor = descriptorOf(scope, module);
      if (descriptor) descriptors.add(descriptor);
      else if (needs === "descriptor") return null;
      //? A lib store an app extends reads names the app's store owns, and the app's store piece imports the lib's.
      if (needs !== "store" || module === ownModule) continue;
      const store = `${scope}/lib/__client/${module}.st`;
      if (!this.#pieces.has(store)) return null;
      stores.add(store);
    }
    return [...descriptors, ...stores];
  }

  #importEdit(statement: ts.Statement, sourceFile: ts.SourceFile, fileName: string): TextEdit[] {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
    const clause = statement.importClause;
    const target = RuntimeImports.targetOf(statement.moduleSpecifier.text, fileName);
    if (!target?.scope || !clause || clause.isTypeOnly) return [];
    const pageRuntime = JSON.stringify(`@${target.scope}/lib/usePage`);
    const specifier = statement.moduleSpecifier;
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
