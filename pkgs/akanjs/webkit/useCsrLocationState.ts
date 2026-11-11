"use client";
import { csrLocation, getAuthToken, type LocationState, type RouteGuide } from "akanjs/client";
import { useState } from "react";
import { CsrStack } from "./CsrStack";
import { useHistory } from "./useHistory";
import { useLocation } from "./useLocation";

export const useCsrLocationState = (rootRouteGuide: RouteGuide) => {
  const { getLocation } = useLocation({ rootRouteGuide });
  const [initialStack] = useState(() => {
    const current = getLocation(csrLocation.href);
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
  history.current.account ??= { token: getAuthToken() ?? null, generation: 0 };
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
  return {
    getLocation,
    history,
    setHistoryForward,
    setHistoryBack,
    setHistoryJump,
    getNextLocation,
    getCurrentLocation,
    getPrevLocation,
    getScrollTop,
    isBackgrounded,
    setIsBackgrounded,
    setLocationState,
    location,
    prevLocation,
    pendingLocation,
    navigationIntent,
    phase,
  };
};

export type CsrLocationState = ReturnType<typeof useCsrLocationState>;
