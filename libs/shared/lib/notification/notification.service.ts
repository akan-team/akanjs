import { PushNotificationServer } from "@libs/util/srvkit";
import { serve } from "akanjs/service";

import * as db from "../db";
import type * as srv from "../srv";

export class NotificationService extends serve(db.notification, ({ use, service, plug }) => ({
  fileService: service<srv.FileService>(),
  pushNotificationServer: plug(PushNotificationServer),
})) {
  //all_users 토픽에 구독
  async subscribeToSelf(token: string, userId: string) {
    const rst = await this.pushNotificationServer.subscribeToTopic(token, `user-${userId}`);
    return rst;
  }
  async unsubscribeToSelf(token: string, userId: string) {
    return await this.pushNotificationServer.unsubscribeFromTopic(token, `user-${userId}`);
  }
  async subscribeToMegaphone(token: string) {
    return await this.pushNotificationServer.subscribeToTopic(token, "all_users");
  }
  async unsubscribeToMegaphone(token: string) {
    return await this.pushNotificationServer.unsubscribeFromTopic(token, "all_users");
  }

  async sendPushNotification(notificationInput: db.NotificationInput) {
    const notification = await this.notificationModel.getNotification(notificationInput.id);
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
