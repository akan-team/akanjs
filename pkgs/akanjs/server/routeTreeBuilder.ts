import type {
  LayoutFallbackRoute,
  LayoutModule,
  LayoutProps,
  PageProps,
  PathRoute,
  ResolveHead,
  Route,
  RouteModule,
  RouteRender,
} from "akanjs/client";
import {
  assertUniqueRoutePatterns,
  compareRouteSpecificity,
  getRouteExports,
  Logger,
  matchRoutePattern,
  parseRouteModuleKey,
  type RouteLayer,
  RouteLayering,
  routeSegmentToTreePath,
} from "akanjs/common";
import { createElement } from "react";
import { defaultPageState, validatePageConfig } from "../client/frameConfig";
import {
  type ResolvedRouteModule,
  type RouteModuleSource,
  resolveRouteModule,
} from "../client/route/resolveRouteModule";
import { matchRoutePrefix } from "../common/routeConvention";

type RouteModuleKindWithOverrides = "page" | "layout" | "overrides";

export type PagesContext = Record<string, () => Promise<RouteModuleSource>>;

export interface RouteModuleCacheStats {
  moduleCount: number;
  loadedModuleCount: number;
  cacheHits: number;
  cacheMisses: number;
  cacheDisabled: boolean;
  loadedModuleKeys: string[];
}

export class RouteTreeBuilder {
  static readonly logger = new Logger("RouteTreeBuilder");
  static readonly #legacyWarned = new Set<string>();
  static readonly #moduleCacheStats: RouteModuleCacheStats = {
    moduleCount: 0,
    loadedModuleCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheDisabled: process.env.AKAN_ROUTE_MODULE_CACHE === "0",
    loadedModuleKeys: [],
  };

  readonly #context: PagesContext;
  readonly #routeMap = new Map<string, Route>();
  readonly #pagePatterns: { key: string; pattern: string }[] = [];
  readonly #fallbackRoutes: LayoutFallbackRoute[] = [];

  constructor(context: PagesContext) {
    this.#context = context;
    this.#routeMap.set("/", { path: "/", children: new Map() });
  }

  build(): PathRoute[] {
    RouteTreeBuilder.resetCacheStats();
    this.#fallbackRoutes.length = 0;
    for (const [filePath, loader] of Object.entries(this.#context)) this.#addRouteModule(filePath, loader);
    assertUniqueRoutePatterns(this.#pagePatterns);

    const rootRoute = this.#routeMap.get("/");
    if (!rootRoute) throw new Error("No root route");
    return this.#getPathRoutes(rootRoute).sort((a, b) => compareRouteSpecificity(a.path, b.path));
  }

  getFallbackRoutes(): LayoutFallbackRoute[] {
    return [...this.#fallbackRoutes].sort((a, b) => compareRouteSpecificity(a.path, b.path));
  }

  static getCacheStats(): RouteModuleCacheStats {
    return {
      ...RouteTreeBuilder.#moduleCacheStats,
      cacheDisabled: process.env.AKAN_ROUTE_MODULE_CACHE === "0",
      loadedModuleKeys: [...RouteTreeBuilder.#moduleCacheStats.loadedModuleKeys],
    };
  }

  static resetCacheStats() {
    RouteTreeBuilder.#moduleCacheStats.moduleCount = 0;
    RouteTreeBuilder.#moduleCacheStats.loadedModuleCount = 0;
    RouteTreeBuilder.#moduleCacheStats.cacheHits = 0;
    RouteTreeBuilder.#moduleCacheStats.cacheMisses = 0;
    RouteTreeBuilder.#moduleCacheStats.cacheDisabled = process.env.AKAN_ROUTE_MODULE_CACHE === "0";
    RouteTreeBuilder.#moduleCacheStats.loadedModuleKeys = [];
  }

  static match(
    pathname: string,
    pathRoutes: PathRoute[],
  ): { pathRoute: PathRoute; params: Record<string, string> } | null {
    for (const pathRoute of pathRoutes) {
      const params = matchRoutePattern(pathRoute.path, pathname);
      if (params) return { pathRoute, params };
    }
    return null;
  }

  static matchFallback(
    pathname: string,
    fallbackRoutes: LayoutFallbackRoute[],
  ): { fallbackRoute: LayoutFallbackRoute; params: Record<string, string> } | null {
    const candidates = fallbackRoutes
      .map((fallbackRoute) => ({
        fallbackRoute,
        params: matchRoutePrefix(fallbackRoute.path, pathname),
      }))
      .filter((entry): entry is { fallbackRoute: LayoutFallbackRoute; params: Record<string, string> } =>
        Boolean(entry.params),
      )
      .sort((a, b) => {
        const lengthDelta =
          b.fallbackRoute.path.split("/").filter(Boolean).length -
          a.fallbackRoute.path.split("/").filter(Boolean).length;
        if (lengthDelta !== 0) return lengthDelta;
        return compareRouteSpecificity(a.fallbackRoute.path, b.fallbackRoute.path);
      });
    return candidates[0] ?? null;
  }

  static parseSearchParams(search: string): Record<string, string | string[]> {
    const result: Record<string, string | string[]> = {};
    const urlSearchParams = new URLSearchParams(search);
    for (const [key, value] of urlSearchParams.entries()) {
      const existing = result[key];
      if (existing !== undefined) result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      else result[key] = value;
    }
    return result;
  }

  #addRouteModule(filePath: string, loader: () => Promise<RouteModuleSource>) {
    const parsed = parseRouteModuleKey(filePath);
    if (parsed.kind === "page") this.#pagePatterns.push({ key: filePath, pattern: parsed.pattern });
    const pathSegments = ["/", ...parsed.routeSegments.map(routeSegmentToTreePath)];

    const targetRouteMap = pathSegments.slice(0, -1).reduce((rMap: Map<string, Route>, p: string) => {
      if (!rMap.has(p)) rMap.set(p, { path: p, children: new Map() });
      const children = rMap.get(p)?.children;
      if (!children) throw new Error("No children");
      return children;
    }, this.#routeMap);

    const targetPath = pathSegments[pathSegments.length - 1];
    if (!targetPath) return;

    if (parsed.kind === "overrides") {
      targetRouteMap.set(targetPath, {
        ...(targetRouteMap.get(targetPath) ?? { path: targetPath, children: new Map<string, Route>() }),
        renderOverrides: this.#makeOverridesRender(filePath, loader),
      } as Route);
      return;
    }

    const routeRender = RouteTreeBuilder.#makeRouteRender(filePath, parsed.kind, loader);
    targetRouteMap.set(targetPath, {
      ...(targetRouteMap.get(targetPath) ?? { path: targetPath, children: new Map<string, Route>() }),
      ...(parsed.kind === "layout"
        ? { renderLayout: routeRender, isRootLayout: parsed.isInternalRootLayout }
        : {
            renderPage: routeRender,
            pageIncludesOwnLayout: parsed.leaf === "_index",
          }),
    } as Route);
  }

  #getPathRoutes(route: Route, parent: RouteLayer<RouteRender> | null = null, parentHead?: ResolveHead): PathRoute[] {
    const layer = RouteLayering.of(route, parent);
    if (route.renderLayout) {
      this.#fallbackRoutes.push({
        path: layer.path,
        pathSegments: layer.pathSegments,
        renderRootLayouts: layer.renderRootLayouts,
        renderLayouts: layer.renderLayouts,
      });
    }
    const routeHead = RouteTreeBuilder.#composeHeadResolvers(route.renderLayout?.resolveHead, parentHead);
    const pageHead = route.pageIncludesOwnLayout === false ? parentHead : routeHead;
    return [
      ...(route.renderPage
        ? [
            {
              path: layer.path,
              pathSegments: layer.pathSegments,
              renderPage: route.renderPage,
              renderRootLayouts: layer.pageRenderRootLayouts,
              renderLayouts: layer.pageRenderLayouts,
              resolveHead: RouteTreeBuilder.#composeHeadResolvers(route.renderPage.resolveHead, pageHead),
              pageState: route.pageState ?? defaultPageState,
            },
          ]
        : []),
      ...(route.children.size
        ? [...route.children.values()].flatMap((child) => this.#getPathRoutes(child, layer, routeHead))
        : []),
    ];
  }

  static #makeLazyModule(key: string, kind: RouteModuleKindWithOverrides, loader: () => Promise<RouteModuleSource>) {
    let cached: ResolvedRouteModule | null = null;
    let loaded = false;
    RouteTreeBuilder.#moduleCacheStats.moduleCount += 1;
    return async () => {
      if (cached && process.env.AKAN_ROUTE_MODULE_CACHE !== "0") {
        RouteTreeBuilder.#moduleCacheStats.cacheHits += 1;
        return cached;
      }
      RouteTreeBuilder.#moduleCacheStats.cacheMisses += 1;
      const resolved = RouteTreeBuilder.#resolveModule(key, kind, await loader());
      RouteTreeBuilder.#validateRouteModuleExports(key, kind, resolved.module);
      validatePageConfig(key, "pageConfig" in resolved.module ? resolved.module.pageConfig : undefined);
      if (!loaded) {
        RouteTreeBuilder.#moduleCacheStats.loadedModuleCount += 1;
        RouteTreeBuilder.#moduleCacheStats.loadedModuleKeys.push(key);
        loaded = true;
      }
      if (process.env.AKAN_ROUTE_MODULE_CACHE !== "0") cached = resolved;
      return resolved;
    };
  }

  static #resolveModule(key: string, kind: RouteModuleKindWithOverrides, mod: RouteModuleSource): ResolvedRouteModule {
    if (kind === "overrides") return { module: mod as RouteModule };
    const parsed = parseRouteModuleKey(key);
    const resolved = resolveRouteModule(mod, key, { kind, pattern: parsed.pattern });
    if (!resolved.definition && !parsed.isInternalRootLayout && !RouteTreeBuilder.#legacyWarned.has(key)) {
      RouteTreeBuilder.#legacyWarned.add(key);
      RouteTreeBuilder.logger.warn(
        `${key} uses the legacy route shape (a default function beside named exports). Write \`export default ${kind === "layout" ? "layout()" : "page()"}…\` instead — see the "Migrating page/" recipe.`,
      );
    }
    return resolved;
  }

  static #validateRouteModuleExports(key: string, kind: RouteModuleKindWithOverrides, mod: RouteModule) {
    if (kind === "overrides") {
      if (!mod.default) throw new Error(`[route-convention] ${key} generated override wrapper has no default export`);
      return;
    }
    const parsed = parseRouteModuleKey(key);
    const allowed = getRouteExports(kind, { rootLayout: parsed.isInternalRootLayout });
    for (const exportName of Object.keys(mod)) {
      if (!allowed.has(exportName)) {
        throw new Error(`[route-convention] unsupported export "${exportName}" in ${key}`);
      }
    }
    if (!mod.default) throw new Error(`[route-convention] ${key} has no default export`);
    if ("head" in mod && "generateHead" in mod) {
      throw new Error(`[route-convention] head and generateHead cannot both be exported in ${key}`);
    }
  }

  static #makeRouteRender(key: string, kind: "page" | "layout", loader: () => Promise<RouteModuleSource>): RouteRender {
    const loadModule = RouteTreeBuilder.#makeLazyModule(key, kind, loader);
    const syncFallbacks = (mod: LayoutModule) => {
      routeRender.NotFound = mod.NotFound;
      routeRender.Error = mod.Error;
      return mod;
    };
    const loadSynced = async () => {
      const { module: mod } = await loadModule();
      routeRender.Loading = mod.Loading as never;
      if (kind === "layout") syncFallbacks(mod as LayoutModule);
      return mod;
    };
    const pageConfigOf = async () => {
      const { module: mod } = await loadModule();
      return "pageConfig" in mod ? mod.pageConfig : undefined;
    };
    const routeRender: RouteRender = {
      isAsync: true,
      resolveLoading: async () => {
        const { module: mod } = await loadModule();
        routeRender.Loading = mod.Loading as never;
      },
      render: async (props: LayoutProps | PageProps) => {
        const mod = await loadSynced();
        if (!mod.default) throw new Error(`[route-convention] ${key} has no default export`);
        return mod.default(props as never);
      },
      resolveHead: async (props: PageProps) => {
        const mod = await loadSynced();
        return mod.generateHead ? await mod.generateHead(props) : mod.head;
      },
      checkArgs: async ({ params, searchParams }: PageProps) => {
        (await loadModule()).definition?.resolveArgs({ params, searchParams });
      },
    };
    if (kind === "page") {
      routeRender.getPageConfig = pageConfigOf;
      routeRender.getRouteDefinition = async () => (await loadModule()).definition;
    } else {
      routeRender.getLayoutPageConfig = pageConfigOf;
      routeRender.getLayoutTheme = async () => {
        const { module: mod } = await loadModule();
        return "theme" in mod ? (mod.theme as string | undefined) : undefined;
      };
      routeRender.resolveNotFound = async () => syncFallbacks((await loadModule()).module as LayoutModule).NotFound;
      routeRender.resolveError = async () => syncFallbacks((await loadModule()).module as LayoutModule).Error;
    }
    return routeRender;
  }

  // `_overrides.tsx` renders via its generated "use client" wrapper, a client reference on the server: createElement.
  #makeOverridesRender(key: string, loader: () => Promise<RouteModuleSource>): RouteRender {
    const loadModule = RouteTreeBuilder.#makeLazyModule(key, "overrides", loader);
    return {
      isAsync: true,
      render: (async ({ children }: LayoutProps) => {
        const { module: mod } = await loadModule();
        if (!mod.default) throw new Error(`[route-convention] ${key} generated override wrapper has no default export`);
        return createElement(mod.default as never, { children } as never);
      }) as RouteRender["render"],
    };
  }

  static #composeHeadResolvers(...resolvers: (ResolveHead | undefined)[]): ResolveHead | undefined {
    const chain = resolvers.filter((resolver): resolver is ResolveHead => Boolean(resolver));
    if (chain.length === 0) return undefined;
    return async (props) => {
      for (const resolver of chain) {
        const head = await resolver(props);
        if (head !== null && head !== undefined) return head;
      }
      return undefined;
    };
  }
}
