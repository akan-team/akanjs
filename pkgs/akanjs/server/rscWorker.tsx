import type {
  AkanNotFoundError,
  AkanRedirectError,
  LayoutFallbackRoute,
  PathRoute,
  RedirectStatus,
  ResolvedHead,
} from "akanjs/client";
import { type AkanI18nConfig, DEFAULT_AKAN_I18N, getBasePathFromPathname, Logger } from "akanjs/common";
import {
  getRequestDynamicUsage,
  getRequestPolicy,
  getRequestTheme,
  requestStorage,
  setRequestFrameState,
  untrackedCookies,
  untrackedRequest,
  updateRequestPolicy,
} from "akanjs/fetch";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-server-dom-webpack/server.node";
import type { ClientManifest } from "./artifact";
import {
  LruTtlCache,
  parsePositiveInt,
  type RouteCacheEntry,
  type RouteCacheInvalidation,
  type RouteCacheRenderState,
  resolvePublicRouteCacheEntryDecision,
  resolveRouteCacheStoreTtl,
  shouldStoreRouteCache,
} from "./cachePolicy";
import {
  createAkanLocaleAlternateHeadSnapshot,
  mergeAkanHeadSnapshots,
  renderAkanHeadSnapshot,
  shouldRenderLocaleAlternates,
} from "./metadata";
import { ProcessMetricsCollector } from "./processMetricsCollector";
import { RouteElementComposer } from "./routeElementComposer";
import {
  type AkanRscPatchDecision,
  createAkanRouterState,
  encodeAkanHeadSnapshot,
  encodeAkanRouterState,
  encodeAkanRscPatchSegmentPath,
  readAkanRouterStateRequest,
  resolveAkanRscPartialDecision,
  resolveAkanRscPatchDecision,
} from "./routeState";
import { type PagesContext, RouteTreeBuilder } from "./routeTreeBuilder";
import { encodeAkanRedirectDigest } from "./rscHttp";
import { isAkanRscPartialCommitEnabled } from "./rscPartialCommit";
import { resolveAkanRscHeadSafePatchDecision } from "./rscPatchSafety";
import {
  type CachedRscResult,
  createCachedRscPatchMetadata,
  createRscWorkerCachedPatchReplayDecision,
  invalidateCachedRscResults,
  isCachedRscPatchMetadataCompatible,
  resolveRscWorkerPatchCacheEntry,
  shouldCollectRscWorkerRenderChunks,
  shouldStoreRscWorkerPatchResult,
  shouldUseRscWorkerFullResultCache,
} from "./rscWorkerCache";
import { replayCachedRscResult } from "./rscWorkerReplay";
import type { RscTraceMetadata } from "./ssrTypes";
import { createSystemPageDocument, getSystemPageHomeHref } from "./systemPageDocument";

interface InitMsg {
  type: "init";
  clientManifest: ClientManifest;
  pagesBundlePath: string;
  pagesBundleBuildId: number;
  cssAssets?: Record<string, { cssUrl: string; cssRelPath: string }>;
  basePaths?: string[];
  i18n?: AkanI18nConfig;
}
interface RenderMsg {
  type: "render";
  requestId: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  clientManifest?: ClientManifest;
}
interface CancelMsg {
  type: "cancel";
  requestId: string;
}
interface ReloadMsg {
  type: "reload";
  clientManifest: ClientManifest;
  cssAssets?: Record<string, { cssUrl: string; cssRelPath: string }>;
  buildId: number;
  /** Optional new bundle path — when the builder rebundled user code. */
  pagesBundlePath?: string;
}
interface UpdateCssAssetsMsg {
  type: "updateCssAssets";
  cssAssets: Record<string, { cssUrl: string; cssRelPath: string }>;
}
interface InvalidateCacheMsg {
  type: "invalidate-cache";
  reason?: string;
  tags?: string[];
  paths?: string[];
}
type InMsg = InitMsg | RenderMsg | CancelMsg | ReloadMsg | UpdateCssAssetsMsg | InvalidateCacheMsg;
type RenderControl =
  | { type: "redirect"; location: string; method: "replace" | "push"; status: RedirectStatus }
  | { type: "not-found" }
  | { type: "error"; error: unknown };
interface FlightRenderResult {
  chunks: Uint8Array[];
  bytes: number;
  chunksCount: number;
  control: RenderControl | null;
  lateControlSent: boolean;
  cancelled: boolean;
}

function hashRscTraceCacheKey(cacheKey: string): string {
  let hash = 5381;
  for (let index = 0; index < cacheKey.length; index += 1) hash = (hash * 33) ^ cacheKey.charCodeAt(index);
  return (hash >>> 0).toString(36);
}

interface RscRendererStats {
  renderCount: number;
  inFlightRenderCount: number;
  lastRenderedPath?: string;
  lastRenderKind?: string;
  lastRenderRouteId?: string;
  lastRenderDurationMs?: number;
  lastRenderLoadedModuleDelta: number;
  lastRenderLoadedModules: string[];
  lastFlightBytes: number;
  lastFlightChunks: number;
  totalFlightBytes: number;
  totalFlightChunks: number;
  pagesBundleBuildId: number;
}

interface RouteRenderStats {
  routeId: string;
  count: number;
  flightBytes: number;
  totalDurationMs: number;
}

export function isAkanRedirectError(error: unknown): error is AkanRedirectError {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    (error as { digest?: unknown }).digest === "AKAN_REDIRECT" &&
    "location" in error &&
    typeof (error as { location?: unknown }).location === "string" &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  );
}

export function isAkanNotFoundError(error: unknown): error is AkanNotFoundError {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    (error as { digest?: unknown }).digest === "AKAN_NOT_FOUND"
  );
}

export class RscRenderer {
  readonly #logger = new Logger("scWorker");
  #clientManifest: ClientManifest = {};
  #pathRoutes: PathRoute[] = [];
  #fallbackRoutes: LayoutFallbackRoute[] = [];
  #cssAssets: Record<string, { cssUrl: string; cssRelPath: string }> = {};
  #basePaths: string[] = [];
  #i18n: AkanI18nConfig = DEFAULT_AKAN_I18N;
  #pagesBundlePath = "";
  #pagesBundleBuildId = 0;
  #reloadSeq = 0;
  #metricsTimer: Timer | null = null;
  #stats: RscRendererStats = {
    renderCount: 0,
    inFlightRenderCount: 0,
    lastRenderLoadedModuleDelta: 0,
    lastRenderLoadedModules: [],
    lastFlightBytes: 0,
    lastFlightChunks: 0,
    totalFlightBytes: 0,
    totalFlightChunks: 0,
    pagesBundleBuildId: 0,
  };
  readonly #routeStats = new Map<string, RouteRenderStats>();
  #resultCache = new LruTtlCache<CachedRscResult>(
    parsePositiveInt(process.env.AKAN_RSC_RESULT_CACHE_MAX_ENTRIES) ?? 100,
  );
  #patchResultCache = new LruTtlCache<CachedRscResult>(
    parsePositiveInt(process.env.AKAN_RSC_RESULT_CACHE_MAX_ENTRIES) ?? 100,
  );
  readonly #activeRenderReaders = new Map<string, ReadableStreamDefaultReader<Uint8Array>>();
  readonly #cancelledRenderRequests = new Set<string>();
  #resultCacheHits = 0;
  #resultCacheMisses = 0;
  #resultCacheBypass = 0;
  readonly #send: (message: unknown) => void;

  constructor() {
    if (typeof process.send !== "function") {
      throw new Error("rscWorker must be run as a Bun subprocess with ipc enabled");
    }
    this.#send = process.send.bind(process) as (message: unknown) => void;
    process.on("message", (msg: InMsg) => this.#handleMessage(msg));
    this.#logger.verbose(`constructed (pid=${process.pid})`);
  }

  start(): void {
    this.#logger.verbose("sending hello to host");
    this.#startMetricsReporting();
    this.#send({ type: "hello" });
  }

  #handleMessage(msg: InMsg): void {
    switch (msg.type) {
      case "init":
        this.#logger.verbose("received init message");
        void this.#handleInit(msg);
        return;
      case "render":
        this.#logger.verbose(`received render requestId=${msg.requestId} url=${msg.url} method=${msg.method ?? "GET"}`);
        void this.#handleRender(msg);
        return;
      case "cancel":
        this.#logger.verbose(`received cancel requestId=${msg.requestId}`);
        this.#handleCancel(msg.requestId);
        return;
      case "reload":
        this.#logger.verbose(`received reload buildId=${msg.buildId}`);
        void this.#handleReload(msg);
        return;
      case "updateCssAssets":
        this.#logger.verbose(`received updateCssAssets count=${Object.keys(msg.cssAssets).length}`);
        this.#cssAssets = msg.cssAssets;
        return;
      case "invalidate-cache":
        this.#logger.verbose(`received invalidate-cache reason=${msg.reason ?? "(none)"}`);
        this.#invalidateResultCache(msg);
        return;
    }
  }

  #handleCancel(requestId: string): void {
    this.#cancelledRenderRequests.add(requestId);
    const reader = this.#activeRenderReaders.get(requestId);
    if (!reader) return;
    void reader.cancel().catch(() => {
      // Cancellation is best-effort; the render loop also checks
      // `#cancelledRenderRequests` before sending more chunks.
    });
  }

  #invalidateResultCache(invalidation: RouteCacheInvalidation): void {
    invalidateCachedRscResults(this.#resultCache, invalidation);
    invalidateCachedRscResults(this.#patchResultCache, invalidation);
  }

  async #handleInit(msg: InitMsg): Promise<void> {
    const startedAt = Date.now();
    try {
      this.#clientManifest = msg.clientManifest;
      this.#cssAssets = msg.cssAssets ?? {};
      this.#basePaths = msg.basePaths ?? Object.keys(this.#cssAssets);
      this.#i18n = msg.i18n ?? DEFAULT_AKAN_I18N;
      this.#pagesBundlePath = msg.pagesBundlePath;
      this.#pagesBundleBuildId = msg.pagesBundleBuildId;
      this.#stats.pagesBundleBuildId = msg.pagesBundleBuildId;
      this.#routeStats.clear();
      this.#resultCache.clear();
      this.#patchResultCache.clear();
      this.#logger.verbose(
        `init state pagesBundlePath=${msg.pagesBundlePath} buildId=${msg.pagesBundleBuildId} cssAssets=${Object.keys(this.#cssAssets).length} clientEntries=${Object.keys(msg.clientManifest).length}`,
      );
      const routes = await this.#importPages(msg.pagesBundlePath, msg.pagesBundleBuildId);
      this.#pathRoutes = routes.pathRoutes;
      this.#fallbackRoutes = routes.fallbackRoutes;
      this.#logger.verbose(`init complete in ${Date.now() - startedAt}ms`);
      this.#send({ type: "ready" });
    } catch (error) {
      this.#logger.error(`init failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      this.#send({
        type: "error",
        requestId: "__init__",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async #handleReload(msg: ReloadMsg): Promise<void> {
    const startedAt = Date.now();
    const seq = ++this.#reloadSeq;
    try {
      const nextCssAssets = msg.cssAssets ?? this.#cssAssets;
      const nextPagesBundlePath =
        msg.pagesBundlePath && msg.pagesBundlePath !== this.#pagesBundlePath
          ? msg.pagesBundlePath
          : this.#pagesBundlePath;
      this.#logger.verbose(
        `reload state buildId=${msg.buildId} bundlePath=${nextPagesBundlePath} cssAssets=${Object.keys(nextCssAssets).length} clientEntries=${Object.keys(msg.clientManifest).length}`,
      );
      const routes = await this.#importPages(nextPagesBundlePath, msg.buildId);
      if (seq !== this.#reloadSeq) {
        this.#logger.verbose(`reload stale buildId=${msg.buildId} seq=${seq} latest=${this.#reloadSeq}`);
        return;
      }
      this.#clientManifest = msg.clientManifest;
      this.#cssAssets = nextCssAssets;
      this.#pagesBundlePath = nextPagesBundlePath;
      this.#pagesBundleBuildId = msg.buildId;
      this.#stats.pagesBundleBuildId = msg.buildId;
      this.#pathRoutes = routes.pathRoutes;
      this.#fallbackRoutes = routes.fallbackRoutes;
      this.#routeStats.clear();
      this.#resultCache.clear();
      this.#patchResultCache.clear();
      this.#logger.verbose(`reload complete buildId=${msg.buildId} in ${Date.now() - startedAt}ms`);
      this.#send({ type: "reloaded", buildId: msg.buildId });
    } catch (error) {
      this.#logger.error(
        `reload failed buildId=${msg.buildId}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      this.#send({
        type: "error",
        requestId: "__reload__",
        buildId: msg.buildId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async #importPages(
    bundlePath: string,
    buildId: number,
  ): Promise<{ pathRoutes: PathRoute[]; fallbackRoutes: LayoutFallbackRoute[] }> {
    const specifier = `${bundlePath}?v=${buildId}`;
    this.#logger.verbose(`importing pages bundle ${specifier}`);
    const importStart = Date.now();
    const mod = (await import(specifier)) as { pages?: PagesContext; default?: PagesContext };
    const importedAt = Date.now();
    const pages = mod.pages ?? mod.default;
    if (!pages) throw new Error(`pages export not found in ${specifier}`);

    const routeBuildStart = Date.now();
    const routeTree = new RouteTreeBuilder(pages);
    const pathRoutes = routeTree.build();
    const routeBuildMs = Date.now() - routeBuildStart;
    this.#logger.verbose(
      `pages imported in ${Date.now() - importStart}ms import=${importedAt - importStart}ms routeBuild=${routeBuildMs}ms routes=${pathRoutes.length} specifier=${specifier}`,
    );
    return { pathRoutes, fallbackRoutes: routeTree.getFallbackRoutes() };
  }

  async #handleRender(msg: RenderMsg): Promise<void> {
    const { requestId, url, method = "GET", headers = {} } = msg;
    const startedAt = Date.now();
    this.#stats.renderCount += 1;
    this.#stats.inFlightRenderCount += 1;
    const activeRoute: {
      url: URL | null;
      match: { pathRoute: PathRoute; params: Record<string, string> } | null;
    } = { url: null, match: null };
    try {
      const request = new Request(url, { method, headers });
      await this.#runWithRequest(request, async () => {
        const urlObj = new URL(url);
        activeRoute.url = urlObj;
        this.#stats.lastRenderedPath = urlObj.pathname;
        const match = RouteTreeBuilder.match(urlObj.pathname, this.#pathRoutes);
        activeRoute.match = match;
        const routeId = match?.pathRoute.path ?? "__not_found__";
        updateRequestPolicy({ routeId });
        this.#stats.lastRenderRouteId = routeId;
        this.#stats.lastRenderKind = match ? "route" : "not-found";
        if (match)
          this.#logger.verbose(
            `render[${requestId}] matched route pathname=${urlObj.pathname} params=${JSON.stringify(match.params)}`,
          );
        else this.#logger.verbose(`render[${requestId}] no route matched pathname=${urlObj.pathname} — rendering 404`);
        const beforeLoadedKeys = RouteTreeBuilder.getCacheStats().loadedModuleKeys;
        const cacheDecision = match ? this.#getResultCacheEntry(request, urlObj) : { entry: null };
        const cacheEntry = cacheDecision.entry;
        const targetRouterState = match
          ? createAkanRouterState({
              pathRoute: match.pathRoute,
              href: urlObj.href,
              buildId: this.#pagesBundleBuildId,
            })
          : null;
        const searchParams = RouteTreeBuilder.parseSearchParams(urlObj.search);
        const currentRouterState = readAkanRouterStateRequest(request.headers);
        const partialDecision = targetRouterState
          ? resolveAkanRscPartialDecision({
              currentState: currentRouterState.state,
              currentRoute: currentRouterState.currentRoute,
              targetState: targetRouterState,
            })
          : { status: "full" as const, reason: "missing-route", commonPrefixLength: 0 };
        const patchDecision: AkanRscPatchDecision =
          targetRouterState && match
            ? resolveAkanRscPatchDecision({
                currentState: currentRouterState.state,
                targetState: targetRouterState,
                partialDecision,
              })
            : { status: "full" as const, reason: partialDecision.reason, commonPrefixLength: 0 };
        const safePatchDecision = match
          ? await this.#resolveHeadSafePatchDecision(
              match.pathRoute,
              patchDecision,
              await this.#resolveRouteHeadSnapshot(urlObj, match, searchParams),
            )
          : patchDecision;
        const patchCacheEntry = resolveRscWorkerPatchCacheEntry({
          cacheEntry,
          targetRouterState,
          safePatchDecision,
          partialCommitEnabled: isAkanRscPartialCommitEnabled(),
        });
        const createTraceBase = (
          decision: AkanRscPatchDecision,
          cacheKey = cacheEntry?.key,
          routeState = targetRouterState,
        ) => ({
          navId: requestId,
          pathname: urlObj.pathname,
          routeId,
          partial: decision.status,
          partialReason: decision.reason ?? currentRouterState.reason,
          partialCommonPrefixLength: decision.commonPrefixLength,
          ...(decision.patch
            ? {
                patchStartIndex: decision.patch.patchStartIndex,
                patchSegmentPath: encodeAkanRscPatchSegmentPath(decision.patch.segmentPath),
                patchStartSegment: decision.patch.patchStartSegmentKey,
                patchHeadSafe: decision.patch.headSafe,
                patchHeadSnapshot: decision.patch.headSnapshot
                  ? (encodeAkanHeadSnapshot(decision.patch.headSnapshot) ?? undefined)
                  : undefined,
              }
            : {}),
          ...(routeState ? { routeState: encodeAkanRouterState(routeState) } : {}),
          ...(cacheKey ? { cacheKeyHash: hashRscTraceCacheKey(cacheKey) } : {}),
          ...(cacheDecision.reason ? { cacheReason: cacheDecision.reason } : {}),
        });
        const traceBase = createTraceBase(safePatchDecision, patchCacheEntry?.key ?? cacheEntry?.key);
        const cachedPatch = patchCacheEntry ? this.#getCachedPatchResult(patchCacheEntry.key) : null;
        if (
          cachedPatch?.patch &&
          patchCacheEntry &&
          isCachedRscPatchMetadataCompatible({
            cached: cachedPatch.patch,
            targetRouterState,
            safePatchDecision,
          })
        ) {
          const cachedPatchDecision = createRscWorkerCachedPatchReplayDecision({
            cached: cachedPatch.patch,
            safePatchDecision,
          });
          const cachedTraceBase = createTraceBase(
            cachedPatchDecision,
            patchCacheEntry.key,
            cachedPatch.patch.targetRouterState,
          );
          this.#stats.lastRenderDurationMs = Date.now() - startedAt;
          this.#stats.lastRenderLoadedModuleDelta = 0;
          this.#stats.lastRenderLoadedModules = [];
          this.#stats.lastFlightBytes = cachedPatch.bytes;
          this.#stats.lastFlightChunks = cachedPatch.chunksCount;
          this.#stats.totalFlightBytes += cachedPatch.bytes;
          this.#stats.totalFlightChunks += cachedPatch.chunksCount;
          this.#recordRouteStats(routeId, cachedPatch.bytes, this.#stats.lastRenderDurationMs);
          await replayCachedRscResult({
            requestId,
            chunks: cachedPatch.chunks,
            theme: cachedPatch.theme,
            cacheState: cachedPatch.cacheState,
            trace: {
              ...cachedTraceBase,
              cache: "hit",
              partial: "patch",
              partialReason: "cache-hit-patch-replay",
            },
            send: (message) => this.#send(message),
            isCancelled: () => this.#cancelledRenderRequests.has(requestId),
          });
          return;
        }
        const cached =
          shouldUseRscWorkerFullResultCache({ cacheEntry, patchCacheEntry }) && cacheEntry
            ? this.#getCachedResult(cacheEntry.key)
            : null;
        if (cached) {
          this.#stats.lastRenderDurationMs = Date.now() - startedAt;
          this.#stats.lastRenderLoadedModuleDelta = 0;
          this.#stats.lastRenderLoadedModules = [];
          this.#stats.lastFlightBytes = cached.bytes;
          this.#stats.lastFlightChunks = cached.chunksCount;
          this.#stats.totalFlightBytes += cached.bytes;
          this.#stats.totalFlightChunks += cached.chunksCount;
          this.#recordRouteStats(routeId, cached.bytes, this.#stats.lastRenderDurationMs);
          await replayCachedRscResult({
            requestId,
            chunks: cached.chunks,
            theme: cached.theme,
            cacheState: cached.cacheState,
            trace: {
              ...traceBase,
              cache: "hit",
              partial: "full",
              partialReason: "cache-hit-full-replay",
              partialCommonPrefixLength: 0,
              patchStartIndex: undefined,
              patchSegmentPath: undefined,
              patchStartSegment: undefined,
              patchHeadSafe: undefined,
              patchHeadSnapshot: undefined,
            },
            send: (message) => this.#send(message),
            isCancelled: () => this.#cancelledRenderRequests.has(requestId),
          });
          return;
        }
        const theme = untrackedCookies().get("theme")?.value;
        let element: ReactNode;
        let effectivePatchDecision = safePatchDecision;
        if (match && safePatchDecision.status === "patch" && safePatchDecision.patch) {
          const suffixElement = await this.#renderMatchedSuffix(
            urlObj,
            match,
            safePatchDecision.patch.patchStartIndex,
            searchParams,
          );
          if (suffixElement === null) {
            effectivePatchDecision = {
              status: "full",
              reason: "suffix-compose-fallback",
              commonPrefixLength: safePatchDecision.commonPrefixLength,
            };
            element = await this.#renderMatched(urlObj, match, theme, searchParams);
          } else element = suffixElement;
        } else if (match) element = await this.#renderMatched(urlObj, match, theme, searchParams);
        else element = await this.#renderNotFound(urlObj);
        const traceCacheKey =
          effectivePatchDecision.status === "patch" ? (patchCacheEntry?.key ?? cacheEntry?.key) : cacheEntry?.key;
        const trace: RscTraceMetadata = {
          ...createTraceBase(effectivePatchDecision, traceCacheKey),
          cache: cacheEntry ? "miss" : "bypass",
        };
        this.#logger.verbose(`render[${requestId}] starting Flight stream`);
        const result = await this.#renderFlightElement(element, msg.clientManifest ?? this.#clientManifest, {
          requestId,
          collectChunks: shouldCollectRscWorkerRenderChunks({
            cacheEntry,
            effectivePatchDecision,
            patchCacheEntry,
          }),
          status: match ? undefined : 404,
          trace,
          onComplete: ({ chunks, bytes, chunksCount, control, lateControlSent }) => {
            const cacheState = shouldStoreRouteCache({
              policy: getRequestPolicy(),
              dynamicUsage: getRequestDynamicUsage(),
              renderControlType: control?.type,
              lateRedirect: control?.type === "redirect" && lateControlSent,
            });
            const storeTtl = cacheEntry ? resolveRouteCacheStoreTtl(cacheEntry.ttl, cacheState) : null;
            if (
              shouldStoreRscWorkerPatchResult({
                cacheEntry,
                patchCacheEntry,
                effectivePatchDecision,
                storeTtl,
              }) &&
              patchCacheEntry &&
              targetRouterState &&
              effectivePatchDecision.patch &&
              storeTtl !== null
            ) {
              this.#setCachedPatchResult(
                patchCacheEntry.key,
                {
                  chunks,
                  bytes,
                  chunksCount,
                  pathname: urlObj.pathname,
                  routeId,
                  tags: cacheState.tags,
                  theme: getRequestTheme(),
                  cacheState,
                  patch: createCachedRscPatchMetadata({
                    targetRouterState,
                    patch: effectivePatchDecision.patch,
                  }),
                },
                storeTtl,
              );
            } else if (cacheEntry && storeTtl !== null && effectivePatchDecision.status !== "patch") {
              this.#setCachedResult(
                cacheEntry.key,
                {
                  chunks,
                  bytes,
                  chunksCount,
                  pathname: urlObj.pathname,
                  routeId,
                  tags: cacheState.tags,
                  theme: getRequestTheme(),
                  cacheState,
                },
                storeTtl,
              );
            }
            return cacheState;
          },
        });
        if (result.cancelled) return;
        const control = result.control;
        if (control) {
          this.#stats.lastRenderKind = control.type;
          if (result.lateControlSent) {
            this.#logger.verbose(`render[${requestId}] late ${control.type} delivered after stream start`);
            return;
          }
          if (!match && control.type === "error") {
            const systemResult = await this.#renderFlightElement(
              this.#renderSystemNotFound(urlObj),
              msg.clientManifest ?? this.#clientManifest,
              { requestId, status: 404, trace },
            );
            if (systemResult.cancelled) return;
            if (!systemResult.control) {
              return;
            }
          }
          if (
            match &&
            control.type !== "redirect" &&
            (await this.#trySendFallbackRender({
              requestId,
              kind: control.type,
              route: match.pathRoute,
              params: match.params,
              searchParams,
              pathname: urlObj.pathname,
              url: urlObj,
              error: control.type === "error" ? control.error : undefined,
              clientManifest: msg.clientManifest ?? this.#clientManifest,
              trace,
            }))
          ) {
            return;
          }
          if (
            control.type === "not-found" &&
            (await this.#trySendSystemNotFoundRender({
              requestId,
              url: urlObj,
              clientManifest: msg.clientManifest ?? this.#clientManifest,
              trace,
            }))
          ) {
            return;
          }
          this.#sendRenderControl(requestId, control);
          return;
        }
        this.#stats.lastFlightBytes = result.bytes;
        this.#stats.lastFlightChunks = result.chunksCount;
        this.#stats.totalFlightBytes += result.bytes;
        this.#stats.totalFlightChunks += result.chunksCount;
        this.#stats.lastRenderDurationMs = Date.now() - startedAt;
        const afterLoadedKeys = RouteTreeBuilder.getCacheStats().loadedModuleKeys;
        this.#stats.lastRenderLoadedModules = afterLoadedKeys.filter((key) => !beforeLoadedKeys.includes(key));
        this.#stats.lastRenderLoadedModuleDelta = this.#stats.lastRenderLoadedModules.length;
        this.#recordRouteStats(routeId, result.bytes, this.#stats.lastRenderDurationMs);
        const responseTheme = getRequestTheme();
        this.#logger.verbose(
          `render[${requestId}] done chunks=${result.chunksCount} bytes=${result.bytes} theme=${responseTheme ?? "(none)"} in ${
            Date.now() - startedAt
          }ms`,
        );
      });
    } catch (error) {
      if (isAkanRedirectError(error)) {
        this.#stats.lastRenderKind = "redirect";
        this.#logger.verbose(`render[${requestId}] redirect ${error.location}`);
        this.#send({
          type: "redirect",
          requestId,
          location: error.location,
          method: error.method,
          status: error.status,
        });
        return;
      }
      if (isAkanNotFoundError(error)) {
        this.#stats.lastRenderKind = "not-found";
        this.#logger.verbose(`render[${requestId}] not-found`);
        const fallbackUrl = activeRoute.url;
        const fallbackMatch = activeRoute.match;
        if (
          fallbackUrl &&
          fallbackMatch &&
          (await this.#trySendFallbackRender({
            requestId,
            kind: "not-found",
            route: fallbackMatch.pathRoute,
            params: fallbackMatch.params,
            searchParams: RouteTreeBuilder.parseSearchParams(fallbackUrl.search),
            pathname: fallbackUrl.pathname,
            url: fallbackUrl,
            clientManifest: msg.clientManifest ?? this.#clientManifest,
          }))
        ) {
          return;
        }
        if (
          fallbackUrl &&
          (await this.#trySendSystemNotFoundRender({
            requestId,
            url: fallbackUrl,
            clientManifest: msg.clientManifest ?? this.#clientManifest,
          }))
        ) {
          return;
        }
        this.#send({ type: "not-found", requestId });
        return;
      }
      this.#logger.error(
        `render[${requestId}] failed url=${url}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      const fallbackUrl = activeRoute.url;
      const fallbackMatch = activeRoute.match;
      if (
        fallbackUrl &&
        fallbackMatch &&
        (await this.#trySendFallbackRender({
          requestId,
          kind: "error",
          route: fallbackMatch.pathRoute,
          params: fallbackMatch.params,
          searchParams: RouteTreeBuilder.parseSearchParams(fallbackUrl.search),
          pathname: fallbackUrl.pathname,
          url: fallbackUrl,
          error,
          clientManifest: msg.clientManifest ?? this.#clientManifest,
        }))
      ) {
        return;
      }
      this.#send({
        type: "error",
        requestId,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.#activeRenderReaders.delete(requestId);
      this.#cancelledRenderRequests.delete(requestId);
      this.#stats.inFlightRenderCount = Math.max(0, this.#stats.inFlightRenderCount - 1);
    }
  }

  #startMetricsReporting() {
    if (this.#metricsTimer) return;
    const report = () => {
      void this.#sendMetricsReport();
    };
    report();
    this.#metricsTimer = setInterval(report, ProcessMetricsCollector.parseMemoryLogIntervalMs());
  }

  async #sendMetricsReport() {
    const routeStats = RouteTreeBuilder.getCacheStats();
    const metrics = await ProcessMetricsCollector.collect({
      role: "rsc-worker",
      rscRenderCount: this.#stats.renderCount,
      rscInFlightRenderCount: this.#stats.inFlightRenderCount,
      rscLastRenderedPath: this.#stats.lastRenderedPath,
      rscLastRenderKind: this.#stats.lastRenderKind,
      rscLastRenderRouteId: this.#stats.lastRenderRouteId,
      rscLastRenderDurationMs: this.#stats.lastRenderDurationMs,
      rscLastRenderLoadedModuleDelta: this.#stats.lastRenderLoadedModuleDelta,
      rscLastRenderLoadedModules: this.#stats.lastRenderLoadedModules,
      rscLastFlightBytes: this.#stats.lastFlightBytes,
      rscLastFlightChunks: this.#stats.lastFlightChunks,
      rscTotalFlightBytes: this.#stats.totalFlightBytes,
      rscTotalFlightChunks: this.#stats.totalFlightChunks,
      rscPagesBundleBuildId: this.#pagesBundleBuildId,
      rscRouteModuleCount: routeStats.moduleCount,
      rscLoadedRouteModuleCount: routeStats.loadedModuleCount,
      rscRouteModuleCacheHits: routeStats.cacheHits,
      rscRouteModuleCacheMisses: routeStats.cacheMisses,
      rscRouteModuleCacheDisabled: routeStats.cacheDisabled,
      rscLoadedRouteModuleKeys: routeStats.loadedModuleKeys,
      rscTopRoutesByRenderCount: this.#topRoutes((route) => route.count),
      rscTopRoutesByFlightBytes: this.#topRoutes((route) => route.flightBytes),
      rscResultCacheEntries: this.#resultCache.size + this.#patchResultCache.size,
      rscResultCacheHits: this.#resultCacheHits,
      rscResultCacheMisses: this.#resultCacheMisses,
      rscResultCacheBypass: this.#resultCacheBypass,
    });
    this.#send({ type: "metrics", metrics });
  }

  async #renderFlightElement(
    element: ReactNode,
    clientManifest: ClientManifest,
    options: {
      requestId?: string;
      collectChunks?: boolean;
      status?: number;
      trace?: RscTraceMetadata;
      onComplete?: (result: {
        chunks: Uint8Array[];
        bytes: number;
        chunksCount: number;
        control: RenderControl | null;
        lateControlSent: boolean;
      }) => Promise<RouteCacheRenderState> | RouteCacheRenderState;
    } = {},
  ): Promise<FlightRenderResult> {
    const controlRef: { current: RenderControl | null } = { current: null };
    const stream = await renderToReadableStream(element, clientManifest, {
      onError: (error) => {
        if (isAkanRedirectError(error)) {
          controlRef.current = {
            type: "redirect",
            location: error.location,
            method: error.method,
            status: error.status,
          };
          return encodeAkanRedirectDigest({
            location: error.location,
            method: error.method,
            status: error.status,
          });
        }
        if (isAkanNotFoundError(error)) {
          controlRef.current = { type: "not-found" };
          return error.digest;
        }
        controlRef.current = { type: "error", error };
        return error instanceof Error ? error.message : String(error);
      },
    });
    const reader = stream.getReader();
    if (options.requestId) this.#activeRenderReaders.set(options.requestId, reader);
    let bytes = 0;
    let chunksCount = 0;
    let sentMeta = false;
    let sentChunk = false;
    let lateControlSent = false;
    const chunks: Uint8Array[] = [];
    const sendMeta = () => {
      if (!options.requestId || sentMeta) return;
      sentMeta = true;
      this.#send({
        type: "meta",
        requestId: options.requestId,
        theme: getRequestTheme(),
        status: options.status,
        trace: options.trace,
      });
    };
    const sendLateRedirect = () => {
      if (!options.requestId || lateControlSent || controlRef.current?.type !== "redirect") return;
      // Once Flight bytes have left the worker, only redirects can still be
      // represented as a browser navigation. notFound/error stay in Flight and
      // are handled by React's error path.
      lateControlSent = true;
      this.#send({
        type: "late-redirect",
        requestId: options.requestId,
        location: controlRef.current.location,
        method: controlRef.current.method,
        status: controlRef.current.status,
      });
    };
    try {
      while (true) {
        if (options.requestId && this.#cancelledRenderRequests.has(options.requestId)) {
          await reader.cancel();
          return { chunks, bytes, chunksCount, control: null, lateControlSent, cancelled: true };
        }
        const { value, done } = await reader.read();
        if (controlRef.current && !sentChunk) {
          await reader.cancel();
          return { chunks, bytes, chunksCount, control: controlRef.current, lateControlSent, cancelled: false };
        }
        if (controlRef.current && sentChunk) sendLateRedirect();
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBufferLike);
        bytes += chunk.byteLength;
        chunksCount += 1;
        if (options.collectChunks) chunks.push(chunk);
        if (options.requestId) {
          sendMeta();
          this.#send({ type: "chunk", requestId: options.requestId, data: chunk });
          sentChunk = true;
        }
      }
    } catch (error) {
      if (options.requestId && this.#cancelledRenderRequests.has(options.requestId)) {
        return { chunks, bytes, chunksCount, control: null, lateControlSent, cancelled: true };
      }
      throw error;
    } finally {
      if (options.requestId) this.#activeRenderReaders.delete(options.requestId);
      reader.releaseLock();
    }
    if (controlRef.current && sentChunk) sendLateRedirect();
    if (controlRef.current && !sentChunk)
      return { chunks, bytes, chunksCount, control: controlRef.current, lateControlSent, cancelled: false };
    if (options.requestId) {
      sendMeta();
      const cacheState = (await options.onComplete?.({
        chunks,
        bytes,
        chunksCount,
        control: controlRef.current,
        lateControlSent,
      })) ?? { cacheable: false, reason: "uncacheable-render" };
      this.#send({ type: "cache-state", requestId: options.requestId, state: cacheState });
      this.#send({ type: "end", requestId: options.requestId });
    }
    return {
      chunks,
      bytes,
      chunksCount,
      control: lateControlSent ? controlRef.current : null,
      lateControlSent,
      cancelled: false,
    };
  }

  async #trySendFallbackRender({
    requestId,
    kind,
    route,
    params,
    searchParams,
    pathname,
    url,
    error,
    clientManifest,
    trace,
  }: {
    requestId: string;
    kind: "not-found" | "error";
    route: PathRoute | LayoutFallbackRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    pathname: string;
    url: URL;
    error?: unknown;
    clientManifest: ClientManifest;
    trace?: RscTraceMetadata;
  }): Promise<boolean> {
    try {
      const element = await this.#renderFallbackDocument({
        kind,
        route,
        params,
        searchParams,
        pathname,
        url,
        error: kind === "error" ? RscRenderer.#errorForFallback(error) : undefined,
        digest: kind === "error" ? "AKAN_RENDER_ERROR" : undefined,
      });
      if (!element) return false;
      const result = await this.#renderFlightElement(element, clientManifest, {
        requestId,
        status: kind === "not-found" ? 404 : 500,
        trace,
      });
      if (result.cancelled) return true;
      if (result.control) return false;
      this.#stats.lastFlightBytes = result.bytes;
      this.#stats.lastFlightChunks = result.chunksCount;
      this.#stats.totalFlightBytes += result.bytes;
      this.#stats.totalFlightChunks += result.chunksCount;
      return true;
    } catch (fallbackError) {
      this.#logger.error(
        `render[${requestId}] custom ${kind} fallback failed: ${
          fallbackError instanceof Error ? (fallbackError.stack ?? fallbackError.message) : String(fallbackError)
        }`,
      );
      return false;
    }
  }

  async #trySendSystemNotFoundRender({
    requestId,
    url,
    clientManifest,
    trace,
  }: {
    requestId: string;
    url: URL;
    clientManifest: ClientManifest;
    trace?: RscTraceMetadata;
  }): Promise<boolean> {
    try {
      const result = await this.#renderFlightElement(this.#renderSystemNotFound(url), clientManifest, {
        requestId,
        status: 404,
        trace,
      });
      if (result.cancelled) return true;
      if (result.control) return false;
      this.#stats.lastFlightBytes = result.bytes;
      this.#stats.lastFlightChunks = result.chunksCount;
      this.#stats.totalFlightBytes += result.bytes;
      this.#stats.totalFlightChunks += result.chunksCount;
      return true;
    } catch (error) {
      this.#logger.error(
        `render[${requestId}] system not-found fallback failed: ${
          error instanceof Error ? (error.stack ?? error.message) : String(error)
        }`,
      );
      return false;
    }
  }

  #sendRenderControl(requestId: string, control: RenderControl): void {
    if (control.type === "redirect") {
      this.#logger.verbose(`render[${requestId}] redirect ${control.location}`);
      this.#send({
        type: "redirect",
        requestId,
        location: control.location,
        method: control.method,
        status: control.status,
      });
      return;
    }
    if (control.type === "error") {
      const message = control.error instanceof Error ? control.error.message : String(control.error);
      this.#logger.verbose(`render[${requestId}] error`);
      this.#send({ type: "error", requestId, message });
      return;
    }
    this.#logger.verbose(`render[${requestId}] not-found`);
    this.#send({ type: "not-found", requestId });
  }

  async #resolveHeadSafePatchDecision(
    pathRoute: PathRoute,
    patchDecision: AkanRscPatchDecision,
    headSnapshot: ResolvedHead["headSnapshot"],
  ): Promise<AkanRscPatchDecision> {
    if (patchDecision.status !== "patch" || !patchDecision.patch) {
      return patchDecision;
    }
    if (!isAkanRscPartialCommitEnabled()) {
      return { status: "full", reason: "guard-disabled", commonPrefixLength: patchDecision.commonPrefixLength };
    }
    return resolveAkanRscHeadSafePatchDecision({
      partialCommitEnabled: true,
      patchDecision,
      pageConfig: await pathRoute.renderPage.getPageConfig?.(),
      headSnapshot,
    });
  }

  #recordRouteStats(routeId: string, flightBytes: number, durationMs: number): void {
    const current = this.#routeStats.get(routeId) ?? { routeId, count: 0, flightBytes: 0, totalDurationMs: 0 };
    current.count += 1;
    current.flightBytes += flightBytes;
    current.totalDurationMs += durationMs;
    this.#routeStats.set(routeId, current);
  }

  #topRoutes(sortBy: (route: RouteRenderStats) => number) {
    return [...this.#routeStats.values()]
      .sort((a, b) => sortBy(b) - sortBy(a))
      .slice(0, 10)
      .map((route) => ({
        routeId: route.routeId,
        count: route.count,
        flightBytes: route.flightBytes,
        avgDurationMs: route.count > 0 ? Math.round(route.totalDurationMs / route.count) : 0,
      }));
  }

  #getResultCacheEntry(request: Request, url: URL): { entry: RouteCacheEntry | null; reason?: string } {
    const decision = resolvePublicRouteCacheEntryDecision({
      request,
      url,
      theme: untrackedCookies().get("theme")?.value,
      defaultEnabled: process.env.NODE_ENV === "production",
      defaultAllow: process.env.NODE_ENV === "production",
      env: {
        enabled: process.env.AKAN_RSC_RESULT_CACHE,
        ttl: process.env.AKAN_RSC_RESULT_CACHE_TTL,
        allow: process.env.AKAN_RSC_RESULT_CACHE_PATHS,
        deny: process.env.AKAN_RSC_RESULT_CACHE_EXCLUDE_PATHS,
      },
    });
    if (!decision.entry) this.#resultCacheBypass += 1;
    return decision;
  }

  #getCachedResult(cacheKey: string): CachedRscResult | null {
    const cached = this.#resultCache.get(cacheKey);
    if (!cached) {
      this.#resultCacheMisses += 1;
      return null;
    }
    this.#resultCacheHits += 1;
    return cached;
  }

  #getCachedPatchResult(cacheKey: string): CachedRscResult | null {
    const cached = this.#patchResultCache.get(cacheKey);
    if (!cached) {
      this.#resultCacheMisses += 1;
      return null;
    }
    this.#resultCacheHits += 1;
    return cached;
  }

  #setCachedResult(cacheKey: string, result: CachedRscResult, ttl: number): void {
    this.#resultCache.set(cacheKey, result, ttl);
  }

  #setCachedPatchResult(cacheKey: string, result: CachedRscResult, ttl: number): void {
    this.#patchResultCache.set(cacheKey, result, ttl);
  }

  #runWithRequest<T>(request: Request, fn: () => Promise<T>): Promise<T> {
    if (requestStorage) return Promise.resolve(requestStorage.run(request, fn));
    return fn();
  }

  async #renderFallbackDocument({
    kind,
    route,
    params,
    searchParams,
    pathname,
    url,
    error,
    digest,
  }: {
    kind: "not-found" | "error";
    route: PathRoute | LayoutFallbackRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    pathname: string;
    url: URL;
    error?: unknown;
    digest?: string;
  }): Promise<ReactNode | null> {
    setRequestFrameState(
      await RouteElementComposer.resolveSsrFallbackFrameState({
        route,
        basePath: this.#getBasePath(url),
      }),
    );
    const body = await RouteElementComposer.composeFallback({
      kind,
      route,
      params,
      searchParams,
      pathname,
      error,
      digest,
    });
    if (!body) return null;
    const routeHead =
      "resolveHead" in route
        ? await RouteElementComposer.resolveHeadWithMetadata({
            pathRoute: route,
            params,
            searchParams,
          })
        : { node: undefined, hasExplicitLanguageAlternates: false };
    const routeHeadSnapshot = this.#createRouteHeadSnapshot(url, routeHead, {
      hasExplicitLanguageAlternates: routeHead.hasExplicitLanguageAlternates,
    });
    const theme = untrackedCookies().get("theme")?.value;
    return (
      <html
        lang={params.lang ?? RscRenderer.#getLocale(pathname, this.#i18n)}
        {...(theme ? { "data-theme": theme } : { suppressHydrationWarning: true })}
      >
        <head key="head">
          <meta key="charset" charSet="utf-8" />
          <meta key="viewport" name="viewport" content="width=device-width, initial-scale=1" />
          <meta key="robots" name="robots" content="noindex" />
          {routeHeadSnapshot
            ? renderAkanHeadSnapshot(routeHeadSnapshot)
            : (routeHead.node ?? this.#renderDefaultHead())}
          {!routeHeadSnapshot &&
          shouldRenderLocaleAlternates({ hasExplicitLanguageAlternates: routeHead.hasExplicitLanguageAlternates })
            ? this.#renderLocaleAlternates(url)
            : null}
          {this.#renderStylesheet(pathname)}
        </head>
        <body key="body">{body}</body>
      </html>
    );
  }

  async #renderMatched(
    url: URL,
    match: { pathRoute: PathRoute; params: Record<string, string> },
    theme?: string,
    searchParams = RouteTreeBuilder.parseSearchParams(url.search),
  ): Promise<ReactNode> {
    this.#logger.verbose(
      `composing route element pathname=${url.pathname} search=${url.search || "(none)"} params=${JSON.stringify(match.params)}`,
    );
    const pathRoute = await RouteElementComposer.resolveSsrFramePathRoute({
      pathRoute: match.pathRoute,
      basePath: this.#getBasePath(url),
    });
    setRequestFrameState(pathRoute.pageState);
    const routeHead = await RouteElementComposer.resolveHeadWithMetadata({
      pathRoute,
      params: match.params,
      searchParams,
    });
    const routeHeadSnapshot = this.#createRouteHeadSnapshot(url, routeHead, {
      isSpecialRoute: pathRoute.isSpecialRoute,
      hasExplicitLanguageAlternates: routeHead.hasExplicitLanguageAlternates,
    });
    const body = RouteElementComposer.compose({
      pathRoute,
      params: match.params,
      searchParams,
    });
    return (
      <html
        lang={match.params.lang ?? this.#i18n.defaultLocale}
        {...(theme ? { "data-theme": theme } : { suppressHydrationWarning: true })}
      >
        <head key="head">
          <meta key="charset" charSet="utf-8" />
          <meta key="viewport" name="viewport" content="width=device-width, initial-scale=1" />
          {routeHeadSnapshot
            ? renderAkanHeadSnapshot(routeHeadSnapshot)
            : (routeHead.node ?? this.#renderDefaultHead())}
          {!routeHeadSnapshot &&
          shouldRenderLocaleAlternates({
            isSpecialRoute: pathRoute.isSpecialRoute,
            hasExplicitLanguageAlternates: routeHead.hasExplicitLanguageAlternates,
          })
            ? this.#renderLocaleAlternates(url)
            : null}
          {this.#renderStylesheet(url.pathname)}
        </head>
        <body key="body">{body}</body>
      </html>
    );
  }

  async #renderMatchedSuffix(
    url: URL,
    match: { pathRoute: PathRoute; params: Record<string, string> },
    patchStartIndex: number,
    searchParams = RouteTreeBuilder.parseSearchParams(url.search),
  ): Promise<ReactNode | null> {
    this.#logger.verbose(
      `composing route suffix pathname=${url.pathname} start=${patchStartIndex} params=${JSON.stringify(match.params)}`,
    );
    const pathRoute = await RouteElementComposer.resolveSsrFramePathRoute({
      pathRoute: match.pathRoute,
      basePath: this.#getBasePath(url),
    });
    setRequestFrameState(pathRoute.pageState);
    return RouteElementComposer.composeSuffix({
      pathRoute,
      params: match.params,
      searchParams,
      patchStartIndex,
    });
  }

  async #renderNotFound(url: URL): Promise<ReactNode> {
    const matchedFallback = RouteTreeBuilder.matchFallback(url.pathname, this.#fallbackRoutes);
    if (matchedFallback) {
      try {
        const fallback = await this.#renderFallbackDocument({
          kind: "not-found",
          route: matchedFallback.fallbackRoute,
          params: matchedFallback.params,
          searchParams: RouteTreeBuilder.parseSearchParams(url.search),
          pathname: url.pathname,
          url,
        });
        if (fallback) return fallback;
      } catch (error) {
        this.#logger.error(
          `custom unmatched not-found fallback failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
        );
      }
    }
    return this.#renderSystemNotFound(url);
  }

  #renderSystemNotFound(url: URL): ReactNode {
    return createSystemPageDocument({
      kind: "not-found",
      pathname: url.pathname,
      lang: RscRenderer.#getLocale(url.pathname, this.#i18n),
      homeHref: getSystemPageHomeHref({
        pathname: url.pathname,
        i18n: this.#i18n,
        basePaths: this.#basePaths,
        headerBasePath: untrackedRequest()?.headers.get("x-base-path"),
      }),
      stylesheetHref: this.#getStylesheetHref(url.pathname),
    });
  }

  #renderDefaultHead(): ReactNode {
    return <title key="title">{process.env.AKAN_PUBLIC_APP_NAME ?? "Akan App"}</title>;
  }

  #getBasePath(url: URL): string | null {
    return getBasePathFromPathname(url.pathname, {
      basePaths: this.#basePaths,
      i18n: this.#i18n,
      headerBasePath: untrackedRequest()?.headers.get("x-base-path"),
    });
  }

  async #resolveRouteHeadSnapshot(
    url: URL,
    match: { pathRoute: PathRoute; params: Record<string, string> },
    searchParams: Record<string, string | string[]>,
  ): Promise<ResolvedHead["headSnapshot"]> {
    const routeHead = await RouteElementComposer.resolveHeadWithMetadata({
      pathRoute: match.pathRoute,
      params: match.params,
      searchParams,
    });
    return this.#createRouteHeadSnapshot(url, routeHead, {
      isSpecialRoute: match.pathRoute.isSpecialRoute,
      hasExplicitLanguageAlternates: routeHead.hasExplicitLanguageAlternates,
    });
  }

  #createRouteHeadSnapshot(
    url: URL,
    routeHead: ResolvedHead,
    options: { isSpecialRoute?: boolean; hasExplicitLanguageAlternates?: boolean },
  ): ResolvedHead["headSnapshot"] {
    if (!routeHead.headSnapshot) return undefined;
    return mergeAkanHeadSnapshots(
      routeHead.headSnapshot,
      shouldRenderLocaleAlternates(options) ? this.#createLocaleAlternateHeadSnapshot(url) : undefined,
    );
  }

  #createLocaleAlternateHeadSnapshot(url: URL): ResolvedHead["headSnapshot"] {
    return createAkanLocaleAlternateHeadSnapshot(this.#getLocaleAlternateLanguages(url));
  }

  #getLocaleAlternateLanguages(url: URL): Record<string, string> {
    const languages: Record<string, string> = {};
    const publicUrl = RscRenderer.#getPublicRequestUrl(url);
    for (const lang of this.#i18n.locales) {
      const alternateUrl = new URL(publicUrl);
      alternateUrl.pathname = RscRenderer.#replaceLocalePathSegment(publicUrl.pathname, lang);
      languages[lang] = alternateUrl.href;
    }
    const xDefaultUrl = new URL(publicUrl);
    xDefaultUrl.pathname = "/";
    xDefaultUrl.search = "";
    xDefaultUrl.hash = "";
    languages["x-default"] = xDefaultUrl.href;
    return languages;
  }

  #renderLocaleAlternates(url: URL): ReactNode {
    return Object.entries(this.#getLocaleAlternateLanguages(url)).map(([lang, href]) => (
      <link key={`alternate:${lang}`} rel="alternate" hrefLang={lang} href={href} />
    ));
  }

  #renderStylesheet(pathname: string): ReactNode {
    const cssUrl = this.#getStylesheetHref(pathname);
    if (!cssUrl) return null;
    return <link key="stylesheet" rel="stylesheet" href={cssUrl} precedence="default" data-akan-css="active" />;
  }

  #getStylesheetHref(pathname: string): string | null {
    const basePath = getBasePathFromPathname(pathname, {
      basePaths: Object.keys(this.#cssAssets),
      i18n: this.#i18n,
      headerBasePath: untrackedRequest()?.headers.get("x-base-path"),
    });
    return this.#cssAssets[basePath ?? ""]?.cssUrl ?? null;
  }

  static #getLocale(pathname: string, i18n: AkanI18nConfig): string {
    const [segment] = pathname.split("/").filter(Boolean);
    return segment && i18n.locales.includes(segment) ? segment : i18n.defaultLocale;
  }

  static #errorForFallback(error: unknown): unknown {
    if (process.env.NODE_ENV !== "production") return error;
    return undefined;
  }

  static #getPublicRequestUrl(url: URL): URL {
    const publicUrl = new URL(url);
    const req = untrackedRequest();
    const headers = req?.headers;
    const host = headers?.get("x-forwarded-host") ?? headers?.get("host");
    const proto = headers?.get("x-forwarded-proto");
    if (host) publicUrl.host = host;
    if (host && !host.includes(":")) publicUrl.port = "";
    if (proto) publicUrl.protocol = proto.endsWith(":") ? proto : `${proto}:`;

    const basePath = headers?.get("x-base-path");
    const parts = publicUrl.pathname.split("/").filter(Boolean);
    if (basePath && parts[1] === basePath) {
      publicUrl.pathname = `/${[parts[0], ...parts.slice(2)].filter(Boolean).join("/")}`;
    }
    return publicUrl;
  }

  static #replaceLocalePathSegment(pathname: string, lang: string): string {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length === 0) return `/${lang}`;
    return `/${[lang, ...parts.slice(1)].join("/")}`;
  }
}

if (import.meta.main) new RscRenderer().start();
