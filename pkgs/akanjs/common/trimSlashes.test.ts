import { describe, expect, test } from "bun:test";

import { trimSlashes, trimTrailingSlashes } from ".";

describe("trimSlashes", () => {
  test("strips every leading and trailing slash and keeps inner ones", () => {
    expect(trimSlashes("//a/b//")).toBe("a/b");
    expect(trimSlashes("a")).toBe("a");
    expect(trimSlashes("///")).toBe("");
    expect(trimSlashes("")).toBe("");
  });

  test("trimTrailingSlashes leaves the leading slashes", () => {
    expect(trimTrailingSlashes("/a/b//")).toBe("/a/b");
    expect(trimTrailingSlashes("https://host/")).toBe("https://host");
    expect(trimTrailingSlashes("/")).toBe("");
  });

  test("runs in linear time on a long run of slashes", () => {
    const input = `${"/".repeat(200_000)}x`;
    const startedAt = performance.now();
    expect(trimTrailingSlashes(input)).toBe(input);
    expect(trimSlashes(input)).toBe("x");
    expect(performance.now() - startedAt).toBeLessThan(200);
  });
});
