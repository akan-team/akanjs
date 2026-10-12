import { describe, expect, test } from "bun:test";
import { BullQueue } from "./queue.adaptor";
import { QueueBackoff } from "./queueBackoff";

describe("QueueBackoff", () => {
  test("doubles an exponential delay per attempt up to maxDelay, and leaves a fixed one alone", () => {
    const exponential = { type: "exponential", delay: 1_000, maxDelay: 5_000 };
    expect([1, 2, 3, 4, 5].map((attempt) => QueueBackoff.delayOf(exponential, attempt))).toEqual([
      1_000, 2_000, 4_000, 5_000, 5_000,
    ]);
    expect(QueueBackoff.delayOf({ type: "exponential", delay: 1_000 }, 11)).toBe(1_024_000);
    expect(QueueBackoff.delayOf({ delay: 750 }, 9)).toBe(750);
    expect(QueueBackoff.delayOf(300, 4)).toBe(300);
    expect(QueueBackoff.delayOf(undefined, 4)).toBe(0);
  });

  test("bullmq reads the same capped schedule from the type a capped backoff travels in", () => {
    expect(BullQueue.cappedBackoff(4, "akan:exponential:1000:5000")).toBe(5_000);
    expect(BullQueue.cappedBackoff(2, "akan:exponential:1000:5000")).toBe(2_000);
    expect(BullQueue.cappedBackoff(2, "custom")).toBe(0);
  });
});
