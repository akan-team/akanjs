import { CookieJar, originFromRequest } from "akanjs/common";
import type { AkanDynamicUsage, AkanRequestPolicy } from "akanjs/fetch";

export const DEFAULT_ROUTE_CACHE_TTL_SECONDS = 30;

export interface RouteCacheKeyInput {
  request: Request;
  url: URL;
  theme?: string;
  variant?: string;
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

export function getClientFacingOrigin(request: Request, url = new URL(request.url)): string {
  return originFromRequest(request.headers, url);
}

export function isPublicRouteCacheableRequest(request: Request): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.has("authorization")) return false;
  const cookie = request.headers.get("cookie");
  if (!cookie) return true;
  return CookieJar.parse(cookie)
    .names()
    .every((name) => name === "theme");
}

const isAtOrUnder = (value: string, prefix: string) =>
  value === prefix || value.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);

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
    return prefixes.some((prefix) => isAtOrUnder(pathname, prefix));
  };
  if (matches(options.deny)) return false;
  const allow = options.allow ?? "";
  if (!allow.trim() && options.defaultAllow) return true;
  return matches(allow);
}

export function createRouteCacheKey({ request, url, theme = "", variant }: RouteCacheKeyInput): string {
  return [
    getClientFacingOrigin(request, url),
    request.headers.get("x-base-path") ?? "",
    request.headers.get("x-locale") ?? "",
    request.headers.get("x-path") ?? "",
    url.pathname,
    url.search,
    request.headers.get("accept-language") ?? "",
    theme,
    ...(variant ? [variant] : []),
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
  return {
    entry: createRouteCacheEntry({
      request: input.request,
      url: input.url,
      theme: input.theme,
      variant: input.variant,
      ttl,
    }),
  };
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
  const revalidate = input.policy?.revalidate;
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
        isAtOrUnder(metadata.pathname, normalized) || (!!metadata.routeId && isAtOrUnder(metadata.routeId, normalized))
      );
    });
  }
  return false;
}

export interface LruTtlCacheOptions<T> {
  /** Defaults to reporting 0 rather than guessing, so `byteSize` stays honest about not knowing. */
  sizeOf?: (value: T) => number;
  /** Total payload ceiling. 0 leaves the cache bounded only by `maxEntries`. */
  maxBytes?: number;
  /** An entry over this is not stored at all, rather than evicting everything else to fit it. */
  maxEntryBytes?: number;
  /** Idle sweep cadence; without it a cache nobody reads or writes never releases expired entries. 0 disables it. */
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

  // A full scan on purpose: map order is LRU (`get` reinserts) and TTLs differ, so expiry is not monotonic in it.
  sweepExpired(now = Date.now()): number {
    let removed = 0;
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt > now) continue;
      this.#remove(key);
      removed += 1;
    }
    return removed;
  }

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
    return parsePositiveInt(value) ?? fallback;
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
    if (oldest === undefined) return false;
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
