export interface PushNotificationMessage {
  title: string;
  body: string;
  imageUrl?: string;
  url?: string;
  // Collapse key. Web notifications with the same tag replace each other; APNs/FCM collapse on the same value.
  tag?: string;
  badge?: number;
  data?: Record<string, string>;
}

export interface PushTarget {
  token: string;
  provider: "apns" | "fcm";
}

export interface PushSendResult {
  successCount: number;
  failureCount: number;
  // Tokens APNs or FCM reported as gone. The caller drops them so a device that was reinstalled is not retried forever.
  invalidTokens: string[];
}

export interface MessageOptions {
  android: {
    notification: { sound: "default"; defaultVibrateTimings: true; defaultSound: true; defaultLightSettings: true };
  };
}
