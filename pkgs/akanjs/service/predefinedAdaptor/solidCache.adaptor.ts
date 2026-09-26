import type { Database } from "bun:sqlite";
import { adapt } from "../adapt";
import type { CacheAdaptor, CacheSetOptions, CacheValue } from "./cache.adaptor";
import {
  decodeSolidValue,
  encodeSolidValue,
  getSolidConfig,
  openSolidDatabase,
  type SolidConfig,
  type SolidEnv,
  type SolidValueType,
  toEpochMs,
} from "./solidSqlite";

type CacheRow = { value: string | Buffer | null; valueType: SolidValueType; expiresAt: number | null };
type CacheEntryRow = CacheRow & { subKey: string };

export class SolidCache
  extends adapt("solidCache", ({ env }) => ({
    config: env((env: SolidEnv) => getSolidConfig(env)),
  }))
  implements CacheAdaptor
{
  #db!: Database;
  #cleanupTimer: Timer | null = null;

  override async onInit() {
    this.#db = await openSolidDatabase(this.config as Required<SolidConfig>);
    this.#db.run(
      `CREATE TABLE IF NOT EXISTS "_akan_solid_cache" (
        "topic" TEXT NOT NULL,
        "key" TEXT NOT NULL,
        "value" BLOB NOT NULL,
        "valueType" TEXT NOT NULL,
        "expiresAt" INTEGER,
        "createdAt" INTEGER NOT NULL,
        "updatedAt" INTEGER NOT NULL,
        PRIMARY KEY ("topic", "key")
      )`,
    );
    this.#db.run(
      `CREATE TABLE IF NOT EXISTS "_akan_solid_cache_hash" (
        "topic" TEXT NOT NULL,
        "key" TEXT NOT NULL,
        "subKey" TEXT NOT NULL,
        "value" BLOB NOT NULL,
        "valueType" TEXT NOT NULL,
        "expiresAt" INTEGER,
        "createdAt" INTEGER NOT NULL,
        "updatedAt" INTEGER NOT NULL,
        PRIMARY KEY ("topic", "key", "subKey")
      )`,
    );
    this.#cleanupTimer = setInterval(() => this.#cleanup(), this.config.cleanupIntervalMs);
    this.#cleanup();
  }

  override async onDestroy() {
    if (this.#cleanupTimer) clearInterval(this.#cleanupTimer);
    this.#db?.run("PRAGMA wal_checkpoint(TRUNCATE)");
    this.#db?.close();
  }

  async set(topic: string, key: string, value: CacheValue, option: CacheSetOptions = {}) {
    const encoded = encodeSolidValue(value);
    const now = Date.now();
    this.#db
      .query(
        `INSERT INTO "_akan_solid_cache" ("topic", "key", "value", "valueType", "expiresAt", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT("topic", "key") DO UPDATE SET
          "value" = excluded."value",
          "valueType" = excluded."valueType",
          "expiresAt" = excluded."expiresAt",
          "updatedAt" = excluded."updatedAt"`,
      )
      .run(topic, key, encoded.value, encoded.type, toEpochMs(option.expireAt), now, now);
  }

  async get<T extends CacheValue = CacheValue>(topic: string, key: string): Promise<T | undefined> {
    const row = this.#db
      .query(`SELECT "value", "valueType", "expiresAt" FROM "_akan_solid_cache" WHERE "topic" = ? AND "key" = ?`)
      .get(topic, key) as CacheRow | null;
    if (!row) return undefined;
    if (row.expiresAt !== null && row.expiresAt <= Date.now()) {
      await this.delete(topic, key);
      return undefined;
    }
    return decodeSolidValue<T>(row.valueType, row.value);
  }

  async delete(topic: string, key: string) {
    this.#db.query(`DELETE FROM "_akan_solid_cache" WHERE "topic" = ? AND "key" = ?`).run(topic, key);
  }

  async getDel<T extends CacheValue = CacheValue>(topic: string, key: string): Promise<T | undefined> {
    const row = this.#db
      .query(
        `DELETE FROM "_akan_solid_cache" WHERE "topic" = ? AND "key" = ? RETURNING "value", "valueType", "expiresAt"`,
      )
      .get(topic, key) as CacheRow | null;
    if (!row || (row.expiresAt !== null && row.expiresAt <= Date.now())) return undefined;
    return decodeSolidValue<T>(row.valueType, row.value);
  }

  async setIfAbsent(topic: string, key: string, value: CacheValue, option: CacheSetOptions = {}) {
    const encoded = encodeSolidValue(value);
    const now = Date.now();
    const { changes } = this.#db
      .query(
        `INSERT INTO "_akan_solid_cache" ("topic", "key", "value", "valueType", "expiresAt", "createdAt", "updatedAt")
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT("topic", "key") DO UPDATE SET
          "value" = excluded."value",
          "valueType" = excluded."valueType",
          "expiresAt" = excluded."expiresAt",
          "createdAt" = excluded."createdAt",
          "updatedAt" = excluded."updatedAt"
         WHERE "expiresAt" IS NOT NULL AND "expiresAt" <= ?6`,
      )
      .run(topic, key, encoded.value, encoded.type, toEpochMs(option.expireAt), now);
    return changes > 0;
  }

  async incr(topic: string, key: string, by = 1, option: CacheSetOptions = {}) {
    const now = Date.now();
    const live = `"expiresAt" IS NULL OR "expiresAt" > ?5`;
    const row = this.#db
      .query(
        `INSERT INTO "_akan_solid_cache" ("topic", "key", "value", "valueType", "expiresAt", "createdAt", "updatedAt")
         VALUES (?1, ?2, CAST(?3 AS TEXT), 'number', ?4, ?5, ?5)
         ON CONFLICT("topic", "key") DO UPDATE SET
          "value" = CASE WHEN ${live} THEN CAST(CAST("value" AS TEXT) + ?3 AS TEXT) ELSE excluded."value" END,
          "valueType" = 'number',
          "expiresAt" = CASE WHEN ${live} THEN "expiresAt" ELSE excluded."expiresAt" END,
          "updatedAt" = ?5
         RETURNING "value"`,
      )
      .get(topic, key, by, toEpochMs(option.expireAt), now) as { value: string } | null;
    return Number(row?.value);
  }

  async acquireLease(topic: string, key: string, owner: string, ttlMs: number) {
    const now = Date.now();
    const { changes } = this.#db
      .query(
        `INSERT INTO "_akan_solid_cache" ("topic", "key", "value", "valueType", "expiresAt", "createdAt", "updatedAt")
         VALUES (?1, ?2, ?3, 'string', ?4, ?5, ?5)
         ON CONFLICT("topic", "key") DO UPDATE SET
          "value" = excluded."value",
          "valueType" = 'string',
          "expiresAt" = excluded."expiresAt",
          "updatedAt" = excluded."updatedAt"
         WHERE "value" = excluded."value" OR ("expiresAt" IS NOT NULL AND "expiresAt" <= ?5)`,
      )
      .run(topic, key, owner, now + ttlMs, now);
    return changes > 0;
  }

  async renewLease(topic: string, key: string, owner: string, ttlMs: number) {
    const now = Date.now();
    const { changes } = this.#db
      .query(
        `UPDATE "_akan_solid_cache" SET "expiresAt" = ?1, "updatedAt" = ?2
         WHERE "topic" = ?3 AND "key" = ?4 AND "value" = ?5 AND ("expiresAt" IS NULL OR "expiresAt" > ?2)`,
      )
      .run(now + ttlMs, now, topic, key, owner);
    return changes > 0;
  }

  async releaseLease(topic: string, key: string, owner: string) {
    this.#db
      .query(`DELETE FROM "_akan_solid_cache" WHERE "topic" = ? AND "key" = ? AND "value" = ?`)
      .run(topic, key, owner);
  }

  async hset(topic: string, key: string, subKey: string, value: CacheValue, option: CacheSetOptions = {}) {
    const encoded = encodeSolidValue(value);
    const now = Date.now();
    this.#db
      .query(
        `INSERT INTO "_akan_solid_cache_hash" ("topic", "key", "subKey", "value", "valueType", "expiresAt", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT("topic", "key", "subKey") DO UPDATE SET
          "value" = excluded."value",
          "valueType" = excluded."valueType",
          "expiresAt" = excluded."expiresAt",
          "updatedAt" = excluded."updatedAt"`,
      )
      .run(topic, key, subKey, encoded.value, encoded.type, toEpochMs(option.expireAt), now, now);
  }

  async hget<T extends CacheValue = CacheValue>(topic: string, key: string, subKey: string): Promise<T | undefined> {
    const row = this.#db
      .query(
        `SELECT "value", "valueType", "expiresAt" FROM "_akan_solid_cache_hash" WHERE "topic" = ? AND "key" = ? AND "subKey" = ?`,
      )
      .get(topic, key, subKey) as CacheRow | null;
    if (!row) return undefined;
    if (row.expiresAt !== null && row.expiresAt <= Date.now()) {
      await this.hdelete(topic, key, subKey);
      return undefined;
    }
    return decodeSolidValue<T>(row.valueType, row.value);
  }

  async hdelete(topic: string, key: string, subKey: string): Promise<void> {
    this.#db
      .query(`DELETE FROM "_akan_solid_cache_hash" WHERE "topic" = ? AND "key" = ? AND "subKey" = ?`)
      .run(topic, key, subKey);
  }

  async hkeys(topic: string, key: string): Promise<string[]> {
    this.#cleanup();
    const rows = this.#db
      .query(`SELECT "subKey" FROM "_akan_solid_cache_hash" WHERE "topic" = ? AND "key" = ? ORDER BY "subKey" ASC`)
      .all(topic, key) as { subKey: string }[];
    return rows.map((row) => row.subKey);
  }

  async hentries<T extends CacheValue = CacheValue>(topic: string, key: string): Promise<[string, T][]> {
    this.#cleanup();
    const rows = this.#db
      .query(
        `SELECT "subKey", "value", "valueType", "expiresAt" FROM "_akan_solid_cache_hash" WHERE "topic" = ? AND "key" = ? ORDER BY "subKey" ASC`,
      )
      .all(topic, key) as CacheEntryRow[];
    return rows.map((row) => [row.subKey, decodeSolidValue<T>(row.valueType, row.value) as T]);
  }

  async hclear(topic: string, key: string): Promise<void> {
    this.#db.query(`DELETE FROM "_akan_solid_cache_hash" WHERE "topic" = ? AND "key" = ?`).run(topic, key);
  }

  async hgetDel<T extends CacheValue = CacheValue>(topic: string, key: string, subKey: string): Promise<T | undefined> {
    const row = this.#db
      .query(
        `DELETE FROM "_akan_solid_cache_hash" WHERE "topic" = ? AND "key" = ? AND "subKey" = ?
         RETURNING "value", "valueType", "expiresAt"`,
      )
      .get(topic, key, subKey) as CacheRow | null;
    if (!row || (row.expiresAt !== null && row.expiresAt <= Date.now())) return undefined;
    return decodeSolidValue<T>(row.valueType, row.value);
  }

  async hsetIfAbsent(topic: string, key: string, subKey: string, value: CacheValue, option: CacheSetOptions = {}) {
    const encoded = encodeSolidValue(value);
    const now = Date.now();
    const { changes } = this.#db
      .query(
        `INSERT INTO "_akan_solid_cache_hash" ("topic", "key", "subKey", "value", "valueType", "expiresAt", "createdAt", "updatedAt")
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT("topic", "key", "subKey") DO UPDATE SET
          "value" = excluded."value",
          "valueType" = excluded."valueType",
          "expiresAt" = excluded."expiresAt",
          "createdAt" = excluded."createdAt",
          "updatedAt" = excluded."updatedAt"
         WHERE "expiresAt" IS NOT NULL AND "expiresAt" <= ?7`,
      )
      .run(topic, key, subKey, encoded.value, encoded.type, toEpochMs(option.expireAt), now);
    return changes > 0;
  }

  async hincr(topic: string, key: string, subKey: string, by = 1, option: CacheSetOptions = {}) {
    const now = Date.now();
    const live = `"expiresAt" IS NULL OR "expiresAt" > ?6`;
    const row = this.#db
      .query(
        `INSERT INTO "_akan_solid_cache_hash" ("topic", "key", "subKey", "value", "valueType", "expiresAt", "createdAt", "updatedAt")
         VALUES (?1, ?2, ?3, CAST(?4 AS TEXT), 'number', ?5, ?6, ?6)
         ON CONFLICT("topic", "key", "subKey") DO UPDATE SET
          "value" = CASE WHEN ${live} THEN CAST(CAST("value" AS TEXT) + ?4 AS TEXT) ELSE excluded."value" END,
          "valueType" = 'number',
          "expiresAt" = CASE WHEN ${live} THEN "expiresAt" ELSE excluded."expiresAt" END,
          "updatedAt" = ?6
         RETURNING "value"`,
      )
      .get(topic, key, subKey, by, toEpochMs(option.expireAt), now) as { value: string } | null;
    return Number(row?.value);
  }

  #cleanup() {
    const now = Date.now();
    this.#db.query(`DELETE FROM "_akan_solid_cache" WHERE "expiresAt" IS NOT NULL AND "expiresAt" <= ?`).run(now);
    this.#db.query(`DELETE FROM "_akan_solid_cache_hash" WHERE "expiresAt" IS NOT NULL AND "expiresAt" <= ?`).run(now);
  }
}
