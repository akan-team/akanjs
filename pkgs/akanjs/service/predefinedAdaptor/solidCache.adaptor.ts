import type { Database } from "bun:sqlite";
import { adapt } from "../adapt";
import type { CacheAdaptor, CacheSetOptions } from "./cache.adaptor";
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

  async set(topic: string, key: string, value: string | number | Buffer, option: CacheSetOptions = {}) {
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

  async get<T extends string | number | Buffer>(topic: string, key: string): Promise<T | undefined> {
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

  async hset(
    topic: string,
    key: string,
    subKey: string,
    value: string | number | Buffer,
    option: CacheSetOptions = {},
  ) {
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

  async hget<T extends string | number | Buffer>(topic: string, key: string, subKey: string): Promise<T | undefined> {
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

  async hentries<T extends string | number | Buffer>(topic: string, key: string): Promise<[string, T][]> {
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

  #cleanup() {
    const now = Date.now();
    this.#db.query(`DELETE FROM "_akan_solid_cache" WHERE "expiresAt" IS NOT NULL AND "expiresAt" <= ?`).run(now);
    this.#db.query(`DELETE FROM "_akan_solid_cache_hash" WHERE "expiresAt" IS NOT NULL AND "expiresAt" <= ?`).run(now);
  }
}
