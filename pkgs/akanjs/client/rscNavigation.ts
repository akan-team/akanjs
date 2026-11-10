import type { AkanHeadSnapshotV1 } from "./csrTypes";

/** `"low"` waits behind every `"high"` request, as a link that merely came into view does behind one pointed at. */
export type PrefetchPriority = "high" | "low";

/** What a partial commit put on screen under the layouts the last full commit rendered, until the next full one. */
export interface RscRoutePatch {
  href: string;
  head: AkanHeadSnapshotV1;
}

interface RscRoutePatchStore {
  current: RscRoutePatch | null;
  listeners: Set<() => void>;
  heads: Set<() => void>;
}

declare global {
  var __AKAN_RSC_CLEAR_CACHE__: (() => void) | undefined;
  var __AKAN_RSC_IS_FROM_CACHE__: (() => boolean) | undefined;
  var __AKAN_RSC_REFRESH__: ((options?: { buildId?: number }) => Promise<void>) | undefined;
  var __AKAN_RSC_PREFETCH__: ((href: string, priority?: PrefetchPriority) => void) | undefined;
  var __AKAN_RSC_NAVIGATE__:
    | ((
        href: string,
        options?: { replace?: boolean; scrollToTop?: boolean; scrollY?: number; shallow?: boolean },
      ) => Promise<void>)
    | undefined;
  var __AKAN_DEV_SYNC_NAVIGATION__: ((href: string, kind: "push" | "replace" | "back" | "pop") => void) | undefined;
  var __AKAN_DEV_SYNC_NAVIGATION_APPLYING__: boolean | undefined;
  var __AKAN_GET_SYNC_ROUTE_HREF__: ((href: string) => string) | undefined;
  var __AKAN_RSC_ROUTE_PATCH__: RscRoutePatchStore | undefined;
}

export const clearRscNavigationCache = () => {
  globalThis.__AKAN_RSC_CLEAR_CACHE__?.();
};

/** True when the page on screen was replayed from the RSC navigation cache, so its hydrated data may be stale. */
export const isRscNavigationFromCache = () => globalThis.__AKAN_RSC_IS_FROM_CACHE__?.() ?? false;

export const navigateRsc = (
  href: string,
  options?: { replace?: boolean; scrollToTop?: boolean; shallow?: boolean },
) => {
  return globalThis.__AKAN_RSC_NAVIGATE__?.(href, options);
};

export const prefetchRsc = (href: string, priority?: PrefetchPriority) => {
  globalThis.__AKAN_RSC_PREFETCH__?.(href, priority);
};

export const refreshRsc = () => {
  return globalThis.__AKAN_RSC_REFRESH__?.();
};

export const useRscNavigation = () => ({
  clearCache: clearRscNavigationCache,
  isFromCache: isRscNavigationFromCache,
  navigate: navigateRsc,
});

const routePatchStore = () => {
  globalThis.__AKAN_RSC_ROUTE_PATCH__ ??= { current: null, listeners: new Set(), heads: new Set() };
  return globalThis.__AKAN_RSC_ROUTE_PATCH__;
};

export const readRscRoutePatch = () => routePatchStore().current;

export const writeRscRoutePatch = (patch: RscRoutePatch | null) => {
  const store = routePatchStore();
  if (store.current === patch) return;
  store.current = patch;
  for (const listener of [...store.listeners, ...store.heads]) listener();
};

/** `head` counts the listener as a mounted route head, the only head a partial commit can swap. */
export const subscribeRscRoutePatch = (listener: () => void, { head = false }: { head?: boolean } = {}) => {
  const listeners = head ? routePatchStore().heads : routePatchStore().listeners;
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const hasRscRouteHead = () => routePatchStore().heads.size > 0;
