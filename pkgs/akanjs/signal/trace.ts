import { AsyncLocalStorage } from "node:async_hooks";
import { timingSafeEqual } from "node:crypto";
import {
  type LogAttrs,
  type LogFlightRecorder,
  Logger,
  type LogRecord,
  logSeverity,
  registerLogContextReader,
  round,
} from "akanjs/common";

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

// `x-akan-debug` lowers one request's log floor to `trace`; outside `local` it must carry `AKAN_LOG_DEBUG_HEADER`,
// since a client that can lower the log level is a log-volume vector.
export const isDebugHeaderAllowed = (): boolean =>
  process.env.AKAN_PUBLIC_ENV === "local" || !!process.env.AKAN_LOG_DEBUG_HEADER;

const refreshLoggerContextGate = () => {
  Logger.contextGate = isFlightRecorderEnabled() || isDebugHeaderAllowed();
};

export interface SpanRecord {
  name: string;
  durationMs: number;
}

export type TraceMode = "context" | "full";
export type TraceOrigin = "http" | "websocket" | "mcp" | "internal" | "page";
export type TraceOutcome = "ok" | "error";

const MAX_SPANS_PER_TRACE = 64;
const FLIGHT_RING_SIZE = 64;
const CANONICAL_ERROR_CHARS = 200;

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
  readonly mode: TraceMode;
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
  readonly #startedAtEpoch: number;
  #traceId: string | null = null;

  constructor(
    endpointKey: string,
    endpointType: string,
    { mode = "full", origin = "http" }: { mode?: TraceMode; origin?: TraceOrigin } = {},
  ) {
    this.endpointKey = endpointKey;
    this.endpointType = endpointType;
    this.mode = mode;
    this.origin = origin;
    this.startedAt = performance.now();
    this.#startedAtEpoch = Date.now();
  }

  // Spelled on first read: most calls log nothing, and the two base-36 conversions cost a tenth of a bare call.
  get traceId(): string {
    this.#traceId ??= `${this.#startedAtEpoch.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return this.#traceId;
  }

  /** `null` when both modes are off. */
  static create(endpointKey: string, endpointType: string, origin: TraceOrigin): SignalTrace | null {
    const trace = isTraceEnabled()
      ? new SignalTrace(endpointKey, endpointType, { mode: "full", origin })
      : isLogContextEnabled()
        ? new SignalTrace(endpointKey, endpointType, { mode: "context", origin })
        : null;
    if (trace && isFlightRecorderEnabled()) trace.startFlightRecorder();
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
    const allowed =
      process.env.AKAN_PUBLIC_ENV === "local" ||
      (!!secret && value.length === secret.length && timingSafeEqual(Buffer.from(value), Buffer.from(secret)));
    if (!allowed) return false;
    this.debugSev = logSeverity.trace;
    return true;
  }

  setAttr(key: string, value: LogAttrs[string]): void {
    this.attrs[key] = value;
  }

  recordSpan(name: string, durationMs: number): void {
    if (this.mode !== "full" || this.spans.length >= MAX_SPANS_PER_TRACE) return;
    this.spans.push({ name, durationMs });
  }

  countDbQuery(durationMs: number): void {
    if (this.mode !== "full") return;
    this.dbQueryCount += 1;
    this.dbQueryMs += durationMs;
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
    this.outcome = "error";
    this.error = error;
    const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
    this.status = typeof statusCode === "number" ? statusCode : 500;
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
    this.recordSpan("total", totalMs);
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
    if (failed) attrs.err = SignalTrace.#describeError(this.error);
    Logger.emit({
      level: failed ? "warn" : "info",
      name: "Signal",
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
  __akanTraceAggregator?: TraceAggregator;
};

traceProcessStore.__akanTraceAls ??= new AsyncLocalStorage<SignalTrace>();
const als = traceProcessStore.__akanTraceAls;

export const getCurrentTrace = (): SignalTrace | undefined => als.getStore();

export const runWithTrace = <T>(trace: SignalTrace, fn: () => T): T => als.run(trace, fn);

/** Finalizes `trace` after the caller's own catch has run, which is what lets an error log carry the traceId. */
export const runTraced = async <T>(trace: SignalTrace | null, fn: () => Promise<T>): Promise<T> => {
  if (!trace) return await fn();
  return await als.run(trace, async () => {
    try {
      return await fn();
    } catch (error) {
      trace.fail(error);
      throw error;
    } finally {
      trace.finalize();
    }
  });
};

registerLogContextReader(() => {
  const trace = als.getStore();
  if (!trace) return undefined;
  return {
    traceId: trace.traceId,
    endpoint: trace.endpoint,
    origin: trace.origin,
    flight: trace.flight,
    debugSev: trace.debugSev,
  };
});
refreshLoggerContextGate();

export const traceSpan = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
  const trace = getCurrentTrace();
  if (trace?.mode !== "full") return await fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    trace.recordSpan(name, performance.now() - start);
  }
};

export const traceDbQuery = (durationMs: number): void => {
  getCurrentTrace()?.countDbQuery(durationMs);
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
