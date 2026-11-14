import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ID, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import {
  by,
  createDocumentQueryHelper,
  type DatabaseCls,
  DatabaseRegistry,
  DocumentSchema,
  from,
  into,
} from "akanjs/document";
import { ConformanceEnv, type SqlDriver, type SqlDriverKind } from "../../../test/conformance";
import { RawDocumentTable } from "./RawDocumentTable";
import { SqlDocumentStore } from "./SqlDocumentStore";
import { sentStatements } from "./sentStatements.fixture";

const q = createDocumentQueryHelper();

class ShapeInput extends via((f) => ({
  title: f(String),
  status: f(String, { default: "active" }),
  ownerId: f(ID, { default: "" }),
  score: f(Int, { default: 0 }),
})) {}
class ShapeObject extends via(ShapeInput, () => ({})) {}
class ShapeLight extends via(ShapeObject, ["title"] as const, () => ({})) {}
class ShapeFull extends via(ShapeObject, ShapeLight, () => ({})) {}
class ShapeInsight extends via(ShapeFull, (f) => ({
  count: f(Int, { default: 0, accumulate: {} }),
  activeCount: f(Int, { default: 0, accumulate: { status: "active" } }),
  scoreSum: f(Int, { default: 0, accumulate: { $sum: "score" } }),
})) {}
const shapeConstant = ConstantRegistry.buildModel(
  "shapeConf",
  ShapeInput,
  ShapeObject,
  ShapeFull,
  ShapeLight,
  ShapeInsight,
  { ShapeInput, ShapeObject, ShapeFull, ShapeLight, ShapeInsight },
);
class ShapeFilter extends from(ShapeFull, () => ({ query: {}, sort: {} })) {}
class ShapeDoc extends by(ShapeFull) {}
class ShapeModel extends into(ShapeDoc, ShapeFilter, shapeConstant, () => ({})) {}
const shapeDatabase = DatabaseRegistry.buildModel(
  "shapeConf",
  ShapeInput as unknown as DatabaseCls<InstanceType<typeof ShapeInput>>,
  ShapeDoc,
  ShapeModel,
  ShapeObject,
  ShapeInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  ShapeFilter,
);

const pages = Array.from({ length: 12 }, (_, page) => page * 10);
const listLengths = [2, 3, 7, 40, 150];

const describeDriver = (kind: SqlDriverKind) => {
  // SQLite keeps a placeholder per list value (its planner reads the list's length off them), so there a list's
  // length is part of the text; a page of it still is not.
  const textsPerList = kind === "postgres" ? 1 : listLengths.length;

  describe(`sql statement shapes (${kind})`, () => {
    let driver: SqlDriver;
    let store: SqlDocumentStore;
    let ids: string[];

    beforeAll(async () => {
      driver = await ConformanceEnv.openSqlDriver(kind);
      store = new SqlDocumentStore(driver.database, shapeConstant, shapeDatabase, new DocumentSchema(), driver.dialect);
      await store.ensure();
      await store.createMany(
        Array.from({ length: 200 }, (_, idx) => ({
          title: `row ${idx}`,
          status: idx % 3 ? "active" : "draft",
          ownerId: `u${idx % 20}`,
          score: idx,
        })),
      );
      ids = await store.findIds({}, { limit: null });
    });
    afterAll(async () => {
      await driver?.close();
    });

    const textsOf = async (run: () => Promise<unknown>) => new Set(await sentStatements(driver, run));

    test("every page of a list, and every value it filters by, is read with one text", async () => {
      const texts = await textsOf(async () => {
        for (const skip of [undefined, null, ...pages])
          for (const status of ["active", "draft", "it's none"]) await store.find({ status }, { limit: 10, skip });
      });
      expect([...texts]).toHaveLength(1);
      const idTexts = await textsOf(async () => {
        for (const skip of pages) await store.findIds({ ownerId: `u${skip}` }, { limit: 10, skip, sort: { score: 1 } });
      });
      expect([...idTexts]).toHaveLength(1);
      const selected = await textsOf(async () => {
        for (const skip of pages) await store.find({}, { limit: 10, skip, select: { title: true } });
      });
      expect([...selected]).toHaveLength(1);
    });

    test("a list of values is read with one text whatever its length and whichever page, by id and by field", async () => {
      const conditions = {
        "an id": (length: number) => ({ id: q.oneOf(ids.slice(0, length)) }),
        "a declared string": (length: number) => ({ ownerId: q.oneOf(ids.slice(0, length)) }),
        "a number": (length: number) => ({ score: q.oneOf(Array.from({ length }, (_, idx) => idx)) }),
        "a negated list": (length: number) => ({ status: q.notOneOf(ids.slice(0, length)) }),
        "two lists": (length: number) => ({
          id: q.oneOf(ids.slice(0, length)),
          score: q.notOneOf(ids.slice(0, length)),
        }),
      };
      for (const [name, condition] of Object.entries(conditions)) {
        const texts = await textsOf(async () => {
          for (const length of listLengths)
            for (const skip of pages.slice(0, 4)) await store.find(condition(length), { limit: 10, skip });
        });
        expect([name, texts.size]).toEqual([name, textsPerList]);
      }
    });

    test("a count, a write and a raw read by a list send one text whatever the list's length", async () => {
      const counted = await textsOf(async () => {
        for (const length of listLengths) await store.count({ id: q.oneOf(ids.slice(0, length)) });
      });
      expect(counted.size).toBe(textsPerList);
      const written = await textsOf(async () => {
        for (const length of listLengths)
          await store.updateManyByQuery({ id: q.oneOf(ids.slice(0, length)) }, { score: 1 }, { touch: false });
      });
      expect(written.size).toBe(textsPerList);
      const table = new RawDocumentTable("shapeConf", () => driver.database.getConnection(), driver.dialect);
      await table.exists();
      const raw = await textsOf(async () => {
        for (const length of listLengths) await table.find({ id: { $in: ids.slice(0, length) } }, { limit: 5 });
      });
      expect(raw.size).toBe(textsPerList);
    });

    test("an insight sends one text whatever it is asked over", async () => {
      const texts = await textsOf(async () => {
        for (const status of ["active", "draft"])
          for (const score of [1, 50, 150]) await store.insight({ status, score });
      });
      expect([...texts]).toHaveLength(1);
    });

    test("a skip that is no whole number is answered as it was while it was written into the text", async () => {
      const sorted = (await store.find({}, { sort: { title: 1 }, limit: null })).map(({ title }) => String(title));
      const page = async (skip: unknown, limit: number | null = 2) =>
        (await store.find({}, { sort: { title: 1 }, limit, skip: skip as number })).map(({ title }) => String(title));
      const ids = async (skip: unknown) =>
        (await store.findIds({}, { sort: { title: 1 }, limit: 2, skip: skip as number })).length;
      for (const none of [Number.NaN, "abc", null, undefined, 0, -0]) {
        expect([none, await page(none)]).toEqual([none, sorted.slice(0, 2)]);
        expect(await page(none, null)).toEqual(sorted);
      }
      expect(await page("2")).toEqual(sorted.slice(2, 4));
      expect(await page(198)).toEqual(sorted.slice(198));
      expect(await page(500)).toEqual([]);
      expect(await ids(Number.NaN)).toBe(2);
      if (kind === "postgres") {
        // A fraction rounds half away from zero, and what rounds below zero is refused as a negative offset is.
        for (const [skip, from] of [
          [0.4, 0],
          [0.5, 1],
          [1.5, 2],
          [2.5, 3],
          [-0.4, 0],
        ])
          expect([skip, await page(skip)]).toEqual([skip, sorted.slice(from, from + 2)]);
        expect(await page(2.5, null)).toEqual(sorted.slice(3));
        for (const negative of [-1, -0.5, -1.5])
          await expect(page(negative)).rejects.toThrow("OFFSET must not be negative");
      } else {
        for (const fraction of [0.4, 0.5, 1.5, -0.4, -1.5])
          await expect(page(fraction)).rejects.toThrow("datatype mismatch");
        expect(await page(-1)).toEqual(sorted.slice(0, 2));
        await expect(page(2, null)).rejects.toThrow("syntax error");
      }
      for (const beyond of [Number.POSITIVE_INFINITY, 1e21]) await expect(page(beyond)).rejects.toThrow();
    });

    // SQLite compiles a bound LIMIT into the statement and prepares it again each time the parameter is bound.
    test("what a plan depends on stays in the text: the page size, no limit at all, and a list of one value", async () => {
      const sizes = await textsOf(async () => {
        for (const limit of [10, 20, null]) await store.find({ status: "active" }, { limit });
      });
      const limits = [...sizes].map((text) => /LIMIT (\d+) OFFSET \?$/.exec(text)?.[1] ?? "none");
      expect(new Set(limits)).toEqual(new Set(["10", "20", "none"]));
      const lists = await textsOf(async () => {
        for (const length of [1, 2, 3]) await store.findIds({ id: q.oneOf(ids.slice(0, length)) }, { limit: null });
      });
      expect(lists.size).toBe(kind === "postgres" ? 2 : 3);
    });
  });
};

for (const kind of ConformanceEnv.sqlDrivers("sql statement shapes")) describeDriver(kind);
