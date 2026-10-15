import { adapt } from "akanjs/service";
import type { MulticastMessage } from "firebase-admin/messaging";

import type { ModulesOptions } from "../lib/option";
import { ApnsClient, type ApnsCredentials } from "./apnsClient";
import type {
  MessageOptions,
  PushNotificationMessage,
  PushSendResult,
  PushTarget,
} from "./pushNotificationServer.type";

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

// APNs streams share one HTTP/2 connection, which Apple caps well above this; the bound only keeps memory flat.
const apnsConcurrency = 100;

// FCM answers with one of these when the device has uninstalled the app or cleared its site data.
const goneTokenCodes = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"];

// FCM v1 sends this for a bad token and a bad payload alike: only a batch that also succeeded blames the token.
const ambiguousTokenCode = "messaging/invalid-argument";

interface FcmSendResponse {
  success: boolean;
  error?: { code: string };
}

export interface PushNotificationServerOptions {
  // Android and the web.
  firebase?: {
    type: string;
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
  };
  // iOS: the app sends APNs device tokens, and the server signs its own requests with the team's .p8 key.
  apns?: ApnsCredentials;
}

export class PushNotificationServer extends adapt("pushNotificationServer", ({ env }) => ({
  firebase: env((env: ModulesOptions) => env.pushNoti?.firebase),
  apns: env((env: ModulesOptions) => env.pushNoti?.apns),
})) {
  #apnsClient: ApnsClient | null = null;

  static classifyFcmBatch(batch: string[], responses: FcmSendResponse[]) {
    const isPayloadAccepted = responses.some(({ success }) => success);
    const goneTokens: string[] = [];
    const failureCounts = new Map<string, number>();
    responses.forEach(({ error }, idx) => {
      if (!error) return;
      const token = batch[idx];
      const isGone = goneTokenCodes.includes(error.code) || (isPayloadAccepted && error.code === ambiguousTokenCode);
      if (token && isGone) goneTokens.push(token);
      else failureCounts.set(error.code, (failureCounts.get(error.code) ?? 0) + 1);
    });
    return { goneTokens, failureCounts };
  }

  #warnFailures(provider: string, failureCounts: Map<string, number>, batchSize: number) {
    if (!failureCounts.size) return;
    const failedNum = [...failureCounts.values()].reduce((sum, count) => sum + count, 0);
    const summary = [...failureCounts].map(([key, count]) => `${key} x${count}`).join(", ");
    this.logger.warn(`${provider} push failed for ${failedNum}/${batchSize} tokens: ${summary}`);
  }

  override async onInit() {
    if (this.apns) this.#apnsClient = new ApnsClient(this.apns);
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

  override async onDestroy() {
    this.#apnsClient?.close();
  }

  #getBaseMessage(): MessageOptions {
    return {
      android: {
        notification: { sound: "default", defaultVibrateTimings: true, defaultSound: true, defaultLightSettings: true },
      },
    };
  }

  /**
   * The FCM payload shared by every Android and web target. `data` carries the deep link and the badge count
   * because the browser service worker and the native click bridge both read them from there, and a `data`
   * value must be a string.
   *
   * `webpush.notification` keys are passed verbatim to `showNotification`, so the image key is `image` — not the
   * `imageUrl` the other platform blocks use — and `tag` is what makes a second notification for the same
   * conversation replace the first instead of stacking.
   */
  #buildPayload({ title, body, imageUrl, url, tag, badge, data }: PushNotificationMessage) {
    const baseMessage = this.#getBaseMessage();
    const messageData = {
      ...(data ?? {}),
      ...(url ? { url } : {}),
      ...(tag ? { tag } : {}),
      ...(badge !== undefined ? { badgeCount: `${badge}` } : {}),
    };
    return {
      notification: { title, body, imageUrl },
      android: {
        ...baseMessage.android,
        notification: { ...baseMessage.android.notification, imageUrl, tag },
      },
      fcmOptions: {},
      webpush: {
        notification: { title, body, image: imageUrl, tag, renotify: !!tag },
        headers: { TTL: "86400" },
      },
      ...(Object.keys(messageData).length ? { data: messageData } : {}),
    };
  }

  /**
   * One send per device, batched, each through its token's provider. Never throws: a notification is best
   * effort, and the caller's own work must not fail because a push did. The returned `invalidTokens` are the
   * ones the caller has to stop storing.
   */
  async sendEach(targets: PushTarget[], message: PushNotificationMessage): Promise<PushSendResult> {
    const result: PushSendResult = { successCount: 0, failureCount: 0, invalidTokens: [] };
    const fcmTokens = targets.filter(({ provider }) => provider === "fcm").map(({ token }) => token);
    const apnsTokens = targets.filter(({ provider }) => provider === "apns").map(({ token }) => token);
    await Promise.all([this.#sendFcm(fcmTokens, message, result), this.#sendApns(apnsTokens, message, result)]);
    if (targets.length)
      this.logger.info(
        `Pushed to ${result.successCount}/${targets.length} devices, ${result.invalidTokens.length} gone.`,
      );
    return result;
  }

  async #sendFcm(tokens: string[], message: PushNotificationMessage, result: PushSendResult) {
    if (!tokens.length) return;
    if (!this.firebase) {
      result.failureCount += tokens.length;
      this.logger.warn(`Skipped ${tokens.length} FCM tokens: pushNoti.firebase is not configured.`);
      return;
    }
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
        const { goneTokens, failureCounts } = PushNotificationServer.classifyFcmBatch(batch, response.responses);
        result.invalidTokens.push(...goneTokens);
        this.#warnFailures("FCM", failureCounts, batch.length);
      } catch (error) {
        result.failureCount += batch.length;
        this.logger.error(`Error sending multicast push notification: ${error}`);
      }
    }
  }

  async #sendApns(tokens: string[], message: PushNotificationMessage, result: PushSendResult) {
    if (!tokens.length) return;
    const client = this.#apnsClient;
    if (!client) {
      result.failureCount += tokens.length;
      this.logger.warn(`Skipped ${tokens.length} APNs tokens: pushNoti.apns is not configured.`);
      return;
    }
    for (let offset = 0; offset < tokens.length; offset += apnsConcurrency) {
      const batch = tokens.slice(offset, offset + apnsConcurrency);
      const responses = await Promise.all(batch.map((token) => client.send(token, message)));
      const failureCounts = new Map<string, number>();
      responses.forEach((response, idx) => {
        if (response.ok) {
          result.successCount += 1;
          return;
        }
        result.failureCount += 1;
        const token = batch[idx];
        if (token && ApnsClient.isGone(response)) result.invalidTokens.push(token);
        else {
          const key = `${response.status} ${response.reason}`;
          failureCounts.set(key, (failureCounts.get(key) ?? 0) + 1);
        }
      });
      this.#warnFailures("APNs", failureCounts, batch.length);
    }
  }
}
