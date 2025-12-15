import { scalarDictionary } from "@akanjs/dictionary";

import type { RestrictInfo } from "./restrictInfo.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Restrict Info", "제한 정보"]).desc(["Restrict Info", "제한 정보"]))
  .model<RestrictInfo>((t) => ({
    until: t(["Until", "일시"]).desc(["Until", "일시"]),
    reason: t(["Reason", "사유"]).desc(["Reason", "사유"]),
  }));
