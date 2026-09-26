import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Any, dayjs, Float, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { ConformanceEnv } from "../../test/conformance";
import { adapt } from "../adapt";
import { getDefaultInjectRegistry, InjectInfo } from "../injectInfo";
import type { CacheAdaptor } from "./cache.adaptor";
import { CacheAdaptorRole } from "./role.adaptor";

// Solid's answers are the contract; a Redis divergence is `test.failingIf(onRedis)` with its id from
// `local/database-modes/01-multiple-redis.md`, and turns red once fixed. An id on a plain `test` is a fixed defect.

class MemoryEntry extends via((f) => ({ name: f(String), score: f(Int, { default: 0 }) })) {}
ConstantRegistry.buildScalar("memoryEntry", MemoryEntry, { MemoryEntry });

class MemoryProbe extends adapt("memoryProbe", ({ memory }) => ({
  count: memory(Int, { default: 0 }),
  ratio: memory(Float),
  flag: memory(Boolean, { default: true }),
  label: memory(String),
  at: memory(Date),
  blob: memory(Any),
  entries: memory(Map, { of: MemoryEntry }),
})) {}

interface MemoryValue<T> {
  set(value: T): Promise<void>;
  get(): Promise<T>;
  delete(): Promise<void>;
  getDel(): Promise<T>;
  incr(by?: number): Promise<number>;
}
interface MemoryProbeFields {
  count: MemoryValue<number>;
  ratio: MemoryValue<number>;
  flag: MemoryValue<boolean>;
  label: MemoryValue<string>;
  at: MemoryValue<unknown>;
  blob: MemoryValue<unknown>;
  entries: {
    set(key: string, value: unknown): Promise<void>;
    get(key: string): Promise<unknown>;
    getDel(key: string): Promise<unknown>;
    getOrInsert(key: string, value: unknown): Promise<unknown>;
    keys(): Promise<string[]>;
    clear(): Promise<void>;
  };
}

const memoryProbeOn = async (cache: CacheAdaptor) => {
  const registry = getDefaultInjectRegistry();
  const cacheCls = cache.constructor as unknown as Parameters<typeof registry.adaptor.set>[0];
  registry.adaptorRole.set(CacheAdaptorRole, cacheCls);
  registry.adaptor.set(cacheCls, cache as unknown as Parameters<typeof registry.adaptor.set>[1]);
  const probe = new MemoryProbe();
  await InjectInfo.resolveInjection(probe, MemoryProbe, registry, {});
  return probe as unknown as MemoryProbeFields;
};

const kinds = ConformanceEnv.cacheKinds("cache conformance");

for (const kind of kinds) {
  describe(`cache conformance (${kind})`, () => {
    let alpha: Awaited<ReturnType<typeof ConformanceEnv.openCache>>;
    let beta: Awaited<ReturnType<typeof ConformanceEnv.openCache>>;
    const topic = ConformanceEnv.uniqueName("conformance");

    beforeAll(async () => {
      alpha = await ConformanceEnv.openCache(kind);
      beta = await ConformanceEnv.openCache(kind);
    });
    afterAll(async () => {
      await alpha?.close();
      await beta?.close();
    });

    test("a string round-trips", async () => {
      await alpha.cache.set(topic, "string", "value");
      expect(await alpha.cache.get<string>(topic, "string")).toBe("value");
    });

    test("[C-1] a number round-trips as a number", async () => {
      await alpha.cache.set(topic, "number", 42);
      expect(await alpha.cache.get<number>(topic, "number")).toBe(42);
    });

    test("[C-2] a Buffer round-trips byte for byte", async () => {
      const bytes = Buffer.from([0xff, 0x00, 0xfe, 0x41]);
      await alpha.cache.set(topic, "buffer", bytes);
      const read = await alpha.cache.get<Buffer>(topic, "buffer");
      expect(Buffer.isBuffer(read) ? read.toString("hex") : read).toBe("ff00fe41");
    });

    test("[C-3] a JSON object round-trips", async () => {
      await alpha.cache.set(topic, "object", { a: 1 });
      expect(await alpha.cache.get(topic, "object")).toEqual({ a: 1 });
    });

    test("[C-3][A-1] an array round-trips (refresh session owner lists)", async () => {
      await alpha.cache.set(topic, "array", ["hash-a", "hash-b"]);
      expect(await alpha.cache.get(topic, "array")).toEqual(["hash-a", "hash-b"]);
    });

    test("[C-4] a missing key reads as undefined", async () => {
      expect(await alpha.cache.get(topic, "missing")).toBeUndefined();
    });

    test("a boolean, a Uint8Array and a string that starts with NUL round-trip", async () => {
      await alpha.cache.set(topic, "boolean", false);
      await alpha.cache.set(topic, "bytes", new Uint8Array([0, 1, 255]));
      await alpha.cache.set(topic, "nul", "\0n42");
      expect(await alpha.cache.get(topic, "boolean")).toBe(false);
      expect([...((await alpha.cache.get<Uint8Array>(topic, "bytes")) ?? [])]).toEqual([0, 1, 255]);
      expect(await alpha.cache.get(topic, "nul")).toBe("\0n42");
    });

    test("a value past its expireAt is gone", async () => {
      await alpha.cache.set(topic, "expired", "value", { expireAt: dayjs().subtract(1, "second") });
      expect((await alpha.cache.get(topic, "expired")) ?? undefined).toBeUndefined();
    });

    test("a value before its expireAt is kept", async () => {
      await alpha.cache.set(topic, "fresh", "value", { expireAt: dayjs().add(1, "minute") });
      expect(await alpha.cache.get<string>(topic, "fresh")).toBe("value");
    });

    test("delete removes a key", async () => {
      await alpha.cache.set(topic, "doomed", "value");
      await alpha.cache.delete(topic, "doomed");
      expect((await alpha.cache.get(topic, "doomed")) ?? undefined).toBeUndefined();
    });

    test("getDel hands a value to exactly one of two racing callers", async () => {
      await alpha.cache.set(topic, "code", { grant: "g-1" });
      const [first, second] = await Promise.all([alpha.cache.getDel(topic, "code"), alpha.cache.getDel(topic, "code")]);
      expect([first, second].filter(Boolean)).toEqual([{ grant: "g-1" }]);
      expect(await alpha.cache.get(topic, "code")).toBeUndefined();
    });

    test("getDel reads an expired value as missing", async () => {
      await alpha.cache.set(topic, "stale-code", "value", { expireAt: dayjs().subtract(1, "second") });
      expect(await alpha.cache.getDel(topic, "stale-code")).toBeUndefined();
    });

    test("setIfAbsent writes for exactly one caller, and again once the value expired", async () => {
      const results = await Promise.all(
        ["a", "b", "c"].map(
          async (value) => await alpha.cache.setIfAbsent(topic, "claim", value, { expireAt: dayjs().add(150, "ms") }),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await alpha.cache.setIfAbsent(topic, "claim", "late")).toBe(false);
      await Bun.sleep(200);
      expect(await alpha.cache.setIfAbsent(topic, "claim", "after")).toBe(true);
      expect(await alpha.cache.get(topic, "claim")).toBe("after");
    });

    test("incr counts every concurrent call and reads back as a number", async () => {
      const sums = await Promise.all(Array.from({ length: 40 }, async () => await alpha.cache.incr(topic, "hits")));
      expect([...sums].sort((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, idx) => idx + 1));
      expect(await alpha.cache.get<number>(topic, "hits")).toBe(40);
      expect(await alpha.cache.incr(topic, "hits", -10)).toBe(30);
    });

    test("incr gives a new counter its expireAt and leaves a live counter's own", async () => {
      expect(await alpha.cache.incr(topic, "window", 1, { expireAt: dayjs().add(150, "ms") })).toBe(1);
      expect(await alpha.cache.incr(topic, "window", 1, { expireAt: dayjs().add(1, "minute") })).toBe(2);
      await Bun.sleep(200);
      expect(await alpha.cache.incr(topic, "window", 1, { expireAt: dayjs().add(1, "minute") })).toBe(1);
    });

    test("a lease belongs to one owner until it is released or lapses", async () => {
      expect(await alpha.cache.acquireLease(topic, "lease", "owner-a", 5_000)).toBe(true);
      expect(await alpha.cache.acquireLease(topic, "lease", "owner-b", 5_000)).toBe(false);
      expect(await alpha.cache.acquireLease(topic, "lease", "owner-a", 5_000)).toBe(true);
      expect(await alpha.cache.renewLease(topic, "lease", "owner-b", 5_000)).toBe(false);
      await alpha.cache.releaseLease(topic, "lease", "owner-b");
      expect(await alpha.cache.acquireLease(topic, "lease", "owner-b", 5_000)).toBe(false);
      expect(await alpha.cache.renewLease(topic, "lease", "owner-a", 5_000)).toBe(true);
      await alpha.cache.releaseLease(topic, "lease", "owner-a");
      expect(await alpha.cache.acquireLease(topic, "lease", "owner-b", 5_000)).toBe(true);
    });

    test("a lapsed lease passes to the next owner and cannot be renewed by the last", async () => {
      expect(await alpha.cache.acquireLease(topic, "short-lease", "owner-a", 100)).toBe(true);
      await Bun.sleep(150);
      expect(await alpha.cache.acquireLease(topic, "short-lease", "owner-b", 5_000)).toBe(true);
      expect(await alpha.cache.renewLease(topic, "short-lease", "owner-a", 5_000)).toBe(false);
    });

    test("a hash field keeps its value's type", async () => {
      await alpha.cache.hset(topic, "typed", "count", 3);
      await alpha.cache.hset(topic, "typed", "session", { id: "s-1" });
      expect(await alpha.cache.hget(topic, "typed", "count")).toBe(3);
      expect(Object.fromEntries(await alpha.cache.hentries(topic, "typed"))).toEqual({
        count: 3,
        session: { id: "s-1" },
      });
    });

    test("hgetDel hands a field to exactly one of two racing callers, and reads an expired one as missing", async () => {
      await alpha.cache.hset(topic, "grants", "code-1", { grant: "g-1" });
      await alpha.cache.hset(topic, "grants", "stale", "value", { expireAt: dayjs().subtract(1, "second") });
      const taken = await Promise.all([
        alpha.cache.hgetDel(topic, "grants", "code-1"),
        alpha.cache.hgetDel(topic, "grants", "code-1"),
      ]);
      expect(taken.filter(Boolean)).toEqual([{ grant: "g-1" }]);
      expect(await alpha.cache.hgetDel(topic, "grants", "stale")).toBeUndefined();
      expect(await alpha.cache.hkeys(topic, "grants")).toEqual([]);
    });

    test("hsetIfAbsent writes a field for exactly one caller, and again once it expired", async () => {
      const results = await Promise.all(
        ["a", "b"].map(
          async (value) =>
            await alpha.cache.hsetIfAbsent(topic, "claims", "field", value, { expireAt: dayjs().add(150, "ms") }),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      await Bun.sleep(200);
      expect(await alpha.cache.hsetIfAbsent(topic, "claims", "field", "after")).toBe(true);
      expect(await alpha.cache.hget(topic, "claims", "field")).toBe("after");
    });

    test("hincr counts every concurrent call, and a field it creates takes the expiry", async () => {
      const sums = await Promise.all(
        Array.from(
          { length: 20 },
          async () => await alpha.cache.hincr(topic, "counters", "ip-1", 1, { expireAt: dayjs().add(150, "ms") }),
        ),
      );
      expect([...sums].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, idx) => idx + 1));
      expect(await alpha.cache.hget(topic, "counters", "ip-1")).toBe(20);
      await Bun.sleep(200);
      expect(await alpha.cache.hincr(topic, "counters", "ip-1")).toBe(1);
    });

    test("hash fields keep their own expiry and list without the expired ones", async () => {
      await alpha.cache.hset(topic, "hash", "live", "a", { expireAt: dayjs().add(1, "minute") });
      await alpha.cache.hset(topic, "hash", "dead", "b", { expireAt: dayjs().subtract(1, "second") });
      await alpha.cache.hset(topic, "hash", "forever", "c");
      expect(await alpha.cache.hget<string>(topic, "hash", "live")).toBe("a");
      expect((await alpha.cache.hget(topic, "hash", "dead")) ?? undefined).toBeUndefined();
      expect((await alpha.cache.hkeys(topic, "hash")).sort((a, b) => a.localeCompare(b))).toEqual(["forever", "live"]);
      expect(Object.fromEntries(await alpha.cache.hentries<string>(topic, "hash"))).toEqual({
        forever: "c",
        live: "a",
      });
      await alpha.cache.hdelete(topic, "hash", "live");
      expect(await alpha.cache.hkeys(topic, "hash")).toEqual(["forever"]);
      await alpha.cache.hclear(topic, "hash");
      expect(await alpha.cache.hkeys(topic, "hash")).toEqual([]);
    });

    test("[C-5] another app's cache does not see this app's keys", async () => {
      await alpha.cache.set(topic, "private", "alpha-only");
      expect((await beta.cache.get(topic, "private")) ?? undefined).toBeUndefined();
    });

    describe("memory()", () => {
      let probe: MemoryProbeFields;
      beforeAll(async () => {
        probe = await memoryProbeOn(alpha.cache);
      });
      afterEach(async () => {
        for (const field of [probe.count, probe.ratio, probe.flag, probe.label, probe.at, probe.blob])
          await field.delete();
        await probe.entries.clear();
      });

      test("scalars round-trip", async () => {
        await probe.count.set(42);
        await probe.ratio.set(0.25);
        await probe.flag.set(false);
        await probe.label.set("hello");
        expect(await probe.count.get()).toBe(42);
        expect(await probe.ratio.get()).toBe(0.25);
        expect(await probe.flag.get()).toBe(false);
        expect(await probe.label.get()).toBe("hello");
      });

      test("an unset value reads as its default", async () => {
        expect(await probe.count.get()).toBe(0);
        expect(await probe.flag.get()).toBe(true);
      });

      test("[R-5] a Date keeps its milliseconds", async () => {
        await probe.at.set(dayjs(1_727_000_000_123));
        expect(dayjs((await probe.at.get()) as never).valueOf()).toBe(1_727_000_000_123);
      });

      test("[R-4] an Any value round-trips", async () => {
        await probe.blob.set({ nested: { list: [1, 2] } });
        expect(await probe.blob.get()).toEqual({ nested: { list: [1, 2] } });
      });

      test("a counter increments atomically and a value is consumed once", async () => {
        await Promise.all(Array.from({ length: 10 }, async () => await probe.count.incr()));
        expect(await probe.count.get()).toBe(10);
        await probe.label.set("once");
        const taken = await Promise.all([probe.label.getDel(), probe.label.getDel()]);
        expect(taken.filter((value) => value !== null)).toEqual(["once"]);
      });

      test("racing getOrInsert calls all read the first value written", async () => {
        const values = await Promise.all(
          ["first", "second", "third"].map(
            async (name) => await probe.entries.getOrInsert("slot", new MemoryEntry().set({ name, score: 1 })),
          ),
        );
        const stored = (await probe.entries.get("slot")) as MemoryEntry;
        expect(values.map((value) => (value as MemoryEntry).name)).toEqual([stored.name, stored.name, stored.name]);
        expect(await probe.entries.getDel("slot")).toMatchObject({ name: stored.name });
        expect(await probe.entries.get("slot")).toBeUndefined();
      });

      test("a Map of models round-trips and lists its entries", async () => {
        await probe.entries.set("a", new MemoryEntry().set({ name: "first", score: 3 }));
        expect(await probe.entries.get("a")).toMatchObject({ name: "first", score: 3 });
        expect(await probe.entries.keys()).toEqual(["a"]);
      });
    });
  });
}
