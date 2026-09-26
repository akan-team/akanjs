import type { Database, SQLQueryBindings, Statement } from "bun:sqlite";
import type { AkanSqlClient, AkanSqlStatement } from "../types";

/** Resolves once a write from the calling context may run; `null` when it may run now. */
export type SqliteWriteTurn = () => Promise<void> | null;

const openTurn: SqliteWriteTurn = () => null;
// Only a plain read may skip its turn. Anything else — `INSERT … RETURNING` read through `get()` included — writes.
const readOnlyStatement = /^\s*select\b/i;
export const isReadOnlyStatement = (sql: string) => readOnlyStatement.test(sql);

export class BunSqliteStatement implements AkanSqlStatement {
  readonly #writes: boolean;
  constructor(
    private readonly statement: Statement,
    sql: string,
    private readonly writeTurn: SqliteWriteTurn = openTurn,
  ) {
    this.#writes = !isReadOnlyStatement(sql);
  }
  async #turn() {
    if (!this.#writes) return;
    for (let turn = this.writeTurn(); turn; turn = this.writeTurn()) await turn;
  }
  async run(...params: unknown[]) {
    await this.#turn();
    return this.statement.run(...(params as SQLQueryBindings[]));
  }
  async get<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row | null> {
    await this.#turn();
    return (this.statement.get(...(params as SQLQueryBindings[])) as Row | null) ?? null;
  }
  async all<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row[]> {
    await this.#turn();
    return this.statement.all(...(params as SQLQueryBindings[])) as Row[];
  }
}

export class BunSqliteClient implements AkanSqlClient {
  constructor(
    readonly db: Database,
    private readonly writeTurn: SqliteWriteTurn = openTurn,
  ) {}
  async execute(sql: string, params: unknown[] | Record<string, unknown> = []) {
    const values = Array.isArray(params) ? params : Object.values(params);
    return await this.prepare(sql).run(...values);
  }
  prepare(sql: string): AkanSqlStatement {
    return new BunSqliteStatement(this.db.query(sql), sql, this.writeTurn);
  }
  async close() {
    this.db.close();
  }
}
