import fs from "node:fs";
import path from "node:path";
import { getEnv } from "akanjs/base";
import {
  type AkanI18nConfig,
  DEFAULT_AKAN_I18N,
  getBasePathFromPathname,
  Logger,
  parseAkanI18nEnv,
} from "akanjs/common";
import { type AkanRequestStore, createRequestStore, parseCookieHeader } from "akanjs/fetch";
import type { AkanMetricsReport } from "akanjs/service";
import {
  type BuilderRpc,
  type ClientManifest,
  type MergedManifest,
  RouteClientCache,
  type RouteSeedIndex,
  RouteSeedIndexStore,
  RoutesManifestStore,
} from "./artifact";
import {
  getClientFacingOrigin,
  hasRouteCacheInvalidationScope,
  isRouteCachePathAllowed,
  LruTtlCache,
  parsePositiveInt,
  type RouteCacheEntry,
  type RouteCacheInvalidation,
  type RouteCacheRenderState,
  resolvePublicRouteCacheEntryDecision,
  resolveRouteCacheStoreTtl,
  shouldInvalidateRouteCacheEntry,
  shouldStoreRouteCache,
} from "./cachePolicy";
import { DevHmrController } from "./hmr";
import { HMR_CLIENT_SCRIPT } from "./hmr/clientScript";
import type { HmrWsData, HmrWsHub } from "./hmr/wsHub";
import { ImageOptimizer } from "./imageOptimizer";
import { createDefaultRobotsTxt } from "./robots";
import {
  AKAN_RSC_PATCH_HEAD_SAFE_HEADER,
  AKAN_RSC_PATCH_HEAD_SNAPSHOT_HEADER,
  AKAN_RSC_PATCH_SEGMENT_PATH_HEADER,
  AKAN_RSC_PATCH_START_INDEX_HEADER,
  AKAN_RSC_PATCH_START_SEGMENT_HEADER,
  AKAN_RSC_RESPONSE_STATE_HEADER,
} from "./routeState";
import { type RscRedirectMethod, type RscRedirectStatus, type RscRenderResult, RscWorker } from "./rscWorkerHost";
import { createDefaultSitemapXml, getSitemapBasePath } from "./sitemap";
import { SsrFromRscRenderer } from "./ssrFromRscRenderer";
import type { RscTraceMetadata, SsrManifest } from "./ssrTypes";
import { createSystemPageResponse, getSystemPageHomeHref } from "./systemPages";
import type { BaseBuildArtifact, HttpRoutes, RenderState } from "./types";

const RESERVED_BASE_PATHS = new Set(["admin"]);
const CLIENT_CLOSED_REQUEST_STATUS = 499;
export const DEFAULT_HTML_RESULT_CACHE_MAX_BODY_BYTES = 2 * 1024 * 1024;
const APPLE_APP_SITE_ASSOCIATION_PATH = "/.well-known/apple-app-site-association";
const ANDROID_ASSET_LINKS_PATH = "/.well-known/assetlinks.json";

export function createRscRedirectResponse(
  location: string,
  method: RscRedirectMethod,
  status: RscRedirectStatus = 307,
): Response {
  return new Response(JSON.stringify({ type: "redirect", location, method, status }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Akan-Redirect": location,
      "X-Akan-Redirect-Method": method,
      "X-Akan-Redirect-Status": String(status),
    },
  });
}

export function createRscStreamResponse(stream: BodyInit, status = 200): Response {
  return new Response(stream, {
    status,
    headers: {
      "Content-Type": "text/x-component; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function createRscNotFoundFallbackResponse(): Response {
  return createRscStreamResponse("0:null\n", 404);
}

function appendRscTraceHeaders(headers: Headers, trace?: RscTraceMetadata): void {
  if (!trace) return;
  if (trace.navId) headers.set("X-Akan-Rsc-Nav-Id", trace.navId);
  headers.set("X-Akan-Rsc-Pathname", trace.pathname);
  headers.set("X-Akan-Rsc-Route", trace.routeId);
  headers.set("X-Akan-Rsc-Cache", trace.cache);
  if (trace.cacheReason) headers.set("X-Akan-Rsc-Cache-Reason", trace.cacheReason);
  if (trace.cacheKeyHash) headers.set("X-Akan-Rsc-Cache-Key", trace.cacheKeyHash);
  if (trace.partial) headers.set("X-Akan-Rsc-Partial", trace.partial);
  if (trace.partialReason) headers.set("X-Akan-Rsc-Partial-Reason", trace.partialReason);
  if (trace.partialCommonPrefixLength !== undefined) {
    headers.set("X-Akan-Rsc-Partial-Common-Prefix", String(trace.partialCommonPrefixLength));
  }
  if (trace.patchStartIndex !== undefined)
    headers.set(AKAN_RSC_PATCH_START_INDEX_HEADER, String(trace.patchStartIndex));
  if (trace.patchSegmentPath) headers.set(AKAN_RSC_PATCH_SEGMENT_PATH_HEADER, trace.patchSegmentPath);
  if (trace.patchStartSegment) headers.set(AKAN_RSC_PATCH_START_SEGMENT_HEADER, trace.patchStartSegment);
  if (trace.patchHeadSafe) headers.set(AKAN_RSC_PATCH_HEAD_SAFE_HEADER, "1");
  if (trace.patchHeadSnapshot) headers.set(AKAN_RSC_PATCH_HEAD_SNAPSHOT_HEADER, trace.patchHeadSnapshot);
  if (trace.routeState) headers.set(AKAN_RSC_RESPONSE_STATE_HEADER, trace.routeState);
}

export function cacheHtmlWhileStreaming(
  stream: ReadableStream<Uint8Array>,
  onComplete: (html: string) => void,
  options: {
    shouldCache?: () => boolean | Promise<boolean>;
    maxBodyBytes?: number | null;
    onSkip?: (reason: "body-too-large" | "store-skip") => void;
  } = {},
): ReadableStream<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let exceededMaxBodyBytes = false;
  const decoder = new TextDecoder();

  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (!exceededMaxBodyBytes) {
          byteLength += chunk.byteLength;
          if (options.maxBodyBytes && byteLength > options.maxBodyBytes) {
            exceededMaxBodyBytes = true;
            chunks.length = 0;
          } else {
            chunks.push(chunk.slice());
          }
        }
        controller.enqueue(chunk);
      },
      async flush() {
        if (exceededMaxBodyBytes) {
          options.onSkip?.("body-too-large");
          return;
        }
        const body = new Uint8Array(byteLength);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
        try {
          if (options.shouldCache && !(await options.shouldCache())) {
            options.onSkip?.("store-skip");
            return;
          }
          onComplete(decoder.decode(body));
        } catch {
          // Cache writes must not fail the already completed response stream.
        }
      },
    }),
  );
}

export function cancelStreamForHeadResponse(stream: ReadableStream<Uint8Array>, reason: unknown): void {
  void stream.cancel(reason).catch(() => {
    // The response will not expose a body. Cancellation is best-effort because
    // upstream streams may already be closed by the time HEAD handling runs.
  });
}

export function resolveHtmlRouteCacheStoreTtl(input: {
  baseTtl: number;
  workerCacheState: RouteCacheRenderState;
  hostRequestStore: AkanRequestStore;
  lateControl?: { type: "redirect" } | null;
}): number | null {
  if (input.lateControl?.type === "redirect") return null;
  const workerTtl = resolveRouteCacheStoreTtl(input.baseTtl, input.workerCacheState);
  if (workerTtl === null) return null;
  const hostCacheState = shouldStoreRouteCache({
    policy: input.hostRequestStore.policy,
    dynamicUsage: input.hostRequestStore.dynamicUsage,
  });
  return resolveRouteCacheStoreTtl(workerTtl, hostCacheState);
}

export function isHtmlRouteCachePathAllowed(
  pathname: string,
  env: {
    [key: string]: string | undefined;
    AKAN_HTML_RESULT_CACHE_PATHS?: string;
    AKAN_HTML_RESULT_CACHE_EXCLUDE_PATHS?: string;
  } = process.env as Record<string, string | undefined>,
  options: { defaultAllow?: boolean } = {},
): boolean {
  return isRouteCachePathAllowed(pathname, {
    allow: env.AKAN_HTML_RESULT_CACHE_PATHS,
    deny: env.AKAN_HTML_RESULT_CACHE_EXCLUDE_PATHS,
    defaultAllow: options.defaultAllow,
  });
}

export async function createRscNavigationStreamResponse(
  result: Extract<RscRenderResult, { type: "stream" }>,
): Promise<Response> {
  // P7a streams normal RSC navigation payloads immediately. Redirects that are
  // known before stream start still use the header envelope in the caller;
  // redirects discovered after Flight bytes have left the worker stay in the
  // Flight stream with an Akan digest that the client strips before RSDW sees it.
  const response = createRscStreamResponse(result.stream, result.status ?? 200);
  appendRscTraceHeaders(response.headers, result.trace);
  return response;
}

export function normalizeRscTargetUrlForHostBasePath(
  targetUrl: URL,
  options: {
    basePath: string | null;
    basePaths?: readonly string[];
    i18n: AkanI18nConfig;
    seedEntries?: RouteSeedIndex["entries"];
  },
): { url: URL; basePath: string | null } {
  const { basePath, basePaths = [], i18n, seedEntries } = options;
  const routeMatches = (url: URL) => !seedEntries || Boolean(RouteSeedIndexStore.match(url.pathname, seedEntries));

  const segments = targetUrl.pathname.split("/").filter(Boolean);
  const [locale, firstPath] = segments;
  if (!locale || !i18n.locales.includes(locale)) return { url: targetUrl, basePath: null };

  const targetBasePath = firstPath && basePaths.includes(firstPath) ? firstPath : null;
  if (seedEntries && routeMatches(targetUrl)) return { url: targetUrl, basePath: targetBasePath ?? basePath };
  if (RESERVED_BASE_PATHS.has(firstPath ?? "")) return { url: targetUrl, basePath: basePath ?? targetBasePath };

  const candidates = [...new Set([basePath, ...basePaths].filter((bp): bp is string => Boolean(bp)))];
  for (const candidate of candidates) {
    if (firstPath === candidate) continue;
    const normalized = new URL(targetUrl);
    normalized.pathname = `/${[locale, candidate, ...segments.slice(1)].join("/")}`;
    if (routeMatches(normalized)) return { url: normalized, basePath: candidate };
  }

  return { url: targetUrl, basePath: basePath ?? targetBasePath };
}

export interface SsrRoutesResult {
  renderEnvRoutes: HttpRoutes;
  hmrHub: HmrWsHub | null;
  builderRpc: BuilderRpc | null;
}

export interface SsrRoutesInputs {
  upgradeHmrWs: (req: Request, data: HmrWsData) => boolean;
}

interface WebRouterOptions {
  artifact: BaseBuildArtifact;
  cssBytesByUrl: Record<string, Uint8Array>;
  rsc: RscWorker;
  seedIndex: RouteSeedIndex;
  upgradeHmrWs: (req: Request, data: HmrWsData) => boolean;
}

interface CachedHtmlResult {
  html: string;
  pathname: string;
  routeId?: string;
  tags?: string[];
}

export class WebRouter {
  #logger = new Logger("WebRouter");
  #artifactDir = WebRouter.#resolveArtifactDir();
  #artifact: BaseBuildArtifact;
  #rsc: RscWorker;
  #hub: HmrWsHub | null = null;
  #prodMode = process.env.NODE_ENV === "production";
  #builderRpc: BuilderRpc | null;
  #routeCache: RouteClientCache;
  #devHmr: DevHmrController | null = null;
  readonly #requestStats = {
    fullSsr: 0,
    rscNavigation: 0,
    staticAsset: 0,
    csr: 0,
    image: 0,
  };
  readonly #htmlCache = new LruTtlCache<CachedHtmlResult>(
    parsePositiveInt(process.env.AKAN_HTML_RESULT_CACHE_MAX_ENTRIES) ?? 100,
  );
  #htmlCacheHits = 0;
  #htmlCacheMisses = 0;
  #htmlCacheBypass = 0;
  renderState: RenderState;
  #seedIndex: RouteSeedIndex;
  constructor({ artifact, cssBytesByUrl, rsc, seedIndex, upgradeHmrWs }: WebRouterOptions) {
    this.#logger.verbose(`[SSR] loaded ${Object.keys(cssBytesByUrl).length} CSS assets`);
    this.#artifact = artifact;
    this.#rsc = rsc;
    this.renderState = {
      buildId: 0,
      cssAssets: this.#artifact.cssAssets ?? {},
      cssBytesByUrl,
    };
    this.#seedIndex = seedIndex;
    if (this.#prodMode) {
      this.#builderRpc = null;
      this.#routeCache = this.#getProductionRouteCache();
    } else {
      this.#devHmr = new DevHmrController({
        renderState: this.renderState,
        rsc: this.#rsc,
        seedIndex: this.#seedIndex,
        upgradeHmrWs,
      });
      this.#builderRpc = this.#devHmr.builderRpc;
      this.#routeCache = this.#devHmr.routeCache;
      this.#hub = this.#devHmr.hub;
    }
  }

  async initializeRoute() {
    const prebuilt = this.#prodMode ? await RoutesManifestStore.read(this.#artifactDir) : null;
    if (prebuilt) {
      this.#routeCache.seed(prebuilt);
      await this.#rsc.reload({
        clientManifest: this.#mergeRuntimeManifest(this.#routeCache.merged).clientManifest,
        cssAssets: this.renderState.cssAssets,
        buildId: this.renderState.buildId,
      });
    }

    const clientServePrefix = `/_akan/client`;
    const clientOutputDir = `${this.#artifactDir}/client`;
    const csrOutputDir = WebRouter.#resolveCsrDir(this.#artifactDir);
    const publicDir = path.join(WebRouter.#resolveAppDir(), "public");
    const imageCacheDir = path.join(this.#artifactDir, "image-cache");
    const imageOptimizer = new ImageOptimizer({
      publicDir,
      cacheDir: imageCacheDir,
      prodMode: this.#prodMode,
      config: this.#artifact.imageConfig,
    });

    const renderEnvRoutes: HttpRoutes = {
      "/__csr": async () => {
        this.#requestStats.csr += 1;
        const csrHtml = WebRouter.#resolveCsrHtmlPath(csrOutputDir, "/", this.#artifact);
        const csrFile = csrHtml ? Bun.file(csrHtml) : null;
        const htmlText =
          csrFile && (await csrFile.exists())
            ? await csrFile.text()
            : `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Minimal</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/csr.js"></script>
  </body>
</html>`;
        return new Response(this.#withCsrHmr(htmlText), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
      [`${clientServePrefix}/*`]: async (req) => {
        this.#requestStats.staticAsset += 1;
        const url = new URL(req.url);
        const filePath = WebRouter.#safeResolve(clientOutputDir, url.pathname.slice(clientServePrefix.length + 1));
        if (!filePath) return new Response("Not Found", { status: 404 });
        return WebRouter.#fileResponse(req, filePath, {
          contentType: Bun.file(filePath).type || "application/javascript",
          cacheControl: this.#prodMode ? "public, max-age=31536000, immutable" : "no-store",
        });
      },
      "/_akan/styles/*": (req) => {
        this.#requestStats.staticAsset += 1;
        const url = new URL(req.url);
        if (this.#prodMode) {
          const filePath = WebRouter.#safeResolve(this.#artifactDir, url.pathname.slice("/_akan/".length));
          if (filePath) {
            return WebRouter.#fileResponse(req, filePath, {
              contentType: "text/css; charset=utf-8",
              cacheControl: "public, max-age=31536000, immutable",
            });
          }
        }
        const cssBytes = this.renderState.cssBytesByUrl[url.pathname];
        if (!cssBytes) return new Response("Not Found", { status: 404 });
        return WebRouter.#bytesResponse(req, cssBytes, {
          contentType: "text/css; charset=utf-8",
          cacheControl: "no-store",
        });
      },
      "/_akan/fonts/*": (req) => {
        this.#requestStats.staticAsset += 1;
        const url = new URL(req.url);
        const filePath = WebRouter.#safeResolve(this.#artifactDir, url.pathname.slice("/_akan/".length));
        if (!filePath) return new Response("Not Found", { status: 404 });
        return WebRouter.#fileResponse(req, filePath, {
          contentType: Bun.file(filePath).type || "font/woff2",
          cacheControl: this.#prodMode ? "public, max-age=31536000, immutable" : "no-store",
        });
      },
      "/_akan/image": (req) => {
        this.#requestStats.image += 1;
        return imageOptimizer.handle(req);
      },
      ...(!this.#prodMode
        ? {
            "/_akan/hmr": (req: Request) => {
              return this.#devHmr?.handleWs(req) ?? new Response("HMR unavailable", { status: 404 });
            },
            "/_akan/hmr/client-refresh": (req: Request) =>
              this.#devHmr?.handleClientRefresh(req) ?? new Response("HMR unavailable", { status: 404 }),
          }
        : {}),
      "/__rsc": async (req) => {
        this.#requestStats.rscNavigation += 1;
        try {
          const reqUrl = new URL(req.url);
          /** After TLS/pass-through proxies Bun often sees internal http origins; forwarded headers preserve the browser origin for same-origin checks. */
          const clientOrigin = WebRouter.#clientFacingOrigin(req);
          const target = reqUrl.searchParams.get("url");
          const rawTargetUrl = target ? new URL(target, clientOrigin) : reqUrl;
          const requestBasePath =
            req.headers.get("x-base-path") ?? WebRouter.#basePathForRequestHost(req, this.#artifact.subRoutes);
          const normalizedTarget = normalizeRscTargetUrlForHostBasePath(rawTargetUrl, {
            basePath: requestBasePath,
            basePaths: this.#artifact.basePaths,
            i18n: this.#artifact.i18n,
            seedEntries: this.#seedIndex.entries,
          });
          const targetUrl = normalizedTarget.url;
          if (!WebRouter.#isTrustedRscTarget(clientOrigin, targetUrl))
            return new Response("Bad Request", { status: 400 });
          const manifest = await this.#ensureRoute(targetUrl);
          const rscHeaders = new Headers(req.headers);
          if (normalizedTarget.basePath) rscHeaders.set("x-base-path", normalizedTarget.basePath);
          const rscReq = new Request(targetUrl, {
            method: "GET",
            headers: rscHeaders,
          });
          const result = await this.#rsc.renderWithMeta(rscReq, {
            clientManifest: manifest.clientManifest,
            signal: req.signal,
          });
          if (result.type === "redirect")
            return createRscRedirectResponse(result.location, result.method, result.status);
          if (result.type === "not-found") return WebRouter.#rscNotFoundResponse();
          if (result.status && result.status >= 500)
            return this.#renderRscErrorResponse("__rsc", "Internal Server Error");
          return createRscNavigationStreamResponse(result);
        } catch (err) {
          return this.#renderRscErrorResponse("__rsc", err);
        }
      },
      "/__rsc/manifest": () =>
        new Response(JSON.stringify(this.#routeCache.merged.clientManifest, null, 2), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }),
      [APPLE_APP_SITE_ASSOCIATION_PATH]: () =>
        WebRouter.#deepLinkAssociationResponse(APPLE_APP_SITE_ASSOCIATION_PATH, this.#artifact, {
          cacheControl: this.#prodMode ? "public, max-age=3600" : "no-store",
        }) ?? new Response("Not Found", { status: 404 }),
      [ANDROID_ASSET_LINKS_PATH]: () =>
        WebRouter.#deepLinkAssociationResponse(ANDROID_ASSET_LINKS_PATH, this.#artifact, {
          cacheControl: this.#prodMode ? "public, max-age=3600" : "no-store",
        }) ?? new Response("Not Found", { status: 404 }),
      "/*": async (req) => {
        const url = new URL(req.url);
        if (WebRouter.#isImageOptimizerPath(url.pathname)) {
          this.#requestStats.image += 1;
          return imageOptimizer.handle(req);
        }

        const isCsr = url.searchParams.get("csr") === "true";
        if (isCsr) {
          this.#requestStats.csr += 1;
          const csrHtml = WebRouter.#resolveCsrHtmlPath(csrOutputDir, url.pathname, this.#artifact);
          if (!csrHtml) return new Response("Not Found", { status: 404 });
          const html = await Bun.file(csrHtml).text();
          return new Response(this.#withCsrHmr(html), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }

        const csrAssetPath = path.extname(url.pathname) ? WebRouter.#safeResolve(csrOutputDir, url.pathname) : null;
        if (csrAssetPath) {
          if (await Bun.file(csrAssetPath).exists()) {
            this.#requestStats.staticAsset += 1;
            return WebRouter.#fileResponse(req, csrAssetPath, {
              contentType: Bun.file(csrAssetPath).type || "application/octet-stream",
              cacheControl: this.#prodMode ? "public, max-age=31536000, immutable" : undefined,
            });
          }
        }

        const filePath = WebRouter.#safeResolve(publicDir, url.pathname);
        if (filePath) {
          if (await Bun.file(filePath).exists()) {
            this.#requestStats.staticAsset += 1;
            return WebRouter.#fileResponse(req, filePath, {
              contentType: Bun.file(filePath).type || "application/octet-stream",
              cacheControl: this.#prodMode ? "public, max-age=300" : "no-store",
            });
          }
        }

        if (url.pathname === "/robots.txt") {
          return new Response(createDefaultRobotsTxt(), {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": this.#prodMode ? "public, max-age=3600" : "no-store",
            },
          });
        }

        const sitemapBasePath = getSitemapBasePath(
          url.pathname,
          this.#artifact.basePaths,
          req.headers.get("x-base-path") ?? WebRouter.#basePathForRequestHost(req, this.#artifact.subRoutes),
        );
        if (sitemapBasePath !== undefined) {
          return new Response(
            createDefaultSitemapXml({
              origin: WebRouter.#clientFacingOrigin(req),
              basePath: sitemapBasePath,
              entries: this.#seedIndex.entries,
              i18n: parseAkanI18nEnv(),
            }),
            {
              headers: {
                "Content-Type": "application/xml; charset=utf-8",
                "Cache-Control": this.#prodMode ? "public, max-age=3600" : "no-store",
              },
            },
          );
        }

        try {
          this.#requestStats.fullSsr += 1;
          const manifest = await this.#ensureRoute(url);
          const htmlCacheDecision = this.#getHtmlCacheEntry(req, url);
          const htmlCacheEntry = htmlCacheDecision.entry;
          const cachedHtml = htmlCacheEntry ? this.#getCachedHtml(htmlCacheEntry.key) : null;
          if (cachedHtml) {
            return new Response(cachedHtml, {
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "X-Akan-Cache": "HIT",
              },
            });
          }
          const rscResult = await this.#rsc.renderWithMeta(req, {
            clientManifest: manifest.clientManifest,
            signal: req.signal,
          });
          if (rscResult.type === "redirect")
            return Response.redirect(new URL(rscResult.location, url.origin), rscResult.status);
          if (rscResult.type === "not-found") return this.#renderSystemNotFoundFallbackResponse(req, url);
          const themeCookieExists = WebRouter.#hasCookie(req, "theme");
          const hostRequestStore = createRequestStore(req);
          const extraBootstrapInline = [
            rscResult.trace?.routeState
              ? `self.__AKAN_RSC_INITIAL_STATE__=${JSON.stringify(rscResult.trace.routeState)};`
              : "",
            !this.#prodMode ? HMR_CLIENT_SCRIPT : "",
          ]
            .filter(Boolean)
            .join("\n");
          const htmlStream = await new SsrFromRscRenderer().render({
            request: req,
            requestStore: hostRequestStore,
            rscStream: rscResult.stream,
            ssrManifest: manifest.ssrManifest,
            bootstrapModules: [this.#artifact.rscClientUrl],
            extraBootstrapInline: extraBootstrapInline || undefined,
            importmap: this.#artifact.vendorMap,
            theme: themeCookieExists ? undefined : (rscResult.theme ?? "system"),
            lateControl: rscResult.lateControl,
            onCancel: (reason: unknown) => {
              rscResult.cancel(reason);
            },
          });
          const responseStatus = rscResult.status ?? 200;
          const responseHeaders = WebRouter.#htmlResponseHeaders(responseStatus);
          if (req.method === "HEAD") {
            const headers = new Headers(responseHeaders);
            if (htmlCacheEntry && responseStatus === 200) headers.set("X-Akan-Cache", "MISS");
            else if (htmlCacheDecision.reason) {
              headers.set("X-Akan-Cache", "BYPASS");
              headers.set("X-Akan-Cache-Reason", htmlCacheDecision.reason);
            }
            cancelStreamForHeadResponse(htmlStream, new Error("HEAD response does not consume body"));
            return new Response(null, { status: responseStatus, headers });
          }
          if (htmlCacheEntry && responseStatus === 200) {
            const headers = new Headers(responseHeaders);
            headers.set("X-Akan-Cache", "MISS");
            let htmlStoreTtl = htmlCacheEntry.ttl;
            let htmlCacheMetadata: Omit<CachedHtmlResult, "html"> = { pathname: url.pathname };
            const shouldCacheHtml = Promise.all([rscResult.lateControl, rscResult.cacheState]).then(
              ([control, cacheState]) => {
                const storeTtl = resolveHtmlRouteCacheStoreTtl({
                  baseTtl: htmlCacheEntry.ttl,
                  workerCacheState: cacheState,
                  hostRequestStore,
                  lateControl: control,
                });
                if (storeTtl === null) return false;
                htmlStoreTtl = storeTtl;
                htmlCacheMetadata = {
                  pathname: url.pathname,
                  routeId: cacheState.routeId,
                  tags: cacheState.tags,
                };
                return true;
              },
            );
            return new Response(
              cacheHtmlWhileStreaming(
                htmlStream,
                (html) => {
                  this.#setCachedHtml(htmlCacheEntry.key, html, htmlStoreTtl, htmlCacheMetadata);
                },
                {
                  shouldCache: () => shouldCacheHtml,
                  maxBodyBytes:
                    parsePositiveInt(process.env.AKAN_HTML_RESULT_CACHE_MAX_BODY_BYTES) ??
                    DEFAULT_HTML_RESULT_CACHE_MAX_BODY_BYTES,
                  onSkip: (reason) => {
                    this.#logger.verbose(`html cache store skipped pathname=${url.pathname} reason=${reason}`);
                  },
                },
              ),
              {
                status: responseStatus,
                headers,
              },
            );
          }
          const headers = new Headers(responseHeaders);
          if (htmlCacheDecision.reason) {
            headers.set("X-Akan-Cache", "BYPASS");
            headers.set("X-Akan-Cache-Reason", htmlCacheDecision.reason);
          }
          return new Response(htmlStream, {
            status: responseStatus,
            headers,
          });
        } catch (err) {
          return this.#renderErrorResponse(req, url.pathname, err);
        }
      },
    };
    return { renderEnvRoutes, hmrHub: this.#hub, builderRpc: this.#builderRpc };
  }
  dispose() {
    this.#devHmr?.dispose();
    this.#devHmr = null;
    this.#builderRpc = null;
    this.#rsc.kill();
    this.#hub = null;
  }
  getMetrics(): AkanMetricsReport {
    const ssrStats = SsrFromRscRenderer.getChunkRegistryStats();
    return {
      ...this.#rsc.getMetrics(),
      ssrChunkRegistrySize: ssrStats.ssrChunkRegistrySize,
      ssrChunkLoadCount: ssrStats.ssrChunkLoadCount,
      ssrChunkCacheHitCount: ssrStats.ssrChunkCacheHitCount,
      ssrChunkEvictionCount: ssrStats.ssrChunkEvictionCount,
      httpFullSsrCount: this.#requestStats.fullSsr,
      httpRscNavigationCount: this.#requestStats.rscNavigation,
      httpStaticAssetCount: this.#requestStats.staticAsset,
      httpCsrCount: this.#requestStats.csr,
      httpImageCount: this.#requestStats.image,
      httpHtmlCacheEntries: this.#htmlCache.size,
      httpHtmlCacheHits: this.#htmlCacheHits,
      httpHtmlCacheMisses: this.#htmlCacheMisses,
      httpHtmlCacheBypass: this.#htmlCacheBypass,
    };
  }

  /** @internal Clears or scopes invalidation for local route result caches owned by the host and RSC worker. */
  invalidateRouteCaches(invalidation?: string | RouteCacheInvalidation): void {
    const payload = typeof invalidation === "string" ? { reason: invalidation } : invalidation;
    if (!hasRouteCacheInvalidationScope(payload)) {
      this.#htmlCache.clear();
    } else if (payload) {
      this.#htmlCache.invalidate((_key, value) =>
        shouldInvalidateRouteCacheEntry(
          {
            pathname: value.pathname,
            routeId: value.routeId,
            tags: value.tags,
          },
          payload,
        ),
      );
    }
    this.#rsc.invalidateRouteResultCache(invalidation);
  }

  /**
   * Reconstruct origin as the browser saw it when behind Ingress / reverse proxies
   * (prevents `/__rsc` same-origin rejecting because `req.url` is internal).
   */
  static #clientFacingOrigin(req: Request): string {
    return getClientFacingOrigin(req);
  }

  static #basePathForRequestHost(req: Request, subRoutes: Record<string, string[]>): string | null {
    const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "")
      .toLowerCase()
      .replace(/:\d+$/, "");
    if (!host) return null;
    for (const [basePath, domains] of Object.entries(subRoutes)) {
      if (domains.some((domain) => domain.toLowerCase().replace(/:\d+$/, "") === host)) return basePath;
    }
    return null;
  }

  static #isTrustedRscTarget(clientOrigin: string, targetUrl: URL): boolean {
    try {
      if (targetUrl.origin === clientOrigin) return true;
      // TLS termination + missing/partial forwarded headers may skew scheme while hostname matches the public host.
      return targetUrl.hostname === new URL(clientOrigin).hostname;
    } catch {
      return false;
    }
  }

  static #hasCookie(req: Request, name: string): boolean {
    return parseCookieHeader(req.headers.get("cookie") ?? "").has(name);
  }
  #getHtmlCacheEntry(req: Request, url: URL): { entry: RouteCacheEntry | null; reason?: string } {
    const decision = resolvePublicRouteCacheEntryDecision({
      request: req,
      url,
      theme: WebRouter.#cookieValue(req, "theme"),
      defaultEnabled: this.#prodMode,
      defaultAllow: this.#prodMode,
      env: {
        enabled: process.env.AKAN_HTML_RESULT_CACHE,
        ttl: process.env.AKAN_HTML_RESULT_CACHE_TTL,
        allow: process.env.AKAN_HTML_RESULT_CACHE_PATHS,
        deny: process.env.AKAN_HTML_RESULT_CACHE_EXCLUDE_PATHS,
      },
    });
    if (!decision.entry) this.#htmlCacheBypass += 1;
    return decision;
  }

  #getCachedHtml(cacheKey: string): string | null {
    const cached = this.#htmlCache.get(cacheKey);
    if (!cached) {
      this.#htmlCacheMisses += 1;
      return null;
    }
    this.#htmlCacheHits += 1;
    return cached.html;
  }

  #setCachedHtml(cacheKey: string, html: string, ttl: number, metadata: Omit<CachedHtmlResult, "html">): void {
    this.#htmlCache.set(cacheKey, { html, ...metadata }, ttl);
  }

  static #cookieValue(req: Request, name: string): string | undefined {
    return parseCookieHeader(req.headers.get("cookie") ?? "").get(name)?.value;
  }

  static #isImageOptimizerPath(pathname: string): boolean {
    return pathname === "/_akan/image" || pathname.endsWith("/_akan/image");
  }

  async #ensureRoute(url: URL) {
    const started = Date.now();
    const matched =
      RouteSeedIndexStore.match(url.pathname, this.#seedIndex.entries) ??
      RouteSeedIndexStore.matchPrefix(url.pathname, this.#seedIndex.entries);
    if (matched) await this.#routeCache.ensure(matched.entry.routeId, matched.entry.seeds);
    this.#logger.verbose(
      `[route-cache] ensure pathname=${url.pathname} routeId=${matched?.entry.routeId ?? "(none)"} in ${Date.now() - started}ms`,
    );
    return this.#mergeRuntimeManifest(this.#routeCache.snapshot());
  }

  #mergeRuntimeManifest(manifest: MergedManifest): MergedManifest {
    return {
      ...manifest,
      clientManifest: WebRouter.#mergeClientManifest(this.#artifact.rscRuntimeClientManifest, manifest.clientManifest),
      ssrManifest: WebRouter.#mergeSsrManifest(this.#artifact.rscRuntimeSsrManifest, manifest.ssrManifest),
    };
  }
  #renderSystemNotFoundFallbackResponse(req: Request, url: URL): Promise<Response> {
    return createSystemPageResponse({
      kind: "not-found",
      method: req.method,
      pathname: url.pathname,
      lang: WebRouter.#getLocale(url.pathname, this.#artifact.i18n),
      homeHref: this.#getSystemPageHomeHref(req, url.pathname),
      stylesheetHref: this.#getStylesheetHref(req, url.pathname),
    });
  }

  #renderErrorResponse(req: Request, scope: string, err: unknown): Promise<Response> {
    if (WebRouter.#isExpectedRequestAbort(err)) return Promise.resolve(WebRouter.#clientClosedResponse());
    const message = err instanceof Error ? err.message : String(err);
    this.#logger.error(`[SSR] render failed scope=${scope}: ${message}`);
    this.#hub?.broadcast({ type: "error", message });
    return createSystemPageResponse({
      kind: "error",
      method: req.method,
      pathname: scope,
      lang: WebRouter.#getLocale(new URL(req.url).pathname, this.#artifact.i18n),
      homeHref: this.#getSystemPageHomeHref(req, new URL(req.url).pathname),
      stylesheetHref: this.#getStylesheetHref(req, new URL(req.url).pathname),
      showDetails: !this.#prodMode,
      error: err,
    });
  }

  #renderRscErrorResponse(scope: string, err: unknown): Response {
    if (WebRouter.#isExpectedRequestAbort(err)) return WebRouter.#clientClosedResponse();
    const message = err instanceof Error ? err.message : String(err);
    this.#logger.error(`[SSR] render failed scope=${scope}: ${message}`);
    this.#hub?.broadcast({ type: "error", message });
    return new Response("Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  static #clientClosedResponse(): Response {
    return new Response(null, {
      status: CLIENT_CLOSED_REQUEST_STATUS,
      headers: { "Cache-Control": "no-store" },
    });
  }

  static #isExpectedRequestAbort(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return (
      error.name === "AbortError" ||
      error.message === "The connection was closed." ||
      error.message === "Connection closed." ||
      error.message.includes("The connection was closed")
    );
  }

  #getSystemPageHomeHref(req: Request, pathname: string): string {
    return getSystemPageHomeHref({
      pathname,
      i18n: this.#artifact.i18n,
      basePaths: this.#artifact.basePaths,
      headerBasePath:
        req.headers.get("x-base-path") ?? WebRouter.#basePathForRequestHost(req, this.#artifact.subRoutes),
    });
  }

  #getStylesheetHref(req: Request, pathname: string): string | null {
    const basePath = getBasePathFromPathname(pathname, {
      basePaths: Object.keys(this.renderState.cssAssets),
      i18n: this.#artifact.i18n,
      headerBasePath:
        req.headers.get("x-base-path") ?? WebRouter.#basePathForRequestHost(req, this.#artifact.subRoutes),
    });
    return this.renderState.cssAssets[basePath ?? ""]?.cssUrl ?? null;
  }

  static #getLocale(pathname: string, i18n: AkanI18nConfig): string {
    const [segment] = pathname.split("/").filter(Boolean);
    return segment && i18n.locales.includes(segment) ? segment : i18n.defaultLocale;
  }

  static #htmlResponseHeaders(status: number): Headers {
    const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
    if (status >= 400) headers.set("Cache-Control", "no-store");
    return headers;
  }
  #withCsrHmr(html: string): string {
    if (this.#prodMode) return html;
    return WebRouter.#injectBeforeBodyEnd(html, `<script>${HMR_CLIENT_SCRIPT}</script>`);
  }
  static #injectBeforeBodyEnd(html: string, snippet: string): string {
    const matches = [...html.matchAll(/<\/body\s*>/gi)];
    const last = matches.at(-1);
    if (!last || last.index === undefined) return `${html}\n${snippet}`;
    return `${html.slice(0, last.index)}${snippet}\n${html.slice(last.index)}`;
  }
  static #rscNotFoundResponse(): Response {
    return createRscNotFoundFallbackResponse();
  }
  #getProductionRouteCache() {
    return new RouteClientCache({
      buildRoute: async (routeId) => {
        throw new Error(
          `[SSR] route ${routeId} missing from production artifact — rebuild with \`akan build\` to include it`,
        );
      },
    });
  }

  static async create({ upgradeHmrWs }: SsrRoutesInputs) {
    const artifactDir = WebRouter.#resolveArtifactDir();
    const artifact = WebRouter.#normalizeArtifact(
      (await Bun.file(path.join(artifactDir, "base-artifact.json")).json()) as BaseBuildArtifact,
      artifactDir,
    );
    const cssBytesByUrl = await WebRouter.#loadCssBytesByUrl(artifact, artifactDir);
    const rsc = new RscWorker(artifact);
    await rsc.ready;
    const seedIndex = await RouteSeedIndexStore.load(artifactDir);
    return new WebRouter({
      artifact,
      cssBytesByUrl,
      rsc,
      seedIndex,
      upgradeHmrWs,
    });
  }

  static #resolveArtifactDir() {
    const localArtifactDir = path.join(process.cwd(), ".akan", "artifact");
    if (fs.existsSync(path.join(localArtifactDir, "base-artifact.json"))) return localArtifactDir;
    return path.join(process.cwd(), "apps", getEnv().appName, ".akan", "artifact");
  }

  static #resolveAppDir() {
    return process.env.AKAN_APP_DIR ?? path.dirname(Bun.main);
  }

  static #normalizeArtifact(artifact: BaseBuildArtifact, artifactDir: string): BaseBuildArtifact {
    const normalizedArtifactDir = path.resolve(artifactDir);
    const pagesBundlePath = WebRouter.#resolveArtifactPath(artifact.pagesBundlePath, normalizedArtifactDir);
    return {
      ...artifact,
      cssAssets: artifact.cssAssets ?? {},
      pagesBundlePath,
      rscRuntimeSsrManifest: artifact.rscRuntimeSsrManifest
        ? WebRouter.#normalizeSsrManifest(artifact.rscRuntimeSsrManifest, normalizedArtifactDir)
        : undefined,
      i18n: artifact.i18n ?? DEFAULT_AKAN_I18N,
    };
  }

  static #mergeClientManifest(...manifests: Array<ClientManifest | undefined>): ClientManifest {
    return Object.assign({}, ...manifests.filter(Boolean));
  }

  static #mergeSsrManifest(...manifests: Array<SsrManifest | undefined>): SsrManifest {
    const definedManifests = manifests.filter((manifest): manifest is SsrManifest => Boolean(manifest));
    return {
      moduleLoading: null,
      moduleMap: Object.assign({}, ...definedManifests.map((manifest) => manifest.moduleMap)),
    };
  }

  static #normalizeSsrManifest(ssrManifest: SsrManifest, artifactDir: string): SsrManifest {
    return {
      ...ssrManifest,
      moduleMap: Object.fromEntries(
        Object.entries(ssrManifest.moduleMap).map(([entryUrl, byName]) => [
          entryUrl,
          Object.fromEntries(
            Object.entries(byName).map(([name, entry]) => [
              name,
              {
                ...entry,
                id: WebRouter.#resolveArtifactPath(entry.id, artifactDir),
                chunks: entry.chunks.map((chunk) => WebRouter.#resolveArtifactPath(chunk, artifactDir)),
              },
            ]),
          ),
        ]),
      ),
    };
  }

  static async #loadCssBytesByUrl(
    artifact: BaseBuildArtifact,
    artifactDir: string,
  ): Promise<Record<string, Uint8Array>> {
    const normalizedArtifactDir = path.resolve(artifactDir);
    return Object.fromEntries(
      await Promise.all(
        Object.values(artifact.cssAssets ?? {}).map(async (asset) => [
          asset.cssUrl,
          await Bun.file(path.join(normalizedArtifactDir, asset.cssRelPath)).bytes(),
        ]),
      ),
    );
  }

  static #resolveArtifactPath(artifactPath: string, artifactDir: string): string {
    if (!path.isAbsolute(artifactPath)) return path.resolve(artifactDir, artifactPath);
    if (fs.existsSync(artifactPath)) return artifactPath;

    const marker = `${path.sep}.akan${path.sep}artifact${path.sep}`;
    const markerIndex = artifactPath.lastIndexOf(marker);
    if (markerIndex >= 0) {
      const rel = artifactPath.slice(markerIndex + marker.length);
      return path.resolve(artifactDir, rel);
    }

    return path.resolve(artifactDir, "server", path.basename(artifactPath));
  }

  static #resolveCsrDir(artifactDir: string) {
    const localCsrDir = path.join(process.cwd(), "csr");
    if (fs.existsSync(localCsrDir)) return localCsrDir;
    return path.join(artifactDir, "csr");
  }

  static #resolveCsrHtmlPath(csrOutputDir: string, pathname: string, artifact: BaseBuildArtifact): string | null {
    const basePath = getBasePathFromPathname(pathname, {
      basePaths: artifact.basePaths,
      i18n: artifact.i18n,
    });
    const filename = basePath ? `${basePath}.html` : "index.html";
    const filePath = WebRouter.#safeResolve(csrOutputDir, filename);
    return filePath && fs.existsSync(filePath) ? filePath : null;
  }

  static async #fileResponse(
    req: Request,
    filePath: string,
    options: { contentType: string; cacheControl?: string },
  ): Promise<Response> {
    const headers = WebRouter.#baseAssetHeaders(options);
    const file = Bun.file(filePath);
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });
    const stat = fs.statSync(filePath);
    const lastModifiedMs = Math.floor(stat.mtimeMs / 1000) * 1000;
    const etag = WebRouter.#weakEtag(stat.size, lastModifiedMs);
    headers.set("ETag", etag);
    headers.set("Last-Modified", new Date(lastModifiedMs).toUTCString());
    if (WebRouter.#isNotModified(req, etag, lastModifiedMs)) return new Response(null, { status: 304, headers });

    const gzipPath = `${filePath}.gz`;
    if (WebRouter.#acceptsGzip(req) && WebRouter.#isCompressible(options.contentType)) {
      const gzipFile = Bun.file(gzipPath);
      if (await gzipFile.exists()) {
        const gzipBytes = await gzipFile.bytes();
        headers.set("Content-Encoding", "gzip");
        headers.set("Content-Length", String(gzipBytes.byteLength));
        headers.set("Vary", "Accept-Encoding");
        return new Response(WebRouter.#toArrayBuffer(gzipBytes), { headers });
      }
    }

    return new Response(file.stream(), { headers });
  }

  static #deepLinkAssociationResponse(
    pathname: string,
    artifact: BaseBuildArtifact,
    { cacheControl }: { cacheControl: string },
  ) {
    if (pathname !== APPLE_APP_SITE_ASSOCIATION_PATH && pathname !== ANDROID_ASSET_LINKS_PATH) return null;
    const associations = artifact.deepLinkAssociations ?? [];
    if (pathname === APPLE_APP_SITE_ASSOCIATION_PATH) {
      const details = associations
        .filter((association) => association.domains.length > 0 && association.iosTeamId)
        .map((association) => ({
          appIDs: [`${association.iosTeamId}.${association.appId}`],
          components: [{ "/": "/*" }],
        }));
      if (details.length === 0) return null;
      return WebRouter.#jsonResponse({ applinks: { apps: [], details } }, cacheControl);
    }
    const assetLinks = associations
      .filter(
        (association) =>
          association.domains.length > 0 && (association.androidSha256CertFingerprints?.length ?? 0) > 0,
      )
      .map((association) => ({
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: association.appId,
          sha256_cert_fingerprints: association.androidSha256CertFingerprints,
        },
      }));
    if (assetLinks.length === 0) return null;
    return WebRouter.#jsonResponse(assetLinks, cacheControl);
  }

  static #jsonResponse(body: unknown, cacheControl: string) {
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": cacheControl,
      },
    });
  }

  static #bytesResponse(
    _req: Request,
    bytes: Uint8Array,
    options: { contentType: string; cacheControl?: string },
  ): Response {
    const headers = WebRouter.#baseAssetHeaders(options);
    return new Response(WebRouter.#toArrayBuffer(bytes), { headers });
  }

  static #toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  static #baseAssetHeaders(options: { contentType: string; cacheControl?: string }): Headers {
    const headers = new Headers({ "Content-Type": options.contentType });
    if (options.cacheControl) headers.set("Cache-Control", options.cacheControl);
    return headers;
  }

  static #weakEtag(size: number, mtimeMs: number): string {
    return `W/"${size.toString(16)}-${mtimeMs.toString(16)}"`;
  }

  static #isNotModified(req: Request, etag: string, lastModifiedMs: number): boolean {
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch) {
      return ifNoneMatch
        .split(",")
        .map((value) => value.trim())
        .some((value) => value === "*" || value === etag);
    }

    const ifModifiedSince = req.headers.get("if-modified-since");
    if (!ifModifiedSince) return false;
    const sinceMs = Date.parse(ifModifiedSince);
    return Number.isFinite(sinceMs) && sinceMs >= lastModifiedMs;
  }

  static #acceptsGzip(req: Request): boolean {
    const acceptEncoding = req.headers.get("accept-encoding") ?? "";
    return /\bgzip\b/.test(acceptEncoding);
  }

  static #isCompressible(contentType: string): boolean {
    const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    return (
      type.startsWith("text/") ||
      type === "application/javascript" ||
      type === "application/json" ||
      type === "application/manifest+json" ||
      type === "image/svg+xml"
    );
  }

  static #safeResolve(baseDir: string, urlPath: string): string | null {
    let decoded: string;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return null;
    }
    if (decoded.includes("\0")) return null;
    const normalizedBase = path.resolve(baseDir);
    const rel = decoded.replace(/^[/\\]+/, "");
    const resolved = path.resolve(normalizedBase, rel);
    if (resolved === normalizedBase) return resolved;
    const baseWithSep = normalizedBase.endsWith(path.sep) ? normalizedBase : normalizedBase + path.sep;
    if (!resolved.startsWith(baseWithSep)) return null;
    return resolved;
  }
}
