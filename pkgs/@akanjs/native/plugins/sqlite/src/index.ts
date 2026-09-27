import { definePlugin, type Plugin } from "../../../packages/core/src/index.ts";

/**
 * A value bound to a `?` parameter or read from a column. The same rules hold on macOS, iOS and
 * Android:
 * - number: an integer within ±(2^53 − 1) binds as INTEGER, any other number as REAL (bun:sqlite's
 *   rule). Columns come back as numbers; INTEGER values beyond 2^53 lose precision, as in JSON.
 *   REAL infinities come back as null (JSON has no Infinity).
 * - boolean: binds as 1 or 0 (SQLite has no boolean type) and reads back as a number.
 * - BLOB: `{ base64 }` both ways (standard alphabet, padding optional when binding). An empty
 *   `{ base64: "" }` is a zero-length BLOB, not NULL.
 * - string: TEXT, UTF-8 in the file. NUL characters are kept.
 */
export type SqlValue = string | number | boolean | null | SqlBlob;

export interface SqlBlob {
  base64: string;
}

/** A result row: column name → value. Later columns with the same name replace earlier ones (alias them). */
export type SqlRow = Record<string, SqlValue>;

export interface SqlStatement {
  /** A handle from open(). */
  db: string;
  /**
   * One SQL statement; a trailing ";" and comments are fine. More than one statement rejects
   * INVALID_ARGS instead of running only the first (what SQLite's prepare, Android and bun:sqlite
   * would otherwise do silently): send them one call at a time.
   */
  sql: string;
  /** Positional values for `?`, `?NNN`, `:name` parameters (by index). The count must match the statement's. */
  params?: SqlValue[];
}

export interface ExecuteResult {
  /**
   * Rows inserted, updated or deleted by this statement, including rows changed by triggers and
   * foreign key actions (the difference of sqlite3_total_changes()); 0 for other statements.
   */
  changes: number;
  /** sqlite3_last_insert_rowid() of the connection after the statement: the rowid of the most recent successful INSERT, 0 if none. */
  lastInsertId: number;
}

export interface QueryResult<T extends SqlRow = SqlRow> {
  /** Result column names in order (also for an empty result; rows are objects, whose key order is not guaranteed on iOS). */
  columns: string[];
  rows: T[];
}

/**
 * SQLite databases in the app's data folder, with the SQLite that ships with the OS: libsqlite3 on
 * iOS, android.database.sqlite on Android, bun:sqlite on desktop. Not available on the web.
 *
 * - Files: `<name>` in Library/Application Support/databases (iOS), the app's databases folder
 *   (Android, Context.getDatabasePath), `<app data>/databases` (desktop). Kept until the app is
 *   removed.
 * - A handle belongs to the page that opened it (architecture review, 2026-09-26): each page load
 *   (and each desktop window) has its own connection, and when the page reloads, navigates or its
 *   window closes, an open transaction is rolled back and the connection closed. Call open() after
 *   every page load; open() of a name this page already opened returns it again.
 * - Every database opens with `PRAGMA foreign_keys = ON` and a 5 s busy timeout. The journal is
 *   WAL on the desktop and iOS, where several windows' connections may share a file; Android keeps
 *   journal_mode DELETE (its WAL uses a pool of connections, and a statement's connection state
 *   would depend on the connection it lands on; Android's windows never overlap in one process).
 * - Calls run one at a time off the main thread, in call order, for all databases together.
 *   Transactions: `execute({ sql: "BEGIN" })` … `"COMMIT"` / `"ROLLBACK"`. On Android BEGIN, COMMIT
 *   and ROLLBACK must start the statement text (Android runs them itself), and SAVEPOINT works
 *   only inside BEGIN … COMMIT.
 * - Errors: INVALID_ARGS for bad arguments and for SQL errors (syntax, missing table, constraint
 *   violations, with SQLite's message), NOT_FOUND for a db that is not open, INTERNAL for I/O and
 *   other failures.
 */
export interface SqliteApi {
  /**
   * Opens (creating if needed) the database file `name`: letters, digits, ".", "_" and "-", up to
   * 128 characters, starting with a letter or digit, not ending in -journal, -wal or -shm. The
   * handle is the name.
   */
  open(args: { name: string }): Promise<{ db: string }>;
  /** Runs a statement and discards any rows it returns. */
  execute(args: SqlStatement): Promise<ExecuteResult>;
  /** Runs a statement and returns its rows (any statement: SELECT, `INSERT … RETURNING`, PRAGMA). */
  query<T extends SqlRow = SqlRow>(args: SqlStatement): Promise<QueryResult<T>>;
  /** Closes the database. Closing a database that is not open does nothing. */
  close(args: { db: string }): Promise<void>;
}

/** The arguments of execute and query as the host receives them. */
export interface StatementArgs {
  db: string;
  sql: string;
  /** SqlValue items; the hosts check them (the generator cannot express a union of primitives). */
  params?: unknown[];
}

/**
 * The bridge shape of SqliteApi, the spec the Swift and Kotlin bindings are generated from (PL-10):
 * params and row values are `unknown` because a union of primitives has no generated form.
 */
export interface SqliteSpec {
  open(args: { name: string }): Promise<{ db: string }>;
  execute(args: StatementArgs): Promise<ExecuteResult>;
  query(args: StatementArgs): Promise<{ columns: string[]; rows: Record<string, unknown>[] }>;
  close(args: { db: string }): Promise<void>;
}

const handle = definePlugin<SqliteSpec>("sqlite", {
  methods: ["open", "execute", "query", "close"],
});

/** The hosts return only SqlValue items, so the typed facade is the same object. */
export const sqlite = handle as unknown as Plugin<SqliteApi>;
