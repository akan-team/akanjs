import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Any, dayjs, Int } from "akanjs/base";
import { Logger } from "akanjs/common";
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
import { descriptorHash } from "./sql/values";

// Every case states the SQLite answer, the contract live sync's in-memory evaluator is pinned to. A known divergence is
// `test.failingIf(<driver>)` with its `local/database-modes/` id; fixing it turns the case red, the cue to drop it.

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

class FrozenInput extends via((f) => ({ label: f(String), kind: f(String, { immutable: true }) })) {}
class FrozenObject extends via(FrozenInput, () => ({})) {}
class FrozenLight extends via(FrozenObject, ["label"] as const, () => ({})) {}
class FrozenFull extends via(FrozenObject, FrozenLight, () => ({})) {}
class FrozenInsight extends via(FrozenFull, (f) => ({ count: f(Int, { default: 0, accumulate: {} }) })) {}
const frozenConstant = ConstantRegistry.buildModel(
  "frozenConf",
  FrozenInput,
  FrozenObject,
  FrozenFull,
  FrozenLight,
  FrozenInsight,
  { FrozenInput, FrozenObject, FrozenFull, FrozenLight, FrozenInsight },
);
class FrozenFilter extends from(FrozenFull, () => ({ query: {}, sort: {} })) {}
class FrozenDoc extends by(FrozenFull) {}
class FrozenModel extends into(FrozenDoc, FrozenFilter, frozenConstant, () => ({})) {}
const frozenDatabase = DatabaseRegistry.buildModel(
  "frozenConf",
  FrozenInput as unknown as DatabaseCls<InstanceType<typeof FrozenInput>>,
  FrozenDoc,
  FrozenModel,
  FrozenObject,
  FrozenInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  FrozenFilter,
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

    test("a descending sort puts a missing value last", async () => {
      await store.create({ title: "b", note: "b" });
      await store.create({ title: "none" });
      await store.create({ title: "a", note: "a" });
      expect(titlesOf(await store.find({}, { sort: { note: -1 } }))).toEqual(["b", "a", "none"]);
    });

    test("rows the sort ties on come back by id in the last key's direction, page after page", async () => {
      const ids: string[] = [];
      for (const title of ["t1", "t2", "t3", "t4", "t5"]) ids.push((await store.create({ title, score: 1 })).id);
      const ascending = [...ids].sort();
      const paged = async (sort: { [path: string]: 1 | -1 }) => {
        const pages = await Promise.all([0, 2, 4].map((skip) => store.find({}, { sort, skip, limit: 2 })));
        return pages.flat().map(({ id }) => id);
      };
      expect(await paged({ score: -1 })).toEqual([...ascending].reverse());
      expect(await paged({ score: 1 })).toEqual(ascending);
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

    test("a MongoDB text index builds nothing and warns, the next index keeps its name, and a long value is written", async () => {
      const warnings: string[] = [];
      const removeSink = Logger.addSink((entry) => void warnings.push(entry.plainMessage), { minLevel: "warn" });
      try {
        const store = await storeOf(
          driver,
          confConstant,
          confDatabase,
          new DocumentSchema().index({ note: "text" }).index({ status: 1 }),
        );
        expect(await validIndexNamesOf(driver, "dialectConf")).toEqual(["dialectConf_status_1"]);
        const textWarnings = warnings.filter((message) => message.includes("MongoDB's text index"));
        expect(textWarnings).toHaveLength(1);
        expect(textWarnings[0]).toContain('Index {"note":"text"} on dialectConf is not built');
        expect(textWarnings[0]).toContain('field(String, { text: "desc" })');
        expect(textWarnings[0]).not.toContain("Dropped");
        const long = Array.from(crypto.getRandomValues(new Uint8Array(6000)), (byte) => byte.toString(16)).join("");
        await store.create({ title: "long", note: long });
        expect(titlesOf(await store.find({ note: long }))).toEqual(["long"]);
      } finally {
        removeSink();
      }
    });

    test("the B-tree an earlier boot built from a text index is dropped on proof, and no other index", async () => {
      const legacy = await storeOf(driver, confConstant, confDatabase);
      const connection = driver.database.getConnection();
      const legacyIndex = (name: string, path: string) =>
        driver.dialect.createIndex({
          name,
          table: "dialectConf",
          unique: false,
          columns: [{ path, expr: legacy.compiler.fieldExpr(path), isArray: false }],
        });
      // What a boot before this release left: the B-tree and the hash of the descriptor that built it.
      await connection.execute(legacyIndex("dialectConf_note_0", "note"));
      await driver.database.setMeta(
        "index:dialectConf:dialectConf_note_0",
        await descriptorHash({ fields: { note: "text" } }),
      );
      await connection.execute(legacyIndex("dialectConf_title_1", "title"));

      const warnings: string[] = [];
      const removeSink = Logger.addSink((entry) => void warnings.push(entry.plainMessage), { minLevel: "warn" });
      const textIndexes = () => new DocumentSchema().index({ note: "text" }).index({ title: "text" });
      try {
        await storeOf(await sibling(), confConstant, confDatabase, textIndexes());
        expect(await validIndexNamesOf(driver, "dialectConf")).toEqual(["dialectConf_title_1"]);
        expect(await driver.database.getMeta("index:dialectConf:dialectConf_note_0")).toBe("");
        expect(warnings.filter((message) => message.includes("Dropped dialectConf_note_0"))).toHaveLength(1);
        expect(warnings.filter((message) => message.includes("Dropped dialectConf_title_1"))).toHaveLength(0);

        warnings.length = 0;
        await storeOf(await sibling(), confConstant, confDatabase, textIndexes());
        expect(warnings.filter((message) => message.includes("MongoDB's text index"))).toHaveLength(2);
        expect(warnings.filter((message) => message.includes("Dropped"))).toHaveLength(0);

        await storeOf(await sibling(), confConstant, confDatabase, new DocumentSchema().index({ note: 1 }));
        expect((await validIndexNamesOf(driver, "dialectConf")).sort()).toEqual([
          "dialectConf_note_0",
          "dialectConf_title_1",
        ]);
        expect(warnings.filter((message) => message.includes("changed its descriptor"))).toHaveLength(0);
      } finally {
        removeSink();
      }
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

  // A failed transaction can leave its pooled connection open ([PG-1]), so each of these gets storage of its own.
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

    test("changing an immutable field is a 400 naming the field, and the row keeps its value", async () => {
      const frozen = await storeOf(driver, frozenConstant, frozenDatabase);
      const { id } = await frozen.create({ label: "first", kind: "channel" });
      await expect(frozen.update(id, { kind: "dm" })).rejects.toMatchObject({
        message: "base.error.immutableField",
        statusCode: 400,
        data: { field: "kind" },
      });
      const held = await frozen.pickById(id);
      await expect(held.set({ kind: "dm", label: "renamed" }).save()).rejects.toMatchObject({
        data: { field: "kind" },
      });
      const stored = await frozen.pickById(id);
      expect([stored.kind, stored.label]).toEqual(["channel", "first"]);
      await held.set({ kind: "channel" }).save();
      expect((await frozen.pickById(id)).label).toBe("renamed");
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

  describe(`sql removed rows (${kind})`, () => {
    let driver: SqlDriver;
    let store: SqlDocumentStore;
    const removedAtOf = async (id: string) =>
      (await store.findOne({ id }, { withRemoved: true }))?.removedAt?.valueOf() as number | undefined;

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

    test("a read skips a removed row unless it names { withRemoved: true }", async () => {
      await store.create({ title: "kept" });
      const { id } = await store.create({ title: "gone" });
      await store.remove(id);
      expect(titlesOf(await store.find({}))).toEqual(["kept"]);
      expect(titlesOf(await store.find({}, { withRemoved: true })).sort()).toEqual(["gone", "kept"]);
      expect(titlesOf(await store.find(q.exists("removedAt"), { withRemoved: true }))).toEqual(["gone"]);
      expect(await store.count({}, { withRemoved: true })).toBe(2);
      expect(await store.exists({ id })).toBeNull();
      expect(await store.exists({ id }, { withRemoved: true })).toBe(id);
      const removed = await store.findOne({ id }, { withRemoved: true });
      expect(removed?.title).toBe("gone");
      expect(dayjs.isDayjs(removed?.removedAt)).toBe(true);
    });

    test("a removedAt window reads the rows removed inside it", async () => {
      const early = await store.create({ title: "early" });
      const late = await store.create({ title: "late" });
      await store.updateOneByQuery({ id: early.id }, { removedAt: dayjs().subtract(10, "day") });
      await store.updateOneByQuery({ id: late.id }, { removedAt: dayjs().subtract(1, "day") });
      const cutoff = dayjs().subtract(5, "day");
      expect(titlesOf(await store.find({ removedAt: q.gte(cutoff) }, { withRemoved: true }))).toEqual(["late"]);
      expect(await store.count({ removedAt: q.lt(cutoff) }, { withRemoved: true })).toBe(1);
    });

    test("a query only a removed row can match is refused without the flag; an IS NULL form is not", async () => {
      await store.create({ title: "live" });
      const refused = [
        q.exists("removedAt"),
        q.not(q.empty("removedAt")),
        { removedAt: q.gt(dayjs(0)) },
        { removedAt: q.ne(null) },
        { removedAt: { exists: true } },
        q.any({ title: "live" }, q.exists("removedAt")),
      ];
      for (const query of refused)
        await expect(store.find(query)).rejects.toThrow(
          /^find on "dialectConf" can never match \(.+\); pass \{ withRemoved: true \}$/,
        );
      await expect(store.count(q.exists("removedAt"))).rejects.toThrow('count on "dialectConf" can never match');
      await expect(store.exists({ removedAt: q.gte(dayjs(0)) })).rejects.toThrow("compares a value no live row holds");
      const allowed = [
        q.empty("removedAt"),
        q.missing("removedAt"),
        { removedAt: null },
        { removedAt: q.eq(null) },
        { removedAt: { empty: true } },
        { removedAt: { missing: true } },
        { removedAt: { exists: false } },
        q.not(q.exists("removedAt")),
      ];
      for (const query of allowed) expect(titlesOf(await store.find(query))).toEqual(["live"]);
    });

    test("an update reaches a removed row only with the flag, and leaves its removedAt", async () => {
      const { id } = await store.create({ title: "gone", score: 1 });
      const other = await store.create({ title: "other", status: "x" });
      const sibling = await store.create({ title: "sibling", status: "x" });
      await store.remove(id);
      await store.removeManyByQuery({ status: "x" });
      const removedAt = await removedAtOf(id);
      const removedQuery = q.all({ id }, q.exists("removedAt"));
      await expect(store.updateOneByQuery(removedQuery, { score: 2 })).rejects.toThrow(
        'updateOneByQuery on "dialectConf" can never match',
      );
      expect(await store.updateOneByQuery(removedQuery, { score: 2 }, { withRemoved: true })).toMatchObject({
        matchedCount: 1,
        modifiedCount: 1,
      });
      expect((await store.findOne({ id }, { withRemoved: true }))?.score).toBe(2);
      expect(await removedAtOf(id)).toBe(removedAt as number);

      await expect(store.updateManyByQuery(q.exists("removedAt"), { status: "y" })).rejects.toThrow(
        'updateManyByQuery on "dialectConf" can never match',
      );
      const { modifiedCount } = await store.updateManyByQuery(
        q.all({ status: "x" }, q.exists("removedAt")),
        { status: "y" },
        { withRemoved: true },
      );
      expect(modifiedCount).toBe(2);
      expect(await store.count({ status: "y" }, { withRemoved: true })).toBe(2);
      expect(await store.count({ status: "y" })).toBe(0);
      expect(await removedAtOf(other.id)).toBeTruthy();
      expect(await removedAtOf(sibling.id)).toBeTruthy();
    });

    test("removing an already-removed row changes nothing and keeps its removedAt", async () => {
      const { id } = await store.create({ title: "gone" });
      await store.remove(id);
      const removedAt = await removedAtOf(id);
      await Bun.sleep(5);
      expect((await store.removeManyByQuery({ id })).modifiedCount).toBe(0);
      expect((await store.removeOneByQuery({ id })).modifiedCount).toBe(0);
      expect(await removedAtOf(id)).toBe(removedAt as number);
      await expect(store.removeManyByQuery(q.exists("removedAt"))).rejects.toThrow(
        'removeManyByQuery on "dialectConf" can never match (removedAt exists asks for removed rows); a remove reaches live rows only',
      );
    });

    test("an upsert does not take the flag", async () => {
      await expect(
        store.updateOneByQuery({ title: "nobody" }, { score: 1 }, { upsert: true, withRemoved: true }),
      ).rejects.toThrow("takes upsert or { withRemoved: true }, not both");
      expect(await store.count({}, { withRemoved: true })).toBe(0);
    });

    test("a row revived with removedAt: null is read again, and found by q.search", async () => {
      const { id } = await store.create({ title: "Quarterly revenue report" });
      await store.remove(id);
      expect(titlesOf(await store.find(q.search("revenue")))).toEqual([]);
      await expect(store.find(q.search("revenue"), { withRemoved: true })).rejects.toThrow(
        'q.search() cannot see removed rows on "dialectConf"',
      );
      expect(await store.updateOneByQuery({ id }, { removedAt: null }, { withRemoved: true })).toMatchObject({
        modifiedCount: 1,
      });
      expect(titlesOf(await store.find({ id }))).toEqual(["Quarterly revenue report"]);
      expect(titlesOf(await store.find(q.search("revenue")))).toEqual(["Quarterly revenue report"]);
    });

    test("a removed document read with the flag is read-only; a live one saves", async () => {
      const live = await store.create({ title: "live" });
      const { id } = await store.create({ title: "gone" });
      await store.remove(id);
      const removed = await store.findOne({ id }, { withRemoved: true });
      await expect(removed.set({ note: "edited" }).save()).rejects.toThrow(
        "read-only: a removed dialectConf is revived with updateById(id, { removedAt: null }, { withRemoved: true })",
      );
      expect((await store.findOne({ id }, { withRemoved: true }))?.note).toBeNull();
      await (await store.findOne({ id: live.id }, { withRemoved: true })).set({ note: "saved" }).save();
      expect((await store.pickById(live.id)).note).toBe("saved");

      await store.updateOneByQuery({ id }, { removedAt: null }, { withRemoved: true });
      await removed.refresh();
      await removed.set({ note: "revived" }).save();
      expect((await store.pickById(id)).note).toBe("revived");
    });

    test("a projection reads a removed row with the flag, and the document is read-only too", async () => {
      const { id } = await store.create({ title: "gone", score: 3 });
      await store.remove(id);
      const [projected] = await store.find({ id }, { select: { title: true }, withRemoved: true });
      expect(projected?.title).toBe("gone");
      expect(dayjs.isDayjs(projected?.removedAt)).toBe(true);
      await expect(projected.set({ title: "edited" }).save()).rejects.toThrow("read-only: a removed dialectConf");
      expect(await store.find({ id }, { select: { title: true } })).toEqual([]);
    });
  });
};

for (const kind of ConformanceEnv.sqlDrivers("sql conformance")) describeDriver(kind);
