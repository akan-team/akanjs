import { afterEach, describe, expect, test } from "bun:test";
import { AkanNativeError } from "@akanjs/native/core";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";
import type { Position } from "@akanjs/native/plugins/geolocation";

import { useGeoLocation } from "./useGeoLocation";

const state = { calls: [] as string[], positionError: null as AkanNativeError | null };
const position: Position = {
  latitude: 37.5,
  longitude: 127,
  accuracy: 12,
  altitude: null,
  altitudeAccuracy: null,
  heading: null,
  speed: null,
  timestamp: 1790000000000,
};
let host: MockHost | null = null;

const installShell = () => {
  host = installMockHost({
    platform: "android",
    plugins: {
      geolocation: {
        methods: {
          getCurrentPosition: () => {
            state.calls.push("getCurrentPosition");
            if (state.positionError) throw state.positionError;
            return position;
          },
          requestPermission: () => ({ location: "granted", precise: true }),
        },
      },
      opener: {
        methods: {
          openSettings: () => {
            state.calls.push("openSettings");
            return {};
          },
        },
      },
    },
  });
};

afterEach(() => {
  host?.uninstall();
  host = null;
  Object.assign(state, { calls: [], positionError: null });
});

describe("useGeoLocation", () => {
  test("hands back the position, and opens the settings when location is denied", async () => {
    installShell();
    const geo = useGeoLocation();

    expect(await geo.checkPermission()).toEqual({ location: "granted", precise: true });
    expect(await geo.getPosition()).toEqual(position);
    state.positionError = new AkanNativeError("PERMISSION_DENIED", "no");
    expect(await geo.getPosition()).toBeUndefined();
    expect(state.calls).toEqual(["getCurrentPosition", "getCurrentPosition", "openSettings"]);
  });

  test("passes any other error on to the caller", async () => {
    installShell();
    state.positionError = new AkanNativeError("TIMEOUT", "slow");

    await expect(useGeoLocation().getPosition()).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
