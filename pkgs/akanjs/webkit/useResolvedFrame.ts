"use client";
import type { PageState, PathRoute } from "akanjs/client";
import { useEffect, useMemo, useRef } from "react";
import { CsrStack } from "./CsrStack";
import { CsrFrameDump } from "./csrFrameDump";
import type { CsrLocationState } from "./useCsrLocationState";
import type { CsrRefs } from "./useCsrRefs";
import {
  resolveFramePageStateMap,
  resolveLocationWithFrameState,
  resolvePathRoutesWithFrameState,
  type useFrameSlots,
} from "./useFrameRuntime";

export const useResolvedFrame = ({
  pathRoutes,
  slots: { frameSlots, pendingFrameSlots },
  transitionPageStateSnapshot,
  refs: { pageStateByPathRef, basePageStateMap },
  nav: { history, location, prevLocation, pendingLocation, phase },
}: {
  pathRoutes: PathRoute[];
  slots: ReturnType<typeof useFrameSlots>;
  transitionPageStateSnapshot: Map<string, PageState> | null;
  refs: CsrRefs;
  nav: CsrLocationState;
}) => {
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
  return {
    latestPageStateByPath,
    latestFrameSlots,
    latestPendingFrameSlots,
    effectivePageStateByPath,
    resolvedPathRoutes,
    resolvedLocation,
    resolvedPrevLocation,
    resolvedPendingLocation,
    stackEntries,
  };
};

export type ResolvedFrame = ReturnType<typeof useResolvedFrame>;
