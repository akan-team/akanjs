import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Any, dayjs, Int } from "akanjs/base";
import { type ConstantModel, ConstantRegistry, via } from "akanjs/constant";
import {
  by,
  createDocumentQueryHelper,
  type DatabaseCls,
  type DatabaseModel,
  DatabaseRegistry,
  DocumentSchema,
  from,
  into,
} from "akanjs/document";
import { ConformanceEnv, type SqlDriver, type SqlDriverKind } from "../../test/conformance";
import { SqlDocumentStore } from "./database.adaptor";

// Every case here states the SQLite answer, which is the contract: the in-memory query evaluator that routes live
// sync is pinned to it (`document/queryEvaluator.ts`). A known divergence is `test.failingIf(<driver>)` and carries
// its id from `local/database-modes/`; fixing it turns the case red, which is the cue to drop the marker.

const q = createDocumentQueryHelper();

class ConfInput extends via((f) => ({
  title: f(String, { text: "title" }),
  status: f(String, { default: "active" }),
  score: f(Int, { default: 0 }),
  rank: f(Int).optional(),
  note: f(String).optional(),
  meta: f(Any, { default: () => ({}) }),
  tags: f([String], { default: [] }),
})) {}
class ConfObject extends via(ConfInput, () => ({})) {}
class ConfLight extends via(ConfObject, ["title"] as const, () => ({})) {}
class ConfFull extends via(ConfObject, ConfLight, () => ({})) {}
class ConfInsight extends via(ConfFull, (f) => ({ count: f(Int, { default: 0, accumulate: {} }) })) {}
const confConstant = ConstantRegistry.buildModel(
  "dialectConf",
  ConfInput,
  ConfObject,
  ConfFull,
  ConfLight,
  ConfInsight,
  {
    ConfInput,
    ConfObject,
    ConfFull,
    ConfLight,
    ConfInsight,
  },
);
class ConfFilter extends from(ConfFull, () => ({ query: {}, sort: {} })) {}
class ConfDoc extends by(ConfFull) {}
class ConfModel extends into(ConfDoc, ConfFilter, confConstant, () => ({})) {}
const confDatabase = DatabaseRegistry.buildModel(
  "dialectConf",
  ConfInput as unknown as DatabaseCls<InstanceType<typeof ConfInput>>,
  ConfDoc,
  ConfModel,
  ConfObject,
  ConfInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  ConfFilter,
);

const longField = "aDeliberatelyLongFieldNameThatPushesTheIndexNamePastSixtyThreeBytes";
class IdxInput extends via((f) => ({ [longField]: f(String, { default: "" }) })) {}
class IdxObject extends via(IdxInput, () => ({})) {}
class IdxLight extends via(IdxObject, [longField] as const, () => ({})) {}
class IdxFull extends via(IdxObject, IdxLight, () => ({})) {}
class IdxInsight extends via(IdxFull, (f) => ({ count: f(Int, { default: 0, accumulate: {} }) })) {}
const idxConstant = ConstantRegistry.buildModel("idxConf", IdxInput, IdxObject, IdxFull, IdxLight, IdxInsight, {
  IdxInput,
  IdxObject,
  IdxFull,
  IdxLight,
  IdxInsight,
});
class IdxFilter extends from(IdxFull, () => ({ query: {}, sort: {} })) {}
class IdxDoc extends by(IdxFull) {}
class IdxModel extends into(IdxDoc, IdxFilter, idxConstant, () => ({})) {}
const idxDatabase = DatabaseRegistry.buildModel(
  "idxConf",
  IdxInput as unknown as DatabaseCls<InstanceType<typeof IdxInput>>,
  IdxDoc,
  IdxModel,
  IdxObject,
  IdxInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  IdxFilter,
);

class UniqueInput extends via((f) => ({ label: f(String), code: f(String).optional() })) {}
class UniqueObject extends via(UniqueInput, () => ({})) {}
class UniqueLight extends via(UniqueObject, ["label"] as const, () => ({})) {}
class UniqueFull extends via(UniqueObject, UniqueLight, () => ({})) {}
class UniqueInsight extends via(UniqueFull, (f) => ({ count: f(Int, { default: 0, accumulate: {} }) })) {}
const uniqueConstant = ConstantRegistry.buildModel(
  "uniqueConf",
  UniqueInput,
  UniqueObject,
  UniqueFull,
  UniqueLight,
  UniqueInsight,
  { UniqueInput, UniqueObject, UniqueFull, UniqueLight, UniqueInsight },
);
class UniqueFilter extends from(UniqueFull, () => ({ query: {}, sort: {} })) {}
class UniqueDoc extends by(UniqueFull) {}
class UniqueModel extends into(UniqueDoc, UniqueFilter, uniqueConstant, () => ({})) {}
const uniqueDatabase = DatabaseRegistry.buildModel(
  "uniqueConf",
  UniqueInput as unknown as DatabaseCls<InstanceType<typeof UniqueInput>>,
  UniqueDoc,
  UniqueModel,
  UniqueObject,
  UniqueInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  UniqueFilter,
);

const storeOf = async (
  driver: SqlDriver,
  constant: ConstantModel,
  database: DatabaseModel,
  schema = new DocumentSchema(),
) => {
  const store = new SqlDocumentStore(driver.database, constant, database, schema, driver.dialect);
  await store.ensure();
  return store;
};

const indexNamesOf = async (driver: SqlDriver, table: string) => {
  const sql =
    driver.kind === "postgres"
      ? `SELECT indexname AS "name" FROM pg_indexes WHERE schemaname = current_schema() AND tablename = ? AND indexname NOT LIKE '%_pkey'`
      : `SELECT "name" FROM "sqlite_master" WHERE "type" = 'index' AND "tbl_name" = ? AND "name" NOT LIKE 'sqlite_autoindex%'`;
  const rows = await driver.database.getConnection().prepare(sql).all<{ name: string }>(table);
  return rows.map(({ name }) => name);
};

const titlesOf = (docs: { title?: unknown }[]) => docs.map(({ title }) => String(title));

// Postgres keeps an index whose concurrent build failed, marked invalid; it exists but serves nothing.
const validIndexNamesOf = async (driver: SqlDriver, table: string) => {
  if (driver.kind !== "postgres") return await indexNamesOf(driver, table);
  const rows = await driver.database
    .getConnection()
    .prepare(
      `SELECT c.relname AS "name" FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE i.indrelid = to_regclass(?) AND i.indisvalid AND NOT i.indisprimary`,
    )
    .all<{ name: string }>(`"${table}"`);
  return rows.map(({ name }) => name);
};

const describeDriver = (kind: SqlDriverKind) => {
  const onPostgres = kind === "postgres";

  describe(`sql conformance (${kind})`, () => {
    let driver: SqlDriver;
    let store: SqlDocumentStore;

    beforeAll(async () => {
      driver = await ConformanceEnv.openSqlDriver(kind);
      store = await storeOf(driver, confConstant, confDatabase);
    });
    afterAll(async () => {
      await driver?.close();
    });
    beforeEach(async () => {
      await driver.database.getConnection().execute(`DELETE FROM "dialectConf"`);
    });

    test("a created document reads back with its types", async () => {
      const created = await store.create({
        title: "alpha",
        score: 42,
        rank: 3,
        note: "x",
        tags: ["a", "b"],
        meta: { nested: { deep: 1 } },
      });
      const [found] = await store.find({ id: created.id });
      expect(found).toMatchObject({ title: "alpha", score: 42, rank: 3, note: "x", tags: ["a", "b"] });
      expect(found.meta).toEqual({ nested: { deep: 1 } });
      expect(dayjs.isDayjs(found.createdAt)).toBe(true);
    });

    test("[PG-0] a document is stored as a JSON object", async () => {
      await store.create({ title: "shape" });
      const sql =
        driver.kind === "postgres"
          ? `SELECT jsonb_typeof("_doc") AS "type" FROM "dialectConf"`
          : `SELECT json_type("_doc") AS "type" FROM "dialectConf"`;
      expect(await driver.database.getConnection().prepare(sql).all()).toEqual([{ type: "object" }]);
    });

    test("[PG-0] a filter on a document field finds the document", async () => {
      await store.create({ title: "wanted", status: "draft" });
      await store.create({ title: "other" });
      expect(titlesOf(await store.find({ status: "draft" }))).toEqual(["wanted"]);
    });

    test("[PG-3] count() answers a number", async () => {
      await store.create({ title: "one" });
      expect(await store.count({})).toBe(1);
    });

    test("[DI-1] a nested set creates the parents it needs", async () => {
      const { id } = await store.create({ title: "nested" });
      await store.updateOneByQuery({ id }, { "meta.a.b": 1 });
      const [found] = await store.find({ id });
      expect(found.meta).toEqual({ a: { b: 1 } });
    });

    test("[DI-2] contains ignores ASCII case", async () => {
      await store.create({ title: "greeting", note: "Hello World" });
      expect(titlesOf(await store.find({ note: q.contains("hello") }))).toEqual(["greeting"]);
    });

    test("[DI-3] contains treats % and _ as literal characters", async () => {
      await store.create({ title: "percent", note: "50% off" });
      await store.create({ title: "number", note: "500 items" });
      await store.create({ title: "underscore", note: "a_b" });
      await store.create({ title: "letter", note: "axb" });
      expect(titlesOf(await store.find({ note: q.contains("50%") }))).toEqual(["percent"]);
      expect(titlesOf(await store.find({ note: q.contains("a_b") }))).toEqual(["underscore"]);
    });

    test("[DI-4] eq null matches a stored null and an absent value alike", async () => {
      await store.create({ title: "stored-null", note: null });
      await store.create({ title: "absent" });
      await store.create({ title: "present", note: "x" });
      expect(titlesOf(await store.find({ note: null })).sort((a, b) => a.localeCompare(b))).toEqual([
        "absent",
        "stored-null",
      ]);
    });

    test("[DI-5] ne leaves a stored null out, as it leaves an absent value out", async () => {
      await store.create({ title: "stored-null", note: null });
      await store.create({ title: "absent" });
      await store.create({ title: "present", note: "x" });
      expect(titlesOf(await store.find({ note: q.ne("y") }))).toEqual(["present"]);
    });

    test("[DI-6] lt leaves a stored null out", async () => {
      await store.create({ title: "stored-null", rank: null });
      await store.create({ title: "five", rank: 5 });
      expect(titlesOf(await store.find({ rank: q.lt(10) }))).toEqual(["five"]);
    });

    test("[DI-7] an ascending sort puts a missing value first", async () => {
      await store.create({ title: "b", note: "b" });
      await store.create({ title: "none" });
      await store.create({ title: "a", note: "a" });
      expect(titlesOf(await store.find({}, { sort: { note: 1 } }))).toEqual(["none", "a", "b"]);
    });

    test("[DI-8] strings sort in byte order, capitals first", async () => {
      await store.create({ title: "lower", note: "a" });
      await store.create({ title: "upper", note: "B" });
      expect(titlesOf(await store.find({}, { sort: { note: 1 } }))).toEqual(["upper", "lower"]);
    });

    test("[DI-9] a string holding U+0000 is refused before it is stored", async () => {
      await expect(store.create({ title: "nul\u0000byte" })).rejects.toThrow("NUL");
      expect(await store.find({})).toHaveLength(0);
    });

    test("[FTS] q.search finds a document by a word of its title", async () => {
      await store.create({ title: "Quarterly revenue report" });
      await store.create({ title: "Team offsite" });
      expect(titlesOf(await store.find(q.search("revenue")))).toEqual(["Quarterly revenue report"]);
    });

    test("[DDL-3] two indexes whose names differ past 63 bytes both exist", async () => {
      await storeOf(
        driver,
        idxConstant,
        idxDatabase,
        new DocumentSchema().index({ [longField]: 1 }).index({ [longField]: -1 }),
      );
      expect(await indexNamesOf(driver, "idxConf")).toHaveLength(2);
    });

    test("[X-4] a unique index refuses a repeated value and admits repeated nulls", async () => {
      const uniqueStore = await storeOf(
        driver,
        uniqueConstant,
        uniqueDatabase,
        new DocumentSchema().index({ code: 1 }, { unique: true }),
      );
      await uniqueStore.create({ label: "first", code: "A" });
      await expect(uniqueStore.create({ label: "repeat", code: "A" })).rejects.toThrow();
      await uniqueStore.create({ label: "null-1", code: null });
      await uniqueStore.create({ label: "null-2", code: null });
      expect(await uniqueStore.find({})).toHaveLength(3);
    });
  });

  // Each case starts from an empty database and opens a second adaptor on it — another process of the same app.
  describe(`sql schema (${kind})`, () => {
    let driver: SqlDriver;
    const siblings: SqlDriver[] = [];
    const sibling = async () => {
      const opened = await driver.sibling();
      siblings.push(opened);
      return opened;
    };
    const codeIndex = (unique: boolean) => new DocumentSchema().index({ code: 1 }, { unique, name: "uniqueConf_code" });

    beforeEach(async () => {
      driver = await ConformanceEnv.openSqlDriver(kind);
    });
    afterEach(async () => {
      for (const opened of siblings.splice(0)) await opened.close();
      await driver?.close();
    });

    test("[DDL-1] a table ensured by several processes at once is created once", async () => {
      const processes = [driver, await sibling(), await sibling()];
      const schema = () => new DocumentSchema().index({ code: 1 }).index({ label: 1 });
      await Promise.all(
        [...processes, ...processes].map(async (each) => await storeOf(each, uniqueConstant, uniqueDatabase, schema())),
      );
      expect(await validIndexNamesOf(driver, "uniqueConf")).toHaveLength(2);
    });

    test("[DDL-1] the ensure getStore() starts and the one a model awaits are one run", async () => {
      // A cold pool has one connection and runs the two back to back; a booted server's pool has several.
      const sleep = driver.kind === "postgres" ? "SELECT pg_sleep(0.05)" : "SELECT 1";
      await Promise.all([1, 2, 3, 4].map(async () => await driver.database.getConnection().execute(sleep)));
      const store = driver.database.getStore(uniqueConstant, uniqueDatabase, codeIndex(false));
      await Promise.all([store.ensure(), store.ensure()]);
      expect(await validIndexNamesOf(driver, "uniqueConf")).toEqual(["uniqueConf_code"]);
    });

    test("[DDL-2] an index declared on a table that already holds rows is built", async () => {
      const store = await storeOf(driver, uniqueConstant, uniqueDatabase);
      await store.create({ label: "first", code: "A" });
      await storeOf(await sibling(), uniqueConstant, uniqueDatabase, codeIndex(false));
      expect(await validIndexNamesOf(driver, "uniqueConf")).toEqual(["uniqueConf_code"]);
    });

    test.if(onPostgres)("[DDL-5] an index on an array field serves `has`", async () => {
      await storeOf(driver, confConstant, confDatabase, new DocumentSchema().index({ tags: 1 }));
      const [index] = await driver.database
        .getConnection()
        .prepare(
          `SELECT indexdef AS "definition" FROM pg_indexes WHERE tablename = 'dialectConf' AND indexname LIKE '%_tags_%'`,
        )
        .all<{ definition: string }>();
      expect(index?.definition).toContain("USING gin");
    });

    test("[DDL-4] a changed index descriptor rebuilds the index", async () => {
      const store = await storeOf(driver, uniqueConstant, uniqueDatabase, codeIndex(false));
      await store.create({ label: "first", code: "A" });
      const rebuilt = await storeOf(await sibling(), uniqueConstant, uniqueDatabase, codeIndex(true));
      await expect(rebuilt.create({ label: "repeat", code: "A" })).rejects.toThrow();
      expect(await validIndexNamesOf(driver, "uniqueConf")).toEqual(["uniqueConf_code"]);
    });

    test("[DDL-4] a rebuild the rows refuse leaves the old index in place", async () => {
      const store = await storeOf(driver, uniqueConstant, uniqueDatabase, codeIndex(false));
      await store.create({ label: "first", code: "A" });
      await store.create({ label: "repeat", code: "A" });
      await expect(storeOf(await sibling(), uniqueConstant, uniqueDatabase, codeIndex(true))).rejects.toThrow();
      expect(await validIndexNamesOf(driver, "uniqueConf")).toEqual(["uniqueConf_code"]);
      await store.create({ label: "again", code: "A" });
    });
  });

  // A failed transaction can leave its connection open inside the pool (see [PG-1]), so each of these gets storage
  // of its own and closes it, rather than poisoning the cases above.
  describe(`sql transactions (${kind})`, () => {
    let driver: SqlDriver;
    let store: SqlDocumentStore;

    beforeEach(async () => {
      driver = await ConformanceEnv.openSqlDriver(kind);
      store = await storeOf(driver, confConstant, confDatabase);
    });
    afterEach(async () => {
      await driver?.close();
    });

    test("[PG-1] transaction() commits what it wrote", async () => {
      await driver.database.transaction(async () => {
        await store.create({ title: "in-transaction" });
      });
      expect(titlesOf(await store.find({}))).toEqual(["in-transaction"]);
    });

    test("[PG-1] writes after a failed transaction() are committed", async () => {
      await driver.database.transaction(async () => undefined).catch(() => undefined);
      for (const title of ["after-1", "after-2"]) await store.create({ title });
      driver = await driver.restart();
      store = await storeOf(driver, confConstant, confDatabase);
      expect(titlesOf(await store.find({})).sort((a, b) => a.localeCompare(b))).toEqual(["after-1", "after-2"]);
    });

    test("[PG-2] transaction() rolls back what it wrote when it throws", async () => {
      const transaction = driver.database.transaction(async () => {
        await store.create({ title: "rolled-back" });
        throw new Error("rollback-probe");
      });
      await expect(transaction).rejects.toThrow("rollback-probe");
      expect(await store.find({})).toHaveLength(0);
    });

    test("[SQ-1] two concurrent transactions both commit", async () => {
      const write = (title: string) =>
        driver.database.transaction(async () => {
          await store.create({ title });
          await Bun.sleep(10);
          await store.create({ title: `${title}-2` });
        });
      await Promise.all([write("first"), write("second")]);
      expect(titlesOf(await store.find({})).sort((a, b) => a.localeCompare(b))).toEqual([
        "first",
        "first-2",
        "second",
        "second-2",
      ]);
    });

    test("[SQ-2] a write from another request is not rolled back with a transaction", async () => {
      let entered!: () => void;
      const inside = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const transaction = driver.database.transaction(async () => {
        await store.create({ title: "transaction-write" });
        entered();
        await Bun.sleep(20);
        throw new Error("rollback-probe");
      });
      await Promise.race([inside, transaction.catch(() => undefined)]);
      const outside = store.create({ title: "outside-write" });
      await expect(transaction).rejects.toThrow("rollback-probe");
      await outside;
      expect(titlesOf(await store.find({}))).toEqual(["outside-write"]);
    });
  });

  // Two requests — or two processes — holding the same document each change a different field.
  describe(`sql saves (${kind})`, () => {
    let driver: SqlDriver;
    let store: SqlDocumentStore;
    const siblings: SqlDriver[] = [];

    beforeEach(async () => {
      driver = await ConformanceEnv.openSqlDriver(kind);
      store = await storeOf(driver, confConstant, confDatabase);
    });
    afterEach(async () => {
      for (const opened of siblings.splice(0)) await opened.close();
      await driver?.close();
    });

    test("[D4] a save writes the fields it changed and leaves the rest to other writers", async () => {
      const { id } = await store.create({ title: "Draft", score: 1, tags: ["a"] });
      const [first, second] = [await store.pickById(id), await store.pickById(id)];
      await first.set({ title: "Published", tags: ["a", "b"] }).save();
      await second.set({ score: 2 }).save();
      const saved = await store.pickById(id);
      expect([saved.title, saved.score, saved.tags]).toEqual(["Published", 2, ["a", "b"]]);
    });

    test("[D4] a document read through a list saves only what changed, from another process", async () => {
      const { id } = await store.create({ title: "Draft", score: 1 });
      const sibling = await driver.sibling();
      siblings.push(sibling);
      const elsewhere = await storeOf(sibling, confConstant, confDatabase);
      const [listed] = await store.find({});
      await (await elsewhere.pickById(id)).set({ score: 7 }).save();
      await listed.set({ note: "reviewed" }).save();
      const saved = await elsewhere.pickById(id);
      expect([saved.title, saved.score, saved.note]).toEqual(["Draft", 7, "reviewed"]);
    });

    test("[D4] a save hook sees the stored document with this save's changes, and what it derives is written", async () => {
      const seen: unknown[] = [];
      const schema = new DocumentSchema();
      schema.pre("save", function (this: { title?: string; score?: number; note?: string | null }) {
        seen.push([this.title, this.score]);
        this.note = `${this.title}:${this.score}`;
      });
      const hooked = await storeOf(driver, confConstant, confDatabase, schema);
      const { id } = await hooked.create({ title: "Draft", score: 1 });
      const stale = await hooked.pickById(id);
      await (await hooked.pickById(id)).set({ title: "Published" }).save();
      await stale.set({ score: 2 }).save();
      expect(seen.at(-1)).toEqual(["Published", 2]);
      expect((await hooked.pickById(id)).note).toBe("Published:2");
    });

    test("[L-1] a document handed to another process as text comes back as the same document", async () => {
      const created = await store.create({ title: "Draft", score: 3, tags: ["a"], meta: { nested: { n: 1 } } });
      const saved = await (await store.pickById(created.id)).set({ removedAt: null, note: "n" }).save();
      const sibling = await driver.sibling();
      siblings.push(sibling);
      const elsewhere = await storeOf(sibling, confConstant, confDatabase);
      const crossed = elsewhere.deserialize(store.serialize(saved));
      expect(crossed.id).toBe(saved.id);
      expect(crossed.createdAt.valueOf()).toBe(saved.createdAt.valueOf());
      expect([crossed.title, crossed.score, crossed.tags, crossed.meta, crossed.note]).toEqual([
        "Draft",
        3,
        ["a"],
        { nested: { n: 1 } },
        "n",
      ]);
    });

    test("[D4] a refreshed document saves only what changed after the refresh", async () => {
      const { id } = await store.create({ title: "Draft", score: 1 });
      const held = await store.pickById(id);
      await (await store.pickById(id)).set({ score: 2 }).save();
      await held.refresh();
      await (await store.pickById(id)).set({ score: 3 }).save();
      await held.set({ title: "Published" }).save();
      const saved = await store.pickById(id);
      expect([saved.title, saved.score]).toEqual(["Published", 3]);
    });

    test("[D4] saving a document twice writes the second change only", async () => {
      const { id } = await store.create({ title: "Draft", score: 1 });
      const other = await store.pickById(id);
      const saved = await (await store.pickById(id)).set({ title: "Published" }).save();
      await other.set({ score: 5 }).save();
      await saved.set({ rank: 3 }).save();
      const stored = await store.pickById(id);
      expect([stored.title, stored.score, stored.rank]).toEqual(["Published", 5, 3]);
    });
  });
};

for (const kind of ConformanceEnv.sqlDrivers("sql conformance")) describeDriver(kind);

describe.skipIf(!ConformanceEnv.has("sql conformance", "libsql"))("sql conformance (libsql server)", () => {
  let driver: SqlDriver;
  beforeAll(async () => {
    driver = await ConformanceEnv.openSqlDriver("libsqlRemote");
  });
  afterAll(async () => {
    await driver?.close();
  });

  test("[B3] transaction() rolls back on a remote libsql", async () => {
    const table = ConformanceEnv.uniqueName("tx");
    const connection = driver.database.getConnection();
    await connection.execute(`CREATE TABLE "${table}" ("id" TEXT)`);
    try {
      const transaction = driver.database.transaction(async () => {
        await driver.database.getConnection().execute(`INSERT INTO "${table}" VALUES ('a')`);
        throw new Error("rollback-probe");
      });
      await expect(transaction).rejects.toThrow("rollback-probe");
      const row = await connection.prepare(`SELECT count(*) AS "c" FROM "${table}"`).get<{ c: number }>();
      expect(Number(row?.c)).toBe(0);
    } finally {
      await connection.execute(`DROP TABLE IF EXISTS "${table}"`);
    }
  });
});
