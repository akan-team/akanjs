import { scalarDictionary } from "@akanjs/dictionary";

import type { AccessStat } from "./accessStat.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Access Statistics", "액세스 통계"]).desc(["Access statistics information", "액세스 통계 정보"]))
  .model<AccessStat>((t) => ({
    request: t(["Request", "요청"]).desc(["Number of requests", "요청 수"]),
    device: t(["Device", "디바이스"]).desc(["Number of devices", "디바이스 수"]),
    ip: t(["IP", "아이피"]).desc(["Number of unique IPs", "고유 IP 수"]),
    country: t(["Country", "국가"]).desc(["Number of countries", "국가 수"]),
  }));
