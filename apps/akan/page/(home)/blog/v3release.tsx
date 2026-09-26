import { usePage } from "@apps/akan/client";
import { Code, panelRecipe } from "@apps/akan/ui";
import { page } from "akanjs/client";
import { badgeRecipe, Link } from "akanjs/ui";
import { BsArrowRight } from "react-icons/bs";

const headlines = [
  {
    no: "01",
    title: { en: "Every app is an MCP server", ko: "모든 앱이 MCP 서버가 됩니다" },
    paragraphs: [
      {
        en: "POST /mcp is mounted by default. Every endpoint its guards admit becomes a tool that Claude, Cursor or any MCP client can call, with the same field masking and the same guards as your own screens. Tool descriptions come from the dictionary you already write. An app that mounts libs/shared also serves an OAuth 2.1 authorization server, so an agent signs in as the user and acts with exactly that user's rights.",
        ko: "POST /mcp가 기본으로 열립니다. 가드가 허용하는 모든 엔드포인트가 Claude, Cursor 같은 MCP 클라이언트가 부를 수 있는 도구가 되고, 화면과 똑같은 필드 마스킹과 가드를 거칩니다. 도구 설명은 이미 쓰고 있는 딕셔너리에서 나옵니다. libs/shared를 쓰는 앱은 OAuth 2.1 인가 서버도 함께 띄우므로, 에이전트는 사용자로 로그인해 정확히 그 사용자의 권한으로만 움직입니다.",
      },
      {
        en: "There is no opt-in list to keep up to date. The guards already are the authorization decision: mcp: false keeps a guarded endpoint off the agent shelf, and the Person guard keeps an act that only a person should perform away from models.",
        ko: "관리해야 할 노출 목록은 없습니다. 가드가 곧 권한 결정입니다. mcp: false는 가드가 있는 엔드포인트를 에이전트 목록에서만 빼고, Person 가드는 사람만 해야 하는 행동을 모델로부터 떼어 놓습니다.",
      },
    ],
    codeTitle: "task.signal.ts",
    code: `export class TaskEndpoint extends endpoint(srv.task, ({ mutation }) => ({
  completeTask: mutation(cnst.Task, { guards: [SignedIn] })
    .param("taskId", String)
    .exec(async function (taskId) {
      return await this.taskService.completeTask(taskId);
    }),
  archiveTask: mutation(cnst.Task, { guards: [SignedIn], mcp: false })
    .param("taskId", String)
    .exec(async function (taskId) {
      return await this.taskService.archiveTask(taskId);
    }),
})) {}`,
    links: [
      { href: "/cheatsheet/interface/mcp", label: { en: "MCP", ko: "MCP" } },
      { href: "/cheatsheet/general/mcp-auth", label: { en: "MCP sign-in", ko: "MCP 인증" } },
    ],
  },
  {
    no: "02",
    title: { en: "An agent that works the screen", ko: "화면을 직접 다루는 에이전트" },
    paragraphs: [
      {
        en: "Mount <Agent.Chat /> once in a layout and your users get an assistant that reads the rendered screen and operates it, inside their own browser session, through the same controls they use. A tool is declared beside the control it drives: st.tool(...) returns the handler you pass to onClick, so the person and the agent share one code path. A form publishes itself when its setter is passed by reference.",
        ko: "레이아웃에 <Agent.Chat />를 한 번 두면, 사용자는 렌더링된 화면을 읽고 사용자 자신의 브라우저 세션 안에서 같은 컨트롤로 화면을 조작하는 어시스턴트를 얻습니다. 도구는 그 도구가 움직이는 컨트롤 옆에 선언합니다. st.tool(...)이 onClick에 넘길 핸들러를 돌려주므로 사람과 에이전트가 같은 코드 경로를 씁니다. 폼은 setter를 참조로 넘기기만 하면 스스로 도구를 공개합니다.",
      },
      {
        en: "It reads the pictures and documents a user attaches, listens and speaks, batches tool calls, and asks for approval before anything that changes data. OpenAI-compatible hosts and Anthropic both work, configured in option.ts, and the relay refuses every call until the app names a guard.",
        ko: "사용자가 첨부한 이미지와 문서를 읽고, 듣고 말하며, 도구 호출을 묶어서 실행하고, 데이터를 바꾸기 전에는 승인을 받습니다. OpenAI 호환 호스트와 Anthropic 모두 option.ts에서 설정하며, 앱이 가드를 지정하기 전까지 릴레이는 모든 호출을 거절합니다.",
      },
    ],
    codeTitle: "Plan.Zone.tsx",
    code: `const publish = st.tool("publishPlan")
  .desc("Publish the flight plan being edited.")
  .exec(() => st.do.publishPlan());

return <Button onClick={publish}>{l("plan.publishPlan")}</Button>;`,
    links: [
      { href: "/docs/arch/agentic", label: { en: "Agentic architecture", ko: "에이전틱 구조" } },
      { href: "/references/ui/agent", label: { en: "Agent components", ko: "에이전트 컴포넌트" } },
    ],
  },
  {
    no: "03",
    title: { en: "Pages become prompts", ko: "페이지가 프롬프트가 됩니다" },
    paragraphs: [
      {
        en: "page().prompt(name, description) publishes a screen as an MCP prompt. When an agent runs it, the page's own fetches execute under the caller's token and nothing is rendered; the agent receives that data as resources, plus the tools of the modules the page read from. A screen you built for people becomes a briefing for an agent, with no second implementation to keep in sync.",
        ko: "page().prompt(name, description)는 화면 하나를 MCP 프롬프트로 공개합니다. 에이전트가 실행하면 페이지의 fetch가 호출자의 토큰으로 돌고, 렌더링은 하지 않습니다. 에이전트는 그 데이터를 리소스로, 페이지가 읽은 모듈의 도구를 함께 받습니다. 사람을 위해 만든 화면이 그대로 에이전트용 브리핑이 되고, 따로 맞춰야 할 두 번째 구현은 없습니다.",
      },
    ],
    codeTitle: "page/projects/[projectId]/tickets.tsx",
    code: `export default page()
  .param("projectId", ID, { desc: "The project to brief." })
  .prompt("briefProjectTickets", "Brief the ticket board of one project.")
  .render(async ({ projectId }) => {
    const [{ project }, { ticketInitInProject }] = await Promise.all([
      fetch.viewProject(projectId),
      fetch.initTicketInProject(projectId),
    ]);
    return <Ticket.Zone.Board project={project} init={ticketInitInProject} />;
  });`,
    links: [{ href: "/cheatsheet/interface/mcp", label: { en: "Page prompts", ko: "페이지 프롬프트" } }],
  },
  {
    no: "04",
    title: { en: "A UI system of its own: tokens and recipes", ko: "자체 UI 시스템: 토큰과 레시피" },
    paragraphs: [
      {
        en: "daisyUI is gone. A theme is now a set of semantic token values in page/styles.css (background, foreground, primary, muted and their -foreground pairs), and every look is a server-safe recipe built on tailwind-variants: buttonRecipe, badgeRecipe, inputRecipe, and your own under ui/Recipe/. Lint closes the vocabulary, so a raw palette class or a hex value fails the build instead of shipping a color that ignores the theme.",
        ko: "daisyUI가 빠졌습니다. 테마는 이제 page/styles.css의 시맨틱 토큰 값(background, foreground, primary, muted와 각각의 -foreground 짝)이고, 모든 모양은 tailwind-variants로 만든 서버 안전 레시피입니다. buttonRecipe, badgeRecipe, inputRecipe, 그리고 ui/Recipe/ 아래의 직접 만든 레시피까지. 린트가 색 어휘를 닫아 두므로 raw 팔레트 클래스나 hex 값은 테마를 무시한 색으로 배포되는 대신 빌드에서 걸립니다.",
      },
      {
        en: "Each app's recipes are indexed into its AGENTS.md, so an agent reuses a look instead of inventing a near-duplicate.",
        ko: "앱마다 레시피가 AGENTS.md에 색인되므로, 에이전트는 비슷한 모양을 새로 만들지 않고 있는 레시피를 다시 씁니다.",
      },
    ],
    codeTitle: "ui/Recipe/chatBubble.ts",
    code: `export const chatBubbleRecipe = recipe(
  tv({
    base: "max-w-[78%] rounded-3xl p-4 text-sm",
    variants: {
      side: {
        incoming: "rounded-tl-md bg-muted text-foreground/75",
        outgoing: "ml-auto rounded-tr-md bg-primary text-primary-foreground",
      },
    },
    defaultVariants: { side: "incoming" },
  }),
);`,
    links: [
      { href: "/docs/arch/ui-recipe", label: { en: "UI recipes", ko: "UI 레시피" } },
      { href: "/docs/arch/css", label: { en: "Theme tokens", ko: "테마 토큰" } },
    ],
  },
  {
    no: "05",
    title: { en: "Re-skin any framework component, per route", ko: "라우트별로 프레임워크 컴포넌트 갈아입히기" },
    paragraphs: [
      {
        en: "A page/**/_overrides.tsx manifest swaps akanjs/ui components (Modal, Button, Table, Input, the agent chat's parts, even recipe slots) for your own, for that route subtree only. Manifests nest like layouts and merge slot by slot, closest wins, and they now reach root layouts and portalled overlays. It first appeared in 2.3.11; v3 is where it covers the whole UI. A redesign no longer means a fork.",
        ko: "page/**/_overrides.tsx 매니페스트는 akanjs/ui 컴포넌트(Modal, Button, Table, Input, 에이전트 채팅의 부품, 레시피 슬롯까지)를 그 라우트 하위에서만 직접 만든 컴포넌트로 바꿉니다. 매니페스트는 레이아웃처럼 중첩되고 슬롯 단위로 합쳐지며 가장 가까운 것이 이깁니다. 이제 루트 레이아웃과 포털로 뜨는 오버레이까지 닿습니다. 2.3.11에서 처음 나왔고, v3에서 UI 전체를 덮게 됐습니다. 리디자인이 더는 포크를 뜻하지 않습니다.",
      },
    ],
    codeTitle: "page/(admin)/_overrides.tsx",
    code: `import { BrandModal } from "@apps/myapp/ui";
import { override } from "akanjs/ui";

export default override({ Modal: BrandModal });`,
    links: [{ href: "/references/ui/customize", label: { en: "Customize", ko: "커스터마이즈" } }],
  },
  {
    no: "06",
    title: { en: "One chain per route", ko: "라우트마다 체인 하나" },
    paragraphs: [
      {
        en: "A route file exports one chain: page(), layout() or rootLayout(), with every setting as a stage (.param(), .search(), .config(), .head(), .prompt(), .render()). Arguments arrive typed: an ID is a string, an Int a number, a Date a Dayjs, and a path value the type refuses answers not-found. The old default export beside pageConfig still loads, with a deprecation warning.",
        ko: "라우트 파일은 체인 하나만 내보냅니다. page(), layout(), rootLayout()이고, 모든 설정은 .param(), .search(), .config(), .head(), .prompt(), .render() 같은 단계입니다. 인자는 타입이 붙어 들어옵니다. ID는 string, Int는 number, Date는 Dayjs이고, 타입이 거부한 경로 값은 not-found로 응답합니다. pageConfig 옆에 default export를 두던 예전 형태도 폐기 경고와 함께 계속 동작합니다.",
      },
    ],
    codeTitle: "page/org/[orgId]/tasks.tsx",
    code: `export default page()
  .param("orgId", ID)
  .head(<title>Tasks</title>)
  .render(async ({ orgId }) => {
    const [{ taskInitInOrg }] = await Promise.all([fetch.initTaskInOrg(orgId)]);
    return <Task.Zone.Card init={taskInitInOrg} />;
  });`,
    links: [{ href: "/docs/core/routing", label: { en: "Routing", ko: "라우팅" } }],
  },
] as const;

const moreChanges = [
  {
    no: "07",
    title: { en: "Pages stream section by section", ko: "섹션 단위로 스트리밍되는 페이지" },
    desc: {
      en: "fetch.init*, view* and edit* split into one promise per field, so each section streams behind its own boundary. akan quality ssr measures how much of each app renders on the server and flags a “use client” nothing needs.",
      ko: "fetch.init*, view*, edit*를 필드별 프로미스로 나눠 섹션마다 자기 경계 뒤에서 스트리밍합니다. akan quality ssr은 앱별 서버 렌더링 비율을 재고 필요 없는 “use client”를 짚어 줍니다.",
    },
    href: "/docs/core/data-layer",
  },
  {
    no: "08",
    title: { en: "Full-text search in a filter", ko: "필터 안의 전문 검색" },
    desc: {
      en: "Give a field a text role and write q.search(text) in a filter. SQLite FTS5 with bm25 ordering, and a role on a secret field is a compile error.",
      ko: "필드에 text 역할을 주고 필터에 q.search(text)를 쓰면 됩니다. bm25 정렬의 SQLite FTS5이고, secret 필드에 역할을 주면 컴파일 에러입니다.",
    },
    href: "/cheatsheet/general/search",
  },
  {
    no: "09",
    title: { en: "Live lists", ko: "실시간으로 갱신되는 목록" },
    desc: {
      en: ".live() on a slice pushes entered, updated and left events to every list showing it, and Load.Units applies them. No polling, and the room keeps the slice's guards.",
      ko: "슬라이스에 .live()를 붙이면 그 목록을 보는 모든 화면에 들어옴·변경·나감 이벤트가 전달되고 Load.Units가 반영합니다. 폴링이 없고, 방은 슬라이스의 가드를 그대로 따릅니다.",
    },
    href: "/docs/tutorials/slice",
  },
  {
    no: "10",
    title: { en: "Forms survive a close", ko: "닫아도 남는 폼" },
    desc: {
      en: "Edit and create shells save the form per user and per record and offer it back after an accidental close, a route change or a killed app. Secret fields are never saved.",
      ko: "수정·생성 셸이 사용자와 레코드별로 폼을 저장해 두고, 실수로 닫거나 라우트를 옮기거나 앱이 종료된 뒤에 다시 제안합니다. secret 필드는 저장하지 않습니다.",
    },
    href: "/cheatsheet/interface/form",
  },
  {
    no: "11",
    title: { en: "Cascade removal", ko: "연쇄 삭제" },
    desc: {
      en: "cascade: removeRef and removeWith declare which way a removal travels, and every filter also generates query-level remove and update for models with no removal side effect.",
      ko: "cascade: removeRef와 removeWith로 삭제가 어느 방향으로 번지는지 선언하고, 모든 필터가 삭제 부수효과가 없는 모델을 위한 쿼리 수준 remove와 update도 만들어 줍니다.",
    },
    href: "/conventions/module/constant",
  },
  {
    no: "12",
    title: { en: "Timeouts, caches and binary frames", ko: "타임아웃, 캐시, 바이너리 프레임" },
    desc: {
      en: "An endpoint's { timeout } bounds both ends of a call, { cache } caches argument-free queries after the guards, pubsub(Binary) sends raw websocket frames, and API and websocket prefixes are configurable.",
      ko: "엔드포인트의 { timeout }이 호출 양 끝을 제한하고, { cache }는 인자 없는 쿼리를 가드 통과 뒤에 캐시하며, pubsub(Binary)는 웹소켓 바이너리 프레임으로 보내고, API와 웹소켓 prefix를 바꿀 수 있습니다.",
    },
    href: "/cheatsheet/interface/endpoint",
  },
  {
    no: "13",
    title: { en: "Leaner deploys", ko: "더 가벼운 배포" },
    desc: {
      en: "One replica runs in-process with no gateway, web: false or { csr: false } drops surfaces an app does not serve, and the generated image carries only what the app declares.",
      ko: "레플리카가 하나면 게이트웨이 없이 한 프로세스로 돌고, web: false나 { csr: false }로 쓰지 않는 표면을 빼며, 생성되는 이미지는 앱이 선언한 것만 담습니다.",
    },
    href: "/docs/core/config",
  },
  {
    no: "14",
    title: { en: "Logs you can follow", ko: "따라갈 수 있는 로그" },
    desc: {
      en: "Every log line is a structured record with a trace id. akan logs tails and filters a running server; ndjson stdout, an SSE stream, one canonical line per call and a flight recorder are each one env var away.",
      ko: "모든 로그 줄이 trace id를 가진 구조화된 레코드입니다. akan logs로 실행 중인 서버를 따라가며 거르고, ndjson stdout, SSE 스트림, 호출당 한 줄 요약, 플라이트 레코더는 env 하나로 켭니다.",
    },
    href: "/cheatsheet/observability/logging",
  },
  {
    no: "15",
    title: { en: "Several apps, one terminal", ko: "앱 여러 개, 터미널 하나" },
    desc: {
      en: "akan start a,b boots several apps in one full-screen view with a log file per app, and akan tunnel or --share puts a local app on a public URL.",
      ko: "akan start a,b로 여러 앱을 한 전체 화면 뷰에서 띄우고 앱마다 로그 파일을 남기며, akan tunnel이나 --share로 로컬 앱을 공개 URL에 올립니다.",
    },
    href: "/references/cli/application",
  },
  {
    no: "16",
    title: { en: "A workspace built for coding agents", ko: "코딩 에이전트를 위한 워크스페이스" },
    desc: {
      en: "Every workspace carries a generated AGENTS.md, bundled guidelines, a plan-then-apply workflow MCP, and akan code, a terminal coding agent that works through them.",
      ko: "모든 워크스페이스에 생성된 AGENTS.md, 번들 가이드라인, 계획 후 적용하는 워크플로 MCP, 그리고 이것들을 통해 일하는 터미널 코딩 에이전트 akan code가 들어 있습니다.",
    },
    href: "/references/cli/code",
  },
  {
    no: "17",
    title: { en: "Push and deep links as plugins", ko: "플러그인이 된 푸시와 딥링크" },
    desc: {
      en: "Mobile push notifications and deep links are declared in the plugins list of akan.config.ts instead of living inside the framework.",
      ko: "모바일 푸시 알림과 딥링크는 프레임워크 안이 아니라 akan.config.ts의 plugins 목록에 선언합니다.",
    },
    href: "/cheatsheet/mobile/push",
  },
  {
    no: "18",
    title: { en: "Guardrails in lint", ko: "린트에 들어간 안전장치" },
    desc: {
      en: "New rules catch client/server import leaks, fetch.init* in client files, model-typed props on client components and raw Error throws before they ship.",
      ko: "클라이언트/서버 import 누수, 클라이언트 파일의 fetch.init*, 클라이언트 컴포넌트의 모델 타입 prop, raw Error throw를 배포 전에 잡는 규칙이 추가됐습니다.",
    },
    href: "/conventions/workspace/lint",
  },
] as const;

const versionMetrics = [
  { metric: { en: "Requests per second", ko: "초당 요청 수" }, v2: "112K", v3: "123K", change: "+10%" },
  { metric: { en: "Response time (p99)", ko: "응답 시간 (p99)" }, v2: "1.30 ms", v3: "1.04 ms", change: "−20%" },
  { metric: { en: "Startup time", ko: "시작 시간" }, v2: "204 ms", v3: "102 ms", change: "−50%" },
  { metric: { en: "Memory at rest", ko: "대기 메모리" }, v2: "84 MB", v3: "57 MB", change: "−32%" },
  { metric: { en: "Memory under load", ko: "부하 중 메모리" }, v2: "105 MB", v3: "85 MB", change: "−19%" },
] as const;

const improvements = [
  {
    title: { en: "Starts twice as fast", ko: "두 배 빠른 시작" },
    body: {
      en: "Your app is ready to take requests in about half the time it took on v2. Deploys, restarts and scale-outs come back online sooner.",
      ko: "앱이 요청을 받을 준비가 되기까지 v2의 절반 정도 시간이면 충분합니다. 배포, 재시작, 스케일 아웃 후 더 빨리 서비스에 복귀합니다.",
    },
  },
  {
    title: { en: "Lighter on memory", ko: "더 가벼운 메모리" },
    body: {
      en: "The same app now uses about a third less memory when idle, so more of it fits on the same machine.",
      ko: "같은 앱이 대기 상태에서 메모리를 약 3분의 1 덜 사용합니다. 같은 머신에 더 많이 올릴 수 있습니다.",
    },
  },
  {
    title: { en: "Faster under load", ko: "부하에서도 더 빠르게" },
    body: {
      en: "Throughput went up and slow responses got faster, keeping Akan.js alongside the fastest Bun frameworks.",
      ko: "처리량은 늘고 느린 응답은 더 빨라져, Akan.js는 가장 빠른 Bun 프레임워크들과 나란히 있습니다.",
    },
  },
] as const;

const frameworkComparison = [
  { name: "raw Bun.serve", runtime: "Bun", rps: 138072, coldP50: 102.0, idleRss: 31.5, isAkan: false },
  { name: "ElysiaJS", runtime: "Bun", rps: 137780, coldP50: 104.0, idleRss: 37.0, isAkan: false },
  { name: "Hono", runtime: "Bun", rps: 129926, coldP50: 103.4, idleRss: 33.1, isAkan: false },
  { name: "Akan.js v3", runtime: "Bun", rps: 123319, coldP50: 102.2, idleRss: 57.2, isAkan: true },
  { name: "raw sqlite", runtime: "Bun", rps: 121075, coldP50: 101.9, idleRss: 35.8, isAkan: false },
  { name: "Fastify", runtime: "Node", rps: 86682, coldP50: 103.7, idleRss: 69.3, isAkan: false },
] as const;

const maxRps = Math.max(...frameworkComparison.map((item) => item.rps));

const numbers = [
  {
    value: "26MB → 8.1MB",
    label: { en: "Client build output, 605 chunks down to 258", ko: "클라이언트 빌드 결과물, 청크 605개 → 258개" },
  },
  {
    value: "3.5ms → 0.9ms",
    label: { en: "Hydrating 1,000 rows on the client", ko: "클라이언트에서 1,000행 하이드레이션" },
  },
  {
    value: "−33%",
    label: {
      en: "Time for a 50-row list query, with 85% fewer allocations",
      ko: "50행 목록 쿼리 시간, 할당은 85% 감소",
    },
  },
  {
    value: "103KB → 13KB",
    label: {
      en: "This site's CSS on the wire, precompressed with brotli",
      ko: "이 사이트의 CSS 전송량, brotli 사전 압축",
    },
  },
  {
    value: "86MB → 6.2MB",
    label: {
      en: "This site's container image built as API-only (web: false)",
      ko: "이 사이트를 API 전용(web: false)으로 빌드한 이미지",
    },
  },
] as const;

const breakingChanges = [
  {
    text: {
      en: "daisyUI classes and raw palette classes render unstyled. Move to the semantic tokens; the lint page maps each old class to its replacement.",
      ko: "daisyUI 클래스와 raw 팔레트 클래스는 스타일 없이 렌더링됩니다. 시맨틱 토큰으로 옮기세요. 린트 페이지에 예전 클래스별 대체 표가 있습니다.",
    },
    href: "/conventions/workspace/lint",
  },
  {
    text: {
      en: "Route files move to page()…render(). .metadata() and .gaTrackingId() are removed; the head is JSX in .head().",
      ko: "라우트 파일은 page()…render()로 옮깁니다. .metadata()와 .gaTrackingId()는 제거됐고, head는 .head()의 JSX입니다.",
    },
    href: "/docs/core/routing",
  },
  {
    text: {
      en: "/mcp is on by default: every guard declares static scope, every custom endpoint names its guards, and JWT_SECRET is required outside local. AKAN_MCP=false turns the surface off.",
      ko: "/mcp가 기본으로 켜집니다. 모든 가드는 static scope를 선언하고, 모든 커스텀 엔드포인트는 guards를 명시하며, local 밖에서는 JWT_SECRET이 필수입니다. AKAN_MCP=false로 끌 수 있습니다.",
    },
    href: "/cheatsheet/interface/mcp",
  },
  {
    text: {
      en: "deleteMany is now removeMany, and countDocuments is deprecated in favour of count.",
      ko: "deleteMany는 removeMany가 됐고, countDocuments는 count로 대체되어 폐기 예정입니다.",
    },
    href: "/docs/core/data-layer",
  },
  {
    text: {
      en: "Retry and @CacheMethod are removed in favour of an endpoint's { timeout } and { cache } and memory(); model loaders cache only when they declare { cache }.",
      ko: "Retry와 @CacheMethod는 제거되고 엔드포인트의 { timeout }, { cache }와 memory()로 대체됩니다. 모델 로더는 { cache }를 선언할 때만 캐시합니다.",
    },
    href: "/cheatsheet/performance/caching",
  },
  {
    text: {
      en: "A model's Date fields are prototype accessors: copy a model with new cnst.X().set(model), never a spread.",
      ko: "모델의 Date 필드는 프로토타입 접근자입니다. 모델 복사는 스프레드가 아니라 new cnst.X().set(model)로 합니다.",
    },
    href: "/conventions/module/constant",
  },
  {
    text: {
      en: "The generated image installs only ca-certificates and tzdata. Declare ffmpeg or Chromium in docker.preRuns.",
      ko: "생성되는 이미지에는 ca-certificates와 tzdata만 설치됩니다. ffmpeg나 Chromium은 docker.preRuns에 선언하세요.",
    },
    href: "/cheatsheet/dev/docker",
  },
  {
    text: {
      en: "logger.log() is now .info(), usePushNotification moved to @libs/util/webkit, and the --ai CLI commands are replaced by akan code.",
      ko: "logger.log()는 .info()로, usePushNotification은 @libs/util/webkit으로 옮겨졌고, --ai CLI 명령은 akan code로 대체됐습니다.",
    },
    href: "/references/cli/code",
  },
] as const;

export default page().render(() => {
  const { l } = usePage();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <article className="mx-auto max-w-3xl px-6 py-10 lg:px-8">
        <header>
          <p className="mb-12 font-semibold text-foreground/50 text-sm uppercase tracking-[0.2em]">Akan.js v3</p>
          <p className="mb-4 text-foreground/50 text-sm">
            {l.trans({ en: "Release note · Sep 25, 2026", ko: "릴리즈 노트 · 2026년 9월 25일" })}
          </p>
          <h1 className="font-black text-4xl leading-tight tracking-tight md:text-5xl">
            {l.trans({
              en: "Akan.js v3: agents join the full stack",
              ko: "Akan.js v3: 풀스택에 에이전트가 합류합니다",
            })}
          </h1>
          <p className="mt-6 text-foreground/70 text-lg leading-8">
            {l.trans({
              en: "v2 gave Akan one runtime. v3 gives every app a second kind of user. The guards that protect your screens now also publish them to AI agents, as MCP tools, as prompts, and as an assistant working inside the page, and the UI layer underneath has been rebuilt on native tokens and recipes — and it is faster than v2 on every number we measured. Here is what changed, in the order it matters when you build.",
              ko: "v2가 Akan에 하나의 런타임을 줬다면, v3는 모든 앱에 두 번째 사용자를 줍니다. 화면을 지키던 가드가 이제 그 화면을 AI 에이전트에게도 공개합니다. MCP 도구로, 프롬프트로, 그리고 페이지 안에서 일하는 어시스턴트로요. 그 아래 UI 계층은 네이티브 토큰과 레시피로 새로 지었고, 측정한 모든 지표에서 v2보다 빠릅니다. 무엇이 바뀌었는지, 개발할 때 중요한 순서대로 정리합니다.",
            })}
          </p>
          <nav className="mt-8 flex flex-wrap gap-2">
            {headlines.map((item) => (
              <a
                key={item.no}
                href={`#v3-${item.no}`}
                className={badgeRecipe(
                  undefined,
                  "border-foreground/10 bg-foreground/5 text-foreground/70 hover:text-primary",
                )}
              >
                {item.no} {l.trans(item.title)}
              </a>
            ))}
            <a
              href="#v3-performance"
              className={badgeRecipe(undefined, "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15")}
            >
              {l.trans({ en: "Performance", ko: "성능" })}
            </a>
          </nav>
        </header>

        <section className="mt-14 grid gap-12">
          {headlines.map((item) => (
            <div key={item.no} id={`v3-${item.no}`} className="scroll-mt-28">
              <p className="font-black font-mono text-primary text-sm">{item.no}</p>
              <h2 className="mt-2 font-bold text-3xl tracking-tight">{l.trans(item.title)}</h2>
              <div className="mt-4 space-y-4 text-foreground/75 leading-7">
                {item.paragraphs.map((paragraph) => (
                  <p key={paragraph.en}>{l.trans(paragraph)}</p>
                ))}
              </div>
              <Code.Snippet className="mt-5 w-full" title={item.codeTitle} code={item.code} showLineNumbers={false} />
              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                {item.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    {l.trans(link.label)} <BsArrowRight />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section id="v3-performance" className="mt-16 scroll-mt-28">
          <p className="font-bold text-primary text-sm uppercase tracking-[0.2em]">
            {l.trans({ en: "Faster and smaller", ko: "더 빠르고 더 작게" })}
          </p>
          <h2 className="mt-3 font-bold text-3xl tracking-tight">
            {l.trans({
              en: "Faster than v2 on every number we measured",
              ko: "측정한 모든 지표에서 v2보다 빠릅니다",
            })}
          </h2>
          <p className="mt-4 text-foreground/75 leading-7">
            {l.trans({
              en: "Agents, MCP and a new UI system could easily have cost speed, so we ran the same benchmark as for v2. v3 is faster, uses less memory, and starts twice as fast.",
              ko: "에이전트, MCP, 새로운 UI 시스템을 더하면서 속도를 잃지 않았는지 확인하려고 v2 때와 같은 벤치마크를 다시 돌렸습니다. v3는 더 빠르고, 메모리를 덜 쓰고, 두 배 빨리 시작합니다.",
            })}
          </p>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-foreground/10 px-4">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-3 pr-4 font-semibold text-foreground/45">
                    {l.trans({ en: "Metric", ko: "지표" })}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-foreground/45">v2</th>
                  <th className="px-4 py-3 text-right font-semibold text-foreground/45">v3</th>
                  <th className="py-3 pl-4 text-right font-semibold text-foreground/45">
                    {l.trans({ en: "Change", ko: "변화" })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {versionMetrics.map((row) => (
                  <tr key={row.metric.en} className="border-muted border-b last:border-none">
                    <td className="py-3 pr-4 text-foreground/80">{l.trans(row.metric)}</td>
                    <td className="px-4 py-3 text-right font-mono text-foreground/55">{row.v2}</td>
                    <td className="px-4 py-3 text-right font-mono text-primary">{row.v3}</td>
                    <td className="py-3 pl-4 text-right font-mono text-primary">{row.change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {improvements.map((item) => (
              <div key={item.title.en} className="rounded-2xl bg-muted p-5">
                <h3 className="font-semibold">{l.trans(item.title)}</h3>
                <p className="mt-2 text-foreground/70 text-sm leading-6">{l.trans(item.body)}</p>
              </div>
            ))}
          </div>

          <h3 className="mt-12 font-bold text-xl">
            {l.trans({ en: "Side by side with other frameworks", ko: "다른 프레임워크와 나란히" })}
          </h3>
          <p className="mt-3 text-foreground/75 leading-7">
            {l.trans({
              en: "Akan.js does far more than a plain router — database, auth, server rendering and agents come built in — and it still keeps pace with the lightweight Bun frameworks.",
              ko: "Akan.js는 단순한 라우터보다 훨씬 많은 일을 합니다. 데이터베이스, 인증, 서버 렌더링, 에이전트가 모두 내장되어 있는데도 가벼운 Bun 프레임워크들과 속도를 나란히 합니다.",
            })}
          </p>
          <p className="mt-6 mb-3 font-semibold text-foreground/60 text-xs uppercase tracking-widest">
            {l.trans({ en: "Requests per second", ko: "초당 요청 수" })}
          </p>
          <div className="space-y-2">
            {frameworkComparison.map((item) => (
              <div key={item.name}>
                <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
                  <span className={item.isAkan ? "font-medium text-primary" : "font-medium"}>
                    {item.name} ({item.runtime})
                  </span>
                  <span className={item.isAkan ? "font-mono text-primary/80" : "font-mono text-foreground/55"}>
                    {item.rps.toLocaleString("en-US")} RPS
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className={item.isAkan ? "h-full rounded-full bg-primary" : "h-full rounded-full bg-foreground/50"}
                    style={{ width: `${Math.max(4, (item.rps / maxRps) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 pr-4 font-semibold text-foreground/45">
                    {l.trans({ en: "Framework", ko: "프레임워크" })}
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-foreground/45">
                    {l.trans({ en: "Startup", ko: "시작 시간" })}
                  </th>
                  <th className="py-2 pl-4 text-right font-semibold text-foreground/45">
                    {l.trans({ en: "Memory at rest", ko: "대기 메모리" })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {frameworkComparison.map((item) => (
                  <tr
                    key={item.name}
                    className={item.isAkan ? "border-muted border-b bg-primary/5" : "border-muted border-b"}
                  >
                    <td className={item.isAkan ? "py-2 pr-4 font-semibold text-primary" : "py-2 pr-4"}>
                      {item.name}
                      <span className="ml-1 text-foreground/35 text-xs">({item.runtime})</span>
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono ${item.isAkan ? "text-primary" : "text-foreground/70"}`}
                    >
                      {item.coldP50.toFixed(1)} ms
                    </td>
                    <td
                      className={`py-2 pl-4 text-right font-mono ${item.isAkan ? "text-primary" : "text-foreground/70"}`}
                    >
                      {item.idleRss.toFixed(1)} MB
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-foreground/45 text-xs leading-5">
            {l.trans({
              en: "Measured on an Apple M4 Pro MacBook Pro with production builds, 50 concurrent users. Fastify runs on Node, so its number partly reflects the runtime. Raw data and the benchmark harness live in benchmarks/api-benchmark.",
              ko: "Apple M4 Pro MacBook Pro에서 production 빌드, 동시 사용자 50명으로 측정했습니다. Fastify는 Node에서 실행되어 런타임 차이가 일부 반영됩니다. 원시 데이터와 벤치마크 하네스는 benchmarks/api-benchmark에 있습니다.",
            })}
          </p>

          <div className="mt-12 rounded-3xl bg-muted p-6 md:p-8">
            <h3 className="font-bold text-xl">
              {l.trans({ en: "Smaller builds and payloads", ko: "더 작아진 빌드와 전송량" })}
            </h3>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {numbers.map((item) => (
                <div key={item.value} className="rounded-2xl bg-background/70 p-5">
                  <p className="font-black font-mono text-2xl text-primary">{item.value}</p>
                  <p className="mt-2 text-foreground/65 text-sm leading-6">{l.trans(item.label)}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-8 border-primary border-l-4 pl-5 text-foreground/75 leading-7">
            {l.trans({
              en: "v3 adds more than any release before it and is still faster than v2 on every number we measured. Upgrade and your app gets quicker, lighter and faster to start — the speed comes with the framework, not with your code.",
              ko: "v3는 어떤 릴리즈보다 많은 기능을 더했지만, 측정한 모든 지표에서 v2보다 빠릅니다. 업그레이드하면 앱이 더 빠르고, 가볍고, 빨리 시작합니다. 그 속도는 여러분의 코드가 아니라 프레임워크에서 옵니다.",
            })}
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-bold text-2xl">{l.trans({ en: "Also new in v3", ko: "v3의 다른 변화" })}</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {moreChanges.map((item) => (
              <Link
                key={item.no}
                href={item.href}
                className={panelRecipe(
                  { radius: "none", padding: "none" },
                  "group rounded-3xl p-5 transition hover:border-primary/30",
                )}
              >
                <p className="font-mono text-foreground/40 text-xs">{item.no}</p>
                <h3 className="mt-1 font-bold text-lg group-hover:text-primary">{l.trans(item.title)}</h3>
                <p className="mt-2 text-foreground/65 text-sm leading-6">{l.trans(item.desc)}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-bold text-2xl">{l.trans({ en: "Upgrading from v2", ko: "v2에서 올라올 때" })}</h2>
          <p className="mt-3 text-foreground/65 leading-7">
            {l.trans({
              en: "These are the changes that need a hand. akan lint and akan typecheck point at most of them.",
              ko: "손이 가야 하는 변경입니다. 대부분은 akan lint와 akan typecheck가 위치를 짚어 줍니다.",
            })}
          </p>
          <ol className="mt-6 grid gap-3">
            {breakingChanges.map((item, idx) => (
              <li key={item.text.en} className="flex gap-4 rounded-2xl border border-foreground/10 p-4">
                <span className="font-black font-mono text-foreground/30">{String(idx + 1).padStart(2, "0")}</span>
                <div className="text-sm leading-6">
                  <p className="text-foreground/80">{l.trans(item.text)}</p>
                  <Link href={item.href} className="mt-1 inline-block font-semibold text-primary hover:underline">
                    {item.href}
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16 border-primary border-l-4 pl-5">
          <h2 className="font-bold text-2xl">{l.trans({ en: "What comes next", ko: "다음은" })}</h2>
          <p className="mt-4 text-foreground/75 leading-7">
            {l.trans({
              en: "v3 is the stage where agents came aboard. The next burns take the same business code to native desktop apps, to a production-grade mobile runtime, and into a network of agents that works across sessions, people and apps.",
              ko: "v3는 에이전트가 탑승한 단계입니다. 다음 점화는 같은 비즈니스 코드를 네이티브 데스크톱 앱으로, 프로덕션급 모바일 런타임으로, 그리고 세션과 사람, 앱을 넘나드는 에이전트 네트워크로 데려갑니다.",
            })}
          </p>
          <Link
            href="/roadmap"
            className="mt-4 inline-flex items-center gap-2 font-semibold text-primary hover:underline"
          >
            {l.trans({ en: "See the roadmap", ko: "로드맵 보기" })} <BsArrowRight />
          </Link>
        </section>
      </article>
    </main>
  );
});
