import { describe, expect, test } from "bun:test";
import { shortenUnit } from "./shortenUnit";

describe("shortenUnit", () => {
  test.each([
    [0, "0"],
    [999, "999"],
    [1500, "1.50k"],
    [9999, "10.0k"],
    [12345, "12.3k"],
    [99_999, "100k"],
    [123_456, "123k"],
    [999_999, "1.00m"],
    [1_234_567, "1.23m"],
    [123_456_789, "123m"],
    [2_500_000_000, "2.50b"],
    [1e12, "1.00t"],
    [1.5e15, "1500t"],
  ])("shortens %d to %s", (num, expected) => {
    expect(shortenUnit(num)).toBe(expected);
  });
});
