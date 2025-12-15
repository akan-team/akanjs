import { modelDictionary } from "@akanjs/dictionary";

import type { Setting, SettingInsight } from "./setting.constant";
import type { SettingFilter } from "./setting.document";
import type { SettingEndpoint, SettingSlice } from "./setting.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["Setting", "설정"]).desc([
      "Setting is a system setting that is controll and manage the metrics of the system and the service.",
      "설정은 시스템과 서비스의 지표를 제어하고 관리하는 시스템 설정입니다.",
    ])
  )
  .model<Setting>((t) => ({
    resignupDays: t(["Re-signup Days", "재가입 기간(일)"]).desc([
      "The number of days to allow re-signup",
      "재가입을 허용할 일수",
    ]),
  }))
  .insight<SettingInsight>((t) => ({}))
  .query<SettingFilter>((fn) => ({}))
  .slice<SettingSlice>((fn) => ({}))
  .endpoint<SettingEndpoint>((fn) => ({
    getActiveSetting: fn(["Get Active Setting", "활성 설정 가져오기"]).desc([
      "Get the active setting from the API",
      "API에서 활성 설정 가져오기",
    ]),
    helloAkanJs: fn(["Hello Akan js!", "안녕하세요 Akan js!"]).desc([
      "request to hello Akan js!",
      "Akan js에게 인사를 요청합니다.",
    ]),
  }))
  .translate({
    updateSuccessMsg: ["Setting updated successfully", "설정이 성공적으로 업데이트되었습니다."],
  });
