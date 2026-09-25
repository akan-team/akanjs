import { type AkanDynamicUsage, type AkanRequestPolicy, parseCookieHeader } from "akanjs/fetch";

export const DEFAULT_ROUTE_CACHE_TTL_SECONDS = 30;

export interface RouteCacheKeyInput {
  request: Request;
  url: URL;
  theme?: string;
}

export interface RouteCacheRenderState {
  cacheable: boolean;
  routeId?: string;
  revalidate?: number | false;
  tags?: string[];
  dynamicUsage?: AkanDynamicUsage;
  reason?: string;
}

export interface RouteCacheMetadata {
  pathname: string;
  routeId?: string;
  tags?: string[];
}

export interface RouteCacheInvalidation {
  tags?: string[];
  paths?: string[];
  reason?: string;
}

export interface RouteCacheEntry {
  key: string;
  ttl: number;
}

export interface PublicRouteCacheEntryInput extends RouteCacheKeyInput {
  env: {
    enabled?: string | null;
    ttl?: string | null;
    allow?: string | null;
    deny?: string | null;
  };
  defaultTtl?: number;
  defaultEnabled?: boolean;
  defaultAllow?: boolean;
}

export type RouteCacheBypassReason =
  | "env-opt-out"
  | "dev-default-off"
  | "ttl-disabled"
  | "path-excluded"
  | "request-not-public";

export type RouteCacheEntryDecision =
  | { entry: RouteCacheEntry; reason?: undefined }
  | { entry: null; reason: RouteCacheBypassReason };

export type RouteCacheRenderControlType = "redirect" | "not-found" | "error";

export function parsePositiveInt(value: string | undefined | null): number | null {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeRouteCacheTtl(value: unknown, fallback = 30): number | null {
  if (value === false || value === null) return null;
  if (value === undefined) return fallback;
  const ttl = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : null;
}

export function resolveAutoRouteCacheTtl(input: {
  enabled?: string | null;
  ttl?: string | null;
  defaultTtl?: number;
  defaultEnabled?: boolean;
}): number | null {
  if (input.enabled === "0") return null;
  if (input.enabled !== "1" && !input.defaultEnabled) return null;
  return normalizeRouteCacheTtl(input.ttl, input.defaultTtl ?? DEFAULT_ROUTE_CACHE_TTL_SECONDS);
}

export function combineMinRevalidate(...values: Array<number | false | null | undefined>): number | false | undefined {
  let out: number | undefined;
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (value === false) return false;
    out = out === undefined ? value : Math.min(out, value);
  }
  return out;
}

export function getClientFacingOrigin(request: Request, url = new URL(request.url)): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost ?? request.headers.get("host")?.split(",")[0]?.trim();
  const proto = forwardedProto ?? url.protocol.slice(0, -1);
  if (host && proto) {
    try {
      return new URL(`${proto}://${host}`).origin;
    } catch {
      /* fall through to parsed request origin */
    }
  }
  return url.origin;
}

export function isPublicRouteCacheableRequest(request: Request): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.has("authorization")) return false;
  const cookie = request.headers.get("cookie");
  if (!cookie) return true;
  return [...parseCookieHeader(cookie).keys()].every((name) => name === "theme");
}

export function isRouteCachePathAllowed(
  pathname: string,
  options: { allow?: string | null; deny?: string | null; defaultAllow?: boolean } = {},
): boolean {
  const matches = (raw: string | null | undefined) => {
    const prefixes = (raw ?? "")
      .split(",")
      .map((prefix) => prefix.trim())
      .filter(Boolean);
    if (prefixes.length === 0) return false;
    return prefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
    );
  };
  if (matches(options.deny)) return false;
  const allow = options.allow ?? "";
  if (!allow.trim() && options.defaultAllow) return true;
  return matches(allow);
}

export function createRouteCacheKey({ request, url, theme = "" }: RouteCacheKeyInput): string {
  return [
    getClientFacingOrigin(request, url),
    request.headers.get("x-base-path") ?? "",
    request.headers.get("x-locale") ?? "",
    request.headers.get("x-path") ?? "",
    url.pathname,
    url.search,
    request.headers.get("accept-language") ?? "",
    theme,
  ].join("\n");
}

export function createRouteCacheEntry(input: RouteCacheKeyInput & { ttl: number }): RouteCacheEntry {
  return { key: createRouteCacheKey(input), ttl: input.ttl };
}

export function resolvePublicRouteCacheEntryDecision(input: PublicRouteCacheEntryInput): RouteCacheEntryDecision {
  if (input.env.enabled === "0") return { entry: null, reason: "env-opt-out" };
  if (input.env.enabled !== "1" && !input.defaultEnabled) return { entry: null, reason: "dev-default-off" };
  const ttl = resolveAutoRouteCacheTtl({
    enabled: input.env.enabled,
    ttl: input.env.ttl,
    defaultTtl: input.defaultTtl,
    defaultEnabled: input.defaultEnabled,
  });
  if (ttl === null) return { entry: null, reason: "ttl-disabled" };
  if (
    !isRouteCachePathAllowed(input.url.pathname, {
      allow: input.env.allow,
      deny: input.env.deny,
      defaultAllow: input.defaultAllow,
    })
  ) {
    return { entry: null, reason: "path-excluded" };
  }
  if (!isPublicRouteCacheableRequest(input.request)) return { entry: null, reason: "request-not-public" };
  return { entry: createRouteCacheEntry({ request: input.request, url: input.url, theme: input.theme, ttl }) };
}

export function resolvePublicRouteCacheEntry(input: PublicRouteCacheEntryInput): RouteCacheEntry | null {
  return resolvePublicRouteCacheEntryDecision(input).entry;
}

export function resolveRouteCacheStoreTtl(baseTtl: number, state: RouteCacheRenderState): number | null {
  if (!state.cacheable || state.revalidate === false) return null;
  if (typeof state.revalidate !== "number") return baseTtl;
  if (!Number.isFinite(state.revalidate) || state.revalidate <= 0) return null;
  return Math.min(baseTtl, state.revalidate);
}

export function shouldStoreRouteCache(input: {
  policy?: AkanRequestPolicy;
  dynamicUsage?: AkanDynamicUsage;
  renderControlType?: RouteCacheRenderControlType;
  lateRedirect?: boolean;
}): RouteCacheRenderState {
  const dynamicUsage = input.dynamicUsage ? { ...input.dynamicUsage } : undefined;
  const routeId = input.policy?.routeId;
  const tags = input.policy ? [...input.policy.tags] : undefined;
  const revalidate = combineMinRevalidate(input.policy?.revalidate);
  if (input.renderControlType) {
    const reason =
      input.renderControlType === "redirect" && input.lateRedirect
        ? "late-redirect"
        : `render-${input.renderControlType}`;
    return { cacheable: false, routeId, revalidate, tags, dynamicUsage, reason };
  }
  if (dynamicUsage?.headers || dynamicUsage?.cookies)
    return { cacheable: false, routeId, revalidate, tags, dynamicUsage, reason: "dynamic-request-api" };
  return { cacheable: input.policy?.cacheable !== false, routeId, revalidate, tags, dynamicUsage };
}

export function hasRouteCacheInvalidationScope(invalidation?: RouteCacheInvalidation): boolean {
  return Boolean(invalidation?.tags?.length || invalidation?.paths?.length);
}

export function shouldInvalidateRouteCacheEntry(
  metadata: RouteCacheMetadata,
  invalidation: RouteCacheInvalidation,
): boolean {
  if (invalidation.tags?.length) {
    const entryTags = new Set(metadata.tags ?? []);
    if (invalidation.tags.some((tag) => entryTags.has(tag))) return true;
  }
  if (invalidation.paths?.length) {
    return invalidation.paths.some((path) => {
      if (!path) return false;
      const normalized = path.startsWith("/") ? path : `/${path}`;
      return (
        metadata.pathname === normalized ||
        metadata.pathname.startsWith(normalized.endsWith("/") ? normalized : `${normalized}/`) ||
        metadata.routeId === normalized ||
        Boolean(metadata.routeId?.startsWith(normalized.endsWith("/") ? normalized : `${normalized}/`))
      );
    });
  }
  return false;
}

export interface LruTtlCacheOptions<T> {
  /**
   * Measures one entry's payload. Entry count alone says nothing about a cache whose entries span
   * three orders of magnitude, and a byte ceiling needs a running total to enforce. The default
   * reports 0 rather than guessing, so `byteSize` stays honest about not knowing.
   */
  sizeOf?: (value: T) => number;
  /** Total payload ceiling. 0 leaves the cache bounded only by `maxEntries`. */
  maxBytes?: number;
  /** An entry over this is not stored at all, rather than evicting everything else to fit it. */
  maxEntryBytes?: number;
  /**
   * Cadence of the idle sweep. Without one a filled cache never shrinks: an entry is dropped only
   * when its own key is fetched after expiry or when a write evicts it, so a pod that stops
   * serving holds its peak forever — measured at 100 entries / 21.4 MiB still resident 310s after
   * the last request, with a 30s TTL. 0 disables it.
   */
  sweepIntervalMs?: number;
}

export class LruTtlCache<T> {
  readonly #entries = new Map<string, { value: T; expiresAt: number; byteLength: number }>();
  #byteLength = 0;
  #sweepTimer: ReturnType<typeof setInterval> | null = null;
  readonly #sizeOf: (value: T) => number;
  readonly #maxBytes: number;
  readonly #maxEntryBytes: number;

  constructor(
    readonly maxEntries = 100,
    options: LruTtlCacheOptions<T> = {},
  ) {
    this.#sizeOf = options.sizeOf ?? (() => 0);
    this.#maxBytes = options.maxBytes ?? 0;
    this.#maxEntryBytes = options.maxEntryBytes ?? 0;
    const sweepIntervalMs = options.sweepIntervalMs ?? 0;
    if (sweepIntervalMs > 0) {
      this.#sweepTimer = setInterval(() => this.sweepExpired(), sweepIntervalMs);
      // Reclaiming an idle cache must never be the reason a process refuses to exit.
      (this.#sweepTimer as { unref?: () => void }).unref?.();
    }
  }

  get size(): number {
    return this.#entries.size;
  }

  get byteSize(): number {
    return this.#byteLength;
  }

  get(key: string): T | null {
    const entry = this.#entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.#remove(key);
      return null;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  /** Returns whether the entry was stored; a payload over `maxEntryBytes` is rejected. */
  set(key: string, value: T, ttlSeconds: number): boolean {
    this.#remove(key);
    const byteLength = LruTtlCache.#measure(this.#sizeOf, value);
    if (this.#maxEntryBytes > 0 && byteLength > this.#maxEntryBytes) return false;
    this.sweepExpired();
    const maxEntries = this.maxEntries > 0 ? this.maxEntries : 100;
    while (this.#entries.size >= maxEntries) {
      if (!this.#removeOldest()) break;
    }
    while (this.#maxBytes > 0 && this.#entries.size > 0 && this.#byteLength + byteLength > this.#maxBytes) {
      if (!this.#removeOldest()) break;
    }
    this.#entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000, byteLength });
    this.#byteLength += byteLength;
    return true;
  }

  /**
   * Drops every expired entry. Deliberately a full scan rather than a walk from the oldest that
   * stops at the first live entry: insertion order is *LRU* order because `get` reinserts, and TTLs
   * differ per entry, so expiry is not monotonic in map order and an early break would leave
   * expired entries behind. The map is bounded by `maxEntries`, so the scan is cheap.
   */
  sweepExpired(now = Date.now()): number {
    let removed = 0;
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt > now) continue;
      this.#remove(key);
      removed += 1;
    }
    return removed;
  }

  /** Stops the idle sweep. The cache stays usable; only the timer goes away. */
  dispose(): void {
    if (!this.#sweepTimer) return;
    clearInterval(this.#sweepTimer);
    this.#sweepTimer = null;
  }

  delete(key: string): boolean {
    return this.#remove(key);
  }

  invalidate(predicate: (key: string, value: T) => boolean): number {
    let count = 0;
    for (const [key, entry] of this.#entries) {
      if (!predicate(key, entry.value)) continue;
      this.#remove(key);
      count += 1;
    }
    return count;
  }

  clear(): void {
    this.#entries.clear();
    this.#byteLength = 0;
  }

  static parseByteCeiling(value: string | undefined | null, fallback = 0): number {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  #remove(key: string): boolean {
    const entry = this.#entries.get(key);
    if (!entry) return false;
    this.#entries.delete(key);
    this.#byteLength -= entry.byteLength;
    return true;
  }

  #removeOldest(): boolean {
    const oldest = this.#entries.keys().next().value;
    if (!oldest) return false;
    return this.#remove(oldest);
  }

  /** A measurement must never fail a cache write, and a bad measurement must never skew the total. */
  static #measure<T>(sizeOf: (value: T) => number, value: T): number {
    try {
      const measured = sizeOf(value);
      return Number.isFinite(measured) && measured > 0 ? measured : 0;
    } catch {
      return 0;
    }
  }
}
