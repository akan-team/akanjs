import { beforeAll, expect, mock, test } from "bun:test";
import { AkanNativeError } from "@akanjs/native/core";

import { fakeReact, hooks } from "./hookHarness.fixture";

const loaded: string[] = [];
const photo = { url: "blob:https://shop.test/1", mime: "image/jpeg", size: 3 };

beforeAll(() => {
  mock.module("react", () =>
    fakeReact({
      useEffect: (fn: () => (() => undefined) | undefined) => {
        fn();
      },
      lazy: (loader: unknown) => ({ loader }),
    }),
  );
  mock.module("akanjs/client/native/camera", () => {
    loaded.push("camera");
    return { camera: { takePhoto: async () => photo, checkPermission: async () => ({ camera: "granted" }) } };
  });
  mock.module("./nativeCore", () => {
    loaded.push("core");
    return {
      AkanNativeError,
      fileBlob: async () => new Blob([new Uint8Array([1, 2, 3])]),
      releaseFile: async () => undefined,
    };
  });
});

test("on a web page, loads the camera plugin and core when asked for a photo, not when mounted", async () => {
  const { useCamera } = await import("./useCamera");
  hooks.index = 0;
  const camera = useCamera();
  await new Promise((resolve) => setTimeout(resolve, 5));

  expect(loaded).toEqual([]);
  expect(await camera.getPhoto()).toEqual({ dataUrl: "data:image/jpeg;base64,AQID" });
  expect(new Set(loaded)).toEqual(new Set(["camera", "core"]));
});
