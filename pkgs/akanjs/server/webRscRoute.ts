import { type AkanI18nConfig, LocalePath } from "akanjs/common";
import { SignalContext } from "../signal/signalContext";
import { type RouteSeedIndex, RouteSeedIndexStore } from "./artifact";
import { applySecurityHeaders } from "./assetHeaders";
import { getClientFacingOrigin } from "./cachePolicy";
import { AKAN_RSC_DICTIONARY_HEADER, AKAN_RSC_IMPORT_MAP_HEADER, AKAN_RSC_PREFETCH_HEADER } from "./routeState";
import {
  createRscNavigationStreamResponse,
  createRscNotFoundFallbackResponse,
  createRscRedirectResponse,
} from "./rscResponse";
import type { RscWorker } from "./rscWorkerHost";
import { SessionRefresh } from "./sessionRefresh";
import type { HttpRoutes } from "./types";
import type { WebRouteContext } from "./webRouteContext";

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

  return { url: targetUrl, basePath: targetBasePath };
}

interface WebRscRouteOptions {
  rsc: RscWorker;
  importMapKey: string;
}

export class WebRscRoute {
  readonly #context: WebRouteContext;
  readonly #rsc: RscWorker;
  readonly #importMapKey: string;

  constructor(context: WebRouteContext, { rsc, importMapKey }: WebRscRouteOptions) {
    this.#context = context;
    this.#rsc = rsc;
    this.#importMapKey = importMapKey;
  }

  routes(): HttpRoutes {
    const context = this.#context;
    return {
      "/__rsc": SessionRefresh.answering(async (req) => {
        const prefetch = req.headers.get(AKAN_RSC_PREFETCH_HEADER) === "1";
        context.stats[prefetch ? "rscPrefetch" : "rscNavigation"] += 1;
        try {
          return await this.#navigate(req, prefetch);
        } catch (err) {
          return context.rscErrorResponse("__rsc", err);
        }
      }),
      ...(!context.prodMode || process.env.AKAN_EXPOSE_RSC_MANIFEST === "1"
        ? {
            "/__rsc/manifest": () =>
              new Response(JSON.stringify(context.routeCache.merged.clientManifest, null, 2), {
                headers: applySecurityHeaders(
                  new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }),
                ),
              }),
          }
        : {}),
    };
  }

  async #navigate(req: Request, prefetch: boolean): Promise<Response> {
    const context = this.#context;
    //? A tab imports through its document's import map, whose narrowed vendors lack names another build imports;
    //? the client loads a target it cannot fetch as a document, which brings this build's import map.
    const importMap = req.headers.get(AKAN_RSC_IMPORT_MAP_HEADER);
    if (importMap && importMap !== this.#importMapKey)
      return new Response("Conflict", {
        status: 409,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    const reqUrl = new URL(req.url);
    // Behind proxies req.url is internal; forwarded headers give the browser's origin for the same-origin check.
    const clientOrigin = getClientFacingOrigin(req);
    const target = reqUrl.searchParams.get("url");
    const rawTargetUrl = target ? new URL(target, clientOrigin) : reqUrl;
    const i18n = context.artifact.i18n;
    const { locale: targetLocale, path: targetPath, isPrefixed } = LocalePath.split(rawTargetUrl.pathname, i18n);
    const localizedTargetUrl = new URL(rawTargetUrl);
    if (targetLocale && !isPrefixed) localizedTargetUrl.pathname = `/${targetLocale}${rawTargetUrl.pathname}`;
    const requestBasePath = context.requestBasePath(req);
    const normalizedTarget = normalizeRscTargetUrlForHostBasePath(localizedTargetUrl, {
      basePath: requestBasePath,
      basePaths: context.artifact.basePaths,
      i18n,
      seedEntries: context.seedIndex.entries,
    });
    const targetUrl = normalizedTarget.url;
    if (!WebRscRoute.#isTrustedRscTarget(clientOrigin, targetUrl)) return new Response("Bad Request", { status: 400 });
    await SessionRefresh.apply(req);
    const manifest = await context.ensureRoute(targetUrl);
    const rscHeaders = new Headers(req.headers);
    if (normalizedTarget.basePath) rscHeaders.set("x-base-path", normalizedTarget.basePath);
    // No WebProxy runs on /__rsc: these are the headers LocaleWebProxy gives a page load of this URL.
    if (targetLocale) {
      rscHeaders.set("x-locale", targetLocale);
      rscHeaders.set("x-path", targetPath);
    }
    const rscReq = new Request(targetUrl, { method: "GET", headers: rscHeaders });
    const result = await this.#rsc.renderWithMeta(rscReq, {
      clientManifest: manifest.clientManifest,
      signal: req.signal,
      clientIp: SignalContext.clientIpOf(req),
      prefetch,
    });
    if (result.type === "redirect") return createRscRedirectResponse(result.location, result.method, result.status);
    if (result.type === "not-found") return createRscNotFoundFallbackResponse();
    if (result.status && result.status >= 500) return context.rscErrorResponse("__rsc", "Internal Server Error");
    const response = await createRscNavigationStreamResponse(result, { explain: !context.prodMode });
    const dictionaryUrl = context.dictionaryUrlOf(rscHeaders, targetUrl.pathname);
    if (dictionaryUrl) response.headers.set(AKAN_RSC_DICTIONARY_HEADER, dictionaryUrl);
    return response;
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
}
