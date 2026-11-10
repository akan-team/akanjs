"use client";
import { router as clientRouter, getPathInfo, type RouterInstance } from "akanjs/client";
import { parseAkanI18nEnv, parseBasePaths } from "akanjs/common";
import { useCallback, useEffect } from "react";
import type { CsrLocationState } from "./useCsrLocationState";
import type { CsrRefs } from "./useCsrRefs";
import type { ResolvedFrame } from "./useResolvedFrame";

const CSR_RUNTIME_SEARCH_PARAMS = ["csr", "akanMobileTarget", "akanMobileBasePath", "akanMobileIndexPath"] as const;

export const getSyncRouteHref = (location: {
  pathname: string;
  search: string;
  hash: string;
  params?: { [key: string]: string };
}) => {
  const segments = location.pathname.split("/").filter(Boolean);
  const lang = location.params?.lang ?? parseAkanI18nEnv().locales.find((locale) => locale === segments[0]) ?? "";
  const configuredBasePaths = new Set(parseBasePaths(process.env.AKAN_PUBLIC_BASE_PATHS));
  const runtimeSearch = new URLSearchParams(location.search ?? "");
  const mobileBasePath = runtimeSearch.get("akanMobileBasePath") ?? "";
  if (mobileBasePath) configuredBasePaths.add(mobileBasePath);
  const prefix = segments[1] && configuredBasePaths.has(segments[1]) ? segments[1] : "";
  const { path } = getPathInfo(location.pathname, lang, prefix);
  for (const param of CSR_RUNTIME_SEARCH_PARAMS) runtimeSearch.delete(param);
  const search = runtimeSearch.toString();
  return `${path}${search ? `?${search}` : ""}${location.hash ? `#${location.hash}` : ""}`;
};

type SyncNavigationKind = "push" | "replace" | "back" | "pop";

export const useBroadcastSyncNavigation = ({ applyingSyncNavigation, lastBroadcastSyncHref }: CsrRefs) =>
  useCallback((kind: SyncNavigationKind, href: string) => {
    if (applyingSyncNavigation.current || lastBroadcastSyncHref.current === href) return;
    lastBroadcastSyncHref.current = href;
    const syncNavigation = (
      globalThis as typeof globalThis & {
        __AKAN_DEV_SYNC_NAVIGATION__?: (href: string, kind: SyncNavigationKind) => void;
      }
    ).__AKAN_DEV_SYNC_NAVIGATION__;
    syncNavigation?.(href, kind);
  }, []);

export const useSyncNavigation = ({
  refs: { lastBroadcastSyncHref, applyingSyncNavigation, syncNavigationReset },
  nav: { history, getCurrentLocation, getPrevLocation },
  resolvedLocation,
  broadcastSyncNavigation,
  router,
}: {
  refs: CsrRefs;
  nav: CsrLocationState;
  resolvedLocation: ResolvedFrame["resolvedLocation"];
  broadcastSyncNavigation: ReturnType<typeof useBroadcastSyncNavigation>;
  router: RouterInstance;
}) => {
  useEffect(() => {
    const syncHref = getSyncRouteHref(resolvedLocation);
    if (
      lastBroadcastSyncHref.current === null ||
      applyingSyncNavigation.current ||
      globalThis.__AKAN_DEV_SYNC_NAVIGATION_APPLYING__
    ) {
      lastBroadcastSyncHref.current = syncHref;
      return;
    }
    broadcastSyncNavigation(
      history.current.type === "back" ? "back" : history.current.type === "forward" ? "push" : "pop",
      syncHref,
    );
  }, [
    resolvedLocation.pathRoute.path,
    resolvedLocation.search,
    resolvedLocation.hash,
    broadcastSyncNavigation,
    history,
  ]);
  useEffect(() => {
    //? Restarted per applied navigation: an earlier one's timer lapsing mid-way let this screen echo it to the sender.
    const resetSyncNavigation = () => {
      if (syncNavigationReset.current) clearTimeout(syncNavigationReset.current);
      syncNavigationReset.current = setTimeout(() => {
        applyingSyncNavigation.current = false;
        globalThis.__AKAN_DEV_SYNC_NAVIGATION_APPLYING__ = false;
      }, 1000);
    };
    const handleSyncNavigation = (event: Event) => {
      const { href, kind = "push" } =
        (event as CustomEvent<{ href?: string; kind?: "push" | "replace" | "back" | "pop" }>).detail ?? {};
      if (!href) return;
      const target = new URL(href, window.location.origin);
      const targetHref = `${target.pathname}${target.search}${target.hash}`;
      //? The place this screen last announced is already where it is or is heading; a back replayed onto it pops twice.
      if (targetHref === getSyncRouteHref(getCurrentLocation()) || targetHref === lastBroadcastSyncHref.current) return;
      applyingSyncNavigation.current = true;
      globalThis.__AKAN_DEV_SYNC_NAVIGATION_APPLYING__ = true;
      const previous = getPrevLocation();
      //? Replayed as a replace, a back would play no transition and leave this stack an entry deeper than the sender's.
      if (kind !== "push" && kind !== "replace" && previous && getSyncRouteHref(previous) === targetHref)
        clientRouter.back({ scrollToTop: false });
      else if (kind === "replace" || kind === "back" || kind === "pop")
        clientRouter.replace(targetHref, { scrollToTop: false });
      else clientRouter.push(targetHref, { scrollToTop: false });
      resetSyncNavigation();
    };
    window.addEventListener("akan:sync-navigation", handleSyncNavigation);
    return () => window.removeEventListener("akan:sync-navigation", handleSyncNavigation);
  }, [getCurrentLocation, getPrevLocation, router]);
};
