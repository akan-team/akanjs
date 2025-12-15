import { scalarDictionary } from "@akanjs/dictionary";

import type { NotiInfo, NotiSetting } from "./notiInfo.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Noti Info", "알림 정보"]).desc(["Noti Info", "알림 정보"]))
  .model<NotiInfo>((t) => ({
    setting: t(["Setting", "설정"]).desc(["Setting", "설정"]),
    pauseUntil: t(["Pause Until", "일시 중지"]).desc(["Pause Until", "일시 중지"]),
    deviceTokens: t(["Device Tokens", "디바이스 토큰"]).desc(["Device Tokens", "디바이스 토큰"]),
  }))
  .enum<NotiSetting>("notiSetting", (t) => ({
    disagree: t(["Disagree", "동의 안함"]).desc(["Disagree notification setting", "동의 안함 알림 설정"]),
    fewer: t(["Fewer", "적음"]).desc(["Fewer notification setting", "적음 알림 설정"]),
    normal: t(["Normal", "일반"]).desc(["Normal notification setting", "일반 알림 설정"]),
    block: t(["Block", "차단"]).desc(["Block notification setting", "차단 알림 설정"]),
  }));
