import type { Changes, Database, SQLQueryBindings, Statement } from "bun:sqlite";
import { StatementFingerprint, type StatementShape } from "../statementFingerprint";
import { type SentStatement, type StatementPlanner, StatementProbe } from "../statementProbe";
import type { AkanSqlClient, AkanSqlStatement } from "../types";

/** Resolves once a write from the calling context may run; `null` when it may run now. */
export type SqliteWriteTurn = () => Promise<void> | null;

/** The connection a read from the calling context runs on; `null` for the one the statement was prepared on. */
export type SqliteReader = () => Database | null;

const openTurn: SqliteWriteTurn = () => null;

const ownConnection: SqliteReader = () => null;

const changedRows = (changes: Changes) => changes.changes;
const foundRow = (row: unknown) => (row ? 1 : 0);
const listedRows = (rows: unknown[]) => rows.length;

class BunSqliteStatement implements AkanSqlStatement, SentStatement {
  readonly #reads: boolean;
  readonly shape: StatementShape;
  #onReader: Statement | null = null;
  constructor(
    readonly sql: string,
    private readonly statement: Statement,
    private readonly writeTurn: SqliteWriteTurn = openTurn,
    private readonly readerOf: SqliteReader = ownConnection,
    private readonly readerLasts = true,
    readonly planner: StatementPlanner | null = null,
  ) {
    // SQLite reports `BEGIN`, `COMMIT` and `ATTACH` read-only too, so a read must also return rows to skip its turn.
    this.#reads = statement.readonly && statement.reader;
    this.shape = StatementFingerprint.of(sql);
  }
  async run(...params: unknown[]) {
    return await this.#execute(params, (statement) => statement.run(...(params as SQLQueryBindings[])), changedRows);
  }
  async get<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row | null> {
    return await this.#execute(
      params,
      (statement) => (statement.get(...(params as SQLQueryBindings[])) as Row | null) ?? null,
      foundRow,
    );
  }
  async all<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row[]> {
    return await this.#execute(
      params,
      (statement) => statement.all(...(params as SQLQueryBindings[])) as Row[],
      listedRows,
    );
  }

  // Checked in the step that runs the write: a transaction begun after an earlier check would take the write in.
  async #execute<T>(params: unknown[], use: (statement: Statement) => T, rowsOf: (result: T) => number) {
    let waitMs = 0;
    let turn = this.#reads ? null : this.writeTurn();
    if (turn) {
      const waitedFrom = performance.now();
      for (; turn; turn = this.writeTurn()) await turn;
      waitMs = performance.now() - waitedFrom;
    }
    const startedAt = performance.now();
    let rows = 0;
    try {
      const result = this.#reads ? this.#read(use) : use(this.statement);
      rows = rowsOf(result);
      return result;
    } finally {
      StatementProbe.sent(this, params, performance.now() - startedAt, waitMs, rows);
    }
  }

  #read<T>(use: (statement: Statement) => T) {
    const reader = this.readerOf();
    if (!reader) return use(this.statement);
    if (this.readerLasts) {
      this.#onReader ??= reader.query(this.sql);
      return use(this.#onReader);
    }
    // SQLite keeps a closed connection, and here every page of its copy, allocated until its last statement is gone.
    const statement = reader.prepare(this.sql);
    try {
      return use(statement);
    } finally {
      statement.finalize();
    }
  }
}

export class BunSqliteClient implements AkanSqlClient {
  constructor(
    readonly db: Database,
    private readonly writeTurn: SqliteWriteTurn = openTurn,
    private readonly readerOf: SqliteReader = ownConnection,
    private readonly readerLasts = true,
    private readonly planner: StatementPlanner | null = null,
  ) {}
  async execute(sql: string, params: unknown[] | Record<string, unknown> = []) {
    const values = Array.isArray(params) ? params : Object.values(params);
    return await this.prepare(sql).run(...values);
  }
  prepare(sql: string): AkanSqlStatement {
    return new BunSqliteStatement(
      sql,
      this.db.query(sql),
      this.writeTurn,
      this.readerOf,
      this.readerLasts,
      this.planner,
    );
  }
  async close() {
    this.db.close();
  }
}
