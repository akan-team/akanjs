import { beforeAll, describe, expect, test } from "bun:test";
import type { ConstantCls, ConstantField, FieldInfoObject } from "akanjs/constant";
import type { SerializedArg, SerializedEndpoint } from "akanjs/signal";

let getExampleData: typeof import("./makeExample").getExampleData;
let makeResponseExample: typeof import("./makeExample").makeResponseExample;

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "makeexampletest";
  process.env.AKAN_PUBLIC_REPO_NAME = "makeexampletest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  const { FIELD_META, Int } = await import("akanjs/base");
  const { ConstantRegistry, field } = await import("akanjs/constant");
  ({ getExampleData, makeResponseExample } = await import("./makeExample"));

  const makeRef = (fields: FieldInfoObject | Record<string, ConstantField>): ConstantCls => {
    class TestConstant {}
    Object.assign(TestConstant, {
      [FIELD_META]: Object.fromEntries(
        Object.entries(fields).map(([key, info]) => [key, "toField" in info ? info.toField() : info]),
      ),
      children: new Set(),
      relations: new Set(),
      enums: new Set(),
      text: { search: new Set(), filter: new Set(), children: { search: new Set(), filter: new Set() } },
    });
    return TestConstant as ConstantCls;
  };
  const ExampleInput = makeRef({
    name: field(String),
    prompts: field(Map, { of: String }),
    counts: field(Map, { of: [Int] as never }),
  });
  ConstantRegistry.buildModel(
    "mapExample",
    ExampleInput as never,
    ExampleInput as never,
    ExampleInput as never,
    ExampleInput as never,
    makeRef({ total: field(Int, { default: 0 }) }) as never,
    {},
  );
});

describe("Signal example data", () => {
  test("shapes a Map field as a string-keyed object of its value type", () => {
    const example = getExampleData([
      { name: "data", refName: "mapExample", modelType: "input", arrDepth: 0 } as SerializedArg,
    ]);
    expect(example.data).toEqual({ name: "String", prompts: { key: "String" }, counts: { key: [0] } });
  });

  test("shapes a Map field the same way in a response example", () => {
    const example = makeResponseExample({
      returns: { refName: "mapExample", modelType: "full", arrDepth: 0 },
    } as SerializedEndpoint);
    expect(example).toMatchObject({ prompts: { key: "String" }, counts: { key: [0] } });
  });
});
