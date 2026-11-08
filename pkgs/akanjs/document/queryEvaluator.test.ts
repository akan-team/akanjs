import { describe, expect, test } from "bun:test";
import { Any, dayjs } from "akanjs/base";
import { InputParser } from "akanjs/constant";
import { createDocumentQueryHelper, type DocumentQuery, DocumentQueryEvaluator } from ".";

const q = createDocumentQueryHelper();
const fields = { tags: { getProps: () => ({ isArray: true }) }, title: { getProps: () => ({}) } };
const evaluator = new DocumentQueryEvaluator(fields);

const rowOf = (doc: Record<string, unknown>) =>
  DocumentQueryEvaluator.rowViewOf({ id: "a".repeat(24), createdAt: dayjs(1000), updatedAt: dayjs(2000), ...doc });

const matches = (query: DocumentQuery, doc: Record<string, unknown>) => evaluator.evaluate(query, rowOf(doc));

describe("DocumentQueryEvaluator operators", () => {
  test("eq compares through the stored encoding", () => {
    expect(matches({ status: "active" }, { status: "active" })).toBe(true);
    expect(matches({ status: "active" }, { status: "archived" })).toBe(false);
    expect(matches({ flag: true }, { flag: true })).toBe(true);
    expect(matches({ at: dayjs(500) }, { at: dayjs(500) })).toBe(true);
    expect(matches({ at: dayjs(500) }, { at: dayjs(501) })).toBe(false);
  });

  test("eq against null is the IS NULL form", () => {
    expect(matches({ note: null }, { note: null })).toBe(true);
    expect(matches({ note: null }, {})).toBe(true);
    expect(matches({ note: null }, { note: "x" })).toBe(false);
  });

  test("ne does not match a null the way SQL does not", () => {
    expect(matches({ status: q.ne("active") }, { status: "archived" })).toBe(true);
    expect(matches({ status: q.ne("active") }, { status: "active" })).toBe(false);
    expect(matches({ status: q.ne("active") }, {})).toBe(false);
    expect(matches({ status: q.ne(null) }, { status: "active" })).toBe(true);
    expect(matches({ status: q.ne(null) }, {})).toBe(false);
  });

  test("comparisons refuse a missing value and refuse to coerce across types", () => {
    expect(matches({ score: q.gt(5) }, { score: 6 })).toBe(true);
    expect(matches({ score: q.gt(5) }, { score: 5 })).toBe(false);
    expect(matches({ score: q.gte(5) }, { score: 5 })).toBe(true);
    expect(matches({ score: q.lt(5) }, {})).toBe(false);
    // A number sorts below any text in SQLite, so this is an ordering answer rather than a coerced comparison.
    expect(matches({ score: q.lt("5") }, { score: 9 })).toBe(true);
  });

  test("between spans inclusively", () => {
    expect(matches({ score: q.between(1, 3) }, { score: 1 })).toBe(true);
    expect(matches({ score: q.between(1, 3) }, { score: 3 })).toBe(true);
    expect(matches({ score: q.between(1, 3) }, { score: 4 })).toBe(false);
    expect(matches({ score: q.between(1, 3) }, {})).toBe(false);
  });

  test("oneOf on a scalar, and membership on an array field", () => {
    expect(matches({ status: q.oneOf(["a", "b"]) }, { status: "b" })).toBe(true);
    expect(matches({ status: q.oneOf([]) }, { status: "b" })).toBe(false);
    expect(matches({ tags: q.oneOf(["x", "y"]) }, { tags: ["y", "z"] })).toBe(true);
    expect(matches({ tags: q.oneOf(["x"]) }, { tags: ["y"] })).toBe(false);
  });

  test("notOneOf is empty-list-true and null-false", () => {
    expect(matches({ status: q.notOneOf([]) }, { status: "a" })).toBe(true);
    expect(matches({ status: q.notOneOf(["a"]) }, { status: "b" })).toBe(true);
    expect(matches({ status: q.notOneOf(["a"]) }, { status: "a" })).toBe(false);
    expect(matches({ status: q.notOneOf(["a"]) }, {})).toBe(false);
  });

  test("empty covers both an absent key and a stored null", () => {
    expect(evaluator.evaluate(q.empty("note"), rowOf({ note: null }))).toBe(true);
    expect(evaluator.evaluate(q.empty("note"), rowOf({}))).toBe(true);
    expect(evaluator.evaluate(q.empty("note"), rowOf({ note: "x" }))).toBe(false);
  });

  test("exists and missing are evaluable on a base column only", () => {
    expect(evaluator.evaluate(q.exists("removedAt"), rowOf({ removedAt: dayjs(1) }))).toBe(true);
    expect(evaluator.evaluate(q.exists("removedAt"), rowOf({}))).toBe(false);
    expect(evaluator.evaluate(q.missing("removedAt"), rowOf({}))).toBe(true);
    expect(() => evaluator.evaluate(q.exists("note"), rowOf({ note: "x" }))).toThrow(/use q.empty\(\)/);
    expect(() => evaluator.evaluate(q.missing("note"), rowOf({}))).toThrow(/use q.empty\(\)/);
  });

  test("has iterates an array, contains folds ASCII case the way LIKE does", () => {
    expect(matches({ tags: q.has("x") }, { tags: ["x", "y"] })).toBe(true);
    expect(matches({ tags: q.has("z") }, { tags: ["x"] })).toBe(false);
    expect(matches({ tags: q.has("z") }, {})).toBe(false);
    expect(matches({ title: q.contains("Ell") }, { title: "hello" })).toBe(true);
    expect(matches({ title: q.contains("zz") }, { title: "hello" })).toBe(false);
  });

  test("a bare value on an array field means membership", () => {
    expect(matches({ tags: "x" }, { tags: ["x", "y"] })).toBe(true);
    expect(matches({ tags: "z" }, { tags: ["x"] })).toBe(false);
  });

  test("the operator-object shorthand reaches the same operators", () => {
    expect(matches({ score: { gte: 3, lt: 9 } }, { score: 5 })).toBe(true);
    expect(matches({ score: { gte: 3, lt: 9 } }, { score: 9 })).toBe(false);
    expect(matches({ note: { empty: true } }, { note: null })).toBe(true);
  });
});

describe("DocumentQueryEvaluator composition", () => {
  test("all, any and not nest", () => {
    const query = q.all({ status: "active" }, q.any({ score: q.gt(8) }, { tags: q.has("hot") }));
    expect(evaluator.evaluate(query, rowOf({ status: "active", score: 9, tags: [] }))).toBe(true);
    expect(evaluator.evaluate(query, rowOf({ status: "active", score: 1, tags: ["hot"] }))).toBe(true);
    expect(evaluator.evaluate(query, rowOf({ status: "active", score: 1, tags: [] }))).toBe(false);
    expect(evaluator.evaluate(query, rowOf({ status: "archived", score: 9, tags: [] }))).toBe(false);
    expect(evaluator.evaluate(q.not({ status: "active" }), rowOf({ status: "archived" }))).toBe(true);
  });

  test("an empty query and an empty group are both vacuously true", () => {
    expect(evaluator.evaluate({}, rowOf({}))).toBe(true);
    expect(evaluator.evaluate(undefined, rowOf({}))).toBe(true);
    expect(evaluator.evaluate(q.all(), rowOf({}))).toBe(true);
    expect(evaluator.evaluate(q.any(), rowOf({}))).toBe(true);
  });

  test("base columns are read as the columns they are", () => {
    const row = rowOf({ removedAt: dayjs(9000) });
    expect(evaluator.evaluate(q.empty("removedAt"), row)).toBe(false);
    expect(evaluator.evaluate(q.empty("removedAt"), rowOf({}))).toBe(true);
    expect(evaluator.evaluate({ createdAt: q.gte(dayjs(1000)) }, row)).toBe(true);
    expect(evaluator.evaluate({ id: "a".repeat(24) }, row)).toBe(true);
  });

  test("a nested path reads through objects and stops at an array", () => {
    expect(matches({ "owner.tier": "gold" }, { owner: { tier: "gold" } })).toBe(true);
    expect(matches({ "owner.tier": "gold" }, { owner: {} })).toBe(false);
    // `$.list.0` is an object-key lookup in SQLite and finds nothing in an array.
    expect(matches({ "list.0": 1 }, { list: [1, 2] })).toBe(false);
  });
});

describe("DocumentQueryEvaluator unevaluable nodes", () => {
  test("raw and search are reported, nested included", () => {
    expect(DocumentQueryEvaluator.unevaluableReason(q.raw("1 = 1"))).toContain("q.raw()");
    expect(DocumentQueryEvaluator.unevaluableReason(q.search("hello"))).toContain("q.search()");
    expect(DocumentQueryEvaluator.unevaluableReason(q.all({ a: 1 }, q.raw("1 = 1")))).toContain("q.raw()");
    expect(DocumentQueryEvaluator.unevaluableReason(q.not(q.search("x")))).toContain("q.search()");
    expect(DocumentQueryEvaluator.unevaluableReason({ a: q.oneOf([1]) })).toBeNull();
    expect(DocumentQueryEvaluator.unevaluableReason(undefined)).toBeNull();
  });

  test("key absence off the base columns is reported too, in either spelling", () => {
    expect(DocumentQueryEvaluator.unevaluableReason(q.exists("note"))).toContain("q.empty()");
    expect(DocumentQueryEvaluator.unevaluableReason(q.missing("note"))).toContain("q.empty()");
    expect(DocumentQueryEvaluator.unevaluableReason({ note: { exists: true } })).toContain("q.empty()");
    expect(DocumentQueryEvaluator.unevaluableReason(q.all({ a: 1 }, q.missing("note")))).toContain("q.empty()");
    expect(DocumentQueryEvaluator.unevaluableReason(q.exists("removedAt"))).toBeNull();
    expect(DocumentQueryEvaluator.unevaluableReason({ note: { empty: false } })).toContain("q.empty()");
    expect(DocumentQueryEvaluator.unevaluableReason(q.empty("note"))).toBeNull();
  });

  test("evaluating one throws rather than guessing", () => {
    expect(() => evaluator.evaluate(q.raw("1 = 1"), rowOf({}))).toThrow(/cannot be evaluated in memory/);
  });

  test("a combinator at a field is reported and refused rather than looping", () => {
    const atField = [{ score: q.any() }, { score: q.all({ score: 1 }) }, q.all({ a: 1 }, { score: q.not({ a: 1 }) })];
    for (const query of atField) {
      expect(DocumentQueryEvaluator.unevaluableReason(query as DocumentQuery)).toContain(
        'cannot be the value of "score"',
      );
      expect(() => evaluator.evaluate(query as DocumentQuery, rowOf({ a: 1, score: 1 }))).toThrow(
        "cannot be the value of",
      );
    }
    expect(DocumentQueryEvaluator.unevaluableReason({ score: q.raw("1 = 1") } as DocumentQuery)).toContain(
      "put it beside the field's condition",
    );
  });

  test("a condition a request carried, or a raw-shaped object q did not build, is reported and refused", () => {
    const [operators, node] = InputParser.parse(Any, 0, [{ ne: "x" }, { kind: "any", queries: [] }], {
      key: "args",
    }) as [Record<string, unknown>, DocumentQuery];
    const shaped = JSON.parse('{"kind":"raw","sql":"1 = 1","params":[]}') as DocumentQuery;

    expect(DocumentQueryEvaluator.unevaluableReason({ status: operators })).toContain("holds query operators");
    expect(() => matches({ status: operators }, { status: "y" })).toThrow("holds query operators");
    expect(matches({ status: { ne: "x" } }, { status: "y" })).toBe(true);
    expect(DocumentQueryEvaluator.unevaluableReason(q.all({ status: "y" }, node))).toContain(
      "arrived as a request value",
    );
    expect(() => evaluator.evaluate(node, rowOf({}))).toThrow("arrived as a request value");
    expect(DocumentQueryEvaluator.unevaluableReason(shaped)).toContain("must be built by q.raw()");
  });
});
