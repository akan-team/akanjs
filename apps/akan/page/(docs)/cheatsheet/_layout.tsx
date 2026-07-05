import { usePage } from "@apps/akan/client";
import { Docs } from "@apps/akan/ui";

interface LayoutProps {
  children: React.ReactNode;
}
export default function Layout({ children }: LayoutProps) {
  const { l } = usePage();
  const menuMap = [
    {
      name: l.trans({ en: "General", ko: "일반" }),
      subMenus: [
        { name: l.trans({ en: "Authorization", ko: "인증" }), href: "/cheatsheet/general/auth" },
        { name: l.trans({ en: "Schema Design", ko: "스키마 설계" }), href: "/cheatsheet/general/schema" },
        { name: l.trans({ en: "Edge Computing", ko: "엣지 컴퓨팅" }), href: "/cheatsheet/general/edge" },
        { name: l.trans({ en: "File Management", ko: "파일 관리" }), href: "/cheatsheet/general/file" },
        { name: l.trans({ en: "Single Sign-On", ko: "Single Sign-On" }), href: "/cheatsheet/general/sso" },
        { name: l.trans({ en: "DataList & Enum", ko: "DataList & Enum" }), href: "/cheatsheet/general/datalist" },
      ],
    },
    {
      name: l.trans({ en: "Interface", ko: "인터페이스" }),
      subMenus: [
        { name: l.trans({ en: "CRUD", ko: "CRUD" }), href: "/cheatsheet/interface/crud" },
        { name: l.trans({ en: "Endpoint", ko: "Endpoint" }), href: "/cheatsheet/interface/endpoint" },
        { name: l.trans({ en: "Form", ko: "Form" }), href: "/cheatsheet/interface/form" },
      ],
    },
    {
      name: l.trans({ en: "Observability", ko: "관측성" }),
      subMenus: [
        { name: l.trans({ en: "Logging", ko: "로깅" }), href: "/cheatsheet/observability/logging" },
        { name: l.trans({ en: "Dependency Injection", ko: "의존성 주입" }), href: "/cheatsheet/observability/di" },
        { name: l.trans({ en: "Error Handling", ko: "에러 처리" }), href: "/cheatsheet/observability/error" },
        { name: l.trans({ en: "Metrics", ko: "메트릭" }), href: "/cheatsheet/observability/metrics" },
      ],
    },
    {
      name: l.trans({ en: "Performance", ko: "성능" }),
      subMenus: [
        { name: l.trans({ en: "Caching", ko: "캐싱" }), href: "/cheatsheet/performance/caching" },
        {
          name: l.trans({ en: "Image Optimization", ko: "이미지 최적화" }),
          href: "/cheatsheet/performance/image",
        },
        { name: l.trans({ en: "Lazy Loading", ko: "지연 로딩" }), href: "/cheatsheet/performance/lazy" },
        { name: l.trans({ en: "Querying", ko: "쿼리" }), href: "/cheatsheet/performance/query" },
        { name: l.trans({ en: "Mutating", ko: "변경" }), href: "/cheatsheet/performance/mutation" },
        { name: l.trans({ en: "Queueing", ko: "큐" }), href: "/cheatsheet/performance/queue" },
        { name: l.trans({ en: "Realtime", ko: "실시간" }), href: "/cheatsheet/performance/realtime" },
      ],
    },
    {
      name: l.trans({ en: "Development", ko: "개발" }),
      subMenus: [
        { name: l.trans({ en: "Documentation", ko: "문서화" }), href: "/cheatsheet/dev/docs" },
        { name: l.trans({ en: "Script", ko: "스크립트" }), href: "/cheatsheet/dev/script" },
        { name: l.trans({ en: "Console", ko: "콘솔" }), href: "/cheatsheet/dev/console" },
        { name: l.trans({ en: "Mobile", ko: "모바일" }), href: "/cheatsheet/dev/mobile" },
        { name: l.trans({ en: "Docker", ko: "도커" }), href: "/cheatsheet/dev/docker" },
        { name: l.trans({ en: "Kubernetes", ko: "쿠버네티스" }), href: "/cheatsheet/dev/k8s" },
        { name: l.trans({ en: "PWA", ko: "PWA" }), href: "/cheatsheet/dev/pwa" },
        // { name: l.trans({ en: "Testing", ko: "테스트" }), href: "/cheatsheet/dev/test" },
      ],
    },
  ];
  return <Docs.Layout menuMap={menuMap}>{children}</Docs.Layout>;
}
