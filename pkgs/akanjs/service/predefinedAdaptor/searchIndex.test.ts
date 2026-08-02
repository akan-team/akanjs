import { Database, type SQLQueryBindings } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { ID, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import {
  by,
  type DatabaseCls,
  DatabaseRegistry,
  DocumentSchema,
  documentQueryHelper,
  from,
  into,
} from "akanjs/document";
import { type AkanSqlClient, type AkanSqlStatement, SqlDocumentStore } from "./database.adaptor";
import { DEFAULT_TOKENIZER, parseSearchEnabled, SearchIndex, toMatchExpression } from "./searchIndex";

class SearchHistory extends via((f) => ({
  action: f(String, { text: "tag" }),
  labels: f([String], { text: "tag" }),
  count: f(Int, { default: 0 }),
})) {}
class SearchTestInput extends via((f) => ({
  headline: f(String, { text: "title" }),
  summary: f(String, { text: "desc" }).optional(),
  keywords: f([String], { text: "tag" }),
  cover: f(ID, { text: "thumb" }).optional(),
  orgId: f(ID, { text: "filter" }).optional(),
  histories: f([SearchHistory]),
})) {}
class SearchTestObject extends via(SearchTestInput, (f) => ({
  secretToken: f.secret(String).optional(),
})) {}
class SearchTestLight extends via(SearchTestObject, ["headline"] as const, () => ({})) {}
class SearchTestFull extends via(SearchTestObject, SearchTestLight, () => ({})) {}
class SearchTestInsight extends via(SearchTestFull, (f) => ({
  count: f(Int, { default: 0, accumulate: {} }),
})) {}
const searchTestConstant = ConstantRegistry.buildModel(
  "searchIndexTest",
  SearchTestInput,
  SearchTestObject,
  SearchTestFull,
  SearchTestLight,
  SearchTestInsight,
  { SearchTestInput, SearchTestObject, SearchTestFull, SearchTestLight, SearchTestInsight, SearchHistory },
);
class SearchTestFilter extends from(SearchTestFull, () => ({ query: {}, sort: {} })) {}
class SearchTestDoc extends by(SearchTestFull) {}
class SearchTestModel extends into(SearchTestDoc, SearchTestFilter, searchTestConstant, () => ({})) {}
const searchTestDatabase = DatabaseRegistry.buildModel(
  "searchIndexTest",
  SearchTestInput as unknown as DatabaseCls<InstanceType<typeof SearchTestInput>>,
  SearchTestDoc,
  SearchTestModel,
  SearchTestObject,
  SearchTestInsight,
  SearchTestFilter,
);

const TABLE = "searchIndexTest";

class TestClient implements AkanSqlClient {
  constructor(readonly db: Database) {}
  async execute(sql: string, params: unknown[] | Record<string, unknown> = []) {
    const values = Array.isArray(params) ? params : Object.values(params);
    return this.db.query(sql).run(...(values as SQLQueryBindings[]));
  }
  prepare(sql: string): AkanSqlStatement {
    const statement = this.db.query(sql);
    return {
      run: async (...params: unknown[]) => statement.run(...(params as SQLQueryBindings[])),
      get: async <Row = Record<string, unknown>>(...params: unknown[]) =>
        (statement.get(...(params as SQLQueryBindings[])) as Row | null) ?? null,
      all: async <Row = Record<string, unknown>>(...params: unknown[]) =>
        statement.all(...(params as SQLQueryBindings[])) as Row[],
    };
  }
  async close() {
    this.db.close();
  }
}

class TestOwner {
  readonly client: TestClient;
  constructor(readonly db: Database) {
    this.client = new TestClient(db);
    db.run(
      `CREATE TABLE IF NOT EXISTS "_akan_meta" ("key" TEXT PRIMARY KEY NOT NULL, "value" TEXT NOT NULL, "updatedAt" INTEGER NOT NULL)`,
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS "${TABLE}" ("id" TEXT PRIMARY KEY NOT NULL, "createdAt" INTEGER NOT NULL,
        "updatedAt" INTEGER NOT NULL, "removedAt" INTEGER, "_doc" TEXT NOT NULL)`,
    );
  }
  getConnection() {
    return this.client;
  }
  getMeta(key: string) {
    return (this.db.query(`SELECT "value" FROM "_akan_meta" WHERE "key" = ?`).get(key) as { value: string } | null)
      ?.value;
  }
  async setMeta(key: string, value: string) {
    this.db
      .query(
        `INSERT INTO "_akan_meta" ("key", "value", "updatedAt") VALUES (?, ?, ?)
         ON CONFLICT("key") DO UPDATE SET "value" = excluded."value"`,
      )
      .run(key, value, Date.now());
  }
}

interface DocInput {
  headline: string;
  summary?: string;
  keywords?: string[];
  cover?: string;
  orgId?: string;
  histories?: { action: string; labels?: string[]; count: number }[];
}

let owner: TestOwner;
let db: Database;

const insert = (id: string, doc: DocInput) => {
  db.query(`INSERT INTO "${TABLE}" ("id","createdAt","updatedAt","removedAt","_doc") VALUES (?,?,?,NULL,?)`).run(
    id,
    1,
    1,
    JSON.stringify(doc),
  );
};

const mirror = (id: string) =>
  (db.query(`SELECT * FROM "search_doc" WHERE "ref" = ? AND "refId" = ?`).get(TABLE, id) as Record<
    string,
    string
  > | null) ?? undefined;

const matchIds = (expression: string) =>
  (
    db
      .query(
        `SELECT d."refId" AS rid FROM "search_fts" JOIN "search_doc" d ON d."fid" = "search_fts"."rowid"
         WHERE "search_fts" MATCH ? AND d."ref" = ? ORDER BY rank`,
      )
      .all(expression, TABLE) as { rid: string }[]
  ).map((row) => row.rid);

const storeOwnerFor = (index: SearchIndex) => ({
  getConnection: () => owner.getConnection(),
  getSearchIndex: () => index,
  getMeta: (key: string) => owner.getMeta(key),
  setMeta: (key: string, value: string) => owner.setMeta(key, value),
  afterCommit: async (fn: () => unknown) => {
    await fn();
  },
});

const openStore = async ({ enabled = true } = {}) => {
  const index = new SearchIndex(owner as never, { enabled, tokenizer: DEFAULT_TOKENIZER });
  await index.ensureSchema();
  const store = new SqlDocumentStore(
    storeOwnerFor(index) as never,
    searchTestConstant as never,
    searchTestDatabase as never,
    new DocumentSchema(),
  );
  await store.ensure();
  return store;
};

const build = async ({ enabled = true, tokenizer = DEFAULT_TOKENIZER } = {}) => {
  const index = new SearchIndex(owner as never, { enabled, tokenizer });
  await index.ensureSchema();
  await index.ensureRef(searchTestConstant as never, searchTestDatabase as never);
  return index;
};

beforeEach(() => {
  db = new Database(":memory:", { strict: true, create: true });
  owner = new TestOwner(db);
});

describe("parseSearchEnabled", () => {
  test("defaults to enabled when unset", () => {
    expect(parseSearchEnabled(undefined)).toBe(true);
    expect(parseSearchEnabled("")).toBe(true);
    expect(parseSearchEnabled("  ")).toBe(true);
  });

  test("accepts 1/true and 0/false in any case", () => {
    expect(parseSearchEnabled("1")).toBe(true);
    expect(parseSearchEnabled("TRUE")).toBe(true);
    expect(parseSearchEnabled("0")).toBe(false);
    expect(parseSearchEnabled("False")).toBe(false);
  });

  test("throws on an unrecognised value rather than defaulting", () => {
    expect(() => parseSearchEnabled("ture")).toThrow('Invalid AKAN_SEARCH_ENABLED value: "ture"');
    expect(() => parseSearchEnabled("yes")).toThrow("Use 1/true or 0/false");
  });
});

describe("toMatchExpression", () => {
  test("quotes every term so fts5 syntax in user input stays literal", () => {
    expect(toMatchExpression("hello world")).toBe('"hello" "world"');
    expect(toMatchExpression('he"llo')).toBe('"he""llo"');
    expect(toMatchExpression("-foo AND")).toBe('"-foo" "AND"');
    expect(toMatchExpression("  ")).toBe(null);
  });

  test("marks only the last term as a prefix", () => {
    expect(toMatchExpression("ken par", { prefix: true })).toBe('"ken" "par"*');
  });

  test("parenthesises the term list so a column filter covers all of it", () => {
    expect(toMatchExpression("ken par", { columns: ["title", "desc"] })).toBe('{title desc} : ("ken" "par")');
  });

  test("produces expressions sqlite accepts for input that would otherwise raise", async () => {
    await build();
    insert("a1", { headline: "Kenny Park" });
    for (const raw of ['hello"', "a AND", "*", "NEAR(", "-hello", "foo:bar"]) {
      const expression = toMatchExpression(raw);
      expect(() => (expression ? matchIds(expression) : [])).not.toThrow();
    }
  });
});

describe("SearchIndex mirror", () => {
  test("fills every role column from the document", async () => {
    await build();
    insert("a1", {
      headline: "Kenny Park",
      summary: "a short bio",
      keywords: ["alpha", "beta"],
      cover: "111111111111111111111111",
      orgId: "222222222222222222222222",
      histories: [{ action: "signed", count: 1 }],
    });

    const row = mirror("a1");
    expect(row?.title).toBe("Kenny Park");
    expect(row?.desc).toBe("a short bio");
    expect(row?.tag).toBe("alpha beta signed");
    expect(row?.thumb).toBe("111111111111111111111111");
    expect(row?.filter).toBe("orgId_222222222222222222222222");
  });

  test("mirrors an array leaf inside an array of objects", async () => {
    await build();
    insert("a1", {
      headline: "Kenny Park",
      histories: [
        { action: "signed", labels: ["alpha", "beta"], count: 1 },
        { action: "left", labels: ["gamma"], count: 2 },
      ],
    });

    expect(mirror("a1")?.tag).toBe("signed left alpha beta gamma");
    expect(matchIds('"gamma"')).toEqual(["a1"]);
  });

  test("folds punctuation in a filter value so the pair stays one token", async () => {
    await build();
    insert("a1", { headline: "Kenny", orgId: "acme.corp/west" });

    expect(mirror("a1")?.filter).toBe("orgId_acme_corp_west");
    expect(matchIds('"orgId_acme_corp_west"')).toEqual(["a1"]);
  });

  test("never mirrors a secret field", async () => {
    await build();
    insert("a1", { headline: "Kenny" });
    db.query(`UPDATE "${TABLE}" SET "_doc" = json_set("_doc", '$.secretToken', 'topsecret') WHERE "id" = ?`).run("a1");

    expect(JSON.stringify(mirror("a1"))).not.toContain("topsecret");
  });

  test("reindexes an atomic query write that fires no document hook", async () => {
    await build();
    insert("a1", { headline: "Kenny Park" });
    expect(matchIds('"Kenny"')).toEqual(["a1"]);

    db.query(`UPDATE "${TABLE}" SET "_doc" = json_set("_doc", '$.headline', 'Renamed Person') WHERE "id" = ?`).run(
      "a1",
    );

    expect(matchIds('"Kenny"')).toEqual([]);
    expect(matchIds('"Renamed"')).toEqual(["a1"]);
  });

  test("drops the row on soft delete and on hard delete", async () => {
    await build();
    insert("a1", { headline: "Kenny" });
    insert("a2", { headline: "Kenny" });

    db.query(`UPDATE "${TABLE}" SET "removedAt" = 999 WHERE "id" = ?`).run("a1");
    db.query(`DELETE FROM "${TABLE}" WHERE "id" = ?`).run("a2");

    expect(mirror("a1")).toBeUndefined();
    expect(mirror("a2")).toBeUndefined();
    expect(matchIds('"Kenny"')).toEqual([]);
  });

  test("re-indexes a revived row even when no indexed value changed", async () => {
    await build();
    insert("a1", { headline: "Kenny" });
    db.query(`UPDATE "${TABLE}" SET "removedAt" = 999 WHERE "id" = ?`).run("a1");
    expect(mirror("a1")).toBeUndefined();

    db.query(`UPDATE "${TABLE}" SET "removedAt" = NULL WHERE "id" = ?`).run("a1");

    expect(mirror("a1")?.title).toBe("Kenny");
  });

  test("skips the mirror write when no indexed value changed", async () => {
    await build();
    const sql = db
      .query(`SELECT "sql" FROM "sqlite_master" WHERE "type" = 'trigger' AND "name" = ?`)
      .get(`${TABLE}_search_au`) as { sql: string };

    expect(sql.sql).toContain("IS NOT");
    expect(sql.sql).toContain('OLD."removedAt" IS NOT NULL');
  });

  test("keeps the fts index consistent through the whole cycle", async () => {
    await build();
    insert("a1", { headline: "Kenny Park", keywords: ["alpha"] });
    db.query(`UPDATE "${TABLE}" SET "_doc" = json_set("_doc", '$.headline', 'Other') WHERE "id" = ?`).run("a1");
    db.query(`UPDATE "${TABLE}" SET "removedAt" = 5 WHERE "id" = ?`).run("a1");

    expect(() => db.run(`INSERT INTO "search_fts"("search_fts") VALUES('integrity-check')`)).not.toThrow();
  });
});

describe("SearchIndex reconcile", () => {
  test("backfills rows written before the triggers existed", async () => {
    insert("a1", { headline: "Kenny Park" });
    insert("a2", { headline: "Other Person" });

    await build();

    expect(mirror("a1")?.title).toBe("Kenny Park");
    expect(matchIds('"Other"')).toEqual(["a2"]);
  });

  test("skips a soft-deleted row during backfill", async () => {
    insert("a1", { headline: "Kenny" });
    db.query(`UPDATE "${TABLE}" SET "removedAt" = 1 WHERE "id" = ?`).run("a1");

    await build();

    expect(mirror("a1")).toBeUndefined();
  });

  test("does not reconcile twice for an unchanged descriptor", async () => {
    insert("a1", { headline: "Kenny" });
    await build();
    db.run(`DELETE FROM "search_doc"`);

    await build();

    expect(mirror("a1")).toBeUndefined();
  });

  test("widens a mirror created before a column existed, and re-reads every ref", async () => {
    // A database from a release whose mirror had no `thumb`. Recreating only the fts table would leave `rebuild`
    // reading a column `search_doc` does not have, which fails the boot outright.
    db.run(
      `CREATE TABLE "search_doc" ("fid" INTEGER PRIMARY KEY AUTOINCREMENT, "ref" TEXT NOT NULL,
        "refId" TEXT NOT NULL, "title" TEXT NOT NULL DEFAULT '', "desc" TEXT NOT NULL DEFAULT '',
        "tag" TEXT NOT NULL DEFAULT '', "filter" TEXT NOT NULL DEFAULT '', UNIQUE("ref", "refId"))`,
    );
    db.run(
      `CREATE VIRTUAL TABLE "search_fts" USING fts5("title", "desc", "tag", "filter",
        content='search_doc', content_rowid='fid', tokenize='${DEFAULT_TOKENIZER}')`,
    );
    await owner.setMeta("search:schema", "hash-from-an-older-build");
    await owner.setMeta(`search:ref:${TABLE}`, "hash-from-an-older-build");
    insert("a1", { headline: "Kenny", cover: "111111111111111111111111" });

    await build();

    expect(mirror("a1")?.thumb).toBe("111111111111111111111111");
  });

  test("renews the claim between backfill chunks", async () => {
    const index = await build();
    await index.suspend(searchTestDatabase as never);
    for (let idx = 0; idx < 5001; idx += 1) insert(`b${String(idx).padStart(5, "0")}`, { headline: "bulk row" });
    let renewals = 0;

    const completed = await index.reconcileRef(
      TABLE,
      { title: `json_extract(NEW."_doc", '$.headline')`, desc: `''`, tag: `''`, thumb: `''`, filter: `''` } as never,
      async () => {
        renewals += 1;
        return true;
      },
    );

    expect(renewals).toBe(1);
    expect(completed).toBe(true);
    expect((db.query(`SELECT count(*) AS n FROM "search_doc"`).get() as { n: number }).n).toBe(5001);
  });

  test("stops the backfill when the claim is taken over mid-flight", async () => {
    const index = await build();
    await index.suspend(searchTestDatabase as never);
    for (let idx = 0; idx < 5001; idx += 1) insert(`b${String(idx).padStart(5, "0")}`, { headline: "bulk row" });

    const completed = await index.reconcileRef(
      TABLE,
      { title: `json_extract(NEW."_doc", '$.headline')`, desc: `''`, tag: `''`, thumb: `''`, filter: `''` } as never,
      async () => false,
    );

    // Carrying on would write rows underneath the new owner's `DELETE FROM search_doc WHERE ref = ?`.
    expect(completed).toBe(false);
  });

  test("gives up the ref when another process takes the claim during a chunk", async () => {
    const index = await build();
    await index.suspend(searchTestDatabase as never);
    for (let idx = 0; idx < 5001; idx += 1) insert(`b${String(idx).padStart(5, "0")}`, { headline: "bulk row" });
    // Offset so the stolen token can never land on the same millisecond as the claim it is replacing.
    const stolen = String(Date.now() + 1000);
    const client = owner.getConnection();
    const execute = client.execute.bind(client);
    let stole = false;
    client.execute = async (sql: string, params?: unknown[] | Record<string, unknown>) => {
      const result = await execute(sql, params);
      // Only the backfill statement — the trigger DDL embeds the same INSERT, and matching that would steal the
      // claim before it is even taken, which is a different case entirely.
      if (!stole && sql.includes(`FROM "${TABLE}" AS NEW`)) {
        stole = true;
        await owner.setMeta(`search:lock:${TABLE}`, stolen);
      }
      return result;
    };

    const current = await index.ensureRef(searchTestConstant as never, searchTestDatabase as never);

    expect(current).toBe(false);
    expect(owner.getMeta(`search:ref:${TABLE}`)).toBe("");
    expect(owner.getMeta(`search:lock:${TABLE}`)).toBe(stolen);
  });

  test("does not replace a ref's triggers when its descriptor is unchanged", async () => {
    await build();
    const client = owner.getConnection();
    const execute = client.execute.bind(client);
    const drops: string[] = [];
    client.execute = async (sql: string, params?: unknown[] | Record<string, unknown>) => {
      if (sql.startsWith("DROP TRIGGER")) drops.push(sql);
      return await execute(sql, params);
    };

    const second = new SearchIndex(owner as never, { enabled: true, tokenizer: DEFAULT_TOKENIZER });
    await second.ensureSchema();
    await second.ensureRef(searchTestConstant as never, searchTestDatabase as never);
    client.execute = execute;

    // A write landing between the drop and the create misses the mirror, and a matching hash means no reconcile
    // ever comes back for it.
    expect(drops.filter((sql) => sql.includes(`${TABLE}_search`))).toEqual([]);
  });

  test("does not replace the mirror triggers on an unchanged boot", async () => {
    await build();
    const client = owner.getConnection();
    const execute = client.execute.bind(client);
    const drops: string[] = [];
    client.execute = async (sql: string, params?: unknown[] | Record<string, unknown>) => {
      if (sql.startsWith("DROP TRIGGER")) drops.push(sql);
      return await execute(sql, params);
    };

    const second = new SearchIndex(owner as never, { enabled: true, tokenizer: DEFAULT_TOKENIZER });
    await second.ensureSchema();
    client.execute = execute;

    // Worse than the model triggers: a mirror row written without `search_doc_au` leaves fts5 on the old text,
    // which stops matching, returns a ghost hit for the old value, and still passes integrity-check.
    expect(drops.filter((sql) => sql.includes("search_doc"))).toEqual([]);
  });

  test("resyncs the index when the mirror triggers do get replaced", async () => {
    await build();
    insert("a1", { headline: "alpha" });
    db.run(`DROP TRIGGER "search_doc_au"`);
    db.query(`UPDATE "${TABLE}" SET "_doc" = json_set("_doc", '$.headline', 'zulu') WHERE "id" = 'a1'`).run();
    expect(matchIds('"zulu"')).toEqual([]);
    await owner.setMeta("search:mirror", "hash-from-an-older-build");

    const second = new SearchIndex(owner as never, { enabled: true, tokenizer: DEFAULT_TOKENIZER });
    await second.ensureSchema();

    expect(matchIds('"zulu"')).toEqual(["a1"]);
    expect(matchIds('"alpha"')).toEqual([]);
  });

  test("retries a ref that another process was rebuilding", async () => {
    const index = await build();
    await index.suspend(searchTestDatabase as never);
    insert("bulk1", { headline: "Imported While Suspended" });
    await owner.setMeta(`search:lock:${TABLE}`, String(Date.now() + 1000));
    expect(await index.resume(searchTestConstant as never, searchTestDatabase as never)).toBe(false);

    db.query(`DELETE FROM "_akan_meta" WHERE "key" = ?`).run(`search:lock:${TABLE}`);

    // Nothing else would ever come back to this ref: the boot moved on and the hash still says stale.
    expect(await index.retryPending()).toBe(0);
    expect(mirror("bulk1")?.title).toBe("Imported While Suspended");
  });

  test("keeps a suspended import recoverable after a crash", async () => {
    const index = await build();
    await index.suspend(searchTestDatabase as never);
    insert("bulk1", { headline: "Imported While Suspended" });

    // The process dies before `resume`: a fresh instance stands in for the restart.
    const restarted = new SearchIndex(owner as never, { enabled: true, tokenizer: DEFAULT_TOKENIZER });
    await restarted.ensureSchema();
    await restarted.ensureRef(searchTestConstant as never, searchTestDatabase as never);

    expect(mirror("bulk1")?.title).toBe("Imported While Suspended");
  });

  test("tells the caller when resume could not rebuild", async () => {
    const index = await build();
    await index.suspend(searchTestDatabase as never);
    insert("bulk1", { headline: "Imported While Suspended" });
    await owner.setMeta(`search:lock:${TABLE}`, String(Date.now()));

    // A bulk importer needs to know the mirror is still stale, not just that the call returned.
    expect(await index.resume(searchTestConstant as never, searchTestDatabase as never)).toBe(false);
    expect(mirror("bulk1")).toBeUndefined();
  });

  test("reports a completed rebuild to the caller", async () => {
    const index = await build();
    await index.suspend(searchTestDatabase as never);
    insert("bulk1", { headline: "Imported While Suspended" });

    expect(await index.resume(searchTestConstant as never, searchTestDatabase as never)).toBe(true);
    expect(mirror("bulk1")?.title).toBe("Imported While Suspended");
  });

  test("survives two concurrent ensureRef runs for one ref", async () => {
    const index = new SearchIndex(owner as never, { enabled: true, tokenizer: DEFAULT_TOKENIZER });
    await index.ensureSchema();

    // Each store starts its own `ensure()`, so one ref really does get two overlapping runs on a boot.
    await Promise.all([
      index.ensureRef(searchTestConstant as never, searchTestDatabase as never),
      index.ensureRef(searchTestConstant as never, searchTestDatabase as never),
    ]);
    insert("a1", { headline: "Kenny" });

    expect(mirror("a1")?.title).toBe("Kenny");
  });

  test("rebuilds the fts table on a tokenizer change without re-reading the model table", async () => {
    await build();
    insert("a1", { headline: "Kenny" });
    db.run(`DROP TRIGGER "${TABLE}_search_ai"`);
    db.run(`DROP TRIGGER "${TABLE}_search_au"`);

    const index = new SearchIndex(owner as never, { enabled: true, tokenizer: "trigram" });
    await index.ensureSchema();

    expect(mirror("a1")?.title).toBe("Kenny");
    expect(matchIds('"enn"')).toEqual(["a1"]);
  });
});

describe("SearchIndex through SqlDocumentStore", () => {
  test("mirrors documents written through the store", async () => {
    const store = await openStore();

    const doc = await store.create({ headline: "Kenny Park", keywords: ["alpha"], histories: [] });

    expect(mirror(doc.id)?.title).toBe("Kenny Park");
    expect(matchIds('"alpha"')).toEqual([doc.id]);
  });

  test("mirrors an update and clears on remove", async () => {
    const store = await openStore();
    const doc = await store.create({ headline: "Kenny Park", keywords: [], histories: [] });

    await store.update(doc.id, { headline: "Renamed Person" });
    expect(matchIds('"Renamed"')).toEqual([doc.id]);

    await store.remove(doc.id);
    expect(mirror(doc.id)).toBeUndefined();
  });

  test("writes no mirror rows when disabled", async () => {
    const store = await openStore({ enabled: false });

    await store.create({ headline: "Kenny Park", keywords: [], histories: [] });

    const tables = db.query(`SELECT "name" FROM "sqlite_master" WHERE "type" = 'table'`).all() as { name: string }[];
    expect(tables.map((row) => row.name)).not.toContain("search_doc");
  });

  test("rejects a model that would shadow the mirror tables", async () => {
    const index = new SearchIndex(owner as never, { enabled: true, tokenizer: DEFAULT_TOKENIZER });
    const store = new SqlDocumentStore(
      storeOwnerFor(index) as never,
      searchTestConstant as never,
      { ...searchTestDatabase, refName: "search_doc" } as never,
      new DocumentSchema(),
    );

    await expect(store.ensure()).rejects.toThrow("Invalid database identifier: search_doc");
  });
});

describe("search query", () => {
  const q = documentQueryHelper;
  const doc = (headline: string, extra: Partial<DocInput> = {}) => ({
    headline,
    keywords: [],
    histories: [],
    ...extra,
  });

  // The title hit is created in the middle so that neither insertion order nor either createdAt direction would
  // put it first — only the bm25 score does.
  const seedRanked = async (store: SqlDocumentStore) => ({
    firstDesc: await store.create(doc("Alpha Person", { summary: "reviewed by Kenny" })),
    inTitle: await store.create(doc("Kenny Park")),
    lastDesc: await store.create(doc("Beta Person", { summary: "greeted Kenny" })),
  });

  test("ranks a title hit above a body hit", async () => {
    const store = await openStore();
    const { firstDesc, inTitle, lastDesc } = await seedRanked(store);

    const found = await store.findIds(q.search("Kenny"));
    expect(found[0]).toBe(inTitle.id);
    expect(new Set(found)).toEqual(new Set([firstDesc.id, inTitle.id, lastDesc.id]));
  });

  test("combines with an ordinary field condition", async () => {
    const store = await openStore();
    const mine = await store.create(doc("Kenny Park", { orgId: "111111111111111111111111" }));
    await store.create(doc("Kenny Park", { orgId: "222222222222222222222222" }));

    const query = q.all(q.search("Kenny"), { orgId: "111111111111111111111111" });
    expect(await store.findIds(query)).toEqual([mine.id]);
    expect(await store.count(query)).toBe(1);
    expect(await store.insight(query)).toEqual({ count: 1 });
  });

  test("pages tied scores without repeating or dropping a row", async () => {
    const store = await openStore();
    for (const index of [0, 1, 2]) await store.create(doc(`Kenny Park ${index}`));

    const [first, second] = [
      await store.findIds(q.search("Kenny"), { limit: 2 }),
      await store.findIds(q.search("Kenny"), { skip: 2, limit: 2 }),
    ];
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(1);
    expect(new Set([...first, ...second]).size).toBe(3);
  });

  test("lets an explicit sort win, and reads an empty sort as relevance", async () => {
    const store = await openStore();
    const { firstDesc, inTitle, lastDesc } = await seedRanked(store);

    expect(await store.findIds(q.search("Kenny"), { sort: { headline: 1 } })).toEqual([
      firstDesc.id,
      lastDesc.id,
      inTitle.id,
    ]);
    // `relevance` arrives from the filter as an empty sort map.
    expect((await store.findIds(q.search("Kenny"), { sort: {} }))[0]).toBe(inTitle.id);
  });

  test("honours custom bm25 weights", async () => {
    const store = await openStore();
    const { inTitle } = await seedRanked(store);

    // Inverting the title/desc weights must push the title hit to the back.
    expect((await store.findIds(q.search("Kenny", { weights: [1, 10, 0, 0] }))).at(-1)).toBe(inTitle.id);
  });

  test("matches a prefix only when asked", async () => {
    const store = await openStore();
    const only = await store.create(doc("Kenny Park"));

    expect(await store.findIds(q.search("Ken"))).toEqual([]);
    expect(await store.findIds(q.search("Ken", { prefix: true }))).toEqual([only.id]);
  });

  test("scopes the match to the named columns", async () => {
    const store = await openStore();
    const inTitle = await store.create(doc("Kenny Park"));
    await store.create(doc("Alpha Person", { summary: "asked Kenny" }));

    expect(await store.findIds(q.search("Kenny", { columns: ["title"] }))).toEqual([inTitle.id]);
  });

  test("returns projected rows while joined to the index", async () => {
    const store = await openStore();
    const only = await store.create(doc("Kenny Park"));

    const found = await store.find(q.search("Kenny"), { select: { headline: true } });
    expect(found.map((row) => row.id)).toEqual([only.id]);
  });

  test("matches nothing on blank input rather than everything", async () => {
    const store = await openStore();
    await store.create(doc("Kenny Park"));

    expect(await store.findIds(q.search("   "))).toEqual([]);
    expect(await store.count(q.all(q.search(""), {}))).toBe(0);
  });

  test("rejects a search that a join cannot express", async () => {
    const store = await openStore();

    await expect(store.find(q.any(q.search("Kenny"), { headline: "Alpha" }))).rejects.toThrow(
      "must sit at an AND position",
    );
    await expect(store.find(q.not(q.search("Kenny")))).rejects.toThrow("must sit at an AND position");
  });

  test("rejects a query-level write carrying a search", async () => {
    const store = await openStore();

    await expect(store.updateManyByQuery(q.search("Kenny"), { headline: "Alpha" })).rejects.toThrow(
      "q.search() cannot be used in updateManyByQuery",
    );
  });

  test("rejects weights that do not line up with the index columns", async () => {
    const store = await openStore();

    await expect(store.find(q.search("Kenny", { weights: [1, 2] }))).rejects.toThrow("must be 4 finite numbers");
    await expect(store.find(q.search("Kenny", { weights: [1, 2, 3, Number.NaN] }))).rejects.toThrow(
      "must be 4 finite numbers",
    );
  });

  test("names the model and the env var when the index is switched off", async () => {
    const store = await openStore({ enabled: false });

    const failure = store.find(q.search("Kenny"));
    await expect(failure).rejects.toThrow(TABLE);
    await expect(failure).rejects.toThrow("AKAN_SEARCH_ENABLED");
  });
});

describe("SearchIndex toggle", () => {
  test("drops model triggers and writes the marker when disabled", async () => {
    await build();
    insert("a1", { headline: "Kenny" });

    await build({ enabled: false });
    insert("a2", { headline: "Later" });

    expect(owner.getMeta("search:disabled")).toBe("1");
    expect(mirror("a2")).toBeUndefined();
    // Existing data is kept: flipping a boolean must not be destructive.
    expect(mirror("a1")?.title).toBe("Kenny");
  });

  test("reconciles everything when re-enabled after a disabled write", async () => {
    await build();
    await build({ enabled: false });
    insert("a1", { headline: "Written While Off" });
    expect(mirror("a1")).toBeUndefined();

    await build();

    expect(mirror("a1")?.title).toBe("Written While Off");
    expect(owner.getMeta("search:disabled")).toBeUndefined();
  });

  test("fails the boot with the escape hatch named when the index cannot be built", async () => {
    const index = new SearchIndex(owner as never, { enabled: true, tokenizer: "nosuchtokenizer" });

    // Deliberately fatal: a half-built index would raise on every search instead of once, here.
    await expect(index.ensureSchema()).rejects.toThrow("AKAN_SEARCH_ENABLED=0");
  });

  test("creates no tables when disabled from the start", async () => {
    await build({ enabled: false });

    const tables = db.query(`SELECT "name" FROM "sqlite_master" WHERE "type" = 'table'`).all() as { name: string }[];
    expect(tables.map((row) => row.name)).not.toContain("search_doc");
  });
});

describe("SearchIndex optimize", () => {
  test("merges segments and leaves every document still findable", async () => {
    const index = await build();
    for (let idx = 0; idx < 20; idx += 1) insert(`a${idx}`, { headline: `Kenny ${idx}` });

    expect(await index.optimize()).toBe(true);

    expect(matchIds('"kenny"')).toHaveLength(20);
  });

  test("does nothing when the index is switched off", async () => {
    const index = await build({ enabled: false });

    expect(await index.optimize()).toBe(false);
  });

  test("yields to a process that already holds the claim", async () => {
    const index = await build();
    // The scheduler lock is per-process, so the shared claim is the only thing stopping a fleet-wide pile-up.
    await owner.setMeta("search:lock:__optimize", String(Date.now()));

    expect(await index.optimize()).toBe(false);
  });

  test("reports failure instead of throwing when the index table is gone", async () => {
    const index = await build();
    db.run(`DROP TABLE "search_fts"`);

    expect(await index.optimize()).toBe(false);
  });

  test("lets only one of two overlapping runs take the claim", async () => {
    const index = await build();

    // The claim is one conditional upsert, so it holds without `transaction()` — which would collide with any
    // unrelated transaction already open on this connection.
    const results = await Promise.all([index.optimize(), index.optimize()]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test("takes over a claim left behind by a process that died", async () => {
    const index = await build();
    await owner.setMeta("search:lock:__optimize", String(Date.now() - 11 * 60 * 1000));

    expect(await index.optimize()).toBe(true);
  });

  test("leaves behind a claim that was taken over while it worked", async () => {
    const index = await build();
    const stolen = String(Date.now() + 1000);
    const client = owner.getConnection();
    const execute = client.execute.bind(client);
    client.execute = async (sql: string, params?: unknown[] | Record<string, unknown>) => {
      const result = await execute(sql, params);
      // Stall long enough for the claim to expire and another process to take it, then finish anyway.
      if (sql.includes("'merge'")) await owner.setMeta("search:lock:__optimize", stolen);
      return result;
    };

    await index.optimize();

    // An unconditional release would drop the new owner's claim and let a third process start merging.
    expect(owner.getMeta("search:lock:__optimize")).toBe(stolen);
  });
});

describe("SearchIndex schema failure", () => {
  const ftsExists = () =>
    !!db.query(`SELECT "name" FROM "sqlite_master" WHERE "type" = 'table' AND "name" = 'search_fts'`).get();

  test("keeps model writes working when the index cannot be created", async () => {
    await build();
    const bad = new SearchIndex(owner as never, { enabled: true, tokenizer: "no_such_tokenizer" });

    await expect(bad.ensureSchema()).rejects.toThrow("no_such_tokenizer");

    // Mirror triggers left over the dropped table would raise "no such table" on every write to an indexed
    // model — on every process using this database, not just the one that failed to boot.
    expect(ftsExists()).toBe(false);
    expect(() => insert("a1", { headline: "Kenny" })).not.toThrow();
  });

  test("recreates an index that a failed boot left missing, losing nothing", async () => {
    await build();
    const bad = new SearchIndex(owner as never, { enabled: true, tokenizer: "no_such_tokenizer" });
    await expect(bad.ensureSchema()).rejects.toThrow("no_such_tokenizer");
    insert("a1", { headline: "Kenny" });

    // The failed boot never wrote a hash, so the stored one still matches this tokenizer.
    await build();

    expect(ftsExists()).toBe(true);
    // Written while the index was gone: the model triggers kept `search_doc` current, so `rebuild` picks it up.
    expect(matchIds('"Kenny"')).toEqual(["a1"]);
  });
});
