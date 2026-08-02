"use client";
import {
  Device,
  debugFrame,
  defaultPageState,
  type FrameLayoutState,
  type FramePlatformProfile,
  type FrameSlotRegistration,
  type FrameSnapshot,
  type KeyboardAccessoryFrameState,
  type KeyboardFrameState,
  type Location,
  type NavigationIntent,
  type PageState,
  type PathRoute,
  type TransitionAction,
  type TransitionPlan,
  type TransitionType,
} from "akanjs/client";
import { st } from "akanjs/store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type FrameSlotMap = Record<string, Record<string, FrameSlotRegistration>>;
export type FrameSlotBucket = "active" | "pending";
export type FrameSlotMapByBucket = Record<FrameSlotBucket, FrameSlotMap>;
export const PENDING_FRAME_READY_TIMEOUT_MS = 80;
export const PENDING_FRAME_READY_MAX_TIMEOUT_MS = 120;
export const KEYBOARD_FALLBACK_ANIMATION_DURATION_MS = 285;

export const FRAME_Z_INDEX = {
  page: 10,
  previousPage: 0,
  cachedPage: -1,
  topChrome: 1000,
  bottomChrome: 1000,
  keyboard: 1100,
  overlay: 2000,
} as const satisfies FrameLayoutState["zIndex"];

export const clonePageState = (pageState: PageState): PageState => ({ ...pageState });

const resolveFrameSlotHeight = (slot: FrameSlotRegistration) => slot.height ?? slot.estimatedHeight ?? 0;

const isInsetLockedByConfig = (_pathRoute: PathRoute, _key: "topInset" | "bottomInset") => {
  // Inset reservation is an explicit route-level contract. Frame slots still
  // carry measured runtime details (notably keyboard accessory height), but
  // they no longer infer page chrome size when pageConfig omits the inset.
  return true;
};

const getLeafLayout = (pathRoute: PathRoute) => pathRoute.renderLayouts.at(-1);

function isSlotEligibleForTarget({
  sourcePath,
  targetPath,
  slot,
  visiblePaths,
}: {
  sourcePath: string;
  targetPath: string;
  slot: FrameSlotRegistration;
  visiblePaths: Set<string>;
}) {
  if (visiblePaths.has(sourcePath)) return true;
  if (sourcePath === targetPath && slot.scope === "layout" && slot.cache) return true;
  return slot.scope === "layout" && Boolean(slot.cache);
}

export function getFrameSlotsForPath(
  pathRoute: PathRoute,
  frameSlots: FrameSlotMap,
  pathRoutes: PathRoute[],
  visiblePaths: Set<string>,
) {
  const routeByPath = new Map(pathRoutes.map((route) => [route.path, route]));
  const targetLeafLayout = getLeafLayout(pathRoute);
  return Object.entries(frameSlots).flatMap(([sourcePath, slotsById]) => {
    const sourceRoute = routeByPath.get(sourcePath);
    const slots = Object.values(slotsById).filter((slot) =>
      isSlotEligibleForTarget({ sourcePath, targetPath: pathRoute.path, slot, visiblePaths }),
    );
    if (sourcePath === pathRoute.path) return slots;
    if (!sourceRoute || !targetLeafLayout || getLeafLayout(sourceRoute) !== targetLeafLayout) return [];
    return slots.filter((slot) => slot.scope === "layout");
  });
}

export function applyFrameSlots(
  pathRoute: PathRoute,
  basePageState: PageState,
  frameSlots: FrameSlotMap,
  pathRoutes: PathRoute[],
  visiblePaths: Set<string>,
) {
  const slots = getFrameSlotsForPath(pathRoute, frameSlots, pathRoutes, visiblePaths);
  if (slots.length === 0) return clonePageState(basePageState);
  const pageState = clonePageState(basePageState);
  if (!isInsetLockedByConfig(pathRoute, "topInset")) {
    pageState.topInset = Math.max(
      pageState.topInset,
      ...slots.filter((slot) => slot.type === "topInset").map(resolveFrameSlotHeight),
    );
  }
  if (!isInsetLockedByConfig(pathRoute, "bottomInset")) {
    pageState.bottomInset = Math.max(
      pageState.bottomInset,
      ...slots.filter((slot) => slot.type === "bottomInset").map(resolveFrameSlotHeight),
    );
  }
  const explicit = pathRoute.explicitPageConfigKeys ?? {};
  if (!explicit.cache && slots.some((slot) => slot.cache)) pageState.cache = true;
  return pageState;
}

const emptyFrameSlotMap = (): FrameSlotMap => ({});

export function useFrameSlots() {
  const [frameSlotsByBucket, setFrameSlotsByBucket] = useState<FrameSlotMapByBucket>({
    active: emptyFrameSlotMap(),
    pending: emptyFrameSlotMap(),
  });
  const frameSlotId = useRef(0);

  const registerFrameSlot = useCallback(
    (path: string, slot: FrameSlotRegistration, bucket: FrameSlotBucket = "active") => {
      const id = `${slot.source ?? slot.type}-${frameSlotId.current++}`;
      debugFrame("frameSlot.register", { path, id, bucket, slot });
      setFrameSlotsByBucket((prev) => ({
        ...prev,
        [bucket]: {
          ...prev[bucket],
          [path]: {
            ...(prev[bucket][path] ?? {}),
            [id]: slot,
          },
        },
      }));
      return () => {
        debugFrame("frameSlot.unregister", { path, id, bucket, type: slot.type, source: slot.source, role: slot.role });
        setFrameSlotsByBucket((prev) => {
          const pathSlots = prev[bucket][path];
          if (!pathSlots?.[id]) return prev;
          const nextPathSlots = { ...pathSlots };
          delete nextPathSlots[id];
          const nextBucket = { ...prev[bucket] };
          if (Object.keys(nextPathSlots).length > 0) nextBucket[path] = nextPathSlots;
          else delete nextBucket[path];
          const next = { ...prev, [bucket]: nextBucket };
          return next;
        });
      };
    },
    [],
  );

  const promotePendingSlots = useCallback(() => {
    setFrameSlotsByBucket((prev) => ({
      active: {
        ...prev.active,
        ...prev.pending,
      },
      pending: emptyFrameSlotMap(),
    }));
  }, []);
  const clearPendingSlots = useCallback(() => {
    setFrameSlotsByBucket((prev) => ({ ...prev, pending: emptyFrameSlotMap() }));
  }, []);

  return {
    frameSlots: frameSlotsByBucket.active,
    pendingFrameSlots: frameSlotsByBucket.pending,
    frameSlotsByBucket,
    registerFrameSlot,
    promotePendingSlots,
    clearPendingSlots,
  };
}

const getCurrentPlatform = () => {
  try {
    return Device.getDevice().info.platform;
  } catch {
    return "web";
  }
};

export function getFramePlatformProfile(): FramePlatformProfile {
  const platform = getCurrentPlatform();
  if (platform === "ios") return "ios";
  if (platform === "android") return "android";
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const hasCssSafeArea =
    typeof document !== "undefined" && typeof CSS !== "undefined" && CSS.supports("top: env(safe-area-inset-top)");
  return isStandalone || hasCssSafeArea ? "mobileWeb" : "web";
}

export function useFrameViewport() {
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    visualWidth: window.visualViewport?.width ?? window.innerWidth,
    visualHeight: window.visualViewport?.height ?? window.innerHeight,
    visualOffsetTop: window.visualViewport?.offsetTop ?? 0,
  }));

  const updateViewport = useCallback((reason = "viewport.change") => {
    const visualViewport = window.visualViewport;
    const platform = getCurrentPlatform();
    const nextViewport = {
      width: Math.round(visualViewport?.width ?? window.innerWidth),
      height: Math.round(platform === "ios" ? window.innerHeight : (visualViewport?.height ?? window.innerHeight)),
      visualWidth: Math.round(visualViewport?.width ?? window.innerWidth),
      visualHeight: Math.round(visualViewport?.height ?? window.innerHeight),
      visualOffsetTop: Math.round(visualViewport?.offsetTop ?? 0),
    };
    setViewport((prev) => {
      if (
        prev.width === nextViewport.width &&
        prev.height === nextViewport.height &&
        prev.visualWidth === nextViewport.visualWidth &&
        prev.visualHeight === nextViewport.visualHeight &&
        prev.visualOffsetTop === nextViewport.visualOffsetTop
      )
        return prev;
      debugFrame(reason, { from: prev, to: nextViewport, platform });
      return nextViewport;
    });
  }, []);

  useEffect(() => {
    updateViewport("viewport.init");
    const onResize = () => updateViewport("viewport.change");
    const onOrientationChange = () => updateViewport("viewport.orientation");
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientationChange);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientationChange);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [updateViewport]);

  return { viewport, updateViewport };
}

const isKeyboardAccessorySlot = (slot: FrameSlotRegistration) => slot.role === "keyboardAccessory";

export function getKeyboardAccessorySlots(path: string, frameSlots: FrameSlotMap) {
  return Object.values(frameSlots[path] ?? {}).filter(isKeyboardAccessorySlot);
}

export function resolveKeyboardAccessoryHeight(path: string, frameSlots: FrameSlotMap) {
  return Math.max(0, ...getKeyboardAccessorySlots(path, frameSlots).map(resolveFrameSlotHeight));
}

export function hasKeyboardStickySlot(path: string, frameSlots: FrameSlotMap) {
  return getKeyboardAccessorySlots(path, frameSlots).length > 0;
}

export function resolveKeyboardFrame({
  keyboardHeight,
  bottomSafeArea,
  visualViewportKeyboardHeight,
  platformProfile,
  sticky,
  freeze,
}: {
  keyboardHeight: number;
  bottomSafeArea: number;
  visualViewportKeyboardHeight: number;
  platformProfile: FramePlatformProfile;
  sticky: boolean;
  freeze?: boolean;
}): KeyboardFrameState {
  const visualFallbackHeight =
    keyboardHeight <= 0 && visualViewportKeyboardHeight > 0 ? visualViewportKeyboardHeight : 0;
  const effectiveKeyboardHeight = keyboardHeight > 0 ? keyboardHeight : visualFallbackHeight;
  const source = keyboardHeight > 0 ? "native" : visualFallbackHeight > 0 ? "visualViewport" : "fallback";
  const visualCompensation =
    platformProfile === "ios" ? 0 : Math.min(visualViewportKeyboardHeight, effectiveKeyboardHeight);
  const offset = sticky && !freeze ? Math.max(0, effectiveKeyboardHeight - visualCompensation) : 0;
  return {
    height: effectiveKeyboardHeight,
    offset,
    visible: effectiveKeyboardHeight > 0 && !freeze,
    sticky,
    frozen: freeze,
    source,
    animationDuration: KEYBOARD_FALLBACK_ANIMATION_DURATION_MS,
    animationEasing: "ease-out",
  };
}

export function resolveKeyboardLayout({
  viewport,
  keyboard,
  accessoryHeight,
  bottomSafeArea,
}: {
  viewport: FrameLayoutState["viewport"];
  keyboard: KeyboardFrameState;
  accessoryHeight: number;
  bottomSafeArea: number;
}): Pick<FrameLayoutState, "contentViewport" | "keyboardAccessory"> {
  const resolvedAccessoryHeight = keyboard.sticky ? accessoryHeight : 0;
  const accessoryBottom = keyboard.visible
    ? Math.max(0, viewport.height - keyboard.offset)
    : Math.max(0, viewport.height - bottomSafeArea);
  const accessoryTop = Math.max(0, accessoryBottom - resolvedAccessoryHeight);
  const keyboardAccessory: KeyboardAccessoryFrameState = {
    top: accessoryTop,
    bottom: accessoryBottom,
    height: resolvedAccessoryHeight,
    visible: keyboard.sticky && resolvedAccessoryHeight > 0,
    slotHeight: accessoryHeight,
  };
  const contentBottom = keyboard.sticky ? keyboardAccessory.top : viewport.height;
  if (keyboard.sticky && accessoryHeight <= 0) {
    debugFrame("keyboard.accessoryLayout", {
      reason: "missing-accessory-height",
      viewport,
      keyboard,
      accessoryHeight,
    });
  }
  return {
    contentViewport: {
      top: 0,
      bottom: contentBottom,
      height: Math.max(0, contentBottom),
    },
    keyboardAccessory,
  };
}

export function useKeyboardFrame({
  bottomSafeArea,
  sticky,
  viewport,
  platformProfile,
  freeze,
}: {
  bottomSafeArea: number;
  sticky: boolean;
  viewport: { visualHeight: number; visualOffsetTop: number };
  platformProfile: FramePlatformProfile;
  freeze?: boolean;
}) {
  const keyboardHeight = st.use.keyboardHeight();
  const visualViewportKeyboardHeight = Math.max(
    0,
    Math.round(window.innerHeight - viewport.visualHeight - viewport.visualOffsetTop),
  );
  return useMemo(
    () =>
      resolveKeyboardFrame({
        keyboardHeight,
        bottomSafeArea,
        visualViewportKeyboardHeight,
        platformProfile,
        sticky,
        freeze,
      }),
    [keyboardHeight, bottomSafeArea, visualViewportKeyboardHeight, platformProfile, sticky, freeze],
  );
}

export function resolveFramePageStateMap({
  pathRoutes,
  frameSlots,
  pendingFrameSlots,
  pendingPath,
  visiblePaths,
  basePageStateMap,
}: {
  pathRoutes: PathRoute[];
  frameSlots: FrameSlotMap;
  pendingFrameSlots?: FrameSlotMap;
  pendingPath?: string | null;
  visiblePaths: string[];
  basePageStateMap: WeakMap<PathRoute, PageState>;
}) {
  const pageStateByPath = new Map<string, PageState>();
  const visiblePathSet = new Set(visiblePaths);
  for (const pathRoute of pathRoutes) {
    if (!basePageStateMap.has(pathRoute)) basePageStateMap.set(pathRoute, clonePageState(pathRoute.pageState));
    const basePageState = basePageStateMap.get(pathRoute) ?? defaultPageState;
    const activeState = applyFrameSlots(pathRoute, basePageState, frameSlots, pathRoutes, visiblePathSet);
    const shouldApplyPending = pendingPath === pathRoute.path && pendingFrameSlots;
    pageStateByPath.set(
      pathRoute.path,
      shouldApplyPending
        ? applyFrameSlots(pathRoute, activeState, pendingFrameSlots, pathRoutes, new Set([pathRoute.path]))
        : activeState,
    );
  }
  return pageStateByPath;
}

export function resolvePathRoutesWithFrameState(pathRoutes: PathRoute[], pageStateByPath: Map<string, PageState>) {
  return pathRoutes.map((pathRoute) => ({
    ...pathRoute,
    pageState: pageStateByPath.get(pathRoute.path) ?? pathRoute.pageState,
  }));
}

export function resolveLocationWithFrameState(
  location: Location | null,
  resolvedPathRouteMap: Map<string, PathRoute>,
): Location | null {
  if (!location) return null;
  const pathRoute = resolvedPathRouteMap.get(location.pathRoute.path);
  return pathRoute ? { ...location, pathRoute } : location;
}

export function useFrameRuntimeResync({ updateViewport }: { updateViewport: (reason?: string) => void }) {
  useEffect(() => {
    const resync = (reason: string) => {
      debugFrame("frameRuntime.resync", { reason, visibilityState: document.visibilityState });
      updateViewport("frameRuntime.viewportResync");
      if (document.visibilityState === "visible" && !(document.activeElement instanceof HTMLInputElement)) {
        st.do.setKeyboardHeight(0);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") resync("visibilitychange");
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resync("pageshow.persisted");
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [updateViewport]);
}

export function blurActiveElement() {
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement ||
    (activeElement instanceof HTMLElement && activeElement.isContentEditable)
  ) {
    activeElement.blur();
  }
}

export async function prepareForFrameTransition() {
  blurActiveElement();
  try {
    await Device.getDevice().hideKeyboard();
  } catch {
    // Device may not be loaded in web/test environments.
  }
  st.do.setKeyboardHeight(0);
}

export function getFrameSlotsForSnapshot(path: string, frameSlots: FrameSlotMap) {
  return Object.values(frameSlots[path] ?? {});
}

export function isPendingFrameReady({
  path,
  pendingFrameSlots,
  elapsedMs,
}: {
  path: string;
  pendingFrameSlots: FrameSlotMap;
  elapsedMs: number;
}) {
  const slots = getFrameSlotsForSnapshot(path, pendingFrameSlots);
  if (slots.length === 0) return elapsedMs >= PENDING_FRAME_READY_TIMEOUT_MS;
  if (slots.every((slot) => (slot.height ?? slot.estimatedHeight ?? 0) > 0)) return true;
  return elapsedMs >= PENDING_FRAME_READY_MAX_TIMEOUT_MS;
}

export function createFrameSnapshot({
  location,
  pageState,
  viewport,
  frameSlots,
}: {
  location: Location;
  pageState: PageState;
  viewport: FrameLayoutState["viewport"];
  frameSlots: FrameSlotRegistration[];
}): FrameSnapshot {
  return {
    location,
    pageState,
    viewport,
    frameSlots,
    measuredAt: Date.now(),
  };
}

const getTransitionDuration = (type: TransitionType) => {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return 1;
  if (type === "bottomUp") return 220;
  if (type === "scaleOut") return 220;
  if (type === "fade" || type === "stack") return 150;
  return 0;
};

export function createTransitionPlan({
  id,
  intent,
  type,
  direction,
  fromFrame,
  toFrame,
}: {
  id: number;
  intent: NavigationIntent;
  type: TransitionType;
  direction: "forward" | "back";
  fromFrame: FrameSnapshot;
  toFrame: FrameSnapshot;
}): TransitionPlan {
  const actions: TransitionAction[] = [
    { type: "safeArea", run: () => undefined },
    { type: "topChrome", run: () => undefined },
    { type: "bottomChrome", run: () => undefined },
    { type: "keyboard", run: () => undefined },
    { type: "page", run: () => undefined },
  ];
  return {
    id,
    intent,
    type,
    direction,
    fromFrame,
    toFrame,
    actions,
    duration: getTransitionDuration(type),
  };
}
