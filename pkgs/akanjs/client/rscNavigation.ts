declare global {
  var __AKAN_RSC_CLEAR_CACHE__: (() => void) | undefined;
  var __AKAN_RSC_IS_FROM_CACHE__: (() => boolean) | undefined;
  var __AKAN_RSC_REFRESH__: ((options?: { buildId?: number }) => Promise<void>) | undefined;
  var __AKAN_RSC_NAVIGATE__:
    | ((href: string, options?: { replace?: boolean; scrollToTop?: boolean }) => Promise<void>)
    | undefined;
  var __AKAN_DEV_SYNC_NAVIGATION__: ((href: string, kind: "push" | "replace" | "back" | "pop") => void) | undefined;
  var __AKAN_DEV_SYNC_NAVIGATION_APPLYING__: boolean | undefined;
  var __AKAN_GET_SYNC_ROUTE_HREF__: ((href: string) => string) | undefined;
}

export const clearRscNavigationCache = () => {
  globalThis.__AKAN_RSC_CLEAR_CACHE__?.();
};

/** True when the page on screen was replayed from the RSC navigation cache, so its hydrated data may be stale. */
export const isRscNavigationFromCache = () => globalThis.__AKAN_RSC_IS_FROM_CACHE__?.() ?? false;

export const navigateRsc = (href: string, options?: { replace?: boolean; scrollToTop?: boolean }) => {
  return globalThis.__AKAN_RSC_NAVIGATE__?.(href, options);
};

export const refreshRsc = () => {
  return globalThis.__AKAN_RSC_REFRESH__?.();
};

export const useRscNavigation = () => ({
  clearCache: clearRscNavigationCache,
  isFromCache: isRscNavigationFromCache,
  navigate: navigateRsc,
});
