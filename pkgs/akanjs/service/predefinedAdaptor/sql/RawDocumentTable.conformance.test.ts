import { afterEach, describe, expect, test } from "bun:test";
import { ConformanceEnv, type SqlDriver, type SqlDriverKind } from "../../../test/conformance";
import { RawDocumentTable } from "./RawDocumentTable";
import { quoteIdent } from "./values";

const createModelTable = async (driver: SqlDriver, name: string) => {
  const ts = driver.dialect.timestampType();
  await driver.database
    .getConnection()
    .execute(
      `CREATE TABLE ${quoteIdent(name)} ("id" TEXT PRIMARY KEY NOT NULL, "createdAt" ${ts} NOT NULL, "updatedAt" ${ts} NOT NULL, "removedAt" ${ts}, "_doc" ${driver.dialect.docColumnType()} NOT NULL)`,
    );
  return new RawDocumentTable(name, () => driver.database.getConnection(), driver.dialect);
};

const seed = async (table: RawDocumentTable) => {
  const rows = [
    { id: "a1", _doc: { name: "Kenny", org: "o1", score: 3, profile: { tier: "gold" } }, removedAt: null },
    { id: "a2", _doc: { name: "Jane", org: null, score: 7, profile: { tier: "silver" } }, removedAt: null },
    { id: "a3", _doc: { name: "Old", score: 1 }, removedAt: 1_700_000_000_000 },
    { id: "a4", _doc: { name: "Eve", org: "o2", score: 10, tags: ["x"] }, removedAt: null },
  ];
  for (const row of rows) await table.insert({ ...row, createdAt: 1_600_000_000_000, updatedAt: 1_600_000_000_000 });
};

const ids = (rows: { id: string }[]) => rows.map(({ id }) => id);

const describeDriver = (kind: SqlDriverKind) => {
  describe(`raw document table (${kind})`, () => {
    const opened: SqlDriver[] = [];
    afterEach(async () => {
      for (const driver of opened.splice(0)) await driver.close();
    });
    const open = async () => {
      const driver = await ConformanceEnv.openSqlDriver(kind);
      opened.push(driver);
      const table = await createModelTable(driver, "rawConf");
      await seed(table);
      return { driver, table };
    };

    test("reads rows as stored in id order, removed ones unless withRemoved is false, a page after an id", async () => {
      const { table } = await open();
      expect(ids(await table.find())).toEqual(["a1", "a2", "a3", "a4"]);
      expect(ids(await table.find({}, { withRemoved: false }))).toEqual(["a1", "a2", "a4"]);
      expect(ids(await table.find({}, { after: "a2", limit: 1 }))).toEqual(["a3"]);
      expect(await table.get("a3")).toEqual({
        id: "a3",
        createdAt: 1_600_000_000_000,
        updatedAt: 1_600_000_000_000,
        removedAt: 1_700_000_000_000,
        _doc: { name: "Old", score: 1 },
      });
      expect(await table.get("missing")).toBeNull();
      expect(await table.count({}, { withRemoved: false })).toBe(3);
    });

    test("filters dot paths and base columns; $ne leaves out a row whose path is missing or null", async () => {
      const { table } = await open();
      expect(ids(await table.find({ org: "o1" }))).toEqual(["a1"]);
      expect(ids(await table.find({ "profile.tier": "silver" }))).toEqual(["a2"]);
      expect(ids(await table.find({ org: { $ne: "o1" } }))).toEqual(["a4"]);
      expect(ids(await table.find({ org: { $in: ["o1", "o2"] } }))).toEqual(["a1", "a4"]);
      expect(ids(await table.find({ org: { $in: [] } }))).toEqual([]);
      expect(ids(await table.find({ org: { $exists: false } }))).toEqual(["a3"]);
      expect(ids(await table.find({ tags: { $exists: true } }))).toEqual(["a4"]);
      expect(ids(await table.find({ score: { $gte: 3, $lt: 10 } }))).toEqual(["a1", "a2"]);
      expect(ids(await table.find({ removedAt: { $ne: null } }))).toEqual(["a3"]);
      expect(ids(await table.find({ id: { $in: ["a2", "a4"] } }))).toEqual(["a2", "a4"]);
    });

    test("writes `_doc` and removedAt as given, leaving updatedAt alone, and deletes", async () => {
      const { table } = await open();
      expect(await table.write("a1", { _doc: { name: "Kenny", legacy: true }, removedAt: 5 })).toBe(true);
      expect(await table.get("a1")).toMatchObject({
        updatedAt: 1_600_000_000_000,
        removedAt: 5,
        _doc: { name: "Kenny", legacy: true },
      });
      expect(await table.write("missing", { _doc: {}, removedAt: null })).toBe(false);
      expect(await table.delete("a1")).toBe(true);
      expect(await table.get("a1")).toBeNull();
    });

    test("a table nothing created reads as empty and refuses writes", async () => {
      const { driver } = await open();
      const ghost = new RawDocumentTable("ghostConf", () => driver.database.getConnection(), driver.dialect);
      expect(await ghost.find()).toEqual([]);
      expect(await ghost.count()).toBe(0);
      expect(await ghost.get("a1")).toBeNull();
      await expect(ghost.delete("a1")).rejects.toThrow('Table "ghostConf" does not exist');
    });

    test("refuses framework tables, comparisons of whole arrays or objects, and indexed paths", async () => {
      const { driver, table } = await open();
      const connection = () => driver.database.getConnection();
      expect(() => new RawDocumentTable("_akan_migration_run", connection, driver.dialect)).toThrow("names no model");
      expect(() => new RawDocumentTable("search_doc", connection, driver.dialect)).toThrow("names no model");
      expect(() => new RawDocumentTable("a-b", connection, driver.dialect)).toThrow("names no model");
      await expect(table.find({ tags: ["x"] })).rejects.toThrow("compares an array");
      await expect(table.find({ profile: { tier: "gold" } })).rejects.toThrow("compares an object");
      await expect(table.find({ "tags.0": "x" })).rejects.toThrow("without array indexes");
      await expect(table.find({ "tags.-1": "x" })).rejects.toThrow("without array indexes");
      await expect(table.find({ "a,b": 1 })).rejects.toThrow("without array indexes");
      await expect(table.find({ score: { $near: 1 } })).rejects.toThrow('Unknown filter operator "$near"');
    });
  });
};

for (const kind of ConformanceEnv.sqlDrivers("raw document table")) describeDriver(kind);
