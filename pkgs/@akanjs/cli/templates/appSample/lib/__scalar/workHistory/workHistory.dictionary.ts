import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return `import { scalarDictionary } from "akanjs/dictionary";

import type { WorkHistoryAction, WorkHistory } from "./workHistory.constant";

// ===== workHistory.dictionary.ts =====
// Convention: scalarDictionary() for scalar module i18n — fewer layers than modelDictionary().
// Scalar dictionaries define field labels and enum value labels only; no model/insight/query/sort layers.

export const dictionary = scalarDictionary(["en", "ko"])
  .model<WorkHistory>((t) => ({
    action: t(["Action", "작업"]).desc(["Type of work history event", "작업 이력 이벤트 유형"]),
    at: t(["At", "시간"]).desc(["When the event occurred", "이벤트 발생 시간"]),
    note: t(["Note", "메모"]).desc(["Optional note about the event", "이벤트에 대한 선택적 메모"]),
  }))
  .enum<WorkHistoryAction>("workHistoryAction", (t) => ({
    created: t(["Created", "생성됨"]).desc(["Task was created", "할 일이 생성됨"]),
    started: t(["Started", "시작됨"]).desc(["Task was started", "할 일이 시작됨"]),
    completed: t(["Completed", "완료됨"]).desc(["Task was completed", "할 일이 완료됨"]),
  }))
  .translate({});
`;
}
