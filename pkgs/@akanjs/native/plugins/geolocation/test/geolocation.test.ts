import { afterEach, describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { type AkanNativeError, isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import manifest from "../native-plugin.json";
import { type GeolocationError, geolocation, type Position, watchPosition } from "../src/index.ts";
import { positionOptions, toError, toPosition } from "../src/web.ts";

let host: MockHost | null = null;
const stubs: string[] = [];

function stubNavigator(key: string, value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
  stubs.push(key);
}

afterEach(() => {
  host?.uninstall();
  host = null;
  for (const key of stubs.splice(0)) delete (navigator as unknown as Record<string, unknown>)[key];
});

const tick = () => new Promise((r) => setTimeout(r, 1));
const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

const seoul: Position = {
  latitude: 37.5665,
  longitude: 126.978,
  accuracy: 12,
  altitude: null,
  altitudeAccuracy: null,
  heading: null,
  speed: 0,
  timestamp: 1_758_000_000_000,
};

function browserPosition(heading: number | null): GeolocationPosition {
  return {
    timestamp: seoul.timestamp,
    coords: {
      latitude: seoul.latitude,
      longitude: seoul.longitude,
      accuracy: 12,
      altitude: null,
      altitudeAccuracy: null,
      heading,
      speed: 0,
    },
  } as unknown as GeolocationPosition;
}

describe("web mapping", () => {
  test("positions: flattened, NaN and missing values become null", () => {
    expect(toPosition(browserPosition(Number.NaN))).toEqual(seoul);
    expect(toPosition(browserPosition(90)).heading).toBe(90);
  });

  test("errors: W3C codes to akan-native codes", () => {
    expect(toError({ code: 1, message: "User denied Geolocation" }).code).toBe("PERMISSION_DENIED");
    expect(toError({ code: 2, message: "" }).code).toBe("NOT_FOUND");
    expect(toError({ code: 3, message: "Timeout expired" })).toMatchObject({
      code: "NOT_FOUND",
      message: "Timeout expired",
    });
  });

  test("options: defaults and validation", () => {
    expect(positionOptions(undefined)).toEqual({ enableHighAccuracy: false, timeout: 30_000, maximumAge: 0 });
    expect(positionOptions({ enableHighAccuracy: true, timeout: 5, maximumAge: Infinity })).toEqual({
      enableHighAccuracy: true,
      timeout: 5,
      maximumAge: Infinity,
    });
    expect(() => positionOptions({ timeout: -1 })).toThrow("timeout");
    expect(() => positionOptions({ maximumAge: "1" as never })).toThrow("maximumAge");
  });
});

describe("web implementation", () => {
  function fakeGeolocation() {
    const watches = new Map<
      number,
      { success: PositionCallback; error?: PositionErrorCallback | null; options?: globalThis.PositionOptions }
    >();
    let next = 1;
    const calls: globalThis.PositionOptions[] = [];
    let answer: (success: PositionCallback, error: PositionErrorCallback) => void = (success) =>
      success(browserPosition(null));
    const geo = {
      getCurrentPosition(success: PositionCallback, error: PositionErrorCallback, options: globalThis.PositionOptions) {
        calls.push(options);
        answer(success, error);
      },
      watchPosition(
        success: PositionCallback,
        error?: PositionErrorCallback | null,
        options?: globalThis.PositionOptions,
      ) {
        watches.set(next, { success, error, options });
        return next++;
      },
      clearWatch: (id: number) => void watches.delete(id),
    };
    stubNavigator("geolocation", geo);
    return {
      watches,
      calls,
      answerWith: (fn: typeof answer) => {
        answer = fn;
      },
    };
  }

  test("without navigator.geolocation every method rejects UNSUPPORTED", async () => {
    host = installMockHost({ platform: "web" });
    expect(isAkanNativeError(await rejection(geolocation.getCurrentPosition()), "UNSUPPORTED")).toBe(true);
    expect(isAkanNativeError(await rejection(geolocation.checkPermission()), "UNSUPPORTED")).toBe(true);
  });

  test("getCurrentPosition passes the options and maps the answer", async () => {
    host = installMockHost({ platform: "web" });
    const fake = fakeGeolocation();
    expect(await geolocation.getCurrentPosition({ enableHighAccuracy: true, maximumAge: 1000 })).toEqual(seoul);
    expect(fake.calls).toEqual([{ enableHighAccuracy: true, timeout: 30_000, maximumAge: 1000 }]);
    fake.answerWith((_s, error) =>
      error({ code: 1, message: "denied", PERMISSION_DENIED: 1 } as GeolocationPositionError),
    );
    expect(isAkanNativeError(await rejection(geolocation.getCurrentPosition()), "PERMISSION_DENIED")).toBe(true);
    expect(isAkanNativeError(await rejection(geolocation.getCurrentPosition({ timeout: -5 })), "INVALID_ARGS")).toBe(
      true,
    );
  });

  test("permissions come from navigator.permissions; requestPermission prompts through a position request", async () => {
    host = installMockHost({ platform: "web" });
    const fake = fakeGeolocation();
    let state: PermissionState = "prompt";
    stubNavigator("permissions", { query: async () => ({ state }) });
    expect(await geolocation.checkPermission()).toEqual({ location: "prompt", precise: null });
    expect(await geolocation.requestPermission()).toEqual({ location: "granted", precise: null });
    expect(fake.calls[0]!.maximumAge).toBe(Infinity); // any cached fix will do
    state = "denied";
    expect(await geolocation.requestPermission()).toEqual({ location: "denied", precise: null });
    expect(fake.calls.length).toBe(1);
  });

  test("events: one browser watch per accuracy, errors go to the error event, stopped with the last listener", async () => {
    host = installMockHost({ platform: "web" });
    const fake = fakeGeolocation();
    const seen: Position[] = [];
    const errors: AkanNativeError[] = [];
    const stop = watchPosition((p) => seen.push(p), { onError: (e) => errors.push(e) });
    const stopHigh = watchPosition((p) => seen.push(p), { enableHighAccuracy: true });
    expect([...fake.watches.values()].map((w) => w.options?.enableHighAccuracy)).toEqual([false, true]);
    const [balanced] = [...fake.watches.values()];
    balanced!.success(browserPosition(null));
    balanced!.error?.({ code: 3, message: "Timeout expired" } as GeolocationPositionError);
    expect(seen).toEqual([seoul]);
    expect(errors.map((e) => e.code)).toEqual(["NOT_FOUND"]);
    stop();
    stopHigh();
    await tick();
    expect(fake.watches.size).toBe(0);
  });
});

describe("native hosts", () => {
  test("methods and events go through the host", async () => {
    const args: unknown[] = [];
    host = installMockHost({
      platform: "android",
      plugins: {
        geolocation: {
          methods: {
            getCurrentPosition: (a) => (args.push(a), seoul),
            checkPermission: () => ({ location: "prompt-with-rationale", precise: null }),
            requestPermission: () => ({ location: "granted", precise: false }),
          },
          events: ["position", "highAccuracyPosition", "error"],
        },
      },
    });
    expect(await geolocation.getCurrentPosition({ timeout: 5000 })).toEqual(seoul);
    expect(args).toEqual([{ timeout: 5000 }]);
    expect(await geolocation.checkPermission()).toEqual({ location: "prompt-with-rationale", precise: null });
    expect(await geolocation.requestPermission()).toEqual({ location: "granted", precise: false });

    const seen: Position[] = [];
    const errors: AkanNativeError[] = [];
    const stop = watchPosition((p) => seen.push(p), { enableHighAccuracy: true, onError: (e) => errors.push(e) });
    await tick();
    // The error listener is subscribed before the watch starts.
    expect(host.requests.filter((r) => r.method === "$listen").map((r) => (r.args as { event: string }).event)).toEqual(
      ["error", "highAccuracyPosition"],
    );
    expect(host.subscriptions("geolocation", "position")).toBe(0);
    host.emit("geolocation", "highAccuracyPosition", seoul);
    host.emit("geolocation", "error", {
      code: "PERMISSION_DENIED",
      message: "location access was denied",
    } satisfies GeolocationError);
    expect(seen).toEqual([seoul]);
    expect(errors[0]).toMatchObject({ code: "PERMISSION_DENIED", message: "location access was denied" });
    expect(isAkanNativeError(errors[0])).toBe(true);
    stop();
    await tick();
    expect(host.subscriptions("geolocation", "highAccuracyPosition")).toBe(0);
    expect(host.subscriptions("geolocation", "error")).toBe(0);
  });

  test("macOS has no implementation: UNSUPPORTED", async () => {
    host = installMockHost({ platform: "macos", plugins: {} });
    expect(geolocation.implementation("getCurrentPosition")).toBe("none");
    expect(isAkanNativeError(await rejection(geolocation.getCurrentPosition()), "UNSUPPORTED")).toBe(true);
  });

  test("manifest: native on iOS and Android, nothing on macOS, permissions and usage text", () => {
    const plugin = { spec: "geolocation", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "macos")).toEqual({});
    for (const platform of ["ios", "android"] as const) {
      expect(pluginDecls([plugin], platform)).toEqual({
        // Positions are snapshots: only the latest of a burst reaches the page (coalesce).
        geolocation: {
          methods: ["getCurrentPosition", "checkPermission", "requestPermission"],
          events: ["position", "highAccuracyPosition", "error"],
          coalesce: ["position", "highAccuracyPosition"],
        },
      });
    }
    expect(manifest.ios.infoPlist.NSLocationWhenInUseUsageDescription).toBeTruthy();
    expect(manifest.android.permissions).toEqual([
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
    ]);
  });
});
