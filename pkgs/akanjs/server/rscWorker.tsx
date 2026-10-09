import type {
  AkanNotFoundError,
  AkanRedirectError,
  LayoutFallbackRoute,
  PageState,
  PathRoute,
  RedirectStatus,
  ResolvedHead,
} from "akanjs/client";
import { type AkanI18nConfig, DEFAULT_AKAN_I18N, getBasePathFromPathname, Logger } from "akanjs/common";
import {
  type AkanTheme,
  getRequestDynamicUsage,
  getRequestFrameState,
  getRequestPolicy,
  getRequestTheme,
  pushRequestFallback,
  requestStorage,
  setRequestFrameState,
  setRequestTheme,
  untrackedCookies,
  untrackedRequest,
  updateRequestPolicy,
} from "akanjs/fetch";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-server-dom-webpack/server.node";
import type { PagePromptRunInput } from "../signal/mcp/pagePrompt";
import { getCurrentTrace, runTraced, SignalTrace } from "../signal/trace";
import type { ClientManifest } from "./artifact";
import {
  LruTtlCache,
  type LruTtlCacheOptions,
  parsePositiveInt,
  type RouteCacheEntry,
  type RouteCacheRenderState,
  resolvePublicRouteCacheEntryDecision,
  resolveRouteCacheStoreTtl,
  shouldStoreRouteCache,
} from "./cachePolicy";
import { createAkanLocaleAlternateHeadSnapshot, mergeAkanHeadSnapshots, renderAkanHeadSnapshot } from "./head";
import { LogForwarder } from "./logging/logForwarder";
import { ProcessMetricsCollector } from "./processMetricsCollector";
import { RouteElementComposer, type RouteNotFoundInPlace } from "./routeElementComposer";
import {
  type AkanRscPatchDecision,
  createAkanRouterState,
  encodeAkanHeadSnapshot,
  encodeAkanRouterState,
  encodeAkanRscPatchSegmentPath,
  isAkanRscPartialCommitEnabled,
  readAkanRouterStateRequest,
  resolveAkanRscPartialDecision,
  resolveAkanRscPatchDecision,
} from "./routeState";
import { type PagesContext, RouteTreeBuilder } from "./routeTreeBuilder";
import { encodeAkanRedirectDigest } from "./rscHttp";
import { RscPagePrompts } from "./rscPagePrompts";
import {
  type CachedRscResult,
  createCachedRscPatchMetadata,
  createRscWorkerCachedPatchReplayDecision,
  invalidateCachedRscResults,
  isCachedRscPatchMetadataCompatible,
  replayCachedRscResult,
  resolveAkanRscHeadSafePatchDecision,
  resolveRscWorkerPatchCacheEntry,
  shouldCollectRscWorkerRenderChunks,
  shouldStoreRscWorkerPatchResult,
  shouldUseRscWorkerFullResultCache,
} from "./rscWorkerCache";
import type { RscTraceMetadata } from "./ssrTypes";
import {
  createSystemPageDocument,
  getPathnameLocale,
  getSystemPageHomeHref,
  SystemPageMain,
} from "./systemPageDocument";

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
  pagesBundlePath?: string;
  reloadId?: number;
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
interface LogLevelMsg {
  type: "log-level";
  minSev: number | null;
}
interface PagePromptsMsg {
  type: "page-prompts";
  requestId: string;
}
interface PagePromptRunMsg {
  type: "page-prompt.run";
  requestId: string;
  input: PagePromptRunInput;
}
type InMsg =
  | InitMsg
  | RenderMsg
  | CancelMsg
  | ReloadMsg
  | UpdateCssAssetsMsg
  | InvalidateCacheMsg
  | LogLevelMsg
  | PagePromptsMsg
  | PagePromptRunMsg;
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

/** Well above any sensible TTL: this reclaims a cache nobody is reading, not tracks expiry closely. */
const RESULT_CACHE_SWEEP_INTERVAL_MS = 60_000;

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
  readonly #logger = new Logger("RscWorker");
  readonly #logForwarder: LogForwarder;
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
  // Flight payloads have no natural size cap; without byte ceilings a few heavy routes fill every entry with MBs.
  #resultCache = new LruTtlCache<CachedRscResult>(
    parsePositiveInt(process.env.AKAN_RSC_RESULT_CACHE_MAX_ENTRIES) ?? 100,
    RscRenderer.#resultCacheOptions(),
  );
  #patchResultCache = new LruTtlCache<CachedRscResult>(
    parsePositiveInt(process.env.AKAN_RSC_RESULT_CACHE_MAX_ENTRIES) ?? 100,
    RscRenderer.#resultCacheOptions(),
  );
  readonly #activeRenderReaders = new Map<string, ReadableStreamDefaultReader<Uint8Array>>();
  readonly #cancelledRenderRequests = new Set<string>();
  #resultCacheHits = 0;
  #resultCacheMisses = 0;
  #resultCacheBypass = 0;
  readonly #send: (message: unknown) => void;
  readonly #pagePrompts = new RscPagePrompts({
    routes: () => this.#pathRoutes,
    run: (request, routeId, fn) => this.#runWithRequest(request, routeId, fn),
    defaultLocale: () => this.#i18n.defaultLocale,
  });

  constructor() {
    if (typeof process.send !== "function") {
      throw new Error("rscWorker must be run as a Bun subprocess with ipc enabled");
    }
    this.#send = process.send.bind(process) as (message: unknown) => void;
    Logger.role = "rsc-worker";
    if (Logger.isNdjson) Logger.consoleOutput = false;
    this.#logForwarder = new LogForwarder((message) => this.#send(message));
    process.on("message", (msg: InMsg) => this.#handleMessage(msg));
    // Fires when the parent replica dies, SIGKILL included; exit rather than linger as an orphaned renderer.
    process.on("disconnect", () => {
      this.#logger.warn("parent IPC channel closed; exiting rsc worker");
      process.exit(0);
    });
    this.#logger.verbose(`constructed (pid=${process.pid})`);
  }

  start(): void {
    this.#logger.verbose("sending hello to host");
    if (!this.#metricsTimer)
      this.#metricsTimer = ProcessMetricsCollector.startReporting(() => this.#sendMetricsReport());
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
        invalidateCachedRscResults(this.#resultCache, msg);
        invalidateCachedRscResults(this.#patchResultCache, msg);
        return;
      case "log-level":
        this.#logForwarder.setMinSev(msg.minSev);
        return;
      case "page-prompts":
        void this.#answer(msg.requestId, "page-prompts.result", () => this.#pagePrompts.list());
        return;
      case "page-prompt.run":
        void this.#answer(msg.requestId, "page-prompt.result", () => this.#pagePrompts.run(msg.input));
        return;
    }
  }

  async #answer(requestId: string, type: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      this.#send({ type, requestId, result: await fn() });
    } catch (error) {
      this.#send({ type: "error", requestId, message: error instanceof Error ? error.message : String(error) });
    }
  }

  #handleCancel(requestId: string): void {
    this.#cancelledRenderRequests.add(requestId);
    const reader = this.#activeRenderReaders.get(requestId);
    if (!reader) return;
    void reader.cancel().catch(() => {
      // Best-effort: the render loop also checks `#cancelledRenderRequests` before sending more chunks.
    });
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
      this.#send({
        type: "reloaded",
        buildId: msg.buildId,
        reloadId: msg.reloadId,
        pagesBundlePath: nextPagesBundlePath,
      });
    } catch (error) {
      this.#logger.error(
        `reload failed buildId=${msg.buildId}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      // The host settles on the latest reload alone; a superseded one's failure says nothing about it.
      if (seq !== this.#reloadSeq) return;
      this.#send({
        type: "error",
        requestId: "__reload__",
        buildId: msg.buildId,
        reloadId: msg.reloadId,
        running: { pagesBundlePath: this.#pagesBundlePath, buildId: this.#pagesBundleBuildId },
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
      const urlObj = new URL(url);
      const match = RouteTreeBuilder.match(urlObj.pathname, this.#pathRoutes);
      const routeId = match?.pathRoute.path ?? "__not_found__";
      await this.#runWithRequest(request, routeId, async () => {
        activeRoute.url = urlObj;
        this.#stats.lastRenderedPath = urlObj.pathname;
        activeRoute.match = match;
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
          ? await this.#resolveHeadSafePatchDecision(match.pathRoute, patchDecision, () =>
              this.#resolveRouteHeadSnapshot(urlObj, match, searchParams),
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
        const cachedPatch = patchCacheEntry ? this.#getCached(this.#patchResultCache, patchCacheEntry.key) : null;
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
          await this.#replayCached(requestId, routeId, startedAt, cachedPatch, {
            ...cachedTraceBase,
            cache: "hit",
            partial: "patch",
            partialReason: "cache-hit-patch-replay",
          });
          return;
        }
        const cached =
          shouldUseRscWorkerFullResultCache({ cacheEntry, patchCacheEntry }) && cacheEntry
            ? this.#getCached(this.#resultCache, cacheEntry.key)
            : null;
        if (cached) {
          await this.#replayCached(requestId, routeId, startedAt, cached, {
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
            ssrBlocking: cached.ssrBlocking,
          });
          return;
        }
        let element: ReactNode;
        let effectivePatchDecision = safePatchDecision;
        const notFoundProbe = { hit: false };
        const notFound = this.#notFoundInPlace(urlObj, notFoundProbe);
        if (match && safePatchDecision.status === "patch" && safePatchDecision.patch) {
          const suffixElement = await this.#renderMatchedSuffix(
            urlObj,
            match,
            safePatchDecision.patch.patchStartIndex,
            searchParams,
            notFound,
          );
          if (suffixElement === null) {
            effectivePatchDecision = {
              status: "full",
              reason: "suffix-compose-fallback",
              commonPrefixLength: safePatchDecision.commonPrefixLength,
            };
            element = await this.#renderMatched(urlObj, match, searchParams, notFound);
          } else element = suffixElement;
        } else if (match) element = await this.#renderMatched(urlObj, match, searchParams, notFound);
        else element = await this.#renderNotFound(urlObj);
        const traceCacheKey =
          effectivePatchDecision.status === "patch" ? (patchCacheEntry?.key ?? cacheEntry?.key) : cacheEntry?.key;
        const ssrBlocking = getRequestFrameState<PageState>()?.ssr === "block";
        const trace: RscTraceMetadata = {
          ...createTraceBase(effectivePatchDecision, traceCacheKey),
          cache: cacheEntry ? "miss" : "bypass",
          ssrBlocking,
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
          notFoundProbe,
          onComplete: ({ chunks, bytes, chunksCount, control, lateControlSent }) => {
            const cacheState = shouldStoreRouteCache({
              policy: getRequestPolicy(),
              dynamicUsage: getRequestDynamicUsage(),
              renderControlType: control?.type,
              lateRedirect: control?.type === "redirect" && lateControlSent,
            });
            const storeTtl = cacheEntry ? resolveRouteCacheStoreTtl(cacheEntry.ttl, cacheState) : null;
            const stored = (): CachedRscResult => ({
              chunks,
              bytes,
              chunksCount,
              pathname: urlObj.pathname,
              routeId,
              tags: cacheState.tags,
              theme: getRequestTheme(),
              ssrBlocking,
              cacheState,
            });
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
              const patch = createCachedRscPatchMetadata({ targetRouterState, patch: effectivePatchDecision.patch });
              this.#store("patch", this.#patchResultCache, patchCacheEntry.key, { ...stored(), patch }, storeTtl);
            } else if (cacheEntry && storeTtl !== null && effectivePatchDecision.status !== "patch") {
              this.#store("full", this.#resultCache, cacheEntry.key, stored(), storeTtl);
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
            if (systemResult.cancelled || !systemResult.control) return;
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
        this.#recordFlight(result);
        this.#stats.lastRenderDurationMs = Date.now() - startedAt;
        const afterLoadedKeys = RouteTreeBuilder.getCacheStats().loadedModuleKeys;
        this.#stats.lastRenderLoadedModules = afterLoadedKeys.filter((key) => !beforeLoadedKeys.includes(key));
        this.#stats.lastRenderLoadedModuleDelta = this.#stats.lastRenderLoadedModules.length;
        this.#recordRouteStats(routeId, result.bytes, this.#stats.lastRenderDurationMs);
        this.#logger.verbose(
          `render[${requestId}] done chunks=${result.chunksCount} bytes=${result.bytes} theme=${getRequestTheme() ?? "(none)"} in ${
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
      const { url: fallbackUrl, match: fallbackMatch } = activeRoute;
      const trySendFallback = async (kind: "not-found" | "error") =>
        !!fallbackUrl &&
        !!fallbackMatch &&
        (await this.#trySendFallbackRender({
          requestId,
          kind,
          route: fallbackMatch.pathRoute,
          params: fallbackMatch.params,
          searchParams: RouteTreeBuilder.parseSearchParams(fallbackUrl.search),
          pathname: fallbackUrl.pathname,
          url: fallbackUrl,
          error: kind === "error" ? error : undefined,
          clientManifest: msg.clientManifest ?? this.#clientManifest,
        }));
      if (isAkanNotFoundError(error)) {
        this.#stats.lastRenderKind = "not-found";
        this.#logger.verbose(`render[${requestId}] not-found`);
        if (await trySendFallback("not-found")) return;
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
      if (await trySendFallback("error")) return;
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
      rscResultCacheEntries: this.#resultCache.size,
      rscResultCacheBytes: this.#resultCache.byteSize,
      rscPatchResultCacheEntries: this.#patchResultCache.size,
      rscPatchResultCacheBytes: this.#patchResultCache.byteSize,
      rscResultCacheHits: this.#resultCacheHits,
      rscResultCacheMisses: this.#resultCacheMisses,
      rscResultCacheBypass: this.#resultCacheBypass,
    });
    this.#send({ type: "metrics", metrics });
  }

  // Past the first Flight chunk only a late redirect reaches the host, so this log is the only record of the failure.
  #reportRenderError(error: unknown, pathname?: string): void {
    const description = error instanceof Error ? (error.stack ?? error.message) : String(error);
    const scope = pathname ? ` path=${pathname}` : "";
    if (RscRenderer.#isExpectedRequestAbort(error)) {
      this.#logger.debug(`[rsc] render aborted${scope}: ${description}`);
      return;
    }
    this.#logger.error(`[rsc] render failed${scope}: ${description}`);
  }

  static #isExpectedRequestAbort(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return (
      error.name === "AbortError" ||
      error.message === "Connection closed." ||
      error.message.includes("The connection was closed")
    );
  }

  async #renderFlightElement(
    element: ReactNode,
    clientManifest: ClientManifest,
    options: {
      requestId?: string;
      collectChunks?: boolean;
      status?: number;
      trace?: RscTraceMetadata;
      /** Raised by a render that answered `router.notFound()` in place, which React never reports as an error. */
      notFoundProbe?: { hit: boolean };
      onComplete?: (
        result: Omit<FlightRenderResult, "cancelled">,
      ) => Promise<RouteCacheRenderState> | RouteCacheRenderState;
    } = {},
  ): Promise<FlightRenderResult> {
    const controlRef: { current: RenderControl | null } = { current: null };
    const stream = await renderToReadableStream(element, clientManifest, {
      onError: (error) => {
        if (isAkanRedirectError(error)) {
          const { location, method, status } = error;
          controlRef.current = { type: "redirect", location, method, status };
          return encodeAkanRedirectDigest({ location, method, status });
        }
        if (isAkanNotFoundError(error)) {
          controlRef.current = { type: "not-found" };
          return error.digest;
        }
        controlRef.current = { type: "error", error };
        this.#reportRenderError(error, options.trace?.pathname);
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
    let reportedTheme: AkanTheme | undefined;
    const sendMeta = () => {
      if (!options.requestId || sentMeta) return;
      sentMeta = true;
      if (options.status !== undefined) {
        const trace = getCurrentTrace();
        if (trace) trace.status = options.status;
      }
      reportedTheme = getRequestTheme();
      this.#send({
        type: "meta",
        requestId: options.requestId,
        theme: reportedTheme,
        status: options.status,
        trace: options.trace,
      });
    };
    //? The provider names the theme when the root layout renders, usually after the first chunk has left; sent ahead of
    //? the chunk carrying it, the host has it before the HTML shell (and its `<html data-theme>`) can be written.
    const sendLateTheme = () => {
      const theme = getRequestTheme();
      if (!options.requestId || !sentMeta || theme === reportedTheme) return;
      reportedTheme = theme;
      this.#send({ type: "theme", requestId: options.requestId, theme });
    };
    const readProbe = () => {
      if (!controlRef.current && options.notFoundProbe?.hit) controlRef.current = { type: "not-found" };
    };
    // Once bytes have left the status is the host's to decide: a redirect becomes a navigation, a not-found a 404 only
    // where the host still holds the response (a blocking or crawler render). An error stays in React's error path.
    const sendLateControl = () => {
      const control = controlRef.current;
      if (!options.requestId || lateControlSent || !control || control.type === "error") return;
      lateControlSent = true;
      if (control.type === "redirect") {
        this.#send({
          type: "late-redirect",
          requestId: options.requestId,
          location: control.location,
          method: control.method,
          status: control.status,
        });
        return;
      }
      if (!options.notFoundProbe?.hit)
        this.#logger.warn(
          `render[${options.requestId}] not-found raised below a route render after the stream started; that subtree renders nothing — call router.notFound() from the page or layout body`,
        );
      this.#send({ type: "late-not-found", requestId: options.requestId });
    };
    try {
      for (;;) {
        if (options.requestId && this.#cancelledRenderRequests.has(options.requestId)) {
          await reader.cancel();
          return { chunks, bytes, chunksCount, control: null, lateControlSent, cancelled: true };
        }
        const { value, done } = await reader.read();
        readProbe();
        if (controlRef.current && !sentChunk) {
          await reader.cancel();
          return { chunks, bytes, chunksCount, control: controlRef.current, lateControlSent, cancelled: false };
        }
        if (controlRef.current && sentChunk) sendLateControl();
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBufferLike);
        bytes += chunk.byteLength;
        chunksCount += 1;
        if (options.collectChunks) chunks.push(chunk);
        if (options.requestId) {
          sendMeta();
          sendLateTheme();
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
    readProbe();
    if (controlRef.current && sentChunk) sendLateControl();
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
        error: kind === "error" && process.env.NODE_ENV !== "production" ? error : undefined,
        digest: kind === "error" ? "AKAN_RENDER_ERROR" : undefined,
      });
      if (!element) return false;
      return await this.#trySendFlight(requestId, element, clientManifest, kind === "not-found" ? 404 : 500, trace);
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
      return await this.#trySendFlight(requestId, this.#renderSystemNotFound(url), clientManifest, 404, trace);
    } catch (error) {
      this.#logger.error(
        `render[${requestId}] system not-found fallback failed: ${
          error instanceof Error ? (error.stack ?? error.message) : String(error)
        }`,
      );
      return false;
    }
  }

  // A cancelled request counts as delivered; a control (redirect/not-found/error) leaves the next fallback to try.
  async #trySendFlight(
    requestId: string,
    element: ReactNode,
    clientManifest: ClientManifest,
    status: number,
    trace?: RscTraceMetadata,
  ): Promise<boolean> {
    const result = await this.#renderFlightElement(element, clientManifest, { requestId, status, trace });
    if (result.cancelled) return true;
    if (result.control) return false;
    this.#recordFlight(result);
    return true;
  }

  async #replayCached(
    requestId: string,
    routeId: string,
    startedAt: number,
    cached: CachedRscResult,
    trace: RscTraceMetadata,
  ): Promise<void> {
    this.#stats.lastRenderDurationMs = Date.now() - startedAt;
    this.#stats.lastRenderLoadedModuleDelta = 0;
    this.#stats.lastRenderLoadedModules = [];
    this.#recordFlight(cached);
    this.#recordRouteStats(routeId, cached.bytes, this.#stats.lastRenderDurationMs);
    await replayCachedRscResult({
      requestId,
      chunks: cached.chunks,
      theme: cached.theme,
      cacheState: cached.cacheState,
      trace,
      send: (message) => this.#send(message),
      isCancelled: () => this.#cancelledRenderRequests.has(requestId),
    });
  }

  #recordFlight({ bytes, chunksCount }: { bytes: number; chunksCount: number }): void {
    this.#stats.lastFlightBytes = bytes;
    this.#stats.lastFlightChunks = chunksCount;
    this.#stats.totalFlightBytes += bytes;
    this.#stats.totalFlightChunks += chunksCount;
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

  // Runs the head only when a patch hinges on it, so a cached replay skips it along with its notFound()/redirect().
  async #resolveHeadSafePatchDecision(
    pathRoute: PathRoute,
    patchDecision: AkanRscPatchDecision,
    resolveHeadSnapshot: () => Promise<ResolvedHead["headSnapshot"]>,
  ): Promise<AkanRscPatchDecision> {
    if (patchDecision.status !== "patch" || !patchDecision.patch) {
      return patchDecision;
    }
    if (!isAkanRscPartialCommitEnabled()) {
      return { status: "full", reason: "guard-disabled", commonPrefixLength: patchDecision.commonPrefixLength };
    }
    const pageConfig = await pathRoute.renderPage.getPageConfig?.();
    return resolveAkanRscHeadSafePatchDecision({
      partialCommitEnabled: true,
      patchDecision,
      pageConfig,
      headSnapshot: pageConfig?.rscPatchHeadSafe === true ? await resolveHeadSnapshot() : undefined,
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

  static #resultCacheOptions(): LruTtlCacheOptions<CachedRscResult> {
    return {
      sizeOf: (result) => result.bytes,
      maxBytes: LruTtlCache.parseByteCeiling(process.env.AKAN_RSC_RESULT_CACHE_MAX_BYTES),
      maxEntryBytes: LruTtlCache.parseByteCeiling(process.env.AKAN_RSC_RESULT_CACHE_MAX_BODY_BYTES),
      sweepIntervalMs: RESULT_CACHE_SWEEP_INTERVAL_MS,
    };
  }

  #getCached(cache: LruTtlCache<CachedRscResult>, cacheKey: string): CachedRscResult | null {
    const cached = cache.get(cacheKey);
    if (cached) this.#resultCacheHits += 1;
    else this.#resultCacheMisses += 1;
    return cached;
  }

  #store(kind: string, cache: LruTtlCache<CachedRscResult>, cacheKey: string, result: CachedRscResult, ttl: number) {
    if (cache.set(cacheKey, result, ttl)) return;
    this.#logger.verbose(
      `${kind} result cache store skipped pathname=${result.pathname} bytes=${result.bytes} reason=body-too-large`,
    );
  }

  #runWithRequest<T>(request: Request, routeId: string, fn: () => Promise<T>): Promise<T> {
    // Bun's ALS is empty while the Flight stream pumps, so a request fallback stays pushed until the render settles;
    // the fallback stack is global and last-push-wins, so concurrent renders can shadow each other.
    const cleanup = pushRequestFallback(request);
    const run = () => Promise.resolve(fn()).finally(() => cleanup());
    const traced = () => runTraced(SignalTrace.create(routeId, "page", "page"), run);
    if (requestStorage) return Promise.resolve(requestStorage.run(request, traced));
    return traced();
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
        ? await RouteElementComposer.resolveHeadWithSnapshot({
            pathRoute: route,
            params,
            searchParams,
          })
        : { node: undefined };
    const routeHeadSnapshot = this.#createRouteHeadSnapshot(url, routeHead);
    return (
      <html lang={params.lang ?? getPathnameLocale(pathname, this.#i18n)} suppressHydrationWarning>
        <head key="head">
          <meta key="charset" charSet="utf-8" />
          <meta key="viewport" name="viewport" content="width=device-width, initial-scale=1" />
          <meta key="robots" name="robots" content="noindex" />
          {routeHeadSnapshot
            ? renderAkanHeadSnapshot(routeHeadSnapshot)
            : (routeHead.node ?? this.#renderDefaultHead())}
          {routeHeadSnapshot ? null : this.#renderLocaleAlternates(url)}
          {this.#renderStylesheet(pathname)}
        </head>
        <body key="body">{body}</body>
      </html>
    );
  }

  async #renderMatched(
    url: URL,
    match: { pathRoute: PathRoute; params: Record<string, string> },
    searchParams: Record<string, string | string[]>,
    notFound: RouteNotFoundInPlace,
  ): Promise<ReactNode> {
    this.#logger.verbose(
      `composing route element pathname=${url.pathname} search=${url.search || "(none)"} params=${JSON.stringify(match.params)}`,
    );
    const pathRoute = await RouteElementComposer.resolveSsrFramePathRoute({
      pathRoute: match.pathRoute,
      basePath: this.#getBasePath(url),
    });
    setRequestFrameState(pathRoute.pageState);
    await RouteElementComposer.checkArgs({ pathRoute, params: match.params, searchParams });
    //? The provider names the theme only as it renders, which can be after the HTML shell and its data-theme are out.
    const rootThemes = await Promise.all(pathRoute.renderRootLayouts.map((render) => render.getLayoutTheme?.()));
    const rootTheme = rootThemes.find((theme) => theme !== undefined);
    if (rootTheme) setRequestTheme(rootTheme);
    const routeHead = await RouteElementComposer.resolveHeadWithSnapshot({
      pathRoute,
      params: match.params,
      searchParams,
    });
    const routeHeadSnapshot = this.#createRouteHeadSnapshot(url, routeHead);
    const body = RouteElementComposer.compose({
      pathRoute,
      params: match.params,
      searchParams,
      navKey: url.pathname + url.search,
      notFound,
    });
    // Cookie theme is applied on the HTML stream and by the client so RSC cache cannot replay a stale data-theme.
    return (
      <html lang={match.params.lang ?? this.#i18n.defaultLocale} suppressHydrationWarning>
        <head key="head">
          <meta key="charset" charSet="utf-8" />
          <meta key="viewport" name="viewport" content="width=device-width, initial-scale=1" />
          {routeHeadSnapshot
            ? renderAkanHeadSnapshot(routeHeadSnapshot)
            : (routeHead.node ?? this.#renderDefaultHead())}
          {routeHeadSnapshot ? null : this.#renderLocaleAlternates(url)}
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
    searchParams: Record<string, string | string[]>,
    notFound: RouteNotFoundInPlace,
  ): Promise<ReactNode | null> {
    this.#logger.verbose(
      `composing route suffix pathname=${url.pathname} start=${patchStartIndex} params=${JSON.stringify(match.params)}`,
    );
    const pathRoute = await RouteElementComposer.resolveSsrFramePathRoute({
      pathRoute: match.pathRoute,
      basePath: this.#getBasePath(url),
    });
    setRequestFrameState(pathRoute.pageState);
    await RouteElementComposer.checkArgs({ pathRoute, params: match.params, searchParams });
    await RouteElementComposer.resolveSuffixLoadings(pathRoute, patchStartIndex);
    return RouteElementComposer.composeSuffix({
      pathRoute,
      params: match.params,
      searchParams,
      patchStartIndex,
      navKey: url.pathname + url.search,
      notFound,
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

  #notFoundInPlace(url: URL, probe: { hit: boolean }): RouteNotFoundInPlace {
    return {
      pathname: url.pathname,
      onNotFound: () => {
        probe.hit = true;
      },
      systemFallback: () => (
        <SystemPageMain kind="not-found" pathname={url.pathname} homeHref={this.#systemHomeHref(url)} />
      ),
    };
  }

  #systemHomeHref(url: URL): string {
    return getSystemPageHomeHref({
      pathname: url.pathname,
      i18n: this.#i18n,
      basePaths: this.#basePaths,
      headerBasePath: untrackedRequest()?.headers.get("x-base-path"),
    });
  }

  #renderSystemNotFound(url: URL): ReactNode {
    return createSystemPageDocument({
      kind: "not-found",
      pathname: url.pathname,
      lang: getPathnameLocale(url.pathname, this.#i18n),
      homeHref: this.#systemHomeHref(url),
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
    const routeHead = await RouteElementComposer.resolveHeadWithSnapshot({
      pathRoute: match.pathRoute,
      params: match.params,
      searchParams,
    });
    return this.#createRouteHeadSnapshot(url, routeHead);
  }

  #createRouteHeadSnapshot(url: URL, routeHead: ResolvedHead): ResolvedHead["headSnapshot"] {
    if (!routeHead.headSnapshot) return undefined;
    return mergeAkanHeadSnapshots(
      routeHead.headSnapshot,
      createAkanLocaleAlternateHeadSnapshot(this.#getLocaleAlternateLanguages(url)),
    );
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

  static #getPublicRequestUrl(url: URL): URL {
    const publicUrl = new URL(url);
    const req = untrackedRequest();
    const headers = req?.headers;
    const host = headers?.get("x-forwarded-host")?.split(",")[0]?.trim() ?? headers?.get("host");
    const proto = headers?.get("x-forwarded-proto")?.split(",")[0]?.trim();
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
