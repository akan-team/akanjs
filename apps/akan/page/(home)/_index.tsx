import { usePage } from "@apps/akan/client";
import { Code, RoadmapTrajectory, ShowcaseThumbnail } from "@apps/akan/ui";
import { page } from "akanjs/client";
import { badgeRecipe, buttonRecipe, Link } from "akanjs/ui";
import {
  BsArrowRight,
  BsArrowUpRight,
  BsCheckCircle,
  BsCloudArrowUp,
  BsCodeSlash,
  BsRobot,
  BsTerminal,
} from "react-icons/bs";

export default page().render(() => {
  const { l } = usePage();
  const personaCards = [
    {
      audience: l.trans({ en: "Web devs", ko: "웹 개발자" }),
      title: l.trans({ en: "Web's fine — but the app is blocking you?", ko: "웹은 되는데 앱이 발목을 잡나요?" }),
      description: l.trans({
        en: "The same business code becomes SEO-ready web and native-feeling iOS/Android screens.",
        ko: "같은 비즈니스 코드가 SEO 웹과 네이티브 느낌의 iOS/Android 화면까지 그대로 갑니다.",
      }),
    },
    {
      audience: l.trans({ en: "App devs", ko: "앱 개발자" }),
      title: l.trans({
        en: "Shipping the app, but server and DB drag you down?",
        ko: "앱은 만드는데 서버와 DB가 부담인가요?",
      }),
      description: l.trans({
        en: "Bun server, SQLite, API contracts, and validation follow — no hand-wiring.",
        ko: "Bun 서버, SQLite, API 계약, 검증까지 손으로 배선하지 않아도 따라옵니다.",
      }),
    },
    {
      audience: l.trans({ en: "Solo / small teams", ko: "1인 창업가 / 소규모 팀" }),
      title: l.trans({
        en: "Doing it all alone, or with one teammate?",
        ko: "혼자, 혹은 둘이 다 해야 하나요?",
      }),
      description: l.trans({
        en: "One full-stack developer owns all five surfaces. One person, a quarter of the time.",
        ko: "풀스택 1명이 5개 표현을 책임집니다. 사람 한 명, 시간 1/4.",
      }),
    },
  ];
  const workflowLayers = [
    l.trans({ en: "Define the DB schema", ko: "DB 스키마 정의" }),
    l.trans({ en: "Add the query field", ko: "쿼리 필드 추가" }),
    l.trans({ en: "Add the service logic", ko: "서비스 로직 추가" }),
    l.trans({ en: "Add the API field", ko: "API 필드 추가" }),
    l.trans({ en: "Add the fetch field", ko: "fetch 필드 추가" }),
    l.trans({ en: "Declare the client type", ko: "클라이언트 타입 선언" }),
    l.trans({ en: "Declare the state management", ko: "상태관리 선언" }),
    l.trans({ en: "Declare the UI prop", ko: "UI prop 선언" }),
  ];
  const qualityItems = [
    {
      icon: <BsTerminal className="size-7" />,
      iconClassName: "text-primary",
      title: l.trans({ en: "Config Hell Ends", ko: "config 파일 지옥은 그만" }),
      description: l.trans({
        en: "Configure everything in akan.config.ts. Even when you configure nothing, defaults keep the product moving.",
        ko: "akan.config.ts 하나로 모든 것을 설정합니다. 하물며 설정하지 않아도 제품은 계속 굴러갑니다.",
      }),
    },
    {
      icon: <BsCodeSlash className="size-7" />,
      iconClassName: "text-accent",
      title: l.trans({ en: "Strict Rules, Unified Style", ko: "엄격한 규칙, 통일된 스타일" }),
      description: l.trans({
        en: "File paths, names, structures, and declarations stay consistent. Code reads like one person wrote it.",
        ko: "파일 위치, 이름, 구조, 선언 방식까지 통일됩니다. 누가 짰든 한 사람이 쓴 것처럼 읽힙니다.",
      }),
    },
    {
      icon: <BsRobot className="size-7" />,
      iconClassName: "text-info",
      title: l.trans({ en: "A Guide Agents Actually Read", ko: "에이전트가 실제로 읽는 가이드" }),
      description: l.trans({
        en: "Every workspace ships a generated AGENTS.md, a plan-then-apply workflow MCP and akan code, so an agent edits through the rules, not around them.",
        ko: "모든 워크스페이스에 생성된 AGENTS.md, 계획 후 적용하는 워크플로 MCP, akan code가 들어 있어 에이전트는 규칙을 우회하지 않고 규칙을 따라 고칩니다.",
      }),
    },
    {
      icon: <BsCheckCircle className="size-7" />,
      iconClassName: "text-success",
      title: l.trans({ en: "Agentic Full-Stack, Redefined", ko: "에이전틱 풀스택의 재정의" }),
      description: l.trans({
        en: "Fixed blocks for upload, login, admin, chat, boards, and alerts let agents produce consistent code.",
        ko: "업로드, 로그인, 관리자, 채팅, 게시판, 알림 같은 고정 블록 위에서 에이전트는 일관된 코드만 생산합니다.",
      }),
    },
  ];
  const platformSurfaces = [
    l.trans({ en: "SEO-ready server-side rendering", ko: "SEO 최적화 서버사이드 렌더링" }),
    l.trans({ en: "iOS / Android client rendering", ko: "iOS / Android 클라이언트 렌더링" }),
    l.trans({ en: "Bun HTTP / WebSocket server", ko: "Bun HTTP / WebSocket 서버" }),
    l.trans({ en: "SQLite first, Postgres / Redis ready", ko: "SQLite 우선, Postgres / Redis 확장" }),
    l.trans({ en: "Schema validation and secure middleware", ko: "스키마 검증과 보안 미들웨어" }),
    l.trans({ en: "Type-safe from DB to UI", ko: "DB부터 UI까지 타입 안전" }),
    l.trans({ en: "Built-in internationalization", ko: "다국어 지원 기본 탑재" }),
    l.trans({ en: "Official plugin blocks", ko: "공식 플러그인 기능 블록" }),
    l.trans({ en: "MCP server with OAuth 2.1", ko: "OAuth 2.1을 갖춘 MCP 서버" }),
    l.trans({ en: "In-page AI agent", ko: "인페이지 AI 에이전트" }),
  ];
  const automationItems = [
    {
      title: l.trans({ en: "Schema becomes DB documentation", ko: "스키마를 짜면 DB 테이블 정의서가 나옵니다" }),
      description: l.trans({
        en: "Business schema is not only runtime code. It becomes documentation your team can inspect together.",
        ko: "비즈니스 스키마는 실행 코드에 그치지 않습니다. 팀이 함께 확인할 수 있는 정의서가 됩니다.",
      }),
    },
    {
      title: l.trans({ en: "Endpoint becomes live API docs", ko: "엔드포인트를 짜면 API 정의서가 실시간으로" }),
      description: l.trans({
        en: "API contracts stay close to implementation, and the generated surface can be tested as you build.",
        ko: "API 계약은 구현 가까이에 머물고, 생성된 표현은 개발 중 바로 테스트할 수 있습니다.",
      }),
    },
    {
      title: l.trans({ en: "Query condition expands into reads", ko: "쿼리조건 하나로 조회 기능 자동생성" }),
      description: l.trans({
        en: "One query condition can power list, detail, and statistics reads without repeating the same plumbing.",
        ko: "쿼리조건 하나로 리스트, 단일조회, 통계조회가 이어집니다. 반복작업은 이제 그만.",
      }),
    },
    {
      title: l.trans({ en: "Slice removes spaghetti state", ko: "슬라이스 하나로 스파게티 상태관리 제거" }),
      description: l.trans({
        en: "Declare a slice once and get list loading, pagination, statistics, state, and loading behavior together.",
        ko: "슬라이스 하나로 리스트 조회, 페이지네이션, 통계조회, 상태관리, 로딩처리가 함께 생성됩니다.",
      }),
    },
  ];
  const procedureItems = [
    {
      title: l.trans({ en: "Cross-Platform Development", ko: "크로스 플랫폼 개발" }),
      description: l.trans({
        en: "One page can become SEO-ready web and app-ready client screens with native-feeling transitions.",
        ko: "하나의 페이지가 SEO 가능한 웹과 앱에 어울리는 클라이언트 화면으로 함께 배포됩니다.",
      }),
      src: "/cross_platform_dev_web.mp4",
    },
    {
      title: l.trans({ en: "Database & API Integration", ko: "데이터베이스 & API 통합" }),
      description: l.trans({
        en: "Schema changes flow into database, validation, API contracts, and generated clients without hand wiring.",
        ko: "스키마 변경이 데이터베이스, 검증, API 계약, 생성된 클라이언트까지 수작업 연결 없이 이어집니다.",
      }),
      src: "/database_api_en.mp4",
    },
    {
      title: l.trans({ en: "Full-Stack Type Safety", ko: "전체 스택 타입 안전" }),
      description: l.trans({
        en: "Database schema changes automatically influence server, API, state management, and UI types.",
        ko: "데이터베이스 스키마 설정이 서버, API, 상태관리, UI 타입까지 타입안전하게 반영됩니다.",
      }),
      src: "/fullstack_type_en.mp4",
    },
    {
      title: l.trans({ en: "Domain-Driven State Management", ko: "도메인 기반 상태 관리" }),
      description: l.trans({
        en: "State, loading, pagination, and statistics follow the domain so UI code stays predictable.",
        ko: "상태, 로딩, 페이지네이션, 통계가 도메인을 따라가므로 UI 코드가 예측 가능해집니다.",
      }),
      src: "/domain_based.mp4",
    },
    {
      title: l.trans({ en: "Agent-Ready Code Generation", ko: "에이전트 친화적 코드 생성" }),
      description: l.trans({
        en: "Official patterns and plugins give agents predictable blocks for upload, login, admin, chat, boards, and alerts.",
        ko: "업로드, 로그인, 관리자, 채팅, 게시판, 알림 같은 검증된 기능블록을 예측 가능한 구조로 조립합니다.",
      }),
      src: "/create_scalar.mp4",
    },
  ];
  const transitionItems = [
    {
      title: "bottomup",
      description: l.trans({
        en: "Open focused flows from the bottom without leaving the CSR client.",
        ko: "CSR 클라이언트를 벗어나지 않고 하단에서 집중 흐름을 열 수 있습니다.",
      }),
      src: l.trans({
        en: "/csr/bottomup_en.mp4",
        ko: "/csr/bottomup_ko.mp4",
      }),
    },
    {
      title: "fade",
      description: l.trans({
        en: "Change context calmly when the next screen is not a deeper page.",
        ko: "다음 화면이 더 깊은 계층이 아닐 때 차분하게 맥락을 전환합니다.",
      }),
      src: l.trans({
        en: "/csr/fade_en.mp4",
        ko: "/csr/fade_ko.mp4",
      }),
    },
    {
      title: "scale",
      description: l.trans({
        en: "Guide attention into the next page with a light zoom transition.",
        ko: "가벼운 확대 전환으로 다음 페이지에 시선을 자연스럽게 모읍니다.",
      }),
      src: l.trans({
        en: "/csr/scale_en.mp4",
        ko: "/csr/scale_ko.mp4",
      }),
    },
    {
      title: "stack",
      description: l.trans({
        en: "Push detail screens over lists with layered client navigation.",
        ko: "목록 위로 상세 화면을 쌓아 올리는 클라이언트 내비게이션을 만듭니다.",
      }),
      src: l.trans({
        en: "/csr/stack_en.mp4",
        ko: "/csr/stack_ko.mp4",
      }),
    },
  ];
  const heroSurfaces = [
    {
      title: l.trans({ en: "Web / App", ko: "웹 / 앱" }),
      description: l.trans({
        en: "SEO web and native-feeling client transitions.",
        ko: "SEO 가능한 웹과 앱다운 페이지 전환.",
      }),
    },
    {
      title: l.trans({ en: "Server / Realtime", ko: "서버 / 실시간" }),
      description: l.trans({
        en: "Bun-powered HTTP and WebSocket surfaces.",
        ko: "Bun 기반 HTTP와 WebSocket 표현.",
      }),
    },
    {
      title: l.trans({ en: "Database / Validation", ko: "DB / 검증" }),
      description: l.trans({
        en: "SQLite first, scalable, and schema validated.",
        ko: "SQLite 우선, 확장 가능, 스키마 검증.",
      }),
    },
    {
      title: l.trans({ en: "Docs / Plugins", ko: "문서 / 플러그인" }),
      description: l.trans({
        en: "Live docs and official feature blocks.",
        ko: "실시간 문서와 공식 기능 블록.",
      }),
    },
    {
      title: l.trans({ en: "MCP / Prompts", ko: "MCP / 프롬프트" }),
      description: l.trans({
        en: "Every guarded endpoint becomes an agent tool.",
        ko: "가드가 있는 모든 엔드포인트가 에이전트 도구로.",
      }),
    },
    {
      title: l.trans({ en: "In-page agent", ko: "인페이지 에이전트" }),
      description: l.trans({
        en: "An assistant that works the screen with your users.",
        ko: "사용자와 함께 화면을 다루는 어시스턴트.",
      }),
    },
  ];
  const proofItems = [
    { value: "26MB → 8.1MB", label: l.trans({ en: "Client build output in v3", ko: "v3 클라이언트 빌드 결과물" }) },
    {
      value: "3.5ms → 0.9ms",
      label: l.trans({ en: "Hydrating 1,000 rows on the client", ko: "클라이언트 1,000행 하이드레이션" }),
    },
    { value: "−33%", label: l.trans({ en: "Time for a 50-row list query", ko: "50행 목록 쿼리 시간" }) },
  ];
  const agentSurfaces = [
    {
      title: l.trans({ en: "Every app is an MCP server", ko: "모든 앱이 MCP 서버" }),
      description: l.trans({
        en: "Each endpoint its guards admit is a tool Claude, Cursor or any MCP client can call, with the same masking as your screens. mcp: false keeps one off the shelf.",
        ko: "가드가 허용하는 엔드포인트마다 Claude, Cursor 같은 MCP 클라이언트가 부를 수 있는 도구가 되고, 화면과 같은 마스킹을 거칩니다. mcp: false로 목록에서만 뺄 수 있습니다.",
      }),
      codeTitle: "task.signal.ts",
      code: `completeTask: mutation(cnst.Task, {
  guards: [SignedIn],
})
  .param("taskId", String)
  .exec(function (taskId) { … })`,
    },
    {
      title: l.trans({ en: "An agent that works the screen", ko: "화면을 다루는 에이전트" }),
      description: l.trans({
        en: "<Agent.Chat /> reads the rendered page and drives it through the same controls a person uses, inside their own session, asking before anything changes data.",
        ko: "<Agent.Chat />가 렌더링된 페이지를 읽고, 사용자 자신의 세션 안에서 사람이 쓰는 컨트롤로 화면을 움직이며, 데이터를 바꾸기 전에는 승인을 받습니다.",
      }),
      codeTitle: "Plan.Zone.tsx",
      code: `const publish = st.tool("publish")
  .desc("Publish the plan.")
  .exec(() => st.do.publish());

<Button onClick={publish} />`,
    },
    {
      title: l.trans({ en: "Pages become prompts", ko: "페이지가 프롬프트로" }),
      description: l.trans({
        en: "One stage on a page publishes the screen as an MCP prompt: its fetches run under the caller's token and the agent gets the data plus the tools to act on it.",
        ko: "페이지에 단계 하나를 붙이면 화면이 MCP 프롬프트가 됩니다. 페이지의 fetch가 호출자의 토큰으로 돌고, 에이전트는 데이터와 그걸 다룰 도구를 함께 받습니다.",
      }),
      codeTitle: "tickets.tsx",
      code: `export default page()
  .param("projectId", ID)
  .prompt(
    "briefProjectTickets",
    "Brief one project.",
  )
  .render(…);`,
    },
  ];
  const showcasePreviews = [
    {
      name: "akanjs.com",
      motif: "docs" as const,
      tone: "primary" as const,
      isSample: false,
      badge: l.trans({ en: "Built by the Akan team", ko: "Akan 팀 제작" }),
      description: l.trans({
        en: "This site: docs, blog, full-text docs search and an in-page docs agent from one Akan.js app.",
        ko: "지금 보고 계신 이 사이트입니다. 문서, 블로그, 문서 전문 검색, 인페이지 문서 에이전트가 하나의 Akan.js 앱에서 나옵니다.",
      }),
    },
    {
      name: "Frontline Rooms",
      motif: "arena" as const,
      tone: "primary" as const,
      isSample: true,
      badge: l.trans({ en: "Sample", ko: "샘플" }),
      description: l.trans({
        en: "A match server streaming 20 Hz state frames to each room over binary pubsub.",
        ko: "초당 20번 상태 프레임을 바이너리 pubsub으로 룸마다 흘려보내는 게임 서버입니다.",
      }),
    },
    {
      name: "Ledgerline",
      motif: "agent" as const,
      tone: "success" as const,
      isSample: true,
      badge: l.trans({ en: "Sample", ko: "샘플" }),
      description: l.trans({
        en: "A finance console where an in-page agent fills the expense form and a person approves every change.",
        ko: "인페이지 에이전트가 경비 폼을 채우고 모든 변경은 사람이 승인하는 재무 콘솔입니다.",
      }),
    },
  ];
  const deploySteps = [
    {
      command: "akan login",
      description: l.trans({
        en: "Sign in to Akan Cloud from your machine.",
        ko: "이 컴퓨터에서 Akan Cloud에 로그인합니다.",
      }),
    },
    {
      command: "akan tunnel <app>",
      description: l.trans({
        en: "Share the app you are running on a public URL before you ship.",
        ko: "배포 전에 실행 중인 앱을 공개 URL로 공유합니다.",
      }),
    },
    {
      command: "akan build <app>",
      description: l.trans({
        en: "Build the production artifact Akan Cloud runs.",
        ko: "Akan Cloud가 돌릴 프로덕션 결과물을 빌드합니다.",
      }),
    },
  ];
  const roadmapWaypoints = [
    { key: "v1", label: "v1", caption: l.trans({ en: "Liftoff", ko: "리프트오프" }), state: "flown" as const },
    { key: "v2", label: "v2", caption: "Max-Q", state: "flown" as const },
    {
      key: "v3",
      label: l.trans({ en: "v3 · You are here", ko: "v3 · 현재 위치" }),
      caption: l.trans({ en: "Stage separation", ko: "단 분리" }),
      state: "current" as const,
    },
    ...[
      { en: "Desktop", ko: "데스크톱" },
      { en: "Mobile", ko: "모바일" },
      { en: "Agent network", ko: "에이전트 네트워크" },
      { en: "Cloud", ko: "클라우드" },
      { en: "Data scale-out", ko: "데이터 확장" },
      { en: "Blocks", ko: "블록" },
      { en: "Studio", ko: "스튜디오" },
      { en: "Offline", ko: "오프라인" },
      { en: "Autopilot", ko: "오토파일럿" },
    ].map((caption, idx) => ({
      key: `0${idx + 1}`,
      label: `0${idx + 1}`,
      caption: l.trans(caption),
      state: idx < 3 ? ("committed" as const) : ("proposed" as const),
    })),
  ];

  return (
    <main className="relative min-h-screen overflow-hidden break-keep bg-background text-foreground">
      <div className="absolute inset-x-0 top-20 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />

      <section className="relative mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 items-center gap-10 px-6 pt-32 pb-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-8">
        <div>
          <Link
            href="/blog/v3release"
            className={badgeRecipe(
              undefined,
              "mb-6 border-primary/20 bg-primary/10 px-4 py-3 text-primary transition hover:bg-primary/15",
            )}
          >
            <BsCheckCircle />
            {l.trans({
              en: "New · Akan.js v3 — agents join the full stack",
              ko: "New · Akan.js v3 — 풀스택에 에이전트가 합류",
            })}
            <BsArrowRight />
          </Link>
          <h1 className="max-w-4xl font-black text-5xl text-foreground tracking-tight sm:text-5xl lg:text-6xl">
            {l.trans({
              en: "One line of business code ships web, iOS, Android, server, database — and agents",
              ko: "한 줄의 비즈니스 코드로 웹·iOS·Android·서버·DB, 그리고 에이전트까지",
            })}
            <span className="text-primary">
              {l.trans({
                en: " together.",
                ko: " 한 번에.",
              })}
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-foreground/70 text-lg leading-8">
            {l.trans({
              en: "No more framework assembly, duplicated declarations, or per-platform rewrites. Write business intent in one place: five surfaces follow, and AI agents use it too — as MCP tools, page prompts and an in-page assistant, behind the same guards.",
              ko: "프레임워크 조립, 중복 선언, 플랫폼별 재작성은 이제 그만. 비즈니스 코드 한 곳만 작성하면 5개 표현이 따라오고, 같은 가드 뒤에서 MCP 도구, 페이지 프롬프트, 인페이지 어시스턴트로 AI 에이전트도 그대로 씁니다.",
            })}
          </p>
          <p className="mt-3 max-w-2xl text-base text-foreground/60 leading-7">
            {l.trans({
              en: "Akan starts with the result people feel first, then keeps the method explainable from database to UI.",
              ko: "Akan은 먼저 체감되는 결과를 만들고, 그 방법론을 데이터베이스부터 UI까지 납득 가능하게 유지합니다.",
            })}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {["Web", "iOS", "Android", "Server", "DB", "MCP", "In-page agent", "Type-safe"].map((surface) => (
              <span
                key={surface}
                className={badgeRecipe(
                  undefined,
                  "border-foreground/10 bg-foreground/10 px-3 py-1 text-foreground text-sm",
                )}
              >
                {surface}
              </span>
            ))}
          </div>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/docs/intro/quickstart">
              <button className={buttonRecipe(undefined, "border-none bg-primary text-background hover:bg-primary/80")}>
                {l.trans({ en: "Get Started", ko: "시작하기" })} <BsArrowRight className="ml-2" />
              </button>
            </Link>
            <Link href="/showcase" className={buttonRecipe({ variant: "outline" })}>
              {l.trans({ en: "See the showcase", ko: "쇼케이스 보기" })}
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 rotate-3 rounded-4xl bg-primary/20 blur-2xl" />
          <div className="relative overflow-hidden rounded-4xl border border-foreground/10 bg-foreground/6 p-5 shadow-2xl backdrop-blur">
            <div className="mb-5 flex items-center justify-between rounded-2xl border border-foreground/10 bg-background/70 px-4 py-3">
              <div>
                <p className="text-foreground/40 text-xs tracking-[0.24em]">Akan.js</p>
                <p className="font-semibold text-foreground text-lg">
                  {l.trans({ en: "Business code becomes the whole product", ko: "비즈니스 코드가 제품 전체가 됩니다" })}
                </p>
              </div>
              <div className="rounded-xl bg-primary/10 px-3 py-2 font-medium text-primary text-sm">1 → All</div>
            </div>
            <Code.Snippet
              showLineNumbers={false}
              code={`export class ProductInput extends via((field) => ({
  name: field(String),
})) {}`}
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {heroSurfaces.map((item) => (
                <div key={item.title} className="rounded-2xl border border-foreground/10 bg-background/80 p-4">
                  <p className="font-bold text-foreground">{item.title}</p>
                  <p className="mt-1 text-foreground/60 text-sm leading-6">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 pb-20 lg:px-8">
        <div className="grid gap-px overflow-hidden rounded-3xl border border-foreground/10 bg-foreground/10 sm:grid-cols-2 lg:grid-cols-4">
          {proofItems.map((item) => (
            <div key={item.value} className="bg-background/90 px-6 py-5">
              <p className="font-black font-mono text-2xl text-primary">{item.value}</p>
              <p className="mt-1 text-foreground/60 text-sm">{item.label}</p>
            </div>
          ))}
          <Link
            href="/blog/v3release#v3-performance"
            className="group flex flex-col justify-center bg-background/90 px-6 py-5"
          >
            <p className="flex items-center gap-2 font-bold text-foreground group-hover:text-primary">
              {l.trans({ en: "v3 benchmark", ko: "v3 벤치마크" })} <BsArrowRight />
            </p>
            <p className="mt-1 text-foreground/60 text-sm">
              {l.trans({ en: "Startup 2× faster, a third less memory", ko: "시작 2배 빠르게, 메모리 3분의 1 절감" })}
            </p>
          </Link>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 pb-20 lg:px-8">
        <div className="mb-10 text-center">
          <div className={badgeRecipe(undefined, "mb-4 border-foreground/10 bg-foreground/10 text-foreground")}>
            {l.trans({ en: "Built for the pain you already feel", ko: "이미 느끼고 있는 문제를 위해" })}
          </div>
          <h2 className="font-black text-3xl tracking-tight md:text-5xl">
            {l.trans({ en: "Built for the pain you already feel.", ko: "각자의 페인포인트를 먼저 해결합니다." })}
          </h2>
          <p className="mx-auto mt-4 max-w-4xl text-foreground/60 leading-7">
            {l.trans({
              en: "Web, app, server, database, and team size all hurt in different ways. Akan lets each developer recognize their own bottleneck first.",
              ko: "웹, 앱, 서버, DB, 팀 규모는 저마다 다른 방식으로 발목을 잡습니다. Akan은 각 개발자가 자기 병목을 먼저 알아보게 합니다.",
            })}
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {personaCards.map((card, index) => (
            <div key={card.title} className="rounded-3xl border border-foreground/10 bg-foreground/4 p-6 backdrop-blur">
              <div className="mb-5 flex items-center justify-between gap-4">
                <span className={badgeRecipe(undefined, "border-primary/20 bg-primary/10 text-primary")}>
                  {card.audience}
                </span>
                <span className="font-black text-4xl text-foreground/20">{index + 1}</span>
              </div>
              <h3 className="font-bold text-2xl text-foreground">{card.title}</h3>
              <p className="mt-4 text-foreground/65 leading-7">{card.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-20 lg:px-8">
        <div className="mb-8 text-center md:mb-12">
          <div className={badgeRecipe(undefined, "mb-4 border-primary/20 bg-primary/10 text-primary")}>
            {l.trans({ en: "8 in 1", ko: "8 in 1" })}
          </div>
          <h2 className="font-black text-3xl tracking-tight md:text-5xl">
            {l.trans({ en: "One field. Eight layers follow.", ko: "필드 하나. 8개 레이어가 따라옵니다." })}
          </h2>
          <p className="mx-auto mt-4 max-w-4xl text-foreground/60 leading-7">
            {l.trans({
              en: "This is why one developer can own web, app, server, and database at once: the scattered wiring compresses into a single business declaration.",
              ko: "1명이 웹, 앱, 서버, DB를 함께 책임질 수 있는 이유입니다. 흩어진 배선이 하나의 비즈니스 선언으로 압축됩니다.",
            })}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-4xl border border-primary/20 bg-foreground/5 p-5 shadow-2xl backdrop-blur md:p-8">
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/70 to-transparent" />
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-3xl border border-foreground/10 bg-background/80 p-6">
              <div className={badgeRecipe(undefined, "mb-4 border-destructive/20 bg-destructive/10 text-destructive")}>
                {l.trans({ en: "Before", ko: "Before" })}
              </div>
              <h3 className="font-bold text-2xl">
                {l.trans({
                  en: "Adding one field the traditional way",
                  ko: "기존 풀스택에서 필드 하나 추가하려면",
                })}
              </h3>
              <p className="mt-3 text-foreground/60 text-sm leading-6">
                {l.trans({
                  en: "Adding a single business field usually means wiring all of this by hand.",
                  ko: "비즈니스 필드 하나를 추가하려면 보통 이만큼을 직접 손으로 해야 합니다.",
                })}
              </p>
              <div className="mt-5 grid gap-2">
                {workflowLayers.map((layer, index) => (
                  <div key={layer} className="flex items-center gap-3 rounded-2xl bg-foreground/5 px-4 py-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive/10 font-bold text-destructive text-xs">
                      {index + 1}
                    </span>
                    <span className="font-medium text-foreground text-sm">{layer}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-foreground/60 text-sm leading-6">
                {l.trans({
                  en: "Change one place, chase eight. Miss one, and types break — or it blows up at runtime.",
                  ko: "한 곳만 바뀌어도 8곳을 따라 고쳐야 하고, 한 곳을 빠뜨리면 타입이 깨지거나 런타임에서 터집니다.",
                })}
              </p>
            </div>
            <div className="rounded-3xl border border-primary/20 bg-background/80 p-6">
              <div className={badgeRecipe(undefined, "mb-4 border-primary/20 bg-primary/10 text-primary")}>
                {l.trans({ en: "After — Akan.js", ko: "After — Akan.js" })}
              </div>
              <h3 className="font-bold text-2xl">
                {l.trans({
                  en: "One declaration becomes every layer",
                  ko: "선언 하나가 모든 레이어가 됩니다",
                })}
              </h3>
              <div className="mt-5">
                <Code.Snippet
                  showLineNumbers={false}
                  code={`export class ProductInput extends via((field) => ({
  name: field(String),
})) {}`}
                />
              </div>
              <p className="mt-5 text-foreground/65 leading-7">
                {l.trans({
                  en: "One field declaration — schema and type defined at once. All eight layers above are generated automatically.",
                  ko: "필드 선언 한 줄로 스키마와 타입이 동시에 정의됩니다. 위 8개 레이어는 전부 자동 생성됩니다.",
                })}
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {workflowLayers.map((layer) => (
                  <div key={layer} className="rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3">
                    <p className="font-medium text-primary text-sm">{layer}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-20 lg:px-8">
        <div className="mb-10 text-center">
          <div className={badgeRecipe(undefined, "mb-4 border-primary/20 bg-primary/10 text-primary")}>
            {l.trans({ en: "Agents Use It", ko: "에이전트가 쓰는 앱" })}
          </div>
          <h2 className="font-black text-3xl tracking-tight md:text-5xl">
            {l.trans({
              en: "Every app is agent-ready from the first line.",
              ko: "모든 앱이 첫 줄부터 에이전트 레디입니다.",
            })}
          </h2>
          <p className="mx-auto mt-4 max-w-4xl text-foreground/60 leading-7">
            {l.trans({
              en: "The guards that protect your screens also publish them to AI agents. Nothing to opt in, nothing to keep in sync: the same endpoint serves the button, the MCP tool and the in-page assistant.",
              ko: "화면을 지키는 가드가 그 화면을 AI 에이전트에게도 공개합니다. 켜야 할 것도, 맞춰야 할 것도 없습니다. 같은 엔드포인트가 버튼, MCP 도구, 인페이지 어시스턴트를 함께 받칩니다.",
            })}
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {agentSurfaces.map((item) => (
            <div
              key={item.title}
              className="flex flex-col rounded-3xl border border-foreground/10 bg-foreground/4 p-6 backdrop-blur"
            >
              <h3 className="font-bold text-foreground text-xl">{item.title}</h3>
              <p className="mt-3 text-foreground/60 text-sm leading-6">{item.description}</p>
              <Code.Snippet className="mt-5 w-full" title={item.codeTitle} code={item.code} showLineNumbers={false} />
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-4xl border border-primary/20 bg-primary/5 p-6 md:flex-row md:items-center md:p-8">
          <p className="max-w-3xl text-foreground/70 leading-7">
            {l.trans({
              en: "With libs/shared, OAuth 2.1 comes built in: an agent signs in as the user and acts with exactly that user's rights.",
              ko: "libs/shared를 쓰면 OAuth 2.1이 내장됩니다. 에이전트는 사용자로 로그인하고 정확히 그 사용자의 권한으로만 움직입니다.",
            })}
          </p>
          <Link href="/blog/v3release" className={buttonRecipe({ variant: "primary" }, "shrink-0")}>
            {l.trans({ en: "What's new in v3", ko: "v3에서 달라진 점" })} <BsArrowRight className="ml-2" />
          </Link>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-20 lg:px-8">
        <div className="mb-10 max-w-4xl">
          <div className={badgeRecipe(undefined, "mb-4 border-accent/20 bg-accent/10 text-accent")}>
            {l.trans({
              en: "Agents Build It · Rules Create Quality",
              ko: "에이전트가 만드는 앱 · 규칙이 품질을 만듭니다",
            })}
          </div>
          <h2 className="font-black text-3xl tracking-tight md:text-5xl">
            {l.trans({
              en: "AI coding turns to spaghetti past a certain size.",
              ko: "AI 코딩은 일정 규모를 넘으면 스파게티가 됩니다.",
            })}
          </h2>
          <p className="mt-5 max-w-3xl text-foreground/65 leading-7">
            {l.trans({
              en: "The faster an agent writes code, the more file paths, names, structures, and declaration styles drift apart — until review and maintenance fall over. Akan stops this at the source with strict rules.",
              ko: "에이전트가 코드를 빨리 뽑을수록 파일 위치, 이름, 구조, 선언 방식이 제각각이 되어 리뷰와 유지보수가 무너집니다. Akan은 엄격한 규칙으로 이 문제를 원천 차단합니다.",
            })}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {qualityItems.map((item) => (
            <div key={item.title} className="rounded-3xl border border-foreground/10 bg-foreground/4 p-6 backdrop-blur">
              <div
                className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-background/80 ${item.iconClassName}`}
              >
                {item.icon}
              </div>
              <h3 className="font-bold text-foreground text-lg">{item.title}</h3>
              <p className="mt-2 text-foreground/60 text-sm leading-6">{item.description}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-4xl border border-primary/20 bg-primary/5 p-6 md:p-8">
          <h3 className="font-bold text-2xl text-primary">
            {l.trans({
              en: "This is what we mean by agentic full-stack.",
              ko: "이것이 우리가 말하는 에이전틱 풀스택입니다.",
            })}
          </h3>
          <p className="mt-3 max-w-3xl text-foreground/65 leading-7">
            {l.trans({
              en: "It runs in both directions. Agents build the app on strict rules and fixed blocks — upload, login, admin, chat, boards, alerts — so they produce nothing but consistent code. And agents use the app through the same guards people do. Not an abstract idea, but quality that rules make.",
              ko: "에이전틱 풀스택은 양방향입니다. 에이전트는 엄격한 규칙과 업로드, 로그인, 관리자, 채팅, 게시판, 알림 같은 정해진 블록 위에서 앱을 만들기에 일관된 코드만 생산합니다. 그리고 에이전트는 사람과 같은 가드를 거쳐 그 앱을 씁니다. 추상적인 개념이 아니라, 규칙이 만든 품질입니다.",
            })}
          </p>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-20 lg:px-8">
        <div className="mb-8 rounded-4xl border border-foreground/10 bg-foreground/4 p-6 backdrop-blur md:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <div className={badgeRecipe(undefined, "mb-4 border-primary/20 bg-primary/10 text-primary")}>
                {l.trans({ en: "Platform Surfaces", ko: "플랫폼 표현" })}
              </div>
              <h2 className="font-black text-3xl tracking-tight md:text-5xl">
                {l.trans({
                  en: "Everything a business app needs, connected",
                  ko: "비즈니스 앱에 필요한 모든 것을 연결합니다",
                })}
              </h2>
              <p className="mt-4 text-foreground/60 leading-7">
                {l.trans({
                  en: "Akan supports web, iOS, Android, server, database, validation, internationalization, and official plugins as one coherent stack.",
                  ko: "Akan은 웹, iOS, Android, 서버, 데이터베이스, 검증, 다국어, 공식 플러그인을 하나의 일관된 스택으로 지원합니다.",
                })}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {platformSurfaces.map((surface) => (
                <div key={surface} className="rounded-2xl border border-foreground/10 bg-background/80 px-4 py-3">
                  <p className="font-medium text-foreground text-sm">{surface}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-10 rounded-4xl border border-foreground/10 bg-foreground/4 p-5 backdrop-blur md:p-8">
          <div className="mb-8 text-center">
            <div className={badgeRecipe(undefined, "mb-4 border-primary/20 bg-primary/10 text-primary")}>
              {l.trans({ en: "Generated From Intent", ko: "의도에서 자동 생성" })}
            </div>
            <h2 className="font-black text-3xl tracking-tight md:text-5xl">
              {l.trans({ en: "Stop repeating the same plumbing", ko: "반복작업은 이제 그만" })}
            </h2>
            <p className="mx-auto mt-4 max-w-4xl text-foreground/60 leading-7">
              {l.trans({
                en: "Akan turns business declarations into docs, APIs, queries, state, and loading behavior so repetitive work disappears.",
                ko: "Akan은 비즈니스 선언을 문서, API, 쿼리, 상태, 로딩 처리로 확장해 반복작업을 줄입니다.",
              })}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {automationItems.map((item, index) => (
              <div key={item.title} className="rounded-3xl border border-foreground/10 bg-background/80 p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 font-black text-primary">
                  {index + 1}
                </div>
                <h3 className="font-bold text-lg">{item.title}</h3>
                <p className="mt-2 text-foreground/60 text-sm leading-6">{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-10 rounded-4xl border border-foreground/10 bg-foreground/4 p-5 backdrop-blur md:p-8">
          <div className="mb-6 max-w-3xl">
            <div className={badgeRecipe(undefined, "mb-4 border-primary/20 bg-primary/10 text-primary")}>
              {l.trans({ en: "Native-Feeling App Packaging", ko: "네이티브스러운 앱 패키징" })}
            </div>
            <h3 className="font-black text-2xl tracking-tight md:text-4xl">
              {l.trans({
                en: "Packaged web, native-level transitions",
                ko: "앱 패키징된 웹, 네이티브 수준의 화면 전환",
              })}
            </h3>
            <p className="mt-3 text-foreground/60 leading-7">
              {l.trans({
                en: "Akan web pages are compiled and packaged into apps. Unlike ordinary web packaging that often feels like a wrapped website, Akan ships built-in screen transitions for list-detail flows, overlays, and context changes, so the packaged web can deliver a native-level user experience without a separate UI rewrite.",
                ko: "Akan에서 작성한 웹은 컴파일되어 앱으로 패키징됩니다. 일반적인 웹 앱 패키징이 감싼 웹사이트처럼 느껴지는 것과 달리, Akan은 목록-상세 흐름, 오버레이, 맥락 전환을 위한 빌트인 화면 전환 기능을 제공해 별도 UI 재작성 없이도 앱 패키징된 웹에서 네이티브 수준의 사용자 경험을 만들 수 있습니다.",
              })}
            </p>
            <p className="mt-3 text-foreground/60 leading-7">
              {l.trans({
                en: "Brand it without a fork: recipes and a per-route _overrides.tsx re-skin every framework component. Native desktop apps are next on the roadmap.",
                ko: "포크 없이 브랜드를 입히세요. 레시피와 라우트별 _overrides.tsx로 모든 프레임워크 컴포넌트를 갈아입힙니다. 네이티브 데스크톱 앱은 로드맵의 다음 단계입니다.",
              })}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {transitionItems.map((item) => (
              <div
                key={item.title}
                className="overflow-hidden rounded-3xl border border-foreground/10 bg-background/80"
              >
                <div className="p-4">
                  <div className="font-bold font-mono text-primary">{item.title}</div>
                  <p className="mt-2 text-foreground/60 text-sm leading-6">{item.description}</p>
                </div>
                <div className="border-foreground/10 border-t bg-foreground/5 p-3">
                  <video
                    src={item.src}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="mx-auto aspect-9/16 max-h-[460px] w-full rounded-2xl object-contain"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mb-10 max-w-4xl text-center">
          <h2 className="font-black text-3xl tracking-tight md:text-5xl">
            {l.trans({ en: "See the business, not the system", ko: "시스템이 아니라 비즈니스를 보세요" })}
          </h2>
          <p className="mt-4 text-foreground/60 leading-7">
            {l.trans({
              en: "These demos show how one convention-driven workspace carries business intent through multiple surfaces.",
              ko: "아래 데모는 하나의 컨벤션 기반 워크스페이스가 비즈니스 의도를 여러 표현으로 이어가는 방식을 보여줍니다.",
            })}
          </p>
        </div>

        <div className="rounded-4xl border border-foreground/10 bg-foreground/4 p-5 backdrop-blur md:p-8">
          <h2 className="mb-8 text-center font-black text-3xl tracking-tight md:mb-12 md:text-5xl">
            {l.trans({
              en: "How Conventions Expand Your Business Definition",
              ko: "컨벤션이 비즈니스 정의를 확장하는 방식",
            })}
          </h2>
          <div className="space-y-6 md:space-y-8">
            {procedureItems.map((item, index) => (
              <div
                key={item.title}
                className="overflow-hidden rounded-3xl border border-foreground/10 bg-background/80 shadow-xl"
              >
                <div className="grid items-center gap-6 p-5 md:p-6 lg:grid-cols-[0.8fr_1.2fr]">
                  <div className={index % 2 === 1 ? "lg:order-2" : ""}>
                    <div className={badgeRecipe(undefined, "mb-4 border-primary/20 bg-primary/10 text-primary")}>
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <h3 className="font-bold text-2xl">{item.title}</h3>
                    <p className="mt-3 text-foreground/65 text-sm leading-6">{item.description}</p>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/5">
                    <video src={item.src} autoPlay muted loop playsInline className="size-full object-cover" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 pb-10 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className={badgeRecipe(undefined, "mb-4 border-primary/20 bg-primary/10 text-primary")}>
              {l.trans({ en: "Showcase", ko: "쇼케이스" })}
            </div>
            <h2 className="font-black text-3xl tracking-tight md:text-5xl">
              {l.trans({ en: "Built with Akan.js", ko: "Akan.js로 만든 것들" })}
            </h2>
          </div>
          <Link href="/showcase" className="flex items-center gap-2 font-semibold text-primary hover:underline">
            {l.trans({ en: "See all projects", ko: "모든 프로젝트 보기" })} <BsArrowRight />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {showcasePreviews.map((item) => (
            <Link
              key={item.name}
              href="/showcase"
              className="group rounded-3xl border border-foreground/10 bg-foreground/4 p-4 transition hover:border-primary/30"
            >
              <ShowcaseThumbnail motif={item.motif} tone={item.tone} />
              <div className="mt-4 flex items-center justify-between gap-3">
                <h3 className="font-bold text-lg group-hover:text-primary">{item.name}</h3>
                <span
                  className={badgeRecipe(
                    { size: "sm" },
                    item.isSample
                      ? "border-foreground/20 border-dashed bg-transparent text-foreground/50"
                      : "border-primary/20 bg-primary/10 text-primary",
                  )}
                >
                  {item.badge}
                </span>
              </div>
              <p className="mt-2 text-foreground/60 text-sm leading-6">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-10 lg:px-8">
        <div className="grid gap-8 rounded-4xl border border-foreground/10 bg-foreground/4 p-6 backdrop-blur md:p-10 lg:grid-cols-2 lg:items-center">
          <div>
            <div className={badgeRecipe(undefined, "mb-4 border-primary/20 bg-primary/10 text-primary")}>
              <BsCloudArrowUp />
              {l.trans({ en: "Deploy", ko: "배포" })}
            </div>
            <h2 className="font-black text-3xl tracking-tight md:text-5xl">
              {l.trans({ en: "From akan build to a live URL", ko: "akan build에서 라이브 URL까지" })}
            </h2>
            <p className="mt-4 text-foreground/60 leading-7">
              {l.trans({
                en: "Akan Cloud is the deploy platform built for Akan apps. Sign in from the CLI, share a preview, build, and ship it live.",
                ko: "Akan Cloud는 Akan 앱을 위해 만든 배포 플랫폼입니다. CLI에서 로그인하고, 미리보기를 공유하고, 빌드해서 라이브로 내보내세요.",
              })}
            </p>
            <Link
              href="https://cloud.akanjs.com"
              target="_blank"
              className={buttonRecipe({ variant: "primary", size: "lg" }, "mt-6")}
            >
              {l.trans({ en: "Open Akan Cloud", ko: "Akan Cloud 열기" })} <BsArrowUpRight className="ml-2" />
            </Link>
          </div>
          <div className="rounded-3xl border border-foreground/10 bg-background/80 p-5 font-mono text-sm">
            {deploySteps.map((step, idx) => (
              <div key={step.command} className="flex gap-4 border-foreground/10 border-b py-3 last:border-none">
                <span className="text-foreground/30">{String(idx + 1).padStart(2, "0")}</span>
                <div>
                  <p className="text-primary">$ {step.command}</p>
                  <p className="mt-1 font-sans text-foreground/60 text-xs leading-5">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-10 lg:px-8">
        <div className="rounded-4xl border border-foreground/10 bg-foreground/3 p-6 md:p-10">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className={badgeRecipe(undefined, "mb-4 border-primary/20 bg-primary/10 font-mono text-primary")}>
                {l.trans({ en: "Roadmap", ko: "로드맵" })}
              </div>
              <h2 className="font-black text-3xl tracking-tight md:text-5xl">
                {l.trans({ en: "Where we're headed", ko: "우리가 향하는 곳" })}
              </h2>
              <p className="mt-4 max-w-2xl text-foreground/60 leading-7">
                {l.trans({
                  en: "Native desktop apps, production-grade mobile and an agent network across sessions and apps come next.",
                  ko: "네이티브 데스크톱 앱, 프로덕션급 모바일, 세션과 앱을 넘나드는 에이전트 네트워크가 다음입니다.",
                })}
              </p>
            </div>
            <Link href="/roadmap" className="flex items-center gap-2 font-semibold text-primary hover:underline">
              {l.trans({ en: "See the roadmap", ko: "로드맵 보기" })} <BsArrowRight />
            </Link>
          </div>
          <RoadmapTrajectory className="mt-6" waypoints={roadmapWaypoints} />
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-20 lg:px-8">
        <div className="overflow-hidden rounded-4xl border border-foreground/10 bg-foreground/6 p-8 text-center shadow-2xl backdrop-blur md:p-12">
          <div className={badgeRecipe(undefined, "mb-5 border-primary/20 bg-primary/10 text-primary")}>
            {l.trans({ en: "One person, a whole product", ko: "한 사람이, 제품 전체를" })}
          </div>
          <h2 className="font-black text-3xl tracking-tight md:text-5xl">
            {l.trans({
              en: "Run the business with one quarter of the code.",
              ko: "기존 대비 1/4의 코드로 비즈니스를 운영하세요.",
            })}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-foreground/65 leading-7">
            {l.trans({
              en: "Less code means fewer tokens, clearer intent, easier reviews, and calmer updates. Akan is optimized for the happiness of developers who ship real products.",
              ko: "적은 코드량은 적은 토큰소모, 선명한 의도, 쉬운 리뷰, 안정적인 업데이트로 이어집니다. Akan은 실제 제품을 출시하는 개발자의 행복에 최적화되어 있습니다.",
            })}
          </p>
          <Code.Snippet title="Terminal" code="bunx create-akan-workspace@latest" language="bash" />
          <div className="mt-4">
            <Link href="/docs/intro/quickstart">
              <button className={buttonRecipe({ variant: "primary", size: "lg" })}>
                {l.trans({ en: "Get Started", ko: "시작하기" })} <BsArrowRight className="ml-2" />
              </button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
});
