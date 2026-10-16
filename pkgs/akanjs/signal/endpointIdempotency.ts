import { Binary, FIELD_META } from "akanjs/base";
import { bearerTokenOf, plainFieldsOf, readAuthToken } from "akanjs/common";
import { Err, type ErrPayload } from "akanjs/dictionary";
import { type CacheAdaptor, CacheAdaptorRole } from "akanjs/service";
import dayjs from "dayjs";
import { isExceptionLike } from "./exception";
import { SignalFailure } from "./SignalFailure";
import type { SignalContext } from "./signalContext";

interface AccountClaims {
  id?: unknown;
  sub?: unknown;
  sid?: unknown;
  self?: { id?: unknown } | null;
  me?: { id?: unknown } | null;
  machine?: { kind?: unknown; id?: unknown } | null;
}

type KeptAnswer = { answer: unknown } | { failure: ErrPayload };

//* A mutation sent again under the same `Idempotency-Key` — a retry after a lost answer, an outbox draining twice —
//* runs once: a repeat answers the first run's response, and 409 while that run is still going. It runs after the
//* guards and is keyed to the caller and the call's arguments, so one caller's key never hands another its answer.
//* What it keeps is that answer as it went out — resolved, masked and serialized — never the handler's result, so no
//* hidden or secret field reaches the cache and a repeat is the first response byte for byte.
export class EndpointIdempotency {
  static readonly header = "idempotency-key";
  static readonly keepMs = 24 * 60 * 60_000;
  static readonly #leaseMs = 30_000;
  static readonly #topic = "idempotency";
  static readonly #tag = "\u0000akan";

  //? An MCP call's headers are its JSON-RPC envelope's, and its context answers a value where this replays a Response.
  static applies(context: SignalContext): boolean {
    return context.endpointInfo.type === "mutation" && context.transport === "http" && context.origin === "http";
  }

  /** A Response when the call is kept or replayed; otherwise the handler's own result, which the caller answers. */
  static async through(
    context: SignalContext,
    run: () => Promise<unknown>,
    answer: (result: unknown) => Promise<unknown>,
  ) {
    if (!EndpointIdempotency.applies(context)) return await run();
    const { req } = context.getHttpContext();
    const idempotencyKey = req.headers.get(EndpointIdempotency.header)?.trim();
    if (!idempotencyKey || idempotencyKey.length > 256) return await run();
    //? Anonymous callers share no identity to key on, so one's answer — a session included — would replay to another.
    const caller = EndpointIdempotency.#callerOf(context, req);
    if (!caller) return await run();
    const cache = context.getAdaptor(CacheAdaptorRole) as unknown as CacheAdaptor;
    const args = EndpointIdempotency.#digest(EndpointIdempotency.#encode(context.args));
    const key = `${context.key}:${caller}:${args}:${idempotencyKey}`;
    const owner = `running:${Bun.randomUUIDv7()}`;
    let claimed: boolean;
    try {
      claimed = await cache.acquireLease(EndpointIdempotency.#topic, key, owner, EndpointIdempotency.#leaseMs);
    } catch (error) {
      context.adaptor.logger.warn(`Idempotency claim failed for ${context.key}, running without it: ${String(error)}`);
      return await run();
    }
    if (!claimed) return await EndpointIdempotency.#replay(context, cache, key);
    return await EndpointIdempotency.#runHolding(context, cache, key, owner, { run, answer });
  }

  //? An unreadable entry answers 409 rather than running: the key is known to be taken, and the client retries a 409.
  static async #replay(context: SignalContext, cache: CacheAdaptor, key: string) {
    let stored: unknown;
    try {
      stored = await cache.get<string>(EndpointIdempotency.#topic, key);
    } catch (error) {
      context.adaptor.logger.warn(`Idempotency read failed for ${context.key}: ${String(error)}`);
    }
    const kept = EndpointIdempotency.#decode(stored);
    if (!kept) throw new Err.Conflict("base.error.idempotencyInFlight");
    if ("failure" in kept) throw Err.fromJSON(kept.failure);
    return context.getHttpContext().res.json(kept.answer);
  }

  static async #release(cache: CacheAdaptor, key: string, owner: string) {
    try {
      await cache.releaseLease(EndpointIdempotency.#topic, key, owner);
    } catch {
      //? Unreleased, the lease lapses on its own within one lease.
    }
  }

  //? Renewed while the handler runs, however long that is; one whose process died frees the key a lease later.
  static async #runHolding(
    context: SignalContext,
    cache: CacheAdaptor,
    key: string,
    owner: string,
    { run, answer }: { run: () => Promise<unknown>; answer: (result: unknown) => Promise<unknown> },
  ) {
    const renew = async () => {
      try {
        await cache.renewLease(EndpointIdempotency.#topic, key, owner, EndpointIdempotency.#leaseMs);
      } catch (error) {
        context.adaptor.logger.warn(`Idempotency lease of ${context.key} was not renewed: ${String(error)}`);
      }
    };
    const renewal = setInterval(() => void renew(), EndpointIdempotency.#leaseMs / 3);
    let result: unknown;
    try {
      result = await run();
    } catch (error) {
      clearInterval(renewal);
      await EndpointIdempotency.#release(cache, key, owner);
      throw error;
    }
    //? A Response carries headers no stored body replays — a session's Set-Cookie among them — so a repeat runs again.
    if (result instanceof Response) {
      clearInterval(renewal);
      await EndpointIdempotency.#release(cache, key, owner);
      return result;
    }
    let wire: unknown;
    try {
      wire = await answer(result);
    } catch (error) {
      clearInterval(renewal);
      //? The handler ran and its writes stand, so a repeat answers this failure instead of running them again.
      await EndpointIdempotency.#keep(context, cache, key, owner, { failure: EndpointIdempotency.#failureOf(error) });
      throw error;
    }
    clearInterval(renewal);
    await EndpointIdempotency.#keep(context, cache, key, owner, { answer: wire ?? null });
    return context.getHttpContext().res.json(wire);
  }

  static async #keep(context: SignalContext, cache: CacheAdaptor, key: string, owner: string, kept: KeptAnswer) {
    try {
      await cache.set(EndpointIdempotency.#topic, key, JSON.stringify(kept), {
        expireAt: dayjs().add(EndpointIdempotency.keepMs, "millisecond"),
      });
    } catch (error) {
      context.adaptor.logger.warn(`Idempotency write failed for ${context.key}: ${String(error)}`);
      await EndpointIdempotency.#release(cache, key, owner);
    }
  }

  //? As the caller read it: a domain error with its key and data, anything else as the generalized 500.
  static #failureOf(error: unknown): ErrPayload {
    return isExceptionLike(error) ? (error.toJSON() as ErrPayload) : { error: SignalFailure.message, statusCode: 500 };
  }

  static #callerOf(context: SignalContext, req: Request & { cookies?: Bun.CookieMap }) {
    const principal = EndpointIdempotency.#principalOf(context.get("account"));
    if (principal) return EndpointIdempotency.#digest(`account:${principal}`);
    const header = req.headers.get("authorization");
    const cookie = header === null ? readAuthToken((name) => req.cookies?.get(name) ?? undefined) : undefined;
    //? As the account layer reads it: a header wins over the cookie whatever it holds, and only a bearer token counts.
    const credential = bearerTokenOf(header ?? (cookie ? `Bearer ${cookie}` : null));
    return credential ? EndpointIdempotency.#digest(`credential:${credential}`) : null;
  }

  //? Who the token names, not the token: a refreshed or re-issued one still finds the caller's keys.
  static #principalOf(account: unknown) {
    if (!account || typeof account !== "object") return null;
    const { id, sub, sid, self, me, machine } = account as AccountClaims;
    const machineId =
      typeof machine?.kind === "string" && typeof machine.id === "string" ? `${machine.kind}:${machine.id}` : null;
    const claims = Object.entries({ id, self: self?.id, me: me?.id, sub, machine: machineId }).filter(
      (claim): claim is [string, string] => typeof claim[1] === "string" && claim[1] !== "",
    );
    if (claims.length) return claims.map(([name, value]) => `${name}=${value}`).join("&");
    return typeof sid === "string" && sid ? `sid=${sid}` : null;
  }

  static #digest(text: string) {
    return new Bun.CryptoHasher("sha256").update(text).digest("hex").slice(0, 32);
  }

  static #encode(value: unknown) {
    return JSON.stringify(EndpointIdempotency.#toDigested(value));
  }

  //? JSON spells a Map `{}` and bytes an index map, so two calls that differ only there would share one digest.
  static #toDigested(value: unknown): unknown {
    const tag = EndpointIdempotency.#tag;
    if (value instanceof Map)
      return { [tag]: "map", entries: [...value].map(([key, item]) => [key, EndpointIdempotency.#toDigested(item)]) };
    if (ArrayBuffer.isView(value))
      return {
        [tag]: "bytes",
        base64: Binary.serializeValue(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
      };
    if (Array.isArray(value)) return value.map((item) => EndpointIdempotency.#toDigested(item));
    if (!EndpointIdempotency.#isRecord(value)) return value;
    return Object.fromEntries(
      Object.entries(plainFieldsOf(value)).map(([key, item]) => [key, EndpointIdempotency.#toDigested(item)]),
    );
  }

  static #isRecord(value: unknown): value is object {
    if (!value || typeof value !== "object") return false;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype === null || prototype === Object.prototype) return true;
    const modelCls: unknown = (value as { constructor?: unknown }).constructor;
    return typeof modelCls === "function" && FIELD_META in modelCls;
  }

  static #decode(stored: unknown): KeptAnswer | null {
    if (typeof stored !== "string" || !stored.startsWith("{")) return null;
    let kept: { answer?: unknown; failure?: ErrPayload };
    try {
      kept = JSON.parse(stored) as { answer?: unknown; failure?: ErrPayload };
    } catch {
      return null;
    }
    if ("answer" in kept) return { answer: kept.answer };
    return typeof kept.failure?.error === "string" ? { failure: kept.failure } : null;
  }
}
