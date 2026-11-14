import { AsyncLocalStorage } from "node:async_hooks";
import type { Logger } from "akanjs/common";
import type { OtlpSignalConfig } from "./otlpConfig";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface OtlpBatcherStats {
  queued: number;
  exported: number;
  dropped: number;
  failedBatches: number;
}

// OTLP/HTTP: only these, and a connection that failed, are worth a retry; any other status drops the batch.
const retryableStatus = new Set([429, 502, 503, 504]);
const maxInFlight = 2;
const backoffBaseMs = 500;
const backoffCapMs = 5_000;
const failingReportMs = 60_000;
const errorTextChars = 200;
const userAgent = "akanjs-otlp-exporter";

type Outcome = { ok: true; rejected: number; note?: string } | { ok: false; reason: string };

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    (timer as { unref?: () => void }).unref?.();
  });

const retryAfterMs = (header: string | null): number | null => {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
};

class Ring<T> {
  readonly #items: (T | undefined)[];
  #head = 0;
  size = 0;

  constructor(capacity: number) {
    this.#items = new Array<T | undefined>(capacity);
  }

  push(item: T): boolean {
    const capacity = this.#items.length;
    const evicted = this.size === capacity;
    this.#items[(this.#head + this.size) % capacity] = item;
    if (evicted) this.#head = (this.#head + 1) % capacity;
    else this.size += 1;
    return evicted;
  }

  take(count: number): T[] {
    const taken: T[] = [];
    while (taken.length < count && this.size > 0) {
      taken.push(this.#items[this.#head] as T);
      this.#items[this.#head] = undefined;
      this.#head = (this.#head + 1) % this.#items.length;
      this.size -= 1;
    }
    return taken;
  }
}

export class OtlpBatcher<T> {
  readonly #config: OtlpSignalConfig;
  readonly #encode: (items: T[]) => string;
  readonly #logger: Logger;
  readonly #fetch: Fetch;
  readonly #queue: Ring<T>;
  readonly #inFlight = new Set<Promise<void>>();
  //? Captured at boot: a flush a request's push starts runs outside that request, so its fetch joins no trace.
  readonly #detached = AsyncLocalStorage.snapshot();
  #timer: ReturnType<typeof setInterval> | null = null;
  #closed = false;
  #failingSince: number | null = null;
  #lastFailingReport = 0;
  #stats: OtlpBatcherStats = { queued: 0, exported: 0, dropped: 0, failedBatches: 0 };

  constructor(config: OtlpSignalConfig, encode: (items: T[]) => string, logger: Logger, fetchImpl: Fetch = fetch) {
    this.#config = config;
    this.#encode = encode;
    this.#logger = logger;
    this.#fetch = fetchImpl;
    this.#queue = new Ring<T>(config.maxQueue);
  }

  get stats(): OtlpBatcherStats {
    return { ...this.#stats, queued: this.#queue.size };
  }

  start(): void {
    this.#timer ??= setInterval(() => this.flush(), this.#config.delayMs);
    (this.#timer as { unref?: () => void }).unref?.();
  }

  push(item: T): void {
    if (this.#closed) return;
    if (this.#queue.push(item)) this.#stats.dropped += 1;
    if (this.#queue.size >= this.#config.maxBatch && this.#inFlight.size < maxInFlight)
      this.#detached(() => this.flush());
  }

  flush(): void {
    while (this.#queue.size > 0 && this.#inFlight.size < maxInFlight) {
      const batch = this.#queue.take(this.#config.maxBatch);
      const sending: Promise<void> = this.#send(batch, performance.now() + this.#config.timeoutMs, true).finally(() =>
        this.#inFlight.delete(sending),
      );
      this.#inFlight.add(sending);
    }
  }

  //? One pass, no backoff: the process is exiting, and whatever is not sent by `budgetMs` is dropped.
  async shutdown(budgetMs: number): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    this.#closed = true;
    const deadline = performance.now() + budgetMs;
    const finals: Promise<void>[] = [];
    while (this.#queue.size > 0) finals.push(this.#send(this.#queue.take(this.#config.maxBatch), deadline, false));
    const settled = Promise.allSettled([...this.#inFlight, ...finals]);
    await Promise.race([settled, sleep(budgetMs)]);
    if (this.#stats.dropped > 0)
      this.#logger.warn(
        `OTLP ${this.#config.signal} exporter stopped: ${this.#stats.exported} exported, ${this.#stats.dropped} dropped`,
      );
  }

  async #send(batch: T[], deadline: number, retry: boolean): Promise<void> {
    let body: string;
    try {
      body = this.#encode(batch);
    } catch (error) {
      this.#dropBatch(batch.length, `encoding failed: ${error instanceof Error ? error.name : typeof error}`);
      return;
    }
    const outcome = await this.#post(body, deadline, retry);
    if (!outcome.ok) {
      this.#dropBatch(batch.length, outcome.reason);
      return;
    }
    this.#stats.exported += batch.length - outcome.rejected;
    this.#stats.dropped += outcome.rejected;
    if (outcome.rejected > 0)
      this.#logger.warn(
        `OTLP ${this.#config.signal} collector rejected ${outcome.rejected} of ${batch.length}${outcome.note ? `: ${outcome.note}` : ""}`,
      );
    if (this.#failingSince === null) return;
    this.#failingSince = null;
    this.#logger.info(`OTLP ${this.#config.signal} export recovered; ${this.#stats.dropped} dropped so far`);
  }

  async #post(body: string, deadline: number, retry: boolean): Promise<Outcome> {
    for (let attempt = 0; ; attempt += 1) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) return { ok: false, reason: "timed out" };
      let reason: string;
      let waitMs: number | null = null;
      try {
        const response = await this.#fetch(this.#config.url, {
          method: "POST",
          headers: { "user-agent": userAgent, ...this.#config.headers, "content-type": "application/json" },
          body,
          signal: AbortSignal.timeout(remaining),
        });
        if (response.ok) return { ok: true, ...(await OtlpBatcher.#partialSuccess(response)) };
        await response.body?.cancel();
        reason = `status ${response.status}`;
        if (!retryableStatus.has(response.status)) return { ok: false, reason };
        waitMs = retryAfterMs(response.headers.get("retry-after"));
      } catch (error) {
        reason = error instanceof Error && error.name === "TimeoutError" ? "timed out" : "unreachable";
      }
      if (!retry) return { ok: false, reason };
      const backoff = waitMs ?? Math.random() * Math.min(backoffCapMs, backoffBaseMs * 2 ** attempt);
      if (performance.now() + backoff >= deadline) return { ok: false, reason };
      await sleep(backoff);
    }
  }

  //? A 200 may still carry `partialSuccess`, which counts what the collector refused; it is never retried.
  static async #partialSuccess(response: Response): Promise<{ rejected: number; note?: string }> {
    try {
      const text = await response.text();
      if (!text) return { rejected: 0 };
      const partial = (JSON.parse(text) as { partialSuccess?: Record<string, unknown> }).partialSuccess ?? {};
      const rejected = Number(partial.rejectedSpans ?? partial.rejectedLogRecords ?? 0);
      const note = typeof partial.errorMessage === "string" ? partial.errorMessage.slice(0, errorTextChars) : undefined;
      return { rejected: Number.isFinite(rejected) && rejected > 0 ? rejected : 0, ...(note ? { note } : {}) };
    } catch {
      return { rejected: 0 };
    }
  }

  #dropBatch(count: number, reason: string): void {
    this.#stats.dropped += count;
    this.#stats.failedBatches += 1;
    const now = performance.now();
    if (this.#failingSince !== null && now - this.#lastFailingReport < failingReportMs) return;
    this.#lastFailingReport = now;
    const host = new URL(this.#config.url).host;
    const opening = this.#failingSince === null;
    this.#failingSince ??= now;
    this.#logger.warn(
      `OTLP ${this.#config.signal} export to ${host} ${opening ? "failed" : "still failing"} (${reason}): ${this.#stats.dropped} dropped so far, ${this.#queue.size}/${this.#config.maxQueue} queued`,
    );
  }
}
