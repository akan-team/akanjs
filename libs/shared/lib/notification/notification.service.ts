import { PushNotificationServer } from "@libs/util/srvkit";
import { serve } from "akanjs/service";

import * as db from "../db";
import type * as srv from "../srv";

export class NotificationService extends serve(db.notification, ({ use, service, plug }) => ({
  fileService: service<srv.FileService>(),
  pushNotificationServer: plug(PushNotificationServer),
})) {
  async sendPushNotification(notificationInput: db.NotificationInput) {
    const notification = await this.notificationModel.createNotification(notificationInput);
    const image = notification.image ? await this.fileService.getFile(notification.image) : null;

    await this.pushNotificationServer.send({
      title: notification.title,
      body: notification.content,
      imageUrl: image ? image.url : undefined,
      url: notification.url,
      ...(notification.type === "token" ? { token: notification.token } : { topic: notification.token }),
    });

    return notification;
  }
}
