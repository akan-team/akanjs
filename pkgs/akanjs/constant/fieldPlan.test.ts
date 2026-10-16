import { describe, expect, test } from "bun:test";
import { FIELD_META, Int } from "akanjs/base";

import { type ConstantField, ConstantRegistry, type FieldObject, FieldPlan, via } from ".";

const FieldPlanTestPoint = via((f) => ({
  x: f(Int),
  label: f(String).optional(),
}));
ConstantRegistry.buildScalar("fieldPlanTestPoint", FieldPlanTestPoint, { FieldPlanTestPoint });

const FieldPlanTestTargetInput = via((f) => ({ title: f(String) }));
const FieldPlanTestTargetObject = via(FieldPlanTestTargetInput, () => ({}));
const FieldPlanTestTargetLight = via(FieldPlanTestTargetObject, ["title"] as const, () => ({}));
const FieldPlanTestTargetFull = via(FieldPlanTestTargetObject, FieldPlanTestTargetLight, () => ({}));
const FieldPlanTestTargetInsight = via(FieldPlanTestTargetFull, (f) => ({
  total: f(Int, { default: 0, accumulate: {} }),
}));
ConstantRegistry.buildModel(
  "fieldPlanTestTarget",
  FieldPlanTestTargetInput,
  FieldPlanTestTargetObject,
  FieldPlanTestTargetFull,
  FieldPlanTestTargetLight,
  FieldPlanTestTargetInsight,
  {
    FieldPlanTestTargetInput,
    FieldPlanTestTargetObject,
    FieldPlanTestTargetFull,
    FieldPlanTestTargetLight,
    FieldPlanTestTargetInsight,
  },
);

const FieldPlanTestInput = via((f) => ({
  name: f(String),
  tags: f(Map, { of: String }),
  point: f(FieldPlanTestPoint),
  points: f([FieldPlanTestPoint]),
  target: f(FieldPlanTestTargetFull).optional(),
}));
const FieldPlanTestObject = via(FieldPlanTestInput, (f) => ({
  memo: f.hidden(String),
  token: f.secret(String),
}));
const FieldPlanTestLight = via(FieldPlanTestObject, ["name"] as const, () => ({}));
const FieldPlanTestFull = via(FieldPlanTestObject, FieldPlanTestLight, (f) => ({
  summary: f(String),
}));
const FieldPlanTestInsight = via(FieldPlanTestFull, (f) => ({ total: f(Int, { default: 0, accumulate: {} }) }));
ConstantRegistry.buildModel(
  "fieldPlanTestItem",
  FieldPlanTestInput,
  FieldPlanTestObject,
  FieldPlanTestFull,
  FieldPlanTestLight,
  FieldPlanTestInsight,
  { FieldPlanTestInput, FieldPlanTestObject, FieldPlanTestFull, FieldPlanTestLight, FieldPlanTestInsight },
);

const FieldPlanTestHolder = via((f) => ({
  item: f(FieldPlanTestPoint),
  nested: f([[FieldPlanTestPoint]] as never),
}));
ConstantRegistry.buildScalar("fieldPlanTestHolder", FieldPlanTestHolder, { FieldPlanTestHolder });

const kindsOf = (plan: FieldPlan) => Object.fromEntries(plan.entries.map(({ key, kind }) => [key, kind]));

describe("FieldPlan", () => {
  test("classifies every field in FIELD_META order the way a response treats it", () => {
    const plan = FieldPlan.of(FieldPlanTestFull);

    expect(plan.entries.map(({ key }) => key)).toEqual(Object.keys(FieldPlanTestFull[FIELD_META]));
    expect(kindsOf(plan)).toMatchObject({
      id: "value",
      name: "value",
      tags: "value",
      point: "scalar",
      points: "scalar",
      target: "relation",
      memo: "masked",
      token: "masked",
      summary: "computed",
    });
    const byKey = Object.fromEntries(plan.entries.map((entry) => [entry.key, entry]));
    expect(byKey.target?.isRelationRef).toBe(true);
    expect(byKey.point?.isRelationRef).toBe(false);
    expect(byKey.name?.primitive).toBe(String as never);
    expect(byKey.tags?.primitive).toBeNull();
    expect(byKey.point?.primitive).toBeNull();
    expect(byKey.target?.serializeOption).toEqual({ nullable: true, key: "target" });
  });

  test("is built once per class", () => {
    expect(FieldPlan.of(FieldPlanTestFull)).toBe(FieldPlan.of(FieldPlanTestFull));
  });

  test("resolves synchronously only when nothing below it loads or computes", () => {
    expect(FieldPlan.of(FieldPlanTestPoint).resolvesAsync).toBe(false);
    expect(FieldPlan.of(FieldPlanTestHolder).resolvesAsync).toBe(false);
    expect(FieldPlan.of(FieldPlanTestTargetFull).resolvesAsync).toBe(false);
    expect(FieldPlan.of(FieldPlanTestFull).resolvesAsync).toBe(true);
    expect(FieldPlan.of(FieldPlanTestInput).resolvesAsync).toBe(true);
  });

  test("takes a scalar that reaches itself as async rather than recursing forever", () => {
    const scalarField = (modelRef: object) =>
      ({
        fieldType: "property",
        isClass: true,
        isScalar: true,
        nullable: true,
        arrDepth: 0,
        modelRef,
      }) as unknown as ConstantField;
    const owner = { [FIELD_META]: {} as FieldObject };
    const other = { [FIELD_META]: {} as FieldObject };
    Object.assign(owner[FIELD_META], { other: scalarField(other) });
    Object.assign(other[FIELD_META], { owner: scalarField(owner) });

    expect(FieldPlan.of(owner).resolvesAsync).toBe(true);
    expect(FieldPlan.of(other).resolvesAsync).toBe(true);
  });

  test("rebuilds a class's plan after a reset, and its dependents see the change", () => {
    const leaf = {
      [FIELD_META]: { value: { fieldType: "property", isClass: false, isScalar: true } } as unknown as FieldObject,
    };
    const parent = {
      [FIELD_META]: {
        leaf: { fieldType: "property", isClass: true, isScalar: true, nullable: false, arrDepth: 0, modelRef: leaf },
      } as unknown as FieldObject,
    };
    const before = FieldPlan.of(leaf);
    expect(FieldPlan.of(parent).resolvesAsync).toBe(false);

    Object.assign(leaf[FIELD_META], { computed: { fieldType: "resolve", isClass: false, isScalar: true } });
    FieldPlan.reset(leaf);

    expect(FieldPlan.of(leaf)).not.toBe(before);
    expect(FieldPlan.of(leaf).resolvesAsync).toBe(true);
    expect(FieldPlan.of(parent).resolvesAsync).toBe(true);
  });
});
