"use client";
import type { History, Location } from "akanjs/client";
import { useCallback, useRef } from "react";

interface setForwardOptions {
  type: "push" | "replace" | "popForward";
  location: Location;
  scrollTop?: number;
  scrollToTop?: boolean;
}

interface setBackOptions {
  type: "back" | "popBack";
  location: Location;
  scrollTop?: number;
  scrollToTop?: boolean;
}

export const useHistory = (locations: Location[] = []) => {
  const history = useRef<History>({
    type: "initial",
    locations,
    scrollMap: new Map(locations.map((location) => [location.href, 0])),
    idxMap: new Map(locations.map((location, idx) => [location.href, idx])),
    //? The page a session opens on is cached like any page reached later; left out, it unmounts two steps away.
    cachedLocationMap: new Map(
      locations
        .filter((location) => location.pathRoute.pageState.cache)
        .map((location) => [location.pathRoute.path, location]),
    ),
    idx: 0,
  });
  const setHistoryForward = useCallback(({ type, location, scrollTop = 0, scrollToTop = false }: setForwardOptions) => {
    const currentLocation = history.current.locations[history.current.idx] as Location | undefined;
    if (currentLocation) history.current.scrollMap.set(currentLocation.href, scrollTop);
    if (scrollToTop) history.current.scrollMap.set(location.href, 0);
    history.current.type = "forward";
    history.current.idxMap.set(location.href, history.current.idx);
    if (type === "push")
      history.current.locations = [...history.current.locations.slice(0, history.current.idx + 1), location];
    else if (type === "replace")
      history.current.locations = [...history.current.locations.slice(0, history.current.idx), location];
    if (location.pathRoute.pageState.cache) history.current.cachedLocationMap.set(location.pathRoute.path, location);
    if (type === "push" || type === "popForward") history.current.idx++;
  }, []);
  const setHistoryBack = useCallback(({ location, scrollTop = 0, scrollToTop = false }: setBackOptions) => {
    const prevLocation = history.current.locations[history.current.idx - 1] as Location | undefined;
    if (prevLocation && scrollToTop) history.current.scrollMap.set(prevLocation.href, 0);
    history.current.type = "back";
    history.current.scrollMap.set(location.href, scrollTop);
    history.current.idxMap.set(location.href, history.current.idx);
    if (location.pathRoute.pageState.cache) history.current.cachedLocationMap.set(location.pathRoute.path, location);
    history.current.idx--;
  }, []);
  const getNextLocation = useCallback(() => {
    return (history.current.locations[history.current.idx + 1] ?? null) as Location | null;
  }, []);
  const getCurrentLocation = useCallback(() => {
    return history.current.locations[history.current.idx];
  }, []);
  const getPrevLocation = useCallback(() => {
    return (history.current.locations[history.current.idx - 1] ?? null) as Location | null;
  }, []);
  const getScrollTop = useCallback((location: Location) => {
    if (location.hash) {
      const element = window.document.getElementById(location.hash);
      return element?.offsetTop ?? 0;
    }
    return history.current.scrollMap.get(location.href) ?? 0;
  }, []);

  return {
    history,
    setHistoryForward,
    setHistoryBack,
    getNextLocation,
    getCurrentLocation,
    getPrevLocation,
    getScrollTop,
  };
};
