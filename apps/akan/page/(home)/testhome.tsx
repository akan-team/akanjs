import { usePage } from "@apps/akan/client";
import { Ascent, AscentFigure, Code, plateRecipe, ShowcaseThumbnail } from "@apps/akan/ui";
import { page } from "akanjs/client";
import { badgeRecipe, buttonRecipe, Clipboard, Link } from "akanjs/ui";
import { BsArrowRight, BsArrowUpRight, BsCheckCircle } from "react-icons/bs";

const installCommand = "bunx create-akan-workspace@latest";

export default page().render(() => {
  const { l } = usePage();
  const ascentLabels = {
    line: "name: field(String)",
    layers: ["schema", "query", "service", "api", "fetch", "type", "state", "ui"],
    platforms: ["Web", "iOS", "Android", "macOS", "Windows", "Linux"],
    audiences: [l.trans({ en: "people", ko: "사람" }), l.trans({ en: "agents", ko: "에이전트" })],
    surfaces: [
      "schema",
      "db",
      "server",
      "signal",
      "fetch",
      "store",
      "ui",
      "i18n",
      "web",
      "ios",
      "android",
      "mcp",
      "macos",
      "agent",
      "windows",
      "linux",
    ],
  };
  const chapters = [
    {
      dim: 1,
      show: "line",
      copies: 0,
      numeral: "01",
      tag: l.trans({ en: "1 line", ko: "1줄" }),
      title: l.trans({ en: "The line you write.", ko: "당신이 쓰는 한 줄." }),
      body: l.trans({
        en: "Adding a field is one declaration — a name and a type. The database, API, screens and agent tools all come from that line, so there is nothing else to write by hand.",
        ko: "필드를 더하는 일은 선언 한 줄, 이름과 타입이면 됩니다. DB, API, 화면, 에이전트 도구까지 모두 이 한 줄에서 나오니 손으로 더 쓸 것이 없습니다.",
      }),
    },
    {
      dim: 2,
      show: "layers",
      copies: 8,
      numeral: "02",
      tag: l.trans({ en: "× 8 layers", ko: "× 8 레이어" }),
      title: l.trans({ en: "Through every layer.", ko: "모든 레이어를 관통하고," }),
      body: l.trans({
        en: "That one line reaches the schema, query, service, API, fetch, client type, state and UI prop. The eight places you used to wire by hand now change together — nothing to chase, nothing to miss.",
        ko: "그 한 줄이 스키마, 쿼리, 서비스, API, fetch, 클라이언트 타입, 상태, UI prop까지 닿습니다. 손으로 배선하던 8곳이 함께 바뀌니, 따라 고칠 곳도 빠뜨릴 곳도 없습니다.",
      }),
    },
    {
      dim: 3,
      show: "platforms",
      copies: 6,
      numeral: "03",
      tag: l.trans({ en: "× 6 platforms", ko: "× 6 플랫폼" }),
      title: l.trans({ en: "Onto every platform.", ko: "모든 플랫폼에 닿고," }),
      body: l.trans({
        en: "The same code ships as SEO-ready web, iOS and Android apps, and macOS, Windows and Linux desktop apps. One implementation to maintain, not six codebases to keep in step.",
        ko: "같은 코드가 SEO 웹, iOS·Android 앱, macOS·Windows·Linux 데스크톱 앱으로 배포됩니다. 보조를 맞춰야 할 코드베이스 여섯 개가 아니라, 관리할 구현 하나뿐입니다.",
      }),
    },
    {
      dim: 4,
      show: "audiences",
      copies: 0,
      numeral: "04",
      tag: l.trans({ en: "× people & agents", ko: "× 사람과 에이전트" }),
      title: l.trans({ en: "For people and agents alike.", ko: "사람과 에이전트 모두에게." }),
      body: l.trans({
        en: "Every guarded endpoint becomes an MCP tool and every action on screen an in-page agent tool, behind the same guards people pass. Whatever a person can do in your app, an agent can do on their behalf — with their rights, and nothing more.",
        ko: "가드를 통과한 엔드포인트는 MCP 도구가, 화면의 액션은 인페이지 에이전트 도구가 됩니다. 사람과 같은 가드를 거쳐서요. 사람이 앱에서 할 수 있는 일을 에이전트가 대신할 수 있고, 그 권한은 정확히 그 사람만큼입니다.",
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
        en: "One full-stack developer owns the whole product. One person, a fifth of the time.",
        ko: "풀스택 1명이 제품 전체를 책임집니다. 사람 한 명, 시간 1/5.",
      }),
    },
  ];
  const agentSurfaces = [
    {
      title: l.trans({ en: "Every app is an MCP server", ko: "모든 앱이 MCP 서버" }),
      description: l.trans({
        en: "Each endpoint its guards admit is a tool Claude, Cursor or any MCP client can call, with the same masking as your screens. mcp: false keeps one off the shelf.",
        ko: "가드가 허용하는 엔드포인트마다 Claude, Cursor 같은 MCP 클라이언트가 부를 수 있는 도구가 되고, 화면과 같은 마스킹을 거칩니다. mcp: false로 목록에서만 뺄 수 있습니다.",
      }),
      codeTitle: "task.signal.ts",
      code: `completeTask: mutation(cnst.Task, {...})
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
  const qualityItems = [
    {
      title: l.trans({ en: "Config Hell Ends", ko: "config 파일 지옥은 그만" }),
      description: l.trans({
        en: "Configure everything in akan.config.ts. Even when you configure nothing, defaults keep the product moving.",
        ko: "akan.config.ts 하나로 모든 것을 설정합니다. 하물며 설정하지 않아도 제품은 계속 굴러갑니다.",
      }),
    },
    {
      title: l.trans({ en: "Strict Rules, Unified Style", ko: "엄격한 규칙, 통일된 스타일" }),
      description: l.trans({
        en: "File paths, names, structures, and declarations stay consistent. Code reads like one person wrote it.",
        ko: "파일 위치, 이름, 구조, 선언 방식까지 통일됩니다. 누가 짰든 한 사람이 쓴 것처럼 읽힙니다.",
      }),
    },
    {
      title: l.trans({ en: "Rules Agents Can't Route Around", ko: "에이전트가 우회할 수 없는 규칙" }),
      description: l.trans({
        en: "Every workspace ships a plan-then-apply workflow MCP and akan code, so an agent edits through the rules, not around them.",
        ko: "모든 워크스페이스에 계획 후 적용하는 워크플로 MCP와 akan code가 들어 있어 에이전트는 규칙을 우회하지 않고 규칙을 따라 고칩니다.",
      }),
    },
    {
      title: l.trans({ en: "Agentic Full-Stack, Redefined", ko: "에이전틱 풀스택의 재정의" }),
      description: l.trans({
        en: "Fixed blocks for upload, login, admin, chat, boards, and alerts let agents produce consistent code.",
        ko: "업로드, 로그인, 관리자, 채팅, 게시판, 알림 같은 고정 블록 위에서 에이전트는 일관된 코드만 생산합니다.",
      }),
    },
  ];
  const platformSurfaces = [
    l.trans({ en: "iOS / Android client rendering", ko: "iOS / Android 클라이언트 렌더링" }),
    l.trans({ en: "SEO-ready server-side rendering", ko: "SEO 최적화 서버사이드 렌더링" }),
    l.trans({ en: "Linux / macOS / Windows desktop app", ko: "Linux / macOS / Windows 데스크톱 앱" }),
    l.trans({ en: "Bun HTTP / WebSocket server", ko: "Bun HTTP / WebSocket 서버" }),
    l.trans({ en: "SQLite first, Postgres / Redis ready", ko: "SQLite 우선, Postgres / Redis 확장" }),
    l.trans({ en: "Schema validation and secure middleware", ko: "스키마 검증과 보안 미들웨어" }),
    l.trans({ en: "Type-safe from DB to UI", ko: "DB부터 UI까지 타입 안전" }),
    l.trans({ en: "Built-in internationalization", ko: "다국어 지원 기본 탑재" }),
    l.trans({ en: "MCP server with OAuth 2.1", ko: "OAuth 2.1을 갖춘 MCP 서버" }),
    l.trans({ en: "In-page AI agent", ko: "인페이지 AI 에이전트" }),
  ];
  const transitionItems = [
    {
      title: "bottomup",
      description: l.trans({
        en: "Open focused flows from the bottom without leaving the CSR client.",
        ko: "CSR 클라이언트를 벗어나지 않고 하단에서 집중 흐름을 열 수 있습니다.",
      }),
      src: l.trans({ en: "/csr/bottomup_en.mp4", ko: "/csr/bottomup_ko.mp4" }),
    },
    {
      title: "fade",
      description: l.trans({
        en: "Change context calmly when the next screen is not a deeper page.",
        ko: "다음 화면이 더 깊은 계층이 아닐 때 차분하게 맥락을 전환합니다.",
      }),
      src: l.trans({ en: "/csr/fade_en.mp4", ko: "/csr/fade_ko.mp4" }),
    },
    {
      title: "scale",
      description: l.trans({
        en: "Guide attention into the next page with a light zoom transition.",
        ko: "가벼운 확대 전환으로 다음 페이지에 시선을 자연스럽게 모읍니다.",
      }),
      src: l.trans({ en: "/csr/scale_en.mp4", ko: "/csr/scale_ko.mp4" }),
    },
    {
      title: "stack",
      description: l.trans({
        en: "Push detail screens over lists with layered client navigation.",
        ko: "목록 위로 상세 화면을 쌓아 올리는 클라이언트 내비게이션을 만듭니다.",
      }),
      src: l.trans({ en: "/csr/stack_en.mp4", ko: "/csr/stack_ko.mp4" }),
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
  const automationItems = [
    {
      title: l.trans({ en: "One app implementation, every platform", ko: "하나의 앱 구현으로 모든 플랫폼" }),
      description: l.trans({
        en: "A single business codebase ships as web, Android, iOS, macOS, Windows and Linux.",
        ko: "비즈니스 코드 하나로 웹, Android, iOS, macOS, Windows, Linux를 지원합니다.",
      }),
    },
    {
      title: l.trans({
        en: "API declarations become MCP, state actions become agents",
        ko: "API 선언은 MCP로, 상태 액션은 에이전트 도구로 확장됩니다",
      }),
      description: l.trans({
        en: "Every guarded endpoint is published as an MCP tool, and every state action the screen already offers becomes an in-page agent tool. The same guards gate people and agents alike.",
        ko: "가드를 통과한 엔드포인트는 MCP 도구로, 화면이 이미 제공하는 상태 액션은 인페이지 에이전트 도구로 확장됩니다. 사람과 에이전트에게 같은 가드가 적용됩니다.",
      }),
    },
    {
      title: l.trans({
        en: "Declare once — schema and API docs follow",
        ko: "선언하면 스키마와 API 정의서가 함께 나옵니다",
      }),
      description: l.trans({
        en: "A business declaration becomes DB table documentation and a live API reference, so implementation and contract never drift apart.",
        ko: "비즈니스 선언이 DB 테이블 정의서와 실시간 API 정의서로 함께 생성되어, 구현과 계약이 어긋나지 않습니다.",
      }),
    },
    {
      title: l.trans({
        en: "A query and a slice expand into state and statistics",
        ko: "쿼리와 슬라이스 선언이 상태관리와 통계조회로 확장됩니다",
      }),
      description: l.trans({
        en: "One query condition drives list, detail and statistics reads; one slice becomes state, loading, pagination and insight.",
        ko: "쿼리조건 하나로 리스트, 단일조회, 통계조회가 이어지고, 슬라이스 하나가 상태관리, 로딩, 페이지네이션, 통계조회로 확장됩니다.",
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

  return (
    <main className="relative min-h-screen overflow-x-clip break-keep bg-background text-foreground">
      <div className="dot-grid pointer-events-none fixed inset-0" />
      <Ascent labels={ascentLabels} />

      <section
        data-ascent="1"
        className="relative flex min-h-[100svh] flex-col items-center justify-center px-6 pt-[calc(var(--akanjs-header-offset)+2rem)] pb-28 text-center"
      >
        <Link
          href="/blog/v3release"
          className={badgeRecipe(
            undefined,
            "intro-rise mb-14 border-primary/20 bg-primary/10 px-4 py-2 text-primary transition hover:bg-primary/15",
          )}
        >
          <BsCheckCircle />
          {l.trans({
            en: "New · Akan.js v3 — agents join the full stack",
            ko: "New · Akan.js v3 — 풀스택에 에이전트까지",
          })}
          <BsArrowRight />
        </Link>
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-[15%] -bottom-12 h-24 rounded-full bg-primary/20 blur-3xl" />
          <p className="relative whitespace-nowrap font-mono text-2xl sm:text-4xl lg:text-5xl">
            <span className="mr-4 select-none text-foreground/20 sm:mr-6">1</span>
            <span className="relative inline-block">
              <span data-ascent-seed className="seed-type [--seed-chars:19]">
                <span className="text-foreground">name</span>
                <span className="text-foreground/40">: </span>
                <span className="text-primary">field</span>
                <span className="text-foreground/40">(</span>
                <span className="text-foreground/80">String</span>
                <span className="text-foreground/40">)</span>
              </span>
              <span data-ascent-static className="absolute inset-x-0 -bottom-2 h-0.5 bg-primary" />
            </span>
            <span className="seed-caret ml-1" />
          </p>
        </div>
        <p className="intro-rise mt-14 font-mono text-[11px] text-primary uppercase tracking-[0.16em] [--intro-delay:1.1s] sm:text-xs sm:tracking-[0.3em]">
          {l.trans({
            en: "The agentic full-stack TypeScript framework.",
            ko: "에이전틱 풀스택 TypeScript 프레임워크.",
          })}
        </p>
        <h1 className="intro-rise mt-4 max-w-5xl font-black text-[34px]/[1.1] tracking-tight [--intro-delay:1.2s] sm:text-6xl lg:text-7xl">
          <span className="inline-block">{l.trans({ en: "Write one line.", ko: "한 줄 쓰고," })}</span>{" "}
          <span className="inline-block">{l.trans({ en: "Deploy everywhere.", ko: "어디에나 배포." })}</span>{" "}
          <span className="inline-block text-primary">{l.trans({ en: "Literally.", ko: "말 그대로." })}</span>
        </h1>
        <p className="intro-rise mt-6 max-w-2xl text-foreground/65 text-lg leading-8 [--intro-delay:1.35s] sm:text-xl sm:leading-9">
          {l.trans({
            en: "Web, iOS, Android, macOS, Windows and Linux. Your server and database. And the AI agents your users already talk to.",
            ko: "웹, iOS, Android, macOS, Windows, Linux. 서버와 데이터베이스. 그리고 사용자가 이미 쓰고 있는 AI 에이전트까지.",
          })}
        </p>
        <div className="intro-rise mt-10 flex w-full flex-col gap-3 [--intro-delay:1.5s] sm:w-auto sm:flex-row">
          <Link href="/docs/intro/quickstart">
            <button
              className={buttonRecipe(
                undefined,
                "w-full border-none bg-primary text-background hover:bg-primary/80 sm:w-auto",
              )}
            >
              {l.trans({ en: "Get Started", ko: "시작하기" })} <BsArrowRight className="ml-2" />
            </button>
          </Link>
          <Link href="/showcase" className={buttonRecipe({ variant: "outline" })}>
            {l.trans({ en: "See the showcase", ko: "쇼케이스 보기" })}
          </Link>
        </div>
        <p className="intro-rise absolute inset-x-0 bottom-8 font-mono text-[11px] text-foreground/40 uppercase tracking-[0.3em] [--intro-delay:2s]">
          {l.trans({ en: "Scroll to follow the line", ko: "스크롤해서 한 줄을 따라가 보세요" })} ↓
        </p>
      </section>

      <section className="relative">
        <div className="relative mx-auto w-full max-w-7xl px-6 lg:px-8">
          <div className="pointer-events-none absolute inset-0 lg:left-1/2">
            <div
              data-ascent-stage
              className="sticky top-[var(--akanjs-header-offset)] h-[40svh] sm:h-[48svh] lg:h-[calc(100svh-var(--akanjs-header-offset))]"
            >
              <div className="absolute inset-[24%] rounded-full bg-primary/10 blur-3xl" />
            </div>
          </div>
          {chapters.map((chapter) => (
            <article
              key={chapter.numeral}
              data-ascent={chapter.dim}
              data-ascent-show={chapter.show}
              className="chapter-fade grid min-h-[100svh] grid-cols-1 grid-rows-[1fr_auto] pb-[7svh] lg:grid-cols-2 lg:grid-rows-1 lg:items-center lg:pb-0"
            >
              <div data-ascent-static className="flex items-center justify-center lg:order-2">
                <AscentFigure dim={chapter.dim} copies={chapter.copies} className="size-52 sm:size-72 lg:size-96" />
              </div>
              <div className="lg:pr-12 xl:pr-20">
                <div className="relative w-fit font-lemonmilk text-6xl leading-none sm:text-8xl lg:text-9xl">
                  <span className="numeral-outline">{chapter.numeral}</span>
                  <span aria-hidden="true" className="numeral-fill absolute inset-0 text-primary">
                    {chapter.numeral}
                  </span>
                </div>
                <p className="mt-5 flex items-center gap-3 font-mono text-primary text-xs uppercase tracking-[0.25em]">
                  <span className="h-px w-8 bg-primary" />
                  {chapter.tag}
                </p>
                <h2 className="mt-4 font-black text-3xl tracking-tight sm:text-4xl lg:text-5xl">{chapter.title}</h2>
                <p className="mt-4 max-w-xl text-[15px] text-foreground/65 leading-7 sm:text-lg sm:leading-8">
                  {chapter.body}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section data-ascent="4" data-ascent-show="surfaces" data-ascent-spin className="relative h-[200svh]">
        <div className="sticky top-[var(--akanjs-header-offset)] flex h-[calc(100svh-var(--akanjs-header-offset))] flex-col items-center justify-center px-6 text-center lg:px-8">
          <div
            data-ascent-stage
            className="relative aspect-square w-[min(92vw,calc(100svh-var(--akanjs-header-offset)-19rem),40rem)]"
          >
            <div className="absolute inset-[26%] rounded-full bg-primary/15 blur-3xl" />
            <div data-ascent-static className="absolute inset-[12%]">
              <AscentFigure dim={4} className="size-full" />
            </div>
          </div>
          <p className="mt-6 font-mono text-primary text-xs uppercase tracking-[0.16em] sm:tracking-[0.3em]">
            {l.trans({
              en: "The agentic full-stack TypeScript framework.",
              ko: "에이전틱 풀스택 TypeScript 프레임워크.",
            })}
          </p>
          <h2 className="mt-4 font-black text-5xl tracking-tight sm:text-7xl lg:text-8xl">
            {l.trans({ en: "Literally everywhere.", ko: "말 그대로, 어디에나." })}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-foreground/65 leading-7 sm:text-lg sm:leading-8">
            {l.trans({
              en: "Eight layers, six platforms, people and agents — type-safe from the database to the screen. You wrote one line.",
              ko: "8개 레이어, 6개 플랫폼, 사람과 에이전트까지. DB부터 화면까지 타입 안전하게. 당신이 쓴 건 한 줄입니다.",
            })}
          </p>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 pb-24 lg:px-8">
        <div className="reveal-rise grid grid-cols-1 border-foreground/10 border-y sm:grid-cols-2 lg:grid-cols-4">
          {proofItems.map((item) => (
            <div key={item.value} className="border-foreground/10 px-2 py-6 sm:px-6 lg:border-r">
              <p className="font-black font-mono text-2xl text-primary">{item.value}</p>
              <p className="mt-1 text-foreground/60 text-sm">{item.label}</p>
            </div>
          ))}
          <Link href="/blog/v3release#v3-performance" className="group flex flex-col justify-center px-2 py-6 sm:px-6">
            <p className="flex items-center gap-2 font-bold text-foreground group-hover:text-primary">
              {l.trans({ en: "v3 benchmark", ko: "v3 벤치마크" })} <BsArrowRight />
            </p>
            <p className="mt-1 text-foreground/60 text-sm">
              {l.trans({ en: "Startup 2× faster, a third less memory", ko: "시작 2배 빠르게, 메모리 3분의 1 절감" })}
            </p>
          </Link>
        </div>

        <div className="reveal-rise mt-28 max-w-4xl">
          <h2 className="font-black text-3xl tracking-tight md:text-5xl">
            {l.trans({ en: "Start from where it hurts.", ko: "가장 아픈 곳에서 시작하세요." })}
          </h2>
          <p className="mt-4 text-foreground/60 leading-7">
            {l.trans({
              en: "Web, app, desktop, server, database, and team size all hurt in different ways. Start from the part you already know — the rest of the stack comes with it.",
              ko: "웹, 앱, 데스크탑, 서버, DB, 팀 규모는 저마다 다른 방식으로 발목을 잡습니다. 익숙한 곳에서 시작하세요. 나머지 스택은 함께 따라옵니다.",
            })}
          </p>
        </div>
        <div data-ascent="4" data-ascent-frame className="reveal-cascade mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {personaCards.map((card, idx) => (
            <div key={card.title} className={plateRecipe({ padding: "lg" })}>
              <div className="mb-6 flex items-center justify-between gap-4 font-mono text-xs uppercase tracking-[0.2em]">
                <span className="text-primary">{card.audience}</span>
                <span className="text-foreground/30">0{idx + 1}</span>
              </div>
              <h3 className="font-bold text-2xl">{card.title}</h3>
              <p className="mt-4 text-foreground/65 leading-7">{card.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-24 lg:px-8">
        <header className="reveal-rise max-w-4xl">
          <p className="flex items-center gap-3 font-mono text-primary text-xs uppercase tracking-[0.3em]">
            <AscentFigure dim={4} className="size-5" />
            {l.trans({ en: "Agents", ko: "에이전트" })}
          </p>
          <h2 className="mt-5 font-black text-3xl tracking-tight md:text-5xl">
            {l.trans({
              en: "Every app is agent-ready from the first line.",
              ko: "모든 앱이 첫 줄부터 에이전트를 지원합니다.",
            })}
          </h2>
          <p className="mt-4 text-foreground/60 leading-7">
            {l.trans({
              en: "The guards that protect your screens also publish them to AI agents. Nothing to opt in, nothing to keep in sync: the same endpoint serves the button, the MCP tool and the in-page assistant.",
              ko: "화면을 지키는 가드가 그 화면을 AI 에이전트에게도 공개합니다. 켜야 할 것도, 맞춰야 할 것도 없습니다. 같은 엔드포인트가 버튼, MCP 도구, 인페이지 어시스턴트를 함께 받칩니다.",
            })}
          </p>
        </header>
        <div data-ascent="4" data-ascent-frame className="mt-12">
          <div className="reveal-cascade grid grid-cols-1 gap-5 lg:grid-cols-3">
            {agentSurfaces.map((item) => (
              <div key={item.title} className={plateRecipe({}, "flex flex-col")}>
                <h3 className="font-bold text-xl">{item.title}</h3>
                <p className="mt-3 text-foreground/60 text-sm leading-6">{item.description}</p>
                <Code.Snippet className="mt-5 w-full" title={item.codeTitle} code={item.code} showLineNumbers={false} />
              </div>
            ))}
          </div>
          <div
            className={plateRecipe(
              { tone: "primary" },
              "reveal-rise mt-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center",
            )}
          >
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
        </div>

        <div data-ascent="4" data-ascent-frame className="mt-28">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="reveal-rise">
              <h3 className="font-black text-3xl tracking-tight md:text-4xl">
                {l.trans({
                  en: "AI coding turns to spaghetti past a certain size.",
                  ko: "AI 코딩은 일정 규모를 넘으면 스파게티가 됩니다.",
                })}
              </h3>
              <p className="mt-5 text-foreground/65 leading-7">
                {l.trans({
                  en: "The faster an agent writes code, the more file paths, names, structures, and declaration styles drift apart — until review and maintenance fall over. Akan stops this at the source with strict rules.",
                  ko: "에이전트가 코드를 빨리 뽑을수록 파일 위치, 이름, 구조, 선언 방식이 제각각이 되어 리뷰와 유지보수가 무너집니다. Akan은 엄격한 규칙으로 이 문제를 원천 차단합니다.",
                })}
              </p>
            </div>
            <ol className="reveal-cascade grid grid-cols-1 border-foreground/10 border-t">
              {qualityItems.map((item, idx) => (
                <li
                  key={item.title}
                  className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-foreground/10 border-b py-5 sm:grid-cols-[3rem_1fr]"
                >
                  <span className="font-mono text-foreground/30 text-sm">0{idx + 1}</span>
                  <div>
                    <p className="font-bold text-lg">{item.title}</p>
                    <p className="mt-1 text-foreground/60 text-sm leading-6">{item.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className={plateRecipe({ tone: "primary", padding: "lg" }, "reveal-rise mt-10")}>
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
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-24 lg:px-8">
        <header className="reveal-rise max-w-4xl">
          <p className="flex items-center gap-3 font-mono text-primary text-xs uppercase tracking-[0.3em]">
            <AscentFigure dim={3} className="size-5" />
            {l.trans({ en: "Platforms", ko: "플랫폼" })}
          </p>
          <h2 className="mt-5 font-black text-3xl tracking-tight md:text-5xl">
            {l.trans({
              en: "Everything a business app needs, in one stack",
              ko: "비즈니스 앱에 필요한 모든 것, 하나의 스택으로",
            })}
          </h2>
          <p className="mt-4 text-foreground/60 leading-7">
            {l.trans({
              en: "Web, iOS, Android, desktop, server, database, validation, internationalization and agents are not parts you bolt together — they come built into one coherent stack.",
              ko: "웹, iOS, Android, 데스크톱, 서버, 데이터베이스, 검증, 다국어, 에이전트는 따로 조립하는 부품이 아니라 하나의 일관된 스택에 처음부터 들어 있습니다.",
            })}
          </p>
        </header>
        <ul
          data-ascent="4"
          data-ascent-frame
          className="reveal-cascade mt-12 grid grid-cols-1 border-foreground/10 border-t sm:grid-cols-2 lg:grid-cols-5"
        >
          {platformSurfaces.map((surface, idx) => (
            <li key={surface} className="flex gap-3 border-foreground/10 border-b py-4 sm:pr-6">
              <span className="font-mono text-primary/70 text-xs">{String(idx + 1).padStart(2, "0")}</span>
              <span className="font-medium text-sm">{surface}</span>
            </li>
          ))}
        </ul>

        <div className="reveal-rise mt-28 max-w-3xl">
          <h3 className="font-black text-2xl tracking-tight md:text-4xl">
            {l.trans({ en: "Packaged web, native-level transitions", ko: "앱 패키징된 웹, 네이티브 수준의 화면 전환" })}
          </h3>
          <p className="mt-4 text-foreground/60 leading-7">
            {l.trans({
              en: "Akan web pages are compiled and packaged into apps. Unlike ordinary web packaging that often feels like a wrapped website, Akan ships built-in screen transitions for list-detail flows, overlays, and context changes, so the packaged web can deliver a native-level user experience without a separate UI rewrite.",
              ko: "Akan에서 작성한 웹은 컴파일되어 앱으로 패키징됩니다. 일반적인 웹 앱 패키징이 감싼 웹사이트처럼 느껴지는 것과 달리, Akan은 목록-상세 흐름, 오버레이, 맥락 전환을 위한 빌트인 화면 전환 기능을 제공해 별도 UI 재작성 없이도 앱 패키징된 웹에서 네이티브 수준의 사용자 경험을 만들 수 있습니다.",
            })}
          </p>
          <p className="mt-3 text-foreground/60 leading-7">
            {l.trans({
              en: "Brand it without a fork: recipes and a per-route _overrides.tsx re-skin every framework component. An agent network, Akan Cloud, context-side rendering and a repository engine are next on the roadmap.",
              ko: "포크 없이 브랜드를 입히세요. 레시피와 라우트별 _overrides.tsx로 모든 프레임워크 컴포넌트를 갈아입힙니다. 에이전트 네트워크, Akan Cloud, 컨텍스트사이드 렌더링, 그리고 레포지토리 엔진이 로드맵의 다음 단계입니다.",
            })}
          </p>
        </div>
        <div
          data-ascent="4"
          data-ascent-frame
          className="reveal-cascade mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:[perspective:1800px]"
        >
          {transitionItems.map((item) => (
            <div
              key={item.title}
              className="lg:transform-3d transition-transform duration-500 lg:rotate-y-[-10deg] lg:hover:rotate-y-0"
            >
              <div className={plateRecipe({ padding: "md" })}>
                <p className="font-bold font-mono text-primary">{item.title}</p>
                <p className="mt-2 min-h-12 text-foreground/60 text-sm leading-6">{item.description}</p>
                <video
                  src={item.src}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="mt-4 aspect-9/16 max-h-[440px] w-full object-contain"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-24 lg:px-8">
        <header className="reveal-rise max-w-4xl">
          <p className="flex items-center gap-3 font-mono text-primary text-xs uppercase tracking-[0.3em]">
            <AscentFigure dim={2} className="size-5" />
            {l.trans({ en: "Layers", ko: "레이어" })}
          </p>
          <h2 className="mt-5 font-black text-3xl tracking-tight md:text-5xl">
            {l.trans({
              en: "Declare a field once. Every layer follows.",
              ko: "필드는 한 번만 선언하세요. 모든 레이어가 따라옵니다.",
            })}
          </h2>
          <p className="mt-4 text-foreground/60 leading-7">
            {l.trans({
              en: "In Akan, one field declaration carries through all eight layers. That is why one developer can own web, app, server, and database at once: wiring that used to be scattered across the codebase becomes a single business declaration.",
              ko: "Akan에서는 필드 선언 하나가 8개 레이어 전체에 반영됩니다. 1명이 웹, 앱, 서버, DB를 함께 책임질 수 있는 이유입니다. 코드 곳곳에 흩어져 있던 배선이 하나의 비즈니스 선언으로 모입니다.",
            })}
          </p>
        </header>
        <div data-ascent="4" data-ascent-frame className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className={plateRecipe({ padding: "lg" }, "reveal-rise")}>
            <p className="font-mono text-destructive text-xs uppercase tracking-[0.25em]">Before</p>
            <h3 className="mt-3 font-bold text-2xl">
              {l.trans({ en: "Adding one field the traditional way", ko: "기존 풀스택에서 필드 하나 추가하려면" })}
            </h3>
            <p className="mt-3 text-foreground/60 text-sm leading-6">
              {l.trans({
                en: "Adding a single business field usually means wiring all of this by hand.",
                ko: "비즈니스 필드 하나를 추가하려면 보통 이만큼을 직접 손으로 해야 합니다.",
              })}
            </p>
            <ol className="mt-6 grid grid-cols-1 border-foreground/10 border-t">
              {workflowLayers.map((layer, idx) => (
                <li key={layer} className="relative flex items-center gap-4 border-foreground/10 border-b px-1 py-3">
                  <span className="font-mono text-foreground/35 text-xs">0{idx + 1}</span>
                  <span className="strike-dim font-medium text-foreground/80 text-sm">{layer}</span>
                  <span
                    aria-hidden="true"
                    className="strike-sweep pointer-events-none absolute inset-x-0 top-[calc(50%-1px)] h-0.5 bg-primary/85"
                  />
                </li>
              ))}
            </ol>
            <p className="mt-5 text-foreground/60 text-sm leading-6">
              {l.trans({
                en: "Change one place, chase eight. Miss one, and types break — or it blows up at runtime.",
                ko: "한 곳만 바뀌어도 8곳을 따라 고쳐야 하고, 한 곳을 빠뜨리면 타입이 깨지거나 런타임에서 터집니다.",
              })}
            </p>
          </div>
          <div className={plateRecipe({ tone: "primary", padding: "lg" }, "reveal-rise flex flex-col")}>
            <p className="font-mono text-primary text-xs uppercase tracking-[0.25em]">After — Akan.js</p>
            <h3 className="mt-3 font-bold text-2xl">
              {l.trans({
                en: "One declaration, every layer generated",
                ko: "선언 하나로 모든 레이어가 생성됩니다",
              })}
            </h3>
            <Code.Snippet
              className="mt-6 w-full"
              showLineNumbers={false}
              code={`export class ProductInput extends via((field) => ({
  name: field(String),
})) {}`}
            />
            <p className="mt-5 text-foreground/65 leading-7">
              {l.trans({
                en: "One field declaration — schema and type defined at once. All eight layers above are generated automatically.",
                ko: "필드 선언 한 줄로 스키마와 타입이 동시에 정의됩니다. 위 8개 레이어는 전부 자동 생성됩니다.",
              })}
            </p>
            <ul className="mt-auto grid grid-cols-1 gap-x-6 border-primary/15 border-t pt-5 sm:grid-cols-2">
              {workflowLayers.map((layer) => (
                <li key={layer} className="flex items-center gap-2 py-1.5 text-sm">
                  <BsCheckCircle className="shrink-0 text-primary" />
                  <span className="text-foreground/75">{layer}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="reveal-rise mt-28 max-w-4xl">
          <h3 className="font-black text-2xl tracking-tight md:text-4xl">
            {l.trans({ en: "Stop repeating the same plumbing", ko: "반복작업은 이제 그만" })}
          </h3>
          <p className="mt-4 text-foreground/60 leading-7">
            {l.trans({
              en: "Akan turns business declarations into docs, APIs, queries and state — then hands the same declarations to agents and every platform.",
              ko: "Akan은 비즈니스 선언을 문서, API, 쿼리, 상태로 확장하고, 같은 선언을 에이전트와 모든 플랫폼에 그대로 넘깁니다.",
            })}
          </p>
        </div>
        <div data-ascent="4" data-ascent-frame className="reveal-cascade mt-10 grid grid-cols-1 gap-5 md:grid-cols-2">
          {automationItems.map((item, idx) => (
            <div key={item.title} className={plateRecipe({ padding: "lg" })}>
              <p className="font-mono text-primary text-sm">0{idx + 1}</p>
              <h4 className="mt-3 font-bold text-lg">{item.title}</h4>
              <p className="mt-2 text-foreground/60 text-sm leading-6">{item.description}</p>
            </div>
          ))}
        </div>

        <div className="reveal-rise mt-28 max-w-4xl">
          <h3 className="font-black text-2xl tracking-tight md:text-4xl">
            {l.trans({ en: "One Business Definition, End to End", ko: "하나의 비즈니스 정의, 처음부터 끝까지" })}
          </h3>
          <p className="mt-4 text-foreground/60 leading-7">
            {l.trans({
              en: "These demos show how one convention-driven workspace carries business intent through multiple surfaces.",
              ko: "아래 데모는 하나의 컨벤션 기반 워크스페이스가 비즈니스 의도를 여러 표현으로 이어가는 방식을 보여줍니다.",
            })}
          </p>
        </div>
        <div data-ascent="4" data-ascent-frame className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {procedureItems.map((item, idx) => (
            <div
              key={item.title}
              className={plateRecipe({}, ["reveal-rise flex flex-col", idx === 0 && "lg:col-span-2"])}
            >
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-primary text-sm">{String(idx + 1).padStart(2, "0")}</span>
                <h4 className="font-bold text-xl">{item.title}</h4>
              </div>
              <p className="mt-2 text-foreground/60 text-sm leading-6">{item.description}</p>
              <video
                src={item.src}
                autoPlay
                muted
                loop
                playsInline
                className="mt-5 w-full border border-foreground/10 object-cover"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-24 lg:px-8">
        <header className="reveal-rise flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="flex items-center gap-3 font-mono text-primary text-xs uppercase tracking-[0.3em]">
              <AscentFigure dim={1} className="size-5" />
              {l.trans({ en: "Shipped", ko: "출시" })}
            </p>
            <h2 className="mt-5 font-black text-3xl tracking-tight md:text-5xl">
              {l.trans({ en: "Built with Akan.js", ko: "Akan.js로 만든 것들" })}
            </h2>
          </div>
          <Link href="/showcase" className="flex items-center gap-2 font-semibold text-primary hover:underline">
            {l.trans({ en: "See all projects", ko: "모든 프로젝트 보기" })} <BsArrowRight />
          </Link>
        </header>
        <div data-ascent="4" data-ascent-frame className="reveal-cascade mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {showcasePreviews.map((item) => (
            <Link key={item.name} href="/showcase" className={plateRecipe({}, "group transition hover:bg-primary/5")}>
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
        <div
          data-ascent="4"
          data-ascent-frame
          className={plateRecipe(
            { padding: "lg" },
            "reveal-rise mt-20 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center",
          )}
        >
          <div>
            <h3 className="font-black text-3xl tracking-tight md:text-4xl">
              {l.trans({ en: "From build to a live URL", ko: "빌드에서 라이브 URL까지" })}
            </h3>
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
          <ol className="grid grid-cols-1 border-foreground/10 border-t font-mono text-sm">
            {deploySteps.map((step, idx) => (
              <li key={step.command} className="flex gap-4 border-foreground/10 border-b py-4">
                <span className="text-foreground/30">{String(idx + 1).padStart(2, "0")}</span>
                <div>
                  <p className="text-primary">$ {step.command}</p>
                  <p className="mt-1 font-sans text-foreground/60 text-xs leading-5">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        data-ascent="1"
        className="relative flex min-h-[100svh] flex-col items-center justify-center px-6 py-28 text-center"
      >
        <p className="reveal-rise font-mono text-primary text-xs uppercase tracking-[0.16em] sm:tracking-[0.3em]">
          {l.trans({
            en: "The agentic full-stack TypeScript framework.",
            ko: "에이전틱 풀스택 TypeScript 프레임워크.",
          })}
        </p>
        <h2 className="reveal-rise mt-6 font-black text-5xl tracking-tight sm:text-7xl">
          {l.trans({ en: "Start with one line.", ko: "한 줄로 시작하세요." })}
        </h2>
        <p className="reveal-rise mt-6 max-w-2xl text-foreground/65 text-lg leading-8">
          {l.trans({
            en: "One command sets up the workspace. The next line you write ships everywhere.",
            ko: "명령어 한 줄이면 워크스페이스가 준비됩니다. 그다음 당신이 쓰는 한 줄이 어디에나 배포됩니다.",
          })}
        </p>
        <div className="mt-16 flex max-w-full items-center gap-3 font-mono text-sm sm:text-xl lg:text-2xl">
          <span className="select-none text-primary">$</span>
          <span className="relative inline-block">
            <span data-ascent-seed className="seed-scrub text-foreground/90 [--seed-chars:33]">
              {installCommand}
            </span>
            <span data-ascent-static className="absolute inset-x-0 -bottom-2 h-0.5 bg-primary" />
          </span>
          <Clipboard className="relative shrink-0" text={installCommand} />
        </div>
        <Link href="/docs/intro/quickstart" className="mt-16">
          <button className={buttonRecipe({ variant: "primary", size: "lg" })}>
            {l.trans({ en: "Get Started", ko: "시작하기" })} <BsArrowRight className="ml-2" />
          </button>
        </Link>
        <p className="mt-10 font-semibold text-foreground/70">
          {l.trans({ en: "Read for humans.", ko: "읽는 건 사람이," })}{" "}
          <span className="text-primary">{l.trans({ en: "Write for agents.", ko: "쓰는 건 에이전트가." })}</span>
        </p>
      </section>
    </main>
  );
});
