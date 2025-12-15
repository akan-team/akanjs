"use client";
import { device } from "@akanjs/client";
import { Camera, CameraResultType, CameraSource, PermissionStatus } from "@capacitor/camera";
import { useEffect, useState } from "react";
import { isMobile } from "react-device-detect";

export const useCamera = () => {
  const [permissions, setPermissions] = useState<PermissionStatus>({ camera: "prompt", photos: "prompt" });

  /**
   * 최초로 킬 경우 권한은 prompt 상태이다.
   * prompt 상태일 경우 권한을 요청한다.
   * 권한이 denied 상태일 경우 설정으로 이동한다.
   * 이후 state의 permission을 업데이트해야한다.
   *
   */
  const checkPermission = async (type: "photos" | "camera" | "all") => {
    try {
      if (type === "photos") {
        if (permissions.photos === "prompt") {
          const { photos } = await Camera.requestPermissions();
          setPermissions((prev) => ({ ...prev, photos }));
        } else if (permissions.photos === "denied") {
          location.assign("app-settings:");
          return;
        }
      } else if (type === "camera") {
        if (permissions.camera === "prompt") {
          const { camera } = await Camera.requestPermissions();
          setPermissions((prev) => ({ ...prev, camera }));
        } else if (permissions.camera === "denied") {
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
    } catch (e) {
      //
    }
  };

  const getPhoto = async (src: "prompt" | "camera" | "photos" = "prompt") => {
    const source =
      device.info.platform !== "web"
        ? src === "prompt"
          ? CameraSource.Prompt
          : src === "camera"
            ? CameraSource.Camera
            : CameraSource.Photos
        : CameraSource.Photos;
    const permission = src === "prompt" ? "all" : src === "camera" ? "camera" : "photos";
    void checkPermission(permission);
    try {
      const photo = await Camera.getPhoto({
        quality: 100,
        source,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        promptLabelHeader: "프로필 사진을 올려주세요",
        promptLabelPhoto: "앨범에서 선택하기",
        promptLabelPicture: "사진 찍기",
        promptLabelCancel: "취소",
      });
      return photo;
    } catch (e) {
      if (e === "User cancelled photos app") return;
    }
  };

  const pickImage = async () => {
    void checkPermission("photos");
    const photo = await Camera.pickImages({
      quality: 90,
    });

    return photo;
  };

  useEffect(() => {
    void (async () => {
      if (isMobile) {
        const permissions = await Camera.checkPermissions();
        setPermissions(permissions);
      }
    })();
  }, []);
  return { permissions, getPhoto, pickImage, checkPermission };
};
