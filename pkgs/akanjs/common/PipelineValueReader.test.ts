import { describe, expect, test } from "bun:test";
import { type PipelineValueProblem, PipelineValueReader } from "./PipelineValueReader";

const recording = (form: "plan" | "config") => {
  const misses: [string, PipelineValueProblem[]][] = [];
  const reader = new PipelineValueReader<null>(form, (path, ...problems) => {
    misses.push([path, problems]);
    return null;
  });
  return { reader, misses };
};

describe("PipelineValueReader", () => {
  test("the plan form holds every key, and hands every key problem over at once, unknown ones first", () => {
    const { reader, misses } = recording("plan");
    expect(reader.object({ a: 1, extra: undefined }, "x", ["a", "b"])).toBeNull();
    expect(misses).toEqual([
      [
        "x",
        [
          { kind: "unknownKey", key: "extra", keys: ["a", "b"] },
          { kind: "missingKey", key: "b" },
        ],
      ],
    ]);
  });

  test("a config reads a key set to undefined as the key left out, and requires none", () => {
    const { reader, misses } = recording("config");
    expect(reader.object({ a: 1, extra: undefined }, "x", ["a", "b"])).toEqual({ a: 1, extra: undefined });
    expect(reader.keys({ c: 1 }, "x", ["a"])).toBe(false);
    expect(misses).toEqual([["x", [{ kind: "unknownKey", key: "c", keys: ["a"] }]]]);
  });

  test("blank text is empty in a config only", () => {
    expect(recording("config").reader.string("  ", "x")).toBeNull();
    expect(recording("plan").reader.string("  ", "x")).toBe("  ");
    expect(recording("plan").reader.string("", "x", 10, { allowEmpty: true })).toBe("");
    expect(recording("plan").reader.string("x".repeat(1025), "x")).toBeNull();
  });

  test("a throwing miss ends the read at the first problem", () => {
    const reader = new PipelineValueReader<never>("plan", (path, problem) => {
      throw new Error(`${path} ${problem.kind}`);
    });
    expect(() => reader.int(1.5, "n", 0, 9)).toThrow("n int");
    expect(() => reader.int(10, "n", 0, 9)).toThrow("n range");
    expect(() => reader.list({}, "l")).toThrow("l list");
    expect(reader.oneOf("a", "o", ["a", "b"])).toBe("a");
  });
});
