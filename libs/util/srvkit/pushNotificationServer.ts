import { adapt } from "akanjs/service";
import admin from "firebase-admin";
import type { TokenMessage, TopicMessage } from "firebase-admin/messaging";

import { Err } from "../lib/dict";
import type { ModulesOptions } from "../lib/option";
import type { MessageOptions, PushNotificationMessage } from "./pushNotificationServer.type";

export interface PushNotificationServerOptions {
  firebase: {
    type: string;
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
  };
}

export class PushNotificationServer extends adapt("pushNotificationServer", ({ env }) => ({
  firebase: env((env: ModulesOptions) => env.pushNoti?.firebase),
})) {
  override async onInit() {
    if (admin.apps.length === 0 && this.firebase) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: this.firebase.project_id,
          clientEmail: this.firebase.client_email,
          privateKey: this.firebase.private_key.replace(/\\n/g, "\n"),
        }),
      });
    }
  }

  async subscribeToTopic(token: string, topic: string) {
    return await admin.messaging().subscribeToTopic(token, topic);
  }

  async unsubscribeFromTopic(token: string, topic: string) {
    return await admin.messaging().unsubscribeFromTopic(token, topic);
  }

  private getBaseMessage(): MessageOptions {
    return {
      android: {
        notification: { sound: "default", defaultVibrateTimings: true, defaultSound: true, defaultLightSettings: true },
      },
      apns: { payload: { aps: { sound: "default", badge: 1 } } },
    };
  }

  private createPushNotificationMessage({ title, body, token, topic, data, url, imageUrl }: PushNotificationMessage) {
    if (!token && !topic) throw new Err("util.error.pushNotificationTargetRequired");
    const messageData = data || url ? { ...(data ?? {}), ...(url ? { url } : {}) } : undefined;
    const target = token ? { token } : { topic };
    const baseMessage = this.getBaseMessage();
    const message = {
      ...baseMessage,
      notification: { title, body, imageUrl },
      android: { ...baseMessage.android, notification: { ...baseMessage.android.notification, imageUrl } },
      apns: {
        ...baseMessage.apns,
        payload: { ...baseMessage.apns.payload, aps: { ...baseMessage.apns.payload.aps, mutableContent: true } },
      },
      fcmOptions: {},
      webpush: {
        notification: {
          title,
          body,
          imageUrl,
        },
        headers: {
          TTL: "86400",
        },
      },
      ...target,
      ...(messageData ? { data: messageData } : {}),
    };

    return token ? (message as TokenMessage) : (message as TopicMessage);
  }

  async send(message: PushNotificationMessage) {
    if (!this.firebase) return;
    const generatedMessage = this.createPushNotificationMessage(message);
    try {
      const sendId = await admin.messaging().send(generatedMessage);
      if (message.topic) this.logger.log(`Sent ${message.topic} to topic push notification.`);
      else this.logger.log(`Sent ${message.token} to token push notification.`);

      return sendId;
    } catch (error) {
      this.logger.error(`Error sending push notification: ${error}`);
      throw error;
    }
  }
}
