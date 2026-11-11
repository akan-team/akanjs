import type { Database, SQLQueryBindings, Statement } from "bun:sqlite";
import type { AkanSqlClient, AkanSqlStatement } from "../types";

/** Resolves once a write from the calling context may run; `null` when it may run now. */
export type SqliteWriteTurn = () => Promise<void> | null;

/** The connection a read from the calling context runs on; `null` for the one the statement was prepared on. */
export type SqliteReader = () => Database | null;

const openTurn: SqliteWriteTurn = () => null;

const ownConnection: SqliteReader = () => null;

class BunSqliteStatement implements AkanSqlStatement {
  readonly #reads: boolean;
  #onReader: Statement | null = null;
  constructor(
    private readonly sql: string,
    private readonly statement: Statement,
    private readonly writeTurn: SqliteWriteTurn = openTurn,
    private readonly readerOf: SqliteReader = ownConnection,
  ) {
    // SQLite reports `BEGIN`, `COMMIT` and `ATTACH` read-only too, so a read must also return rows to skip its turn.
    this.#reads = statement.readonly && statement.reader;
  }
  async run(...params: unknown[]) {
    return await this.#execute((statement) => statement.run(...(params as SQLQueryBindings[])));
  }
  async get<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row | null> {
    return await this.#execute((statement) => (statement.get(...(params as SQLQueryBindings[])) as Row | null) ?? null);
  }
  async all<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row[]> {
    return await this.#execute((statement) => statement.all(...(params as SQLQueryBindings[])) as Row[]);
  }

  // Checked in the step that runs the write: a transaction begun after an earlier check would take the write in.
  async #execute<T>(use: (statement: Statement) => T) {
    if (this.#reads) return use(this.#readStatement());
    for (let turn = this.writeTurn(); turn; turn = this.writeTurn()) await turn;
    return use(this.statement);
  }

  #readStatement() {
    const reader = this.readerOf();
    if (!reader) return this.statement;
    this.#onReader ??= reader.query(this.sql);
    return this.#onReader;
  }
}

export class BunSqliteClient implements AkanSqlClient {
  constructor(
    readonly db: Database,
    private readonly writeTurn: SqliteWriteTurn = openTurn,
    private readonly readerOf: SqliteReader = ownConnection,
  ) {}
  async execute(sql: string, params: unknown[] | Record<string, unknown> = []) {
    const values = Array.isArray(params) ? params : Object.values(params);
    return await this.prepare(sql).run(...values);
  }
  prepare(sql: string): AkanSqlStatement {
    return new BunSqliteStatement(sql, this.db.query(sql), this.writeTurn, this.readerOf);
  }
  async close() {
    this.db.close();
  }
}
