import type { AkanSqlClient } from "akanjs/service";

/**
 * One run at a time across every replica and channel: a lease in `_akan_meta` whose value is the epoch ms it was last
 * renewed at. A holder that dies is replaced once the lease is `ttlMs` old; a live one renews well inside that.
 */
export class MigrationLock {
  static readonly key = "migration:lock";
  static readonly ttlMs = 60_000;
  static readonly renewMs = 15_000;
  readonly #connection: () => AkanSqlClient;
  #token: string | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #renewing: Promise<void> = Promise.resolve();

  constructor(connection: () => AkanSqlClient) {
    this.#connection = connection;
  }

  /**
   * Call outside any transaction: the renewal timer keeps the context it was created in, and renewing inside the run's
   * own transaction would publish nothing until that commits.
   */
  async acquire() {
    const now = Date.now();
    const token = String(now);
    const claimed = await this.#connection()
      .prepare(
        `INSERT INTO "_akan_meta" ("key", "value", "updatedAt") VALUES (?, ?, ?)
         ON CONFLICT("key") DO UPDATE SET "value" = ?, "updatedAt" = ?
         WHERE CAST("_akan_meta"."value" AS BIGINT) < ?
         RETURNING "value"`,
      )
      .get<{ value: string }>(MigrationLock.key, token, now, token, now, now - MigrationLock.ttlMs);
    if (!claimed) return false;
    this.#token = token;
    this.#timer = setInterval(() => {
      this.#renewing = this.#renewing.then(async () => await this.#renew());
    }, MigrationLock.renewMs);
    this.#timer.unref?.();
    return true;
  }

  // A renewal in flight would leave its new token behind the delete, holding the lease for a whole TTL.
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
    if (!held) return;
    const now = Date.now();
    const token = String(now);
    try {
      const renewed = await this.#connection()
        .prepare(
          `UPDATE "_akan_meta" SET "value" = ?, "updatedAt" = ? WHERE "key" = ? AND "value" = ? RETURNING "value"`,
        )
        .get<{ value: string }>(token, now, MigrationLock.key, held);
      if (renewed) this.#token = token;
    } catch {
      // A missed renewal is retried on the next tick; the lease outlives three of them.
    }
  }
}
