import { describe, expect, test } from "bun:test";
import { compareSemver } from "./semver";

describe("compareSemver", () => {
  test("orders plain versions", () => {
    expect(compareSemver("1.4.0", "1.3.13")).toBe(1);
    expect(compareSemver("1.3.13", "1.4.0")).toBe(-1);
    expect(compareSemver("19.2.7", "19.2.7")).toBe(0);
  });

  test("compares the version behind a range operator, not the range", () => {
    expect(compareSemver("^3.1049.0", "^3.721.0")).toBe(1);
    expect(compareSemver("~1.2.0", "^1.10.0")).toBe(-1);
    expect(compareSemver(">=1.3.13", "1.4.0")).toBe(-1);
  });

  test("sorts a prerelease below its release", () => {
    expect(compareSemver("1.0.0-alpha", "1.0.0")).toBe(-1);
    expect(compareSemver("0.0.0-experimental-603e6108-20241029", "0.0.0")).toBe(-1);
  });

  test("falls back to numeric comparison for specs that are not versions", () => {
    expect(compareSemver("workspace:*", "0.0.0")).toBe(0);
    expect(compareSemver("workspace:*", "1.0.0")).toBe(-1);
  });
});
