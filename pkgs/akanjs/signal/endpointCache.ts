import { type CacheAdaptor, CacheAdaptorRole, EndpointCacheKeys } from "akanjs/service";
import dayjs from "dayjs";
import type { EndpointInfo } from "./endpointInfo";
import type { SignalContext } from "./signalContext";
import { TaggedJson } from "./TaggedJson";
import { traceCache } from "./trace";

interface EndpointFlight {
  startedAt: number;
  stale: boolean;
  run: Promise<EndpointOutcome>;
}
interface EndpointOutcome {
  serialized: string | undefined;
  result: unknown;
}

const flightStore = process as unknown as { __akanEndpointCacheFlights?: Map<string, EndpointFlight> };
flightStore.__akanEndpointCacheFlights ??= new Map();
const inflight = flightStore.__akanEndpointCacheFlights;
const FLIGHT_CAP_MS = 60_000;

// Not a middleware: it runs after the guards (which a lib's account middleware feeds), so a hit reaches only an
// admitted caller, inside the `timeout` deadline. The entry is shared, hence no internal arguments.
export class EndpointCache {
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
    const key = await EndpointCache.#key(context, cache);
    if (key === undefined) return await run();
    const cached = await EndpointCache.#read(context, cache, key);
    if (cached !== undefined) {
      traceCache(true);
      return cached;
    }
    traceCache(false);
    const joined = inflight.get(key);
    const outcome =
      joined && EndpointCache.#joinable(context, joined)
        ? await joined.run
        : await EndpointCache.#lead(context, cache, key, ttl, run);
    return EndpointCache.#own(context, outcome);
  }
  //? A run the Timeout middleware abandoned never settles, so one older than the deadline is no longer joined.
  static #joinable(context: SignalContext, flight: EndpointFlight) {
    return (
      !flight.stale && Date.now() - flight.startedAt <= (context.endpointInfo.signalOption.timeout || FLIGHT_CAP_MS)
    );
  }
  static #lead(context: SignalContext, cache: CacheAdaptor, key: string, ttl: number, run: () => Promise<unknown>) {
    const flight = { startedAt: Date.now(), stale: false } as EndpointFlight;
    flight.run = (async () => {
      const result = await run();
      const serialized = EndpointCache.#serialize(context, result);
      if (serialized !== undefined && !flight.stale && inflight.get(key) === flight)
        await EndpointCache.#write(context, cache, key, serialized, ttl);
      return { serialized, result };
    })().finally(() => {
      if (inflight.get(key) === flight) inflight.delete(key);
    });
    inflight.set(key, flight);
    return flight.run;
  }
  // Each caller parses its own copy, as a hit does: a middleware or resolveField that edits it reaches no other caller.
  static #own(context: SignalContext, { serialized, result }: EndpointOutcome) {
    if (serialized === undefined) return result;
    try {
      const { returnRef, arrDepth } = context.endpointInfo.returns;
      return TaggedJson.parse(serialized, { ref: returnRef, arrDepth });
    } catch (error) {
      context.adaptor.logger.warn(`Cache read failed for ${context.key}: ${String(error)}`);
      return result;
    }
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
  static async #key(context: SignalContext, cache: CacheAdaptor) {
    try {
      return await EndpointCacheKeys.entryKey(cache, context.key, context.args);
    } catch (error) {
      context.adaptor.logger.warn(`Cache read failed for ${context.key}: ${String(error)}`);
      return undefined;
    }
  }
  static async #read(context: SignalContext, cache: CacheAdaptor, key: string) {
    try {
      const cached = await cache.get<string>(EndpointCacheKeys.topic, key);
      if (cached == null) return undefined;
      const { returnRef, arrDepth } = context.endpointInfo.returns;
      return TaggedJson.parse(cached, { ref: returnRef, arrDepth });
    } catch (error) {
      context.adaptor.logger.warn(`Cache read failed for ${context.key}: ${String(error)}`);
      await cache.delete(EndpointCacheKeys.topic, key).catch(() => undefined);
      return undefined;
    }
  }
  static #serialize(context: SignalContext, result: unknown) {
    try {
      // `undefined` has no JSON spelling, and an entry holding the string "undefined" would parse back as garbage.
      return TaggedJson.stringify(result);
    } catch (error) {
      context.adaptor.logger.warn(`Cache write failed for ${context.key}: ${String(error)}`);
      return undefined;
    }
  }
  static async #write(context: SignalContext, cache: CacheAdaptor, key: string, serialized: string, ttl: number) {
    try {
      // Capped at the generation's life: an entry outliving its token is stored but no read can reach it.
      const lifeMs = Math.min(ttl, EndpointCacheKeys.generationTtlMs);
      await cache.set(EndpointCacheKeys.topic, key, serialized, { expireAt: dayjs().add(lifeMs, "millisecond") });
    } catch (error) {
      context.adaptor.logger.warn(`Cache write failed for ${context.key}: ${String(error)}`);
    }
  }
}
