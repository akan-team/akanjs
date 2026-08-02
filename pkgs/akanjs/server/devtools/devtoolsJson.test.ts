import { describe, expect, test } from "bun:test";
import { dayjs } from "akanjs/base";
import { DevtoolsJson } from "./devtoolsJson";

describe("DevtoolsJson.toSafe", () => {
  test("passes plain JSON values through untouched", () => {
    const value = { a: 1, b: "two", c: true, d: [1, 2, 3], e: { f: null } };
    expect(DevtoolsJson.toSafe(value)).toEqual(value);
  });

  test("coerces dates, dayjs, maps, sets, and regexes", () => {
    const coerced = DevtoolsJson.toSafe({
      date: new Date("2020-01-02T03:04:05.000Z"),
      day: dayjs("2020-01-02T03:04:05.000Z"),
      map: new Map([["k", 1]]),
      set: new Set([1, 2]),
      regex: /abc/g,
    }) as Record<string, unknown>;
    expect(coerced.date).toBe("2020-01-02T03:04:05.000Z");
    expect(coerced.day).toBe("2020-01-02T03:04:05.000Z");
    expect(coerced.map).toEqual({ k: 1 });
    expect(coerced.set).toEqual([1, 2]);
    expect(coerced.regex).toBe("/abc/g");
  });

  test("marks functions, classes, symbols, and bigints instead of dropping them", () => {
    class Widget {}
    const coerced = DevtoolsJson.toSafe({
      fn: function named() {
        return 1;
      },
      cls: Widget,
      sym: Symbol("tag"),
      big: 1n,
    }) as Record<string, { __akan: string; type: string; name?: string }>;
    expect(coerced.fn).toEqual({ __akan: "unserializable", type: "function", name: "named" });
    expect(coerced.cls).toEqual({ __akan: "unserializable", type: "class", name: "Widget" });
    expect(coerced.sym).toEqual({ __akan: "unserializable", type: "symbol", name: "tag" });
    expect(coerced.big).toEqual({ __akan: "unserializable", type: "bigint", name: "1" });
  });

  test("breaks cycles rather than throwing", () => {
    const cyclic: Record<string, unknown> = { name: "root" };
    cyclic.self = cyclic;
    const coerced = DevtoolsJson.toSafe(cyclic) as Record<string, unknown>;
    expect(coerced.self).toEqual({ __akan: "unserializable", type: "circular" });
    expect(() => JSON.stringify(coerced)).not.toThrow();
  });

  test("caps depth so a deep graph stays bounded", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: "too far" } } } } } } };
    const coerced = JSON.stringify(DevtoolsJson.toSafe(deep, { maxDepth: 3 }));
    expect(coerced).toContain("depth-limit");
  });

  test("keeps NaN and Infinity legible instead of letting JSON null them", () => {
    expect(DevtoolsJson.toSafe({ nan: Number.NaN, inf: Number.POSITIVE_INFINITY })).toEqual({
      nan: "NaN",
      inf: "Infinity",
    });
  });

  test("round-trips through JSON", () => {
    const coerced = DevtoolsJson.toSafe({ day: dayjs(0), map: new Map([["k", new Set([1])]]), fn: () => 1 });
    expect(JSON.parse(JSON.stringify(coerced))).toEqual(coerced as object);
  });
});
