import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { AkanNativeError } from "@akanjs/native/core";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";

import { fakeReact, hooks } from "./hookHarness.fixture";

const state = { calls: [] as string[], photoError: null as AkanNativeError | null };
const photo = { url: "akan-file://photo/1", mime: "image/jpeg", size: 3 };
let host: MockHost | null = null;
const originalFetch = globalThis.fetch;
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

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
});

const installShell = () => {
  const answer = (name: string, result: unknown) => () => {
    state.calls.push(name);
    if (state.photoError) throw state.photoError;
    return result;
  };
  host = installMockHost({
    platform: "ios",
    plugins: {
      camera: {
        methods: {
          takePhoto: answer("takePhoto", photo),
          pickImages: answer("pickImages", { photos: [photo] }),
          requestPermission: () => {
            state.calls.push("requestPermission");
            return { camera: "denied" };
          },
          checkPermission: () => ({ camera: "granted" }),
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
      dialog: {
        methods: {
          actionSheet: () => {
            state.calls.push("actionSheet");
            return { index: 1 };
          },
        },
      },
    },
  });
  globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as unknown as typeof fetch;
  return host;
};

const hookOf = async () => {
  const { useCamera } = await import("./useCamera");
  hooks.index = 0;
  return useCamera();
};

afterEach(() => {
  for (const cleanup of hooks.cleanups.splice(0)) cleanup();
  hooks.states.length = 0;
  host?.uninstall();
  host = null;
  globalThis.fetch = originalFetch;
  Object.assign(state, { calls: [], photoError: null });
});

describe("useCamera", () => {
  test("at mount in a shell: reads the camera permission", async () => {
    installShell();
    await hookOf();
    await settle();

    expect(hooks.states[0]).toEqual({ camera: "granted" });
  });

  test("hands a photo back as a data URL and releases it", async () => {
    const shell = installShell();
    const camera = await hookOf();

    expect(await camera.getPhoto()).toEqual({ dataUrl: "data:image/jpeg;base64,AQID" });
    expect(await camera.pickImage({ limit: 1 })).toEqual([{ dataUrl: "data:image/jpeg;base64,AQID" }]);
    await settle();
    expect(state.calls).toEqual(["actionSheet", "takePhoto", "pickImages"]);
    expect(shell.releases).toEqual([photo.url, photo.url]);
  });

  test("a denied camera opens the settings, a closed sheet resolves, and any other error reaches the caller", async () => {
    installShell();
    const camera = await hookOf();

    state.photoError = new AkanNativeError("PERMISSION_DENIED", "no");
    expect(await camera.getPhoto("camera")).toBeUndefined();
    expect(state.calls).toEqual(["takePhoto", "openSettings"]);
    state.photoError = new AkanNativeError("CANCELLED", "closed");
    expect(await camera.pickImage()).toBeUndefined();
    state.photoError = new AkanNativeError("INTERNAL", "boom");
    await expect(camera.getPhoto("photos")).rejects.toMatchObject({ code: "INTERNAL" });
    state.calls.length = 0;
    expect(await camera.checkPermission()).toBe("denied");
    expect(state.calls).toEqual(["requestPermission", "openSettings"]);
  });
});
