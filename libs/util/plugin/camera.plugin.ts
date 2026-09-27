import type { AkanPlugin } from "akanjs";

export const cameraPlugin: AkanPlugin = {
  name: "camera",
  native: {
    permission: "camera",
    plugins: ["camera"],
    usageDescriptions: {
      cameraUsageDescription: "$(PRODUCT_NAME) requires access to the camera to take photos.",
      photoAddUsageDescription: "$(PRODUCT_NAME) requires access to the photo library to take photos.",
      photoUsageDescription: "$(PRODUCT_NAME) requires access to the photo library to take photos.",
    },
  },
};
