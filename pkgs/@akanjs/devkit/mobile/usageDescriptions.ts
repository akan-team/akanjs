import { capitalize } from "akanjs/common";

//* Apple's Info.plist keys do not follow the description names (photo → NSPhotoLibrary…), so each one is spelled out.
const iosUsageDescriptionKeys = {
  cameraUsageDescription: ["NSCameraUsageDescription"],
  photoAddUsageDescription: ["NSPhotoLibraryAddUsageDescription"],
  photoUsageDescription: ["NSPhotoLibraryUsageDescription"],
  contactsUsageDescription: ["NSContactsUsageDescription"],
  //? iOS 11+ reads the AlwaysAndWhenInUse key; the Always key only serves iOS 10 and below.
  locationAlwaysUsageDescription: ["NSLocationAlwaysAndWhenInUseUsageDescription", "NSLocationAlwaysUsageDescription"],
  locationWhenInUseUsageDescription: ["NSLocationWhenInUseUsageDescription"],
  microphoneUsageDescription: ["NSMicrophoneUsageDescription"],
  speechRecognitionUsageDescription: ["NSSpeechRecognitionUsageDescription"],
} as const;

export const toIosInfoPlistUsageDescriptions = (descriptions: { [key: string]: string }) =>
  Object.fromEntries(
    Object.entries(descriptions).flatMap(([key, value]) => {
      const plistKeys: readonly string[] = Object.hasOwn(iosUsageDescriptionKeys, key)
        ? iosUsageDescriptionKeys[key as keyof typeof iosUsageDescriptionKeys]
        : [`NS${capitalize(key)}`];
      return plistKeys.map((plistKey) => [plistKey, value]);
    }),
  );
