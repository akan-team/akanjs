import { describe, expect, test } from "bun:test";
import { shuffle } from "./shuffle";

describe("shuffle", () => {
  test("returns a permutation and leaves the input untouched", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(input);
  });

  test("puts each element in each position about equally often", () => {
    const rounds = 30_000;
    const firstCounts = [0, 0, 0];
    for (let round = 0; round < rounds; round += 1) firstCounts[shuffle([0, 1, 2])[0] ?? 0] += 1;
    for (const count of firstCounts) expect(Math.abs(count / rounds - 1 / 3)).toBeLessThan(0.02);
  });
});
