import { modelDictionary } from "@akanjs/dictionary";

import type { Notification, NotificationInsight, NotificationType, NotiLevel } from "./notification.constant";
import type { NotificationFilter } from "./notification.document";
import type { NotificationEndpoint, NotificationSlice } from "./notification.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["Notification", "알림"]).desc([
      "Notification is a group of informations that is sent or going to be sent to the user. It is used for the user to be notified of the event, and the events can be accumulated and summarized by groups.",
      "알림은 사용자에게 전송되거나 전송될 정보의 집합입니다. 사용자에게 이벤트를 알리는 데 사용되며, 이벤트는 그룹별로 축적되고 요약될 수 있습니다.",
    ])
  )
  .model<Notification>((t) => ({
    token: t(["Token", "토큰"]).desc(["Token of the notification", "알림의 토큰"]),
    title: t(["Title", "제목"]).desc(["Title of the notification", "알림의 제목"]),
    content: t(["Content", "내용"]).desc(["Content of the notification", "알림의 내용"]),
    field: t(["Field", "필드"]).desc(["Field of the notification", "알림의 필드"]),
    image: t(["Image", "이미지"]).desc(["Image of the notification", "알림의 이미지"]),
    level: t(["Level", "레벨"]).desc(["Level of the notification", "알림의 레벨"]),
    type: t(["Type", "타입"]).desc(["Type of the notification", "알림의 타입"]),
  }))
  .insight<NotificationInsight>((t) => ({}))
  .query<NotificationFilter>((fn) => ({}))
  .enum<NotiLevel>("notiLevel", (t) => ({
    actionRequired: t(["Action Required", "필요한 조치"]).desc(["Action required notification", "필요한 조치 알림"]),
    notice: t(["Notice", "공지"]).desc(["Notice notification", "공지 알림"]),
    essential: t(["Essential", "필수"]).desc(["Essential notification", "필수 알림"]),
    suggestion: t(["Suggestion", "제안"]).desc(["Suggestion notification", "제안 알림"]),
    advertise: t(["Advertise", "광고"]).desc(["Advertise notification", "광고 알림"]),
  }))
  .enum<NotificationType>("notificationType", (t) => ({
    topic: t(["Topic", "토픽"]).desc(["Topic notification", "토픽 알림"]),
    token: t(["Token", "토큰"]).desc(["Token notification", "토큰 알림"]),
  }))
  .slice<NotificationSlice>((fn) => ({}))
  .endpoint<NotificationEndpoint>((fn) => ({
    subscribeToMegaphone: fn(["Subscribe to all users", "전체 사용자 구독"])
      .desc(["Subscribe to all users", "전체 사용자 구독"])
      .arg((t) => ({
        token: t(["Token", "토큰"]).desc(["Token of the notification", "알림의 토큰"]),
      })),
    sendPushNotification: fn(["Send push notification", "푸시 알림 전송"])
      .desc(["Send push notification", "푸시 알림 전송"])
      .arg((t) => ({
        notificationInput: t(["Notification input", "알림 입력"]).desc(["Notification input", "알림 입력"]),
      })),
    subscribeToSelf: fn(["Subscribe to self", "자신 구독"])
      .desc(["Subscribe to self", "자신 구독"])
      .arg((t) => ({
        token: t(["Token", "토큰"]).desc(["Token of the notification", "알림의 토큰"]),
      })),
  }));
