import type { LayoutFallbackRoute, PageState, PathRoute } from "akanjs/client";
import { type Logger, parseSearchParams } from "akanjs/common";
import {
  getRequestDynamicUsage,
  getRequestFrameState,
  getRequestPolicy,
  getRequestTheme,
  updateRequestPolicy,
} from "akanjs/fetch";
import type { ReactNode } from "react";
import type { ClientManifest } from "./artifact";
import {
  type RouteCacheEntry,
  type RouteCacheRenderState,
  resolveRouteCacheStoreTtl,
  shouldStoreRouteCache,
} from "./cachePolicy";
import { type AdmittedNotFoundFallback, RouteElementComposer } from "./routeElementComposer";
import { RouteShellGate } from "./routeShellGate";
import {
  type AkanRouterStateV1,
  type AkanRscPatchDecision,
  encodeAkanRouterState,
  isAkanRscPartialCommitEnabled,
} from "./routeState";
import { RouteTreeBuilder } from "./routeTreeBuilder";
import type { RscFlightRenderer } from "./rscFlightRenderer";
import type { FlightRenderResult } from "./rscFlightStream";
import { type ResolvedRouteHead, RscPatchPlanner } from "./rscPatchPlanner";
import type { RscRenderRequest } from "./rscRenderControl";
import type { RscActiveRoute, RscRenderFallbacks } from "./rscRenderFallbacks";
import type { RscRenderStats } from "./rscRenderStats";
import type { RscResultCaches } from "./rscResultCaches";
import type { RscRouteDocument } from "./rscRouteDocument";
import {
  type CachedRscResult,
  createCachedRscPatchMetadata,
  createRscWorkerCachedPatchReplayDecision,
  isCachedRscPatchMetadataCompatible,
  replayCachedRscResult,
  resolveRscWorkerPatchCacheEntry,
  rscWorkerTraceBaseOf,
  shouldCollectRscWorkerRenderChunks,
  shouldStoreRscWorkerPatchResult,
  shouldUseRscWorkerFullResultCache,
} from "./rscWorkerCache";
import type { RscTraceMetadata } from "./ssrTypes";

interface RscRenderTarget {
  msg: RscRenderRequest;
  requestId: string;
  startedAt: number;
  request: Request;
  url: URL;
  match: { pathRoute: PathRoute; params: Record<string, string> } | null;
  routeId: string;
}

interface RscRenderPlan {
  searchParams: Record<string, string | string[]>;
  notFoundFallback: AdmittedNotFoundFallback | null;
  admitted: boolean;
  cacheEntry: RouteCacheEntry | null;
  targetRouterState: AkanRouterStateV1 | null;
  safePatchDecision: AkanRscPatchDecision;
  admittedHead?: ResolvedRouteHead;
  patchCacheEntry: RouteCacheEntry | null;
  createTraceBase: ReturnType<typeof rscWorkerTraceBaseOf>;
}

interface RscRenderedRoute {
  effectivePatchDecision: AkanRscPatchDecision;
  routeHeadKey: string | undefined;
  ssrBlocking: boolean;
}

interface RscRenderHandlerProps {
  logger: Logger;
  stats: RscRenderStats;
  caches: RscResultCaches;
  flights: RscFlightRenderer;
  documents: RscRouteDocument;
  fallbacks: RscRenderFallbacks;
  patchPlanner: RscPatchPlanner;
  routes: () => PathRoute[];
  fallbackRoutes: () => LayoutFallbackRoute[];
  clientManifest: () => ClientManifest;
  runWithRequest: <T>(request: Request, routeId: string, fn: () => Promise<T>) => Promise<T>;
}

export class RscRenderHandler {
  readonly #send: (message: unknown) => void;
  readonly #props: RscRenderHandlerProps;
  readonly #logger: Logger;
  readonly #stats: RscRenderStats;
  readonly #caches: RscResultCaches;
  readonly #flights: RscFlightRenderer;
  readonly #documents: RscRouteDocument;
  readonly #fallbacks: RscRenderFallbacks;
  readonly #patchPlanner: RscPatchPlanner;

  constructor(send: (message: unknown) => void, props: RscRenderHandlerProps) {
    this.#send = send;
    this.#props = props;
    this.#logger = props.logger;
    this.#stats = props.stats;
    this.#caches = props.caches;
    this.#flights = props.flights;
    this.#documents = props.documents;
    this.#fallbacks = props.fallbacks;
    this.#patchPlanner = props.patchPlanner;
  }

  get #pathRoutes(): PathRoute[] {
    return this.#props.routes();
  }

  get #fallbackRoutes(): LayoutFallbackRoute[] {
    return this.#props.fallbackRoutes();
  }

  get #clientManifest(): ClientManifest {
    return this.#props.clientManifest();
  }

  async handleRender(msg: RscRenderRequest): Promise<void> {
    const { requestId, url, method = "GET", headers = {} } = msg;
    const startedAt = Date.now();
    this.#stats.renderCount += 1;
    this.#stats.inFlightRenderCount += 1;
    const activeRoute: RscActiveRoute = { url: null, match: null, request: null };
    try {
      const request = new Request(url, { method, headers });
      const urlObj = new URL(url);
      const match = RouteTreeBuilder.match(urlObj.pathname, this.#pathRoutes);
      const routeId = match?.pathRoute.path ?? "__not_found__";
      //? Not a helper: unless akanjs resolves into node_modules, each frame down to JSX joins its dev owner stack.
      await this.#props.runWithRequest(request, routeId, async () => {
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
        const target: RscRenderTarget = { msg, requestId, startedAt, request, url: urlObj, match, routeId };
        const plan = await this.#plan(target);
        if (!plan) return;
        const replay = this.#replayFromCache(target, plan);
        if (replay) {
          await replay;
          return;
        }
        const { searchParams, notFoundFallback, admitted, cacheEntry, safePatchDecision, admittedHead } = plan;
        let element: ReactNode;
        let routeHead: ResolvedRouteHead | undefined;
        let effectivePatchDecision = safePatchDecision;
        const notFoundProbe = { hit: false };
        const notFound = this.#documents.notFoundInPlace(urlObj, notFoundProbe);
        const gate = new RouteShellGate();
        if (match && safePatchDecision.status === "patch" && safePatchDecision.patch) {
          const suffixElement = await this.#documents.renderMatchedSuffix(
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
            ({ element, head: routeHead } = await this.#documents.renderMatched(urlObj, match, searchParams, notFound, {
              guarded: true,
              head: admittedHead,
              gate,
            }));
          } else {
            element = suffixElement;
            routeHead = admittedHead;
          }
        } else if (match)
          ({ element, head: routeHead } = await this.#documents.renderMatched(urlObj, match, searchParams, notFound, {
            guarded: admitted || !!admittedHead,
            head: admittedHead,
            gate,
          }));
        else element = await this.#documents.renderNotFound(urlObj, notFoundFallback, gate);
        const { patchCacheEntry } = plan;
        const routeHeadKey = routeHead?.snapshots?.layoutsKey;
        const traceCacheKey =
          effectivePatchDecision.status === "patch" ? (patchCacheEntry?.key ?? cacheEntry?.key) : cacheEntry?.key;
        const ssrBlocking = getRequestFrameState<PageState>()?.ssr === "block";
        const trace: RscTraceMetadata = {
          ...plan.createTraceBase(effectivePatchDecision, traceCacheKey),
          cache: cacheEntry ? "miss" : "bypass",
          ssrBlocking,
        };
        //? Only the matched render shows the route head; an error or not-found render sent in its place has none.
        const renderedRouteState = RscPatchPlanner.routeStateWith(plan.targetRouterState, routeHeadKey);
        const renderedTrace = renderedRouteState
          ? { ...trace, routeState: encodeAkanRouterState(renderedRouteState) }
          : trace;
        this.#logger.verbose(`render[${requestId}] starting Flight stream`);
        const result = await this.#flights.renderFlightElement(element, msg.clientManifest ?? this.#clientManifest, {
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
          onComplete: (rendered) =>
            this.#storeResult(target, plan, { effectivePatchDecision, routeHeadKey, ssrBlocking }, rendered),
        });
        if (result.cancelled) return;
        const control = result.control;
        if (control) {
          await this.#fallbacks.answerControl({ msg, match, url: urlObj, searchParams, trace }, result, control);
          return;
        }
        this.#recordRendered(target, result, beforeLoadedKeys);
      });
    } catch (error) {
      await this.#fallbacks.answerThrown(msg, activeRoute, error);
    } finally {
      this.#flights.release(requestId);
      this.#stats.inFlightRenderCount = Math.max(0, this.#stats.inFlightRenderCount - 1);
    }
  }

  async #plan({
    msg,
    requestId,
    request,
    url: urlObj,
    match,
    routeId,
  }: RscRenderTarget): Promise<RscRenderPlan | null> {
    const searchParams = parseSearchParams(urlObj.search);
    const fallbackMatch = match ? null : RouteTreeBuilder.matchFallback(urlObj.pathname, this.#fallbackRoutes);
    const notFoundFallback = await RouteElementComposer.admitNotFoundFallback(fallbackMatch, searchParams);
    const verdict = msg.prefetch && (await RouteElementComposer.prefetchVerdict(match, notFoundFallback, searchParams));
    if (verdict === "refused") {
      this.#send({ type: "meta", requestId, status: 204 });
      this.#send({ type: "end", requestId });
      return null;
    }
    const admitted = verdict === "admitted";
    const cacheDecision = match ? this.#caches.getResultCacheEntry(request, urlObj) : { entry: null };
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
    return {
      searchParams,
      notFoundFallback,
      admitted,
      cacheEntry,
      targetRouterState,
      safePatchDecision,
      admittedHead,
      patchCacheEntry,
      createTraceBase,
    };
  }

  #replayFromCache(
    { requestId, routeId, startedAt }: RscRenderTarget,
    { cacheEntry, targetRouterState, safePatchDecision, admittedHead, patchCacheEntry, createTraceBase }: RscRenderPlan,
  ): Promise<void> | null {
    const cachedPatch = patchCacheEntry
      ? this.#caches.getCached(this.#caches.patchResultCache, patchCacheEntry.key)
      : null;
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
      return this.#replayCached(requestId, routeId, startedAt, cachedPatch, {
        ...cachedTraceBase,
        cache: "hit",
        partial: "patch",
        partialReason: "cache-hit-patch-replay",
      });
    }
    const cached =
      shouldUseRscWorkerFullResultCache({ cacheEntry, patchCacheEntry }) && cacheEntry
        ? this.#caches.getCached(this.#caches.resultCache, cacheEntry.key)
        : null;
    if (!cached) return null;
    const traceBase = createTraceBase(
      safePatchDecision,
      patchCacheEntry?.key ?? cacheEntry?.key,
      RscPatchPlanner.routeStateWith(targetRouterState, cached.routeHeadKey),
    );
    return this.#replayCached(requestId, routeId, startedAt, cached, {
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
  }

  #recordRendered(
    { requestId, routeId, startedAt }: RscRenderTarget,
    result: FlightRenderResult,
    beforeLoadedKeys: string[],
  ): void {
    this.#stats.recordFlight(result);
    this.#stats.lastRenderDurationMs = Date.now() - startedAt;
    const afterLoadedKeys = RouteTreeBuilder.getCacheStats().loadedModuleKeys;
    this.#stats.lastRenderLoadedModules = afterLoadedKeys.filter((key) => !beforeLoadedKeys.includes(key));
    this.#stats.lastRenderLoadedModuleDelta = this.#stats.lastRenderLoadedModules.length;
    this.#stats.recordRouteStats(routeId, result.bytes, this.#stats.lastRenderDurationMs);
    this.#logger.verbose(
      `render[${requestId}] done chunks=${result.chunksCount} bytes=${result.bytes} theme=${getRequestTheme() ?? "(none)"} in ${
        Date.now() - startedAt
      }ms`,
    );
  }

  #storeResult(
    { url: urlObj, routeId }: RscRenderTarget,
    { cacheEntry, targetRouterState, patchCacheEntry }: RscRenderPlan,
    { effectivePatchDecision, routeHeadKey, ssrBlocking }: RscRenderedRoute,
    { chunks, bytes, chunksCount, control, lateControlSent }: Omit<FlightRenderResult, "cancelled">,
  ): RouteCacheRenderState {
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
      this.#caches.store("patch", this.#caches.patchResultCache, patchCacheEntry.key, { ...stored(), patch }, storeTtl);
    } else if (cacheEntry && storeTtl !== null && effectivePatchDecision.status !== "patch") {
      this.#caches.store("full", this.#caches.resultCache, cacheEntry.key, stored(), storeTtl);
    }
    return cacheState;
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
    this.#stats.recordFlight(cached);
    this.#stats.recordRouteStats(routeId, cached.bytes, this.#stats.lastRenderDurationMs);
    await replayCachedRscResult({
      requestId,
      chunks: cached.chunks,
      theme: cached.theme,
      cacheState: cached.cacheState,
      trace,
      send: (message) => this.#send(message),
      isCancelled: () => this.#flights.isCancelled(requestId),
    });
  }
}
