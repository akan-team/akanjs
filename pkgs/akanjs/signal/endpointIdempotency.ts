import { readAuthToken } from "akanjs/common";
import { Err } from "akanjs/dictionary";
import { type CacheAdaptor, CacheAdaptorRole } from "akanjs/service";
import dayjs from "dayjs";
import type { SignalContext } from "./signalContext";

type Entry = { running: true } | { result: unknown };

//* A mutation sent again under the same `Idempotency-Key` — a retry after a lost answer, an outbox draining twice —
//* runs once: a repeat answers the first run's result, and 409 while that run is still going. Like `EndpointCache` it
//* runs after the guards, keeps the handler's result (masked per call afterwards), and is keyed to the caller, so one
//* caller's key never hands another its answer.
export class EndpointIdempotency {
  static readonly header = "idempotency-key";
  static readonly keepMs = 24 * 60 * 60_000;
  static readonly #topic = "idempotency";

  static async through(context: SignalContext, run: () => Promise<unknown>) {
    if (context.endpointInfo.type !== "mutation" || context.transport !== "http") return await run();
    const { req } = context.getHttpContext();
    const idempotencyKey = req.headers.get(EndpointIdempotency.header)?.trim();
    if (!idempotencyKey || idempotencyKey.length > 256) return await run();
    const cache = context.getAdaptor(CacheAdaptorRole) as unknown as CacheAdaptor;
    const key = `${context.key}:${EndpointIdempotency.#callerOf(req)}:${idempotencyKey}`;
    //? A run that died with its process stops blocking the key once its own deadline, doubled, has passed.
    const runningMs = 2 * (context.endpointInfo.signalOption.timeout ?? 30_000);
    const claimed = await cache.setIfAbsent(EndpointIdempotency.#topic, key, JSON.stringify({ running: true }), {
      expireAt: dayjs().add(runningMs, "millisecond"),
    });
    if (!claimed) {
      const stored = await cache.get<string>(EndpointIdempotency.#topic, key);
      const entry = stored ? (JSON.parse(stored) as Entry) : null;
      if (entry && "result" in entry) return entry.result;
      throw new Err.Conflict("base.error.idempotencyInFlight");
    }
    let result: unknown;
    try {
      result = await run();
    } catch (error) {
      await cache.delete(EndpointIdempotency.#topic, key).catch(() => undefined);
      throw error;
    }
    const serialized = JSON.stringify({ result: result ?? null });
    await cache
      .set(EndpointIdempotency.#topic, key, serialized, {
        expireAt: dayjs().add(EndpointIdempotency.keepMs, "millisecond"),
      })
      .catch((error: unknown) => context.adaptor.logger.warn(`Idempotency write failed for ${context.key}: ${error}`));
    return result;
  }

  static #callerOf(req: Request & { cookies?: Bun.CookieMap }) {
    const credential =
      req.headers.get("authorization") ?? readAuthToken((name) => req.cookies?.get(name) ?? undefined) ?? "";
    return new Bun.CryptoHasher("sha256").update(credential).digest("hex").slice(0, 32);
  }
}
