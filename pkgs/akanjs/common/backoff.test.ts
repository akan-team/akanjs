import { describe, expect, test } from "bun:test";
import { Backoff } from "./backoff";

describe("Backoff", () => {
  test("waits twice as long after each failed attempt, cut at random, up to the max", () => {
    expect([1, 2, 3, 6, 9].map((attempt) => Backoff.delay(attempt, { jitter: 0 }))).toEqual([
      1_000, 2_000, 4_000, 30_000, 30_000,
    ]);
    for (let idx = 0; idx < 50; idx++) {
      const delay = Backoff.delay(3, { min: 100, max: 1_000, jitter: 0.5 });
      expect(delay).toBeGreaterThanOrEqual(200);
      expect(delay).toBeLessThanOrEqual(400);
    }
  });
});
