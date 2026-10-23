import type { Database, SQLQueryBindings, Statement } from "bun:sqlite";
import type { AkanSqlClient, AkanSqlStatement } from "../types";

/** Resolves once a write from the calling context may run; `null` when it may run now. */
export type SqliteWriteTurn = () => Promise<void> | null;

export const openTurn: SqliteWriteTurn = () => null;

export const waitForTurn = (statement: Statement, writeTurn: SqliteWriteTurn) => {
  // SQLite reports `BEGIN`, `COMMIT` and `ATTACH` read-only too, so a read must also return rows to skip its turn.
  const writes = !(statement.readonly && statement.reader);
  return async () => {
    if (!writes) return;
    for (let turn = writeTurn(); turn; turn = writeTurn()) await turn;
  };
};

export class BunSqliteStatement implements AkanSqlStatement {
  readonly #turn: () => Promise<void>;
  constructor(
    private readonly statement: Statement,
    writeTurn: SqliteWriteTurn = openTurn,
  ) {
    this.#turn = waitForTurn(statement, writeTurn);
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
    return new BunSqliteStatement(this.db.query(sql), this.writeTurn);
  }
  async close() {
    this.db.close();
  }
}
