import { describe, expect, test } from "bun:test";
import { replaceStart } from "./replaceStart";

describe("replaceStart", () => {
  test.each([
    ["", ""],
    ["a", "a"],
    ["abc", "a**"],
    ["aaa", "a**"],
    ["김김", "김*"],
    ["🙂ab", "🙂**"],
  ])("masks %p as %p", (input, expected) => {
    expect(replaceStart(input)).toBe(expected);
  });
});
