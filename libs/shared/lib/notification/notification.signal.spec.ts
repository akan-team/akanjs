import { sampleOf } from "@akanjs/test";
import * as userSpec from "@shared/lib/user/user.signal.spec";

import * as cnst from "../cnst";

export const createNotification = async (
  adminAgent: userSpec.AdminAgent,
  userAgent: userSpec.UserAgent
): Promise<cnst.Notification> => {
  const notificationInput = sampleOf(cnst.NotificationInput);
  const notification = await adminAgent.fetch.createNotification(notificationInput);
  return notification;
};
