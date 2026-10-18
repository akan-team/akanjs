import { describe, expect, test } from "bun:test";
import { AkanCodeCompaction } from "./AkanCodeCompaction";
import { AkanCodeServices } from "./AkanCodeServices";

const big = { provider: "deepseek", id: "deepseek-flash", contextWindow: 1_000_000 };
const small = { provider: "openai", id: "small", contextWindow: 128_000 };

describe("AkanCodeCompaction", () => {
  test("a percent is a share of the window, never closer to the edge than the reply's floor", () => {
    expect(AkanCodeCompaction.thresholdOf(1_000_000, 60)).toBe(600_000);
    expect(AkanCodeCompaction.thresholdOf(128_000, 90)).toBe(128_000 - AkanCodeCompaction.reserveFloor);
    expect(AkanCodeCompaction.thresholdOf(1_000_000, undefined)).toBe(1_000_000 - AkanCodeCompaction.reserveFloor);
  });

  test("only steps of 10 are taken, and 100 is the default rather than a choice", () => {
    expect(AkanCodeCompaction.normalize(60)).toBe(60);
    expect(AkanCodeCompaction.normalize(100)).toBeUndefined();
    expect(AkanCodeCompaction.normalize(undefined)).toBeUndefined();
    for (const wrong of [0, 55, 110, Number.NaN]) expect(() => AkanCodeCompaction.normalize(wrong)).toThrow();
  });

  test("the engine reads the share back as this model's reserve and leaves other models at the floor", () => {
    const settings = AkanCodeServices.settings();
    AkanCodeCompaction.apply(settings, big, 60);
    expect(settings.getCompactionSettings(big).reserveTokens).toBe(400_000);
    expect(settings.getCompactionSettings(small).reserveTokens).toBe(AkanCodeCompaction.reserveFloor);
    AkanCodeCompaction.apply(settings, big, undefined);
    expect(settings.getCompactionSettings(big).reserveTokens).toBe(AkanCodeCompaction.reserveFloor);
  });

  test("a share under the turns every compaction keeps is refused, since each turn would compact again", () => {
    expect(AkanCodeCompaction.problemOf(big, 10, 20_000)).toBeUndefined();
    expect(AkanCodeCompaction.problemOf(small, 10, 20_000)).toContain("every turn would compact again");
    expect(AkanCodeCompaction.problemOf({ ...small, contextWindow: 0 }, 50, 20_000)).toContain("no context window");
  });
});
