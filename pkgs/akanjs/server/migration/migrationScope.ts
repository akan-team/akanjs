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
  /** Called at every table call, so a run keeps its lease however long it holds the event loop. */
  beat?: () => Promise<void>;
}

export class MigrationScope {
  readonly database: DatabaseAdaptor;
  readonly dialect: SqlDialect;
  readonly readOnly: boolean;
  readonly batchSize: number;
  readonly log: MigrationChangeLog | null;
  readonly #checkpoints: MigrationScopeOption["checkpoints"];
  readonly #reached: Record<string, string>;
  readonly #rewrites = new Map<string, number>();
  readonly #beat: () => Promise<void>;

  constructor({
    database,
    readOnly,
    batchSize,
    log = null,
    checkpoints = null,
    beat = async () => undefined,
  }: MigrationScopeOption) {
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
    this.#beat = beat;
  }

  static assertBatchSize(batchSize: number) {
    if (!Number.isInteger(batchSize) || batchSize < 1)
      throw new Error(`batchSize takes a whole number of rows above 0, not ${batchSize}`);
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

  async beat() {
    await this.#beat();
  }

  /** Joins the transaction already open in this context, or opens one around `fn`. */
  async transaction<T>(fn: () => Promise<T>) {
    return await this.database.transaction(fn);
  }

  /**
   * A rewrite is told apart by its table and `signature`, so a resumed run finds each one's place again even when it
   * skips a rewrite the first attempt made; only identical rewrites fall back on the order they are called in.
   */
  nextRewrite(table: string, signature: string) {
    const base = `${table}:${signature}`;
    const occurrence = this.#rewrites.get(base) ?? 0;
    this.#rewrites.set(base, occurrence + 1);
    const key = `${base}:${occurrence}`;
    return { key, after: this.#checkpoints ? this.#reached[key] : undefined };
  }

  async reach(key: string, id: string) {
    if (!this.#checkpoints) return;
    this.#reached[key] = id;
    await this.#checkpoints.ledger.saveCheckpoint(this.#checkpoints.runId, this.#reached);
  }
}
