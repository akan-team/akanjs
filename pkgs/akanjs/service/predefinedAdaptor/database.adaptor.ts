import { Database, type SQLQueryBindings, type Statement } from "bun:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { InArgs, InValue, Client as LibsqlClient } from "@libsql/client";
import { type BaseEnv, DEFAULT_VALUE, dayjs, FIELD_META, type PromiseOrObject } from "akanjs/base";
import { type ConstantModel, getDefault } from "akanjs/constant";
import {
  createDocumentId,
  type DatabaseModel,
  type DocumentQuery,
  type DocumentQueryNode,
  type DocumentSchema,
  type DocumentUpdate,
  type DocumentUpdateInput,
  type DocumentUpdateNode,
  type DocumentUpdateOperator,
  type DocumentUpdateOptions,
  documentQueryHelper,
  encodeDocumentValue,
  isDocumentUpdateNode,
  resolveDocumentUpdate,
  type SchemaOf,
  sanitizeJson,
} from "akanjs/document";
import type { Sql } from "postgres";
import { adapt } from "../adapt";
import { resolveDefaultSqliteFile } from "./sqlitePath";

export interface SqliteDatabaseConfig {
  filePath?: string;
  journalMode?: "WAL" | "DELETE" | "TRUNCATE" | "PERSIST" | "MEMORY" | "OFF";
  busyTimeoutMs?: number;
  synchronous?: "OFF" | "NORMAL" | "FULL" | "EXTRA";
  foreignKeys?: boolean;
  cacheSize?: number;
  tempStore?: "DEFAULT" | "FILE" | "MEMORY";
}

export interface LibsqlDatabaseConfig {
  url?: string;
  authToken?: string;
}

export interface PostgresDatabaseConfig {
  url?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

export interface DatabaseConfig {
  driver?: "sqlite" | "libsql" | "postgres";
  sqlite?: SqliteDatabaseConfig;
  libsql?: LibsqlDatabaseConfig;
  postgres?: PostgresDatabaseConfig;
}

export interface DocumentStore {
  ensure(): Promise<void>;
  create(data: DocumentRecord): Promise<any>;
  clone(data: DocumentRecord & { id: string }): Promise<any>;
  update(id: string, patch: DocumentRecord): Promise<any>;
  remove(id: string): Promise<any>;
  updateOneByQuery(
    query: DocumentQuery,
    update: DocumentUpdateInput,
    options?: DocumentUpdateOptions,
  ): Promise<{ acknowledged: boolean; matchedCount: number; modifiedCount: number; upsertedId: string | null }>;
  updateManyByQuery(
    query: DocumentQuery,
    update: DocumentUpdateInput,
  ): Promise<{ acknowledged: boolean; matchedCount: number; modifiedCount: number }>;
  deleteManyByQuery(
    query: DocumentQuery,
  ): Promise<{ acknowledged: boolean; matchedCount: number; modifiedCount: number }>;
  bulkWrite(
    operations: { updateOne: { filter: DocumentQuery; update: DocumentUpdateInput; upsert?: boolean } }[],
  ): Promise<{ acknowledged: boolean; matchedCount: number; modifiedCount: number; upsertedId: string | null }>;
  find(query?: DocumentQuery, options?: FindManyOptions): Promise<any[]>;
  findIds(
    query?: DocumentQuery,
    options?: { sort?: SortOption; skip?: number | null; limit?: number | null; sample?: number },
  ): Promise<string[]>;
  findOne(query?: DocumentQuery, options?: FindOneOptions): Promise<any | null>;
  findId(
    query?: DocumentQuery,
    options?: { sort?: SortOption; skip?: number | null; sample?: boolean },
  ): Promise<string | null>;
  pickOne(query?: DocumentQuery, options?: FindOneOptions): Promise<any>;
  pickById(id: string): Promise<any>;
  exists(query?: DocumentQuery): Promise<string | null>;
  count(query?: DocumentQuery): Promise<number>;
  insight(query?: DocumentQuery): Promise<any>;
  hydrate(data: DocumentRecord, originalData?: DocumentRecord): any;
}

export interface SqlResultRows<Row = Record<string, unknown>> {
  rows: Row[];
}

export interface AkanSqlStatement {
  run(...params: unknown[]): Promise<unknown>;
  get<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row | null>;
  all<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row[]>;
}

export interface AkanSqlClient {
  execute(sql: string, params?: unknown[] | Record<string, unknown>): Promise<unknown>;
  prepare(sql: string): AkanSqlStatement;
  close(): Promise<void>;
}

export interface DatabaseAdaptor {
  getConnection(): AkanSqlClient;
  getStore(constant: ConstantModel, database: DatabaseModel, schema: DocumentSchema): DocumentStore;
  transaction<T>(fn: () => PromiseOrObject<T>): Promise<T>;
}

interface SqliteEnv extends BaseEnv {
  workspaceRoot?: string;
  database?: DatabaseConfig;
}

interface TransactionContext {
  afterCommit: (() => PromiseOrObject<void>)[];
}

const BASE_COLUMNS = new Set(["id", "createdAt", "updatedAt", "removedAt"]);
const RESERVED_RE = /^sqlite_|^_akan_meta$/i;
const REF_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const toSafeRefName = (value: string) => value.replace(/[^A-Za-z0-9_]+/g, "_").replace(/_+/g, "_");
type DocumentRecord = Record<string, unknown>;
type MutableDocumentRecord = Record<string, unknown>;
type FieldMap = Record<string, { getProps: () => Record<string, unknown>; [key: string]: unknown }>;
type SortOption = Record<string, 1 | -1> | null | undefined;
type ProjectionOption = Partial<Record<string, boolean>> | null | undefined;
type FindManyOptions = {
  sort?: SortOption;
  skip?: number | null;
  limit?: number | null;
  sample?: number;
  select?: ProjectionOption;
};
type FindOneOptions = { sort?: SortOption; skip?: number | null; sample?: boolean; select?: ProjectionOption };
type WriteHookOptions = { runSaveHooks?: boolean; crudType?: "update" | "remove" };
type QueryOperatorName = Exclude<
  DocumentQueryNode,
  { kind: "all" } | { kind: "any" } | { kind: "not" } | { kind: "raw" }
>["op"];
interface SqliteDocumentRow {
  id: string;
  createdAt: number | string;
  updatedAt: number | string;
  removedAt?: number | string | null;
  _doc: string;
}
type ProjectedSqliteDocumentRow = Omit<SqliteDocumentRow, "_doc"> & Record<string, unknown>;

interface DocumentDatabaseOwner {
  getConnection(): AkanSqlClient;
  getMeta(key: string): Promise<string | undefined> | string | undefined;
  setMeta(key: string, value: string): Promise<void>;
  afterCommit(fn: () => PromiseOrObject<void>): Promise<void>;
}

class BunSqliteStatement implements AkanSqlStatement {
  constructor(private readonly statement: Statement) {}
  async run(...params: unknown[]) {
    return this.statement.run(...(params as SQLQueryBindings[]));
  }
  async get<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row | null> {
    return (this.statement.get(...(params as SQLQueryBindings[])) as Row | null) ?? null;
  }
  async all<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row[]> {
    return this.statement.all(...(params as SQLQueryBindings[])) as Row[];
  }
}

class BunSqliteClient implements AkanSqlClient {
  constructor(readonly db: Database) {}
  async execute(sql: string, params: unknown[] | Record<string, unknown> = []) {
    const values = Array.isArray(params) ? params : Object.values(params);
    return this.db.query(sql).run(...(values as SQLQueryBindings[]));
  }
  prepare(sql: string): AkanSqlStatement {
    return new BunSqliteStatement(this.db.query(sql));
  }
  async close() {
    this.db.close();
  }
}

class LibsqlStatement implements AkanSqlStatement {
  constructor(
    private readonly client: LibsqlClient,
    private readonly sql: string,
  ) {}
  async run(...params: unknown[]) {
    const args = toLibsqlArgs(params);
    return await this.client.execute({ sql: this.sql, args });
  }
  async get<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row | null> {
    const args = toLibsqlArgs(params);
    const result = await this.client.execute({ sql: this.sql, args });
    return (result.rows[0] as Row | undefined) ?? null;
  }
  async all<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row[]> {
    const args = toLibsqlArgs(params);
    const result = await this.client.execute({ sql: this.sql, args });
    return result.rows as Row[];
  }
}

class LibsqlAkanClient implements AkanSqlClient {
  constructor(readonly client: LibsqlClient) {}
  async execute(sql: string, params: unknown[] | Record<string, unknown> = []) {
    return await this.client.execute({ sql, args: toLibsqlArgs(Array.isArray(params) ? params : [params]) });
  }
  prepare(sql: string): AkanSqlStatement {
    return new LibsqlStatement(this.client, sql);
  }
  async close() {
    this.client.close();
  }
}

class PostgresStatement implements AkanSqlStatement {
  constructor(
    private readonly client: Sql,
    private readonly sql: string,
  ) {}
  async run(...params: unknown[]) {
    const { sql, params: positionalParams } = toPostgresSql(this.sql, params);
    return await this.client.unsafe(sql, positionalParams as any[]);
  }
  async get<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row | null> {
    const rows = await this.all<Row>(...params);
    return rows[0] ?? null;
  }
  async all<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row[]> {
    const { sql, params: positionalParams } = toPostgresSql(this.sql, params);
    return (await this.client.unsafe(sql, positionalParams as any[])) as Row[];
  }
}

class PostgresAkanClient implements AkanSqlClient {
  constructor(readonly client: Sql) {}
  async execute(sql: string, params: unknown[] | Record<string, unknown> = []) {
    return await this.client.unsafe(sql, Array.isArray(params) ? (params as any[]) : Object.values(params));
  }
  prepare(sql: string): AkanSqlStatement {
    return new PostgresStatement(this.client, sql);
  }
  async close() {
    await this.client.end();
  }
}

const quoteIdent = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Buffer);
const toLibsqlValue = (value: unknown): InValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean" ||
    value instanceof Date ||
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer
  ) {
    return value;
  }
  if (value instanceof Buffer) return new Uint8Array(value);
  return JSON.stringify(value);
};
const toLibsqlArgs = (params: unknown[]): InArgs => {
  if (params.length === 1 && isPlainObject(params[0])) {
    return Object.fromEntries(Object.entries(params[0]).map(([key, value]) => [key, toLibsqlValue(value)]));
  }
  return params.map(toLibsqlValue);
};
const toPostgresSql = (sql: string, params: unknown[]) => {
  if (params.length === 1 && isPlainObject(params[0])) {
    const named = params[0];
    const values: unknown[] = [];
    const text = sql.replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, (token) => {
      values.push(named[token.slice(1)]);
      return `$${values.length}`;
    });
    return { sql: text, params: values };
  }
  let index = 0;
  return {
    sql: sql.replace(/\?/g, () => `$${++index}`),
    params,
  };
};
const jsonPath = (path: string) =>
  `$.${path
    .split(".")
    .map((part) => part.replaceAll('"', '\\"'))
    .join(".")}`;
const encodeSqlValue = (value: unknown) => encodeDocumentValue(value);
// Dates are persisted as epoch ms, but legacy rows may hold ISO strings; accept both.
const decodeDateValue = (value: unknown) => {
  if (value === null || value === undefined) return value;
  if (typeof value === "number") return dayjs(value);
  const epoch = Number(value);
  return Number.isNaN(epoch) ? dayjs(value as never) : dayjs(epoch);
};
const QUERY_OPERATOR_KEYS = new Set([
  "eq",
  "ne",
  "oneOf",
  "notOneOf",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "exists",
  "missing",
  "empty",
  "has",
  "contains",
]);

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const descriptorHash = async (value: unknown) => {
  const bytes = new TextEncoder().encode(stableJson(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

interface SqlFrag {
  sql: string;
  params: unknown[];
}

// A `SqlDialect` owns every dialect-specific SQL fragment so the compilers stay dialect-agnostic. Leaf query
// operators and update operators are compiled fully here (SQL + params) — the accumulator string returned by
// `applyUpdate` lets updates fold into a single nested JSON expression that the database applies atomically.
// SQLite/libsql share JSON1 syntax; Postgres uses the jsonb operator/function family.
interface SqlDialect {
  readonly name: "sqlite" | "postgres";
  timestampType(): string;
  docColumnType(): string;
  docColumn(): string;
  docValuePlaceholder(): string;
  extract(path: string): string;
  eq(path: string, value: unknown): SqlFrag;
  ne(path: string, value: unknown): SqlFrag;
  compare(path: string, op: "gt" | "gte" | "lt" | "lte", value: unknown): SqlFrag;
  between(path: string, from: unknown, to: unknown): SqlFrag;
  inList(path: string, values: unknown[]): SqlFrag;
  notInList(path: string, values: unknown[]): SqlFrag;
  exists(path: string): SqlFrag;
  missing(path: string): SqlFrag;
  empty(path: string): SqlFrag;
  arrayHas(path: string, value: unknown): SqlFrag;
  contains(path: string, value: unknown): SqlFrag;
  applyUpdate(acc: string, op: DocumentUpdateOperator, path: string, value: unknown): SqlFrag;
  affectedRows(result: unknown): number;
}

const jsonStr = (value: unknown) => JSON.stringify(sanitizeJson(value) ?? null);

export class SqliteDialect implements SqlDialect {
  readonly name = "sqlite" as const;
  timestampType() {
    return "INTEGER";
  }
  docColumnType() {
    return "TEXT";
  }
  docColumn() {
    return quoteIdent("_doc");
  }
  docValuePlaceholder() {
    return "?";
  }
  #path(path: string) {
    return `'${jsonPath(path).replaceAll("'", "''")}'`;
  }
  extract(path: string) {
    return `json_extract(${this.docColumn()}, ${this.#path(path)})`;
  }
  eq(path: string, value: unknown): SqlFrag {
    return value === null
      ? { sql: `${this.extract(path)} IS NULL`, params: [] }
      : { sql: `${this.extract(path)} = ?`, params: [encodeSqlValue(value)] };
  }
  ne(path: string, value: unknown): SqlFrag {
    return value === null
      ? { sql: `${this.extract(path)} IS NOT NULL`, params: [] }
      : { sql: `${this.extract(path)} != ?`, params: [encodeSqlValue(value)] };
  }
  compare(path: string, op: "gt" | "gte" | "lt" | "lte", value: unknown): SqlFrag {
    const operators = { gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;
    return { sql: `${this.extract(path)} ${operators[op]} ?`, params: [encodeSqlValue(value)] };
  }
  between(path: string, from: unknown, to: unknown): SqlFrag {
    return {
      sql: `(${this.extract(path)} >= ? AND ${this.extract(path)} <= ?)`,
      params: [encodeSqlValue(from), encodeSqlValue(to)],
    };
  }
  inList(path: string, values: unknown[]): SqlFrag {
    return {
      sql: `${this.extract(path)} IN (${values.map(() => "?").join(", ")})`,
      params: values.map(encodeSqlValue),
    };
  }
  notInList(path: string, values: unknown[]): SqlFrag {
    return {
      sql: `${this.extract(path)} NOT IN (${values.map(() => "?").join(", ")})`,
      params: values.map(encodeSqlValue),
    };
  }
  exists(path: string): SqlFrag {
    return { sql: `json_type(${this.docColumn()}, ${this.#path(path)}) IS NOT NULL`, params: [] };
  }
  missing(path: string): SqlFrag {
    return { sql: `json_type(${this.docColumn()}, ${this.#path(path)}) IS NULL`, params: [] };
  }
  empty(path: string): SqlFrag {
    const type = `json_type(${this.docColumn()}, ${this.#path(path)})`;
    return { sql: `(${type} IS NULL OR ${type} = 'null')`, params: [] };
  }
  arrayHas(path: string, value: unknown): SqlFrag {
    return {
      sql: `EXISTS (SELECT 1 FROM json_each(${this.extract(path)}) WHERE json_each.value = ?)`,
      params: [encodeSqlValue(value)],
    };
  }
  contains(path: string, value: unknown): SqlFrag {
    return { sql: `${this.extract(path)} LIKE ?`, params: [`%${String(value)}%`] };
  }
  applyUpdate(acc: string, op: DocumentUpdateOperator, path: string, value: unknown): SqlFrag {
    const p = this.#path(path);
    // Current values are read from the original `_doc` column (param-free), never from the accumulator, so folding
    // never duplicates prior placeholders. All operators in one update therefore observe the pre-update document.
    const cur = `json_extract(${this.docColumn()}, ${p})`;
    const arr = `COALESCE(${cur}, json('[]'))`;
    // biome-ignore lint/nursery/noUnnecessaryConditions: exhaustive switch over a string-literal union, not a truthiness check
    switch (op) {
      case "set":
        return { sql: `json_set(${acc}, ${p}, json(?))`, params: [jsonStr(value)] };
      case "unset":
        return { sql: `json_remove(${acc}, ${p})`, params: [] };
      case "inc":
        return { sql: `json_set(${acc}, ${p}, COALESCE(${cur}, 0) + ?)`, params: [Number(value)] };
      case "mul":
        return { sql: `json_set(${acc}, ${p}, COALESCE(${cur}, 0) * ?)`, params: [Number(value)] };
      case "min":
        return { sql: `json_set(${acc}, ${p}, MIN(COALESCE(${cur}, ?), ?))`, params: [Number(value), Number(value)] };
      case "max":
        return { sql: `json_set(${acc}, ${p}, MAX(COALESCE(${cur}, ?), ?))`, params: [Number(value), Number(value)] };
      case "push":
        return { sql: `json_set(${acc}, ${p}, json_insert(${arr}, '$[#]', json(?)))`, params: [jsonStr(value)] };
      case "addToSet":
        return {
          sql: `json_set(${acc}, ${p}, CASE WHEN EXISTS (SELECT 1 FROM json_each(${arr}) WHERE json_each.value = ?) THEN ${arr} ELSE json_insert(${arr}, '$[#]', json(?)) END)`,
          params: [encodeSqlValue(value), jsonStr(value)],
        };
      case "pull":
        return {
          sql: `json_set(${acc}, ${p}, (SELECT json_group_array(json_each.value) FROM json_each(${arr}) WHERE json_each.value <> ?))`,
          params: [encodeSqlValue(value)],
        };
      case "setOnInsert":
        return { sql: acc, params: [] };
    }
  }
  affectedRows(result: unknown): number {
    const row = result as { changes?: number | bigint; rowsAffected?: number } | null;
    return Number(row?.changes ?? row?.rowsAffected ?? 0);
  }
}

export class PostgresDialect implements SqlDialect {
  readonly name = "postgres" as const;
  timestampType() {
    return "BIGINT";
  }
  docColumnType() {
    return "jsonb";
  }
  docColumn() {
    return quoteIdent("_doc");
  }
  docValuePlaceholder() {
    return "?::jsonb";
  }
  #path(path: string) {
    return `'{${path
      .split(".")
      .map((part) => part.replaceAll("'", "''"))
      .join(",")}}'`;
  }
  #jsonb(path: string) {
    return `(${this.docColumn()} #> ${this.#path(path)})`;
  }
  #text(path: string) {
    return `(${this.docColumn()} #>> ${this.#path(path)})`;
  }
  extract(path: string) {
    return this.#jsonb(path);
  }
  eq(path: string, value: unknown): SqlFrag {
    return value === null
      ? { sql: `${this.#jsonb(path)} IS NULL`, params: [] }
      : { sql: `${this.#jsonb(path)} = ?::jsonb`, params: [jsonStr(value)] };
  }
  ne(path: string, value: unknown): SqlFrag {
    return value === null
      ? { sql: `${this.#jsonb(path)} IS NOT NULL`, params: [] }
      : { sql: `${this.#jsonb(path)} <> ?::jsonb`, params: [jsonStr(value)] };
  }
  compare(path: string, op: "gt" | "gte" | "lt" | "lte", value: unknown): SqlFrag {
    const operators = { gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;
    return { sql: `${this.#jsonb(path)} ${operators[op]} ?::jsonb`, params: [jsonStr(value)] };
  }
  between(path: string, from: unknown, to: unknown): SqlFrag {
    return {
      sql: `(${this.#jsonb(path)} >= ?::jsonb AND ${this.#jsonb(path)} <= ?::jsonb)`,
      params: [jsonStr(from), jsonStr(to)],
    };
  }
  inList(path: string, values: unknown[]): SqlFrag {
    return {
      sql: `${this.#jsonb(path)} IN (${values.map(() => "?::jsonb").join(", ")})`,
      params: values.map(jsonStr),
    };
  }
  notInList(path: string, values: unknown[]): SqlFrag {
    return {
      sql: `${this.#jsonb(path)} NOT IN (${values.map(() => "?::jsonb").join(", ")})`,
      params: values.map(jsonStr),
    };
  }
  exists(path: string): SqlFrag {
    return { sql: `${this.#jsonb(path)} IS NOT NULL`, params: [] };
  }
  missing(path: string): SqlFrag {
    return { sql: `${this.#jsonb(path)} IS NULL`, params: [] };
  }
  empty(path: string): SqlFrag {
    return { sql: `(${this.#jsonb(path)} IS NULL OR jsonb_typeof(${this.#jsonb(path)}) = 'null')`, params: [] };
  }
  arrayHas(path: string, value: unknown): SqlFrag {
    return { sql: `${this.#jsonb(path)} @> ?::jsonb`, params: [jsonStr(value)] };
  }
  contains(path: string, value: unknown): SqlFrag {
    return { sql: `${this.#text(path)} LIKE ?`, params: [`%${String(value)}%`] };
  }
  applyUpdate(acc: string, op: DocumentUpdateOperator, path: string, value: unknown): SqlFrag {
    const p = this.#path(path);
    // Reads target the original `_doc` column (param-free) so folding never duplicates prior placeholders; `acc` is
    // only ever the write target.
    const jsonbAt = `(${this.docColumn()}) #> ${p}`;
    const textAt = `(${this.docColumn()}) #>> ${p}`;
    const arr = `COALESCE(${jsonbAt}, '[]'::jsonb)`;
    // biome-ignore lint/nursery/noUnnecessaryConditions: exhaustive switch over a string-literal union, not a truthiness check
    switch (op) {
      case "set":
        return { sql: `jsonb_set(${acc}, ${p}, ?::jsonb, true)`, params: [jsonStr(value)] };
      case "unset":
        return { sql: `(${acc}) #- ${p}`, params: [] };
      case "inc":
        return {
          sql: `jsonb_set(${acc}, ${p}, to_jsonb(COALESCE((${textAt})::numeric, 0) + ?), true)`,
          params: [Number(value)],
        };
      case "mul":
        return {
          sql: `jsonb_set(${acc}, ${p}, to_jsonb(COALESCE((${textAt})::numeric, 0) * ?), true)`,
          params: [Number(value)],
        };
      case "min":
        return {
          sql: `jsonb_set(${acc}, ${p}, to_jsonb(LEAST(COALESCE((${textAt})::numeric, ?), ?)), true)`,
          params: [Number(value), Number(value)],
        };
      case "max":
        return {
          sql: `jsonb_set(${acc}, ${p}, to_jsonb(GREATEST(COALESCE((${textAt})::numeric, ?), ?)), true)`,
          params: [Number(value), Number(value)],
        };
      case "push":
        return {
          sql: `jsonb_set(${acc}, ${p}, ${arr} || jsonb_build_array(?::jsonb), true)`,
          params: [jsonStr(value)],
        };
      case "addToSet":
        return {
          sql: `jsonb_set(${acc}, ${p}, CASE WHEN ${arr} @> jsonb_build_array(?::jsonb) THEN ${arr} ELSE ${arr} || jsonb_build_array(?::jsonb) END, true)`,
          params: [jsonStr(value), jsonStr(value)],
        };
      case "pull":
        return {
          sql: `jsonb_set(${acc}, ${p}, COALESCE((SELECT jsonb_agg(elem) FROM jsonb_array_elements(${arr}) elem WHERE elem <> ?::jsonb), '[]'::jsonb), true)`,
          params: [jsonStr(value)],
        };
      case "setOnInsert":
        return { sql: acc, params: [] };
    }
  }
  affectedRows(result: unknown): number {
    const row = result as { count?: number } | Array<unknown> | null;
    if (Array.isArray(row)) return (row as { count?: number }).count ?? row.length;
    return Number(row?.count ?? 0);
  }
}

type QueryLeafOps = Pick<
  SqlDialect,
  | "eq"
  | "ne"
  | "compare"
  | "between"
  | "inList"
  | "notInList"
  | "exists"
  | "missing"
  | "empty"
  | "arrayHas"
  | "contains"
>;

// Base columns (`id`/`createdAt`/`updatedAt`/`removedAt`) are real SQL columns, not JSON paths, so they compile the
// same way on every dialect.
const BASE_COLUMN_LEAF: QueryLeafOps = {
  eq: (path, value) =>
    value === null
      ? { sql: `${quoteIdent(path)} IS NULL`, params: [] }
      : { sql: `${quoteIdent(path)} = ?`, params: [encodeSqlValue(value)] },
  ne: (path, value) =>
    value === null
      ? { sql: `${quoteIdent(path)} IS NOT NULL`, params: [] }
      : { sql: `${quoteIdent(path)} != ?`, params: [encodeSqlValue(value)] },
  compare: (path, op, value) => {
    const operators = { gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;
    return { sql: `${quoteIdent(path)} ${operators[op]} ?`, params: [encodeSqlValue(value)] };
  },
  between: (path, from, to) => ({
    sql: `(${quoteIdent(path)} >= ? AND ${quoteIdent(path)} <= ?)`,
    params: [encodeSqlValue(from), encodeSqlValue(to)],
  }),
  inList: (path, values) => ({
    sql: `${quoteIdent(path)} IN (${values.map(() => "?").join(", ")})`,
    params: values.map(encodeSqlValue),
  }),
  notInList: (path, values) => ({
    sql: `${quoteIdent(path)} NOT IN (${values.map(() => "?").join(", ")})`,
    params: values.map(encodeSqlValue),
  }),
  exists: (path) => ({ sql: `${quoteIdent(path)} IS NOT NULL`, params: [] }),
  missing: (path) => ({ sql: `${quoteIdent(path)} IS NULL`, params: [] }),
  empty: (path) => ({ sql: `${quoteIdent(path)} IS NULL`, params: [] }),
  arrayHas: (path, value) => ({
    sql: `EXISTS (SELECT 1 FROM json_each(${quoteIdent(path)}) WHERE json_each.value = ?)`,
    params: [encodeSqlValue(value)],
  }),
  contains: (path, value) => ({ sql: `${quoteIdent(path)} LIKE ?`, params: [`%${String(value)}%`] }),
};

class QueryCompiler {
  constructor(
    private readonly fields: FieldMap,
    private readonly dialect: SqlDialect,
  ) {}

  #leaf(path: string): QueryLeafOps {
    return BASE_COLUMNS.has(path) ? BASE_COLUMN_LEAF : this.dialect;
  }

  compile(query?: DocumentQuery): { where: string; params: unknown[] } {
    if (!query || (typeof query === "object" && !Array.isArray(query) && Object.keys(query).length === 0)) {
      return { where: "1 = 1", params: [] };
    }
    const compiled = this.compileNode(query);
    return { where: compiled.sql || "1 = 1", params: compiled.params };
  }

  orderBy(sort: Record<string, 1 | -1> = { createdAt: -1 }) {
    return Object.entries(sort)
      .map(([path, direction]) => `${this.fieldExpr(path)} ${direction === 1 ? "ASC" : "DESC"}`)
      .join(", ");
  }

  fieldExpr(path: string) {
    this.assertPath(path);
    return BASE_COLUMNS.has(path) ? quoteIdent(path) : this.dialect.extract(path);
  }

  private compileNode(query: DocumentQuery): { sql: string; params: unknown[] } {
    if (this.isQueryNode(query)) {
      if (query.kind === "all" || query.kind === "any") {
        const parts = query.queries.map((sub) => this.compileNode(sub)).filter((part) => part.sql);
        if (!parts.length) return { sql: "1 = 1", params: [] };
        const joiner = query.kind === "all" ? " AND " : " OR ";
        return {
          sql: `(${parts.map((part) => part.sql).join(joiner)})`,
          params: parts.flatMap((part) => part.params),
        };
      }
      if (query.kind === "not") {
        const part = this.compileNode(query.query);
        return { sql: `NOT (${part.sql})`, params: part.params };
      }
      if (query.kind === "raw") {
        if (/[;]/.test(query.sql)) throw new Error("Raw SQL query fragments must be a single statement fragment");
        return { sql: `(${query.sql})`, params: query.params };
      }
      throw new Error("Operator nodes must be attached to a document path");
    }
    const parts = Object.entries(query).flatMap(([path, value]) => {
      if (value === undefined) throw new Error(`Undefined query value is not allowed: ${path}`);
      return [this.compileField(path, value)];
    });
    if (!parts.length) return { sql: "1 = 1", params: [] };
    return {
      sql: `(${parts.map((part) => part.sql).join(" AND ")})`,
      params: parts.flatMap((part) => part.params),
    };
  }

  private compileField(path: string, value: unknown): { sql: string; params: unknown[] } {
    this.assertPath(path);
    const field = this.fields[path]?.getProps?.() ?? this.fields[path];
    const leaf = this.#leaf(path);
    if (this.isQueryNode(value)) {
      if (value.kind !== "op") return this.compileNode({ [path]: value } as DocumentQuery);
      switch (value.op) {
        case "eq":
          return leaf.eq(path, value.value);
        case "ne":
          return leaf.ne(path, value.value);
        case "oneOf": {
          const values = (value.value as unknown[]) ?? [];
          if (!values.length) return { sql: "0 = 1", params: [] };
          if (field?.isArray) {
            const parts = values.map((item) => leaf.arrayHas(path, item));
            return {
              sql: `(${parts.map((part) => part.sql).join(" OR ")})`,
              params: parts.flatMap((part) => part.params),
            };
          }
          return leaf.inList(path, values);
        }
        case "notOneOf": {
          const values = (value.value as unknown[]) ?? [];
          if (!values.length) return { sql: "1 = 1", params: [] };
          if (field?.isArray) {
            const parts = values.map((item) => leaf.arrayHas(path, item));
            return {
              sql: `NOT (${parts.map((part) => part.sql).join(" OR ")})`,
              params: parts.flatMap((part) => part.params),
            };
          }
          return leaf.notInList(path, values);
        }
        case "gt":
        case "gte":
        case "lt":
        case "lte":
          return leaf.compare(path, value.op, value.value);
        case "between": {
          const [from, to] = value.value as [unknown, unknown];
          return leaf.between(path, from, to);
        }
        case "exists":
          return leaf.exists(path);
        case "missing":
          return leaf.missing(path);
        case "empty":
          return leaf.empty(path);
        case "has":
          return leaf.arrayHas(path, value.value);
        case "contains":
          return leaf.contains(path, value.value);
      }
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const operators = value as Record<string, unknown>;
      const keys = Object.keys(operators);
      if (keys.some((key) => QUERY_OPERATOR_KEYS.has(key))) {
        const parts = keys.flatMap((key) => {
          if (!QUERY_OPERATOR_KEYS.has(key)) return [];
          if (key === "exists")
            return [this.compileField(path, { kind: "op", op: operators.exists ? "exists" : "missing" })];
          if (key === "missing")
            return [this.compileField(path, { kind: "op", op: operators.missing ? "missing" : "exists" })];
          if (key === "empty")
            return [this.compileField(path, { kind: "op", op: operators.empty ? "empty" : "exists" })];
          return [this.compileField(path, { kind: "op", op: key as QueryOperatorName, value: operators[key] })];
        });
        return {
          sql: `(${parts.map((part) => part.sql).join(" AND ")})`,
          params: parts.flatMap((part) => part.params),
        };
      }
    }
    if (field?.isArray && !Array.isArray(value)) return leaf.arrayHas(path, value);
    return leaf.eq(path, value);
  }

  private assertPath(path: string) {
    const root = path.split(".")[0];
    if (BASE_COLUMNS.has(root)) return;
    if (!this.fields[root]) {
      // A numeric root path means an array was passed where a query descriptor was expected —
      // almost always a slice `exec` that returned an executed list (listBy...) instead of a query.
      if (/^\d+$/.test(root))
        throw new Error(
          `Query received an array instead of a query object (field path "${path}"). ` +
            `A query must be a descriptor object; a slice exec must return queryBy...(...), not an executed list.`,
        );
      throw new Error(`Unknown document field path: ${path}`);
    }
  }

  private isQueryNode(value: unknown): value is DocumentQueryNode {
    return !!value && typeof value === "object" && "kind" in value;
  }
}

// Folds a path-keyed `DocumentUpdate` into SET assignments the database applies atomically: JSON-path operators
// collapse into a single nested `_doc` expression via the dialect, while base-column paths become plain assignments.
// `setOnInsert` values are returned separately for the upsert-insert path (they only apply when a new row is created).
class UpdateCompiler {
  constructor(
    private readonly fields: FieldMap,
    private readonly dialect: SqlDialect,
  ) {}

  compile(update: DocumentUpdate): { assignments: string[]; params: unknown[]; setOnInsert: Record<string, unknown> } {
    const baseAssignments: string[] = [];
    const baseParams: unknown[] = [];
    const setOnInsert: Record<string, unknown> = {};
    const jsonOps: { op: DocumentUpdateOperator; path: string; value: unknown }[] = [];
    for (const [path, raw] of Object.entries(update)) {
      if (raw === undefined) continue;
      const node: DocumentUpdateNode = isDocumentUpdateNode(raw) ? raw : { kind: "update", op: "set", value: raw };
      this.#assertPath(path);
      if (node.op === "setOnInsert") {
        setOnInsert[path] = node.value;
        continue;
      }
      if (BASE_COLUMNS.has(path)) {
        if (node.op === "set") {
          baseAssignments.push(`${quoteIdent(path)} = ?`);
          baseParams.push(encodeSqlValue(node.value));
        } else if (node.op === "unset") {
          baseAssignments.push(`${quoteIdent(path)} = NULL`);
        } else {
          throw new Error(`Unsupported update operator '${node.op}' on base column: ${path}`);
        }
        continue;
      }
      jsonOps.push({ op: node.op, path, value: node.value });
    }
    const assignments = [...baseAssignments];
    const params = [...baseParams];
    if (jsonOps.length) {
      let acc = this.dialect.docColumn();
      for (const { op, path, value } of jsonOps) {
        const frag = this.dialect.applyUpdate(acc, op, path, value);
        acc = frag.sql;
        params.push(...frag.params);
      }
      assignments.push(`${this.dialect.docColumn()} = ${acc}`);
    }
    return { assignments, params, setOnInsert };
  }

  #assertPath(path: string) {
    const root = path.split(".")[0];
    if (BASE_COLUMNS.has(root)) return;
    if (!this.fields[root]) throw new Error(`Unknown document field path: ${path}`);
  }
}

export class SqlDocumentStore {
  readonly schema: DocumentSchema;
  readonly table: string;
  readonly compiler: QueryCompiler;
  readonly updateCompiler: UpdateCompiler;
  #insertStmt: AkanSqlStatement | null = null;
  #readStmtCache = new Map<string, AkanSqlStatement>();

  constructor(
    private readonly owner: DocumentDatabaseOwner,
    readonly constant: ConstantModel,
    readonly database: DatabaseModel,
    schema: DocumentSchema,
    private readonly dialect: SqlDialect = new SqliteDialect(),
  ) {
    this.schema = schema;
    this.table = database.refName;
    const fields = database.doc[FIELD_META] as unknown as FieldMap;
    this.compiler = new QueryCompiler(fields, dialect);
    this.updateCompiler = new UpdateCompiler(fields, dialect);
  }

  async ensure() {
    this.assertValidRefName(this.table);
    const db = this.owner.getConnection();
    const ts = this.dialect.timestampType();
    await db.execute(
      `CREATE TABLE IF NOT EXISTS ${quoteIdent(this.table)} (
        "id" TEXT PRIMARY KEY NOT NULL,
        "createdAt" ${ts} NOT NULL,
        "updatedAt" ${ts} NOT NULL,
        "removedAt" ${ts},
        "_doc" ${this.dialect.docColumnType()} NOT NULL
      )`,
    );
    await this.owner.setMeta(
      `table:${this.table}`,
      await descriptorHash({ table: this.table, columns: ["id", "createdAt", "updatedAt", "removedAt", "_doc"] }),
    );
    for (const [idx, index] of this.schema.indexes.entries()) {
      const name = index.name ?? `${this.table}_${Object.keys(index.fields).map(toSafeRefName).join("_")}_${idx}`;
      this.assertValidRefName(name);
      const hash = await descriptorHash(index);
      const metaKey = `index:${this.table}:${name}`;
      const existing = await this.owner.getMeta(metaKey);
      if (existing && existing !== hash) throw new Error(`Index descriptor mismatch: ${name}`);
      const expressions = Object.keys(index.fields).map((field) => this.compiler.fieldExpr(field));
      const unique = index.unique ? "UNIQUE " : "";
      await db.execute(
        `CREATE ${unique}INDEX IF NOT EXISTS ${quoteIdent(name)} ON ${quoteIdent(this.table)} (${expressions.join(", ")})`,
      );
      await this.owner.setMeta(metaKey, hash);
    }
  }

  async create(data: DocumentRecord, { runSaveHooks = true }: WriteHookOptions = {}) {
    const now = Date.now();
    const id = data.id ?? createDocumentId(now);
    const doc = this.hydrate(
      this.prepareDocument({
        ...data,
        id,
        createdAt: data.createdAt ?? dayjs(now),
        updatedAt: data.updatedAt ?? dayjs(now),
      }),
    );
    if (runSaveHooks) await this.runHooks("save", "create", doc, "pre");
    await this.runHooks("create", "create", doc, "pre");
    const row = this.toRow(doc);
    await this.insertStmt().run(row.id, row.createdAt, row.updatedAt, row.removedAt, row._doc);
    await this.runHooks("create", "create", doc, "post");
    if (runSaveHooks) await this.runHooks("save", "create", doc, "post");
    return doc;
  }

  async clone(data: DocumentRecord & { id: string }) {
    return this.create(data);
  }

  async update(id: string, patch: DocumentRecord, options: WriteHookOptions = {}) {
    const current = await this.pickByIdForWrite(id);
    return await this.writeUpdatedDocument(id, { ...current, ...patch, id, updatedAt: dayjs() }, current, options);
  }

  async remove(id: string) {
    // Document-level soft delete: fire `remove` hooks, not `save`/`update`.
    return this.update(id, { removedAt: dayjs() }, { runSaveHooks: false, crudType: "remove" });
  }

  // Query-based writes push a single atomic UPDATE to the database (no read-modify-write, no lost-update race) and
  // deliberately fire NO document hooks — mirroring how MongoDB query middleware bypasses `save`/document middleware.
  // Callers needing per-document hooks must use the document paths (`create`/`update(id)`/`remove(id)`/`.save()`).
  async updateOneByQuery(query: DocumentQuery, update: DocumentUpdateInput, options: DocumentUpdateOptions = {}) {
    const resolved = resolveDocumentUpdate(update);
    const { assignments, params } = this.compiledUpdate(resolved);
    const { where, params: whereParams } = this.safeQuery(query);
    const subquery = `SELECT ${quoteIdent("id")} FROM ${quoteIdent(this.table)} WHERE ${where} ORDER BY ${this.compiler.orderBy()} LIMIT 1`;
    const sql = `UPDATE ${quoteIdent(this.table)} SET ${assignments.join(", ")} WHERE ${quoteIdent("id")} IN (${subquery})`;
    const changes = this.dialect.affectedRows(
      await this.owner
        .getConnection()
        .prepare(sql)
        .run(...params, ...whereParams),
    );
    if (changes > 0) return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedId: null };
    if (!options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: null };
    const inserted = await this.create(this.applyInsertUpdate(this.extractInsertBase(query), resolved), {
      runSaveHooks: false,
    });
    return { acknowledged: true, matchedCount: 0, modifiedCount: 1, upsertedId: inserted.id };
  }

  async updateManyByQuery(query: DocumentQuery, update: DocumentUpdateInput) {
    const { assignments, params } = this.compiledUpdate(resolveDocumentUpdate(update));
    const { where, params: whereParams } = this.safeQuery(query);
    const sql = `UPDATE ${quoteIdent(this.table)} SET ${assignments.join(", ")} WHERE ${where}`;
    const changes = this.dialect.affectedRows(
      await this.owner
        .getConnection()
        .prepare(sql)
        .run(...params, ...whereParams),
    );
    return { acknowledged: true, matchedCount: changes, modifiedCount: changes };
  }

  async deleteManyByQuery(query: DocumentQuery) {
    // Query-level soft delete is a single atomic UPDATE stamping `removedAt` (bare value = set); it fires no hooks.
    return this.updateManyByQuery(query, { removedAt: dayjs() });
  }

  // Prepends the mandatory `updatedAt = now` stamp to the compiled assignments so every atomic write bumps it.
  private compiledUpdate(update: DocumentUpdate) {
    const compiled = this.updateCompiler.compile(update);
    return {
      assignments: [`${quoteIdent("updatedAt")} = ?`, ...compiled.assignments],
      params: [Date.now(), ...compiled.params],
    };
  }

  async bulkWrite(
    operations: { updateOne: { filter: DocumentQuery; update: DocumentUpdateInput; upsert?: boolean } }[],
  ) {
    let matchedCount = 0;
    let modifiedCount = 0;
    let upsertedId: string | null = null;
    for (const operation of operations) {
      const result = await this.updateOneByQuery(operation.updateOne.filter, operation.updateOne.update, {
        upsert: operation.updateOne.upsert,
      });
      matchedCount += result.matchedCount;
      modifiedCount += result.modifiedCount;
      upsertedId ??= result.upsertedId ?? null;
    }
    return { acknowledged: true, matchedCount, modifiedCount, upsertedId };
  }

  async find(query?: DocumentQuery, options: FindManyOptions = {}) {
    const { where, params } = this.safeQuery(query);
    const limitValue = Number(options.limit ?? 0);
    const skipValue = Number(options.skip ?? 0);
    const limit = limitValue ? ` LIMIT ${limitValue}` : "";
    const offset = skipValue ? ` OFFSET ${skipValue}` : "";
    const order = options.sample ? "ORDER BY random()" : `ORDER BY ${this.compiler.orderBy(options.sort ?? undefined)}`;
    const projection = this.resolveProjection(options.select);
    if (projection) {
      const rows = await this.prepareReadStmt(
        `SELECT ${this.projectionSql(projection)} FROM ${quoteIdent(this.table)} WHERE ${where} ${order}${limit}${offset}`,
      ).all<ProjectedSqliteDocumentRow>(...params);
      return rows.map((row) => this.hydrate(this.fromProjectedRow(row, projection)));
    }
    const rows = await this.prepareReadStmt(
      `SELECT * FROM ${quoteIdent(this.table)} WHERE ${where} ${order}${limit}${offset}`,
    ).all<SqliteDocumentRow>(...params);
    return rows.map((row) => this.hydrate(this.fromRow(row)));
  }

  async findIds(
    query?: DocumentQuery,
    options: { sort?: SortOption; skip?: number | null; limit?: number | null; sample?: number } = {},
  ) {
    const { where, params } = this.safeQuery(query);
    const limitValue = Number(options.limit ?? 0);
    const skipValue = Number(options.skip ?? 0);
    const limit = limitValue ? ` LIMIT ${limitValue}` : "";
    const offset = skipValue ? ` OFFSET ${skipValue}` : "";
    const order = options.sample ? "ORDER BY random()" : `ORDER BY ${this.compiler.orderBy(options.sort ?? undefined)}`;
    const rows = await this.prepareReadStmt(
      `SELECT "id" FROM ${quoteIdent(this.table)} WHERE ${where} ${order}${limit}${offset}`,
    ).all<{ id: string }>(...params);
    return rows.map((row) => row.id);
  }

  async findOne(query?: DocumentQuery, options: FindOneOptions = {}) {
    return (await this.find(query, { ...options, limit: 1, sample: options.sample ? 1 : undefined })).at(0) ?? null;
  }

  async findId(query?: DocumentQuery, options: { sort?: SortOption; skip?: number | null; sample?: boolean } = {}) {
    return (await this.findIds(query, { ...options, limit: 1, sample: options.sample ? 1 : undefined })).at(0) ?? null;
  }

  async pickOne(query?: DocumentQuery, options: FindOneOptions = {}) {
    const doc = await this.findOne(query, options);
    if (!doc) throw new Error(`No Document (${this.table}): ${JSON.stringify(query)}`);
    return doc;
  }

  async pickById(id: string) {
    const doc = await this.findOne({ id } as DocumentQuery);
    if (!doc) throw new Error(`No Document (${this.table}): ${id}`);
    return doc;
  }

  async exists(query?: DocumentQuery) {
    return this.findId(query);
  }

  async count(query?: DocumentQuery) {
    const { where, params } = this.safeQuery(query);
    const row = await this.prepareReadStmt(
      `SELECT count(*) as count FROM ${quoteIdent(this.table)} WHERE ${where}`,
    ).get<{ count: number }>(...params);
    return row?.count ?? 0;
  }

  async insight(query?: DocumentQuery) {
    const insightFields = this.constant.insight[FIELD_META] as unknown as FieldMap;
    const result: DocumentRecord = {};
    for (const [key, field] of Object.entries(insightFields)) {
      const props = field.getProps();
      if (!props.accumulate) {
        result[key] = props.default;
      } else if (
        typeof props.accumulate === "object" &&
        !Object.keys(props.accumulate as Record<string, unknown>).some((key) => key.startsWith("$"))
      ) {
        result[key] = await this.count(documentQueryHelper.all(query ?? {}, props.accumulate as DocumentQuery));
      } else {
        result[key] = await this.count(query);
      }
    }
    return result;
  }

  async search(
    searchText: string | undefined | null,
    options: { skip?: number | null; limit?: number | null; sort?: SortOption } = {},
  ) {
    const textFields = this.schema.indexes.flatMap((index) =>
      Object.entries(index.fields)
        .filter(([, mode]) => mode === "text")
        .map(([field]) => field),
    );
    const query =
      searchText && textFields.length
        ? documentQueryHelper.any(
            ...textFields.map((field) =>
              documentQueryHelper.raw(`${this.compiler.fieldExpr(field)} LIKE ?`, [`%${searchText}%`]),
            ),
          )
        : {};
    const docs = await this.find(query, options);
    const count = await this.count(query);
    return { docs, count };
  }

  private safeQuery(query?: DocumentQuery) {
    return this.compiler.compile(documentQueryHelper.all(documentQueryHelper.empty("removedAt"), query ?? {}));
  }

  private prepareDocument(data: DocumentRecord) {
    const fields = this.database.doc[FIELD_META] as unknown as FieldMap;
    const doc: MutableDocumentRecord = {};
    for (const [key, field] of Object.entries(fields)) {
      const props = field.getProps();
      const value = data[key];
      if (value === undefined) {
        if (props.default !== undefined && props.default !== null) {
          doc[key] = typeof props.default === "function" ? props.default(data) : props.default;
        } else if (!props.nullable && !["removedAt"].includes(key)) {
          if (["id", "createdAt", "updatedAt"].includes(key)) continue;
          throw new Error(`Missing required field: ${key}`);
        }
      } else if (value === null && !props.nullable) {
        throw new Error(`Field is not nullable: ${key}`);
      } else {
        doc[key] = value;
      }
      if (doc[key] !== undefined && doc[key] !== null) {
        doc[key] = this.normalizeWriteValue(doc[key], props);
      }
      if (props.enum && doc[key] !== undefined && doc[key] !== null) {
        const values = Array.isArray(doc[key]) ? doc[key] : [doc[key]];
        const fieldEnum = props.enum as { has: (value: unknown) => boolean } | undefined;
        const invalidValue = fieldEnum ? values.find((value: unknown) => !fieldEnum.has(value)) : undefined;
        if (invalidValue !== undefined) throw new Error(`Invalid enum value for ${key}: ${invalidValue}`);
      }
      const validate = props.validate as ((value: unknown, doc: MutableDocumentRecord) => boolean) | undefined;
      if (validate && doc[key] !== undefined && doc[key] !== null && !validate(doc[key], doc)) {
        throw new Error(`Invalid field value: ${key}`);
      }
    }
    return { ...data, ...doc };
  }

  private extractInsertBase(query: DocumentQuery): Record<string, unknown> {
    if (!query || typeof query !== "object" || Array.isArray(query) || "kind" in query) return {};
    return Object.fromEntries(
      Object.entries(query).flatMap(([key, value]) => {
        if (["all", "any"].includes(key) || key.startsWith("$")) return [];
        if (value === null || ["string", "number", "boolean"].includes(typeof value)) return [[key, value]];
        return [];
      }),
    );
  }

  // Builds the initial document for an upsert insert by applying the update nodes in JS (there is no existing row to
  // mutate atomically). `setOnInsert` applies here — and only here — since it is defined only for the insert path.
  private applyInsertUpdate(base: DocumentRecord, update: DocumentUpdate) {
    const doc: MutableDocumentRecord = { ...base };
    const setPath = (path: string, value: unknown) => {
      const parts = path.split(".");
      let target: MutableDocumentRecord = doc;
      for (const part of parts.slice(0, -1)) {
        target[part] ??= {};
        target = target[part] as MutableDocumentRecord;
      }
      target[parts.at(-1) as string] = value;
    };
    const getPath = (path: string) =>
      path.split(".").reduce<unknown>((obj, key) => (obj as DocumentRecord | undefined)?.[key], doc);
    for (const [path, raw] of Object.entries(update)) {
      if (raw === undefined) continue;
      const node: DocumentUpdateNode = isDocumentUpdateNode(raw) ? raw : { kind: "update", op: "set", value: raw };
      const current = getPath(path);
      switch (node.op) {
        case "set":
        case "setOnInsert":
          setPath(path, node.value);
          break;
        case "unset": {
          const parts = path.split(".");
          let target: MutableDocumentRecord | undefined = doc;
          for (const part of parts.slice(0, -1)) {
            target = target?.[part] as MutableDocumentRecord | undefined;
            if (!target || typeof target !== "object") break;
          }
          if (target) delete target[parts.at(-1) as string];
          break;
        }
        case "inc":
          setPath(path, Number(current ?? 0) + Number(node.value));
          break;
        case "mul":
          setPath(path, Number(current ?? 0) * Number(node.value));
          break;
        case "min":
          setPath(path, current === undefined ? node.value : Math.min(Number(current), Number(node.value)));
          break;
        case "max":
          setPath(path, current === undefined ? node.value : Math.max(Number(current), Number(node.value)));
          break;
        case "push":
          setPath(path, [...(Array.isArray(current) ? current : []), node.value]);
          break;
        case "addToSet": {
          const arr = Array.isArray(current) ? current : [];
          if (!arr.some((item) => stableJson(item) === stableJson(node.value))) setPath(path, [...arr, node.value]);
          break;
        }
        case "pull":
          if (Array.isArray(current))
            setPath(
              path,
              current.filter((item) => stableJson(item) !== stableJson(node.value)),
            );
          break;
      }
    }
    return doc;
  }

  private toRow(doc: DocumentRecord) {
    const payload = { ...doc };
    delete payload.id;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.removedAt;
    return {
      id: doc.id,
      createdAt: Number(encodeSqlValue(doc.createdAt ?? dayjs())),
      updatedAt: Number(encodeSqlValue(doc.updatedAt ?? dayjs())),
      removedAt: doc.removedAt ? Number(encodeSqlValue(doc.removedAt)) : null,
      _doc: JSON.stringify(sanitizeJson(payload)),
    };
  }

  private fromRow(row: SqliteDocumentRow) {
    // SQLite/libsql return `_doc` as a JSON string; the Postgres `jsonb` driver already returns a parsed object.
    const rawDoc: unknown = row._doc;
    const raw = typeof rawDoc === "string" ? JSON.parse(rawDoc) : (rawDoc as Record<string, unknown>);
    const payload = this.decodeDocumentPayload(raw);
    return {
      id: row.id,
      createdAt: dayjs(Number(row.createdAt)),
      updatedAt: dayjs(Number(row.updatedAt)),
      removedAt: row.removedAt ? dayjs(Number(row.removedAt)) : undefined,
      ...payload,
    };
  }

  private normalizeProjection(select: ProjectionOption): string[] | null {
    if (!select) return null;
    const fields = Object.entries(select)
      .filter(([, included]) => included)
      .map(([field]) => field);
    return [...new Set(fields.filter((field) => field !== "_doc"))];
  }

  private resolveProjection(select: ProjectionOption): string[] | null {
    const projection = this.normalizeProjection(select);
    if (projection !== null) return projection;
    return this.defaultProjection();
  }

  private defaultProjection(): string[] | null {
    const fields = this.database.doc[FIELD_META] as unknown as FieldMap;
    const entries = Object.entries(fields).filter(([key]) => !BASE_COLUMNS.has(key));
    if (!entries.some(([, field]) => field.getProps().select === false)) return null;
    return entries.flatMap(([key, field]) => (field.getProps().select === false ? [] : [key]));
  }

  private projectionSql(fields: string[]) {
    const jsonFields = fields.filter((field) => !BASE_COLUMNS.has(field));
    const baseColumns = [...BASE_COLUMNS].map((field) => quoteIdent(field));
    const jsonColumns = jsonFields.map(
      (field, idx) => `${this.compiler.fieldExpr(field)} AS ${quoteIdent(this.projectionAlias(idx))}`,
    );
    return [...baseColumns, ...jsonColumns].join(", ");
  }

  private projectionAlias(idx: number) {
    return `__akan_projection_${idx}`;
  }

  private fromProjectedRow(row: ProjectedSqliteDocumentRow, fields: string[]) {
    const doc: DocumentRecord = {
      id: row.id,
      createdAt: dayjs(Number(row.createdAt)),
      updatedAt: dayjs(Number(row.updatedAt)),
      removedAt: row.removedAt ? dayjs(Number(row.removedAt)) : undefined,
    };
    const jsonFields = fields.filter((field) => !BASE_COLUMNS.has(field));
    for (const [idx, field] of jsonFields.entries()) {
      const value = this.parseProjectedValue(row[this.projectionAlias(idx)]);
      const props = (this.database.doc[FIELD_META] as unknown as FieldMap)[field]?.getProps?.();
      if (value === null && !props?.nullable) {
        if (props?.default != null) {
          doc[field] =
            typeof props.default === "function" ? (props.default as (data: unknown) => unknown)(doc) : props.default;
        } else {
          doc[field] =
            ((props as Record<string, unknown>).modelRef as { [DEFAULT_VALUE]?: unknown })?.[DEFAULT_VALUE] ?? null;
        }
      } else {
        doc[field] = props ? this.decodeFieldValue(value, props) : value;
      }
    }
    return doc;
  }

  private async findForWrite(query?: DocumentQuery, options: FindManyOptions = {}) {
    const { where, params } = this.safeQuery(query);
    const limitValue = Number(options.limit ?? 0);
    const skipValue = Number(options.skip ?? 0);
    const limit = limitValue ? ` LIMIT ${limitValue}` : "";
    const offset = skipValue ? ` OFFSET ${skipValue}` : "";
    const order = options.sample ? "ORDER BY random()" : `ORDER BY ${this.compiler.orderBy(options.sort ?? undefined)}`;
    const rows = await this.prepareReadStmt(
      `SELECT * FROM ${quoteIdent(this.table)} WHERE ${where} ${order}${limit}${offset}`,
    ).all<SqliteDocumentRow>(...params);
    return rows.map((row) => this.hydrate(this.fromRow(row)));
  }

  private async findOneForWrite(query?: DocumentQuery, options: FindOneOptions = {}) {
    return (
      (await this.findForWrite(query, { ...options, limit: 1, sample: options.sample ? 1 : undefined })).at(0) ?? null
    );
  }

  private async pickByIdForWrite(id: string) {
    const doc = await this.findOneForWrite({ id } as DocumentQuery);
    if (!doc) throw new Error(`No Document (${this.table}): ${id}`);
    return doc;
  }

  private async writeUpdatedDocument(
    id: string,
    data: DocumentRecord,
    originalData: DocumentRecord,
    { runSaveHooks = true, crudType = "update" }: WriteHookOptions = {},
  ) {
    const doc = this.hydrate(this.prepareDocument({ ...data, id, updatedAt: dayjs() }), originalData);
    if (runSaveHooks) await this.runHooks("save", crudType, doc, "pre");
    await this.runHooks(crudType, crudType, doc, "pre");
    const row = this.toRow(doc);
    await this.owner
      .getConnection()
      .prepare(
        `UPDATE ${quoteIdent(this.table)} SET "createdAt" = ?, "updatedAt" = ?, "removedAt" = ?, "_doc" = ${this.dialect.docValuePlaceholder()} WHERE "id" = ?`,
      )
      .run(row.createdAt, row.updatedAt, row.removedAt, row._doc, id);
    await this.runHooks(crudType, crudType, doc, "post");
    if (runSaveHooks) await this.runHooks("save", crudType, doc, "post");
    return doc;
  }

  private parseProjectedValue(value: unknown) {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return value;
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  private decodeDocumentPayload(payload: Record<string, unknown>) {
    const fields = this.database.doc[FIELD_META] as unknown as FieldMap;
    const result: Record<string, unknown> = {};
    for (const [key, fieldMeta] of Object.entries(fields)) {
      if (BASE_COLUMNS.has(key)) continue;
      const props = fieldMeta.getProps();
      const value = payload[key];
      if (value === undefined) {
        const def = props.default;
        if (def != null) {
          result[key] = typeof def === "function" ? (def as (data: unknown) => unknown)(payload) : def;
        } else if (props.nullable) {
          result[key] = null;
        } else {
          result[key] =
            ((props as Record<string, unknown>).modelRef as { [DEFAULT_VALUE]?: unknown })?.[DEFAULT_VALUE] ?? null;
        }
      } else {
        result[key] = this.decodeFieldValue(value, props);
      }
    }
    for (const [key, value] of Object.entries(payload)) {
      if (key in result || BASE_COLUMNS.has(key)) continue;
      const props = fields[key]?.getProps?.();
      result[key] = props ? this.decodeFieldValue(value, props) : value;
    }
    return result;
  }

  private decodeFieldValue(value: unknown, props: Record<string, unknown>): unknown {
    if (value === undefined || value === null) return value;
    if (props.isMap) {
      const entries = value instanceof Map ? [...value.entries()] : Object.entries(value as Record<string, unknown>);
      return new Map(entries.map(([key, item]) => [key, this.decodeMapValue(item, props)]));
    }
    if (props.modelRef === Date) {
      if (Array.isArray(value)) return value.map((item) => (item === null ? item : decodeDateValue(item)));
      return decodeDateValue(value);
    }
    if (Array.isArray(value)) return value.map((item) => this.decodeNestedValue(item, props));
    return this.decodeNestedValue(value, props);
  }

  private decodeMapValue(value: unknown, props: Record<string, unknown>) {
    if (value === undefined || value === null) return value;
    if (props.of === Date) return decodeDateValue(value);
    return value;
  }

  private decodeNestedValue(value: unknown, props: Record<string, unknown>): unknown {
    if (!value || typeof value !== "object") return value;
    if (!props.isClass || !props.isScalar) return value;
    const scalarFields = (props.modelRef as { [FIELD_META]?: FieldMap } | undefined)?.[FIELD_META];
    if (!scalarFields) return value;
    const source = value as Record<string, unknown>;
    const defaults = getDefault(scalarFields as never) as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, fieldMeta] of Object.entries(scalarFields)) {
      const nestedProps = fieldMeta.getProps();
      const nested = source[key];
      result[key] = nested === undefined ? defaults[key] : this.decodeFieldValue(nested, nestedProps);
    }
    for (const [key, nested] of Object.entries(source)) {
      if (!(key in result)) result[key] = nested;
    }
    return result;
  }

  private normalizeWriteValue(value: unknown, props: Record<string, unknown>): unknown {
    if (value === undefined || value === null) return value;
    if (props.modelRef === Date) {
      if (Array.isArray(value))
        return value.map((item) => (item === null || item === undefined ? item : dayjs(item as never)));
      return dayjs(value as never);
    }
    if (!props.isClass || !props.isScalar) return value;
    if (Array.isArray(value)) return value.map((item) => this.fillScalarDefaults(item, props));
    return this.fillScalarDefaults(value, props);
  }

  private fillScalarDefaults(value: unknown, props: Record<string, unknown>): unknown {
    if (!value || typeof value !== "object") return value;
    const scalarFields = (props.modelRef as { [FIELD_META]?: FieldMap } | undefined)?.[FIELD_META];
    if (!scalarFields) return value;
    const defaults = getDefault(scalarFields as never) as Record<string, unknown>;
    const result = { ...(value as Record<string, unknown>) };
    for (const [key, fieldMeta] of Object.entries(scalarFields)) {
      const nestedProps = fieldMeta.getProps();
      if (result[key] === undefined) result[key] = defaults[key];
      else result[key] = this.normalizeWriteValue(result[key], nestedProps);
    }
    return result;
  }

  hydrate(data: DocumentRecord, originalData: DocumentRecord = data) {
    const store = this;
    const original = JSON.parse(JSON.stringify(sanitizeJson(originalData) ?? {})) as Record<string, unknown>;
    const isNew = !originalData.id;
    const hydratedData = isNew ? this.prepareDocument(data) : data;
    const doc = Object.assign(Object.create(this.database.doc.prototype), hydratedData);
    Object.defineProperties(doc, {
      set: {
        value(patch: DocumentRecord) {
          Object.assign(this, patch);
          return this;
        },
      },
      save: {
        async value() {
          return this.id ? store.update(this.id, this) : store.create(this);
        },
      },
      refresh: {
        async value() {
          Object.assign(this, await store.pickById(this.id));
          return this;
        },
      },
      isModified: {
        value(field?: string) {
          if (isNew) return true;
          if (!field) return JSON.stringify(sanitizeJson(this)) !== JSON.stringify(original);
          return JSON.stringify(sanitizeJson(this[field])) !== JSON.stringify(original[field]);
        },
      },
      toJSON: {
        value() {
          return sanitizeJson(this);
        },
      },
      toObject: {
        value() {
          return sanitizeJson(this);
        },
      },
    });
    return doc;
  }

  private async runHooks(
    saveType: "save" | "create" | "update" | "remove",
    crudType: "create" | "update" | "remove",
    doc: DocumentRecord,
    phase: "pre" | "post",
  ) {
    const hooks = phase === "pre" ? this.schema.preHooks.get(saveType) : this.schema.postHooks.get(saveType);
    for (const hook of hooks ?? []) {
      const run = () => hook.call(doc, () => undefined, crudType);
      if (phase === "post") await this.owner.afterCommit(run);
      else await run();
    }
  }

  private insertStmt() {
    this.#insertStmt ??= this.owner
      .getConnection()
      .prepare(
        `INSERT INTO ${quoteIdent(this.table)} ("id", "createdAt", "updatedAt", "removedAt", "_doc") VALUES (?, ?, ?, ?, ${this.dialect.docValuePlaceholder()})`,
      );
    return this.#insertStmt;
  }

  private prepareReadStmt(sql: string) {
    const cached = this.#readStmtCache.get(sql);
    if (cached) return cached;
    // Keep the cache bounded; list/find query shapes repeat heavily, while ad-hoc filters should not grow forever.
    if (this.#readStmtCache.size >= 128) {
      const oldest = this.#readStmtCache.keys().next().value;
      if (oldest) this.#readStmtCache.delete(oldest);
    }
    const stmt = this.owner.getConnection().prepare(sql);
    this.#readStmtCache.set(sql, stmt);
    return stmt;
  }

  private assertValidRefName(refName: string) {
    if (!REF_NAME_RE.test(refName) || RESERVED_RE.test(refName))
      throw new Error(`Invalid database identifier: ${refName}`);
  }
}
export class SqliteDatabase
  extends adapt("sqliteDatabase", ({ env }) => ({
    config: env((env: SqliteEnv) => {
      const appName = env.appName ?? "akan";
      const environment = env.environment ?? "local";
      const defaultFile = resolveDefaultSqliteFile({
        appName,
        fileName: `${appName}-${environment}.db`,
        isProduction: process.env.NODE_ENV === "production",
        operationMode: env.operationMode,
        workspaceRoot: env.workspaceRoot,
      });
      return {
        journalMode: "WAL",
        busyTimeoutMs: 5000,
        synchronous: "NORMAL",
        foreignKeys: true,
        ...env.database?.sqlite,
        filePath: env.database?.sqlite?.filePath ?? process.env.SQLITE_DATABASE_PATH ?? defaultFile,
      } satisfies Required<
        Pick<SqliteDatabaseConfig, "filePath" | "journalMode" | "busyTimeoutMs" | "synchronous" | "foreignKeys">
      > &
        SqliteDatabaseConfig;
    }),
  }))
  implements DatabaseAdaptor
{
  #db!: Database;
  #client!: BunSqliteClient;
  #stores = new Map<string, SqlDocumentStore>();
  #transaction = new AsyncLocalStorage<TransactionContext>();

  override async onInit() {
    await mkdir(path.dirname(this.config.filePath), { recursive: true });
    this.#db = new Database(this.config.filePath, { strict: true, create: true });
    this.#client = new BunSqliteClient(this.#db);
    this.#db.run(`PRAGMA journal_mode = ${this.config.journalMode ?? "WAL"}`);
    this.#db.run(`PRAGMA busy_timeout = ${this.config.busyTimeoutMs ?? 5000}`);
    this.#db.run(`PRAGMA synchronous = ${this.config.synchronous ?? "NORMAL"}`);
    this.#db.run(`PRAGMA foreign_keys = ${this.config.foreignKeys === false ? "OFF" : "ON"}`);
    if (this.config.cacheSize) this.#db.run(`PRAGMA cache_size = ${this.config.cacheSize}`);
    if (this.config.tempStore) this.#db.run(`PRAGMA temp_store = ${this.config.tempStore}`);
    this.#db.run(
      `CREATE TABLE IF NOT EXISTS "_akan_meta" ("key" TEXT PRIMARY KEY NOT NULL, "value" TEXT NOT NULL, "updatedAt" INTEGER NOT NULL)`,
    );
  }

  override async onDestroy() {
    this.#db?.run("PRAGMA wal_checkpoint(TRUNCATE)");
    await this.#client?.close();
  }

  getConnection() {
    return this.#client;
  }

  getStore(constant: ConstantModel, database: DatabaseModel, schema: SchemaOf) {
    const existing = this.#stores.get(database.refName);
    if (existing) return existing;
    const store = new SqlDocumentStore(this, constant, database, schema as DocumentSchema);
    this.#stores.set(database.refName, store);
    void store.ensure();
    return store;
  }

  getMeta(key: string) {
    return (this.#db.query(`SELECT "value" FROM "_akan_meta" WHERE "key" = ?`).get(key) as { value: string } | null)
      ?.value;
  }

  async setMeta(key: string, value: string) {
    this.#db
      .query(
        `INSERT INTO "_akan_meta" ("key", "value", "updatedAt") VALUES (?, ?, ?) ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", "updatedAt" = excluded."updatedAt"`,
      )
      .run(key, value, Date.now());
  }

  async transaction<T>(fn: () => PromiseOrObject<T>): Promise<T> {
    const active = this.#transaction.getStore();
    if (active) return await fn();
    const context: TransactionContext = { afterCommit: [] };
    return await this.#transaction.run(context, async () => {
      this.#db.run("BEGIN IMMEDIATE");
      try {
        const result = await fn();
        this.#db.run("COMMIT");
        for (const hook of context.afterCommit) await hook();
        return result;
      } catch (err) {
        this.#db.run("ROLLBACK");
        throw err;
      }
    });
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
  extends adapt("libsqlDatabase", ({ env }) => ({
    config: env((env: SqliteEnv) => {
      const appName = env.appName ?? "akan";
      const environment = env.environment ?? "local";
      const defaultFile = resolveDefaultSqliteFile({
        appName,
        fileName: `${appName}-${environment}.db`,
        isProduction: process.env.NODE_ENV === "production",
        operationMode: env.operationMode,
        workspaceRoot: env.workspaceRoot,
      });
      return {
        url:
          env.database?.libsql?.url ??
          process.env.LIBSQL_URL ??
          process.env.LIBSQL_URI ??
          `file:${env.database?.sqlite?.filePath ?? process.env.SQLITE_DATABASE_PATH ?? defaultFile}`,
        authToken: env.database?.libsql?.authToken ?? process.env.LIBSQL_AUTH_TOKEN,
      } satisfies LibsqlDatabaseConfig;
    }),
  }))
  implements DatabaseAdaptor
{
  #client!: LibsqlAkanClient;
  #stores = new Map<string, SqlDocumentStore>();
  #transaction = new AsyncLocalStorage<TransactionContext>();

  override async onInit() {
    const url = this.config.url ?? "file:local.db";
    if (url.startsWith("file:")) await mkdir(path.dirname(url.slice(5)), { recursive: true });
    const { createClient } = await import("@libsql/client");
    this.#client = new LibsqlAkanClient(createClient({ url, authToken: this.config.authToken }));
    await this.#client.execute(
      `CREATE TABLE IF NOT EXISTS "_akan_meta" ("key" TEXT PRIMARY KEY NOT NULL, "value" TEXT NOT NULL, "updatedAt" INTEGER NOT NULL)`,
    );
  }

  override async onDestroy() {
    await this.#client?.close();
  }

  getConnection() {
    return this.#client;
  }

  getStore(constant: ConstantModel, database: DatabaseModel, schema: SchemaOf) {
    const existing = this.#stores.get(database.refName);
    if (existing) return existing;
    const store = new SqlDocumentStore(this, constant, database, schema as DocumentSchema);
    this.#stores.set(database.refName, store);
    void store.ensure();
    return store;
  }

  async getMeta(key: string) {
    return (await this.#client.prepare(`SELECT "value" FROM "_akan_meta" WHERE "key" = ?`).get<{ value: string }>(key))
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
    const context: TransactionContext = { afterCommit: [] };
    return await this.#transaction.run(context, async () => {
      await this.#client.execute("BEGIN IMMEDIATE");
      try {
        const result = await fn();
        await this.#client.execute("COMMIT");
        for (const hook of context.afterCommit) await hook();
        return result;
      } catch (err) {
        await this.#client.execute("ROLLBACK");
        throw err;
      }
    });
  }

  async afterCommit(fn: () => PromiseOrObject<void>) {
    const active = this.#transaction.getStore();
    if (!active) return await fn();
    active.afterCommit.push(fn);
  }
}

export class PostgresDatabase
  extends adapt("postgresDatabase", ({ env }) => ({
    config: env((env: SqliteEnv) => {
      return {
        url: env.database?.postgres?.url ?? process.env.POSTGRES_URL ?? process.env.POSTGRES_URI,
        host: env.database?.postgres?.host ?? process.env.POSTGRES_HOST ?? "localhost",
        port: env.database?.postgres?.port ?? Number(process.env.POSTGRES_PORT ?? 5432),
        database: env.database?.postgres?.database ?? process.env.POSTGRES_DATABASE ?? "akan",
        user: env.database?.postgres?.user ?? process.env.POSTGRES_USER ?? "akan",
        password: env.database?.postgres?.password ?? process.env.POSTGRES_PASSWORD ?? "akan",
      } satisfies PostgresDatabaseConfig;
    }),
  }))
  implements DatabaseAdaptor
{
  #client!: PostgresAkanClient;
  #stores = new Map<string, SqlDocumentStore>();
  #transaction = new AsyncLocalStorage<TransactionContext>();

  override async onInit() {
    const { default: postgres } = await import("postgres");
    const sql = this.config.url
      ? postgres(this.config.url)
      : postgres({
          host: this.config.host,
          port: this.config.port,
          database: this.config.database,
          username: this.config.user,
          password: this.config.password,
        });
    this.#client = new PostgresAkanClient(sql);
    await this.#client.execute(
      `CREATE TABLE IF NOT EXISTS "_akan_meta" ("key" TEXT PRIMARY KEY NOT NULL, "value" TEXT NOT NULL, "updatedAt" BIGINT NOT NULL)`,
    );
  }

  override async onDestroy() {
    await this.#client?.close();
  }

  getConnection() {
    return this.#client;
  }

  getStore(constant: ConstantModel, database: DatabaseModel, schema: SchemaOf) {
    const existing = this.#stores.get(database.refName);
    if (existing) return existing;
    const store = new SqlDocumentStore(this, constant, database, schema as DocumentSchema, new PostgresDialect());
    this.#stores.set(database.refName, store);
    void store.ensure();
    return store;
  }

  async getMeta(key: string) {
    return (await this.#client.prepare(`SELECT "value" FROM "_akan_meta" WHERE "key" = $1`).get<{ value: string }>(key))
      ?.value;
  }

  async setMeta(key: string, value: string) {
    await this.#client
      .prepare(
        `INSERT INTO "_akan_meta" ("key", "value", "updatedAt") VALUES ($1, $2, $3) ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", "updatedAt" = excluded."updatedAt"`,
      )
      .run(key, value, Date.now());
  }

  async transaction<T>(fn: () => PromiseOrObject<T>): Promise<T> {
    const active = this.#transaction.getStore();
    if (active) return await fn();
    const context: TransactionContext = { afterCommit: [] };
    return await this.#transaction.run(context, async () => {
      await this.#client.execute("BEGIN");
      try {
        const result = await fn();
        await this.#client.execute("COMMIT");
        for (const hook of context.afterCommit) await hook();
        return result;
      } catch (err) {
        await this.#client.execute("ROLLBACK");
        throw err;
      }
    });
  }

  async afterCommit(fn: () => PromiseOrObject<void>) {
    const active = this.#transaction.getStore();
    if (!active) return await fn();
    active.afterCommit.push(fn);
  }
}
