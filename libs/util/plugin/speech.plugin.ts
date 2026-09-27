import type { AkanPlugin } from "akanjs";

export const speechPlugin: AkanPlugin = {
  name: "speech",
  native: {
    permission: "speech",
    usageDescriptions: {
      speechRecognitionUsageDescription: "$(PRODUCT_NAME) requires speech recognition to take spoken requests.",
      microphoneUsageDescription: "$(PRODUCT_NAME) requires access to the microphone to hear spoken requests.",
    },
    androidPermissions: ["RECORD_AUDIO"],
  },
};
