import fs from "node:fs";
import path from "node:path";
import type { AkanWebConfig } from "akanjs";
import {
  type AkanI18nConfig,
  DEFAULT_AKAN_I18N,
  getBasePathFromPathname,
  Logger,
  type LogRecord,
  parseAkanI18nEnv,
  resolveSubRouteHosts,
} from "akanjs/common";
import { type AkanRequestStore, createRequestStore, parseCookieHeader } from "akanjs/fetch";
import type { AkanMetricsReport } from "akanjs/service";
import type { PagePromptSource } from "../signal/mcp/pagePrompt";
import { SignalContext } from "../signal/signalContext";
import {
  type BuilderRpc,
  type MergedManifest,
  RouteClientCache,
  type RouteSeedIndex,
  RouteSeedIndexStore,
  type RoutesManifest,
  RoutesManifestStore,
} from "./artifact";
import {
  getClientFacingOrigin,
  hasRouteCacheInvalidationScope,
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
import { encodedFileResponse } from "./contentEncoding";
import { isCrawlerUserAgent } from "./crawler";
import { HMR_CLIENT_SCRIPT } from "./hmr/clientScript";
import { CSR_DEV_ROUTE_PREFIX, resolveDevCsrMode, SSR_DEV_DIRNAME, SSR_DEV_ROUTE_PREFIX } from "./hmr/csrDevManifest";
import { CsrDevShell } from "./hmr/csrDevShell";
import { DevHmrController } from "./hmr/devHmrController";
import { SsrDevShim } from "./hmr/ssrDevShim";
import type { HmrWsData, HmrWsHub } from "./hmr/wsHub";
import { ImageOptimizer } from "./imageOptimizer";
import { normalizeHost, resolveArtifactDir, warnIgnoredSubRouteBasePaths } from "./proxy/hostBasePathWebProxy";
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
import { resolveStaticPath } from "./staticPath";
import { getPathnameLocale } from "./systemPageDocument";
import { createSubRouteIndexResponse, createSystemPageResponse, getSystemPageHomeHref } from "./systemPages";
import { type BaseBuildArtifact, type HttpRoutes, type RenderState, resolveWebConfig } from "./types";

const CLIENT_CLOSED_REQUEST_STATUS = 499;
export const DEFAULT_HTML_RESULT_CACHE_MAX_BODY_BYTES = 2 * 1024 * 1024;
/** Well above any sensible TTL: this only has to reclaim a cache nobody is reading, not track expiry closely. */
const ROUTE_CACHE_SWEEP_INTERVAL_MS = 60_000;
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
    // Best-effort: upstream may already be closed by the time HEAD handling runs.
  });
}

export function resolveHtmlRouteCacheStoreTtl(input: {
  baseTtl: number;
  workerCacheState: RouteCacheRenderState;
  hostRequestStore: AkanRequestStore;
  lateControl?: { type: "redirect" | "not-found" } | null;
}): number | null {
  if (input.lateControl) return null;
  const workerTtl = resolveRouteCacheStoreTtl(input.baseTtl, input.workerCacheState);
  if (workerTtl === null) return null;
  const hostCacheState = shouldStoreRouteCache({
    policy: input.hostRequestStore.policy,
    dynamicUsage: input.hostRequestStore.dynamicUsage,
  });
  return resolveRouteCacheStoreTtl(workerTtl, hostCacheState);
}

export async function createRscNavigationStreamResponse(
  result: Extract<RscRenderResult, { type: "stream" }>,
): Promise<Response> {
  // A redirect found after Flight bytes left the worker stays in-stream: an Akan digest the client strips before RSDW.
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
  // A host mapped to a basePath serves nothing else, the way HostBasePathWebProxy rewrites a page load there.
  if (basePath) {
    if (firstPath === basePath) return { url: targetUrl, basePath };
    const normalized = new URL(targetUrl);
    normalized.pathname = `/${[locale, basePath, ...segments.slice(1)].join("/")}`;
    return { url: normalized, basePath };
  }

  const targetBasePath = firstPath && basePaths.includes(firstPath) ? firstPath : null;
  if (seedEntries && routeMatches(targetUrl)) return { url: targetUrl, basePath: targetBasePath ?? basePath };
  const candidates = [...new Set([basePath, ...basePaths].filter((bp): bp is string => Boolean(bp)))];
  for (const candidate of candidates) {
    if (firstPath === candidate) continue;
    const normalized = new URL(targetUrl);
    normalized.pathname = `/${[locale, candidate, ...segments.slice(1)].join("/")}`;
    if (routeMatches(normalized)) return { url: normalized, basePath: candidate };
  }

  return { url: targetUrl, basePath: basePath ?? targetBasePath };
}

export interface SsrRoutesInputs {
  web: AkanWebConfig;
  upgradeHmrWs: (req: Request, data: HmrWsData) => boolean;
}

interface WebRouterOptions {
  artifact: BaseBuildArtifact;
  web: AkanWebConfig;
  cssBytesByUrl: Record<string, Uint8Array>;
  rsc: RscWorker;
  seedIndex: RouteSeedIndex;
  upgradeHmrWs: (req: Request, data: HmrWsData) => boolean;
  /** The production build's route manifest, which the worker was already handed at boot. */
  prebuilt?: RoutesManifest | null;
}

interface CachedHtmlResult {
  html: string;
  pathname: string;
  routeId?: string;
  tags?: string[];
}

export class WebRouter {
  #logger = new Logger("WebRouter");
  #artifactDir = resolveArtifactDir();
  #artifact: BaseBuildArtifact;
  #subRoutes: Record<string, string[]>;
  #rsc: RscWorker;
  #hub: HmrWsHub | null = null;
  // `akan start` outranks a stray NODE_ENV=production (a Bun-loaded `.env`, a CI default): its artifact has no
  // routes manifest, so production mode would throw on every request.
  #prodMode = process.env.NODE_ENV === "production" && process.env.AKAN_COMMAND_TYPE !== "start";
  #builderRpc: BuilderRpc | null;
  #routeCache: RouteClientCache;
  #devHmr: DevHmrController | null = null;
  #csrDevShell: CsrDevShell | null = null;
  /** Dev only: SSR pages load their client code from the dev module registry it serves. */
  #ssrDevShell: CsrDevShell | null = null;
  #csrArmed = false;
  #csrOnDemandBuild: Promise<unknown> | null = null;
  readonly #requestStats = {
    fullSsr: 0,
    rscNavigation: 0,
    staticAsset: 0,
    csr: 0,
    image: 0,
  };
  readonly #htmlCache = new LruTtlCache<CachedHtmlResult>(
    parsePositiveInt(process.env.AKAN_HTML_RESULT_CACHE_MAX_ENTRIES) ?? 100,
    {
      sizeOf: (result) => result.html.length,
      maxBytes: LruTtlCache.parseByteCeiling(process.env.AKAN_HTML_RESULT_CACHE_MAX_BYTES),
      sweepIntervalMs: ROUTE_CACHE_SWEEP_INTERVAL_MS,
    },
  );
  #htmlCacheHits = 0;
  #htmlCacheMisses = 0;
  #htmlCacheBypass = 0;
  #runtimeManifest: { revision: number; manifest: MergedManifest } | null = null;
  renderState: RenderState;
  /** What this router actually mounts, already intersected with what the artifact carries. */
  readonly web: AkanWebConfig;
  #seedIndex: RouteSeedIndex;
  readonly #prebuilt: RoutesManifest | null;
  constructor({ artifact, web, cssBytesByUrl, rsc, seedIndex, upgradeHmrWs, prebuilt = null }: WebRouterOptions) {
    this.#logger.verbose(`[SSR] loaded ${Object.keys(cssBytesByUrl).length} CSS assets`);
    this.web = web;
    if (process.env.NODE_ENV === "production" && !this.#prodMode)
      this.#logger.warn("[SSR] NODE_ENV=production ignored under `akan start`; serving in dev mode");
    this.#artifact = artifact;
    const { subRoutes, ignoredBasePaths } = resolveSubRouteHosts({
      subRoutes: artifact.subRoutes,
      basePaths: artifact.basePaths,
      env: process.env.AKAN_SUB_ROUTE_HOSTS,
    });
    this.#subRoutes = subRoutes;
    warnIgnoredSubRouteBasePaths(this.#logger, ignoredBasePaths);
    this.#rsc = rsc;
    this.renderState = {
      buildId: 0,
      cssAssets: this.#artifact.cssAssets ?? {},
      cssBytesByUrl,
    };
    this.#seedIndex = seedIndex;
    this.#prebuilt = prebuilt;
    if (this.#prodMode) {
      this.#builderRpc = null;
      this.#routeCache = new RouteClientCache({
        buildRoute: async (routeId) => {
          throw new Error(
            `[SSR] route ${routeId} missing from production artifact — rebuild with \`akan build\` to include it`,
          );
        },
      });
    } else {
      this.#devHmr = new DevHmrController({
        artifactDir: this.#artifactDir,
        renderState: this.renderState,
        rsc: this.#rsc,
        seedIndex: this.#seedIndex,
        upgradeHmrWs,
        pagesBundlePath: this.#artifact.pagesBundlePath,
      });
      this.#builderRpc = this.#devHmr.builderRpc;
      this.#routeCache = this.#devHmr.routeCache;
      this.#hub = this.#devHmr.hub;
      if (resolveDevCsrMode() === "registry") this.#csrDevShell = new CsrDevShell(this.#artifactDir);
      this.#ssrDevShell = new CsrDevShell(this.#artifactDir, {
        dirName: SSR_DEV_DIRNAME,
        routePrefix: SSR_DEV_ROUTE_PREFIX,
      });
    }
  }

  async initializeRoute() {
    if (this.#prebuilt) this.#routeCache.seed(this.#prebuilt);

    const clientServePrefix = `/_akan/client`;
    const clientOutputDir = `${this.#artifactDir}/client`;
    const localCsrDir = path.join(process.cwd(), "csr");
    const csrOutputDir = fs.existsSync(localCsrDir) ? localCsrDir : path.join(this.#artifactDir, "csr");
    const publicDir = path.join(process.env.AKAN_APP_DIR ?? path.dirname(Bun.main), "public");
    const imageCacheDir = path.join(this.#artifactDir, "image-cache");
    const imageOptimizer = new ImageOptimizer({
      publicDir,
      cacheDir: imageCacheDir,
      prodMode: this.#prodMode,
      config: this.#artifact.imageConfig,
    });

    const renderEnvRoutes: HttpRoutes = {
      ...(this.web.csr
        ? {
            "/__csr": async (req) => {
              this.#requestStats.csr += 1;
              if (this.#csrDevShell) return await this.#serveCsrDevShell(req, "/", this.#csrDevShell);
              const csrHtml = await this.#resolveCsrHtml(csrOutputDir, "/");
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
              return new Response(this.#withCsrHmr(htmlText), { headers: this.#htmlResponseHeaders(200) });
            },
            ...(this.#csrDevShell
              ? {
                  [`${CSR_DEV_ROUTE_PREFIX}*`]: async (req: Request) => {
                    this.#requestStats.staticAsset += 1;
                    return (await this.#csrDevShell?.serve(req)) ?? new Response("Not Found", { status: 404 });
                  },
                }
              : {}),
          }
        : {}),
      ...(this.#ssrDevShell
        ? {
            [`${SSR_DEV_ROUTE_PREFIX}*`]: async (req: Request) => {
              this.#requestStats.staticAsset += 1;
              return (await this.#ssrDevShell?.serve(req)) ?? new Response("Not Found", { status: 404 });
            },
          }
        : {}),
      [`${clientServePrefix}/*`]: async (req) => {
        this.#requestStats.staticAsset += 1;
        const url = new URL(req.url);
        const filePath = resolveStaticPath(clientOutputDir, url.pathname.slice(clientServePrefix.length + 1));
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
          const filePath = resolveStaticPath(this.#artifactDir, url.pathname.slice("/_akan/".length));
          if (filePath) {
            return WebRouter.#fileResponse(req, filePath, {
              contentType: "text/css; charset=utf-8",
              cacheControl: "public, max-age=31536000, immutable",
            });
          }
        }
        const cssBytes = this.renderState.cssBytesByUrl[url.pathname];
        if (!cssBytes) return new Response("Not Found", { status: 404 });
        const headers = WebRouter.#baseAssetHeaders({
          contentType: "text/css; charset=utf-8",
          cacheControl: "no-store",
        });
        return new Response(
          cssBytes.buffer.slice(cssBytes.byteOffset, cssBytes.byteOffset + cssBytes.byteLength) as ArrayBuffer,
          { headers },
        );
      },
      "/_akan/fonts/*": (req) => {
        this.#requestStats.staticAsset += 1;
        const url = new URL(req.url);
        const filePath = resolveStaticPath(this.#artifactDir, url.pathname.slice("/_akan/".length));
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
            "/_akan/hmr": (req: Request) =>
              this.#devHmr?.handleWs(req) ?? new Response("HMR unavailable", { status: 404 }),
          }
        : {}),
      "/__rsc": async (req) => {
        this.#requestStats.rscNavigation += 1;
        try {
          const reqUrl = new URL(req.url);
          // Behind proxies req.url is internal; forwarded headers give the browser's origin for the same-origin check.
          const clientOrigin = getClientFacingOrigin(req);
          const target = reqUrl.searchParams.get("url");
          const rawTargetUrl = target ? new URL(target, clientOrigin) : reqUrl;
          const requestBasePath = this.#requestBasePath(req);
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
          // No WebProxy runs on /__rsc: these are the headers LocaleWebProxy gives a page load of this URL.
          const [, targetLocale = "", ...targetPath] = rawTargetUrl.pathname.split("/");
          if (this.#artifact.i18n.locales.includes(targetLocale)) {
            rscHeaders.set("x-locale", targetLocale);
            rscHeaders.set("x-path", `/${targetPath.join("/")}`);
          }
          const rscReq = new Request(targetUrl, {
            method: "GET",
            headers: rscHeaders,
          });
          const result = await this.#rsc.renderWithMeta(rscReq, {
            clientManifest: manifest.clientManifest,
            signal: req.signal,
            clientIp: SignalContext.clientIpOf(req),
          });
          if (result.type === "redirect")
            return createRscRedirectResponse(result.location, result.method, result.status);
          if (result.type === "not-found") return createRscNotFoundFallbackResponse();
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
      // Machines fetch these (Chrome asks for com.chrome.devtools.json on every DevTools load): no SSR 404 render.
      // Exact well-known routes (deep links, MCP OAuth metadata) still win — Bun matches static before wildcard.
      "/.well-known/*": () =>
        new Response("Not Found", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        }),
      "/*": async (req) => {
        const url = new URL(req.url);
        if (url.pathname.endsWith("/_akan/image")) {
          this.#requestStats.image += 1;
          return imageOptimizer.handle(req);
        }

        if (this.web.csr) {
          const isCsr = url.searchParams.get("csr") === "true";
          if (isCsr) {
            this.#requestStats.csr += 1;
            if (this.#csrDevShell) return await this.#serveCsrDevShell(req, url.pathname, this.#csrDevShell);
            const csrHtml = await this.#resolveCsrHtml(csrOutputDir, url.pathname);
            if (!csrHtml) return this.#csrUnavailableResponse(url.pathname);
            const html = await Bun.file(csrHtml).text();
            return new Response(this.#withCsrHmr(html), { headers: this.#htmlResponseHeaders(200) });
          }

          const csrAssetPath = path.extname(url.pathname) ? resolveStaticPath(csrOutputDir, url.pathname) : null;
          if (csrAssetPath && (await Bun.file(csrAssetPath).exists())) {
            this.#requestStats.staticAsset += 1;
            return WebRouter.#fileResponse(req, csrAssetPath, {
              contentType: Bun.file(csrAssetPath).type || "application/octet-stream",
              cacheControl: this.#prodMode ? "public, max-age=31536000, immutable" : undefined,
            });
          }
        }

        const filePath = resolveStaticPath(publicDir, url.pathname);
        if (filePath && (await Bun.file(filePath).exists())) {
          this.#requestStats.staticAsset += 1;
          return WebRouter.#fileResponse(req, filePath, {
            contentType: Bun.file(filePath).type || "application/octet-stream",
            cacheControl: this.#prodMode ? "public, max-age=300" : "no-store",
          });
        }

        if (url.pathname === "/robots.txt") {
          return new Response(createDefaultRobotsTxt(), {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": this.#prodMode ? "public, max-age=3600" : "no-store",
            },
          });
        }

        const sitemapBasePath = getSitemapBasePath(url.pathname, this.#artifact.basePaths, this.#requestBasePath(req));
        if (sitemapBasePath !== undefined) {
          return new Response(
            createDefaultSitemapXml({
              origin: getClientFacingOrigin(req),
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

        const subRouteIndex = this.#localSubRouteIndexResponse(req, url);
        if (subRouteIndex) return await subRouteIndex;

        try {
          this.#requestStats.fullSsr += 1;
          const manifest = await this.#ensureRoute(url);
          const isCrawler = isCrawlerUserAgent(req.headers.get("user-agent"));
          const htmlCacheDecision = this.#getHtmlCacheEntry(req, url, isCrawler);
          const htmlCacheEntry = htmlCacheDecision.entry;
          const cachedHtml = htmlCacheEntry ? this.#getCachedHtml(htmlCacheEntry.key) : null;
          if (cachedHtml) {
            const cachedHeaders = this.#htmlResponseHeaders(200);
            cachedHeaders.set("X-Akan-Cache", "HIT");
            return new Response(cachedHtml, { headers: cachedHeaders });
          }
          const rscResult = await this.#rsc.renderWithMeta(req, {
            clientManifest: manifest.clientManifest,
            signal: req.signal,
            clientIp: SignalContext.clientIpOf(req),
          });
          if (rscResult.type === "redirect")
            return Response.redirect(new URL(rscResult.location, url.origin), rscResult.status);
          if (rscResult.type === "not-found") return this.#renderSystemNotFoundFallbackResponse(req, url);
          // First-paint data-theme: cookie is no longer a React <html> prop (RSC cache would replay it).
          const cookieTheme = WebRouter.#cookieValue(req, "theme");
          const hostRequestStore = createRequestStore(req);
          const extraBootstrapInline = [
            rscResult.trace?.routeState
              ? `self.__AKAN_RSC_INITIAL_STATE__=${JSON.stringify(rscResult.trace.routeState)};`
              : "",
            this.#ssrDevShell
              ? SsrDevShim.script(await this.#ssrDevShell.readManifest(), Object.keys(this.#artifact.vendorMap))
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
            //? Read once the shell has rendered: the root layout's theme arrives after the stream starts.
            get theme() {
              return cookieTheme ?? rscResult.theme ?? "system";
            },
            lateControl: rscResult.lateControl,
            waitForAllReady: rscResult.trace?.ssrBlocking ?? false,
            inlineBoundaries: isCrawler,
            onCancel: (reason: unknown) => {
              rscResult.cancel(reason);
            },
          });
          //? A not-found the page raised after the stream started is known here only if the host still held the response.
          const lateControl = await Promise.race([rscResult.lateControl, Promise.resolve(null)]);
          const responseStatus = lateControl?.type === "not-found" ? 404 : (rscResult.status ?? 200);
          const responseHeaders = this.#htmlResponseHeaders(responseStatus);
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
                  this.#htmlCache.set(htmlCacheEntry.key, { html, ...htmlCacheMetadata }, htmlStoreTtl);
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
  refreshHmrState(): void {
    this.#devHmr?.refreshRegistryState();
  }
  hmrBuildErrors(): { phase: string }[] {
    return this.#devHmr?.buildErrorMessages() ?? [];
  }
  dispose() {
    this.#devHmr?.dispose();
    this.#devHmr = null;
    this.#builderRpc = null;
    this.#htmlCache.dispose();
    this.#rsc.kill();
    this.#hub = null;
  }
  setLogLevel(minSev: number | null) {
    this.#rsc.setLogLevel(minSev);
  }

  pagePrompts(): PagePromptSource {
    return {
      list: () => this.#rsc.listPagePrompts(),
      run: (input) => this.#rsc.runPagePrompt(input),
    };
  }

  onLogRecords(listener: (records: LogRecord[], dropped: number) => void) {
    this.#rsc.onLogRecords = listener;
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
      httpHtmlCacheBytes: this.#htmlCache.byteSize,
      httpHtmlCacheHits: this.#htmlCacheHits,
      httpHtmlCacheMisses: this.#htmlCacheMisses,
      httpHtmlCacheBypass: this.#htmlCacheBypass,
    };
  }

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

  // `x-base-path` can arrive from the wire, not just HostBasePathWebProxy: trust only a basePath this build serves.
  #requestBasePath(req: Request): string | null {
    const headerBasePath = req.headers.get("x-base-path");
    if (headerBasePath && this.#artifact.basePaths.includes(headerBasePath)) return headerBasePath;
    return WebRouter.#basePathForRequestHost(req, this.#subRoutes);
  }

  static #basePathForRequestHost(req: Request, subRoutes: Record<string, string[]>): string | null {
    const host = normalizeHost(req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? req.headers.get("host"));
    if (!host) return null;
    for (const [basePath, domains] of Object.entries(subRoutes)) {
      if (domains.some((domain) => normalizeHost(domain) === host)) return basePath;
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

  #getHtmlCacheEntry(req: Request, url: URL, isCrawler: boolean): { entry: RouteCacheEntry | null; reason?: string } {
    //? The dev registry's shim config is part of the HTML: a cached page would boot every reload beside the vendor file
    //? it was rendered with, and a tab that reloads onto the current pair would reload again until the entry expired.
    if (this.#ssrDevShell) {
      this.#htmlCacheBypass += 1;
      return { entry: null, reason: "dev-registry" };
    }
    const decision = resolvePublicRouteCacheEntryDecision({
      request: req,
      url,
      theme: WebRouter.#cookieValue(req, "theme"),
      variant: isCrawler ? "crawler" : undefined,
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

  static #cookieValue(req: Request, name: string): string | undefined {
    return parseCookieHeader(req.headers.get("cookie") ?? "").get(name)?.value;
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
    return this.#mergeRuntimeManifest();
  }

  // Still a copy, so an in-flight request keeps a stable manifest across an invalidate.
  #mergeRuntimeManifest(): MergedManifest {
    const revision = this.#routeCache.revision;
    if (this.#runtimeManifest?.revision === revision) return this.#runtimeManifest.manifest;
    const snapshot = this.#routeCache.snapshot();
    const manifest: MergedManifest = {
      ...snapshot,
      clientManifest: Object.assign({}, this.#artifact.rscRuntimeClientManifest, snapshot.clientManifest),
      ssrManifest: {
        moduleLoading: null,
        moduleMap: Object.assign({}, this.#artifact.rscRuntimeSsrManifest?.moduleMap, snapshot.ssrManifest.moduleMap),
      },
    };
    this.#runtimeManifest = { revision, manifest };
    return manifest;
  }
  #renderSystemNotFoundFallbackResponse(req: Request, url: URL): Promise<Response> {
    return createSystemPageResponse({
      kind: "not-found",
      method: req.method,
      pathname: url.pathname,
      lang: getPathnameLocale(url.pathname, this.#artifact.i18n),
      homeHref: this.#getSystemPageHomeHref(req, url.pathname),
      stylesheetHref: this.#getStylesheetHref(req, url.pathname),
    });
  }

  // A subRoutes build has no root page (routes live under `page/<basePath>`), so local dev serves a basePath picker;
  // deployed hosts never get here, HostBasePathWebProxy rewrites the root first.
  #localSubRouteIndexResponse(req: Request, url: URL): Promise<Response> | null {
    if (process.env.AKAN_PUBLIC_ENV !== "local" || !this.#artifact.basePaths.length) return null;
    if (!WebRouter.#isSiteRootPathname(url.pathname, this.#artifact.i18n)) return null;
    return createSubRouteIndexResponse({
      method: req.method,
      locale: getPathnameLocale(url.pathname, this.#artifact.i18n),
      basePaths: this.#artifact.basePaths,
      subRoutes: this.#subRoutes,
    });
  }

  static #isSiteRootPathname(pathname: string, i18n: AkanI18nConfig): boolean {
    const segments = pathname.split("/").filter(Boolean);
    if (!segments.length) return true;
    return segments.length === 1 && i18n.locales.includes(segments[0] ?? "");
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
      lang: getPathnameLocale(new URL(req.url).pathname, this.#artifact.i18n),
      homeHref: this.#getSystemPageHomeHref(req, new URL(req.url).pathname),
      stylesheetHref: this.#getStylesheetHref(req, new URL(req.url).pathname),
      showDetails: !this.#prodMode,
      error: err,
      ...(this.#prodMode ? {} : { script: `self.__AKAN_HMR_SYSTEM_PAGE__=true;${HMR_CLIENT_SCRIPT}` }),
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
      headerBasePath: this.#requestBasePath(req),
    });
  }

  #getStylesheetHref(req: Request, pathname: string): string | null {
    const basePath = getBasePathFromPathname(pathname, {
      basePaths: Object.keys(this.renderState.cssAssets),
      i18n: this.#artifact.i18n,
      headerBasePath: this.#requestBasePath(req),
    });
    return this.renderState.cssAssets[basePath ?? ""]?.cssUrl ?? null;
  }

  //? Dev: a back/forward navigation replays a document from the HTTP cache without asking, which would boot a tab onto
  //? the RSC payload and registry config of a build the server no longer runs.
  #htmlResponseHeaders(status: number): Headers {
    const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
    if (status >= 400 || !this.#prodMode) headers.set("Cache-Control", "no-store");
    return WebRouter.#applySecurityHeaders(headers, { html: true });
  }
  #withCsrHmr(html: string): string {
    if (this.#prodMode) return html;
    const csrGeneration = this.renderState.csrGeneration ?? null;
    const flags = `self.__AKAN_HMR_CLIENT__="csr";self.__AKAN_CSR_GENERATION__=${csrGeneration};`;
    return WebRouter.#injectBeforeBodyEnd(html, `<script>${flags}${HMR_CLIENT_SCRIPT}</script>`);
  }
  // Armed before the first render: the builder keeps the registry bundle current only after something asked for it.
  async #serveCsrDevShell(req: Request, pathname: string, shell: CsrDevShell): Promise<Response> {
    await this.#armCsrArtifact(pathname);
    const basePath =
      getBasePathFromPathname(pathname, { basePaths: this.#artifact.basePaths, i18n: this.#artifact.i18n }) ?? "";
    const html = await shell.render({
      basePath,
      lang: "en",
      title: process.env.AKAN_PUBLIC_APP_NAME ?? "akan",
      cssHref: this.#getStylesheetHref(req, pathname),
    });
    if (!html) return this.#csrUnavailableResponse(pathname);
    return new Response(this.#withCsrHmr(html), { headers: this.#htmlResponseHeaders(200) });
  }
  async #resolveCsrHtml(csrOutputDir: string, pathname: string): Promise<string | null> {
    const resolved = WebRouter.#resolveCsrHtmlPath(csrOutputDir, pathname, this.#artifact);
    if (resolved) return resolved;
    await this.#armCsrArtifact(pathname);
    return WebRouter.#resolveCsrHtmlPath(csrOutputDir, pathname, this.#artifact);
  }
  #armCsrArtifact(reason: string): Promise<unknown> {
    const rpc = this.#builderRpc;
    // Arm once: after a build the builder keeps CSR current, so a still-missing file means an unknown basePath.
    if (this.#csrArmed || !rpc) return Promise.resolve();
    this.#csrOnDemandBuild ??= rpc
      .buildCsr(reason)
      .then(() => {
        this.#csrArmed = true;
        this.#logger.info(`[csr] dev CSR artifact built on demand (${reason})`);
      })
      .catch((err: unknown) => {
        this.#logger.error(`[csr] on-demand build failed: ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => {
        this.#csrOnDemandBuild = null;
      });
    return this.#csrOnDemandBuild;
  }
  #csrUnavailableResponse(pathname: string): Response {
    if (this.#prodMode) return new Response("Not Found", { status: 404 });
    const message = `No CSR artifact for ${pathname}. Dev CSR is built on demand; check the dev server log for a csr-build failure and verify the basePath in the URL.`;
    this.#logger.warn(`[csr] ${message}`);
    return new Response(message, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  static #injectBeforeBodyEnd(html: string, snippet: string): string {
    const matches = [...html.matchAll(/<\/body\s*>/gi)];
    const last = matches.at(-1);
    if (!last || last.index === undefined) return `${html}\n${snippet}`;
    return `${html.slice(0, last.index)}${snippet}\n${html.slice(last.index)}`;
  }

  /** `null` when the build has no web artifact (an api-only build, or no `page/`): boot without a web surface. */
  static async create({ web, upgradeHmrWs }: SsrRoutesInputs): Promise<WebRouter | null> {
    const artifactDir = resolveArtifactDir();
    const artifactFile = Bun.file(path.join(artifactDir, "base-artifact.json"));
    if (!(await artifactFile.exists())) return null;
    const artifact = WebRouter.#normalizeArtifact((await artifactFile.json()) as BaseBuildArtifact, artifactDir);
    const builtWeb = resolveWebConfig(artifact.web);
    if (!builtWeb.ssr) return null;
    const cssBytesByUrl = await WebRouter.#loadCssBytesByUrl(artifact, artifactDir);
    const prodMode = process.env.NODE_ENV === "production" && process.env.AKAN_COMMAND_TYPE !== "start";
    //* Production listens before the bundle loads (renders queue until `ready`) and exits if it cannot load rather
    //* than restart-loop behind a healthy API; dev awaits, as the next rebuild hands the worker a fixed bundle.
    //? The prebuilt route manifest rides the worker's first init: a reload onto it would wait for `ready`, and so would
    //? `listen`.
    const prebuilt = prodMode ? await RoutesManifestStore.read(artifactDir) : null;
    const rsc = new RscWorker(
      prebuilt
        ? {
            ...artifact,
            rscRuntimeClientManifest: { ...artifact.rscRuntimeClientManifest, ...prebuilt.clientManifest },
          }
        : artifact,
      { failBeforeReady: prodMode },
    );
    if (prodMode)
      void rsc.ready.catch((error: unknown) => {
        new Logger("WebRouter").error(`RSC worker failed to load the pages bundle: ${String(error)}`);
        process.exit(1);
      });
    else await rsc.ready;
    const seedIndex = await RouteSeedIndexStore.load(artifactDir);
    return new WebRouter({
      artifact,
      web: { ssr: true, csr: web.csr && builtWeb.csr },
      cssBytesByUrl,
      rsc,
      seedIndex,
      upgradeHmrWs,
      prebuilt,
    });
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

  static #resolveCsrHtmlPath(csrOutputDir: string, pathname: string, artifact: BaseBuildArtifact): string | null {
    const basePath = getBasePathFromPathname(pathname, {
      basePaths: artifact.basePaths,
      i18n: artifact.i18n,
    });
    const filename = basePath ? `${basePath}.html` : "index.html";
    const filePath = resolveStaticPath(csrOutputDir, filename);
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
    const etag = `W/"${stat.size.toString(16)}-${lastModifiedMs.toString(16)}"`;
    headers.set("ETag", etag);
    headers.set("Last-Modified", new Date(lastModifiedMs).toUTCString());
    if (WebRouter.#isNotModified(req, etag, lastModifiedMs)) return new Response(null, { status: 304, headers });

    return await encodedFileResponse(req, filePath, options.contentType, headers);
  }

  static #deepLinkAssociationResponse(
    pathname: string,
    artifact: BaseBuildArtifact,
    { cacheControl }: { cacheControl: string },
  ) {
    const associations = artifact.deepLinkAssociations ?? [];
    if (pathname === APPLE_APP_SITE_ASSOCIATION_PATH) {
      const details = associations
        .filter((association) => association.domains.length > 0 && association.iosTeamId && association.iosAppId)
        .map((association) => ({
          appIDs: [`${association.iosTeamId}.${association.iosAppId}`],
          components: [{ "/": "/*" }],
        }));
      if (details.length === 0) return null;
      return WebRouter.#jsonResponse({ applinks: { apps: [], details } }, cacheControl);
    }
    //? The Android debug buildType appends applicationIdSuffix ".debug"; only a non-main server vouches for it.
    const packageSuffixes = process.env.AKAN_PUBLIC_ENV === "main" ? [""] : ["", ".debug"];
    const assetLinks = associations
      .filter(
        (association) =>
          association.domains.length > 0 &&
          !!association.androidAppId &&
          (association.androidSha256CertFingerprints?.length ?? 0) > 0,
      )
      .flatMap((association) =>
        packageSuffixes.map((suffix) => ({
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: `${association.androidAppId}${suffix}`,
            sha256_cert_fingerprints: association.androidSha256CertFingerprints,
          },
        })),
      );
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

  // nosniff: Bun.file().type falls back to octet-stream, and a sniffing browser may run a public/ file as script.
  // Referrer-Policy: paths carry ids. X-Frame-Options (HTML only): stops clickjacking of cookie-authenticated pages.
  static #applySecurityHeaders(headers: Headers, { html = false } = {}): Headers {
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    if (html) headers.set("X-Frame-Options", "SAMEORIGIN");
    return headers;
  }

  static #baseAssetHeaders(options: { contentType: string; cacheControl?: string }): Headers {
    const headers = new Headers({ "Content-Type": options.contentType });
    if (options.cacheControl) headers.set("Cache-Control", options.cacheControl);
    return WebRouter.#applySecurityHeaders(headers);
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
}
