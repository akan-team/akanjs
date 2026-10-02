import { usePage } from "@apps/akan/client";
import {
  Friend,
  JellyKicker,
  JellyStar,
  jellyButtonRecipe,
  panelRecipe,
  RoadmapTrajectory,
  StudioStar,
} from "@apps/akan/ui";
import { cn, page } from "akanjs/client";
import { Link } from "akanjs/ui";

const telemetry = [
  {
    label: { en: "Current stage", ko: "현재 단계" },
    value: { en: "v3 · Agentic framework", ko: "v3 · 에이전틱 프레임워크" },
  },
  { label: { en: "Release", ko: "릴리즈" }, value: { en: "akanjs 3.0.0", ko: "akanjs 3.0.0" } },
  { label: { en: "Committed stages", ko: "확정 단계" }, value: { en: "2", ko: "2" } },
  { label: { en: "Proposed stages", ko: "제안 단계" }, value: { en: "2", ko: "2" } },
] as const;

const stages = [
  {
    key: "v1",
    label: "v1",
    caption: { en: "Interface", ko: "인터페이스" },
    title: { en: "Conventions on a borrowed stack", ko: "빌려 쓴 스택 위의 컨벤션" },
    desc: {
      en: "NestJS, Next.js and Vite underneath, MongoDB by default. It proved that one business declaration could drive the server, the web and the data at once.",
      ko: "NestJS, Next.js, Vite 위에서 MongoDB를 기본으로 썼습니다. 비즈니스 선언 하나로 서버, 웹, 데이터를 한 번에 움직일 수 있다는 걸 증명한 단계입니다.",
    },
  },
  {
    key: "multi",
    friend: "planet",
    label: { en: "Multi-build", ko: "다중 빌드" },
    caption: { en: "SSR / CSR / Server", ko: "SSR / CSR / Server" },
    title: { en: "One route, three outputs", ko: "라우트 하나, 결과물 셋" },
    desc: {
      en: "A route stopped being a single artifact: server-rendered HTML for SEO, a client bundle for the app, and a server process, all built from the same source.",
      ko: "라우트가 결과물 하나로 끝나지 않게 됐습니다. SEO용 서버 렌더 HTML, 앱용 클라이언트 번들, 서버 프로세스를 같은 소스에서 함께 빌드합니다.",
    },
  },
  {
    key: "v2",
    friend: "moon",
    label: "v2",
    caption: { en: "Bun-first", ko: "Bun-first" },
    title: { en: "Bun-first, Akan-owned", ko: "Bun 우선, Akan이 직접 소유" },
    desc: {
      en: "Bun became the one runtime, Akan took over the lower framework layers, and SQLite became the first database. Fewer moving parts, one path from dev to production.",
      ko: "Bun을 유일한 런타임으로, 하단 프레임워크 계층은 Akan이 직접, 첫 데이터베이스는 SQLite로 바꿨습니다. 움직이는 부품이 줄고 개발부터 프로덕션까지 경로가 하나가 됐습니다.",
    },
  },
  {
    key: "mobile",
    friend: "rocket",
    label: { en: "Mobile", ko: "모바일" },
    caption: { en: "iOS / Android", ko: "iOS / Android" },
    title: { en: "Mobile from the same page", ko: "같은 페이지에서 나온 모바일" },
    desc: {
      en: "The web build packages into iOS and Android, reusing the list-detail flows, overlays and context transitions the framework already ships.",
      ko: "웹 빌드가 iOS, Android로 패키징됩니다. 목록-상세 흐름, 오버레이, 맥락 전환은 프레임워크가 이미 가진 화면 전환을 그대로 씁니다.",
    },
  },
  {
    key: "desktop",
    friend: "rocket",
    label: { en: "Desktop", ko: "데스크톱" },
    caption: { en: "Linux / macOS / Windows", ko: "Linux / macOS / Windows" },
    title: { en: "Desktop without a second codebase", ko: "두 번째 코드베이스 없는 데스크톱" },
    desc: {
      en: "The same workspace builds a desktop app for Linux, macOS and Windows, with the client bundle and screen transitions reused as they are.",
      ko: "같은 워크스페이스가 Linux, macOS, Windows용 데스크톱 앱을 빌드합니다. 클라이언트 번들과 화면 전환을 그대로 재사용합니다.",
    },
  },
  {
    key: "agentic",
    friend: "comet",
    label: { en: "Agentic", ko: "에이전틱" },
    caption: { en: "MCP · in-page agent", ko: "MCP · 인페이지 에이전트" },
    title: { en: "The surface opens to agents", ko: "에이전트에게 열린 표현" },
    desc: {
      en: "Every signal became an MCP server and an in-page agent started driving the screen through the controls people already use. Agents reached the app without a second API or a second UI.",
      ko: "모든 시그널이 MCP 서버가 되고, 인페이지 에이전트가 사람이 쓰던 컨트롤로 화면을 움직이기 시작했습니다. 별도의 API나 별도의 UI 없이 에이전트가 앱에 닿았습니다.",
    },
  },
] as const;

const committedEpics = [
  {
    code: "01",
    friend: "comet",
    short: { en: "Agent network", ko: "에이전트 네트워크" },
    title: { en: "Agents across sessions, people and apps", ko: "세션, 사람, 앱을 넘나드는 에이전트" },
    flow: "session ↔ session ↔ app",
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
  {
    code: "02",
    friend: "cloud",
    short: { en: "Cloud", ko: "클라우드" },
    title: { en: "Akan Cloud", ko: "Akan Cloud" },
    flow: "git push → production",
    summary: {
      en: "A deploy target built for Akan: cloud.akanjs.com runs what akan build produces, with the operational pieces a small team should not have to assemble.",
      ko: "Akan을 위해 만든 배포 타깃입니다. cloud.akanjs.com이 akan build 결과물을 그대로 돌리고, 작은 팀이 직접 조립하지 않아도 될 운영 조각을 맡습니다.",
    },
    deliverables: [
      { en: "A preview environment for every branch", ko: "브랜치마다 프리뷰 환경" },
      {
        en: "Managed DB with replication, backup and point-in-time restore",
        ko: "복제, 백업, 시점 복구를 갖춘 관리형 DB",
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
] as const;

const proposedEpics = [
  {
    code: "03",
    friend: "planet",
    short: { en: "Context-side rendering", ko: "컨텍스트사이드 렌더링" },
    title: { en: "Context-side rendering", ko: "컨텍스트사이드 렌더링" },
    flow: "SSR → CSR → context-side",
    summary: {
      en: "SSR renders on the server, CSR renders in the browser, and context-side rendering assembles the screen for the person in front of it. Instead of declaring pages, the app ships a UI toolkit — components and tools — and an agent composes them into a user flow in real time.",
      ko: "SSR은 서버에서, CSR은 브라우저에서 화면을 그렸습니다. 컨텍스트사이드 렌더링은 지금 이 사용자에게 맞는 화면을 조립합니다. 페이지를 선언하는 대신 컴포넌트와 도구로 이루어진 UI 툴킷만 두고, 에이전트가 실시간으로 사용자 플로우를 구성합니다.",
    },
    deliverables: [
      {
        en: "A UI toolkit of components and tools, with no page declared per flow",
        ko: "플로우마다 페이지를 선언하지 않고 컴포넌트와 도구로만 구성된 UI 툴킷",
      },
      {
        en: "Screens composed per context instead of routed per path",
        ko: "경로로 라우팅하는 대신 컨텍스트마다 조립되는 화면",
      },
      {
        en: "Every generated control still behind the same guards, tools and audit trail",
        ko: "생성된 모든 컨트롤이 여전히 같은 가드, 도구, 감사 기록 뒤에서",
      },
      {
        en: "The declared page as the fallback when a composition is refused",
        ko: "조성이 거부됐을 때 폴백으로 남는 선언된 페이지",
      },
    ],
    why: {
      en: "The agentic rendering step after SSR and CSR: the stack already exposes an MCP server and agent tools, so the next surface to generate is the screen itself.",
      ko: "SSR, CSR 다음의 에이전틱 렌더링 방식입니다. 스택이 이미 MCP 서버와 에이전트 도구를 노출하니, 다음에 생성할 표현은 화면 자체입니다.",
    },
  },
  {
    code: "04",
    friend: "comet",
    short: { en: "Autopilot", ko: "오토파일럿" },
    title: { en: "Autopilot", ko: "오토파일럿" },
    flow: "issue → diff → reviewed PR",
    summary: {
      en: "Autopilot stops assisting and starts developing the repository. Given an issue, it edits the code itself, works through the diff and drives the pull request — changing and extending features on its own, with a person reviewing the result rather than writing it.",
      ko: "오토파일럿은 보조를 멈추고 레포지토리를 개발합니다. 이슈 하나를 받으면 코드를 직접 수정하고, diff를 정리해 PR까지 진행하며, 기능을 변경·확장합니다. 사람은 코드를 쓰는 대신 결과를 리뷰합니다.",
    },
    deliverables: [
      {
        en: "Issue-to-diff runs that edit the workspace inside the workflow allowlist",
        ko: "워크플로 허용 목록 안에서 워크스페이스를 직접 수정하는 이슈 → diff 실행",
      },
      {
        en: "Repo-level changes: new fields, endpoints, screens and migrations, not just patches",
        ko: "단순 패치가 아니라 필드, 엔드포인트, 화면, 마이그레이션까지 건드리는 레포 수준 변경",
      },
      {
        en: "Validation, abstracts and agent guides updated in the same run",
        ko: "검증, abstract, 에이전트 가이드까지 같은 실행에서 갱신",
      },
      {
        en: "An evaluation suite on real workspaces, published every release",
        ko: "실제 워크스페이스로 돌리는 평가 세트, 릴리즈마다 공개",
      },
    ],
    why: {
      en: "Strict conventions are exactly what let a repository engine change and extend features unattended and still leave a reviewable pull request.",
      ko: "엄격한 컨벤션이야말로 레포지토리 엔진이 사람 없이 기능을 바꾸고 확장하면서도 리뷰 가능한 PR을 남기게 합니다.",
    },
  },
] as const;

export default page().render(() => {
  const { l } = usePage();
  const waypoints = [
    ...stages.map((stage) => ({
      key: stage.key,
      label: typeof stage.label === "string" ? stage.label : l.trans(stage.label),
      caption: l.trans(stage.caption),
      state: "flown" as const,
    })),
    {
      key: "v3",
      label: l.trans({ en: "v3", ko: "v3" }),
      caption: l.trans({ en: "Agentic Framework", ko: "에이전틱 프레임워크" }),
      state: "current" as const,
    },
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
    { label: l.trans({ en: "Flown", ko: "지나온 단계" }), dotClassName: "bg-foreground/40" },
    {
      label: l.trans({ en: "You are here", ko: "현재 위치" }),
      dotClassName: "jelly tint-primary ring-2 ring-primary/25",
    },
    { label: l.trans({ en: "Committed", ko: "확정" }), dotClassName: "border-2 border-primary bg-card" },
    { label: l.trans({ en: "Proposed", ko: "제안" }), dotClassName: "border-2 border-foreground/25 bg-card" },
  ];
  const epicGroups = [
    {
      key: "committed",
      title: l.trans({ en: "Committed stages", ko: "확정된 단계" }),
      desc: l.trans({
        en: "Decided. These are the next stages.",
        ko: "결정된 방향입니다. 다음 단계들입니다.",
      }),
      epics: committedEpics,
      nodeClassName: "jelly tint-primary",
      status: l.trans({ en: "Committed", ko: "확정" }),
    },
    {
      key: "proposed",
      title: l.trans({ en: "Proposed stages", ko: "제안된 단계" }),
      desc: l.trans({
        en: "Candidates under review. The order is a proposal, not a schedule.",
        ko: "검토 중인 후보입니다. 순서는 제안일 뿐 일정이 아닙니다.",
      }),
      epics: proposedEpics,
      nodeClassName: "border-2 border-foreground/25 bg-card",
      status: l.trans({ en: "Proposed", ko: "제안" }),
    },
  ];

  return (
    <main className="min-h-screen text-foreground">
      <section className="mx-auto max-w-5xl px-6 pt-40 pb-6 lg:px-8 lg:pt-32">
        <JellyKicker friend="rocket">{l.trans({ en: "Roadmap", ko: "로드맵" })}</JellyKicker>
        <h1 className="mt-5 font-black text-4xl leading-none md:text-6xl">
          {l.trans({ en: "The Akan.js roadmap", ko: "Akan.js의 로드맵" })}
        </h1>
        <p className="mt-6 max-w-3xl text-foreground/60 text-lg leading-8">
          {l.trans({
            en: "Six milestones behind us — the first interface, multi-build output, a Bun-first stack, mobile and desktop packaging, the agentic surface, and the v3 agentic framework. Next comes an agent network across sessions, people and apps, Akan Cloud, context-side rendering as the step after SSR and CSR, and then Autopilot.",
            ko: "첫 인터페이스부터 다중 빌드, Bun 우선 스택, 모바일·데스크톱 패키징, 에이전틱 표현, v3 에이전틱 프레임워크까지 여섯 단계를 지나왔습니다. 다음은 세션과 사람, 앱을 넘나드는 에이전트 네트워크, Akan Cloud, SSR·CSR 다음의 렌더링인 컨텍스트사이드 렌더링, 그리고 오토파일럿입니다.",
          })}
        </p>
        <dl className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {telemetry.map((item) => (
            <div key={item.label.en} className={panelRecipe({ tone: "jelly", radius: "3xl", padding: "md" }, "px-5")}>
              <dt className="font-bold text-foreground/45 text-xs">{l.trans(item.label)}</dt>
              <dd className="mt-1 font-black text-base tracking-tight">{l.trans(item.value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-8 lg:px-8">
        <div className={panelRecipe({ tone: "jelly", radius: "4xl", padding: "md" }, "md:p-8")}>
          <RoadmapTrajectory waypoints={waypoints} />
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-semibold text-foreground/60 text-xs">
            {legend.map((item) => (
              <span key={item.label} className="flex items-center gap-2">
                <span className={cn("inline-block size-3 rounded-full", item.dotClassName)} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="jelly-callout tint-primary rounded-3xl px-5 py-4">
            <dt className="font-bold text-primary text-xs uppercase tracking-[0.16em]">
              {l.trans({ en: "Next stage", ko: "다음 단계" })}
            </dt>
            <dd className="mt-1 font-black text-base tracking-tight">
              {committedEpics[0].code} · {l.trans(committedEpics[0].title)}
            </dd>
          </div>
          <div className="jelly-glass rounded-3xl px-5 py-4">
            <dt className="font-bold text-foreground/45 text-xs uppercase tracking-[0.16em]">
              {l.trans({ en: "Then", ko: "이어서" })}
            </dt>
            <dd className="mt-1 font-semibold text-foreground/75">
              {committedEpics
                .slice(1)
                .map((epic) => `${epic.code} · ${l.trans(epic.title)}`)
                .join(" / ")}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mx-auto max-w-5xl px-6 pt-8 pb-12 lg:px-8">
        <h2 className="font-black text-3xl">{l.trans({ en: "Stages so far", ko: "지나온 단계" })}</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {stages.map((stage) => (
            <div
              key={stage.key}
              className={panelRecipe({ tone: "jelly", radius: "3xl", padding: "lg" }, "group relative pt-6")}
            >
              <span className="group-hover:jelly-wobble absolute -top-6 right-5 block">
                {"friend" in stage ? (
                  <Friend name={stage.friend} className="size-14" />
                ) : (
                  <JellyStar className="size-12" />
                )}
              </span>
              <p className="font-bold text-foreground/40 text-xs uppercase tracking-[0.16em]">
                {typeof stage.label === "string" ? stage.label : l.trans(stage.label)} · {l.trans(stage.caption)}
              </p>
              <h3 className="mt-2 font-black text-lg tracking-tight">{l.trans(stage.title)}</h3>
              <p className="mt-3 text-foreground/60 text-sm leading-7">{l.trans(stage.desc)}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm">
          <Link href="/blog/v3release" className="font-bold text-primary hover:underline">
            {l.trans({ en: "Read what changed in v3", ko: "v3에서 바뀐 것 읽기" })}
          </Link>
        </p>
      </section>

      {epicGroups.map((group) => (
        <section key={group.key} className="mx-auto max-w-5xl px-6 pb-12 lg:px-8">
          <h2 className="font-black text-3xl">{group.title}</h2>
          <p className="mt-2 text-foreground/60 text-sm leading-7">{group.desc}</p>
          <ol className="relative mt-6 space-y-4 md:ml-3 md:border-foreground/12 md:border-l-2 md:border-dashed md:pl-10">
            {group.epics.map((epic) => (
              <li key={epic.code} className="relative">
                <span
                  className={cn(
                    "absolute top-8 -left-[3.05rem] hidden size-4 rounded-full md:block",
                    group.nodeClassName,
                  )}
                />
                <div className={panelRecipe({ tone: "jelly", radius: "3xl", padding: "lg" }, "relative md:p-7")}>
                  <span className="jelly-float pointer-events-none absolute -top-6 right-6 block">
                    <Friend name={epic.friend} className="size-14 md:size-16" />
                  </span>
                  <p className="pr-16 font-bold text-foreground/40 text-xs uppercase tracking-[0.16em]">
                    {epic.code} · {group.status} · {epic.flow}
                  </p>
                  <h3 className="mt-2 font-black text-xl tracking-tight">{l.trans(epic.title)}</h3>
                  <p className="mt-3 text-foreground/60 text-sm leading-7">{l.trans(epic.summary)}</p>
                  <ul className="mt-4 list-disc space-y-2 pl-5 text-foreground/60 text-sm leading-6 marker:text-primary">
                    {epic.deliverables.map((item) => (
                      <li key={item.en}>{l.trans(item)}</li>
                    ))}
                  </ul>
                  <p className="mt-5 rounded-2xl bg-foreground/4 px-4 py-3 text-foreground/55 text-sm leading-6">
                    {l.trans(epic.why)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="mx-auto max-w-5xl px-6 pt-4 pb-16 lg:px-8">
        <div className={panelRecipe({ tone: "jelly", radius: "4xl", padding: "lg" }, "tint-moon relative md:p-10")}>
          <StudioStar className="pointer-events-none absolute -top-14 right-8 hidden size-32 md:block" />
          <h2 className="font-black text-3xl md:text-4xl">
            {l.trans({ en: "One person, a whole product.", ko: "한 사람이, 제품 전체를." })}
          </h2>
          <p className="mt-4 max-w-3xl text-foreground/60 leading-8">
            {l.trans({
              en: "Every stage removes something a small team would otherwise build or run. The end state is a product — web, desktop, mobile, server, data and the agents working inside it — that one developer can own.",
              ko: "각 단계는 작은 팀이 직접 만들거나 운영해야 했을 것을 하나씩 덜어냅니다. 도착점은 웹, 데스크톱, 모바일, 서버, 데이터, 그리고 그 안에서 일하는 에이전트까지, 개발자 한 명이 책임질 수 있는 제품입니다.",
            })}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="https://github.com/akan-team/akanjs/discussions"
              target="_blank"
              className={jellyButtonRecipe()}
            >
              {l.trans({ en: "Join Akan.js", ko: "Akan.js 참여하기" })}
            </Link>
            <Link href="/docs/intro/quickstart" className={jellyButtonRecipe({ tone: "ink" })}>
              {l.trans({ en: "Use v3", ko: "v3 사용하기" })}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
});
