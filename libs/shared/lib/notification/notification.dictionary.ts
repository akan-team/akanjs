import { modelDictionary } from "akanjs/dictionary";

import type { Notification, NotificationInsight, NotificationType, NotiLevel } from "./notification.constant";
import type { NotificationFilter } from "./notification.document";
import type { NotificationEndpoint, NotificationSlice } from "./notification.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["Notification", "알림"]).desc([
      "Notification is a group of informations that is sent or going to be sent to the user. It is used for the user to be notified of the event, and the events can be accumulated and summarized by groups.",
      "알림은 사용자에게 전송되거나 전송될 정보의 집합입니다. 사용자에게 이벤트를 알리는 데 사용되며, 이벤트는 그룹별로 축적되고 요약될 수 있습니다.",
    ]),
  )
  .model<Notification>((t) => ({
    userId: t(["Recipient", "받는 사람"]).desc([
      "The user a single-recipient notification goes to",
      "한 사람에게 보내는 알림의 받는 사람",
    ]),
    title: t(["Title", "제목"]).desc(["Title of the notification", "알림의 제목"]),
    content: t(["Content", "내용"]).desc(["Content of the notification", "알림의 내용"]),
    url: t(["URL", "URL"]).desc(["URL of the notification", "알림의 URL"]),
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
    user: t(["One User", "한 사람"]).desc(["Sent to one user's devices", "한 사람의 기기로 보내는 알림"]),
    all: t(["All Users", "전체"]).desc(["Sent to every active user", "모든 활성 사용자에게 보내는 알림"]),
  }))
  .slice<NotificationSlice>((fn) => ({}))
  .endpoint<NotificationEndpoint>((fn) => ({
    sendPushNotification: fn(["Send push notification", "푸시 알림 전송"])
      .desc(["Send push notification", "푸시 알림 전송"])
      .arg((t) => ({
        notificationInput: t(["Notification input", "알림 입력"]).desc(["Notification input", "알림 입력"]),
      })),
  }))
  .error({})
  .translate({
    pushOnThisDevice: ["Push on this device", "이 기기에서 푸시 받기"],
    pushOnThisDeviceDesc: [
      "Ticket, chat and mention notifications arrive on this browser.",
      "티켓·채팅·멘션 알림을 이 브라우저로 받습니다.",
    ],
    pushUnsupported: ["This browser cannot receive push notifications.", "이 브라우저는 푸시 알림을 받을 수 없습니다."],
    pushDenied: [
      "Notifications are blocked. Allow them in the browser's site settings, then reload.",
      "알림이 차단되어 있습니다. 브라우저의 사이트 설정에서 허용한 뒤 새로고침하세요.",
    ],
    pushInstallForIos: [
      "On iPhone and iPad, add this site to the Home Screen first — Safari only delivers notifications to an installed app.",
      "아이폰·아이패드에서는 홈 화면에 먼저 추가해야 합니다. Safari 는 설치된 앱에만 알림을 보냅니다.",
    ],
    notiSetting: ["How much to notify", "알림 수신 범위"],
    setNotiSettingSuccess: ["Notification setting saved.", "알림 설정을 저장했습니다."],
  });
