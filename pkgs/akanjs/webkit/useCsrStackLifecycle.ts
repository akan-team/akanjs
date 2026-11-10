"use client";
import { router as clientRouter, getAuthToken, type UseCsrTransition } from "akanjs/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CsrStack } from "./CsrStack";
import { type NativeBackProgress, NativeNavigation } from "./nativeNavigation";
import { NativeUpdates } from "./nativeUpdates";
import type { CsrKeyboard } from "./useCsrKeyboard";
import type { CsrLocationState } from "./useCsrLocationState";
import type { CsrRefs } from "./useCsrRefs";
import { prepareForFrameTransition } from "./useFrameRuntime";
import type { ResolvedFrame } from "./useResolvedFrame";

export const useCsrStackLifecycle = ({
  refs: { pageContentRef, prevPageContentRef },
  nav: { location, prevLocation, history, getScrollTop, getCurrentLocation, setIsBackgrounded, phase },
  frame: { resolvedLocation, stackEntries },
  keyboard: { keyboardFrame },
  csrTransition,
}: {
  refs: CsrRefs;
  nav: CsrLocationState;
  frame: ResolvedFrame;
  keyboard: CsrKeyboard;
  csrTransition: UseCsrTransition;
}) => {
  const nativeNavigation = useRef<NativeNavigation | null>(null);
  const nativeBackStateRef = useRef({
    path: resolvedLocation.pathRoute.path,
    keyboardHeight: keyboardFrame.height,
    keyboardVisible: keyboardFrame.visible,
    router: clientRouter,
  });

  useEffect(() => {
    if (pageContentRef.current) pageContentRef.current.scrollTop = getScrollTop(location);
    if (prevPageContentRef.current)
      prevPageContentRef.current.scrollTop = prevLocation ? getScrollTop(prevLocation) : 0;
  }, [location.href]);

  useEffect(() => {
    for (const shown of [location, prevLocation]) if (shown?.entryId) history.current.dormant?.delete(shown.entryId);
    CsrStack.save(history.current);
  }, [location, prevLocation]);

  useEffect(() => {
    const sync = () => setIsBackgrounded(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  useEffect(() => {
    nativeNavigation.current?.showPushesExcept(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    nativeBackStateRef.current = {
      path: resolvedLocation.pathRoute.path,
      keyboardHeight: keyboardFrame.height,
      keyboardVisible: keyboardFrame.visible,
      router: clientRouter,
    };
    nativeNavigation.current?.syncBack();
  }, [keyboardFrame.height, keyboardFrame.visible, resolvedLocation.pathRoute.path]);

  const backFollow = useRef(csrTransition);
  backFollow.current = csrTransition;
  const followBack = useCallback(({ phase, progress }: NativeBackProgress) => {
    const { transUnit, transUnitRange } = backFollow.current;
    const transition = getCurrentLocation().pathRoute.pageState.transition;
    if (transition === "none" || history.current.idx === 0 || nativeBackStateRef.current.keyboardVisible) return;
    const [hidden, shown] = transUnitRange;
    if (phase === "cancelled") {
      void transUnit.start(shown);
      return;
    }
    //? A slide follows the finger all the way; a fade only half, as the system's own back preview just hints.
    const follow = transition === "stack" || transition === "bottomUp" ? progress : progress / 2;
    void transUnit.start(shown + (hidden - shown) * follow, { immediate: true });
  }, []);
  const [, setReleased] = useState(0);
  const latestStackEntries = useRef(stackEntries);
  latestStackEntries.current = stackEntries;
  const releaseHidden = useCallback(() => {
    history.current.dormant ??= new Set();
    for (const { pageType, location: hidden } of latestStackEntries.current)
      if (pageType === "cached" && hidden.entryId) history.current.dormant.add(hidden.entryId);
    setReleased((count) => count + 1);
  }, []);
  useEffect(() => {
    const redraw = () => {
      if (CsrStack.redrawFor(history.current, getCurrentLocation(), getAuthToken() ?? null))
        setReleased((count) => count + 1);
    };
    redraw();
    window.addEventListener("akan:auth", redraw);
    return () => window.removeEventListener("akan:auth", redraw);
  }, []);
  useEffect(() => {
    if (phase === "idle") CsrStack.leave(history.current, location);
  }, [phase, location]);

  useEffect(() => {
    const navigation = new NativeNavigation({
      historyIdx: () => history.current.idx,
      backState: () => nativeBackStateRef.current,
      dismissKeyboard: prepareForFrameTransition,
      onBackProgress: followBack,
      onMemoryWarning: releaseHidden,
    });
    nativeNavigation.current = navigation;
    const stop = navigation.listen();
    navigation.showPushesExcept(getCurrentLocation().pathname);
    const stopUpdates = new NativeUpdates().listen();
    return () => {
      stop();
      stopUpdates();
      nativeNavigation.current = null;
    };
  }, []);
};
