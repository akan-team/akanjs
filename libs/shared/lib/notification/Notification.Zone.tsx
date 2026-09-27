"use client";
import { st } from "@libs/shared/client";
import { type PushToken, usePushNotification } from "@libs/util/webkit";
import { useEffect } from "react";

interface InitializeProps {
  onPushToken?: (pushToken: PushToken) => Promise<void> | void;
}

/**
 * Re-registers the device on every visit, and never asks for permission: an FCM token is rotated by the
 * browser and dropped on a reinstall, so a token stored once goes stale on its own. The permission prompt
 * belongs to the switch on the settings page — Chrome ignores a request with no gesture behind it and iOS
 * throws, so asking here would only ever fail.
 */
export const Initialize = ({ onPushToken }: InitializeProps) => {
  const pushNotification = usePushNotification();

  useEffect(() => {
    const initialize = async () => {
      const permission = await pushNotification.getPermission();
      if (permission !== "granted") {
        await st.do.loadPushState(null, permission);
        return;
      }
      const pushToken = await pushNotification.getToken();
      if (!pushToken) {
        await st.do.loadPushState(null, "granted");
        return;
      }
      if (onPushToken) {
        await onPushToken(pushToken);
        return;
      }
      await st.do.registerPushToken(pushToken.token);
    };
    void initialize();
  }, [onPushToken]);

  return null;
};
