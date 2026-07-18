import { adapt } from "akanjs/service";
import admin from "firebase-admin";
import type { TokenMessage, TopicMessage } from "firebase-admin/messaging";

export interface PushNotificationMessage {
  title: string;
  body: string;
  imageUrl?: string;
  token?: string;
  topic?: string;
  url?: string;
  data?: Record<string, string>;
}

interface PushNotificationServerOptions {
  firebase: {
    type: string;
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
  };
}

interface MessageOptions {
  android: {
    notification: { sound: "default"; defaultVibrateTimings: true; defaultSound: true; defaultLightSettings: true };
  };
  apns: { payload: { aps: { sound: "default"; badge: 1 } } };
}
function getBaseMessage(): MessageOptions {
  return {
    android: {
      notification: { sound: "default", defaultVibrateTimings: true, defaultSound: true, defaultLightSettings: true },
    },
    apns: { payload: { aps: { sound: "default", badge: 1 } } },
  };
}

export function createPushNotificationMessage({
  title,
  body,
  token,
  topic,
  data,
  url,
  imageUrl,
}: PushNotificationMessage) {
  if (!token && !topic) throw new Error("Push notification target token or topic is required.");
  const messageData = data || url ? { ...(data ?? {}), ...(url ? { url } : {}) } : undefined;
  const target = token ? { token } : { topic };
  const baseMessage = getBaseMessage();
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

export class PushNotificationServer extends adapt("pushNotificationServer", ({ env }) => ({
  firebase: env((env: PushNotificationServerOptions) => env.firebase),
})) {
  async subscribeToTopic(token: string, topic: string) {
    return await admin.messaging().subscribeToTopic(token, topic);
  }

  async unsubscribeFromTopic(token: string, topic: string) {
    return await admin.messaging().unsubscribeFromTopic(token, topic);
  }

  async send(message: PushNotificationMessage) {
    const generatedMessage = createPushNotificationMessage(message);
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
