import { type AkanRequestStore, createRequestStore } from "akanjs/fetch";
import { SignalContext } from "../signal/signalContext";
import type { MergedManifest, ModulePreloadPlan } from "./artifact";
import { encodedBodyResponse } from "./contentEncoding";
import { isCrawlerUserAgent } from "./crawler";
import { HMR_CLIENT_SCRIPT } from "./hmr/clientScript";
import type { CsrDevShell } from "./hmr/csrDevShell";
import { SsrDevShim } from "./hmr/ssrDevShim";
import type { HtmlResultCache } from "./htmlResultCache";
import type { RscRedirectStatus, RscRenderResult, RscWorker } from "./rscWorkerHost";
import { SessionRefresh } from "./sessionRefresh";
import { SsrFromRscRenderer } from "./ssrFromRscRenderer";
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
    let answer: Response | "not-found";
    try {
      answer = await this.#render(req, url);
    } catch (err) {
      return this.#context.errorPageResponse(req, url.pathname, err);
    }
    return answer === "not-found" ? this.#context.notFoundPageResponse(req, url) : answer;
  }

  async #render(req: Request, url: URL): Promise<Response | "not-found"> {
    const context = this.#context;
    context.stats.fullSsr += 1;
    await SessionRefresh.apply(req);
    const manifest = await context.ensureRoute(url);
    const isCrawler = isCrawlerUserAgent(req.headers.get("user-agent"));
    const htmlCacheDecision = this.#htmlCache.entryFor(req, url, isCrawler);
    const htmlCacheEntry = htmlCacheDecision.entry;
    const cachedHtml = htmlCacheEntry ? this.#htmlCache.get(htmlCacheEntry.key) : null;
    if (cachedHtml) {
      const cachedHeaders = context.htmlResponseHeaders(200, req);
      cachedHeaders.set("X-Akan-Cache", "HIT");
      return encodedBodyResponse(req, cachedHtml, { headers: cachedHeaders });
    }
    const rscResult = await this.#rsc.renderWithMeta(req, {
      clientManifest: manifest.clientManifest,
      signal: req.signal,
      clientIp: SignalContext.clientIpOf(req),
    });
    if (rscResult.type === "redirect") return createDocumentRedirectResponse(rscResult.location, url, rscResult.status);
    if (rscResult.type === "not-found") return "not-found";
    const hostRequestStore = createRequestStore(req);
    const htmlStream = await this.#renderHtml(req, url, { rscResult, manifest, isCrawler, hostRequestStore });
    //? A not-found or redirect the page raised after the stream started is known here only if the host still held the
    //? response (a blocking or crawler render, or one raised before the shell was ready); then it is a real one.
    const lateControl = await Promise.race([rscResult.lateControl, Promise.resolve(null)]);
    if (lateControl?.type === "redirect") {
      cancelStreamForHeadResponse(htmlStream, "redirected before the response started");
      return createDocumentRedirectResponse(lateControl.location, url, lateControl.status);
    }
    const responseStatus = lateControl?.type === "not-found" ? 404 : (rscResult.status ?? 200);
    const responseHeaders = context.htmlResponseHeaders(responseStatus, req);
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

  async #renderHtml(req: Request, url: URL, input: HtmlRenderInput): Promise<ReadableStream<Uint8Array>> {
    const { rscResult, manifest, isCrawler, hostRequestStore } = input;
    const { artifact, prodMode } = this.#context;
    // First-paint data-theme: cookie is no longer a React <html> prop (RSC cache would replay it).
    const cookieTheme = WebRouteContext.cookieValue(req, "theme");
    const dictionaryUrl = this.#context.dictionaryUrlOf(req.headers, url.pathname);
    const extraBootstrapInline = [
      rscResult.trace?.routeState
        ? `self.__AKAN_RSC_INITIAL_STATE__=${JSON.stringify(rscResult.trace.routeState)};`
        : "",
      dictionaryUrl ? `self.__AKAN_DICT_URL__=${JSON.stringify(dictionaryUrl)};` : "",
      `self.__AKAN_IMPORT_MAP_KEY__=${JSON.stringify(this.#importMapKey)};`,
      this.#ssrDevShell
        ? SsrDevShim.script(await this.#ssrDevShell.readManifest(), Object.keys(artifact.vendorMap))
        : "",
      !prodMode ? HMR_CLIENT_SCRIPT : "",
    ]
      .filter(Boolean)
      .join("\n");
    return await new SsrFromRscRenderer().render({
      request: req,
      requestStore: hostRequestStore,
      rscStream: rscResult.stream,
      ssrManifest: manifest.ssrManifest,
      bootstrapModules: [artifact.rscClientUrl],
      modulePreloads: dictionaryUrl ? [dictionaryUrl] : undefined,
      modulePreloadPlan: this.#modulePreloadPlan,
      extraBootstrapInline: extraBootstrapInline || undefined,
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
