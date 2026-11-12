import { getEnv, getWsPrefix } from "akanjs/base";
import { trimTrailingSlashes } from "akanjs/common";

export const makeRequestQueryCacheKey = (origin: string, url: string, headers: Record<string, string>): string => {
  return JSON.stringify({
    method: "GET",
    origin,
    url,
    headers: Object.entries(headers).sort(([a], [b]) => a.localeCompare(b)),
  });
};
export const deepCopy = <T>(value: T): T => {
  if (value === null || typeof value !== "object") return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};
export const normalizeOrigin = (origin: string) => {
  return trimTrailingSlashes(origin);
};
export const sameOrigin = (a: string, b: string) => {
  return normalizeOrigin(a) === normalizeOrigin(b);
};
export const makeWsUri = (origin: string) => {
  return `${origin.replace("http://", "ws://").replace("https://", "wss://")}${getWsPrefix()}`;
};
export const originFromEnv = () => {
  try {
    return getEnv().serverHttpUri;
  } catch {
    return "";
  }
};
