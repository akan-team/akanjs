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
import { resolveHeadResult } from "./head";
import {
  type AkanRouteSegmentState,
  createAkanRouteSegments,
  createAkanSegmentOutletKey,
  isAkanRscPartialCommitEnabled,
} from "./routeState";
import { AkanSegmentOutletReference } from "./rscSegmentOutletReference";

/** How a render reached after the layouts streamed answers `router.notFound()` — in place, since its parents are out. */
export interface RouteNotFoundInPlace {
  pathname: string;
  /** Rendered when no layout above the thrower declares `.notFound()`. */
  systemFallback: () => ReactNode;
  onNotFound: () => void;
}

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
      pageState: RouteElementComposer.#webPageState(pageConfigChain, pathRoute.path, basePath),
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
    return RouteElementComposer.#webPageState(pageConfigChain, route.path, basePath);
  }

  static #webPageState(configChain: PageConfig[], path: string, basePath?: string | null) {
    return resolvePageState({
      configChain,
      path,
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
    notFound,
  }: {
    pathRoute: PathRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    navKey?: string;
    notFound?: RouteNotFoundInPlace;
  }): ReactNode {
    return RouteElementComposer.composeRenders({
      renders: RouteElementComposer.#getRenderStack(pathRoute),
      segments: isAkanRscPartialCommitEnabled() ? createAkanRouteSegments(pathRoute) : undefined,
      params,
      searchParams,
      navKey,
      notFound,
    });
  }

  static async checkArgs({
    pathRoute,
    params,
    searchParams,
  }: {
    pathRoute: PathRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
  }): Promise<void> {
    await Promise.all(
      RouteElementComposer.#getRenderStack(pathRoute).map((routeRender) =>
        routeRender?.checkArgs?.({ params, searchParams }),
      ),
    );
  }

  static composeSuffix({
    pathRoute,
    params,
    searchParams,
    patchStartIndex,
    navKey,
    notFound,
  }: {
    pathRoute: PathRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    patchStartIndex: number;
    navKey?: string;
    notFound?: RouteNotFoundInPlace;
  }): ReactNode | null {
    const renders = RouteElementComposer.#getRenderStack(pathRoute);
    if (!Number.isInteger(patchStartIndex) || patchStartIndex < 0 || patchStartIndex >= renders.length) return null;
    return RouteElementComposer.composeRenders({
      renders: renders.slice(patchStartIndex),
      owners: renders.slice(0, patchStartIndex),
      params,
      searchParams,
      navKey,
      notFound,
    });
  }

  // The patch path never runs `resolveHead`, whose side effect fills `routeRender.Loading`; without this the
  // client-navigation fallback is empty.
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
      await RouteElementComposer.resolveHeadWithSnapshot({
        pathRoute,
        params,
        searchParams,
      })
    ).node;
  }

  static async resolveHeadWithSnapshot({
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
        RouteElementComposer.#makeFallbackRouteRender({ kind, fallback, pathname, error, digest }),
      ];
      return RouteElementComposer.composeRenders({ renders, params, searchParams });
    }
    return null;
  }

  static composeRenders({
    renders,
    owners = [],
    segments,
    params,
    searchParams,
    navKey,
    notFound,
  }: {
    renders: RouteRender[];
    /** Layouts above `renders` that this element leaves out (a patch) but whose `.notFound()` still applies. */
    owners?: RouteRender[];
    segments?: AkanRouteSegmentState[];
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    navKey?: string;
    notFound?: RouteNotFoundInPlace;
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
          <RouteElementComposer.AsyncRender
            routeRender={routeRender}
            params={params}
            searchParams={searchParams}
            notFound={notFound ? { ...notFound, owners: [...owners, ...renders.slice(0, i)] } : undefined}
          >
            {element}
          </RouteElementComposer.AsyncRender>
        </Suspense>
      );
      const segment = segments?.[i];
      if (segments && segment?.kind === "page") {
        const outletKey =
          createAkanSegmentOutletKey(
            segments.slice(0, i + 1).map((item) => item.key),
            i,
          ) ?? segment.key;
        element = <AkanSegmentOutletReference segmentKey={outletKey}>{element}</AkanSegmentOutletReference>;
      }
    }
    return element;
  }

  static AsyncRender = async ({
    routeRender,
    children,
    params,
    searchParams,
    notFound,
  }: {
    routeRender: RouteRender;
    children: ReactNode;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    notFound?: RouteNotFoundInPlace & { owners: RouteRender[] };
  }) => {
    try {
      return RouteElementComposer.#normalizeReactNode(
        await routeRender.render({ children, params, searchParams } as never),
      );
    } catch (error) {
      if (!notFound || (error as { digest?: unknown } | null)?.digest !== "AKAN_NOT_FOUND") throw error;
      notFound.onNotFound();
      return await RouteElementComposer.#renderNotFoundInPlace(notFound, params, searchParams);
    }
  };

  static async #renderNotFoundInPlace(
    { owners, pathname, systemFallback }: RouteNotFoundInPlace & { owners: RouteRender[] },
    params: Record<string, string>,
    searchParams: Record<string, string | string[]>,
  ): Promise<ReactNode> {
    for (let index = owners.length - 1; index >= 0; index--) {
      const fallback = await owners[index]?.resolveNotFound?.();
      if (!fallback) continue;
      return (
        <>
          <meta name="robots" content="noindex" />
          {RouteElementComposer.#normalizeReactNode(await fallback({ params, searchParams, pathname }))}
        </>
      );
    }
    return (
      <>
        <meta name="robots" content="noindex" />
        {systemFallback()}
      </>
    );
  }

  static #makeFallbackRouteRender({
    kind,
    fallback,
    pathname,
    error,
    digest,
  }: {
    kind: "not-found" | "error";
    fallback: LayoutNotFoundRender | LayoutErrorRender;
    pathname: string;
    error?: unknown;
    digest?: string;
  }): RouteRender {
    return {
      render: (props: { params: Record<string, string>; searchParams: Record<string, string | string[]> }) => {
        const { params, searchParams } = props;
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

    const normalizedChildren = RouteElementComposer.#normalizeReactNode(props.children);
    if (normalizedChildren === props.children) return node;

    return cloneElement(node as ReactElement<{ children?: ReactNode }>, undefined, normalizedChildren);
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
