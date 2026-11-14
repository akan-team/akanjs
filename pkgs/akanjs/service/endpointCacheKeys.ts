import { dayjs } from "akanjs/base";
import type { CacheAdaptor } from "./predefinedAdaptor/cache.adaptor";

//? The map is shared with signal/endpointCache.ts through `process`, as trace.ts shares its store: a facet cannot import a sibling's file.
const flightStore = process as unknown as { __akanEndpointCacheFlights?: Map<string, { stale: boolean }> };

// A random per-endpoint token, replaced on invalidation and never reused, so a lost generation revives no entries.
export class EndpointCacheKeys {
  static readonly topic = "cache";
  static readonly generationTtlMs = 86_400_000;
  static readonly #generationTopic = "cacheGeneration";

  static async entryKey(cache: Pick<CacheAdaptor, "get" | "setIfAbsent">, endpoint: string, args: unknown[]) {
    return `${endpoint}:${await EndpointCacheKeys.#generation(cache, endpoint)}:${JSON.stringify(args)}`;
  }

  static async invalidate(
    cache: Pick<CacheAdaptor, "get" | "set" | "setIfAbsent" | "delete">,
    endpoint: string,
    args?: unknown[],
  ) {
    if (args) {
      const key = await EndpointCacheKeys.entryKey(cache, endpoint, args);
      EndpointCacheKeys.#staleFlights((flightKey) => flightKey === key);
      await cache.delete(EndpointCacheKeys.topic, key);
    } else {
      EndpointCacheKeys.#staleFlights((flightKey) => flightKey.startsWith(`${endpoint}:`));
      await cache.set(EndpointCacheKeys.#generationTopic, endpoint, crypto.randomUUID(), EndpointCacheKeys.#expiry());
    }
  }

  static #staleFlights(matches: (flightKey: string) => boolean) {
    for (const [flightKey, flight] of flightStore.__akanEndpointCacheFlights ?? [])
      if (matches(flightKey)) flight.stale = true;
  }

  static async #generation(cache: Pick<CacheAdaptor, "get" | "setIfAbsent">, endpoint: string) {
    const current = await cache.get<string>(EndpointCacheKeys.#generationTopic, endpoint);
    if (current !== undefined) return current;
    const fresh = crypto.randomUUID();
    if (await cache.setIfAbsent(EndpointCacheKeys.#generationTopic, endpoint, fresh, EndpointCacheKeys.#expiry()))
      return fresh;
    return (await cache.get<string>(EndpointCacheKeys.#generationTopic, endpoint)) ?? fresh;
  }

  static #expiry() {
    return { expireAt: dayjs().add(EndpointCacheKeys.generationTtlMs, "millisecond") };
  }
}
