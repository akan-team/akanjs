import { usePage } from "@apps/akan/client";
import { Docs, type DocsMenu, JellyLoader } from "@apps/akan/ui";
import { layout } from "akanjs/client";

export default layout()
  .loading(() => <JellyLoader className="min-h-[100svh]" />)
  .render(({ children }) => {
    const { l } = usePage();
    const menuMap: DocsMenu[] = [
      {
        name: l.trans({ en: "Introduction", ko: "소개" }),
        subMenus: [
          { name: l.trans({ en: "Quick Start", ko: "시작하기" }), href: "/docs/intro/quickstart", audience: "human" },
          {
            name: l.trans({ en: "Fundamentals", ko: "기본 개념" }),
            href: "/docs/intro/fundamentals",
            audience: "human",
          },
          { name: l.trans({ en: "Practice", ko: "실습하기" }), href: "/docs/intro/practice", audience: "human" },
        ],
      },
      {
        name: l.trans({ en: "Tutorials", ko: "튜토리얼" }),
        subMenus: [
          {
            name: l.trans({ en: "Show Details", ko: "상세하게 보여주기" }),
            href: "/docs/tutorials/view",
            audience: "human",
          },
          {
            name: l.trans({ en: "Modifying Status", ko: "상태 변경하기" }),
            href: "/docs/tutorials/util",
            audience: "human",
          },
          {
            name: l.trans({ en: "Interact in Service", ko: "서비스 내에서 상호작용" }),
            href: "/docs/tutorials/service",
            audience: "human",
          },
          {
            name: l.trans({ en: "Displaying with Slice", ko: "슬라이스로 표시하기" }),
            href: "/docs/tutorials/slice",
            audience: "human",
          },
          {
            name: l.trans({ en: "UX with Pages", ko: "페이지를 통한 UX" }),
            href: "/docs/tutorials/page",
            audience: "human",
          },
          {
            name: l.trans({ en: "Using Scalar", ko: "스칼라 사용하기" }),
            href: "/docs/tutorials/scalar",
            audience: "human",
          },
          {
            name: l.trans({ en: "Using Insight", ko: "인사이트 사용하기" }),
            href: "/docs/tutorials/insight",
            audience: "human",
          },
          {
            name: l.trans({ en: "Relate Data", ko: "데이터 연결하기" }),
            href: "/docs/tutorials/relation",
            audience: "human",
          },
        ],
      },
      {
        name: l.trans({ en: "Core Concepts", ko: "핵심 개념" }),
        subMenus: [
          { name: l.trans({ en: "Folder Rule", ko: "폴더 규칙" }), href: "/docs/core/folder-rule", audience: "both" },
          { name: l.trans({ en: "File Rule", ko: "파일 규칙" }), href: "/docs/core/file-rule", audience: "both" },
          {
            name: l.trans({ en: "File Based Routing", ko: "파일 기반 라우팅" }),
            href: "/docs/core/routing",
            audience: "both",
          },
          {
            name: l.trans({ en: "Data Layer", ko: "데이터 레이어" }),
            href: "/docs/core/data-layer",
            audience: "human",
          },
          { name: l.trans({ en: "App Config", ko: "앱 설정" }), href: "/docs/core/config", audience: "agent" },
          { name: l.trans({ en: "Akan Runtime", ko: "Akan 런타임" }), href: "/docs/core/runtime", audience: "agent" },
          {
            name: l.trans({ en: "Multi Client", ko: "다중 클라이언트" }),
            href: "/docs/core/multi-client",
            audience: "both",
          },
        ],
      },
      {
        name: l.trans({ en: "Architecture", ko: "시스템 아키텍처" }),
        subMenus: [
          {
            name: l.trans({ en: "Architecture Overview", ko: "아키텍처 개요" }),
            href: "/docs/arch/overview",
            audience: "human",
          },
          {
            name: l.trans({ en: "UI Architecture", ko: "UI 아키텍처" }),
            href: "/docs/arch/frontend",
            audience: "both",
          },
          {
            name: l.trans({ en: "UI Composition", ko: "UI 구성" }),
            href: "/docs/arch/ui-composition",
            audience: "both",
          },
          {
            name: l.trans({ en: "Business Service", ko: "비즈니스 서비스" }),
            href: "/docs/arch/backend",
            audience: "human",
          },
          {
            name: l.trans({ en: "In-Page Agent", ko: "인페이지 에이전트" }),
            href: "/docs/arch/agentic",
            audience: "both",
          },
          { name: l.trans({ en: "CSS And Styling", ko: "CSS와 스타일링" }), href: "/docs/arch/css", audience: "agent" },
          {
            name: l.trans({ en: "UI Recipe Layer", ko: "UI 레시피 레이어" }),
            href: "/docs/arch/ui-recipe",
            audience: "agent",
          },
          {
            name: l.trans({ en: "Native App Architecture", ko: "네이티브 앱 아키텍처" }),
            href: "/docs/arch/mobile",
            audience: "both",
          },
          {
            name: l.trans({ en: "Runtime And Infra", ko: "런타임과 인프라" }),
            href: "/docs/arch/infra",
            audience: "both",
          },
        ],
      },
    ];
    return <Docs.Layout menuMap={menuMap}>{children}</Docs.Layout>;
  });
