import { scalarDictionary } from "akanjs/dictionary";

import type { InsightRows } from "./insightRows.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) =>
    t(["Insight Rows", "인사이트 결과"]).desc(["The answer to one read-only query", "읽기 전용 질의 하나의 답"]),
  )
  .model<InsightRows>((t) => ({
    columns: t(["Columns", "컬럼"]).desc([
      "Column names in the order the statement selected them",
      "질의가 선택한 순서의 컬럼명",
    ]),
    rows: t(["Rows", "행"]).desc(["One object per row, keyed by the column names", "컬럼명을 키로 하는 행 객체 목록"]),
    truncated: t(["Truncated", "잘림"]).desc([
      "The row ceiling cut the answer short, so it is not complete",
      "행 상한에 걸려 잘린 답이다. 전체가 아니다.",
    ]),
  }));
