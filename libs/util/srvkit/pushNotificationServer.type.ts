export interface PushNotificationMessage {
  title: string;
  body: string;
  imageUrl?: string;
  token?: string;
  topic?: string;
  url?: string;
  data?: Record<string, string>;
}

export interface MessageOptions {
  android: {
    notification: { sound: "default"; defaultVibrateTimings: true; defaultSound: true; defaultLightSettings: true };
  };
  apns: { payload: { aps: { sound: "default"; badge: 1 } } };
}
