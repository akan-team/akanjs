import { getEnv, getWsPrefix } from "akanjs/base";
import { type RetryPolicy, trimTrailingSlashes } from "akanjs/common";

// A solo process has no gateway to answer a dead upstream with a 504, and a severed connection answers nothing at all.
export const DEFAULT_TIMEOUT_MS = 30_000;

export const makeRequestQueryCacheKey = (
  origin: string,
  url: string,
  headers: Record<string, string>,
  budget: { timeout?: number | false; retry: RetryPolicy | false },
): string => {
  return JSON.stringify({
    method: "GET",
    origin,
    url,
    headers: Object.entries(headers).sort(([a], [b]) => a.localeCompare(b)),
    timeout: budget.timeout ?? DEFAULT_TIMEOUT_MS,
    retry: JSON.stringify(budget.retry, Object.keys(budget.retry).sort()),
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
