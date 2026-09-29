import {
  type Device,
  getExplicitPageConfigKeys,
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
  parseRouteModuleKey,
  type RouteLayer,
  RouteLayering,
  routeSegmentToTreePath,
} from "akanjs/common";

type RouteModuleWithConfig = RouteModule & { pageConfig?: PageConfig };
type CsrRouteModuleLoader = () => Promise<RouteModuleSource>;
export type CsrRouteModuleEntry = CsrRouteModuleLoader | { loader: CsrRouteModuleLoader; isAsyncDefault?: boolean };
export type CsrRouteContext = Record<string, CsrRouteModuleEntry>;

export interface CsrRoutes {
  pathRoutes: PathRoute[];
  routeGuide: RouteGuide;
}

interface CsrRouteTableOptions {
  device: Pick<Device, "info" | "topSafeArea" | "bottomSafeArea">;
  basePaths: string[] | null;
  currentBasePath?: string;
}

/**
 * The CSR bundle's route table, built from the route modules the entry hands over. It is a store rather than a value
 * so a dev server can swap the modules in place: `replace` rebuilds the table and the router renders the new one while
 * the history, the mounted pages and every store keep going.
 */
export class CsrRouteTable {
  static #active: CsrRouteTable | null = null;

  static get active() {
    return CsrRouteTable.#active;
  }

  static async boot(context: CsrRouteContext, options: CsrRouteTableOptions) {
    const table = new CsrRouteTable(options);
    table.#keys = CsrRouteTable.#keysOf(context);
    table.#routes = await table.#build(context);
    CsrRouteTable.#active = table;
    return table;
  }

  readonly #options: CsrRouteTableOptions;
  readonly #listeners = new Set<() => void>();
  #keys: string[] = [];
  #routes: CsrRoutes = { pathRoutes: [], routeGuide: { pathSegment: "/", children: {} } };
  #generation = 0;

  private constructor(options: CsrRouteTableOptions) {
    this.#options = options;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  snapshot = () => this.#routes;

  /** `false` when the context names another set of modules: a route added or removed needs a reload. */
  async replace(context: CsrRouteContext) {
    const keys = CsrRouteTable.#keysOf(context);
    if (keys.length !== this.#keys.length || keys.some((key, idx) => key !== this.#keys[idx])) {
      Logger.warn("[csr] replacePages got another set of route modules; reload to add or remove a route");
      return false;
    }
    const generation = ++this.#generation;
    const routes = await this.#build(context);
    if (generation !== this.#generation) return true;
    this.#routes = routes;
    for (const listener of this.#listeners) listener();
    return true;
  }

  async #build(context: CsrRouteContext): Promise<CsrRoutes> {
    const { device, basePaths, currentBasePath } = this.#options;
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
        CsrRouteTable.#validateRouteModuleExports(key, pageContent);
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
          paramNames: CsrRouteTable.#paramNamesOf(parsed.pattern),
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
        paramNames: CsrRouteTable.#paramNamesOf(parsed.pattern),
        Loading: page.Loading as never,
        NotFound: layoutPage?.NotFound,
        Error: layoutPage?.Error,
        resolveNotFound: layoutPage ? () => layoutPage.NotFound : undefined,
        resolveError: layoutPage ? () => layoutPage.Error : undefined,
      };
      targetRouteMap.set(targetPath, {
        ...(targetRouteMap.get(targetPath) ?? { path: targetPath, children: new Map<string, Route>() }),
        ...(parsed.kind === "layout"
          ? {
              renderLayout: routeRender,
              isRootLayout: parsed.isInternalRootLayout,
              layoutPageConfig: (page as RouteModuleWithConfig).pageConfig,
            }
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
      parent: RouteLayer<RouteRender> | null = null,
      parentPageConfigChain: PageConfig[] = [],
    ): PathRoute[] => {
      const layer = RouteLayering.of(route, parent);
      const { path, pathSegments } = layer;
      const currentLayoutConfig = route.renderLayout && route.layoutPageConfig ? route.layoutPageConfig : null;
      const pageConfigChain = [...parentPageConfigChain, ...(currentLayoutConfig ? [currentLayoutConfig] : [])];
      const pageRenderConfigChain =
        route.pageIncludesOwnLayout === false && route.renderLayout ? parentPageConfigChain : pageConfigChain;
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
                renderRootLayouts: layer.pageRenderRootLayouts,
                renderLayouts: layer.pageRenderLayouts,
                isSpecialRoute: route.isSpecialRoute,
                pageState: route.pageState ?? pageState,
                pageConfigChain: finalPageConfigChain,
                explicitPageConfigKeys: getExplicitPageConfigKeys(finalPageConfigChain),
              },
            ]
          : []),
        ...(route.children.size
          ? [...route.children.values()].flatMap((child) => getPathRoutes(child, layer, pageConfigChain))
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
    return { pathRoutes, routeGuide };
  }

  static #keysOf(context: CsrRouteContext) {
    return Object.keys(context).sort();
  }

  static #paramNamesOf(pattern: string) {
    return pattern
      .split("/")
      .filter((part) => part.startsWith(":"))
      .map((part) => part.slice(1).replace(/[?*+]$/, ""));
  }

  static #validateRouteModuleExports(key: string, mod: RouteModule) {
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
}
