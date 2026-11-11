import { type RateCounter, RateLimiter } from "akanjs/service";

export type McpSharedCounter = RateCounter;

export interface McpRateLimitOption {
  /** Per caller per window; `0` turns the counter off. */
  calls?: number;
  windowMs?: number;
  /** Per caller at once; `0` turns the cap off. */
  concurrent?: number;
}

export type McpRateLimitVerdict =
  | { ok: true; release: () => void }
  | { ok: false; reason: "calls" | "concurrent"; retryAfterMs: number };

// In-flight stays per process even with the app's cache: a crashed process never returns its slot.
export class McpRateLimiter {
  static readonly defaults = { calls: 120, windowMs: 60_000, concurrent: 8 } as const;

  readonly calls: number;
  readonly windowMs: number;
  readonly concurrent: number;
  readonly #limiter: RateLimiter;
  readonly #inFlight = new Map<string, number>();

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
    this.#limiter = new RateLimiter(shared, { topic: "mcpRate" });
  }

  static fromEnv(): { rateLimit?: McpRateLimitOption | false } {
    const raw = process.env.AKAN_MCP_RATE_LIMIT?.trim().toLowerCase();
    if (raw === "off" || raw === "false" || raw === "0") return { rateLimit: false };
    const option: McpRateLimitOption = {};
    if (raw) {
      const [calls, seconds] = raw.split("/").map((part) => Number(part));
      if (Number.isInteger(calls) && calls > 0) option.calls = calls;
      if (Number.isInteger(seconds) && seconds > 0) option.windowMs = seconds * 1000;
    }
    const concurrent = Number(process.env.AKAN_MCP_CONCURRENT);
    if (Number.isInteger(concurrent) && concurrent >= 0) option.concurrent = concurrent;
    return Object.keys(option).length ? { rateLimit: option } : {};
  }

  async acquire(key: string, now = Date.now()): Promise<McpRateLimitVerdict> {
    const held = this.#inFlight.get(key) ?? 0;
    if (this.concurrent && held >= this.concurrent) return { ok: false, reason: "concurrent", retryAfterMs: 1_000 };
    // Held before the count is awaited, so calls arriving together cannot all pass the in-flight check.
    this.#inFlight.set(key, held + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const left = (this.#inFlight.get(key) ?? 1) - 1;
      if (left > 0) this.#inFlight.set(key, left);
      else this.#inFlight.delete(key);
    };
    if (!this.calls) return { ok: true, release };
    const verdict = await this.#limiter.consume(key, { calls: this.calls, windowMs: this.windowMs }, now);
    if (verdict.ok) return { ok: true, release };
    release();
    return { ok: false, reason: "calls", retryAfterMs: verdict.retryAfterMs };
  }

  describe() {
    const shared = this.#limiter.isShared;
    const window = this.calls
      ? `${this.calls} calls / ${Math.round(this.windowMs / 1000)}s${shared ? " across instances" : ""}`
      : "unlimited calls";
    const inFlight = this.concurrent
      ? `${this.concurrent} in flight${shared ? " per instance" : ""}`
      : "unlimited in flight";
    return `${window}, ${inFlight}, per caller`;
  }
}
