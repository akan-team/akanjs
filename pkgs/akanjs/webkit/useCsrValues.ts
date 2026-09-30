"use client";
import { useSpringValue } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";
import {
  type CsrContextType,
  router as clientRouter,
  Device,
  debugFrame,
  defaultPageState,
  getPathInfo,
  type Location,
  type LocationState,
  type NavigationIntent,
  type PageState,
  type PageTransition,
  type PathRoute,
  type RouteGuide,
  type RouteOptions,
  type RouterInstance,
  type RouteState,
  type TransitionType,
  type UseCsrTransition,
} from "akanjs/client";
import { clamp, parseAkanI18nEnv, parseBasePaths } from "akanjs/common";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CsrStack } from "./CsrStack";
import { CsrFrameDump } from "./csrFrameDump";
import { type NativeBackProgress, NativeNavigation } from "./nativeNavigation";
import { NativeUpdates } from "./nativeUpdates";
import {
  createFrameSnapshot,
  createTransitionPlan,
  FRAME_Z_INDEX,
  getFramePlatformProfile,
  getFrameSlotsForSnapshot,
  hasBottomAnchoredKeyboardSlot,
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

type Progress = UseCsrTransition["transProgress"];
type FramePageState = PathRoute["pageState"];

const tween = (progress: Progress, from: number, to: number) => progress.to([0, 1], [from, to]);
const fadeIn = (progress: Progress) => ({ opacity: progress.to((value) => value) });
const fadeOut = (progress: Progress) => ({ opacity: progress.to((value) => 1 - value) });

const pageContentStyle = ({ frameLayout }: RouteState, pageState: FramePageState) => ({
  paddingTop: pageState.topSafeArea + pageState.topInset,
  paddingBottom: Math.max(
    pageState.bottomSafeArea,
    pageState.bottomInset +
      pageState.bottomSafeArea -
      (frameLayout.keyboard.sticky ? frameLayout.keyboardAccessory.height : 0),
  ),
  height: frameLayout.contentViewport.height,
});

const prevPageContentStyle = (clientHeight: number, prevPageState: FramePageState) => ({
  paddingTop: prevPageState.topSafeArea + prevPageState.topInset,
  paddingBottom: prevPageState.bottomInset + prevPageState.bottomSafeArea,
  height: clientHeight,
});

const tweenedSafeAreas = (
  progress: Progress,
  clientHeight: number,
  pageState: FramePageState,
  prevPageState: FramePageState,
) => ({
  topSafeArea: {
    containerStyle: {
      backgroundColor: pageState.topSafeAreaColor,
      height: tween(progress, prevPageState.topSafeArea, pageState.topSafeArea),
    },
  },
  bottomSafeArea: {
    containerStyle: {
      backgroundColor: pageState.bottomSafeAreaColor,
      top: tween(progress, clientHeight - prevPageState.bottomSafeArea, clientHeight - pageState.bottomSafeArea),
      height: tween(progress, prevPageState.bottomSafeArea, pageState.bottomSafeArea),
    },
  },
});

const tweenedTopInset = (progress: Progress, pageState: FramePageState, prevPageState: FramePageState) => ({
  top: tween(progress, prevPageState.topSafeArea, pageState.topSafeArea),
  height: tween(progress, prevPageState.topInset, pageState.topInset),
});

const tweenedBottomInset = (
  progress: Progress,
  clientHeight: number,
  pageState: FramePageState,
  prevPageState: FramePageState,
) => ({
  height: tween(progress, prevPageState.bottomInset, pageState.bottomInset),
  top: tween(progress, getBottomInsetTop(clientHeight, prevPageState), getBottomInsetTop(clientHeight, pageState)),
});

const useFadeSpring = () => {
  const transUnit = useSpringValue(1, { config: { clamp: true } });
  const transUnitRange = useMemo(() => [0, 1], []);
  return {
    transUnit,
    transUnitRange,
    transProgress: transUnit.to((unit) => unit),
    transPercent: transUnit.to([0, 1], [0, 100], "clamp"),
  };
};

const useSlideSpring = (size: number) => {
  const transUnit = useSpringValue(0, { config: { clamp: true } });
  const transUnitRange = useMemo(() => [size, 0], [size]);
  const transUnitReversed = transUnit.to((unit) => transUnitRange[0] - unit);
  const transUnitRangeReversed = useMemo(() => [0, size], [size]);
  return {
    transUnit,
    transUnitRange,
    transProgress: transUnitReversed.to(transUnitRangeReversed, [0, 1], "clamp"),
    transPercent: transUnitReversed.to(transUnitRangeReversed, [0, 100], "clamp"),
  };
};

const usePlayOnForward = (
  { transUnit, transUnitRange }: Pick<UseCsrTransition, "transUnit" | "transUnitRange">,
  { history, location }: RouteState,
  config: { duration: number; easing?: (t: number) => number },
) => {
  useEffect(() => {
    if (history.current.type === "forward") {
      void transUnit.start(transUnitRange[0], { immediate: true });
      void transUnit.start(transUnitRange[1], { config });
    } else void transUnit.start(transUnitRange[1], { immediate: true });
  }, [location.entryId ?? location.pathname]);
};

const useNoneTrans = (routeState: RouteState): UseCsrTransition => {
  const { clientHeight, location, prevLocation } = routeState;
  const transUnit = useSpringValue(0, { config: { clamp: true } });
  const transUnitRange = useMemo(() => [0, 0], []);
  const pageState = location.pathRoute.pageState;
  const prevPageState = prevLocation?.pathRoute.pageState ?? defaultPageState;
  return {
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
      contentStyle: pageContentStyle(routeState, pageState),
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
        top: getBottomInsetTop(clientHeight, pageState),
      },
      contentStyle: { opacity: 1 },
      prevContentStyle: { opacity: 0 },
    },
    pageBind: () => ({}),
    pageClassName: "touch-pan-y",
    transDirection: "none",
    transUnitRange,
    transUnit,
    transProgress: transUnit.to(() => 1),
    transPercent: transUnit.to(() => 100),
  };
};

const useFadeTrans = (routeState: RouteState): UseCsrTransition => {
  const { clientHeight, location, prevLocation, onBack } = routeState;
  const spring = useFadeSpring();
  const { transUnit, transUnitRange, transProgress } = spring;
  const pageState = location.pathRoute.pageState;
  const prevPageState = prevLocation?.pathRoute.pageState ?? defaultPageState;
  const pageBottomInsetTop = getBottomInsetTop(clientHeight, pageState);
  const prevBottomInsetTop = getBottomInsetTop(clientHeight, prevPageState);

  useEffect(() => {
    onBack.current.fade = async () => {
      await transUnit.start(transUnitRange[0]);
    };
  }, []);
  usePlayOnForward(spring, routeState, { duration: 150 });

  return {
    ...tweenedSafeAreas(transProgress, clientHeight, pageState, prevPageState),
    page: {
      containerStyle: {},
      contentStyle: { ...pageContentStyle(routeState, pageState), opacity: transUnit },
    },
    prevPage: {
      containerStyle: {
        opacity: transProgress.to((progress) => 1 - progress),
      },
      contentStyle: prevPageContentStyle(clientHeight, prevPageState),
    },
    topInset: {
      containerStyle: tweenedTopInset(transProgress, pageState, prevPageState),
      contentStyle: { opacity: transProgress },
      prevContentStyle: fadeOut(transProgress),
    },
    topLeftAction: {
      containerStyle: tweenedTopInset(transProgress, pageState, prevPageState),
      contentStyle: {
        top: tween(transProgress, 0, -(pageState.bottomInset - prevPageState.bottomInset) * 2),
        ...fadeIn(transProgress),
      },
      prevContentStyle: {
        top: tween(transProgress, 0, -(pageState.bottomInset - prevPageState.bottomInset) * 2),
        ...fadeOut(transProgress),
      },
    },
    bottomInset: {
      containerStyle: tweenedBottomInset(transProgress, clientHeight, pageState, prevPageState),
      contentStyle: {
        height: pageState.bottomInset,
        translateY: transProgress.to((progress) =>
          getFrameContentOffset(pageBottomInsetTop, prevBottomInsetTop, pageBottomInsetTop, progress),
        ),
        ...fadeIn(transProgress),
        transformOrigin: "top",
      },
      prevContentStyle: {
        height: prevPageState.bottomInset,
        translateY: transProgress.to((progress) =>
          getFrameContentOffset(prevBottomInsetTop, prevBottomInsetTop, pageBottomInsetTop, progress),
        ),
        ...fadeOut(transProgress),
        transformOrigin: "top",
      },
    },
    pageBind: () => ({}),
    pageClassName: "",
    transDirection: "none",
    ...spring,
  };
};

const useScaleOutTrans = (routeState: RouteState): UseCsrTransition => {
  const { clientHeight, location, prevLocation, onBack } = routeState;
  const spring = useFadeSpring();
  const { transUnit, transUnitRange, transProgress } = spring;
  const pageState = location.pathRoute.pageState;
  const prevPageState = prevLocation?.pathRoute.pageState ?? defaultPageState;

  useEffect(() => {
    onBack.current.scaleOut = async () => {
      await transUnit.start(transUnitRange[0], { config: { duration: ANDROID_SCALE_TRANSITION_DURATION } });
    };
  }, []);
  usePlayOnForward(spring, routeState, { duration: ANDROID_SCALE_TRANSITION_DURATION });

  return {
    ...tweenedSafeAreas(transProgress, clientHeight, pageState, prevPageState),
    page: {
      containerStyle: {
        transform: transProgress.to((progress) => `scale(${0.92 + progress * 0.08})`),
      },
      contentStyle: { ...pageContentStyle(routeState, pageState), opacity: transProgress },
    },
    prevPage: {
      containerStyle: {
        transform: transProgress.to((progress) => `scale(${1 - progress * 0.02})`),
      },
      contentStyle: {
        ...prevPageContentStyle(clientHeight, prevPageState),
        opacity: transProgress.to((progress) => 1 - progress * 0.35),
      },
    },
    topInset: {
      containerStyle: tweenedTopInset(transProgress, pageState, prevPageState),
      contentStyle: { opacity: transProgress },
      prevContentStyle: fadeOut(transProgress),
    },
    topLeftAction: {
      containerStyle: tweenedTopInset(transProgress, pageState, prevPageState),
      contentStyle: { opacity: transProgress },
      prevContentStyle: fadeOut(transProgress),
    },
    bottomInset: {
      containerStyle: tweenedBottomInset(transProgress, clientHeight, pageState, prevPageState),
      contentStyle: { opacity: transProgress },
      prevContentStyle: fadeOut(transProgress),
    },
    pageBind: () => ({}),
    pageClassName: "",
    transDirection: "none",
    ...spring,
  };
};

const useStackTrans = (routeState: RouteState): UseCsrTransition => {
  const { clientWidth, clientHeight, location, prevLocation, onBack, pageContentRef } = routeState;
  const spring = useSlideSpring(clientWidth);
  const { transUnit, transUnitRange, transProgress } = spring;
  const initThreshold = useMemo(() => Math.floor(clientWidth), [clientWidth]);
  const threshold = useMemo(() => Math.floor(clientWidth / 3), [clientWidth]);
  const pageState = location.pathRoute.pageState;
  const prevPageState = prevLocation?.pathRoute.pageState ?? defaultPageState;
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
  usePlayOnForward(spring, routeState, { duration: 150 });

  const pageBind = useDrag(
    ({ first, last, movement: [mx, my], velocity: [vx], direction: [dx], initial: [ix], cancel }) => {
      if (first) {
        gestureIntent.current = "pending";
        stackBackConfigRef.current = null;
        unlockPageScroll();
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
        void Device.getDevice().hideKeyboard();
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

  return {
    ...tweenedSafeAreas(transProgress, clientHeight, pageState, prevPageState),
    page: {
      containerStyle: {},
      contentStyle: { ...pageContentStyle(routeState, pageState), translateX: transUnit },
    },
    prevPage: {
      containerStyle: {
        top: 0,
        left: 0,
        height: clientHeight,
        translateX: transUnit.to((unit) => (unit - clientWidth) / 5),
      },
      contentStyle: {
        ...prevPageContentStyle(clientHeight, prevPageState),
        opacity: transProgress.to((progress) => 1 - progress / 2),
      },
    },
    topInset: {
      containerStyle: tweenedTopInset(transProgress, pageState, prevPageState),
      contentStyle: { ...fadeIn(transProgress), translateX: tween(transProgress, clientWidth / 5, 0) },
      prevContentStyle: { ...fadeOut(transProgress), translateX: tween(transProgress, 0, -clientWidth / 5) },
    },
    topLeftAction: {
      containerStyle: {
        ...tweenedTopInset(transProgress, pageState, prevPageState),
        minWidth: tween(transProgress, prevPageState.topInset, pageState.topInset),
      },
      contentStyle: fadeIn(transProgress),
      prevContentStyle: fadeOut(transProgress),
    },
    bottomInset: {
      containerStyle: tweenedBottomInset(transProgress, clientHeight, pageState, prevPageState),
      contentStyle: { height: pageState.bottomInset, translateX: transUnit, ...fadeIn(transProgress) },
      prevContentStyle: {
        height: prevPageState.bottomInset,
        translateX: transUnit.to((unit) => (unit - clientWidth) / 5),
        ...fadeOut(transProgress),
      },
    },
    pageBind,
    pageClassName: "touch-pan-y",
    transDirection: "horizontal",
    ...spring,
  };
};

const useBottomUpTrans = (routeState: RouteState): UseCsrTransition => {
  const { clientHeight, location, prevLocation, onBack } = routeState;
  const spring = useSlideSpring(clientHeight);
  const { transUnit, transUnitRange, transProgress } = spring;
  const initThreshold = useMemo(() => Math.floor(clientHeight / 3), [clientHeight]);
  const threshold = useMemo(() => Math.floor(clientHeight / 2), [clientHeight]);
  const pageState = location.pathRoute.pageState;
  const prevPageState = prevLocation?.pathRoute.pageState ?? defaultPageState;
  useEffect(() => {
    onBack.current.bottomUp = async () => {
      await transUnit.start(transUnitRange[0], { config: { duration: 220, easing: linearEasing } });
    };
  }, []);
  usePlayOnForward(spring, routeState, { duration: 220, easing: linearEasing });

  const pageBind = useDrag(
    ({ first, last, movement: [, my], initial: [, iy], cancel }) => {
      if (iy > initThreshold) {
        cancel();
        return;
      }
      if (first) void Device.getDevice().hideKeyboard();
      if (my < transUnitRange[1]) void transUnit.start(transUnitRange[1], { immediate: true });
      else if (my > transUnitRange[0]) void transUnit.start(transUnitRange[0], { immediate: true });
      else if (!last) void transUnit.start(my, { immediate: true });
      else if (my < threshold) void transUnit.start(transUnitRange[1]);
      if (last && my > threshold) clientRouter.back();
    },
    { axis: "y", filterTaps: true, threshold: 10 },
  );

  return {
    ...tweenedSafeAreas(transProgress, clientHeight, pageState, prevPageState),
    page: {
      containerStyle: {},
      contentStyle: { ...pageContentStyle(routeState, pageState), translateY: transUnit },
    },
    prevPage: {
      containerStyle: {
        translateY: 0,
      },
      contentStyle: {
        ...prevPageContentStyle(clientHeight, prevPageState),
        opacity: transProgress.to((progress) => 1 - progress / 2),
      },
    },
    topInset: {
      containerStyle: tweenedTopInset(transProgress, pageState, prevPageState),
      contentStyle: fadeIn(transProgress),
      prevContentStyle: fadeOut(transProgress),
    },
    topLeftAction: {
      containerStyle: tweenedTopInset(transProgress, pageState, prevPageState),
      contentStyle: fadeIn(transProgress),
      prevContentStyle: fadeOut(transProgress),
    },
    bottomInset: {
      containerStyle: tweenedBottomInset(transProgress, clientHeight, pageState, prevPageState),
      contentStyle: fadeIn(transProgress),
      prevContentStyle: fadeOut(transProgress),
    },
    pageBind,
    pageClassName: "touch-pan-x",
    transDirection: "vertical",
    ...spring,
  };
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
  const [initialStack] = useState(() => {
    const current = getLocation(window.location.href.replace(window.location.origin, ""));
    return CsrStack.restore(current, getLocation) ?? { locations: [current], idx: 0 };
  });
  const {
    history,
    setHistoryForward,
    setHistoryBack,
    setHistoryJump,
    getNextLocation,
    getCurrentLocation,
    getPrevLocation,
    getScrollTop,
  } = useHistory(initialStack.locations, initialStack);
  const [isBackgrounded, setIsBackgrounded] = useState(() => document.visibilityState === "hidden");
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
  const stackEntries = CsrStack.entriesOf({
    history: history.current,
    location,
    prevLocation,
    pendingLocation,
    phase,
  }).map((entry) => ({
    ...entry,
    location: resolveLocationWithFrameState(entry.location, resolvedPathRouteMap) ?? entry.location,
  }));
  const frameDumpRef = useRef({ phase, location, prevLocation, pendingLocation, stackEntries });
  frameDumpRef.current = { phase, location, prevLocation, pendingLocation, stackEntries };
  useEffect(() => {
    CsrFrameDump.watchFrame(() => {
      const frame = frameDumpRef.current;
      return {
        phase: frame.phase,
        location: frame.location.href,
        prevLocation: frame.prevLocation?.href ?? null,
        pendingLocation: frame.pendingLocation?.href ?? null,
        stack: frame.stackEntries.map(({ key, location: entry, pageType }) => ({
          key,
          path: entry.pathRoute.path,
          pageType,
        })),
      };
    });
  }, []);
  const platformProfile = getFramePlatformProfile();
  const accessoryHeight = resolveKeyboardAccessoryHeight(resolvedLocation.pathRoute.path, frameSlots);
  const shouldAnchorContentBottom = hasBottomAnchoredKeyboardSlot(resolvedLocation.pathRoute.path, frameSlots);
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
  const contentBottomAnchorRef = useRef<{
    path: string;
    contentViewportHeight: number;
    bottomDistance: number;
  } | null>(null);
  const contentBottomAnchorRafRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const element = pageContentRef.current;
    const path = resolvedLocation.pathRoute.path;
    if (!element || !shouldAnchorContentBottom || !keyboardFrame.sticky) {
      contentBottomAnchorRef.current = null;
      if (contentBottomAnchorRafRef.current !== null) {
        cancelAnimationFrame(contentBottomAnchorRafRef.current);
        contentBottomAnchorRafRef.current = null;
      }
      return;
    }

    const previous = contentBottomAnchorRef.current;
    const currentBottomDistance = Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight);
    if (!previous || previous.path !== path) {
      contentBottomAnchorRef.current = {
        path,
        contentViewportHeight: keyboardLayout.contentViewport.height,
        bottomDistance: currentBottomDistance,
      };
      return;
    }

    const shouldRestoreBottom = previous.contentViewportHeight !== keyboardLayout.contentViewport.height;
    const bottomDistance = previous.bottomDistance;
    if (shouldRestoreBottom) {
      const nextScrollTop = Math.max(0, element.scrollHeight - element.clientHeight - bottomDistance);
      if (Math.abs(element.scrollTop - nextScrollTop) > 1) {
        debugFrame("keyboard.contentAnchor", {
          path,
          from: element.scrollTop,
          to: nextScrollTop,
          bottomDistance,
          contentViewportHeight: keyboardLayout.contentViewport.height,
        });
        element.scrollTop = nextScrollTop;
      }
      const startedAt = performance.now();
      const duration = (keyboardFrame.animationDuration ?? 0) + 50;
      const keepBottomAnchored = () => {
        const scrollTop = Math.max(0, element.scrollHeight - element.clientHeight - bottomDistance);
        if (Math.abs(element.scrollTop - scrollTop) > 1) element.scrollTop = scrollTop;
        if (performance.now() - startedAt < duration) {
          contentBottomAnchorRafRef.current = requestAnimationFrame(keepBottomAnchored);
        } else {
          contentBottomAnchorRafRef.current = null;
        }
      };
      if (contentBottomAnchorRafRef.current !== null) cancelAnimationFrame(contentBottomAnchorRafRef.current);
      contentBottomAnchorRafRef.current = requestAnimationFrame(keepBottomAnchored);
    }

    contentBottomAnchorRef.current = {
      path,
      contentViewportHeight: keyboardLayout.contentViewport.height,
      bottomDistance: Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight),
    };
    return () => {
      if (contentBottomAnchorRafRef.current !== null) {
        cancelAnimationFrame(contentBottomAnchorRafRef.current);
        contentBottomAnchorRafRef.current = null;
      }
    };
  }, [
    pageContentRef,
    resolvedLocation.pathRoute.path,
    shouldAnchorContentBottom,
    keyboardFrame.sticky,
    keyboardFrame.animationDuration,
    keyboardLayout.contentViewport.height,
  ]);
  useEffect(() => {
    const element = pageContentRef.current;
    const path = resolvedLocation.pathRoute.path;
    if (!element || !shouldAnchorContentBottom || !keyboardFrame.sticky) return;
    const updateBottomDistance = () => {
      contentBottomAnchorRef.current = {
        path,
        contentViewportHeight: keyboardLayout.contentViewport.height,
        bottomDistance: Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight),
      };
    };
    element.addEventListener("scroll", updateBottomDistance, { passive: true });
    return () => element.removeEventListener("scroll", updateBottomDistance);
  }, [
    pageContentRef,
    resolvedLocation.pathRoute.path,
    shouldAnchorContentBottom,
    keyboardFrame.sticky,
    keyboardLayout.contentViewport.height,
  ]);
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
  const settle = (prev: LocationState["prevLocation"]) =>
    setLocationState({
      location: getCurrentLocation(),
      prevLocation: prev,
      pendingLocation: null,
      navigationIntent: null,
      phase: "idle",
    });
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
      const target = getLocation(href);
      //? A replace within one route rewrites the entry it is on, so the page on screen stays mounted.
      const toLocation =
        kind === "replace" && target.pathRoute.path === fromLocation.pathRoute.path
          ? { ...target, entryId: fromLocation.entryId }
          : target;
      const scrollTop = pageContentRef.current?.scrollTop ?? 0;
      const usePendingNavigation =
        CsrStack.keyOf(toLocation) !== CsrStack.keyOf(fromLocation) &&
        shouldPrepareFrameTransition(href) &&
        toLocation.pathRoute.pageState.transition !== "none";

      if (!usePendingNavigation) {
        setHistoryForward({ type: kind, location: toLocation, scrollTop, scrollToTop });
        settle(kind === "replace" ? prevLocation : fromLocation);
        if (kind === "push") window.history.pushState({ akanEntryId: toLocation.entryId }, "", href);
        else window.history.replaceState({ akanEntryId: toLocation.entryId }, "", href);
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
        if (kind === "push") window.history.pushState({ akanEntryId: toLocation.entryId }, "", href);
        else window.history.replaceState({ akanEntryId: toLocation.entryId }, "", href);
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
    window.history.replaceState({ ...(window.history.state ?? {}), akanEntryId: getCurrentLocation().entryId }, "");
    return () => debugFrame("csr.unmount", { lastPath: resolvedLocation.pathRoute.path });
  }, []);
  const getRouter = useCallback((): RouterInstance => {
    const forward =
      (kind: "push" | "replace") =>
      (href: string, { scrollToTop }: RouteOptions = {}) => {
        const location = getCurrentLocation();
        debugFrame(`router.${kind}`, { from: location.href, to: href, scrollToTop });
        if (location.href === href) {
          if (!pageContentRef.current) return;
          pageContentRef.current.scrollTop = getScrollTop(location);
          return;
        }
        runForwardNavigation(kind, href, { scrollToTop });
      };
    const router: RouterInstance = {
      push: forward("push"),
      replace: forward("replace"),
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
        settle(getPrevLocation());
        broadcastSyncNavigation("back", getSyncRouteHref(targetLocation));
        window.history.back();
      },
    };
    window.onpopstate = async (event) => {
      const href = window.location.href.replace(window.location.origin, "");
      const entryId = (window.history.state as { akanEntryId?: string } | null)?.akanEntryId;
      const isAt = (target: Location | null | undefined) =>
        !!target && (entryId ? target.entryId === entryId : target.href === href);
      const routeType = isAt(getNextLocation()) ? "forward" : isAt(getPrevLocation()) ? "back" : null;
      const scrollTop = pageContentRef.current?.scrollTop ?? 0;
      //? Safari's own swipe back has already slid the page away; playing ours as well would show the back twice.
      const isUaAnimated =
        (event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition === true;
      debugFrame("router.popstate", { href, routeType, scrollTop });
      if (!routeType) {
        const target = history.current.locations.findIndex((candidate) => isAt(candidate));
        if (target === history.current.idx) return;
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
      if (routeType === "forward") {
        if (shouldPrepareFrameTransition(href)) await startFrameTransition();
        const location = getCurrentLocation();
        setHistoryForward({ type: "popForward", location, scrollTop });
        settle(location);
        broadcastSyncNavigation("pop", getSyncRouteHref(getLocation(href)));
      } else {
        const location = getCurrentLocation();
        if (shouldPrepareFrameTransition(href)) await startFrameTransition();
        if (!isUaAnimated) await onBack.current[location.pathRoute.pageState.transition]?.();
        setHistoryBack({ type: "popBack", location, scrollTop });
        settle(getPrevLocation());
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
  const nativeNavigation = useRef<NativeNavigation | null>(null);
  const nativeBackStateRef = useRef({
    path: resolvedLocation.pathRoute.path,
    keyboardHeight: keyboardFrame.height,
    keyboardVisible: keyboardFrame.visible,
    router,
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
      router,
    };
    nativeNavigation.current?.syncBack();
  }, [keyboardFrame.height, keyboardFrame.visible, resolvedLocation.pathRoute.path, router]);

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

  return {
    ...routeState,
    ...csrTransition,
    page,
  } satisfies CsrContextType;
};
