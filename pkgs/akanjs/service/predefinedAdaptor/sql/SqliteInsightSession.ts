import { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MigrationTables } from "./MigrationTables";
import type { InsightSession } from "./types";
import { quoteIdent } from "./values";

/**
 * Attached to a fresh in-memory connection under a random schema, every `_doc` table shadowed by a TEMP view omitting
 * it: bun:sqlite has no authorizer, and no text check can hold since SQLite reads `'admin'.'_doc'` as the column.
 * `query_only` refuses every write, whatever the text.
 */
export class SqliteInsightSession implements InsightSession {
  // Refused by name, as a schema argument can be computed: raw pages and ANALYZE's STAT4 index samples.
  static readonly #unnameable = ["sqlite_dbpage", "sqlite_stat3", "sqlite_stat4"];
  // The migration ledger keeps every document a run rewrote as it was and became, and the params it was run with.
  static readonly #ledger = [MigrationTables.run, MigrationTables.change];
  static readonly #documentColumn = "_doc";

  readonly #db: Database;
  readonly #hidden: string[];
  readonly #cleanup: () => Promise<void>;

  private constructor(db: Database, source: string, cleanup: () => Promise<void>) {
    this.#db = db;
    this.#hidden = [source, ...SqliteInsightSession.#unnameable, ...SqliteInsightSession.#ledger];
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
