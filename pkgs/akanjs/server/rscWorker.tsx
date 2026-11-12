import { AkanError } from "akanjs/base";
import type {
  AkanNotFoundError,
  AkanRedirectError,
  LayoutFallbackRoute,
  PageState,
  PathRoute,
  RedirectStatus,
  ResolvedHead,
  RouteRender,
  RouteViewport,
} from "akanjs/client";
import {
  type AkanI18nConfig,
  DEFAULT_AKAN_I18N,
  getBasePathFromPathname,
  LocalePath,
  Logger,
  parseSearchParams,
} from "akanjs/common";
import {
  type AkanTheme,
  getRequestDynamicUsage,
  getRequestFrameState,
  getRequestPolicy,
  getRequestTheme,
  RenderScope,
  requestStorage,
  setRequestFrameState,
  setRequestTheme,
  untrackedCookies,
  untrackedRequest,
  updateRequestPolicy,
} from "akanjs/fetch";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-server-dom-webpack/server.node";
import { RouteHead } from "../client/route/RouteHead";
import { ViewportMeta } from "../client/viewportMeta";
import { toManifestJson, webManifestHref } from "../client/webManifest";
import type { PagePromptRunInput, PagePromptVisibleInput } from "../signal/mcp/pagePrompt";
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
import { FallbackHead } from "./fallbackHead";
import { resolveHeadResult } from "./head";
import { LogForwarder } from "./logging/logForwarder";
import { ProcessMetricsCollector } from "./processMetricsCollector";
import { type AdmittedNotFoundFallback, RouteElementComposer, type RouteNotFoundInPlace } from "./routeElementComposer";
import { RouteShellGate } from "./routeShellGate";
import { encodeAkanRouterState, isAkanRscPartialCommitEnabled } from "./routeState";
import { type PagesContext, RouteTreeBuilder } from "./routeTreeBuilder";
import { concatBytes, encodeAkanRedirectDigest } from "./rscHttp";
import { RscPagePrompts } from "./rscPagePrompts";
import { type ResolvedRouteHead, type RouteHeadSnapshots, RscPatchPlanner } from "./rscPatchPlanner";
import { AkanRouteHeadReference } from "./rscSegmentOutletReference";
import {
  type CachedRscResult,
  createCachedRscPatchMetadata,
  createRscWorkerCachedPatchReplayDecision,
  invalidateCachedRscResults,
  isCachedRscPatchMetadataCompatible,
  replayCachedRscResult,
  resolveRscWorkerPatchCacheEntry,
  rscWorkerTraceBaseOf,
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
  prefetch?: boolean;
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
interface PagePromptsVisibleMsg {
  type: "page-prompts.visible";
  requestId: string;
  input: PagePromptVisibleInput;
}
interface WebManifestMsg {
  type: "web-manifest";
  requestId: string;
  basePath: string | null;
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
  | PagePromptRunMsg
  | PagePromptsVisibleMsg
  | WebManifestMsg;
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

interface RscRendererStats {
  renderCount: number;
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
  readonly #inFlightRenders = new Map<string, { cancelled: boolean }>();
  #resultCacheHits = 0;
  #resultCacheMisses = 0;
  #resultCacheBypass = 0;
  readonly #send: (message: unknown) => void;
  readonly #pagePrompts = new RscPagePrompts({
    routes: () => this.#pathRoutes,
    run: (request, routeId, fn) => this.#runWithRequest(request, routeId, fn),
    defaultLocale: () => this.#i18n.defaultLocale,
  });
  readonly #patchPlanner = new RscPatchPlanner({
    logger: this.#logger,
    routes: () => this.#pathRoutes,
    buildId: () => this.#pagesBundleBuildId,
    basePathOf: (url) => this.#getBasePath(url),
    localeAlternatesOf: (url) => this.#getLocaleAlternateLanguages(url),
    defaultHead: () => this.#renderDefaultHead(),
  });

  constructor() {
    if (typeof process.send !== "function")
      throw new AkanError("ipcRequired", "rscWorker must be run as a Bun subprocess with ipc enabled");
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
      case "page-prompts.visible":
        void this.#answer(msg.requestId, "page-prompts.visible.result", () => this.#pagePrompts.visible(msg.input));
        return;
      case "web-manifest":
        void this.#answer(msg.requestId, "web-manifest.result", () => this.#webManifest(msg.basePath));
        return;
    }
  }

  async #webManifest(basePath: string | null): Promise<unknown> {
    const pathname = `/${this.#i18n.defaultLocale}${basePath ? `/${basePath}` : ""}`;
    const rootLayouts = RouteTreeBuilder.matchFallback(pathname, this.#fallbackRoutes)?.fallbackRoute.renderRootLayouts;
    const manifest = await RscRenderer.#firstRootValue(rootLayouts ?? [], (render) => render.getLayoutManifest?.());
    return manifest ? toManifestJson(manifest) : null;
  }

  async #answer(requestId: string, type: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      this.#send({ type, requestId, result: await fn() });
    } catch (error) {
      this.#send({ type: "error", requestId, message: error instanceof Error ? error.message : String(error) });
    }
  }

  #handleCancel(requestId: string): void {
    const render = this.#inFlightRenders.get(requestId);
    if (!render) return;
    render.cancelled = true;
    const reader = this.#activeRenderReaders.get(requestId);
    if (!reader) return;
    void reader.cancel().catch(() => {
      // Best-effort: the render loop also checks `#inFlightRenders` before sending more chunks.
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
    //? Taken in message order: an `updateCssAssets` that arrives while the bundle imports is newer than this one.
    if (msg.cssAssets) this.#cssAssets = msg.cssAssets;
    try {
      const nextPagesBundlePath =
        msg.pagesBundlePath && msg.pagesBundlePath !== this.#pagesBundlePath
          ? msg.pagesBundlePath
          : this.#pagesBundlePath;
      this.#logger.verbose(
        `reload state buildId=${msg.buildId} bundlePath=${nextPagesBundlePath} cssAssets=${Object.keys(this.#cssAssets).length} clientEntries=${Object.keys(msg.clientManifest).length}`,
      );
      const routes = await this.#importPages(nextPagesBundlePath, msg.buildId);
      if (seq !== this.#reloadSeq) {
        this.#logger.verbose(`reload stale buildId=${msg.buildId} seq=${seq} latest=${this.#reloadSeq}`);
        return;
      }
      this.#clientManifest = msg.clientManifest;
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
    if (!pages) throw new AkanError("invalidArtifact", `pages export not found in ${specifier}`);

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
    this.#inFlightRenders.set(requestId, { cancelled: false });
    const activeRoute: {
      url: URL | null;
      match: { pathRoute: PathRoute; params: Record<string, string> } | null;
      request: Request | null;
    } = { url: null, match: null, request: null };
    try {
      const request = new Request(url, { method, headers });
      const urlObj = new URL(url);
      const match = RouteTreeBuilder.match(urlObj.pathname, this.#pathRoutes);
      const routeId = match?.pathRoute.path ?? "__not_found__";
      await this.#runWithRequest(request, routeId, async () => {
        activeRoute.url = urlObj;
        activeRoute.request = request;
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
        const searchParams = parseSearchParams(urlObj.search);
        const fallbackMatch = match ? null : RouteTreeBuilder.matchFallback(urlObj.pathname, this.#fallbackRoutes);
        const notFoundFallback = await RouteElementComposer.admitNotFoundFallback(fallbackMatch, searchParams);
        const verdict =
          msg.prefetch && (await RouteElementComposer.prefetchVerdict(match, notFoundFallback, searchParams));
        if (verdict === "refused") {
          this.#send({ type: "meta", requestId, status: 204 });
          this.#send({ type: "end", requestId });
          return;
        }
        const admitted = verdict === "admitted";
        const cacheDecision = match ? this.#getResultCacheEntry(request, urlObj) : { entry: null };
        const cacheEntry = cacheDecision.entry;
        const {
          targetRouterState,
          currentRouterState,
          decision: safePatchDecision,
          admittedHead,
        } = await this.#patchPlanner.plan({ request, url: urlObj, match, searchParams, admitted });
        const patchCacheEntry = resolveRscWorkerPatchCacheEntry({
          cacheEntry,
          targetRouterState,
          safePatchDecision,
          partialCommitEnabled: isAkanRscPartialCommitEnabled(),
        });
        const createTraceBase = rscWorkerTraceBaseOf({
          navId: requestId,
          pathname: urlObj.pathname,
          routeId,
          routerStateReason: currentRouterState.reason,
          cacheKey: cacheEntry?.key,
          cacheReason: cacheDecision.reason,
          routeState: targetRouterState,
        });
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
            RscPatchPlanner.routeStateWith(cachedPatch.patch.targetRouterState, admittedHead?.snapshots?.layoutsKey),
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
          const traceBase = createTraceBase(
            safePatchDecision,
            patchCacheEntry?.key ?? cacheEntry?.key,
            RscPatchPlanner.routeStateWith(targetRouterState, cached.routeHeadKey),
          );
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
        let routeHead: ResolvedRouteHead | undefined;
        let effectivePatchDecision = safePatchDecision;
        const notFoundProbe = { hit: false };
        const notFound = this.#notFoundInPlace(urlObj, notFoundProbe);
        const gate = new RouteShellGate();
        if (match && safePatchDecision.status === "patch" && safePatchDecision.patch) {
          const suffixElement = await this.#renderMatchedSuffix(
            urlObj,
            match,
            safePatchDecision.patch.patchStartIndex,
            searchParams,
            notFound,
            { guarded: admitted || !!admittedHead },
          );
          if (suffixElement === null) {
            effectivePatchDecision = {
              status: "full",
              reason: "suffix-compose-fallback",
              commonPrefixLength: safePatchDecision.commonPrefixLength,
            };
            ({ element, head: routeHead } = await this.#renderMatched(urlObj, match, searchParams, notFound, {
              guarded: true,
              head: admittedHead,
              gate,
            }));
          } else {
            element = suffixElement;
            routeHead = admittedHead;
          }
        } else if (match)
          ({ element, head: routeHead } = await this.#renderMatched(urlObj, match, searchParams, notFound, {
            guarded: admitted || !!admittedHead,
            head: admittedHead,
            gate,
          }));
        else element = await this.#renderNotFound(urlObj, notFoundFallback, gate);
        const routeHeadKey = routeHead?.snapshots?.layoutsKey;
        const traceCacheKey =
          effectivePatchDecision.status === "patch" ? (patchCacheEntry?.key ?? cacheEntry?.key) : cacheEntry?.key;
        const ssrBlocking = getRequestFrameState<PageState>()?.ssr === "block";
        const trace: RscTraceMetadata = {
          ...createTraceBase(effectivePatchDecision, traceCacheKey),
          cache: cacheEntry ? "miss" : "bypass",
          ssrBlocking,
        };
        //? Only the matched render shows the route head; an error or not-found render sent in its place has none.
        const renderedRouteState = RscPatchPlanner.routeStateWith(targetRouterState, routeHeadKey);
        const renderedTrace = renderedRouteState
          ? { ...trace, routeState: encodeAkanRouterState(renderedRouteState) }
          : trace;
        this.#logger.verbose(`render[${requestId}] starting Flight stream`);
        const result = await this.#renderFlightElement(element, msg.clientManifest ?? this.#clientManifest, {
          requestId,
          collectChunks: shouldCollectRscWorkerRenderChunks({
            cacheEntry,
            effectivePatchDecision,
            patchCacheEntry,
          }),
          status: match ? undefined : 404,
          trace: renderedTrace,
          notFoundProbe,
          gate,
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
              routeHeadKey,
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
      const { url: fallbackUrl, match: fallbackMatch, request: fallbackRequest } = activeRoute;
      //? The render's request scope ended with its throw; outside one, a request read sees no request at all.
      const inRequestScope = (send: () => Promise<boolean>) =>
        fallbackRequest ? this.#runInRequestScope(fallbackRequest, send) : send();
      const trySendFallback = async (kind: "not-found" | "error") =>
        !!fallbackUrl &&
        !!fallbackMatch &&
        (await inRequestScope(() =>
          this.#trySendFallbackRender({
            requestId,
            kind,
            route: RouteElementComposer.fallbackRouteOf(fallbackMatch.pathRoute, error),
            params: fallbackMatch.params,
            searchParams: parseSearchParams(fallbackUrl.search),
            pathname: fallbackUrl.pathname,
            url: fallbackUrl,
            error: kind === "error" ? error : undefined,
            clientManifest: msg.clientManifest ?? this.#clientManifest,
          }),
        ));
      if (isAkanNotFoundError(error)) {
        this.#stats.lastRenderKind = "not-found";
        this.#logger.verbose(`render[${requestId}] not-found`);
        if (await trySendFallback("not-found")) return;
        if (
          fallbackUrl &&
          (await inRequestScope(() =>
            this.#trySendSystemNotFoundRender({
              requestId,
              url: fallbackUrl,
              clientManifest: msg.clientManifest ?? this.#clientManifest,
            }),
          ))
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
      this.#inFlightRenders.delete(requestId);
    }
  }

  async #sendMetricsReport() {
    const routeStats = RouteTreeBuilder.getCacheStats();
    const metrics = await ProcessMetricsCollector.collect({
      role: "rsc-worker",
      rscRenderCount: this.#stats.renderCount,
      rscInFlightRenderCount: this.#inFlightRenders.size,
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
  //? Security: React sends the returned digest to the browser, and a thrown message can quote a statement's row data.
  #reportRenderError(error: unknown, pathname?: string): string {
    const message = error instanceof Error ? error.message : String(error);
    const description = error instanceof Error ? (error.stack ?? message) : message;
    const opaque = process.env.NODE_ENV === "production";
    const digest = opaque ? crypto.randomUUID().slice(0, 8) : message || "AKAN_RENDER_ERROR";
    const scope = `${pathname ? ` path=${pathname}` : ""}${opaque ? ` digest=${digest}` : ""}`;
    if (RscRenderer.#isExpectedRequestAbort(error)) this.#logger.debug(`[rsc] render aborted${scope}: ${description}`);
    else this.#logger.error(`[rsc] render failed${scope}: ${description}`);
    return digest;
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
      gate?: RouteShellGate;
      onComplete?: (
        result: Omit<FlightRenderResult, "cancelled">,
      ) => Promise<RouteCacheRenderState> | RouteCacheRenderState;
    } = {},
  ): Promise<FlightRenderResult> {
    const controlRef: { current: RenderControl | null } = { current: null };
    const requestCancelled = () => !!options.requestId && !!this.#inFlightRenders.get(options.requestId)?.cancelled;
    //? Cancelling a Flight stream aborts each pending task through `onError`; the control that cancelled it stands.
    let isCancelling = false;
    const stream = await renderToReadableStream(element, clientManifest, {
      onError: (error) => {
        if (isCancelling || requestCancelled()) return;
        if (isAkanRedirectError(error)) {
          const { location, method, status } = error;
          controlRef.current = { type: "redirect", location, method, status };
          return encodeAkanRedirectDigest({ location, method, status });
        }
        if (isAkanNotFoundError(error)) {
          controlRef.current = { type: "not-found" };
          return error.digest;
        }
        if (!RouteElementComposer.streamed(error)) controlRef.current = { type: "error", error };
        return this.#reportRenderError(error, options.trace?.pathname);
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
    //? Held until the levels above the first `.loading()` settle, so an error they throw still gets its `.error()`.
    let holding = options.gate?.holding ? options.gate : null;
    let held: Uint8Array | null = null;
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
    const cancelWith = async (control: RenderControl | null, cancelled: boolean): Promise<FlightRenderResult> => {
      isCancelling = true;
      await reader.cancel();
      return { chunks, bytes, chunksCount, control, lateControlSent, cancelled };
    };
    const readProbe = () => {
      if (!controlRef.current && options.notFoundProbe?.hit) controlRef.current = { type: "not-found" };
    };
    const emit = (chunk: Uint8Array) => {
      if (options.collectChunks) chunks.push(chunk);
      if (!options.requestId) return;
      sendMeta();
      sendLateTheme();
      this.#send({ type: "chunk", requestId: options.requestId, data: chunk });
      sentChunk = true;
    };
    const releaseHeld = () => {
      holding = null;
      if (!held) return;
      if (controlRef.current) {
        sendMeta();
        sendLateControl();
      }
      emit(held);
      held = null;
    };
    // Once bytes have left the status is the host's to decide: a redirect becomes a navigation, a not-found a 404 only
    // where the host still holds the response (a held level, a blocking or crawler render). An error stays in React's.
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
      let pendingRead: ReturnType<typeof reader.read> | null = null;
      for (;;) {
        if (requestCancelled()) return await cancelWith(null, true);
        pendingRead ??= reader.read();
        if (holding && (await Promise.race([pendingRead.then(() => false), holding.opened.then(() => true)]))) {
          readProbe();
          if (controlRef.current?.type === "error") return await cancelWith(controlRef.current, false);
          releaseHeld();
          continue;
        }
        const { value, done } = await pendingRead;
        pendingRead = null;
        if (requestCancelled()) return await cancelWith(null, true);
        readProbe();
        if (controlRef.current && !sentChunk && (!holding || controlRef.current.type === "error"))
          return await cancelWith(controlRef.current, false);
        if (controlRef.current && sentChunk) sendLateControl();
        if (done) break;
        //? Flight writes its first row before an async render settles; held one task, a redirect or not-found the body
        //? raised with no I/O awaited still leaves before any byte, as a real status.
        if (chunksCount === 0 && options.requestId) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          readProbe();
          if (controlRef.current) return await cancelWith(controlRef.current, false);
        }
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBufferLike);
        bytes += chunk.byteLength;
        chunksCount += 1;
        if (holding) held = held ? concatBytes(held, chunk) : chunk;
        else emit(chunk);
      }
    } catch (error) {
      if (requestCancelled()) return { chunks, bytes, chunksCount, control: null, lateControlSent, cancelled: true };
      throw error;
    } finally {
      if (options.requestId) this.#activeRenderReaders.delete(options.requestId);
      reader.releaseLock();
    }
    readProbe();
    if (holding && controlRef.current?.type !== "error") releaseHeld();
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
      const gate = new RouteShellGate();
      const element = await this.#renderFallbackDocument({
        kind,
        route,
        params,
        searchParams,
        pathname,
        url,
        error: kind === "error" && process.env.NODE_ENV !== "production" ? error : undefined,
        digest: kind === "error" ? "AKAN_RENDER_ERROR" : undefined,
        gate,
      });
      if (!element) return false;
      return await this.#trySendFlight(
        requestId,
        element,
        clientManifest,
        kind === "not-found" ? 404 : 500,
        trace,
        gate,
      );
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
    gate?: RouteShellGate,
  ): Promise<boolean> {
    const result = await this.#renderFlightElement(element, clientManifest, { requestId, status, trace, gate });
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
      isCancelled: () => !!this.#inFlightRenders.get(requestId)?.cancelled,
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
    return this.#runInRequestScope(request, () => runTraced(SignalTrace.create(routeId, "page", "page"), fn));
  }

  #runInRequestScope<T>(request: Request, fn: () => Promise<T>): Promise<T> {
    const render = () => RenderScope.run(fn);
    return requestStorage ? requestStorage.run(request, render) : render();
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
    gate,
  }: {
    kind: "not-found" | "error";
    route: PathRoute | LayoutFallbackRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    pathname: string;
    url: URL;
    error?: unknown;
    digest?: string;
    gate?: RouteShellGate;
  }): Promise<ReactNode | null> {
    setRequestFrameState(
      await RouteElementComposer.resolveSsrFallbackFrameState({
        route,
        basePath: this.#getBasePath(url),
      }),
    );
    const fallbackHead = new FallbackHead();
    const body = await RouteElementComposer.composeFallback({
      kind,
      route,
      params,
      searchParams,
      pathname,
      error,
      digest,
      gate,
      head: fallbackHead,
    });
    if (!body) return null;
    const viewport = await RscRenderer.#firstRootValue(route.renderRootLayouts, (render) =>
      render.getLayoutViewport?.(),
    );
    const manifestLink = await this.#renderManifestLink(url, route.renderRootLayouts);
    const routeHead = await RscRenderer.#resolveFallbackHead({ kind, route, params, searchParams });
    return (
      <html lang={params.lang ?? getPathnameLocale(pathname, this.#i18n)} suppressHydrationWarning>
        <head key="head">
          <meta key="charset" charSet="utf-8" />
          {this.#renderViewport(viewport)}
          <FallbackHead.Settled
            key="route-head"
            head={fallbackHead}
            until={gate?.opened ?? Promise.resolve()}
            render={(tags) => this.#renderHeadTags(url, { manifestLink, routeHead, noindex: true, tags })}
          />
          {this.#renderStylesheet(pathname)}
        </head>
        <body key="body">
          {body}
          {gate?.holding ? <RouteShellGate.Wait until={gate.opened} /> : null}
        </body>
      </html>
    );
  }

  //? A not-found view is its layouts' view: the page's own head describes what is missing, or is what called notFound(),
  //? and a layout head that called it would refuse the view again.
  static async #resolveFallbackHead({
    kind,
    route,
    params,
    searchParams,
  }: {
    kind: "not-found" | "error";
    route: PathRoute | LayoutFallbackRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
  }): Promise<ResolvedHead> {
    if (!("resolveHead" in route)) return { node: undefined };
    if (kind === "error")
      return await RouteElementComposer.resolveHeadWithSnapshot({ pathRoute: route, params, searchParams });
    const levels = await Promise.all(
      [...route.renderRootLayouts, ...route.renderLayouts].map(async (render) => {
        try {
          return await render.resolveHead?.({ params, searchParams });
        } catch (error) {
          if (isAkanNotFoundError(error)) return undefined;
          throw error;
        }
      }),
    );
    return resolveHeadResult(RouteHead.mergePage(RouteHead.merge(levels), undefined));
  }

  async #renderMatched(
    url: URL,
    match: { pathRoute: PathRoute; params: Record<string, string> },
    searchParams: Record<string, string | string[]>,
    notFound: RouteNotFoundInPlace,
    { guarded = false, head, gate }: { guarded?: boolean; head?: ResolvedRouteHead; gate?: RouteShellGate } = {},
  ): Promise<{ element: ReactNode; head: ResolvedRouteHead }> {
    this.#logger.verbose(
      `composing route element pathname=${url.pathname} search=${url.search || "(none)"} params=${JSON.stringify(match.params)}`,
    );
    const pathRoute = await RouteElementComposer.resolveSsrFramePathRoute({
      pathRoute: match.pathRoute,
      basePath: this.#getBasePath(url),
    });
    setRequestFrameState(pathRoute.pageState);
    if (!guarded) await RouteElementComposer.admit({ pathRoute, params: match.params, searchParams });
    //? The provider names the theme only as it renders, which can be after the HTML shell and its data-theme are out.
    const rootLayouts = pathRoute.renderRootLayouts;
    const rootTheme = await RscRenderer.#firstRootValue(rootLayouts, (render) => render.getLayoutTheme?.());
    if (rootTheme) setRequestTheme(rootTheme);
    const viewport = await RscRenderer.#firstRootValue(rootLayouts, (render) => render.getLayoutViewport?.());
    //? The result cache keys on the theme cookie, so this color is never replayed to a visitor on another theme.
    const themeColorTheme = untrackedCookies().get("theme")?.value ?? rootTheme;
    const manifestLink = await this.#renderManifestLink(url, rootLayouts);
    const routeHead = head ?? (await this.#patchPlanner.resolveHead(url, pathRoute, match.params, searchParams));
    const fallbackHead = new FallbackHead();
    const body = RouteElementComposer.compose({
      pathRoute,
      params: match.params,
      searchParams,
      navKey: url.pathname + url.search,
      notFound: { ...notFound, head: fallbackHead },
      gate,
    });
    const renderHead = async (tags: ReactNode[] | null) => {
      if (!tags)
        return this.#renderHeadTags(url, {
          manifestLink,
          routeHead: routeHead.layers.head,
          snapshots: routeHead.snapshots,
        });
      const layoutsHead = await RscRenderer.#resolveFallbackHead({
        kind: "not-found",
        route: pathRoute,
        params: match.params,
        searchParams,
      });
      return this.#renderHeadTags(url, { manifestLink, routeHead: layoutsHead, noindex: true, tags });
    };
    // Cookie theme is applied on the HTML stream and by the client so RSC cache cannot replay a stale data-theme.
    const element = (
      <html lang={match.params.lang ?? this.#i18n.defaultLocale} suppressHydrationWarning>
        <head key="head">
          <meta key="charset" charSet="utf-8" />
          {this.#renderViewport(viewport, themeColorTheme)}
          <FallbackHead.Settled
            key="route-head"
            head={fallbackHead}
            until={gate?.opened ?? Promise.resolve()}
            render={renderHead}
          />
          {this.#renderStylesheet(url.pathname)}
        </head>
        <body key="body">
          {body}
          {gate?.holding ? <RouteShellGate.Wait until={gate.opened} /> : null}
        </body>
      </html>
    );
    return { element, head: routeHead };
  }

  async #renderMatchedSuffix(
    url: URL,
    match: { pathRoute: PathRoute; params: Record<string, string> },
    patchStartIndex: number,
    searchParams: Record<string, string | string[]>,
    notFound: RouteNotFoundInPlace,
    { guarded = false }: { guarded?: boolean } = {},
  ): Promise<ReactNode | null> {
    this.#logger.verbose(
      `composing route suffix pathname=${url.pathname} start=${patchStartIndex} params=${JSON.stringify(match.params)}`,
    );
    const pathRoute = await RouteElementComposer.resolveSsrFramePathRoute({
      pathRoute: match.pathRoute,
      basePath: this.#getBasePath(url),
    });
    setRequestFrameState(pathRoute.pageState);
    if (!guarded) await RouteElementComposer.admit({ pathRoute, params: match.params, searchParams });
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

  async #renderNotFound(
    url: URL,
    notFoundFallback: AdmittedNotFoundFallback | null,
    gate?: RouteShellGate,
  ): Promise<ReactNode> {
    if (notFoundFallback) {
      const { route, params, searchParams } = notFoundFallback;
      try {
        const fallback = await this.#renderFallbackDocument({
          kind: "not-found",
          route,
          params,
          searchParams,
          pathname: url.pathname,
          url,
          gate,
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

  static async #firstRootValue<T>(
    renderRootLayouts: RouteRender[],
    read: (render: RouteRender) => T | Promise<T | undefined> | undefined,
  ): Promise<T | undefined> {
    const values = await Promise.all(renderRootLayouts.map(read));
    return values.find((value) => value !== undefined);
  }

  #renderViewport(viewport: RouteViewport | undefined, theme?: string): ReactNode {
    return (
      <>
        <meta key="viewport" name="viewport" content={ViewportMeta.content(viewport)} />
        {ViewportMeta.themeColors(viewport, theme).map(({ content, media }) => (
          <meta key={`theme-color:${media ?? ""}`} name="theme-color" content={content} media={media} />
        ))}
      </>
    );
  }

  //? In the shell's own head: a link streamed with the body lands in <body>, where Chromium never reads a manifest.
  async #renderManifestLink(url: URL, renderRootLayouts: RouteRender[]): Promise<ReactNode> {
    const manifest = await RscRenderer.#firstRootValue(renderRootLayouts, (render) => render.getLayoutManifest?.());
    if (manifest === undefined) return null;
    //? The basePath the URL shows; one a host maps to (x-base-path) is not in the path, and the server reads it there.
    const basePath = getBasePathFromPathname(url.pathname, { basePaths: this.#basePaths, i18n: this.#i18n });
    return <link key="manifest" rel="manifest" href={webManifestHref(basePath)} />;
  }

  #renderHeadTags(
    url: URL,
    {
      manifestLink,
      routeHead,
      snapshots,
      noindex = false,
      tags = null,
    }: {
      manifestLink: ReactNode;
      routeHead: ResolvedHead;
      snapshots?: RouteHeadSnapshots;
      noindex?: boolean;
      tags?: ReactNode[] | null;
    },
  ): ReactNode {
    if (snapshots) {
      const ownsManifest = [...snapshots.layouts.nodes, ...snapshots.page.nodes].some(
        (node) => RouteHead.keyOf(node.tag, node.attrs ?? {}) === "link:manifest",
      );
      return (
        <>
          {ownsManifest ? null : manifestLink}
          <AkanRouteHeadReference layouts={snapshots.layouts} page={snapshots.page} />
        </>
      );
    }
    const head = routeHead.node ?? this.#renderDefaultHead();
    return (
      <>
        {RouteHead.mergeNodes([manifestLink, head, noindex ? RouteHead.noindexOver(head) : null, tags])}
        {this.#renderLocaleAlternates(url)}
      </>
    );
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

  #getLocaleAlternateLanguages(url: URL): Record<string, string> {
    const languages: Record<string, string> = {};
    const publicUrl = RscRenderer.#getPublicRequestUrl(url);
    for (const lang of this.#i18n.locales) {
      const alternateUrl = new URL(publicUrl);
      alternateUrl.pathname = RscRenderer.#replaceLocalePathSegment(publicUrl.pathname, lang, this.#i18n);
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

  static #replaceLocalePathSegment(pathname: string, lang: string, i18n: AkanI18nConfig): string {
    const parts = pathname.split("/").filter(Boolean);
    return LocalePath.join(lang, `/${parts.slice(1).join("/")}`, i18n);
  }
}

if (import.meta.main) new RscRenderer().start();
