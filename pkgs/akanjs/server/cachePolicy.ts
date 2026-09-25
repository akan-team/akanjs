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

export class LruTtlCache<T> {
  readonly #entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(readonly maxEntries = 100) {}

  get size(): number {
    return this.#entries.size;
  }

  get(key: string): T | null {
    const entry = this.#entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return null;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlSeconds: number): void {
    this.#entries.delete(key);
    const maxEntries = this.maxEntries > 0 ? this.maxEntries : 100;
    while (this.#entries.size >= maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (!oldest) break;
      this.#entries.delete(oldest);
    }
    this.#entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  delete(key: string): boolean {
    return this.#entries.delete(key);
  }

  invalidate(predicate: (key: string, value: T) => boolean): number {
    let count = 0;
    for (const [key, entry] of this.#entries) {
      if (!predicate(key, entry.value)) continue;
      this.#entries.delete(key);
      count += 1;
    }
    return count;
  }

  clear(): void {
    this.#entries.clear();
  }
}
