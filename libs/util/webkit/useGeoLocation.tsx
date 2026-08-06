"use client";
import { loadCapacitorGeolocation } from "akanjs/client/capacitor";

/** Capacitor geolocation hook with permission checks and current position lookup. */
export const useGeoLocation = () => {
  const checkPermission = async (): Promise<{ geolocation: string; coarseLocation: string }> => {
    const { Geolocation } = await loadCapacitorGeolocation();
    const { location: geolocation, coarseLocation } = await Geolocation.requestPermissions();
    return { geolocation, coarseLocation };
  };

  const getPosition = async () => {
    const { geolocation, coarseLocation } = await checkPermission();
    if (geolocation === "denied" || coarseLocation === "denied") {
      location.assign("app-settings:");
      return;
    }
    const { Geolocation } = await loadCapacitorGeolocation();
    const coordinates = await Geolocation.getCurrentPosition();
    return coordinates;
  };

  return { checkPermission, getPosition };
};
