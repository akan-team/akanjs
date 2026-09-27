import { describe, expect, test } from "bun:test";
import { iosInfoPlist } from "../src/lib/native-plugins.ts";
import {
  androidFeaturesFor,
  androidPermissionsFor,
  permissionPlist,
  validatePermissions,
} from "../src/lib/permissions.ts";

describe("app permissions (plugins.md C8)", () => {
  test("validation", () => {
    expect(validatePermissions(undefined)).toEqual({});
    expect(validatePermissions({ camera: true, microphone: "Record voice notes." })).toEqual({
      camera: true,
      microphone: "Record voice notes.",
    });
    for (const bad of [[], "camera", { contacts: true }, { camera: false }, { camera: "  " }, { location: 1 }]) {
      expect(() => validatePermissions(bad)).toThrow();
    }
  });

  test("Info.plist texts per platform; macOS has no web location", () => {
    const config = { camera: true as const, microphone: "Record voice notes.", location: "Find stores near you." };
    expect(permissionPlist(config, "ios")).toEqual({
      NSCameraUsageDescription: "Use the camera.",
      NSMicrophoneUsageDescription: "Record voice notes.",
      NSLocationWhenInUseUsageDescription: "Find stores near you.",
    });
    expect(permissionPlist(config, "macos")).toEqual({
      NSCameraUsageDescription: "Use the camera.",
      NSMicrophoneUsageDescription: "Record voice notes.",
    });
    expect(permissionPlist({}, "ios")).toEqual({});
  });

  test("Android permissions and optional hardware features", () => {
    expect(androidPermissionsFor({ microphone: true, location: true })).toEqual([
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
    ]);
    expect(androidFeaturesFor({ camera: true })).toEqual([
      '<uses-feature android:name="android.hardware.camera" android:required="false" />',
    ]);
  });

  test("app texts override plugin defaults; usageDescriptions override both", () => {
    const plugin = {
      plugin: { manifest: { id: "camera" } },
      native: { infoPlist: { NSCameraUsageDescription: "Take photos with the camera." } },
    } as never;
    expect(iosInfoPlist([plugin], {}, { NSCameraUsageDescription: "Scan receipts." })).toEqual({
      NSCameraUsageDescription: "Scan receipts.",
    });
    expect(
      iosInfoPlist([plugin], { NSCameraUsageDescription: "Final." }, { NSCameraUsageDescription: "Scan receipts." }),
    ).toEqual({ NSCameraUsageDescription: "Final." });
  });
});
