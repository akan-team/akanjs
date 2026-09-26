import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { dayjs, FIELD_META, ID, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import {
  by,
  createDocumentQueryHelper,
  type DatabaseCls,
  DatabaseRegistry,
  type DocumentQuery,
  DocumentQueryEvaluator,
  DocumentSchema,
  from,
  into,
  type QueryFieldMap,
} from "akanjs/document";
import { ConformanceEnv, type SqlDriver, type SqlDriverKind } from "../../test/conformance";
import { SqlDocumentStore } from "./database.adaptor";

const q = createDocumentQueryHelper();

class ParityInput extends via((f) => ({
  title: f(String),
  status: f(String, { default: "active" }),
  score: f(Int, { default: 0 }),
  ownerId: f(ID, { default: "" }),
  archived: f(Boolean, { default: false }),
  tags: f([String], { default: [] }),
  note: f(String).optional(),
  dueAt: f(Date).optional(),
})) {}
class ParityObject extends via(ParityInput, () => ({})) {}
class ParityLight extends via(ParityObject, ["title"] as const, () => ({})) {}
class ParityFull extends via(ParityObject, ParityLight, () => ({})) {}
class ParityInsight extends via(ParityFull, (f) => ({ count: f(Int, { default: 0, accumulate: {} }) })) {}
const parityConstant = ConstantRegistry.buildModel(
  "queryParity",
  ParityInput,
  ParityObject,
  ParityFull,
  ParityLight,
  ParityInsight,
  { ParityInput, ParityObject, ParityFull, ParityLight, ParityInsight },
);
class ParityFilter extends from(ParityFull, () => ({ query: {}, sort: {} })) {}
class ParityDoc extends by(ParityFull) {}
class ParityModel extends into(ParityDoc, ParityFilter, parityConstant, () => ({})) {}
const parityDatabase = DatabaseRegistry.buildModel(
  "queryParity",
  ParityInput as unknown as DatabaseCls<InstanceType<typeof ParityInput>>,
  ParityDoc,
  ParityModel,
  ParityObject,
  ParityInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  ParityFilter,
);

const seeds = [
  { title: "alpha", status: "active", score: 10, ownerId: "u1", tags: ["hot", "new"], note: "Hello World" },
  { title: "beta", status: "draft", score: 0, ownerId: "u1", tags: [], archived: true },
  { title: "gamma", status: "archived", score: 42, ownerId: "u2", tags: ["hot"], dueAt: dayjs(5_000) },
  { title: "delta", status: "active", score: 7, ownerId: "u2", tags: ["cold"], note: "goodbye" },
  { title: "epsilon", status: "active", score: 42, ownerId: "u3", tags: ["new", "cold"], dueAt: dayjs(50_000) },
  { title: "zeta", status: "draft", score: 3, ownerId: "u3", tags: [], note: null },
  { title: "Omega", status: "active", score: 1, ownerId: "u4", tags: ["hot"], note: "Élan 50%" },
] as const;

// Every case runs through the same `empty("removedAt")` wrapper the store adds to every read
// (`SqlDocumentStore.findForRead`); without it the two sides would be comparing different queries.
const cases: { name: string; query: DocumentQuery }[] = [
  { name: "empty query", query: {} },
  { name: "eq on a string", query: { status: "active" } },
  { name: "eq on a number", query: { score: 42 } },
  { name: "eq on a boolean", query: { archived: true } },
  { name: "eq on a date", query: { dueAt: dayjs(5_000) } },
  { name: "eq on an absent optional", query: { note: null } },
  { name: "ne", query: { status: q.ne("active") } },
  { name: "ne against null", query: { note: q.ne(null) } },
  { name: "gt", query: { score: q.gt(7) } },
  { name: "gte", query: { score: q.gte(7) } },
  { name: "lt", query: { score: q.lt(10) } },
  { name: "lte", query: { score: q.lte(10) } },
  { name: "gt on a date", query: { dueAt: q.gt(dayjs(6_000)) } },
  { name: "between", query: { score: q.between(1, 41) } },
  { name: "oneOf on a scalar", query: { status: q.oneOf(["draft", "archived"]) } },
  { name: "oneOf empty", query: { status: q.oneOf([]) } },
  { name: "oneOf on an array field", query: { tags: q.oneOf(["hot", "cold"]) } },
  { name: "notOneOf on a scalar", query: { status: q.notOneOf(["draft"]) } },
  { name: "notOneOf empty", query: { status: q.notOneOf([]) } },
  { name: "notOneOf on an array field", query: { tags: q.notOneOf(["hot"]) } },
  { name: "empty", query: q.empty("note") },
  { name: "empty on a date", query: q.empty("dueAt") },
  { name: "empty shorthand", query: { note: { empty: true } } },
  { name: "empty on a base column", query: q.empty("removedAt") },
  { name: "exists on a base column", query: q.exists("removedAt") },
  { name: "has", query: { tags: q.has("hot") } },
  { name: "bare value on an array field", query: { tags: "cold" } },
  { name: "contains", query: { note: q.contains("hello") } },
  { name: "contains folds ASCII only", query: { note: q.contains("é") } },
  { name: "contains takes % as text", query: { note: q.contains("%") } },
  { name: "contains takes _ as text", query: { note: q.contains("o_") } },
  { name: "lt on a string compares bytes", query: { title: q.lt("beta") } },
  { name: "between strings", query: { title: q.between("A", "b") } },
  { name: "operator shorthand", query: { score: { gte: 7, lt: 42 } } },
  { name: "all", query: q.all({ status: "active" }, { score: q.gte(10) }) },
  { name: "any", query: q.any({ status: "draft" }, { tags: q.has("cold") }) },
  { name: "not", query: q.not({ status: "active" }) },
  { name: "not over any", query: q.not(q.any({ status: "draft" }, { score: q.gt(40) })) },
  { name: "nested groups", query: q.all(q.any({ ownerId: "u1" }, { ownerId: "u2" }), q.not({ score: 0 })) },
  { name: "base column compare", query: { createdAt: q.gt(dayjs(0)) } },
  { name: "empty group", query: q.all() },
];

const describeDriver = (kind: SqlDriverKind) => {
  describe(`query evaluator matches SQL (${kind})`, () => {
    let driver: SqlDriver;
    let store: SqlDocumentStore;
    let all: { id: string; row: ReturnType<typeof DocumentQueryEvaluator.rowViewOf> }[] = [];
    const evaluator = new DocumentQueryEvaluator(ParityFull[FIELD_META] as unknown as QueryFieldMap);

    beforeAll(async () => {
      driver = await ConformanceEnv.openSqlDriver(kind);
      store = new SqlDocumentStore(
        driver.database,
        parityConstant,
        parityDatabase,
        new DocumentSchema(),
        driver.dialect,
      );
      await store.ensure();
      for (const seed of seeds) await store.create({ ...seed });
      const created = await store.find({}, { skip: null, limit: null });
      // Picked by title: seeds created in one millisecond tie on `createdAt`, and Postgres orders ties arbitrarily.
      const removed = await store.remove(created.find(({ title }) => title === "delta")?.id as string);
      const remaining = await store.find({}, { skip: null, limit: null });
      // A removed row is invisible to every read, so it has to be carried in by hand to be evaluated at all.
      all = [...remaining, removed].map((doc) => ({
        id: doc.id as string,
        row: DocumentQueryEvaluator.rowViewOf(doc as unknown as Record<string, unknown>),
      }));
    });
    afterAll(async () => {
      await driver?.close();
    });

    test("every seed is readable", () => {
      expect(all).toHaveLength(seeds.length);
    });

    for (const { name, query } of cases) {
      test(name, async () => {
        const wrapped = q.all(q.empty("removedAt"), query);
        const fromSql = (await store.find(wrapped, { skip: null, limit: null }))
          .map((doc) => doc.id)
          .sort((a, b) => a.localeCompare(b));
        const fromEvaluator = all
          .filter(({ row }) => evaluator.evaluate(wrapped, row))
          .map(({ id }) => id)
          .sort((a, b) => a.localeCompare(b));
        expect(fromEvaluator).toEqual(fromSql);
      });
    }
  });
};

for (const kind of ConformanceEnv.sqlDrivers("query evaluator parity")) describeDriver(kind);
