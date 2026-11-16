import { isOff } from "./assetHeaders";

export type RouteCacheQueryForm = "canonical" | "exact";

/**
 * The query parameters the route caches leave out of a page's key: ad and analytics click tags a link appends, which
 * a page renders the same with or without. A trailing `*` matches a prefix. `AKAN_ROUTE_CACHE_TRACKING_PARAMS`
 * replaces the list: comma-separated names, `default` for this list, or `off` to keep every parameter.
 */
export const DEFAULT_ROUTE_CACHE_TRACKING_PARAMS: readonly string[] = Object.freeze([
  "utm_*",
  "gclid",
  "gclsrc",
  "dclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "twclid",
  "ttclid",
  "li_fat_id",
  "igshid",
  "yclid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
]);

export const routeCacheTrackingParams = (raw = process.env.AKAN_ROUTE_CACHE_TRACKING_PARAMS): readonly string[] => {
  const value = raw?.trim();
  if (!value) return DEFAULT_ROUTE_CACHE_TRACKING_PARAMS;
  if (isOff(value)) return [];
  return value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name && name !== "*")
    .flatMap((name) => (name === "default" ? DEFAULT_ROUTE_CACHE_TRACKING_PARAMS : [name]));
};

export const isRouteCacheTrackingParam = (name: string, tracking = routeCacheTrackingParams()): boolean =>
  tracking.some((entry) => (entry.endsWith("*") ? name.startsWith(entry.slice(0, -1)) : name === entry));

//? Parsed as a page's search params are, so two queries share a key exactly when the page reads the same values.
export const canonicalRouteCacheSearch = (search: string, tracking = routeCacheTrackingParams()): string => {
  const params = new URLSearchParams(search);
  for (const name of new Set(params.keys())) if (isRouteCacheTrackingParam(name, tracking)) params.delete(name);
  params.sort();
  const query = params.toString();
  return query ? `?${query}` : "";
};

export const canonicalRouteCacheUrl = (url: URL, tracking = routeCacheTrackingParams()): URL => {
  const search = canonicalRouteCacheSearch(url.search, tracking);
  if (search === url.search) return url;
  const canonical = new URL(url);
  canonical.search = search;
  return canonical;
};
