import path from "node:path";
import type { BaseBuildArtifact, RoutesManifest } from "akanjs/server";
import { resolveSsrPageEntriesForApp } from "../artifact/implicitRootLayout";
import { computeRouteSeedIndex, type RouteSeedIndex } from "../artifact/routeSeedIndex";
import type { App } from "../commandDecorators";
import type { ClientEntryDiscovery } from "./clientBuildTypes";
import { GraphClientEntryDiscovery } from "./clientEntryDiscovery";
import { type BuildRouteClientResult, RouteClientBuilder } from "./routeClientBuilder";
import { RouteModulePreloads, type RuntimeChunks } from "./routeModulePreloads";
import { RoutesManifestArtifactSerializer } from "./routesManifestArtifactSerializer";

export interface BuildAllRoutesResult {
  manifest: RoutesManifest;
  manifestPath: string;
  seedIndex: RouteSeedIndex;
  modulesByRoute?: Record<string, string[]>;
}

export class AllRoutesBuilder {
  #app: App;
  #artifact: BaseBuildArtifact;
  #command: "build" | "start";
  #artifactDir: string;
  #merged: Pick<RoutesManifest, "clientManifest" | "ssrManifest" | "knownEntries"> = {
    clientManifest: {},
    ssrManifest: { moduleLoading: null, moduleMap: {} },
    knownEntries: [],
  };
  #knownSet = new Set<string>();
  #routeIds: string[] = [];
  #entriesByRoute = new Map<string, string[]>();
  #discovery: ClientEntryDiscovery | null = null;
  #runtimeChunks?: RuntimeChunks;

  constructor(
    app: App,
    artifact: BaseBuildArtifact,
    command: "build" | "start" = "start",
    { runtimeChunks }: { runtimeChunks?: RuntimeChunks } = {},
  ) {
    this.#app = app;
    this.#artifact = artifact;
    this.#command = command;
    this.#runtimeChunks = runtimeChunks;
    this.#artifactDir = `${command === "build" ? app.dist.cwdPath : app.cwdPath}/.akan/artifact`;
  }

  async build(): Promise<BuildAllRoutesResult> {
    const pageKeys = await this.#app.getPageKeys();
    const pageEntries = await resolveSsrPageEntriesForApp(this.#app, pageKeys);
    const seedIndex = computeRouteSeedIndex(pageEntries);
    this.#app.verbose(`[build-all] discovered ${seedIndex.entries.length} routes`);
    this.#discovery = await GraphClientEntryDiscovery.create(this.#app);

    // Every route's entries go into one Bun.build: chunk splitting only dedupes within a single build.
    const allEntries = new Set<string>();
    for (const entry of seedIndex.entries) {
      const seeds = Array.from(new Set([...seedIndex.globalLayoutFiles, ...entry.seeds]));
      const routeEntries = await this.#discovery.discover(seeds);
      for (const discovered of routeEntries) allEntries.add(discovered);
      this.#entriesByRoute.set(entry.routeId, routeEntries);
      this.#routeIds.push(entry.routeId);
    }
    this.#app.verbose(`[build-all] ${allEntries.size} client entries across ${this.#routeIds.length} routes`);

    const delta = await this.#buildEntries([...allEntries]);
    this.#mergeDelta(delta);
    this.#merged.knownEntries = Array.from(this.#knownSet);

    const preloads = this.#modulePreloadsOf(delta);
    const manifest: RoutesManifest = {
      routeIds: this.#routeIds,
      ...this.#merged,
      ...(preloads ? { modulePreloads: preloads.table } : {}),
    };
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
    this.#app.verbose(
      `[build-all] wrote ${manifestPath} routes=${this.#routeIds.length} entries=${this.#merged.knownEntries.length}`,
    );

    return { manifest, manifestPath, seedIndex, ...(preloads ? { modulesByRoute: preloads.modulesByRoute() } : {}) };
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
      artifact: this.#artifact,
      knownEntries: this.#knownSet,
      discovery: this.#discovery,
      command: this.#command,
    }).build();
    this.#app.verbose(`[build-all] bundled ${delta.newEntries.length} entries (${Date.now() - started}ms)`);
    return delta;
  }

  #modulePreloadsOf({ externalsByChunkUrl }: BuildRouteClientResult): RouteModulePreloads | null {
    if (!this.#runtimeChunks || !externalsByChunkUrl) return null;
    return new RouteModulePreloads({
      runtimeChunks: this.#runtimeChunks,
      entriesByRoute: this.#entriesByRoute,
      clientManifest: this.#merged.clientManifest,
      externalsByChunkUrl,
      workspaceRoot: this.#app.workspace.workspaceRoot,
    });
  }

  #mergeDelta(delta: BuildRouteClientResult): void {
    Object.assign(this.#merged.clientManifest, delta.manifestDelta);
    Object.assign(this.#merged.ssrManifest.moduleMap, delta.ssrManifestDelta.moduleMap);
    for (const abs of delta.newEntries) this.#knownSet.add(abs);
  }
}
