import { scalarDictionary } from "@akanjs/dictionary";

import type { SearchResult } from "./searchResult.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Search Result", "검색 결과"]).desc(["Search result information", "검색 결과 정보"]))
  .model<SearchResult>((t) => ({
    docs: t(["Documents", "문서"]).desc(["Search result documents", "검색 결과 문서"]),
    skip: t(["Skip", "건너뛰기"]).desc(["Number of results skipped", "건너뛴 결과 수"]),
    limit: t(["Limit", "제한"]).desc(["Maximum number of results", "최대 결과 수"]),
    sort: t(["Sort", "정렬"]).desc(["Sort order", "정렬 순서"]),
    total: t(["Total", "전체"]).desc(["Total number of results", "전체 결과 수"]),
  }));
