import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { StoreBootstrap } from "../artifact/storeBootstrap";
import { RuntimeConstantGraph } from "../quality/runtimeConstantGraph";
import { RuntimeImports } from "../quality/runtimeImports";
import { RuntimeNameTable } from "../quality/runtimeNameTable";
import { RuntimeScopeReport } from "../quality/runtimeScopeReport";
import { RuntimeUse, type RuntimeUseVerdict } from "../quality/runtimeUse";
import { ModelReference } from "./modelReference";
import { type ConstantRewrite, RouteConstants } from "./routeConstants";
import { RouteRuntimeEdits, type RouteRuntimeTextEdit } from "./routeRuntimeEdits";
import { type RouteRuntimeBundle, RouteRuntimeGraph } from "./routeRuntimeGraph";
import { type RouteRuntimeKeep, RouteRuntimePlan, type RouteRuntimeWhy } from "./routeRuntimePlan";

export interface RouteRuntimeResult {
  source: string;
  perModule: boolean;
  //? Workspace paths without an extension.
  pieces: string[];
  wholeConstants?: boolean;
}

interface Planned {
  graph: RouteRuntimeGraph;
  //? Every file a store file imports, itself included: it loads no store piece, which would import that store back.
  storeSide: Set<string>;
  //? The files a page loading pieces reaches. Every other file the bundle holds keeps the whole runtime as written.
  routed: Set<string>;
  //? Null where no route was told: every page then registers only the models it names.
  narrow: NarrowPieces | null;
}

//? What a page loading no whole runtime reaches. The whole runtime takes these from their pieces, and answers the rest.
interface NarrowPieces {
  //? Workspace paths without an extension.
  pieces: Set<string>;
  constantFiles: Set<string>;
}

const macroAttribute = /with\s*\{\s*type\s*:\s*["']macro["']\s*\}/;
const storeFile = /^((?:apps|libs)\/[^/]+)\/lib\/_?[^/]+\/([^/]+)\.store\.ts$/;
const wholeFile = /^((?:apps|libs)\/[^/]+)\/lib\/(useClient|st)\.ts$/;
//? A model's reference file is not one: it is an entry the plan narrows like a page's own client file.
const runtimeFile =
  /^(?:apps|libs)\/[^/]+\/lib\/(?:(?:useClient|st|usePage)\.ts|__client\/(?![^/]+\.ref\.ts$)[^/]+\.ts)$/;
const storePiece = /^((?:apps|libs)\/[^/]+)\/lib\/__client\/([^/_][^/]*)\.st$/;
const constantPieceFile = /^(?:apps|libs)\/[^/]+\/lib\/__client\/([^/_][^/]*)\.cnst\.ts$/;
const constantsFile = /^((?:apps|libs)\/[^/]+)\/lib\/cnst\.ts$/;
const registration = /^export const (\w+) = ConstantRegistry\.build(?:Model|Scalar)\(.*$/gm;
const pieceImport = /\bfrom\s+"((?:\.|@(?:apps|libs)\/)[^"]+)"/g;
const assembled = { useClient: "_useClient", st: "_st" } as const;
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const exportOf = (piece: string) => {
  const name = piece.slice(piece.lastIndexOf("/") + 1);
  if (name === assembled.st) return "st";
  if (name === assembled.useClient) return "sig";
  if (name === "cnst") return "*";
  if (name.endsWith(".cnst")) return name.slice(0, -".cnst".length);
  return name.endsWith(".st") ? name.slice(0, -".st".length) : "loaded";
};

const saidOf = (why: RouteRuntimeWhy | undefined) =>
  why ? `${why.file}${why.line ? `:${why.line}` : ""} ${why.message}` : "a file it imports is left as written";

const parsed = (fileName: string, source: string): ts.SourceFile | null => {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  return (sourceFile as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics.length ? null : sourceFile;
};

//* What a client module imports where pages load per module: the page runtime's handles plus the pieces of the
//* modules it names, or the app's whole runtime assembled from the same pieces. Each piece is imported by a name the
//* module passes to `loadedAfter`, never for its side effect alone, so the piece's chunk loads before the module's.
export class RouteRuntime {
  readonly #workspaceRoot: string;
  readonly #table: RuntimeNameTable;
  readonly #pieces: ReadonlySet<string>;
  readonly #read: (absPath: string) => string | null;
  readonly #constants: RouteConstants;
  readonly #storeNeeds = new Map<string, string[] | null>();
  readonly #ownNeeds = new Map<string, string[] | null>();
  readonly #sideNeeds = new Map<string, string[] | null>();
  readonly #routes = new Map<string, { source: string; result: RouteRuntimeResult | null }>();
  readonly #wholeReaders = new Map<string, RouteRuntimeWhy | null>();
  readonly #why = {
    whole: new Map<string, RouteRuntimeWhy>(),
    needs: new Map<string, RouteRuntimeWhy>(),
    side: new Map<string, RouteRuntimeWhy>(),
    store: new Map<string, RouteRuntimeWhy>(),
  };
  #planned: Planned | null = null;
  #decided: RouteRuntimePlan | null = null;

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
    const graph = new RuntimeConstantGraph(table, (file) => read(path.join(workspaceRoot, file)));
    this.#constants = new RouteConstants(graph, pieces);
  }

  static #unsynced(scope: string, module: string) {
    const synced = /^(?:apps|libs)\//.test(scope) ? `akan sync ${path.basename(scope)}` : "akan sync";
    return `names ${module}, which has no generated piece: run \`${synced}\``;
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

  #after(pieces: string[], specifierOf: (piece: string) => string): string[] {
    if (!pieces.length) return [];
    const names = pieces.map((_, index) => `__akanLoaded${index}`);
    return [
      'import { loadedAfter as __akanLoadedAfter } from "akanjs/base";',
      ...pieces.map((piece, index) => {
        const name = exportOf(piece);
        const binding = name === "*" ? `* as ${names[index]}` : `{ ${name} as ${names[index]} }`;
        return `import ${binding} from ${JSON.stringify(specifierOf(piece))};`;
      }),
      `__akanLoadedAfter(${names.join(", ")});`,
    ];
  }

  //? A piece registers only the models a page names; the whole runtime also registers every one a registry walker lists.
  get wholeImports(): string[] {
    return this.#after([`${this.#table.scope}/lib/cnst`, ...this.#wholePieces], (piece) => this.#absoluteOf(piece));
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
    if (this.#planned) return null;
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

  //* Over a bundle whose every entry loads the whole runtime: the entries that keep it, whose files stay as written.
  plan({ importsByModule, entries, entriesByRoute }: RouteRuntimeBundle): Set<string> {
    const graph = new RouteRuntimeGraph(importsByModule, (absPath) => runtimeFile.test(this.fileNameOf(absPath) ?? ""));
    const stores = graph.modules.filter((module) => storeFile.test(this.fileNameOf(module) ?? ""));
    const storeSide = graph.closureOf(stores);
    const planned: Planned = { graph, storeSide, routed: new Set(), narrow: null };
    this.#planned = planned;
    for (const memo of [this.#storeNeeds, this.#ownNeeds, this.#sideNeeds, this.#routes, this.#wholeReaders])
      memo.clear();
    for (const memo of Object.values(this.#why)) memo.clear();
    const decided = new RouteRuntimePlan({
      graph,
      entries: new Set(entries),
      routes: entriesByRoute ?? null,
      readsWhole: (file) => this.#readsWhole(file, planned),
      storeSide: (root) => this.#storeSideWhy(root, planned),
      bringsPieces: (file) =>
        !!this.#routeOf(file)?.pieces.some((piece) => !piece.endsWith("/_base.fetch") && !piece.endsWith(".cnst")),
      nameOf: (file) => this.#nameOf(file),
    });
    this.#decided = decided;
    return this.#settled(planned, decided);
  }

  keep(entries: Iterable<string>, why: RouteRuntimeKeep): Set<string> {
    if (!this.#planned || !this.#decided) return new Set();
    this.#decided.keep(entries, why);
    return this.#settled(this.#planned, this.#decided);
  }

  keepAll(): Set<string> {
    return this.keep(this.#decided?.roots ?? [], { rule: "reference" });
  }

  #settled(planned: Planned, decided: RouteRuntimePlan): Set<string> {
    const { graph } = planned;
    const keeps = new Set(decided.keeps.keys());
    const routed = graph.closureOf(decided.roots.filter((root) => !keeps.has(root)));
    //? A set yields what is added while it is walked: a store reached through its piece brings the files it imports.
    for (const file of routed)
      for (const piece of this.#routeOf(file)?.pieces ?? []) {
        const [, , module] = piece.match(storePiece) ?? [];
        if (module) graph.closureOf(this.#storeFilesOf(module, graph), routed);
      }
    planned.routed = routed;
    planned.narrow = decided.told ? this.#narrowOf(keeps, [...decided.routes.values()], graph) : null;
    return keeps;
  }

  //? A model a page registers itself pays only on a page loading no whole runtime. Anywhere else its piece answers
  //? from `lib/cnst.ts`, which keeps every constant in the one chunk the whole runtime has them in.
  #narrowOf(keeps: Set<string>, routes: (readonly string[])[], graph: RouteRuntimeGraph): NarrowPieces {
    const narrow: NarrowPieces = { pieces: new Set(), constantFiles: new Set() };
    const files = new Set<string>();
    const visit = (file: string) => {
      const name = this.fileNameOf(file) ?? "";
      if (!runtimeFile.test(name) && !constantsFile.test(name)) files.add(file);
    };
    const reach = (first: string) => {
      const queue = [first];
      for (const piece of queue) {
        if (narrow.pieces.has(piece) || !this.#pieces.has(piece)) continue;
        narrow.pieces.add(piece);
        for (const target of this.#pieceImportsOf(piece))
          if (this.#pieces.has(target)) queue.push(target);
          else visit(path.join(this.#workspaceRoot, `${target}.ts`));
      }
    };
    for (const route of routes) if (!route.some((entry) => keeps.has(entry))) route.forEach(visit);
    //? The entry of a page loading pieces imports the framework's own descriptors before any file of the page.
    if (files.size) reach(`${this.#table.scope}/lib/${StoreBootstrap.baseDescriptors}`);
    for (const file of files) {
      for (const imported of graph.importsOf(file)) visit(imported);
      for (const lazy of graph.lazyImportsOf(file)) if (!keeps.has(lazy)) visit(lazy);
      if (RuntimeScopeReport.isConstantFile(this.fileNameOf(file) ?? "")) narrow.constantFiles.add(file);
      for (const piece of this.#routeOf(file)?.pieces ?? []) reach(piece);
    }
    return narrow;
  }

  #pieceImportsOf(piece: string): string[] {
    const scope = piece.split("/").slice(0, 2).join("/");
    const source = this.#read(this.#absoluteOf(piece)) ?? "";
    return [...source.matchAll(pieceImport)].map(([, specifier = ""]) =>
      specifier.startsWith(".") ? path.posix.join(`${scope}/lib/__client`, specifier) : specifier.slice(1),
    );
  }

  get decided(): RouteRuntimePlan | null {
    return this.#decided;
  }

  //? A scope's `lib/useClient.ts` holds every module's descriptors in one macro call, and so would hold again what a
  //? piece on the same page holds: the absolute paths of the pieces it takes them from instead, or null to stay as written.
  takenFromPieces(absPath: string): string[] | null {
    const [, scope, file] = this.fileNameOf(absPath)?.match(wholeFile) ?? [];
    const narrow = this.#planned?.narrow;
    if (!scope || file !== "useClient" || !narrow) return null;
    const pieces = [...narrow.pieces]
      .filter((piece) => piece.startsWith(`${scope}/lib/__client/`) && piece.endsWith(".fetch"))
      .sort(byCodeUnit);
    return pieces.length ? pieces.map((piece) => this.#absoluteOf(piece)) : null;
  }

  //? The files the last plan found to need every module, which a page built to load pieces must not reach.
  get wholeReaders(): Set<string> {
    return new Set([...this.#wholeReaders].filter(([, why]) => why).map(([file]) => file));
  }

  //? The files transformed since the last plan that keep every constant: each `akan quality runtime` names, and each
  //? registration piece no page loading pieces reaches.
  get wholeConstantReaders(): Set<string> {
    return new Set([...this.#routes].filter(([, { result }]) => result?.wholeConstants).map(([file]) => file));
  }

  #storeFilesOf(module: string, graph: RouteRuntimeGraph): string[] {
    return this.#table.layers
      .flatMap(({ scope }) =>
        [module, `_${module}`].map((dir) => path.join(this.#workspaceRoot, scope, "lib", dir, `${module}.store.ts`)),
      )
      .filter((file) => graph.has(file));
  }

  #nameOf(absPath: string) {
    if (StoreBootstrap.modelRuntimeFilter.test(absPath)) return "akanjs/ui/modelRuntime.ts";
    const inPackage = absPath.match(/[\\/](?:node_modules|pkgs)[\\/](akanjs[\\/].+)$/)?.[1];
    return this.fileNameOf(absPath) ?? inPackage?.split(path.sep).join("/") ?? absPath;
  }

  #storeSideWhy(root: string, planned: Planned): string | null {
    if (!planned.storeSide.has(root)) return null;
    const needs = this.#sideNeedsOf(root, planned);
    if (needs?.length === 0) return null;
    const names = needs?.map((need) => need.slice(need.lastIndexOf("/") + 1, -".st".length)).join(", ");
    return needs
      ? `a store file imports it and its code names the store of ${names}, which no importer can load first for an entry`
      : `a store file imports it and the stores its code names cannot be told (${saidOf(this.#why.side.get(root))})`;
  }

  #readsWhole(absPath: string, planned: Planned): RouteRuntimeWhy | null {
    const known = this.#wholeReaders.get(absPath);
    if (known !== undefined) return known;
    const reads = this.#readsWholeNow(absPath, planned);
    this.#wholeReaders.set(absPath, reads);
    return reads;
  }

  #readsWholeNow(absPath: string, planned: Planned): RouteRuntimeWhy | null {
    const file = this.#nameOf(absPath);
    if (StoreBootstrap.modelRuntimeFilter.test(absPath))
      return { file, message: "is what a framework component reading models by name imports" };
    const routed = this.#routeOf(absPath);
    if (routed)
      return routed.perModule
        ? null
        : (this.#why.whole.get(absPath) ?? { file, message: "names a module only the whole runtime answers" });
    //? A file left as written (a macro host, a generated barrel, one outside the scopes) loads only what it imports.
    const whole = planned.graph.importsOf(absPath).find((imported) => wholeFile.test(this.fileNameOf(imported) ?? ""));
    if (whole)
      return { file, message: `is left as written and imports ${this.#nameOf(whole)}, the runtime of every module` };
    if (planned.storeSide.has(absPath)) return null;
    const side = planned.graph
      .importsOf(absPath)
      .find((imported) => planned.storeSide.has(imported) && this.#sideNeedsOf(imported, planned)?.length !== 0);
    return side
      ? {
          file,
          message: `is left as written and imports ${this.#nameOf(side)}, whose code names stores this file cannot load first`,
        }
      : null;
  }

  #routeOf(absPath: string): RouteRuntimeResult | null {
    const source = this.fileNameOf(absPath) ? this.#read(absPath) : null;
    return source === null ? null : this.#route(source, absPath);
  }

  //? A constant file is reached through a registration piece the planning bundle never holds, so the plan tells it apart.
  transform(source: string, absPath: string): RouteRuntimeResult | null {
    const key = path.resolve(absPath);
    const fileName = this.fileNameOf(key) ?? "";
    const narrow = this.#planned?.narrow;
    const [, model] = fileName.match(constantPieceFile) ?? [];
    if (narrow && model) {
      if (narrow.pieces.has(fileName.slice(0, -".ts".length))) return null;
      //? A lib's `lib/cnst.ts` alone would split the app's: the bundler groups modules by the entries reaching them.
      const appConstants = fileName.startsWith(`${this.#table.scope}/`)
        ? '"../cnst"'
        : JSON.stringify(this.#absoluteOf(`${this.#table.scope}/lib/cnst`));
      //? Every answering piece hands out the same `loaded`: a piece importing several takes one name from that chunk.
      const result = {
        source: `export { ${model} } from "../cnst";\nexport * as loaded from ${appConstants};\n`,
        perModule: true,
        pieces: [],
        wholeConstants: true,
      };
      this.#routes.set(key, { source, result });
      return result;
    }
    const [, scope] = fileName.match(constantsFile) ?? [];
    if (narrow && scope) {
      const answered = this.#answeredFrom(source, narrow, scope);
      if (answered || scope === this.#table.scope) return answered;
    }
    if (RuntimeScopeReport.isConstantFile(fileName))
      return narrow?.constantFiles.has(key) === false ? null : this.#route(source, key);
    if (this.#planned?.graph.has(key) && !this.#planned.routed.has(key)) return null;
    return this.#route(source, key);
  }

  //? The bundler gives a module its own chunk, empty or not, wherever the pages reaching it differ from its neighbours':
  //? imported from here, an answering piece is reached by exactly the pages reaching this file and lands in its chunk.
  #answeredFrom(source: string, narrow: NarrowPieces, scope: string): RouteRuntimeResult | null {
    const registered = source.replace(registration, (line, model: string) =>
      narrow.pieces.has(`${scope}/lib/__client/${model}.cnst`)
        ? `export { ${model} } from "./__client/${model}.cnst";`
        : line,
    );
    const answering =
      scope === this.#table.scope
        ? [...this.#pieces]
            .filter((piece) => constantPieceFile.test(`${piece}.ts`) && !narrow.pieces.has(piece))
            .sort(byCodeUnit)
        : [];
    if (registered === source && !answering.length) return null;
    const imports = answering.map((piece) => `import ${JSON.stringify(this.#absoluteOf(piece))};`);
    return { source: `${registered}\n${imports.join("\n")}\n`, perModule: false, pieces: [] };
  }

  #route(source: string, absPath: string): RouteRuntimeResult | null {
    const known = this.#routes.get(absPath);
    if (known?.source === source) return known.result;
    const result = this.#routeNow(source, absPath);
    this.#routes.set(absPath, { source, result });
    return result;
  }

  #routeNow(source: string, absPath: string): RouteRuntimeResult | null {
    const fileName = this.fileNameOf(absPath);
    const referenced = fileName ? ModelReference.modelOf(fileName) : null;
    if (referenced) return this.#referenceOf(source, referenced, absPath);
    if (!fileName || macroAttribute.test(source)) return null;
    if (RuntimeScopeReport.isConstantFile(fileName)) return this.#constantFileOf(source, fileName);
    if (!RuntimeScopeReport.isRuntimeSource(fileName)) return null;
    const [, storeScope, storeModule] = fileName.match(storeFile) ?? [];
    const planned = this.#planned;
    const storeSide = !!storeModule || !!planned?.storeSide.has(absPath);
    const sideNeeds = planned && !storeSide ? this.#importedNeedsOf(absPath, planned) : [];
    const mayUse = RuntimeImports.mayUseRuntime(source, fileName) || RuntimeImports.mayUseConstants(source, fileName);
    if (!storeModule && !sideNeeds.length && !mayUse) return { source, perModule: true, pieces: [] };
    const sourceFile = parsed(fileName, source);
    if (!sourceFile) return null;
    const verdict = RuntimeUse.analyze({ fileName, text: source, sourceFile }, this.#table);
    const pieces = storeSide
      ? (this.#descriptorsOf(
          verdict,
          storeScope && storeModule ? { scope: storeScope, module: storeModule } : undefined,
        ) ?? [])
      : this.#piecesOf(verdict, sideNeeds);
    if (!pieces) {
      this.#why.whole.set(absPath, this.#whyWhole(fileName, verdict, sideNeeds));
      const edit = RouteRuntimeEdits.leading(sourceFile, this.wholeImports);
      return { source: RouteRuntimeEdits.apply(source, [edit]), perModule: false, pieces: [] };
    }
    const constants = this.#constants.rewrite(sourceFile, fileName, verdict.constants);
    const edits = sourceFile.statements.flatMap((statement) =>
      RouteRuntimeEdits.importEdit(statement, sourceFile, fileName, {
        handlesOnly: storeSide && !verdict.resolvable,
        constants,
      }),
    );
    const result = this.#routed(source, sourceFile, edits, pieces, constants);
    return constants ? result : { ...result, wholeConstants: true };
  }

  #constantFileOf(source: string, fileName: string): RouteRuntimeResult | null {
    if (!RuntimeImports.mayUseConstants(source, fileName)) return null;
    const sourceFile = parsed(fileName, source);
    if (!sourceFile) return null;
    const { constants: use } = RuntimeUse.analyze({ fileName, text: source, sourceFile }, this.#table);
    const constants = this.#constants.rewrite(sourceFile, fileName, use, { constantFile: true });
    if (!constants) return { source, perModule: true, pieces: [], wholeConstants: true };
    if (!constants.edits.length) return null;
    return this.#routed(source, sourceFile, [], [], constants);
  }

  #routed(
    source: string,
    sourceFile: ts.SourceFile,
    edits: RouteRuntimeTextEdit[],
    pieces: string[],
    constants: ConstantRewrite | null,
  ): RouteRuntimeResult {
    const all = [...(constants?.pieces ?? []), ...pieces];
    const leading = [...this.#after(all, (piece) => `@${piece}`), ...(constants?.imports ?? [])];
    const changes = [...edits, ...(constants?.edits ?? [])];
    if (leading.length) changes.push(RouteRuntimeEdits.leading(sourceFile, leading));
    return { source: RouteRuntimeEdits.apply(source, changes), perModule: true, pieces: all };
  }

  //? Loads what a file writing `st.use.<model>` loads: a framework component reads that store for a handed object.
  #referenceOf(source: string, model: string, absPath: string): RouteRuntimeResult {
    const store = this.#table.lookup("st.use", model);
    const needs = store ? "store" : "descriptor";
    const named = store ?? this.#table.lookup("fetch.serializedSignal", model);
    const declaring = named?.owners ?? [];
    //? Another store with a state field named like the model declares the same `st.use` key.
    const own = declaring.filter((owner) => owner.module === model);
    const owners = (own.length ? own : declaring).map((owner) => ({ ...owner, needs }) as const);
    const constants = { reads: [], imports: [], problems: [] };
    const verdict = {
      resolvable: true,
      owners,
      baseStore: false,
      baseDescriptor: false,
      reads: true,
      constants,
    } as const;
    const pieces = this.#piecesOf(verdict);
    if (!pieces) this.#why.whole.set(absPath, this.#whyWhole(this.#nameOf(absPath), verdict, []));
    const loads = pieces ? this.#after(pieces, (piece) => `@${piece}`) : this.wholeImports;
    return { source: ModelReference.sourceOf(source, loads), perModule: !!pieces, pieces: pieces ?? [] };
  }

  #descriptorOf(scope: string, module: string) {
    return [this.#table.scope, scope]
      .map((holder) => `${holder}/lib/__client/${module}.fetch`)
      .find((piece) => this.#pieces.has(piece));
  }

  //? Null where a descriptor the file names has no piece: only the whole runtime answers it then.
  #descriptorsOf(
    verdict: RuntimeUseVerdict,
    store?: { scope: string; module: string },
    strict = false,
  ): string[] | null {
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
      else if (needs === "descriptor" && strict) return null;
    }
    return [...descriptors];
  }

  //? A store-side file imports no store piece: the piece of a store it names imports that store's file, which may
  //? import this one back. What its code reaches when it runs is loaded by each file outside importing it instead.
  #piecesOf(verdict: RuntimeUseVerdict, sideNeeds: (string[] | null)[] = []): string[] | null {
    if (!verdict.resolvable) return null;
    const descriptors = this.#descriptorsOf(verdict, undefined, true);
    if (!descriptors) return null;
    const stores = new Set<string>();
    for (const { scope, module, needs } of verdict.owners) {
      if (needs !== "store") continue;
      const store = `${scope}/lib/__client/${module}.st`;
      if (!this.#pieces.has(store) || !this.#reaches(store, stores)) return null;
    }
    for (const needs of sideNeeds) if (!needs?.every((need) => this.#reaches(need, stores))) return null;
    return [...descriptors, ...stores];
  }

  #whyWhole(file: string, verdict: RuntimeUseVerdict, sideNeeds: (string[] | null)[]): RouteRuntimeWhy {
    if (!verdict.resolvable) return { file, line: verdict.line, message: verdict.message };
    const unsynced = (scope: string, module: string) => ({ file, message: RouteRuntime.#unsynced(scope, module) });
    const seen = new Set<string>();
    for (const { scope, module, needs } of verdict.owners) {
      if (needs === "descriptor" && !this.#descriptorOf(scope, module)) return unsynced(scope, module);
      if (needs !== "store") continue;
      const store = `${scope}/lib/__client/${module}.st`;
      if (!this.#pieces.has(store)) return unsynced(scope, module);
      const why = this.#whyUnreached(store, seen);
      if (why) return why;
    }
    for (const needs of sideNeeds)
      for (const need of needs ?? []) {
        const why = this.#whyUnreached(need, seen);
        if (why) return why;
      }
    return { file, message: "imports a file a store file imports, whose code reads names that cannot be told" };
  }

  #whyUnreached(store: string, seen: Set<string>): RouteRuntimeWhy | null {
    if (seen.has(store)) return null;
    seen.add(store);
    const [, , module] = store.match(storePiece) ?? [];
    if (!module) return null;
    for (const { scope } of this.#table.layers) {
      if (!this.#pieces.has(`${scope}/lib/__client/${module}.st`)) continue;
      const needs = this.#needsOf(scope, module);
      if (!needs)
        return (
          this.#why.store.get(`${scope}/${module}`) ?? {
            file: `${scope}/lib/${module}/${module}.store.ts`,
            message: "reads names that cannot be told",
          }
        );
      for (const need of needs) {
        const why = this.#whyUnreached(need, seen);
        if (why) return why;
      }
    }
    return null;
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
    const [file] = [module, `_${module}`]
      .map((dir) => path.join(this.#workspaceRoot, scope, "lib", dir, `${module}.store.ts`))
      .filter((candidate) => this.#read(candidate) !== null);
    const needs = !file ? [] : this.#planned ? this.#sideNeedsOf(file, this.#planned) : this.#ownNeedsOf(file);
    const why = file && (this.#why.side.get(file) ?? this.#why.needs.get(file));
    if (!needs && why) this.#why.store.set(key, why);
    this.#storeNeeds.set(key, needs);
    return needs;
  }

  //? What a file outside the store side loads for each store-side file it imports, as it does for a store it names.
  #importedNeedsOf(absPath: string, planned: Planned): (string[] | null)[] {
    return planned.graph
      .importsOf(absPath)
      .filter((file) => planned.storeSide.has(file))
      .map((file) => this.#sideNeedsOf(file, planned))
      .filter((needs) => needs?.length !== 0);
  }

  //? With the store-side files it imports, whose code runs inside the same import cycle.
  #sideNeedsOf(absPath: string, planned: Planned): string[] | null {
    const known = this.#sideNeeds.get(absPath);
    if (known !== undefined) return known;
    const needs = new Set<string>();
    let told = true;
    for (const file of planned.graph.closureOf([absPath])) {
      const own = this.#ownNeedsOf(file);
      const why = own ? undefined : this.#why.needs.get(file);
      if (why && !this.#why.side.has(absPath)) this.#why.side.set(absPath, why);
      if (!own) told = false;
      for (const need of own ?? []) needs.add(need);
    }
    const result = told ? [...needs] : null;
    this.#sideNeeds.set(absPath, result);
    return result;
  }

  #ownNeedsOf(absPath: string): string[] | null {
    const known = this.#ownNeeds.get(absPath);
    if (known !== undefined) return known;
    const needs = this.#readNeeds(absPath);
    this.#ownNeeds.set(absPath, needs);
    return needs;
  }

  #readNeeds(absPath: string): string[] | null {
    const fileName = this.fileNameOf(absPath);
    if (!fileName || !RuntimeScopeReport.isRuntimeSource(fileName)) return [];
    const text = this.#read(absPath);
    if (text === null) return [];
    const [, , module] = fileName.match(storeFile) ?? [];
    if (!module && !RuntimeImports.mayUseRuntime(text, fileName)) return [];
    const untold = (message: string, line?: number) => {
      this.#why.needs.set(absPath, { file: fileName, message, ...(line ? { line } : {}) });
      return null;
    };
    const sourceFile = macroAttribute.test(text) ? null : parsed(fileName, text);
    if (!sourceFile) return untold("holds a macro import or does not parse, so the names it reads are not followed");
    const verdict = RuntimeUse.analyze({ fileName, text, sourceFile }, this.#table);
    if (!verdict.resolvable) return untold(verdict.message, verdict.line);
    const stores: string[] = [];
    const unsynced = ({ scope, module: name }: { scope: string; module: string }) =>
      untold(RouteRuntime.#unsynced(scope, name));
    for (const owner of verdict.owners) {
      if (owner.needs === "descriptor" && !this.#descriptorOf(owner.scope, owner.module)) return unsynced(owner);
      if (owner.needs !== "store" || owner.module === module) continue;
      const store = `${owner.scope}/lib/__client/${owner.module}.st`;
      if (!this.#pieces.has(store)) return unsynced(owner);
      stores.push(store);
    }
    return stores;
  }
}
