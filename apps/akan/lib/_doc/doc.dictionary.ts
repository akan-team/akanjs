import { serviceDictionary } from "akanjs/dictionary";

import type { DocEndpoint } from "./doc.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<DocEndpoint>((fn) => ({
    listDocPages: fn(["Documentation Index", "문서 목차"])
      .desc([
        "Lists every Akan.js documentation page with its title, section and reading priority. Start here to find out what exists, then read one with readDocPage. Prefer searchDocPages when you already know what you are looking for.",
        "Akan.js 문서 페이지 전체를 제목·구획·읽기 우선순위와 함께 나열한다. 무엇이 있는지 파악할 때 먼저 쓰고, 이후 readDocPage 로 한 편을 읽는다. 찾는 것이 이미 정해져 있다면 searchDocPages 가 낫다.",
      ])
      .arg((t) => ({
        section: t(["Section", "구획"]).desc([
          "Narrows to one section; omit for all four",
          "한 구획으로 좁힌다. 비우면 네 구획 전부",
        ]),
      })),

    readDocPage: fn(["Read Documentation Page", "문서 페이지 읽기"])
      .desc([
        "Returns one documentation page in full as markdown, including its code examples. Takes the href from listDocPages or searchDocPages.",
        "문서 페이지 한 편을 코드 예제까지 포함한 마크다운 전문으로 반환한다. href 는 listDocPages 나 searchDocPages 가 준 값을 쓴다.",
      ])
      .arg((t) => ({
        href: t(["Path", "경로"]).desc([
          "The page path, such as /references/akanjs/signal",
          "페이지 경로. 예: /references/akanjs/signal",
        ]),
      })),

    searchDocPages: fn(["Search Documentation", "문서 검색"])
      .desc([
        "Finds documentation pages matching every word given, ranked with title matches ahead of body mentions. Returns summaries rather than full pages, so follow up with readDocPage.",
        "주어진 단어를 모두 포함하는 문서 페이지를 찾고, 제목 일치를 본문 언급보다 앞에 둔다. 전문이 아니라 요약을 반환하므로 이어서 readDocPage 를 쓴다.",
      ])
      .arg((t) => ({
        text: t(["Query", "검색어"]).desc([
          "Words to match; every word must appear",
          "찾을 단어. 모든 단어가 포함되어야 한다",
        ]),
        limit: t(["Limit", "개수 제한"]).desc(["How many pages to return, 20 by default", "반환할 페이지 수. 기본 20"]),
      })),
  }))
  .error({
    docPageNotFound: ["Documentation page not found", "문서 페이지를 찾을 수 없습니다"],
    searchIndexLoadFailed: [
      "Failed to load docs search index ({status})",
      "문서 검색 인덱스를 불러오지 못했습니다 ({status})",
    ],
    searchIndexInvalid: ["Invalid docs search index", "문서 검색 인덱스가 올바르지 않습니다"],
  });
