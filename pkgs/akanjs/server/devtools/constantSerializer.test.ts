import { describe, expect, test } from "bun:test";
// Importing the fixture registers its models with ConstantRegistry / DatabaseRegistry as a side effect.
import "../resolver/resolver.contract.fixture";
import { ConstantSerializer } from "./constantSerializer";
import type { ConstantData, FieldType } from "./types";

const refName = "serverResolverTestItem";

const serialize = (): ConstantData => ConstantSerializer.serialize();

describe("ConstantSerializer", () => {
  test("emits every model view with its generated model name", () => {
    const model = serialize().models[refName];
    expect(model.modelNames).toEqual({
      input: "ServerResolverTestItemInput",
      object: "ServerResolverTestItemObject",
      full: "ServerResolverTestItem",
      light: "LightServerResolverTestItem",
      insight: "ServerResolverTestItemInsight",
    });
    expect(Object.keys(model.views).sort()).toEqual(["full", "input", "insight", "light", "object"]);
  });

  test("classifies primitive, enum-free scalar, relation, and resolve fields", () => {
    const full = serialize().models[refName].views.full.fields;
    expect(full.title.type).toEqual({ kind: "primitive", refName: "String" });
    expect(full.count.type).toEqual({ kind: "primitive", refName: "Int" });
    expect(full.tags.arrDepth).toBe(1);
    expect(full.nested.type).toEqual({
      kind: "model",
      refName: "serverResolverTestNested",
      modelType: "scalar",
      modelName: "ServerResolverTestNested",
    });
    expect(full.resolvedLabel.fieldKind).toBe("resolve");
  });

  test("reports a default factory without invoking it", () => {
    const fields = serialize().models[refName].views.full.fields;
    expect(fields.count.defaultKind).toBe("value");
    expect(fields.count.default).toBe(0);
    // `tags` defaults to `[]` through the array branch of ConstantField.from.
    expect(fields.tags.defaultKind).toBe("value");
  });

  test("keeps a secret field's shape but drops its seeded value", () => {
    const secret = serialize().models[refName].views.full.fields.secret;
    expect(secret.fieldKind).toBe("secret");
    expect(secret.type).toEqual({ kind: "primitive", refName: "String" });
    expect(secret.default).toBeUndefined();
    expect(secret.example).toBeUndefined();
  });

  test("derives relation edges from model-typed fields", () => {
    const edges = serialize().relations.filter((edge) => edge.from === refName && edge.field === "nested");
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0]).toMatchObject({ to: "serverResolverTestNested", toView: "scalar" });
  });

  test("serializes the filter query args and sort keys", () => {
    const filter = serialize().models[refName].filter;
    expect(filter).toBeDefined();
    expect(Object.keys(filter?.query ?? {}).sort()).toEqual(["any", "byOwner", "inCategory"]);
    expect(filter?.query.inCategory).toEqual([
      { name: "category", type: { kind: "primitive", refName: "String" }, arrDepth: 0, nullable: false },
      { name: "includeRemoved", type: { kind: "primitive", refName: "Boolean" }, arrDepth: 0, nullable: true },
    ]);
    expect(filter?.query.byOwner[0]).toMatchObject({ name: "ownerId", ref: "user" });
    expect(filter?.sort.sort()).toEqual(["latest", "oldest", "relevance", "titleAsc"]);
  });

  test("lists registered scalars and primitives", () => {
    const data = serialize();
    expect(data.scalars.serverResolverTestNested.modelType).toBe("scalar");
    expect(data.scalars.serverResolverTestNested.fields.label.type).toEqual({ kind: "primitive", refName: "String" });
    expect(data.primitives).toContain("String");
    expect(data.primitives).toContain("Int");
    expect(data.primitives).toContain("ID");
  });

  test("never inlines a referenced model, so the payload stays finite", () => {
    const isFinite = (type: FieldType): boolean =>
      type.kind !== "map" || (typeof type.valueArrDepth === "number" && isFinite(type.value));
    const fields = Object.values(serialize().models[refName].views.full.fields);
    expect(fields.every((field) => isFinite(field.type))).toBe(true);
  });

  test("round-trips through JSON", () => {
    const data = serialize();
    expect(() => JSON.stringify(data)).not.toThrow();
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});
