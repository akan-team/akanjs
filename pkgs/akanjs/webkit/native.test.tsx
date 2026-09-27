import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { AkanNativeError } from "@akanjs/native/core";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";
import { Translator } from "../client/translator";
import { csrClientBase, fakeReact, hooks } from "./hookHarness.fixture";

type RenderHookResult<T> = {
  get current(): T;
  unmount: () => void;
};

const photoUrl = "data:image/jpeg;base64,/9j/";
const state = {
  sheetIndex: 0,
  sheetTitles: [] as string[],
  sources: [] as string[],
  photoError: null as AkanNativeError | null,
  permission: "granted" as "granted" | "denied" | "prompt",
  settingsOpened: 0,
  positionError: null as AkanNativeError | null,
};
let host: MockHost | null = null;

beforeAll(() => {
  mock.module("react", () =>
    fakeReact({
      useEffect: (fn: () => (() => undefined) | undefined) => {
        const cleanup = fn();
        if (cleanup) hooks.cleanups.push(cleanup);
      },
      lazy: (loader: unknown) => ({ loader }),
    }),
  );
  mock.module("akanjs/client", () => ({
    ...csrClientBase(),
    // The real one, so the assertion below is that the dictionary key is what reaches the native sheet.
    Translator,
  }));
});

const installNativeHost = () => {
  host = installMockHost({
    platform: "ios",
    plugins: {
      dialog: {
        methods: {
          actionSheet: ({ title, options }: { title: string; options: { title: string }[] }) => {
            state.sheetTitles = [title, ...options.map((option) => option.title)];
            return { index: state.sheetIndex, cancelled: state.sheetIndex < 0 };
          },
        },
      },
      camera: {
        methods: {
          takePhoto: ({ source }: { source: string }) => {
            state.sources.push(source);
            if (state.photoError) throw state.photoError;
            return { url: photoUrl, mime: "image/jpeg", size: 3 };
          },
          pickImages: () => ({ photos: [{ url: photoUrl, mime: "image/jpeg", size: 3 }] }),
          checkPermission: () => ({ camera: state.permission }),
          requestPermission: () => ({ camera: state.permission }),
        },
      },
      geolocation: {
        methods: {
          requestPermission: () => ({ location: state.permission, precise: true }),
          getCurrentPosition: () => {
            if (state.positionError) throw state.positionError;
            return { latitude: 37, longitude: 127, accuracy: 5 };
          },
        },
      },
      opener: {
        methods: {
          openSettings: () => {
            state.settingsOpened += 1;
          },
        },
      },
    },
  });
  return host;
};

const renderHook = <T,>(hook: () => T): RenderHookResult<T> => {
  hooks.index = 0;
  const current = hook();
  return {
    get current() {
      return current;
    },
    unmount: () =>
      hooks.cleanups.splice(0).forEach((cleanup) => {
        cleanup();
      }),
  };
};

afterEach(() => {
  host?.uninstall();
  host = null;
  Object.assign(state, {
    sheetIndex: 0,
    sheetTitles: [],
    sources: [],
    photoError: null,
    permission: "granted",
    settingsOpened: 0,
    positionError: null,
  });
  hooks.cleanups.splice(0);
  hooks.index = 0;
  hooks.states.length = 0;
  hooks.memos.length = 0;
});

describe("native hooks", () => {
  test("useCamera asks camera or library on the native sheet and answers a data URL", async () => {
    const nativeHost = installNativeHost();
    const { useCamera } = await import("./useCamera");
    const hook = renderHook(() => useCamera());

    expect(await hook.current.getPhoto()).toEqual({ dataUrl: photoUrl });
    expect(state.sheetTitles).toEqual([
      "base.cameraPromptHeader",
      "base.cameraPromptPhoto",
      "base.cameraPromptPicture",
      "base.cameraPromptCancel",
    ]);
    expect(state.sources).toEqual(["library"]);
    expect(nativeHost.releases).toEqual([photoUrl]);

    state.sheetIndex = 1;
    await hook.current.getPhoto();
    await hook.current.getPhoto("photos");
    await hook.current.getPhoto("camera");
    expect(state.sources).toEqual(["library", "camera", "library", "camera"]);

    state.sheetIndex = -1;
    expect(await hook.current.getPhoto()).toBeUndefined();
    expect(state.sources).toHaveLength(4);
    hook.unmount();
  });

  test("useCamera treats a cancelled capture as no photo and a denied one as a trip to the settings", async () => {
    installNativeHost();
    const { useCamera } = await import("./useCamera");
    const hook = renderHook(() => useCamera());

    state.photoError = new AkanNativeError("CANCELLED", "cancelled");
    expect(await hook.current.getPhoto("camera")).toBeUndefined();
    expect(state.settingsOpened).toBe(0);

    state.photoError = new AkanNativeError("PERMISSION_DENIED", "camera access was denied");
    expect(await hook.current.getPhoto("camera")).toBeUndefined();
    expect(state.settingsOpened).toBe(1);

    state.photoError = null;
    state.permission = "denied";
    expect(await hook.current.checkPermission()).toBe("denied");
    expect(state.settingsOpened).toBe(2);

    expect(await hook.current.pickImage()).toEqual([{ dataUrl: photoUrl }]);
    hook.unmount();
  });

  test("useGeoLocation answers the position or opens the settings when location is denied", async () => {
    installNativeHost();
    const { useGeoLocation } = await import("./useGeoLocation");
    const hook = renderHook(() => useGeoLocation());

    expect(await hook.current.checkPermission()).toEqual({ location: "granted", precise: true });
    expect(await hook.current.getPosition()).toMatchObject({ latitude: 37, longitude: 127, accuracy: 5 });

    state.positionError = new AkanNativeError("PERMISSION_DENIED", "denied");
    expect(await hook.current.getPosition()).toBeUndefined();
    expect(state.settingsOpened).toBe(1);

    state.positionError = new AkanNativeError("NOT_FOUND", "no fix");
    await expect(hook.current.getPosition()).rejects.toThrow("no fix");
    hook.unmount();
  });
});
