"use client";
import { csrContext, csrLocation, Device, getStoredAuthToken, initAuth, isMcpView } from "akanjs/client";
import { Logger, parseAkanI18nEnv, parseBasePaths, parseSearchParams } from "akanjs/common";
import { FetchClient } from "akanjs/fetch";
import { st } from "akanjs/store";
import { useSyncExternalStore } from "react";
import * as ReactDOM from "react-dom/client";
import { type CsrRouteContext, CsrRouteTable } from "./CsrRouteTable";
import { McpAppAgent } from "./McpAppAgent";
import { McpAppBridge } from "./McpAppBridge";
import { McpAppView } from "./McpAppView";
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
  //* An MCP host's view: no network, no storage, no URL of its own. The host's credential rides every call it relays.
  let remount: () => void = () => undefined;
  const embedded = isMcpView() ? await bootMcpApp(i18n.locales, () => remount()) : false;
  if (embedded === null) return;

  const [device, jwt] = await Promise.all([
    Device.load({ supportLanguages: i18n.locales }),
    embedded ? undefined : getStoredAuthToken(),
  ]);
  const mobileTarget = window.__AKAN_MOBILE_TARGET__;
  // A native shell opens its bundle at `/`, but every route sits under `/:lang`; a reload would parse the bundle twice.
  if (mobileTarget && window.location.pathname === "/")
    window.history.replaceState(
      window.history.state,
      "",
      `${mobileHomePath(device.lang, mobileTarget)}${window.location.search}${window.location.hash}`,
    );
  const pathname = csrLocation.pathname;
  if (!mobileTarget && !embedded && !pathname.startsWith(`/${device.lang}`))
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

  //? CSR.Bridge writes the store after a page renders; seeded here, the first page's first effect reads the URL's query.
  st.set({ searchParams: parseSearchParams(csrLocation.search) });
  const el = document.getElementById("root");
  if (!el) throw new Error("No root element");
  let root = ReactDOM.createRoot(el);
  root.render(<RouterProvider />);
  //? A view cannot reload its document — the host sends the tool result once — so a reload renders the route afresh,
  //? on the next task: a refresh called from an effect would otherwise unmount the tree React is committing.
  remount = () => {
    setTimeout(() => {
      root.unmount();
      root = ReactDOM.createRoot(el);
      root.render(<RouterProvider />);
    }, 0);
  };
};

/**
 * Swaps the route modules of a running CSR bundle — what a dev server calls when a page, layout or overrides module
 * changed. History, mounted pages and stores stay; `false` means the set of routes changed and the page must reload.
 */
export const replacePages = async (context: CsrRouteContext) => (await CsrRouteTable.active?.replace(context)) ?? false;

// `null` when the result names no screen to start on: the view says so instead of booting the router onto nothing.
async function bootMcpApp(locales: readonly string[], reload: () => void) {
  const bridge = new McpAppBridge();
  const view = new McpAppView(bridge);
  const start = await bridge.connect();
  if (!start.ok) {
    view.showUnavailable(start.message);
    return null;
  }
  if (globalThis.__AKAN_EMBED__) globalThis.__AKAN_EMBED__.account = start.account;
  csrLocation.useMemory(McpAppView.localize(start.href, bridge.hostContext.locale, locales), {
    leave: () => view.showUnavailable("This screen is not available here."),
    reload,
  });
  FetchClient.setBridge(bridge.fetchBridge(start.snapshot));
  view.mount();
  new McpAppAgent(bridge).start();
  return true;
}

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
