import { type Dayjs, dayjs } from "akanjs/base";
import { Logger } from "akanjs/common";

/** The part of the app's cache the window is counted in. */
export interface McpSharedCounter {
  incr(topic: string, key: string, by?: number, option?: { expireAt?: Dayjs }): Promise<number>;
}

export interface McpRateLimitOption {
  /** Calls one caller may make per window. `0` turns the counter off. */
  calls?: number;
  windowMs?: number;
  /** Calls one caller may have running at the same time. `0` turns the cap off. */
  concurrent?: number;
}

export type McpRateLimitVerdict =
  | { ok: true; release: () => void }
  | { ok: false; reason: "calls" | "concurrent"; retryAfterMs: number };

interface McpRateBucket {
  windowStart: number;
  count: number;
  inFlight: number;
}

/**
 * Per-caller budget for the MCP methods that execute an endpoint.
 *
 * Two limits because they stop two different loops. A fixed window of `calls` stops a model that re-reads a list
 * slice as fast as the client lets it; a cap on `concurrent` calls stops one that fans out a ten-second query in
 * parallel, which the window alone would admit until the window filled. Keyed by the caller the router derives.
 *
 * Given the app's cache, the window is counted there — windows aligned to the epoch, so every instance counts into
 * the same one and N instances grant one budget, not N. The in-flight cap stays this process's: a slot a crashed
 * process held would never be handed back. A cache that fails is warned about and the window falls back to this
 * process's count, so an outage loosens the limit rather than refusing every call.
 */
export class McpRateLimiter {
  static readonly defaults = { calls: 120, windowMs: 60_000, concurrent: 8 } as const;
  static readonly #logger = new Logger("McpRateLimiter");

  readonly calls: number;
  readonly windowMs: number;
  readonly concurrent: number;
  readonly #shared: McpSharedCounter | null;
  readonly #buckets = new Map<string, McpRateBucket>();
  #sweptAt = 0;
  #sharedFailed = false;

  constructor(
    {
      calls = McpRateLimiter.defaults.calls,
      windowMs = McpRateLimiter.defaults.windowMs,
      concurrent = McpRateLimiter.defaults.concurrent,
    }: McpRateLimitOption = {},
    shared: McpSharedCounter | null = null,
  ) {
    this.calls = Math.max(0, Math.floor(calls));
    this.windowMs = Math.max(1, Math.floor(windowMs));
    this.concurrent = Math.max(0, Math.floor(concurrent));
    this.#shared = shared;
  }

  async acquire(key: string, now = Date.now()): Promise<McpRateLimitVerdict> {
    this.#sweep(now);
    const bucket = this.#bucketOf(key, now);
    if (this.concurrent && bucket.inFlight >= this.concurrent)
      return { ok: false, reason: "concurrent", retryAfterMs: 1_000 };
    // Held before the count is awaited, so calls arriving together cannot all pass the in-flight check.
    bucket.inFlight += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      bucket.inFlight = Math.max(0, bucket.inFlight - 1);
    };
    const retryAfterMs = this.calls ? await this.#spend(key, bucket, now) : null;
    if (retryAfterMs === null) return { ok: true, release };
    release();
    return { ok: false, reason: "calls", retryAfterMs };
  }

  describe() {
    const across = this.#shared ? " across instances" : "";
    const window = this.calls
      ? `${this.calls} calls / ${Math.round(this.windowMs / 1000)}s${across}`
      : "unlimited calls";
    const inFlight = this.concurrent
      ? `${this.concurrent} in flight${this.#shared ? " per instance" : ""}`
      : "unlimited in flight";
    return `${window}, ${inFlight}, per caller`;
  }

  /** Spends one call of the window: `null` when it fit, otherwise how long until the window ends. */
  async #spend(key: string, bucket: McpRateBucket, now: number): Promise<number | null> {
    if (this.#shared) {
      const window = Math.floor(now / this.windowMs);
      const end = (window + 1) * this.windowMs;
      try {
        const count = await this.#shared.incr("mcpRate", `${key}:${window}`, 1, {
          expireAt: dayjs(end + this.windowMs),
        });
        this.#sharedFailed = false;
        return count > this.calls ? Math.max(1, end - now) : null;
      } catch (error) {
        if (!this.#sharedFailed)
          McpRateLimiter.#logger.warn(
            `MCP rate limit cannot reach the cache, so each instance counts its own window until it can: ${String(error)}`,
          );
        this.#sharedFailed = true;
      }
    }
    if (bucket.count >= this.calls) return Math.max(1, bucket.windowStart + this.windowMs - now);
    bucket.count += 1;
    return null;
  }

  #bucketOf(key: string, now: number) {
    const found = this.#buckets.get(key);
    if (found && now - found.windowStart < this.windowMs) return found;
    const bucket: McpRateBucket = { windowStart: now, count: 0, inFlight: found?.inFlight ?? 0 };
    this.#buckets.set(key, bucket);
    return bucket;
  }

  /** Buckets are dropped once idle for a window, so the map is bounded by the callers of the last window, not ever. */
  #sweep(now: number) {
    if (now - this.#sweptAt < this.windowMs) return;
    this.#sweptAt = now;
    for (const [key, bucket] of this.#buckets)
      if (!bucket.inFlight && now - bucket.windowStart >= this.windowMs) this.#buckets.delete(key);
  }
}
