import type { AkanNativeContext, AkanPlugin } from "akanjs";

const configureLocationNative = async (ctx: AkanNativeContext) => {
  await ctx.setIosUsageDescriptions({
    locationAlwaysUsageDescription: "$(PRODUCT_NAME) requires access to the location to get the user's location.",
    locationWhenInUseUsageDescription: "$(PRODUCT_NAME) requires access to the location to get the user's location.",
  });
  ctx.addAndroidPermissions(["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"]);
  ctx.addAndroidFeatures(["android.hardware.location.gps"]);
};

export const locationPlugin: AkanPlugin = {
  name: "location",
  runtimePackages: (ctx) => (ctx.hasMobilePermission("location") ? ["@capacitor/geolocation"] : []),
  capacitor: {
    permission: "location",
    configureNative: configureLocationNative,
  },
};
