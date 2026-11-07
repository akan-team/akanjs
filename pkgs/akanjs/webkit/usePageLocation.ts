"use client";
import { usePathCtx } from "akanjs/client";
import { st } from "akanjs/store";

/**
 * This page's own location. `st.use.searchParams()` and its siblings follow the page on screen, so a page mounted
 * off it — one being prepared, one kept under the current one — reads its own here instead. An SSR page is always the
 * one on screen, and only its server render lacks the store's, which follows a shallow replace and a back too.
 */
export const usePageLocation = () => {
  const { location, followsRouter } = usePathCtx();
  const pathname = st.use.pathname({ agent: false });
  const params = st.use.params({ agent: false });
  const searchParams = st.use.searchParams({ agent: false });
  if (!location) return { pathname, params, searchParams };
  //? The SSR router keeps no route params in the store, only the path and the query.
  if (followsRouter && typeof window !== "undefined") return { pathname, params: location.params, searchParams };
  return { pathname: location.pathname, params: location.params, searchParams: location.searchParams };
};
