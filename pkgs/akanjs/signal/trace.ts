import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  type LogAttrs,
  type LogFlightRecorder,
  Logger,
  type LogRecord,
  logSeverity,
  registerLogContextReader,
  round,
} from "akanjs/common";
import { markFailureLogged } from "../common/loggedFailure";
import { TraceContext } from "../common/TraceContext";
import { RequestTrace, type TraceParentRef } from "./requestTrace";
import { SignalFailure } from "./SignalFailure";
import { SpanExport } from "./spanExport";

let traceEnabledCache: boolean | null = null;
let logContextEnabledCache: boolean | null = null;

export const isTraceEnabled = (): boolean => (traceEnabledCache ??= process.env.AKAN_TRACE === "1");

export const setTraceEnabled = (enabled: boolean): void => {
  traceEnabledCache = enabled;
};

export const isLogContextEnabled = (): boolean =>
  (logContextEnabledCache ??= !(process.env.AKAN_LOG_CONTEXT === "0" || process.env.AKAN_LOG_CONTEXT === "false"));

export const setLogContextEnabled = (enabled: boolean): void => {
  logContextEnabledCache = enabled;
};

export type CanonicalLineMode = "off" | "all" | "slow";

const isOn = (value: string | undefined) => value === "1" || value === "true";

let canonicalModeCache: CanonicalLineMode | null = null;
/** `AKAN_LOG_CANONICAL`: `1`/`all` writes one line per call, `slow` only for a failed or over-threshold call. */
export const getCanonicalLineMode = (): CanonicalLineMode => {
  if (canonicalModeCache === null) {
    const value = process.env.AKAN_LOG_CANONICAL;
    canonicalModeCache = value === "slow" ? "slow" : isOn(value) || value === "all" ? "all" : "off";
  }
  return canonicalModeCache;
};
export const setCanonicalLineMode = (mode: CanonicalLineMode): void => {
  canonicalModeCache = mode;
};

let flightEnabledCache: boolean | null = null;
export const isFlightRecorderEnabled = (): boolean => (flightEnabledCache ??= isOn(process.env.AKAN_LOG_FLIGHT));
export const setFlightRecorderEnabled = (enabled: boolean): void => {
  flightEnabledCache = enabled;
  refreshLoggerContextGate();
};

let flightThresholdCache: number | null = null;
/** `AKAN_LOG_FLIGHT_MS`: a call at least this long is "slow" for both the recorder and the `slow` canonical mode. */
export const getFlightThresholdMs = (): number => {
  if (flightThresholdCache === null) {
    const value = Number(process.env.AKAN_LOG_FLIGHT_MS);
    flightThresholdCache = Number.isFinite(value) && value > 0 ? value : 1_000;
  }
  return flightThresholdCache;
};
export const setFlightThresholdMs = (ms: number): void => {
  flightThresholdCache = ms;
};

//* `AKAN_PUBLIC_ENV=local` can be baked into an image, so NODE_ENV=production or a non-local mode closes dev surfaces.
export const isLocalDevRuntime = ({
  environment = process.env.AKAN_PUBLIC_ENV,
  operationMode = process.env.AKAN_PUBLIC_OPERATION_MODE ?? "local",
}: {
  environment?: string;
  operationMode?: string;
} = {}): boolean =>
  environment === "local" &&
  operationMode === "local" &&
  (process.env.NODE_ENV !== "production" || process.env.AKAN_COMMAND_TYPE === "start");

let localTimingCache: boolean | null = null;
const isLocalTimingRuntime = (): boolean => (localTimingCache ??= isLocalDevRuntime());
export const setLocalServerTiming = (enabled: boolean | null): void => {
  localTimingCache = enabled;
};

// `x-akan-debug` lowers one request's log floor to `trace`; outside `local` it must carry `AKAN_LOG_DEBUG_HEADER`,
// since a client that can lower the log level is a log-volume vector.
const isDebugHeaderAllowed = (): boolean => isLocalDevRuntime() || !!process.env.AKAN_LOG_DEBUG_HEADER;

//? Digests have one length, so neither a length check nor a multi-byte header value can make the comparison throw.
export const sameSecret = (presented: string, secret: string): boolean =>
  timingSafeEqual(createHash("sha256").update(presented).digest(), createHash("sha256").update(secret).digest());

const refreshLoggerContextGate = () => {
  Logger.contextGate = isFlightRecorderEnabled() || isDebugHeaderAllowed();
};

export interface SpanRecord {
  id: string;
  /** The span open around this one, else the call's own span; for that one, the caller's. */
  parentId: string | null;
  name: string;
  /** From the start of the call. */
  startMs: number;
  durationMs: number;
  attrs?: LogAttrs;
}

interface OpenSpan {
  trace: SignalTrace;
  id: string;
}

export type TraceMode = "context" | "full";
export type TraceOrigin = "http" | "websocket" | "mcp" | "internal" | "page";
export type TraceOutcome = "ok" | "error";

const MAX_SPANS_PER_TRACE = 64;
const SERVER_TIMING_ENTRIES = 32;
const FLIGHT_RING_SIZE = 64;
const CANONICAL_ERROR_CHARS = 200;

const requestLineName = "Signal";

export const isRequestLine = (record: LogRecord): boolean =>
  record.name === requestLineName && typeof record.attrs?.status === "number";

//? A page's `redirect()` and `notFound()` arrive as throws, but the host answers them with a 3xx and a 404.
const routeControlStatus = (error: unknown): number | null => {
  const { digest, status } = (error ?? {}) as { digest?: unknown; status?: unknown };
  if (digest === "AKAN_NOT_FOUND") return 404;
  if (typeof digest !== "string" || !digest.startsWith("AKAN_REDIRECT")) return null;
  return typeof status === "number" ? status : 307;
};

interface FlightEntry {
  record: LogRecord;
  written: boolean;
}

export class SignalTrace {
  /** Total captured records the process holds at once (`AKAN_LOG_FLIGHT_MAX`); a call past it runs unrecorded. */
  static readonly defaultFlightMaxRecords = 65_536;
  static #activeFlights = 0;
  static #flightMaxTraces: number | null = null;

  readonly endpointKey: string;
  readonly endpointType: string;
  readonly origin: TraceOrigin;
  mode: TraceMode;
  readonly startedAt: number;
  readonly spans: SpanRecord[] = [];
  readonly attrs: LogAttrs = {};
  dbQueryCount = 0;
  dbQueryMs = 0;
  cacheHits = 0;
  cacheMisses = 0;
  dataLoaderBatchCount = 0;
  dataLoaderKeyCount = 0;
  outcome: TraceOutcome | null = null;
  status: number | null = null;
  error: unknown = null;
  debugSev: number | null = null;
  flight: LogFlightRecorder | null = null;
  #flightRing: FlightEntry[] | null = null;
  #flightEvicted = 0;
  #finalized = false;
  readonly #aggregated: boolean;
  /** An id this call was handed but did not take: an untrusted caller's, or the trace that enqueued a job. */
  link: string | null;
  /** Head-sampled for the OTLP exporter: its spans are recorded and sent once it finalizes. */
  exported = false;
  readonly #parent: TraceParentRef | null;
  #traceId: string | null = null;
  #spanId: string | null = null;

  constructor(
    endpointKey: string,
    endpointType: string,
    {
      mode = "full",
      origin = "http",
      parent = null,
    }: { mode?: TraceMode; origin?: TraceOrigin; parent?: TraceParentRef | null } = {},
  ) {
    this.endpointKey = endpointKey;
    this.endpointType = endpointType;
    this.mode = mode;
    this.origin = origin;
    this.startedAt = performance.now();
    this.#aggregated = mode === "full";
    this.#parent = parent;
    this.link = parent?.link ?? null;
  }

  get traceId(): string {
    this.#traceId ??= this.#parent?.traceId ?? TraceContext.mintTraceId();
    return this.#traceId;
  }

  get spanId(): string {
    this.#spanId ??= TraceContext.mintSpanId();
    return this.#spanId;
  }

  get parentSpanId(): string | null {
    return this.#parent?.spanId ?? null;
  }

  get sampled(): boolean {
    return this.exported || (this.#parent?.sampled ?? false);
  }

  get traceparent(): string {
    return TraceContext.traceparentOf(this.traceId, this.spanId, this.sampled);
  }

  /** `null` when both modes are off. */
  //? A job or a schedule takes no ambient parent: its timer may have been started while a request was being answered.
  static create(
    endpointKey: string,
    endpointType: string,
    origin: TraceOrigin,
    parent?: TraceParentRef | null,
  ): SignalTrace | null {
    const mode = isTraceEnabled() ? "full" : isLogContextEnabled() ? "context" : null;
    const sink = SpanExport.sink;
    if (!mode && !sink) return null;
    const opener =
      parent !== undefined ? parent : origin === "internal" ? null : (als.getStore() ?? RequestTrace.current() ?? null);
    const trace = new SignalTrace(endpointKey, endpointType, { mode: mode ?? "context", origin, parent: opener });
    //? Set after construction, so a sampled call records spans without joining the `AKAN_TRACE` aggregate.
    if (sink) trace.exported = opener ? opener.sampled === true : sink.sample(trace.traceId, null);
    if (trace.exported) trace.mode = "full";
    else if (!mode) return null;
    if (isFlightRecorderEnabled()) trace.startFlightRecorder();
    return trace;
  }

  static get activeFlights() {
    return SignalTrace.#activeFlights;
  }

  static #flightMaxTracesFromEnv() {
    if (SignalTrace.#flightMaxTraces === null) {
      const value = Number(process.env.AKAN_LOG_FLIGHT_MAX);
      const max = Number.isFinite(value) && value > 0 ? value : SignalTrace.defaultFlightMaxRecords;
      SignalTrace.#flightMaxTraces = Math.max(1, Math.floor(max / FLIGHT_RING_SIZE));
    }
    return SignalTrace.#flightMaxTraces;
  }

  get endpoint() {
    return `${this.endpointType}:${this.endpointKey}`;
  }

  startFlightRecorder(): boolean {
    if (this.#flightRing || this.#finalized) return !!this.#flightRing;
    if (SignalTrace.#activeFlights >= SignalTrace.#flightMaxTracesFromEnv()) return false;
    SignalTrace.#activeFlights += 1;
    this.#flightRing = [];
    this.flight = { minSev: logSeverity.trace, capture: (record, written) => this.#capture(record, written) };
    return true;
  }

  /** Honours `x-akan-debug` for this call when the deployment allows it; anything else is ignored, not refused. */
  applyDebugHeader(value: string | null | undefined): boolean {
    if (!value) return false;
    const secret = process.env.AKAN_LOG_DEBUG_HEADER;
    const allowed = isLocalDevRuntime() || (!!secret && sameSecret(value, secret));
    if (!allowed) return false;
    this.debugSev = logSeverity.trace;
    this.mode = "full";
    return true;
  }

  //? Security: timings name models and spans, so only a local runtime or a call whose `x-akan-debug` passed sees them.
  get exposesTiming(): boolean {
    return this.debugSev !== null || isLocalTimingRuntime();
  }

  writeServerTiming(response: Response): void {
    try {
      response.headers.set("Server-Timing", this.serverTiming());
    } catch {
      // A fetched Response's headers are immutable, and a debugging aid is not worth a copy of the body.
    }
  }

  //? Security: names are the app's identifiers, yet anything outside a header token is replaced before it is sent.
  serverTiming(): string {
    const token = (text: string) => text.replace(/[^A-Za-z0-9_.-]/g, "_");
    const dur = (ms: number) => Math.round(ms * 10) / 10;
    const total = this.spans.find((span) => span.id === this.#spanId);
    const rest = this.spans.filter((span) => span !== total).sort((a, b) => a.startMs - b.startMs);
    const entries = rest.slice(0, SERVER_TIMING_ENTRIES - 1).map((span) => {
      const { model, op } = span.attrs ?? {};
      if (typeof model !== "string" || typeof op !== "string") return `${token(span.name)};dur=${dur(span.durationMs)}`;
      return `db;desc="${token(model)}.${token(op)}";dur=${dur(span.durationMs)}`;
    });
    return [`total;dur=${dur(total?.durationMs ?? performance.now() - this.startedAt)}`, ...entries].join(", ");
  }

  setAttr(key: string, value: LogAttrs[string]): void {
    this.attrs[key] = value;
  }

  recordSpan(name: string, durationMs: number, attrs?: LogAttrs): void {
    if (this.mode !== "full" || this.spans.length >= MAX_SPANS_PER_TRACE) return;
    const id = TraceContext.mintSpanId();
    const startMs = Math.max(0, performance.now() - this.startedAt - durationMs);
    this.spans.push({ id, parentId: this.#openSpanId(), name, startMs, durationMs, ...(attrs ? { attrs } : {}) });
  }

  #openSpanId(): string {
    const open = spanAls.getStore();
    return open?.trace === this ? open.id : this.spanId;
  }

  async span<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const id = TraceContext.mintSpanId();
    const parentId = this.#openSpanId();
    const startedAt = performance.now();
    try {
      return await spanAls.run({ trace: this, id }, fn);
    } finally {
      if (this.spans.length < MAX_SPANS_PER_TRACE) {
        const startMs = startedAt - this.startedAt;
        this.spans.push({ id, parentId, name, startMs, durationMs: performance.now() - startedAt });
      }
    }
  }

  countDbQuery(durationMs: number): void {
    if (this.mode !== "full") return;
    this.dbQueryCount += 1;
    this.dbQueryMs += durationMs;
  }

  recordDbQuery(model: string, op: string, durationMs: number): void {
    this.countDbQuery(durationMs);
    this.recordSpan(`db:${model}.${op}`, durationMs, { model, op });
  }

  countCache(hit: boolean): void {
    if (this.mode !== "full") return;
    if (hit) this.cacheHits += 1;
    else this.cacheMisses += 1;
  }

  countDataLoaderBatch(keyCount: number): void {
    if (this.mode !== "full") return;
    this.dataLoaderBatchCount += 1;
    this.dataLoaderKeyCount += keyCount;
  }

  fail(error: unknown): void {
    this.error = error;
    this.status = (this.origin === "page" ? routeControlStatus(error) : null) ?? SignalFailure.statusOf(error);
    this.outcome = this.status < 400 ? "ok" : "error";
  }

  finalize(): void {
    if (this.#finalized) return;
    this.#finalized = true;
    this.outcome ??= "ok";
    this.status ??= 200;
    const totalMs = performance.now() - this.startedAt;
    // The narrative first, then its summary, so a `--trace <id>` reads in the order things happened.
    this.#flushFlight(totalMs);
    this.#emitCanonicalLine(totalMs);
    if (this.mode !== "full") return;
    this.spans.push({ id: this.spanId, parentId: this.parentSpanId, name: "total", startMs: 0, durationMs: totalMs });
    if (this.exported) SpanExport.exportTrace(this);
    if (!this.#aggregated) return;
    traceAggregator.ingest(this);
    maybeFlushTraceFile();
  }

  #capture(record: LogRecord, written: boolean) {
    const ring = this.#flightRing;
    if (!ring || this.#finalized) return;
    if (ring.length >= FLIGHT_RING_SIZE) {
      ring.shift();
      this.#flightEvicted += 1;
    }
    ring.push({ record, written });
  }

  #flushFlight(totalMs: number) {
    const ring = this.#flightRing;
    if (!ring) return;
    this.#flightRing = null;
    this.flight = null;
    SignalTrace.#activeFlights -= 1;
    if (this.outcome !== "error" && totalMs < getFlightThresholdMs()) return;
    const pending = ring.filter((entry) => !entry.written).map((entry) => entry.record);
    if (pending.length) Logger.replay(pending, { evicted: this.#flightEvicted });
  }

  #emitCanonicalLine(totalMs: number) {
    const mode = getCanonicalLineMode();
    if (mode === "off") return;
    const failed = this.outcome === "error";
    if (mode === "slow" && !failed && totalMs < getFlightThresholdMs()) return;
    const attrs: LogAttrs = { ms: Math.round(totalMs * 10) / 10, status: this.status ?? 200, ...this.attrs };
    if (this.mode === "full") {
      attrs.db = this.dbQueryCount;
      attrs.dbMs = Math.round(this.dbQueryMs * 10) / 10;
      const lookups = this.cacheHits + this.cacheMisses;
      if (lookups) attrs.cacheHit = Math.round((this.cacheHits / lookups) * 100) / 100;
    }
    if (this.link) attrs.link = this.link;
    const crashed = failed && (this.status ?? 200) >= 500;
    if (failed) attrs.err = SignalTrace.#describeError(this.error);
    if (crashed) {
      Object.assign(attrs, SignalFailure.logAttrs(this.error));
      markFailureLogged(this.error);
    }
    Logger.emit({
      level: crashed ? "error" : failed ? "warn" : "info",
      name: requestLineName,
      message: `${this.outcome} ${this.endpoint}`,
      attrs,
    });
  }

  static #describeError(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    const line = text.split("\n")[0] ?? "";
    return line.length > CANONICAL_ERROR_CHARS ? `${line.slice(0, CANONICAL_ERROR_CHARS)}…` : line;
  }
}

// Pinned to `process`: the app bundle and the framework runtime may load in separate realms and bundle chunks, and
// `process` is the one object they share, so the ALS and the aggregator stay single instances.
const traceProcessStore = process as unknown as {
  __akanTraceAls?: AsyncLocalStorage<SignalTrace>;
  __akanSpanAls?: AsyncLocalStorage<OpenSpan>;
  __akanTraceAggregator?: TraceAggregator;
};

traceProcessStore.__akanTraceAls ??= new AsyncLocalStorage<SignalTrace>();
const als = traceProcessStore.__akanTraceAls;
traceProcessStore.__akanSpanAls ??= new AsyncLocalStorage<OpenSpan>();
const spanAls = traceProcessStore.__akanSpanAls;

export const getCurrentTrace = (): SignalTrace | undefined => als.getStore();

interface CrashLine {
  name: string;
  label: string;
  error: unknown;
  status: number;
}
//? A failed call always writes its canonical line when the mode is on, so a 5xx is told there and only there.
export const logCrash = (trace: SignalTrace | null, { name, label, error, status }: CrashLine): void => {
  if (trace && getCanonicalLineMode() !== "off") return;
  const message = (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "";
  Logger.emit({
    level: "error",
    name,
    message: `Error ${label}: ${message}`,
    attrs: { status, ...SignalFailure.logAttrs(error) },
  });
};

/** Finalizes `trace` after the caller's own catch has run, which is what lets an error log carry the traceId. */
export const runTraced = async <T>(trace: SignalTrace | null, fn: () => Promise<T>): Promise<T> => {
  if (!trace) return await fn();
  return await als.run(trace, async () => {
    let result: T;
    try {
      result = await fn();
    } catch (error) {
      trace.fail(error);
      throw error;
    } finally {
      trace.finalize();
    }
    if (result instanceof Response && trace.exposesTiming) trace.writeServerTiming(result);
    return result;
  });
};

registerLogContextReader(() => {
  const trace = als.getStore();
  if (!trace) return RequestTrace.current()?.logContext;
  return {
    traceId: trace.traceId,
    endpoint: trace.endpoint,
    origin: trace.origin,
    link: trace.link,
    flight: trace.flight,
    debugSev: trace.debugSev,
  };
});
refreshLoggerContextGate();
TraceContext.registerOutboundReader(() => (als.getStore() ?? RequestTrace.current())?.traceparent);

export const traceSpan = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
  const trace = getCurrentTrace();
  if (trace?.mode !== "full") return await fn();
  return await trace.span(name, fn);
};

export const traceCache = (hit: boolean): void => {
  getCurrentTrace()?.countCache(hit);
};

export const traceDataLoaderBatch = (keyCount: number): void => {
  getCurrentTrace()?.countDataLoaderBatch(keyCount);
};

interface SpanStat {
  count: number;
  sumMs: number;
  maxMs: number;
  samples: number[];
}

interface EndpointStat {
  endpointKey: string;
  endpointType: string;
  requests: number;
  spans: Map<string, SpanStat>;
  dbQueryCount: number;
  dbQueryMs: number;
  cacheHits: number;
  cacheMisses: number;
  dataLoaderBatchCount: number;
  dataLoaderKeyCount: number;
}

const RING_SIZE = 1024;

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? 0;
};

class TraceAggregator {
  #endpoints = new Map<string, EndpointStat>();

  ingest(trace: SignalTrace): void {
    const id = `${trace.endpointType}:${trace.endpointKey}`;
    let stat = this.#endpoints.get(id);
    if (!stat) {
      stat = {
        endpointKey: trace.endpointKey,
        endpointType: trace.endpointType,
        requests: 0,
        spans: new Map(),
        dbQueryCount: 0,
        dbQueryMs: 0,
        cacheHits: 0,
        cacheMisses: 0,
        dataLoaderBatchCount: 0,
        dataLoaderKeyCount: 0,
      };
      this.#endpoints.set(id, stat);
    }
    stat.requests += 1;
    stat.dbQueryCount += trace.dbQueryCount;
    stat.dbQueryMs += trace.dbQueryMs;
    stat.cacheHits += trace.cacheHits;
    stat.cacheMisses += trace.cacheMisses;
    stat.dataLoaderBatchCount += trace.dataLoaderBatchCount;
    stat.dataLoaderKeyCount += trace.dataLoaderKeyCount;
    for (const span of trace.spans) {
      let spanStat = stat.spans.get(span.name);
      if (!spanStat) {
        spanStat = { count: 0, sumMs: 0, maxMs: 0, samples: [] };
        stat.spans.set(span.name, spanStat);
      }
      spanStat.count += 1;
      spanStat.sumMs += span.durationMs;
      spanStat.maxMs = Math.max(spanStat.maxMs, span.durationMs);
      if (spanStat.samples.length < RING_SIZE) spanStat.samples.push(span.durationMs);
      else spanStat.samples[spanStat.count % RING_SIZE] = span.durationMs;
    }
  }

  reset(): void {
    this.#endpoints.clear();
  }

  snapshot() {
    const endpoints = [...this.#endpoints.values()].map((stat) => {
      const spans = [...stat.spans.entries()].map(([name, s]) => {
        const sorted = [...s.samples].sort((a, b) => a - b);
        return {
          name,
          count: s.count,
          meanMs: round(s.sumMs / s.count),
          p50Ms: round(percentile(sorted, 50)),
          p95Ms: round(percentile(sorted, 95)),
          p99Ms: round(percentile(sorted, 99)),
          maxMs: round(s.maxMs),
        };
      });
      spans.sort((a, b) => b.meanMs - a.meanMs);
      const cacheTotal = stat.cacheHits + stat.cacheMisses;
      return {
        endpoint: `${stat.endpointType}:${stat.endpointKey}`,
        requests: stat.requests,
        avgDbQueriesPerRequest: round(stat.dbQueryCount / stat.requests),
        avgDbQueryMsPerRequest: round(stat.dbQueryMs / stat.requests),
        cacheHitRatio: cacheTotal ? round(stat.cacheHits / cacheTotal, 4) : null,
        avgDataLoaderBatchSize: stat.dataLoaderBatchCount
          ? round(stat.dataLoaderKeyCount / stat.dataLoaderBatchCount)
          : null,
        spans,
      };
    });
    endpoints.sort((a, b) => b.requests - a.requests);
    return { enabled: isTraceEnabled(), endpoints };
  }
}

traceProcessStore.__akanTraceAggregator ??= new TraceAggregator();
export const traceAggregator: TraceAggregator = traceProcessStore.__akanTraceAggregator;

export const getTraceSnapshot = () => traceAggregator.snapshot();

// `AKAN_TRACE_FILE` flushes the snapshot (throttled) for a reader in a realm that cannot reach this aggregator.
const traceFilePath = process.env.AKAN_TRACE_FILE;
let lastTraceFlushAt = 0;
const TRACE_FLUSH_INTERVAL_MS = 1_000;

const maybeFlushTraceFile = (): void => {
  if (!traceFilePath) return;
  const now = Date.now();
  if (now - lastTraceFlushAt < TRACE_FLUSH_INTERVAL_MS) return;
  lastTraceFlushAt = now;
  void Bun.write(traceFilePath, JSON.stringify(traceAggregator.snapshot())).catch(() => {});
};
