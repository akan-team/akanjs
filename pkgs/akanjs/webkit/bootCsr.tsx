"use client";
import {
  csrContext,
  Device,
  getExplicitPageConfigKeys,
  initAuth,
  type LayoutModule,
  type PageConfig,
  type PathRoute,
  readCssSafeAreaInsets,
  resolvePageState,
  type Route,
  type RouteGuide,
  type RouteModule,
  type RouteRender,
  storage,
  validatePageConfig,
} from "akanjs/client";
import {
  assertUniqueRoutePatterns,
  Logger,
  parseAkanI18nEnv,
  parseBasePaths,
  parseRouteModuleKey,
  routeSegmentToTreePath,
} from "akanjs/common";
import { createElement, memo, type ReactNode, useRef } from "react"; // import React 꼭 필요함. 안그러면 csr에서 에러남
import * as ReactDOM from "react-dom/client";
import { useCsrValues } from "./useCsrValues";
import { useFetch } from "./useFetch";

type RouteModuleWithConfig = RouteModule & { pageConfig?: PageConfig };
type CsrRouteModuleLoader = () => Promise<RouteModule>;
type CsrRouteModuleEntry = CsrRouteModuleLoader | { loader: CsrRouteModuleLoader; isAsyncDefault?: boolean };

declare global {
  interface Window {
    __AKAN_MOBILE_TARGET__?: { name: string; basePath?: string; indexPath?: string };
  }
}

interface RootRenderLayerProps {
  renders: RouteRender[];
  index: number;
  params: Record<string, string>;
  searchParams: Record<string, string | string[]>;
}
const RootRenderLayer = memo(({ renders, index, params, searchParams }: RootRenderLayerProps) => {
  const isLast = index >= renders.length - 1;
  const children = isLast ? null : (
    <RootRenderLayer renders={renders} index={index + 1} params={params} searchParams={searchParams} />
  );
  const routeRender = renders[index];
  const isAsyncRender = isAsyncRouteRender(routeRender);
  const resultRef = useRef<ReactNode | Promise<ReactNode> | null>(null);
  if (isAsyncRender && resultRef.current === null) {
    resultRef.current = routeRender?.render({ children, params, searchParams } as never) ?? null;
  }
  const { fulfilled, value: Layout } = useFetch(resultRef.current);
  if (!routeRender) return null;
  if (!isAsyncRender) return createElement(routeRender.render as never, { children, params, searchParams } as never);
  if (!fulfilled || !Layout) return <>{composeLoadingFallback(renders.slice(index), params)}</>;
  return Layout;
});

function isAsyncRouteRender(routeRender?: RouteRender): boolean {
  return Boolean(routeRender?.isAsync || routeRender?.render.constructor.name === "AsyncFunction");
}

function composeLoadingFallback(renders: RouteRender[], params: Record<string, string>): ReactNode {
  let element: ReactNode = null;
  for (let i = renders.length - 1; i >= 0; i--) {
    const Loading = renders[i]?.Loading;
    if (!Loading) continue;
    element = Loading({ params, children: element } as never) as ReactNode;
  }
  return element;
}

export const bootCsr = async (context: Record<string, CsrRouteModuleEntry>) => {
  const i18n = parseAkanI18nEnv();
  window.document.body.style.overflow = "hidden";
  initializeMobileTargetFromSearch();
  const mobileBasePath = window.__AKAN_MOBILE_TARGET__?.basePath?.replace(/^\/+|\/+$/g, "");
  const pathname = mobileBasePath && window.location.pathname === "/" ? `/${mobileBasePath}` : window.location.pathname;
  if (pathname === "/404") return;

  // 1. Collect Device Information
  const [device, jwt] = await Promise.all([Device.load({ supportLanguages: i18n.locales }), storage.getItem("jwt")]);
  if (!window.__AKAN_MOBILE_TARGET__ && !pathname.startsWith(`/${device.lang}`))
    window.location.replace(`/${device.lang}${pathname}${window.location.search}${window.location.hash}`);

  if (jwt) initAuth({ jwt });
  Logger.verbose(`Set default language: ${device.lang}`);

  // 2. Create Route Map
  const basePaths = process.env.AKAN_PUBLIC_BASE_PATHS ? parseBasePaths(process.env.AKAN_PUBLIC_BASE_PATHS) : null;
  const currentBasePath = basePaths ? pathname.split("/")[2] : undefined;
  if (currentBasePath && basePaths && !basePaths.includes(currentBasePath))
    throw new Error(`Invalid path: ${pathname}`);
  const baseLayoutPaths = ["/", "/:lang", ...(currentBasePath ? [`/:lang/${currentBasePath}`] : [])];
  const otherBasePaths = basePaths?.filter((path) => path !== currentBasePath) ?? [];

  const pages: { [key: string]: RouteModule } = {};
  const asyncDefaultMap: { [key: string]: boolean | undefined } = {};
  await Promise.all(
    Object.entries(context).map(async ([key, value]) => {
      const parsed = parseRouteModuleKey(key);
      if (basePaths) {
        const pageBasePath = parsed.sourceRouteSegments.find((segment) => !/^\(.+\)$/.test(segment));
        if (pageBasePath && otherBasePaths.includes(pageBasePath)) return; // ignore other base paths
      }
      const entry = typeof value === "function" ? { loader: value } : value;
      const pageContent = await entry.loader();
      validateRouteModuleExports(key, pageContent);
      validatePageConfig(key, (pageContent as RouteModuleWithConfig).pageConfig);
      asyncDefaultMap[key] = entry.isAsyncDefault;
      if (pageContent.default) pages[key] = pageContent;
    }),
  );
  const cssSafeArea = readCssSafeAreaInsets();

  const routeMap = new Map<string, Route>();
  routeMap.set("/", { path: "/", children: new Map() });
  const pagePatterns: { key: string; pattern: string }[] = [];
  for (const filePath of Object.keys(pages)) {
    const parsed = parseRouteModuleKey(filePath);
    if (parsed.kind === "page") pagePatterns.push({ key: filePath, pattern: parsed.pattern });
    const pathSegments = ["/", ...parsed.routeSegments.map(routeSegmentToTreePath)];

    const targetRouteMap = pathSegments.slice(0, -1).reduce((rMap: Map<string, Route>, path: string) => {
      if (!rMap.has(path)) rMap.set(path, { path, children: new Map() });
      const children = rMap.get(path)?.children;
      if (!children) throw new Error("No children");
      return children;
    }, routeMap);
    if (!targetRouteMap) continue;

    const targetPath = pathSegments[pathSegments.length - 1];
    if (!targetPath) continue;
    const page = pages[filePath];
    if (!page) continue;
    const layoutPage = parsed.kind === "layout" ? (page as LayoutModule) : null;
    const routeRender: RouteRender = {
      render: page.default as never,
      isAsync: asyncDefaultMap[filePath] || page.default?.constructor.name === "AsyncFunction",
      Loading: page.Loading as never,
      NotFound: layoutPage?.NotFound,
      Error: layoutPage?.Error,
      resolveNotFound: layoutPage ? () => layoutPage.NotFound : undefined,
      resolveError: layoutPage ? () => layoutPage.Error : undefined,
    };
    targetRouteMap.set(targetPath, {
      // action: pages[path]?.action,
      // ErrorBoundary: pages[path]?.ErrorBoundary,
      ...(targetRouteMap.get(targetPath) ?? { path: targetPath, children: new Map<string, Route>() }),
      ...(parsed.kind === "layout"
        ? { renderLayout: routeRender, layoutPageConfig: (page as RouteModuleWithConfig).pageConfig }
        : {
            renderPage: routeRender,
            pageIncludesOwnLayout: parsed.leaf === "_index",
            isSpecialRoute: parsed.isSpecialRoute,
            pageConfig: (page as RouteModuleWithConfig).pageConfig,
            PageConfig: (page as RouteModuleWithConfig).pageConfig,
          }),
    } as Route);
  }
  assertUniqueRoutePatterns(pagePatterns);
  const getPathRoutes = (
    route: Route,
    parentRootLayouts: RouteRender[] = [],
    parentLayouts: RouteRender[] = [],
    parentPaths: string[] = [],
    parentPageConfigChain: PageConfig[] = [],
  ): PathRoute[] => {
    const parentPath = parentPaths.filter((path) => path !== "/").join("");
    const isRouteGroup = /^\/\(.*\)$/.test(route.path);
    const currentPathSegment = isRouteGroup ? "" : route.path;
    const path = parentPath + currentPathSegment;
    const isRoot = !isRouteGroup && baseLayoutPaths.includes(path);
    const pathSegments = [...parentPaths, ...(currentPathSegment ? [currentPathSegment] : [])];
    const currentRootLayout = isRoot && route.renderLayout ? route.renderLayout : null;
    const currentLayout = !isRoot && route.renderLayout ? route.renderLayout : null;
    const currentLayoutConfig = route.renderLayout && route.layoutPageConfig ? route.layoutPageConfig : null;
    const renderRootLayouts = [...parentRootLayouts, ...(currentRootLayout ? [currentRootLayout] : [])];
    const renderLayouts = [...parentLayouts, ...(currentLayout ? [currentLayout] : [])];
    const pageConfigChain = [
      ...parentPageConfigChain,
      ...(currentRootLayout || currentLayout ? (currentLayoutConfig ? [currentLayoutConfig] : []) : []),
    ];
    const pageRenderRootLayouts =
      route.pageIncludesOwnLayout === false && currentRootLayout ? parentRootLayouts : renderRootLayouts;
    const pageRenderLayouts = route.pageIncludesOwnLayout === false && currentLayout ? parentLayouts : renderLayouts;
    const pageRenderConfigChain =
      route.pageIncludesOwnLayout === false && (currentRootLayout || currentLayout)
        ? parentPageConfigChain
        : pageConfigChain;
    const ownPageConfig = route.renderPage && route.pageConfig ? route.pageConfig : null;
    const finalPageConfigChain = [...pageRenderConfigChain, ...(ownPageConfig ? [ownPageConfig] : [])];
    const pageState = resolvePageState({
      configChain: finalPageConfigChain,
      path,
      basePath: currentBasePath,
      platform: device.info.platform,
      deviceSafeArea: { top: device.topSafeArea, bottom: device.bottomSafeArea },
      cssSafeArea,
    });
    return [
      ...(route.renderPage
        ? [
            {
              path,
              pathSegments,
              renderPage: route.renderPage,
              renderRootLayouts: pageRenderRootLayouts,
              renderLayouts: pageRenderLayouts,
              isSpecialRoute: route.isSpecialRoute,
              pageState: route.pageState ?? pageState,
              pageConfigChain: finalPageConfigChain,
              explicitPageConfigKeys: getExplicitPageConfigKeys(finalPageConfigChain),
            },
          ]
        : []),
      ...(route.children.size
        ? [...route.children.values()].flatMap((child) =>
            getPathRoutes(child, renderRootLayouts, renderLayouts, pathSegments, pageConfigChain),
          )
        : []),
    ];
  };
  const rootRoute = routeMap.get("/");
  if (!rootRoute) throw new Error("No root route");
  const pathRoutes = getPathRoutes(rootRoute);
  const routeGuide: RouteGuide = { pathSegment: "/", children: {} };
  pathRoutes.forEach((pathRoute) => {
    const pathSegments = pathRoute.pathSegments.slice(1);
    pathSegments.reduce((routeGuide: RouteGuide, pathSegment: string, index: number) => {
      const child = routeGuide.children[pathSegment] as RouteGuide | undefined;
      const next: RouteGuide = {
        ...(child ?? {}),
        pathSegment,
        ...(index === pathSegments.length - 1 ? { pathRoute } : {}),
        children: (child?.children as { [key: string]: RouteGuide } | undefined) ?? {},
      } as RouteGuide;
      routeGuide.children[pathSegment] = next;
      return next;
    }, routeGuide);
  });
  const RouterProvider = () => {
    const csrValues = useCsrValues(routeGuide, pathRoutes);
    const { location } = csrValues;
    return (
      <csrContext.Provider value={csrValues}>
        {location.pathRoute.renderRootLayouts.length > 0 ? (
          <RootRenderLayer
            renders={location.pathRoute.renderRootLayouts}
            index={0}
            params={location.params}
            searchParams={location.searchParams}
          />
        ) : null}
      </csrContext.Provider>
    );
  };

  const el = document.getElementById("root");
  if (!el) throw new Error("No root element");
  const root = ReactDOM.createRoot(el);
  root.render(<RouterProvider />);
};

function initializeMobileTargetFromSearch() {
  if (window.__AKAN_MOBILE_TARGET__) return;

  const params = new URLSearchParams(window.location.search);
  const name = params.get("akanMobileTarget");
  if (!name) return;

  const basePath = params.get("akanMobileBasePath")?.replace(/^\/+|\/+$/g, "") ?? "";
  const indexPath = params.get("akanMobileIndexPath") ?? undefined;
  window.__AKAN_MOBILE_TARGET__ = { name, basePath, ...(indexPath ? { indexPath } : {}) };
}

function validateRouteModuleExports(key: string, mod: RouteModule) {
  const parsed = parseRouteModuleKey(key);
  const allowed =
    parsed.kind === "page"
      ? new Set(["default", "pageConfig", "head", "metadata", "generateHead", "generateMetadata", "Loading"])
      : parsed.isInternalRootLayout
        ? new Set([
            "default",
            "pageConfig",
            "head",
            "metadata",
            "generateHead",
            "generateMetadata",
            "fonts",
            "manifest",
            "theme",
            "reconnect",
            "wsConnect",
            "layoutStyle",
            "gaTrackingId",
            "Loading",
            "NotFound",
            "Error",
          ])
        : new Set([
            "default",
            "pageConfig",
            "head",
            "metadata",
            "generateHead",
            "generateMetadata",
            "Loading",
            "NotFound",
            "Error",
          ]);
  for (const exportName of Object.keys(mod)) {
    if (!allowed.has(exportName)) {
      throw new Error(`[route-convention] unsupported export "${exportName}" in ${key}`);
    }
  }
  if ("head" in mod && "generateHead" in mod) {
    throw new Error(`[route-convention] head and generateHead cannot both be exported in ${key}`);
  }
  if (
    !parsed.isInternalRootLayout &&
    ("head" in mod || "generateHead" in mod) &&
    ("metadata" in mod || "generateMetadata" in mod)
  ) {
    throw new Error(
      `[route-convention] head/generateHead and metadata/generateMetadata cannot both be exported in ${key}`,
    );
  }
  if ("metadata" in mod && "generateMetadata" in mod) {
    throw new Error(`[route-convention] metadata and generateMetadata cannot both be exported in ${key}`);
  }
}
