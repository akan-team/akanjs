"use client";
import {
  csrLocation,
  debugFrame,
  type Location,
  type LocationState,
  type NavigationIntent,
  type PageState,
  type RouteOptions,
} from "akanjs/client";
import { useCallback } from "react";
import { CsrStack } from "./CsrStack";
import { CsrPageReadiness } from "./csrPageReadiness";
import type { CsrKeyboard } from "./useCsrKeyboard";
import type { CsrLocationState } from "./useCsrLocationState";
import { type CsrRefs, currentRouter } from "./useCsrRefs";
import {
  createFrameSnapshot,
  createTransitionPlan,
  getFrameSlotsForSnapshot,
  isPendingFrameReady,
  PENDING_FRAME_READY_TIMEOUT_MS,
  prepareForFrameTransition,
  type useFrameSlots,
  type useFrameViewport,
} from "./useFrameRuntime";
import type { ResolvedFrame } from "./useResolvedFrame";
import { useBroadcastSyncNavigation } from "./useSyncNavigation";

//? A page switched in place (`transition: "none"`, a tab bar's tab) is drawn out of sight first and swapped in once its
//? layers are drawn: swapped at once, it showed each async layer's loading fallback for a frame or more, a flash on
//? every first visit. A sliding page waits the same way, or an empty shell slid in and its content popped in after.
//? A page slower than this comes in with its fallbacks, as before.
const PAGE_DRAWN_TIMEOUT_MS = 300;

interface ForwardCommit {
  kind: "push" | "replace";
  href: string;
  intent: NavigationIntent;
  fromLocation: Location;
  toLocation: Location;
  scrollTop: number;
  scrollToTop?: boolean;
  viewport: ReturnType<typeof useFrameViewport>["viewport"];
  slots: ReturnType<typeof useFrameSlots>;
  setTransitionPageStateSnapshot: (snapshot: Map<string, PageState> | null) => void;
  refs: CsrRefs;
  nav: CsrLocationState;
  frame: ResolvedFrame;
}

const commitWhenFrameReady = ({
  kind,
  href,
  intent,
  fromLocation,
  toLocation,
  scrollTop,
  scrollToTop,
  viewport,
  slots: { promotePendingSlots, clearPendingSlots },
  setTransitionPageStateSnapshot,
  refs: { transitionPlanId, pendingNavigation, navigationLocked, waitingNavigation, latestRouter },
  nav: { setHistoryForward, setLocationState, getCurrentLocation, getPrevLocation },
  frame: { latestPageStateByPath, latestFrameSlots, latestPendingFrameSlots },
}: ForwardCommit) => {
  const commitNavigation = async (timedOut: boolean) => {
    const latestPageStates = latestPageStateByPath.current;
    const fromPageState = latestPageStates.get(fromLocation.pathRoute.path) ?? fromLocation.pathRoute.pageState;
    const toPageState = latestPageStates.get(toLocation.pathRoute.path) ?? toLocation.pathRoute.pageState;
    const fromFrame = createFrameSnapshot({
      location: fromLocation,
      pageState: fromPageState,
      viewport,
      frameSlots: getFrameSlotsForSnapshot(fromLocation.pathRoute.path, latestFrameSlots.current),
    });
    const toFrame = createFrameSnapshot({
      location: toLocation,
      pageState: toPageState,
      viewport,
      frameSlots: getFrameSlotsForSnapshot(toLocation.pathRoute.path, latestPendingFrameSlots.current),
    });
    const plan = createTransitionPlan({
      id: ++transitionPlanId.current,
      intent,
      type: toPageState.transition,
      direction: "forward",
      fromFrame,
      toFrame,
    });
    debugFrame(timedOut ? "navigation.frameTimeout" : "navigation.frameReady", {
      id: intent.id,
      to: href,
      pendingSlots: toFrame.frameSlots,
    });
    debugFrame("transition.plan", {
      id: plan.id,
      type: plan.type,
      duration: plan.duration,
      actions: plan.actions.map((action) => action.type),
    });
    await prepareForFrameTransition();
    if (pendingNavigation.current !== intent) return;
    pendingNavigation.current = null;
    setTransitionPageStateSnapshot(new Map(latestPageStates));
    setHistoryForward({ type: kind, location: toLocation, scrollTop, scrollToTop });
    promotePendingSlots();
    setLocationState({
      location: getCurrentLocation(),
      prevLocation: fromLocation,
      pendingLocation: null,
      navigationIntent: intent,
      phase: "transitioning",
    });
    if (kind === "push") csrLocation.push({ akanEntryId: toLocation.entryId }, href);
    else csrLocation.replace({ akanEntryId: toLocation.entryId }, href);
    debugFrame("navigation.commit", { id: intent.id, kind, to: href });
    window.setTimeout(
      () => {
        setTransitionPageStateSnapshot(null);
        setLocationState((current) => ({
          ...current,
          //? A replace slid out the entry it replaced; settled, the page under is the entry before, as after a push.
          prevLocation: getPrevLocation(),
          pendingLocation: null,
          navigationIntent: null,
          phase: "idle",
        }));
        navigationLocked.current = false;
        clearPendingSlots();
        debugFrame("transition.actionEnd", { id: plan.id, phase: "idle" });
        const waiting = waitingNavigation.current;
        waitingNavigation.current = null;
        if (waiting) currentRouter(latestRouter)[waiting.kind](waiting.href, { scrollToTop: waiting.scrollToTop });
      },
      Math.max(360, plan.duration),
    );
  };

  const waitUntilReady = () => {
    if (pendingNavigation.current !== intent) return;
    const elapsedMs = Date.now() - intent.createdAt;
    const isFrameReady = isPendingFrameReady({
      path: toLocation.pathRoute.path,
      pendingFrameSlots: latestPendingFrameSlots.current,
      elapsedMs,
    });
    const isDrawn =
      !CsrPageReadiness.drawsLater(toLocation) ||
      CsrPageReadiness.isDrawn(toLocation.entryId) ||
      elapsedMs >= PAGE_DRAWN_TIMEOUT_MS;
    if (isFrameReady && isDrawn) {
      void commitNavigation(elapsedMs >= PENDING_FRAME_READY_TIMEOUT_MS);
      return;
    }
    window.setTimeout(waitUntilReady, 16);
  };
  window.setTimeout(waitUntilReady, 16);
};

const commitWhenDrawn = (
  intent: NavigationIntent,
  pendingNavigation: CsrRefs["pendingNavigation"],
  commit: () => void,
) => {
  const waitUntilDrawn = () => {
    if (pendingNavigation.current !== intent) return;
    const elapsedMs = Date.now() - intent.createdAt;
    if (!CsrPageReadiness.isDrawn(intent.to.entryId) && elapsedMs < PAGE_DRAWN_TIMEOUT_MS) {
      window.setTimeout(waitUntilDrawn, 16);
      return;
    }
    pendingNavigation.current = null;
    debugFrame("navigation.drawn", { id: intent.id, to: intent.to.href, elapsedMs });
    commit();
  };
  window.setTimeout(waitUntilDrawn, 16);
};

interface CsrNavigationInput {
  viewport: ReturnType<typeof useFrameViewport>["viewport"];
  slots: ReturnType<typeof useFrameSlots>;
  setTransitionPageStateSnapshot: (snapshot: Map<string, PageState> | null) => void;
  refs: CsrRefs;
  nav: CsrLocationState;
  frame: ResolvedFrame;
  keyboard: CsrKeyboard;
}

const useFrameTransitionStart = ({
  setTransitionPageStateSnapshot,
  refs: { pageStateByPathRef },
  nav: { getLocation },
  frame: { resolvedLocation },
  keyboard: { keyboardFrame },
}: CsrNavigationInput) => {
  const shouldPrepareFrameTransition = useCallback(
    (nextHref?: string) => {
      if (keyboardFrame.visible) return true;
      if (!nextHref) return resolvedLocation.pathRoute.pageState.transition !== "none";
      const nextLocation = getLocation(nextHref);
      return (
        resolvedLocation.pathRoute.pageState.transition !== "none" ||
        nextLocation.pathRoute.pageState.transition !== "none"
      );
    },
    [getLocation, keyboardFrame.visible, resolvedLocation.pathRoute.pageState.transition],
  );
  const startFrameTransition = useCallback(async () => {
    const snapshot = new Map(pageStateByPathRef.current);
    setTransitionPageStateSnapshot(snapshot);
    window.setTimeout(() => setTransitionPageStateSnapshot(null), 360);
    await prepareForFrameTransition();
  }, []);
  return { shouldPrepareFrameTransition, startFrameTransition };
};

export const useCsrNavigation = (input: CsrNavigationInput) => {
  const { viewport, slots, setTransitionPageStateSnapshot, refs, nav, frame } = input;
  const { clearPendingSlots, promotePendingSlots } = slots;
  const { navigationIntentId, navigationLocked, pendingNavigation, waitingNavigation, pageContentRef } = refs;
  const { getLocation, getCurrentLocation, getPrevLocation, setHistoryForward, setLocationState, prevLocation } = nav;
  const { shouldPrepareFrameTransition, startFrameTransition } = useFrameTransitionStart(input);
  const settle = (prev: LocationState["prevLocation"]) =>
    setLocationState({
      location: getCurrentLocation(),
      prevLocation: prev,
      pendingLocation: null,
      navigationIntent: null,
      phase: "idle",
    });
  //? The router counts a navigation as made when it is asked, so a newer move takes the place of one still preparing.
  const cancelPendingNavigation = useCallback(() => {
    const pending = pendingNavigation.current;
    if (!pending) return null;
    pendingNavigation.current = null;
    navigationLocked.current = false;
    clearPendingSlots();
    debugFrame("navigation.cancel", { reason: "superseded", id: pending.id, to: pending.to.href });
    setLocationState((current) => ({ ...current, pendingLocation: null, navigationIntent: null, phase: "idle" }));
    return pending;
  }, [clearPendingSlots]);
  const broadcastSyncNavigation = useBroadcastSyncNavigation(refs);
  const runForwardNavigation = useCallback(
    (kind: "push" | "replace", href: string, { scrollToTop }: RouteOptions = {}) => {
      const fromLocation = getCurrentLocation();
      const target = getLocation(href);
      const cached = target.pathRoute.pageState.cache
        ? nav.history.current.cachedLocationMap.get(target.pathRoute.path)
        : undefined;
      //? A replace within one route rewrites the entry it is on, so the page on screen stays mounted; a `cache` page
      //? visited again at the same address is the location it keeps, so nothing it reads changes as it comes back.
      const toLocation =
        kind === "replace" && target.pathRoute.path === fromLocation.pathRoute.path
          ? { ...target, entryId: fromLocation.entryId }
          : cached &&
              cached.pathname === target.pathname &&
              cached.search === target.search &&
              cached.hash === target.hash
            ? cached
            : target;
      const scrollTop = pageContentRef.current?.scrollTop ?? 0;
      const slides =
        CsrStack.keyOf(toLocation) !== CsrStack.keyOf(fromLocation) &&
        shouldPrepareFrameTransition(href) &&
        toLocation.pathRoute.pageState.transition !== "none";
      const commitInPlace = () => {
        setHistoryForward({ type: kind, location: toLocation, scrollTop, scrollToTop });
        settle(kind === "replace" ? prevLocation : fromLocation);
        if (kind === "push") csrLocation.push({ akanEntryId: toLocation.entryId }, href);
        else csrLocation.replace({ akanEntryId: toLocation.entryId }, href);
      };
      //? A page the stack holds shows what it last drew. While another page slides in, the move is made at once as
      //? well: that slide's end clears the pending page, so one drawn ahead would be dropped and drawn again.
      const isDrawnAtOnce =
        navigationLocked.current ||
        !CsrPageReadiness.drawsLater(toLocation) ||
        CsrStack.holds(
          { history: nav.history.current, location: fromLocation, prevLocation, pendingLocation: null, phase: "idle" },
          toLocation,
        );
      if (!slides && isDrawnAtOnce) {
        commitInPlace();
        return;
      }
      if (slides && navigationLocked.current) {
        //? Run once the page sliding in has settled: dropped, a redirect from that page's guard would leave it blank.
        const waiting = waitingNavigation.current;
        waitingNavigation.current = { kind: waiting?.kind === "push" ? "push" : kind, href, scrollToTop };
        debugFrame("navigation.wait", { kind, from: fromLocation.href, to: href });
        return;
      }
      if (slides) navigationLocked.current = true;
      const intent: NavigationIntent = {
        id: ++navigationIntentId.current,
        kind,
        from: fromLocation,
        to: toLocation,
        scrollTop,
        scrollToTop,
        createdAt: Date.now(),
      };
      pendingNavigation.current = intent;
      debugFrame(slides ? "navigation.intent" : "navigation.drawAhead", {
        id: intent.id,
        kind,
        from: fromLocation.href,
        to: href,
      });
      clearPendingSlots();
      setLocationState({
        location: fromLocation,
        prevLocation,
        pendingLocation: toLocation,
        navigationIntent: intent,
        phase: "preparing",
      });
      if (!slides) {
        commitWhenDrawn(intent, pendingNavigation, () => {
          commitInPlace();
          promotePendingSlots();
        });
        return;
      }
      commitWhenFrameReady({
        kind,
        href,
        intent,
        fromLocation,
        toLocation,
        scrollTop,
        scrollToTop,
        viewport,
        slots,
        setTransitionPageStateSnapshot,
        refs,
        nav,
        frame,
      });
    },
    [
      clearPendingSlots,
      broadcastSyncNavigation,
      getCurrentLocation,
      getLocation,
      getPrevLocation,
      prevLocation,
      promotePendingSlots,
      setHistoryForward,
      shouldPrepareFrameTransition,
      viewport,
    ],
  );
  return {
    shouldPrepareFrameTransition,
    startFrameTransition,
    settle,
    cancelPendingNavigation,
    broadcastSyncNavigation,
    runForwardNavigation,
  };
};

export type CsrNavigation = ReturnType<typeof useCsrNavigation>;
