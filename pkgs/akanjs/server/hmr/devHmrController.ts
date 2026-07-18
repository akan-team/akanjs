import path from "node:path";
import { Logger } from "akanjs/common";
import {
  BuilderRpc,
  type ClientManifest,
  type DevBuildStatus,
  RouteClientCache,
  type RouteSeedIndex,
  RouteSeedIndexStore,
} from "../artifact";
import type { RscWorker } from "../rscWorkerHost";
import type { RenderState } from "../types";
import type { ChangeKind } from "./changeBatch";
import { type HmrMessage, type HmrWsData, HmrWsHub } from "./wsHub";

const APP_RUNTIME_METADATA_BASENAMES = new Set(["dict.ts", "sig.ts", "useClient.ts"]);

export function isAkanRuntimeMetadataFile(file: string): boolean {
  const resolved = path.resolve(file);
  const parts = resolved.split(/[\\/]+/).filter(Boolean);
  const base = parts.at(-1);
  if (!base) return false;

  const parent = parts.at(-2);
  if (parent === "lib" && APP_RUNTIME_METADATA_BASENAMES.has(base)) return true;

  const libIndex = parts.lastIndexOf("lib");
  if (libIndex < 0 || parts.length <= libIndex + 1) return false;
  return base.endsWith(".dictionary.ts") || base.endsWith(".signal.ts");
}

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
  renderState: RenderState;
  rsc: RscWorker;
  seedIndex: RouteSeedIndex;
  upgradeHmrWs: (req: Request, data: HmrWsData) => boolean;
}

export class DevHmrController {
  readonly #logger = new Logger("DevHmrController");
  readonly #renderState: RenderState;
  readonly #rsc: RscWorker;
  readonly #seedIndex: RouteSeedIndex;
  readonly #upgradeHmrWs: (req: Request, data: HmrWsData) => boolean;
  readonly #fastRefreshEnabled = process.env.AKAN_REACT_FAST_REFRESH !== "0";
  readonly #hub = new HmrWsHub();
  readonly #builderRpc: BuilderRpc;
  readonly routeCache: RouteClientCache;
  readonly #recentClientEntries = new Set<string>();
  readonly #recentClientFiles = new Set<string>();
  readonly #clientFileRouteIds = new Map<string, Set<string>>();
  readonly #clientFileEntries = new Map<string, Set<string>>();
  readonly #clientEntryRouteIds = new Map<string, Set<string>>();
  readonly #clientEntriesByRouteId = new Map<string, Set<string>>();
  readonly #dirty = new Set<Exclude<ChangeKind, "ignore">>();
  readonly #dirtyFiles = new Set<string>();
  readonly #buildStatusByPhase = new Map<DevBuildStatus["phase"], DevBuildStatus>();

  constructor({ renderState, rsc, seedIndex, upgradeHmrWs }: DevHmrControllerOptions) {
    this.#renderState = renderState;
    this.#rsc = rsc;
    this.#seedIndex = seedIndex;
    this.#upgradeHmrWs = upgradeHmrWs;
    this.#builderRpc = this.#createBuilderRpc();
    this.routeCache = this.#createRouteCache();
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

  broadcastError(message: string): void {
    this.#hub.broadcast({ type: "error", message });
  }

  handleWs(req: Request): Response | undefined {
    const upgraded = this.#upgradeHmrWs(req, { kind: "akan-hmr", openedAt: Date.now() });
    if (upgraded) return;
    return new Response("Failed to upgrade HMR WebSocket", { status: 500 });
  }

  async handleClientRefresh(req: Request): Promise<Response> {
    const started = Date.now();
    try {
      if (!this.#fastRefreshEnabled) return new Response("Fast Refresh disabled", { status: 404 });
      const reqUrl = new URL(req.url);
      const clientOrigin = DevHmrController.#clientFacingOrigin(req);
      const target = reqUrl.searchParams.get("url");
      const targetUrl = target ? new URL(target, clientOrigin) : reqUrl;
      if (!DevHmrController.#isTrustedRscTarget(clientOrigin, targetUrl))
        return new Response("Bad Request", { status: 400 });
      const manifest = await this.ensureRoute(targetUrl);
      this.#logger.verbose(
        `[hmr] client-refresh metadata route=${targetUrl.pathname} chunks=${DevHmrController.clientChunkUrls(manifest.clientManifest).length} in ${Date.now() - started}ms`,
      );
      return new Response(
        JSON.stringify({
          buildId: this.#renderState.buildId,
          generation: manifest.generation,
          chunks: DevHmrController.clientChunkUrls(manifest.clientManifest),
          routeIds: this.routeIdsForPath(targetUrl.pathname),
        }),
        { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.#logger.error(`[hmr] client-refresh metadata failed: ${message}`);
      return new Response(message, { status: 500 });
    }
  }

  async ensureRoute(url: URL) {
    const started = Date.now();
    const matched = RouteSeedIndexStore.match(url.pathname, this.#seedIndex.entries);
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

  static clientChunkUrls(clientManifest: ClientManifest): string[] {
    const urls = new Set<string>();
    for (const row of Object.values(clientManifest)) {
      urls.add(row.id);
      for (const chunk of row.chunks) {
        if (chunk.startsWith("/_akan/client/")) urls.add(chunk);
      }
    }
    return [...urls];
  }

  static shouldFullReloadForRuntimeMetadata(files: string[]): boolean {
    return files.some(isAkanRuntimeMetadataFile);
  }

  #createBuilderRpc() {
    return new BuilderRpc({
      onInvalidate: (ev) => {
        this.#recordInvalidate(ev.files, new Set(ev.kinds), ev.generation);
      },
      onBuildStatus: (status) => {
        this.#recordBuildStatus(status);
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
      onPagesUpdated: async ({ bundlePath, buildId, generation, changedFiles }) => {
        const started = Date.now();
        const files = changedFiles ?? [];
        const runtimeMetadataChanged = DevHmrController.shouldFullReloadForRuntimeMetadata(files);
        const staleClientEntries = runtimeMetadataChanged ? new Set<string>() : this.#staleClientEntriesForFiles(files);
        const routeIds = runtimeMetadataChanged ? undefined : this.#routeIdsForFiles(files, staleClientEntries);
        const fastRefreshCandidate = !runtimeMetadataChanged && this.#isFastRefreshCandidate(files);
        this.#logger.verbose(
          `[SSR] pages-updated bundlePath=${bundlePath} buildId=${buildId} generation=${generation ?? "(unknown)"} files=${files.length} routes=${routeIds?.length ?? 0} fastRefresh=${fastRefreshCandidate} staleEntries=${staleClientEntries.size} runtimeMetadata=${runtimeMetadataChanged}`,
        );
        const dropped = this.#invalidateRoutes(files, routeIds, staleClientEntries, {
          forceClear: runtimeMetadataChanged,
        });
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
        const shouldReload = runtimeMetadataChanged || this.#shouldFullReloadForFiles(files, routeIds);
        if (shouldReload) this.#hub.broadcast({ type: "reload", buildId });
        else if (fastRefreshCandidate)
          this.#hub.broadcast({ type: "client-refresh", buildId, generation, changedFiles, routeIds });
        else this.#hub.broadcast({ type: "rsc-refresh", buildId, generation, changedFiles, routeIds });
        this.#logger.verbose(
          `[hmr] backend apply buildId=${buildId} dropped=${dropped.length} routeGeneration=${manifest.generation} in ${Date.now() - started}ms`,
        );
      },
    });
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
        return this.#builderRpc.buildRoute(routeId, { seeds: expandedSeeds, knownEntries, generation });
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

  #isFastRefreshCandidate(files: string[]): boolean {
    if (!this.#fastRefreshEnabled || files.length === 0) return false;
    if (manifestClientEntriesForFiles(files, this.routeCache.merged.clientManifest).size > 0) return true;
    return files.some((file) => {
      const resolved = path.resolve(file);
      return this.#recentClientEntries.has(resolved) || this.#recentClientFiles.has(resolved);
    });
  }

  #rememberClientDeps(routeId: string, deps: string[], depsByEntry: Record<string, string[]> = {}) {
    for (const [entry, entryDeps] of Object.entries(depsByEntry)) {
      const resolvedEntry = path.resolve(entry);
      this.#recentClientEntries.add(resolvedEntry);
      const entryRouteIds = this.#clientEntryRouteIds.get(resolvedEntry) ?? new Set<string>();
      entryRouteIds.add(routeId);
      this.#clientEntryRouteIds.set(resolvedEntry, entryRouteIds);
      for (const dep of entryDeps) {
        const resolvedDep = path.resolve(dep);
        this.#recentClientFiles.add(resolvedDep);
        const entries = this.#clientFileEntries.get(resolvedDep) ?? new Set<string>();
        entries.add(resolvedEntry);
        this.#clientFileEntries.set(resolvedDep, entries);
      }
    }
    for (const dep of deps) {
      const resolved = path.resolve(dep);
      this.#recentClientFiles.add(resolved);
      const routeIds = this.#clientFileRouteIds.get(resolved) ?? new Set<string>();
      routeIds.add(routeId);
      this.#clientFileRouteIds.set(resolved, routeIds);
    }
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
      const routeIds = this.#clientEntryRouteIds.get(resolvedEntry) ?? new Set<string>();
      routeIds.add(routeId);
      this.#clientEntryRouteIds.set(resolvedEntry, routeIds);
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
      `${path.sep}pkgs${path.sep}akanjs${path.sep}server${path.sep}src${path.sep}hmr${path.sep}`,
      `${path.sep}pkgs${path.sep}akanjs${path.sep}server${path.sep}src${path.sep}rscClient.tsx`,
      `${path.sep}pkgs${path.sep}akanjs${path.sep}server${path.sep}src${path.sep}ssrFromRscRenderer.tsx`,
    ];
    if (files.some((file) => runtimeRoots.some((needle) => path.resolve(file).includes(needle)))) return true;
    if (files.some((file) => path.basename(file).endsWith(".signal.ts"))) return true;

    // A route source file that is not in the current seed index is likely a
    // newly added route/layout. The backend's route seed index is static for
    // this process, so a full reload is the safer recovery path.
    return (
      routeIds === undefined &&
      files.some((file) => path.resolve(file).includes(`${path.sep}page${path.sep}`) && /\.(tsx|ts|jsx|js)$/.test(file))
    );
  }

  static #clientFacingOrigin(req: Request): string {
    const parsed = new URL(req.url);
    const fwdProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const fwdHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const hostFallback = fwdHost ?? req.headers.get("host");
    const protoFallback = fwdProto ?? parsed.protocol.slice(0, -1);
    if (hostFallback && protoFallback) {
      try {
        return new URL(`${protoFallback}://${hostFallback}`).origin;
      } catch {
        /* fallthrough */
      }
    }
    return parsed.origin;
  }

  static #isTrustedRscTarget(clientOrigin: string, targetUrl: URL): boolean {
    try {
      if (targetUrl.origin === clientOrigin) return true;
      return targetUrl.hostname === new URL(clientOrigin).hostname;
    } catch {
      return false;
    }
  }
}
