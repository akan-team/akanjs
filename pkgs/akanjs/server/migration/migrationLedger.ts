import { type AkanSqlClient, MigrationTables } from "akanjs/service";
import { MigrationChangeLog } from "./migrationChangeLog";
import { MigrationError } from "./migrationError";

export type MigrationRunKind = "plan" | "apply" | "verify" | "rollback";
/** `aborted` is a refusal before any write: the plan no longer hashed to what was approved. */
export type MigrationRunStatus = "running" | "done" | "failed" | "aborted";

export interface MigrationRun {
  id: string;
  migrationId: string;
  kind: MigrationRunKind;
  status: MigrationRunStatus;
  /** The apply run a rollback undoes. */
  target: string | null;
  checksum: string;
  buildId: string | null;
  params: Record<string, unknown> | null;
  planHash: string | null;
  summary: Record<string, unknown> | null;
  actor: string | null;
  checkpoint: Record<string, string> | null;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
}

export interface MigrationState {
  /** The last apply that finished and was not rolled back. */
  applied: MigrationRun | null;
  /** Applies that failed after committing some of their writes, newest first; a rollback undoes them too. */
  partial: MigrationRun[];
}

type MigrationRunRow = Omit<MigrationRun, "params" | "summary" | "checkpoint" | "startedAt" | "finishedAt"> & {
  params: string | null;
  summary: string | null;
  checkpoint: string | null;
  startedAt: number | string;
  finishedAt: number | string | null;
};

export class MigrationLedger {
  static readonly #columns = MigrationTables.ledger[0]?.columns ?? [];
  readonly #connection: () => AkanSqlClient;

  constructor(connection: () => AkanSqlClient) {
    this.#connection = connection;
  }

  async insert(run: MigrationRun) {
    const values = MigrationLedger.#toRow(run);
    await this.#connection()
      .prepare(
        `INSERT INTO "${MigrationTables.run}" (${MigrationLedger.#columns.map((column) => `"${column}"`).join(", ")}) VALUES (${MigrationLedger.#columns.map(() => "?").join(", ")})`,
      )
      .run(...MigrationLedger.#columns.map((column) => values[column as keyof MigrationRunRow] ?? null));
    return run;
  }

  async finish(
    id: string,
    {
      status,
      planHash = null,
      summary = null,
      error = null,
    }: {
      status: MigrationRunStatus;
      planHash?: string | null;
      summary?: Record<string, unknown> | null;
      error?: string | null;
    },
  ) {
    await this.#connection()
      .prepare(
        `UPDATE "${MigrationTables.run}" SET "status" = ?, "planHash" = COALESCE(?, "planHash"), "summary" = ?, "error" = ?, "finishedAt" = ? WHERE "id" = ?`,
      )
      .run(status, planHash, summary ? JSON.stringify(summary) : null, error, Date.now(), id);
  }

  /** Only while the run is still `running`: one another holder interrupted is never recorded done after all. */
  async complete(
    id: string,
    { planHash = null, summary }: { planHash?: string | null; summary: Record<string, unknown> },
  ) {
    const completed = await this.#connection()
      .prepare(
        `UPDATE "${MigrationTables.run}" SET "status" = 'done', "planHash" = COALESCE(?, "planHash"), "summary" = ?, "finishedAt" = ? WHERE "id" = ? AND "status" = 'running' RETURNING "id"`,
      )
      .get<{ id: string }>(planHash, JSON.stringify(summary), Date.now(), id);
    if (!completed)
      throw new MigrationError("locked", `Another migration run interrupted run ${id}, so it is not recorded done`);
  }

  async saveCheckpoint(id: string, checkpoint: Record<string, string>) {
    await this.#connection()
      .prepare(`UPDATE "${MigrationTables.run}" SET "checkpoint" = ? WHERE "id" = ?`)
      .run(JSON.stringify(checkpoint), id);
  }

  async get(id: string) {
    const row = await this.#connection()
      .prepare(`SELECT * FROM "${MigrationTables.run}" WHERE "id" = ?`)
      .get<MigrationRunRow>(id);
    return row ? MigrationLedger.#fromRow(row) : null;
  }

  /** Oldest first. */
  async runsOf(migrationId?: string) {
    const rows = await this.#connection()
      .prepare(
        `SELECT * FROM "${MigrationTables.run}"${migrationId ? ` WHERE "migrationId" = ?` : ""} ORDER BY "startedAt", "id"`,
      )
      .all<MigrationRunRow>(...(migrationId ? [migrationId] : []));
    return rows.map(MigrationLedger.#fromRow);
  }

  /** Only the lock holder calls this, so a run still `running` belongs to a process that died holding the lock. */
  async interruptRunning() {
    await this.#connection()
      .prepare(
        `UPDATE "${MigrationTables.run}" SET "status" = 'failed', "error" = 'interrupted', "finishedAt" = ? WHERE "status" = 'running'`,
      )
      .run(Date.now());
  }

  async state(runs: MigrationRun[]): Promise<MigrationState> {
    const reverted = new Set(
      runs.filter((run) => run.kind === "rollback" && run.status === "done").map((run) => run.target),
    );
    const live = runs.filter((run) => run.kind === "apply" && !reverted.has(run.id)).reverse();
    const failed = live.filter((run) => run.status === "failed");
    const changed = await Promise.all(
      failed.map(async (run) => (await MigrationChangeLog.count(this.#connection(), run.id)) > 0),
    );
    return {
      applied: live.find((run) => run.status === "done") ?? null,
      partial: failed.filter((_, idx) => changed[idx]),
    };
  }

  static #toRow(run: MigrationRun): Partial<MigrationRunRow> {
    return {
      ...run,
      params: run.params ? JSON.stringify(run.params) : null,
      summary: run.summary ? JSON.stringify(run.summary) : null,
      checkpoint: run.checkpoint ? JSON.stringify(run.checkpoint) : null,
    };
  }

  static #fromRow(row: MigrationRunRow): MigrationRun {
    const json = <T>(text: string | null) => (text ? (JSON.parse(text) as T) : null);
    return {
      id: row.id,
      migrationId: row.migrationId,
      kind: row.kind,
      status: row.status,
      target: row.target ?? null,
      checksum: row.checksum,
      buildId: row.buildId ?? null,
      params: json<Record<string, unknown>>(row.params),
      planHash: row.planHash ?? null,
      summary: json<Record<string, unknown>>(row.summary),
      actor: row.actor ?? null,
      checkpoint: json<Record<string, string>>(row.checkpoint),
      startedAt: Number(row.startedAt),
      finishedAt: row.finishedAt === null ? null : Number(row.finishedAt),
      error: row.error ?? null,
    };
  }
}
