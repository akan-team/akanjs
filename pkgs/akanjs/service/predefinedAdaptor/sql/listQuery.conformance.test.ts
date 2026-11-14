import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Any, dayjs, Float, ID, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import {
  by,
  createDocumentQueryHelper,
  type DatabaseCls,
  DatabaseRegistry,
  type DocumentQuery,
  DocumentSchema,
  from,
  into,
} from "akanjs/document";
import { ConformanceEnv, type SqlDriver, type SqlDriverKind } from "../../../test/conformance";
import { SqlDocumentStore } from "./SqlDocumentStore";
import { queryPlanOf, sentQueries } from "./sentStatements.fixture";
import { BASE_COLUMNS } from "./types";
import { BASE_COLUMN_LEAF } from "./values";

const q = createDocumentQueryHelper();

class ListInput extends via((f) => ({
  label: f(String),
  ownerId: f(ID, { default: "" }),
  score: f(Int).optional(),
  ratio: f(Float).optional(),
  flag: f(Boolean).optional(),
  dueAt: f(Date).optional(),
  note: f(String).optional(),
  meta: f(Any, { default: () => ({}) }),
})) {}
class ListObject extends via(ListInput, () => ({})) {}
class ListLight extends via(ListObject, ["label"] as const, () => ({})) {}
class ListFull extends via(ListObject, ListLight, () => ({})) {}
class ListInsight extends via(ListFull, (f) => ({ count: f(Int, { default: 0, accumulate: {} }) })) {}
const listConstant = ConstantRegistry.buildModel("listConf", ListInput, ListObject, ListFull, ListLight, ListInsight, {
  ListInput,
  ListObject,
  ListFull,
  ListLight,
  ListInsight,
});
class ListFilter extends from(ListFull, () => ({ query: {}, sort: {} })) {}
class ListDoc extends by(ListFull) {}
class ListModel extends into(ListDoc, ListFilter, listConstant, () => ({})) {}
const listDatabase = DatabaseRegistry.buildModel(
  "listConf",
  ListInput as unknown as DatabaseCls<InstanceType<typeof ListInput>>,
  ListDoc,
  ListModel,
  ListObject,
  ListInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  ListFilter,
);

const quoted = 'it\'s "quoted"';
const seeds = [
  { label: "plain", ownerId: "u1", score: 1, ratio: 0.5, flag: true, dueAt: dayjs(5_000), meta: { code: "a" } },
  { label: quoted, ownerId: "u2", score: 2, ratio: 2.5, flag: false, meta: { code: 5 } },
  { label: "한글 é 😀", ownerId: "u3", ratio: 2 ** 53, flag: true, dueAt: dayjs(50_000), meta: { code: "5" } },
  { label: "a,b", ownerId: "u1", score: 0, ratio: -1.25, meta: { code: true } },
  { label: "{braces}", ownerId: "u2", score: -3, meta: { code: null } },
  { label: "NULL", ownerId: "u3", score: 5, note: "kept" },
  { label: "back\\slash", ownerId: "u4", score: 5, note: null },
  { label: " padded ", ownerId: "u4", flag: false },
  { label: "", ownerId: "", score: 7, dueAt: dayjs(5_000) },
  { label: "line\nbreak", ownerId: "u5", score: 8 },
  { label: "null", ownerId: "u5", score: 10 },
  { label: "true", ownerId: "u6", score: 11 },
  { label: "5", ownerId: "u6", score: 12 },
];

const lists: [path: string, values: unknown[]][] = [
  ["label", ["plain"]],
  ["label", ["plain", "plain", "NULL"]],
  ["label", [quoted, "한글 é 😀"]],
  ["label", ["a,b", "{braces}", "NULL", "back\\slash", " padded ", "", "line\nbreak", "null"]],
  ["label", ["plain", null]],
  ["label", ["5", 5, true, "true"]],
  ["label", [quoted, "back\\slash", "{braces}", "a,b", "한글 é 😀", 5]],
  ["label", ["nobody"]],
  ["ownerId", ["u1", "u4", ""]],
  ["note", [null]],
  ["note", ["kept", null]],
  ["score", [5]],
  ["score", [1, 2, 2, -3, 0]],
  ["score", [5, null]],
  ["score", ["5", 12]],
  ["ratio", [0.5, 2.5, -1.25, 2 ** 53]],
  ["flag", [true]],
  ["flag", [false, null]],
  ["dueAt", [dayjs(5_000)]],
  ["dueAt", [new Date(50_000), dayjs(5_000)]],
  ["meta.code", ["a", 5, "5", true, null]],
  ["meta.code", [5]],
  ["createdAt", [0, 1]],
];

const describeDriver = (kind: SqlDriverKind) => {
  const onPostgres = kind === "postgres";

  describe(`sql lists (${kind})`, () => {
    let driver: SqlDriver;
    let store: SqlDocumentStore;
    let labelOf: Map<string, string>;

    beforeAll(async () => {
      driver = await ConformanceEnv.openSqlDriver(kind);
      const schema = new DocumentSchema().index({ ownerId: 1 }).index({ score: 1 });
      store = new SqlDocumentStore(driver.database, listConstant, listDatabase, schema, driver.dialect);
      await store.ensure();
      for (const seed of seeds) await store.create({ ...seed });
      const docs = await store.find({}, { limit: null });
      labelOf = new Map(docs.map((doc) => [String(doc.id), String(doc.label)]));
    });
    afterAll(async () => {
      await driver?.close();
    });

    const idOf = (label: string) => [...labelOf].find(([, held]) => held === label)?.[0] as string;
    const labels = async (query: DocumentQuery) =>
      (await store.findIds(query, { limit: null })).map((id) => labelOf.get(id)).sort();

    // The text every release before this one sent: a placeholder per value.
    const writtenOut = async (path: string, values: unknown[], negated: boolean) => {
      const leaf = BASE_COLUMNS.has(path) ? BASE_COLUMN_LEAF : driver.dialect;
      const kind = store.compiler.pathKind(path);
      const { sql, params } = negated ? leaf.notInList(path, values, kind) : leaf.inList(path, values, kind);
      const rows = await driver.database
        .getConnection()
        .prepare(`SELECT "id" FROM "listConf" WHERE "removedAt" IS NULL AND ${sql}`)
        .all<{ id: string }>(...params);
      return rows.map(({ id }) => labelOf.get(id)).sort();
    };

    for (const [path, values] of lists)
      for (const negated of [false, true])
        test(`${path} ${negated ? "not one of" : "one of"} ${JSON.stringify(values)} reads the rows a placeholder per value read`, async () => {
          const read = await labels({ [path]: negated ? q.notOneOf(values) : q.oneOf(values) });
          expect(read).toEqual(await writtenOut(path, values, negated));
        });

    test("a list of ids reads each row once, whether an id repeats, matches no row or is null", async () => {
      const [plain, braces] = [idOf("plain"), idOf("{braces}")];
      for (const values of [[plain], [plain, braces, plain], [plain, "nobody"], [braces, null]])
        for (const negated of [false, true]) {
          const read = await labels({ id: negated ? q.notOneOf(values) : q.oneOf(values) });
          expect(read).toEqual(await writtenOut("id", values, negated));
        }
      expect(await labels({ id: q.oneOf([plain, braces, plain]) })).toEqual(["plain", "{braces}"]);
      expect(await labels({ id: q.notOneOf([braces, null]) })).toEqual([]);
    });

    test("a list matches by value and type: quotes and non-ASCII as written, a number never as its text", async () => {
      expect(await labels({ label: q.oneOf([quoted, "한글 é 😀"]) })).toEqual([quoted, "한글 é 😀"].sort());
      expect(await labels({ label: q.oneOf(["a,b", "{braces}", "NULL", "back\\slash", "null"]) })).toEqual(
        ["a,b", "{braces}", "NULL", "back\\slash", "null"].sort(),
      );
      expect(await labels({ label: q.oneOf(["5", 5, true]) })).toEqual(["5"]);
      expect(await labels({ label: q.oneOf([quoted, "back\\slash", "a,b", 5]) })).toEqual(
        [quoted, "back\\slash", "a,b"].sort(),
      );
      expect(await labels({ score: q.oneOf(["5", 12]) })).toEqual(["5"]);
      expect(await labels({ ratio: q.oneOf([2 ** 53]) })).toEqual(["한글 é 😀"]);
      expect(await labels({ flag: q.oneOf([true]) })).toEqual(["plain", "한글 é 😀"].sort());
      expect(await labels({ dueAt: q.oneOf([dayjs(5_000), new Date(50_000)]) })).toEqual(
        ["", "plain", "한글 é 😀"].sort(),
      );
      expect(await labels({ "meta.code": q.oneOf([5, true]) })).toEqual([quoted, "a,b"].sort());
    });

    test("a null in a list matches no row", async () => {
      expect(await labels({ score: q.oneOf([5, null]) })).toEqual(["NULL", "back\\slash"]);
      expect(await labels({ note: q.oneOf([null]) })).toEqual([]);
      expect(await labels({ note: q.oneOf(["kept", null]) })).toEqual(["NULL"]);
    });

    // Postgres compares a document field with a JSON null, which only drops out of the list; SQLite's NULL unsettles
    // every comparison a negated list makes. Each dialect answers as it did with a placeholder per value.
    test.failingIf(onPostgres)("a null in a negated list on a document field leaves no row", async () => {
      expect(await labels({ score: q.notOneOf([5, null]) })).toEqual([]);
      expect(await labels({ label: q.notOneOf(["plain", null]) })).toEqual([]);
    });

    test("an empty list matches no row, and negated every row", async () => {
      expect(await labels({ label: q.oneOf([]) })).toEqual([]);
      expect(await labels({ id: q.oneOf([]) })).toEqual([]);
      expect(await labels({ label: q.notOneOf([]) })).toHaveLength(seeds.length);
      expect(await labels({ score: q.notOneOf([]) })).toHaveLength(seeds.length);
    });

    // Postgres takes 65,534 parameters in a statement; SQLite's own ceiling varies by build, from 32,766 up.
    test("a list of tens of thousands of values is read in one statement", async () => {
      const size = onPostgres ? 70_000 : 30_000;
      const absent = Array.from({ length: size }, (_, idx) => `absent${idx}`);
      expect(await labels({ id: q.oneOf([...absent, idOf("plain"), idOf("a,b")]) })).toEqual(["a,b", "plain"]);
      expect(await labels({ label: q.oneOf([...absent, quoted]) })).toEqual([quoted]);
      expect(await labels({ label: q.notOneOf([...absent, quoted]) })).toHaveLength(seeds.length - 1);
      const numbers = Array.from({ length: size }, (_, idx) => idx + 100);
      expect(await labels({ score: q.oneOf([...numbers, 12]) })).toEqual(["5"]);
    });

    test("a list is read through the index on what it lists: the primary key, or a declared index", async () => {
      const planOf = async (query: DocumentQuery) => {
        const { where, params } = store.compiler.compile(query);
        return await queryPlanOf(driver, { sql: `SELECT * FROM "listConf" WHERE ${where}`, params });
      };
      const byIds = await planOf({ id: q.oneOf([idOf("plain"), idOf("a,b"), idOf("NULL")]) });
      expect(byIds).toContain(onPostgres ? "listConf_pkey" : "sqlite_autoindex_listConf_1");
      expect(await planOf({ id: q.oneOf([idOf("plain")]) })).toContain(
        onPostgres ? "listConf_pkey" : "sqlite_autoindex_listConf_1",
      );
      expect(await planOf({ ownerId: q.oneOf(["u1", "u2", "u3"]) })).toContain("listConf_ownerId");
      expect(await planOf({ score: q.oneOf([1, 2, 5]) })).toContain("listConf_score");
      if (onPostgres) expect(byIds).toContain("Index Cond: (id = ANY");
    });
  });

  // Postgres gathers statistics and plans an id list through the primary key without help.
  describe.skipIf(onPostgres)(`sql id list plans (${kind})`, () => {
    let driver: SqlDriver;
    let store: SqlDocumentStore;
    let ids: string[];
    const primaryKey = "sqlite_autoindex_listConf_1";

    // The indexes every model gets lead with `removedAt`, and no statistics are gathered: what SQLite plans against.
    beforeAll(async () => {
      driver = await ConformanceEnv.openSqlDriver(kind);
      const schema = new DocumentSchema()
        .index({ removedAt: 1, createdAt: -1 })
        .index({ removedAt: 1, ownerId: 1, createdAt: -1 })
        .index({ ownerId: 1 });
      store = new SqlDocumentStore(driver.database, listConstant, listDatabase, schema, driver.dialect);
      await store.ensure();
      await store.createMany(
        Array.from({ length: 400 }, (_, idx) => ({ label: `row ${idx}`, ownerId: `u${idx % 20}`, score: idx % 7 })),
      );
      ids = await store.findIds({}, { limit: null });
    });
    afterAll(async () => {
      await driver?.close();
    });

    const planOf = async (run: () => Promise<unknown>) =>
      await queryPlanOf(driver, (await sentQueries(driver, run))[0]);

    for (const length of [1, 2, 5, 200])
      test(`a find and a count by ${length} ids read through the primary key, not through every live row`, async () => {
        const list = ids.slice(0, length);
        for (const read of [
          () => store.find({ id: q.oneOf(list) }),
          () => store.findIds({ id: q.oneOf(list) }),
          () => store.count({ id: q.oneOf(list) }),
        ]) {
          const plan = await planOf(read);
          expect(plan).toContain(primaryKey);
          expect(plan).not.toContain("listConf_removedAt");
        }
        expect(await store.find({ id: q.oneOf(list) })).toHaveLength(length);
        expect(await store.count({ id: q.oneOf(list) })).toBe(length);
      });

    test("an id list beside other conditions and a sort is read through an index on one of them, never every live row", async () => {
      const list = ids.slice(0, 5);
      const beside = [
        () => store.find({ id: q.oneOf(list), score: 3 }, { sort: { createdAt: -1 }, limit: 20 }),
        () => store.find(q.all({ id: q.oneOf(list) }, { score: q.gte(2) }), { sort: { score: 1 } }),
        () => store.count({ id: q.oneOf(list), label: q.contains("row") }),
      ];
      for (const read of beside) {
        const plan = await planOf(read);
        expect(plan).toContain(primaryKey);
        expect(plan).not.toContain("listConf_removedAt");
      }
      const ownersToo = await planOf(() =>
        store.find({ id: q.oneOf(list), ownerId: "u1" }, { sort: { createdAt: -1 }, limit: 20 }),
      );
      expect(ownersToo).toMatch(new RegExp(`${primaryKey}|listConf_ownerId`));
      expect(ownersToo).not.toContain("listConf_removedAt_createdAt");
      const removed = await store.create({ label: "removed", ownerId: "u1" });
      await store.remove(removed.id);
      expect(await store.findIds({ id: q.oneOf([removed.id, ...list]) })).toHaveLength(5);
      expect(await store.count({ id: q.oneOf([removed.id]) })).toBe(0);
    });

    test("a read that lists no ids keeps the index that leads with removedAt: a first page in order, an owner's rows", async () => {
      expect(await planOf(() => store.find({}, { limit: 20 }))).toContain("listConf_removedAt_createdAt (removedAt=?)");
      expect(await planOf(() => store.find({ ownerId: "u1" }, { limit: 20 }))).toContain(
        "listConf_removedAt_ownerId_createdAt (removedAt=? AND <expr>=?)",
      );
      expect(await planOf(() => store.count({ ownerId: q.oneOf(["u1", "u2"]) }))).toContain(
        "listConf_removedAt_ownerId_createdAt (removedAt=? AND <expr>=?)",
      );
      expect(await planOf(() => store.findOne({ id: ids[0] }))).toContain(primaryKey);
    });
  });

  describe(`sql index predicates with lists (${kind})`, () => {
    let driver: SqlDriver;

    beforeAll(async () => {
      driver = await ConformanceEnv.openSqlDriver(kind);
    });
    afterAll(async () => {
      await driver?.close();
    });

    test("a list in an index `where` is written into the predicate value by value, and the index binds its rows", async () => {
      const schema = new DocumentSchema().index(
        { ownerId: 1 },
        {
          name: "listConf_owner_open",
          unique: true,
          where: { label: q.oneOf(["open", "it's held"]), score: q.notOneOf([1, 2]) },
        },
      );
      const store = new SqlDocumentStore(driver.database, listConstant, listDatabase, schema, driver.dialect);
      await store.ensure();
      const row = await driver.database
        .getConnection()
        .prepare(
          onPostgres
            ? `SELECT pg_get_expr(i.indpred, i.indrelid) AS "predicate" FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = ? AND i.indrelid = to_regclass('"listConf"')`
            : `SELECT "sql" AS "predicate" FROM "sqlite_master" WHERE "type" = 'index' AND "name" = ?`,
        )
        .get<{ predicate: string }>("listConf_owner_open");
      if (onPostgres) {
        expect(row?.predicate).toContain("= ANY (ARRAY['open'::text, 'it''s held'::text])");
        expect(row?.predicate).toContain("<> ALL (ARRAY[('1'::text)::jsonb, ('2'::text)::jsonb])");
      } else {
        expect(row?.predicate).toContain("IN ('open', 'it''s held')");
        expect(row?.predicate).toContain("NOT IN (1, 2)");
      }
      await store.create({ label: "open", ownerId: "u1", score: 3 });
      await store.create({ label: "open", ownerId: "u1", score: 1 });
      await store.create({ label: "closed", ownerId: "u1", score: 3 });
      await expect(store.create({ label: "it's held", ownerId: "u1", score: 4 })).rejects.toThrow();
    });
  });
};

for (const kind of ConformanceEnv.sqlDrivers("sql lists")) describeDriver(kind);
