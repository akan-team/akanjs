// A namespace import: under React Server Components (react-server) react has no hooks, and named
// imports of them would fail when this module is linked (docs/api.md, O2-3).
import * as React from "react";
import { AkanNativeError, definePlugin, type FileRef } from "../../../packages/core/src/index.ts";
import { web } from "./web.ts";

export type PermissionState = "granted" | "denied" | "prompt";

/*
 * Every photo arrives as an upright JPEG (akanjs review R9: pages cannot decode HEIC, and crop steps
 * need one format). A photo that already is an upright JPEG within maxWidth × maxHeight is passed on
 * as it is unless `quality` is given; any other one is decoded, turned upright, scaled down to fit
 * (keeping its aspect ratio), put on white where it is transparent, and encoded as JPEG. On the web, a
 * file the browser cannot decode (HEIC outside Safari) is passed on as it is.
 */

export interface TakePhotoOptions {
  /** "camera" (default) captures a new photo, "library" picks an existing one. */
  source?: "camera" | "library";
  direction?: "rear" | "front";
  /** JPEG quality 1-100 when the photo is encoded. Default 90. */
  quality?: number;
  /** Largest width in pixels. Default: none. */
  maxWidth?: number;
  /** Largest height in pixels. Default: none. */
  maxHeight?: number;
}

/** A photo served by the host (`/__akan_native/file/<id>`) or, on the web, a blob: URL. Always image/jpeg (see above). */
export interface Photo extends FileRef {
  width?: number;
  height?: number;
}

export interface PickImagesOptions {
  /** Maximum number of images, 1–20. Default 10. */
  limit?: number;
  /** JPEG quality 1-100 when a photo is encoded. Default 90. */
  quality?: number;
  /** Largest width in pixels. Default: none. */
  maxWidth?: number;
  /** Largest height in pixels. Default: none. */
  maxHeight?: number;
}

export interface CameraApi {
  takePhoto(options?: TakePhotoOptions): Promise<Photo>;
  /** Picks existing images from the library; no permission needed on iOS and Android. */
  pickImages(options?: PickImagesOptions): Promise<{ photos: Photo[] }>;
  /** Saves a photo (a FileRef URL from this app) to the device's photo library. */
  saveToGallery(args: { url: string }): Promise<void>;
  checkPermission(): Promise<{ camera: PermissionState }>;
  requestPermission(): Promise<{ camera: PermissionState }>;
}

export const camera = definePlugin<CameraApi>("camera", {
  methods: ["takePhoto", "pickImages", "saveToGallery", "checkPermission", "requestPermission"],
  web,
});

export interface UseCamera {
  supported: boolean;
  photo: Photo | null;
  pending: boolean;
  /** Last failure. A cancelled capture is not an error and leaves this null. */
  error: AkanNativeError | null;
  takePhoto(options?: TakePhotoOptions): Promise<Photo | null>;
}

export function useCamera(): UseCamera {
  const [photo, setPhoto] = React.useState<Photo | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<AkanNativeError | null>(null);

  const takePhoto = React.useCallback(async (options?: TakePhotoOptions) => {
    setPending(true);
    setError(null);
    try {
      // Called before any await so web implementations keep the click's user activation.
      const result = await camera.takePhoto(options);
      setPhoto(result);
      return result;
    } catch (e) {
      const err = AkanNativeError.from(e);
      if (err.code !== "CANCELLED") setError(err);
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  return { supported: camera.isSupported("takePhoto"), photo, pending, error, takePhoto };
}
