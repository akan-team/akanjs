import type { LayoutFallbackRoute, PathRoute, ResolvedHead } from "akanjs/client";
import type { AkanI18nConfig, Logger } from "akanjs/common";
import { setRequestFrameState, setRequestTheme, untrackedCookies, untrackedRequest } from "akanjs/fetch";
import type { ReactNode } from "react";
import { RouteHead } from "../client/route/RouteHead";
import { ViewportMeta } from "../client/viewportMeta";
import { FallbackHead } from "./fallbackHead";
import { resolveHeadResult } from "./head";
import { type AdmittedNotFoundFallback, RouteElementComposer, type RouteNotFoundInPlace } from "./routeElementComposer";
import { RouteShellGate } from "./routeShellGate";
import { RscDocumentHead } from "./rscDocumentHead";
import type { ResolvedRouteHead, RscPatchPlanner } from "./rscPatchPlanner";
import { isAkanNotFoundError } from "./rscRenderControl";
import {
  createSystemPageDocument,
  getPathnameLocale,
  getSystemPageHomeHref,
  SystemPageMain,
} from "./systemPageDocument";

interface RscRouteDocumentProps {
  logger: Logger;
  head: RscDocumentHead;
  patchPlanner: RscPatchPlanner;
  i18n: () => AkanI18nConfig;
  basePaths: () => string[];
}

export class RscRouteDocument {
  readonly #props: RscRouteDocumentProps;
  readonly #logger: Logger;
  readonly #head: RscDocumentHead;
  readonly #patchPlanner: RscPatchPlanner;

  constructor(props: RscRouteDocumentProps) {
    this.#props = props;
    this.#logger = props.logger;
    this.#head = props.head;
    this.#patchPlanner = props.patchPlanner;
  }

  get #i18n(): AkanI18nConfig {
    return this.#props.i18n();
  }

  get #basePaths(): string[] {
    return this.#props.basePaths();
  }

  async renderFallbackDocument({
    kind,
    route,
    params,
    searchParams,
    pathname,
    url,
    error,
    digest,
    gate,
  }: {
    kind: "not-found" | "error";
    route: PathRoute | LayoutFallbackRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    pathname: string;
    url: URL;
    error?: unknown;
    digest?: string;
    gate?: RouteShellGate;
  }): Promise<ReactNode | null> {
    setRequestFrameState(
      await RouteElementComposer.resolveSsrFallbackFrameState({
        route,
        basePath: this.#head.getBasePath(url),
      }),
    );
    const fallbackHead = new FallbackHead();
    const body = await RouteElementComposer.composeFallback({
      kind,
      route,
      params,
      searchParams,
      pathname,
      error,
      digest,
      gate,
      head: fallbackHead,
    });
    if (!body) return null;
    const viewport = await RscDocumentHead.firstRootValue(route.renderRootLayouts, (render) =>
      render.getLayoutViewport?.(),
    );
    const manifestLink = await this.#head.renderManifestLink(url, route.renderRootLayouts);
    const routeHead = await RscRouteDocument.#resolveFallbackHead({ kind, route, params, searchParams });
    return (
      <html lang={params.lang ?? getPathnameLocale(pathname, this.#i18n)} suppressHydrationWarning>
        <head key="head">
          <meta key="charset" charSet="utf-8" />
          {this.#head.renderViewport(viewport)}
          <FallbackHead.Settled
            key="route-head"
            head={fallbackHead}
            until={gate?.opened ?? Promise.resolve()}
            render={(tags) =>
              this.#head.renderHeadTags(url, {
                manifestLink,
                routeHead,
                noindex: true,
                tags,
                themeColors: ViewportMeta.themeColorNodes(viewport),
              })
            }
          />
          {this.#head.renderStylesheet(pathname)}
        </head>
        <body key="body">
          {body}
          {gate?.holding ? <RouteShellGate.Wait until={gate.opened} /> : null}
        </body>
      </html>
    );
  }

  //? A not-found view is its layouts' view: the page's own head describes what is missing, or is what called notFound(),
  //? and a layout head that called it would refuse the view again.
  static async #resolveFallbackHead({
    kind,
    route,
    params,
    searchParams,
  }: {
    kind: "not-found" | "error";
    route: PathRoute | LayoutFallbackRoute;
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
  }): Promise<ResolvedHead> {
    if (!("resolveHead" in route)) return { node: undefined };
    if (kind === "error")
      return await RouteElementComposer.resolveHeadWithSnapshot({ pathRoute: route, params, searchParams });
    const levels = await Promise.all(
      [...route.renderRootLayouts, ...route.renderLayouts].map(async (render) => {
        try {
          return await render.resolveHead?.({ params, searchParams });
        } catch (error) {
          if (isAkanNotFoundError(error)) return undefined;
          throw error;
        }
      }),
    );
    return resolveHeadResult(RouteHead.mergePage(RouteHead.merge(levels), undefined));
  }

  async renderMatched(
    url: URL,
    match: { pathRoute: PathRoute; params: Record<string, string> },
    searchParams: Record<string, string | string[]>,
    notFound: RouteNotFoundInPlace,
    { guarded = false, head, gate }: { guarded?: boolean; head?: ResolvedRouteHead; gate?: RouteShellGate } = {},
  ): Promise<{ element: ReactNode; head: ResolvedRouteHead }> {
    this.#logger.verbose(
      `composing route element pathname=${url.pathname} search=${url.search || "(none)"} params=${JSON.stringify(match.params)}`,
    );
    const pathRoute = await RouteElementComposer.resolveSsrFramePathRoute({
      pathRoute: match.pathRoute,
      basePath: this.#head.getBasePath(url),
    });
    setRequestFrameState(pathRoute.pageState);
    if (!guarded) await RouteElementComposer.admit({ pathRoute, params: match.params, searchParams });
    //? The provider names the theme only as it renders, which can be after the HTML shell and its data-theme are out.
    const rootLayouts = pathRoute.renderRootLayouts;
    const rootTheme = await RscDocumentHead.firstRootValue(rootLayouts, (render) => render.getLayoutTheme?.());
    if (rootTheme) setRequestTheme(rootTheme);
    const viewport = await RscDocumentHead.firstRootValue(rootLayouts, (render) => render.getLayoutViewport?.());
    //? The result cache keys on the theme cookie, so this color is never replayed to a visitor on another theme.
    const themeColorTheme = untrackedCookies().get("theme")?.value ?? rootTheme;
    const manifestLink = await this.#head.renderManifestLink(url, rootLayouts);
    const routeHead = head ?? (await this.#patchPlanner.resolveHead(url, pathRoute, match.params, searchParams));
    const fallbackHead = new FallbackHead();
    const body = RouteElementComposer.compose({
      pathRoute,
      params: match.params,
      searchParams,
      navKey: url.pathname + url.search,
      notFound: { ...notFound, head: fallbackHead },
      gate,
    });
    const themeColors = ViewportMeta.themeColorNodes(viewport, themeColorTheme);
    const renderHead = async (tags: ReactNode[] | null) => {
      if (!tags)
        return this.#head.renderHeadTags(url, {
          manifestLink,
          routeHead: routeHead.layers.head,
          snapshots: routeHead.snapshots,
          themeColors,
        });
      const layoutsHead = await RscRouteDocument.#resolveFallbackHead({
        kind: "not-found",
        route: pathRoute,
        params: match.params,
        searchParams,
      });
      return this.#head.renderHeadTags(url, {
        manifestLink,
        routeHead: layoutsHead,
        noindex: true,
        tags,
        themeColors,
      });
    };
    // Cookie theme is applied on the HTML stream and by the client so RSC cache cannot replay a stale data-theme.
    const element = (
      <html lang={match.params.lang ?? this.#i18n.defaultLocale} suppressHydrationWarning>
        <head key="head">
          <meta key="charset" charSet="utf-8" />
          {this.#head.renderViewport(viewport)}
          <FallbackHead.Settled
            key="route-head"
            head={fallbackHead}
            until={gate?.opened ?? Promise.resolve()}
            render={renderHead}
          />
          {this.#head.renderStylesheet(url.pathname)}
        </head>
        <body key="body">
          {body}
          {gate?.holding ? <RouteShellGate.Wait until={gate.opened} /> : null}
        </body>
      </html>
    );
    return { element, head: routeHead };
  }

  async renderMatchedSuffix(
    url: URL,
    match: { pathRoute: PathRoute; params: Record<string, string> },
    patchStartIndex: number,
    searchParams: Record<string, string | string[]>,
    notFound: RouteNotFoundInPlace,
    { guarded = false }: { guarded?: boolean } = {},
  ): Promise<ReactNode | null> {
    this.#logger.verbose(
      `composing route suffix pathname=${url.pathname} start=${patchStartIndex} params=${JSON.stringify(match.params)}`,
    );
    const pathRoute = await RouteElementComposer.resolveSsrFramePathRoute({
      pathRoute: match.pathRoute,
      basePath: this.#head.getBasePath(url),
    });
    setRequestFrameState(pathRoute.pageState);
    if (!guarded) await RouteElementComposer.admit({ pathRoute, params: match.params, searchParams });
    await RouteElementComposer.resolveSuffixLoadings(pathRoute, patchStartIndex);
    return RouteElementComposer.composeSuffix({
      pathRoute,
      params: match.params,
      searchParams,
      patchStartIndex,
      navKey: url.pathname + url.search,
      notFound,
    });
  }

  async renderNotFound(
    url: URL,
    notFoundFallback: AdmittedNotFoundFallback | null,
    gate?: RouteShellGate,
  ): Promise<ReactNode> {
    if (notFoundFallback) {
      const { route, params, searchParams } = notFoundFallback;
      try {
        const fallback = await this.renderFallbackDocument({
          kind: "not-found",
          route,
          params,
          searchParams,
          pathname: url.pathname,
          url,
          gate,
        });
        if (fallback) return fallback;
      } catch (error) {
        this.#logger.error(
          `custom unmatched not-found fallback failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
        );
      }
    }
    return this.renderSystemNotFound(url);
  }

  notFoundInPlace(url: URL, probe: { hit: boolean }): RouteNotFoundInPlace {
    return {
      pathname: url.pathname,
      onNotFound: () => {
        probe.hit = true;
      },
      systemFallback: () => (
        <SystemPageMain kind="not-found" pathname={url.pathname} homeHref={this.#systemHomeHref(url)} />
      ),
    };
  }

  #systemHomeHref(url: URL): string {
    return getSystemPageHomeHref({
      pathname: url.pathname,
      i18n: this.#i18n,
      basePaths: this.#basePaths,
      headerBasePath: untrackedRequest()?.headers.get("x-base-path"),
    });
  }

  renderSystemNotFound(url: URL): ReactNode {
    return createSystemPageDocument({
      kind: "not-found",
      pathname: url.pathname,
      lang: getPathnameLocale(url.pathname, this.#i18n),
      homeHref: this.#systemHomeHref(url),
      stylesheetHref: this.#head.getStylesheetHref(url.pathname),
    });
  }
}
