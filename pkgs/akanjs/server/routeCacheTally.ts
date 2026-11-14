//? `rewritten-query`: the request's query was reordered or carried a tracking parameter, so its canonical key differs.
const lookupReasons = ["canonical-query", "rewritten-query"] as const;
const bypassReasons = [
  "env-opt-out",
  "dev-default-off",
  "ttl-disabled",
  "path-excluded",
  "request-not-public",
  "dev-registry",
  "no-route",
  "other",
] as const;

export type RouteCacheName = "rsc" | "html";
export type RouteCacheLookupReason = (typeof lookupReasons)[number];
export type RouteCacheBypassReason = (typeof bypassReasons)[number];

export interface RouteCacheOutcomeCounts {
  hit: Record<RouteCacheLookupReason, number>;
  miss: Record<RouteCacheLookupReason, number>;
  bypass: Record<RouteCacheBypassReason, number>;
}

export interface RouteCacheTallySnapshot {
  rsc: RouteCacheOutcomeCounts;
  html: RouteCacheOutcomeCounts;
}

export class RouteCacheTally {
  static readonly #counts: RouteCacheTallySnapshot = { rsc: RouteCacheTally.#empty(), html: RouteCacheTally.#empty() };

  static lookup(cache: RouteCacheName, isHit: boolean, reason: RouteCacheLookupReason): void {
    RouteCacheTally.#counts[cache][isHit ? "hit" : "miss"][reason] += 1;
  }

  static bypass(cache: RouteCacheName, reason: string | undefined): void {
    const known = bypassReasons.find((name) => name === reason) ?? "other";
    RouteCacheTally.#counts[cache].bypass[known] += 1;
  }

  static snapshot(): RouteCacheTallySnapshot {
    return structuredClone(RouteCacheTally.#counts);
  }

  static #empty(): RouteCacheOutcomeCounts {
    const zeros = <Reason extends string>(reasons: readonly Reason[]) =>
      Object.fromEntries(reasons.map((reason) => [reason, 0])) as Record<Reason, number>;
    return { hit: zeros(lookupReasons), miss: zeros(lookupReasons), bypass: zeros(bypassReasons) };
  }
}
