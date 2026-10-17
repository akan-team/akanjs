import type { CacheAdaptor } from "./predefinedAdaptor/cache.adaptor";

// An entry sits under its endpoint's generation. Invalidating the endpoint bumps that generation in one atomic `incr`:
// every entry becomes unreachable at once and expires on its own TTL, no key is scanned, and a miss already running
// writes under the old generation, where nobody reads it. A delete would let that write put the stale answer back.
export class EndpointCacheKeys {
  static readonly topic = "cache";
  static readonly #generationTopic = "cacheGeneration";

  static async entryKey(cache: Pick<CacheAdaptor, "get">, endpoint: string, args: unknown[]) {
    const generation = (await cache.get<number>(EndpointCacheKeys.#generationTopic, endpoint)) ?? 0;
    return `${endpoint}:${generation}:${JSON.stringify(args)}`;
  }

  static async invalidate(cache: Pick<CacheAdaptor, "get" | "delete" | "incr">, endpoint: string, args?: unknown[]) {
    if (args) await cache.delete(EndpointCacheKeys.topic, await EndpointCacheKeys.entryKey(cache, endpoint, args));
    else await cache.incr(EndpointCacheKeys.#generationTopic, endpoint);
  }
}
