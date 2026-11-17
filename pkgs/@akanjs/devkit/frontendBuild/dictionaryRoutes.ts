import { readFileSync } from "node:fs";
import path from "node:path";
import { StoreBootstrap } from "../artifact/storeBootstrap";
import type { App } from "../commandDecorators";
import { type DictionaryKeyRead, DictionaryKeys } from "../quality/dictionaryKeys";
import { ModelReference } from "../transforms/modelReference";
import { RouteRuntime } from "../transforms/routeRuntime";
import type { ClientEntryDiscovery, ClientModuleImport } from "./clientBuildTypes";
import { DictionaryAssetBuilder } from "./dictionaryAssetBuilder";
import { DictionaryConstants } from "./dictionaryConstants";
import { RouteHandoffs } from "./routeHandoffs";

export interface DictionaryRouteUnread {
  file: string;
  line?: number;
  why: string;
}

export interface DictionaryRouteRead {
  //? Every group the route's client modules can show, a superset: names no dictionary holds are dropped when packed.
  groups: string[];
  api: boolean;
  //? Set when the route shows a key the build cannot follow: it loads the whole page dictionary.
  whole: DictionaryRouteUnread | null;
}

export interface DictionaryRouteInput {
  entries: readonly string[];
  serverModules?: readonly string[];
  references?: readonly string[];
}

//? Development's graph links the whole runtime, so a file importing it is asked which module pieces it would load.
export type DictionaryPiecesOf = (absPath: string, source: string) => { perModule: boolean; pieces: string[] } | null;

export interface DictionaryRoutesOptions {
  importsByModule: ReadonlyMap<string, readonly ClientModuleImport[]>;
  constants: DictionaryConstants;
  piecesOf?: DictionaryPiecesOf;
}

const scoped = /^(?:apps|libs)\/[^/]+\//;
const piece = /^((?:apps|libs)\/[^/]+)\/lib\/__client\/([^/_.][^/.]*)\.(st|fetch|ref)(?:\.ts)?$/;
const wholeRuntime = /^(?:apps|libs)\/[^/]+\/lib\/(?:st|useClient)\.ts$/;
const noTexts = /\.(?:constant|dictionary|document|service|signal)\.ts$/;
const generated = /^(?:apps|libs)\/[^/]+\/(?:lib\/[^/]+\.ts$|client\.ts$|server\.ts$|\.akan\/)/;
//? Every page shows the framework's own texts: buttons, empty states, confirmations, validation messages.
const frameworkGroups = ["base"];

export class DictionaryRoutes {
  readonly #workspaceRoot: string;
  readonly #options: DictionaryRoutesOptions;
  readonly #reads = new Map<string, { source: string; read: DictionaryKeyRead }>();

  constructor(workspaceRoot: string, options: DictionaryRoutesOptions) {
    this.#workspaceRoot = workspaceRoot;
    this.#options = options;
  }

  static get frameworkGroups(): readonly string[] {
    return frameworkGroups;
  }

  static async forApp(
    workspaceRoot: string,
    appScope: string,
    options: Omit<DictionaryRoutesOptions, "constants">,
    runtime?: RouteRuntime | null,
  ): Promise<DictionaryRoutes> {
    const table = runtime === undefined ? await RouteRuntime.read(workspaceRoot, appScope).catch(() => null) : runtime;
    const scopes = table?.table.layers.map(({ scope }) => scope) ?? [appScope];
    const constants = await DictionaryConstants.read(workspaceRoot, [...new Set([appScope, ...scopes])]);
    return new DictionaryRoutes(workspaceRoot, { ...options, constants });
  }

  //? Development reads a route as it builds, from the SSR bundle standing in for the browser's, whose graph links the
  //? whole runtime; the constants are read again each time, as saving one restarts no builder.
  static async ofBuiltRoute(
    app: App,
    route: {
      seeds: string[];
      entries: readonly string[];
      importsByModule: ReadonlyMap<string, readonly ClientModuleImport[]>;
      discovery: ClientEntryDiscovery;
    },
  ): Promise<string[] | null> {
    const { workspaceRoot } = app.workspace;
    const unbuilt = route.entries.find((entry) => !route.importsByModule.has(path.resolve(entry)));
    if (unbuilt) {
      const fileName = path.relative(workspaceRoot, unbuilt).split(path.sep).join("/");
      app.verbose(`[dictionary] the route loads the whole page dictionary: this builder has not bundled ${fileName}`);
      return null;
    }
    const appScope = `apps/${app.name}`;
    const runtime = await RouteRuntime.read(workspaceRoot, appScope).catch(() => null);
    const piecesOf: DictionaryPiecesOf | undefined = runtime
      ? (absPath, source) => runtime.transform(source, absPath)
      : undefined;
    const reader = await DictionaryRoutes.forApp(
      workspaceRoot,
      appScope,
      { importsByModule: route.importsByModule, ...(piecesOf ? { piecesOf } : {}) },
      runtime,
    );
    const { discovery } = route;
    const serverModules =
      "serverModules" in discovery && typeof discovery.serverModules === "function"
        ? await (discovery.serverModules as (seeds: string[]) => Promise<string[]>)(route.seeds)
        : [];
    const handoffs = await DictionaryRoutes.#handoffsOf(app, runtime);
    const entries = await DictionaryRoutes.handedEntries(route.entries, serverModules, handoffs);
    const read = reader.read({ entries, serverModules });
    if (read.whole)
      app.verbose(`[dictionary] the route loads the whole page dictionary: ${DictionaryRoutes.pinned(read.whole)}`);
    return read.whole ? null : read.groups;
  }

  //? Development's root layout imports every model's reference; production keeps those a server module hands over.
  static async handedEntries(
    entries: readonly string[],
    serverModules: string[],
    handoffs: RouteHandoffs | null,
  ): Promise<readonly string[]> {
    if (!handoffs) return entries;
    const { referenceFiles } = await handoffs.read(serverModules);
    return [...new Set([...entries.filter((entry) => !ModelReference.isFile(entry)), ...referenceFiles])];
  }

  static async #handoffsOf(app: App, runtime: RouteRuntime | null): Promise<RouteHandoffs | null> {
    if (!runtime || (await StoreBootstrap.scopeOf(app)) !== "page") return null;
    const { workspaceRoot } = app.workspace;
    return new RouteHandoffs(workspaceRoot, runtime, await ModelReference.filesOf(workspaceRoot, `apps/${app.name}`));
  }

  static pinned({ file, line, why }: DictionaryRouteUnread): string {
    return `${file}${line ? `:${line}` : ""} ${why}`;
  }

  read({ entries, serverModules = [], references = [] }: DictionaryRouteInput): DictionaryRouteRead {
    const names = new Set<string>(frameworkGroups);
    const modules = new Set<string>(references);
    const route = { names, modules, api: false as boolean, whole: null as DictionaryRouteUnread | null };
    const queue = entries.map((entry) => path.resolve(entry));
    const visited = new Set<string>();
    for (let file = queue.pop(); file !== undefined && !route.whole; file = queue.pop()) {
      if (visited.has(file)) continue;
      visited.add(file);
      const fileName = this.#fileNameOf(file);
      const pieceOf = fileName.match(piece);
      if (pieceOf?.[2]) modules.add(pieceOf[2]);
      if (wholeRuntime.test(fileName)) {
        if (!this.#options.piecesOf) route.whole = { file: fileName, why: "loads every module's client runtime" };
        continue;
      }
      if (noTexts.test(fileName)) continue;
      if (scoped.test(fileName) && !pieceOf && !generated.test(fileName))
        this.#readClient(file, fileName, route, queue);
      for (const imported of this.#options.importsByModule.get(file) ?? []) queue.push(imported.path);
    }
    for (const file of serverModules) {
      if (route.whole) break;
      const fileName = this.#fileNameOf(file);
      if (!scoped.test(fileName) || noTexts.test(fileName) || generated.test(fileName)) continue;
      const read = this.#readOf(file, fileName)?.read;
      if (read?.anyModule) route.whole = { file: fileName, why: read.anyModule };
      for (const name of read?.propNames ?? []) names.add(name);
    }
    if (route.whole) return { groups: [], api: route.api, whole: route.whole };
    const { constants } = this.#options;
    for (const module of modules) for (const group of constants.reachOf(module)) names.add(group);
    if (route.api) names.add(DictionaryAssetBuilder.apiGroup);
    return { groups: [...names].sort(), api: route.api, whole: null };
  }

  #readClient(
    file: string,
    fileName: string,
    route: { names: Set<string>; modules: Set<string>; api: boolean; whole: DictionaryRouteUnread | null },
    queue: string[],
  ) {
    const known = this.#readOf(file, fileName);
    if (!known) return;
    const { read, source } = known;
    const [unread] = read.unread;
    if (unread) route.whole = { file: fileName, line: unread.line, why: unread.why };
    else if (read.anyModule) route.whole = { file: fileName, why: read.anyModule };
    for (const name of read.names) route.names.add(name);
    for (const name of read.classNames)
      for (const group of this.#options.constants.groupsOfClass(name)) route.modules.add(group);
    route.api ||= read.api;
    const { piecesOf } = this.#options;
    const readsWhole = (this.#options.importsByModule.get(file) ?? []).some(({ path: imported }) =>
      wholeRuntime.test(this.#fileNameOf(imported)),
    );
    if (!piecesOf || !readsWhole) return;
    const routed = piecesOf(file, source);
    if (routed && !routed.perModule) route.whole = { file: fileName, why: "needs every module's client runtime" };
    for (const loaded of routed?.pieces ?? []) {
      const [, scope, module, role] = loaded.match(piece) ?? [];
      if (!scope || !module) continue;
      route.modules.add(module);
      if (role === "st")
        for (const dir of [module, `_${module}`])
          queue.push(path.join(this.#workspaceRoot, scope, "lib", dir, `${module}.store.ts`));
    }
  }

  #readOf(file: string, fileName: string) {
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      return null;
    }
    const known = this.#reads.get(file);
    if (known?.source === source) return known;
    const next = { source, read: DictionaryKeys.read(source, fileName) };
    this.#reads.set(file, next);
    return next;
  }

  #fileNameOf(absPath: string) {
    return path.relative(this.#workspaceRoot, absPath).split(path.sep).join("/");
  }
}
