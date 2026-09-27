"use client";
import { AkanNativeError, loadGeolocation, opener } from "akanjs/client/native";

/** `getPosition` opens the app settings instead of resolving when location permission is denied. */
export const useGeoLocation = () => {
  const checkPermission = async () => {
    const { geolocation } = await loadGeolocation();
    return await geolocation.requestPermission();
  };

  const getPosition = async (options: { enableHighAccuracy?: boolean } = {}) => {
    const { geolocation } = await loadGeolocation();
    try {
      return await geolocation.getCurrentPosition(options);
    } catch (error) {
      if (AkanNativeError.from(error).code !== "PERMISSION_DENIED") throw error;
      await opener.openSettings().catch(() => undefined);
    }
  };

  return { checkPermission, getPosition };
};
