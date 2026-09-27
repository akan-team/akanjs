import type * as userSpec from "@libs/shared/lib/user/user.signal.spec";
import { sampleOf } from "akanjs/test";

import * as cnst from "../cnst";

export const createNotification = async (
  adminAgent: userSpec.AdminAgent,
  _userAgent?: userSpec.UserAgent,
): Promise<cnst.Notification> => {
  const notificationInput = sampleOf(cnst.NotificationInput);
  const notification = await adminAgent.fetch.createNotification(notificationInput);
  return notification;
};

export const notiInfoOf = (
  setting: cnst.NotiSetting["value"],
  tokens: string[],
  pauseUntil?: cnst.NotiInfo["pauseUntil"],
): cnst.NotiInfo =>
  new cnst.NotiInfo().set({
    setting,
    deviceTokens: tokens.map((token) => new cnst.DeviceToken().set({ token })),
    pauseUntil,
  });
