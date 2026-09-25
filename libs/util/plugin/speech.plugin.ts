import type { AkanNativeContext, AkanPlugin } from "akanjs";

const configureSpeechNative = async (ctx: AkanNativeContext) => {
  await ctx.setIosUsageDescriptions({
    speechRecognitionUsageDescription: "$(PRODUCT_NAME) requires speech recognition to take spoken requests.",
    microphoneUsageDescription: "$(PRODUCT_NAME) requires access to the microphone to hear spoken requests.",
  });
  ctx.addAndroidPermissions(["RECORD_AUDIO"]);
};

export const speechPlugin: AkanPlugin = {
  name: "speech",
  // A WebView has no SpeechRecognition of its own — neither Android's nor iOS's — so the native build carries
  // plugins where the browser build needs nothing at all.
  runtimePackages: (ctx) =>
    ctx.hasMobilePermission("speech")
      ? ["@capacitor-community/speech-recognition", "@capacitor-community/text-to-speech"]
      : [],
  capacitor: {
    permission: "speech",
    configureNative: configureSpeechNative,
  },
};
