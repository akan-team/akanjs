import { Logger, type LogRecord, logSeverity } from "akanjs/common";
import { isRequestLine } from "../../signal/trace";
import { type LogQuery, LogQueryMatcher } from "./logQuery";
import { LogStdoutWriter } from "./logStdoutWriter";

export interface LogHubEntry {
  /** Assigned here, in arrival order. `record.at` comes from several clocks and is not monotonic across children. */
  seq: number;
  record: LogRecord;
}

export interface LogHubCoverage {
  count: number;
  oldestSeq: number | null;
  newestSeq: number | null;
  from: number | null;
  to: number | null;
}

export interface LogHubOptions {
  maxRecords?: number;
  maxBytes?: number;
  suppressPerSecond?: number;
  now?: () => number;
}

export interface LogSubscribeOptions {
  /** Every record, before repeat suppression: an output that is counted (stdout, a file), not a bounded view. */
  exact?: boolean;
}

interface LogSubscriber {
  id: string;
  matcher: LogQueryMatcher;
  sink: (entry: LogHubEntry) => void;
  exact: boolean;
}

interface SuppressState {
  windowStart: number;
  count: number;
  suppressed: number;
  sample: LogRecord;
}

// Journal of every process this one fronts; owned by the gateway, or by the solo replica when nothing fronts it.
export class LogHub {
  static readonly defaultMaxRecords = 2_000;
  static readonly defaultMaxBytes = 4 * 1024 * 1024;
  static readonly defaultSuppressPerSecond = 20;
  static readonly suppressWindowMs = 1_000;

  readonly #maxRecords: number;
  readonly #maxBytes: number;
  readonly #suppressPerSecond: number;
  readonly #now: () => number;
  readonly #ring: (LogHubEntry | undefined)[];
  #head = 0;
  #size = 0;
  #bytes = 0;
  #seq = 0;
  #nextSubscriberId = 1;
  readonly #subscribers = new Map<string, LogSubscriber>();
  readonly #floorListeners = new Set<(minSev: number | null) => void>();
  #floor: number | null = null;
  readonly #suppress = new Map<string, SuppressState>();
  #suppressTimer: ReturnType<typeof setInterval> | null = null;
  #removeSink: (() => void) | null = null;
  #stdout: LogStdoutWriter | null = null;
  #closed = false;
  static #shared: LogHub | null = null;

  constructor({ maxRecords, maxBytes, suppressPerSecond, now }: LogHubOptions = {}) {
    this.#maxRecords = Math.max(1, maxRecords ?? LogHub.defaultMaxRecords);
    this.#maxBytes = Math.max(1, maxBytes ?? LogHub.defaultMaxBytes);
    this.#suppressPerSecond = Math.max(1, suppressPerSecond ?? LogHub.defaultSuppressPerSecond);
    this.#now = now ?? Date.now;
    this.#ring = new Array<LogHubEntry | undefined>(this.#maxRecords);
  }

  // Attached at entrypoint construction, not at listen: a boot line would be lost or, in ndjson mode, written as text.
  static attach(): LogHub {
    const shared = LogHub.#shared;
    if (shared && !shared.#closed) return shared;
    const records = Number(process.env.AKAN_LOG_BUFFER);
    const mb = Number(process.env.AKAN_LOG_BUFFER_MB);
    const hub = new LogHub({
      maxRecords: Number.isInteger(records) && records > 0 ? records : undefined,
      maxBytes: Number.isFinite(mb) && mb > 0 ? Math.round(mb * 1024 * 1024) : undefined,
    });
    hub.#removeSink = Logger.addSink((entry) => void hub.ingest(entry.record));
    if (Logger.isNdjson) {
      Logger.consoleOutput = false;
      hub.#stdout = new LogStdoutWriter(hub, { minSev: logSeverity[Logger.level] });
    }
    LogHub.#shared = hub;
    return hub;
  }

  get closed() {
    return this.#closed;
  }

  get floor() {
    return this.#floor;
  }
  get size() {
    return this.#size;
  }
  get seq() {
    return this.#seq;
  }

  ingest(record: LogRecord): LogHubEntry | null {
    const kept = record.level === null || isRequestLine(record) || this.#admit(record);
    const entry: LogHubEntry = { seq: ++this.#seq, record };
    this.#deliver(entry, true);
    if (!kept) return null;
    this.#keep(entry);
    return entry;
  }

  ingestMany(records: LogRecord[]) {
    for (const record of records) this.ingest(record);
  }

  subscribe(query: LogQuery, sink: (entry: LogHubEntry) => void, { exact = false }: LogSubscribeOptions = {}) {
    const id = `sub_${this.#nextSubscriberId++}`;
    this.#subscribers.set(id, { id, matcher: new LogQueryMatcher(query), sink, exact });
    this.#refreshFloor();
    return { id, unsubscribe: () => this.unsubscribe(id) };
  }

  unsubscribe(id: string) {
    if (!this.#subscribers.delete(id)) return;
    this.#refreshFloor();
  }

  onFloorChange(listener: (minSev: number | null) => void) {
    this.#floorListeners.add(listener);
  }

  coverage(): LogHubCoverage {
    const oldest = this.#size ? this.#ring[this.#head] : undefined;
    const newest = this.#size ? this.#ring[(this.#head + this.#size - 1) % this.#maxRecords] : undefined;
    return {
      count: this.#size,
      oldestSeq: oldest?.seq ?? null,
      newestSeq: newest?.seq ?? null,
      from: oldest?.record.at ?? null,
      to: newest?.record.at ?? null,
    };
  }

  history(query: LogQuery): { entries: LogHubEntry[]; coverage: LogHubCoverage } {
    const matcher = new LogQueryMatcher(query);
    const entries: LogHubEntry[] = [];
    for (const entry of this.#entries()) if (matcher.matches(entry.record)) entries.push(entry);
    const limited = query.limit && entries.length > query.limit ? entries.slice(entries.length - query.limit) : entries;
    return { entries: limited, coverage: this.coverage() };
  }

  //? A suppressed record holds a seq the ring never kept, so only a ring that starts past `seq` evicted something.
  since(seq: number): { entries: LogHubEntry[]; gap: { from: number; to: number; missed: number } | null } {
    const entries: LogHubEntry[] = [];
    for (const entry of this.#entries()) if (entry.seq > seq) entries.push(entry);
    const oldest = this.#size ? this.#ring[this.#head] : undefined;
    const gap =
      oldest && oldest.seq > seq + 1 ? { from: seq + 1, to: oldest.seq - 1, missed: oldest.seq - seq - 1 } : null;
    return { entries, gap };
  }

  close() {
    this.#closed = true;
    this.#removeSink?.();
    this.#removeSink = null;
    this.#flushSuppressed(true);
    this.#stdout?.close();
    this.#stdout = null;
    if (this.#suppressTimer) clearInterval(this.#suppressTimer);
    this.#suppressTimer = null;
    this.#subscribers.clear();
    this.#floorListeners.clear();
  }

  *#entries(): IterableIterator<LogHubEntry> {
    for (let idx = 0; idx < this.#size; idx += 1) {
      const entry = this.#ring[(this.#head + idx) % this.#maxRecords];
      if (entry) yield entry;
    }
  }

  #keep(entry: LogHubEntry) {
    const bytes = LogHub.estimateBytes(entry.record);
    while (this.#size > 0 && (this.#size >= this.#maxRecords || this.#bytes + bytes > this.#maxBytes)) this.#evict();
    this.#ring[(this.#head + this.#size) % this.#maxRecords] = entry;
    this.#size += 1;
    this.#bytes += bytes;
    this.#deliver(entry, false);
  }

  #deliver(entry: LogHubEntry, exact: boolean) {
    for (const subscriber of this.#subscribers.values()) {
      if (subscriber.exact !== exact || !subscriber.matcher.matches(entry.record)) continue;
      try {
        subscriber.sink(entry);
      } catch {
        // A subscriber is an observer; its failure must not stall the journal or the other subscribers.
      }
    }
  }

  #evict() {
    const entry = this.#ring[this.#head];
    this.#ring[this.#head] = undefined;
    this.#head = (this.#head + 1) % this.#maxRecords;
    this.#size -= 1;
    if (entry) this.#bytes -= LogHub.estimateBytes(entry.record);
  }

  static estimateBytes(record: LogRecord) {
    return record.message.length + record.context.length + record.name.length + 160;
  }

  #admit(record: LogRecord): boolean {
    const key = `${record.name}\0${record.level}\0${record.message}`;
    const now = this.#now();
    const state = this.#suppress.get(key);
    if (!state || now - state.windowStart >= LogHub.suppressWindowMs) {
      if (state?.suppressed) this.#emitSuppressed(state, now);
      this.#suppress.set(key, { windowStart: now, count: 1, suppressed: 0, sample: record });
      this.#ensureSuppressTimer();
      return true;
    }
    state.count += 1;
    if (state.count <= this.#suppressPerSecond) return true;
    state.suppressed += 1;
    return false;
  }

  #emitSuppressed(state: SuppressState, now: number) {
    const { sample, suppressed } = state;
    state.suppressed = 0;
    this.#keep({
      seq: ++this.#seq,
      record: { ...sample, at: now, message: `${sample.message} (suppressed ${suppressed} identical lines within 1s)` },
    });
  }

  #ensureSuppressTimer() {
    if (this.#suppressTimer) return;
    this.#suppressTimer = setInterval(() => this.#flushSuppressed(false), LogHub.suppressWindowMs);
    this.#suppressTimer.unref?.();
  }

  #flushSuppressed(all: boolean) {
    const now = this.#now();
    for (const [key, state] of this.#suppress) {
      const expired = now - state.windowStart >= LogHub.suppressWindowMs;
      if (!all && !expired) continue;
      if (state.suppressed) this.#emitSuppressed(state, now);
      this.#suppress.delete(key);
    }
    if (this.#suppress.size === 0 && this.#suppressTimer) {
      clearInterval(this.#suppressTimer);
      this.#suppressTimer = null;
    }
  }

  #refreshFloor() {
    let floor: number | null = null;
    for (const subscriber of this.#subscribers.values()) {
      const minSev = subscriber.matcher.query.minSev ?? 0;
      floor = floor === null ? minSev : Math.min(floor, minSev);
    }
    if (floor === this.#floor) return;
    this.#floor = floor;
    for (const listener of this.#floorListeners) listener(floor);
  }
}
