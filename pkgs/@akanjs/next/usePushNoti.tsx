"use client";
import { Device } from "@capacitor/device";
import { PushNotifications } from "@capacitor/push-notifications";
import { FCM } from "@capacitor-community/fcm";

export const usePushNoti = () => {
  const init = async () => {
    const device = await Device.getInfo();
    if (device.platform === "web") return;
    void FCM.setAutoInit({ enabled: true });
    void PushNotifications.requestPermissions().then(async (result) => {
      if (result.receive === "granted") {
        await PushNotifications.register();
      }
    });
  };

  const checkPermission = async () => {
    const { receive } = await PushNotifications.checkPermissions();
    return receive === "granted";
  };
  const register = async () => {
    const device = await Device.getInfo();
    if (device.platform === "web") return;
    const { receive } = await PushNotifications.checkPermissions();
    //푸시알림이 거절됐으면 앱 세팅으로 넘어감

    if (receive === "denied") location.assign("app-settings:");
    else await PushNotifications.register();
  };
  const getToken = async () => {
    const device = await Device.getInfo();
    if (device.platform === "web") return;
    const { token } = await FCM.getToken();
    return token;
  };

  return { init, checkPermission, register, getToken };
};
