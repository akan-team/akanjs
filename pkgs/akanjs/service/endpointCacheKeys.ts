import type { CacheAdaptor } from "./predefinedAdaptor/cache.adaptor";

// An entry sits under its endpoint's generation, a random token. Invalidating the endpoint replaces the token in one
// write: every entry becomes unreachable at once and expires on its own TTL, no key is scanned, and a miss already
// running writes under the old token, where nobody reads it. A token is never reused, so a generation a cache evicts
// (Redis under `allkeys-*`) starts a fresh one instead of reviving the entries an earlier invalidation dropped.
export class EndpointCacheKeys {
  static readonly topic = "cache";
  static readonly #generationTopic = "cacheGeneration";

  static async entryKey(cache: Pick<CacheAdaptor, "get" | "setIfAbsent">, endpoint: string, args: unknown[]) {
    return `${endpoint}:${await EndpointCacheKeys.#generation(cache, endpoint)}:${JSON.stringify(args)}`;
  }

  static async invalidate(
    cache: Pick<CacheAdaptor, "get" | "set" | "setIfAbsent" | "delete">,
    endpoint: string,
    args?: unknown[],
  ) {
    if (args) await cache.delete(EndpointCacheKeys.topic, await EndpointCacheKeys.entryKey(cache, endpoint, args));
    else await cache.set(EndpointCacheKeys.#generationTopic, endpoint, crypto.randomUUID());
  }

  static async #generation(cache: Pick<CacheAdaptor, "get" | "setIfAbsent">, endpoint: string) {
    const current = await cache.get<string>(EndpointCacheKeys.#generationTopic, endpoint);
    if (current !== undefined) return current;
    const fresh = crypto.randomUUID();
    if (await cache.setIfAbsent(EndpointCacheKeys.#generationTopic, endpoint, fresh)) return fresh;
    return (await cache.get<string>(EndpointCacheKeys.#generationTopic, endpoint)) ?? fresh;
  }
}
