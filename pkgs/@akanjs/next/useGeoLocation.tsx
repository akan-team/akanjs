"use client";

export const useGeoLocation = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Geolocation } = require("@capacitor/geolocation") as typeof import("@capacitor/geolocation");
  const checkPermission = async () => {
    const { location: geolocation, coarseLocation } = await Geolocation.requestPermissions();
    return { geolocation, coarseLocation };
  };

  const getPosition = async () => {
    const { geolocation, coarseLocation } = await checkPermission();
    if (geolocation === "denied" || coarseLocation === "denied") {
      location.assign("app-settings:");
      return;
    }
    const coordinates = await Geolocation.getCurrentPosition();
    return coordinates;
  };

  return { checkPermission, getPosition };
};
