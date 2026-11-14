import type { AdoptedTrace } from "../common/TraceContext";
import { SignalFailure } from "./SignalFailure";
import type { SignalTrace, SpanRecord } from "./trace";

export type ExportAttrs = Record<string, string | number | boolean>;

// OTLP `Span.SpanKind`.
export const spanKind = { internal: 1, server: 2, client: 3 } as const;

export interface ExportSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: number;
  /** `performance.now()` of the process that recorded it. */
  startMs: number;
  endMs: number;
  attrs: ExportAttrs;
  /** A trace id this span was handed and did not continue; no span id travels with it. */
  link: string | null;
  failed: boolean;
  exception: { type: string; message: string } | null;
}

export interface SpanExportSink {
  /** `parentSampled` is `null` for a trace that starts here. */
  sample(traceId: string, parentSampled: boolean | null): boolean;
  enqueue(span: ExportSpan): void;
}

interface ServedTrace {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly link: string | null;
}

// Pinned to `process` like the trace ALS: the worker's app bundle and the framework runtime are separate realms.
const slot = process as unknown as { __akanSpanExport?: SpanExportSink | null };

const httpMethods = new Set(["GET", "HEAD", "POST", "PUT", "DELETE", "CONNECT", "OPTIONS", "TRACE", "PATCH"]);

const exceptionOf = (error: unknown, status: number) => ({
  type: String(SignalFailure.logAttrs(error).type),
  //? Security: the bounded, prose-free code the response body names, never the message, which may quote user input.
  message: SignalFailure.codeOf(error, status),
});

const isDbSpan = (span: SpanRecord) => typeof span.attrs?.model === "string" && typeof span.attrs.op === "string";

export class SpanExport {
  static get sink(): SpanExportSink | null {
    return slot.__akanSpanExport ?? null;
  }

  static install(sink: SpanExportSink | null): void {
    slot.__akanSpanExport = sink;
  }

  //? One decision per trace, at the first hop: a hop inside the app (the gateway's socket) keeps the flag it was sent.
  static headSample(adopted: AdoptedTrace, internalHop: boolean): AdoptedTrace {
    const sink = slot.__akanSpanExport;
    if (!sink || (internalHop && adopted.parentSpanId !== null)) return adopted;
    const sampled = sink.sample(adopted.traceId, adopted.parentSpanId === null ? null : adopted.sampled);
    return sampled === adopted.sampled ? adopted : { ...adopted, sampled };
  }

  static openServerSpan(trace: ServedTrace, req: Request, route: string | null) {
    const sink = slot.__akanSpanExport;
    if (!sink) return null;
    const startMs = performance.now();
    const method = httpMethods.has(req.method) ? req.method : "_OTHER";
    const attrs: ExportAttrs = {
      "http.request.method": method,
      "url.scheme": req.url.startsWith("https:") ? "https" : "http",
      ...(route ? { "http.route": route } : {}),
    };
    const name = `${method === "_OTHER" ? "HTTP" : method}${route ? ` ${route}` : ""}`;
    return (response: Response | undefined, error?: unknown) => {
      const status = response?.status;
      if (status !== undefined) attrs["http.response.status_code"] = status;
      const failed = error !== undefined || (status ?? 0) >= 500;
      const exception = error === undefined ? null : exceptionOf(error, SignalFailure.statusOf(error));
      if (failed) attrs["error.type"] = exception?.type ?? String(status);
      sink.enqueue({
        traceId: trace.traceId,
        spanId: trace.spanId,
        parentSpanId: trace.parentSpanId,
        name,
        kind: spanKind.server,
        startMs,
        endMs: performance.now(),
        attrs,
        link: trace.link,
        failed,
        exception,
      });
    };
  }

  //? `trace.attrs` stays out: it carries the caller's user id, and an attribute must not.
  static exportTrace(trace: SignalTrace): void {
    const sink = slot.__akanSpanExport;
    if (!sink) return;
    const status = trace.status ?? 200;
    const failed = status >= 500;
    const exception = failed && trace.error !== null ? exceptionOf(trace.error, status) : null;
    for (const span of trace.spans) {
      const root = span.id === trace.spanId;
      const db = !root && isDbSpan(span);
      const startMs = trace.startedAt + span.startMs;
      sink.enqueue({
        traceId: trace.traceId,
        spanId: span.id,
        parentSpanId: span.parentId,
        name: root ? trace.endpoint : span.name,
        kind: db ? spanKind.client : spanKind.internal,
        startMs,
        endMs: startMs + span.durationMs,
        attrs: root
          ? {
              "akan.endpoint": trace.endpoint,
              "akan.origin": trace.origin,
              "akan.status": status,
              ...(exception ? { "error.type": exception.type } : {}),
            }
          : db
            ? { "db.collection.name": String(span.attrs?.model), "db.operation.name": String(span.attrs?.op) }
            : {},
        link: root ? trace.link : null,
        failed: root && failed,
        exception: root ? exception : null,
      });
    }
  }
}
