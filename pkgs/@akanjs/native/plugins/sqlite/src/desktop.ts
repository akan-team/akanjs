// Desktop: bun:sqlite in the Bun Worker (the system libsqlite3 on macOS). bun:sqlite is
// synchronous, so calls run one at a time in call order like the serial queues on iOS and Android.
// - db.prepare() compiles only the first statement and ignores the rest without a word (checked),
//   hence checkSql's statement count before it.
// - Statement.run() reports changes as the difference of total_changes (a trigger's rows count
//   too; DDL is 0) and the connection's last_insert_rowid: the definition iOS and Android follow.
// - Integers within ±(2^53 − 1) bind as INTEGER, other numbers as REAL, booleans as 1/0. bun:sqlite
//   by itself binds a number as INTEGER only below 2^52 (and -0 as REAL), so checkParams hands it
//   bigints (checked with typeof(?)). tauri-plugins-workspace/plugins/sql/src/wrapper.rs:164-175
//   binds every JSON number as f64, so integers become REAL there; akan-native does not.
// - Connections belong to the page that opened them (architecture review, document scope): each
//   window's page load has its own, and when it ends an open transaction is rolled back and the
//   connection closed. WAL (and a 5 s busy_timeout) lets several windows' connections share a file:
//   readers do not block the writer.
// - Databases close on quit (ctx.onQuit), so nothing is left half-written.

import { Database, type Statement } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import { checkDb, checkName, checkParams, checkSql, columnValue, sqliteCode } from "./common.ts";
import type { SqliteSpec, StatementArgs } from "./index.ts";

function mapError(error: unknown): AkanNativeError {
  if (error instanceof AkanNativeError) return error;
  const errno = (error as { errno?: unknown })?.errno;
  const message = String((error as Error)?.message ?? error);
  return new AkanNativeError(typeof errno === "number" ? sqliteCode(errno) : "INTERNAL", message);
}

/** `dir` is replaceable so tests can use a temporary folder. */
export function createDesktopSqlite(dir: (ctx: DesktopContext) => string = (ctx) => join(ctx.appDataDir, "databases")) {
  /** Page (window and document) → name → connection. */
  const pages = new Map<string, Map<string, Database>>();
  const pageOf = (ctx: DesktopContext) => `${ctx.window ?? 1}:${ctx.document?.id ?? ""}`;

  const database = (db: unknown, ctx: DesktopContext): Database => {
    const handle = pages.get(pageOf(ctx))?.get(checkDb(db));
    if (!handle)
      throw new AkanNativeError(
        "NOT_FOUND",
        `database ${String(db)} is not open in this page (call open first; a page load opens its own)`,
      );
    return handle;
  };

  /** Rolls back what is left open and closes the connection. */
  const shut = (db: Database) => {
    try {
      if (db.inTransaction) db.run("ROLLBACK");
    } catch (error) {
      console.error("[akan-native] sqlite: rolling back an open transaction failed", error);
    }
    db.close();
  };

  const closePage = (page: string) => {
    const open = pages.get(page);
    pages.delete(page);
    for (const db of open?.values() ?? []) shut(db);
  };

  /** Prepares one statement with its values bound-checked, runs `use`, then finalizes it. */
  const withStatement = <T>(
    args: StatementArgs,
    ctx: DesktopContext,
    use: (statement: Statement, values: ReturnType<typeof checkParams>) => T,
  ): T => {
    const db = database(args?.db, ctx);
    const sql = checkSql(args.sql);
    const values = checkParams(args.params);
    let statement: Statement;
    try {
      statement = db.prepare(sql);
    } catch (error) {
      throw mapError(error);
    }
    try {
      if (statement.paramsCount !== values.length) {
        throw new AkanNativeError("INVALID_ARGS", `sql expects ${statement.paramsCount} values, got ${values.length}`);
      }
      return use(statement, values);
    } catch (error) {
      throw mapError(error);
    } finally {
      statement.finalize();
    }
  };

  const closeAll = () => {
    for (const page of [...pages.keys()]) closePage(page);
  };

  return defineDesktopPlugin<SqliteSpec>({
    id: "sqlite",
    setup(ctx) {
      ctx.onQuit(closeAll);
    },
    methods: {
      open(args, ctx) {
        const name = checkName(args?.name);
        const page = pageOf(ctx);
        let open = pages.get(page);
        if (open?.has(name)) return { db: name };
        const folder = dir(ctx);
        try {
          mkdirSync(folder, { recursive: true });
          const db = new Database(join(folder, name), { create: true, readwrite: true });
          db.run("PRAGMA busy_timeout = 5000");
          db.run("PRAGMA journal_mode = WAL");
          db.run("PRAGMA foreign_keys = ON");
          if (!open) {
            open = new Map();
            pages.set(page, open);
            ctx.document?.own(() => closePage(page));
          }
          open.set(name, db);
        } catch (error) {
          const e = mapError(error);
          throw new AkanNativeError(
            e.code === "INVALID_ARGS" ? "INTERNAL" : e.code,
            `cannot open ${name}: ${e.message}`,
          );
        }
        return { db: name };
      },
      execute: (args, ctx) =>
        withStatement(args, ctx, (statement, values) => {
          const { changes, lastInsertRowid } = statement.run(...values);
          return { changes, lastInsertId: Number(lastInsertRowid) };
        }),
      query: (args, ctx) =>
        withStatement(args, ctx, (statement, values) => {
          const columns = statement.columnNames;
          const rows = (statement.values(...values) as unknown[][]).map((row) => {
            const out: Record<string, unknown> = {};
            for (const [i, name] of columns.entries()) out[name] = columnValue(row[i]);
            return out;
          });
          return { columns, rows };
        }),
      close(args, ctx) {
        const name = checkDb(args?.db);
        const open = pages.get(pageOf(ctx));
        const db = open?.get(name);
        open?.delete(name);
        if (db) shut(db);
      },
    },
  });
}

export default createDesktopSqlite();
