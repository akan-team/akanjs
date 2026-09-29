"use client";
import { csrContext, Device, getStoredAuthToken, initAuth } from "akanjs/client";
import { Logger, parseAkanI18nEnv, parseBasePaths } from "akanjs/common";
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

export const bootCsr = async (context: CsrRouteContext) => {
  const i18n = parseAkanI18nEnv();
  window.document.body.style.overflow = "hidden";
  initializeMobileTargetFromSearch();
  if (window.location.pathname === "/404") return;

  const [device, jwt] = await Promise.all([Device.load({ supportLanguages: i18n.locales }), getStoredAuthToken()]);
  const mobileTarget = window.__AKAN_MOBILE_TARGET__;
  // A native shell opens its bundle at `/`, but every route sits under `/:lang`; a reload would parse the bundle twice.
  if (mobileTarget && window.location.pathname === "/")
    window.history.replaceState(
      window.history.state,
      "",
      `${mobileHomePath(device.lang, mobileTarget)}${window.location.search}${window.location.hash}`,
    );
  const pathname = window.location.pathname;
  if (!mobileTarget && !pathname.startsWith(`/${device.lang}`))
    window.location.replace(`/${device.lang}${pathname}${window.location.search}${window.location.hash}`);

  if (jwt) initAuth({ jwt });
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

  const el = document.getElementById("root");
  if (!el) throw new Error("No root element");
  const root = ReactDOM.createRoot(el);
  root.render(<RouterProvider />);
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

// `indexPath` is relative to the basePath, as the router's own stack root is.
function mobileHomePath(lang: string, target: { basePath?: string; indexPath?: string }) {
  const segments = [lang, target.basePath, target.indexPath]
    .flatMap((part) => (part ?? "").split("/"))
    .filter((segment) => segment.length > 0);
  return `/${segments.join("/")}`;
}
