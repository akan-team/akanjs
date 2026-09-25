import path from "node:path";
import type { BaseBuildArtifact, BuildRouteClientResult, RoutesManifest } from "akanjs/server";
import { resolveSsrPageEntriesForApp } from "../artifact/implicitRootLayout";
import { computeRouteSeedIndex, type RouteSeedIndex } from "../artifact/routeSeedIndex";
import type { App } from "../commandDecorators";
import type { ClientEntryDiscovery } from "./clientBuildTypes";
import { GraphClientEntryDiscovery } from "./clientEntryDiscovery";
import { RouteClientBuilder } from "./routeClientBuilder";
import { RoutesManifestArtifactSerializer } from "./routesManifestArtifactSerializer";

export interface BuildAllRoutesResult {
  manifest: RoutesManifest;
  manifestPath: string;
  seedIndex: RouteSeedIndex;
}

/**
 * Walk every route in `pages` and produce its client bundle up-front.
 * Intended to run under `akan build` (production) so the serve path
 * never needs to compile.
 */
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
  #discovery: ClientEntryDiscovery | null = null;

  constructor(app: App, artifact: BaseBuildArtifact, command: "build" | "start" = "start") {
    this.#app = app;
    this.#artifact = artifact;
    this.#command = command;
    this.#artifactDir = `${command === "build" ? app.dist.cwdPath : app.cwdPath}/.akan/artifact`;
  }

  async build(): Promise<BuildAllRoutesResult> {
    const pageKeys = await this.#app.getPageKeys();
    const pageEntries = await resolveSsrPageEntriesForApp(this.#app, pageKeys);
    const seedIndex = computeRouteSeedIndex(pageEntries);
    this.#app.verbose(`[build-all] discovered ${seedIndex.entries.length} routes`);
    this.#discovery = await GraphClientEntryDiscovery.create(this.#app);

    for (const entry of seedIndex.entries) {
      const seeds = Array.from(new Set([...seedIndex.globalLayoutFiles, ...entry.seeds]));
      const delta = await this.#buildRoute(entry.routeId, seeds);
      this.#mergeRoute(entry.routeId, delta);
    }
    this.#merged.knownEntries = Array.from(this.#knownSet);

    const manifest: RoutesManifest = {
      routeIds: this.#routeIds,
      ...this.#merged,
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

    return { manifest, manifestPath, seedIndex };
  }

  async #buildRoute(routeId: string, seeds: string[]): Promise<BuildRouteClientResult> {
    if (!this.#discovery) throw new Error("[build-all] client entry discovery is not initialized");
    const started = Date.now();
    const delta = await new RouteClientBuilder({
      app: this.#app,
      routeId,
      seeds,
      artifact: this.#artifact,
      knownEntries: this.#knownSet,
      discovery: this.#discovery,
      command: this.#command,
    }).build();
    this.#app.verbose(`[build-all] ${routeId} +${delta.newEntries.length} entries (${Date.now() - started}ms)`);
    return delta;
  }

  #mergeRoute(routeId: string, delta: BuildRouteClientResult): void {
    for (const [key, row] of Object.entries(delta.manifestDelta)) this.#merged.clientManifest[key] = row;
    for (const [url, byName] of Object.entries(delta.ssrManifestDelta.moduleMap)) {
      this.#merged.ssrManifest.moduleMap[url] = byName;
    }
    for (const abs of delta.newEntries) this.#knownSet.add(abs);
    this.#routeIds.push(routeId);
  }
}
