import { describe, expect, test } from "bun:test";
import {
  canonicalRouteCacheSearch,
  canonicalRouteCacheUrl,
  DEFAULT_ROUTE_CACHE_TRACKING_PARAMS,
  isRouteCacheTrackingParam,
  routeCacheTrackingParams,
} from "./routeCacheQuery";

describe("routeCacheTrackingParams", () => {
  test("uses the default list unless AKAN_ROUTE_CACHE_TRACKING_PARAMS names one", () => {
    expect(routeCacheTrackingParams(undefined)).toBe(DEFAULT_ROUTE_CACHE_TRACKING_PARAMS);
    expect(routeCacheTrackingParams(" ")).toBe(DEFAULT_ROUTE_CACHE_TRACKING_PARAMS);
    expect(routeCacheTrackingParams("ref, src_*")).toEqual(["ref", "src_*"]);
    expect(routeCacheTrackingParams("default,ref")).toEqual([...DEFAULT_ROUTE_CACHE_TRACKING_PARAMS, "ref"]);
  });

  test("keeps every parameter when set to off, and never treats a bare * as matching every name", () => {
    expect(routeCacheTrackingParams("off")).toEqual([]);
    expect(routeCacheTrackingParams("*,ref")).toEqual(["ref"]);
  });

  test("matches a name exactly, or by prefix for an entry ending in *", () => {
    expect(isRouteCacheTrackingParam("utm_source")).toBe(true);
    expect(isRouteCacheTrackingParam("gclid")).toBe(true);
    expect(isRouteCacheTrackingParam("utm")).toBe(false);
    expect(isRouteCacheTrackingParam("GCLID")).toBe(false);
    expect(isRouteCacheTrackingParam("q")).toBe(false);
  });
});

describe("canonicalRouteCacheSearch", () => {
  const sharesKey = (...searches: string[]) => new Set(searches.map((search) => canonicalRouteCacheSearch(search)));

  test("sorts parameters by name and keeps a repeated name's values in their order", () => {
    expect(canonicalRouteCacheSearch("?b=2&a=1")).toBe("?a=1&b=2");
    expect(canonicalRouteCacheSearch("?tag=z&b=1&tag=a")).toBe("?b=1&tag=z&tag=a");
    expect(sharesKey("?tag=a&tag=z", "?tag=z&tag=a").size).toBe(2);
  });

  test("leaves out the tracking parameters", () => {
    expect(canonicalRouteCacheSearch("?utm_source=news&q=shoes&fbclid=x&gclid=y")).toBe("?q=shoes");
    expect(canonicalRouteCacheSearch("?utm_source=news")).toBe("");
    expect(canonicalRouteCacheSearch("?ref=a&b=1", ["ref"])).toBe("?b=1");
    expect(canonicalRouteCacheSearch("?utm_source=news&b=1&a=2", [])).toBe("?a=2&b=1&utm_source=news");
  });

  test("shares a key between the queries the URL standard parses to the same values", () => {
    expect(sharesKey("?a", "?a=").size).toBe(1);
    expect(sharesKey("?q=a+b", "?q=a%20b").size).toBe(1);
    expect(sharesKey("?p=/", "?p=%2f", "?p=%2F").size).toBe(1);
    expect(sharesKey("?a=1&b=2", "?a=1&&b=2&", "?&a=1&b=2").size).toBe(1);
    expect(sharesKey("", "?").size).toBe(1);
    expect(sharesKey("?a=%FF", "?a=%FE", "?a=%EF%BF%BD").size).toBe(1);
  });

  test("keeps the queries a page reads differently apart", () => {
    expect(sharesKey("?a=1", "?A=1").size).toBe(2);
    expect(sharesKey("?a=1", "?a=01").size).toBe(2);
    expect(sharesKey("?a=", "").size).toBe(2);
  });
});

describe("canonicalRouteCacheUrl", () => {
  test("returns the URL itself when its query is already canonical, and a copy with the canonical query otherwise", () => {
    const canonical = new URL("http://localhost/en/list?a=1&b=2#top");
    const reordered = new URL("http://localhost/en/list?utm_source=x&b=2&a=1#top");

    expect(canonicalRouteCacheUrl(canonical)).toBe(canonical);
    expect(canonicalRouteCacheUrl(reordered).href).toBe(canonical.href);
    expect(reordered.search).toBe("?utm_source=x&b=2&a=1");
  });
});
