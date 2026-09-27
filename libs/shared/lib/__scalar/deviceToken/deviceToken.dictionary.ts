import { scalarDictionary } from "akanjs/dictionary";

import type { DevicePlatform, DeviceToken, PushProvider } from "./deviceToken.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Device Token", "기기 토큰"]).desc(["A device's push address", "기기의 푸시 수신 주소"]))
  .model<DeviceToken>((t) => ({
    token: t(["Token", "토큰"]).desc([
      "The APNs device token or FCM registration token",
      "APNs 기기 토큰 또는 FCM 등록 토큰",
    ]),
    provider: t(["Provider", "발송 경로"]).desc(["The service the push goes through", "푸시가 거쳐 가는 서비스"]),
    platform: t(["Platform", "플랫폼"]).desc(["The platform of the device", "기기의 플랫폼"]),
    deviceId: t(["Device ID", "기기 ID"]).desc(["The installation the token belongs to", "토큰이 속한 설치본"]),
    updatedAt: t(["Updated At", "갱신 시각"]).desc([
      "When the device last registered the token",
      "기기가 토큰을 마지막으로 등록한 시각",
    ]),
  }))
  .enum<PushProvider>("pushProvider", (t) => ({
    apns: t(["APNs", "APNs"]).desc(["Apple Push Notification service", "Apple 푸시 알림 서비스"]),
    fcm: t(["FCM", "FCM"]).desc(["Firebase Cloud Messaging", "Firebase 클라우드 메시징"]),
  }))
  .enum<DevicePlatform>("devicePlatform", (t) => ({
    ios: t(["iOS", "iOS"]).desc(["The iOS app", "iOS 앱"]),
    android: t(["Android", "Android"]).desc(["The Android app", "Android 앱"]),
    web: t(["Web", "웹"]).desc(["A browser", "브라우저"]),
  }));
