"use client";
import { useSpringValue } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";
import {
  type CsrContextType,
  type CsrTransitionStyles,
  router as clientRouter,
  Device,
  debugFrame,
  defaultPageState,
  getPathInfo,
  type LocationState,
  type NavigationIntent,
  normalizeDeepLinkHref,
  type PageState,
  type PathRoute,
  type RouteGuide,
  type RouteOptions,
  type RouterInstance,
  type RouteState,
  type TransitionType,
  type UseCsrTransition,
} from "akanjs/client";
import { loadCapacitorApp } from "akanjs/client/capacitor";
import { parseAkanI18nEnv, parseBasePaths } from "akanjs/common";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createFrameSnapshot,
  createTransitionPlan,
  FRAME_Z_INDEX,
  getFramePlatformProfile,
  getFrameSlotsForSnapshot,
  hasKeyboardStickySlot,
  isPendingFrameReady,
  PENDING_FRAME_READY_TIMEOUT_MS,
  prepareForFrameTransition,
  resolveFramePageStateMap,
  resolveKeyboardAccessoryHeight,
  resolveKeyboardLayout,
  resolveLocationWithFrameState,
  resolvePathRoutesWithFrameState,
  useFrameRuntimeResync,
  useFrameSlots,
  useFrameViewport,
  useKeyboardFrame,
} from "./useFrameRuntime";
import { useHistory } from "./useHistory";
import { useLocation } from "./useLocation";

const linearEasing = (t: number) => t;

const getBottomInsetTop = (clientHeight: number, pageState: PathRoute["pageState"]) =>
  clientHeight - pageState.bottomInset - pageState.bottomSafeArea;

const getFrameContentOffset = (ownTop: number, prevTop: number, pageTop: number, progress: number) =>
  ownTop - (prevTop + (pageTop - prevTop) * progress);

type GestureIntent = "pending" | "gesture" | "scroll";
const GESTURE_INTENT_THRESHOLD = 8;
const GESTURE_AXIS_LOCK_RATIO = 1.25;
const STACK_VELOCITY_DISMISS_THRESHOLD = 0.45;
const STACK_SETTLE_MIN_DURATION = 90;
const STACK_SETTLE_MAX_DURATION = 260;
const ANDROID_SCALE_TRANSITION_DURATION = 220;
const CSR_RUNTIME_SEARCH_PARAMS = ["csr", "akanMobileTarget", "akanMobileBasePath", "akanMobileIndexPath"] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getVelocityAwareDuration = (distance: number, velocity: number, fallback: number) => {
  const absVelocity = Math.abs(velocity);
  if (absVelocity <= 0.01) return fallback;
  return clamp(Math.round(Math.abs(distance) / absVelocity), STACK_SETTLE_MIN_DURATION, STACK_SETTLE_MAX_DURATION);
};

const getSyncRouteHref = (location: {
  pathname: string;
  search: string;
  hash: string;
  params?: { [key: string]: string };
}) => {
  const segments = location.pathname.split("/").filter(Boolean);
  const lang = location.params?.lang ?? parseAkanI18nEnv().locales.find((locale) => locale === segments[0]) ?? "";
  const configuredBasePaths = new Set(parseBasePaths(process.env.AKAN_PUBLIC_BASE_PATHS));
  const runtimeSearch = new URLSearchParams(location.search ?? "");
  const mobileBasePath = runtimeSearch.get("akanMobileBasePath") ?? "";
  if (mobileBasePath) configuredBasePaths.add(mobileBasePath);
  const prefix = segments[1] && configuredBasePaths.has(segments[1]) ? segments[1] : "";
  const { path } = getPathInfo(location.pathname, lang, prefix);
  for (const param of CSR_RUNTIME_SEARCH_PARAMS) runtimeSearch.delete(param);
  const search = runtimeSearch.toString();
  return `${path}${search ? `?${search}` : ""}${location.hash ? `#${location.hash}` : ""}`;
};

const getKeyboardAwarePageHeight = ({ frameLayout }: RouteState) => frameLayout.contentViewport.height;

const getKeyboardAwareBottomPadding = ({ frameLayout }: RouteState, pageState: PathRoute["pageState"]) =>
  Math.max(
    pageState.bottomSafeArea,
    pageState.bottomInset +
      pageState.bottomSafeArea -
      (frameLayout.keyboard.sticky ? frameLayout.keyboardAccessory.height : 0),
  );

const useNoneTrans = (routeState: RouteState): UseCsrTransition => {
  const { clientHeight, location, prevLocation } = routeState;
  const pageContentHeight = getKeyboardAwarePageHeight(routeState);
  const transDirection = "none";
  const transUnit = useSpringValue(0, { config: { clamp: true } });
  const transUnitRange = useMemo(() => [0, 0], []);
  const transProgress = transUnit.to((unit) => 1);
  const transPercent = transUnit.to((unit) => 100);
  const pageState = location.pathRoute.pageState;
  const prevPageState = prevLocation?.pathRoute.pageState ?? defaultPageState;
  const csrTranstionStyles: CsrTransitionStyles = {
    topSafeArea: {
      containerStyle: {
        backgroundColor: pageState.topSafeAreaColor,
        height: pageState.topSafeArea,
      },
    },
    bottomSafeArea: {
      containerStyle: {
        backgroundColor: pageState.bottomSafeAreaColor,
        top: clientHeight - pageState.bottomSafeArea,
        height: pageState.bottomSafeArea,
      },
    },
    page: {
      containerStyle: {
        top: 0,
        left: 0,
        height: clientHeight,
      },
      contentStyle: {
        paddingTop: pageState.topSafeArea + pageState.topInset,
        paddingBottom: getKeyboardAwareBottomPadding(routeState, pageState),
        height: pageContentHeight,
      },
    },
    prevPage: {
      containerStyle: {
        paddingTop: prevPageState.topSafeArea + prevPageState.topInset,
      },
      contentStyle: { opacity: 0 },
    },
    topInset: {
      containerStyle: {
        top: pageState.topSafeArea,
        height: pageState.topInset,
      },
      contentStyle: { opacity: 1 },
      prevContentStyle: { opacity: 0 },
    },
    topLeftAction: {
      containerStyle: {
        top: pageState.topSafeArea,
        height: pageState.topInset,
      },
      contentStyle: { opacity: 1 },
      prevContentStyle: { opacity: 0 },
    },
    bottomInset: {
      containerStyle: {
        height: pageState.bottomInset,
        top: clientHeight - pageState.bottomInset - pageState.bottomSafeArea,
      },
      contentStyle: { opacity: 1 },
      prevContentStyle: { opacity: 0 },
    },
  };

  const useCsrTransition: UseCsrTransition = {
    ...csrTranstionStyles,
    pageBind: () => ({}),
    pageClassName: "touch-pan-y",
    transDirection,
    transUnitRange,
    transUnit,
    transPercent,
    transProgress,
  };
  return useCsrTransition;
};

const useFadeTrans = (routeState: RouteState): UseCsrTransition => {
  const { clientHeight, location, prevLocation, onBack, history } = routeState;
  const pageContentHeight = getKeyboardAwarePageHeight(routeState);
  const transDirection = "none";
  const transUnit = useSpringValue(1, { config: { clamp: true } });
  const transUnitRange = useMemo(() => [0, 1], []);
  const transProgress = transUnit.to((unit) => unit);
  const transPercent = transUnit.to([0, 1], [0, 100], "clamp");
  const pageState = location.pathRoute.pageState;
  const prevPageState = prevLocation?.pathRoute.pageState ?? defaultPageState;
  const pageBottomInsetTop = getBottomInsetTop(clientHeight, pageState);
  const prevBottomInsetTop = getBottomInsetTop(clientHeight, prevPageState);

  useEffect(() => {
    onBack.current.fade = async () => {
      await transUnit.start(transUnitRange[0]);
    };
  }, []);
  useEffect(() => {
    if (history.current.type === "forward") {
      void transUnit.start(transUnitRange[0], { immediate: true });
      void transUnit.start(transUnitRange[1], { config: { duration: 150 } });
    } else {
      void transUnit.start(transUnitRange[1], { immediate: true });
      return;
    }
  }, [location.pathname]);

  const csrTranstionStyles: CsrTransitionStyles = {
    topSafeArea: {
      containerStyle: {
        backgroundColor: pageState.topSafeAreaColor,
        height: transProgress.to([0, 1], [prevPageState.topSafeArea, pageState.topSafeArea]),
      },
    },
    bottomSafeArea: {
      containerStyle: {
        backgroundColor: pageState.bottomSafeAreaColor,
        top: transProgress.to(
          [0, 1],
          [clientHeight - prevPageState.bottomSafeArea, clientHeight - pageState.bottomSafeArea],
        ),
        height: transProgress.to([0, 1], [prevPageState.bottomSafeArea, pageState.bottomSafeArea]),
      },
    },
    page: {
      containerStyle: {},
      contentStyle: {
        paddingTop: pageState.topSafeArea + pageState.topInset,
        paddingBottom: getKeyboardAwareBottomPadding(routeState, pageState),
        opacity: transUnit,
        height: pageContentHeight,
      },
    },
    prevPage: {
      containerStyle: {
        opacity: transProgress.to((progress) => 1 - progress),
      },
      contentStyle: {
        paddingTop: prevPageState.topSafeArea + prevPageState.topInset,
        paddingBottom: prevPageState.bottomInset + prevPageState.bottomSafeArea,
        height: clientHeight,
      },
    },
    topInset: {
      containerStyle: {
        top: transProgress.to([0, 1], [prevPageState.topSafeArea, pageState.topSafeArea]),
        height: transProgress.to([0, 1], [prevPageState.topInset, pageState.topInset]),
      },
      contentStyle: {
        opacity: transProgress,
      },
      prevContentStyle: {
        opacity: transProgress.to((progress) => 1 - progress),
      },
    },
    topLeftAction: {
      containerStyle: {
        top: transProgress.to([0, 1], [prevPageState.topSafeArea, pageState.topSafeArea]),
        height: transProgress.to([0, 1], [prevPageState.topInset, pageState.topInset]),
      },
      contentStyle: {
        top: transProgress.to([0, 1], [0, -(pageState.bottomInset - prevPageState.bottomInset) * 2]),
        opacity: transProgress.to((progress) => progress),
      },
      prevContentStyle: {
        top: transProgress.to([0, 1], [0, -(pageState.bottomInset - prevPageState.bottomInset) * 2]),
        opacity: transProgress.to((progress) => 1 - progress),
      },
    },
    bottomInset: {
      containerStyle: {
        height: transProgress.to([0, 1], [prevPageState.bottomInset, pageState.bottomInset]),
        top: transProgress.to([0, 1], [prevBottomInsetTop, pageBottomInsetTop]),
      },
      contentStyle: {
        height: pageState.bottomInset,
        translateY: transProgress.to((progress) =>
          getFrameContentOffset(pageBottomInsetTop, prevBottomInsetTop, pageBottomInsetTop, progress),
        ),
        opacity: transProgress.to((progress) => progress),
        //animate origin from top to bottom
        transformOrigin: "top",
      },
      prevContentStyle: {
        height: prevPageState.bottomInset,
        translateY: transProgress.to((progress) =>
          getFrameContentOffset(prevBottomInsetTop, prevBottomInsetTop, pageBottomInsetTop, progress),
        ),
        opacity: transProgress.to((progress) => 1 - progress),
        transformOrigin: "top",
      },
    },
  };

  const useCsrTransition: UseCsrTransition = {
    ...csrTranstionStyles,
    pageBind: () => ({}),
    pageClassName: "",
    transDirection,
    transUnitRange,
    transUnit,
    transPercent,
    transProgress,
  };
  return useCsrTransition;
};

const useScaleOutTrans = (routeState: RouteState): UseCsrTransition => {
  const { clientHeight, location, prevLocation, onBack, history } = routeState;
  const pageContentHeight = getKeyboardAwarePageHeight(routeState);
  const transDirection = "none";
  const transUnit = useSpringValue(1, { config: { clamp: true } });
  const transUnitRange = useMemo(() => [0, 1], []);
  const transProgress = transUnit.to((unit) => unit);
  const transPercent = transUnit.to([0, 1], [0, 100], "clamp");
  const pageState = location.pathRoute.pageState;
  const prevPageState = prevLocation?.pathRoute.pageState ?? defaultPageState;

  useEffect(() => {
    onBack.current.scaleOut = async () => {
      await transUnit.start(transUnitRange[0], { config: { duration: ANDROID_SCALE_TRANSITION_DURATION } });
    };
  }, []);
  useEffect(() => {
    if (history.current.type === "forward") {
      void transUnit.start(transUnitRange[0], { immediate: true });
      void transUnit.start(transUnitRange[1], { config: { duration: ANDROID_SCALE_TRANSITION_DURATION } });
    } else {
      void transUnit.start(transUnitRange[1], { immediate: true });
      return;
    }
  }, [location.pathname]);

  const csrTranstionStyles: CsrTransitionStyles = {
    topSafeArea: {
      containerStyle: {
        backgroundColor: pageState.topSafeAreaColor,
        height: transProgress.to([0, 1], [prevPageState.topSafeArea, pageState.topSafeArea]),
      },
    },
    bottomSafeArea: {
      containerStyle: {
        backgroundColor: pageState.bottomSafeAreaColor,
        top: transProgress.to(
          [0, 1],
          [clientHeight - prevPageState.bottomSafeArea, clientHeight - pageState.bottomSafeArea],
        ),
        height: transProgress.to([0, 1], [prevPageState.bottomSafeArea, pageState.bottomSafeArea]),
      },
    },
    page: {
      containerStyle: {
        transform: transProgress.to((progress) => `scale(${0.92 + progress * 0.08})`),
      },
      contentStyle: {
        paddingTop: pageState.topSafeArea + pageState.topInset,
        paddingBottom: getKeyboardAwareBottomPadding(routeState, pageState),
        opacity: transProgress,
        height: pageContentHeight,
      },
    },
    prevPage: {
      containerStyle: {
        transform: transProgress.to((progress) => `scale(${1 - progress * 0.02})`),
      },
      contentStyle: {
        paddingTop: prevPageState.topSafeArea + prevPageState.topInset,
        paddingBottom: prevPageState.bottomInset + prevPageState.bottomSafeArea,
        opacity: transProgress.to((progress) => 1 - progress * 0.35),
        height: clientHeight,
      },
    },
    topInset: {
      containerStyle: {
        top: transProgress.to([0, 1], [prevPageState.topSafeArea, pageState.topSafeArea]),
        height: transProgress.to([0, 1], [prevPageState.topInset, pageState.topInset]),
      },
      contentStyle: {
        opacity: transProgress,
      },
      prevContentStyle: {
        opacity: transProgress.to((progress) => 1 - progress),
      },
    },
    topLeftAction: {
      containerStyle: {
        top: transProgress.to([0, 1], [prevPageState.topSafeArea, pageState.topSafeArea]),
        height: transProgress.to([0, 1], [prevPageState.topInset, pageState.topInset]),
      },
      contentStyle: {
        opacity: transProgress,
      },
      prevContentStyle: {
        opacity: transProgress.to((progress) => 1 - progress),
      },
    },
    bottomInset: {
      containerStyle: {
        height: transProgress.to([0, 1], [prevPageState.bottomInset, pageState.bottomInset]),
        top: transProgress.to(
          [0, 1],
          [
            clientHeight - prevPageState.bottomInset - prevPageState.bottomSafeArea,
            clientHeight - pageState.bottomInset - pageState.bottomSafeArea,
          ],
        ),
      },
      contentStyle: {
        opacity: transProgress,
      },
      prevContentStyle: {
        opacity: transProgress.to((progress) => 1 - progress),
      },
    },
  };

  const useCsrTransition: UseCsrTransition = {
    ...csrTranstionStyles,
    pageBind: () => ({}),
    pageClassName: "",
    transDirection,
    transUnitRange,
    transUnit,
    transPercent,
    transProgress,
  };
  return useCsrTransition;
};

const useStackTrans = (routeState: RouteState): UseCsrTransition => {
  const { clientWidth, clientHeight, location, prevLocation, history, onBack, pageContentRef } = routeState;
  const pageContentHeight = getKeyboardAwarePageHeight(routeState);
  const transDirection = "horizontal";
  const transUnit = useSpringValue(0, { config: { clamp: true } });
  const transUnitRange = useMemo(() => [clientWidth, 0], [clientWidth]);
  const transUnitReversed = transUnit.to((unit) => transUnitRange[0] - unit);
  const transUnitRangeReversed = useMemo(() => [0, clientWidth], [clientWidth]);
  const transProgress = transUnitReversed.to(transUnitRangeReversed, [0, 1], "clamp");
  const transPercent = transUnitReversed.to(transUnitRangeReversed, [0, 100], "clamp");
  const initThreshold = useMemo(() => Math.floor(clientWidth), [clientWidth]);
  const threshold = useMemo(() => Math.floor(clientWidth / 3), [clientWidth]);
  const pageState = location.pathRoute.pageState;
  const prevPageState = prevLocation?.pathRoute.pageState ?? defaultPageState;
  const pageClassName = "touch-pan-y";
  const gestureIntent = useRef<GestureIntent>("pending");
  const scrollLockRef = useRef<{ overflowY: string; touchAction: string } | null>(null);
  const stackBackConfigRef = useRef<{ duration: number } | null>(null);
  const lockPageScroll = useCallback(() => {
    const pageContent = pageContentRef.current;
    if (!pageContent || scrollLockRef.current) return;
    scrollLockRef.current = {
      overflowY: pageContent.style.overflowY,
      touchAction: pageContent.style.touchAction,
    };
    pageContent.style.overflowY = "hidden";
    pageContent.style.touchAction = "none";
  }, [pageContentRef]);
  const unlockPageScroll = useCallback(() => {
    const pageContent = pageContentRef.current;
    const scrollLock = scrollLockRef.current;
    if (!pageContent || !scrollLock) return;
    pageContent.style.overflowY = scrollLock.overflowY;
    pageContent.style.touchAction = scrollLock.touchAction;
    scrollLockRef.current = null;
  }, [pageContentRef]);
  useEffect(() => {
    onBack.current.stack = async () => {
      const config = stackBackConfigRef.current;
      stackBackConfigRef.current = null;
      await transUnit.start(transUnitRange[0], config ? { config } : undefined);
    };
  }, []);
  useEffect(() => unlockPageScroll, [unlockPageScroll]);
  useEffect(() => {
    if (history.current.type === "forward") {
      void transUnit.start(transUnitRange[0], { immediate: true });
      void transUnit.start(transUnitRange[1], { config: { duration: 150 } });
    } else {
      void transUnit.start(transUnitRange[1], { immediate: true });
      return;
    }
  }, [location.pathname]);

  const pageBind = useDrag(
    ({ first, last, movement: [mx, my], velocity: [vx], direction: [dx], initial: [ix], cancel }) => {
      if (first) {
        gestureIntent.current = "pending";
        stackBackConfigRef.current = null;
        unlockPageScroll();
        void Device.getDevice().hideKeyboard();
      }
      if (ix > initThreshold) {
        gestureIntent.current = "scroll";
        cancel();
        return;
      }
      if (gestureIntent.current === "pending") {
        const absX = Math.abs(mx);
        const absY = Math.abs(my);
        if (absY >= GESTURE_INTENT_THRESHOLD && absY > absX * GESTURE_AXIS_LOCK_RATIO) {
          gestureIntent.current = "scroll";
          void transUnit.start(transUnitRange[1], { immediate: true });
          cancel();
          return;
        }
        if (absX < GESTURE_INTENT_THRESHOLD || absX <= absY * GESTURE_AXIS_LOCK_RATIO) return;
        gestureIntent.current = "gesture";
        lockPageScroll();
      }
      if (gestureIntent.current !== "gesture") {
        cancel();
        return;
      }
      if (mx < transUnitRange[1]) void transUnit.start(transUnitRange[1], { immediate: true });
      else if (mx > transUnitRange[0]) void transUnit.start(transUnitRange[0], { immediate: true });
      else if (!last) void transUnit.start(mx, { immediate: true });
      if (last) {
        const shouldComplete = mx > threshold || (dx > 0 && vx > STACK_VELOCITY_DISMISS_THRESHOLD);
        const target = shouldComplete ? transUnitRange[0] : transUnitRange[1];
        const duration = getVelocityAwareDuration(target - mx, vx, shouldComplete ? 150 : 180);
        if (shouldComplete) stackBackConfigRef.current = { duration };
        else void transUnit.start(transUnitRange[1], { config: { duration } });
        unlockPageScroll();
        gestureIntent.current = "pending";
        if (shouldComplete) clientRouter.back();
      }
    },
    { filterTaps: true },
  );

  const csrTranstionStyles: CsrTransitionStyles = {
    topSafeArea: {
      containerStyle: {
        backgroundColor: pageState.topSafeAreaColor,
        height: transProgress.to([0, 1], [prevPageState.topSafeArea, pageState.topSafeArea]),
      },
    },
    bottomSafeArea: {
      containerStyle: {
        backgroundColor: pageState.bottomSafeAreaColor,
        top: transProgress.to(
          [0, 1],
          [clientHeight - prevPageState.bottomSafeArea, clientHeight - pageState.bottomSafeArea],
        ),
        height: transProgress.to([0, 1], [prevPageState.bottomSafeArea, pageState.bottomSafeArea]),
      },
    },
    page: {
      containerStyle: {},
      contentStyle: {
        paddingTop: pageState.topSafeArea + pageState.topInset,
        paddingBottom: getKeyboardAwareBottomPadding(routeState, pageState),
        translateX: transUnit,
        height: pageContentHeight,
      },
    },
    prevPage: {
      containerStyle: {
        top: 0,
        left: 0,
        height: clientHeight,
        translateX: transUnit.to((unit) => (unit - clientWidth) / 5),
      },
      contentStyle: {
        paddingTop: prevPageState.topSafeArea + prevPageState.topInset,
        paddingBottom: prevPageState.bottomInset + prevPageState.bottomSafeArea,
        height: clientHeight,
        opacity: transProgress.to((progress) => 1 - progress / 2),
      },
    },
    topInset: {
      containerStyle: {
        top: transProgress.to([0, 1], [prevPageState.topSafeArea, pageState.topSafeArea]),
        height: transProgress.to([0, 1], [prevPageState.topInset, pageState.topInset]),
      },
      contentStyle: {
        opacity: transProgress.to((progress) => progress),
        translateX: transProgress.to([0, 1], [clientWidth / 5, 0]),
      },
      prevContentStyle: {
        opacity: transProgress.to((progress) => 1 - progress),
        translateX: transProgress.to([0, 1], [0, -clientWidth / 5]),
      },
    },
    topLeftAction: {
      containerStyle: {
        top: transProgress.to([0, 1], [prevPageState.topSafeArea, pageState.topSafeArea]),
        height: transProgress.to([0, 1], [prevPageState.topInset, pageState.topInset]),
        minWidth: transProgress.to([0, 1], [prevPageState.topInset, pageState.topInset]),
      },
      contentStyle: {
        opacity: transProgress.to((progress) => progress),
      },
      prevContentStyle: {
        opacity: transProgress.to((progress) => 1 - progress),
      },
    },
    bottomInset: {
      containerStyle: {
        height: transProgress.to([0, 1], [prevPageState.bottomInset, pageState.bottomInset]),
        top: transProgress.to(
          [0, 1],
          [
            clientHeight - prevPageState.bottomInset - prevPageState.bottomSafeArea,
            clientHeight - pageState.bottomInset - pageState.bottomSafeArea,
          ],
        ),
      },
      contentStyle: {
        height: pageState.bottomInset,
        translateX: transUnit,
        opacity: transProgress.to((progress) => progress),
      },
      prevContentStyle: {
        height: prevPageState.bottomInset,
        translateX: transUnit.to((unit) => (unit - clientWidth) / 5),
        opacity: transProgress.to((progress) => 1 - progress),
      },
    },
  };

  const useCsrTransition: UseCsrTransition = {
    ...csrTranstionStyles,
    pageBind,
    pageClassName,
    transDirection,
    transUnitRange,
    transUnit,
    transPercent,
    transProgress,
  };
  return useCsrTransition;
};

const useBottomUpTrans = (routeState: RouteState): UseCsrTransition => {
  const { clientWidth, clientHeight, history, location, prevLocation, onBack } = routeState;
  const pageContentHeight = getKeyboardAwarePageHeight(routeState);
  const transDirection = "vertical";
  const transUnit = useSpringValue(0, { config: { clamp: true } });
  const transUnitRange = useMemo(() => [clientHeight, 0], [clientHeight]);
  const transUnitReversed = transUnit.to((unit) => transUnitRange[0] - unit);
  const transUnitRangeReversed = useMemo(() => [0, clientHeight], [clientHeight]);
  const transProgress = transUnitReversed.to(transUnitRangeReversed, [0, 1], "clamp");
  const transPercent = transUnitReversed.to(transUnitRangeReversed, [0, 100], "clamp");
  const initThreshold = useMemo(() => Math.floor(clientWidth / 3), [clientWidth]);
  const threshold = useMemo(() => Math.floor(clientWidth / 2), [clientWidth]);
  const pageState = location.pathRoute.pageState;
  const prevPageState = prevLocation?.pathRoute.pageState ?? defaultPageState;
  useEffect(() => {
    onBack.current.bottomUp = async () => {
      await transUnit.start(transUnitRange[0], { config: { duration: 220, easing: linearEasing } });
    };
  }, []);
  useEffect(() => {
    if (history.current.type === "forward") {
      void transUnit.start(transUnitRange[0], { immediate: true });
      void transUnit.start(transUnitRange[1], { config: { duration: 220, easing: linearEasing } });
    } else {
      void transUnit.start(transUnitRange[1], { immediate: true });
      return;
    }
  }, [location.pathname]);

  const pageBind = useDrag(
    ({ first, last, movement: [, my], initial: [, iy], cancel }) => {
      if (first) void Device.getDevice().hideKeyboard();
      if (iy > initThreshold) {
        cancel();
        return;
      }
      if (my < transUnitRange[1]) void transUnit.start(transUnitRange[1], { immediate: true });
      else if (my > transUnitRange[0]) void transUnit.start(transUnitRange[0], { immediate: true });
      else if (!last) void transUnit.start(my, { immediate: true });
      else if (my < threshold) void transUnit.start(transUnitRange[1]);
      if (last && my > threshold) clientRouter.back();
    },
    { axis: "y", filterTaps: true, threshold: 10 },
  );

  const csrTranstionStyles: CsrTransitionStyles = {
    topSafeArea: {
      containerStyle: {
        backgroundColor: pageState.topSafeAreaColor,
        height: transProgress.to([0, 1], [prevPageState.topSafeArea, pageState.topSafeArea]),
      },
    },
    bottomSafeArea: {
      containerStyle: {
        backgroundColor: pageState.bottomSafeAreaColor,
        top: transProgress.to(
          [0, 1],
          [clientHeight - prevPageState.bottomSafeArea, clientHeight - pageState.bottomSafeArea],
        ),
        height: transProgress.to([0, 1], [prevPageState.bottomSafeArea, pageState.bottomSafeArea]),
      },
    },
    page: {
      containerStyle: {},
      contentStyle: {
        paddingTop: pageState.topSafeArea + pageState.topInset,
        paddingBottom: getKeyboardAwareBottomPadding(routeState, pageState),
        translateY: transUnit,
        height: pageContentHeight,
      },
    },
    prevPage: {
      containerStyle: {
        translateY: 0,
      },
      contentStyle: {
        paddingTop: prevPageState.topSafeArea + prevPageState.topInset,
        paddingBottom: prevPageState.bottomInset + prevPageState.bottomSafeArea,
        height: clientHeight,
        opacity: transProgress.to((progress) => 1 - progress / 2),
      },
    },
    topInset: {
      containerStyle: {
        top: transProgress.to([0, 1], [prevPageState.topSafeArea, pageState.topSafeArea]),
        height: transProgress.to([0, 1], [prevPageState.topInset, pageState.topInset]),
      },
      contentStyle: {
        opacity: transProgress.to((progress) => progress),
        // translateX: transProgress.to([0, 1], [clientWidth / 5, 0]),
      },
      prevContentStyle: {
        opacity: transProgress.to((progress) => 1 - progress),
        // translateX: transProgress.to([0, 1], [0, -clientWidth / 5]),
      },
    },
    topLeftAction: {
      containerStyle: {
        top: transProgress.to([0, 1], [prevPageState.topSafeArea, pageState.topSafeArea]),
        height: transProgress.to([0, 1], [prevPageState.topInset, pageState.topInset]),
      },
      contentStyle: {
        opacity: transProgress.to((progress) => progress),
      },
      prevContentStyle: {
        opacity: transProgress.to((progress) => 1 - progress),
      },
    },
    bottomInset: {
      containerStyle: {
        height: transProgress.to([0, 1], [prevPageState.bottomInset, pageState.bottomInset]),
        top: transProgress.to(
          [0, 1],
          [
            clientHeight - prevPageState.bottomInset - prevPageState.bottomSafeArea,
            clientHeight - pageState.bottomInset - pageState.bottomSafeArea,
            // prevPageState.bottomInset ? clientHeight - pageState.bottomInset - pageState.bottomSafeArea : 0,
          ],
        ),
      },
      contentStyle: {
        opacity: transProgress.to((progress) => progress),
      },
      prevContentStyle: {
        opacity: transProgress.to((progress) => 1 - progress),
      },
    },
  };

  const useCsrTransition: UseCsrTransition = {
    ...csrTranstionStyles,
    pageBind,
    pageClassName: "touch-pan-x",
    transDirection,
    transUnitRange,
    transUnit,
    transPercent,
    transProgress,
  };
  return useCsrTransition;
};

export const useCsrValues = (rootRouteGuide: RouteGuide, pathRoutes: PathRoute[]) => {
  const { viewport, updateViewport } = useFrameViewport();
  const { frameSlots, pendingFrameSlots, registerFrameSlot, promotePendingSlots, clearPendingSlots } = useFrameSlots();
  const [transitionPageStateSnapshot, setTransitionPageStateSnapshot] = useState<Map<string, PageState> | null>(null);
  const pageStateByPathRef = useRef(new Map<string, PageState>());
  const navigationIntentId = useRef(0);
  const transitionPlanId = useRef(0);
  const navigationLocked = useRef(false);
  const renderCountRef = useRef(0);
  const basePageStateMap = useRef(new WeakMap<PathRoute, PathRoute["pageState"]>());
  const topSafeAreaRef = useRef<HTMLDivElement>(null);
  const bottomSafeAreaRef = useRef<HTMLDivElement>(null);
  const pageContentRef = useRef<HTMLDivElement>(null);
  const prevPageContentRef = useRef<HTMLDivElement>(null);
  const onBack = useRef<{ [K in TransitionType]?: () => Promise<void> }>({});
  const frameRootRef = useRef<HTMLDivElement>(null);
  const lastBroadcastSyncHref = useRef<string | null>(null);

  const { getLocation } = useLocation({ rootRouteGuide });
  const {
    history,
    setHistoryForward,
    setHistoryBack,
    getNextLocation,
    getCurrentLocation,
    getPrevLocation,
    getScrollTop,
  } = useHistory([getLocation(window.location.href.replace(window.location.origin, ""))]);
  const [locationState, setLocationState] = useState<LocationState>({
    location: getCurrentLocation(),
    prevLocation: getPrevLocation(),
    pendingLocation: null,
    navigationIntent: null,
    phase: "idle",
  });
  const { location, prevLocation } = locationState;
  const pendingLocation = locationState.pendingLocation ?? null;
  const navigationIntent = locationState.navigationIntent ?? null;
  const phase = locationState.phase ?? "idle";
  const pageStateByPath = useMemo(
    () =>
      resolveFramePageStateMap({
        pathRoutes,
        frameSlots,
        pendingFrameSlots,
        pendingPath: pendingLocation?.pathRoute.path,
        visiblePaths: [
          location.pathRoute.path,
          ...(prevLocation ? [prevLocation.pathRoute.path] : []),
          ...(pendingLocation ? [pendingLocation.pathRoute.path] : []),
        ],
        basePageStateMap: basePageStateMap.current,
      }),
    [
      pathRoutes,
      frameSlots,
      pendingFrameSlots,
      pendingLocation?.pathRoute.path,
      location.pathRoute.path,
      prevLocation?.pathRoute.path,
    ],
  );
  useEffect(() => {
    if (!transitionPageStateSnapshot) pageStateByPathRef.current = pageStateByPath;
  }, [pageStateByPath, transitionPageStateSnapshot]);
  const latestPageStateByPath = useRef(pageStateByPath);
  const latestFrameSlots = useRef(frameSlots);
  const latestPendingFrameSlots = useRef(pendingFrameSlots);
  useEffect(() => {
    latestPageStateByPath.current = pageStateByPath;
    latestFrameSlots.current = frameSlots;
    latestPendingFrameSlots.current = pendingFrameSlots;
  }, [pageStateByPath, frameSlots, pendingFrameSlots]);
  if (pageStateByPathRef.current.size === 0) pageStateByPathRef.current = pageStateByPath;
  const effectivePageStateByPath = transitionPageStateSnapshot ?? pageStateByPath;
  const resolvedPathRoutes = useMemo(
    () => resolvePathRoutesWithFrameState(pathRoutes, effectivePageStateByPath),
    [pathRoutes, effectivePageStateByPath],
  );
  const resolvedPathRouteMap = useMemo(
    () => new Map(resolvedPathRoutes.map((pathRoute) => [pathRoute.path, pathRoute])),
    [resolvedPathRoutes],
  );
  const resolvedLocation = resolveLocationWithFrameState(location, resolvedPathRouteMap) ?? location;
  const resolvedPrevLocation = resolveLocationWithFrameState(prevLocation, resolvedPathRouteMap);
  const resolvedPendingLocation = resolveLocationWithFrameState(pendingLocation, resolvedPathRouteMap);
  const platformProfile = getFramePlatformProfile();
  const accessoryHeight = resolveKeyboardAccessoryHeight(resolvedLocation.pathRoute.path, frameSlots);
  const keyboardFrame = useKeyboardFrame({
    bottomSafeArea: resolvedLocation.pathRoute.pageState.bottomSafeArea,
    sticky: hasKeyboardStickySlot(resolvedLocation.pathRoute.path, frameSlots),
    viewport,
    platformProfile,
    freeze: phase === "transitioning",
  });
  const keyboardLayout = useMemo(
    () =>
      resolveKeyboardLayout({
        viewport,
        keyboard: keyboardFrame,
        accessoryHeight,
        bottomSafeArea: resolvedLocation.pathRoute.pageState.bottomSafeArea,
      }),
    [viewport, keyboardFrame, accessoryHeight, resolvedLocation.pathRoute.pageState.bottomSafeArea],
  );
  useFrameRuntimeResync({ updateViewport });
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
  const applyingSyncNavigation = useRef(false);
  const broadcastSyncNavigation = useCallback((kind: "push" | "replace" | "back" | "pop", href: string) => {
    if (applyingSyncNavigation.current) return;
    const syncNavigation = (
      globalThis as typeof globalThis & {
        __AKAN_DEV_SYNC_NAVIGATION__?: (href: string, kind: "push" | "replace" | "back" | "pop") => void;
      }
    ).__AKAN_DEV_SYNC_NAVIGATION__;
    syncNavigation?.(href, kind);
  }, []);
  const runForwardNavigation = useCallback(
    (kind: "push" | "replace", href: string, { scrollToTop }: RouteOptions = {}) => {
      const fromLocation = getCurrentLocation();
      const toLocation = getLocation(href);
      const scrollTop = pageContentRef.current?.scrollTop ?? 0;
      const usePendingNavigation =
        shouldPrepareFrameTransition(href) && toLocation.pathRoute.pageState.transition !== "none";

      if (!usePendingNavigation) {
        setHistoryForward({ type: kind, location: toLocation, scrollTop, scrollToTop });
        setLocationState({
          location: getCurrentLocation(),
          prevLocation: kind === "replace" ? prevLocation : fromLocation,
          pendingLocation: null,
          navigationIntent: null,
          phase: "idle",
        });
        if (kind === "push") window.history.pushState({}, "", href);
        else window.history.replaceState({}, "", href);
        return;
      }

      if (navigationLocked.current) {
        debugFrame("navigation.cancel", { reason: "locked", kind, from: fromLocation.href, to: href });
        return;
      }
      navigationLocked.current = true;
      const intent: NavigationIntent = {
        id: ++navigationIntentId.current,
        kind,
        from: fromLocation,
        to: toLocation,
        scrollTop,
        scrollToTop,
        createdAt: Date.now(),
      };
      debugFrame("navigation.intent", { id: intent.id, kind, from: fromLocation.href, to: href });
      clearPendingSlots();
      setLocationState({
        location: fromLocation,
        prevLocation,
        pendingLocation: toLocation,
        navigationIntent: intent,
        phase: "preparing",
      });

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
        if (kind === "push") window.history.pushState({}, "", href);
        else window.history.replaceState({}, "", href);
        debugFrame("navigation.commit", { id: intent.id, kind, to: href });
        window.setTimeout(
          () => {
            setTransitionPageStateSnapshot(null);
            setLocationState((current) => ({
              ...current,
              pendingLocation: null,
              navigationIntent: null,
              phase: "idle",
            }));
            navigationLocked.current = false;
            clearPendingSlots();
            debugFrame("transition.actionEnd", { id: plan.id, phase: "idle" });
          },
          Math.max(360, plan.duration),
        );
      };

      const waitUntilReady = () => {
        const elapsedMs = Date.now() - intent.createdAt;
        const ready = isPendingFrameReady({
          path: toLocation.pathRoute.path,
          pendingFrameSlots: latestPendingFrameSlots.current,
          elapsedMs,
        });
        if (ready) {
          void commitNavigation(elapsedMs >= PENDING_FRAME_READY_TIMEOUT_MS);
          return;
        }
        window.setTimeout(waitUntilReady, 16);
      };
      window.setTimeout(waitUntilReady, 16);
    },
    [
      clearPendingSlots,
      broadcastSyncNavigation,
      getCurrentLocation,
      getLocation,
      prevLocation,
      promotePendingSlots,
      setHistoryForward,
      shouldPrepareFrameTransition,
      viewport,
    ],
  );
  renderCountRef.current += 1;
  if (renderCountRef.current <= 5 || renderCountRef.current % 20 === 0) {
    debugFrame("csr.render", {
      count: renderCountRef.current,
      path: resolvedLocation.pathRoute.path,
      href: resolvedLocation.href,
      viewport,
      keyboardFrame,
      contentViewport: keyboardLayout.contentViewport,
      keyboardAccessory: keyboardLayout.keyboardAccessory,
      frameSlotPaths: Object.keys(frameSlots),
    });
  }
  useEffect(() => {
    debugFrame("keyboard.layoutResolve", {
      path: resolvedLocation.pathRoute.path,
      keyboardHeight: keyboardFrame.height,
      visualHeight: viewport.visualHeight,
      visualOffsetTop: viewport.visualOffsetTop,
      contentViewport: keyboardLayout.contentViewport,
      accessory: keyboardLayout.keyboardAccessory,
      slotHeight: accessoryHeight,
      platformProfile,
      frozen: keyboardFrame.frozen,
      source: keyboardFrame.source,
    });
  }, [
    resolvedLocation.pathRoute.path,
    keyboardFrame.height,
    keyboardFrame.offset,
    keyboardFrame.frozen,
    keyboardFrame.source,
    viewport.visualHeight,
    viewport.visualOffsetTop,
    keyboardLayout,
    accessoryHeight,
    platformProfile,
  ]);
  useEffect(() => {
    debugFrame("csr.mount", { path: resolvedLocation.pathRoute.path, viewport });
    return () => debugFrame("csr.unmount", { lastPath: resolvedLocation.pathRoute.path });
  }, []);
  const getRouter = useCallback((): RouterInstance => {
    const router: RouterInstance = {
      push: (href: string, { scrollToTop }: RouteOptions = {}) => {
        const location = getCurrentLocation();
        debugFrame("router.push", { from: location.href, to: href, scrollToTop });
        if (location.href === href) {
          if (!pageContentRef.current) return;
          pageContentRef.current.scrollTop = getScrollTop(location);
          return;
        }
        runForwardNavigation("push", href, { scrollToTop });
      },
      replace: (href: string, { scrollToTop }: RouteOptions = {}) => {
        const location = getCurrentLocation();
        debugFrame("router.replace", { from: location.href, to: href, scrollToTop });
        if (location.href === href) {
          if (!pageContentRef.current) return;
          pageContentRef.current.scrollTop = getScrollTop(location);
          return;
        }
        runForwardNavigation("replace", href, { scrollToTop });
      },
      refresh: () => {
        window.location.reload();
      },
      back: async ({ scrollToTop }: RouteOptions = {}) => {
        const targetLocation = getPrevLocation();
        if (!targetLocation) return;
        const location = getCurrentLocation();
        debugFrame("router.back", { from: location.href, to: targetLocation.href, scrollToTop });
        if (shouldPrepareFrameTransition()) await startFrameTransition();
        await onBack.current[location.pathRoute.pageState.transition]?.();
        const scrollTop = pageContentRef.current?.scrollTop ?? 0;
        setHistoryBack({ type: "back", location, scrollTop, scrollToTop });
        setLocationState({
          location: getCurrentLocation(),
          prevLocation: getPrevLocation(),
          pendingLocation: null,
          navigationIntent: null,
          phase: "idle",
        });
        broadcastSyncNavigation("back", getSyncRouteHref(targetLocation));
        window.history.back();
      },
    };
    window.onpopstate = async (ev: PopStateEvent) => {
      const href = window.location.href.replace(window.location.origin, "");
      const routeType =
        href === getNextLocation()?.href // && history.current.type !== "back"
          ? "forward"
          : href === getPrevLocation()?.href
            ? "back"
            : null;
      const scrollTop = pageContentRef.current?.scrollTop ?? 0;
      debugFrame("router.popstate", { href, routeType, scrollTop });
      if (!routeType) return;
      if (routeType === "forward") {
        if (shouldPrepareFrameTransition(href)) await startFrameTransition();
        const location = getCurrentLocation();
        setHistoryForward({ type: "popForward", location, scrollTop });
        setLocationState({
          location: getCurrentLocation(),
          prevLocation: location,
          pendingLocation: null,
          navigationIntent: null,
          phase: "idle",
        });
        broadcastSyncNavigation("pop", getSyncRouteHref(getLocation(href)));
      } else {
        // back
        const location = getCurrentLocation();
        if (shouldPrepareFrameTransition(href)) await startFrameTransition();
        await onBack.current[location.pathRoute.pageState.transition]?.();
        setHistoryBack({ type: "popBack", location, scrollTop });
        setLocationState({
          location: getCurrentLocation(),
          prevLocation: getPrevLocation(),
          pendingLocation: null,
          navigationIntent: null,
          phase: "idle",
        });
        broadcastSyncNavigation("pop", getSyncRouteHref(getLocation(href)));
      }
    };
    return router;
  }, [location, runForwardNavigation, broadcastSyncNavigation]);
  const router = getRouter();
  useEffect(() => {
    const syncHref = getSyncRouteHref(resolvedLocation);
    if (lastBroadcastSyncHref.current === null) {
      lastBroadcastSyncHref.current = syncHref;
      return;
    }
    if (lastBroadcastSyncHref.current === syncHref) return;
    lastBroadcastSyncHref.current = syncHref;
    if (applyingSyncNavigation.current || globalThis.__AKAN_DEV_SYNC_NAVIGATION_APPLYING__) return;
    broadcastSyncNavigation(
      history.current.type === "back" ? "back" : history.current.type === "forward" ? "push" : "pop",
      syncHref,
    );
  }, [
    resolvedLocation.pathRoute.path,
    resolvedLocation.search,
    resolvedLocation.hash,
    broadcastSyncNavigation,
    history,
  ]);
  useEffect(() => {
    const resetSyncNavigation = () => {
      window.setTimeout(() => {
        applyingSyncNavigation.current = false;
        globalThis.__AKAN_DEV_SYNC_NAVIGATION_APPLYING__ = false;
      }, 1000);
    };
    const handleSyncNavigation = (event: Event) => {
      const { href, kind = "push" } =
        (event as CustomEvent<{ href?: string; kind?: "push" | "replace" | "back" | "pop" }>).detail ?? {};
      if (!href) return;
      const target = new URL(href, window.location.origin);
      const targetHref = `${target.pathname}${target.search}${target.hash}`;
      if (targetHref === getSyncRouteHref(getCurrentLocation())) return;
      applyingSyncNavigation.current = true;
      globalThis.__AKAN_DEV_SYNC_NAVIGATION_APPLYING__ = true;
      if (kind === "replace" || kind === "back" || kind === "pop")
        clientRouter.replace(targetHref, { scrollToTop: false });
      else clientRouter.push(targetHref, { scrollToTop: false });
      resetSyncNavigation();
    };
    window.addEventListener("akan:sync-navigation", handleSyncNavigation);
    return () => window.removeEventListener("akan:sync-navigation", handleSyncNavigation);
  }, [getCurrentLocation, getPrevLocation, router]);
  const routeState: RouteState = {
    clientWidth: viewport.width,
    clientHeight: viewport.height,
    location: resolvedLocation,
    prevLocation: resolvedPrevLocation,
    pendingLocation: resolvedPendingLocation,
    navigationIntent,
    phase,
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
      platformProfile,
      zIndex: FRAME_Z_INDEX,
      pageStateByPath: effectivePageStateByPath,
    },
  };
  const useNonTransition = useNoneTrans(routeState);
  const useFadeTransition = useFadeTrans(routeState);
  const useScaleOutTransition = useScaleOutTrans(routeState);
  const useStackTransition = useStackTrans(routeState);
  const useBottomUpTransition = useBottomUpTrans(routeState);
  const useCsrTransitionMap: { [key in TransitionType]: UseCsrTransition } = {
    none: useNonTransition,
    fade: useFadeTransition,
    stack: useStackTransition,
    bottomUp: useBottomUpTransition,
    scaleOut: useScaleOutTransition,
  };
  const nativeBackStateRef = useRef({
    path: resolvedLocation.pathRoute.path,
    keyboardHeight: keyboardFrame.height,
    keyboardVisible: keyboardFrame.visible,
    router,
  });
  const handledDeepLinkRef = useRef<{ href: string; handledAt: number; resetStack: boolean } | null>(null);
  const didResetDeepLinkStackRef = useRef(false);

  useEffect(() => {
    if (pageContentRef.current) pageContentRef.current.scrollTop = getScrollTop(location);
    if (prevPageContentRef.current)
      prevPageContentRef.current.scrollTop = prevLocation ? getScrollTop(prevLocation) : 0;
  }, [location.href]);

  useEffect(() => {
    nativeBackStateRef.current = {
      path: resolvedLocation.pathRoute.path,
      keyboardHeight: keyboardFrame.height,
      keyboardVisible: keyboardFrame.visible,
      router,
    };
  }, [keyboardFrame.height, keyboardFrame.visible, resolvedLocation.pathRoute.path, router]);

  useEffect(() => {
    const isMobileTarget = Boolean(window.__AKAN_MOBILE_TARGET__);
    if (Device.getDevice().info.platform === "web" && !isMobileTarget) return;
    let removeListener: (() => void) | undefined;
    let disposed = false;
    const mountedAt = Date.now();

    const enterDeepLinkWhenReady = (href: string, resetStack: boolean, attempt = 0) => {
      if (!clientRouter.isInitialized) {
        if (attempt < 40) window.setTimeout(() => enterDeepLinkWhenReady(href, resetStack, attempt + 1), 50);
        else debugFrame("native.deepLink.skipped", { href, reason: "router-not-ready" });
        return;
      }
      clientRouter.enterDeepLink(href, { resetStack, scrollToTop: true });
    };

    const handleDeepLink = (url: string | null | undefined, resetStack: boolean) => {
      if (!url) return;
      const href = normalizeDeepLinkHref(url);
      const now = Date.now();
      const lastHandled = handledDeepLinkRef.current;
      const shouldResetStack = resetStack || (!lastHandled && now - mountedAt < 5000);
      if (
        lastHandled?.href === href &&
        now - lastHandled.handledAt < 1000 &&
        (!shouldResetStack || lastHandled.resetStack)
      )
        return;
      handledDeepLinkRef.current = { href, handledAt: now, resetStack: shouldResetStack };
      debugFrame("native.deepLink", {
        href,
        resetStack: shouldResetStack,
        sourceResetStack: resetStack,
        historyIdx: history.current.idx,
        mountedForMs: now - mountedAt,
        routerReady: clientRouter.isInitialized,
      });
      if (shouldResetStack) didResetDeepLinkStackRef.current = true;
      enterDeepLinkWhenReady(href, shouldResetStack);
    };

    void loadCapacitorApp()
      .then(({ App }) => {
        debugFrame("native.deepLink.listener", { platform: Device.getDevice().info.platform, isMobileTarget });
        const listener = App.addListener("appUrlOpen", (event: unknown) => {
          handleDeepLink((event as { url?: string | null } | undefined)?.url, false);
        });

        void Promise.resolve(listener).then((handle) => {
          const remove =
            typeof (handle as { remove?: unknown } | undefined)?.remove === "function"
              ? () => void (handle as { remove: () => Promise<void> | void }).remove()
              : undefined;
          if (disposed) remove?.();
          else removeListener = remove;
        });

        void App.getLaunchUrl?.()
          .then((launch) => {
            debugFrame("native.deepLink.launchUrl", { url: launch?.url ?? null });
            handleDeepLink(launch?.url, true);
          })
          .catch((error) => debugFrame("native.deepLink.launchUrlError", { error: String(error) }));
      })
      .catch((error) => debugFrame("native.deepLink.listenerError", { error: String(error) }));

    return () => {
      disposed = true;
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    if (Device.getDevice().info.platform === "web") return;
    let removeListener: (() => void) | undefined;
    let disposed = false;

    void loadCapacitorApp().then(({ App }) => {
      const listener = App.addListener("backButton", () => {
        const nativeBackState = nativeBackStateRef.current;
        debugFrame("native.backButton", {
          historyIdx: history.current.idx,
          path: nativeBackState.path,
          keyboardHeight: nativeBackState.keyboardHeight,
        });
        if (nativeBackState.keyboardVisible) {
          void prepareForFrameTransition();
          return;
        }
        if (history.current.idx > 0) {
          nativeBackState.router.back();
          return;
        }
        const fallbackPath = window.__AKAN_MOBILE_TARGET__?.indexPath ?? "/";
        if (didResetDeepLinkStackRef.current) {
          void App.exitApp?.();
          return;
        }
        if (nativeBackState.path !== fallbackPath) {
          clientRouter.backOrFallback(fallbackPath, { scrollToTop: false });
          return;
        }
        void App.exitApp?.();
      });

      void Promise.resolve(listener).then((handle) => {
        const remove =
          typeof (handle as { remove?: unknown } | undefined)?.remove === "function"
            ? () => void (handle as { remove: () => Promise<void> | void }).remove()
            : undefined;
        if (disposed) remove?.();
        else removeListener = remove;
      });
    });

    return () => {
      disposed = true;
      removeListener?.();
    };
  }, []);

  return {
    ...routeState,
    ...useCsrTransitionMap[resolvedLocation.pathRoute.pageState.transition],
  } satisfies CsrContextType;
};
