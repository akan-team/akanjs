import type { Logger } from "akanjs/common";
import { untrackedCookies } from "akanjs/fetch";
import {
  LruTtlCache,
  type LruTtlCacheOptions,
  parsePositiveInt,
  type RouteCacheEntry,
  resolvePublicRouteCacheEntryDecision,
} from "./cachePolicy";
import type { CachedRscResult } from "./rscWorkerCache";

/** Well above any sensible TTL: this reclaims a cache nobody is reading, not tracks expiry closely. */
const RESULT_CACHE_SWEEP_INTERVAL_MS = 60_000;

export class RscResultCaches {
  readonly #logger: Logger;
  // Flight payloads have no natural size cap; without byte ceilings a few heavy routes fill every entry with MBs.
  readonly resultCache = new LruTtlCache<CachedRscResult>(
    parsePositiveInt(process.env.AKAN_RSC_RESULT_CACHE_MAX_ENTRIES) ?? 100,
    RscResultCaches.#resultCacheOptions(),
  );
  readonly patchResultCache = new LruTtlCache<CachedRscResult>(
    parsePositiveInt(process.env.AKAN_RSC_RESULT_CACHE_MAX_ENTRIES) ?? 100,
    RscResultCaches.#resultCacheOptions(),
  );
  resultCacheHits = 0;
  resultCacheMisses = 0;
  resultCacheBypass = 0;

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  getResultCacheEntry(request: Request, url: URL): { entry: RouteCacheEntry | null; reason?: string } {
    const decision = resolvePublicRouteCacheEntryDecision({
      request,
      url,
      theme: untrackedCookies().get("theme")?.value,
      defaultEnabled: process.env.NODE_ENV === "production",
      defaultAllow: process.env.NODE_ENV === "production",
      env: {
        enabled: process.env.AKAN_RSC_RESULT_CACHE,
        ttl: process.env.AKAN_RSC_RESULT_CACHE_TTL,
        allow: process.env.AKAN_RSC_RESULT_CACHE_PATHS,
        deny: process.env.AKAN_RSC_RESULT_CACHE_EXCLUDE_PATHS,
      },
    });
    if (!decision.entry) this.resultCacheBypass += 1;
    return decision;
  }

  static #resultCacheOptions(): LruTtlCacheOptions<CachedRscResult> {
    return {
      sizeOf: (result) => result.bytes,
      maxBytes: LruTtlCache.parseByteCeiling(process.env.AKAN_RSC_RESULT_CACHE_MAX_BYTES),
      maxEntryBytes: LruTtlCache.parseByteCeiling(process.env.AKAN_RSC_RESULT_CACHE_MAX_BODY_BYTES),
      sweepIntervalMs: RESULT_CACHE_SWEEP_INTERVAL_MS,
    };
  }

  getCached(cache: LruTtlCache<CachedRscResult>, cacheKey: string): CachedRscResult | null {
    const cached = cache.get(cacheKey);
    if (cached) this.resultCacheHits += 1;
    else this.resultCacheMisses += 1;
    return cached;
  }

  store(kind: string, cache: LruTtlCache<CachedRscResult>, cacheKey: string, result: CachedRscResult, ttl: number) {
    if (cache.set(cacheKey, result, ttl)) return;
    this.#logger.verbose(
      `${kind} result cache store skipped pathname=${result.pathname} bytes=${result.bytes} reason=body-too-large`,
    );
  }
}
