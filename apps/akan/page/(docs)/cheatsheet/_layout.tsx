import { usePage } from "@apps/akan/client";
import { Docs, type DocsMenu } from "@apps/akan/ui";
import { layout } from "akanjs/client";

export default layout().render(({ children }) => {
  const { l } = usePage();
  const menuMap: DocsMenu[] = [
    {
      name: l.trans({ en: "General", ko: "일반" }),
      subMenus: [
        {
          name: l.trans({ en: "Authorization", ko: "인증과 권한" }),
          href: "/cheatsheet/general/auth",
          audience: "human",
        },
        {
          name: l.trans({ en: "OAuth For Agents", ko: "에이전트를 위한 OAuth" }),
          href: "/cheatsheet/general/mcp-auth",
          audience: "both",
        },
        {
          name: l.trans({ en: "Schema Design", ko: "스키마 설계" }),
          href: "/cheatsheet/general/schema",
          audience: "human",
        },
        {
          name: l.trans({ en: "Text Search", ko: "텍스트 검색" }),
          href: "/cheatsheet/general/search",
          audience: "both",
        },
        {
          name: l.trans({ en: "Edge Computing", ko: "엣지 컴퓨팅" }),
          href: "/cheatsheet/general/edge",
          audience: "both",
        },
        {
          name: l.trans({ en: "File Management", ko: "파일 관리" }),
          href: "/cheatsheet/general/file",
          audience: "both",
        },
        {
          name: l.trans({ en: "Single Sign-On", ko: "Single Sign-On" }),
          href: "/cheatsheet/general/sso",
          audience: "both",
        },
        {
          name: l.trans({ en: "DataList & Enum", ko: "DataList & Enum" }),
          href: "/cheatsheet/general/datalist",
          audience: "agent",
        },
      ],
    },
    {
      name: l.trans({ en: "Interface", ko: "인터페이스" }),
      friend: "planet",
      subMenus: [
        { name: l.trans({ en: "CRUD", ko: "CRUD" }), href: "/cheatsheet/interface/crud", audience: "agent" },
        { name: l.trans({ en: "Endpoint", ko: "Endpoint" }), href: "/cheatsheet/interface/endpoint", audience: "both" },
        { name: l.trans({ en: "MCP Server", ko: "MCP 서버" }), href: "/cheatsheet/interface/mcp", audience: "both" },
        {
          name: l.trans({ en: "Agent Chat", ko: "에이전트 채팅" }),
          href: "/cheatsheet/interface/agent-chat",
          audience: "both",
        },
        { name: l.trans({ en: "Form", ko: "Form" }), href: "/cheatsheet/interface/form", audience: "agent" },
      ],
    },
    {
      name: l.trans({ en: "Observability", ko: "관측성" }),
      friend: "cloud",
      subMenus: [
        { name: l.trans({ en: "Logging", ko: "로깅" }), href: "/cheatsheet/observability/logging", audience: "agent" },
        {
          name: l.trans({ en: "Dependency Injection", ko: "의존성 주입" }),
          href: "/cheatsheet/observability/di",
          audience: "agent",
        },
        {
          name: l.trans({ en: "Error Handling", ko: "에러 처리" }),
          href: "/cheatsheet/observability/error",
          audience: "both",
        },
        {
          name: l.trans({ en: "Metrics", ko: "메트릭" }),
          href: "/cheatsheet/observability/metrics",
          audience: "agent",
        },
      ],
    },
    {
      name: l.trans({ en: "Performance", ko: "성능" }),
      friend: "moon",
      subMenus: [
        { name: l.trans({ en: "Caching", ko: "캐싱" }), href: "/cheatsheet/performance/caching", audience: "agent" },
        {
          name: l.trans({ en: "Image Optimization", ko: "이미지 최적화" }),
          href: "/cheatsheet/performance/image",
          audience: "agent",
        },
        {
          name: l.trans({ en: "Lazy Loading", ko: "지연 로딩" }),
          href: "/cheatsheet/performance/lazy",
          audience: "agent",
        },
        { name: l.trans({ en: "Querying", ko: "쿼리" }), href: "/cheatsheet/performance/query", audience: "both" },
        { name: l.trans({ en: "Mutating", ko: "변경" }), href: "/cheatsheet/performance/mutation", audience: "both" },
        { name: l.trans({ en: "Queueing", ko: "큐" }), href: "/cheatsheet/performance/queue", audience: "both" },
        { name: l.trans({ en: "Realtime", ko: "실시간" }), href: "/cheatsheet/performance/realtime", audience: "both" },
      ],
    },
    {
      name: l.trans({ en: "Mobile", ko: "모바일" }),
      friend: "rocket",
      subMenus: [
        { name: l.trans({ en: "Setup", ko: "설정" }), href: "/cheatsheet/mobile/setup", audience: "agent" },
        {
          name: l.trans({ en: "Push Notifications", ko: "Push Notifications" }),
          href: "/cheatsheet/mobile/push",
          audience: "agent",
        },
        { name: l.trans({ en: "Deep Links", ko: "Deep Links" }), href: "/cheatsheet/mobile/links", audience: "agent" },
        {
          name: l.trans({ en: "UI & Keyboard", ko: "UI & Keyboard" }),
          href: "/cheatsheet/mobile/ui",
          audience: "agent",
        },
        {
          name: l.trans({ en: "Desktop Release", ko: "데스크톱 배포" }),
          href: "/cheatsheet/mobile/desktop-release",
          audience: "agent",
        },
      ],
    },
    {
      name: l.trans({ en: "Development", ko: "개발" }),
      friend: "cloud",
      subMenus: [
        { name: l.trans({ en: "Documentation", ko: "문서화" }), href: "/cheatsheet/dev/docs", audience: "agent" },
        {
          name: l.trans({ en: "Schema Docs", ko: "스키마 문서" }),
          href: "/cheatsheet/dev/constants",
          audience: "agent",
        },
        { name: l.trans({ en: "Script", ko: "스크립트" }), href: "/cheatsheet/dev/script", audience: "agent" },
        { name: l.trans({ en: "Console", ko: "콘솔" }), href: "/cheatsheet/dev/console", audience: "agent" },
        { name: l.trans({ en: "Docker", ko: "도커" }), href: "/cheatsheet/dev/docker", audience: "agent" },
        { name: l.trans({ en: "Kubernetes", ko: "쿠버네티스" }), href: "/cheatsheet/dev/k8s", audience: "agent" },
        { name: l.trans({ en: "PWA", ko: "PWA" }), href: "/cheatsheet/dev/pwa", audience: "agent" },
        { name: l.trans({ en: "Testing", ko: "테스트" }), href: "/cheatsheet/dev/test", audience: "both" },
      ],
    },
  ];
  return <Docs.Layout menuMap={menuMap}>{children}</Docs.Layout>;
});
