import { serve } from "@akanjs/service";
import type { FirebaseApi as FirebaseApiType } from "@util/nest";

import * as db from "../db";
import type * as srv from "../srv";

export class NotificationService extends serve(db.notification, ({ use, service }) => ({
  fileService: service<srv.FileService>(),
  firebaseApi: use<FirebaseApiType>(),
})) {
  //all_users 토픽에 구독
  async subscribeToSelf(token: string, userId: string) {
    const rst = await this.firebaseApi.subscribeToTopic(token, `user-${userId}`);
    return rst;
  }
  async unsubscribeToSelf(token: string, userId: string) {
    return await this.firebaseApi.unsubscribeFromTopic(token, `user-${userId}`);
  }
  async subscribeToMegaphone(token: string) {
    return await this.firebaseApi.subscribeToTopic(token, "all_users");
  }
  async unsubscribeToMegaphone(token: string) {
    return await this.firebaseApi.unsubscribeFromTopic(token, "all_users");
  }

  async sendPushNotification(notificationInput: db.NotificationInput) {
    const notification = await this.notificationModel.createNotification(notificationInput);
    const image = notification.image ? await this.fileService.getFile(notification.image) : null;

    await this.firebaseApi.send({
      title: notification.title,
      body: notification.content,
      imageUrl: image ? image.url : undefined,
      ...(notification.type === "token" ? { token: notification.token } : { topic: notification.token }),
    });

    return notification;
  }
}
