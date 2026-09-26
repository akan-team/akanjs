import { Database } from "bun:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Client as LibsqlClient } from "@libsql/client";
import { getEnv, type PromiseOrObject } from "akanjs/base";
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
import { LibsqlAkanClient } from "./sql/driver/libsql";
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
  type LibsqlDatabaseConfig,
  type PostgresDatabaseConfig,
  type SearchConfig,
  type SqliteDatabaseConfig,
  type SqliteEnv,
  type TransactionContext,
} from "./sql/types";
import { quoteIdent } from "./sqlDescriptor";
import { resolveDefaultSqliteFile } from "./sqlitePath";

export { PostgresDialect } from "./sql/dialect/postgres";
export { SqliteDialect } from "./sql/dialect/sqlite";
export { SqlDocumentStore } from "./sql/SqlDocumentStore";
/**
 * The three SQL databases an app can mount, and nothing else. The layer underneath them — drivers, dialects,
 * the query and update compilers, and the document store they all share — lives in .
 */
export type {
  AkanSqlClient,
  AkanSqlStatement,
  DatabaseAdaptor,
  DatabaseConfig,
  DocumentDatabaseOwner,
  DocumentStore,
  InsightSession,
  LibsqlDatabaseConfig,
  PostgresDatabaseConfig,
  SearchConfig,
  SqlDialect,
  SqliteDatabaseConfig,
  SqlResultRows,
} from "./sql/types";

export class SqliteDatabase
  extends adapt("sqliteDatabase", ({ env, plug }) => ({
    scheduler: plug(ScheduleAdaptorRole),
    config: env((env: SqliteEnv) => {
      const defaultFile = () => {
        const { appName, environment, operationMode } = getEnv();
        return resolveDefaultSqliteFile({
          appName,
          fileName: `${appName}-${environment}.db`,
          isProduction: process.env.NODE_ENV === "production",
          operationMode,
          workspaceRoot: env.workspaceRoot,
        });
      };
      return {
        journalMode: "WAL",
        busyTimeoutMs: 5000,
        synchronous: "NORMAL",
        foreignKeys: true,
        ...env.database?.sqlite,
        // One image serves several deployments, so where the data lives is the deployment's env before the bundled one.
        filePath: process.env.SQLITE_DATABASE_PATH ?? env.database?.sqlite?.filePath ?? defaultFile(),
        search: {
          enabled: env.database?.search?.enabled ?? parseSearchEnabled(process.env.AKAN_SEARCH_ENABLED),
          tokenizer: env.database?.search?.tokenizer ?? process.env.AKAN_SEARCH_TOKENIZER ?? DEFAULT_TOKENIZER,
        },
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
  // One connection serves every request, so an open transaction is also every other request's transaction. A second
  // connection is not the way out: bun:sqlite waits for a lock synchronously, which would park the event loop the
  // holder needs in order to commit. Writes from other contexts queue behind `#open` instead; reads do not, so a
  // batched load that mixes this context's keys with another's cannot deadlock on it.
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

export class LibsqlDatabase
  extends adapt("libsqlDatabase", ({ env, plug }) => ({
    scheduler: plug(ScheduleAdaptorRole),
    config: env((env: SqliteEnv) => {
      const defaultFile = () => {
        const { appName, environment, operationMode } = getEnv();
        return resolveDefaultSqliteFile({
          appName,
          fileName: `${appName}-${environment}.db`,
          isProduction: process.env.NODE_ENV === "production",
          operationMode,
          workspaceRoot: env.workspaceRoot,
        });
      };
      return {
        url:
          process.env.LIBSQL_URL ??
          process.env.LIBSQL_URI ??
          env.database?.libsql?.url ??
          `file:${process.env.SQLITE_DATABASE_PATH ?? env.database?.sqlite?.filePath ?? defaultFile()}`,
        authToken: process.env.LIBSQL_AUTH_TOKEN ?? env.database?.libsql?.authToken,
        search: {
          enabled: env.database?.search?.enabled ?? parseSearchEnabled(process.env.AKAN_SEARCH_ENABLED),
          tokenizer: env.database?.search?.tokenizer ?? process.env.AKAN_SEARCH_TOKENIZER ?? DEFAULT_TOKENIZER,
        },
      } satisfies LibsqlDatabaseConfig & { search: Required<SearchConfig> };
    }),
  }))
  implements DatabaseAdaptor
{
  #libsql!: LibsqlClient;
  #client!: LibsqlAkanClient;
  #stores = new Map<string, SqlDocumentStore>();
  #transaction = new AsyncLocalStorage<TransactionContext & { client: LibsqlAkanClient }>();
  #ensures = new PendingStoreEnsures();
  #searchIndex!: SearchIndex;
  // A transaction takes the client's connection with it and the client opens another for everything else, which on a
  // `file:` URL is a second connection to one SQLite file — and that waits for a lock synchronously, parking the event
  // loop the transaction needs in order to commit. So other writes queue behind `#open`, as on `SqliteDatabase`.
  #open: { context: TransactionContext; done: Promise<void> } | null = null;
  #queue: Promise<void> = Promise.resolve();

  override async onInit() {
    const url = this.config.url ?? "file:local.db";
    if (url.startsWith("file:")) await mkdir(path.dirname(path.resolve(url.slice(5))), { recursive: true });
    const { createClient } = await import("@libsql/client");
    this.#libsql = createClient({ url, authToken: this.config.authToken });
    this.#client = new LibsqlAkanClient(this.#libsql, () => this.#writeTurn());
    await this.#client.execute(
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
    await this.#client?.close();
  }

  getConnection() {
    return this.#transaction.getStore()?.client ?? this.#client;
  }

  getSearchIndex() {
    return this.#searchIndex;
  }

  // bun:sqlite opening libsql's own file would put two SQLite libraries on one file in one process, where closing a
  // descriptor in either drops the POSIX locks the other holds.
  async openInsight(): Promise<InsightSession> {
    throw new Error(
      "An insight query needs the sqlite or postgres database: libsql has no connection that can leave `_doc` out.",
    );
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

  // Inside a transaction the pool's own connection waits on the lock the transaction holds, so these go through it too.
  async getMeta(key: string) {
    return (
      await this.getConnection().prepare(`SELECT "value" FROM "_akan_meta" WHERE "key" = ?`).get<{ value: string }>(key)
    )?.value;
  }

  async setMeta(key: string, value: string) {
    await this.getConnection()
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
      const transaction = await this.#libsql.transaction("write");
      try {
        result = await this.#transaction.run(
          { ...context, client: new LibsqlAkanClient(transaction) },
          async () => await fn(),
        );
        await transaction.commit();
      } catch (err) {
        if (!transaction.closed) await transaction.rollback();
        throw err;
      } finally {
        transaction.close();
      }
    } finally {
      this.#open = null;
      release();
    }
    for (const hook of context.afterCommit) await hook();
    return result;
  }

  #writeTurn() {
    const open = this.#open;
    if (!open || this.#transaction.getStore()?.afterCommit === open.context.afterCommit) return null;
    return open.done;
  }

  async afterCommit(fn: () => PromiseOrObject<void>) {
    const active = this.#transaction.getStore();
    if (!active) return await fn();
    active.afterCommit.push(fn);
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
        search: {
          enabled: env.database?.search?.enabled ?? parseSearchEnabled(process.env.AKAN_SEARCH_ENABLED),
          tokenizer: env.database?.search?.tokenizer ?? process.env.AKAN_SEARCH_TOKENIZER ?? DEFAULT_TOKENIZER,
        },
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

  // Pool size, SSL, timeouts and `prepare` ride the URL's query string (`?max=20&ssl=require`), which postgres.js reads
  // itself. `count(*)` and the epoch-ms columns are int8, which postgres.js hands back as strings. jsonb is kept as the
  // text it arrives as: a document keeps the row it was read from to tell which fields a save changed, and a parsed
  // object would be shared with the document and change along with it.
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

  // A GRANT rewrites the catalog row, and two processes granting on one object at once fail with "tuple concurrently
  // updated" — both grants run under the schema lock, and only when the privilege is missing.
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

  // `BEGIN` sent through the pool lands on whichever connection is free and stays open there after the call returns;
  // `begin()` reserves one connection for the whole transaction, and `getConnection()` hands it to every statement run
  // inside it.
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

  // One at a time in this process, and across every process on the database through an advisory lock that the
  // transaction releases.
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

  // `CREATE INDEX` on a table holding rows blocks its writes until the build ends; `CONCURRENTLY` does not, but it
  // cannot run in a transaction and a build that fails leaves an invalid index that `IF NOT EXISTS` then keeps
  // forever. A session lock per index takes the place of the schema lock, which would make every other process's
  // schema wait for this build.
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
