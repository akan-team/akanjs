import { createDocumentId } from "akanjs/document";
import type { AkanSqlClient, DatabaseAdaptor, SqlDialect } from "akanjs/service";
import type { MigrationChangeLog } from "./migrationChangeLog";
import type { MigrationLedger } from "./migrationLedger";

export interface MigrationScopeOption {
  database: DatabaseAdaptor;
  readOnly: boolean;
  batchSize: number;
  log?: MigrationChangeLog | null;
  /** Set for a run outside one transaction: each `rewrite` batch commits with where it got to. */
  checkpoints?: { runId: string; ledger: MigrationLedger; resumed: Record<string, string> } | null;
}

export class MigrationScope {
  readonly database: DatabaseAdaptor;
  readonly dialect: SqlDialect;
  readonly readOnly: boolean;
  readonly batchSize: number;
  readonly log: MigrationChangeLog | null;
  readonly #checkpoints: MigrationScopeOption["checkpoints"];
  readonly #reached: Record<string, string>;
  #rewrites = 0;

  constructor({ database, readOnly, batchSize, log = null, checkpoints = null }: MigrationScopeOption) {
    if (!database.dialect)
      throw new Error(
        "This database adaptor names no SQL dialect; migrations run on SqliteDatabase or PostgresDatabase",
      );
    this.database = database;
    this.dialect = database.dialect;
    this.readOnly = readOnly;
    this.batchSize = batchSize;
    this.log = log;
    this.#checkpoints = checkpoints;
    this.#reached = { ...checkpoints?.resumed };
  }

  connection(): AkanSqlClient {
    return this.database.getConnection();
  }

  now() {
    return Date.now();
  }

  createId(): string {
    return createDocumentId();
  }

  /** Joins the transaction already open in this context, or opens one around `fn`. */
  async transaction<T>(fn: () => Promise<T>) {
    return await this.database.transaction(fn);
  }

  /** Rewrites are told apart by the order a run calls them in, so a resumed run finds each one's place again. */
  nextRewrite(table: string) {
    const key = `${this.#rewrites++}:${table}`;
    return { key, after: this.#checkpoints ? this.#reached[key] : undefined };
  }

  async reach(key: string, id: string) {
    if (!this.#checkpoints) return;
    this.#reached[key] = id;
    await this.#checkpoints.ledger.saveCheckpoint(this.#checkpoints.runId, this.#reached);
  }
}
