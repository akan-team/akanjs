import path from "node:path";
import type { RoutesManifest } from "akanjs/server";
import {
  isImplicitRootLayoutKey,
  type PageEntry,
  ROOT_LAYOUT_SYSTEM,
  resolveSsrPageEntriesForApp,
} from "../artifact/implicitRootLayout";
import { computeRouteSeedIndex, type RouteSeedIndex } from "../artifact/routeSeedIndex";
import { StoreBootstrap } from "../artifact/storeBootstrap";
import type { App } from "../commandDecorators";
import {
  type RouteRuntimeBuildReport,
  type RouteRuntimeDictionaryFallback,
  RouteRuntimeReport,
} from "../quality/routeRuntimeReport";
import { ModelReference } from "../transforms/modelReference";
import { RouteRuntime } from "../transforms/routeRuntime";
import type { AskedExports, ClientEntryDiscovery } from "./clientBuildTypes";
import { GraphClientEntryDiscovery } from "./clientEntryDiscovery";
import { DictionaryRoutes } from "./dictionaryRoutes";
import { type BuildRouteClientResult, RouteClientBuilder } from "./routeClientBuilder";
import { RouteHandoffs } from "./routeHandoffs";
import { RouteModulePreloads, type RuntimeChunks } from "./routeModulePreloads";
import { RoutesManifestArtifactSerializer } from "./routesManifestArtifactSerializer";

export interface BuildAllRoutesResult {
  manifest: RoutesManifest;
  manifestPath: string;
  seedIndex: RouteSeedIndex;
  /** A production build: the dictionary groups each route can show; a route left out loads every group. */
  dictionaryRoutes?: Map<string, string[]>;
  runtimeReport?: RouteRuntimeBuildReport;
}

export class AllRoutesBuilder {
  #app: App;
  #command: "build" | "start";
  #artifactDir: string;
  #merged: Pick<RoutesManifest, "clientManifest" | "ssrManifest" | "knownEntries"> = {
    clientManifest: {},
    ssrManifest: { moduleLoading: null, moduleMap: {} },
    knownEntries: [],
  };
  #knownSet = new Set<string>();
  #routeIds: string[] = [];
  #ssrEntriesByRoute = new Map<string, string[]>();
  #entriesByRoute = new Map<string, string[]>();
  #askedByRoute = new Map<string, AskedExports>();
  #serverModulesByRoute = new Map<string, string[]>();
  #externalsByChunkUrl: Record<string, string[]> = {};
  #discovery: ClientEntryDiscovery | null = null;

  constructor(app: App, command: "build" | "start" = "start") {
    this.#app = app;
    this.#command = command;
    this.#artifactDir = `${command === "build" ? app.dist.cwdPath : app.cwdPath}/.akan/artifact`;
  }

  async build(): Promise<BuildAllRoutesResult> {
    const pageKeys = await this.#app.getPageKeys();
    const pageEntries = await resolveSsrPageEntriesForApp(this.#app, pageKeys);
    const seedIndex = computeRouteSeedIndex(pageEntries);
    this.#app.verbose(`[build-all] discovered ${seedIndex.entries.length} routes`);
    const discovery = await GraphClientEntryDiscovery.create(this.#app, { byExport: this.#command === "build" });
    this.#discovery = discovery;
    const { importsAs, rendering } = await this.#ssrImportsAs(discovery, pageEntries);
    const handoffs = await this.#readHandoffs();
    const dictionary = this.#command === "build";
    const unread = new Map<string, string[]>();

    // Every route's entries go into one Bun.build: chunk splitting only dedupes within a single build.
    const allEntries = new Set<string>();
    for (const entry of seedIndex.entries) {
      const seeds = Array.from(new Set([...seedIndex.globalLayoutFiles, ...entry.seeds]));
      const routeEntries = await discovery.discover(seeds);
      for (const discovered of routeEntries) allEntries.add(discovered);
      const serverModules = dictionary ? await discovery.serverModules(seeds, { importsAs }) : undefined;
      const asked = await discovery.discoverAsked(seeds, { importsAs, serverModules });
      const ssrEntries = [...asked.keys()].sort();
      this.#askedByRoute.set(entry.routeId, asked);
      if (serverModules) this.#serverModulesByRoute.set(entry.routeId, serverModules);
      const handed = handoffs
        ? await handoffs.read(await discovery.serverModules(seeds, { importsAs: rendering }))
        : undefined;
      const loaded = [...new Set([...ssrEntries, ...(handed?.referenceFiles ?? [])])].sort();
      this.#ssrEntriesByRoute.set(entry.routeId, loaded);
      const besidesReferences = handed ? routeEntries.filter((file) => !ModelReference.isFile(file)) : routeEntries;
      this.#entriesByRoute.set(entry.routeId, [...new Set([...besidesReferences, ...loaded])]);
      if (handed?.unread) {
        const pinned = `${handed.unread.file} (${handed.unread.why})`;
        unread.set(pinned, [...(unread.get(pinned) ?? []), entry.routeId]);
      }
      this.#routeIds.push(entry.routeId);
    }
    for (const [pinned, routeIds] of unread)
      this.#app.logger.warn(
        `[client-runtime] ${routeIds.length} route(s) count every model's runtime in the route table: what ${pinned} hands to client components cannot be read. Routes: ${routeIds.join(", ")}`,
      );
    this.#app.verbose(`[build-all] ${allEntries.size} client entries across ${this.#routeIds.length} routes`);

    const delta = await this.#buildEntries([...allEntries]);
    this.#mergeDelta(delta);
    const dictionaryRoutes =
      dictionary && delta.clientGraph ? await this.#readDictionaryRoutes(delta.clientGraph) : null;
    this.#merged.knownEntries = Array.from(this.#knownSet);
    this.#externalsByChunkUrl = delta.externalsByChunkUrl ?? {};

    const manifest: RoutesManifest = {
      routeIds: this.#routeIds,
      ...this.#merged,
    };
    const manifestPath = await this.#writeManifest(manifest);
    this.#app.verbose(
      `[build-all] wrote ${manifestPath} routes=${this.#routeIds.length} entries=${this.#merged.knownEntries.length}`,
    );

    return {
      manifest,
      manifestPath,
      seedIndex,
      ...(dictionaryRoutes ? { dictionaryRoutes } : {}),
      ...(delta.runtimeReport ? { runtimeReport: delta.runtimeReport } : {}),
    };
  }

  async #readDictionaryRoutes(importsByModule: NonNullable<BuildRouteClientResult["clientGraph"]>) {
    const { workspaceRoot } = this.#app.workspace;
    const reader = await DictionaryRoutes.forApp(workspaceRoot, `apps/${this.#app.name}`, { importsByModule });
    const groupsByRoute = new Map<string, string[]>();
    const whole = new Map<string, RouteRuntimeDictionaryFallback>();
    for (const routeId of this.#routeIds) {
      const entries = this.#entriesByRoute.get(routeId) ?? [];
      const read = reader.read({ entries, serverModules: this.#serverModulesByRoute.get(routeId) });
      if (!read.whole) groupsByRoute.set(routeId, read.groups);
      else {
        const pinned = DictionaryRoutes.pinned(read.whole);
        const known = whole.get(pinned) ?? { ...read.whole, routes: [] };
        whole.set(pinned, { ...known, routes: [...known.routes, routeId] });
      }
    }
    for (const [pinned, { routes, line: key }] of whole) {
      const line = `[dictionary] ${routes.length} route(s) load the whole page dictionary: ${pinned}. Routes: ${routes.join(", ")}`;
      if (key !== undefined) this.#app.logger.warn(line);
      else this.#app.verbose(line);
    }
    await RouteRuntimeReport.addDictionary(this.#app.cwdPath, [...whole.values()]);
    return groupsByRoute;
  }

  async #ssrImportsAs(discovery: GraphClientEntryDiscovery, pageEntries: PageEntry[]) {
    const { specifier, ssrShell, importsNoSsrPageRenders } = ROOT_LAYOUT_SYSTEM;
    const importsAs = new Map<string, ReadonlyMap<string, string | null>>();
    //? The root layout registers every model's reference; a route loads only those its own server modules hand over.
    const toShell = new Map<string, string | null>([
      [specifier, ssrShell],
      [ModelReference.registrySpecifier(this.#app.name), null],
    ]);
    for (const { key, moduleAbsPath } of pageEntries)
      if (isImplicitRootLayoutKey(key)) importsAs.set(path.resolve(moduleAbsPath), toShell);
    const system = await discovery.resolveImport(specifier, this.#app.cwdPath);
    if (system) importsAs.set(system, new Map(importsNoSsrPageRenders.map((spec) => [spec, null])));
    //? The root layout also imports every store so the server holds them; no route's own render runs through one.
    const stores = StoreBootstrap.serverSpecifiers(this.#app.name).map((spec) => [spec, null] as const);
    const rendering = new Map(importsAs);
    for (const { key, moduleAbsPath } of pageEntries)
      if (isImplicitRootLayoutKey(key)) rendering.set(path.resolve(moduleAbsPath), new Map([...toShell, ...stores]));
    return { importsAs, rendering };
  }

  async #readHandoffs(): Promise<RouteHandoffs | null> {
    if (this.#command !== "build" || (await StoreBootstrap.scopeOf(this.#app)) !== "page") return null;
    const { workspaceRoot } = this.#app.workspace;
    const scope = `apps/${this.#app.name}`;
    const runtime = await RouteRuntime.read(workspaceRoot, scope).catch(() => null);
    if (!runtime) return null;
    return new RouteHandoffs(workspaceRoot, runtime, await ModelReference.filesOf(workspaceRoot, scope));
  }

  async writeModulePreloads(runtimeChunks: RuntimeChunks): Promise<RouteModulePreloads> {
    const preloads = new RouteModulePreloads({
      runtimeChunks,
      entriesByRoute: this.#ssrEntriesByRoute,
      askedByRoute: this.#askedByRoute,
      clientManifest: this.#merged.clientManifest,
      externalsByChunkUrl: this.#externalsByChunkUrl,
      workspaceRoot: this.#app.workspace.workspaceRoot,
    });
    await this.#writeManifest({ routeIds: this.#routeIds, ...this.#merged, modulePreloads: preloads.table });
    return preloads;
  }

  async #writeManifest(manifest: RoutesManifest) {
    const manifestPath = path.join(path.resolve(this.#artifactDir), "routes-manifest.json");
    await Bun.write(
      manifestPath,
      `${JSON.stringify(
        RoutesManifestArtifactSerializer.serialize(manifest, this.#artifactDir, {
          production: this.#command === "build",
        }),
        null,
        2,
      )}\n`,
    );
    return manifestPath;
  }

  async #buildEntries(entries: string[]): Promise<BuildRouteClientResult> {
    if (!this.#discovery) throw new Error("[build-all] client entry discovery is not initialized");
    if (entries.length === 0)
      return {
        manifestDelta: {},
        ssrManifestDelta: { moduleLoading: null, moduleMap: {} },
        newEntries: [],
        clientDeps: [],
      };
    const started = Date.now();
    const delta = await new RouteClientBuilder({
      app: this.#app,
      seeds: [],
      entries,
      knownEntries: this.#knownSet,
      discovery: this.#discovery,
      command: this.#command,
      entriesByRoute: this.#entriesByRoute,
      sizedEntriesByRoute: this.#ssrEntriesByRoute,
      askedByRoute: this.#askedByRoute,
    }).build();
    this.#app.verbose(`[build-all] bundled ${delta.newEntries.length} entries (${Date.now() - started}ms)`);
    return delta;
  }

  #mergeDelta(delta: BuildRouteClientResult): void {
    Object.assign(this.#merged.clientManifest, delta.manifestDelta);
    Object.assign(this.#merged.ssrManifest.moduleMap, delta.ssrManifestDelta.moduleMap);
    for (const abs of delta.newEntries) this.#knownSet.add(abs);
  }
}
