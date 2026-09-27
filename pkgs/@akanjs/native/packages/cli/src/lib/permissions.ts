// App-level permissions for web-standard APIs used without a plugin (plugins.md C8):
// getUserMedia needs the camera or microphone, navigator.geolocation the location. Each maps to
// the usage description iOS and macOS show and to the Android permissions the WebView bridge may
// request (S6 only asks for permissions the manifest declares). Same idea as dioxus
// `[permissions]` (dioxus/packages/cli/src/config/manifest_mapper.rs:125-195), fewer kinds.

import { CliError } from "./log.ts";

export const PERMISSION_NAMES = ["camera", "microphone", "location"] as const;
export type PermissionName = (typeof PERMISSION_NAMES)[number];
/** `true` uses a generic usage text; a string is the text iOS and macOS show. */
export type PermissionsConfig = Partial<Record<PermissionName, string | true>>;

const DEFAULT_TEXT: Record<PermissionName, string> = {
  camera: "Use the camera.",
  microphone: "Use the microphone.",
  location: "Show where you are.",
};

const PLIST_KEY: Record<"ios" | "macos", Partial<Record<PermissionName, string>>> = {
  ios: {
    camera: "NSCameraUsageDescription",
    microphone: "NSMicrophoneUsageDescription",
    location: "NSLocationWhenInUseUsageDescription",
  },
  // macOS WKWebView has no geolocation permission hook, so web location stays unavailable there.
  macos: { camera: "NSCameraUsageDescription", microphone: "NSMicrophoneUsageDescription" },
};

const ANDROID_PERMISSIONS: Record<PermissionName, string[]> = {
  camera: ["android.permission.CAMERA"],
  // WebRTC audio also changes the audio mode (capacitor BridgeWebChromeClient.java:107-110).
  microphone: ["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"],
  location: ["android.permission.ACCESS_COARSE_LOCATION", "android.permission.ACCESS_FINE_LOCATION"],
};

/** Declaring CAMERA etc. makes Google Play assume the hardware is required unless a uses-feature says otherwise. */
const ANDROID_FEATURES: Record<PermissionName, string[]> = {
  camera: ["android.hardware.camera"],
  microphone: ["android.hardware.microphone"],
  location: ["android.hardware.location", "android.hardware.location.gps"],
};

export function validatePermissions(raw: unknown): PermissionsConfig {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new CliError(`permissions must be an object like { camera: "Scan documents." }`);
  const out: PermissionsConfig = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!(PERMISSION_NAMES as readonly string[]).includes(name)) {
      throw new CliError(
        `permissions.${name} is not supported (use ${PERMISSION_NAMES.join(", ")}; plugins declare their own)`,
      );
    }
    if (value !== true && (typeof value !== "string" || value.trim() === "")) {
      throw new CliError(`permissions.${name} must be true or the usage text shown to the user`);
    }
    out[name as PermissionName] = value;
  }
  return out;
}

const declared = (config: PermissionsConfig) => PERMISSION_NAMES.filter((name) => config[name] !== undefined);

/** Info.plist usage descriptions for the declared permissions. */
export function permissionPlist(config: PermissionsConfig, platform: "ios" | "macos"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of declared(config)) {
    const key = PLIST_KEY[platform][name];
    if (key) out[key] = config[name] === true ? DEFAULT_TEXT[name] : (config[name] as string);
  }
  return out;
}

export function androidPermissionsFor(config: PermissionsConfig): string[] {
  return declared(config).flatMap((name) => ANDROID_PERMISSIONS[name]);
}

/** `<uses-feature … android:required="false"/>` lines for the declared permissions. */
export function androidFeaturesFor(config: PermissionsConfig): string[] {
  return declared(config).flatMap((name) =>
    ANDROID_FEATURES[name].map((f) => `<uses-feature android:name="${f}" android:required="false" />`),
  );
}
