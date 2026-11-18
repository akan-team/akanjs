"use client";
import { useSpringValue } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";
import {
  router as clientRouter,
  Device,
  defaultPageState,
  type PathRoute,
  type RouteState,
  type TransitionType,
  type UseCsrTransition,
} from "akanjs/client";
import { clamp } from "akanjs/common";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { CsrSlide, type CsrSlideFrame } from "./csrSlide";
import { isDragLift } from "./isDragLift";
import { scrollerTakesDrag } from "./scrollerTakesDrag";
import { STACK_TRANSITION_DURATION_MS } from "./useFrameRuntime";

const linearEasing = (t: number) => t;
//? CsrSlide.easing as a function, for a WebView without Web Animations.
const stackEasing = (t: number) => 1 - (1 - t) ** 4;

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

const getVelocityAwareDuration = (distance: number, velocity: number, fallback: number) => {
  const absVelocity = Math.abs(velocity);
  if (absVelocity <= 0.01) return fallback;
  return clamp(Math.round(Math.abs(distance) / absVelocity), STACK_SETTLE_MIN_DURATION, STACK_SETTLE_MAX_DURATION);
};

type Progress = UseCsrTransition["transProgress"];
type FramePageState = PathRoute["pageState"];

const tween = (progress: Progress, from: number, to: number) => progress.to([0, 1], [from, to]);
const fadeIn = (progress: Progress) => ({ opacity: progress.to((value) => value) });
const fadeOut = (progress: Progress) => ({ opacity: progress.to((value) => 1 - value) });

const chromePadding = (pageState: FramePageState, top: number, bottom: number) => ({
  paddingTop: pageState.overlay?.top ? 0 : top,
  paddingBottom: pageState.overlay?.bottom ? 0 : bottom,
  "--akan-overlay-top": `${pageState.overlay?.top ? top : 0}px`,
  "--akan-overlay-bottom": `${pageState.overlay?.bottom ? bottom : 0}px`,
});

//? Under a shell that left the keyboard to the page the box follows the root's --akan-keyboard-cover, which the shell's
//? event sets before any render; the keys cover the safe area and the bottom chrome, so that padding goes under them.
const keyboardRide = (frameLayout: RouteState["frameLayout"], paddingBottom: number | string) => ({
  ...(typeof paddingBottom === "number" && paddingBottom > 0
    ? { paddingBottom: `calc(${paddingBottom}px - min(${paddingBottom}px, var(--akan-keyboard-cover, 0px)))` }
    : {}),
  height: `calc(${frameLayout.viewport.height}px - var(--akan-keyboard-cover, 0px))`,
});

const pageContentStyle = ({ frameLayout }: RouteState, pageState: FramePageState) => {
  const padding = chromePadding(
    pageState,
    pageState.topSafeArea + pageState.topInset,
    Math.max(
      pageState.bottomSafeArea,
      pageState.bottomInset +
        pageState.bottomSafeArea -
        (frameLayout.keyboard.sticky ? frameLayout.keyboardAccessory.height : 0),
    ),
  );
  const rides = !!frameLayout.keyboard.avoidsContent && !frameLayout.keyboard.sticky;
  return {
    ...padding,
    height: frameLayout.contentViewport.height,
    ...(rides ? keyboardRide(frameLayout, padding.paddingBottom) : {}),
    "--akan-content-height": `${frameLayout.contentViewport.height}px`,
  };
};

const prevPageContentStyle = (clientHeight: number, prevPageState: FramePageState) => ({
  ...chromePadding(
    prevPageState,
    prevPageState.topSafeArea + prevPageState.topInset,
    prevPageState.bottomInset + prevPageState.bottomSafeArea,
  ),
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
      visibility:
        pageState.bottomInset > 0 || pageState.bottomSafeAreaColor !== defaultPageState.bottomSafeAreaColor
          ? ("visible" as const)
          : ("hidden" as const),
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
  //? Before paint: started from a passive effect, the incoming page showed one frame at rest before it slid in.
  useLayoutEffect(() => {
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
        paddingTop: prevPageState.overlay?.top ? 0 : prevPageState.topSafeArea + prevPageState.topInset,
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

const useStackSlide = (
  { transUnit, transUnitRange }: Pick<UseCsrTransition, "transUnit" | "transUnitRange">,
  { history, location, onBack }: RouteState,
  frame: CsrSlideFrame,
  backConfigRef: RefObject<{ duration: number } | null>,
) => {
  const slideRef = useRef<CsrSlide | null>(null);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const cancelSlide = useCallback(() => {
    slideRef.current?.cancel();
    slideRef.current = null;
  }, []);
  //? An interrupted slide hands where its page is to the spring, so a back or a drag goes on from there, not from rest.
  const holdSlide = useCallback(() => {
    const unit = slideRef.current?.unitNow() ?? null;
    cancelSlide();
    if (unit === null) return transUnit.get();
    void transUnit.start(unit, { immediate: true });
    return unit;
  }, []);
  useEffect(() => {
    onBack.current.stack = async () => {
      const config = backConfigRef.current;
      backConfigRef.current = null;
      const fromUnit = holdSlide();
      const share = Math.abs(transUnitRange[0] - fromUnit) / Math.max(1, transUnitRange[0]);
      const slide = CsrSlide.isCalm
        ? null
        : CsrSlide.play(frameRef.current, {
            fromUnit,
            toUnit: transUnitRange[0],
            duration: config?.duration ?? Math.max(120, STACK_TRANSITION_DURATION_MS * share),
            keep: true,
          });
      if (!slide) {
        await transUnit.start(transUnitRange[0], config ? { config } : undefined);
        return;
      }
      //? Kept at its end until the page under takes the screen, which cancels it; ended, the page would snap back.
      slideRef.current = slide;
      await slide.finished;
      await transUnit.start(transUnitRange[0], { immediate: true });
    };
  }, [transUnitRange]);
  useLayoutEffect(() => {
    cancelSlide();
    //? Every page runs this hook whatever its transition, and a slide moves the frame's parts itself rather than a
    //? spring only a stack page reads, so a page that does not slide in (a tab switched with `none`) must not start one.
    const isStack = frameRef.current.pageState.transition === "stack";
    if (history.current.type !== "forward" || CsrSlide.isCalm || !isStack) {
      void transUnit.start(transUnitRange[1], { immediate: true });
      return;
    }
    const slide = CsrSlide.play(frameRef.current, {
      fromUnit: transUnitRange[0],
      toUnit: transUnitRange[1],
      duration: STACK_TRANSITION_DURATION_MS,
    });
    if (slide) {
      slideRef.current = slide;
      void transUnit.start(transUnitRange[1], { immediate: true });
      return;
    }
    void transUnit.start(transUnitRange[0], { immediate: true });
    void transUnit.start(transUnitRange[1], {
      config: { duration: STACK_TRANSITION_DURATION_MS, easing: stackEasing },
    });
  }, [location.entryId ?? location.pathname]);
  return holdSlide;
};

const useStackTrans = (routeState: RouteState): UseCsrTransition => {
  const { clientWidth, clientHeight, location, prevLocation, pageContentRef } = routeState;
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
  const holdSlide = useStackSlide(
    spring,
    routeState,
    { width: clientWidth, height: clientHeight, pageState, prevPageState },
    stackBackConfigRef,
  );
  useEffect(() => unlockPageScroll, [unlockPageScroll]);
  const dragOriginRef = useRef(0);

  const pageBind = useDrag(
    ({ first, last, movement: [mx, my], velocity: [vx], direction: [dx], initial: [ix], cancel, event, target }) => {
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
        const isVertical = absY >= GESTURE_INTENT_THRESHOLD && absY > absX * GESTURE_AXIS_LOCK_RATIO;
        const isHorizontal = absX >= GESTURE_INTENT_THRESHOLD && absX > absY * GESTURE_AXIS_LOCK_RATIO;
        if (isVertical || (isHorizontal && scrollerTakesDrag(target, pageContentRef.current, "x", mx))) {
          gestureIntent.current = "scroll";
          void transUnit.start(transUnitRange[1], { immediate: true });
          cancel();
          return;
        }
        if (!isHorizontal) return;
        gestureIntent.current = "gesture";
        dragOriginRef.current = holdSlide();
        lockPageScroll();
        void Device.getDevice().hideKeyboard();
      }
      if (gestureIntent.current !== "gesture") {
        cancel();
        return;
      }
      if (event.cancelable) event.preventDefault();
      const unit = dragOriginRef.current + mx;
      if (unit < transUnitRange[1]) void transUnit.start(transUnitRange[1], { immediate: true });
      else if (unit > transUnitRange[0]) void transUnit.start(transUnitRange[0], { immediate: true });
      else if (!last) void transUnit.start(unit, { immediate: true });
      if (last) {
        const shouldComplete =
          isDragLift(event) && (unit > threshold || (dx > 0 && vx > STACK_VELOCITY_DISMISS_THRESHOLD));
        const target = shouldComplete ? transUnitRange[0] : transUnitRange[1];
        const duration = getVelocityAwareDuration(target - unit, vx, shouldComplete ? 150 : 180);
        if (shouldComplete) stackBackConfigRef.current = { duration };
        else void transUnit.start(transUnitRange[1], { config: { duration } });
        unlockPageScroll();
        gestureIntent.current = "pending";
        if (!shouldComplete) return;
        clientRouter.back();
        void clientRouter.navigation().catch(() => {
          stackBackConfigRef.current = null;
          holdSlide();
          void transUnit.start(transUnitRange[1], { config: { duration } });
        });
      }
    },
    //? Captured, the drag ends when the element under the finger leaves the DOM; the window keeps it to the lift.
    //? Touch, not pointer, events: a scroller that starts panning cancels the pointer but keeps sending touchmove.
    { filterTaps: true, pointer: { touch: true, capture: false }, eventOptions: { passive: false } },
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
  const { clientHeight, location, prevLocation, onBack, pageContentRef } = routeState;
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
  }, [transUnitRange]);
  usePlayOnForward(spring, routeState, { duration: 220, easing: linearEasing });

  const pageBind = useDrag(
    ({ first, last, movement: [, my], initial: [, iy], cancel, event, target }) => {
      if (iy > initThreshold || (first && scrollerTakesDrag(target, pageContentRef.current, "y", my))) {
        cancel();
        return;
      }
      if (event.cancelable) event.preventDefault();
      if (first) void Device.getDevice().hideKeyboard();
      if (my < transUnitRange[1]) void transUnit.start(transUnitRange[1], { immediate: true });
      else if (my > transUnitRange[0]) void transUnit.start(transUnitRange[0], { immediate: true });
      else if (!last) void transUnit.start(my, { immediate: true });
      if (!last) return;
      if (!isDragLift(event) || my <= threshold) {
        void transUnit.start(transUnitRange[1]);
        return;
      }
      clientRouter.back();
      void clientRouter.navigation().catch(() => transUnit.start(transUnitRange[1]));
    },
    {
      axis: "y",
      filterTaps: true,
      threshold: 10,
      pointer: { touch: true, capture: false },
      eventOptions: { passive: false },
    },
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

export const useCsrTransitions = (routeState: RouteState): { [key in TransitionType]: UseCsrTransition } => {
  const useNonTransition = useNoneTrans(routeState);
  const useFadeTransition = useFadeTrans(routeState);
  const useScaleOutTransition = useScaleOutTrans(routeState);
  const useStackTransition = useStackTrans(routeState);
  const useBottomUpTransition = useBottomUpTrans(routeState);
  return {
    none: useNonTransition,
    fade: useFadeTransition,
    stack: useStackTransition,
    bottomUp: useBottomUpTransition,
    scaleOut: useScaleOutTransition,
  };
};
