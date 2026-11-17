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
import { ModelReference } from "../transforms/modelReference";
import { RouteRuntime } from "../transforms/routeRuntime";
import type { ClientEntryDiscovery } from "./clientBuildTypes";
import { GraphClientEntryDiscovery } from "./clientEntryDiscovery";
import { type BuildRouteClientResult, RouteClientBuilder } from "./routeClientBuilder";
import { RouteHandoffs } from "./routeHandoffs";
import { RouteModulePreloads, type RuntimeChunks } from "./routeModulePreloads";
import { RoutesManifestArtifactSerializer } from "./routesManifestArtifactSerializer";

export interface BuildAllRoutesResult {
  manifest: RoutesManifest;
  manifestPath: string;
  seedIndex: RouteSeedIndex;
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
    const discovery = await GraphClientEntryDiscovery.create(this.#app);
    this.#discovery = discovery;
    const importsAs = await this.#ssrImportsAs(discovery, pageEntries);
    const handoffs = await this.#readHandoffs();
    const unread = new Map<string, string[]>();

    // Every route's entries go into one Bun.build: chunk splitting only dedupes within a single build.
    const allEntries = new Set<string>();
    for (const entry of seedIndex.entries) {
      const seeds = Array.from(new Set([...seedIndex.globalLayoutFiles, ...entry.seeds]));
      const routeEntries = await discovery.discover(seeds);
      for (const discovered of routeEntries) allEntries.add(discovered);
      const ssrEntries = await discovery.discover(seeds, { importsAs });
      const handed = await handoffs?.read(await discovery.serverModules(seeds, { importsAs }));
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

    return { manifest, manifestPath, seedIndex };
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
    return importsAs;
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
