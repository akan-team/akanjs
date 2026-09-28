"use client";
import { usePathCtx } from "akanjs/client";
import { st } from "akanjs/store";

/**
 * This page's own location. `st.use.searchParams()` and its siblings follow the page on screen, so a page mounted
 * off it — one being prepared, one kept under the current one — reads its own here instead.
 */
export const usePageLocation = () => {
  const { location } = usePathCtx();
  const pathname = st.use.pathname({ agent: false });
  const params = st.use.params({ agent: false });
  const searchParams = st.use.searchParams({ agent: false });
  return location
    ? { pathname: location.pathname, params: location.params, searchParams: location.searchParams }
    : { pathname, params, searchParams };
};
