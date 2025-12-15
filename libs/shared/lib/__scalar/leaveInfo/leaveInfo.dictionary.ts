import { scalarDictionary } from "@akanjs/dictionary";

import type { LeaveInfo, LeaveType } from "./leaveInfo.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Leave Info", "탈퇴 정보"]).desc(["Leave Info", "탈퇴 정보"]))
  .model<LeaveInfo>((t) => ({
    type: t(["Type", "타입"]).desc(["Type", "타입"]),
    reason: t(["Reason", "사유"]).desc(["Reason", "사유"]),
    satisfaction: t(["Satisfaction", "만족도"]).desc(["Satisfaction", "만족도"]),
    voc: t(["VOC", "VOC"]).desc(["VOC", "VOC"]),
    at: t(["At", "일시"]).desc(["At", "일시"]),
  }))
  .enum<LeaveType>("leaveType", (t) => ({
    noReply: t(["No Reply", "답변 없음"]).desc(["No Reply", "답변 없음"]),
    comeback: t(["Comeback", "복귀"]).desc(["Comeback", "복귀"]),
    unsatisfied: t(["Unsatisfied", "불만족"]).desc(["Unsatisfied", "불만족"]),
    other: t(["Other", "기타"]).desc(["Other", "기타"]),
  }));
