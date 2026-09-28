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
  /** The saved files behind it: a build still running that bundled one of them is built again. */
  files?: Iterable<string>;
  /** The save batch behind it: a route build whose discovery had taken that batch in is neither dropped nor rebuilt. */
  batch?: number;
}
interface Invalidation {
  /** The generation it moved the cache to: only a build started before it is checked against it. */
  generation: number;
  cleared: boolean;
  routePredicate: (routeId: string) => boolean;
  /** Its stale entries and saved files, normalized. */
  touched: Set<string>;
  batch?: number;
}

export class RouteClientCache {
  static readonly #minEnsureAttempts = 3;
  static readonly #ensureBudgetMs = 15_000;
  readonly #logger = new Logger("RouteClientCache");
  readonly #built = new Map<string, BuildRouteClientResult>();
  readonly #building = new Map<string, PendingBuild>();
  merged: MergedManifest = this.#getEmptyMerged(0);
  readonly #buildRoute: RouteBuildFn;
  readonly #onMerge?: OnMergeFn;
  #revision = 0;
  #invalidations: Invalidation[] = [];

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

  //? A build an invalidation overtook is dropped, since a render from the manifest it leaves would name client references
  //? the manifest no longer holds (an RSC error row): so the route builds again at the new generation.
  async ensure(routeId: string, seeds: string[]): Promise<MergedManifest> {
    const started = Date.now();
    const deadline = started + RouteClientCache.#ensureBudgetMs;
    const within = (attempt: number) => attempt < RouteClientCache.#minEnsureAttempts || Date.now() < deadline;
    let attempt = 0;
    for (; within(attempt) && !this.#built.has(routeId); attempt += 1) {
      const existing = this.#building.get(routeId);
      if (existing) {
        // A build from before a save that failed is not this caller's error: the loop builds again at this generation.
        if (existing.generation === this.merged.generation) await existing.promise;
        else await existing.promise.catch(() => undefined);
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
        this.#prune();
      }
    }
    if (attempt > 1)
      this.#logger.verbose(
        `[route-cache] ensure routeId=${routeId} took ${attempt} attempts in ${Date.now() - started}ms${this.#built.has(routeId) ? "" : "; rendering without it"}`,
      );
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
    if (this.merged.generation !== generation && this.#overtaken(routeId, generation, delta)) {
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

  invalidate(
    predicate: (routeId: string) => boolean,
    { files = [], batch }: { files?: Iterable<string>; batch?: number } = {},
  ): string[] {
    const spared = this.#sparedBy(batch);
    const routePredicate = (routeId: string) => predicate(routeId) && !spared.has(routeId);
    const dropped = this.#dropBuilt(routePredicate);
    const touched = RouteClientCache.#normalizeAll(files);
    if (dropped.length === 0 && !this.#mayOvertake(routePredicate, touched)) return dropped;
    this.#rebuildKnownEntriesPreservingManifest(this.merged.generation + 1);
    this.#record({ routePredicate, touched, batch });
    this.#logger.verbose(`[route-cache] invalidated ${dropped.length} routes: ${dropped.join(", ")}`);
    return dropped;
  }

  invalidateClientEntries({
    routePredicate,
    staleEntries,
    files = [],
    batch,
  }: InvalidateClientEntriesOptions): string[] {
    const spared = this.#sparedBy(batch);
    //? A spared build wrote those entries' rows after the save, so they stay; a key may be workspace-relative.
    const fresh = [...spared.values()].flatMap((delta) => [...RouteClientCache.#reachedOf(delta)]);
    const normalizedStaleEntries = new Set(
      [...RouteClientCache.#normalizeAll(staleEntries)].filter(
        (entry) => !fresh.some((file) => file === entry || file.endsWith(`/${entry}`)),
      ),
    );
    const touched = new Set([...normalizedStaleEntries, ...RouteClientCache.#normalizeAll(files)]);
    const predicate = (routeId: string) => routePredicate(routeId) && !spared.has(routeId);
    const dropped = this.#dropBuilt(predicate);
    if (dropped.length === 0 && normalizedStaleEntries.size === 0 && !this.#mayOvertake(predicate, touched))
      return dropped;

    this.#rebuildKnownEntriesPreservingManifest(this.merged.generation + 1, normalizedStaleEntries);
    this.#record({ routePredicate: predicate, touched, batch });
    this.#logger.verbose(
      `[route-cache] client invalidated routes=${dropped.join(",") || "(none)"} entries=${normalizedStaleEntries.size}${spared.size > 0 ? ` kept=${[...spared.keys()].join(",")}` : ""}`,
    );
    return dropped;
  }

  //? Built after the builder had taken this batch's files into its client-entry discovery: it read every file of the
  //? batch as saved, so dropping it would build the same result again (about 1.5s on apps/akan before a first page).
  #sparedBy(batch: number | undefined): Map<string, BuildRouteClientResult> {
    if (batch === undefined) return new Map();
    return new Map([...this.#built].filter(([, delta]) => (delta.seenGeneration ?? -1) >= batch));
  }

  static #reachedOf(delta: BuildRouteClientResult): Set<string> {
    return RouteClientCache.#normalizeAll([
      ...(delta.discoveredEntries ?? []),
      ...delta.newEntries,
      ...delta.clientDeps,
      ...Object.values(delta.clientDepsByEntry ?? {}).flat(),
    ]);
  }

  clear(): string[] {
    const dropped = this.#dropBuilt(() => true);
    const nextGeneration = this.merged.generation + 1;
    this.merged = this.#getEmptyMerged(nextGeneration);
    this.#revision += 1;
    this.#record({ cleared: true, routePredicate: () => true, touched: new Set() });
    this.#logger.verbose(`[route-cache] cleared generation=${nextGeneration} dropped=${dropped.length}`);
    return dropped;
  }

  //? With nothing dropped only a running build can be affected: one the predicate names, or one that read a saved
  //? file, which as the first build to reach it no entry maps yet.
  #mayOvertake(predicate: (routeId: string) => boolean, touched: Set<string>): boolean {
    return this.#building.size > 0 && (touched.size > 0 || [...this.#building.keys()].some(predicate));
  }

  #record({
    cleared = false,
    routePredicate,
    touched,
    batch,
  }: Omit<Invalidation, "generation" | "cleared"> & { cleared?: boolean }) {
    this.#invalidations.push({ generation: this.merged.generation, cleared, routePredicate, touched, batch });
    this.#prune();
  }

  // Only a running build is checked against the log, and none of them started before the oldest one.
  #prune(): void {
    let oldest = Number.POSITIVE_INFINITY;
    for (const pending of this.#building.values()) oldest = Math.min(oldest, pending.generation);
    this.#invalidations = this.#invalidations.filter((invalidation) => invalidation.generation > oldest);
  }

  //? A save that dropped neither this route nor anything the build reached leaves its result good: merged, not thrown
  //? away, so a save during a navigation no longer costs an unrelated route a second build (about 1.5s on apps/akan).
  #overtaken(routeId: string, since: number, delta: BuildRouteClientResult): boolean {
    const reached = RouteClientCache.#reachedOf(delta);
    return this.#invalidations.some(
      (invalidation) =>
        invalidation.generation > since &&
        !(invalidation.batch !== undefined && (delta.seenGeneration ?? -1) >= invalidation.batch) &&
        (invalidation.cleared ||
          invalidation.routePredicate(routeId) ||
          (!delta.discoveredEntries && invalidation.touched.size > 0) ||
          [...invalidation.touched].some((file) => reached.has(file))),
    );
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

  static #normalizeAll(filePaths: Iterable<string>): Set<string> {
    return new Set([...filePaths].map((filePath) => RouteClientCache.#normalizePath(filePath)));
  }

  static #manifestKeyMatchesEntries(key: string, entries: Set<string>): boolean {
    if (entries.size === 0) return false;
    const hashIdx = key.lastIndexOf("#");
    const entryKey = hashIdx >= 0 ? key.slice(0, hashIdx) : key;
    return entries.has(RouteClientCache.#normalizePath(entryKey));
  }
}
