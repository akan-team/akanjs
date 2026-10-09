import { Database } from "bun:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { PromiseOrObject } from "akanjs/base";
import type { ConstantModel } from "akanjs/constant";
import type { DatabaseModel, DocumentSchema, SchemaOf } from "akanjs/document";
import type { Sql } from "postgres";
import { adapt } from "../adapt";
import { ScheduleAdaptorRole } from "./role.adaptor";
import {
  DEFAULT_TOKENIZER,
  OPTIMIZE_CRON,
  OPTIMIZE_CRON_KEY,
  PostgresSearchEngine,
  parseSearchEnabled,
  RETRY_INTERVAL_KEY,
  RETRY_INTERVAL_MS,
  SearchIndex,
} from "./searchIndex";
import { PostgresDialect } from "./sql/dialect/postgres";
import { BunSqliteClient } from "./sql/driver/bunSqlite";
import { PostgresAkanClient } from "./sql/driver/postgres";
import { PendingStoreEnsures } from "./sql/PendingStoreEnsures";
import { PostgresInsightSession } from "./sql/PostgresInsightSession";
import { SqlDocumentStore } from "./sql/SqlDocumentStore";
import { SqliteInsightSession } from "./sql/SqliteInsightSession";
import {
  BASE_COLUMNS,
  type ConcurrentIndexBuild,
  type DatabaseAdaptor,
  type InsightSession,
  type PostgresDatabaseConfig,
  type SearchConfig,
  type SqliteDatabaseConfig,
  type SqliteEnv,
  type TransactionContext,
} from "./sql/types";
import { quoteIdent } from "./sql/values";
import { defaultSqliteFile } from "./sqlitePath";

export { PostgresDialect } from "./sql/dialect/postgres";
export { SqliteDialect } from "./sql/dialect/sqlite";
export { SqlDocumentStore } from "./sql/SqlDocumentStore";
export type {
  AkanSqlClient,
  AkanSqlStatement,
  DatabaseAdaptor,
  DatabaseConfig,
  DocumentDatabaseOwner,
  DocumentStore,
  InsightSession,
  PostgresDatabaseConfig,
  SearchConfig,
  SqlDialect,
  SqliteDatabaseConfig,
  SqlResultRows,
} from "./sql/types";

const searchConfigOf = (env: SqliteEnv): Required<SearchConfig> => ({
  enabled: env.database?.search?.enabled ?? parseSearchEnabled(process.env.AKAN_SEARCH_ENABLED),
  tokenizer: env.database?.search?.tokenizer ?? process.env.AKAN_SEARCH_TOKENIZER ?? DEFAULT_TOKENIZER,
});

export class SqliteDatabase
  extends adapt("sqliteDatabase", ({ env, plug }) => ({
    scheduler: plug(ScheduleAdaptorRole),
    config: env((env: SqliteEnv) => {
      return {
        journalMode: "WAL",
        busyTimeoutMs: 5000,
        synchronous: "NORMAL",
        foreignKeys: true,
        ...env.database?.sqlite,
        // One image serves several deployments, so where the data lives is the deployment's env before the bundled one.
        filePath:
          process.env.SQLITE_DATABASE_PATH ??
          env.database?.sqlite?.filePath ??
          defaultSqliteFile("", env.workspaceRoot),
        search: searchConfigOf(env),
      } satisfies Required<
        Pick<SqliteDatabaseConfig, "filePath" | "journalMode" | "busyTimeoutMs" | "synchronous" | "foreignKeys">
      > &
        SqliteDatabaseConfig & { search: Required<SearchConfig> };
    }),
  }))
  implements DatabaseAdaptor
{
  #db!: Database;
  #client!: BunSqliteClient;
  #stores = new Map<string, SqlDocumentStore>();
  #transaction = new AsyncLocalStorage<TransactionContext>();
  #ensures = new PendingStoreEnsures();
  #searchIndex!: SearchIndex;
  // One connection serves every request; a second would wait for the lock synchronously and park the event loop the
  // holder needs to commit. So other contexts' writes queue behind `#open` — reads do not, so no mixed load deadlocks.
  #open: { context: TransactionContext; done: Promise<void> } | null = null;
  #queue: Promise<void> = Promise.resolve();

  override async onInit() {
    // Resolved first: Bun on Windows fails a recursive mkdir of "." (":memory:", a bare file name) with EEXIST.
    await mkdir(path.dirname(path.resolve(this.config.filePath)), { recursive: true });
    this.#db = new Database(this.config.filePath, { strict: true, create: true });
    this.#client = new BunSqliteClient(this.#db, () => this.#writeTurn());
    this.#db.run(`PRAGMA journal_mode = ${this.config.journalMode ?? "WAL"}`);
    this.#db.run(`PRAGMA busy_timeout = ${this.config.busyTimeoutMs ?? 5000}`);
    this.#db.run(`PRAGMA synchronous = ${this.config.synchronous ?? "NORMAL"}`);
    this.#db.run(`PRAGMA foreign_keys = ${this.config.foreignKeys === false ? "OFF" : "ON"}`);
    if (this.config.cacheSize) this.#db.run(`PRAGMA cache_size = ${this.config.cacheSize}`);
    if (this.config.tempStore) this.#db.run(`PRAGMA temp_store = ${this.config.tempStore}`);
    this.#db.run(
      `CREATE TABLE IF NOT EXISTS "_akan_meta" ("key" TEXT PRIMARY KEY NOT NULL, "value" TEXT NOT NULL, "updatedAt" INTEGER NOT NULL)`,
    );
    this.#searchIndex = new SearchIndex(this, this.config.search);
    await this.#searchIndex.ensureSchema();
    this.scheduler.registerCron(OPTIMIZE_CRON_KEY, OPTIMIZE_CRON, async () => {
      await this.#searchIndex.optimize();
    });
    this.scheduler.registerInterval(RETRY_INTERVAL_KEY, RETRY_INTERVAL_MS, async () => {
      await this.#searchIndex.retryPending();
    });
  }

  override async onDestroy() {
    this.scheduler.unregisterCron(OPTIMIZE_CRON_KEY);
    this.scheduler.unregisterInterval(RETRY_INTERVAL_KEY);
    await this.#ensures.settle();
    this.#db?.run("PRAGMA wal_checkpoint(TRUNCATE)");
    await this.#client?.close();
  }

  getConnection() {
    return this.#client;
  }

  getSearchIndex() {
    return this.#searchIndex;
  }

  async openInsight(): Promise<InsightSession> {
    const main = this.#db.query(`SELECT "file" FROM pragma_database_list WHERE "name" = 'main'`).get() as {
      file: string;
    } | null;
    return main?.file
      ? SqliteInsightSession.open(main.file)
      : await SqliteInsightSession.openSnapshot(this.#db.serialize());
  }

  stores() {
    return [...this.#stores.values()];
  }

  getStore(constant: ConstantModel, database: DatabaseModel, schema: SchemaOf) {
    const existing = this.#stores.get(database.refName);
    if (existing) return existing;
    const store = new SqlDocumentStore(this, constant, database, schema as DocumentSchema);
    this.#stores.set(database.refName, store);
    this.#ensures.track(store.ensure());
    return store;
  }

  getMeta(key: string) {
    return (this.#db.query(`SELECT "value" FROM "_akan_meta" WHERE "key" = ?`).get(key) as { value: string } | null)
      ?.value;
  }

  async setMeta(key: string, value: string) {
    await this.#client
      .prepare(
        `INSERT INTO "_akan_meta" ("key", "value", "updatedAt") VALUES (?, ?, ?) ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", "updatedAt" = excluded."updatedAt"`,
      )
      .run(key, value, Date.now());
  }

  async transaction<T>(fn: () => PromiseOrObject<T>): Promise<T> {
    const active = this.#transaction.getStore();
    if (active) return await fn();
    const previous = this.#queue;
    let release!: () => void;
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#queue = done;
    await previous;
    const context: TransactionContext = { afterCommit: [] };
    this.#open = { context, done };
    let result: T;
    try {
      result = await this.#transaction.run(context, async () => {
        this.#db.run("BEGIN IMMEDIATE");
        try {
          const value = await fn();
          this.#db.run("COMMIT");
          return value;
        } catch (err) {
          if (this.#db.inTransaction) this.#db.run("ROLLBACK");
          throw err;
        }
      });
    } finally {
      this.#open = null;
      release();
    }
    for (const hook of context.afterCommit) await hook();
    return result;
  }

  #writeTurn() {
    const open = this.#open;
    if (!open || this.#transaction.getStore() === open.context) return null;
    return open.done;
  }

  async afterCommit(fn: () => PromiseOrObject<void>) {
    const active = this.#transaction.getStore();
    if (!active) return await fn();
    active.afterCommit.push(fn);
  }

  checkpoint(mode: "PASSIVE" | "FULL" | "RESTART" | "TRUNCATE" = "TRUNCATE") {
    this.#db.run(`PRAGMA wal_checkpoint(${mode})`);
  }

  vacuum() {
    this.#db.run("VACUUM");
  }
}

export class PostgresDatabase
  extends adapt("postgresDatabase", ({ env, plug }) => ({
    scheduler: plug(ScheduleAdaptorRole),
    config: env((env: SqliteEnv) => {
      return {
        // One image serves several deployments, so where the data lives is the deployment's env before the bundled one.
        url: process.env.POSTGRES_URL ?? process.env.POSTGRES_URI ?? env.database?.postgres?.url,
        host: process.env.POSTGRES_HOST ?? env.database?.postgres?.host ?? "localhost",
        port: process.env.POSTGRES_PORT ? Number(process.env.POSTGRES_PORT) : (env.database?.postgres?.port ?? 5432),
        database:
          process.env.POSTGRES_DATABASE ?? process.env.POSTGRES_DB ?? env.database?.postgres?.database ?? "akan",
        user: process.env.POSTGRES_USER ?? env.database?.postgres?.user ?? "akan",
        password: process.env.POSTGRES_PASSWORD ?? env.database?.postgres?.password ?? "akan",
        insightUrl: process.env.POSTGRES_INSIGHT_URL ?? env.database?.postgres?.insightUrl,
        search: searchConfigOf(env),
      } satisfies PostgresDatabaseConfig & { search: Required<SearchConfig> };
    }),
  }))
  implements DatabaseAdaptor
{
  #sql!: Sql;
  #client!: PostgresAkanClient;
  #stores = new Map<string, SqlDocumentStore>();
  #transaction = new AsyncLocalStorage<TransactionContext & { client: PostgresAkanClient }>();
  #ensures = new PendingStoreEnsures();
  #schemaTurn: Promise<void> = Promise.resolve();
  #schema = "public";
  #insightRole: string | null = null;
  #searchIndex!: SearchIndex;

  override async onInit() {
    const { default: postgres } = await import("postgres");
    const options = this.#clientOptions();
    this.#sql = this.config.url
      ? postgres(this.config.url, options)
      : postgres({
          host: this.config.host,
          port: this.config.port,
          database: this.config.database,
          username: this.config.user,
          password: this.config.password,
          ...options,
        });
    this.#client = new PostgresAkanClient(this.#sql);
    this.#schema =
      (await this.#client.prepare(`SELECT current_schema() AS "schema"`).get<{ schema: string | null }>())?.schema ??
      this.#schema;
    this.#insightRole = await this.#resolveInsightRole();
    await this.lockSchema(async () => {
      await this.getConnection().execute(
        `CREATE TABLE IF NOT EXISTS "_akan_meta" ("key" TEXT PRIMARY KEY NOT NULL, "value" TEXT NOT NULL, "updatedAt" BIGINT NOT NULL)`,
      );
      await this.getConnection().execute(PostgresDialect.schemaSetup());
      await this.#grantInsightSchema();
    });
    this.#searchIndex = new SearchIndex(
      this,
      this.config.search,
      new PostgresSearchEngine(this, { tokenizer: this.config.search.tokenizer, schema: this.#schema }),
    );
    await this.#searchIndex.ensureSchema();
    this.scheduler.registerInterval(RETRY_INTERVAL_KEY, RETRY_INTERVAL_MS, async () => {
      await this.#searchIndex.retryPending();
    });
  }

  // Pool size, SSL and timeouts ride the URL's query string, which postgres.js reads itself; it hands int8 back as a
  // string. jsonb stays text: a document diffs a save against its read row, which a shared parsed object would change.
  #clientOptions() {
    return {
      types: {
        jsonb: {
          to: 3802,
          from: [3802],
          serialize: (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value)),
          parse: (raw: string) => raw,
        },
        bigint: {
          to: 20,
          from: [20],
          serialize: (value: number) => String(value),
          parse: (raw: string) => Number(raw),
        },
        numeric: {
          to: 1700,
          from: [1700],
          serialize: (value: number) => String(value),
          parse: (raw: string) => Number(raw),
        },
      },
      onnotice: (notice: { message?: string }) => this.logger.debug(`postgres: ${notice.message ?? ""}`),
    };
  }

  async #resolveInsightRole() {
    if (!this.config.insightUrl) return null;
    let role: string;
    try {
      role = decodeURIComponent(new URL(this.config.insightUrl).username);
    } catch {
      role = "";
    }
    if (!role) {
      this.logger.warn("POSTGRES_INSIGHT_URL names no user; no table grants it anything, so insight queries fail");
      return null;
    }
    const found = await this.#client.prepare(`SELECT 1 AS "found" FROM pg_roles WHERE rolname = $1`).get(role);
    if (!found) this.logger.warn(`POSTGRES_INSIGHT_URL names role "${role}", which does not exist`);
    return found ? role : null;
  }

  // Concurrent GRANTs on one object fail with "tuple concurrently updated": both run under the schema lock, if missing.
  async #grantInsightSchema() {
    if (!this.#insightRole) return;
    const schema = await this.getConnection()
      .prepare(
        `SELECT has_schema_privilege($1, n.oid, 'USAGE') AS "granted", pg_has_role(current_user, n.nspowner, 'USAGE') AS "owned" FROM pg_namespace n WHERE n.nspname = $2`,
      )
      .get<{ granted: boolean; owned: boolean }>(this.#insightRole, this.#schema);
    if (!schema || schema.granted) return;
    if (!schema.owned) {
      this.logger.warn(
        `Insight role "${this.#insightRole}" has no USAGE on schema "${this.#schema}", and this role cannot grant it`,
      );
      return;
    }
    await this.getConnection().execute(
      `GRANT USAGE ON SCHEMA ${quoteIdent(this.#schema)} TO ${quoteIdent(this.#insightRole)}`,
    );
  }

  async grantInsight(table: string) {
    if (!this.#insightRole) return;
    const columns = [...BASE_COLUMNS];
    const granted = await this.getConnection()
      .prepare(
        `SELECT bool_and(has_column_privilege($1, to_regclass($2), c, 'SELECT')) AS "granted" FROM unnest($3::text[]) AS c`,
      )
      .get<{ granted: boolean | null }>(this.#insightRole, quoteIdent(table), columns);
    if (granted?.granted) return;
    await this.getConnection().execute(
      `GRANT SELECT (${columns.map(quoteIdent).join(", ")}) ON ${quoteIdent(table)} TO ${quoteIdent(this.#insightRole)}`,
    );
  }

  async openInsight(): Promise<InsightSession> {
    if (!this.config.insightUrl)
      throw new Error(
        "An insight query on Postgres reads as a login role that can read base columns and nothing else. Create one (`CREATE ROLE <name> LOGIN PASSWORD '…'`, with no other role granted to it) and set POSTGRES_INSIGHT_URL to log in as it; each model table grants it its base columns at boot.",
      );
    return await PostgresInsightSession.open({
      url: this.config.insightUrl,
      schema: this.#schema,
      options: this.#clientOptions(),
    });
  }

  override async onDestroy() {
    this.scheduler.unregisterInterval(RETRY_INTERVAL_KEY);
    await this.#ensures.settle();
    await this.#client?.close();
  }

  getConnection() {
    return this.#transaction.getStore()?.client ?? this.#client;
  }

  getSearchIndex() {
    return this.#searchIndex;
  }

  stores() {
    return [...this.#stores.values()];
  }

  getStore(constant: ConstantModel, database: DatabaseModel, schema: SchemaOf) {
    const existing = this.#stores.get(database.refName);
    if (existing) return existing;
    const store = new SqlDocumentStore(this, constant, database, schema as DocumentSchema, new PostgresDialect());
    this.#stores.set(database.refName, store);
    this.#ensures.track(store.ensure());
    return store;
  }

  async getMeta(key: string) {
    return (
      await this.getConnection()
        .prepare(`SELECT "value" FROM "_akan_meta" WHERE "key" = $1`)
        .get<{ value: string }>(key)
    )?.value;
  }

  async setMeta(key: string, value: string) {
    await this.getConnection()
      .prepare(
        `INSERT INTO "_akan_meta" ("key", "value", "updatedAt") VALUES ($1, $2, $3) ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", "updatedAt" = excluded."updatedAt"`,
      )
      .run(key, value, Date.now());
  }

  // `BEGIN` through the pool stays open on whichever connection ran it; `begin()` reserves one for the transaction.
  async transaction<T>(fn: () => PromiseOrObject<T>): Promise<T> {
    const active = this.#transaction.getStore();
    if (active) return await fn();
    const context: TransactionContext = { afterCommit: [] };
    const result = (await this.#sql.begin(
      async (transaction) =>
        await this.#transaction.run(
          { ...context, client: new PostgresAkanClient(transaction) },
          async () => await fn(),
        ),
    )) as T;
    for (const hook of context.afterCommit) await hook();
    return result;
  }

  async afterCommit(fn: () => PromiseOrObject<void>) {
    const active = this.#transaction.getStore();
    if (!active) return await fn();
    active.afterCommit.push(fn);
  }

  // One at a time in-process, and across processes through an advisory lock the transaction releases.
  async lockSchema<T>(fn: () => Promise<T>): Promise<T> {
    const turn = this.#schemaTurn.then(
      async () =>
        await this.transaction(async () => {
          await this.getConnection().execute(
            `SELECT pg_advisory_xact_lock(hashtext('akan:schema:' || current_schema()))`,
          );
          return await fn();
        }),
    );
    this.#schemaTurn = turn.then(
      () => undefined,
      () => undefined,
    );
    return await turn;
  }

  async hasTable(table: string) {
    const row = await this.getConnection()
      .prepare(`SELECT to_regclass($1) IS NOT NULL AS "exists"`)
      .get<{ exists: boolean }>(quoteIdent(table));
    return !!row?.exists;
  }

  async hasValidIndex(name: string) {
    const row = await this.getConnection()
      .prepare(`SELECT indisvalid AS "valid" FROM pg_index WHERE indexrelid = to_regclass($1)`)
      .get<{ valid: boolean }>(quoteIdent(name));
    return !!row?.valid;
  }

  // `CREATE INDEX` blocks writes; `CONCURRENTLY` cannot run in a transaction, and a failed build leaves an invalid
  // index `IF NOT EXISTS` keeps. A per-index session lock replaces the schema lock, which would stall other schemas.
  async buildIndexConcurrently({ name, next, create, replace }: ConcurrentIndexBuild) {
    const reserved = await this.#sql.reserve();
    const key = `akan:index:${name}`;
    const valid = async (index: string) =>
      (
        await reserved.unsafe(`SELECT indisvalid AS "valid" FROM pg_index WHERE indexrelid = to_regclass($1)`, [
          quoteIdent(index),
        ])
      ).at(0)?.valid as boolean | undefined;
    try {
      await reserved.unsafe(`SELECT pg_advisory_lock(hashtext(current_schema() || $1))`, [key]);
      try {
        if (!replace) {
          const state = await valid(name);
          if (state) return;
          if (state === false) await reserved.unsafe(`DROP INDEX CONCURRENTLY IF EXISTS ${quoteIdent(name)}`);
          await reserved.unsafe(create(name));
          return;
        }
        // Built beside the old one and swapped in, so the rows refusing the new definition leaves the old in place.
        await reserved.unsafe(`DROP INDEX CONCURRENTLY IF EXISTS ${quoteIdent(next)}`);
        try {
          await reserved.unsafe(create(next));
        } catch (error) {
          await reserved.unsafe(`DROP INDEX CONCURRENTLY IF EXISTS ${quoteIdent(next)}`);
          throw error;
        }
        await reserved.unsafe(
          `DROP INDEX IF EXISTS ${quoteIdent(name)}; ALTER INDEX ${quoteIdent(next)} RENAME TO ${quoteIdent(name)}`,
        );
      } finally {
        await reserved.unsafe(`SELECT pg_advisory_unlock(hashtext(current_schema() || $1))`, [key]);
      }
    } finally {
      reserved.release();
    }
  }
}
