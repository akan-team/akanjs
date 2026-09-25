import { describe, expect, test } from "bun:test";
import { isThenable } from "./isThenable";

describe("isThenable", () => {
  test("accepts a native promise and an async function's return", async () => {
    expect(isThenable(Promise.resolve(1))).toBe(true);
    const run = async () => 1;
    const pending = run();
    expect(isThenable(pending)).toBe(true);
    await pending;
  });

  test("accepts a foreign thenable", () => {
    // biome-ignore lint/suspicious/noThenProperty: a hand-built thenable is the case under test
    expect(isThenable({ then: (resolve: (v: number) => void) => resolve(1) })).toBe(true);
  });

  test("rejects what a synchronous click handler returns", () => {
    expect(isThenable(undefined)).toBe(false);
    expect(isThenable(null)).toBe(false);
    expect(isThenable(void 0)).toBe(false);
    expect(isThenable(false)).toBe(false);
    expect(isThenable(0)).toBe(false);
    expect(isThenable("")).toBe(false);
    expect(isThenable({})).toBe(false);
    expect(isThenable(() => 1)).toBe(false);
  });

  test("rejects a non-callable `then`", () => {
    // biome-ignore lint/suspicious/noThenProperty: a non-callable `then` is the case under test
    expect(isThenable({ then: 1 })).toBe(false);
  });
});
