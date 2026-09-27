"use client";
import { Translator } from "akanjs/client";
import {
  AkanNativeError,
  dialog,
  fileBlob,
  isNativeApp,
  loadCamera,
  opener,
  type Photo,
  releaseFile,
} from "akanjs/client/native";
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

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
};

//* The runtime serves a photo from memory until it is released, so it is read once and let go.
const toDataUrl = async (photo: Photo) => {
  try {
    const bytes = new Uint8Array(await (await fileBlob(photo)).arrayBuffer());
    return { dataUrl: `data:${photo.mime};base64,${toBase64(bytes)}` };
  } finally {
    void releaseFile(photo).catch(() => undefined);
  }
};

/** Photos arrive as upright JPEG data URLs; a denied camera opens the app settings instead of resolving. */
export const useCamera = ({ promptLabels = {} }: { promptLabels?: CameraPromptLabels } = {}) => {
  const [permissions, setPermissions] = useState<{ camera: PermissionState }>({ camera: "prompt" });

  const openSettingsWhenDenied = async (error: unknown) => {
    const code = AkanNativeError.from(error).code;
    if (code === "CANCELLED") return;
    if (code !== "PERMISSION_DENIED") throw error;
    setPermissions({ camera: "denied" });
    await opener.openSettings();
  };

  const checkPermission = async () => {
    if (!isNativeApp()) return permissions.camera;
    const { camera } = await loadCamera();
    const { camera: state } = await camera.requestPermission();
    setPermissions({ camera: state });
    if (state === "denied") await opener.openSettings();
    return state;
  };

  const chooseSource = async (): Promise<"camera" | "library" | null> => {
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
    const { camera } = await loadCamera();
    try {
      return await toDataUrl(await camera.takePhoto({ source }));
    } catch (error) {
      await openSettingsWhenDenied(error);
    }
  };

  const pickImage = async ({ limit }: { limit?: number } = {}) => {
    const { camera } = await loadCamera();
    try {
      const { photos } = await camera.pickImages(limit ? { limit } : {});
      return await Promise.all(photos.map(toDataUrl));
    } catch (error) {
      await openSettingsWhenDenied(error);
    }
  };

  useEffect(() => {
    if (!isNativeApp()) return;
    void loadCamera()
      .then(({ camera }) => camera.checkPermission())
      .then(({ camera: state }) => setPermissions({ camera: state }))
      .catch(() => undefined);
  }, []);
  return { permissions, getPhoto, pickImage, checkPermission };
};
