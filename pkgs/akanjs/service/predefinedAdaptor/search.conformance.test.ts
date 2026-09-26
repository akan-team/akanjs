import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import type { ConstantModel } from "akanjs/constant";
import {
  type DatabaseModel,
  DocumentSchema,
  type DocumentSearchOptions,
  documentQueryHelper as q,
} from "akanjs/document";
import { ConformanceEnv, type SqlDriver, type SqlDriverKind } from "../../test/conformance";
import { type PostgresDatabase, SqlDocumentStore, type SqliteDatabase } from "./database.adaptor";
import { searchConfConstant, searchConfDatabase } from "./search.conformance.fixture";
import { DEFAULT_TOKENIZER, Fts5SearchEngine, PostgresSearchEngine, SearchIndex } from "./searchIndex";

// Every case states what fts5 answers, which is the contract: SQLite is the mode text search was built on, and a
// Postgres app must find the same documents for the same text. Rank may differ — `ts_rank` has no document-frequency
// term — so order is asserted only where the column weights alone decide it.

const instanceEntry = path.join(import.meta.dir, "search.conformance.instance.ts");

const storeOn = async (
  driver: SqlDriver,
  constant: ConstantModel = searchConfConstant,
  database: DatabaseModel = searchConfDatabase,
) => {
  const store = new SqlDocumentStore(driver.database, constant, database, new DocumentSchema(), driver.dialect);
  await store.ensure();
  return store;
};

/** A connection of the test's own, outside the adaptor's pool — another client holding a transaction open. */
const outsideConnection = async (driver: SqlDriver) => {
  const { default: postgres } = await import("postgres");
  const sql = postgres((driver.database as PostgresDatabase).config.url as string, {
    max: 1,
    onnotice: () => undefined,
  });
  const reserved = await sql.reserve();
  await reserved.unsafe("BEGIN");
  return {
    run: async (statement: string, params: string[] = []) => await reserved.unsafe(statement, params),
    commit: async () => {
      await reserved.unsafe("COMMIT");
      reserved.release();
      await sql.end();
    },
  };
};

const indexOf = (driver: SqlDriver) => {
  const index = driver.database.getSearchIndex();
  if (!index) throw new Error(`${driver.kind} keeps no search index`);
  return index;
};

// Unique two-syllable Hangul words: the input that packs the most distinct lexemes into the fewest characters.
const denseWords = (count: number) =>
  Array.from(
    { length: count },
    (_, idx) =>
      String.fromCharCode(0xac00 + (idx % 11172)) + String.fromCharCode(0xac00 + (Math.floor(idx / 11172) % 11172)),
  ).join(" ");

const describeDriver = (kind: SqlDriverKind) => {
  describe(`text search (${kind})`, () => {
    let driver: SqlDriver;
    let store: SqlDocumentStore;
    const make = async (headline: string, extra: Record<string, unknown> = {}) =>
      (await store.create({ headline, keywords: [], histories: [], ...extra })) as { id: string };
    const found = async (text: string, options: DocumentSearchOptions = {}) =>
      await store.findIds(q.search(text, options));

    beforeAll(async () => {
      driver = await ConformanceEnv.openSqlDriver(kind);
      store = await storeOn(driver);
    });
    afterAll(async () => {
      await driver?.close();
    });
    beforeEach(async () => {
      await driver.database.getConnection().execute(`DELETE FROM "searchConf"`);
    });

    test("finds a document by one word of its title", async () => {
      const wanted = await make("Quarterly revenue report");
      await make("Team offsite");
      expect(await found("revenue")).toEqual([wanted.id]);
      expect(await found("REVENUE report")).toEqual([wanted.id]);
      expect(await found("revenue offsite")).toEqual([]);
    });

    test("ranks a title hit above a body hit, and lets the weights turn that around", async () => {
      const firstDesc = await make("Alpha Person", { summary: "reviewed by Kenny" });
      const inTitle = await make("Kenny Park");
      const lastDesc = await make("Beta Person", { summary: "greeted Kenny" });

      const ranked = await found("Kenny");
      expect(ranked[0]).toBe(inTitle.id);
      expect(new Set(ranked)).toEqual(new Set([firstDesc.id, inTitle.id, lastDesc.id]));
      expect((await found("Kenny", { weights: [1, 10, 0, 0] })).at(-1)).toBe(inTitle.id);
    });

    test("splits words wherever unicode61 does", async () => {
      const doc = await make("Contact hello@naver.com", {
        summary: "well-known v1.2.3 build under /usr/local, 3.14 ratio",
      });
      for (const text of ["naver", "hello", "com", "hello@naver.com", "well", "known", "well-known", "v1", "usr", "14"])
        expect(await found(text)).toEqual([doc.id]);
      expect(await found("hel")).toEqual([]);
      expect(await found("hel", { prefix: true })).toEqual([doc.id]);
    });

    test("folds case and diacritics on both sides", async () => {
      const doc = await make("ÉCLAIR au Café");
      for (const text of ["eclair", "Éclair", "cafe", "CAFÉ"]) expect(await found(text)).toEqual([doc.id]);
    });

    test("reads Korean as whole words, matching part of one only as a prefix", async () => {
      const compound = await make("한국어 검색엔진");
      const plain = await make("검색 결과");
      expect(await found("검색")).toEqual([plain.id]);
      expect(new Set(await found("검색", { prefix: true }))).toEqual(new Set([compound.id, plain.id]));
      expect(await found("엔진")).toEqual([]);
      expect(await found("한국어 결과")).toEqual([]);
      expect(await found("한국어")).toEqual([compound.id]);
    });

    test("matches nothing for input holding no word, and drops such a term beside a real one", async () => {
      const doc = await make("Kenny Park");
      for (const text of ["", "   ", "!!!", "😀", "- -"]) expect(await found(text)).toEqual([]);
      expect(await found("😀 kenny")).toEqual([doc.id]);
      expect(await found("!!! kenny")).toEqual([doc.id]);
    });

    test("takes query syntax in the input as text", async () => {
      await make("Kenny Park");
      const inputs = ['hello"', "a AND", "*", "NEAR(", "-hello", "foo:bar", "a & b", "a | b", "!a", "(a", "a <-> b"];
      for (const text of [...inputs, "a:*", "'a'", "\\", "kenny:*A", "%", "_"])
        expect(Array.isArray(await found(text, { prefix: true }))).toBe(true);
    });

    test("never runs a phrase from one column into the next", async () => {
      const doc = await make("Alpha Omega", { summary: "Beta Gamma", keywords: ["delta"] });
      expect(await found("alpha-omega")).toEqual([doc.id]);
      expect(await found("omega-beta")).toEqual([]);
      expect(await found("omega-delta")).toEqual([]);
    });

    test("scopes the match to the named columns", async () => {
      const inTitle = await make("Kenny Park");
      await make("Alpha Person", { summary: "asked Kenny" });
      expect(await found("Kenny", { columns: ["title"] })).toEqual([inTitle.id]);
      expect(await found("Ken", { columns: ["title"], prefix: true })).toEqual([inTitle.id]);
      expect(await found("Park", { columns: ["desc"] })).toEqual([]);
    });

    test("matches a scoping value as one token through the punctuation in it", async () => {
      const mine = await make("Kenny Park", { scope: "acme.corp/west" });
      await make("Kenny Park", { scope: "acme.corp/east" });
      expect(await found("scope_acme_corp_west")).toEqual([mine.id]);
      expect(await found("kenny scope_acme_corp_west")).toEqual([mine.id]);
    });

    test("indexes arrays, and array leaves inside an array of objects", async () => {
      const doc = await make("Kenny", {
        keywords: ["alpha", "beta"],
        histories: [
          { action: "signed", labels: ["gamma", "delta"] },
          { action: "left", labels: [] },
        ],
      });
      for (const text of ["alpha", "beta", "signed", "left", "gamma", "delta"])
        expect(await found(text)).toEqual([doc.id]);
    });

    test("never indexes a secret field or the thumb", async () => {
      const doc = await make("Kenny", { secretToken: "topsecret", cover: "coverword" });
      expect(await found("topsecret")).toEqual([]);
      expect(await found("coverword")).toEqual([]);
      expect(await found("kenny")).toEqual([doc.id]);
    });

    test("follows a query-level write, which fires no document hook", async () => {
      const doc = await make("Kenny Park");
      await store.updateManyByQuery({ id: doc.id }, { headline: "Renamed Person" });
      expect(await found("kenny")).toEqual([]);
      expect(await found("renamed")).toEqual([doc.id]);
    });

    test("forgets a removed document and finds it again once revived", async () => {
      const doc = await make("Kenny Park");
      await store.remove(doc.id);
      expect(await found("kenny")).toEqual([]);
      await driver.database
        .getConnection()
        .execute(`UPDATE "searchConf" SET "removedAt" = NULL WHERE "id" = ?`, [doc.id]);
      expect(await found("kenny")).toEqual([doc.id]);
    });

    test("combines with a field condition, and counts what it finds", async () => {
      const mine = await make("Kenny Park", { rank: 1 });
      await make("Kenny Park", { rank: 2 });
      const query = q.all(q.search("Kenny"), { rank: 1 });
      expect(await store.findIds(query)).toEqual([mine.id]);
      expect(await store.count(query)).toBe(1);
      expect(await store.insight(query)).toEqual({ count: 1 });
    });

    test("pages tied scores without repeating or dropping a row", async () => {
      for (const idx of [0, 1, 2]) await make(`Kenny Park ${idx}`);
      const first = await store.findIds(q.search("Kenny"), { limit: 2 });
      const second = await store.findIds(q.search("Kenny"), { skip: 2, limit: 2 });
      expect(first).toHaveLength(2);
      expect(second).toHaveLength(1);
      expect(new Set([...first, ...second]).size).toBe(3);
    });

    test("lets an explicit sort win over relevance", async () => {
      const second = await make("Beta Kenny", { rank: 2 });
      const first = await make("Alpha Kenny", { rank: 1 });
      expect(await store.findIds(q.search("Kenny"), { sort: { rank: 1 } })).toEqual([first.id, second.id]);
      expect(await store.findIds(q.search("Kenny"), { sort: { rank: -1 } })).toEqual([second.id, first.id]);
    });

    test("returns projected rows while joined to the index", async () => {
      const only = await make("Kenny Park");
      const rows = await store.find(q.search("Kenny"), { select: { headline: true } });
      expect(rows.map((row) => row.id)).toEqual([only.id]);
    });

    test("finds what another process wrote", async () => {
      const other = await driver.sibling();
      try {
        const doc = await (await storeOn(other)).create({ headline: "Written Elsewhere", keywords: [], histories: [] });
        expect(await found("elsewhere")).toEqual([doc.id]);
      } finally {
        await other.close();
      }
    });

    test("backfills what was written while the triggers were suspended", async () => {
      const index = indexOf(driver);
      await index.suspend(searchConfDatabase);
      const doc = await make("Imported While Suspended");
      expect(await found("imported")).toEqual([]);
      expect(await index.resume(searchConfConstant, searchConfDatabase)).toBe(true);
      expect(await found("imported")).toEqual([doc.id]);
    });

    test("keeps a write working when its text runs past what the index takes", async () => {
      const doc = await make(denseWords(40_000), { summary: denseWords(150_000), keywords: [denseWords(20_000)] });
      expect(await found(denseWords(1))).toEqual([doc.id]);
    });

    test.if(kind === "postgres")("a backfill overlapping a write keeps what the write left", async () => {
      const doc = await make("Original Title");
      const conn = driver.database.getConnection();
      await conn.execute(`DELETE FROM "search_doc" WHERE "refId" = ?`, [doc.id]);
      const writer = await outsideConnection(driver);
      await writer.run(
        `UPDATE "searchConf" SET "_doc" = jsonb_set("_doc", '{headline}', '"Changed Title"') WHERE "id" = $1`,
        [doc.id],
      );
      const columns = new PostgresSearchEngine(driver.database as PostgresDatabase, {
        tokenizer: DEFAULT_TOKENIZER,
        schema: "unused",
      }).columns(searchConfConstant, searchConfDatabase, "NEW");
      if (!columns) throw new Error("the fixture declares text roles");
      const backfill = indexOf(driver).reconcileRef("searchConf", columns);
      await Bun.sleep(200);
      await writer.commit();
      expect(await backfill).toBe(true);
      expect(await found("changed")).toEqual([doc.id]);
      expect(await found("original")).toEqual([]);
    });

    test.if(kind === "postgres")("a boot does not wait on a write in flight to a searchable model", async () => {
      const doc = await make("Kenny Park");
      const writer = await outsideConnection(driver);
      await writer.run(`UPDATE "searchConf" SET "updatedAt" = "updatedAt" WHERE "id" = $1`, [doc.id]);
      const other = await driver.sibling();
      try {
        const booted = storeOn(other);
        expect(await Promise.race([booted.then(() => "ensured"), Bun.sleep(3000).then(() => "waited")])).toBe(
          "ensured",
        );
      } finally {
        await writer.commit();
        await other.close();
      }
    });
  });

  // Each case boots on storage of its own, since it changes the settings the index was built with.
  describe(`text search settings (${kind})`, () => {
    let driver: SqlDriver;
    const siblings: SqlDriver[] = [];

    beforeEach(async () => {
      driver = await ConformanceEnv.openSqlDriver(kind);
    });
    afterEach(async () => {
      for (const opened of siblings.splice(0)) await opened.close();
      await driver?.close();
    });

    const create = async (on: SqlDriver, headline: string, summary?: string) =>
      (await (await storeOn(on)).create({ headline, summary, keywords: [], histories: [] })) as { id: string };
    const searchOn = async (on: SqlDriver, text: string, options: DocumentSearchOptions = {}) =>
      await (await storeOn(on)).findIds(q.search(text, options));

    // Postgres connections of one process run as truly apart as those of several.
    test.if(kind === "postgres")("builds one index when several processes boot on an empty database", async () => {
      await driver.close();
      driver = await ConformanceEnv.openSqlDriver(kind, { search: { enabled: false } });
      const booted = await Promise.all([1, 2, 3].map(async () => await driver.sibling({ enabled: true })));
      siblings.push(...booted);
      await Promise.all(booted.map(async (each) => await storeOn(each)));
      const doc = await create(booted[0], "Concurrent Boot");
      expect(await searchOn(booted[2], "concurrent")).toEqual([doc.id]);
    });

    // bun:sqlite waits for a lock synchronously, so two adaptors of one process cannot stand in for two processes.
    test.if(kind === "sqlite")("builds one index when several processes boot on one file at once", async () => {
      await driver.close();
      driver = await ConformanceEnv.openSqlDriver(kind, { search: { enabled: false } });
      const config = {
        ...(driver.database as SqliteDatabase).config,
        search: { enabled: true, tokenizer: DEFAULT_TOKENIZER },
      };
      const startAt = Date.now() + 1500;
      const booted = await Promise.all(
        [1, 2, 3, 4].map(async () => {
          const child = Bun.spawn(["bun", instanceEntry], {
            cwd: path.join(import.meta.dir, "../.."),
            env: {
              ...process.env,
              AKAN_TEST_SQLITE_CONFIG: JSON.stringify(config),
              AKAN_TEST_START_AT: String(startAt),
            },
            stdout: "ignore",
            stderr: "pipe",
          });
          const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
          return { exitCode, stderr: stderr.slice(-2000) };
        }),
      );
      expect(booted.filter(({ exitCode }) => exitCode !== 0)).toEqual([]);
      driver = await driver.reconfigure({ enabled: true });
      const doc = await create(driver, "Concurrent Boot");
      expect(await searchOn(driver, "concurrent")).toEqual([doc.id]);
    });

    test("refuses a search while the index is off, and catches up with what was written meanwhile", async () => {
      driver = await driver.reconfigure({ enabled: false });
      const doc = await create(driver, "Written While Off");
      await expect(searchOn(driver, "written")).rejects.toThrow("AKAN_SEARCH_ENABLED");
      driver = await driver.reconfigure({ enabled: true });
      expect(await searchOn(driver, "written")).toEqual([doc.id]);
    });

    test("rebuilds the index from the mirror when the tokenizer changes, and back", async () => {
      const doc = await create(driver, "Kenny Park", "well-known Café 검색엔진");
      driver = await driver.reconfigure({ tokenizer: "trigram" });
      expect(await searchOn(driver, "enn")).toEqual([doc.id]);
      expect(await searchOn(driver, "KENNY")).toEqual([doc.id]);
      expect(await searchOn(driver, "ell-kno")).toEqual([doc.id]);
      expect(await searchOn(driver, "검색엔")).toEqual([doc.id]);
      expect(await searchOn(driver, "Café")).toEqual([doc.id]);
      // A trigram needs three characters: a shorter term is dropped beside a longer one and matches nothing alone.
      expect(await searchOn(driver, "zz enn")).toEqual([doc.id]);
      expect(await searchOn(driver, "en")).toEqual([]);
      expect(await searchOn(driver, "검색")).toEqual([]);
      expect(await searchOn(driver, "cafe")).toEqual([]);
      expect(await searchOn(driver, "enn", { columns: ["desc"] })).toEqual([]);
      expect(await searchOn(driver, "enn park")).toEqual([doc.id]);
      expect(await searchOn(driver, "enn zzz")).toEqual([]);

      driver = await driver.reconfigure({ tokenizer: DEFAULT_TOKENIZER });
      expect(await searchOn(driver, "enn")).toEqual([]);
      expect(await searchOn(driver, "kenny")).toEqual([doc.id]);
    });

    test("keeps diacritics when the tokenizer is told to", async () => {
      const doc = await create(driver, "Café Éclair");
      driver = await driver.reconfigure({ tokenizer: "unicode61 remove_diacritics 0" });
      expect(await searchOn(driver, "café")).toEqual([doc.id]);
      expect(await searchOn(driver, "CAFÉ")).toEqual([doc.id]);
      expect(await searchOn(driver, "cafe")).toEqual([]);
    });

    test("fails the boot on a tokenizer it cannot build, naming the way out, and leaves writes working", async () => {
      const tokenizer = "no_such_tokenizer";
      const engine =
        kind === "postgres"
          ? new PostgresSearchEngine(driver.database as never, { tokenizer, schema: "unused" })
          : new Fts5SearchEngine(driver.database, tokenizer);
      const index = new SearchIndex(driver.database, { enabled: true, tokenizer }, engine);
      await expect(index.ensureSchema()).rejects.toThrow("AKAN_SEARCH_ENABLED=0");
      await create(driver, "Still Writable");
    });
  });
};

describe("Postgres reading of the fts5 tokenizer", () => {
  test("maps unicode61 and trigram with the options fts5 gives them", () => {
    expect(PostgresSearchEngine.mode("unicode61 remove_diacritics 2")).toEqual({ kind: "word", unaccent: true });
    expect(PostgresSearchEngine.mode("unicode61")).toEqual({ kind: "word", unaccent: true });
    expect(PostgresSearchEngine.mode(`unicode61 "remove_diacritics" '0'`)).toEqual({ kind: "word", unaccent: false });
    expect(PostgresSearchEngine.mode("trigram")).toEqual({ kind: "trigram", caseSensitive: false });
    expect(PostgresSearchEngine.mode("trigram case_sensitive 1")).toEqual({ kind: "trigram", caseSensitive: true });
  });

  test("refuses what it would build differently, naming the way out", () => {
    for (const tokenizer of ["porter unicode61", "ascii", "unicode61 tokenchars _", "trigram remove_diacritics 1", ""])
      expect(() => PostgresSearchEngine.mode(tokenizer)).toThrow("AKAN_SEARCH_ENABLED=0");
  });

  test("quotes each word piece, phrases a term, and marks only the last piece as a prefix", () => {
    expect(PostgresSearchEngine.tsquery("hello@naver.com kenny", {})).toBe("'hello' <-> 'naver' <-> 'com' & 'kenny'");
    expect(PostgresSearchEngine.tsquery("well-kno", { prefix: true, columns: ["title", "desc"] })).toBe(
      "'well':AC <-> 'kno':*AC",
    );
    expect(PostgresSearchEngine.tsquery("it's", {})).toBe("'it' <-> 's'");
    for (const text of ["", "  ", "!!!", "'\\:*&|"]) expect(PostgresSearchEngine.tsquery(text, {})).toBe(null);
  });
});

for (const kind of ConformanceEnv.sqlDrivers("text search")) describeDriver(kind);
