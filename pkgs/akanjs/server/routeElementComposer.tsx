import type {
  Head,
  LayoutErrorRender,
  LayoutFallbackRoute,
  LayoutNotFoundRender,
  PageConfig,
  PathRoute,
  ResolvedHead,
  RouteRender,
} from "akanjs/client";
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode, Suspense } from "react";
import { getExplicitPageConfigKeys, resolvePageState } from "../client/frameConfig";
import { resolveHeadResult } from "./metadata";
import { type AkanRouteSegmentState, createAkanRouteSegments, createAkanSegmentOutletKey } from "./routeState";
import { isAkanRscPartialCommitEnabled } from "./rscPartialCommit";
import { AkanSegmentOutletReference } from "./rscSegmentOutletReference";

export class RouteElementComposer {
  static async resolveSsrFramePathRoute({
    pathRoute,
    basePath,
  }: {
    pathRoute: PathRoute;
    basePath?: string | null;
  }): Promise<PathRoute> {
    const pageConfigChain = await RouteElementComposer.#resolvePageConfigChain(pathRoute);
    return {
      ...pathRoute,
      pageState: resolvePageState({
        configChain: pageConfigChain,
        path: pathRoute.path,
        basePath: basePath ?? undefined,
        platform: "web",
        deviceSafeArea: { top: 0, bottom: 0 },
        cssSafeArea: { top: 0, bottom: 0 },
      }),
      pageConfigChain,
      explicitPageConfigKeys: getExplicitPageConfigKeys(pageConfigChain),
    };
  }

  static async resolveSsrFallbackFrameState({
    route,
    basePath,
  }: {
    route: PathRoute | LayoutFallbackRoute;
    basePath?: string | null;
  }) {
    const pageConfigChain = await RouteElementComposer.#resolveLayoutPageConfigChain(route);
    return resolvePageState({
      configChain: pageConfigChain,
      path: route.path,
      basePath: basePath ?? undefined,
      platform: "web",
      deviceSafeArea: { top: 0, bottom: 0 },
      cssSafeArea: { top: 0, bottom: 0 },
    });
  }

  static compose({
    pathRoute,
    params,
    searchParams,
    navKey,
  }: {
    pathRoute: PathRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    navKey?: string;
  }): ReactNode {
    return RouteElementComposer.composeRenders({
      renders: RouteElementComposer.#getRenderStack(pathRoute),
      segments: isAkanRscPartialCommitEnabled() ? createAkanRouteSegments(pathRoute) : undefined,
      params,
      searchParams,
      navKey,
    });
  }

  static composeSuffix({
    pathRoute,
    params,
    searchParams,
    patchStartIndex,
    navKey,
  }: {
    pathRoute: PathRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    patchStartIndex: number;
    navKey?: string;
  }): ReactNode | null {
    const renders = RouteElementComposer.#getRenderStack(pathRoute);
    if (!Number.isInteger(patchStartIndex) || patchStartIndex < 0 || patchStartIndex >= renders.length) return null;
    return RouteElementComposer.composeRenders({
      renders: renders.slice(patchStartIndex),
      params,
      searchParams,
      navKey,
    });
  }

  // The suffix (patch) compose path never runs `resolveHead`, which is what
  // otherwise populates `routeRender.Loading` as a side effect. Load the modules
  // for the patched render stack explicitly so `#composeLoadingFallback` has a
  // real fallback to emit for client navigation.
  static async resolveSuffixLoadings(pathRoute: PathRoute, patchStartIndex: number): Promise<void> {
    const renders = RouteElementComposer.#getRenderStack(pathRoute).slice(Math.max(patchStartIndex, 0));
    // A failed Loading load must degrade to an empty fallback, never abort the navigation.
    await Promise.all(
      renders.map((routeRender) => Promise.resolve(routeRender?.resolveLoading?.()).catch(() => undefined)),
    );
  }

  static async resolveHead({
    pathRoute,
    params,
    searchParams,
  }: {
    pathRoute: PathRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
  }): Promise<Head | null | undefined> {
    return (
      await RouteElementComposer.resolveHeadWithMetadata({
        pathRoute,
        params,
        searchParams,
      })
    ).node;
  }

  static async resolveHeadWithMetadata({
    pathRoute,
    params,
    searchParams,
  }: {
    pathRoute: PathRoute;
    params: Record<string, string>;
    searchParams: Record<string, string[] | string>;
  }): Promise<ResolvedHead> {
    return resolveHeadResult(await pathRoute.resolveHead?.({ params, searchParams }));
  }

  static async composeFallback({
    kind,
    route,
    params,
    searchParams,
    pathname,
    error,
    digest,
  }: {
    kind: "not-found" | "error";
    route: PathRoute | LayoutFallbackRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    pathname: string;
    error?: unknown;
    digest?: string;
  }): Promise<ReactNode | null> {
    const layoutStack = [...route.renderRootLayouts, ...route.renderLayouts];
    for (let index = layoutStack.length - 1; index >= 0; index--) {
      const layoutRender = layoutStack[index];
      if (!layoutRender) continue;
      const fallback =
        kind === "not-found" ? await layoutRender.resolveNotFound?.() : await layoutRender.resolveError?.();
      if (!fallback) continue;
      const renders = [
        ...layoutStack.slice(0, index + 1),
        RouteElementComposer.#makeFallbackRouteRender({
          kind,
          fallback,
          params,
          searchParams,
          pathname,
          error,
          digest,
        }),
      ];
      return RouteElementComposer.composeRenders({ renders, params, searchParams });
    }
    return null;
  }

  static composeRenders({
    renders,
    segments,
    params,
    searchParams,
    navKey,
  }: {
    renders: RouteRender[];
    segments?: AkanRouteSegmentState[];
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    navKey?: string;
  }): ReactNode {
    let element: ReactNode = null;
    for (let i = renders.length - 1; i >= 0; i--) {
      const routeRender = renders[i];
      if (!routeRender) continue;
      const loadingFallback = RouteElementComposer.#composeLoadingFallback(renders.slice(i), params);
      const suspenseKey =
        navKey && loadingFallback != null && i === renders.length - 1 ? `akan-loading:${navKey}` : undefined;
      element = (
        <Suspense key={suspenseKey} fallback={loadingFallback}>
          <RouteElementComposer.AsyncRender routeRender={routeRender} params={params} searchParams={searchParams}>
            {element}
          </RouteElementComposer.AsyncRender>
        </Suspense>
      );
      const segment = segments?.[i];
      if (segment?.kind === "page") {
        const routeSegments = segments;
        if (!routeSegments) continue;
        const outletKey =
          createAkanSegmentOutletKey(
            routeSegments.slice(0, i + 1).map((item) => item.key),
            i,
          ) ?? segment.key;
        element = <AkanSegmentOutletReference segmentKey={outletKey}>{element}</AkanSegmentOutletReference>;
      }
    }
    return element;
  }

  static async renderAsync({
    routeRender,
    children,
    params,
    searchParams,
  }: {
    routeRender: RouteRender;
    children: ReactNode;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
  }) {
    const node = await routeRender.render({ children, params, searchParams } as never);
    return RouteElementComposer.#normalizeReactNode(node);
  }

  static AsyncRender = (props: {
    routeRender: RouteRender;
    children: ReactNode;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
  }) => RouteElementComposer.renderAsync(props);

  static #makeFallbackRouteRender({
    kind,
    fallback,
    pathname,
    error,
    digest,
  }: {
    kind: "not-found" | "error";
    fallback: LayoutNotFoundRender | LayoutErrorRender;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    pathname: string;
    error?: unknown;
    digest?: string;
  }): RouteRender {
    return {
      render: (props: { params: Record<string, string>; searchParams: Record<string, string | string[]> }) => {
        const { params, searchParams } = props as {
          params: Record<string, string>;
          searchParams: Record<string, string | string[]>;
        };
        return kind === "not-found"
          ? (fallback as LayoutNotFoundRender)({ params, searchParams, pathname })
          : (fallback as LayoutErrorRender)({ params, searchParams, pathname, error, digest });
      },
    };
  }

  static #normalizeReactNode(node: ReactNode): ReactNode {
    if (Array.isArray(node)) return Children.toArray(node).map(RouteElementComposer.#normalizeReactNode);
    if (!isValidElement(node)) return node;

    const props = node.props as { children?: ReactNode };
    if (!("children" in props)) return node;

    const normalizedChildren = RouteElementComposer.#normalizeReactChildren(props.children);
    if (normalizedChildren === props.children) return node;

    return cloneElement(node as ReactElement<{ children?: ReactNode }>, undefined, normalizedChildren);
  }

  static #normalizeReactChildren(children: ReactNode): ReactNode {
    if (Array.isArray(children)) return Children.toArray(children).map(RouteElementComposer.#normalizeReactNode);
    return RouteElementComposer.#normalizeReactNode(children);
  }

  static #getRenderStack(pathRoute: PathRoute): RouteRender[] {
    return [...pathRoute.renderRootLayouts, ...pathRoute.renderLayouts, pathRoute.renderPage];
  }

  static async #resolveLayoutPageConfigChain(route: PathRoute | LayoutFallbackRoute): Promise<PageConfig[]> {
    const configs = await Promise.all(
      [...route.renderRootLayouts, ...route.renderLayouts].map((render) => render.getLayoutPageConfig?.()),
    );
    return configs.filter((config): config is PageConfig => Boolean(config));
  }

  static async #resolvePageConfigChain(pathRoute: PathRoute): Promise<PageConfig[]> {
    const layoutConfigs = await RouteElementComposer.#resolveLayoutPageConfigChain(pathRoute);
    const pageConfig = await pathRoute.renderPage.getPageConfig?.();
    return [...layoutConfigs, ...(pageConfig ? [pageConfig] : [])];
  }

  static #composeLoadingFallback(renders: RouteRender[], params: Record<string, string>): ReactNode {
    let element: ReactNode = null;
    for (let i = renders.length - 1; i >= 0; i--) {
      const Loading = renders[i]?.Loading;
      if (!Loading) continue;
      element = Loading({ params, children: element } as never) as ReactNode;
    }
    return element;
  }
}
