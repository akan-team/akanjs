import { scalarDictionary } from "akanjs/dictionary";

import type { DocPage, DocPriority, DocSection } from "./docPage.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) =>
    t(["Documentation Page", "문서 페이지"]).desc([
      "One page of the Akan.js documentation, as both a menu entry and a readable document.",
      "Akan.js 문서의 한 페이지로, 메뉴 항목이자 읽을 수 있는 문서다.",
    ]),
  )
  .model<DocPage>((t) => ({
    href: t(["Path", "경로"]).desc([
      "The docs route, and the identifier to pass to readDocPage",
      "문서 경로이며, readDocPage 에 넘기는 식별자",
    ]),
    title: t(["Title", "제목"]).desc(["Page title", "페이지 제목"]),
    section: t(["Section", "구획"]).desc([
      "Which of the four documentation sections it belongs to",
      "네 문서 구획 중 어디에 속하는지",
    ]),
    category: t(["Category", "분류"]).desc(["The menu group the page sits under", "페이지가 속한 메뉴 그룹"]),
    priority: t(["Priority", "우선순위"]).desc([
      "Reading order — P0 is the path through the framework",
      "읽는 순서 — P0 가 프레임워크를 관통하는 경로",
    ]),
    summary: t(["Summary", "요약"]).desc(["First prose paragraph of the page", "페이지의 첫 산문 문단"]),
  }))
  .enum<DocSection>("docSection", (t) => ({
    docs: t(["Guide", "가이드"]).desc(["Tutorials and architecture", "튜토리얼과 아키텍처"]),
    references: t(["Reference", "레퍼런스"]).desc(["API surface per package", "패키지별 API 표면"]),
    conventions: t(["Convention", "규약"]).desc(["File and module rules", "파일·모듈 규칙"]),
    cheatsheet: t(["Cheatsheet", "치트시트"]).desc(["Condensed task-oriented recipes", "과업 중심의 압축 레시피"]),
  }))
  .enum<DocPriority>("docPriority", (t) => ({
    P0: t(["Essential", "필수"]).desc(["Read first", "먼저 읽을 것"]),
    P1: t(["Recommended", "권장"]).desc(["Read next", "다음으로 읽을 것"]),
    P2: t(["Detail", "상세"]).desc(["Read when the task needs it", "필요할 때 찾아 읽을 것"]),
  }));
