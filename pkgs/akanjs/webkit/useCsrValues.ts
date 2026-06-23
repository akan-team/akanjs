"use client";
import { useSpringValue } from "@react-spring/web";
import { useDrag } from "@use-gesture/react";
import {
  type CsrContextType,
  type CsrTransitionStyles,
  Device,
  defaultPageState,
  type FrameSlotRegistration,
  type LocationState,
  type PageConfig,
  type PathRoute,
  type RouteGuide,
  type RouteOptions,
  type RouterInstance,
  type RouteState,
  router,
  type TransitionType,
  type UseCsrTransition,
} from "akanjs/client";
import { loadCapacitorApp } from "akanjs/client/capacitor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHistory } from "./useHistory";
import { useLocation } from "./useLocation";

const linearEasing = (t: number) => t;

type FrameSlotMap = Record<string, Record<string, FrameSlotRegistration>>;

const clonePageState = (pageState: PathRoute["pageState"]): PathRoute["pageState"] => ({ ...pageState });

const resolveFrameSlotHeight = (slot: FrameSlotRegistration) => slot.height ?? slot.estimatedHeight ?? 0;

const getBottomInsetTop = (clientHeight: number, pageState: PathRoute["pageState"]) =>
  clientHeight - pageState.bottomInset - pageState.bottomSafeArea;

const getFrameContentOffset = (ownTop: number, prevTop: number, pageTop: number, progress: number) =>
  ownTop - (prevTop + (pageTop - prevTop) * progress);

function getLatestPageConfigValue<Key extends keyof PageConfig>(pathRoute: PathRoute, key: Key) {
  for (const config of [...(pathRoute.pageConfigChain ?? [])].reverse()) {
    const value = config[key];
    if (value !== undefined) return value;
  }
}

const isInsetLockedByConfig = (pathRoute: PathRoute, key: "topInset" | "bottomInset") => {
  const value = getLatestPageConfigValue(pathRoute, key);
  return value === false || typeof value === "number";
};

const getLeafLayout = (pathRoute: PathRoute) => pathRoute.renderLayouts.at(-1);

function getFrameSlotsForPath(pathRoute: PathRoute, frameSlots: FrameSlotMap, pathRoutes: PathRoute[]) {
  const routeByPath = new Map(pathRoutes.map((route) => [route.path, route]));
  const targetLeafLayout = getLeafLayout(pathRoute);
  return Object.entries(frameSlots).flatMap(([sourcePath, slotsById]) => {
    const sourceRoute = routeByPath.get(sourcePath);
    const slots = Object.values(slotsById);
    if (sourcePath === pathRoute.path) return slots;
    if (!sourceRoute || !targetLeafLayout || getLeafLayout(sourceRoute) !== targetLeafLayout) return [];
    return slots.filter((slot) => slot.scope === "layout");
  });
}

function applyFrameSlots(
  pathRoute: PathRoute,
  basePageState: PathRoute["pageState"],
  frameSlots: FrameSlotMap,
  pathRoutes: PathRoute[],
) {
  const slots = getFrameSlotsForPath(pathRoute, frameSlots, pathRoutes);
  if (slots.length === 0) return clonePageState(basePageState);
  const pageState = clonePageState(basePageState);
  if (!isInsetLockedByConfig(pathRoute, "topInset")) {
    const topInset = Math.max(
      pageState.topInset,
      ...slots.filter((slot) => slot.type === "topInset").map(resolveFrameSlotHeight),
    );
    pageState.topInset = topInset;
  }
  if (!isInsetLockedByConfig(pathRoute, "bottomInset")) {
    const bottomInset = Math.max(
      pageState.bottomInset,
      ...slots.filter((slot) => slot.type === "bottomInset").map(resolveFrameSlotHeight),
    );
    pageState.bottomInset = bottomInset;
  }
  const explicit = pathRoute.explicitPageConfigKeys ?? {};
  if (!explicit.cache && slots.some((slot) => slot.cache)) pageState.cache = true;
  return pageState;
}

const useNoneTrans = ({ clientHeight, location, prevLocation }: RouteState): UseCsrTransition => {
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
      containerStyle: {},
      contentStyle: {
        paddingTop: pageState.topSafeArea + pageState.topInset,
        paddingBottom: pageState.bottomInset + pageState.bottomSafeArea,
        height: clientHeight,
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

const useFadeTrans = ({ clientHeight, location, prevLocation, onBack, history }: RouteState): UseCsrTransition => {
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
        paddingBottom: pageState.bottomInset + pageState.bottomSafeArea,
        opacity: transUnit,
        height: clientHeight,
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

const useScaleOutTrans = ({ clientHeight, location, prevLocation, onBack, history }: RouteState): UseCsrTransition => {
  const transDirection = "none";
  const transUnit = useSpringValue(1, { config: { clamp: true } });
  const transUnitRange = useMemo(() => [0, 1], []);
  const transProgress = transUnit.to((unit) => unit);
  const transPercent = transUnit.to([0, 1], [0, 100], "clamp");
  const pageState = location.pathRoute.pageState;
  const prevPageState = prevLocation?.pathRoute.pageState ?? defaultPageState;

  useEffect(() => {
    onBack.current.scaleOut = async () => {
      await transUnit.start(transUnitRange[0]);
    };
  }, []);
  useEffect(() => {
    if (history.current.type === "forward") {
      void transUnit.start(transUnitRange[0], { immediate: true });
      void transUnit.start(transUnitRange[1], { config: { duration: 180 } });
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
        transform: transProgress.to((progress) => `scale(${0.96 + progress * 0.04})`),
      },
      contentStyle: {
        paddingTop: pageState.topSafeArea + pageState.topInset,
        paddingBottom: pageState.bottomInset + pageState.bottomSafeArea,
        opacity: transProgress,
        height: clientHeight,
      },
    },
    prevPage: {
      containerStyle: {
        transform: transProgress.to((progress) => `scale(${1 - progress * 0.04})`),
      },
      contentStyle: {
        paddingTop: prevPageState.topSafeArea + prevPageState.topInset,
        paddingBottom: prevPageState.bottomInset + prevPageState.bottomSafeArea,
        opacity: transProgress.to((progress) => 1 - progress / 2),
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

const useStackTrans = ({
  clientWidth,
  clientHeight,
  location,
  prevLocation,
  history,
  onBack,
}: RouteState): UseCsrTransition => {
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
  useEffect(() => {
    onBack.current.stack = async () => {
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

  const pageBind = useDrag(
    ({ first, down, last, movement: [mx], initial: [ix], cancel }) => {
      if (first) void Device.getDevice().hideKeyboard();
      if (ix > initThreshold) {
        cancel();
        return;
      }
      if (mx < transUnitRange[1]) void transUnit.start(transUnitRange[1], { immediate: true });
      else if (mx > transUnitRange[0]) void transUnit.start(transUnitRange[0], { immediate: true });
      else if (!last) void transUnit.start(mx, { immediate: true });
      else if (mx < threshold) void transUnit.start(transUnitRange[1]);
      if (last && mx > threshold) router.back();
    },
    { axis: "x", filterTaps: true },
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
        paddingBottom: pageState.bottomInset + pageState.bottomSafeArea,
        translateX: transUnit,
        height: clientHeight,
      },
    },
    prevPage: {
      containerStyle: {
        paddingTop: prevPageState.topSafeArea + prevPageState.topInset,
        translateX: transUnit.to((unit) => (unit - clientWidth) / 5),
      },
      contentStyle: {
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
    pageClassName,
    transDirection,
    transUnitRange,
    transUnit,
    transPercent,
    transProgress,
  };
  return useCsrTransition;
};

const useBottomUpTrans = ({
  clientWidth,
  clientHeight,
  history,
  location,
  prevLocation,
  onBack,
}: RouteState): UseCsrTransition => {
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
      if (last && my > threshold) router.back();
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
        paddingBottom: pageState.bottomInset + pageState.bottomSafeArea,
        translateY: transUnit,
        height: clientHeight,
      },
    },
    prevPage: {
      containerStyle: {
        paddingTop: prevPageState.topSafeArea + prevPageState.topInset,
        translateY: 0,
      },
      contentStyle: {
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
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [frameSlots, setFrameSlots] = useState<FrameSlotMap>({});
  const frameSlotId = useRef(0);
  const basePageStateMap = useRef(new WeakMap<PathRoute, PathRoute["pageState"]>());
  const topSafeAreaRef = useRef<HTMLDivElement>(null);
  const bottomSafeAreaRef = useRef<HTMLDivElement>(null);
  const pageContentRef = useRef<HTMLDivElement>(null);
  const prevPageContentRef = useRef<HTMLDivElement>(null);
  const onBack = useRef<{ [K in TransitionType]?: () => Promise<void> }>({});
  const frameRootRef = useRef<HTMLDivElement>(null);

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
  const [{ location, prevLocation }, setLocationState] = useState<LocationState>({
    location: getCurrentLocation(),
    prevLocation: getPrevLocation(),
  });
  const registerFrameSlot = useCallback((path: string, slot: FrameSlotRegistration) => {
    const id = `${slot.source ?? slot.type}-${frameSlotId.current++}`;
    setFrameSlots((prev) => ({
      ...prev,
      [path]: {
        ...(prev[path] ?? {}),
        [id]: slot,
      },
    }));
    return () => {
      setFrameSlots((prev) => {
        const pathSlots = prev[path];
        if (!pathSlots?.[id]) return prev;
        const nextPathSlots = { ...pathSlots };
        delete nextPathSlots[id];
        const next = { ...prev };
        if (Object.keys(nextPathSlots).length > 0) next[path] = nextPathSlots;
        else delete next[path];
        return next;
      });
    };
  }, []);
  const getRouter = useCallback((): RouterInstance => {
    const router: RouterInstance = {
      push: (href: string, { scrollToTop }: RouteOptions = {}) => {
        const location = getCurrentLocation();
        if (location.href === href) {
          if (!pageContentRef.current) return;
          pageContentRef.current.scrollTop = getScrollTop(location);
          return;
        }
        const scrollTop = pageContentRef.current?.scrollTop ?? 0;
        setHistoryForward({ type: "push", location: getLocation(href), scrollTop, scrollToTop });
        setLocationState({ location: getCurrentLocation(), prevLocation: location });
        window.history.pushState({}, "", href);
      },
      replace: (href: string, { scrollToTop }: RouteOptions = {}) => {
        const location = getCurrentLocation();
        if (location.href === href) {
          if (!pageContentRef.current) return;
          pageContentRef.current.scrollTop = getScrollTop(location);
          return;
        }
        const scrollTop = pageContentRef.current?.scrollTop ?? 0;
        setHistoryForward({ type: "replace", location: getLocation(href), scrollTop, scrollToTop });
        setLocationState({ location: getCurrentLocation(), prevLocation });
        window.history.replaceState({}, "", href);
      },
      refresh: () => {
        window.location.reload();
      },
      back: async ({ scrollToTop }: RouteOptions = {}) => {
        if (!getPrevLocation()) return;
        const location = getCurrentLocation();
        await onBack.current[location.pathRoute.pageState.transition]?.();
        const scrollTop = pageContentRef.current?.scrollTop ?? 0;
        setHistoryBack({ type: "back", location, scrollTop, scrollToTop });
        setLocationState({ location: getCurrentLocation(), prevLocation: getPrevLocation() });
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
      if (!routeType) return;
      if (routeType === "forward") {
        const location = getCurrentLocation();
        setHistoryForward({ type: "popForward", location, scrollTop });
        setLocationState({ location: getCurrentLocation(), prevLocation: location });
      } else {
        // back
        const location = getCurrentLocation();
        await onBack.current[location.pathRoute.pageState.transition]?.();
        setHistoryBack({ type: "popBack", location, scrollTop });
        setLocationState({ location: getCurrentLocation(), prevLocation: getPrevLocation() });
      }
    };
    return router;
  }, [location]);
  const router = getRouter();
  for (const pathRoute of pathRoutes) {
    if (!basePageStateMap.current.has(pathRoute)) basePageStateMap.current.set(pathRoute, clonePageState(pathRoute.pageState));
    const basePageState = basePageStateMap.current.get(pathRoute) ?? defaultPageState;
    pathRoute.pageState = applyFrameSlots(pathRoute, basePageState, frameSlots, pathRoutes);
  }
  const routeState: RouteState = {
    clientWidth: viewport.width,
    clientHeight: viewport.height,
    location,
    prevLocation,
    history,
    topSafeAreaRef,
    bottomSafeAreaRef,
    prevPageContentRef,
    pageContentRef,
    frameRootRef,
    onBack,
    router,
    pathRoutes,
    registerFrameSlot,
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

  useEffect(() => {
    if (pageContentRef.current) pageContentRef.current.scrollTop = getScrollTop(location);
    if (prevPageContentRef.current)
      prevPageContentRef.current.scrollTop = prevLocation ? getScrollTop(prevLocation) : 0;
  }, [location.href]);

  useEffect(() => {
    const updateViewport = () => {
      const visualViewport = window.visualViewport;
      setViewport({
        width: Math.round(visualViewport?.width ?? window.innerWidth),
        height: Math.round(visualViewport?.height ?? window.innerHeight),
      });
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
    };
  }, []);

  useEffect(() => {
    if (Device.getDevice().info.platform === "web") return;
    let removeListener: (() => void) | undefined;
    let disposed = false;

    void loadCapacitorApp().then(({ App }) => {
      const listener = App.addListener("backButton", () => {
        if (history.current.idx > 0) {
          router.back();
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
    ...useCsrTransitionMap[location.pathRoute.pageState.transition],
  } satisfies CsrContextType;
};
