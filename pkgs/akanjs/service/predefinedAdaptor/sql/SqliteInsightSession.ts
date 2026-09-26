import { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { quoteIdent } from "../sqlDescriptor";
import type { InsightSession } from "./types";

/**
 * The database attached to a fresh in-memory connection under a random schema name, with every table that holds
 * `_doc` shadowed by a TEMP view that leaves it out.
 *
 * bun:sqlite exposes no authorizer that could deny a column, so the engine is left unable to name one instead: an
 * unqualified table resolves to its view, `main` is empty, and the table itself only answers to a schema name no
 * statement may contain. A check on the statement's text could not be the boundary — SQLite reads a quoted string as a
 * name where one is expected, so `'admin'.'_doc'` is the column. `query_only` refuses every write, whatever the text.
 */
export class SqliteInsightSession implements InsightSession {
  // A schema passed as an argument can be computed, so these are refused by name: raw pages, and the index samples
  // ANALYZE keeps under STAT4. Neither Bun build compiles them in today.
  static readonly #unnameable = ["sqlite_dbpage", "sqlite_stat3", "sqlite_stat4"];
  static readonly #documentColumn = "_doc";

  readonly #db: Database;
  readonly #hidden: string[];
  readonly #cleanup: () => Promise<void>;

  private constructor(db: Database, source: string, cleanup: () => Promise<void>) {
    this.#db = db;
    this.#hidden = [source, ...SqliteInsightSession.#unnameable];
    this.#cleanup = cleanup;
  }

  static open(file: string) {
    return SqliteInsightSession.#attach(file, async () => undefined);
  }

  /** No second connection can open an in-memory database, so it is read from a copy that lives for one session. */
  static async openSnapshot(bytes: Uint8Array) {
    const dir = await mkdtemp(path.join(tmpdir(), "akan-insight-"));
    const remove = async () => await rm(dir, { recursive: true, force: true });
    try {
      const file = path.join(dir, "snapshot.db");
      await writeFile(file, bytes);
      return SqliteInsightSession.#attach(file, remove);
    } catch (error) {
      await remove();
      throw error;
    }
  }

  static #attach(file: string, cleanup: () => Promise<void>) {
    const source = `akan_insight_${randomBytes(8).toString("hex")}`;
    const db = new Database(":memory:");
    try {
      db.query(`ATTACH DATABASE ? AS ${quoteIdent(source)}`).run(file);
      const relations = db
        .query(`SELECT "name" FROM ${quoteIdent(source)}."sqlite_schema" WHERE "type" IN ('table', 'view')`)
        .all() as { name: string }[];
      for (const { name } of relations) {
        const columns = (
          db.query(`SELECT "name" FROM pragma_table_info(?, ?)`).all(name, source) as { name: string }[]
        ).map((column) => column.name);
        const kept = columns.filter((column) => column.toLowerCase() !== SqliteInsightSession.#documentColumn);
        if (kept.length === columns.length) continue;
        const projection = kept.length ? kept.map(quoteIdent).join(", ") : `NULL AS "hidden"`;
        db.run(
          `CREATE TEMP VIEW ${quoteIdent(name)} AS SELECT ${projection} FROM ${quoteIdent(source)}.${quoteIdent(name)}`,
        );
      }
      db.run("PRAGMA query_only = ON");
    } catch (error) {
      db.close();
      throw error;
    }
    return new SqliteInsightSession(db, source, cleanup);
  }

  async read(statement: string) {
    const lowered = statement.toLowerCase();
    const named = this.#hidden.find((name) => lowered.includes(name));
    if (named) throw new Error(`An insight query cannot name \`${named}\`.`);
    return this.#db.query(statement).all() as Record<string, unknown>[];
  }

  async close() {
    this.#db.close();
    await this.#cleanup();
  }
}
