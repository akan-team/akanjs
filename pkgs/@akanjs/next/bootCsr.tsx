"use client";
import { device, initAuth, storage } from "@akanjs/client";
import {
  type CsrConfig,
  csrContext,
  DEFAULT_BOTTOM_INSET,
  DEFAULT_TOP_INSET,
  defaultPageState,
  type PageState,
  type PathRoute,
  type Route,
  type RouteGuide,
} from "@akanjs/client";
import { Logger } from "@akanjs/common";
import { AllDictionary } from "@akanjs/dictionary";
import { SerializedSignal } from "@akanjs/signal";
import { storeInfo } from "@akanjs/store";
import React, { ReactNode } from "react"; // import React 꼭 필요함. 안그러면 csr에서 에러남
import * as ReactDOM from "react-dom/client";

import { useCsrValues } from "./useCsrValues";

const supportLanguages = ["en", "ko"] as const;

export const bootCsr = async (
  context: Record<string, () => Promise<unknown>>,
  registerClient: (lang?: string) => Promise<{ dictionary: AllDictionary; signals: SerializedSignal[] }>
) => {
  window.document.body.style.overflow = "hidden";
  const pathname = window.location.pathname;
  if (pathname === "/404") return;

  // 1. Collect Device Information
  const [, jwt] = await Promise.all([device.init({ supportLanguages }), storage.getItem("jwt")]);
  if (!pathname.startsWith(`/${device.lang}`))
    window.location.replace(`/${device.lang}${pathname}${window.location.search}${window.location.hash}`);

  if (jwt) initAuth({ jwt });
  Logger.verbose(`Set default language: ${device.lang}`);

  // 2. Create Route Map
  const basePaths = process.env.basePaths ? [...process.env.basePaths.split(","), "admin"] : null;
  const currentBasePath = basePaths ? pathname.split("/")[2] : undefined;
  if (currentBasePath && basePaths && !basePaths.includes(currentBasePath))
    throw new Error(`Invalid path: ${pathname}`);
  const baseLayoutPaths = ["/", "/:lang", ...(currentBasePath ? [`/:lang/${currentBasePath}`] : [])];
  const otherBasePaths = basePaths?.filter((path) => path !== currentBasePath) ?? [];

  const pages: { [key: string]: { default: { csrConfig?: CsrConfig } } } = {};
  await Promise.all(
    Object.entries(context).map(async ([key, value]) => {
      if (basePaths) {
        const pageBasePath = key.split("/")[2];
        if (pageBasePath && otherBasePaths.includes(pageBasePath)) return; // ignore other base paths
      }
      const getPageContent = value as () => Promise<{ default?: { csrConfig?: CsrConfig } }>;
      const pageContent = await getPageContent();
      if (pageContent.default) pages[key] = pageContent as { default: { csrConfig?: CsrConfig } };
    })
  );
  const getPageState = (csrConfig?: CsrConfig) => {
    const {
      transition,
      safeArea,
      topInset,
      bottomInset,
      gesture,
      cache,
      topSafeAreaColor,
      bottomSafeAreaColor,
    }: CsrConfig = csrConfig ?? {};
    const pageState: PageState = {
      transition: transition ?? "none",
      topSafeArea:
        safeArea === false || safeArea === "bottom" || device.info.platform === "android" ? 0 : device.topSafeArea,
      bottomSafeArea:
        safeArea === false || safeArea === "top" || device.info.platform === "android" ? 0 : device.bottomSafeArea,
      topInset: topInset === true ? DEFAULT_TOP_INSET : topInset === false ? 0 : (topInset ?? 0),
      bottomInset: bottomInset === true ? DEFAULT_BOTTOM_INSET : bottomInset === false ? 0 : (bottomInset ?? 0),
      gesture: gesture ?? true,
      cache: cache ?? false,
      topSafeAreaColor: topSafeAreaColor,
      bottomSafeAreaColor: bottomSafeAreaColor,
    };
    return pageState;
  };

  const routeMap = new Map<string, Route>();
  routeMap.set("/", { path: "/", children: new Map() });
  for (const filePath of Object.keys(pages)) {
    const fileName = /\.\/(.*)\.tsx$/.exec(filePath)?.[1];

    if (!fileName) continue;
    const fileType: "page" | "layout" | null = fileName.endsWith("page")
      ? "page"
      : fileName.endsWith("layout")
        ? "layout"
        : null;
    if (!fileType) continue;
    const pathSegments = [
      "/",
      ...fileName
        .split("/")
        .slice(0, -1)
        .map((segment) => `/${segment.replace(/\[(.*?)\]/g, ":$1")}`),
    ];

    const targetRouteMap = pathSegments.slice(0, -1).reduce((rMap: Map<string, Route>, path: string) => {
      if (!rMap.has(path)) rMap.set(path, { path, children: new Map() });
      return rMap.get(path)?.children;
    }, routeMap);
    if (!targetRouteMap) continue;

    const targetPath = pathSegments[pathSegments.length - 1];

    targetRouteMap.set(targetPath, {
      // action: pages[path]?.action,
      // ErrorBoundary: pages[path]?.ErrorBoundary,
      ...(targetRouteMap.get(targetPath) ?? { path: targetPath, children: new Map<string, Route>() }),
      ...(fileType === "layout"
        ? { Layout: pages[filePath].default }
        : {
            Page: pages[filePath].default,
            pageState: getPageState(pages[filePath].default.csrConfig),
            csrConfig: pages[filePath].default.csrConfig,
          }),
    } as Route);
  }

  const getPathRoutes = (
    route: Route,
    parentRootLayouts: (
      | (({ children, params, searchParams }) => ReactNode)
      | (({ children, params, searchParams }) => Promise<ReactNode>)
    )[] = [],
    parentLayouts: (
      | (({ children, params, searchParams }) => ReactNode)
      | (({ children, params, searchParams }) => Promise<ReactNode>)
    )[] = [],
    parentPaths: string[] = []
  ): PathRoute[] => {
    const parentPath = parentPaths.filter((path) => path !== "/").join("");
    const currentPathSegment = /^\/\(.*\)$/.test(route.path) ? "" : route.path;
    const isRoot = baseLayoutPaths.includes(parentPath + currentPathSegment) && parentRootLayouts.length < 2;
    const path = parentPath + currentPathSegment;
    const pathSegments = [...parentPaths, ...(currentPathSegment ? [currentPathSegment] : [])];
    const RootLayouts = [...parentRootLayouts, ...(isRoot && route.Layout ? [route.Layout] : [])];
    const Layouts = [...parentLayouts, ...(!isRoot && route.Layout ? [route.Layout] : [])];
    return [
      ...(route.Page
        ? [
            {
              path,
              pathSegments,
              Page: route.Page,
              RootLayouts,
              Layouts,
              pageState: route.pageState ?? defaultPageState,
            },
          ]
        : []),
      ...(route.children.size
        ? [...route.children.values()].flatMap((child) => getPathRoutes(child, RootLayouts, Layouts, pathSegments))
        : []),
    ];
  };
  const rootRoute = routeMap.get("/");
  if (!rootRoute) throw new Error("No root route");
  const pathRoutes = getPathRoutes(rootRoute);
  const routeGuide: RouteGuide = { pathSegment: "/", children: {} };
  pathRoutes.forEach((pathRoute) => {
    const pathSegments = pathRoute.pathSegments.slice(1);
    pathSegments.reduce((routeGuide, pathSegment, index) => {
      const child = routeGuide.children[pathSegment] as RouteGuide | undefined;
      routeGuide.children[pathSegment] = {
        ...(child ?? {}),
        pathSegment,
        ...(index === pathSegments.length - 1 ? { pathRoute } : {}),
        children: (child?.children as { [key: string]: RouteGuide } | undefined) ?? {},
      } as RouteGuide;
      return routeGuide.children[pathSegment];
    }, routeGuide);
  });
  const RouterProvider = () => {
    const csrValues = useCsrValues(routeGuide, pathRoutes);
    const { location } = csrValues;
    return (
      <csrContext.Provider value={csrValues}>
        {location.pathRoute.RootLayouts.reduceRight(
          (children, Layout: any) => {
            return (
              <Layout params={location.params} searchParams={location.searchParams}>
                {children}
              </Layout>
            );
          },
          <></>
        )}
      </csrContext.Provider>
    );
  };

  const { signals } = await registerClient(device.lang);
  storeInfo.buildStore(signals);

  const el = document.getElementById("root");
  if (!el) throw new Error("No root element");
  const root = ReactDOM.createRoot(el);
  root.render(<RouterProvider />);
};
