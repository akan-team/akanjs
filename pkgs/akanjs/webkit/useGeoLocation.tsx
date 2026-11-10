"use client";

//? Loaded on first use: a static import puts @akanjs/native/core on every web page that renders this hook.
const loadGeolocation = () => import("akanjs/client/native/geolocation");

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
      const { AkanNativeError } = await import("./nativeCore");
      if (AkanNativeError.from(error).code !== "PERMISSION_DENIED") throw error;
      const { opener } = await import("akanjs/client/native/opener");
      await opener.openSettings().catch(() => undefined);
    }
  };

  return { checkPermission, getPosition };
};
