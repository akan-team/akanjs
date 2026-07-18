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

export interface AkanRequestStore {
  request: Request;
  theme?: AkanTheme;
  frameState?: unknown;
  queryCache: Map<string, Promise<unknown>>;
  policy: AkanRequestPolicy;
  dynamicUsage: AkanDynamicUsage;
}

export interface RequestStorage {
  run<T>(store: Request | AkanRequestStore, callback: () => T): T;
  getStore(): AkanRequestStore | undefined;
}

declare global {
  var __AKAN_REQUEST_STORAGE__: RequestStorage | undefined;
  var __AKAN_REQUEST_FALLBACK_STACK__: AkanRequestStore[] | undefined;
}

let _requestStorage: RequestStorage | null = null;
if (typeof window === "undefined") {
  try {
    // Keep this module synchronous. CSR builds import `akanjs/fetch` through
    // Bun's HMR runtime, and a top-level `await import("node:async_hooks")`
    // turns the whole `export *` chain into an async module. Named imports
    // from that chain can then be observed as `null` during evaluation
    // (notably `FetchClient` in `akanjs/client/useClient.ts`).
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

function createRequestPolicy(): AkanRequestPolicy {
  return { tags: new Set() };
}

export function createRequestStore(
  request: Request,
  policy: Partial<Omit<AkanRequestPolicy, "tags">> = {},
): AkanRequestStore {
  return {
    request,
    queryCache: new Map(),
    policy: { ...createRequestPolicy(), ...policy },
    dynamicUsage: { headers: false, cookies: false },
  };
}

function isRequestStore(store: Request | AkanRequestStore | undefined): store is AkanRequestStore {
  return Boolean(store && typeof store === "object" && "request" in store && store.request instanceof Request);
}

function normalizeRequestStore(store: Request | AkanRequestStore): AkanRequestStore {
  return isRequestStore(store) ? store : createRequestStore(store);
}

function getActiveRequestStore(): AkanRequestStore | undefined {
  const store = requestStorage?.getStore() as Request | AkanRequestStore | undefined;
  if (store) return isRequestStore(store) ? store : createRequestStore(store);
  return globalThis.__AKAN_REQUEST_FALLBACK_STACK__?.at(-1);
}

/** Stores theme preference on the active request when server rendering. */
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

export function pushRequestFallback(storeOrRequest: Request | AkanRequestStore): () => void {
  globalThis.__AKAN_REQUEST_FALLBACK_STACK__ ??= [];
  const stack = globalThis.__AKAN_REQUEST_FALLBACK_STACK__;
  const store = normalizeRequestStore(storeOrRequest);
  stack.push(store);
  return () => {
    const index = stack.lastIndexOf(store);
    if (index >= 0) stack.splice(index, 1);
  };
}

// Lightweight server-side helpers for server components to read the incoming
// request's headers/cookies. Kept in akanjs/fetch (no heavy client deps) so
// they can be imported from inside the RSC worker without pulling `akanjs/
// client`'s useClient macro chain.
/** Returns the active server request store from AsyncLocalStorage or the fallback stack. */
export function getRequestStore(): AkanRequestStore | undefined {
  return getActiveRequestStore();
}

/** Returns the active server request from AsyncLocalStorage or the fallback stack. */
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

/** Deduplicates a promise-producing query within the active request. */
export function memoizeRequestQuery<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const store = getRequestStore();
  if (!store) return factory();
  const existing = store.queryCache.get(key);
  if (existing) return existing as Promise<T>;
  const promise = factory();
  store.queryCache.set(key, promise);
  return promise;
}

/** Returns current request headers as a Map, or an empty Map outside a request. */
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

/** Returns parsed cookies from the current request, or an empty Map outside a request. */
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
