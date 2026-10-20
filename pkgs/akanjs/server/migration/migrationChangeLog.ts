import { type AkanSqlClient, MigrationTables } from "akanjs/service";
import type { DocSlot } from "./docPath";

/** `delete` is written by a rollback alone, removing a row an apply inserted. */
export type MigrationChangeOp = "update" | "insert" | "delete";

/**
 * One row write. `before` and `after` map each changed `_doc` path to its slot; `$removedAt` is the row's removal time
 * and `$doc` a whole `_doc` an insert or delete wrote or took away.
 */
export interface MigrationChange {
  runId: string;
  seq: number;
  table: string;
  id: string;
  op: MigrationChangeOp;
  before: Record<string, DocSlot>;
  after: Record<string, DocSlot>;
}

interface MigrationChangeRow {
  runId: string;
  seq: number | string;
  tableName: string;
  docId: string;
  op: MigrationChangeOp;
  before: string;
  after: string;
}

export class MigrationChangeLog {
  readonly runId: string;
  readonly #connection: () => AkanSqlClient;
  #seq = 0;

  constructor(runId: string, connection: () => AkanSqlClient) {
    this.runId = runId;
    this.#connection = connection;
  }

  /** Written on the caller's connection, so inside its transaction the entry commits or rolls back with the row. */
  async append(change: Omit<MigrationChange, "runId" | "seq">) {
    const seq = this.#seq + 1;
    await this.#connection()
      .prepare(
        `INSERT INTO "${MigrationTables.change}" ("runId", "seq", "tableName", "docId", "op", "before", "after") VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        this.runId,
        seq,
        change.table,
        change.id,
        change.op,
        JSON.stringify(change.before),
        JSON.stringify(change.after),
      );
    this.#seq = seq;
  }

  static async count(connection: AkanSqlClient, runId: string) {
    const row = await connection
      .prepare(`SELECT COUNT(*) AS "count" FROM "${MigrationTables.change}" WHERE "runId" = ?`)
      .get<{ count: number | string }>(runId);
    return Number(row?.count ?? 0);
  }

  /** Newest first, the order a rollback undoes them in: up to `limit` changes, from the newest or under seq `below`. */
  static async page(connection: AkanSqlClient, runId: string, below: number | null, limit: number) {
    const rows = await connection
      .prepare(
        `SELECT "runId", "seq", "tableName", "docId", "op", "before", "after" FROM "${MigrationTables.change}" WHERE "runId" = ?${below === null ? "" : ` AND "seq" < ?`} ORDER BY "seq" DESC LIMIT ${Math.trunc(limit)}`,
      )
      .all<MigrationChangeRow>(...(below === null ? [runId] : [runId, below]));
    return rows.map(
      (row): MigrationChange => ({
        runId: row.runId,
        seq: Number(row.seq),
        table: row.tableName,
        id: row.docId,
        op: row.op,
        before: JSON.parse(row.before) as Record<string, DocSlot>,
        after: JSON.parse(row.after) as Record<string, DocSlot>,
      }),
    );
  }
}
