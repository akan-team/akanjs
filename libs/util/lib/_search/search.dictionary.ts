import { serviceDictionary } from "@akanjs/dictionary";

import type { SearchEndpoint } from "./search.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<SearchEndpoint>((fn) => ({
    getSearchIndexNames: fn(["Get search index names", "검색 인덱스 이름 가져오기"]).desc([
      "Get available search index names",
      "사용 가능한 검색 인덱스 이름 목록 가져오기",
    ]),
    getSearchResult: fn(["Get search result", "검색 결과 가져오기"])
      .desc(["Get search result from index", "인덱스에서 검색 결과 가져오기"])
      .arg((t) => ({
        searchIndexName: t(["Search index name", "검색 인덱스 이름"]).desc([
          "Name of the search index",
          "검색 인덱스 이름",
        ]),
        searchString: t(["Search string", "검색 문자열"]).desc(["String to search", "검색할 문자열"]),
        skip: t(["Skip", "건너뛰기"]).desc(["Number of results to skip", "건너뛸 결과 수"]),
        limit: t(["Limit", "제한"]).desc(["Maximum number of results", "최대 결과 수"]),
        sort: t(["Sort", "정렬"]).desc(["Sort order", "정렬 순서"]),
      })),
    resyncSearchDocuments: fn(["Resync search documents", "검색 문서 동기화"])
      .desc(["Resync search index documents", "검색 인덱스 문서 동기화"])
      .arg((t) => ({
        searchIndexName: t(["Search index name", "검색 인덱스 이름"]).desc([
          "Name of the search index to resync",
          "동기화할 검색 인덱스 이름",
        ]),
      })),
    dropSearchDocuments: fn(["Drop search documents", "검색 문서 삭제"])
      .desc(["Drop all documents from search index", "검색 인덱스의 모든 문서 삭제"])
      .arg((t) => ({
        searchIndexName: t(["Search index name", "검색 인덱스 이름"]).desc([
          "Name of the search index to drop",
          "삭제할 검색 인덱스 이름",
        ]),
      })),
  }))
  .translate({
    "resyncSearchDocuments-loading": ["Resyncing search documents...", "검색 문서 동기화 중..."],
    "resyncSearchDocuments-success": ["Search documents resynced", "검색 문서 동기화 완료"],
  });
