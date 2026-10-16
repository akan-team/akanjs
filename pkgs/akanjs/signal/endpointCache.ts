import { type CacheAdaptor, CacheAdaptorRole } from "akanjs/service";
import dayjs from "dayjs";
import type { EndpointInfo } from "./endpointInfo";
import type { SignalContext } from "./signalContext";
import { TaggedJson } from "./TaggedJson";
import { traceCache } from "./trace";

// Not a middleware: it runs after the guards (which a lib's account middleware feeds), so a hit reaches only an
// admitted caller, inside the `timeout` deadline. The entry is shared, hence no internal arguments.
export class EndpointCache {
  static #topic = "cache";
  static #refused = new Set<string>();

  static declares(endpointInfo: EndpointInfo): boolean {
    const ttl = endpointInfo.signalOption.cache;
    return !!ttl && Number.isFinite(ttl) && ttl > 0;
  }

  static async through(context: SignalContext, run: () => Promise<unknown>) {
    const ttl = context.endpointInfo.signalOption.cache;
    if (!ttl || !EndpointCache.declares(context.endpointInfo)) return await run();
    if (!EndpointCache.#cacheable(context)) return await run();
    const cache = context.getAdaptor(CacheAdaptorRole) as unknown as CacheAdaptor;
    const key = `${context.key}:${JSON.stringify(context.args)}`;
    const cached = await EndpointCache.#read(context, cache, key);
    if (cached !== undefined) {
      traceCache(true);
      return cached;
    }
    traceCache(false);
    const result = await run();
    await EndpointCache.#write(context, cache, key, result, ttl);
    return result;
  }
  static #cacheable(context: SignalContext) {
    if (context.endpointInfo.type === "query" && context.endpointInfo.internalArgs.length === 0) return true;
    if (EndpointCache.#refused.has(context.key)) return false;
    EndpointCache.#refused.add(context.key);
    const reason =
      context.endpointInfo.type === "query"
        ? "it takes an internal argument, so its answer is the caller's and not a shared one"
        : `a ${context.endpointInfo.type} is never cached`;
    context.adaptor.logger.warn(`"${context.key}" declares \`cache\` and cannot take one: ${reason}.`);
    return false;
  }
  // A cache backend that is down must not take the endpoint down with it: the call runs uncached instead.
  static async #read(context: SignalContext, cache: CacheAdaptor, key: string) {
    try {
      const cached = await cache.get<string>(EndpointCache.#topic, key);
      if (cached == null) return undefined;
      const { returnRef, arrDepth } = context.endpointInfo.returns;
      return TaggedJson.parse(cached, { ref: returnRef, arrDepth });
    } catch (error) {
      context.adaptor.logger.warn(`Cache read failed for ${context.key}: ${String(error)}`);
      await cache.delete(EndpointCache.#topic, key).catch(() => undefined);
      return undefined;
    }
  }
  static async #write(context: SignalContext, cache: CacheAdaptor, key: string, result: unknown, ttl: number) {
    try {
      const serialized = TaggedJson.stringify(result);
      // `undefined` has no JSON spelling, and an entry holding the string "undefined" would parse back as garbage.
      if (serialized === undefined) return;
      await cache.set(EndpointCache.#topic, key, serialized, { expireAt: dayjs().add(ttl, "millisecond") });
    } catch (error) {
      context.adaptor.logger.warn(`Cache write failed for ${context.key}: ${String(error)}`);
    }
  }
}
