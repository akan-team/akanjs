import { Binary, FIELD_META } from "akanjs/base";
import { plainFieldsOf, readAuthToken } from "akanjs/common";
import { Err } from "akanjs/dictionary";
import { type CacheAdaptor, CacheAdaptorRole } from "akanjs/service";
import dayjs from "dayjs";
import type { SignalContext } from "./signalContext";

interface AccountClaims {
  id?: unknown;
  sub?: unknown;
  sid?: unknown;
  self?: { id?: unknown } | null;
  me?: { id?: unknown } | null;
  machine?: { kind?: unknown; id?: unknown } | null;
}

//* A mutation sent again under the same `Idempotency-Key` — a retry after a lost answer, an outbox draining twice —
//* runs once: a repeat answers the first run's result, and 409 while that run is still going. Like `EndpointCache` it
//* runs after the guards, keeps the handler's result (masked per call afterwards), and is keyed to the caller and the
//* call's arguments, so one caller's key never hands another its answer.
export class EndpointIdempotency {
  static readonly header = "idempotency-key";
  static readonly keepMs = 24 * 60 * 60_000;
  static readonly #leaseMs = 30_000;
  static readonly #topic = "idempotency";
  static readonly #tag = "\u0000akan";

  static async through(context: SignalContext, run: () => Promise<unknown>) {
    if (context.endpointInfo.type !== "mutation" || context.transport !== "http") return await run();
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
    return await EndpointIdempotency.#runHolding(context, cache, key, owner, run);
  }

  //? An unreadable entry answers 409 rather than running: the key is known to be taken, and the client retries a 409.
  static async #replay(context: SignalContext, cache: CacheAdaptor, key: string) {
    let stored: unknown;
    try {
      stored = await cache.get<string>(EndpointIdempotency.#topic, key);
    } catch (error) {
      context.adaptor.logger.warn(`Idempotency read failed for ${context.key}: ${String(error)}`);
    }
    const entry = EndpointIdempotency.#decode(stored);
    if (entry) return entry.result;
    throw new Err.Conflict("base.error.idempotencyInFlight");
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
    run: () => Promise<unknown>,
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
    clearInterval(renewal);
    await EndpointIdempotency.#keep(context, cache, key, owner, result);
    return result;
  }

  //? A Response carries headers no stored body replays — a session's Set-Cookie among them — so a repeat runs again.
  static async #keep(context: SignalContext, cache: CacheAdaptor, key: string, owner: string, result: unknown) {
    if (result instanceof Response) return await EndpointIdempotency.#release(cache, key, owner);
    try {
      const entry = EndpointIdempotency.#encode({ result: result ?? null });
      await cache.set(EndpointIdempotency.#topic, key, entry, {
        expireAt: dayjs().add(EndpointIdempotency.keepMs, "millisecond"),
      });
    } catch (error) {
      context.adaptor.logger.warn(`Idempotency write failed for ${context.key}: ${String(error)}`);
      await EndpointIdempotency.#release(cache, key, owner);
    }
  }

  static #callerOf(context: SignalContext, req: Request & { cookies?: Bun.CookieMap }) {
    const principal = EndpointIdempotency.#principalOf(context.get("account"));
    if (principal) return EndpointIdempotency.#digest(`account:${principal}`);
    const credential = (
      req.headers.get("authorization") ?? readAuthToken((name) => req.cookies?.get(name) ?? undefined)
    )?.replace(/^bearer\s+/i, "");
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
    return JSON.stringify(EndpointIdempotency.#toStored(value));
  }

  //? JSON spells a Map `{}`, bytes an index map, and a document's toJSON flattens its Maps: none of it replays.
  static #toStored(value: unknown): unknown {
    const tag = EndpointIdempotency.#tag;
    if (value instanceof Map)
      return { [tag]: "map", entries: [...value].map(([key, item]) => [key, EndpointIdempotency.#toStored(item)]) };
    if (ArrayBuffer.isView(value))
      return {
        [tag]: "bytes",
        base64: Binary.serializeValue(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
      };
    if (Array.isArray(value)) return value.map((item) => EndpointIdempotency.#toStored(item));
    if (!EndpointIdempotency.#isRecord(value)) return value;
    return Object.fromEntries(
      Object.entries(plainFieldsOf(value)).map(([key, item]) => [key, EndpointIdempotency.#toStored(item)]),
    );
  }

  static #isRecord(value: unknown): value is object {
    if (!value || typeof value !== "object") return false;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype === null || prototype === Object.prototype) return true;
    const modelCls: unknown = (value as { constructor?: unknown }).constructor;
    return typeof modelCls === "function" && FIELD_META in modelCls;
  }

  static #decode(stored: unknown): { result: unknown } | null {
    if (typeof stored !== "string" || !stored.startsWith("{")) return null;
    const entry = JSON.parse(stored, EndpointIdempotency.#revive) as { result?: unknown };
    return "result" in entry ? { result: entry.result } : null;
  }

  static #revive(_key: string, value: unknown) {
    if (!value || typeof value !== "object" || !(EndpointIdempotency.#tag in value)) return value;
    const { [EndpointIdempotency.#tag]: kind, entries, base64 } = value as Record<string, unknown>;
    if (kind === "map") return new Map(entries as [string, unknown][]);
    if (kind === "bytes" && typeof base64 === "string") return Binary.parseValue(base64);
    return value;
  }
}
