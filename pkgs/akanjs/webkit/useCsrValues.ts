"use client";
import {
  type CsrContextType,
  csrLocation,
  debugFrame,
  Href,
  type Location,
  type NavigationIntent,
  type PageState,
  type PageTransition,
  type PathRoute,
  type RouteGuide,
  type RouteOptions,
  type RouterInstance,
  type RouteState,
  type TransitionType,
} from "akanjs/client";
import { isNativeApp, openExternalUrl } from "akanjs/client/native";
import { useCallback, useMemo, useState } from "react";
import { CsrRefresh } from "./csrRefresh";
import { useCsrKeyboard } from "./useCsrKeyboard";
import { type CsrLocationState, useCsrLocationState } from "./useCsrLocationState";
import { type CsrNavigation, useCsrNavigation } from "./useCsrNavigation";
import { type CsrRefs, currentRouter, useCsrRefs } from "./useCsrRefs";
import { useCsrRenderTrace } from "./useCsrRenderTrace";
import { useCsrStackLifecycle } from "./useCsrStackLifecycle";
import { useCsrTransitions } from "./useCsrTransitions";
import { FRAME_Z_INDEX, useFrameSlots, useFrameViewport } from "./useFrameRuntime";
import { useResolvedFrame } from "./useResolvedFrame";
import { getSyncRouteHref, useSyncNavigation } from "./useSyncNavigation";

const useCsrRouter = ({
  refs: { pendingNavigation, pageContentRef, waitingNavigation, onBack, latestRouter },
  nav,
  navigation,
}: {
  refs: CsrRefs;
  nav: CsrLocationState;
  navigation: CsrNavigation;
}) => {
  const { getLocation, getCurrentLocation, getPrevLocation, getNextLocation, getScrollTop, history, location } = nav;
  const { setHistoryForward, setHistoryBack, setHistoryJump } = nav;
  const { cancelPendingNavigation, runForwardNavigation, broadcastSyncNavigation, settle } = navigation;
  const { shouldPrepareFrameTransition, startFrameTransition } = navigation;
  const getRouter = useCallback((): RouterInstance => {
    const playBack = (transition: TransitionType) => onBack.current[transition]?.();
    const forward =
      (kind: "push" | "replace") =>
      (href: string, { scrollToTop }: RouteOptions = {}) => {
        const location = getCurrentLocation();
        debugFrame(`router.${kind}`, { from: location.href, to: href, scrollToTop });
        //? Another document, which pushState refuses. The tab leaves rather than opening a new one as `CsrLink` does: a
        //? redirect has no click for a popup blocker to let through. A native app keeps `CsrLink`'s in-app browser.
        if (Href.hasWebScheme(href)) {
          const target = Href.toExternalUrl(href, document.baseURI);
          //? A refusal by the app's capabilities is final; window.open is not a second way out.
          if (isNativeApp())
            void openExternalUrl(target).catch((error: unknown) => {
              if (!(error instanceof Error && "code" in error && error.code === "NOT_ALLOWED"))
                window.open(target, "_blank", "noopener,noreferrer");
            });
          else if (kind === "push") csrLocation.assign(target);
          else window.location.replace(target);
          return;
        }
        if (pendingNavigation.current?.to.href === href) return;
        //? A replace takes the place of the move it cancels, as a guard refusing the page on its way redirects.
        //? Typed so the API report prints `NavigationIntent` bare; it spells out any type this file does not import.
        const cancelled: NavigationIntent | null = cancelPendingNavigation();
        if (location.href === href) {
          if (!pageContentRef.current) return;
          pageContentRef.current.scrollTop = getScrollTop(location);
          return;
        }
        runForwardNavigation(cancelled?.kind === "push" ? "push" : kind, href, { scrollToTop });
      };
    const router: RouterInstance = {
      push: forward("push"),
      replace: forward("replace"),
      refresh: () => {
        const location = getCurrentLocation();
        debugFrame("router.refresh", { href: location.href });
        CsrRefresh.request(location);
      },
      back: async ({ scrollToTop }: RouteOptions = {}) => {
        waitingNavigation.current = null;
        //? Back from a page still preparing returns to the one on screen, which is where the frame already is.
        if (cancelPendingNavigation()) return;
        const targetLocation = getPrevLocation();
        if (!targetLocation) return;
        const location = getCurrentLocation();
        debugFrame("router.back", { from: location.href, to: targetLocation.href, scrollToTop });
        //? Sent before the animation, so the screens following this one play their back alongside it, not after it.
        broadcastSyncNavigation("back", getSyncRouteHref(targetLocation));
        if (shouldPrepareFrameTransition()) await startFrameTransition();
        await playBack(location.pathRoute.pageState.transition);
        const scrollTop = pageContentRef.current?.scrollTop ?? 0;
        setHistoryBack({ type: "back", location, scrollTop, scrollToTop });
        settle(getPrevLocation());
        csrLocation.back();
      },
    };
    window.onpopstate = async (event) => {
      const href = csrLocation.href;
      const entryId = (csrLocation.state as { akanEntryId?: string } | null)?.akanEntryId;
      const isAt = (target: Location | null | undefined) =>
        !!target && (entryId ? target.entryId === entryId : target.href === href);
      const routeType = isAt(getNextLocation()) ? "forward" : isAt(getPrevLocation()) ? "back" : null;
      const scrollTop = pageContentRef.current?.scrollTop ?? 0;
      //? Safari's own swipe back has already slid the page away; playing ours as well would show the back twice.
      const isUaAnimated =
        (event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition === true;
      debugFrame("router.popstate", { href, routeType, scrollTop });
      const target = routeType ? null : history.current.locations.findIndex((candidate) => isAt(candidate));
      if (target === history.current.idx) return;
      //? The browser has moved already: a page the frame has not shown yet would be pushed onto the wrong entry.
      waitingNavigation.current = null;
      cancelPendingNavigation();
      if (target !== null) {
        if (target >= 0) setHistoryJump(target, scrollTop);
        else {
          //? An entry this stack never saw: one from before a reload that kept no stack, or a hash the browser pushed.
          const found = getLocation(href);
          const current = getCurrentLocation();
          const inPlace = found.pathRoute.path === current.pathRoute.path;
          setHistoryForward({
            type: "replace",
            location: inPlace ? { ...found, entryId: current.entryId } : found,
            scrollTop,
          });
        }
        settle(getPrevLocation());
        broadcastSyncNavigation("pop", getSyncRouteHref(getLocation(href)));
        return;
      }
      broadcastSyncNavigation(routeType === "back" ? "back" : "pop", getSyncRouteHref(getLocation(href)));
      if (routeType === "forward") {
        if (shouldPrepareFrameTransition(href)) await startFrameTransition();
        const location = getCurrentLocation();
        setHistoryForward({ type: "popForward", location, scrollTop });
        settle(location);
      } else {
        const location = getCurrentLocation();
        if (shouldPrepareFrameTransition(href)) await startFrameTransition();
        if (!isUaAnimated) await playBack(location.pathRoute.pageState.transition);
        setHistoryBack({ type: "popBack", location, scrollTop });
        settle(getPrevLocation());
      }
    };
    return router;
  }, [location, runForwardNavigation, cancelPendingNavigation, broadcastSyncNavigation, shouldPrepareFrameTransition]);
  const liveRouter = getRouter();
  latestRouter.current = liveRouter;
  //? CSR.Wrapper hands this to `router.init` once, at mount, so each call has to run the latest render's closures.
  const [router] = useState<RouterInstance>(() => ({
    push: (href, routeOptions) => currentRouter(latestRouter).push(href, routeOptions),
    replace: (href, routeOptions) => currentRouter(latestRouter).replace(href, routeOptions),
    back: (routeOptions) => currentRouter(latestRouter).back(routeOptions),
    refresh: () => currentRouter(latestRouter).refresh(),
  }));
  return router;
};

export const useCsrValues = (rootRouteGuide: RouteGuide, pathRoutes: PathRoute[]) => {
  const { viewport, updateViewport } = useFrameViewport();
  const slots = useFrameSlots();
  const [transitionPageStateSnapshot, setTransitionPageStateSnapshot] = useState<Map<string, PageState> | null>(null);
  const refs = useCsrRefs();
  const nav = useCsrLocationState(rootRouteGuide);
  const frame = useResolvedFrame({ pathRoutes, slots, transitionPageStateSnapshot, refs, nav });
  const keyboard = useCsrKeyboard({
    viewport,
    updateViewport,
    frameSlots: slots.frameSlots,
    phase: nav.phase,
    resolvedLocation: frame.resolvedLocation,
    pageContentRef: refs.pageContentRef,
  });
  const navigation = useCsrNavigation({ viewport, slots, setTransitionPageStateSnapshot, refs, nav, frame, keyboard });
  useCsrRenderTrace({ viewport, frameSlots: slots.frameSlots, refs, nav, frame, keyboard });
  const router = useCsrRouter({ refs, nav, navigation });
  useSyncNavigation({
    refs,
    nav,
    resolvedLocation: frame.resolvedLocation,
    broadcastSyncNavigation: navigation.broadcastSyncNavigation,
    router,
  });
  const { registerFrameSlot } = slots;
  const { topSafeAreaRef, bottomSafeAreaRef, prevPageContentRef, pageContentRef, frameRootRef, onBack } = refs;
  const { navigationIntent, phase, isBackgrounded, history } = nav;
  const { resolvedLocation, resolvedPrevLocation, resolvedPendingLocation, stackEntries } = frame;
  const { resolvedPathRoutes, effectivePageStateByPath } = frame;
  const { keyboardFrame, keyboardLayout, shouldAnchorContentBottom, platformProfile } = keyboard;
  const routeState: RouteState = {
    clientWidth: viewport.width,
    clientHeight: viewport.height,
    location: resolvedLocation,
    prevLocation: resolvedPrevLocation,
    pendingLocation: resolvedPendingLocation,
    stackEntries,
    navigationIntent,
    phase,
    isBackgrounded,
    history,
    topSafeAreaRef,
    bottomSafeAreaRef,
    prevPageContentRef,
    pageContentRef,
    frameRootRef,
    onBack,
    router,
    pathRoutes: resolvedPathRoutes,
    registerFrameSlot,
    frameLayout: {
      viewport,
      keyboard: keyboardFrame,
      contentViewport: keyboardLayout.contentViewport,
      keyboardAccessory: keyboardLayout.keyboardAccessory,
      contentAnchor: shouldAnchorContentBottom ? "bottom" : undefined,
      platformProfile,
      zIndex: FRAME_Z_INDEX,
      pageStateByPath: effectivePageStateByPath,
    },
  };
  const useCsrTransitionMap = useCsrTransitions(routeState);
  // Merged here, not in CSR: CSR renders one container per path route and would rebuild it for each on every render.
  const contentResizeStyle = useMemo(() => {
    if (!shouldAnchorContentBottom || !keyboardFrame.sticky) return null;
    const duration = keyboardFrame.animationDuration ?? 420;
    const easing = keyboardFrame.animationEasing ?? "cubic-bezier(0.16, 1, 0.3, 1)";
    return {
      transition: `height ${duration}ms ${easing}, padding-bottom ${duration}ms ${easing}`,
      willChange: "height, padding-bottom",
    };
  }, [shouldAnchorContentBottom, keyboardFrame.sticky, keyboardFrame.animationDuration, keyboardFrame.animationEasing]);
  const csrTransition = useCsrTransitionMap[resolvedLocation.pathRoute.pageState.transition];
  const page: PageTransition | null =
    contentResizeStyle && csrTransition.page
      ? { ...csrTransition.page, contentStyle: { ...csrTransition.page.contentStyle, ...contentResizeStyle } }
      : csrTransition.page;
  useCsrStackLifecycle({ refs, nav, frame, keyboard, csrTransition });

  return {
    ...routeState,
    ...csrTransition,
    page,
  } satisfies CsrContextType;
};
