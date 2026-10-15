import { describe, expect, test } from "bun:test";
import { formatBytes } from "./formatBytes";

describe("formatBytes", () => {
  test.each([
    [0, "0 B"],
    [512, "512 B"],
    [1023, "1023 B"],
    [1024, "1.00 KB"],
    [1536, "1.50 KB"],
    [5 * 1024 * 1024, "5.00 MB"],
    [3.25 * 1024 ** 3, "3.25 GB"],
    [2 * 1024 ** 5, "2048.00 TB"],
  ])("formats %d bytes as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  test("honours the fraction digits and never reports a negative or non-finite size", () => {
    expect(formatBytes(1536, 0)).toBe("2 KB");
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});
