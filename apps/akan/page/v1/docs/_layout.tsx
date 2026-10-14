import { usePage } from "@apps/akan/client";
import { Docs, JellyLoader } from "@apps/akan/ui";
import { layout } from "akanjs/client";

export default layout()
  .loading(() => <JellyLoader className="min-h-[100svh]" />)
  .render(({ children }) => {
    const { l } = usePage();
    const menuMap = [
      {
        name: l.trans({ en: "Introduction", ko: "소개" }),
        subMenus: [
          { name: l.trans({ en: "Quick Start", ko: "시작하기" }), href: "/v1/docs/intro/quickstart" },
          { name: l.trans({ en: "How it works", ko: "작동원리" }), href: "/v1/docs/intro/fundamentals" },
          { name: l.trans({ en: "Practice a Workflow", ko: "실습하기" }), href: "/v1/docs/intro/practice" },
        ],
      },
      {
        name: l.trans({ en: "Tutorials", ko: "튜토리얼" }),
        subMenus: [
          { name: l.trans({ en: "Show Details", ko: "상세하게 보여주기" }), href: "/v1/docs/tutorials/view" },
          { name: l.trans({ en: "Modifying Status", ko: "상태 변경하기" }), href: "/v1/docs/tutorials/util" },
          {
            name: l.trans({ en: "Interact in Service", ko: "서비스 내에서 상호작용" }),
            href: "/v1/docs/tutorials/service",
          },
          {
            name: l.trans({ en: "Displaying with Slice", ko: "슬라이스로 표시하기" }),
            href: "/v1/docs/tutorials/slice",
          },
          { name: l.trans({ en: "UX with Pages", ko: "페이지를 통한 UX" }), href: "/v1/docs/tutorials/page" },
          { name: l.trans({ en: "Using Scalar", ko: "스칼라 사용하기" }), href: "/v1/docs/tutorials/scalar" },
          { name: l.trans({ en: "Using Insight", ko: "인사이트 사용하기" }), href: "/v1/docs/tutorials/insight" },
          { name: l.trans({ en: "Relate Data", ko: "데이터 연결하기" }), href: "/v1/docs/tutorials/relation" },
        ],
      },
      {
        name: l.trans({ en: "System Architecture", ko: "시스템 아키텍처" }),
        subMenus: [
          { name: l.trans({ en: "Overview", ko: "개요" }), href: "/v1/docs/systemArch/overview" },
          { name: l.trans({ en: "Backend System", ko: "백엔드 시스템" }), href: "/v1/docs/systemArch/backend" },
          { name: l.trans({ en: "Frontend System", ko: "프론트엔드 시스템" }), href: "/v1/docs/systemArch/frontend" },
          { name: l.trans({ en: "Environment Variables", ko: "환경변수" }), href: "/v1/docs/systemArch/environment" },
          {
            name: l.trans({ en: "Primitive Scalar Types", ko: "기본 스칼라 타입" }),
            href: "/v1/docs/systemArch/scalar",
          },
          { name: l.trans({ en: "Domain Based Modules", ko: "도메인 기반 모듈" }), href: "/v1/docs/systemArch/domain" },
          { name: l.trans({ en: "CSS", ko: "CSS" }), href: "/v1/docs/systemArch/css" },
        ],
      },
      {
        name: l.trans({ en: "Module Convention", ko: "모듈 규칙" }),
        subMenus: [
          { name: l.trans({ en: "Overview", ko: "개요" }), href: "/v1/docs/module/overview" },
          { name: "model.constant.ts", href: "/v1/docs/module/constant" },
          { name: "model.dictionary.ts", href: "/v1/docs/module/dictionary" },
          { name: "model.document.ts", href: "/v1/docs/module/document" },
          { name: "model.service.ts", href: "/v1/docs/module/service" },
          { name: "model.signal.ts", href: "/v1/docs/module/signal" },
          { name: "model.store.ts", href: "/v1/docs/module/store" },
          { name: "Model.Template.tsx", href: "/v1/docs/module/template" },
          { name: "Model.Unit.tsx", href: "/v1/docs/module/unit" },
          { name: "Model.Util.tsx", href: "/v1/docs/module/util" },
          { name: "Model.View.tsx", href: "/v1/docs/module/view" },
          { name: "Model.Zone.tsx", href: "/v1/docs/module/zone" },
        ],
      },
      {
        name: l.trans({ en: "Scalar Convention", ko: "스칼라 규칙" }),
        subMenus: [
          { name: l.trans({ en: "Overview", ko: "개요" }), href: "/v1/docs/scalar/overview" },
          { name: "scalar.constant.ts", href: "/v1/docs/scalar/constant" },
          { name: "scalar.dictionary.ts", href: "/v1/docs/scalar/dictionary" },
          { name: "scalar.document.ts", href: "/v1/docs/scalar/document" },
        ],
      },
    ];

    return <Docs.Layout menuMap={menuMap}>{children}</Docs.Layout>;
  });
