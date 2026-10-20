import type { AkanSqlClient } from "akanjs/service";
import { MigrationError } from "./migrationError";

/**
 * One run at a time across every replica and channel: a lease in `_akan_meta` holding its holder's token, `updatedAt`
 * the epoch ms it was last renewed at. A holder that dies is replaced once the lease is `ttlMs` old; a live one renews
 * well inside that, and every renewal names its token, so a holder that was replaced finds out on its next one.
 */
export class MigrationLock {
  static readonly key = "migration:lock";
  static readonly ttlMs = 60_000;
  static readonly renewMs = 15_000;
  readonly #connection: () => AkanSqlClient;
  readonly #inBand: boolean;
  #token: string | null = null;
  #autocommit: AkanSqlClient | null = null;
  #renewedAt = 0;
  #lost: boolean = false;
  #timer: ReturnType<typeof setInterval> | null = null;
  #renewing: Promise<void> = Promise.resolve();

  /**
   * `inBand` for SQLite: bun:sqlite runs each statement synchronously, so a run never lets the renewal timer fire, and
   * a renewal inside the run's transaction is safe, as that transaction keeps every other process off the lease.
   */
  constructor(connection: () => AkanSqlClient, { inBand = false }: { inBand?: boolean } = {}) {
    this.#connection = connection;
    this.#inBand = inBand;
  }

  /**
   * Call outside any transaction: the renewal timer keeps the context it was created in, and a beat renews only on the
   * connection this acquires on.
   */
  async acquire() {
    const now = Date.now();
    const token = crypto.randomUUID();
    const connection = this.#connection();
    let claimed: { value: string } | null;
    try {
      claimed = await connection
        .prepare(
          `INSERT INTO "_akan_meta" ("key", "value", "updatedAt") VALUES (?, ?, ?)
           ON CONFLICT("key") DO UPDATE SET "value" = ?, "updatedAt" = ?
           WHERE "_akan_meta"."updatedAt" < ?
           RETURNING "value"`,
        )
        .get<{ value: string }>(MigrationLock.key, token, now, token, now, now - MigrationLock.ttlMs);
    } catch (error) {
      //* SQLite: another process's transaction kept the write lock past busy_timeout, as a running apply does.
      if (/^SQLITE_BUSY/.test(String((error as { code?: unknown } | null)?.code ?? ""))) return false;
      throw error;
    }
    if (!claimed) return false;
    this.#token = token;
    this.#autocommit = connection;
    this.#renewedAt = now;
    this.#timer = setInterval(() => {
      this.#renewing = this.#renewing.then(async () => await this.#renew());
    }, MigrationLock.renewMs);
    this.#timer.unref?.();
    return true;
  }

  /**
   * Throws once another run has taken the lease over. Renews when due, or at once with `force`, so a run that stalled
   * past the TTL finds out before its next write. Off SQLite it leaves renewing to the timer inside any transaction,
   * whose connection is not the one it acquired on: a renewal there publishes nothing until that commits, holds the
   * row the timer renews, and under repeatable read fails the whole transaction once the timer has renewed.
   */
  async heartbeat({ force = false }: { force?: boolean } = {}) {
    const due = force || Date.now() - this.#renewedAt >= MigrationLock.renewMs;
    if (due && (this.#inBand || this.#connection() === this.#autocommit)) await this.#renew();
    if (this.#lost)
      throw new MigrationError("locked", "Another migration run took the lock over while this one ran, so it stopped");
  }

  // A renewal in flight would land after the delete and hold the lease for a whole TTL.
  async release() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    await this.#renewing;
    const held = this.#token;
    this.#token = null;
    if (!held) return;
    await this.#connection()
      .prepare(`DELETE FROM "_akan_meta" WHERE "key" = ? AND "value" = ?`)
      .run(MigrationLock.key, held);
  }

  async #renew() {
    const held = this.#token;
    if (!held || this.#lost) return;
    const now = Date.now();
    try {
      const renewed = await this.#connection()
        .prepare(`UPDATE "_akan_meta" SET "updatedAt" = ? WHERE "key" = ? AND "value" = ? RETURNING "value"`)
        .get<{ value: string }>(now, MigrationLock.key, held);
      if (renewed) this.#renewedAt = now;
      else this.#lost = true;
    } catch {
      // A missed renewal is retried on the next beat or tick; the lease outlives three of them.
    }
  }
}
