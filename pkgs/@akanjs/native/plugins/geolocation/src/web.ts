import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import type {
  GeolocationApi,
  GeolocationError,
  GeolocationEvents,
  LocationPermission,
  PermissionState,
  Position,
  PositionOptions,
} from "./index.ts";

// navigator.geolocation. It needs a secure context (https or localhost; dioxus serves its desktop
// pages from an https-like origin for the same reason, dioxus/packages/desktop/src/protocol.rs:15-16).
// The Android shell uses the native plugin instead: the WebView would need
// onGeolocationPermissionsShowPrompt wired to runtime permissions (as
// capacitor/android/.../BridgeWebChromeClient.java:246-273 does), and iOS WKWebView adds its own
// per-origin prompt on top of the app's with no public API to answer it (plugins.md §4.7).

export const DEFAULT_TIMEOUT = 30_000;

function api(): Geolocation {
  const geo = typeof navigator === "undefined" ? undefined : navigator.geolocation;
  if (!geo) throw new AkanNativeError("UNSUPPORTED", "navigator.geolocation is not available (insecure context?)");
  return geo;
}

const finite = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function toPosition(p: GeolocationPosition): Position {
  const c = p.coords;
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    accuracy: c.accuracy,
    altitude: finite(c.altitude),
    altitudeAccuracy: finite(c.altitudeAccuracy),
    heading: finite(c.heading), // NaN while standing still
    speed: finite(c.speed),
    timestamp: p.timestamp,
  };
}

/** W3C GeolocationPositionError codes: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT. */
export function toError(error: { code: number; message?: string }): AkanNativeError {
  if (error.code === 1) return new AkanNativeError("PERMISSION_DENIED", error.message || "location access was denied");
  if (error.code === 3) return new AkanNativeError("NOT_FOUND", error.message || "no position within the timeout");
  return new AkanNativeError("NOT_FOUND", error.message || "the position is unavailable");
}

export function positionOptions(options: PositionOptions | undefined): globalThis.PositionOptions {
  const o = options ?? {};
  const ms = (name: "timeout" | "maximumAge", fallback: number) => {
    const value = o[name];
    if (value === undefined || value === null) return fallback;
    if (typeof value !== "number" || Number.isNaN(value) || value < 0)
      throw new AkanNativeError("INVALID_ARGS", `${name} must be a number of ms >= 0`);
    return value;
  };
  return {
    enableHighAccuracy: o.enableHighAccuracy === true,
    timeout: ms("timeout", DEFAULT_TIMEOUT),
    maximumAge: ms("maximumAge", 0),
  };
}

function current(options: globalThis.PositionOptions): Promise<Position> {
  const geo = api();
  return new Promise((resolve, reject) =>
    geo.getCurrentPosition(
      (p) => resolve(toPosition(p)),
      (e) => reject(toError(e)),
      options,
    ),
  );
}

async function state(): Promise<PermissionState> {
  try {
    return (await navigator.permissions.query({ name: "geolocation" })).state;
  } catch {
    return "prompt"; // no Permissions API
  }
}

// The "error" event has its own source; the watches report through it while it is listened to.
let reportError: ((error: GeolocationError) => void) | null = null;
const report = (error: AkanNativeError) => reportError?.({ code: error.code, message: error.message });

function watchSource(enableHighAccuracy: boolean) {
  return (emit: (position: Position) => void) => {
    let geo: Geolocation;
    try {
      geo = api();
    } catch (error) {
      report(AkanNativeError.from(error));
      return () => {};
    }
    const id = geo.watchPosition(
      (p) => emit(toPosition(p)),
      (e) => report(toError(e)),
      { enableHighAccuracy, maximumAge: 0 },
    );
    return () => geo.clearWatch(id);
  };
}

export const web = defineWebPlugin<GeolocationApi, GeolocationEvents>({
  methods: {
    getCurrentPosition: async (options) => current(positionOptions(options)),
    checkPermission: async (): Promise<LocationPermission> => {
      api();
      return { location: await state(), precise: null };
    },
    async requestPermission(): Promise<LocationPermission> {
      api();
      const before = await state();
      if (before === "granted" || before === "denied") return { location: before, precise: null };
      // Browsers only prompt as part of a position request.
      try {
        await current({ enableHighAccuracy: false, timeout: DEFAULT_TIMEOUT, maximumAge: Infinity });
        return { location: "granted", precise: null };
      } catch (error) {
        if (error instanceof AkanNativeError && error.code === "PERMISSION_DENIED")
          return { location: "denied", precise: null };
        return { location: await state(), precise: null }; // allowed, but no position right now
      }
    },
  },
  events: {
    position: watchSource(false),
    highAccuracyPosition: watchSource(true),
    error(emit) {
      reportError = emit;
      return () => {
        if (reportError === emit) reportError = null;
      };
    },
  },
});
