import { usePage } from "@apps/akan/client";
import { Docs } from "@apps/akan/ui";

interface LayoutProps {
  children: React.ReactNode;
}
export default function Layout({ children }: LayoutProps) {
  const { l } = usePage();
  const menuMap = [
    {
      name: l.trans({ en: "Introduction", ko: "소개" }),
      subMenus: [
        { name: l.trans({ en: "Quick Start", ko: "시작하기" }), href: "/docs/intro/quickstart" },
        { name: l.trans({ en: "Fundamentals", ko: "기본 개념" }), href: "/docs/intro/fundamentals" },
        { name: l.trans({ en: "Practice", ko: "실습하기" }), href: "/docs/intro/practice" },
      ],
    },
    {
      name: l.trans({ en: "Tutorials", ko: "튜토리얼" }),
      subMenus: [
        { name: l.trans({ en: "Show Details", ko: "상세하게 보여주기" }), href: "/docs/tutorials/view" },
        { name: l.trans({ en: "Modifying Status", ko: "상태 변경하기" }), href: "/docs/tutorials/util" },
        {
          name: l.trans({ en: "Interact in Service", ko: "서비스 내에서 상호작용" }),
          href: "/docs/tutorials/service",
        },
        {
          name: l.trans({ en: "Displaying with Slice", ko: "슬라이스로 표시하기" }),
          href: "/docs/tutorials/slice",
        },
        { name: l.trans({ en: "UX with Pages", ko: "페이지를 통한 UX" }), href: "/docs/tutorials/page" },
        { name: l.trans({ en: "Using Scalar", ko: "스칼라 사용하기" }), href: "/docs/tutorials/scalar" },
        { name: l.trans({ en: "Using Insight", ko: "인사이트 사용하기" }), href: "/docs/tutorials/insight" },
        { name: l.trans({ en: "Relate Data", ko: "데이터 연결하기" }), href: "/docs/tutorials/relation" },
      ],
    },
    {
      name: l.trans({ en: "Core Concepts", ko: "핵심 개념" }),
      subMenus: [
        { name: l.trans({ en: "Akan Runtime", ko: "Akan 런타임" }), href: "/docs/core/runtime" },
        { name: l.trans({ en: "File Based Routing", ko: "파일 기반 라우팅" }), href: "/docs/core/routing" },
        { name: l.trans({ en: "Multi Client", ko: "다중 클라이언트" }), href: "/docs/core/multi-client" },
        { name: l.trans({ en: "App Config", ko: "앱 설정" }), href: "/docs/core/config" },
        { name: l.trans({ en: "Folder Rule", ko: "폴더 규칙" }), href: "/docs/core/folder-rule" },
        { name: l.trans({ en: "File Rule", ko: "파일 규칙" }), href: "/docs/core/file-rule" },
        { name: l.trans({ en: "Data Layer", ko: "데이터 레이어" }), href: "/docs/core/data-layer" },
      ],
    },
    {
      name: l.trans({ en: "Architecture", ko: "시스템 아키텍처" }),
      subMenus: [
        { name: l.trans({ en: "Architecture Overview", ko: "아키텍처 개요" }), href: "/docs/arch/overview" },
        { name: l.trans({ en: "Runtime And Infra", ko: "런타임과 인프라" }), href: "/docs/arch/infra" },
        {
          name: l.trans({ en: "UI Architecture", ko: "UI 아키텍처" }),
          href: "/docs/arch/frontend",
        },
        { name: l.trans({ en: "Business Service", ko: "비즈니스 서비스" }), href: "/docs/arch/backend" },
        { name: l.trans({ en: "Mobile App Architecture", ko: "모바일 앱 아키텍처" }), href: "/docs/arch/mobile" },
        { name: l.trans({ en: "CSS And Styling", ko: "CSS와 스타일링" }), href: "/docs/arch/css" },
      ],
    },
  ];
  return <Docs.Layout menuMap={menuMap}>{children}</Docs.Layout>;
}
