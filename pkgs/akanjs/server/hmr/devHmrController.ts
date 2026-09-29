import fs from "node:fs";
import path from "node:path";
import { Logger } from "akanjs/common";
import { CrossSiteGuard } from "../../signal/CrossSiteGuard";
import {
  BuilderRpc,
  type ClientManifest,
  DevBuildRecovery,
  type DevBuildStatus,
  type HmrTrace,
  RouteClientCache,
  type RouteSeedIndex,
  RouteSeedIndexStore,
} from "../artifact";
import type { RscReloadFailure, RscWorker } from "../rscWorkerHost";
import type { RenderState } from "../types";
import { CSR_DEV_DIRNAME, CSR_DEV_MANIFEST_FILE, type CsrDevManifest, SSR_DEV_DIRNAME } from "./csrDevManifest";
import { DevArtifactPruner } from "./devArtifactPruner";
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
  if (!DevBuildRecovery.recovers(previous, status)) return null;
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
  /** The pages bundle the RSC worker booted with: the base build's, however many pages builds came after it. */
  pagesBundlePath?: string;
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
  #recheckingRoute = false;
  #recheckAgain: DevBuildStatus | null = null;
  readonly #recentClientEntries = new Set<string>();
  /** File to the newest save that invalidated its routes already: that save's pages build must not drop them again. */
  readonly #earlyInvalidated = new Map<string, number>();
  readonly #clientFileRouteIds = new Map<string, Set<string>>();
  readonly #clientFileEntries = new Map<string, Set<string>>();
  readonly #clientEntryRouteIds = new Map<string, Set<string>>();
  readonly #clientEntriesByRouteId = new Map<string, Set<string>>();
  readonly #dirty = new Set<Exclude<ChangeKind, "ignore">>();
  readonly #dirtyFiles = new Set<string>();
  readonly #buildStatusByPhase = new Map<DevBuildStatus["phase"], DevBuildStatus>();
  #graphSeeds: string[];
  #runningBundlePath: string | null;
  readonly #pruner: DevArtifactPruner;

  constructor({ artifactDir, renderState, rsc, seedIndex, upgradeHmrWs, pagesBundlePath }: DevHmrControllerOptions) {
    this.#artifactDir = artifactDir;
    this.#runningBundlePath = pagesBundlePath ? path.resolve(pagesBundlePath) : null;
    this.#pruner = new DevArtifactPruner(artifactDir);
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

  //? For every hello, not only at boot: a registry build that lands while this backend is still starting reaches it as
  //? an update the dev host drops, and a tab must still learn which registry and generation are current. While a patch
  //? is held the disk is ahead of the tabs, and a tab reconnecting then would catch up past the hold: it gets the last
  //? generation sent instead.
  refreshRegistryState(): void {
    const csr = DevHmrController.#readManifest(this.#artifactDir, CSR_DEV_DIRNAME);
    if (typeof csr?.generation === "number") this.#renderState.csrGeneration = csr.generation;
    const ssr = DevHmrController.#readManifest(this.#artifactDir, SSR_DEV_DIRNAME);
    if (typeof ssr?.generation === "number" && this.#ssrUpdates.size === 0)
      this.#renderState.ssrGeneration = ssr.generation;
    if (typeof ssr?.epoch === "number") this.#renderState.ssrEpoch = ssr.epoch;
  }

  /** The phases failing now, for a socket that connects after their status went out (a page opened after a failed boot). */
  buildErrorMessages(): Extract<HmrMessage, { type: "build-status" }>[] {
    return [...this.#buildStatusByPhase.values()].flatMap((status) => {
      const message = status.ok ? null : devBuildStatusToHmrMessage(status);
      return message ? [message] : [];
    });
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
    //? Hello carries the failing build's messages and an update names the files being edited, so a page on another
    //? origin (a `--share` visitor's, or one open in the developer's browser) must not subscribe.
    try {
      CrossSiteGuard.assertOrigin(req, new URL(req.url), "hmr");
    } catch {
      return new Response("Forbidden", { status: 403 });
    }
    const client = new URL(req.url).searchParams.get("client") === "csr" ? "csr" : "ssr";
    if (this.#upgradeHmrWs(req, { kind: "akan-hmr", openedAt: Date.now(), client })) return;
    return new Response("Failed to upgrade HMR WebSocket", { status: 500 });
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
        void this.#pruner.pruneStyles(this.#renderState.cssAssets);
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
        const lateFiles = files.filter((file) => !this.#earlyInvalidated.has(path.resolve(file)));
        //? Every save up to this generation is in the bundle, a failed build's included; a newer one keeps its entry.
        for (const [file, early] of this.#earlyInvalidated)
          if (generation === undefined || early <= generation) this.#earlyInvalidated.delete(file);
        const staleClientEntries = clearAll ? new Set<string>() : this.#staleClientEntriesForFiles(lateFiles);
        const routeIds = clearAll ? undefined : this.#routeIdsForFiles(files, staleClientEntries);
        this.#logger.verbose(
          `[SSR] pages-updated bundlePath=${bundlePath} buildId=${buildId} generation=${generation ?? "(unknown)"} files=${files.length} routes=${routeIds?.length ?? 0} serverTouched=${serverTouched ?? "(unknown)"} staleEntries=${staleClientEntries.size} runtimeMetadata=${runtimeMetadataChanged} routeTree=${routeTreeChanged}`,
        );
        const dropped =
          clearAll || lateFiles.length > 0
            ? this.#invalidateRoutes(
                lateFiles,
                this.#routeIdsForFiles(lateFiles, staleClientEntries),
                staleClientEntries,
                { forceClear: clearAll, batch: generation },
              )
            : [];
        const manifest = this.routeCache.snapshot();
        //? Whether the worker reloads is whether it runs this bundle, not what the save touched: a backend that
        //? restarted booted the base build's bundle, and the build replayed to it may be one that changed nothing the
        //? server renders. Running the same bundle, byte for byte, it keeps the build id every tab holds (the hello
        //? check, the router's partial navigation) instead of stranding them on one no refresh ever sent.
        const running = bundlePath ? path.resolve(bundlePath) : null;
        let tabBuildId = buildId;
        if (serverTouched === false && !clearAll && running === this.#runningBundlePath) {
          this.#logger.verbose(
            `[SSR] pages bundle unchanged for the server; buildId ${this.#renderState.buildId} kept`,
          );
        } else {
          const previousBuildId = this.#renderState.buildId;
          this.#renderState.buildId = buildId;
          const reloadStarted = Date.now();
          try {
            const adopted = await this.#rsc.reload({
              clientManifest: manifest.clientManifest,
              cssAssets: this.#renderState.cssAssets,
              buildId,
              pagesBundlePath: bundlePath,
            });
            this.#adoptBundle(adopted.pagesBundlePath);
            //? A later pages build that superseded this one is what the worker runs, and the id a tab must hold.
            tabBuildId = adopted.buildId;
          } catch (error) {
            const failure = DevHmrController.#reloadFailure(error);
            //? What the worker serves now, which a later pages-updated may already have moved past this one's own id.
            if (failure) {
              this.#renderState.buildId = failure.adopted.buildId;
              this.#adoptBundle(failure.adopted.pagesBundlePath);
            } else if (this.#renderState.buildId === buildId) this.#renderState.buildId = previousBuildId;
            //? The worker took this bundle before a later one failed: the tabs refresh onto it as on success.
            if (failure?.adopted.buildId !== buildId) {
              //? A newer pages bundle failed in this one's place and reports it; this batch's patches still go out. A
              //? route merge that rode along carries this bundle, so this one reports.
              if (failure && failure.failed.buildId !== buildId) this.#ssrUpdates.release(generation);
              else this.#failPagesReload(generation, files, error);
              return;
            }
          }
          this.#logger.verbose(`[SSR] rsc reload buildId=${buildId} in ${Date.now() - reloadStarted}ms`);
        }
        const shouldReload = clearAll || this.#shouldFullReloadForFiles(files, routeIds);
        const broadcastTrace = DevHmrController.#broadcastTrace(trace);
        if (shouldReload) this.#ssrUpdates.clear(generation);
        const released = shouldReload ? { released: 0, reload: false } : this.#ssrUpdates.release(generation);
        if (shouldReload) this.#hub.broadcast({ type: "reload", buildId: tabBuildId });
        else if (released.reload)
          this.#logger.verbose(`[hmr] generation=${generation} released a registry reload; no RSC refresh needed`);
        // The SSR registry already patched the tabs: a client module is only references by name to the server.
        else if (serverTouched === false)
          this.#logger.verbose(
            `[hmr] generation=${generation} changed nothing the server renders; the registry patched it`,
          );
        else
          this.#hub.broadcast({
            type: "rsc-refresh",
            buildId: tabBuildId,
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

  #adoptBundle(bundlePath: string): void {
    const running = path.resolve(bundlePath);
    if (running === this.#runningBundlePath) return;
    this.#runningBundlePath = running;
    void this.#pruner.prunePages(running);
  }

  static #reloadFailure(error: unknown): RscReloadFailure | null {
    return error instanceof Error && "adopted" in error ? (error as RscReloadFailure) : null;
  }

  //? A bundle that builds but throws while the worker imports it (a TDZ read at a module's top level): the worker keeps
  //? the one it ran, the overlay says why, and the client patches this save held go out instead of waiting 15 seconds.
  #failPagesReload(generation: number | undefined, files: string[], error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.#logger.error(`[SSR] rsc reload failed generation=${generation ?? "(unknown)"}: ${message}`);
    if (generation !== undefined) this.#recordBuildStatus({ generation, phase: "pages", ok: false, files, message });
    this.#ssrUpdates.release(generation);
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
    this.#recheckFailedRoute(status);
    const previous = this.#buildStatusByPhase.get(status.phase);
    const message = devBuildStatusToHmrMessage(status, previous);
    //? An ok that recovers nothing keeps the failure: hello re-sends it to a tab opened after, and the fix's own ok is
    //? then compared against the failure instead of against an ok that never cleared an overlay.
    if (status.ok && previous && !previous.ok && !message) return;
    this.#buildStatusByPhase.set(status.phase, status);
    if (!message) return;
    this.#hub.broadcast(message);
    this.#logger.verbose(
      `[hmr] build-status status=${message.status} generation=${message.generation} phase=${message.phase} files=${message.files ?? 0}`,
    );
  }

  //? A route builds only when requested, and a module another route shares is the usual cause of its failure: once
  //? that module is fixed, no tab may ask for the failed route again, and only its own ok clears it. A newer green
  //? build of the app rebuilds it once, which clears it or records the failure anew at the newer generation.
  //? A green that arrives while it runs may carry the fix the rebuild read too early, and the rebuild's failure is
  //? stamped with the builder's generation at its end, so that green passes once more without the generation check.
  #recheckFailedRoute(status: DevBuildStatus, { again = false }: { again?: boolean } = {}): void {
    if (!status.ok || (status.phase !== "pages" && status.phase !== "ssr")) return;
    if (this.#recheckingRoute) {
      this.#recheckAgain = status;
      return;
    }
    const failed = this.#buildStatusByPhase.get("route");
    if (!failed || failed.ok || !failed.scope || (!again && failed.generation >= status.generation)) return;
    this.#recheckingRoute = true;
    void this.routeCache
      .ensure(failed.scope, failed.files)
      .catch(() => undefined)
      .finally(() => {
        this.#recheckingRoute = false;
        const next = this.#recheckAgain;
        this.#recheckAgain = null;
        if (next) this.#recheckFailedRoute(next, { again: true });
      });
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
        try {
          const adopted = await this.#rsc.reload({
            clientManifest: nextMerged.clientManifest,
            cssAssets: this.#renderState.cssAssets,
            buildId: this.#renderState.buildId,
          });
          this.#adoptBundle(adopted.pagesBundlePath);
        } catch (error) {
          //? The pages reload it rode with failed and says so; the route still renders, and the next reload carries the
          //? merged manifest.
          const failure = DevHmrController.#reloadFailure(error);
          if (failure) this.#adoptBundle(failure.adopted.pagesBundlePath);
          this.#logger.warn(`[SSR] route ${routeId} merged, but the worker did not reload: ${String(error)}`);
        }
        this.#logger.verbose(
          `[SSR] route manifest merged routeId=${routeId} generation=${generation} entries=+${delta.newEntries.length} deps=${delta.clientDeps.length}`,
        );
      },
    });
  }

  #recordInvalidate(files: string[], kinds: Set<Exclude<ChangeKind, "ignore">>, generation?: number) {
    if (kinds.has("code")) this.#invalidateClientEntriesEarly(files, generation ?? 0);
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
  #invalidateClientEntriesEarly(files: string[], generation: number): void {
    const staleClientEntries = this.#staleClientEntriesForFiles(files);
    //? No entry is known to read these yet, but a route's first build may be reading them now. Not marked early:
    //? the pages build's own invalidation still covers them.
    if (staleClientEntries.size === 0) {
      this.routeCache.invalidateClientEntries({
        routePredicate: () => false,
        staleEntries: [],
        files,
        batch: generation,
      });
      return;
    }
    //? Only the entries themselves: a client entry's edit cannot move which entries a route reaches, but a server file
    //? saved with it can, and a route built before the builder took the batch into its discovery missed that.
    for (const file of files)
      if (staleClientEntries.has(path.resolve(file))) this.#earlyInvalidated.set(path.resolve(file), generation);
    const routeIds = this.#routeIdsForFiles(files, staleClientEntries);
    this.routeCache.invalidateClientEntries({
      routePredicate: (routeId) => !routeIds || routeIds.includes(routeId),
      staleEntries: this.#clientEntryManifestKeys(staleClientEntries),
      files,
      batch: generation,
    });
  }

  #invalidateRoutes(
    files: string[],
    routeIds: string[] | undefined,
    staleClientEntries = new Set<string>(),
    { forceClear = false, batch }: { forceClear?: boolean; batch?: number } = {},
  ): string[] {
    this.#dirty.clear();
    this.#dirtyFiles.clear();
    if (forceClear) return this.routeCache.clear();
    if (staleClientEntries.size > 0) {
      const staleKeys = this.#clientEntryManifestKeys(staleClientEntries);
      return this.routeCache.invalidateClientEntries({
        routePredicate: (routeId) => !routeIds || routeIds.includes(routeId),
        staleEntries: staleKeys,
        files,
        batch,
      });
    }
    //? Every route, for a file none is known to reach (the first build that reads it may still be running) or one all
    //? of them do: but not those built after the builder took the batch in, which a full clear dropped as well.
    if (!routeIds || this.#shouldClearAllRoutes(files, routeIds))
      return batch === undefined ? this.routeCache.clear() : this.routeCache.invalidate(() => true, { files, batch });
    return this.routeCache.invalidate((routeId) => routeIds.includes(routeId), { files, batch });
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
