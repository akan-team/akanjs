import { AkanError } from "akanjs/base";
import { addressBlockOf, hostFromRequest, Logger } from "akanjs/common";
import { ReportText } from "../client/reportText";
import {
  BrowserError,
  type BrowserErrorData,
  type BrowserErrorKind,
  type BrowserErrorShell,
} from "../signal/browserError";
import { CrossSiteGuard } from "../signal/CrossSiteGuard";
import { ErrorReporting } from "../signal/errorReporting";
import { RequestTrace } from "../signal/requestTrace";
import { SignalContext } from "../signal/signalContext";
import { ClientReportId } from "./clientReportId";
import { ClientReport } from "./hmr/clientReport";
import { AppInfo } from "./ops/appInfo";
import { FailureLimiter } from "./ops/failureLimiter";
import type { HttpRoutes } from "./types";

export interface ClientReportSetting {
  /** The share of page views, from 0 to 1, whose browser sends its errors, drawn from the page view's request id. */
  sampleRate?: number;
  /** Requests one address, an IPv6 one counted as its /64, may send the route a minute. */
  perAddress?: number;
  /** Reports one server hands the reporter a minute from every address together. */
  perServer?: number;
}

interface ClientReportBody {
  requestId?: unknown;
  routeId?: unknown;
  kind?: unknown;
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  digest?: unknown;
  shell?: unknown;
}

export class ClientErrorReport {
  static readonly path = "/_akan/client-report";
  static readonly timingName = "akan-report";
  static readonly maxBodyBytes = 8_192;
  static readonly perPageView = 5;
  static readonly fieldLimits = { name: 100, message: 1_000, stack: 4_000, userAgent: 300 } as const;
  static readonly #kinds: ReadonlySet<string> = new Set<BrowserErrorKind>([
    "uncaught",
    "caught",
    "recoverable",
    "error",
    "rejection",
  ]);
  static readonly #shells: ReadonlySet<string> = new Set<BrowserErrorShell>([
    "ios",
    "android",
    "macos",
    "windows",
    "linux",
  ]);
  static readonly #routeIdShape = /^\/[\p{L}\p{N}_\-.:*~@+()[\]/]{0,255}$/u;
  static readonly #digestShape = /^[\w-]{1,64}$/;
  //? Only a page no cache may hand on unasked names its request id: a stored copy would give it to the next visitor.
  static readonly #uncachedPage = /\b(?:no-store|no-cache|private)\b/i;
  static #setting: Required<ClientReportSetting> | null = null;
  static #perAddress = new FailureLimiter({ limit: 10 });
  static #perServer = new FailureLimiter({ limit: 120 });
  static #perPageView = ClientErrorReport.#pageViewCounts();

  static configure(setting: ClientReportSetting | boolean) {
    if (setting === false) {
      ClientErrorReport.#setting = null;
      return;
    }
    const { sampleRate = 1, perAddress = 10, perServer = 120 } = setting === true ? {} : setting;
    if (!(sampleRate >= 0 && sampleRate <= 1))
      throw new AkanError("invalidConfig", `setClientReport's sampleRate must be from 0 to 1, and it is ${sampleRate}`);
    for (const [key, value] of Object.entries({ perAddress, perServer }))
      if (!Number.isInteger(value) || value < 1)
        throw new AkanError("invalidConfig", `setClientReport's ${key} must be a whole number of 1 or more`);
    ClientErrorReport.#setting = { sampleRate, perAddress, perServer };
    ClientErrorReport.#perAddress = new FailureLimiter({ limit: perAddress });
    ClientErrorReport.#perServer = new FailureLimiter({ limit: perServer, maxClients: 1 });
    ClientErrorReport.#perPageView = ClientErrorReport.#pageViewCounts();
  }

  static get enabled(): boolean {
    return ClientErrorReport.#setting !== null;
  }

  static routes(): HttpRoutes {
    if (!ClientErrorReport.#setting) return {};
    return { [ClientErrorReport.path]: (req: Request) => ClientErrorReport.handle(req) };
  }

  static timingEntry(cacheControl: string | null, traceId = RequestTrace.current()?.traceId): string | null {
    if (!traceId || !ClientErrorReport.#sampled(traceId)) return null;
    if (!cacheControl || !ClientErrorReport.#uncachedPage.test(cacheControl)) return null;
    return `${ClientErrorReport.timingName};desc=${ClientReportId.sign(traceId)}`;
  }

  static async handle(req: Request): Promise<Response> {
    const origin = ClientErrorReport.#shellOrigin(req);
    //? Security: allowed by the `Origin` alone, so the header tells nobody whether reports are on or a body was taken.
    const headers = {
      "cache-control": "no-store",
      ...(origin ? { "access-control-allow-origin": origin, vary: "origin" } : {}),
    };
    const requestId = req.method === "GET" ? ClientErrorReport.#issue(req) : null;
    if (requestId)
      return new Response(requestId, {
        status: 200,
        headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
      });
    await ClientErrorReport.#take(req).catch(() => undefined);
    return new Response(null, { status: 204, headers });
  }

  //? Security: a shell's bundled page had no page view to carry an id: it asks, counted per address, and only it reads.
  static #issue(req: Request): string | null {
    if (!ClientErrorReport.#setting || !ClientErrorReport.#shellOrigin(req)) return null;
    const traceId = RequestTrace.current()?.traceId;
    if (!ClientErrorReport.#admitAddress(req) || !traceId || !ClientErrorReport.#sampled(traceId)) return null;
    return ClientReportId.sign(traceId);
  }

  //? Security: cheapest check first, and nothing is counted against the server, cleaned or handed on for a body
  //? whose id this deployment did not sign; the per-address count is the only cost an unsigned body has.
  static async #take(req: Request) {
    if (!ClientErrorReport.#setting || req.method !== "POST") return;
    if (!ClientErrorReport.#sameOrigin(req) && !ClientErrorReport.#shellOrigin(req)) return;
    if (req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "text/plain") return;
    if (!ClientErrorReport.#admitAddress(req)) return;
    const text = await ClientErrorReport.#read(req);
    const body = text === null ? null : ClientErrorReport.#parse(text);
    const traceId = ClientReportId.verify(body?.requestId);
    if (!body || !traceId || typeof body.kind !== "string" || !ClientErrorReport.#kinds.has(body.kind)) return;
    if (ClientErrorReport.#perPageView.blocked(traceId) || ClientErrorReport.#perServer.blocked("server")) return;
    ClientErrorReport.#perPageView.fail(traceId);
    ClientErrorReport.#perServer.fail("server");
    const data = ClientErrorReport.#dataOf(body, body.kind as BrowserErrorKind, req);
    const from = data.shell ? `Native ${data.shell} page error` : "Browser error";
    Logger.emit({
      level: "error",
      name: "ClientErrorReport",
      message: `${from} (${data.kind}) on ${data.routeId ?? "an unknown route"}: ${data.name}: ${data.message}`,
      attrs: {
        kind: data.kind,
        ...(data.shell ? { shell: data.shell } : {}),
        routeId: data.routeId,
        pageRequestId: traceId,
        buildId: data.buildId,
      },
    });
    ErrorReporting.report(new BrowserError(data), {
      source: "client",
      traceId,
      routeId: data.routeId,
      digest: data.digest,
    });
  }

  static #admitAddress(req: Request): boolean {
    const address = SignalContext.clientIpOf(req);
    const block = address ? addressBlockOf(address) : null;
    if (ClientErrorReport.#perAddress.blocked(block)) return false;
    ClientErrorReport.#perAddress.fail(block);
    return true;
  }

  //? Counted for as long as an id is taken, so one page view's id is good for as many reports as its page sends.
  static #pageViewCounts(): FailureLimiter {
    return new FailureLimiter({ limit: ClientErrorReport.perPageView, windowMs: 2 * ClientReportId.bucketMs });
  }

  static #sampled(traceId: string): boolean {
    const rate = ClientErrorReport.#setting?.sampleRate;
    if (rate === undefined || rate <= 0) return false;
    return rate >= 1 || Number.parseInt(traceId.slice(0, 8), 16) / 0x1_0000_0000 < rate;
  }

  static #sameOrigin(req: Request): boolean {
    const site = req.headers.get("sec-fetch-site");
    if (site !== null && site !== "same-origin") return false;
    const origin = req.headers.get("origin");
    if (origin === null) return site !== null;
    try {
      const { protocol, host } = new URL(origin);
      return host === new URL(`${protocol}//${hostFromRequest(req.headers, new URL(req.url))}`).host;
    } catch {
      return false;
    }
  }

  //? Security: no web page can claim a shell's `Origin`, but any non-browser caller can, so a body still needs its id.
  static #shellOrigin(req: Request): string | null {
    const origin = req.headers.get("origin");
    return CrossSiteGuard.nativeOrigins.find((shell) => shell === origin) ?? null;
  }

  static async #read(req: Request): Promise<string | null> {
    if (Number(req.headers.get("content-length") ?? 0) > ClientErrorReport.maxBodyBytes) return null;
    const reader = req.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      bytes += chunk.value.byteLength;
      if (bytes > ClientErrorReport.maxBodyBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  static #parse(text: string): ClientReportBody | null {
    try {
      const body = JSON.parse(text) as ClientReportBody | null;
      return body && typeof body === "object" ? body : null;
    } catch {
      return null;
    }
  }

  static #dataOf(body: ClientReportBody, kind: BrowserErrorKind, req: Request): BrowserErrorData {
    const { name, message, stack, userAgent } = ClientErrorReport.fieldLimits;
    const agent = req.headers.get("user-agent");
    return {
      kind,
      name: ClientErrorReport.#scrub(body.name, name, false) || "Error",
      message: ClientErrorReport.#scrub(body.message, message, false),
      stack: ClientErrorReport.#scrub(body.stack, stack, true) || null,
      routeId:
        typeof body.routeId === "string" && ClientErrorReport.#routeIdShape.test(body.routeId) ? body.routeId : null,
      digest: typeof body.digest === "string" && ClientErrorReport.#digestShape.test(body.digest) ? body.digest : null,
      buildId: AppInfo.build().buildId,
      userAgent: agent ? ClientReport.line(agent, userAgent) : null,
      shell:
        ClientErrorReport.#shellOrigin(req) &&
        typeof body.shell === "string" &&
        ClientErrorReport.#shells.has(body.shell)
          ? (body.shell as BrowserErrorShell)
          : null,
    };
  }

  static #scrub(value: unknown, limit: number, multiline: boolean): string {
    if (typeof value !== "string") return "";
    const text = ReportText.scrub(ClientReport.clean(value, ClientErrorReport.maxBodyBytes));
    return multiline ? text.slice(0, limit) : ClientReport.line(text, limit);
  }
}
