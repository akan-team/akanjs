"use client";
import { Binary } from "akanjs/base";
import { isNativeApp, Translator } from "akanjs/client";
import type { Photo } from "akanjs/client/native";
import { parseAkanI18nEnv } from "akanjs/common";
import { useEffect, useState } from "react";

type PermissionState = "granted" | "denied" | "prompt";

/** The four strings the camera-or-library sheet shows. Omitted ones come from the `base` dictionary. */
export interface CameraPromptLabels {
  header?: string;
  photo?: string;
  picture?: string;
  cancel?: string;
}

// The OS draws the sheet from these strings, so they are translated here: there is no render to call `l()` in.
const promptLabel = (key: string, override?: string) =>
  override ?? Translator.translateByLocale(Translator.getActiveLocale() ?? parseAkanI18nEnv().defaultLocale, key);

//? Each imported dynamically: a static import puts @akanjs/native/core on every web page that renders this hook.
const loadCamera = () => import("akanjs/client/native/camera");
const loadCore = () => import("./nativeCore");
const openSettings = async () => await (await import("akanjs/client/native/opener")).opener.openSettings();
type NativeCore = Awaited<ReturnType<typeof loadCore>>;
const loadForPhotos = async () => {
  const [{ camera }, core] = await Promise.all([loadCamera(), loadCore()]);
  return { camera, core };
};

//* The runtime serves a photo from memory until it is released, so it is read once and let go.
const toDataUrl = async ({ fileBlob, releaseFile }: NativeCore, photo: Photo) => {
  try {
    const bytes = new Uint8Array(await (await fileBlob(photo)).arrayBuffer());
    return { dataUrl: `data:${photo.mime};base64,${Binary.toBase64(bytes)}` };
  } finally {
    void releaseFile(photo).catch(() => undefined);
  }
};

/** Photos arrive as upright JPEG data URLs; a denied camera opens the app settings instead of resolving. */
export const useCamera = ({ promptLabels = {} }: { promptLabels?: CameraPromptLabels } = {}) => {
  const [permissions, setPermissions] = useState<{ camera: PermissionState }>({ camera: "prompt" });

  const openSettingsWhenDenied = async ({ AkanNativeError }: NativeCore, error: unknown) => {
    const code = AkanNativeError.from(error).code;
    if (code === "CANCELLED") return;
    if (code !== "PERMISSION_DENIED") throw error;
    setPermissions({ camera: "denied" });
    await openSettings();
  };

  const checkPermission = async () => {
    if (!isNativeApp()) return permissions.camera;
    const { camera } = await loadCamera();
    const { camera: state } = await camera.requestPermission();
    setPermissions({ camera: state });
    if (state === "denied") await openSettings();
    return state;
  };

  const chooseSource = async (): Promise<"camera" | "library" | null> => {
    const { dialog } = await import("akanjs/client/native/dialog");
    const { index } = await dialog.actionSheet({
      title: promptLabel("base.cameraPromptHeader", promptLabels.header),
      options: [
        { title: promptLabel("base.cameraPromptPhoto", promptLabels.photo) },
        { title: promptLabel("base.cameraPromptPicture", promptLabels.picture) },
        { title: promptLabel("base.cameraPromptCancel", promptLabels.cancel), style: "cancel" },
      ],
    });
    return index === 0 ? "library" : index === 1 ? "camera" : null;
  };

  const getPhoto = async (src: "prompt" | "camera" | "photos" = "prompt") => {
    const source = !isNativeApp() || src === "photos" ? "library" : src === "camera" ? "camera" : await chooseSource();
    if (!source) return;
    const { camera, core } = await loadForPhotos();
    try {
      return await toDataUrl(core, await camera.takePhoto({ source }));
    } catch (error) {
      await openSettingsWhenDenied(core, error);
    }
  };

  const pickImage = async ({ limit }: { limit?: number } = {}) => {
    const { camera, core } = await loadForPhotos();
    try {
      const { photos } = await camera.pickImages(limit ? { limit } : {});
      return await Promise.all(photos.map((photo) => toDataUrl(core, photo)));
    } catch (error) {
      await openSettingsWhenDenied(core, error);
    }
  };

  useEffect(() => {
    //? Fetched at mount: on the web takePhoto clicks a file input, which the browser allows only shortly after a tap.
    void loadForPhotos()
      .then(async ({ camera }) => {
        if (!isNativeApp()) return;
        const { camera: state } = await camera.checkPermission();
        setPermissions({ camera: state });
      })
      .catch(() => undefined);
  }, []);
  return { permissions, getPhoto, pickImage, checkPermission };
};
