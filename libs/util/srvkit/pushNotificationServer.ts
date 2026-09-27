import { adapt } from "akanjs/service";
import type { MulticastMessage, TokenMessage, TopicMessage } from "firebase-admin/messaging";

import { Err } from "../lib/dict";
import type { ModulesOptions } from "../lib/option";
import type { MessageOptions, PushNotificationMessage, PushSendResult } from "./pushNotificationServer.type";

type FirebaseAdmin = typeof import("firebase-admin");

let firebaseLoad: Promise<FirebaseAdmin> | null = null;

async function loadFirebase(): Promise<FirebaseAdmin> {
  firebaseLoad ??= import("firebase-admin").then((mod) => {
    const loaded = mod as unknown as { default?: FirebaseAdmin } & FirebaseAdmin;
    return loaded.default ?? loaded;
  });
  return await firebaseLoad;
}

// sendEachForMulticast rejects a batch larger than this.
const multicastBatchSize = 500;

// FCM answers with one of these when the device has uninstalled the app or cleared its site data.
const goneTokenCodes = ["messaging/registration-token-not-registered", "messaging/invalid-argument"];

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
    if (!this.firebase) return;
    const admin = await loadFirebase();
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: this.firebase.project_id,
          clientEmail: this.firebase.client_email,
          privateKey: this.firebase.private_key.replace(/\\n/g, "\n"),
        }),
      });
    }
  }

  // `onInit` only initializes the firebase app when credentials are configured, so without them `messaging()`
  // throws "the default Firebase app does not exist" — the same reason `send` checks.
  async subscribeToTopic(token: string, topic: string) {
    if (!this.firebase) return null;
    const admin = await loadFirebase();
    return await admin.messaging().subscribeToTopic(token, topic);
  }

  async unsubscribeFromTopic(token: string, topic: string) {
    if (!this.firebase) return null;
    const admin = await loadFirebase();
    return await admin.messaging().unsubscribeFromTopic(token, topic);
  }

  #getBaseMessage(badge: number): MessageOptions {
    return {
      android: {
        notification: { sound: "default", defaultVibrateTimings: true, defaultSound: true, defaultLightSettings: true },
      },
      apns: { payload: { aps: { sound: "default", badge } } },
    };
  }

  /**
   * The payload shared by every target. `data` carries the deep link and the badge count because the browser
   * service worker and the native click bridge both read them from there, and a `data` value must be a string.
   *
   * `webpush.notification` keys are passed verbatim to `showNotification`, so the image key is `image` — not the
   * `imageUrl` the other platform blocks use — and `tag` is what makes a second notification for the same
   * conversation replace the first instead of stacking.
   */
  #buildPayload({ title, body, imageUrl, url, tag, badge, data }: PushNotificationMessage) {
    const baseMessage = this.#getBaseMessage(badge ?? 1);
    const messageData = {
      ...(data ?? {}),
      ...(url ? { url } : {}),
      ...(tag ? { tag } : {}),
      ...(badge !== undefined ? { badgeCount: `${badge}` } : {}),
    };
    return {
      ...baseMessage,
      notification: { title, body, imageUrl },
      android: {
        ...baseMessage.android,
        notification: { ...baseMessage.android.notification, imageUrl, tag },
      },
      apns: {
        ...baseMessage.apns,
        payload: { ...baseMessage.apns.payload, aps: { ...baseMessage.apns.payload.aps, mutableContent: true } },
        ...(tag ? { headers: { "apns-collapse-id": tag } } : {}),
      },
      fcmOptions: {},
      webpush: {
        notification: { title, body, image: imageUrl, tag, renotify: !!tag },
        headers: { TTL: "86400" },
      },
      ...(Object.keys(messageData).length ? { data: messageData } : {}),
    };
  }

  #createPushNotificationMessage(message: PushNotificationMessage) {
    if (!message.token && !message.topic) throw new Err("util.error.pushNotificationTargetRequired");
    const payload = {
      ...this.#buildPayload(message),
      ...(message.token ? { token: message.token } : { topic: message.topic }),
    };
    return message.token ? (payload as TokenMessage) : (payload as TopicMessage);
  }

  async send(message: PushNotificationMessage) {
    if (!this.firebase) return;
    const generatedMessage = this.#createPushNotificationMessage(message);
    try {
      const admin = await loadFirebase();
      const sendId = await admin.messaging().send(generatedMessage);
      if (message.topic) this.logger.info(`Sent ${message.topic} to topic push notification.`);
      else this.logger.info(`Sent ${message.token} to token push notification.`);

      return sendId;
    } catch (error) {
      this.logger.error(`Error sending push notification: ${error}`);
      throw error;
    }
  }

  /**
   * One send per device, batched. Never throws: a notification is best effort, and the caller's own work must
   * not fail because a push did. The returned `invalidTokens` are the ones the caller has to stop storing.
   */
  async sendEach(tokens: string[], message: PushNotificationMessage): Promise<PushSendResult> {
    const result: PushSendResult = { successCount: 0, failureCount: 0, invalidTokens: [] };
    if (!this.firebase || !tokens.length) return result;
    const payload = this.#buildPayload(message);
    const admin = await loadFirebase();
    for (let offset = 0; offset < tokens.length; offset += multicastBatchSize) {
      const batch = tokens.slice(offset, offset + multicastBatchSize);
      try {
        const response = await admin
          .messaging()
          .sendEachForMulticast({ ...payload, tokens: batch } as MulticastMessage);
        result.successCount += response.successCount;
        result.failureCount += response.failureCount;
        response.responses.forEach((each, idx) => {
          const code = each.error?.code;
          if (!code) return;
          const token = batch[idx];
          if (token && goneTokenCodes.includes(code)) result.invalidTokens.push(token);
          else this.logger.warn(`Push failed for a token: ${code}`);
        });
      } catch (error) {
        result.failureCount += batch.length;
        this.logger.error(`Error sending multicast push notification: ${error}`);
      }
    }
    this.logger.info(`Pushed to ${result.successCount}/${tokens.length} devices, ${result.invalidTokens.length} gone.`);
    return result;
  }
}
