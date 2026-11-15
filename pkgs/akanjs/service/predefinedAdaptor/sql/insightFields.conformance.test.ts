import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Any, Int } from "akanjs/base";
import { type ConstantModel, ConstantRegistry, via } from "akanjs/constant";
import {
  by,
  createDocumentQueryHelper,
  type DatabaseCls,
  type DatabaseModel,
  DatabaseRegistry,
  type DocumentQuery,
  DocumentSchema,
  from,
  into,
} from "akanjs/document";
import { ConformanceEnv, type SqlDriver, type SqlDriverKind } from "../../../test/conformance";
import { SqlDocumentStore } from "./SqlDocumentStore";
import { sentStatements } from "./sentStatements.fixture";

const q = createDocumentQueryHelper();

class TallyInput extends via((f) => ({
  title: f(String, { text: "title" }),
  status: f(String, { default: "active" }),
  score: f(Int, { default: 0 }),
  weight: f(Any).optional(),
})) {}
class TallyObject extends via(TallyInput, () => ({})) {}
class TallyLight extends via(TallyObject, ["title"] as const, () => ({})) {}
class TallyFull extends via(TallyObject, TallyLight, () => ({})) {}

const lateOrHigh = q.any({ status: "late" }, { score: q.gte(5) });
// With a sum over every row, the read every field shares already holds each document.
class TallyInsight extends via(TallyFull, (f) => ({
  count: f(Int, { default: 0, accumulate: {} }),
  label: f(String, { default: "tally" }),
  activeCount: f(Int, { default: 0, accumulate: { status: "active" } }),
  listedCount: f(Int, { default: 0, accumulate: { status: q.oneOf(["active", "late"]) } }),
  lateOrHighCount: f(Int, { default: 0, accumulate: lateOrHigh }),
  scoreSum: f(Int, { default: 0, accumulate: { $sum: "score" } }),
  weightSum: f(Int, { default: 0, accumulate: { $sum: "weight" } }),
  activeScoreSum: f(Int, { default: 0, accumulate: { $sum: "score", status: "active" } }),
  notCounted: f(Int, { default: 0, accumulate: { $sum: 1 } }),
})) {}
// With counts alone, each condition keeps a read of its own.
class CountsInsight extends via(TallyFull, (f) => ({
  count: f(Int, { default: 0, accumulate: {} }),
  activeCount: f(Int, { default: 0, accumulate: { status: "active" } }),
  lateCount: f(Int, { default: 0, accumulate: { status: "late" } }),
})) {}
// With no field over every row (an insight counts them unless `count` is declared otherwise), no read is shared.
class ConditionsInsight extends via(TallyFull, (f) => ({
  count: f(Int, { default: -1 }),
  activeCount: f(Int, { default: 0, accumulate: { status: "active" } }),
  activeScoreSum: f(Int, { default: 0, accumulate: { $sum: "score", status: "active" } }),
})) {}

const modelOf = (refName: string, insight: typeof TallyInsight | typeof CountsInsight | typeof ConditionsInsight) => {
  const constant = ConstantRegistry.buildModel(refName, TallyInput, TallyObject, TallyFull, TallyLight, insight, {
    TallyInput,
    TallyObject,
    TallyFull,
    TallyLight,
    [`${refName}Insight`]: insight,
  });
  class TallyFilter extends from(TallyFull, () => ({ query: {}, sort: {} })) {}
  class TallyDoc extends by(TallyFull) {}
  class TallyModel extends into(TallyDoc, TallyFilter, constant, () => ({})) {}
  const database = DatabaseRegistry.buildModel(
    refName,
    TallyInput as unknown as DatabaseCls<InstanceType<typeof TallyInput>>,
    TallyDoc,
    TallyModel,
    TallyObject,
    insight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
    TallyFilter,
  );
  return { constant: constant as ConstantModel, database: database as DatabaseModel };
};
const models = {
  tallyConf: modelOf("tallyConf", TallyInsight),
  countsConf: modelOf("countsConf", CountsInsight),
  conditionsConf: modelOf("conditionsConf", ConditionsInsight),
};

const seeds = [
  { title: "alpha one", status: "active", score: 3, weight: 1.5 },
  { title: "alpha two", status: "active", score: 5, weight: "heavy" },
  { title: "beta", status: "late", score: 4, weight: 2 },
  { title: "gamma", status: "draft", score: 9 },
  { title: "delta", status: "draft", score: 0, weight: null },
];

const queries: [name: string, query: DocumentQuery | undefined][] = [
  ["no query", undefined],
  ["every row", {}],
  ["one status", { status: "active" }],
  ["a list of statuses", { status: q.oneOf(["late", "draft"]) }],
  ["a range", { score: q.gte(4) }],
  ["a condition no row meets", { status: "nobody" }],
  ["a text search", q.search("alpha")],
  ["a text search beside a condition", q.all(q.search("alpha"), { score: q.gt(3) })],
];

const describeDriver = (kind: SqlDriverKind) => {
  describe(`sql insight fields (${kind})`, () => {
    let driver: SqlDriver;
    const stores = {} as Record<keyof typeof models, SqlDocumentStore>;

    beforeAll(async () => {
      driver = await ConformanceEnv.openSqlDriver(kind);
      for (const [name, { constant, database }] of Object.entries(models)) {
        const schema = new DocumentSchema().index({ status: 1 });
        const store = new SqlDocumentStore(driver.database, constant, database, schema, driver.dialect);
        await store.ensure();
        for (const seed of seeds) await store.create({ ...seed });
        const removed = await store.create({ title: "alpha removed", status: "active", score: 100, weight: 100 });
        await store.remove(removed.id);
        stores[name as keyof typeof models] = store;
      }
    });
    afterAll(async () => {
      await driver?.close();
    });

    // What each field was before they shared a statement: a count or a sum of its own.
    const fieldByField = async (store: SqlDocumentStore, query: DocumentQuery | undefined) => ({
      count: await store.count(query),
      activeCount: await store.count(q.all(query ?? {}, { status: "active" })),
      lateCount: await store.count(q.all(query ?? {}, { status: "late" })),
      listedCount: await store.count(q.all(query ?? {}, { status: q.oneOf(["active", "late"]) })),
      lateOrHighCount: await store.count(q.all(query ?? {}, lateOrHigh)),
      scoreSum: await store.sum("score", query),
      weightSum: await store.sum("weight", query),
      activeScoreSum: await store.sum("score", q.all(query ?? {}, { status: "active" })),
      notCounted: await store.count(query),
    });

    test("every field answers over the live rows: counts, sums of numbers only, and a default left as declared", async () => {
      expect(await stores.tallyConf.insight({})).toEqual({
        count: 5,
        label: "tally",
        activeCount: 2,
        listedCount: 3,
        lateOrHighCount: 3,
        scoreSum: 21,
        weightSum: 3.5,
        activeScoreSum: 8,
        notCounted: 5,
      });
      expect(await stores.countsConf.insight({ score: q.gte(4) })).toEqual({ count: 3, activeCount: 1, lateCount: 1 });
      expect(await stores.conditionsConf.insight()).toEqual({ count: -1, activeCount: 2, activeScoreSum: 8 });
      expect(await stores.tallyConf.insight({ status: "nobody" })).toMatchObject({
        count: 0,
        scoreSum: 0,
        activeCount: 0,
      });
    });

    for (const [name, query] of queries)
      test(`over ${name}, each field is the count or sum it was on its own`, async () => {
        for (const store of Object.values(stores)) {
          const insight = await store.insight(query);
          const alone = await fieldByField(store, query);
          for (const [field, value] of Object.entries(insight)) {
            if (field === "label" || (field === "count" && store === stores.conditionsConf)) continue;
            expect([store.table, field, value]).toEqual([store.table, field, alone[field as keyof typeof alone]]);
          }
        }
      });

    test("an insight is read in one statement, whatever its fields", async () => {
      for (const store of Object.values(stores)) {
        expect(await sentStatements(driver, () => store.insight({ status: q.oneOf(["active", "late"]) }))).toHaveLength(
          1,
        );
        expect(await sentStatements(driver, () => store.insight(q.search("alpha")))).toHaveLength(1);
      }
    });

    test("a query that reaches removed rows only, or a sum of a base column, is refused as it was field by field", async () => {
      await expect(stores.tallyConf.insight({ removedAt: q.gt(0) })).rejects.toThrow("can never match");
      await expect(stores.conditionsConf.insight({ removedAt: q.gt(0) })).rejects.toThrow("can never match");
      const { constant, database } = modelOf(
        "badSumConf",
        class extends via(TallyFull, (f) => ({
          createdSum: f(Int, { default: 0, accumulate: { $sum: "createdAt" } }),
        })) {} as unknown as typeof CountsInsight,
      );
      const store = new SqlDocumentStore(driver.database, constant, database, new DocumentSchema(), driver.dialect);
      await store.ensure();
      await expect(store.insight({})).rejects.toThrow('sum reads a model field, not "createdAt"');
    });
  });
};

for (const kind of ConformanceEnv.sqlDrivers("sql insight fields")) describeDriver(kind);
