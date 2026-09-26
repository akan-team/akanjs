import type { Database, Statement } from "bun:sqlite";
import { getEnv } from "akanjs/base";
import { adapt } from "../adapt";
import { type AkanJob, type AkanJobOptions, type AkanWorker, sendAkanIpc } from "../ipcTypes";
import type { QueueAdaptor } from "./queue.adaptor";
import { getSolidConfig, openSolidDatabase, type SolidConfig, type SolidEnv } from "./solidSqlite";

type JobRow = {
  id: string;
  name: string;
  payload: string;
  attempts: number;
  maxAttempts: number;
  lockedUntil: number | null;
};

class SolidWorker implements AkanWorker {
  #timer: Timer | null = null;
  #running = false;
  #closed = false;

  constructor(
    private readonly queue: SolidQueue,
    private readonly name: string,
    private readonly handler: (job: AkanJob) => Promise<unknown>,
    pollIntervalMs: number,
  ) {
    this.#timer = setInterval(() => void this.pump(), pollIntervalMs);
    void this.pump();
  }

  wake() {
    void this.pump();
  }

  async pump() {
    if (this.#closed || this.#running) return;
    this.#running = true;
    try {
      while (!this.#closed) {
        const job = this.queue.claimJob(this.name);
        if (!job) return;
        await this.queue.runJob(job, this.handler);
      }
    } finally {
      this.#running = false;
    }
  }

  async close() {
    this.#closed = true;
    if (this.#timer) clearInterval(this.#timer);
    while (this.#running) await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export class SolidQueue
  extends adapt("solidQueue", ({ env }) => ({
    config: env((env: SolidEnv) => getSolidConfig(env)),
    queueName: env(() => {
      const { repoName, appName, environment, operationMode } = getEnv();
      return `queue-${repoName}-${appName}-${environment}-${operationMode}`;
    }),
    workerId: env(() => `${getEnv().appName}-${process.env.AKAN_REPLICA_IDX ?? "0"}-${process.pid}`),
  }))
  implements QueueAdaptor
{
  #db!: Database;
  #workers = new Map<string, SolidWorker>();
  #claimStmt!: Statement;
  #cleanupTimer: Timer | null = null;
  #closed = false;
  readonly #messageHandler = (message: unknown) => {
    if (!message || typeof message !== "object") return;
    if ((message as { type?: string }).type === "queue.wake") this.wake((message as { name?: string }).name);
  };

  override async onInit() {
    this.#db = await openSolidDatabase(this.config as Required<SolidConfig>);
    this.#db.run(
      `CREATE TABLE IF NOT EXISTS "_akan_solid_jobs" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "queue" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "payload" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "priority" INTEGER NOT NULL,
        "runAt" INTEGER NOT NULL,
        "attempts" INTEGER NOT NULL,
        "maxAttempts" INTEGER NOT NULL,
        "lockedBy" TEXT,
        "lockedUntil" INTEGER,
        "lastError" TEXT,
        "createdAt" INTEGER NOT NULL,
        "updatedAt" INTEGER NOT NULL
      )`,
    );
    this.#db.run(
      `CREATE INDEX IF NOT EXISTS "_akan_solid_jobs_claim_idx"
       ON "_akan_solid_jobs" ("queue", "name", "status", "runAt", "priority", "createdAt")`,
    );
    this.#claimStmt = this.#db.query(
      `SELECT "id", "name", "payload", "attempts", "maxAttempts", "lockedUntil"
       FROM "_akan_solid_jobs"
       WHERE "queue" = ?
         AND "name" = ?
         AND "runAt" <= ?
         AND (
          "status" = 'pending'
          OR ("status" = 'running' AND "lockedUntil" IS NOT NULL AND "lockedUntil" <= ?)
         )
       ORDER BY "priority" ASC, "createdAt" ASC
       LIMIT 1`,
    );
    process.on("message", this.#messageHandler);
    this.#cleanupTimer = setInterval(() => this.#startCleanup(), this.config.cleanupIntervalMs);
    this.#startCleanup();
  }

  #startCleanup() {
    void this.#cleanup().catch((error: unknown) => {
      this.logger.warn(`Solid job cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  override async onDestroy() {
    this.#closed = true;
    if (this.#cleanupTimer) clearInterval(this.#cleanupTimer);
    process.off("message", this.#messageHandler);
    await Promise.all([...this.#workers.values()].map((worker) => worker.close()));
    this.#db?.run("PRAGMA wal_checkpoint(TRUNCATE)");
    this.#db?.close();
  }

  registerProcessWorker(key: string, handler: (job: AkanJob) => Promise<unknown>): AkanWorker {
    const worker = new SolidWorker(this, key, handler, this.config.queuePollIntervalMs);
    this.#workers.set(key, worker);
    return worker;
  }

  async registerProcessQueue(key: string, args: unknown[], jobOptions: AkanJobOptions = {}): Promise<AkanJob> {
    const now = Date.now();
    const id = Bun.randomUUIDv7();
    const runAt = now + Number(jobOptions.delay ?? 0);
    const maxAttempts = Math.max(1, Number(jobOptions.attempts ?? 1));
    const payload = JSON.stringify({ args, opts: jobOptions });
    this.#db
      .query(
        `INSERT INTO "_akan_solid_jobs" ("id", "queue", "name", "payload", "status", "priority", "runAt", "attempts", "maxAttempts", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, 'pending', ?, ?, 0, ?, ?, ?)`,
      )
      .run(id, this.queueName, key, payload, Number(jobOptions.priority ?? 0), runAt, maxAttempts, now, now);
    sendAkanIpc({ type: "queue.enqueued", queue: this.queueName, name: key, jobId: id });
    this.wake(key);
    return { id, name: key, data: args, attemptsMade: 0, opts: jobOptions };
  }

  wake(name?: string) {
    if (name) this.#workers.get(name)?.wake();
    else for (const worker of this.#workers.values()) worker.wake();
  }

  claimJob(name: string): AkanJob | null {
    const now = Date.now();
    this.#db.run("BEGIN IMMEDIATE");
    try {
      const row = this.#claimStmt.get(this.queueName, name, now, now) as JobRow | null;
      if (!row) {
        this.#db.run("COMMIT");
        return null;
      }
      const payload = JSON.parse(row.payload) as { args: unknown[]; opts?: AkanJobOptions };
      this.#db
        .query(
          `UPDATE "_akan_solid_jobs"
           SET "status" = 'running', "attempts" = "attempts" + 1, "lockedBy" = ?, "lockedUntil" = ?, "updatedAt" = ?
           WHERE "id" = ?`,
        )
        .run(this.workerId, now + this.config.queueLeaseMs, now, row.id);
      this.#db.run("COMMIT");
      return { id: row.id, name: row.name, data: payload.args, attemptsMade: row.attempts + 1, opts: payload.opts };
    } catch (error) {
      this.#db.run("ROLLBACK");
      throw error;
    }
  }

  async runJob(job: AkanJob, handler: (job: AkanJob) => Promise<unknown>) {
    try {
      await handler({ ...job, data: job.data });
      this.#settle(job, "completed", job.opts?.removeOnComplete ?? true);
    } catch (error) {
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
      const row = this.#db
        .query(`SELECT "attempts", "maxAttempts" FROM "_akan_solid_jobs" WHERE "id" = ?`)
        .get(job.id) as { attempts: number; maxAttempts: number } | null;
      const failed = !row || row.attempts >= row.maxAttempts;
      const delay = this.#getBackoffDelay(job.opts?.backoff, row?.attempts ?? 1);
      this.#db
        .query(
          `UPDATE "_akan_solid_jobs"
           SET "status" = ?, "runAt" = ?, "lockedBy" = NULL, "lockedUntil" = NULL, "lastError" = ?, "updatedAt" = ?
           WHERE "id" = ?`,
        )
        .run(failed ? "failed" : "pending", Date.now() + delay, message, Date.now(), job.id);
      if (!failed) return;
      this.logger.error(`Solid job failed ${job.name}/${job.id}: ${message}`);
      this.#settle(job, "failed", job.opts?.removeOnFail ?? false);
    }
  }

  // `removeOnComplete`/`removeOnFail` read the way bullmq reads them: `true` drops the row, a number keeps that many of
  // the newest, `false` keeps it.
  #settle(job: AkanJob, status: "completed" | "failed", remove: boolean | number) {
    if (remove === true) {
      this.#db.query(`DELETE FROM "_akan_solid_jobs" WHERE "id" = ?`).run(job.id);
      return;
    }
    if (status === "completed")
      this.#db
        .query(
          `UPDATE "_akan_solid_jobs" SET "status" = 'completed', "lockedBy" = NULL, "lockedUntil" = NULL, "updatedAt" = ? WHERE "id" = ?`,
        )
        .run(Date.now(), job.id);
    if (typeof remove !== "number") return;
    this.#db
      .query(
        `DELETE FROM "_akan_solid_jobs" WHERE "id" IN (
           SELECT "id" FROM "_akan_solid_jobs" WHERE "queue" = ? AND "name" = ? AND "status" = ?
           ORDER BY "updatedAt" DESC LIMIT -1 OFFSET ?
         )`,
      )
      .run(this.queueName, job.name, status, Math.max(0, Math.floor(remove)));
  }

  /**
   * Rows written before completed jobs were dropped on completion, and failed rows past their retention. Batched and
   * yielding, because a queue that ran for months before this existed can hold millions of completed rows and
   * bun:sqlite deletes synchronously.
   */
  async #cleanup() {
    const expiredFailedAt = Date.now() - this.config.queueFailedRetentionMs;
    for (let batch = 0; batch < 10 && !this.#closed; batch++) {
      const { changes } = this.#db
        .query(
          `DELETE FROM "_akan_solid_jobs" WHERE rowid IN (
             SELECT rowid FROM "_akan_solid_jobs"
             WHERE ("status" = 'completed' AND COALESCE(json_type("payload", '$.opts.removeOnComplete'), 'true') = 'true')
                OR ("status" = 'failed' AND "updatedAt" < ? AND COALESCE(json_type("payload", '$.opts.removeOnFail'), 'null') <> 'false')
             LIMIT 1000
           )`,
        )
        .run(expiredFailedAt);
      if (changes < 1000) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // bullmq's own schedule, so a job retries at the same times whichever queue runs it.
  #getBackoffDelay(backoff: AkanJobOptions["backoff"], attemptsMade: number) {
    if (!backoff) return 0;
    if (typeof backoff === "number") return backoff;
    const delay = Number(backoff.delay ?? 0);
    return backoff.type === "exponential" ? Math.round(2 ** (attemptsMade - 1) * delay) : delay;
  }
}
