import { Database, type SQLQueryBindings } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { type DocumentQuery, DocumentSchema, documentQueryHelper, getFilterMeta } from "akanjs/document";
import { DEFAULT_TOKENIZER, SearchIndex, SqlDocumentStore } from "akanjs/service";
import type { AdminRole } from "./admin.constant";

// The `../cnst` and `../db` barrels reach `akanjs/fetch`, which refuses to load without a client env, and
// `akan test <lib>` is still a stub that supplies none. The imports below must therefore be dynamic — a static
// `import * as cnst` is evaluated before any statement in this file could set these.
process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "akanjs";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";
process.env.AKAN_PUBLIC_ENV ??= "local";
process.env.AKAN_PUBLIC_OPERATION_MODE ??= "local";

const cnst = await import("../cnst");
const db = await import("../db");
const { AdminFilter } = await import("./admin.document");

const TABLE = "admin";

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

const mirrorRow = () =>
  (sqlite.query(`SELECT * FROM "search_doc" WHERE "ref" = ?`).get(TABLE) as Record<string, string> | null) ?? undefined;

const bySearch = (text: string, roles?: AdminRole["value"][]) => {
  const queryFn = getFilterMeta(AdminFilter).query.bySearch.queryFn;
  if (!queryFn) throw new Error("AdminFilter.bySearch declares no query function");
  return queryFn(text, roles, documentQueryHelper) as DocumentQuery;
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
  // Same two calls the database resolver makes, so this store carries the real hooks and indexes.
  const schema = new DocumentSchema();
  db.admin.model._onSchema(schema as never);
  db.admin.model._libsOnSchema(schema as never);
  store = new SqlDocumentStore(owner as never, cnst.admin as never, db.admin as never, schema);
  await store.ensure();
});

describe("Admin search index", () => {
  test("mirrors the account id as the title and the roles as scoping tokens", async () => {
    await store.create({ accountId: "Kenny@Example.com", roles: ["admin", "superAdmin"] });

    const row = mirrorRow();
    expect(row?.title).toBe("Kenny@Example.com");
    expect(row?.filter).toBe("roles_admin roles_superadmin");
    expect(row?.desc).toBe("");
  });

  test("never mirrors the password, whatever form it is stored in", async () => {
    await store.create({ accountId: "kenny@example.com", roles: ["admin"], password: "qwer1234" });

    const stored = sqlite.query(`SELECT "_doc" FROM "admin"`).get() as { _doc: string };
    const password = (JSON.parse(stored._doc) as { password: string }).password;
    expect(password).toBeTruthy();
    expect(JSON.stringify(mirrorRow())).not.toContain(password);
    expect(await store.findIds(bySearch("qwer1234"))).toEqual([]);
  });

  test("finds an admin by a prefix of the account id", async () => {
    const kenny = await store.create({ accountId: "kenny@example.com", roles: ["admin"] });
    await store.create({ accountId: "other@example.com", roles: ["admin"] });

    expect(await store.findIds(bySearch("ken"))).toEqual([kenny.id]);
    expect(await store.count(bySearch("ken"))).toBe(1);
  });

  test("narrows the search by role", async () => {
    const superAdmin = await store.create({ accountId: "kenny@example.com", roles: ["superAdmin"] });
    await store.create({ accountId: "kenny.two@example.com", roles: ["manager"] });

    expect(await store.findIds(bySearch("kenny", ["superAdmin"]))).toEqual([superAdmin.id]);
    expect(await store.findIds(bySearch("kenny"))).toHaveLength(2);
  });

  test("drops a soft-deleted admin from the results", async () => {
    const kenny = await store.create({ accountId: "kenny@example.com", roles: ["admin"] });

    await store.remove(kenny.id);

    expect(await store.findIds(bySearch("kenny"))).toEqual([]);
    expect(mirrorRow()).toBeUndefined();
  });
});
