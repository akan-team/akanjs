"use client";
import { usePathCtx } from "akanjs/client";
import { st } from "akanjs/store";

/**
 * This page's own location. `st.use.searchParams()` and its siblings follow the page on screen, so a page mounted
 * off it — one being prepared, one kept under the current one — reads its own here instead. An SSR page is always the
 * one on screen, and its query follows the store's, which a shallow replace and a back move too.
 */
export const usePageLocation = () => {
  const { location, followsRouter } = usePathCtx();
  const pathname = st.use.pathname({ agent: false });
  const params = st.use.params({ agent: false });
  const searchParams = st.use.searchParams({ agent: false });
  if (!location) return { pathname, params, searchParams };
  //? On an SSR page only the query moves without a render (a shallow replace, its back), so only it reads the store.
  const followsQuery = followsRouter && typeof window !== "undefined";
  return {
    pathname: location.pathname,
    params: location.params,
    searchParams: followsQuery ? searchParams : location.searchParams,
  };
};
