import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return `import { serviceDictionary } from "akanjs/dictionary";
import type { NotiEndpoint } from "./noti.signal";

// ===== noti.dictionary.ts =====
// Convention: <module>.dictionary.ts for a pure service module.
// Uses serviceDictionary(["en", "ko"]) from akanjs/dictionary — the framework convention for service dictionaries.
// Unlike modelDictionary, no model/lightModel/query/sort/enum sections (service modules have no DB model).
// Sections: .endpoint() for signal endpoint names, .translate() for UI messages.
// Registered by akan sync into dict.ts barrel.

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<NotiEndpoint>((fn) => ({
    send: fn(["Send Notification", "알림 보내기"]),
  }))
  .translate({
    notiReceived: ["New notification", "새 알림이 도착했습니다"],
    notiMarkAllRead: ["Mark all as read", "모두 읽음으로 표시"],
  });
`;
}
