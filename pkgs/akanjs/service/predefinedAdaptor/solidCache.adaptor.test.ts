import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dayjs } from "akanjs/base";
import { SolidCache } from "./solidCache.adaptor";
import { getSolidConfig } from "./solidSqlite";

const createCache = async (
  filePath = path.join(tmpdir(), `solid-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`),
) => {
  const config = getSolidConfig({ solid: { filePath } });
  const cache = new SolidCache();
  // The DI container injects `config`; in tests we assign it directly before init.
  Object.assign(cache, { config });
  await cache.onInit();
  return { cache, filePath };
};

const cleanup = (filePath: string) => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(`${filePath}${suffix}`);
    } catch {
      // ignore missing files
    }
  }
};

describe("SolidCache adaptor (sqlite)", () => {
  let cache: SolidCache;
  let filePath: string;

  beforeEach(async () => {
    ({ cache, filePath } = await createCache());
  });

  afterEach(async () => {
    await cache.onDestroy();
    cleanup(filePath);
  });

  test("round-trips string and number values like the redis cache", async () => {
    await cache.set("remoteAuthToken", "remote-1", "jwt-token");
    expect(await cache.get<string>("remoteAuthToken", "remote-1")).toBe("jwt-token");

    await cache.set("lastResetAt", "user-1", 1234);
    expect(await cache.get<number>("lastResetAt", "user-1")).toBe(1234);
  });

  test("overwrites an existing key on repeated set", async () => {
    await cache.set("remoteAuthToken", "remote-1", "first");
    await cache.set("remoteAuthToken", "remote-1", "second");
    expect(await cache.get<string>("remoteAuthToken", "remote-1")).toBe("second");
  });

  test("returns the value while the expiration is in the future", async () => {
    await cache.set("remoteAuthToken", "remote-1", "jwt-token", { expireAt: dayjs().add(30, "second") });
    expect(await cache.get<string>("remoteAuthToken", "remote-1")).toBe("jwt-token");
  });

  test("returns undefined once the expiration has passed", async () => {
    await cache.set("remoteAuthToken", "remote-1", "jwt-token", { expireAt: dayjs().subtract(1, "second") });
    expect(await cache.get<string>("remoteAuthToken", "remote-1")).toBeUndefined();
  });

  test("returns undefined for an unknown key", async () => {
    expect(await cache.get<string>("remoteAuthToken", "missing")).toBeUndefined();
  });

  test("deletes a stored value", async () => {
    await cache.set("remoteAuthToken", "remote-1", "jwt-token");
    await cache.delete("remoteAuthToken", "remote-1");
    expect(await cache.get<string>("remoteAuthToken", "remote-1")).toBeUndefined();
  });

  test("round-trips and removes hash values", async () => {
    await cache.hset("session", "user-1", "field-a", "value-a");
    await cache.hset("session", "user-1", "field-b", "value-b");
    expect(await cache.hget<string>("session", "user-1", "field-a")).toBe("value-a");
    expect(await cache.hget<string>("session", "user-1", "field-b")).toBe("value-b");

    await cache.hdelete("session", "user-1", "field-a");
    expect(await cache.hget<string>("session", "user-1", "field-a")).toBeUndefined();
    expect(await cache.hget<string>("session", "user-1", "field-b")).toBe("value-b");
  });

  test("lists and clears hash values", async () => {
    await cache.hset("session", "user-1", "field-b", "value-b");
    await cache.hset("session", "user-1", "field-a", "value-a");
    await cache.hset("session", "user-2", "field-c", "value-c");

    expect(await cache.hkeys("session", "user-1")).toEqual(["field-a", "field-b"]);
    expect(await cache.hentries<string>("session", "user-1")).toEqual([
      ["field-a", "value-a"],
      ["field-b", "value-b"],
    ]);

    await cache.hclear("session", "user-1");
    expect(await cache.hkeys("session", "user-1")).toEqual([]);
    expect(await cache.hget<string>("session", "user-2", "field-c")).toBe("value-c");
  });

  test("expires hash values once the expiration has passed", async () => {
    await cache.hset("session", "user-1", "field-a", "value-a", { expireAt: dayjs().subtract(1, "second") });
    expect(await cache.hget<string>("session", "user-1", "field-a")).toBeUndefined();
  });

  test("hkeys and hentries leave expired fields to the sweep and never return them", async () => {
    await cache.hset("session", "user-1", "live", "a", { expireAt: dayjs().add(1, "minute") });
    await cache.hset("session", "user-1", "forever", "b");
    await cache.hset("session", "user-1", "soon", "c", { expireAt: dayjs().add(100, "ms") });
    for (const field of ["dead-1", "dead-2", "dead-3"])
      await cache.hset("session", "user-1", field, "x", { expireAt: dayjs().subtract(1, "second") });
    await Bun.sleep(150);

    expect(await cache.hkeys("session", "user-1")).toEqual(["forever", "live"]);
    expect(await cache.hentries<string>("session", "user-1")).toEqual([
      ["forever", "b"],
      ["live", "a"],
    ]);
    const raw = new Database(filePath);
    const { expired } = raw
      .query(`SELECT count(*) AS "expired" FROM "_akan_solid_cache_hash" WHERE "expiresAt" <= ?`)
      .get(Date.now()) as { expired: number };
    raw.close();
    expect(expired).toBe(4);
  });
});

describe("SolidCache expiry sweep (sqlite)", () => {
  const backlog = 2500;
  const tables = ["_akan_solid_cache", "_akan_solid_cache_hash"];
  let filePath: string;
  let cache: SolidCache | undefined;

  const expiredCounts = (raw: Database) =>
    tables.map((table) => {
      const row = raw.query(`SELECT count(*) AS "count" FROM "${table}" WHERE "expiresAt" <= ?`).get(Date.now());
      return (row as { count: number }).count;
    });

  beforeEach(async () => {
    const seeded = await createCache();
    filePath = seeded.filePath;
    await seeded.cache.onDestroy();
    const raw = new Database(filePath);
    const now = Date.now();
    raw.transaction(() => {
      for (let i = 0; i < backlog; i++) {
        raw
          .query(`INSERT INTO "_akan_solid_cache" VALUES (?, ?, 'x', 'string', ?, ?, ?)`)
          .run("endpoint", `dead-${i}`, now - 1000, now, now);
        raw
          .query(`INSERT INTO "_akan_solid_cache_hash" VALUES (?, ?, ?, 'x', 'string', ?, ?, ?)`)
          .run("endpoint", "hash", `dead-${i}`, now - 1000, now, now);
      }
      raw
        .query(`INSERT INTO "_akan_solid_cache" VALUES ('endpoint', 'live', 'x', 'string', ?, ?, ?)`)
        .run(now + 60_000, now, now);
      raw
        .query(`INSERT INTO "_akan_solid_cache" VALUES ('endpoint', 'forever', 'x', 'string', NULL, ?, ?)`)
        .run(now, now);
    })();
    raw.close();
  });

  afterEach(async () => {
    await cache?.onDestroy();
    cache = undefined;
    cleanup(filePath);
  });

  test("deletes a backlog at most 1000 rows per statement, yielding between them, until none is left", async () => {
    ({ cache } = await createCache(filePath));
    const raw = new Database(filePath);
    expect(expiredCounts(raw)).toEqual([backlog - 1000, backlog]);
    for (let waited = 0; waited < 5000 && expiredCounts(raw).some(Boolean); waited += 10) await Bun.sleep(10);
    expect(expiredCounts(raw)).toEqual([0, 0]);
    expect(await cache.get("endpoint", "live")).toBe("x");
    expect(await cache.get("endpoint", "forever")).toBe("x");
    raw.close();
  });

  test("the sweep's selection searches an expiresAt index instead of scanning the table", async () => {
    ({ cache } = await createCache(filePath));
    const raw = new Database(filePath);
    for (const table of tables) {
      const plan = raw
        .query(
          `EXPLAIN QUERY PLAN SELECT rowid FROM "${table}" WHERE "expiresAt" IS NOT NULL AND "expiresAt" <= ? LIMIT 1000`,
        )
        .all(Date.now()) as { detail: string }[];
      expect(plan.map((row) => row.detail).join("\n")).toContain(`USING COVERING INDEX ${table}_expiry_idx`);
    }
    raw.close();
  });

  test("closing the cache in the middle of a sweep stops it without touching the closed database", async () => {
    ({ cache } = await createCache(filePath));
    const warn = spyOn(cache.logger, "warn");
    await cache.onDestroy();
    cache = undefined;
    await Bun.sleep(20);
    expect(warn).not.toHaveBeenCalled();
    const raw = new Database(filePath);
    expect(expiredCounts(raw)).toEqual([backlog - 1000, backlog]);
    raw.close();
  });
});
