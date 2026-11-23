import { type AkanRequestStore, createRequestStore, SCRIPT_NONCE_HEADER } from "akanjs/fetch";
import { SignalContext } from "../signal/signalContext";
import type { MergedManifest, ModulePreloadPlan } from "./artifact";
import { encodedBodyResponse } from "./contentEncoding";
import { isCrawlerUserAgent } from "./crawler";
import { HMR_CLIENT_SCRIPT } from "./hmr/clientScript";
import type { CsrDevShell } from "./hmr/csrDevShell";
import { SsrDevShim } from "./hmr/ssrDevShim";
import type { HtmlResultCache } from "./htmlResultCache";
import { PageCall } from "./metrics/requestMetrics";
import { PageFailure } from "./pageFailure";
import type { RscRedirectStatus, RscRenderResult, RscWorker } from "./rscWorkerHost";
import { MAX_RESPONSE_SCRIPT_HASHES, ScriptPolicy, type ScriptPolicySources } from "./scriptPolicy";
import { SessionRefresh } from "./sessionRefresh";
import { SsrFromRscRenderer } from "./ssrFromRscRenderer";
import { SsrInlineScripts } from "./ssrInlineScripts";
import { WebRouteContext } from "./webRouteContext";

type RscStreamResult = Extract<RscRenderResult, { type: "stream" }>;

interface WebDocumentRouteOptions {
  rsc: RscWorker;
  importMapKey: string;
  ssrDevShell: CsrDevShell | null;
  htmlCache: HtmlResultCache;
  modulePreloadPlan?: ModulePreloadPlan;
}

interface HtmlRenderInput {
  rscResult: RscStreamResult;
  manifest: MergedManifest;
  isCrawler: boolean;
  hostRequestStore: AkanRequestStore;
  nonce: string;
}

// A render's redirect follows the request's cookies, so no cache between here and the browser may keep it.
//? `req.url` names the host this server was dialed as, not the one a tunnel or proxy caller used, so a same-origin
//? target goes out relative. A path starting `//` stays absolute: relative, a browser would read it as a host.
function createDocumentRedirectResponse(location: string, requestUrl: URL, status: RscRedirectStatus): Response {
  const target = new URL(location, requestUrl.origin);
  const sameOrigin = target.origin === requestUrl.origin && !target.pathname.startsWith("//");
  const href = sameOrigin ? `${target.pathname}${target.search}${target.hash}` : target.href;
  return new Response(null, { status, headers: { Location: href, "Cache-Control": "no-store" } });
}

//? React reports a cancel's reason as an error of every boundary still pending; an AbortError is the one the renderer
//? does not log as a failed render.
export function cancelStreamForHeadResponse(stream: ReadableStream<Uint8Array>, message: string): void {
  void stream.cancel(new DOMException(message, "AbortError")).catch(() => {
    // Best-effort: upstream may already be closed by the time HEAD handling runs.
  });
}

export class WebDocumentRoute {
  readonly #context: WebRouteContext;
  readonly #rsc: RscWorker;
  readonly #importMapKey: string;
  readonly #ssrDevShell: CsrDevShell | null;
  readonly #htmlCache: HtmlResultCache;
  readonly #modulePreloadPlan?: ModulePreloadPlan;

  constructor(context: WebRouteContext, options: WebDocumentRouteOptions) {
    this.#context = context;
    this.#rsc = options.rsc;
    this.#importMapKey = options.importMapKey;
    this.#ssrDevShell = options.ssrDevShell;
    this.#htmlCache = options.htmlCache;
    this.#modulePreloadPlan = options.modulePreloadPlan;
  }

  async render(req: Request, url: URL): Promise<Response> {
    const page = new PageCall();
    let answer: Response | "not-found";
    try {
      answer = await this.#render(req, url, page);
    } catch (err) {
      return page.finish(await this.#context.errorPageResponse(req, url.pathname, err, page.route));
    }
    return page.finish(answer === "not-found" ? await this.#context.notFoundPageResponse(req, url) : answer);
  }

  async #render(req: Request, url: URL, page: PageCall): Promise<Response | "not-found"> {
    const context = this.#context;
    context.stats.fullSsr += 1;
    await SessionRefresh.apply(req);
    const manifest = await context.ensureRoute(url, page);
    const isCrawler = isCrawlerUserAgent(req.headers.get("user-agent"));
    const htmlCacheDecision = this.#htmlCache.entryFor(req, url, isCrawler);
    const htmlCacheEntry = htmlCacheDecision.entry;
    const cachedHtml = htmlCacheEntry ? this.#htmlCache.get(htmlCacheEntry) : null;
    if (cachedHtml) {
      const cachedHeaders = context.htmlResponseHeaders(200, req, { hashes: cachedHtml.scriptHashes });
      cachedHeaders.set("X-Akan-Cache", "HIT");
      return encodedBodyResponse(req, cachedHtml.body, { headers: cachedHeaders });
    }
    const nonce = ScriptPolicy.createNonce();
    const renderReq = WebDocumentRoute.#withScriptNonce(req, nonce);
    const rscResult = await this.#rsc.renderWithMeta(renderReq, {
      clientManifest: manifest.clientManifest,
      signal: req.signal,
      clientIp: SignalContext.clientIpOf(req),
    });
    if (rscResult.type === "redirect") return createDocumentRedirectResponse(rscResult.location, url, rscResult.status);
    if (rscResult.type === "not-found") return "not-found";
    const hostRequestStore = createRequestStore(renderReq);
    const scripts = this.#scriptSources(nonce, page.route, rscResult.trace?.scriptHashes);
    const htmlStream = await this.#renderHtml(req, url, { rscResult, manifest, isCrawler, hostRequestStore, nonce });
    //? A not-found or redirect the page raised after the stream started is known here only if the host still held the
    //? response (a blocking or crawler render, or one raised before the shell was ready); then it is a real one.
    const lateControl = await Promise.race([rscResult.lateControl, Promise.resolve(null)]);
    if (lateControl?.type === "redirect") {
      cancelStreamForHeadResponse(htmlStream, "redirected before the response started");
      return createDocumentRedirectResponse(lateControl.location, url, lateControl.status);
    }
    const responseStatus = lateControl?.type === "not-found" ? 404 : (rscResult.status ?? 200);
    const responseHeaders = context.htmlResponseHeaders(responseStatus, req, scripts);
    if (req.method === "HEAD") {
      const headers = new Headers(responseHeaders);
      if (htmlCacheEntry && responseStatus === 200) headers.set("X-Akan-Cache", "MISS");
      else if (htmlCacheDecision.reason) {
        headers.set("X-Akan-Cache", "BYPASS");
        headers.set("X-Akan-Cache-Reason", htmlCacheDecision.reason);
      }
      cancelStreamForHeadResponse(htmlStream, "HEAD response does not consume body");
      return new Response(null, { status: responseStatus, headers });
    }
    if (htmlCacheEntry && responseStatus === 200) {
      const headers = new Headers(responseHeaders);
      headers.set("X-Akan-Cache", "MISS");
      const body = this.#htmlCache.storeWhileStreaming(htmlStream, {
        entry: htmlCacheEntry,
        pathname: url.pathname,
        lateControl: rscResult.lateControl,
        cacheState: rscResult.cacheState,
        hostRequestStore,
        logger: context.logger,
        scripts,
      });
      return new Response(body, {
        status: responseStatus,
        headers,
      });
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
  }

  //? The worker reads only the request's line and headers, and a page's head reads the nonce as one of them
  //? (`scriptNonce()`); set, never appended, so a header of that name off the wire is not what a page gets.
  static #withScriptNonce(req: Request, nonce: string): Request {
    const headers = new Headers(req.headers);
    headers.set(SCRIPT_NONCE_HEADER, nonce);
    return new Request(req.url, { method: req.method, headers });
  }

  #scriptSources(nonce: string, route: string, declared: string[] = []): ScriptPolicySources {
    const own = SsrInlineScripts.policyHashes(this.#context.artifact.vendorMap);
    const added = declared.flatMap((hash) => ScriptPolicy.hashSource(hash) ?? []);
    const hashes = [...new Set([...own, ...added])];
    if (hashes.length > MAX_RESPONSE_SCRIPT_HASHES && ScriptPolicy.firstReport("declared", route))
      this.#context.logger.warn(
        `script policy: route ${route} names ${hashes.length} script hashes and a response names ` +
          `${MAX_RESPONSE_SCRIPT_HASHES}, so its last ${hashes.length - MAX_RESPONSE_SCRIPT_HASHES} are left out and ` +
          "the browser refuses the scripts they name",
      );
    return { nonce, hashes: hashes.slice(0, MAX_RESPONSE_SCRIPT_HASHES) };
  }

  async #renderHtml(req: Request, url: URL, input: HtmlRenderInput): Promise<ReadableStream<Uint8Array>> {
    const { rscResult, manifest, isCrawler, hostRequestStore, nonce } = input;
    const { artifact, prodMode } = this.#context;
    // First-paint data-theme: cookie is no longer a React <html> prop (RSC cache would replay it).
    const cookieTheme = WebRouteContext.cookieValue(req, "theme");
    const dictionaryUrls = this.#context.dictionaryUrlsOf(req.headers, url.pathname, rscResult.trace?.routeId);
    const devBootstrapInline = [
      this.#ssrDevShell
        ? SsrDevShim.script(await this.#ssrDevShell.readManifest(), Object.keys(artifact.vendorMap))
        : "",
      !prodMode ? HMR_CLIENT_SCRIPT : "",
    ]
      .filter(Boolean)
      .join("\n");
    PageFailure.routed(req, rscResult.trace?.routeId);
    return await new SsrFromRscRenderer().render({
      request: req,
      requestStore: hostRequestStore,
      rscStream: rscResult.stream,
      ssrManifest: manifest.ssrManifest,
      bootstrapModules: [artifact.rscClientUrl],
      modulePreloads: dictionaryUrls.length ? dictionaryUrls : undefined,
      modulePreloadPlan: this.#modulePreloadPlan,
      bootstrapData: {
        routeState: rscResult.trace?.routeState,
        dictionaryUrl: dictionaryUrls.join(",") || undefined,
        importMapKey: this.#importMapKey,
      },
      devBootstrapInline: devBootstrapInline || undefined,
      nonce,
      importmap: artifact.vendorMap,
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
  }
}
