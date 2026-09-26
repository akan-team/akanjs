import type { PromiseOrObject } from "akanjs/base";
import type { ConstantModel } from "akanjs/constant";
import type {
  DatabaseModel,
  DocumentQuery,
  DocumentQueryNode,
  DocumentSchema,
  DocumentUpdateInput,
  DocumentUpdateOperator,
  DocumentUpdateOptions,
} from "akanjs/document";
import { baseDocumentColumns, queryOperatorKeys } from "akanjs/document";
import type { SearchIndex } from "../searchIndex";
import type { SqlDocumentStore } from "./SqlDocumentStore";

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
  /** A login role holding SELECT on base columns and nothing else — the one `InsightQuery` reads as. */
  insightUrl?: string;
}

export interface SearchConfig {
  enabled?: boolean;
  tokenizer?: string;
}

export interface DatabaseConfig {
  sqlite?: SqliteDatabaseConfig;
  libsql?: LibsqlDatabaseConfig;
  postgres?: PostgresDatabaseConfig;
  search?: SearchConfig;
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
  removeManyByQuery(
    query: DocumentQuery,
  ): Promise<{ acknowledged: boolean; matchedCount: number; modifiedCount: number }>;
  removeOneByQuery(
    query: DocumentQuery,
  ): Promise<{ acknowledged: boolean; matchedCount: number; modifiedCount: number; upsertedId: string | null }>;
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
  hydrate(data: DocumentRecord, originalData?: DocumentRecord, options?: { track?: boolean }): any;
  /** A document as text that another process turns back into the same document. */
  serialize(doc: DocumentRecord): string;
  deserialize(text: string): any;
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

/** A connection on which the engine itself cannot reach `_doc`. See `InsightQuery`. */
export interface InsightSession {
  read(statement: string, timeoutMs: number): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}

export interface DatabaseAdaptor {
  getConnection(): AkanSqlClient;
  getStore(constant: ConstantModel, database: DatabaseModel, schema: DocumentSchema): DocumentStore;
  /** Every model table this process has opened a store for. */
  stores?(): SqlDocumentStore[];
  transaction<T>(fn: () => PromiseOrObject<T>): Promise<T>;
  // Declared here so a service holding `plug(DatabaseAdaptorRole)` can reach `suspend`/`resume` around a bulk
  // import without casting. `null` on adaptors that have no text search, which is how callers tell them apart.
  getSearchIndex(): SearchIndex | null;
  openInsight?(): Promise<InsightSession>;
}

/** A model row as it is stored, `_doc` parsed — the unit a transfer between databases copies. */
export interface TransferRow {
  id: string;
  createdAt: number;
  updatedAt: number;
  removedAt: number | null;
  _doc: Record<string, unknown>;
}

export interface SqliteEnv {
  workspaceRoot?: string;
  database?: DatabaseConfig;
}

export interface TransactionContext {
  afterCommit: (() => PromiseOrObject<void>)[];
}

export const BASE_COLUMNS = baseDocumentColumns;
export const RESERVED_RE = /^sqlite_|^_akan_meta$|^search_doc$|^search_fts$/i;
export const REF_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
export const toSafeRefName = (value: string) => value.replace(/[^A-Za-z0-9_]+/g, "_").replace(/_+/g, "_");
export type DocumentRecord = Record<string, unknown>;
export type MutableDocumentRecord = Record<string, unknown>;
export type FieldMap = Record<string, { getProps: () => Record<string, unknown>; [key: string]: unknown }>;
export type SortOption = Record<string, 1 | -1> | null | undefined;
export type ProjectionOption = Partial<Record<string, boolean>> | null | undefined;
export type FindManyOptions = {
  sort?: SortOption;
  skip?: number | null;
  limit?: number | null;
  sample?: number;
  select?: ProjectionOption;
};
export type FindOneOptions = { sort?: SortOption; skip?: number | null; sample?: boolean; select?: ProjectionOption };
export type WriteHookOptions = { runSaveHooks?: boolean; crudType?: "update" | "remove" };
export type QueryOperatorName = Extract<DocumentQueryNode, { kind: "op" }>["op"];
export interface SqliteDocumentRow {
  id: string;
  createdAt: number | string;
  updatedAt: number | string;
  removedAt?: number | string | null;
  _doc: string;
}
export type ProjectedSqliteDocumentRow = Omit<SqliteDocumentRow, "_doc"> & Record<string, unknown>;

export interface ConcurrentIndexBuild {
  name: string;
  /** Where a replacement is built before it takes `name` over. */
  next: string;
  create: (name: string) => string;
  /** The index exists under a different descriptor and is rebuilt; otherwise it is built only if missing. */
  replace: boolean;
}

export interface DocumentDatabaseOwner {
  getConnection(): AkanSqlClient;
  getSearchIndex(): SearchIndex | null;
  getMeta(key: string): Promise<string | undefined> | string | undefined;
  setMeta(key: string, value: string): Promise<void>;
  afterCommit(fn: () => PromiseOrObject<void>): Promise<void>;
  transaction?<T>(fn: () => PromiseOrObject<T>): Promise<T>;
  /**
   * Runs `fn` as the only schema change in the database. Postgres needs it: two `CREATE … IF NOT EXISTS` naming one
   * table race to a duplicate-key error there instead of one of them skipping.
   */
  lockSchema?<T>(fn: () => Promise<T>): Promise<T>;
  hasTable?(table: string): Promise<boolean>;
  hasValidIndex?(name: string): Promise<boolean>;
  /** Lets the role `InsightQuery` reads as see the table's base columns, and never `_doc`. */
  grantInsight?(table: string): Promise<void>;
  /** Builds an index on a table that already holds rows without blocking its writes; never inside a transaction. */
  buildIndexConcurrently?(build: ConcurrentIndexBuild): Promise<void>;
}

export const QUERY_OPERATOR_KEYS = queryOperatorKeys;

export interface SqlFrag {
  sql: string;
  params: unknown[];
}

export interface SearchJoin extends SqlFrag {
  alias: string;
}

export interface CompiledQuery {
  where: string;
  params: unknown[];
  joins: SearchJoin[];
}

export interface CompileContext {
  joins: SearchJoin[];
  conjunctive: boolean;
}

/**
 * What a document path holds, as far as the model declares it: `text` for a declared string — `String`, `ID`, a string
 * enum, or a relation, which stores its target's id — and `json` for everything else, including any path the model
 * does not type (inside an `Any`, a `Map`, an array of objects). SQLite reads both alike; Postgres compares them apart.
 */
export type PathKind = "text" | "json";

export interface IndexColumn {
  path: string;
  expr: string;
  isArray: boolean;
}

export interface CreateIndexProps {
  name: string;
  table: string;
  unique: boolean;
  columns: IndexColumn[];
  /** Build without blocking writes to a table that already holds rows. Postgres only, and never in a transaction. */
  concurrently?: boolean;
}

// A `SqlDialect` owns every dialect-specific SQL fragment so the compilers stay dialect-agnostic. Leaf query
// operators and update operators are compiled fully here (SQL + params) — the accumulator string returned by
// `applyUpdate` lets updates fold into a single nested JSON expression that the database applies atomically.
// SQLite/libsql share JSON1 syntax; Postgres uses the jsonb operator/function family.
export interface SqlDialect {
  readonly name: "sqlite" | "postgres";
  timestampType(): string;
  docColumnType(): string;
  docColumn(): string;
  docValuePlaceholder(): string;
  extract(path: string, kind?: PathKind): string;
  projectExpr(path: string): string;
  decodeProjected(value: unknown): unknown;
  eq(path: string, value: unknown, kind?: PathKind): SqlFrag;
  ne(path: string, value: unknown, kind?: PathKind): SqlFrag;
  compare(path: string, op: "gt" | "gte" | "lt" | "lte", value: unknown, kind?: PathKind): SqlFrag;
  between(path: string, from: unknown, to: unknown, kind?: PathKind): SqlFrag;
  inList(path: string, values: unknown[], kind?: PathKind): SqlFrag;
  notInList(path: string, values: unknown[], kind?: PathKind): SqlFrag;
  exists(path: string): SqlFrag;
  missing(path: string): SqlFrag;
  empty(path: string): SqlFrag;
  arrayHas(path: string, value: unknown): SqlFrag;
  contains(path: string, value: unknown): SqlFrag;
  orderTerm(expr: string, direction: 1 | -1): string;
  indexName(name: string): string;
  createIndex(props: CreateIndexProps): string;
  applyUpdate(acc: string, op: DocumentUpdateOperator, path: string, value: unknown): SqlFrag;
  /** The stored document with these top-level fields replaced (value as JSON text) and these removed. */
  mergeDocument(set: [field: string, json: string][], removed: string[]): SqlFrag;
  affectedRows(result: unknown): number;
}

export type QueryLeafOps = Pick<
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
export const MODIFICATION_STATE = Symbol("akan.document.modificationState");

export interface ModificationState {
  isNew: boolean;
  original: Record<string, unknown>;
}
