import {
  type AkanSqlClient,
  type QueryLeafOps,
  REF_NAME_RE,
  RESERVED_RE,
  type SqlDialect,
  type SqlFrag,
  type SqliteDocumentRow,
  type TransferRow,
} from "./types";
import { assertStorableJson, BASE_COLUMN_LEAF, decodeDateValue, isPlainObject, jsonStr, quoteIdent } from "./values";

export interface RawFilterOperators {
  $ne?: unknown;
  $in?: unknown[];
  $nin?: unknown[];
  $exists?: boolean;
  $gt?: unknown;
  $gte?: unknown;
  $lt?: unknown;
  $lte?: unknown;
}

/** Dot paths into `_doc`, or a base column, each to a value or to `RawFilterOperators` over it. */
export type RawFilter = Record<string, unknown>;

export interface RawFindOptions {
  /** Only rows whose id sorts after this one: rows come in id order, so a page resumes where the last one ended. */
  after?: string;
  limit?: number;
  /** Removed rows are read too unless this is `false`. */
  withRemoved?: boolean;
  /** Holds the rows read until the transaction ends; SQLite's one writer already does. */
  lock?: boolean;
}

/**
 * A table read and written as stored rows, beneath its model: a field the model no longer declares, or a table no model
 * owns any more, stays reachable. Writes run no hook and derive nothing.
 */
export class RawDocumentTable {
  static readonly #baseColumns = new Set(["id", "createdAt", "updatedAt", "removedAt"]);
  static readonly #columns = `"id", "createdAt", "updatedAt", "removedAt", "_doc"`;
  readonly name: string;
  readonly #connection: () => AkanSqlClient;
  readonly #dialect: SqlDialect;
  #exists: boolean | undefined;

  constructor(name: string, connection: () => AkanSqlClient, dialect: SqlDialect) {
    if (!REF_NAME_RE.test(name) || RESERVED_RE.test(name)) throw new Error(`"${name}" names no model table`);
    this.name = name;
    this.#connection = connection;
    this.#dialect = dialect;
  }

  async exists() {
    if (this.#exists) return true;
    const isPostgres = this.#dialect.name === "postgres";
    const row = await this.#connection()
      .prepare(
        isPostgres
          ? `SELECT to_regclass(?) IS NOT NULL AS "found"`
          : `SELECT COUNT(*) AS "found" FROM sqlite_master WHERE "type" = 'table' AND "name" = ?`,
      )
      .get<{ found: unknown }>(isPostgres ? quoteIdent(this.name) : this.name);
    this.#exists = !!Number(row?.found ?? 0);
    return this.#exists;
  }

  async find(filter?: RawFilter, options: RawFindOptions = {}) {
    if (!(await this.exists())) return [];
    const where = this.#where(filter, options);
    const limit = options.limit === undefined ? "" : ` LIMIT ${Math.max(0, Math.trunc(options.limit))}`;
    const rows = await this.#connection()
      .prepare(
        `SELECT ${RawDocumentTable.#columns} FROM ${quoteIdent(this.name)} WHERE ${where.sql} ORDER BY "id"${limit}${this.#forUpdate(options.lock)}`,
      )
      .all<SqliteDocumentRow>(...where.params);
    return rows.map(RawDocumentTable.#toRow);
  }

  async count(filter?: RawFilter, options: Omit<RawFindOptions, "limit"> = {}) {
    if (!(await this.exists())) return 0;
    const where = this.#where(filter, options);
    const row = await this.#connection()
      .prepare(`SELECT COUNT(*) AS "count" FROM ${quoteIdent(this.name)} WHERE ${where.sql}`)
      .get<{ count: unknown }>(...where.params);
    return Number(row?.count ?? 0);
  }

  async get(id: string, { lock = false }: Pick<RawFindOptions, "lock"> = {}) {
    if (!(await this.exists())) return null;
    const row = await this.#connection()
      .prepare(
        `SELECT ${RawDocumentTable.#columns} FROM ${quoteIdent(this.name)} WHERE "id" = ?${this.#forUpdate(lock)}`,
      )
      .get<SqliteDocumentRow>(id);
    return row ? RawDocumentTable.#toRow(row) : null;
  }

  async insert(row: TransferRow) {
    await this.#assertExists();
    await this.#connection()
      .prepare(
        `INSERT INTO ${quoteIdent(this.name)} (${RawDocumentTable.#columns}) VALUES (?, ?, ?, ?, ${this.#dialect.docValuePlaceholder()})`,
      )
      .run(row.id, row.createdAt, row.updatedAt, row.removedAt, this.#json(row._doc));
  }

  async write(id: string, { _doc, removedAt }: Pick<TransferRow, "_doc" | "removedAt">) {
    await this.#assertExists();
    const result = await this.#connection()
      .prepare(
        `UPDATE ${quoteIdent(this.name)} SET "_doc" = ${this.#dialect.docValuePlaceholder()}, "removedAt" = ? WHERE "id" = ?`,
      )
      .run(this.#json(_doc), removedAt, id);
    return this.#dialect.affectedRows(result) > 0;
  }

  async delete(id: string) {
    await this.#assertExists();
    const result = await this.#connection()
      .prepare(`DELETE FROM ${quoteIdent(this.name)} WHERE "id" = ?`)
      .run(id);
    return this.#dialect.affectedRows(result) > 0;
  }

  #forUpdate(lock = false) {
    return lock && this.#dialect.name === "postgres" ? " FOR UPDATE" : "";
  }

  async #assertExists() {
    if (!(await this.exists())) throw new Error(`Table "${this.name}" does not exist`);
  }

  #json(doc: Record<string, unknown>) {
    return assertStorableJson(jsonStr(doc), this.name);
  }

  #where(filter: RawFilter = {}, { after, withRemoved = true }: RawFindOptions): SqlFrag {
    const parts = Object.entries(filter).flatMap(([path, value]) => this.#leaves(path, value));
    if (after !== undefined) parts.push({ sql: `"id" > ?`, params: [after] });
    if (!withRemoved) parts.push({ sql: `"removedAt" IS NULL`, params: [] });
    if (!parts.length) return { sql: "1 = 1", params: [] };
    return { sql: parts.map((part) => `(${part.sql})`).join(" AND "), params: parts.flatMap((part) => part.params) };
  }

  #leaves(path: string, value: unknown): SqlFrag[] {
    RawDocumentTable.#assertPath(path);
    if (value === undefined) throw new Error(`Filter value for "${path}" is undefined`);
    const leaf: QueryLeafOps = RawDocumentTable.#baseColumns.has(path) ? BASE_COLUMN_LEAF : this.#dialect;
    if (!isPlainObject(value)) {
      if (Array.isArray(value))
        throw new Error(`Filter "${path}" compares an array; match it with $in or by its items`);
      return [leaf.eq(path, value)];
    }
    const operators = Object.entries(value);
    if (!operators.length || operators.some(([key]) => !key.startsWith("$")))
      throw new Error(`Filter "${path}" compares an object; match its leaves by their own paths`);
    return operators.map(([operator, operand]) => {
      switch (operator) {
        case "$ne":
          return leaf.ne(path, operand);
        case "$in":
        case "$nin": {
          if (!Array.isArray(operand)) throw new Error(`Filter "${path}" ${operator} takes an array`);
          if (!operand.length) return { sql: operator === "$in" ? "0 = 1" : "1 = 1", params: [] };
          return operator === "$in" ? leaf.inList(path, operand) : leaf.notInList(path, operand);
        }
        case "$exists":
          return operand ? leaf.exists(path) : leaf.missing(path);
        case "$gt":
        case "$gte":
        case "$lt":
        case "$lte":
          return leaf.compare(path, operator.slice(1) as "gt" | "gte" | "lt" | "lte", operand);
        default:
          throw new Error(`Unknown filter operator "${operator}" on "${path}"`);
      }
    });
  }

  // SQLite reads `a.0` as the key "0" and Postgres as the first item, and a comma or brace splits a Postgres path.
  static #assertPath(path: string) {
    const segments = path.split(".");
    // Postgres reads `-1` as the last item of an array, SQLite as a key, so a negative index is refused as well.
    if (segments.some((segment) => !/^[\w$-]+$/.test(segment) || /^-?\d+$/.test(segment)))
      throw new Error(`Filter path "${path}" must be dot-separated names, without array indexes`);
  }

  static #toRow(row: SqliteDocumentRow): TransferRow {
    const epoch = (value: unknown) => decodeDateValue(value)?.valueOf() ?? null;
    return {
      id: row.id,
      createdAt: epoch(row.createdAt) ?? 0,
      updatedAt: epoch(row.updatedAt) ?? 0,
      removedAt: epoch(row.removedAt),
      _doc: (typeof row._doc === "string" ? JSON.parse(row._doc) : row._doc) as Record<string, unknown>,
    };
  }
}
