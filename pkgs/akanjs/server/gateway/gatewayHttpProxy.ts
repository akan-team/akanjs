import path from "node:path";
import type { Logger } from "akanjs/common";
import { isTraceEnabled } from "../../signal/trace";
import { AKAN_CHILD_HOST, makeAkanChildProxyHeaders } from "../akanAppHeaders";
import { type AssetHeaderOptions, assetHeaders, missingAssetResponse } from "../assetHeaders";
import { compressResponse, compressStreamResponse, encodedFileResponse } from "../contentEncoding";
import { ServerLimits } from "../routing/serverLimits";
import { resolveStaticPath } from "../staticPath";
import type { ChildSupervisor } from "./childSupervisor";
import type { ChildState, GatewayChildren } from "./gatewayChildren";
import { GatewayConfig } from "./gatewayConfig";
import type { GatewayStatus } from "./gatewayStatus";
import { GatewayStatusPage } from "./gatewayStatusPage";
import type { GatewayWsData } from "./gatewayWebSocketRelay";

interface GatewayHttpProxyParts {
  config: GatewayConfig;
  children: GatewayChildren;
  supervisor: ChildSupervisor;
  status: GatewayStatus;
  limits: ServerLimits;
  logger: Logger;
}

export class GatewayHttpProxy {
  static readonly #immutableArtifacts = [
    { prefix: "/_akan/client/", root: "client", strip: "/_akan/client/".length, type: "application/javascript" },
    { prefix: "/_akan/styles/", root: "styles", strip: "/_akan/styles/".length, type: "text/css; charset=utf-8" },
    { prefix: "/_akan/fonts/", root: "fonts", strip: "/_akan/fonts/".length, type: "font/woff2", anyOrigin: true },
    { prefix: "/_akan/dict/", root: "dict", strip: "/_akan/dict/".length, type: "text/javascript; charset=utf-8" },
  ] as const;
  //? Older Bun reported every unopenable unix socket as FailedToOpenSocket; 1.4.3 names the errno instead —
  //? ENOENT once `server.stop()` unlinked the file, ECONNREFUSED for a killed listener, ENOTSOCK for a stray file.
  static readonly #upstreamOpenFailureCodes = new Set(["FailedToOpenSocket", "ENOENT", "ECONNREFUSED", "ENOTSOCK"]);

  readonly #config: GatewayConfig;
  readonly #children: GatewayChildren;
  readonly #supervisor: ChildSupervisor;
  readonly #status: GatewayStatus;
  readonly #limits: ServerLimits;
  readonly #logger: Logger;

  constructor({ config, children, supervisor, status, limits, logger }: GatewayHttpProxyParts) {
    this.#config = config;
    this.#children = children;
    this.#supervisor = supervisor;
    this.#status = status;
    this.#limits = limits;
    this.#logger = logger;
  }

  async serveImmutableArtifact(req: Request, url: URL): Promise<Response | null> {
    if (!this.#config.web.ssr) return null;
    const artifact = GatewayHttpProxy.#immutableArtifacts.find(({ prefix }) => url.pathname.startsWith(prefix));
    if (!artifact) return null;
    const filePath = resolveStaticPath(
      path.join(this.#config.artifactDir, artifact.root),
      url.pathname.slice(artifact.strip),
    );
    if (!filePath) return missingAssetResponse();
    const file = Bun.file(filePath);
    if (!(await file.exists())) return missingAssetResponse();
    return this.#fileResponse(req, filePath, {
      contentType: file.type || artifact.type,
      cacheControl: "public, max-age=31536000, immutable",
      anyOrigin: "anyOrigin" in artifact,
    });
  }

  async proxyHttp(req: Request, server: Bun.Server<GatewayWsData>): Promise<Response> {
    const child = await this.#pickReadyFederationChild(req);
    if (child?.upstream?.type !== "unix") return this.#respondWithUnavailable(req);
    // Read once: a concurrent request's failure can clear `child.upstream` while this one awaits the child.
    const { socketPath } = child.upstream;
    const url = new URL(req.url);
    const upstreamUrl = `http://akan-child${url.pathname}${url.search}`;
    const headers = makeAkanChildProxyHeaders(req, child.idx, server.requestIP(req) ?? undefined);
    child.metrics.activeRequests = (child.metrics.activeRequests ?? 0) + 1;
    child.metrics.totalRequests = (child.metrics.totalRequests ?? 0) + 1;
    const traced = isTraceEnabled();
    const hopStart = traced ? performance.now() : 0;
    const chunkedLimit = req.headers.has("content-length") ? null : this.#limits.bodyLimitOf(req);
    try {
      const upstreamRes = await fetch(upstreamUrl, {
        unix: socketPath,
        method: req.method,
        headers,
        body:
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : chunkedLimit !== null && req.body
              ? ServerLimits.limitBody(req.body, chunkedLimit)
              : req.body,
        signal: req.signal,
        redirect: "manual",
        decompress: false,
      });
      return await this.#proxyResponse(req, upstreamRes);
    } catch (error) {
      if (ServerLimits.isPayloadTooLarge(error)) return ServerLimits.payloadTooLarge();
      if (GatewayHttpProxy.#isUpstreamOpenFailure(error)) {
        this.#logger.error(`Child ${child.idx}/${child.role} upstream is unreachable (${socketPath}); restarting`);
        this.#supervisor.scheduleRestart(child, child.proc, "upstream-open-failed");
        return GatewayHttpProxy.#unavailableResponse(req, "Federation child upstream is unreachable; restarting");
      }
      if (req.signal.aborted) return GatewayHttpProxy.#clientClosedResponse();
      if (GatewayHttpProxy.#isUpstreamMidFlightClose(error)) {
        this.#logger.warn(
          `Child ${child.idx}/${child.role} closed the connection mid-request (${req.method} ${new URL(req.url).pathname})`,
        );
        return GatewayHttpProxy.#badGatewayResponse(req);
      }
      throw error;
    } finally {
      child.metrics.activeRequests = Math.max(0, (child.metrics.activeRequests ?? 1) - 1);
      if (traced) this.#status.recordProxyHop(performance.now() - hopStart);
    }
  }

  static #isUpstreamOpenFailure(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const candidate = error as { code?: unknown; message?: unknown };
    if (typeof candidate.code === "string" && GatewayHttpProxy.#upstreamOpenFailureCodes.has(candidate.code))
      return true;
    return String(candidate.message ?? "").includes("FailedToOpenSocket");
  }

  // Child died mid-response: no restart from here, and a rethrow would be a raw 500 blamed on the in-flight URL.
  static #isUpstreamMidFlightClose(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const candidate = error as { code?: unknown; message?: unknown };
    if (candidate.code === "ECONNRESET" || candidate.code === "ConnectionClosed") return true;
    return String(candidate.message ?? "").includes("connection was closed");
  }

  static #clientClosedResponse(): Response {
    return new Response(null, { status: 499, headers: { "cache-control": "no-store" } });
  }

  static #badGatewayResponse(req: Request): Response {
    const detail = "The replica closed the connection before it finished answering.";
    if (req.headers.get("accept")?.includes("text/html")) {
      return new Response(
        GatewayStatusPage.html({
          heading: "Backend dropped the connection",
          detail,
          note: "The replica is restarting — this page reloads itself as soon as it answers.",
        }),
        { status: 502, headers: GatewayStatusPage.headers("text/html; charset=utf-8") },
      );
    }
    return new Response(detail, { status: 502, headers: GatewayStatusPage.headers("text/plain; charset=utf-8") });
  }

  // Waits rather than 503s at once: a restarting replica is back within seconds, but a browser stays on a 503 page.
  async #pickReadyFederationChild(req: Request): Promise<ChildState | null> {
    const ready = this.#children.pickFederationChild();
    if (ready?.upstream) return ready;
    const deadline = performance.now() + this.#config.upstreamWaitMs;
    while (performance.now() < deadline) {
      if (this.#children.stopping || req.signal.aborted || this.#supervisor.crashLoopDetail()) return null;
      await Bun.sleep(50);
      const child = this.#children.pickFederationChild();
      if (child?.upstream) return child;
    }
    return null;
  }

  // Stays a 503 for ingress/CDN; the self-reloading HTML is for browser navigations a bare 503 would strand.
  #respondWithUnavailable(req: Request): Response {
    const crashDetail = this.#supervisor.crashLoopDetail();
    const page = crashDetail
      ? {
          heading: "Backend failed to start",
          detail: crashDetail,
          text: `Backend failed to start after ${GatewayConfig.devMaxChildBootFailures} boot attempts: ${crashDetail}`,
          note: `The dev server stopped retrying after ${GatewayConfig.devMaxChildBootFailures} failed boots. Fix the error and save — this page reloads automatically.`,
        }
      : {
          heading: "Backend is starting",
          detail: "No healthy federation child is ready",
          text: "No healthy federation child is ready",
          note: "A replica is booting or restarting — this page reloads itself as soon as it answers.",
        };
    if (req.headers.get("accept")?.includes("text/html")) {
      return new Response(GatewayStatusPage.html(page), {
        status: 503,
        headers: GatewayStatusPage.headers("text/html; charset=utf-8"),
      });
    }
    return GatewayHttpProxy.#unavailableResponse(req, page.text);
  }

  // JSON callers get the payload `HttpClient` restores into an `Err`; bare text would surface as a JSON parse error.
  static #unavailableResponse(req: Request, detail: string): Response {
    const headers = { "cache-control": "no-store" };
    if (!req.headers.get("accept")?.includes("application/json")) return new Response(detail, { status: 503, headers });
    return Response.json(
      { error: "base.error.serverUnavailable", statusCode: 503, data: { status: 503 }, details: detail },
      { status: 503, headers },
    );
  }

  async #proxyResponse(req: Request, upstreamRes: Response): Promise<Response> {
    const headers = new Headers(upstreamRes.headers);
    this.#rewriteInternalLocation(headers);
    const proxied = new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers,
    });
    // A body the child left unencoded is compressed here: JSON whole, HTML and RSC as they stream.
    return GatewayHttpProxy.#isProxiedJson(headers)
      ? await compressResponse(req, proxied)
      : compressStreamResponse(req, proxied);
  }

  static #isProxiedJson(headers: Headers): boolean {
    return (headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() === "application/json";
  }

  #rewriteInternalLocation(headers: Headers) {
    const location = headers.get("location");
    if (!location) return;
    try {
      const parsed = new URL(location);
      if (parsed.hostname === AKAN_CHILD_HOST)
        headers.set("location", `${parsed.pathname}${parsed.search}${parsed.hash}`);
    } catch {
      // Relative redirects are already safe to pass through.
    }
  }

  async #fileResponse(req: Request, filePath: string, options: AssetHeaderOptions): Promise<Response> {
    return await encodedFileResponse(req, filePath, options.contentType, assetHeaders(options));
  }
}
