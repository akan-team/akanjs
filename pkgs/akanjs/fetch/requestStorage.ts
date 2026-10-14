export type AkanTheme = "css" | "system" | (string & {});

export interface AkanRequestPolicy {
  routeId?: string;
  cacheable?: boolean;
  revalidate?: number | false;
  tags: Set<string>;
}

export interface AkanDynamicUsage {
  headers: boolean;
  cookies: boolean;
}

/** One `fetch.*` query a request made, by endpoint and argument — what a page's data footprint is read off. */
export interface RequestQueryRecord {
  key: string;
  args: Record<string, unknown>;
  returns: { refName: string; modelType?: string; arrDepth?: number; nullable?: boolean };
  value: Promise<unknown>;
}

export interface AkanRequestStore {
  request: Request;
  theme?: AkanTheme;
  frameState?: unknown;
  queryCache: Map<string, Promise<unknown>>;
  queryLog: RequestQueryRecord[];
  policy: AkanRequestPolicy;
  dynamicUsage: AkanDynamicUsage;
}

export interface RequestStorage {
  run<T>(store: Request | AkanRequestStore, callback: () => T): T;
  getStore(): AkanRequestStore | undefined;
}

declare global {
  var __AKAN_REQUEST_STORAGE__: RequestStorage | undefined;
}

let _requestStorage: RequestStorage | null = null;
if (typeof window === "undefined") {
  try {
    // Synchronous on purpose: a top-level `await import()` makes the CSR `export *` chain async under Bun's HMR,
    // where named imports (`FetchClient` in `akanjs/client/useClient.ts`) read `null` mid-evaluation.
    const { AsyncLocalStorage } = require("node:async_hooks") as typeof import("node:async_hooks");
    const als = new AsyncLocalStorage<AkanRequestStore>();
    globalThis.__AKAN_REQUEST_STORAGE__ ??= {
      run<T>(store: Request | AkanRequestStore, callback: () => T): T {
        return als.run(normalizeRequestStore(store), callback);
      },
      getStore(): AkanRequestStore | undefined {
        return als.getStore();
      },
    };
    _requestStorage = globalThis.__AKAN_REQUEST_STORAGE__;
  } catch {}
}

export const requestStorage: RequestStorage | null = _requestStorage;

export function createRequestStore(
  request: Request,
  policy: Partial<Omit<AkanRequestPolicy, "tags">> = {},
): AkanRequestStore {
  return {
    request,
    queryCache: new Map(),
    queryLog: [],
    policy: { tags: new Set(), ...policy },
    dynamicUsage: { headers: false, cookies: false },
  };
}

function isRequestStore(store: Request | AkanRequestStore | undefined): store is AkanRequestStore {
  return Boolean(store && typeof store === "object" && "request" in store && store.request instanceof Request);
}

function normalizeRequestStore(store: Request | AkanRequestStore): AkanRequestStore {
  return isRequestStore(store) ? store : createRequestStore(store);
}

export function setRequestTheme(theme: AkanTheme | undefined): void {
  const store = getRequestStore();
  if (!store || theme === undefined) return;
  store.theme = theme;
}

export function getRequestTheme(): AkanTheme | undefined {
  return getRequestStore()?.theme;
}

export function setRequestFrameState(frameState: unknown): void {
  const store = getRequestStore();
  if (!store) return;
  store.frameState = frameState;
}

export function getRequestFrameState<FrameState = unknown>(): FrameState | undefined {
  return getRequestStore()?.frameState as FrameState | undefined;
}

// Here, free of client deps, so the RSC worker reads request headers/cookies without `akanjs/client`'s macro chain.
// Security: no fallback outside the ALS scope; with renders in flight any guess can be another visitor's request.
export function getRequestStore(): AkanRequestStore | undefined {
  const store = requestStorage?.getStore() as Request | AkanRequestStore | undefined;
  return store ? normalizeRequestStore(store) : undefined;
}

export function getRequest(options: { trackDynamic?: boolean } = {}): Request | undefined {
  const store = getRequestStore();
  if (!store) return undefined;
  if (options.trackDynamic !== false) {
    store.dynamicUsage.headers = true;
    store.dynamicUsage.cookies = true;
  }
  return store.request;
}

/** Reads the framework's active server request without marking the user route dynamic. */
export function untrackedRequest(): Request | undefined {
  return getRequest({ trackDynamic: false });
}

export function getRequestPolicy(): AkanRequestPolicy | undefined {
  return getRequestStore()?.policy;
}

function combineMinPolicyRevalidate(
  current: number | false | undefined,
  next: number | false | undefined,
): number | false | undefined {
  if (next === undefined) return current;
  if (current === false || next === false) return false;
  if (current === undefined) return next;
  return Math.min(current, next);
}

export function updateRequestPolicy(
  patch: Partial<Omit<AkanRequestPolicy, "tags">> & { tags?: Iterable<string> },
): AkanRequestPolicy | undefined {
  const policy = getRequestPolicy();
  if (!policy) return undefined;
  const { tags, revalidate, ...rest } = patch;
  Object.assign(policy, rest);
  policy.revalidate = combineMinPolicyRevalidate(policy.revalidate, revalidate);
  if (tags) for (const tag of tags) policy.tags.add(tag);
  return policy;
}

/** @internal Route cache tag collection is reserved for framework-owned cache policy experiments. */
export function cacheTag(...tags: string[]): AkanRequestPolicy | undefined {
  return updateRequestPolicy({ tags: tags.filter(Boolean) });
}

export function getRequestDynamicUsage(): AkanDynamicUsage | undefined {
  return getRequestStore()?.dynamicUsage;
}

/** Deduplicates within the active request; `owned` means this caller started it and may skip the defensive copy. */
export function claimRequestQuery<T>(key: string, factory: () => Promise<T>): { value: Promise<T>; owned: boolean } {
  const store = getRequestStore();
  if (!store) return { value: factory(), owned: true };
  const existing = store.queryCache.get(key);
  if (existing) return { value: existing as Promise<T>, owned: false };
  const promise = factory();
  store.queryCache.set(key, promise);
  return { value: promise, owned: true };
}

/** Appends to the active request's query log; outside a request there is nothing to read it, so nothing is kept. */
export function recordRequestQuery(record: RequestQueryRecord): void {
  getRequestStore()?.queryLog.push(record);
}

export function memoizeRequestQuery<T>(key: string, factory: () => Promise<T>): Promise<T> {
  return claimRequestQuery(key, factory).value;
}

/** An empty Map outside a request. */
export function headers(options: { trackDynamic?: boolean } = {}): Map<string, string> {
  const store = getRequestStore();
  const map = new Map<string, string>();
  if (!store) return map;
  if (options.trackDynamic !== false) store.dynamicUsage.headers = true;
  store.request.headers.forEach((value, key) => {
    map.set(key, value);
  });
  return map;
}

/** Reads headers for framework internals without marking the user route dynamic. */
export function untrackedHeaders(): Map<string, string> {
  return headers({ trackDynamic: false });
}

export interface CookieEntry {
  name: string;
  value: string;
}

export function parseCookieHeader(cookieHeader: string): Map<string, CookieEntry> {
  const out = new Map<string, CookieEntry>();
  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    // Support the `j:<json>` convention used elsewhere in akanjs.
    const value = raw.startsWith("j:")
      ? (() => {
          try {
            return JSON.parse(raw.slice(2)) as string;
          } catch {
            return raw;
          }
        })()
      : raw;
    out.set(name, { name, value });
  }
  return out;
}

/** An empty Map outside a request. */
export function cookies(options: { trackDynamic?: boolean } = {}): Map<string, CookieEntry> {
  const store = getRequestStore();
  if (!store) return new Map();
  if (options.trackDynamic !== false) store.dynamicUsage.cookies = true;
  return parseCookieHeader(store.request.headers.get("cookie") ?? "");
}

/** Reads cookies for framework internals without marking the user route dynamic. */
export function untrackedCookies(): Map<string, CookieEntry> {
  return cookies({ trackDynamic: false });
}
