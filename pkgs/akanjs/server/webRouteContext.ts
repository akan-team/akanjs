import fs from "node:fs";
import { CookieJar, getBasePathFromPathname, Logger, parseAkanI18nEnv, RequestLocale } from "akanjs/common";
import { type MergedManifest, type RouteClientCache, type RouteSeedIndex, RouteSeedIndexStore } from "./artifact";
import { type AssetHeaderOptions, applySecurityHeaders, assetHeaders, strictTransportSecurity } from "./assetHeaders";
import { getClientFacingOrigin, resolveHtmlCacheControl } from "./cachePolicy";
import { encodedFileResponse, isCompressibleContentType, matchesIfNoneMatch, varyOnEncoding } from "./contentEncoding";
import { HMR_CLIENT_SCRIPT } from "./hmr/clientScript";
import type { HmrWsHub } from "./hmr/wsHub";
import { normalizeHost } from "./proxy/hostBasePathWebProxy";
import { getPathnameLocale } from "./systemPageDocument";
import { createSystemPageResponse, getSystemPageHomeHref } from "./systemPages";
import type { BaseBuildArtifact, RenderState } from "./types";

const CLIENT_CLOSED_REQUEST_STATUS = 499;

export interface WebRequestStats {
  fullSsr: number;
  rscNavigation: number;
  rscPrefetch: number;
  staticAsset: number;
  csr: number;
  image: number;
}

interface WebRouteContextOptions {
  artifact: BaseBuildArtifact;
  prodMode: boolean;
  renderState: RenderState;
  subRoutes: Record<string, string[]>;
  seedIndex: RouteSeedIndex;
  routeCache: RouteClientCache;
  hub: () => HmrWsHub | null;
}

export class WebRouteContext {
  readonly logger = new Logger("WebRouter");
  readonly stats: WebRequestStats = { fullSsr: 0, rscNavigation: 0, rscPrefetch: 0, staticAsset: 0, csr: 0, image: 0 };
  readonly artifact: BaseBuildArtifact;
  readonly prodMode: boolean;
  readonly renderState: RenderState;
  readonly subRoutes: Record<string, string[]>;
  readonly seedIndex: RouteSeedIndex;
  readonly routeCache: RouteClientCache;
  readonly #hub: () => HmrWsHub | null;
  #runtimeManifest: { revision: number; manifest: MergedManifest } | null = null;

  constructor({ artifact, prodMode, renderState, subRoutes, seedIndex, routeCache, hub }: WebRouteContextOptions) {
    this.artifact = artifact;
    this.prodMode = prodMode;
    this.renderState = renderState;
    this.subRoutes = subRoutes;
    this.seedIndex = seedIndex;
    this.routeCache = routeCache;
    this.#hub = hub;
  }

  // `x-base-path` can arrive from the wire, not just HostBasePathWebProxy: trust only a basePath this build serves.
  requestBasePath(req: Request): string | null {
    const headerBasePath = req.headers.get("x-base-path");
    if (headerBasePath && this.artifact.basePaths.includes(headerBasePath)) return headerBasePath;
    return WebRouteContext.#basePathForRequestHost(req, this.subRoutes);
  }

  static #basePathForRequestHost(req: Request, subRoutes: Record<string, string[]>): string | null {
    const host = normalizeHost(req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? req.headers.get("host"));
    if (!host) return null;
    for (const [basePath, domains] of Object.entries(subRoutes)) {
      if (domains.some((domain) => normalizeHost(domain) === host)) return basePath;
    }
    return null;
  }

  async ensureRoute(url: URL) {
    const started = Date.now();
    const matched =
      RouteSeedIndexStore.match(url.pathname, this.seedIndex.entries) ??
      RouteSeedIndexStore.matchPrefix(url.pathname, this.seedIndex.entries);
    if (matched) await this.routeCache.ensure(matched.entry.routeId, matched.entry.seeds);
    this.logger.verbose(
      `[route-cache] ensure pathname=${url.pathname} routeId=${matched?.entry.routeId ?? "(none)"} in ${Date.now() - started}ms`,
    );
    return this.#mergeRuntimeManifest();
  }

  // Still a copy, so an in-flight request keeps a stable manifest across an invalidate.
  #mergeRuntimeManifest(): MergedManifest {
    const revision = this.routeCache.revision;
    if (this.#runtimeManifest?.revision === revision) return this.#runtimeManifest.manifest;
    const snapshot = this.routeCache.snapshot();
    const manifest: MergedManifest = {
      ...snapshot,
      clientManifest: Object.assign({}, this.artifact.rscRuntimeClientManifest, snapshot.clientManifest),
      ssrManifest: {
        moduleLoading: null,
        moduleMap: Object.assign({}, this.artifact.rscRuntimeSsrManifest?.moduleMap, snapshot.ssrManifest.moduleMap),
      },
    };
    this.#runtimeManifest = { revision, manifest };
    return manifest;
  }

  //? The locale the RSC worker's `usePage()` resolves from the same request, so the page and its dictionary agree.
  dictionaryUrlOf(headers: Headers, pathname: string): string | undefined {
    const i18n = parseAkanI18nEnv();
    const { locale } = RequestLocale.resolve(
      { localeHeader: headers.get("x-locale"), pathHeader: headers.get("x-path"), pathname },
      i18n,
    );
    const assets = this.artifact.dictAssets ?? {};
    return (assets[locale] ?? assets[i18n.defaultLocale])?.url;
  }

  //? Dev: a back/forward navigation replays a document from the HTTP cache without asking, which would boot a tab onto
  //? the RSC payload and registry config of a build the server no longer runs.
  htmlResponseHeaders(status: number, req: Request): Headers {
    const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
    if (status >= 400 || !this.prodMode) headers.set("Cache-Control", "no-store");
    else {
      const cacheControl = resolveHtmlCacheControl(req);
      if (cacheControl) headers.set("Cache-Control", cacheControl);
    }
    const hsts = this.prodMode ? strictTransportSecurity() : null;
    if (hsts && getClientFacingOrigin(req).startsWith("https:")) headers.set("Strict-Transport-Security", hsts);
    return applySecurityHeaders(headers, { html: true });
  }

  stylesheetHref(req: Request, pathname: string): string | null {
    const basePath = getBasePathFromPathname(pathname, {
      basePaths: Object.keys(this.renderState.cssAssets),
      i18n: this.artifact.i18n,
      headerBasePath: this.requestBasePath(req),
    });
    return this.renderState.cssAssets[basePath ?? ""]?.cssUrl ?? null;
  }

  #systemPageHomeHref(req: Request, pathname: string): string {
    return getSystemPageHomeHref({
      pathname,
      i18n: this.artifact.i18n,
      basePaths: this.artifact.basePaths,
      headerBasePath: this.requestBasePath(req),
    });
  }

  notFoundPageResponse(req: Request, url: URL): Promise<Response> {
    return createSystemPageResponse({
      kind: "not-found",
      method: req.method,
      pathname: url.pathname,
      lang: getPathnameLocale(url.pathname, this.artifact.i18n),
      homeHref: this.#systemPageHomeHref(req, url.pathname),
      stylesheetHref: this.stylesheetHref(req, url.pathname),
    });
  }

  errorPageResponse(req: Request, scope: string, err: unknown): Promise<Response> {
    if (WebRouteContext.#isExpectedRequestAbort(err)) return Promise.resolve(WebRouteContext.#clientClosedResponse());
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`[SSR] render failed scope=${scope}: ${message}`);
    this.#hub()?.broadcast({ type: "error", message });
    return createSystemPageResponse({
      kind: "error",
      method: req.method,
      pathname: scope,
      lang: getPathnameLocale(new URL(req.url).pathname, this.artifact.i18n),
      homeHref: this.#systemPageHomeHref(req, new URL(req.url).pathname),
      stylesheetHref: this.stylesheetHref(req, new URL(req.url).pathname),
      showDetails: !this.prodMode,
      error: err,
      ...(this.prodMode ? {} : { script: `self.__AKAN_HMR_SYSTEM_PAGE__=true;${HMR_CLIENT_SCRIPT}` }),
    });
  }

  rscErrorResponse(scope: string, err: unknown): Response {
    if (WebRouteContext.#isExpectedRequestAbort(err)) return WebRouteContext.#clientClosedResponse();
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`[SSR] render failed scope=${scope}: ${message}`);
    this.#hub()?.broadcast({ type: "error", message });
    return new Response("Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  static cookieValue(req: Request, name: string): string | undefined {
    return CookieJar.parse(req.headers.get("cookie")).read(name).value;
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

  static async fileResponse(req: Request, filePath: string, options: AssetHeaderOptions): Promise<Response> {
    const headers = assetHeaders(options);
    const file = Bun.file(filePath);
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });
    const stat = fs.statSync(filePath);
    const lastModifiedMs = Math.floor(stat.mtimeMs / 1000) * 1000;
    const etag = `W/"${stat.size.toString(16)}-${lastModifiedMs.toString(16)}"`;
    headers.set("ETag", etag);
    headers.set("Last-Modified", new Date(lastModifiedMs).toUTCString());
    if (isCompressibleContentType(options.contentType)) varyOnEncoding(headers);
    if (WebRouteContext.#isNotModified(req, etag, lastModifiedMs)) return new Response(null, { status: 304, headers });

    return await encodedFileResponse(req, filePath, options.contentType, headers);
  }

  static #isNotModified(req: Request, etag: string, lastModifiedMs: number): boolean {
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch) return matchesIfNoneMatch(ifNoneMatch, etag);

    const ifModifiedSince = req.headers.get("if-modified-since");
    if (!ifModifiedSince) return false;
    const sinceMs = Date.parse(ifModifiedSince);
    return Number.isFinite(sinceMs) && sinceMs >= lastModifiedMs;
  }
}
