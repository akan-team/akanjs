import { describe, expect, test } from "bun:test";
import {
  combineMinRevalidate,
  createRouteCacheEntry,
  createRouteCacheKey,
  getClientFacingOrigin,
  isPublicRouteCacheableRequest,
  isRouteCachePathAllowed,
  LruTtlCache,
  normalizeRouteCacheTtl,
  parsePositiveInt,
  resolveAutoRouteCacheTtl,
  resolvePublicRouteCacheEntry,
  resolvePublicRouteCacheEntryDecision,
  resolveRouteCacheStoreTtl,
  shouldInvalidateRouteCacheEntry,
  shouldStoreRouteCache,
} from "./cachePolicy";

describe("route cache policy helpers", () => {
  test("normalizes positive integers and route cache TTLs", () => {
    expect(parsePositiveInt("12")).toBe(12);
    expect(parsePositiveInt("0")).toBeNull();
    expect(normalizeRouteCacheTtl(undefined)).toBe(30);
    expect(normalizeRouteCacheTtl(false)).toBeNull();
    expect(normalizeRouteCacheTtl(60)).toBe(60);
  });

  test("enables automatic route cache only for explicit opt-in or production defaults", () => {
    expect(resolveAutoRouteCacheTtl({})).toBeNull();
    expect(resolveAutoRouteCacheTtl({ enabled: "0", ttl: "60" })).toBeNull();
    expect(resolveAutoRouteCacheTtl({ defaultEnabled: true })).toBe(30);
    expect(resolveAutoRouteCacheTtl({ defaultEnabled: true, enabled: "0", ttl: "60" })).toBeNull();
    expect(resolveAutoRouteCacheTtl({ enabled: "1" })).toBe(30);
    expect(resolveAutoRouteCacheTtl({ enabled: "1", ttl: "60" })).toBe(60);
    expect(resolveAutoRouteCacheTtl({ enabled: "1", ttl: "0" })).toBeNull();
  });

  test("uses min lifetime semantics for revalidate values", () => {
    expect(combineMinRevalidate(120, 60, undefined)).toBe(60);
    expect(combineMinRevalidate(undefined, null)).toBeUndefined();
    expect(combineMinRevalidate(120, false, 60)).toBe(false);
  });

  test("creates a normalized route cache key shared by RSC and HTML caches", () => {
    const request = new Request("https://internal.local/en/docs?x=1", {
      headers: {
        host: "internal.local",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "akanjs.com",
        "x-base-path": "akanjs",
        "accept-language": "ko",
      },
    });
    const url = new URL(request.url);
    const key = createRouteCacheKey({ request, url, theme: "dark" });

    expect(getClientFacingOrigin(request, url)).toBe("https://akanjs.com");
    expect(key.split("\n")).toEqual(["https://akanjs.com", "akanjs", "", "", "/en/docs", "?x=1", "ko", "dark"]);
    expect(createRouteCacheEntry({ request, url, theme: "dark", ttl: 45 })).toEqual({
      key,
      ttl: 45,
    });
    expect(createRouteCacheEntry({ request, url, theme: "dark", ttl: 60 }).key).toBe(key);
  });

  test("separates cache keys by proxy-resolved locale and path headers", () => {
    const baseRequest = new Request("https://example.test/en/docs?x=1", {
      headers: {
        "accept-language": "ko",
        "x-locale": "ko",
        "x-path": "/docs",
      },
    });
    const url = new URL(baseRequest.url);
    const baseKey = createRouteCacheKey({ request: baseRequest, url, theme: "dark" });

    const enLocaleKey = createRouteCacheKey({
      request: new Request(baseRequest.url, {
        headers: {
          "accept-language": "ko",
          "x-locale": "en",
          "x-path": "/docs",
        },
      }),
      url,
      theme: "dark",
    });
    const rewrittenPathKey = createRouteCacheKey({
      request: new Request(baseRequest.url, {
        headers: {
          "accept-language": "ko",
          "x-locale": "ko",
          "x-path": "/rewritten-docs",
        },
      }),
      url,
      theme: "dark",
    });
    const noHeaderKey = createRouteCacheKey({
      request: new Request(baseRequest.url, { headers: { "accept-language": "ko" } }),
      url,
      theme: "dark",
    });

    expect(baseKey.split("\n")).toEqual(["https://example.test", "", "ko", "/docs", "/en/docs", "?x=1", "ko", "dark"]);
    expect(enLocaleKey).not.toBe(baseKey);
    expect(rewrittenPathKey).not.toBe(baseKey);
    expect(noHeaderKey.split("\n")).toEqual(["https://example.test", "", "", "", "/en/docs", "?x=1", "ko", "dark"]);
    expect(createRouteCacheEntry({ request: baseRequest, url, theme: "dark", ttl: 60 }).key).toBe(baseKey);
  });

  test("classifies public cacheable requests and route path filters", () => {
    expect(isPublicRouteCacheableRequest(new Request("https://example.test/docs"))).toBe(true);
    expect(isPublicRouteCacheableRequest(new Request("https://example.test/docs", { method: "POST" }))).toBe(false);
    expect(
      isPublicRouteCacheableRequest(
        new Request("https://example.test/docs", { headers: { authorization: "Bearer token" } }),
      ),
    ).toBe(false);
    expect(
      isPublicRouteCacheableRequest(new Request("https://example.test/docs", { headers: { cookie: "theme=dark" } })),
    ).toBe(true);
    expect(
      isPublicRouteCacheableRequest(
        new Request("https://example.test/docs", { headers: { cookie: "akan_public_segment=a" } }),
      ),
    ).toBe(false);
    expect(
      isPublicRouteCacheableRequest(new Request("https://example.test/docs", { headers: { cookie: "jwt=secret" } })),
    ).toBe(false);

    expect(isRouteCachePathAllowed("/docs/intro")).toBe(false);
    expect(isRouteCachePathAllowed("/docs/intro", { defaultAllow: true })).toBe(true);
    expect(isRouteCachePathAllowed("/docs/private", { defaultAllow: true, deny: "/docs/private" })).toBe(false);
    expect(isRouteCachePathAllowed("/docs/intro", { allow: "/docs" })).toBe(true);
    expect(isRouteCachePathAllowed("/blog", { allow: "/docs" })).toBe(false);
    expect(isRouteCachePathAllowed("/docs/private", { allow: "/docs", deny: "/docs/private" })).toBe(false);
    expect(isRouteCachePathAllowed("/docs/private/child", { allow: "/docs", deny: "/docs/private" })).toBe(false);
    expect(isRouteCachePathAllowed("/docs-private", { allow: "/docs" })).toBe(false);
    expect(isRouteCachePathAllowed("/docs/private-ish", { allow: "/docs", deny: "/docs/private" })).toBe(true);
    expect(isRouteCachePathAllowed("/docs", { allow: " /blog, /docs ", deny: "/blog" })).toBe(true);
  });

  test("resolves public route cache entries behind env opt-in and request gates", () => {
    const request = new Request("https://example.test/docs/intro?x=1", {
      headers: { cookie: "theme=dark", "accept-language": "ko" },
    });
    const url = new URL(request.url);
    const env = {
      enabled: "1",
      ttl: "45",
      allow: "/docs",
      deny: "/docs/private",
    };

    const entry = resolvePublicRouteCacheEntry({ request, url, theme: "dark", env });
    expect(entry).toEqual({
      key: createRouteCacheKey({ request, url, theme: "dark" }),
      ttl: 45,
    });
    expect(resolvePublicRouteCacheEntry({ request, url, theme: "light", env })?.key).not.toBe(entry?.key);
    expect(resolvePublicRouteCacheEntry({ request, url, env: { ...env, enabled: "0" } })).toBeNull();
    expect(
      resolvePublicRouteCacheEntryDecision({
        request,
        url,
        env: { enabled: "0", allow: "/docs" },
        defaultEnabled: true,
      }),
    ).toEqual({ entry: null, reason: "env-opt-out" });
    expect(resolvePublicRouteCacheEntryDecision({ request, url, env: { allow: "/docs" } })).toEqual({
      entry: null,
      reason: "dev-default-off",
    });
    expect(
      resolvePublicRouteCacheEntryDecision({
        request,
        url,
        env: { ttl: "0" },
        defaultEnabled: true,
        defaultAllow: true,
      }),
    ).toEqual({ entry: null, reason: "ttl-disabled" });
    expect(
      resolvePublicRouteCacheEntryDecision({ request, url, env: {}, defaultEnabled: true, defaultAllow: true }).entry,
    ).toEqual({
      key: createRouteCacheKey({ request, url, theme: undefined }),
      ttl: 30,
    });
    expect(resolvePublicRouteCacheEntryDecision({ request, url, env: {}, defaultEnabled: true })).toEqual({
      entry: null,
      reason: "path-excluded",
    });
    expect(
      resolvePublicRouteCacheEntry({
        request,
        url: new URL("https://example.test/docs/private/secret"),
        env,
      }),
    ).toBeNull();
    expect(
      resolvePublicRouteCacheEntry({
        request: new Request(request.url, { headers: { authorization: "Bearer token" } }),
        url,
        env,
      }),
    ).toBeNull();
    expect(
      resolvePublicRouteCacheEntry({
        request: new Request(request.url, { headers: { cookie: "session=secret" } }),
        url,
        env,
      }),
    ).toBeNull();
  });

  test("resolves cache store TTL using min lifetime semantics", () => {
    expect(resolveRouteCacheStoreTtl(120, { cacheable: true })).toBe(120);
    expect(resolveRouteCacheStoreTtl(120, { cacheable: true, revalidate: 60 })).toBe(60);
    expect(resolveRouteCacheStoreTtl(30, { cacheable: true, revalidate: 60 })).toBe(30);
    expect(resolveRouteCacheStoreTtl(120, { cacheable: true, revalidate: 0 })).toBeNull();
    expect(resolveRouteCacheStoreTtl(120, { cacheable: true, revalidate: false })).toBeNull();
    expect(resolveRouteCacheStoreTtl(120, { cacheable: false, revalidate: 60 })).toBeNull();
  });

  test("blocks storing cache entries after dynamic request APIs are observed", () => {
    expect(
      shouldStoreRouteCache({
        policy: { cacheable: true, tags: new Set(["docs"]) },
        dynamicUsage: { headers: false, cookies: false },
      }),
    ).toMatchObject({ cacheable: true, tags: ["docs"] });
    expect(shouldStoreRouteCache({ dynamicUsage: { headers: false, cookies: false } })).toMatchObject({
      cacheable: true,
    });
    expect(
      shouldStoreRouteCache({
        policy: { cacheable: false, tags: new Set() },
        dynamicUsage: { headers: false, cookies: false },
      }),
    ).toMatchObject({ cacheable: false });
    expect(
      shouldStoreRouteCache({
        policy: { cacheable: true, revalidate: 60, tags: new Set(["docs"]) },
        dynamicUsage: { headers: false, cookies: false },
      }),
    ).toMatchObject({ cacheable: true, revalidate: 60, tags: ["docs"] });
    expect(
      shouldStoreRouteCache({
        policy: { cacheable: true, tags: new Set() },
        dynamicUsage: { headers: true, cookies: false },
      }),
    ).toMatchObject({ cacheable: false, reason: "dynamic-request-api" });
  });

  test("blocks storing cache entries when render control is observed", () => {
    expect(
      shouldStoreRouteCache({
        policy: { cacheable: true, tags: new Set() },
        dynamicUsage: { headers: false, cookies: false },
        renderControlType: "redirect",
        lateRedirect: true,
      }),
    ).toMatchObject({ cacheable: false, reason: "late-redirect" });
    expect(
      shouldStoreRouteCache({
        policy: { cacheable: true, tags: new Set() },
        dynamicUsage: { headers: false, cookies: false },
        renderControlType: "error",
      }),
    ).toMatchObject({ cacheable: false, reason: "render-error" });
    expect(
      shouldStoreRouteCache({
        policy: { cacheable: true, tags: new Set() },
        dynamicUsage: { headers: false, cookies: false },
        renderControlType: "not-found",
      }),
    ).toMatchObject({ cacheable: false, reason: "render-not-found" });
  });

  test("matches route cache invalidations by tag and path prefix", () => {
    const metadata = { pathname: "/docs/intro", routeId: "/:lang/docs/intro", tags: ["docs", "intro"] };

    expect(shouldInvalidateRouteCacheEntry(metadata, { tags: ["docs"] })).toBe(true);
    expect(shouldInvalidateRouteCacheEntry(metadata, { tags: ["blog"] })).toBe(false);
    expect(shouldInvalidateRouteCacheEntry(metadata, { paths: ["/docs"] })).toBe(true);
    expect(shouldInvalidateRouteCacheEntry(metadata, { paths: ["/docs-private"] })).toBe(false);
    expect(shouldInvalidateRouteCacheEntry(metadata, { paths: ["/:lang/docs"] })).toBe(true);
  });

  test("evicts least recently used entries and expires stale entries", async () => {
    const cache = new LruTtlCache<string>(2);
    cache.set("a", "A", 30);
    cache.set("b", "B", 30);
    expect(cache.get("a")).toBe("A");
    cache.set("c", "C", 30);
    expect(cache.get("b")).toBeNull();
    expect(cache.get("a")).toBe("A");

    cache.set("short", "S", 0.001);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(cache.get("short")).toBeNull();

    cache.set("delete-me", "D", 30);
    expect(cache.delete("delete-me")).toBe(true);
    expect(cache.get("delete-me")).toBeNull();
  });

  test("tracks payload bytes across every path that adds or drops an entry", async () => {
    const cache = new LruTtlCache<string>(2, { sizeOf: (value) => value.length });
    expect(cache.byteSize).toBe(0);

    cache.set("a", "1234", 30);
    cache.set("b", "12345", 30);
    expect(cache.byteSize).toBe(9);

    cache.set("a", "1", 30);
    expect(cache.byteSize).toBe(6);

    cache.set("c", "123", 30);
    expect(cache.size).toBe(2);
    expect(cache.byteSize).toBe(4);

    cache.delete("c");
    expect(cache.byteSize).toBe(1);

    cache.set("short", "1234567", 0.001);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(cache.get("short")).toBeNull();
    expect(cache.byteSize).toBe(1);

    cache.clear();
    expect(cache.byteSize).toBe(0);
  });

  test("subtracts bytes for entries dropped by invalidate", () => {
    const cache = new LruTtlCache<{ routeId: string; html: string }>(5, { sizeOf: (value) => value.html.length });
    cache.set("a", { routeId: "/docs", html: "1234" }, 30);
    cache.set("b", { routeId: "/blog", html: "12345" }, 30);
    expect(cache.byteSize).toBe(9);

    expect(cache.invalidate((_key, value) => value.routeId === "/docs")).toBe(1);
    expect(cache.byteSize).toBe(5);
  });

  test("never lets a measurement failure skew the total or fail the write", () => {
    const cache = new LruTtlCache<string>(4, {
      sizeOf: (value) => {
        if (value === "throws") throw new Error("boom");
        return value === "nan" ? Number.NaN : value.length;
      },
    });
    cache.set("a", "throws", 30);
    cache.set("b", "nan", 30);
    cache.set("c", "1234", 30);
    expect(cache.get("a")).toBe("throws");
    expect(cache.get("b")).toBe("nan");
    expect(cache.byteSize).toBe(4);

    cache.clear();
    expect(cache.byteSize).toBe(0);
  });

  test("sweeps expired entries so an idle cache shrinks without being read", async () => {
    const cache = new LruTtlCache<string>(10, { sizeOf: (value) => value.length });
    cache.set("live", "1234", 30);
    cache.set("dying", "12345", 0.001);
    expect(cache.byteSize).toBe(9);

    await new Promise((resolve) => setTimeout(resolve, 5));
    // No `get` of the expired key, which is the only thing that used to reclaim it.
    expect(cache.sweepExpired()).toBe(1);
    expect(cache.size).toBe(1);
    expect(cache.byteSize).toBe(4);
    expect(cache.get("live")).toBe("1234");
  });

  test("sweeps entries whose expiry does not follow map order", async () => {
    // `get` reinserts, and TTLs differ per entry, so the oldest map entry can outlive a newer one.
    // A sweep that stopped at the first live entry would leave the expired one behind.
    const cache = new LruTtlCache<string>(10);
    cache.set("long", "L", 30);
    cache.set("short", "S", 0.001);
    cache.get("long");

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(cache.sweepExpired()).toBe(1);
    expect(cache.get("short")).toBeNull();
    expect(cache.get("long")).toBe("L");
  });

  test("enforces a total byte ceiling by evicting least recently used entries", () => {
    const cache = new LruTtlCache<string>(100, { sizeOf: (value) => value.length, maxBytes: 10 });
    cache.set("a", "1234", 30);
    cache.set("b", "1234", 30);
    expect(cache.byteSize).toBe(8);

    cache.set("c", "1234", 30);
    expect(cache.size).toBe(2);
    expect(cache.byteSize).toBe(8);
    expect(cache.get("a")).toBeNull();
    expect(cache.get("c")).toBe("1234");
  });

  test("rejects an oversized entry instead of evicting everything else to fit it", () => {
    const cache = new LruTtlCache<string>(100, { sizeOf: (value) => value.length, maxEntryBytes: 5 });
    expect(cache.set("small", "1234", 30)).toBe(true);
    expect(cache.set("huge", "1234567890", 30)).toBe(false);
    expect(cache.size).toBe(1);
    expect(cache.byteSize).toBe(4);
    expect(cache.get("small")).toBe("1234");
    expect(cache.get("huge")).toBeNull();
  });

  test("parses byte ceilings from env strings", () => {
    expect(LruTtlCache.parseByteCeiling("1048576")).toBe(1048576);
    expect(LruTtlCache.parseByteCeiling(undefined)).toBe(0);
    expect(LruTtlCache.parseByteCeiling("0")).toBe(0);
    expect(LruTtlCache.parseByteCeiling("nope", 42)).toBe(42);
  });

  test("invalidates matching entries with a predicate", () => {
    const cache = new LruTtlCache<{ routeId: string }>(5);
    cache.set("route:/docs", { routeId: "/docs" }, 30);
    cache.set("route:/docs/intro", { routeId: "/docs/intro" }, 30);
    cache.set("route:/blog", { routeId: "/blog" }, 30);

    expect(cache.invalidate((_key, value) => value.routeId.startsWith("/docs"))).toBe(2);
    expect(cache.get("route:/docs")).toBeNull();
    expect(cache.get("route:/docs/intro")).toBeNull();
    expect(cache.get("route:/blog")).toEqual({ routeId: "/blog" });
  });
});
