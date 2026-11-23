"use client";
import { csrContext, csrLocation, Device, getStoredAuthToken, initAuth } from "akanjs/client";
import { Logger, parseAkanI18nEnv, parseBasePaths, parseSearchParams } from "akanjs/common";
import { st } from "akanjs/store";
import { useSyncExternalStore } from "react";
import * as ReactDOM from "react-dom/client";
import { type CsrRouteContext, CsrRouteTable } from "./CsrRouteTable";
import { RenderLayer } from "./RenderLayer";
import { useCsrValues } from "./useCsrValues";

declare global {
  interface Window {
    __AKAN_MOBILE_TARGET__?: { name: string; basePath?: string; indexPath?: string };
  }
}

//* Set by the devkit's NativeApp.startPath.
const deviceLangParam = "akanMobileLang";

export const bootCsr = async (context: CsrRouteContext) => {
  const i18n = parseAkanI18nEnv();
  window.document.body.style.overflow = "hidden";
  initializeMobileTargetFromSearch();
  if (window.location.pathname === "/404") return;

  const mobileTarget = window.__AKAN_MOBILE_TARGET__;
  //? A dev build opens on the default locale only because the dev server answers its CSR shell under one. Taking that
  //? segment and the marker off first lets Device pick the device's language, as for a release bundle, and a reload
  //? then keeps the language the page is on.
  const isPathLangPlaceholder =
    !!mobileTarget && new URLSearchParams(window.location.search).get(deviceLangParam) === "device";
  if (isPathLangPlaceholder)
    window.history.replaceState(window.history.state, "", onLang(window.location, null, i18n.locales));
  const [device, jwt] = await Promise.all([Device.load({ supportLanguages: i18n.locales }), getStoredAuthToken()]);
  // A native shell opens its bundle at `/`, but every route sits under `/:lang`; a reload would parse the bundle twice.
  if (mobileTarget && window.location.pathname === "/")
    window.history.replaceState(window.history.state, "", mobileHomeHref(device.lang, mobileTarget, window.location));
  else if (isPathLangPlaceholder)
    window.history.replaceState(window.history.state, "", onLang(window.location, device.lang, i18n.locales));
  const pathname = csrLocation.pathname;
  if (!mobileTarget && !pathname.startsWith(`/${device.lang}`))
    window.location.replace(`/${device.lang}${pathname}${window.location.search}${window.location.hash}`);

  //? With nothing stored, a web CSR page still adopts a session cookie an SSR page on its origin wrote at sign-in.
  initAuth(jwt ? { jwt } : {});
  Logger.verbose(`Set default language: ${device.lang}`);

  const basePaths = process.env.AKAN_PUBLIC_BASE_PATHS ? parseBasePaths(process.env.AKAN_PUBLIC_BASE_PATHS) : null;
  const currentBasePath = basePaths ? pathname.split("/")[2] : undefined;
  if (currentBasePath && basePaths && !basePaths.includes(currentBasePath))
    throw new Error(`Invalid path: ${pathname}`);

  const table = await CsrRouteTable.boot(context, { device, basePaths, currentBasePath });
  const RouterProvider = () => {
    const { pathRoutes, routeGuide } = useSyncExternalStore(table.subscribe, table.snapshot);
    const csrValues = useCsrValues(routeGuide, pathRoutes);
    const { location } = csrValues;
    //? An unmatched path never gets here (useLocation sends it to /404), and every app has a root layout, generated if
    //? need be: none means the table misplaced them, which used to render an empty page with nothing in the console.
    if (location.pathRoute.renderRootLayouts.length === 0)
      throw new Error(
        `[csr] no root layout for ${location.pathRoute.path}: the route table put none of its layouts at the root`,
      );
    return (
      <csrContext.Provider value={csrValues}>
        <RenderLayer
          renders={location.pathRoute.renderRootLayouts}
          index={0}
          params={location.params}
          searchParams={location.searchParams}
        />
      </csrContext.Provider>
    );
  };

  //? CSR.Bridge writes the store after a page renders; seeded here, the first page's first effect reads the URL's query.
  st.set({ searchParams: parseSearchParams(csrLocation.search) });
  const el = document.getElementById("root");
  if (!el) throw new Error("No root element");
  ReactDOM.createRoot(el).render(<RouterProvider />);
};

/**
 * Swaps the route modules of a running CSR bundle — what a dev server calls when a page, layout or overrides module
 * changed. History, mounted pages and stores stay; `false` means the set of routes changed and the page must reload.
 */
export const replacePages = async (context: CsrRouteContext) => (await CsrRouteTable.active?.replace(context)) ?? false;

function initializeMobileTargetFromSearch() {
  if (window.__AKAN_MOBILE_TARGET__) return;

  const params = new URLSearchParams(window.location.search);
  const name = params.get("akanMobileTarget");
  if (!name) return;

  const basePath = params.get("akanMobileBasePath")?.replace(/^\/+|\/+$/g, "") ?? "";
  const indexPath = params.get("akanMobileIndexPath") ?? undefined;
  window.__AKAN_MOBILE_TARGET__ = { name, basePath, ...(indexPath ? { indexPath } : {}) };
}

function onLang(location: Location, lang: string | null, locales: string[]) {
  const [, first = "", ...rest] = location.pathname.split("/");
  const segments = [lang ?? "", ...(locales.includes(first) ? rest : [first, ...rest])].filter((segment) => segment);
  const search = new URLSearchParams(location.search);
  search.delete(deviceLangParam);
  const query = search.toString();
  return `/${segments.join("/")}${query ? `?${query}` : ""}${location.hash}`;
}

// `indexPath` is relative to the basePath, as the router's own stack root is.
function mobileHomeHref(lang: string, target: { basePath?: string; indexPath?: string }, location: Location) {
  const [indexHref = "", indexHash = ""] = (target.indexPath ?? "").split("#");
  const [indexPathname = "", indexQuery = ""] = indexHref.split("?");
  const segments = [lang, target.basePath, indexPathname]
    .flatMap((part) => (part ?? "").split("/"))
    .filter((segment) => segment.length > 0);
  const query = [indexQuery, location.search.slice(1)].filter(Boolean).join("&");
  const hash = location.hash || (indexHash ? `#${indexHash}` : "");
  return `/${segments.join("/")}${query ? `?${query}` : ""}${hash}`;
}
