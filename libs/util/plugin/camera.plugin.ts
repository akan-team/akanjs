import type { AkanNativeContext, AkanPlugin } from "akanjs";

const configureCameraNative = async (ctx: AkanNativeContext) => {
  await ctx.setIosUsageDescriptions({
    cameraUsageDescription: "$(PRODUCT_NAME) requires access to the camera to take photos.",
    photoAddUsageDescription: "$(PRODUCT_NAME) requires access to the photo library to take photos.",
    photoUsageDescription: "$(PRODUCT_NAME) requires access to the photo library to take photos.",
  });
  ctx.addAndroidPermissions(["READ_MEDIA_IMAGES", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE"]);
};

export const cameraPlugin: AkanPlugin = {
  name: "camera",
  runtimePackages: (ctx) => (ctx.hasMobilePermission("camera") ? ["@capacitor/camera"] : []),
  capacitor: {
    permission: "camera",
    configureNative: configureCameraNative,
  },
};
