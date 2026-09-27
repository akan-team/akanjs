import { describe, expect, test } from "bun:test";
import { toIosInfoPlistUsageDescriptions } from "./usageDescriptions";

describe("toIosInfoPlistUsageDescriptions", () => {
  test("writes Apple's real Info.plist keys, not NS + the description name", () => {
    expect(
      toIosInfoPlistUsageDescriptions({
        cameraUsageDescription: "camera",
        photoAddUsageDescription: "add",
        photoUsageDescription: "read",
        locationAlwaysUsageDescription: "always",
      }),
    ).toEqual({
      NSCameraUsageDescription: "camera",
      NSPhotoLibraryAddUsageDescription: "add",
      NSPhotoLibraryUsageDescription: "read",
      NSLocationAlwaysAndWhenInUseUsageDescription: "always",
      NSLocationAlwaysUsageDescription: "always",
    });
  });

  test("keeps the NS prefix convention for a key it does not know", () => {
    expect(toIosInfoPlistUsageDescriptions({ bluetoothAlwaysUsageDescription: "ble" })).toEqual({
      NSBluetoothAlwaysUsageDescription: "ble",
    });
  });
});
