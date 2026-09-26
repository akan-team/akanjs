import { afterEach, describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { DocumentSchema, documentQueryHelper as q } from "akanjs/document";
import { ConformanceEnv, type SqlDriver, type SqlDriverKind } from "../../test/conformance";
import type { SqlDocumentStore } from "./database.adaptor";
import { DocumentTransfer } from "./documentTransfer";
import { searchConfConstant, searchConfDatabase } from "./search.conformance.fixture";

// A single-mode app moving to another database: rows leave SQLite exactly as stored and land in the target the same.

const storeOf = async (driver: SqlDriver) => {
  const store = driver.database.getStore(
    searchConfConstant,
    searchConfDatabase,
    new DocumentSchema(),
  ) as SqlDocumentStore;
  await store.ensure();
  return store;
};

const describeTarget = (kind: SqlDriverKind) => {
  describe(`document transfer (sqlite → ${kind})`, () => {
    const opened: SqlDriver[] = [];
    const cleanups: (() => Promise<void>)[] = [];
    afterEach(async () => {
      for (const driver of opened.splice(0)) await driver.close();
      for (const cleanup of cleanups.splice(0)) await cleanup();
    });

    test("moves every row as stored, removed ones included, and the target's search finds them", async () => {
      const source = await ConformanceEnv.openSqlDriver("sqlite");
      const target = await ConformanceEnv.openSqlDriver(kind);
      opened.push(source, target);
      const { dir, remove } = await ConformanceEnv.tempDir("akan-transfer");
      cleanups.push(remove);
      const sourceStore = await storeOf(source);
      const kept = await sourceStore.create({
        headline: "Kenny Park",
        summary: "검색엔진 café",
        keywords: ["alpha"],
        histories: [{ action: "signed", labels: ["gamma"] }],
        rank: 3,
      });
      const gone = await sourceStore.create({ headline: "Gone Person", keywords: [], histories: [] });
      await sourceStore.remove(gone.id);
      // Past one chunk, so the cursor between chunks is exercised on both ends.
      for (let idx = 0; idx < 1100; idx += 1)
        await sourceStore.create({ headline: `Bulk ${idx}`, keywords: [], histories: [] });

      expect(await new DocumentTransfer(source.database).exportTo(dir)).toEqual([{ table: "searchConf", rows: 1102 }]);
      const targetStore = await storeOf(target);
      expect(await new DocumentTransfer(target.database).importFrom(dir)).toEqual([
        { table: "searchConf", rows: 1102 },
      ]);

      expect(await targetStore.exportRows("", 5000)).toEqual(await sourceStore.exportRows("", 5000));
      expect(await targetStore.findIds(q.search("kenny"))).toEqual([kept.id]);
      expect(await targetStore.findIds(q.search("검색", { prefix: true }))).toEqual([kept.id]);
      expect(await targetStore.findIds(q.search("gone"))).toEqual([]);
      expect(await targetStore.count({})).toBe(1101);
    });

    test("replaces rather than duplicates on a second import, and skips a file no model owns", async () => {
      const source = await ConformanceEnv.openSqlDriver("sqlite");
      const target = await ConformanceEnv.openSqlDriver(kind);
      opened.push(source, target);
      const { dir, remove } = await ConformanceEnv.tempDir("akan-transfer");
      cleanups.push(remove);
      const sourceStore = await storeOf(source);
      const doc = await sourceStore.create({ headline: "Kenny Park", keywords: [], histories: [] });
      await new DocumentTransfer(source.database).exportTo(dir);
      await writeFile(path.join(dir, "ghostModel.ndjson"), "");
      const targetStore = await storeOf(target);

      await new DocumentTransfer(target.database).importFrom(dir);
      await targetStore.updateManyByQuery({ id: doc.id }, { headline: "Edited On Target" });
      expect(await new DocumentTransfer(target.database).importFrom(dir)).toEqual([{ table: "searchConf", rows: 1 }]);

      expect(await targetStore.exportRows("", 10)).toEqual(await sourceStore.exportRows("", 10));
      expect(await targetStore.findIds(q.search("kenny"))).toEqual([doc.id]);
      expect(await targetStore.findIds(q.search("edited"))).toEqual([]);
    });
  });
};

for (const kind of ConformanceEnv.sqlDrivers("document transfer")) describeTarget(kind);
