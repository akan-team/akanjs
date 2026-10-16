import { Logger } from "akanjs/common";
import { CacheAdaptorRole, type RateCounter, RateLimiter } from "akanjs/service";
import type { EndpointInfo } from "./endpointInfo";
import { Exception } from "./exception";
import type { SignalContext } from "./signalContext";

export interface RateLimitBudget {
  calls: number;
  /** 60_000 when unset. */
  windowMs?: number;
  /** `ip` (default) counts the caller's address; `account` counts `accountKey(account)`, else the address. */
  by?: "ip" | "account";
}

export interface RateLimitSetting {
  /** `false` lets every budget stand aside, as for a deployment rate-limited at its edge. */
  enabled?: boolean;
  /** The budget of every endpoint that declares none; unset leaves those unlimited. */
  budget?: RateLimitBudget;
  /** By endpoint key, over what the endpoint declares (a lib's included); `false` exempts it. */
  endpoints?: { [key: string]: Partial<RateLimitBudget> | false };
  /** Who `by: "account"` counts; nothing returned counts the caller's address instead. */
  accountKey?: (account: unknown) => string | null | undefined;
}

type ResolvedBudget = Required<RateLimitBudget>;

export class EndpointRateLimit {
  static readonly #logger = new Logger("EndpointRateLimit");
  static readonly #defaultWindowMs = 60_000;
  static #enabled: boolean | undefined;
  static #budget: RateLimitBudget | null = null;
  static #endpoints: NonNullable<RateLimitSetting["endpoints"]> = {};
  static #accountKey: NonNullable<RateLimitSetting["accountKey"]> = (account) => EndpointRateLimit.#claimOf(account);
  static readonly #limiters = new WeakMap<object, RateLimiter>();
  static #localLimiter: RateLimiter | null = null;
  static readonly #warned = new Set<string>();

  /** Merges over what an earlier call set, so libs configure in mount order and the app's `option.ts` goes last. */
  static configure(setting: RateLimitSetting | false) {
    if (setting === false) {
      EndpointRateLimit.#enabled = false;
      return;
    }
    if (setting.enabled !== undefined) EndpointRateLimit.#enabled = setting.enabled;
    if (setting.budget) EndpointRateLimit.#budget = setting.budget;
    if (setting.endpoints) EndpointRateLimit.#endpoints = { ...EndpointRateLimit.#endpoints, ...setting.endpoints };
    if (setting.accountKey) EndpointRateLimit.#accountKey = setting.accountKey;
  }

  /**
   * `off` wins over the code, `on` turns budgets on in a local environment, and `<calls>[/<seconds>]` is the default
   * budget wherever the code names none. Unset, budgets apply everywhere but `local`.
   */
  static applyEnv(value: string | undefined, environment: string) {
    const raw = value?.trim().toLowerCase() ?? "";
    if (raw === "off" || raw === "false" || raw === "0") {
      EndpointRateLimit.#enabled = false;
      return;
    }
    const [calls, seconds] = raw.split("/").map((part) => Number(part));
    const budget = Number.isInteger(calls) && calls > 0 ? { calls, windowMs: (seconds || 60) * 1000 } : null;
    if (budget && !EndpointRateLimit.#budget) EndpointRateLimit.#budget = budget;
    const switchedOn = raw === "on" || raw === "true" || raw === "1" || !!budget;
    EndpointRateLimit.#enabled ??= switchedOn || environment !== "local";
  }

  static reset() {
    EndpointRateLimit.#enabled = undefined;
    EndpointRateLimit.#budget = null;
    EndpointRateLimit.#endpoints = {};
    EndpointRateLimit.#accountKey = (account) => EndpointRateLimit.#claimOf(account);
    EndpointRateLimit.#localLimiter = null;
    EndpointRateLimit.#warned.clear();
  }

  static budgetOf(key: string, endpointInfo: EndpointInfo): ResolvedBudget | null {
    if (EndpointRateLimit.#enabled === false) return null;
    const override = EndpointRateLimit.#endpoints[key];
    if (override === false) return null;
    const declared = endpointInfo.signalOption.rateLimit;
    const base = declared === false ? null : (declared ?? EndpointRateLimit.#budget);
    const merged = override ? { ...base, ...override } : base;
    const calls = Math.floor(Number(merged?.calls));
    if (!merged || !(calls >= 1)) return null;
    const windowMs = Math.floor(Number(merged.windowMs ?? EndpointRateLimit.#defaultWindowMs));
    return {
      calls,
      windowMs: windowMs >= 1 ? windowMs : EndpointRateLimit.#defaultWindowMs,
      by: merged.by === "account" ? "account" : "ip",
    };
  }

  /** `ip` runs before the request body is read; `account` after the middlewares resolved the caller. */
  static admit(context: SignalContext, phase: "ip" | "account"): Promise<void> | undefined {
    const budget = EndpointRateLimit.budgetOf(context.key, context.endpointInfo);
    if (!budget || budget.by !== phase) return undefined;
    return EndpointRateLimit.#consume(context, phase, budget);
  }

  static async #consume(context: SignalContext, phase: "ip" | "account", budget: ResolvedBudget) {
    const caller =
      (phase === "account" ? EndpointRateLimit.#accountOf(context) : null) ?? EndpointRateLimit.#ipOf(context);
    const verdict = await EndpointRateLimit.#limiterOf(context).consume(`${context.key}:${caller}`, budget);
    if (verdict.ok) return;
    EndpointRateLimit.#warnOnce(
      `refused:${context.key}`,
      `"${context.key}" refused a caller over its budget of ${budget.calls} calls / ${Math.round(budget.windowMs / 1000)}s by ${budget.by}; later refusals are not logged.`,
    );
    throw new Exception(429, "base.error.tooManyRequests", undefined, {
      seconds: Math.max(1, Math.ceil(verdict.retryAfterMs / 1000)),
    });
  }

  static #accountOf(context: SignalContext) {
    const key = EndpointRateLimit.#accountKey(context.get("account"));
    return typeof key === "string" && key ? `account:${key}` : null;
  }

  // Fail closed: callers whose address is unknown share one budget rather than each getting a fresh one.
  static #ipOf(context: SignalContext) {
    const ip = context.getClientIp();
    if (ip) return `ip:${ip}`;
    EndpointRateLimit.#warnOnce(
      "unknown-ip",
      `Rate limit cannot resolve the caller's address (first on "${context.key}"), so every such caller shares one budget. Check that the proxy in front records X-Real-IP or X-Forwarded-For and is trusted (AKAN_TRUSTED_PROXIES).`,
    );
    return "ip:unknown";
  }

  static #limiterOf(context: SignalContext) {
    const cache = EndpointRateLimit.#cacheOf(context);
    if (!cache) {
      EndpointRateLimit.#localLimiter ??= new RateLimiter(null, { topic: "endpointRate" });
      return EndpointRateLimit.#localLimiter;
    }
    const found = EndpointRateLimit.#limiters.get(cache);
    if (found) return found;
    const limiter = new RateLimiter(cache, { topic: "endpointRate" });
    EndpointRateLimit.#limiters.set(cache, limiter);
    return limiter;
  }

  static #cacheOf(context: SignalContext): (RateCounter & object) | null {
    try {
      return context.getAdaptor(CacheAdaptorRole) as unknown as RateCounter & object;
    } catch {
      return null;
    }
  }

  static #claimOf(account: unknown) {
    if (!account || typeof account !== "object") return null;
    const { id, sub, sid } = account as { id?: unknown; sub?: unknown; sid?: unknown };
    const claim = [id, sub, sid].find((value) => typeof value === "string" && value);
    return typeof claim === "string" ? claim : null;
  }

  static #warnOnce(key: string, message: string) {
    if (EndpointRateLimit.#warned.has(key)) return;
    EndpointRateLimit.#warned.add(key);
    EndpointRateLimit.#logger.warn(message);
  }
}
