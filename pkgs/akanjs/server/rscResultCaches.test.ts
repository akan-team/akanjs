import { describe, expect, test } from "bun:test";
import { Logger } from "akanjs/common";
import { RscResultCaches } from "./rscResultCaches";
import { type CachedRscResult, joinRscChunks } from "./rscWorkerCache";

const cachesWith = (env: Record<string, string>) => {
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    return new RscResultCaches(new Logger("RscResultCachesTest"));
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const resultOf = (pathname: string, chunks: Uint8Array[]): CachedRscResult => ({
  body: joinRscChunks(chunks),
  chunksCount: chunks.length,
  pathname,
  cacheState: { cacheable: true },
});

describe("RscResultCaches", () => {
  test("joins a render's chunks into one buffer of exactly their bytes, in order", () => {
    const view = new Uint8Array(4096);
    view.set([1, 2, 3]);
    const body = joinRscChunks([view.subarray(0, 3), new Uint8Array([4]), new Uint8Array(0), new Uint8Array([5, 6])]);

    expect([...body]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(body.buffer.byteLength).toBe(6);
    expect(joinRscChunks([]).byteLength).toBe(0);
  });

  test("counts a stored result at its buffer's bytes and evicts the oldest once the byte ceiling is passed", () => {
    const caches = cachesWith({ AKAN_RSC_RESULT_CACHE_MAX_BYTES: "10" });
    const cache = caches.resultCache;
    try {
      caches.store("full", cache, "a", resultOf("/a", [new Uint8Array(2), new Uint8Array(2)]), 30);
      caches.store("full", cache, "b", resultOf("/b", [new Uint8Array(3)]), 30);
      expect(cache.byteSize).toBe(7);

      caches.store("full", cache, "c", resultOf("/c", [new Uint8Array(1), new Uint8Array(4)]), 30);
      expect(cache.get("a")).toBeNull();
      expect(cache.get("b")?.body.byteLength).toBe(3);
      expect(cache.get("c")?.body.byteLength).toBe(5);
      expect(cache.byteSize).toBe(8);

      cache.delete("b");
      expect(cache.byteSize).toBe(5);
    } finally {
      cache.dispose();
      caches.patchResultCache.dispose();
    }
  });

  test("refuses a result whose buffer is over the entry ceiling and keeps one at it", () => {
    const caches = cachesWith({ AKAN_RSC_RESULT_CACHE_MAX_BODY_BYTES: "4" });
    const cache = caches.resultCache;
    try {
      caches.store("full", cache, "over", resultOf("/over", [new Uint8Array(3), new Uint8Array(2)]), 30);
      caches.store("full", cache, "at", resultOf("/at", [new Uint8Array(3), new Uint8Array(1)]), 30);

      expect(cache.get("over")).toBeNull();
      expect(cache.get("at")?.body.byteLength).toBe(4);
      expect(cache.byteSize).toBe(4);
    } finally {
      cache.dispose();
      caches.patchResultCache.dispose();
    }
  });
});
