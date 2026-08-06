import { Database, type SQLQueryBindings } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { type DocumentQuery, DocumentSchema, documentQueryHelper, getFilterMeta } from "akanjs/document";
import { DEFAULT_TOKENIZER, SearchIndex, SqlDocumentStore } from "akanjs/service";
import type { UserStatus } from "./user.constant";

// See `admin.document.test.ts`: the lib barrels need a client env that `akan test <lib>` does not supply, and a
// static import would be evaluated before any statement here could set it.
process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "akanjs";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";
process.env.AKAN_PUBLIC_ENV ??= "local";
process.env.AKAN_PUBLIC_OPERATION_MODE ??= "local";

const cnst = await import("../cnst");
const db = await import("../db");
const { UserFilter } = await import("./user.document");

const TABLE = "user";
const IMAGE_ID = "111111111111111111111111";

let sqlite: Database;
let store: SqlDocumentStore;

const client = () => ({
  execute: async (sql: string, params: unknown[] | Record<string, unknown> = []) =>
    sqlite.query(sql).run(...((Array.isArray(params) ? params : Object.values(params)) as SQLQueryBindings[])),
  prepare: (sql: string) => {
    const statement = sqlite.query(sql);
    return {
      run: async (...params: unknown[]) => statement.run(...(params as SQLQueryBindings[])),
      get: async (...params: unknown[]) => statement.get(...(params as SQLQueryBindings[])) ?? null,
      all: async (...params: unknown[]) => statement.all(...(params as SQLQueryBindings[])),
    };
  },
  close: async () => {
    sqlite.close();
  },
});

const mirrorRow = (id: string) =>
  (sqlite.query(`SELECT * FROM "search_doc" WHERE "ref" = ? AND "refId" = ?`).get(TABLE, id) as Record<
    string,
    string
  > | null) ?? undefined;

const bySearch = (text: string, statuses?: UserStatus["value"][]) => {
  const queryFn = getFilterMeta(UserFilter).query.bySearch.queryFn;
  if (!queryFn) throw new Error("UserFilter.bySearch declares no query function");
  return queryFn(text, statuses, documentQueryHelper) as DocumentQuery;
};

beforeEach(async () => {
  sqlite = new Database(":memory:", { strict: true, create: true });
  sqlite.run(
    `CREATE TABLE "_akan_meta" ("key" TEXT PRIMARY KEY NOT NULL, "value" TEXT NOT NULL, "updatedAt" INTEGER NOT NULL)`,
  );
  const connection = client();
  const owner = {
    getConnection: () => connection,
    getMeta: (key: string) =>
      (sqlite.query(`SELECT "value" FROM "_akan_meta" WHERE "key" = ?`).get(key) as { value: string } | null)?.value,
    setMeta: async (key: string, value: string) => {
      sqlite
        .query(
          `INSERT INTO "_akan_meta"("key","value","updatedAt") VALUES (?,?,?)
           ON CONFLICT("key") DO UPDATE SET "value" = excluded."value"`,
        )
        .run(key, value, Date.now());
    },
    transaction: async <T>(fn: () => T | Promise<T>) => await fn(),
    afterCommit: async (fn: () => unknown) => {
      await fn();
    },
    getSearchIndex: () => index,
  };
  const index = new SearchIndex(owner as never, { enabled: true, tokenizer: DEFAULT_TOKENIZER });
  await index.ensureSchema();
  const schema = new DocumentSchema();
  db.user.model._onSchema(schema as never);
  db.user.model._libsOnSchema(schema as never);
  store = new SqlDocumentStore(owner as never, cnst.user as never, db.user as never, schema);
  await store.ensure();
});

describe("User search index", () => {
  test("routes each declared field to its own mirror column", async () => {
    const user = await store.create({
      nickname: "Kenny",
      image: IMAGE_ID,
      images: [],
      appliedImages: [],
      playing: ["chess", "go"],
      status: "active",
    });

    const row = mirrorRow(user.id);
    expect(row?.title).toBe("Kenny");
    expect(row?.tag).toBe("chess go");
    expect(row?.thumb).toBe(IMAGE_ID);
    expect(row?.filter).toBe("roles_user status_active");
  });

  test("never mirrors a secret profile field", async () => {
    const user = await store.create({
      nickname: "Kenny",
      images: [],
      appliedImages: [],
      name: "Real Name",
      accountId: "kenny@example.com",
      phone: "01012345678",
    });

    const mirrored = JSON.stringify(mirrorRow(user.id));
    expect(mirrored).not.toContain("Real Name");
    expect(mirrored).not.toContain("kenny@example.com");
    expect(mirrored).not.toContain("01012345678");
    expect(await store.findIds(bySearch("kenny@example.com"))).toEqual([]);
  });

  test("finds a user by a nickname prefix and by what they play", async () => {
    const kenny = await store.create({ nickname: "Kenny", images: [], appliedImages: [], playing: ["chess"] });
    await store.create({ nickname: "Other", images: [], appliedImages: [], playing: ["go"] });

    expect(await store.findIds(bySearch("ken"))).toEqual([kenny.id]);
    expect(await store.findIds(bySearch("chess"))).toEqual([kenny.id]);
  });

  test("narrows the search by status", async () => {
    const active = await store.create({ nickname: "Kenny", images: [], appliedImages: [], status: "active" });
    await store.create({ nickname: "Kenny Two", images: [], appliedImages: [], status: "dormant" });

    expect(await store.findIds(bySearch("kenny", ["active"]))).toEqual([active.id]);
    expect(await store.findIds(bySearch("kenny"))).toHaveLength(2);
  });

  test("reindexes an atomic query write, which fires no document hook", async () => {
    const user = await store.create({ nickname: "Kenny", images: [], appliedImages: [] });

    await store.updateManyByQuery({ id: user.id }, { nickname: "Renamed" });

    expect(await store.findIds(bySearch("kenny"))).toEqual([]);
    expect(await store.findIds(bySearch("renamed"))).toEqual([user.id]);
  });

  test("drops a soft-deleted user from the results", async () => {
    const user = await store.create({ nickname: "Kenny", images: [], appliedImages: [] });

    await store.remove(user.id);

    expect(await store.findIds(bySearch("kenny"))).toEqual([]);
    expect(mirrorRow(user.id)).toBeUndefined();
  });
});
