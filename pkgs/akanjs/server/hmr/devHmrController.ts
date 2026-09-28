import fs from "node:fs";
import path from "node:path";
import { Logger } from "akanjs/common";
import {
  BuilderRpc,
  type ClientManifest,
  type DevBuildStatus,
  type HmrTrace,
  RouteClientCache,
  type RouteSeedIndex,
  RouteSeedIndexStore,
} from "../artifact";
import type { RscWorker } from "../rscWorkerHost";
import type { RenderState } from "../types";
import { CSR_DEV_DIRNAME, CSR_DEV_MANIFEST_FILE, type CsrDevManifest, SSR_DEV_DIRNAME } from "./csrDevManifest";
import { isAkanRuntimeMetadataFile } from "./runtimeMetadataFile";
import { type SsrUpdateMessage, SsrUpdateQueue } from "./ssrUpdateQueue";
import { type ChangeKind, type HmrMessage, type HmrWsData, HmrWsHub } from "./wsHub";

export { isAkanRuntimeMetadataFile };

export function manifestClientEntriesForFiles(
  files: string[],
  clientManifest: ClientManifest,
  workspaceRoot = process.cwd(),
): Set<string> {
  const normalizedFiles = new Set(files.map((file) => path.resolve(file)));
  const entries = new Set<string>();
  for (const key of Object.keys(clientManifest)) {
    const hashIdx = key.lastIndexOf("#");
    const entryKey = hashIdx >= 0 ? key.slice(0, hashIdx) : key;
    const resolved = path.isAbsolute(entryKey) ? path.resolve(entryKey) : path.resolve(workspaceRoot, entryKey);
    if (normalizedFiles.has(resolved)) entries.add(resolved);
  }
  return entries;
}

export function devBuildStatusToHmrMessage(
  status: DevBuildStatus,
  previous?: DevBuildStatus,
): Extract<HmrMessage, { type: "build-status" }> | null {
  if (!status.ok) {
    return {
      type: "build-status",
      status: "error",
      generation: status.generation,
      phase: status.phase,
      message: status.message,
      files: status.files.length,
    };
  }
  if (!previous || previous.ok) return null;
  const recovered =
    status.phase === "backend" ? status.generation >= previous.generation : status.generation > previous.generation;
  if (!recovered) return null;
  return {
    type: "build-status",
    status: "ok",
    generation: status.generation,
    phase: status.phase,
    message: status.message,
    files: status.files.length,
  };
}

export interface DevHmrControllerOptions {
  artifactDir: string;
  renderState: RenderState;
  rsc: RscWorker;
  seedIndex: RouteSeedIndex;
  upgradeHmrWs: (req: Request, data: HmrWsData) => boolean;
}

export class DevHmrController {
  readonly #logger = new Logger("DevHmrController");
  readonly #artifactDir: string;
  readonly #renderState: RenderState;
  readonly #rsc: RscWorker;
  readonly #seedIndex: RouteSeedIndex;
  readonly #upgradeHmrWs: (req: Request, data: HmrWsData) => boolean;
  readonly #hub = new HmrWsHub();
  readonly #ssrUpdates = new SsrUpdateQueue((message) => this.#sendSsrUpdate(message));
  readonly #builderRpc: BuilderRpc;
  readonly routeCache: RouteClientCache;
  readonly #recentClientEntries = new Set<string>();
  readonly #clientFileRouteIds = new Map<string, Set<string>>();
  readonly #clientFileEntries = new Map<string, Set<string>>();
  readonly #clientEntryRouteIds = new Map<string, Set<string>>();
  readonly #clientEntriesByRouteId = new Map<string, Set<string>>();
  readonly #dirty = new Set<Exclude<ChangeKind, "ignore">>();
  readonly #dirtyFiles = new Set<string>();
  readonly #buildStatusByPhase = new Map<DevBuildStatus["phase"], DevBuildStatus>();
  #graphSeeds: string[];

  constructor({ artifactDir, renderState, rsc, seedIndex, upgradeHmrWs }: DevHmrControllerOptions) {
    this.#artifactDir = artifactDir;
    this.#renderState = renderState;
    this.#rsc = rsc;
    this.#seedIndex = seedIndex;
    this.#graphSeeds = DevHmrController.#graphSeedsOf(seedIndex);
    this.#upgradeHmrWs = upgradeHmrWs;
    this.#renderState.csrGeneration ??= DevHmrController.#readManifest(artifactDir, CSR_DEV_DIRNAME)?.generation;
    const ssrManifest = DevHmrController.#readManifest(artifactDir, SSR_DEV_DIRNAME);
    this.#renderState.ssrGeneration ??= ssrManifest?.generation;
    this.#renderState.ssrEpoch ??= ssrManifest?.epoch;
    this.#builderRpc = this.#createBuilderRpc();
    this.routeCache = this.#createRouteCache();
  }

  // A restarted backend must still tell an open tab which registry generation is current, before any new build lands.
  static #readManifest(artifactDir: string, dirName: string): Partial<CsrDevManifest> | undefined {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(artifactDir, dirName, CSR_DEV_MANIFEST_FILE), "utf8"),
      ) as Partial<CsrDevManifest>;
    } catch {
      // No registry bundle has been built yet.
      return undefined;
    }
  }

  get hub(): HmrWsHub {
    return this.#hub;
  }

  get builderRpc(): BuilderRpc {
    return this.#builderRpc;
  }

  dispose(): void {
    this.#builderRpc.dispose();
  }

  handleWs(req: Request): Response | undefined {
    const client = new URL(req.url).searchParams.get("client") === "csr" ? "csr" : "ssr";
    if (this.#upgradeHmrWs(req, { kind: "akan-hmr", openedAt: Date.now(), client })) return;
    return new Response("Failed to upgrade HMR WebSocket", { status: 500 });
  }

  async ensureRoute(url: URL) {
    const started = Date.now();
    const matched =
      RouteSeedIndexStore.match(url.pathname, this.#seedIndex.entries) ??
      RouteSeedIndexStore.matchPrefix(url.pathname, this.#seedIndex.entries);
    if (matched) await this.routeCache.ensure(matched.entry.routeId, matched.entry.seeds);
    this.#logger.verbose(
      `[route-cache] ensure pathname=${url.pathname} routeId=${matched?.entry.routeId ?? "(none)"} in ${Date.now() - started}ms`,
    );
    return this.routeCache.snapshot();
  }

  routeIdsForPath(pathname: string): string[] | undefined {
    const matched = RouteSeedIndexStore.match(pathname, this.#seedIndex.entries);
    return matched ? [matched.entry.routeId] : undefined;
  }

  #sendSsrUpdate(message: SsrUpdateMessage): void {
    this.#renderState.ssrGeneration = message.generation;
    this.#hub.broadcast({ ...message, trace: DevHmrController.#broadcastTrace(message.trace) });
  }

  static #broadcastTrace(trace: HmrTrace | undefined): HmrTrace | undefined {
    return trace ? { ...trace, broadcastAt: Date.now() } : undefined;
  }

  #createBuilderRpc() {
    return new BuilderRpc({
      onInvalidate: (ev) => {
        this.#recordInvalidate(ev.files, new Set(ev.kinds), ev.generation);
      },
      onBuildStatus: (status) => {
        this.#recordBuildStatus(status);
        // The server output cannot change now; the overlay says why, and client edits must not wait for a fix.
        if (status.phase === "pages" && !status.ok) this.#ssrUpdates.release(status.generation);
      },
      onCsrUpdated: (update) => {
        this.#renderState.csrGeneration = update.generation;
        this.#hub.broadcast({
          type: "csr-update",
          generation: update.generation,
          url: update.patchUrl,
          changedIds: update.changedIds,
          reload: update.reload,
          reason: update.reason,
          trace: DevHmrController.#broadcastTrace(update.trace),
        });
        this.#logger.verbose(
          `[csr] ${update.mode} generation=${update.generation} ${update.reload ? `reload (${update.reason ?? "no reason"})` : `patch modules=${update.changedIds?.length ?? 0}`}`,
        );
      },
      onSsrUpdated: (update) => {
        if (update.epoch !== undefined) this.#renderState.ssrEpoch = update.epoch;
        if (update.first) {
          this.#renderState.ssrGeneration = update.generation;
          this.#logger.verbose(`[ssr] registry built generation=${update.generation}`);
          return;
        }
        this.#ssrUpdates.push(update);
        this.#logger.verbose(
          `[ssr] registry generation=${update.generation} ${update.reload ? `reload (${update.reason ?? "no reason"})` : `patch modules=${update.changedIds?.length ?? 0}`}${this.#ssrUpdates.size > 0 ? ` held=${this.#ssrUpdates.size} until the pages build of batch ${update.batchGeneration ?? "?"}` : ""}`,
        );
      },
      onCssUpdated: (css) => {
        const started = Date.now();
        const cssBytesByUrl = Object.fromEntries(
          Object.entries(css.cssBase64ByUrl ?? {}).map(([cssUrl, base64]) => [
            cssUrl,
            new Uint8Array(Buffer.from(base64, "base64")),
          ]),
        );
        this.#renderState.cssAssets = css.cssAssets ?? {};
        this.#renderState.cssBytesByUrl = cssBytesByUrl;
        this.#rsc.updateCssAssets(this.#renderState.cssAssets);
        this.#hub.broadcast({ type: "css-update", cssAssets: this.#renderState.cssAssets });
        this.#logger.verbose(
          `css-update assets=${Object.keys(this.#renderState.cssAssets).length} generation=${css.generation ?? "(unknown)"} files=${css.changedFiles?.length ?? 0} in ${Date.now() - started}ms (ipc)`,
        );
      },
      onPagesUpdated: async ({ bundlePath, buildId, generation, changedFiles, trace, serverTouched }) => {
        const started = Date.now();
        const files = changedFiles ?? [];
        const routeTreeChanged = await this.#reloadSeedIndex();
        const runtimeMetadataChanged = files.some(isAkanRuntimeMetadataFile);
        const clearAll = routeTreeChanged || runtimeMetadataChanged;
        const staleClientEntries = clearAll ? new Set<string>() : this.#staleClientEntriesForFiles(files);
        const routeIds = clearAll ? undefined : this.#routeIdsForFiles(files, staleClientEntries);
        this.#logger.verbose(
          `[SSR] pages-updated bundlePath=${bundlePath} buildId=${buildId} generation=${generation ?? "(unknown)"} files=${files.length} routes=${routeIds?.length ?? 0} serverTouched=${serverTouched ?? "(unknown)"} staleEntries=${staleClientEntries.size} runtimeMetadata=${runtimeMetadataChanged} routeTree=${routeTreeChanged}`,
        );
        const dropped = this.#invalidateRoutes(files, routeIds, staleClientEntries, { forceClear: clearAll });
        this.#renderState.buildId = buildId;
        const manifest = this.routeCache.snapshot();
        const reloadStarted = Date.now();
        await this.#rsc.reload({
          clientManifest: manifest.clientManifest,
          cssAssets: this.#renderState.cssAssets,
          buildId,
          pagesBundlePath: bundlePath,
        });
        this.#logger.verbose(`[SSR] rsc reload buildId=${buildId} in ${Date.now() - reloadStarted}ms`);
        const shouldReload = clearAll || this.#shouldFullReloadForFiles(files, routeIds);
        const broadcastTrace = DevHmrController.#broadcastTrace(trace);
        if (shouldReload) this.#ssrUpdates.clear();
        else this.#ssrUpdates.release(generation);
        if (shouldReload) this.#hub.broadcast({ type: "reload", buildId });
        // The SSR registry already patched the tabs: a client module is only references by name to the server.
        else if (serverTouched === false)
          this.#logger.verbose(
            `[hmr] generation=${generation} changed nothing the server renders; the registry patched it`,
          );
        else
          this.#hub.broadcast({
            type: "rsc-refresh",
            buildId,
            generation,
            changedFiles,
            routeIds,
            trace: broadcastTrace,
          });
        this.#logger.verbose(
          `[hmr] backend apply buildId=${buildId} dropped=${dropped.length} routeGeneration=${manifest.generation} in ${Date.now() - started}ms`,
        );
      },
    });
  }

  // Adopted in place: WebRouter matches requests against this same object.
  async #reloadSeedIndex(): Promise<boolean> {
    const next = await RouteSeedIndexStore.load(this.#artifactDir).catch((err: unknown) => {
      this.#logger.warn(`[hmr] route seed index unreadable; keeping the boot one: ${String(err)}`);
      return null;
    });
    if (!next || JSON.stringify(next) === JSON.stringify(this.#seedIndex)) return false;
    Object.assign(this.#seedIndex, next);
    this.#graphSeeds = DevHmrController.#graphSeedsOf(next);
    return true;
  }

  static #graphSeedsOf(seedIndex: RouteSeedIndex): string[] {
    return [...new Set([...seedIndex.globalLayoutFiles, ...seedIndex.entries.flatMap((e) => e.seeds)])];
  }

  #recordBuildStatus(status: DevBuildStatus): void {
    const previous = this.#buildStatusByPhase.get(status.phase);
    this.#buildStatusByPhase.set(status.phase, status);
    const message = devBuildStatusToHmrMessage(status, previous);
    if (!message) return;
    this.#hub.broadcast(message);
    this.#logger.verbose(
      `[hmr] build-status status=${message.status} generation=${message.generation} phase=${message.phase} files=${message.files ?? 0}`,
    );
  }

  #createRouteCache() {
    return new RouteClientCache({
      buildRoute: async (routeId, { seeds, knownEntries, generation }) => {
        const expandedSeeds = [...new Set([...this.#seedIndex.globalLayoutFiles, ...seeds])];
        return this.#builderRpc.buildRoute(routeId, {
          seeds: expandedSeeds,
          graphSeeds: this.#graphSeeds,
          knownEntries,
          generation,
        });
      },
      onMerge: async (routeId, { delta, merged, generation }) => {
        const removedEntries = this.#rememberClientEntries(routeId, delta.discoveredEntries ?? delta.newEntries);
        let nextMerged = merged;
        if (removedEntries.size > 0) {
          this.routeCache.invalidateClientEntries({
            routePredicate: () => false,
            staleEntries: this.#clientEntryManifestKeys(removedEntries),
          });
          nextMerged = this.routeCache.snapshot();
        }
        if (delta.newEntries.length === 0 && removedEntries.size === 0) return;
        this.#rememberClientDeps(routeId, delta.clientDeps, delta.clientDepsByEntry);
        await this.#rsc.reload({
          clientManifest: nextMerged.clientManifest,
          cssAssets: this.#renderState.cssAssets,
          buildId: this.#renderState.buildId,
        });
        this.#logger.verbose(
          `[SSR] route manifest merged routeId=${routeId} generation=${generation} entries=+${delta.newEntries.length} deps=${delta.clientDeps.length}`,
        );
      },
    });
  }

  #recordInvalidate(files: string[], kinds: Set<Exclude<ChangeKind, "ignore">>, generation?: number) {
    if (kinds.has("code")) this.#invalidateClientEntriesEarly(files);
    for (const k of kinds) this.#dirty.add(k);
    for (const file of files) this.#dirtyFiles.add(file);
    if (this.#dirty.has("config")) {
      this.#logger.verbose(`[hmr] config file changed — restart the server manually to apply: ${files.join(", ")}`);
      this.#dirty.delete("config");
      if (this.#dirty.size === 0) {
        this.#dirtyFiles.clear();
        return;
      }
    }
    if (this.#dirty.size === 1 && this.#dirty.has("css")) {
      this.#logger.verbose(
        `[hmr] css invalidate generation=${generation ?? "(unknown)"} files=${this.#dirtyFiles.size}; waiting for css-update`,
      );
      this.#dirty.clear();
      this.#dirtyFiles.clear();
      return;
    }
    this.#logger.verbose(
      `[hmr] invalidate recorded generation=${generation ?? "(unknown)"} kinds=${[...this.#dirty].join(",")} files=${this.#dirtyFiles.size}; waiting for rebuild event`,
    );
    this.#dirty.clear();
    this.#dirtyFiles.clear();
  }

  //? The registry patches a tab long before this save's pages build lands; a page loaded in between must not render
  //? its HTML from client-ssr chunks older than the registry it hydrates with, so its route builds again first.
  #invalidateClientEntriesEarly(files: string[]): void {
    const staleClientEntries = this.#staleClientEntriesForFiles(files);
    if (staleClientEntries.size === 0) return;
    const routeIds = this.#routeIdsForFiles(files, staleClientEntries);
    this.routeCache.invalidateClientEntries({
      routePredicate: (routeId) => !routeIds || routeIds.includes(routeId),
      staleEntries: this.#clientEntryManifestKeys(staleClientEntries),
    });
  }

  #invalidateRoutes(
    files: string[],
    routeIds: string[] | undefined,
    staleClientEntries = new Set<string>(),
    { forceClear = false }: { forceClear?: boolean } = {},
  ): string[] {
    this.#dirty.clear();
    this.#dirtyFiles.clear();
    if (forceClear) return this.routeCache.clear();
    if (staleClientEntries.size > 0) {
      const staleKeys = this.#clientEntryManifestKeys(staleClientEntries);
      return this.routeCache.invalidateClientEntries({
        routePredicate: (routeId) => !routeIds || routeIds.includes(routeId),
        staleEntries: staleKeys,
      });
    }
    if (!routeIds || this.#shouldClearAllRoutes(files, routeIds)) return this.routeCache.clear();
    return this.routeCache.invalidate((routeId) => routeIds.includes(routeId));
  }

  #routeIdsForFiles(files: string[], staleClientEntries = new Set<string>()): string[] | undefined {
    if (files.length === 0) return undefined;
    const normalized = new Set(files.map((file) => path.resolve(file)));
    if (this.#seedIndex.globalLayoutFiles.some((file) => normalized.has(path.resolve(file)))) {
      return this.#seedIndex.entries.map((entry) => entry.routeId);
    }
    const routeIds = this.#seedIndex.entries
      .filter((entry) => entry.seeds.some((seed) => normalized.has(path.resolve(seed))))
      .map((entry) => entry.routeId);
    for (const file of normalized) {
      for (const routeId of this.#clientFileRouteIds.get(file) ?? []) routeIds.push(routeId);
    }
    for (const entry of staleClientEntries) {
      for (const routeId of this.#clientEntryRouteIds.get(path.resolve(entry)) ?? []) routeIds.push(routeId);
    }
    const unique = [...new Set(routeIds)];
    return unique.length > 0 ? unique : undefined;
  }

  #rememberClientDeps(routeId: string, deps: string[], depsByEntry: Record<string, string[]> = {}) {
    for (const [entry, entryDeps] of Object.entries(depsByEntry)) {
      const resolvedEntry = path.resolve(entry);
      this.#recentClientEntries.add(resolvedEntry);
      DevHmrController.#addTo(this.#clientEntryRouteIds, resolvedEntry, routeId);
      for (const dep of entryDeps) {
        DevHmrController.#addTo(this.#clientFileEntries, path.resolve(dep), resolvedEntry);
      }
    }
    for (const dep of deps) DevHmrController.#addTo(this.#clientFileRouteIds, path.resolve(dep), routeId);
  }

  static #addTo(map: Map<string, Set<string>>, key: string, value: string) {
    map.set(key, (map.get(key) ?? new Set<string>()).add(value));
  }

  #rememberClientEntries(routeId: string, entries: string[]): Set<string> {
    const nextEntries = new Set(entries.map((entry) => path.resolve(entry)));
    const previousEntries = this.#clientEntriesByRouteId.get(routeId) ?? new Set<string>();
    const removedEntries = new Set([...previousEntries].filter((entry) => !nextEntries.has(entry)));
    const orphanedEntries = new Set<string>();
    this.#clientEntriesByRouteId.set(routeId, nextEntries);
    for (const removedEntry of removedEntries) {
      this.#dropClientEntryRoute(routeId, removedEntry);
      if (!this.#clientEntryRouteIds.has(removedEntry)) {
        orphanedEntries.add(removedEntry);
        this.#recentClientEntries.delete(removedEntry);
      }
    }
    for (const entry of entries) {
      const resolvedEntry = path.resolve(entry);
      this.#recentClientEntries.add(resolvedEntry);
      DevHmrController.#addTo(this.#clientEntryRouteIds, resolvedEntry, routeId);
    }
    return orphanedEntries;
  }

  #dropClientEntryRoute(routeId: string, entry: string) {
    const routeIds = this.#clientEntryRouteIds.get(entry);
    routeIds?.delete(routeId);
    if (routeIds?.size === 0) this.#clientEntryRouteIds.delete(entry);
  }

  #staleClientEntriesForFiles(files: string[]): Set<string> {
    const stale = manifestClientEntriesForFiles(files, this.routeCache.merged.clientManifest);
    for (const file of files) {
      const resolved = path.resolve(file);
      if (this.#recentClientEntries.has(resolved)) stale.add(resolved);
      for (const entry of this.#clientFileEntries.get(resolved) ?? []) stale.add(path.resolve(entry));
    }
    return stale;
  }

  #clientEntryManifestKeys(entries: Set<string>): Set<string> {
    const keys = new Set<string>();
    const workspaceRoot = process.cwd();
    for (const entry of entries) {
      const resolved = path.resolve(entry);
      keys.add(resolved);
      keys.add(path.relative(workspaceRoot, resolved).split(path.sep).join("/"));
    }
    return keys;
  }

  #shouldClearAllRoutes(files: string[], routeIds: string[]): boolean {
    if (routeIds.length >= this.#seedIndex.entries.length) return true;
    const normalized = new Set(files.map((file) => path.resolve(file)));
    return this.#seedIndex.globalLayoutFiles.some((file) => normalized.has(path.resolve(file)));
  }

  #shouldFullReloadForFiles(files: string[], routeIds: string[] | undefined): boolean {
    if (files.length === 0) return false;
    const runtimeRoots = [
      `${path.sep}pkgs${path.sep}akanjs${path.sep}server${path.sep}hmr${path.sep}`,
      `${path.sep}pkgs${path.sep}akanjs${path.sep}server${path.sep}rscClient.tsx`,
      `${path.sep}pkgs${path.sep}akanjs${path.sep}server${path.sep}ssrFromRscRenderer.tsx`,
    ];
    if (files.some((file) => runtimeRoots.some((needle) => path.resolve(file).includes(needle)))) return true;
    if (files.some((file) => path.basename(file).endsWith(".signal.ts"))) return true;

    // An unindexed page file is likely a route the seed index has not picked up (its reload failed): reload fully.
    return (
      routeIds === undefined &&
      files.some((file) => path.resolve(file).includes(`${path.sep}page${path.sep}`) && /\.(tsx|ts|jsx|js)$/.test(file))
    );
  }
}
