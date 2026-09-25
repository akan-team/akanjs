import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dayjs } from "akanjs/base";
import { SolidCache } from "./solidCache.adaptor";
import { getSolidConfig } from "./solidSqlite";

const createCache = async () => {
  const filePath = path.join(tmpdir(), `solid-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const config = getSolidConfig({ appName: "test", environment: "test", solid: { filePath } });
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
});
