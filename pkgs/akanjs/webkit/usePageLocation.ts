"use client";
import { ShellState, usePathCtx } from "akanjs/client";
import { isQueryEqual, parseSearchParams } from "akanjs/common";

const documentSearchParams = typeof window !== "undefined" ? parseSearchParams(window.location.search) : {};

/**
 * This page's own location. `st.use.searchParams()` and its siblings follow the page on screen, so a page mounted
 * off it — one being prepared, one kept under the current one — reads its own here instead. An SSR page is always the
 * one on screen: it keeps the query its server render used, which a route keyed on the sorted query sorts and strips
 * of tracking parameters, until the URL's query moves off the one the document loaded with (a shallow replace, a
 * back), and then follows the store's.
 */
export const usePageLocation = () => {
  const { location, followsRouter } = usePathCtx();
  const pathname = ShellState.use("pathname");
  const params = ShellState.use("params");
  const searchParams: import("akanjs/store").BaseSearchParamsState = ShellState.use("searchParams");
  if (!location) return { pathname, params, searchParams };
  //? On an SSR page only the query moves without a render (a shallow replace, its back), so only it reads the store.
  const followsQuery =
    followsRouter && typeof window !== "undefined" && !isQueryEqual(searchParams, documentSearchParams);
  return {
    pathname: location.pathname,
    params: location.params,
    searchParams: followsQuery ? searchParams : location.searchParams,
  };
};
