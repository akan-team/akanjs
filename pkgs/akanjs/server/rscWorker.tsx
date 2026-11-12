import { AkanError } from "akanjs/base";
import type { LayoutFallbackRoute, PathRoute } from "akanjs/client";
import { type AkanI18nConfig, DEFAULT_AKAN_I18N, Logger } from "akanjs/common";
import { RenderScope, requestStorage } from "akanjs/fetch";
import { toManifestJson } from "../client/webManifest";
import type { PagePromptRunInput, PagePromptVisibleInput } from "../signal/mcp/pagePrompt";
import { runTraced, SignalTrace } from "../signal/trace";
import type { ClientManifest } from "./artifact";
import { LogForwarder } from "./logging/logForwarder";
import { ProcessMetricsCollector } from "./processMetricsCollector";
import { type PagesContext, RouteTreeBuilder } from "./routeTreeBuilder";
import { RscDocumentHead } from "./rscDocumentHead";
import { RscFlightRenderer } from "./rscFlightRenderer";
import { RscPagePrompts } from "./rscPagePrompts";
import { RscPatchPlanner } from "./rscPatchPlanner";
import { RscRenderFallbacks } from "./rscRenderFallbacks";
import { RscRenderHandler } from "./rscRenderHandler";
import { RscRenderStats } from "./rscRenderStats";
import { RscResultCaches } from "./rscResultCaches";
import { RscRouteDocument } from "./rscRouteDocument";
import { invalidateCachedRscResults } from "./rscWorkerCache";

export { isAkanNotFoundError, isAkanRedirectError } from "./rscRenderControl";

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
  readonly #stats = new RscRenderStats();
  readonly #caches = new RscResultCaches(this.#logger);
  readonly #flights = new RscFlightRenderer(this.#logger, (message) => this.#send(message));
  readonly #send: (message: unknown) => void;
  readonly #pagePrompts = new RscPagePrompts({
    routes: () => this.#pathRoutes,
    run: (request, routeId, fn) => this.#runWithRequest(request, routeId, fn),
    defaultLocale: () => this.#i18n.defaultLocale,
  });
  readonly #head = new RscDocumentHead({
    i18n: () => this.#i18n,
    basePaths: () => this.#basePaths,
    cssAssets: () => this.#cssAssets,
  });
  readonly #patchPlanner = new RscPatchPlanner({
    logger: this.#logger,
    routes: () => this.#pathRoutes,
    buildId: () => this.#pagesBundleBuildId,
    basePathOf: (url) => this.#head.getBasePath(url),
    localeAlternatesOf: (url) => this.#head.getLocaleAlternateLanguages(url),
    defaultHead: () => this.#head.renderDefaultHead(),
  });
  readonly #documents = new RscRouteDocument({
    logger: this.#logger,
    head: this.#head,
    patchPlanner: this.#patchPlanner,
    i18n: () => this.#i18n,
    basePaths: () => this.#basePaths,
  });
  readonly #fallbacks = new RscRenderFallbacks((message) => this.#send(message), {
    logger: this.#logger,
    stats: this.#stats,
    flights: this.#flights,
    documents: this.#documents,
    clientManifest: () => this.#clientManifest,
    runInRequestScope: (request, fn) => this.#runInRequestScope(request, fn),
  });
  readonly #renders = new RscRenderHandler((message) => this.#send(message), {
    logger: this.#logger,
    stats: this.#stats,
    caches: this.#caches,
    flights: this.#flights,
    documents: this.#documents,
    fallbacks: this.#fallbacks,
    patchPlanner: this.#patchPlanner,
    routes: () => this.#pathRoutes,
    fallbackRoutes: () => this.#fallbackRoutes,
    clientManifest: () => this.#clientManifest,
    runWithRequest: (request, routeId, fn) => this.#runWithRequest(request, routeId, fn),
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
        void this.#renders.handleRender(msg);
        return;
      case "cancel":
        this.#logger.verbose(`received cancel requestId=${msg.requestId}`);
        this.#flights.handleCancel(msg.requestId);
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
        invalidateCachedRscResults(this.#caches.resultCache, msg);
        invalidateCachedRscResults(this.#caches.patchResultCache, msg);
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
    const manifest = await RscDocumentHead.firstRootValue(rootLayouts ?? [], (render) => render.getLayoutManifest?.());
    return manifest ? toManifestJson(manifest) : null;
  }

  async #answer(requestId: string, type: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      this.#send({ type, requestId, result: await fn() });
    } catch (error) {
      this.#send({ type: "error", requestId, message: error instanceof Error ? error.message : String(error) });
    }
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
      this.#stats.routeStats.clear();
      this.#caches.resultCache.clear();
      this.#caches.patchResultCache.clear();
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
      this.#stats.routeStats.clear();
      this.#caches.resultCache.clear();
      this.#caches.patchResultCache.clear();
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

  async #sendMetricsReport() {
    const routeStats = RouteTreeBuilder.getCacheStats();
    const metrics = await ProcessMetricsCollector.collect({
      role: "rsc-worker",
      rscRenderCount: this.#stats.renderCount,
      rscInFlightRenderCount: this.#flights.inFlightCount,
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
      rscTopRoutesByRenderCount: this.#stats.topRoutes((route) => route.count),
      rscTopRoutesByFlightBytes: this.#stats.topRoutes((route) => route.flightBytes),
      rscResultCacheEntries: this.#caches.resultCache.size,
      rscResultCacheBytes: this.#caches.resultCache.byteSize,
      rscPatchResultCacheEntries: this.#caches.patchResultCache.size,
      rscPatchResultCacheBytes: this.#caches.patchResultCache.byteSize,
      rscResultCacheHits: this.#caches.resultCacheHits,
      rscResultCacheMisses: this.#caches.resultCacheMisses,
      rscResultCacheBypass: this.#caches.resultCacheBypass,
    });
    this.#send({ type: "metrics", metrics });
  }

  #runWithRequest<T>(request: Request, routeId: string, fn: () => Promise<T>): Promise<T> {
    return this.#runInRequestScope(request, () => runTraced(SignalTrace.create(routeId, "page", "page"), fn));
  }

  #runInRequestScope<T>(request: Request, fn: () => Promise<T>): Promise<T> {
    const render = () => RenderScope.run(fn);
    return requestStorage ? requestStorage.run(request, render) : render();
  }
}

if (import.meta.main) new RscRenderer().start();
