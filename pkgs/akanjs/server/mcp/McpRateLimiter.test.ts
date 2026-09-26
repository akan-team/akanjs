import { describe, expect, test } from "bun:test";
import { McpRateLimiter, type McpSharedCounter } from "./McpRateLimiter";

// The app's cache as the limiter reaches it: one counter every instance increments.
const makeCounter = () => {
  const counts = new Map<string, number>();
  return {
    counts,
    incr: async (topic: string, key: string, by = 1) => {
      const next = (counts.get(`${topic}:${key}`) ?? 0) + by;
      counts.set(`${topic}:${key}`, next);
      return next;
    },
  } satisfies McpSharedCounter & { counts: Map<string, number> };
};

describe("McpRateLimiter", () => {
  test("counts calls per caller inside a fixed window and says when the window ends", async () => {
    const limiter = new McpRateLimiter({ calls: 2, windowMs: 10_000, concurrent: 0 });
    const first = await limiter.acquire("a", 1_000);
    const second = await limiter.acquire("a", 2_000);
    expect(first.ok && second.ok).toBe(true);
    const third = await limiter.acquire("a", 3_000);
    expect(third).toEqual({ ok: false, reason: "calls", retryAfterMs: 8_000 });
    // Another caller has a budget of its own.
    expect((await limiter.acquire("b", 3_000)).ok).toBe(true);
    // The window is fixed from the first call, so at its end the same caller starts over.
    expect((await limiter.acquire("a", 11_000)).ok).toBe(true);
  });

  test("caps calls in flight and frees a slot exactly once", async () => {
    const limiter = new McpRateLimiter({ calls: 0, windowMs: 60_000, concurrent: 1 });
    const held = await limiter.acquire("a");
    if (!held.ok) throw new Error("expected a slot");
    expect(await limiter.acquire("a")).toMatchObject({ ok: false, reason: "concurrent" });
    held.release();
    held.release();
    const next = await limiter.acquire("a");
    expect(next.ok).toBe(true);
    expect(await limiter.acquire("a")).toMatchObject({ ok: false, reason: "concurrent" });
  });

  test("a slot held across the window boundary is still counted as in flight", async () => {
    const limiter = new McpRateLimiter({ calls: 5, windowMs: 1_000, concurrent: 1 });
    const held = await limiter.acquire("a", 0);
    expect(held.ok).toBe(true);
    expect(await limiter.acquire("a", 5_000)).toMatchObject({ ok: false, reason: "concurrent" });
  });

  test("[R-1] instances sharing the cache draw on one budget", async () => {
    const counter = makeCounter();
    const [one, two] = [0, 1].map(() => new McpRateLimiter({ calls: 2, windowMs: 10_000, concurrent: 0 }, counter));
    expect((await one.acquire("a", 1_000)).ok).toBe(true);
    expect((await two.acquire("a", 2_000)).ok).toBe(true);
    expect(await two.acquire("a", 3_000)).toEqual({ ok: false, reason: "calls", retryAfterMs: 7_000 });
    expect(await one.acquire("a", 4_000)).toMatchObject({ ok: false, reason: "calls" });
    // Windows are aligned to the epoch, so the next one opens at 10s for every instance alike.
    expect((await one.acquire("a", 10_000)).ok).toBe(true);
  });

  test("a refused window does not hold on to the in-flight slot it reserved", async () => {
    const limiter = new McpRateLimiter({ calls: 1, windowMs: 10_000, concurrent: 1 }, makeCounter());
    const held = await limiter.acquire("a", 0);
    if (!held.ok) throw new Error("expected a slot");
    held.release();
    expect(await limiter.acquire("a", 1)).toMatchObject({ ok: false, reason: "calls" });
    // Had the refused call kept its reservation, this one would be turned away as a second call in flight.
    expect(await limiter.acquire("a", 2)).toMatchObject({ ok: false, reason: "calls" });
  });

  test("counts in this process when the cache fails, rather than refusing every call", async () => {
    const failing: McpSharedCounter = {
      incr: async () => {
        throw new Error("cache down");
      },
    };
    const limiter = new McpRateLimiter({ calls: 1, windowMs: 10_000, concurrent: 0 }, failing);
    expect((await limiter.acquire("a", 0)).ok).toBe(true);
    expect(await limiter.acquire("a", 1)).toMatchObject({ ok: false, reason: "calls" });
  });

  test("describes itself for the boot log", () => {
    expect(new McpRateLimiter().describe()).toBe("120 calls / 60s, 8 in flight, per caller");
    expect(new McpRateLimiter({ calls: 0, concurrent: 0 }).describe()).toBe(
      "unlimited calls, unlimited in flight, per caller",
    );
    expect(new McpRateLimiter({}, makeCounter()).describe()).toBe(
      "120 calls / 60s across instances, 8 in flight per instance, per caller",
    );
  });
});
