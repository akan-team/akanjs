import { createLiveValue, definePlugin, shallowEqual } from "../../../packages/core/src/index.ts";
import { useLiveValue } from "../../../packages/react/src/index.ts";

/** The kind of biometric sensor. iOS Optic ID counts as "iris". */
export type BiometryType = "face" | "fingerprint" | "iris" | "none";

/**
 * Why biometrics cannot be used right now.
 * - noHardware: no sensor
 * - notEnrolled: nothing enrolled, or (iOS) no passcode, which biometrics require
 * - lockedOut: too many failed attempts; the passcode unlocks it again (allowDeviceCredential)
 * - denied: the user turned biometrics off for this app (iOS Face ID setting, Android "use for apps")
 * - notConfigured: the app lacks NSFaceIDUsageDescription (iOS; the manifest adds it)
 * - unavailable: anything else (sensor busy, security update required)
 */
export type BiometricUnavailableReason =
  | "noHardware"
  | "notEnrolled"
  | "lockedOut"
  | "denied"
  | "notConfigured"
  | "unavailable";

export interface BiometricStatus {
  /** Whether authenticate() can use biometrics now. */
  available: boolean;
  /** The sensor kind, also when nothing is enrolled. On Android with several sensors, the first of fingerprint, face, iris. */
  type: BiometryType;
  /** Set when not available. */
  reason?: BiometricUnavailableReason;
  /** Whether a passcode / PIN / pattern is set, i.e. whether allowDeviceCredential can succeed. */
  deviceCredential: boolean;
}

export interface AuthenticateOptions {
  /** Why the app asks. iOS shows it under "Face ID"; Android uses it as the title, or as the subtitle when `title` is set. */
  reason: string;
  /** Android: prompt title. */
  title?: string;
  /** Label of the cancel button. Android ignores it with allowDeviceCredential (the system prompt has its own). */
  cancelTitle?: string;
  /**
   * Also accept the device passcode / PIN / pattern (iOS .deviceOwnerAuthentication, Android
   * DEVICE_CREDENTIAL). Default false: biometrics only, and iOS hides its "Enter Password" button.
   */
  allowDeviceCredential?: boolean;
}

/**
 * Local user verification (Face ID, Touch ID, fingerprint, face unlock). A successful
 * authenticate() proves presence to this app only; it unlocks no key and must not replace a
 * server-side login.
 *
 * authenticate() rejects with
 * - CANCELLED: the user or the system cancelled (app sent to the background, another prompt)
 * - PERMISSION_DENIED: not enrolled, locked out, turned off for the app, or (iOS) failed attempts
 * - UNSUPPORTED: no sensor (and no allowed passcode fallback); every call on the web and macOS
 * - INTERNAL: NSFaceIDUsageDescription missing (iOS) and other platform failures
 */
export interface BiometricApi {
  isAvailable(): Promise<BiometricStatus>;
  authenticate(options: AuthenticateOptions): Promise<void>;
}

export const biometric = definePlugin<BiometricApi>("biometric", {
  methods: ["isAvailable", "authenticate"],
});

// Enrollment changes in Settings while the app is in the background, so the status is read again
// when the page becomes visible or focused.
const status = createLiveValue<BiometricStatus | null>(
  null,
  (set) => {
    if (!biometric.isSupported("isAvailable")) return;
    let live = true;
    const refresh = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      biometric
        .isAvailable()
        .then((next) => live && set(next))
        .catch((error) => console.warn("[akan-native] biometric.isAvailable failed", error));
    };
    refresh();
    if (typeof window === "undefined")
      return () => {
        live = false;
      };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  },
  (a, b) => a === b || (a !== null && b !== null && shallowEqual(a, b)),
);

/** The biometric status, or null while it loads and where the platform has no biometric plugin (web, macOS). */
export function useBiometricStatus(): BiometricStatus | null {
  return useLiveValue(status);
}
