import type { PageState, PathRoute } from "akanjs/client";
import type { Logger } from "akanjs/common";
import type { ReactNode } from "react";
import { RouteHead } from "../client/route/RouteHead";
import { akanHeadSnapshotKey, createAkanLocaleAlternateHeadSnapshot, mergeAkanHeadSnapshots } from "./head";
import { RouteElementComposer } from "./routeElementComposer";
import {
  AKAN_RSC_HEAD_SNAPSHOT_MAX_HEADER_BYTES,
  type AkanHeadSnapshotV1,
  type AkanRouterStateV1,
  type AkanRscPatchDecision,
  createAkanRouterState,
  isAkanRscPartialCommitEnabled,
  readAkanRouterStateRequest,
  resolveAkanRscPartialDecision,
  resolveAkanRscPatchDecision,
} from "./routeState";
import { RouteTreeBuilder } from "./routeTreeBuilder";
import { resolveAkanRscHeadSafePatchDecision } from "./rscWorkerCache";

type RouteHeadLayers = Awaited<ReturnType<typeof RouteElementComposer.resolveHeadLayers>>;
type RouteMatch = { pathRoute: PathRoute; params: Record<string, string> };
type SearchParams = Record<string, string | string[]>;
type FrameChange = "params-changed" | "layouts-changed" | "page-state-changed" | "frame-unknown";

export interface RouteHeadSnapshots {
  layouts: AkanHeadSnapshotV1;
  layoutsKey: string;
  page: AkanHeadSnapshotV1;
}

export interface ResolvedRouteHead {
  layers: RouteHeadLayers;
  snapshots?: RouteHeadSnapshots;
}

export interface RscPatchPlan {
  targetRouterState: AkanRouterStateV1 | null;
  currentRouterState: ReturnType<typeof readAkanRouterStateRequest>;
  decision: AkanRscPatchDecision;
  /** Resolved once the route's guards admitted a head-safe patch; the render reuses it rather than run it again. */
  admittedHead?: ResolvedRouteHead;
}

interface RscPatchPlannerProps {
  logger: Logger;
  routes: () => PathRoute[];
  buildId: () => number;
  basePathOf: (url: URL) => string | null;
  localeAlternatesOf: (url: URL) => Record<string, string>;
  defaultHead: () => ReactNode;
}

export class RscPatchPlanner {
  readonly #props: RscPatchPlannerProps;
  readonly #headTooLargeRoutes = new Set<string>();

  constructor(props: RscPatchPlannerProps) {
    this.#props = props;
  }

  //? The key rides on the router state the client commits with the page, so the next request names the head that
  //? commit renders, never one still on screen from the page before it.
  static routeStateWith(state: AkanRouterStateV1 | null, headKey: string | undefined): AkanRouterStateV1 | null {
    return state && headKey ? { ...state, headKey } : state;
  }

  async plan({
    request,
    url,
    match,
    searchParams,
  }: {
    request: Request;
    url: URL;
    match: RouteMatch | null;
    searchParams: SearchParams;
  }): Promise<RscPatchPlan> {
    const currentRouterState = readAkanRouterStateRequest(request.headers);
    if (!match) {
      const decision = { status: "full" as const, reason: "missing-route", commonPrefixLength: 0 };
      return { targetRouterState: null, currentRouterState, decision };
    }
    const targetRouterState = createAkanRouterState({
      pathRoute: match.pathRoute,
      href: url.href,
      buildId: this.#props.buildId(),
    });
    const partialDecision = resolveAkanRscPartialDecision({
      currentState: currentRouterState.state,
      currentRoute: currentRouterState.currentRoute,
      targetState: targetRouterState,
    });
    const patchDecision = resolveAkanRscPatchDecision({
      currentState: currentRouterState.state,
      targetState: targetRouterState,
      partialDecision,
    });
    const { decision, admittedHead } = await this.#headSafe(
      url,
      match,
      searchParams,
      currentRouterState.state,
      patchDecision,
    );
    return { targetRouterState, currentRouterState, decision, admittedHead };
  }

  async resolveHead(
    url: URL,
    pathRoute: PathRoute,
    params: Record<string, string>,
    searchParams: SearchParams,
  ): Promise<ResolvedRouteHead> {
    const layers = await RouteElementComposer.resolveHeadLayers({ pathRoute, params, searchParams });
    return { layers, snapshots: this.#snapshotsOf(url, layers) };
  }

  // Runs the head only when a patch hinges on it, so a cached replay skips it along with its notFound()/redirect().
  async #headSafe(
    url: URL,
    match: RouteMatch,
    searchParams: SearchParams,
    current: AkanRouterStateV1 | null,
    patchDecision: AkanRscPatchDecision,
  ): Promise<{ decision: AkanRscPatchDecision; admittedHead?: ResolvedRouteHead }> {
    if (patchDecision.status !== "patch" || !patchDecision.patch) return { decision: patchDecision };
    if (!isAkanRscPartialCommitEnabled()) {
      const { commonPrefixLength } = patchDecision;
      return { decision: { status: "full", reason: "guard-disabled", commonPrefixLength } };
    }
    const pageConfig = await match.pathRoute.renderPage.getPageConfig?.();
    const routeHeadKey = current?.headKey;
    const routeHeadMounted = routeHeadKey !== undefined;
    const frameChange =
      pageConfig?.rscPatchHeadSafe === true && routeHeadMounted
        ? await this.#frameChangeOf(url, match, current, patchDecision.patch.patchStartIndex)
        : undefined;
    let admittedHead: ResolvedRouteHead | undefined;
    if (pageConfig?.rscPatchHeadSafe === true && routeHeadMounted && !frameChange) {
      //? Security: a head-safe patch reads the page's head before its suffix renders, so the route's guards run
      //? first (a refusal there keeps only the layouts above it), and the suffix does not run them again.
      await RouteElementComposer.admit({ pathRoute: match.pathRoute, params: match.params, searchParams });
      admittedHead = await this.resolveHead(url, match.pathRoute, match.params, searchParams);
    }
    const snapshots = admittedHead?.snapshots;
    const decision = resolveAkanRscHeadSafePatchDecision({
      partialCommitEnabled: true,
      patchDecision,
      pageConfig,
      routeHeadMounted,
      frameChange,
      headSnapshot: snapshots?.page,
      layoutsHeadChanged: !!snapshots && snapshots.layoutsKey !== routeHeadKey,
    });
    if (decision.reason === "head-too-large") this.#warnHeadTooLarge(url, match.pathRoute.path);
    return { decision, admittedHead };
  }

  #warnHeadTooLarge(url: URL, routePath: string) {
    if (this.#headTooLargeRoutes.has(routePath)) return;
    this.#headTooLargeRoutes.add(routePath);
    const alternates = Object.keys(this.#props.localeAlternatesOf(url)).length;
    this.#props.logger.warn(
      `[rsc] ${routePath} renders whole on sibling navigations: its page head and ${alternates} locale alternate links are over the ${AKAN_RSC_HEAD_SNAPSHOT_MAX_HEADER_BYTES}-byte patch header limit`,
    );
  }

  //? Taken from any head that is plain title, meta and link while partial commit is on, so every page it renders can be
  //? the one a patch leaves from, not only the opted-in pages a patch lands on. The layouts' part stays on the client
  //? under the layouts a patch keeps, so a patch's header carries only the page's part and its locale alternates.
  #snapshotsOf(url: URL, { head, layouts, page }: RouteHeadLayers): RouteHeadSnapshots | undefined {
    if (!isAkanRscPartialCommitEnabled()) return undefined;
    const layoutsSnapshot = RouteHead.snapshotOf(RouteHead.mergePage(layouts, undefined));
    const pageSnapshot = RouteHead.snapshotOf(page ?? (head.node == null ? this.#props.defaultHead() : undefined));
    if (!layoutsSnapshot || !pageSnapshot) return undefined;
    const alternates = createAkanLocaleAlternateHeadSnapshot(this.#props.localeAlternatesOf(url));
    return {
      layouts: layoutsSnapshot,
      layoutsKey: akanHeadSnapshotKey(layoutsSnapshot),
      page: mergeAkanHeadSnapshots(pageSnapshot, alternates) ?? pageSnapshot,
    };
  }

  //? A patch keeps every layout above it as the page left from rendered it, and the SSR wrapper with them: the same
  //? layouts, the params and the frame settings they read must hold for the target, or the kept layouts are the old
  //? page's. Segment keys name URL prefixes only, so two route groups' layouts at one prefix pass as the same segment.
  async #frameChangeOf(
    url: URL,
    match: RouteMatch,
    current: AkanRouterStateV1 | null,
    patchStartIndex: number,
  ): Promise<FrameChange | undefined> {
    const currentUrl = current && URL.canParse(current.href) ? new URL(current.href) : null;
    const currentMatch = currentUrl ? RouteTreeBuilder.match(currentUrl.pathname, this.#props.routes()) : null;
    if (!currentMatch) return "frame-unknown";
    const paramNames = new Set([...Object.keys(currentMatch.params), ...Object.keys(match.params)]);
    if ([...paramNames].some((name) => currentMatch.params[name] !== match.params[name])) return "params-changed";
    const keptLayouts = (route: PathRoute) =>
      [...route.renderRootLayouts, ...route.renderLayouts].slice(0, patchStartIndex);
    const [fromLayouts, toLayouts] = [keptLayouts(currentMatch.pathRoute), keptLayouts(match.pathRoute)];
    if (fromLayouts.length !== toLayouts.length || fromLayouts.some((layout, index) => layout !== toLayouts[index]))
      return "layouts-changed";
    try {
      const basePath = this.#props.basePathOf(url);
      const [from, to] = await Promise.all([
        RouteElementComposer.resolveSsrFramePathRoute({ pathRoute: currentMatch.pathRoute, basePath }),
        RouteElementComposer.resolveSsrFramePathRoute({ pathRoute: match.pathRoute, basePath }),
      ]);
      return JSON.stringify(RscPatchPlanner.#keptFrameOf(from.pageState)) ===
        JSON.stringify(RscPatchPlanner.#keptFrameOf(to.pageState))
        ? undefined
        : "page-state-changed";
    } catch (error) {
      this.#props.logger.warn(
        `[rsc] frame of ${current?.routeId ?? "?"} did not resolve, so the patch renders whole: ${error}`,
      );
      return "frame-unknown";
    }
  }

  //? `cache` and `ssr` steer how the target is served, not how the kept layouts or the SSR wrapper render it.
  static #keptFrameOf({ cache: _cache, ssr: _ssr, ...frame }: PageState) {
    return frame;
  }
}
