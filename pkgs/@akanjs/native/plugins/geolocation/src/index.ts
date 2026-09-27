import {
  AkanNativeError,
  createLiveValue,
  definePlugin,
  type ErrorCode,
  type LiveValue,
} from "../../../packages/core/src/index.ts";
import { useLiveValue } from "../../../packages/react/src/index.ts";
import { web } from "./web.ts";

export type PermissionState = "granted" | "denied" | "prompt" | "prompt-with-rationale";

export interface LocationPermission {
  /** "denied" also covers location services turned off system-wide (iOS reports it that way). */
  location: PermissionState;
  /**
   * Whether positions are precise: iOS Precise Location on, Android ACCESS_FINE_LOCATION granted.
   * false means approximate (a few km). null when location is not granted or the platform cannot tell (web).
   */
  precise: boolean | null;
}

/** A W3C GeolocationPosition, flattened. Distances in meters, angles in degrees, speed in m/s. */
export interface Position {
  latitude: number;
  longitude: number;
  /** Radius of 68% confidence around latitude/longitude. */
  accuracy: number;
  /** Height above the WGS84 ellipsoid (as W3C and Android report it; iOS converts from its mean-sea-level value). */
  altitude: number | null;
  altitudeAccuracy: number | null;
  /** Direction of travel, clockwise from true north. null when unknown or not moving. */
  heading: number | null;
  speed: number | null;
  /** When the fix was taken, ms since the Unix epoch. */
  timestamp: number;
}

/**
 * Numbers must be finite on iOS and Android: the bridge is JSON, where Infinity becomes null, i.e.
 * the default. For "any cached fix" pass a large number such as 86_400_000 (a day).
 */
export interface PositionOptions {
  /**
   * Ask for the best accuracy (GPS) instead of a battery-friendly fix (~100 m). Default false.
   * On Android a balanced request never turns on GPS: without network location (the emulator)
   * it only gets a fix another request produced recently, or times out.
   */
  enableHighAccuracy?: boolean;
  /** Give up after this many ms with NOT_FOUND, counted after the permission prompt. Default 30000; Android ends a single request after 30 s. */
  timeout?: number;
  /** Accept a cached fix up to this many ms old. Default 0 (always a new fix). */
  maximumAge?: number;
}

/**
 * getCurrentPosition() asks for permission first when it was never asked, like the W3C API.
 * It rejects with
 * - PERMISSION_DENIED: the user denied location (or turned it off, on iOS)
 * - NOT_FOUND: no position: timeout, location turned off (Android, web), no provider
 * - INTERNAL: NSLocationWhenInUseUsageDescription missing (iOS) and other failures
 * - UNSUPPORTED: macOS (WKWebView has no public geolocation permission hook and CoreLocation
 *   would need native desktop code) and browsers without navigator.geolocation (insecure context)
 */
export interface GeolocationApi {
  getCurrentPosition(options?: PositionOptions): Promise<Position>;
  checkPermission(): Promise<LocationPermission>;
  /** Shows the system prompt when the state is "prompt" or "prompt-with-rationale"; otherwise returns the state. */
  requestPermission(): Promise<LocationPermission>;
}

export interface GeolocationError {
  code: ErrorCode;
  message: string;
}

/**
 * Position updates run while someone listens: "position" at balanced accuracy, and
 * "highAccuracyPosition" with GPS. While both have listeners the host runs one high-accuracy
 * watch and sends each fix to both. Updates stop while the app is in the background.
 * "error" reports watch failures (permission denied or revoked, location turned off); it does not
 * start a watch by itself.
 */
export interface GeolocationEvents {
  position: Position;
  highAccuracyPosition: Position;
  error: GeolocationError;
}

export const geolocation = definePlugin<GeolocationApi, GeolocationEvents>("geolocation", {
  methods: ["getCurrentPosition", "checkPermission", "requestPermission"],
  events: ["position", "highAccuracyPosition", "error"],
  web,
});

export interface WatchOptions {
  enableHighAccuracy?: boolean;
  onError?: (error: AkanNativeError) => void;
}

/**
 * Calls `onPosition` for every new fix until the returned function is called. Like W3C
 * watchPosition, it asks for permission first when it was never asked.
 */
export function watchPosition(onPosition: (position: Position) => void, options: WatchOptions = {}): () => void {
  // The error listener goes first so a failure right at the start of the watch is not missed.
  const { onError } = options;
  const stopError = onError
    ? geolocation.listen("error", (e) => onError(new AkanNativeError(e.code, e.message)))
    : null;
  const stopPosition = geolocation.listen(options.enableHighAccuracy ? "highAccuracyPosition" : "position", onPosition);
  return () => {
    stopPosition();
    stopError?.();
  };
}

export interface GeolocationState {
  /** The latest fix, null until the first one. */
  position: Position | null;
  /** The latest failure; cleared by the next fix. */
  error: AkanNativeError | null;
}

const watches = new Map<boolean, LiveValue<GeolocationState>>();

function watch(high: boolean): LiveValue<GeolocationState> {
  let live = watches.get(high);
  if (!live) {
    const created: LiveValue<GeolocationState> = createLiveValue<GeolocationState>(
      { position: null, error: null },
      (set) => {
        if (geolocation.eventImplementation(high ? "highAccuracyPosition" : "position") === "none") {
          set({
            position: null,
            error: new AkanNativeError("UNSUPPORTED", "geolocation is not supported on this platform"),
          });
          return;
        }
        return watchPosition((position) => set({ position, error: null }), {
          enableHighAccuracy: high,
          onError: (error) => set({ position: created.get().position, error }),
        });
      },
    );
    live = created;
    watches.set(high, created);
  }
  return live;
}

/** Watches the position while the component is mounted. Components with the same accuracy share one watch. */
export function useGeolocation(options: { enableHighAccuracy?: boolean } = {}): GeolocationState {
  return useLiveValue(watch(options.enableHighAccuracy === true));
}
