"use client";
import { getEnv } from "akanjs/base";
import { parseSearchParams } from "akanjs/common";
import { useMemo } from "react";
import { usePage } from "./clientRuntime";
import { usePathCtx } from "./csrTypes";
import { PendingNavigation } from "./pendingNavigation";
import { getPathInfo } from "./router";

export interface PendingLocation {
  /** Path, query and fragment, as `router.push` takes them. */
  href: string;
  pathname: string;
  /** Without the locale and the basePath, comparable with `usePage().path`. */
  path: string;
  searchParams: Record<string, string | string[]>;
}

/** The location a navigation is loading from the server, from the press until its page is drawn; else `null`. */
export const usePendingNavigation = (): PendingLocation | null => {
  const pending = PendingNavigation.use((href) => href);
  const { lang } = usePage();
  const prefix = usePathCtx().prefix ?? "";
  return useMemo(() => {
    if (!pending) return null;
    const url = new URL(pending);
    const href = `${url.pathname}${url.search}${url.hash}`;
    const visiblePrefix = getEnv().operationMode === "local" ? prefix : "";
    return {
      href,
      pathname: url.pathname,
      path: getPathInfo(href, lang, visiblePrefix).path,
      searchParams: parseSearchParams(url.search),
    };
  }, [pending, lang, prefix]);
};
