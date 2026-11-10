import type {
  Head,
  LayoutErrorRender,
  LayoutFallbackRoute,
  LayoutNotFoundRender,
  PageConfig,
  PathRoute,
  ResolvedHead,
  ResolveHeadResult,
  RouteRender,
} from "akanjs/client";
import { StreamedRead } from "akanjs/fetch";
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode, Suspense } from "react";
import { getExplicitPageConfigKeys, mergePageConfigs, resolvePageState } from "../client/frameConfig";
import { RouteGuards } from "../client/route/RouteGuards";
import { RouteHead } from "../client/route/RouteHead";
import type { FallbackHead } from "./fallbackHead";
import { resolveHeadResult } from "./head";
import { RouteShellGate } from "./routeShellGate";
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
  /** The document head still to be written, which then carries the not-found view's head tags and `noindex`. */
  head?: FallbackHead;
}

export interface AdmittedNotFoundFallback {
  route: LayoutFallbackRoute;
  params: Record<string, string>;
  searchParams: Record<string, string | string[]>;
}

export class RouteElementComposer {
  static readonly #levelErrors = new WeakSet<object>();

  //? A read handed to a `Load.*` unawaited fails inside that stream's boundary in the browser, so it leaves the
  //? page's status alone; a level that also awaited it threw the read's own reason, and keeps its `.error()`.
  static streamed(error: unknown): boolean {
    return StreamedRead.is(error) && !RouteElementComposer.#levelErrors.has(error as object);
  }

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
    gate,
  }: {
    pathRoute: PathRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    navKey?: string;
    notFound?: RouteNotFoundInPlace;
    gate?: RouteShellGate;
  }): ReactNode {
    return RouteElementComposer.composeRenders({
      renders: RouteElementComposer.#getRenderStack(pathRoute),
      segments: isAkanRscPartialCommitEnabled() ? createAkanRouteSegments(pathRoute) : undefined,
      params,
      searchParams,
      navKey,
      notFound,
      gate,
    });
  }

  /**
   * Every guard of the route, a patch's included (the layouts it keeps on screen were let in for another URL), then
   * every chain's args. Guards first: a not-found for a bad path value is drawn only under layouts that let the visitor in.
   */
  static async admit({
    pathRoute,
    params,
    searchParams,
  }: {
    pathRoute: PathRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
  }): Promise<void> {
    const renders = RouteElementComposer.#getRenderStack(pathRoute);
    await RouteGuards.run(renders, { params, searchParams });
    await Promise.all(renders.map((routeRender) => routeRender?.checkArgs?.({ params, searchParams })));
  }

  //? Security: a prefetch answers as its click would up to the body: the guards still run and redirect, and a refusal is
  //? judged by the fallback the click would draw, so a path behind a guard reads the same whether or not it exists.
  static async prefetchVerdict(
    match: { pathRoute: PathRoute; params: Record<string, string> } | null,
    notFoundFallback: AdmittedNotFoundFallback | null,
    searchParams: Record<string, string | string[]>,
  ): Promise<"refused" | "admitted" | "unchecked"> {
    if (!match) {
      const refused = notFoundFallback && (await RouteElementComposer.#layoutsRefusePrefetch(notFoundFallback.route));
      return refused ? "refused" : "unchecked";
    }
    const configChain = await RouteElementComposer.#resolvePageConfigChain(match.pathRoute);
    if (!configChain.some((config) => config.prefetch === false)) return "unchecked";
    try {
      await RouteElementComposer.admit({ ...match, searchParams });
    } catch (error) {
      if (RouteElementComposer.#isRedirect(error)) throw error;
      const fallbackRoute = RouteElementComposer.fallbackRouteOf(match.pathRoute, error);
      if (await RouteElementComposer.#layoutsRefusePrefetch(fallbackRoute)) return "refused";
      throw error;
    }
    return mergePageConfigs(configChain).prefetch === false ? "refused" : "admitted";
  }

  static async #layoutsRefusePrefetch(route: PathRoute | LayoutFallbackRoute): Promise<boolean> {
    return mergePageConfigs(await RouteElementComposer.#resolveLayoutPageConfigChain(route)).prefetch === false;
  }

  //? Security: a guard refused everything from its render down, so a fallback drawn after it keeps only the layouts above
  //? it, and no head: those bodies and heads read what the refused visitor may not.
  static fallbackRouteOf<Route extends LayoutFallbackRoute>(route: Route, error: unknown): Route | LayoutFallbackRoute {
    const refusedAt = RouteGuards.refusedAt(error);
    if (refusedAt === undefined) return route;
    return {
      path: route.path,
      pathSegments: route.pathSegments,
      renderRootLayouts: route.renderRootLayouts.slice(0, refusedAt),
      renderLayouts: route.renderLayouts.slice(0, Math.max(0, refusedAt - route.renderRootLayouts.length)),
    };
  }

  //? Security: an unmatched path draws its layouts' not-found, so their guards first decide which of them it may show,
  //? and a redirect still answers as one.
  static async admittedFallbackOf(
    route: LayoutFallbackRoute,
    props: { params: Record<string, string>; searchParams: Record<string, string | string[]> },
  ): Promise<LayoutFallbackRoute> {
    try {
      await RouteGuards.run([...route.renderRootLayouts, ...route.renderLayouts], props);
      return route;
    } catch (error) {
      if (RouteElementComposer.#isRedirect(error)) throw error;
      return RouteElementComposer.fallbackRouteOf(route, error);
    }
  }

  static async admitNotFoundFallback(
    matched: { fallbackRoute: LayoutFallbackRoute; params: Record<string, string> } | null,
    searchParams: Record<string, string | string[]>,
  ): Promise<AdmittedNotFoundFallback | null> {
    if (!matched) return null;
    const props = { params: matched.params, searchParams };
    return { ...props, route: await RouteElementComposer.admittedFallbackOf(matched.fallbackRoute, props) };
  }

  static #isRedirect(error: unknown): boolean {
    return (error as { digest?: unknown } | null)?.digest === "AKAN_REDIRECT";
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

  static async resolveHeadLayers({
    pathRoute,
    params,
    searchParams,
  }: {
    pathRoute: PathRoute;
    params: Record<string, string>;
    searchParams: Record<string, string[] | string>;
  }): Promise<{ head: ResolvedHead; layouts: ResolveHeadResult; page: ResolveHeadResult }> {
    if (!pathRoute.resolveLayoutsHead) {
      const page = await pathRoute.resolveHead?.({ params, searchParams });
      return { head: resolveHeadResult(page), layouts: undefined, page };
    }
    const [layouts, page] = await Promise.all([
      pathRoute.resolveLayoutsHead({ params, searchParams }),
      pathRoute.renderPage.resolveHead?.({ params, searchParams }),
    ]);
    return { head: resolveHeadResult(RouteHead.mergePage(layouts, page)), layouts, page };
  }

  static async composeFallback({
    kind,
    route,
    params,
    searchParams,
    pathname,
    error,
    digest,
    gate,
    head,
  }: {
    kind: "not-found" | "error";
    route: PathRoute | LayoutFallbackRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    pathname: string;
    error?: unknown;
    digest?: string;
    gate?: RouteShellGate;
    head?: FallbackHead;
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
        RouteElementComposer.#makeFallbackRouteRender({ kind, fallback, pathname, error, digest, head }),
      ];
      return RouteElementComposer.composeRenders({ renders, params, searchParams, gate });
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
    gate,
  }: {
    renders: RouteRender[];
    /** Layouts above `renders` that this element leaves out (a patch) but whose `.notFound()` still applies. */
    owners?: RouteRender[];
    segments?: AkanRouteSegmentState[];
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    navKey?: string;
    notFound?: RouteNotFoundInPlace;
    /** Holds the response until every level above the first `.loading()` has rendered. */
    gate?: RouteShellGate;
  }): ReactNode {
    const levelGates = gate ? RouteElementComposer.#gateLevels(renders, gate) : [];
    let element: ReactNode = null;
    for (let i = renders.length - 1; i >= 0; i--) {
      const routeRender = renders[i];
      if (!routeRender) continue;
      const loadingFallback = RouteElementComposer.#composeLoadingFallback(renders.slice(i), params);
      const suspenseKey =
        navKey && loadingFallback != null && i === renders.length - 1 ? `akan-loading:${navKey}` : undefined;
      const levelGate = levelGates[i];
      const level = (
        <RouteElementComposer.AsyncRender
          routeRender={routeRender}
          params={params}
          searchParams={searchParams}
          notFound={notFound ? { ...notFound, owners: [...owners, ...renders.slice(0, i)] } : undefined}
          gate={levelGate}
        >
          {element}
        </RouteElementComposer.AsyncRender>
      );
      //? Even with no fallback, the boundary is where React client-renders a level that failed SSR or hydration.
      element = (
        <Suspense key={suspenseKey} fallback={loadingFallback}>
          {level}
          {routeRender.Loading && levelGate ? <RouteShellGate.Wait until={levelGate.opened} /> : null}
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
    gate,
  }: {
    routeRender: RouteRender;
    children: ReactNode;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    notFound?: RouteNotFoundInPlace & { owners: RouteRender[] };
    gate?: RouteShellGate;
  }) => {
    gate?.enter();
    try {
      return RouteElementComposer.#normalizeReactNode(
        await routeRender.render({ children, params, searchParams } as never),
      );
    } catch (error) {
      RouteElementComposer.#recordLevelError(error);
      if (!notFound || (error as { digest?: unknown } | null)?.digest !== "AKAN_NOT_FOUND") throw error;
      notFound.onNotFound();
      try {
        return await RouteElementComposer.#renderNotFoundInPlace(notFound, params, searchParams);
      } catch (viewError) {
        RouteElementComposer.#recordLevelError(viewError);
        throw viewError;
      }
    } finally {
      gate?.leave();
    }
  };

  static #recordLevelError(error: unknown): void {
    if (typeof error === "object" && error !== null) RouteElementComposer.#levelErrors.add(error);
  }

  static async #renderNotFoundInPlace(
    { owners, pathname, systemFallback, head }: RouteNotFoundInPlace & { owners: RouteRender[] },
    params: Record<string, string>,
    searchParams: Record<string, string | string[]>,
  ): Promise<ReactNode> {
    const nearest = await RouteElementComposer.#nearestNotFoundView(owners, { params, searchParams, pathname });
    const view = nearest ? nearest.view : systemFallback();
    const { tags, rest } = RouteHead.split(view);
    if (head?.offer(tags)) return rest;
    return (
      <>
        <meta name="robots" content="noindex" />
        {view}
      </>
    );
  }

  static async #nearestNotFoundView(
    owners: RouteRender[],
    props: { params: Record<string, string>; searchParams: Record<string, string | string[]>; pathname: string },
  ): Promise<{ view: ReactNode } | null> {
    for (let index = owners.length - 1; index >= 0; index--) {
      const fallback = await owners[index]?.resolveNotFound?.();
      if (fallback) return { view: RouteElementComposer.#normalizeReactNode(await fallback(props)) };
    }
    return null;
  }

  static #makeFallbackRouteRender({
    kind,
    fallback,
    pathname,
    error,
    digest,
    head,
  }: {
    kind: "not-found" | "error";
    fallback: LayoutNotFoundRender | LayoutErrorRender;
    pathname: string;
    error?: unknown;
    digest?: string;
    head?: FallbackHead;
  }): RouteRender {
    return {
      render: async (props: { params: Record<string, string>; searchParams: Record<string, string | string[]> }) => {
        const { params, searchParams } = props;
        const view =
          kind === "not-found"
            ? await (fallback as LayoutNotFoundRender)({ params, searchParams, pathname })
            : await (fallback as LayoutErrorRender)({ params, searchParams, pathname, error, digest });
        const { tags, rest } = RouteHead.split(view);
        return head?.offer(tags) ? rest : view;
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

  //? A `.loading()` boundary holds its own gate beside its level, outside the levels below, so it reveals them at once.
  static #gateLevels(renders: RouteRender[], gate: RouteShellGate): RouteShellGate[] {
    let current = gate;
    const gates = renders.map((routeRender) => {
      if (routeRender?.Loading) current = new RouteShellGate();
      return current;
    });
    for (const levelGate of new Set([gate, ...gates]))
      levelGate.hold(gates.filter((held, index) => held === levelGate && renders[index]).length);
    return gates;
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
