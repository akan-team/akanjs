"use client";
import { Device, isNativeTarget, Translator } from "akanjs/client";
import { type CapacitorPermissionState, loadCapacitorCamera } from "akanjs/client/capacitor";
import { parseAkanI18nEnv } from "akanjs/common";
import { useEffect, useState } from "react";

type PermissionStatus = {
  camera: CapacitorPermissionState;
  photos: CapacitorPermissionState;
};

/** The four strings the native picker shows. Omitted ones come from the `base` dictionary. */
export interface CameraPromptLabels {
  header?: string;
  photo?: string;
  picture?: string;
  cancel?: string;
}

// The OS draws the picker from these strings, so they are translated here: there is no render to call `l()` in.
const promptLabel = (key: string, override?: string) =>
  override ?? Translator.translateByLocale(Translator.getActiveLocale() ?? parseAkanI18nEnv().defaultLocale, key);

/** `checkPermission` opens the app settings when camera or photo access is denied. */
export const useCamera = ({ promptLabels = {} }: { promptLabels?: CameraPromptLabels } = {}) => {
  const [permissions, setPermissions] = useState<PermissionStatus>({ camera: "prompt", photos: "prompt" });

  const checkPermission = async (type: "photos" | "camera" | "all") => {
    try {
      const { Camera } = await loadCapacitorCamera();
      if (type !== "all") {
        if (permissions[type] === "prompt") {
          const { [type]: state } = await Camera.requestPermissions();
          setPermissions((prev) => ({ ...prev, [type]: state }));
        } else if (permissions[type] === "denied") {
          location.assign("app-settings:");
          return;
        }
      } else {
        if (permissions.camera === "prompt" || permissions.photos === "prompt") {
          const permissions = await Camera.requestPermissions();
          setPermissions(permissions);
        } else if (permissions.camera === "denied" || permissions.photos === "denied") {
          location.assign("app-settings:");
          return;
        }
      }
    } catch {
      //
    }
  };

  const getPhoto = async (src: "prompt" | "camera" | "photos" = "prompt") => {
    const { Camera, CameraResultType, CameraSource } = await loadCapacitorCamera();
    const source =
      Device.getDevice().info.platform !== "web"
        ? src === "prompt"
          ? CameraSource.Prompt
          : src === "camera"
            ? CameraSource.Camera
            : CameraSource.Photos
        : CameraSource.Photos;
    const permission = src === "prompt" ? "all" : src === "camera" ? "camera" : "photos";
    await checkPermission(permission);
    try {
      const photo = await Camera.getPhoto({
        quality: 100,
        source,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        promptLabelHeader: promptLabel("base.cameraPromptHeader", promptLabels.header),
        promptLabelPhoto: promptLabel("base.cameraPromptPhoto", promptLabels.photo),
        promptLabelPicture: promptLabel("base.cameraPromptPicture", promptLabels.picture),
        promptLabelCancel: promptLabel("base.cameraPromptCancel", promptLabels.cancel),
      });
      return photo;
    } catch (e) {
      if (e === "User cancelled photos app") return;
    }
  };

  const pickImage = async () => {
    await checkPermission("photos");
    const { Camera } = await loadCapacitorCamera();
    const photo = await Camera.pickImages({
      quality: 90,
    });

    return photo;
  };

  useEffect(() => {
    void (async () => {
      if (!isNativeTarget()) return;
      try {
        const { Camera } = await loadCapacitorCamera();
        setPermissions(await Camera.checkPermissions());
      } catch {
        //? a mobile browser has no Capacitor Camera plugin, so the permissions stay at "prompt"
      }
    })();
  }, []);
  return { permissions, getPhoto, pickImage, checkPermission };
};
