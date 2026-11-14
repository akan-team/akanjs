import { AkanError } from "akanjs/base";
import { hostFromRequest, Logger } from "akanjs/common";
import { TraceContext } from "../common/TraceContext";
import { BrowserError, type BrowserErrorData, type BrowserErrorKind } from "../signal/browserError";
import { ErrorReporting } from "../signal/errorReporting";
import { RequestTrace } from "../signal/requestTrace";
import { SignalContext } from "../signal/signalContext";
import { ClientReport } from "./hmr/clientReport";
import { AppInfo } from "./ops/appInfo";
import { FailureLimiter } from "./ops/failureLimiter";
import type { HttpRoutes } from "./types";

export interface ClientReportSetting {
  /** The share of page views, from 0 to 1, whose browser sends its errors, drawn from the page view's request id. */
  sampleRate?: number;
  /** Reports one address may send a minute. */
  perAddress?: number;
  /** Reports one server takes a minute from every address together. */
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
}

export class ClientErrorReport {
  static readonly path = "/_akan/client-report";
  static readonly timingName = "akan-report";
  static readonly maxBodyBytes = 8_192;
  static readonly fieldLimits = { name: 100, message: 1_000, stack: 4_000, userAgent: 300 } as const;
  static readonly #kinds: ReadonlySet<string> = new Set<BrowserErrorKind>([
    "uncaught",
    "caught",
    "recoverable",
    "error",
    "rejection",
  ]);
  static readonly #routeIdShape = /^\/[\p{L}\p{N}_\-.:*~@+()[\]/]{0,255}$/u;
  static readonly #digestShape = /^[\w-]{1,64}$/;
  //? Inline code names the page's own URL in a stack, and its query string or fragment can carry a token.
  static readonly #urlQuery = /(https?:\/\/[^\s?#)]+)[?#][^\s)]*?((?::\d+){0,2})(?=[\s)]|$)/g;
  //? Only a page no cache may hand on unasked names its request id: a stored copy would give it to the next visitor.
  static readonly #uncachedPage = /\b(?:no-store|no-cache|private)\b/i;
  static #setting: Required<ClientReportSetting> | null = null;
  static #perAddress = new FailureLimiter({ limit: 10 });
  static #perServer = new FailureLimiter({ limit: 120 });

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
    return `${ClientErrorReport.timingName};desc=${traceId}`;
  }

  static async handle(req: Request): Promise<Response> {
    await ClientErrorReport.#take(req).catch(() => undefined);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }

  static async #take(req: Request) {
    if (!ClientErrorReport.#setting || req.method !== "POST" || !ClientErrorReport.#sameOrigin(req)) return;
    if (req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "text/plain") return;
    const address = SignalContext.clientIpOf(req);
    if (ClientErrorReport.#perAddress.blocked(address) || ClientErrorReport.#perServer.blocked("server")) return;
    ClientErrorReport.#perAddress.fail(address);
    ClientErrorReport.#perServer.fail("server");
    const text = await ClientErrorReport.#read(req);
    const report = text === null ? null : ClientErrorReport.#parse(text, req);
    if (!report) return;
    const { data, traceId } = report;
    Logger.emit({
      level: "error",
      name: "ClientErrorReport",
      message: `Browser error (${data.kind}) on ${data.routeId ?? "an unknown route"}: ${data.name}: ${data.message}`,
      attrs: { kind: data.kind, routeId: data.routeId, pageRequestId: traceId, buildId: data.buildId },
    });
    ErrorReporting.report(new BrowserError(data), {
      source: "client",
      traceId,
      routeId: data.routeId,
      digest: data.digest,
    });
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

  static #parse(text: string, req: Request): { data: BrowserErrorData; traceId: string } | null {
    let body: ClientReportBody | null;
    try {
      body = JSON.parse(text) as ClientReportBody | null;
    } catch {
      return null;
    }
    if (!body || typeof body !== "object") return null;
    const traceId = typeof body.requestId === "string" ? TraceContext.parseId(body.requestId) : null;
    if (!traceId || !ClientErrorReport.#sampled(traceId)) return null;
    if (typeof body.kind !== "string" || !ClientErrorReport.#kinds.has(body.kind)) return null;
    const { name, message, stack, userAgent } = ClientErrorReport.fieldLimits;
    const agent = req.headers.get("user-agent");
    return {
      traceId,
      data: {
        kind: body.kind as BrowserErrorKind,
        name: ClientErrorReport.#scrub(body.name, name, false) || "Error",
        message: ClientErrorReport.#scrub(body.message, message, false),
        stack: ClientErrorReport.#scrub(body.stack, stack, true) || null,
        routeId:
          typeof body.routeId === "string" && ClientErrorReport.#routeIdShape.test(body.routeId) ? body.routeId : null,
        digest:
          typeof body.digest === "string" && ClientErrorReport.#digestShape.test(body.digest) ? body.digest : null,
        buildId: AppInfo.build().buildId,
        userAgent: agent ? ClientReport.line(agent, userAgent) : null,
      },
    };
  }

  static #scrub(value: unknown, limit: number, multiline: boolean): string {
    if (typeof value !== "string") return "";
    const text = value.replace(ClientErrorReport.#urlQuery, "$1$2");
    return multiline ? ClientReport.clean(text, limit) : ClientReport.line(text, limit);
  }
}
