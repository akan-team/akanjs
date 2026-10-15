import { describe, expect, test } from "bun:test";
import { weightedPick } from "./weightedPick";

describe("weightedPick", () => {
  test("never picks an item whose weight is zero", () => {
    for (let round = 0; round < 500; round += 1) expect(weightedPick(["a", "b", "c"], [0, 1, 0])).toBe("b");
  });

  test("follows the weights", () => {
    const rounds = 20_000;
    let aNum = 0;
    for (let round = 0; round < rounds; round += 1) if (weightedPick(["a", "b"], [3, 1]) === "a") aNum += 1;
    expect(Math.abs(aNum / rounds - 0.75)).toBeLessThan(0.02);
  });

  test("answers undefined instead of throwing for input it cannot pick from", () => {
    expect(weightedPick(["a", "b"], [0, 0])).toBe(undefined);
    expect(weightedPick([], [])).toBe(undefined);
    expect(weightedPick(["a", "b"], [1])).toBe(undefined);
  });
});
