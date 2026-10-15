import { describe, expect, test } from "bun:test";
import { randomString } from "./randomString";

describe("randomString", () => {
  test.each([0, 1, 6, 11, 12, 13, 24, 36, 100])("returns exactly %d base-36 characters", (length) => {
    for (let round = 0; round < 200; round += 1)
      expect(randomString(length)).toMatch(new RegExp(`^[0-9a-z]{${length}}$`));
  });

  test("defaults to 12 characters and does not repeat itself", () => {
    expect(randomString()).toHaveLength(12);
    expect(new Set(Array.from({ length: 1000 }, () => randomString(12))).size).toBe(1000);
  });

  test("uses every character of the alphabet", () => {
    expect(new Set(randomString(5000)).size).toBe(36);
  });
});
