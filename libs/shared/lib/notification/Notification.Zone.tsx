"use client";
import { type PushToken, usePushNotification } from "@libs/util/webkit";
import { useEffect } from "react";

interface InitializeProps {
  onPushToken?: (pushToken: PushToken) => Promise<void> | void;
}

export const Initialize = ({ onPushToken }: InitializeProps) => {
  const pushNotification = usePushNotification();

  useEffect(() => {
    const initialize = async () => {
      const pushToken = await pushNotification.getToken();
      if (!pushToken) return;
      await onPushToken?.(pushToken);
    };
    void initialize();
  }, [onPushToken]);

  return <></>;
};
