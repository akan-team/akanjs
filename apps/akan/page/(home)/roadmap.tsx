import { usePage } from "@apps/akan/client";
import { RoadmapTrajectory } from "@apps/akan/ui";
import { page } from "akanjs/client";
import { badgeRecipe, buttonRecipe, Link } from "akanjs/ui";
import {
  BsArrowRight,
  BsArrowUpRight,
  BsCheck2,
  BsCloudArrowUp,
  BsDatabase,
  BsDiagram3,
  BsDisplay,
  BsLaptop,
  BsMagic,
  BsPhone,
  BsPuzzle,
  BsWifiOff,
} from "react-icons/bs";

const telemetry = [
  { label: { en: "Current stage", ko: "현재 단계" }, value: { en: "v3 · Agent-native", ko: "v3 · 에이전트 네이티브" } },
  { label: { en: "Vehicle", ko: "기체" }, value: { en: "akanjs 3.0 beta", ko: "akanjs 3.0 beta" } },
  { label: { en: "Committed burns", ko: "확정된 점화" }, value: { en: "3", ko: "3" } },
  { label: { en: "Proposed burns", ko: "제안된 점화" }, value: { en: "6", ko: "6" } },
] as const;

const flownStages = [
  {
    version: "v1",
    phase: { en: "Liftoff", ko: "리프트오프" },
    title: { en: "Conventions on a borrowed stack", ko: "빌려 쓴 스택 위의 컨벤션" },
    desc: {
      en: "NestJS, Next.js and Vite underneath, MongoDB by default. It proved that one business declaration could drive the server, the web and the data at once.",
      ko: "NestJS, Next.js, Vite 위에서 MongoDB를 기본으로 썼습니다. 비즈니스 선언 하나로 서버, 웹, 데이터를 한 번에 움직일 수 있다는 걸 증명한 단계입니다.",
    },
  },
  {
    version: "v2",
    phase: { en: "Max-Q", ko: "Max-Q" },
    title: { en: "Bun-first, Akan-owned", ko: "Bun 우선, Akan이 직접 소유" },
    desc: {
      en: "Bun became the one runtime, Akan took over the lower framework layers, and SQLite became the first database. Fewer moving parts, one path from dev to production.",
      ko: "Bun을 유일한 런타임으로, 하단 프레임워크 계층은 Akan이 직접, 첫 데이터베이스는 SQLite로 바꿨습니다. 움직이는 부품이 줄고 개발부터 프로덕션까지 경로가 하나가 됐습니다.",
    },
  },
  {
    version: "v3",
    phase: { en: "Stage separation", ko: "단 분리" },
    title: { en: "Agent-native full stack", ko: "에이전트 네이티브 풀스택" },
    desc: {
      en: "Every signal is an MCP server behind the same guards, an in-page agent drives the screen through the controls people use, pages become prompts, and a native recipe system replaces daisyUI.",
      ko: "모든 시그널이 같은 가드 뒤에서 MCP 서버가 되고, 인페이지 에이전트가 사람이 쓰는 컨트롤로 화면을 움직이고, 페이지가 프롬프트가 되며, daisyUI 자리는 네이티브 레시피 시스템이 대신합니다.",
    },
  },
] as const;

const committedEpics = [
  {
    code: "01",
    icon: BsLaptop,
    short: { en: "Desktop", ko: "데스크톱" },
    title: { en: "Native desktop apps", ko: "네이티브 데스크톱 앱" },
    orbit: "Windows · macOS · Linux",
    summary: {
      en: "The same workspace ships a native desktop app beside web, iOS and Android — a real app with windows, menus and a tray, not a browser tab in a frame.",
      ko: "같은 워크스페이스가 웹, iOS, Android 옆에 네이티브 데스크톱 앱을 함께 내보냅니다. 브라우저 탭을 감싼 창이 아니라 창, 메뉴, 트레이를 가진 진짜 앱입니다.",
    },
    deliverables: [
      {
        en: "A desktop target in akan.config.ts, built per OS from one command",
        ko: "akan.config.ts의 데스크톱 타깃, 명령 하나로 OS별 빌드",
      },
      {
        en: "Windows, menus, tray, file system and notifications through one native bridge",
        ko: "창, 메뉴, 트레이, 파일 시스템, 알림을 하나의 네이티브 브리지로",
      },
      {
        en: "Auto-update, code signing and notarization inside the build pipeline",
        ko: "자동 업데이트, 코드 서명, 공증까지 빌드 파이프라인 안에서",
      },
      {
        en: "The client bundle and screen transitions reused as they are",
        ko: "클라이언트 번들과 화면 전환을 그대로 재사용",
      },
    ],
    why: {
      en: "Business tools live on the desktop, and today that means a second codebase.",
      ko: "업무용 도구는 데스크톱에 있고, 지금은 그게 두 번째 코드베이스를 뜻합니다.",
    },
  },
  {
    code: "02",
    icon: BsPhone,
    short: { en: "Mobile", ko: "모바일" },
    title: { en: "Production-grade mobile", ko: "프로덕션급 모바일" },
    orbit: "OTA updates · native runtime",
    summary: {
      en: "Take mobile from “it packages” to “it runs a business”: ship a fix without waiting for store review, and replace Capacitor with a native runtime Akan owns.",
      ko: "모바일을 “패키징된다”에서 “비즈니스를 굴린다”로 끌어올립니다. 스토어 심사를 기다리지 않고 수정을 내보내고, Capacitor 자리를 Akan이 소유한 네이티브 런타임으로 바꿉니다.",
    },
    deliverables: [
      {
        en: "Code-push style over-the-air updates with channels, staged rollout and instant rollback",
        ko: "채널, 단계적 배포, 즉시 롤백을 갖춘 코드푸시 방식의 OTA 업데이트",
      },
      {
        en: "An Akan-owned native shell in place of Capacitor: navigation, transitions, push and deep links done natively",
        ko: "Capacitor를 대신하는 Akan 네이티브 셸: 내비게이션, 전환, 푸시, 딥링크를 네이티브로",
      },
      {
        en: "Store release from the CLI: signing, TestFlight and Play tracks",
        ko: "CLI에서 스토어 배포까지: 서명, TestFlight, Play 트랙",
      },
      {
        en: "Crash and performance reports flowing into akan logs",
        ko: "크래시와 성능 리포트를 akan logs로",
      },
    ],
    why: {
      en: "A two-day store review for a one-line fix is the gap between a demo and a product.",
      ko: "한 줄짜리 수정에 이틀짜리 스토어 심사, 그 간격이 데모와 제품의 차이입니다.",
    },
  },
  {
    code: "03",
    icon: BsDiagram3,
    short: { en: "Agent network", ko: "에이전트 네트워크" },
    title: { en: "Agents across sessions, people and apps", ko: "세션, 사람, 앱을 넘나드는 에이전트" },
    orbit: "session ↔ session ↔ app",
    summary: {
      en: "A v3 agent works inside one browser session. The next stage lets agents cooperate across sessions, across people and across apps — still stopped by the same guards.",
      ko: "v3의 에이전트는 브라우저 세션 하나 안에서 일합니다. 다음 단계는 세션과 사람, 앱을 넘어 에이전트끼리 협업하게 하되, 여전히 같은 가드가 막아섭니다.",
    },
    deliverables: [
      {
        en: "Session to session: hand a running task from one tab or device to another",
        ko: "세션 → 세션: 진행 중인 작업을 다른 탭이나 기기로 넘기기",
      },
      {
        en: "Person to person: invite an agent, or a teammate's agent, into your session with explicit, revocable consent",
        ko: "사람 → 사람: 명시적이고 철회 가능한 동의로 다른 사람의 에이전트를 내 세션에 초대하기",
      },
      {
        en: "App to app: an agent in one app calls another app's MCP server over OAuth, so apps compose through agents",
        ko: "앱 → 앱: 한 앱의 에이전트가 OAuth로 다른 앱의 MCP 서버를 호출해 앱끼리 에이전트로 연결",
      },
      {
        en: "An audit trail for every action that crosses a boundary: who asked, which agent, what it touched",
        ko: "경계를 넘는 모든 행동의 감사 기록: 누가 요청했고, 어떤 에이전트가, 무엇을 건드렸는지",
      },
    ],
    why: {
      en: "Real work spans more than one person and one app, and the guard model already knows who may do what.",
      ko: "실제 일은 한 사람, 한 앱에서 끝나지 않고, 가드 모델은 이미 누가 무엇을 할 수 있는지 알고 있습니다.",
    },
  },
] as const;

const proposedEpics = [
  {
    code: "04",
    icon: BsCloudArrowUp,
    short: { en: "Cloud", ko: "클라우드" },
    title: { en: "Akan Cloud", ko: "Akan Cloud" },
    orbit: "git push → production",
    summary: {
      en: "A deploy target built for Akan: cloud.akanjs.com runs what akan build produces, with the operational pieces a small team should not have to assemble.",
      ko: "Akan을 위해 만든 배포 타깃입니다. cloud.akanjs.com이 akan build 결과물을 그대로 돌리고, 작은 팀이 직접 조립하지 않아도 될 운영 조각을 맡습니다.",
    },
    deliverables: [
      { en: "A preview environment for every branch", ko: "브랜치마다 프리뷰 환경" },
      {
        en: "Managed SQLite with replication, backup and point-in-time restore",
        ko: "복제, 백업, 시점 복구를 갖춘 관리형 SQLite",
      },
      {
        en: "Logs, traces and metrics from akan logs, in the browser",
        ko: "akan logs의 로그, 트레이스, 지표를 브라우저에서",
      },
      { en: "Secrets and env managed beside the app", ko: "앱 옆에서 관리되는 시크릿과 env" },
    ],
    why: {
      en: "The framework already owns the build; owning the landing closes the loop from one line to a live product.",
      ko: "프레임워크가 이미 빌드를 소유하니, 착륙까지 맡으면 코드 한 줄에서 라이브 제품까지 고리가 닫힙니다.",
    },
  },
  {
    code: "05",
    icon: BsDatabase,
    short: { en: "Data scale-out", ko: "데이터 확장" },
    title: { en: "Data that grows past one file", ko: "파일 하나를 넘어 자라는 데이터" },
    orbit: "single → replicated → cluster",
    summary: {
      en: "Grow from one SQLite file to replicated and clustered modes without rewriting a query. The replication groundwork is already underway.",
      ko: "쿼리를 다시 쓰지 않고 SQLite 파일 하나에서 복제, 클러스터 모드로 자랍니다. 복제 기반 작업은 이미 진행 중입니다.",
    },
    deliverables: [
      {
        en: "Database modes that graduate: single, multiple, cluster",
        ko: "단계적으로 올라가는 데이터베이스 모드: single, multiple, cluster",
      },
      { en: "Read replicas and failover", ko: "읽기 복제본과 페일오버" },
      { en: "Vector search as a query node, beside q.search()", ko: "q.search() 옆의 쿼리 노드로 벡터 검색" },
      { en: "Online schema migrations", ko: "온라인 스키마 마이그레이션" },
    ],
    why: {
      en: "SQLite-first is right for day one; teams need to see the road past it before they commit.",
      ko: "첫날엔 SQLite가 맞지만, 팀은 선택하기 전에 그 너머의 길을 보고 싶어 합니다.",
    },
  },
  {
    code: "06",
    icon: BsPuzzle,
    short: { en: "Blocks", ko: "블록" },
    title: { en: "Feature blocks marketplace", ko: "기능 블록 마켓플레이스" },
    orbit: "install a feature, not a library",
    summary: {
      en: "Official and community blocks — payments, sign-in providers, chat, notifications, admin — installed as whole modules with their pages, signals, guards and dictionaries.",
      ko: "결제, 로그인 제공자, 채팅, 알림, 어드민 같은 공식·커뮤니티 블록을 페이지, 시그널, 가드, 딕셔너리까지 모듈째로 설치합니다.",
    },
    deliverables: [
      { en: "One command installs a whole module into a workspace", ko: "명령 하나로 모듈 전체를 워크스페이스에 설치" },
      { en: "Versioned blocks with readable upgrade diffs", ko: "업그레이드 diff를 읽을 수 있는 버전 관리 블록" },
      {
        en: "Every block ships its abstract and agent guide, so agents can extend it",
        ko: "모든 블록이 abstract와 에이전트 가이드를 함께 제공해 에이전트가 확장 가능",
      },
      { en: "A registry on akanjs.com", ko: "akanjs.com의 레지스트리" },
    ],
    why: {
      en: "Fixed blocks are what keep agent-written code consistent; more blocks means more of every app starts out right.",
      ko: "고정된 블록이 에이전트가 쓴 코드를 일관되게 지킵니다. 블록이 많을수록 앱의 더 많은 부분이 처음부터 맞게 시작합니다.",
    },
  },
  {
    code: "07",
    icon: BsDisplay,
    short: { en: "Studio", ko: "스튜디오" },
    title: { en: "Akan Studio", ko: "Akan Studio" },
    orbit: "see the business, not the files",
    summary: {
      en: "One local visual workspace for the model graph, the API explorer, a live store and agent inspector, and the log tail.",
      ko: "모델 그래프, API 탐색기, 실시간 스토어·에이전트 인스펙터, 로그 테일을 한곳에 모은 로컬 비주얼 워크스페이스입니다.",
    },
    deliverables: [
      { en: "A model graph drawn from constants and relations", ko: "constant와 관계에서 그려지는 모델 그래프" },
      {
        en: "An endpoint explorer showing guards and MCP exposure",
        ko: "가드와 MCP 노출 여부까지 보여주는 엔드포인트 탐색기",
      },
      {
        en: "Agent session replay: every tool call, approval and result",
        ko: "에이전트 세션 재생: 모든 도구 호출, 승인, 결과",
      },
      { en: "Readable by people who do not write the code", ko: "코드를 쓰지 않는 사람도 읽을 수 있게" },
    ],
    why: {
      en: "Conventions already make the whole app machine-readable; Studio makes it readable to the rest of the team.",
      ko: "컨벤션 덕분에 앱 전체는 이미 기계가 읽을 수 있습니다. Studio는 그걸 팀 전체가 읽을 수 있게 만듭니다.",
    },
  },
  {
    code: "08",
    icon: BsWifiOff,
    short: { en: "Offline", ko: "오프라인" },
    title: { en: "Local-first and offline", ko: "로컬 우선과 오프라인" },
    orbit: "works without a signal",
    summary: {
      en: "Stores that persist on the device and reconcile when the connection returns, built on the live sync slices already use.",
      ko: "기기에 저장되고 연결이 돌아오면 맞춰지는 스토어입니다. 슬라이스가 이미 쓰는 라이브 싱크 위에 쌓습니다.",
    },
    deliverables: [
      { en: "Offline store persistence for mobile and desktop", ko: "모바일·데스크톱을 위한 오프라인 스토어 저장" },
      {
        en: "Queued mutations with conflict rules declared on the model",
        ko: "모델에 선언한 충돌 규칙을 따르는 대기열 뮤테이션",
      },
      { en: "Sync state surfaced by the Load components", ko: "Load 컴포넌트가 보여주는 동기화 상태" },
    ],
    why: {
      en: "Field work, retail and travel happen where networks do not; a native desktop and mobile runtime make it expected.",
      ko: "현장 업무, 매장, 여행은 네트워크가 없는 곳에서 일어나고, 네이티브 데스크톱·모바일이 되면 당연한 요구가 됩니다.",
    },
  },
  {
    code: "09",
    icon: BsMagic,
    short: { en: "Autopilot", ko: "오토파일럿" },
    title: { en: "Autopilot development", ko: "오토파일럿 개발" },
    orbit: "issue → reviewed PR",
    summary: {
      en: "akan code and the workflow engine move from assisting to owning a feature: plan it, apply workflows, validate, and open a pull request a person reviews.",
      ko: "akan code와 워크플로 엔진이 보조에서 기능 전체를 맡는 단계로 넘어갑니다. 계획하고, 워크플로를 적용하고, 검증한 뒤 사람이 리뷰할 PR을 엽니다.",
    },
    deliverables: [
      {
        en: "Spec-to-PR runs that stay on the workflow allowlist",
        ko: "워크플로 허용 목록 안에서 도는 명세 → PR 실행",
      },
      {
        en: "An evaluation suite on real workspaces, published every release",
        ko: "실제 워크스페이스로 돌리는 평가 세트, 릴리즈마다 공개",
      },
      {
        en: "Validation gates and abstracts updated as part of the run",
        ko: "검증 게이트와 abstract 갱신까지 실행의 일부로",
      },
    ],
    why: {
      en: "Strict conventions are exactly what make an unattended change reviewable.",
      ko: "엄격한 컨벤션이야말로 사람이 지켜보지 않은 변경을 리뷰 가능하게 만듭니다.",
    },
  },
] as const;

export default page().render(() => {
  const { l } = usePage();
  const waypoints = [
    ...flownStages.map((stage) => ({
      key: stage.version,
      label: stage.version === "v3" ? l.trans({ en: "v3 · You are here", ko: "v3 · 현재 위치" }) : stage.version,
      caption: l.trans(stage.phase),
      state: stage.version === "v3" ? ("current" as const) : ("flown" as const),
    })),
    ...committedEpics.map((epic) => ({
      key: epic.code,
      label: epic.code,
      caption: l.trans(epic.short),
      state: "committed" as const,
    })),
    ...proposedEpics.map((epic) => ({
      key: epic.code,
      label: epic.code,
      caption: l.trans(epic.short),
      state: "proposed" as const,
    })),
  ];
  const legend = [
    { label: l.trans({ en: "Flown", ko: "지나온 단계" }), dotClassName: "bg-primary" },
    { label: l.trans({ en: "You are here", ko: "현재 위치" }), dotClassName: "bg-primary ring-4 ring-primary/30" },
    { label: l.trans({ en: "Committed", ko: "확정" }), dotClassName: "border-2 border-primary" },
    { label: l.trans({ en: "Proposed", ko: "제안" }), dotClassName: "border-2 border-foreground/35" },
  ];
  const epicGroups = [
    {
      key: "committed",
      title: l.trans({ en: "Committed burns", ko: "확정된 점화" }),
      desc: l.trans({
        en: "Decided. These are the next stages of the vehicle.",
        ko: "결정된 방향입니다. 기체의 다음 단계들입니다.",
      }),
      epics: committedEpics,
      cardClassName: "border-primary/25 bg-primary/5",
      nodeClassName: "border-primary",
      badgeClassName: "border-primary/30 bg-primary/10 text-primary",
      status: l.trans({ en: "Committed", ko: "확정" }),
    },
    {
      key: "proposed",
      title: l.trans({ en: "Proposed burns", ko: "제안된 점화" }),
      desc: l.trans({
        en: "Candidates under review. The order is a proposal, not a schedule.",
        ko: "검토 중인 후보입니다. 순서는 제안일 뿐 일정이 아닙니다.",
      }),
      epics: proposedEpics,
      cardClassName: "border-dashed border-foreground/15 bg-foreground/3",
      nodeClassName: "border-foreground/35",
      badgeClassName: "border-foreground/15 bg-foreground/5 text-foreground/60",
      status: l.trans({ en: "Proposed", ko: "제안" }),
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-x-0 top-20 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />
      <div className="absolute top-40 -left-40 size-96 rounded-full bg-primary/10 blur-3xl" />

      <section className="relative mx-auto w-full max-w-7xl px-6 pt-36 pb-10 lg:px-8">
        <div
          className={badgeRecipe(undefined, "mb-6 border-primary/20 bg-primary/10 px-4 py-3 font-mono text-primary")}
        >
          {l.trans({ en: "MISSION ROADMAP", ko: "MISSION ROADMAP" })}
        </div>
        <h1 className="max-w-4xl font-black text-5xl tracking-tight lg:text-6xl">
          {l.trans({ en: "The Akan.js flight path", ko: "Akan.js의 비행 궤적" })}
        </h1>
        <p className="mt-6 max-w-3xl text-foreground/70 text-lg leading-8">
          {l.trans({
            en: "Three stages flown. v3 put agents on the same footing as people. The next burns take the same business code to the desktop, to a native mobile runtime, and into a network of agents that work across sessions and apps.",
            ko: "세 단계를 지나왔습니다. v3는 에이전트를 사람과 같은 자리에 세웠습니다. 다음 점화는 같은 비즈니스 코드를 데스크톱으로, 네이티브 모바일 런타임으로, 그리고 세션과 앱을 넘나드는 에이전트 네트워크로 데려갑니다.",
          })}
        </p>
        <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-foreground/10 bg-foreground/10 md:grid-cols-4">
          {telemetry.map((item) => (
            <div key={item.label.en} className="bg-background/90 px-5 py-4">
              <p className="font-mono text-[11px] text-foreground/45 uppercase tracking-[0.2em]">
                {l.trans(item.label)}
              </p>
              <p className="mt-2 font-bold text-foreground text-lg">{l.trans(item.value)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-3 md:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-4xl border border-foreground/10 bg-foreground/3 px-3 py-6 md:px-8 md:py-10">
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/70 to-transparent" />
          <RoadmapTrajectory waypoints={waypoints} />
          <div className="absolute right-10 bottom-28 hidden w-72 rounded-3xl border border-foreground/10 bg-background/80 p-5 font-mono text-xs backdrop-blur lg:block">
            <p className="text-foreground/45 uppercase tracking-[0.2em]">
              {l.trans({ en: "Next burn", ko: "다음 점화" })}
            </p>
            <p className="mt-2 font-bold text-base text-primary">
              {committedEpics[0].code} · {l.trans(committedEpics[0].title)}
            </p>
            <p className="mt-4 text-foreground/45 uppercase tracking-[0.2em]">
              {l.trans({ en: "Then", ko: "이어서" })}
            </p>
            {committedEpics.slice(1).map((epic) => (
              <p key={epic.code} className="mt-2 text-foreground/75">
                {epic.code} · {l.trans(epic.title)}
              </p>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-foreground/60 text-xs">
            {legend.map((item) => (
              <span key={item.label} className="flex items-center gap-2">
                <span className={`inline-block size-3 rounded-full ${item.dotClassName}`} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-6 py-20 lg:px-8">
        <p className="font-mono text-primary text-sm uppercase tracking-[0.2em]">
          {l.trans({ en: "Stages flown", ko: "지나온 단계" })}
        </p>
        <h2 className="mt-3 font-black text-3xl tracking-tight md:text-5xl">
          {l.trans({ en: "How we got to v3", ko: "v3까지 오는 길" })}
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {flownStages.map((stage) => (
            <div
              key={stage.version}
              className={
                stage.version === "v3"
                  ? "relative rounded-4xl border border-primary/30 bg-primary/5 p-6 shadow-2xl shadow-primary/10"
                  : "relative rounded-4xl border border-foreground/10 bg-foreground/4 p-6"
              }
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-black font-mono text-4xl text-foreground/20">{stage.version}</span>
                <span
                  className={badgeRecipe(
                    undefined,
                    stage.version === "v3"
                      ? "border-primary/30 bg-primary/10 font-mono text-primary"
                      : "border-foreground/10 bg-foreground/5 font-mono text-foreground/60",
                  )}
                >
                  {stage.version === "v3" ? l.trans({ en: "You are here", ko: "현재 위치" }) : l.trans(stage.phase)}
                </span>
              </div>
              <h3 className="mt-6 font-bold text-2xl">{l.trans(stage.title)}</h3>
              <p className="mt-3 text-foreground/65 text-sm leading-7">{l.trans(stage.desc)}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Link
            href="/blog/v3release"
            className="flex items-center gap-2 font-semibold text-primary text-sm hover:underline"
          >
            {l.trans({ en: "Read what changed in v3", ko: "v3에서 바뀐 것 읽기" })} <BsArrowRight />
          </Link>
        </div>
      </section>

      {epicGroups.map((group) => (
        <section key={group.key} className="relative mx-auto w-full max-w-7xl px-6 pb-16 lg:px-8">
          <p className="font-mono text-primary text-sm uppercase tracking-[0.2em]">
            {l.trans({ en: "Flight plan", ko: "비행 계획" })}
          </p>
          <h2 className="mt-3 font-black text-3xl tracking-tight md:text-5xl">{group.title}</h2>
          <p className="mt-4 max-w-3xl text-foreground/60 leading-7">{group.desc}</p>
          <ol className="relative mt-10 space-y-6 md:border-foreground/10 md:border-l md:pl-10">
            {group.epics.map((epic) => (
              <li key={epic.code} className="relative">
                <span
                  className={`absolute top-9 -left-[49px] hidden size-4 rounded-full border-2 bg-background md:block ${group.nodeClassName}`}
                />
                <div
                  className={`grid gap-8 rounded-4xl border p-6 md:p-8 lg:grid-cols-[1fr_1fr] ${group.cardClassName}`}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-foreground/45 text-xs tracking-[0.2em]">BURN {epic.code}</span>
                      <span className={badgeRecipe({ size: "sm" }, `font-mono ${group.badgeClassName}`)}>
                        {group.status}
                      </span>
                    </div>
                    <div className="mt-5 flex items-center gap-4">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-background/80 text-2xl text-primary">
                        <epic.icon />
                      </div>
                      <div>
                        <h3 className="font-bold text-2xl leading-tight">{l.trans(epic.title)}</h3>
                        <p className="mt-1 font-mono text-foreground/50 text-xs">{epic.orbit}</p>
                      </div>
                    </div>
                    <p className="mt-5 text-foreground/70 leading-7">{l.trans(epic.summary)}</p>
                    <p className="mt-5 border-primary/60 border-l-2 pl-4 text-foreground/60 text-sm leading-6">
                      {l.trans(epic.why)}
                    </p>
                  </div>
                  <ul className="grid content-start gap-3">
                    {epic.deliverables.map((item) => (
                      <li
                        key={item.en}
                        className="flex gap-3 rounded-2xl border border-foreground/10 bg-background/70 px-4 py-3 text-sm leading-6"
                      >
                        <BsCheck2 className="mt-1 shrink-0 text-primary" />
                        <span>{l.trans(item)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="relative mx-auto w-full max-w-7xl px-6 pt-4 pb-24 lg:px-8">
        <div className="relative overflow-hidden rounded-4xl border border-foreground/10 bg-foreground/6 p-8 text-center shadow-2xl md:p-14">
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/70 to-transparent" />
          <p className="font-mono text-primary text-sm uppercase tracking-[0.2em]">
            {l.trans({ en: "Destination", ko: "목적지" })}
          </p>
          <h2 className="mx-auto mt-4 max-w-3xl font-black text-3xl tracking-tight md:text-5xl">
            {l.trans({ en: "One person, a whole product.", ko: "한 사람이, 제품 전체를." })}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-foreground/65 leading-7">
            {l.trans({
              en: "Every stage removes something a small team would otherwise build or run. The end state is a product — web, desktop, mobile, server, data and the agents working inside it — that one developer can own.",
              ko: "각 단계는 작은 팀이 직접 만들거나 운영해야 했을 것을 하나씩 덜어냅니다. 도착점은 웹, 데스크톱, 모바일, 서버, 데이터, 그리고 그 안에서 일하는 에이전트까지, 개발자 한 명이 책임질 수 있는 제품입니다.",
            })}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="https://github.com/akan-team/akanjs/discussions"
              target="_blank"
              className={buttonRecipe({ variant: "primary", size: "lg" })}
            >
              {l.trans({ en: "Tell us which burn comes first", ko: "어떤 점화가 먼저일지 의견 주기" })}
              <BsArrowUpRight className="ml-2" />
            </Link>
            <Link href="/docs/intro/quickstart" className={buttonRecipe({ variant: "outline", size: "lg" })}>
              {l.trans({ en: "Board v3 now", ko: "지금 v3에 탑승하기" })}
              <BsArrowRight className="ml-2" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
});
