import type { AkanMetricFamily } from "akanjs/service";

//? `rewritten-query`: the route's key took the query sorted and without tracking parameters, not as it was asked.
const lookupReasons = ["requested-query", "rewritten-query"] as const;
const bypassReasons = [
  "env-opt-out",
  "dev-default-off",
  "ttl-disabled",
  "path-excluded",
  "request-not-public",
  "dev-registry",
  "no-route",
  "script-hashes",
  "dynamic-request-api",
  "render-not-found",
  "render-redirect",
  "late-redirect",
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

  static family(cache: RouteCacheName): AkanMetricFamily {
    const counts = RouteCacheTally.#counts[cache];
    const samples = (["hit", "miss", "bypass"] as const).flatMap((outcome) =>
      Object.entries<number>(counts[outcome]).map(([reason, value]) => ({ labels: { cache, outcome, reason }, value })),
    );
    return {
      name: "akan_route_cache_lookups_total",
      help: "Route cache lookups by cache, as a hit or miss by how the key took the query, or a bypass by why it skipped the cache.",
      type: "counter",
      samples,
    };
  }

  static #empty(): RouteCacheOutcomeCounts {
    const zeros = <Reason extends string>(reasons: readonly Reason[]) =>
      Object.fromEntries(reasons.map((reason) => [reason, 0])) as Record<Reason, number>;
    return { hit: zeros(lookupReasons), miss: zeros(lookupReasons), bypass: zeros(bypassReasons) };
  }
}
