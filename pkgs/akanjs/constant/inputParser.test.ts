import { describe, expect, test } from "bun:test";
import { dayjs, enumOf, Int } from "akanjs/base";

import { ConstantRegistry, InputParser, InvalidInputError, via } from ".";

class InputParserTestStatus extends enumOf("inputParserTestStatus", ["draft", "active"] as const) {}

const InputParserTestPoint = via((f) => ({
  x: f(Int),
  z: f(Int, { default: 5 }),
  label: f(String).optional(),
}));
ConstantRegistry.buildScalar("inputParserTestPoint", InputParserTestPoint, { InputParserTestPoint });

const InputParserTestTargetInput = via((f) => ({ title: f(String) }));
const InputParserTestTargetObject = via(InputParserTestTargetInput, () => ({}));
const InputParserTestTargetLight = via(InputParserTestTargetObject, ["title"] as const, () => ({}));
const InputParserTestTargetFull = via(InputParserTestTargetObject, InputParserTestTargetLight, () => ({}));
const InputParserTestTargetInsight = via(InputParserTestTargetFull, (f) => ({
  total: f(Int, { default: 0, accumulate: {} }),
}));
ConstantRegistry.buildModel(
  "inputParserTestTarget",
  InputParserTestTargetInput,
  InputParserTestTargetObject,
  InputParserTestTargetFull,
  InputParserTestTargetLight,
  InputParserTestTargetInsight,
  {
    InputParserTestTargetInput,
    InputParserTestTargetObject,
    InputParserTestTargetFull,
    InputParserTestTargetLight,
    InputParserTestTargetInsight,
  },
);

const InputParserTestInput = via((f) => ({
  name: f(String),
  count: f(Int, { default: 0 }),
  status: f(InputParserTestStatus),
  at: f(Date),
  target: f(InputParserTestTargetFull),
  tags: f([String]),
  prices: f(Map, { of: Int }),
  point: f(InputParserTestPoint),
  memo: f(String).optional(),
}));
const InputParserTestObject = via(InputParserTestInput, () => ({}));
const InputParserTestLight = via(InputParserTestObject, ["name"] as const, () => ({}));
const InputParserTestFull = via(InputParserTestObject, InputParserTestLight, () => ({}));
const InputParserTestInsight = via(InputParserTestFull, (f) => ({ total: f(Int, { default: 0, accumulate: {} }) }));
ConstantRegistry.buildModel(
  "inputParserTestItem",
  InputParserTestInput,
  InputParserTestObject,
  InputParserTestFull,
  InputParserTestLight,
  InputParserTestInsight,
  { InputParserTestInput, InputParserTestObject, InputParserTestFull, InputParserTestLight, InputParserTestInsight },
);

const targetId = "65f0a1b2c3d4e5f6a7b8c9d0";
const body = (patch: Record<string, unknown> = {}) => ({
  name: "kit",
  status: "draft",
  at: "2026-10-16T00:00:00.000Z",
  target: targetId,
  tags: ["a"],
  prices: { KRW: 1000 },
  point: { x: 1 },
  ...patch,
});
const parse = (value: unknown) => InputParser.parse(InputParserTestInput, 0, value, { key: "data" });
const refusal = (value: unknown) => {
  try {
    parse(value);
  } catch (error) {
    if (error instanceof InvalidInputError) return { path: error.path, expected: error.expected };
    throw error;
  }
  throw new Error("parsed");
};

describe("InputParser", () => {
  test("parses a model input to its declared types, drops unknown keys and leaves defaulted fields absent", () => {
    const parsed = parse(body({ role: "admin", removedAt: null })) as Record<string, unknown>;

    expect(Object.keys(parsed).sort()).toEqual(["at", "name", "point", "prices", "status", "tags", "target"]);
    expect(dayjs.isDayjs(parsed.at)).toBe(true);
    expect(parsed.target).toBe(targetId);
    expect(parsed.point).toEqual({ x: 1, z: 5, label: null });
  });

  test("refuses a value of the wrong JSON type, naming its path and what it takes", () => {
    expect(refusal("kit")).toEqual({ path: "data", expected: "object" });
    expect(refusal([body()])).toEqual({ path: "data", expected: "object" });
    expect(refusal(body({ count: "3" }))).toEqual({ path: "data.count", expected: "Int" });
    expect(refusal(body({ count: 1.5 }))).toEqual({ path: "data.count", expected: "Int" });
    expect(refusal(body({ name: 3 }))).toEqual({ path: "data.name", expected: "String" });
    expect(refusal(body({ status: "gone" }))).toEqual({ path: "data.status", expected: "one of draft, active" });
    expect(refusal(body({ at: "soon" }))).toEqual({ path: "data.at", expected: "Date" });
    expect(refusal(body({ target: "abc" }))).toEqual({ path: "data.target", expected: "ID" });
    expect(refusal(body({ target: { id: targetId } }))).toEqual({ path: "data.target", expected: "ID" });
    expect(refusal(body({ tags: "a" }))).toEqual({ path: "data.tags", expected: "array" });
    expect(refusal(body({ tags: ["a", 2] }))).toEqual({ path: "data.tags.1", expected: "String" });
    expect(refusal(body({ prices: { KRW: "1000" } }))).toEqual({ path: "data.prices.KRW", expected: "Int" });
    expect(refusal(body({ point: { x: "1" } }))).toEqual({ path: "data.point.x", expected: "Int" });
  });

  test("refuses a required field that is absent or null, and takes null where the field is nullable", () => {
    const { name: _name, ...nameless } = body();

    expect(refusal(nameless)).toEqual({ path: "data.name", expected: null });
    expect(refusal(body({ name: null }))).toEqual({ path: "data.name", expected: null });
    expect(refusal(body({ point: {} }))).toEqual({ path: "data.point.x", expected: null });
    expect(refusal(body({ tags: [null] }))).toEqual({ path: "data.tags.0", expected: null });
    expect((parse(body({ memo: null })) as { memo: unknown }).memo).toBeNull();
    expect(InputParser.parse(InputParserTestInput, 0, null, { key: "data", nullable: true })).toBeNull();
  });

  test("parses an embedded scalar argument whole, and keeps the text coercion of a primitive argument", () => {
    expect(InputParser.parse(InputParserTestPoint, 1, [{ x: 2, label: "p" }], { key: "points" })).toEqual([
      { x: 2, z: 5, label: "p" },
    ]);
    expect(InputParser.parse(Int, 0, "3", { key: "limit" })).toBe(3);
  });
});
