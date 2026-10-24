import { usePage } from "@apps/akan/client";
import { Code, DocsToc, JellyKicker, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { badgeRecipe, Link } from "akanjs/ui";
import { BsArrowRight } from "react-icons/bs";

const headlines = [
  {
    no: "01",
    title: { en: "Guard a route before it renders", ko: "그리기 전에 라우트를 지키는 가드" },
    paragraphs: [
      {
        en: "rootLayout(), layout() and page() take a .guard(fn) stage that decides who may open a route before any of it renders. On the server a guard's redirect is a real 307 and its refusal a real 404, instead of a page that moves itself once its data has arrived. A client navigation waits for the guards before it draws anything, and over MCP the same guards decide which screens a caller is even listed.",
        ko: "rootLayout(), layout(), page()가 .guard(fn) 단계를 받습니다. 라우트의 어떤 부분도 그리기 전에 누가 열 수 있는지 정합니다. 서버에서 가드의 redirect는 데이터가 도착한 뒤에야 스스로 이동하는 페이지가 아니라 실제 307이 되고, 거절은 실제 404가 됩니다. 클라이언트 이동은 무엇이든 그리기 전에 가드를 기다리고, MCP에서는 같은 가드가 호출자에게 어떤 화면이 보일지까지 정합니다.",
      },
      {
        en: "A guard on a section's _layout.tsx covers every page under it, and a page that needs more adds its own. A query the server refuses inside a guard, such as an owner check, answers not-found, so the page does not even tell anyone the record exists. It is a courtesy to people and agents: the endpoint guards remain the gate.",
        ko: "섹션의 _layout.tsx에 둔 가드는 그 아래 모든 페이지를 덮고, 더 필요한 페이지는 자기 가드를 더합니다. 소유자 확인처럼 가드 안의 쿼리를 서버가 거절하면 not-found로 답하므로, 페이지는 그 레코드가 있다는 사실조차 알려 주지 않습니다. 가드는 사람과 에이전트를 위한 배려일 뿐, 실제 관문은 여전히 엔드포인트 가드입니다.",
      },
    ],
    codeTitle: "page/(app)/_layout.tsx",
    code: `import { signedIn } from "@libs/shared/webkit";
import { layout } from "akanjs/client";

export default layout()
  .guard(() => signedIn())
  .render(({ children }) => <div className="flex flex-col">{children}</div>);`,
    links: [{ href: "/docs/core/routing", label: { en: "Routing", ko: "라우팅" } }],
  },
  {
    no: "02",
    title: { en: "A page's component, drawn inside the chat", ko: "채팅 안에 그려지는 페이지 컴포넌트" },
    paragraphs: [
      {
        en: "page().app(name, description, load) publishes one component of a page as an MCP App: a read-only tool and a single-file view that a host such as claude.ai draws inside the conversation. A call runs only the route's guards and that load, under the caller's own token, and on the web the very same element reaches .render() under the name you gave it, so the screen and the chat share one implementation.",
        ko: "page().app(name, description, load)는 페이지의 컴포넌트 하나를 MCP App으로 공개합니다. 읽기 전용 도구와, claude.ai 같은 호스트가 대화 안에 그리는 단일 파일 뷰입니다. 호출은 라우트의 가드와 그 load만 호출자 자신의 토큰으로 실행하고, 웹에서는 똑같은 엘리먼트가 지정한 이름으로 .render()에 전달되므로 화면과 채팅이 하나의 구현을 나눠 씁니다.",
      },
      {
        en: "akan build writes one view per app, bundling only the modules its load reaches, and akan start rebuilds the views on save. A load may only query, so a view never writes behind the host's back. Endpoints can hand a model a picture as well: return ImageResult and an MCP client receives an image block.",
        ko: "akan build가 앱마다 load가 닿는 모듈만 담은 뷰를 하나씩 만들고, akan start는 저장할 때마다 뷰를 다시 만듭니다. load는 조회만 할 수 있으므로 뷰가 호스트 몰래 데이터를 바꾸는 일은 없습니다. 엔드포인트가 모델에 그림을 건넬 수도 있습니다. ImageResult를 돌려주면 MCP 클라이언트는 이미지 블록을 받습니다.",
      },
    ],
    codeTitle: "page/tickets/[ticketId].tsx",
    code: `export default page()
  .param("ticketId", ID, { desc: "The ticket to show." })
  .app("showTicket", "Show one ticket with its status and assignee.", ({ ticketId }) => {
    const { ticketView } = fetch.viewTicket(ticketId);
    return <Ticket.Zone.View view={ticketView} />;
  })
  .render(({ showTicket }) => <div className="flex flex-col gap-4">{showTicket}</div>);`,
    links: [{ href: "/cheatsheet/interface/mcp", label: { en: "MCP Apps", ko: "MCP Apps" } }],
  },
  {
    no: "03",
    title: { en: "Migrations you can review before they run", ko: "실행 전에 검토하는 마이그레이션" },
    paragraphs: [
      {
        en: "A change that reshapes stored documents now ships as a script in script/migration/. akan create-migration writes one with plan, apply and verify stages. plan reads only and prints a planHash, and apply --expect <planHash> refuses when the data changed after that plan was reviewed. A migration writes only through table(refName), which records every value it changes, so rollback can put them back.",
        ko: "저장된 문서의 모양을 바꾸는 변경은 이제 script/migration/의 스크립트로 함께 나갑니다. akan create-migration이 plan, apply, verify 단계를 가진 스크립트를 만듭니다. plan은 읽기만 하고 planHash를 출력하며, apply --expect <planHash>는 그 계획을 검토한 뒤 데이터가 바뀌었으면 거절합니다. 마이그레이션은 바꾸는 모든 값을 기록하는 table(refName)으로만 쓰므로, rollback이 그 값을 되돌릴 수 있습니다.",
      },
      {
        en: "Every run is recorded in the app's own database under a lease, so only one runs at a time. A built image runs the same scripts with bun main.js ops migrate, and a control plane can start one over the ops channel on a host it has no shell on.",
        ko: "모든 실행은 lease 아래 앱 자신의 데이터베이스에 기록되므로 한 번에 하나만 돕니다. 빌드된 이미지는 bun main.js ops migrate로 같은 스크립트를 실행하고, 컨트롤 플레인은 셸이 없는 호스트에서도 ops 채널로 실행을 시작할 수 있습니다.",
      },
    ],
    codeTitle: "script/migration/202610211000_orderToppings.ts",
    code: `import { migration } from "akanjs/server";

const hasTopping = { topping: { $ne: null } };

export default migration("Move each order's topping into its toppings list")
  .plan(async ({ table }) => ({ summary: { orders: await table("icecreamOrder").count(hasTopping) } }))
  .apply(async ({ table }) => {
    await table("icecreamOrder").rewrite(({ _doc }) => ({ toppings: [_doc.topping], topping: undefined }), {
      where: hasTopping,
    });
  })
  .verify(async ({ table }) => {
    const left = await table("icecreamOrder").count(hasTopping);
    return left ? [\`\${left} orders still hold a topping\`] : [];
  });`,
    links: [{ href: "/cheatsheet/dev/migration", label: { en: "Data migrations", ko: "데이터 마이그레이션" } }],
  },
  {
    no: "04",
    title: { en: "A strict wire, and errors you declare", ko: "엄격한 요청과 선언하는 에러" },
    paragraphs: [
      {
        en: "A model or scalar argument is checked against the request schema the server publishes, on HTTP, websocket and MCP, before the handler runs. A wrong type, a value outside its enum or a missing required field answers 400 with data.name naming the exact path, such as data.items.2.price. A key the input does not declare is dropped, so a body can no longer set removedAt or a role for a service that forwards it. A malformed argument or a missing document answers 400 or 404 instead of 500.",
        ko: "모델·스칼라 인자를 핸들러가 실행되기 전에 HTTP, 웹소켓, MCP 모두에서 서버가 공개한 요청 스키마로 검사합니다. 타입이 틀리거나 enum 밖의 값이거나 필수 필드가 빠지면 data.items.2.price처럼 정확한 경로를 data.name에 담아 400으로 응답합니다. 입력에 선언되지 않은 키는 버리므로, 본문을 그대로 넘기는 서비스에 removedAt이나 역할을 끼워 넣을 수 없습니다. 형식이 틀린 인자와 없는 문서는 500이 아니라 400과 404로 답합니다.",
      },
      {
        en: "An endpoint also declares the errors it throws on purpose. OpenAPI documents each status, the MCP tool description names each key so an agent knows them before it calls, and Err.is(error, key) narrows a caught error, even one restored from another server.",
        ko: "엔드포인트는 의도해서 던지는 에러도 선언합니다. OpenAPI가 상태 코드별로 문서화하고, MCP 도구 설명에 키가 실려 에이전트가 호출 전에 알 수 있으며, Err.is(error, key)는 다른 서버에서 복원된 에러까지 잡은 에러를 좁혀 줍니다.",
      },
    ],
    codeTitle: "ticket.signal.ts",
    code: `export class TicketEndpoint extends endpoint(srv.ticket, ({ mutation }) => ({
  lockTicket: mutation(cnst.Ticket, { guards: [SignedIn], errors: { 409: ["ticket.error.locked"] } })
    .param("ticketId", ID)
    .exec(async function (ticketId) {
      return await this.ticketService.lockTicket(ticketId);
    }),
})) {}`,
    links: [
      { href: "/cheatsheet/interface/endpoint", label: { en: "Endpoints", ko: "엔드포인트" } },
      { href: "/cheatsheet/observability/error", label: { en: "Errors", ko: "에러" } },
    ],
  },
  {
    no: "05",
    title: { en: "Calls that survive a bad network", ko: "나쁜 네트워크를 견디는 호출" },
    paragraphs: [
      {
        en: "fetch.clone({ retry }) and a call's own { retry, idempotencyKey } retry an unreachable server, a 502, 503 or 504, and a 429 after its Retry-After, on a jittered backoff within the call's one deadline. A mutation retries under one Idempotency-Key, and the server runs it once per key, caller and arguments, answering a repeat with the first result.",
        ko: "fetch.clone({ retry })와 호출별 { retry, idempotencyKey }가 서버에 닿지 않을 때, 502·503·504일 때, 그리고 429는 Retry-After만큼 기다린 뒤에, 호출의 한 데드라인 안에서 지터를 넣은 백오프로 재시도합니다. mutation은 하나의 Idempotency-Key로 재시도하고, 서버는 키·호출자·인자마다 한 번만 실행해 반복 요청에는 첫 결과로 답합니다.",
      },
      {
        en: "Live data holds up as well: the websocket client numbers each room's frames, drops a repeat and calls onResync where it finds a hole, and a solo server on the built-in pub/sub replays what a resubscribe missed.",
        ko: "실시간 데이터도 버팁니다. 웹소켓 클라이언트가 방마다 프레임에 번호를 매겨 중복은 버리고 빈 구간을 찾으면 onResync를 부르며, 기본 pub/sub을 쓰는 단일 서버는 재구독이 놓친 프레임을 다시 보내 줍니다.",
      },
    ],
    codeTitle: "order.service.ts",
    code: `const remote = fetch.clone({ origin: "https://api.example.com", jwt, retry: { attempts: 5 } });

await remote.placeOrder(order, { idempotencyKey: order.receiptNo });`,
    links: [{ href: "/cheatsheet/interface/endpoint", label: { en: "Calling another server", ko: "다른 서버 호출" } }],
  },
  {
    no: "06",
    title: {
      en: "Apps that update themselves where nobody watches",
      ko: "아무도 지켜보지 않는 곳에서 스스로 업데이트하는 앱",
    },
    paragraphs: [
      {
        en: "Phone web bundle updates move to protocol v2. Each native API reads its own signed envelope, so a CDN can never pair a new manifest with an old signature. A key ring of up to three keys lets you rotate the signing key, a revocation is kept for good once a phone has seen it, and updates.report has each phone post what became of a release under a random install id.",
        ko: "폰 웹 번들 업데이트가 프로토콜 v2로 바뀝니다. native API마다 서명된 자기 envelope를 읽으므로, CDN이 새 manifest와 옛 서명을 짝지을 수 없습니다. 최대 세 개의 키 링으로 서명 키를 교체할 수 있고, 폰이 한 번 본 키 폐기는 영구히 유지되며, updates.report를 주면 폰마다 무작위 설치 id로 릴리즈가 어떻게 됐는지 알려 줍니다.",
      },
      {
        en: "On the desktop, an app nobody attends gets what it needs. desktop.recovery: 'reload' keeps its pages from opening a print or file dialog, a download or another program. Its carried server restarts forever, a watchdog restarts it when its health route hangs, and an edge profile keeps the server's secrets off the computers it is installed on. Signing is explicit now: pass --sign true to build-desktop and publish-update.",
        ko: "데스크톱에서는 아무도 지켜보지 않는 앱에 필요한 것이 갖춰졌습니다. desktop.recovery: 'reload'는 페이지가 인쇄·파일 대화상자, 다운로드, 다른 프로그램을 열지 못하게 합니다. 함께 싣는 서버는 계속 재시작되고, 헬스 라우트가 멈추면 watchdog이 다시 띄우며, edge 프로필은 서버의 시크릿을 설치된 컴퓨터에 두지 않습니다. 서명은 이제 명시적입니다. build-desktop과 publish-update에 --sign true를 줍니다.",
      },
    ],
    codeTitle: "akan.config.ts",
    code: `import type { AppConfig } from "akanjs";

const config: AppConfig = {
  native: {
    updates: {
      url: "https://updates.example.com",
      publicKeys: ["<online signing key>", "<offline backup key>"],
      report: { url: "https://updates.example.com/report" },
    },
    desktop: {
      recovery: "reload",
      server: { profile: "edge", restart: "forever", watchdog: true },
    },
  },
};

export default config;`,
    links: [
      { href: "/cheatsheet/mobile/setup", label: { en: "Native apps", ko: "네이티브 앱" } },
      { href: "/cheatsheet/mobile/desktop-release", label: { en: "Desktop releases", ko: "데스크톱 릴리즈" } },
    ],
  },
  {
    no: "07",
    title: { en: "The pipeline lives next to the code", ko: "코드 옆에 사는 파이프라인" },
    paragraphs: [
      {
        en: "An app declares its build pipeline in akan.config.ts: the built-in build, docker, deploy and ota stages in order, plus shell stages with when, env, secrets, timeout and retry. A workspace-root akan.config.ts holds the stages around every app, and akan pipeline dry-run prints the plan Akan Cloud will run, locally and without running anything.",
        ko: "앱이 akan.config.ts에 빌드 파이프라인을 선언합니다. 기본 build, docker, deploy, ota 단계를 순서대로 두고, when, env, secrets, timeout, retry를 갖는 셸 단계를 끼웁니다. 워크스페이스 루트의 akan.config.ts는 모든 앱을 둘러싼 단계를 담고, akan pipeline dry-run은 Akan Cloud가 실행할 계획을 아무것도 실행하지 않고 로컬에서 출력합니다.",
      },
      {
        en: "Pipeline secrets are write-only. akan upload-secret reads a value from a file, piped stdin or a hidden prompt, never from an argument, and each step names the secrets it reads.",
        ko: "파이프라인 시크릿은 쓰기 전용입니다. akan upload-secret은 값을 인자가 아니라 파일, 파이프로 들어온 stdin, 숨김 프롬프트에서만 읽고, 각 단계는 자기가 읽는 시크릿 이름을 적습니다.",
      },
    ],
    codeTitle: "apps/web/akan.config.ts",
    code: `import type { AppConfig } from "akanjs";

const config: AppConfig = {
  pipeline: {
    stages: [
      { use: "build" },
      { name: "Test", sh: "bun run akan test web" },
      { use: "docker" },
      { use: "deploy" },
    ],
  },
};

export default config;`,
    links: [
      { href: "/cheatsheet/dev/pipeline", label: { en: "Pipelines", ko: "파이프라인" } },
      { href: "/references/cli/pipeline", label: { en: "Pipeline commands", ko: "파이프라인 명령" } },
    ],
  },
] as const;

const securityFixes = [
  {
    en: "A server render reads only its own request. A boundary React resumed after the shell could read another visitor's cookies and session token under concurrent traffic.",
    ko: "서버 렌더가 자기 요청만 읽습니다. 셸 이후 React가 재개한 경계가 동시 트래픽에서 다른 방문자의 쿠키와 세션 토큰을 읽을 수 있었습니다.",
  },
  {
    en: "A server-side call to another origin no longer carries the visitor's Authorization header, auth cookie or address.",
    ko: "다른 출처로 가는 서버 쪽 호출이 더는 방문자의 Authorization 헤더, 인증 쿠키, 주소를 싣지 않습니다.",
  },
  {
    en: "A request body can no longer set a field outside its input class for a service that forwards it.",
    ko: "요청 본문이 입력 클래스 밖의 필드를 설정해, 본문을 그대로 넘기는 서비스에 전달할 수 없습니다.",
  },
  {
    en: "The RSC navigation cache and a CSR app's kept pages are dropped when the account changes.",
    ko: "계정이 바뀌면 RSC 내비게이션 캐시와 CSR 앱이 보관한 페이지를 버립니다.",
  },
] as const;

const performanceRows = [
  {
    metric: { en: "Bare query, per call", ko: "단순 query, 호출당" },
    before: "3.0 µs",
    after: "2.0 µs",
  },
  {
    metric: { en: "20-row list of a six-field scalar, per call", ko: "필드 6개 스칼라 20행 목록, 호출당" },
    before: "16.0 µs",
    after: "6.5 µs",
  },
  {
    metric: { en: "Cached SSR page, requests per second", ko: "캐시된 SSR 페이지, 초당 요청 수" },
    before: "26.7k",
    after: "30.8k",
  },
  {
    metric: { en: "Cached SSR page, p99", ko: "캐시된 SSR 페이지, p99" },
    before: "3.7 ms",
    after: "3.2 ms",
  },
] as const;

const moreChanges = [
  {
    no: "A",
    title: { en: "Modals become sheets", ko: "시트가 되는 모달" },
    desc: {
      en: "Modal and the model modals take presentation: 'sheet' or 'auto', a full-screen sheet below md that a drag down dismisses, and placement: 'right'.",
      ko: "Modal과 모델 모달이 presentation: 'sheet'나 md 미만에서 아래로 끌어 닫는 전체 화면 시트가 되는 'auto', 그리고 placement: 'right'를 받습니다.",
    },
    href: "/references/ui/overlays",
  },
  {
    no: "B",
    title: { en: "Uploads belong to their form", ko: "폼에 묶이는 업로드" },
    desc: {
      en: "Generated upload actions belong to the form that started them, and submit stays disabled while <model>FormUploading holds one in flight.",
      ko: "생성된 업로드 액션이 업로드를 시작한 폼에 묶이고, <model>FormUploading에 진행 중인 업로드가 있는 동안 제출이 막힙니다.",
    },
    href: "/references/ui/forms",
  },
  {
    no: "C",
    title: { en: "The agent sees the screen's pictures", ko: "화면의 그림을 보는 에이전트" },
    desc: {
      en: "The in-page agent looks at an image on screen with the new viewImage built-in, and your own tools attach files with ToolReturn.attach.",
      ko: "인페이지 에이전트가 새 기본 도구 viewImage로 화면의 이미지를 보고, 직접 만든 도구는 ToolReturn.attach로 파일을 붙입니다.",
    },
    href: "/references/ui/agent",
  },
  {
    no: "D",
    title: { en: "Delete for good, by retention", ko: "보존 기간에 맞춘 영구 삭제" },
    desc: {
      en: "purge<Filter>() and purgeMany(query) delete rows past their retention for good, removed ones included, 1,000 per statement, and refuse an empty query.",
      ko: "purge<Filter>()와 purgeMany(query)가 삭제된 행까지 포함해 보존 기간이 지난 행을 한 문장에 1,000행씩 영구히 지우고, 빈 쿼리는 거절합니다.",
    },
    href: "/docs/core/data-layer",
  },
  {
    no: "E",
    title: { en: "Drop a cached answer early", ko: "캐시된 응답을 일찍 버리기" },
    desc: {
      en: "EndpointCacheControl.invalidate(endpoint, args?) drops an endpoint's cached answers on every instance before their TTL runs out.",
      ko: "EndpointCacheControl.invalidate(endpoint, args?)가 엔드포인트의 캐시된 응답을 TTL이 끝나기 전에 모든 인스턴스에서 지웁니다.",
    },
    href: "/cheatsheet/performance/caching",
  },
  {
    no: "F",
    title: { en: "Index names that stay put", ko: "바뀌지 않는 인덱스 이름" },
    desc: {
      en: "An unnamed index is named by its table and fields, so adding one no longer rebuilds the rest, and schema.index(fields, { where }) builds a real partial index.",
      ko: "이름 없는 인덱스는 테이블과 필드로 이름이 붙으므로 하나를 추가해도 나머지가 다시 빌드되지 않고, schema.index(fields, { where })는 실제 부분 인덱스를 만듭니다.",
    },
    href: "/cheatsheet/general/schema",
  },
  {
    no: "G",
    title: { en: "Edge modules and machine tokens", ko: "edge 모듈과 머신 토큰" },
    desc: {
      en: "serve(ref, { operationMode: ['edge'] }) mounts a module only where it belongs, and MachineToken signs device tokens a server verifies into account.machine.",
      ko: "serve(ref, { operationMode: ['edge'] })는 모듈을 필요한 모드에서만 마운트하고, MachineToken은 서버가 account.machine으로 검증하는 기기 토큰을 서명합니다.",
    },
    href: "/cheatsheet/general/edge",
  },
  {
    no: "H",
    title: { en: "Lint that catches a skipped hook", ko: "건너뛴 훅을 잡는 린트" },
    desc: {
      en: "no-conditional-st-hook reports an st hook a render can skip, and akan typecheck now checks a target's tests and specs too.",
      ko: "no-conditional-st-hook이 렌더에서 건너뛸 수 있는 st 훅을 잡고, akan typecheck은 이제 대상의 테스트와 스펙까지 검사합니다.",
    },
    href: "/conventions/workspace/lint",
  },
] as const;

const upgradeSteps = `bun upgrade
akan update
akan sync <app-or-lib>
akan lint <app-or-lib>
akan typecheck <app-or-lib>`;

export default page()
  .config({ transition: "stack" })
  .head(({ lang }) => {
    const title =
      lang === "ko"
        ? "Akan.js 3.1: 프로덕션을 위해 더 단단하게 | Akan.js 블로그"
        : "Akan.js 3.1: hardened for production | Akan.js Blog";
    const description =
      lang === "ko"
        ? "그리기 전에 라우트를 지키는 가드, 채팅 안에 그려지는 MCP App, 검토할 수 있는 데이터 마이그레이션, 엄격한 요청과 재시도, 서명된 OTA와 무인 데스크톱, 코드 옆의 파이프라인."
        : "Route guards before render, MCP Apps drawn in the chat, reviewable data migrations, a strict wire with retries, signed OTA and unattended desktops, and the pipeline next to the code.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .render(() => {
    const { l } = usePage();

    return (
      <main className="min-h-screen text-foreground">
        <article className="mx-auto max-w-3xl px-6 py-10 lg:px-8">
          <header>
            <div className="mb-10 flex items-end justify-between gap-4">
              <JellyKicker>Akan.js 3.1</JellyKicker>
            </div>
            <p className="mb-4 text-foreground/50 text-sm">
              {l.trans({ en: "Release note · Oct 25, 2026", ko: "릴리즈 노트 · 2026년 10월 25일" })}
            </p>
            <h1 className="font-black text-4xl leading-[1.08] md:text-[3.25rem]">
              {l.trans({
                en: "Akan.js 3.1: hardened for production",
                ko: "Akan.js 3.1: 프로덕션을 위해 더 단단하게",
              })}
            </h1>
            <p className="mt-6 text-foreground/70 text-lg leading-8">
              {l.trans({
                en: "v3 gave every app a second kind of user. 3.1 is about running those apps for real: deciding who may open a screen before any of it renders, refusing a request the schema does not allow, reshaping stored data with a plan you can review, surviving a dropped connection, updating an app on a device nobody watches, and keeping the pipeline next to the code. It also closes leaks between visitors and between servers, so every 3.0 app should take it. Here is what changed.",
                ko: "v3가 모든 앱에 두 번째 사용자를 줬다면, 3.1은 그 앱을 실제로 운영하는 일에 집중합니다. 화면을 그리기 전에 누가 열 수 있는지 정하고, 스키마가 허용하지 않는 요청을 거절하고, 검토할 수 있는 계획으로 저장된 데이터의 모양을 바꾸고, 끊긴 연결을 견디고, 아무도 지켜보지 않는 기기에서 앱을 업데이트하고, 파이프라인을 코드 옆에 둡니다. 방문자 사이와 서버 사이의 유출도 막았으므로 3.0 앱은 모두 올리기를 권합니다. 무엇이 바뀌었는지 정리합니다.",
              })}
            </p>
            <nav className="mt-8 flex flex-wrap gap-2">
              {headlines.map((item) => (
                <a
                  key={item.no}
                  href={`#v31-${item.no}`}
                  className={badgeRecipe(
                    undefined,
                    "border-foreground/10 bg-foreground/5 text-foreground/70 hover:text-primary",
                  )}
                >
                  {item.no} {l.trans(item.title)}
                </a>
              ))}
              <a
                href="#v31-upgrade"
                className={badgeRecipe(undefined, "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15")}
              >
                {l.trans({ en: "Upgrading from 3.0", ko: "3.0에서 올라올 때" })}
              </a>
            </nav>
          </header>

          <Scroll className="mt-14">
            {headlines.map((item) => (
              <Scroll.Slide key={item.no} id={`v31-${item.no}`} title={l.trans(item.title)} className="not-first:mt-12">
                <p className="font-black font-mono text-primary text-sm">{item.no}</p>
                <h2 className="mt-2 font-black text-3xl">{l.trans(item.title)}</h2>
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
              </Scroll.Slide>
            ))}

            <Scroll.Slide id="v31-security" title={l.trans({ en: "Security", ko: "보안" })} className="mt-16">
              <p className="font-bold text-primary text-sm uppercase tracking-[0.2em]">
                {l.trans({ en: "Closed in 3.1", ko: "3.1에서 막은 것" })}
              </p>
              <h2 className="mt-3 font-black text-3xl">
                {l.trans({ en: "Fewer ways for data to cross over", ko: "데이터가 새어 나갈 길을 줄였습니다" })}
              </h2>
              <p className="jelly-callout tint-primary mt-6 rounded-3xl p-6 text-foreground/75 leading-7 md:p-8">
                {l.trans({
                  en: "Several fixes in 3.1 close a leak between visitors or between servers. None needs a change in your code, which is the reason to upgrade even if you use none of the new features.",
                  ko: "3.1의 수정 가운데 여럿은 방문자 사이나 서버 사이의 유출을 막습니다. 어느 것도 코드를 바꿀 필요가 없으므로, 새 기능을 하나도 쓰지 않더라도 올려야 하는 이유가 됩니다.",
                })}
              </p>
              <ul className="mt-6 list-disc space-y-3 pl-5 text-foreground/75 leading-7">
                {securityFixes.map((item) => (
                  <li key={item.en}>{l.trans(item)}</li>
                ))}
              </ul>
              <Link
                href="/blog/release-notes-3-1-0#notes-security"
                className="mt-4 inline-flex items-center gap-2 font-semibold text-primary text-sm hover:underline"
              >
                {l.trans({ en: "Every security fix in 3.1.0", ko: "3.1.0의 보안 수정 전체" })} <BsArrowRight />
              </Link>
            </Scroll.Slide>

            <Scroll.Slide id="v31-performance" title={l.trans({ en: "Performance", ko: "성능" })} className="mt-16">
              <h2 className="font-black text-2xl md:text-3xl">
                {l.trans({ en: "A lighter path for every call", ko: "모든 호출에 더 가벼운 경로" })}
              </h2>
              <p className="mt-4 text-foreground/75 leading-7">
                {l.trans({
                  en: "Strict bodies and declared errors had to cost nothing, so the signal pipeline was rebuilt around them. An endpoint's middleware is composed once, a response resolves from a field plan built once per model class, and a call skips the steps it does not use.",
                  ko: "엄격한 본문 검사와 에러 선언이 비용이 되지 않도록 시그널 파이프라인을 그에 맞춰 다시 짰습니다. 엔드포인트의 미들웨어는 한 번만 조립하고, 응답은 모델 클래스마다 한 번 만든 필드 계획으로 resolve하며, 호출은 쓰지 않는 단계를 건너뜁니다.",
                })}
              </p>
              <div className="jelly-glass mt-6 overflow-x-auto rounded-3xl px-5 py-2">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-border border-b">
                      <th className="py-3 pr-4 font-semibold text-foreground/45">
                        {l.trans({ en: "Measure", ko: "측정 항목" })}
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-foreground/45">
                        {l.trans({ en: "Before", ko: "이전" })}
                      </th>
                      <th className="py-3 pl-4 text-right font-semibold text-foreground/45">
                        {l.trans({ en: "After", ko: "이후" })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {performanceRows.map((row) => (
                      <tr key={row.metric.en} className="border-muted border-b last:border-none">
                        <td className="py-3 pr-4 text-foreground/80">{l.trans(row.metric)}</td>
                        <td className="px-4 py-3 text-right font-mono text-foreground/55">{row.before}</td>
                        <td className="py-3 pl-4 text-right font-mono text-primary">{row.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-foreground/45 text-xs leading-5">
                {l.trans({
                  en: "Each row was measured on one machine just before and just after the changes that made it, not between the 3.0.2 and 3.1.0 releases: the per-call numbers in process, the SSR numbers on a cached page of apps/minimal.",
                  ko: "각 행은 3.0.2와 3.1.0 릴리즈 사이가 아니라 해당 변경 직전과 직후를 한 머신에서 측정한 값입니다. 호출당 수치는 프로세스 안에서, SSR 수치는 apps/minimal의 캐시된 페이지로 측정했습니다.",
                })}
              </p>
            </Scroll.Slide>

            <Scroll.Slide
              id="v31-more"
              title={l.trans({ en: "Also new in 3.1", ko: "3.1의 다른 변화" })}
              className="mt-16"
            >
              <h2 className="font-black text-2xl md:text-3xl">
                {l.trans({ en: "Also new in 3.1", ko: "3.1의 다른 변화" })}
              </h2>
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {moreChanges.map((item) => (
                  <Link
                    key={item.no}
                    href={item.href}
                    className={panelRecipe(
                      { tone: "jelly", radius: "3xl", padding: "none" },
                      "group squish hover:tint-primary p-5 transition-shadow",
                    )}
                  >
                    <p className="font-mono text-foreground/40 text-xs">{item.no}</p>
                    <h3 className="mt-1 font-bold text-lg group-hover:text-primary">{l.trans(item.title)}</h3>
                    <p className="mt-2 text-foreground/65 text-sm leading-6">{l.trans(item.desc)}</p>
                  </Link>
                ))}
              </div>
            </Scroll.Slide>

            <Scroll.Slide
              id="v31-upgrade"
              title={l.trans({ en: "Upgrading from 3.0", ko: "3.0에서 올라올 때" })}
              className="mt-16"
            >
              <h2 className="font-black text-2xl md:text-3xl">
                {l.trans({ en: "Upgrading from 3.0", ko: "3.0에서 올라올 때" })}
              </h2>
              <p className="mt-3 text-foreground/65 leading-7">
                {l.trans({
                  en: "3.1 needs Bun 1.4.4 and React 19.3.1, and akanjs and @akanjs/cli at the same version. Upgrade Bun, move the workspace and the global CLI, then run akan sync once on every app and library so the generated barrels are rewritten. What can need a hand, such as a request body the schema now refuses, signing that is now opt-in, or phone binaries to rebuild for updates v2, is listed in the release notes, and akan lint and akan typecheck point at most of it.",
                  ko: "3.1은 Bun 1.4.4와 React 19.3.1, 그리고 같은 버전의 akanjs와 @akanjs/cli가 필요합니다. Bun을 올리고, 워크스페이스와 전역 CLI를 옮긴 다음, 생성된 barrel이 다시 쓰이도록 모든 앱과 라이브러리에서 akan sync를 한 번 실행합니다. 스키마가 이제 거절하는 요청 본문, 직접 켜야 하는 서명, updates v2를 위해 다시 빌드할 폰 바이너리처럼 손이 갈 수 있는 부분은 릴리즈 노트에 모아 두었고, 대부분은 akan lint와 akan typecheck가 위치를 짚어 줍니다.",
                })}
              </p>
              <Code.Snippet className="mt-5 w-full" title="Terminal" code={upgradeSteps} showLineNumbers={false} />
              <Link
                href="/blog/release-notes-3-1-0#notes-upgrade"
                className="mt-4 inline-flex items-center gap-2 font-semibold text-primary hover:underline"
              >
                {l.trans({ en: "Read the full 3.1.0 release notes", ko: "3.1.0 릴리즈 노트 전체 읽기" })}{" "}
                <BsArrowRight />
              </Link>
            </Scroll.Slide>

            <Scroll.Slide
              id="v31-next"
              title={l.trans({ en: "What comes next", ko: "다음은" })}
              className="jelly-callout tint-primary mt-16 rounded-3xl p-6 md:p-8"
            >
              <h2 className="font-black text-2xl md:text-3xl">{l.trans({ en: "What comes next", ko: "다음은" })}</h2>
              <p className="mt-4 text-foreground/75 leading-7">
                {l.trans({
                  en: "3.1 makes the v3 surface safe to run: the guards, the wire, the data and the devices. It already speaks to Akan Cloud, through the pipeline it runs, the secrets it injects and the phone updates it signs. The roadmap shows where the cloud and the agent surface go from here.",
                  ko: "3.1은 v3의 표면을 실제로 운영할 수 있게 다졌습니다. 가드, 요청, 데이터, 기기까지요. 그리고 Akan Cloud가 실행할 파이프라인, 주입할 시크릿, 서명할 폰 업데이트를 통해 이미 Akan Cloud와 이야기합니다. 클라우드와 에이전트 표면이 어디로 가는지는 로드맵에 있습니다.",
                })}
              </p>
              <Link
                href="/roadmap"
                className="mt-4 inline-flex items-center gap-2 font-semibold text-primary hover:underline"
              >
                {l.trans({ en: "See the roadmap", ko: "로드맵 보기" })} <BsArrowRight />
              </Link>
            </Scroll.Slide>
            <DocsToc />
          </Scroll>
        </article>
      </main>
    );
  });
