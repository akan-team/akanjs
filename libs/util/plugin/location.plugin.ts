import type { AkanPlugin } from "akanjs";

export const locationPlugin: AkanPlugin = {
  name: "location",
  native: {
    permission: "location",
    plugins: ["geolocation"],
    usageDescriptions: {
      locationAlwaysUsageDescription: "$(PRODUCT_NAME) requires access to the location to get the user's location.",
      locationWhenInUseUsageDescription: "$(PRODUCT_NAME) requires access to the location to get the user's location.",
    },
  },
};
