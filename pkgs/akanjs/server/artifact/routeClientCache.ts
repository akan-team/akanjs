import { Logger } from "akanjs/common";
import type { SsrManifest } from "../ssrTypes";
import type { BuildRouteClientResult, ClientManifest } from "./manifestTypes";
import type { RoutesManifest } from "./routesManifestStore";

/**
 * Snapshot of every per-route build's accumulated output for one HMR
 * generation. Callers should take a `snapshot()` before rendering so an
 * invalidate cannot mutate the manifest while a request is consuming it.
 */
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
  readonly #logger = new Logger("RouteClientCache");
  readonly #built = new Map<string, BuildRouteClientResult>();
  readonly #building = new Map<string, PendingBuild>();
  merged: MergedManifest = {
    generation: 0,
    clientManifest: {},
    ssrManifest: { moduleLoading: null, moduleMap: {} },
    knownEntries: new Set<string>(),
  };
  readonly #buildRoute: RouteBuildFn;
  readonly #onMerge?: OnMergeFn;

  constructor({ buildRoute, onMerge }: RouteClientCacheOptions) {
    this.#buildRoute = buildRoute;
    this.#onMerge = onMerge;
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
  }

  async ensure(routeId: string, seeds: string[]): Promise<MergedManifest> {
    if (this.#built.has(routeId)) return this.merged;
    const existing = this.#building.get(routeId);
    if (existing && existing.generation === this.merged.generation) {
      await existing.promise;
      return this.merged;
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
    for (const [key, row] of Object.entries(delta.manifestDelta)) this.merged.clientManifest[key] = row;
    for (const [url, byName] of Object.entries(delta.ssrManifestDelta.moduleMap))
      this.merged.ssrManifest.moduleMap[url] = byName;
    for (const entry of delta.newEntries) this.merged.knownEntries.add(entry);
    this.#built.set(routeId, delta);
    this.#logger.verbose(
      `[route-cache] build done routeId=${routeId} generation=${generation} entries=+${delta.newEntries.length} deps=${delta.clientDeps.length} in ${Date.now() - started}ms`,
    );
    await this.#onMerge?.(routeId, { delta, merged: this.snapshot(), generation });
    return delta;
  }

  invalidate(predicate: (routeId: string) => boolean): string[] {
    const dropped: string[] = [];
    for (const id of [...this.#built.keys()]) {
      if (predicate(id)) {
        this.#built.delete(id);
        dropped.push(id);
      }
    }
    if (dropped.length > 0) {
      this.#rebuildKnownEntriesPreservingManifest(this.merged.generation + 1);
      this.#building.clear();
      this.#logger.verbose(`[route-cache] invalidated ${dropped.length} routes: ${dropped.join(", ")}`);
    }
    return dropped;
  }

  invalidateClientEntries({ routePredicate, staleEntries }: InvalidateClientEntriesOptions): string[] {
    const normalizedStaleEntries = new Set([...staleEntries].map((entry) => RouteClientCache.#normalizePath(entry)));
    const dropped: string[] = [];
    for (const id of [...this.#built.keys()]) {
      if (routePredicate(id)) {
        this.#built.delete(id);
        dropped.push(id);
      }
    }
    if (dropped.length === 0 && normalizedStaleEntries.size === 0) return dropped;

    this.#rebuildKnownEntriesPreservingManifest(this.merged.generation + 1, normalizedStaleEntries);
    this.#building.clear();
    this.#logger.verbose(
      `[route-cache] client invalidated routes=${dropped.join(",") || "(none)"} entries=${normalizedStaleEntries.size}`,
    );
    return dropped;
  }

  clear(): string[] {
    const dropped: string[] = [];
    for (const id of [...this.#built.keys()]) {
      this.#built.delete(id);
      dropped.push(id);
    }
    const nextGeneration = this.merged.generation + 1;
    this.merged = this.#getEmptyMerged(nextGeneration);
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
