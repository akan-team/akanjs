import type { ConstantModel, textFieldRoles } from "akanjs/constant";
import type { DatabaseModel, SearchColumn } from "akanjs/document";
import type { AkanSqlClient, SqlFrag } from "../types";

export const DOC_TABLE = "search_doc";
export const FTS_TABLE = "search_fts";

export type SearchColumns = Record<(typeof textFieldRoles)[number], string>;
export type ModelTriggers = [name: string, sql: string][];

export interface SearchIndexOwner {
  getConnection(): AkanSqlClient;
  getMeta(key: string): Promise<string | undefined> | string | undefined;
  setMeta(key: string, value: string): Promise<void>;
  lockSchema?<T>(fn: () => Promise<T>): Promise<T>;
  transaction?<T>(fn: () => Promise<T>): Promise<T>;
}

// `ref` names both the model table and the `search_doc."ref"` value — the mirror keys rows by table name.
export interface SearchQuery {
  ref: string;
  text: string;
  prefix: boolean;
  columns: readonly SearchColumn[] | undefined;
  weights: readonly number[];
}

/**
 * What differs between the fts5 index and the Postgres one. `SearchIndex` keeps everything else — the disabled marker,
 * the per-ref hashes, the cross-process claims and the chunked backfill — so both engines share one set of rules.
 */
export interface SearchEngine {
  /** What the index structure is built from; a change rebuilds it from `search_doc`. */
  schemaDescriptor(): unknown;
  /**
   * Creates `search_doc` and the index over it, under the owner's schema lock or write transaction. `current` means the
   * stored descriptor matches, so only a missing index is rebuilt. Returns the `search_doc` columns it had to add,
   * which nothing has ever written.
   */
  ensureSchema(current: boolean): Promise<string[]>;
  /** One SQL expression per role over the `alias` row, or null when the model declares no text role. */
  columns(constant: ConstantModel, database: DatabaseModel, alias: "NEW" | "OLD"): SearchColumns | null;
  /** The DDL that keeps a ref's mirror rows current. Hashed, so a template change rebuilds the ref. */
  modelTriggers(ref: string, next: SearchColumns, prev: SearchColumns | null): ModelTriggers;
  /** `replace` swaps existing definitions; otherwise only the missing ones are created. */
  createModelTriggers(ref: string, triggers: ModelTriggers, replace: boolean): Promise<void>;
  dropModelTriggers(ref: string): Promise<void>;
  /** Follows the backfill's `WHERE`. */
  readonly backfillLock: string;
  /** Whether `merge` folds anything; an index that keeps no segments has nothing to fold on a timer. */
  readonly merges: boolean;
  merge(): Promise<void>;
  /** A subquery exposing `rid` and a `score` that sorts best-first ascending; null matches nothing. */
  join(query: SearchQuery): SqlFrag | null;
}
