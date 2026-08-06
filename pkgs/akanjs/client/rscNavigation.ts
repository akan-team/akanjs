declare global {
  var __AKAN_RSC_CLEAR_CACHE__: (() => void) | undefined;
  var __AKAN_RSC_IS_FROM_CACHE__: (() => boolean) | undefined;
  var __AKAN_RSC_NAVIGATE__:
    | ((href: string, options?: { replace?: boolean; scrollToTop?: boolean }) => Promise<void>)
    | undefined;
}

export const clearRscNavigationCache = () => {
  globalThis.__AKAN_RSC_CLEAR_CACHE__?.();
};

/**
 * True when the page tree currently on screen was replayed from the RSC navigation cache instead of
 * fetched from the server. Data hydrated out of such a payload can be arbitrarily old, so anything
 * that must show current values should refetch.
 */
export const isRscNavigationFromCache = () => globalThis.__AKAN_RSC_IS_FROM_CACHE__?.() ?? false;

export const navigateRsc = (href: string, options?: { replace?: boolean; scrollToTop?: boolean }) => {
  return globalThis.__AKAN_RSC_NAVIGATE__?.(href, options);
};

export const useRscNavigation = () => ({
  clearCache: clearRscNavigationCache,
  isFromCache: isRscNavigationFromCache,
  navigate: navigateRsc,
});
