import { Logger } from "akanjs/common";
import type { SsrManifest } from "../ssrTypes";
import type { BuildRouteClientResult, ClientManifest } from "./ipcTypes";
import type { RoutesManifest } from "./routesManifestStore";

/** One HMR generation's merged route builds; render from a `snapshot()`, which an invalidate cannot mutate. */
export interface MergedManifest {
  generation: number;
  clientManifest: ClientManifest;
  ssrManifest: SsrManifest;
  /** Absolute entry-file paths seen across every build so far. */
  knownEntries: Set<string>;
}

type RouteBuildFn = (
  routeId: string,
  info: { seeds: string[]; knownEntries: Set<string>; generation: number },
) => Promise<BuildRouteClientResult>;
type OnMergeFn = (
  routeId: string,
  info: { delta: BuildRouteClientResult; merged: MergedManifest; generation: number },
) => void | Promise<void>;

interface RouteClientCacheOptions {
  buildRoute: RouteBuildFn;
  onMerge?: OnMergeFn;
}

type PendingBuild = { generation: number; promise: Promise<BuildRouteClientResult> };
export interface InvalidateClientEntriesOptions {
  routePredicate: (routeId: string) => boolean;
  staleEntries: Iterable<string>;
}

export class RouteClientCache {
  static readonly #maxEnsureAttempts = 3;
  readonly #logger = new Logger("RouteClientCache");
  readonly #built = new Map<string, BuildRouteClientResult>();
  readonly #building = new Map<string, PendingBuild>();
  merged: MergedManifest = this.#getEmptyMerged(0);
  readonly #buildRoute: RouteBuildFn;
  readonly #onMerge?: OnMergeFn;
  #revision = 0;

  constructor({ buildRoute, onMerge }: RouteClientCacheOptions) {
    this.#buildRoute = buildRoute;
    this.#onMerge = onMerge;
  }

  /** Bumped on every change to `merged`, even a delta merge that keeps `generation`: a memo key for derived work. */
  get revision(): number {
    return this.#revision;
  }

  #getEmptyDelta(): BuildRouteClientResult {
    return {
      manifestDelta: {},
      ssrManifestDelta: { moduleLoading: null, moduleMap: {} },
      newEntries: [],
      clientDeps: [],
    };
  }
  #getEmptyMerged(generation: number): MergedManifest {
    return {
      generation,
      clientManifest: {},
      ssrManifest: { moduleLoading: null, moduleMap: {} },
      knownEntries: new Set<string>(),
    };
  }
  seed(manifest: RoutesManifest): void {
    Object.assign(this.merged.clientManifest, manifest.clientManifest);
    Object.assign(this.merged.ssrManifest.moduleMap, manifest.ssrManifest.moduleMap);
    for (const abs of manifest.knownEntries) this.merged.knownEntries.add(abs);
    for (const routeId of manifest.routeIds) this.#built.set(routeId, this.#getEmptyDelta());
    this.#revision += 1;
  }

  //? An invalidation that lands mid-build drops that build, and a render from the manifest it leaves would name client
  //? references the manifest no longer holds (an RSC error row): so the route builds again at the new generation.
  async ensure(routeId: string, seeds: string[]): Promise<MergedManifest> {
    for (let attempt = 0; attempt < RouteClientCache.#maxEnsureAttempts && !this.#built.has(routeId); attempt += 1) {
      const existing = this.#building.get(routeId);
      if (existing && existing.generation === this.merged.generation) {
        await existing.promise;
        continue;
      }
      const generation = this.merged.generation;
      const promise = this.#runBuild(routeId, seeds, generation);
      this.#building.set(routeId, { generation, promise });
      try {
        await promise;
      } finally {
        const current = this.#building.get(routeId);
        if (current?.promise === promise) this.#building.delete(routeId);
      }
    }
    return this.merged;
  }

  snapshot(): MergedManifest {
    return {
      generation: this.merged.generation,
      clientManifest: { ...this.merged.clientManifest },
      ssrManifest: {
        moduleLoading: this.merged.ssrManifest.moduleLoading,
        moduleMap: Object.fromEntries(
          Object.entries(this.merged.ssrManifest.moduleMap).map(([url, byName]) => [url, { ...byName }]),
        ),
      },
      knownEntries: new Set(this.merged.knownEntries),
    };
  }

  async #runBuild(routeId: string, seeds: string[], generation: number): Promise<BuildRouteClientResult> {
    const started = Date.now();
    const knownEntries = new Set(this.merged.knownEntries);
    this.#logger.verbose(`[route-cache] build start routeId=${routeId} generation=${generation} seeds=${seeds.length}`);
    const delta = await this.#buildRoute(routeId, { seeds, knownEntries, generation });
    if (this.merged.generation !== generation) {
      this.#logger.verbose(
        `[route-cache] stale build ignored routeId=${routeId} generation=${generation} current=${this.merged.generation}`,
      );
      return delta;
    }
    for (const [key, row] of Object.entries(delta.manifestDelta)) {
      const previous = this.merged.clientManifest[key];
      if (previous && previous.id !== row.id) delete this.merged.ssrManifest.moduleMap[previous.id];
      this.merged.clientManifest[key] = row;
    }
    for (const [url, byName] of Object.entries(delta.ssrManifestDelta.moduleMap))
      this.merged.ssrManifest.moduleMap[url] = byName;
    for (const entry of delta.newEntries) this.merged.knownEntries.add(entry);
    this.#revision += 1;
    this.#built.set(routeId, delta);
    this.#logger.verbose(
      `[route-cache] build done routeId=${routeId} generation=${generation} entries=+${delta.newEntries.length} deps=${delta.clientDeps.length} in ${Date.now() - started}ms`,
    );
    await this.#onMerge?.(routeId, { delta, merged: this.snapshot(), generation });
    return delta;
  }

  #dropBuilt(predicate: (routeId: string) => boolean): string[] {
    const dropped = [...this.#built.keys()].filter((routeId) => predicate(routeId));
    for (const id of dropped) this.#built.delete(id);
    return dropped;
  }

  invalidate(predicate: (routeId: string) => boolean): string[] {
    const dropped = this.#dropBuilt(predicate);
    if (dropped.length > 0) {
      this.#rebuildKnownEntriesPreservingManifest(this.merged.generation + 1);
      this.#building.clear();
      this.#logger.verbose(`[route-cache] invalidated ${dropped.length} routes: ${dropped.join(", ")}`);
    }
    return dropped;
  }

  invalidateClientEntries({ routePredicate, staleEntries }: InvalidateClientEntriesOptions): string[] {
    const normalizedStaleEntries = new Set([...staleEntries].map((entry) => RouteClientCache.#normalizePath(entry)));
    const dropped = this.#dropBuilt(routePredicate);
    if (dropped.length === 0 && normalizedStaleEntries.size === 0) return dropped;

    this.#rebuildKnownEntriesPreservingManifest(this.merged.generation + 1, normalizedStaleEntries);
    this.#building.clear();
    this.#logger.verbose(
      `[route-cache] client invalidated routes=${dropped.join(",") || "(none)"} entries=${normalizedStaleEntries.size}`,
    );
    return dropped;
  }

  clear(): string[] {
    const dropped = this.#dropBuilt(() => true);
    const nextGeneration = this.merged.generation + 1;
    this.merged = this.#getEmptyMerged(nextGeneration);
    this.#revision += 1;
    this.#building.clear();
    this.#logger.verbose(`[route-cache] cleared generation=${nextGeneration} dropped=${dropped.length}`);
    return dropped;
  }

  #rebuildKnownEntriesPreservingManifest(generation: number, staleEntries: Set<string> = new Set()): void {
    const staleUrls = new Set<string>();
    for (const [key, row] of Object.entries(this.merged.clientManifest)) {
      if (!RouteClientCache.#manifestKeyMatchesEntries(key, staleEntries)) continue;
      staleUrls.add(row.id);
      for (const chunk of row.chunks) staleUrls.add(chunk);
    }

    const next: MergedManifest = {
      generation,
      clientManifest: Object.fromEntries(
        Object.entries(this.merged.clientManifest).filter(
          ([key, row]) => !RouteClientCache.#manifestKeyMatchesEntries(key, staleEntries) && !staleUrls.has(row.id),
        ),
      ),
      ssrManifest: {
        moduleLoading: this.merged.ssrManifest.moduleLoading,
        moduleMap: Object.fromEntries(
          Object.entries(this.merged.ssrManifest.moduleMap)
            .filter(([url]) => !staleUrls.has(url))
            .map(([url, byName]) => [url, { ...byName }]),
        ),
      },
      knownEntries: new Set(
        [...this.merged.knownEntries].filter((entry) => !staleEntries.has(RouteClientCache.#normalizePath(entry))),
      ),
    };
    this.merged = next;
    this.#revision += 1;
  }

  static #normalizePath(filePath: string): string {
    return filePath.split("\\").join("/");
  }

  static #manifestKeyMatchesEntries(key: string, entries: Set<string>): boolean {
    if (entries.size === 0) return false;
    const hashIdx = key.lastIndexOf("#");
    const entryKey = hashIdx >= 0 ? key.slice(0, hashIdx) : key;
    return entries.has(RouteClientCache.#normalizePath(entryKey));
  }
}
