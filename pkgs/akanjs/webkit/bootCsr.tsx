"use client";
import {
  csrContext,
  Device,
  getExplicitPageConfigKeys,
  getStoredAuthToken,
  initAuth,
  type LayoutModule,
  type PageConfig,
  type PathRoute,
  type Route,
  type RouteGuide,
  type RouteModule,
  type RouteModuleSource,
  type RouteRender,
  readCssSafeAreaInsets,
  resolvePageState,
  resolveRouteModule,
  validatePageConfig,
} from "akanjs/client";
import {
  assertUniqueRoutePatterns,
  getRouteExports,
  Logger,
  parseAkanI18nEnv,
  parseBasePaths,
  parseRouteModuleKey,
  routeSegmentToTreePath,
} from "akanjs/common";
import * as ReactDOM from "react-dom/client";
import { RenderLayer } from "./RenderLayer";
import { useCsrValues } from "./useCsrValues";

type RouteModuleWithConfig = RouteModule & { pageConfig?: PageConfig };
type CsrRouteModuleLoader = () => Promise<RouteModuleSource>;
type CsrRouteModuleEntry = CsrRouteModuleLoader | { loader: CsrRouteModuleLoader; isAsyncDefault?: boolean };

declare global {
  interface Window {
    __AKAN_MOBILE_TARGET__?: { name: string; basePath?: string; indexPath?: string };
  }
}

export const bootCsr = async (context: Record<string, CsrRouteModuleEntry>) => {
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
  const baseLayoutPaths = ["/", "/:lang", ...(currentBasePath ? [`/:lang/${currentBasePath}`] : [])];
  const otherBasePaths = basePaths?.filter((path) => path !== currentBasePath) ?? [];

  const pages: { [key: string]: RouteModule } = {};
  const asyncDefaultMap: { [key: string]: boolean | undefined } = {};
  await Promise.all(
    Object.entries(context).map(async ([key, value]) => {
      const parsed = parseRouteModuleKey(key);
      if (basePaths) {
        const pageBasePath = parsed.sourceRouteSegments.find((segment) => !/^\(.+\)$/.test(segment));
        if (pageBasePath && otherBasePaths.includes(pageBasePath)) return;
      }
      const entry = typeof value === "function" ? { loader: value } : value;
      const loaded = await entry.loader();
      const pageContent =
        parsed.kind === "overrides"
          ? (loaded as RouteModule)
          : resolveRouteModule(loaded, key, { kind: parsed.kind, pattern: parsed.pattern }).module;
      validateRouteModuleExports(key, pageContent);
      validatePageConfig(key, (pageContent as RouteModuleWithConfig).pageConfig);
      asyncDefaultMap[key] = entry.isAsyncDefault;
      // `_overrides.tsx` has no default export but must still be kept so its slot bindings can be mounted.
      if (pageContent.default || parsed.kind === "overrides") pages[key] = pageContent;
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

    const targetPath = pathSegments[pathSegments.length - 1];
    if (!targetPath) continue;
    const page = pages[filePath];
    if (!page) continue;
    if (parsed.kind === "overrides") {
      // `page` is the generated `"use client"` override wrapper; its default mounts the provider around children.
      const overridesRender: RouteRender = {
        render: page.default as never,
        isAsync: asyncDefaultMap[filePath] || page.default?.constructor.name === "AsyncFunction",
        kind: "layout",
        paramNames: paramNamesOf(parsed.pattern),
      };
      targetRouteMap.set(targetPath, {
        ...(targetRouteMap.get(targetPath) ?? { path: targetPath, children: new Map<string, Route>() }),
        renderOverrides: overridesRender,
      } as Route);
      continue;
    }
    const layoutPage = parsed.kind === "layout" ? (page as LayoutModule) : null;
    const routeRender: RouteRender = {
      render: page.default as never,
      isAsync: asyncDefaultMap[filePath] || page.default?.constructor.name === "AsyncFunction",
      kind: parsed.kind === "layout" ? "layout" : "page",
      paramNames: paramNamesOf(parsed.pattern),
      Loading: page.Loading as never,
      NotFound: layoutPage?.NotFound,
      Error: layoutPage?.Error,
      resolveNotFound: layoutPage ? () => layoutPage.NotFound : undefined,
      resolveError: layoutPage ? () => layoutPage.Error : undefined,
    };
    targetRouteMap.set(targetPath, {
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
    parentRootRenders: RouteRender[] = [],
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
    // Mirrors RouteTreeBuilder: a manifest sits just outside its own directory's layout, so crossing it keeps the tree.
    const currentOverrideRenders = route.renderOverrides ? [route.renderOverrides] : [];
    const nodeRenders = [...currentOverrideRenders, ...(route.renderLayout ? [route.renderLayout] : [])];
    const rootLayoutStack = [...parentRootLayouts, ...(currentRootLayout ? [currentRootLayout] : [])];
    const renderRootLayouts = isRoot ? [...parentRootRenders, ...nodeRenders] : parentRootRenders;
    const renderLayouts = isRoot ? parentLayouts : [...parentLayouts, ...nodeRenders];
    const pageConfigChain = [
      ...parentPageConfigChain,
      ...(currentRootLayout || currentLayout ? (currentLayoutConfig ? [currentLayoutConfig] : []) : []),
    ];
    const pageNodeRenders = route.pageIncludesOwnLayout === false ? currentOverrideRenders : nodeRenders;
    const pageRenderRootLayouts = isRoot ? [...parentRootRenders, ...pageNodeRenders] : parentRootRenders;
    const pageRenderLayouts = isRoot ? parentLayouts : [...parentLayouts, ...pageNodeRenders];
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
            getPathRoutes(child, rootLayoutStack, renderLayouts, pathSegments, pageConfigChain, renderRootLayouts),
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
          <RenderLayer
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

function paramNamesOf(pattern: string) {
  return pattern
    .split("/")
    .filter((part) => part.startsWith(":"))
    .map((part) => part.slice(1).replace(/[?*+]$/, ""));
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

function validateRouteModuleExports(key: string, mod: RouteModule) {
  const parsed = parseRouteModuleKey(key);
  if (parsed.kind === "overrides") {
    // The bundled module is the generated `"use client"` override wrapper, whose default mounts the provider.
    if (!mod.default) throw new Error(`[route-convention] ${key} generated override wrapper has no default export`);
    return;
  }
  const allowed = getRouteExports(parsed.kind, { rootLayout: parsed.isInternalRootLayout });
  for (const exportName of Object.keys(mod)) {
    if (!allowed.has(exportName)) {
      throw new Error(`[route-convention] unsupported export "${exportName}" in ${key}`);
    }
  }
  if ("head" in mod && "generateHead" in mod) {
    throw new Error(`[route-convention] head and generateHead cannot both be exported in ${key}`);
  }
}
