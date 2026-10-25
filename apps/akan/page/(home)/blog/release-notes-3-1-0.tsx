import { usePage } from "@apps/akan/client";
import { Code, DocsToc, JellyKicker } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { badgeRecipe, Link } from "akanjs/ui";
import { BsArrowRight } from "react-icons/bs";

const requirements = [
  {
    name: "Bun",
    before: "1.4.0+",
    after: "1.4.4+",
    note: {
      en: "Every package's engines.bun reads >=1.4.4, and akan-native's doctor fails on an older Bun.",
      ko: "모든 패키지의 engines.bun이 >=1.4.4이고, akan-native의 doctor는 그보다 오래된 Bun에서 실패합니다.",
    },
  },
  {
    name: "React",
    before: "19.3.0",
    after: "19.3.1",
    note: {
      en: "Pin react and react-dom to 19.3.1 to match the akanjs peer range.",
      ko: "akanjs의 peer 범위에 맞게 react와 react-dom을 19.3.1로 고정합니다.",
    },
  },
  {
    name: "akanjs · @akanjs/cli",
    before: "3.0.2",
    after: "3.1.0",
    note: {
      en: "Install matching versions: the 3.1.0 CLI refuses a native build API older than 0.12.0, and akanjs 3.0 carries 0.10.0.",
      ko: "같은 버전으로 설치합니다. 3.1.0 CLI는 0.12.0보다 오래된 native build API를 거절하는데, akanjs 3.0에는 0.10.0이 들어 있습니다.",
    },
  },
] as const;

const upgradeSteps = `bun upgrade
akan update
akan sync <app-or-lib>
akan lint <app-or-lib>
akan typecheck <app-or-lib>`;

const areas = [
  {
    id: "routing",
    title: { en: "Routing and rendering", ko: "라우팅과 렌더링" },
    href: "/docs/core/routing",
    added: [
      {
        en: "rootLayout(), layout() and page() take .guard(fn), which decides who may open a route before any of it renders. On the server a guard's redirect is a real 307 and its refusal a 404, a client navigation waits for the guards, and over MCP they decide which screens a caller is listed. signedIn() in libs/shared/webkit is the sign-in check.",
        ko: "rootLayout(), layout(), page()가 .guard(fn) 단계를 받습니다. 라우트의 어떤 부분도 그리기 전에 누가 열 수 있는지 정합니다. 서버에서는 가드의 redirect가 실제 307, 거절이 404가 되고, 클라이언트 이동은 가드를 기다리며, MCP에서는 가드가 호출자에게 보일 화면을 정합니다. 로그인 검사는 libs/shared/webkit의 signedIn()입니다.",
      },
      {
        en: "rootLayout().viewport({ fitCover, interactiveWidget, themeColor }) writes the viewport and theme-color meta on the server and in the CSR shell, and a per-theme themeColor follows a theme switch at once, the iOS status bar included. Route heads merge root first: a deeper .head() replaces the title, a meta with the same name or property, and a canonical, manifest or icon link, and keeps the rest.",
        ko: "rootLayout().viewport({ fitCover, interactiveWidget, themeColor })가 서버와 CSR 셸 모두에서 viewport와 theme-color 메타를 쓰고, 테마별 themeColor는 테마를 바꾸는 즉시 iOS 상태 표시줄까지 따라 바뀝니다. 라우트 head는 루트부터 합쳐집니다. 더 깊은 .head()가 title, 같은 name이나 property의 meta, canonical·manifest·icon 링크를 교체하고 나머지는 유지합니다.",
      },
      {
        en: "router.push and router.replace take { shallow: true }: on an SSR page, a change of the query alone writes the URL and the store without asking the server for the page.",
        ko: "router.push와 router.replace가 { shallow: true }를 받습니다. SSR 페이지에서 쿼리만 바뀌면 서버에 페이지를 다시 요청하지 않고 URL과 스토어만 바꿉니다.",
      },
      {
        en: "Frame chrome renders on the server. Layout.Navbar, TopInset, TopLeftAction, BottomInset and BottomTab are in the SSR HTML, and that DOM moves into its slot on mount, so text typed before hydration, the focus and the caret survive.",
        ko: "프레임 크롬이 서버에서 렌더링됩니다. Layout.Navbar, TopInset, TopLeftAction, BottomInset, BottomTab이 SSR HTML에 들어가고, 마운트되면 그 DOM이 그대로 슬롯으로 옮겨지므로 하이드레이션 전에 입력한 텍스트와 포커스, 커서가 유지됩니다.",
      },
      {
        en: "Link.Back takes fallback and Layout.Navbar takes backFallback: the page router.backOrFallback() opens where going back would do nothing, such as the first screen after a reload. Link's active match strips the basePath and takes activeMatch.",
        ko: "Link.Back이 fallback을, Layout.Navbar가 backFallback을 받습니다. 새로고침 직후의 첫 화면처럼 뒤로 갈 곳이 없을 때 router.backOrFallback()이 여는 페이지입니다. Link의 활성 판정은 basePath를 떼고 비교하며 activeMatch를 받습니다.",
      },
      {
        en: "Helpers the framework kept in several copies are public: parseSearchParams in akanjs/common; isMcpView, router.postPathChange, breakpointQuery and TailwindBreakpoint in akanjs/client; and Href.isExternal, hasWebScheme and toExternalUrl, which classify a link the way the browser does.",
        ko: "프레임워크 곳곳에 복사돼 있던 헬퍼를 공개했습니다. akanjs/common의 parseSearchParams, akanjs/client의 isMcpView, router.postPathChange, breakpointQuery, TailwindBreakpoint, 그리고 브라우저와 같은 방식으로 링크를 판별하는 Href.isExternal, hasWebScheme, toExternalUrl입니다.",
      },
    ],
    fixed: [
      {
        en: "A not-found or redirect raised before the first byte is a real 404 or 3xx, also while a layout is still rendering something async, and a path value its .param() type refuses answers 404 instead of a blank 200.",
        ko: "첫 바이트 전에 발생한 not-found와 redirect는 레이아웃이 아직 비동기로 렌더링 중이어도 실제 404와 3xx로 응답하고, .param() 타입이 거부한 경로 값은 빈 200 대신 404로 응답합니다.",
      },
      {
        en: "A .head() that throws renders the page without a head instead of failing the request; a redirect or not-found raised in a head still routes.",
        ko: "예외를 던지는 .head()는 요청을 실패시키지 않고 head 없이 렌더링됩니다. head에서 발생한 redirect와 not-found는 그대로 동작합니다.",
      },
      {
        en: "A .loading() on a layout at a root boundary, such as (group)/_layout.tsx, reaches the route's Suspense boundaries instead of being dropped.",
        ko: "(group)/_layout.tsx처럼 루트 경계에 있는 레이아웃의 .loading()이 버려지지 않고 라우트의 Suspense 경계에 닿습니다.",
      },
      {
        en: "Back and forward in an SSR app land where the page was left, in Safari too, and hold that offset while images and streamed sections size themselves.",
        ko: "SSR 앱에서 뒤로·앞으로 이동하면 Safari에서도 떠났던 위치로 돌아가고, 이미지와 스트리밍 섹션이 크기를 잡는 동안 그 위치를 유지합니다.",
      },
      {
        en: "A CSR app, such as a native app's bundle, draws a not-found under the layouts its path sits under, lets a redirect take the place of a page that slides in, gives a pushed screen its own usePage().path, and no longer runs its frame router on the first render's stack.",
        ko: "네이티브 앱 번들 같은 CSR 앱이 경로가 속한 레이아웃 아래에 not-found를 그리고, 슬라이드로 들어오는 페이지 자리를 redirect가 대신하며, push된 화면이 자기 usePage().path를 읽고, 프레임 라우터가 더는 첫 렌더 때의 스택으로 동작하지 않습니다.",
      },
      {
        en: "Link treats any-case schemes, protocol-relative URLs and app schemes as external and opens them unchanged.",
        ko: "Link가 대소문자와 상관없이 스킴, 프로토콜 상대 URL, 앱 스킴을 외부 링크로 보고 그대로 엽니다.",
      },
      {
        en: "A basePath is stripped only on a segment boundary, so under office, /officers stays /officers. An SSR document links its manifest at /manifest.webmanifest in the head, where Chromium reads it.",
        ko: "basePath는 세그먼트 경계에서만 떼므로 basePath가 office일 때 /officers는 그대로입니다. SSR 문서는 manifest를 Chromium이 읽는 head 안에 /manifest.webmanifest로 연결합니다.",
      },
    ],
  },
  {
    id: "mcp",
    title: { en: "MCP and agents", ko: "MCP와 에이전트" },
    href: "/cheatsheet/interface/mcp",
    added: [
      {
        en: "page().app(name, description, load) publishes one component of a page as an MCP App: a read-only tool, a ui:// resource and a single-file view that a host such as claude.ai draws in the chat. A call runs the route's guards and the load alone, and on the web the same element reaches .render() under that name.",
        ko: "page().app(name, description, load)는 페이지의 컴포넌트 하나를 MCP App으로 공개합니다. 읽기 전용 도구, ui:// 리소스, 그리고 claude.ai 같은 호스트가 채팅 안에 그리는 단일 파일 뷰가 됩니다. 호출은 라우트의 가드와 load만 실행하고, 웹에서는 같은 엘리먼트가 그 이름으로 .render()에 전달됩니다.",
      },
      {
        en: "akan build writes one view per .app() to mcp-apps/<name>.html, bundling only what its load reaches, and akan start rebuilds the views on save. In a read-only deployment the views still work and refuse a write before it reaches the host.",
        ko: "akan build가 .app()마다 load가 닿는 모듈만 담은 뷰를 mcp-apps/<name>.html로 만들고, akan start는 저장할 때마다 뷰를 다시 만듭니다. 읽기 전용 배포에서도 뷰는 동작하며, 쓰기는 호스트에 닿기 전에 거절합니다.",
      },
      {
        en: "An endpoint returning ImageResult (akanjs/base) hands an MCP client's model a picture as an image block with an optional caption; HTTP callers get the JSON object as before.",
        ko: "ImageResult(akanjs/base)를 돌려주는 엔드포인트는 MCP 클라이언트의 모델에 이미지를 이미지 블록과 선택적 캡션으로 전달합니다. HTTP 호출자는 이전처럼 JSON 객체를 받습니다.",
      },
      {
        en: "The in-page agent looks at a picture on screen with the new viewImage built-in, and a tool of your own attaches files to its result with ToolReturn.attach from akanjs/store.",
        ko: "인페이지 에이전트가 새 기본 도구 viewImage로 화면의 이미지를 직접 봅니다. 직접 만든 도구도 akanjs/store의 ToolReturn.attach로 결과에 파일을 붙입니다.",
      },
      {
        en: "An agent's tool call runs only as the action the screen declared when the call arrived; a call whose declaration changed meanwhile is refused instead of run. st.tool(name, { label }) names an action for a person, and Agent.useScreenActions() lists the screen's argument-free actions for a command palette.",
        ko: "에이전트의 도구 호출은 호출이 도착한 시점에 화면이 선언한 동작으로만 실행되고, 그사이 선언이 바뀌었으면 실행하지 않고 거절합니다. st.tool(name, { label })은 사람에게 보여 줄 동작 이름을 붙이고, Agent.useScreenActions()는 커맨드 팔레트용으로 인자 없는 화면 동작을 나열합니다.",
      },
      {
        en: "LlmTurnRequest takes model, so a service can run one turn on another model, such as the one a conversation picked, without a second adaptor.",
        ko: "LlmTurnRequest가 model을 받으므로, 대화에서 고른 모델처럼 다른 모델로 한 턴을 돌릴 때 어댑터를 하나 더 만들 필요가 없습니다.",
      },
    ],
    fixed: [
      {
        en: "The agent chat's @ and / menus key their rows by id, a tap on a row keeps the phone keyboard up, and an @ mention whose title holds a bracket is sent as a chip.",
        ko: "에이전트 채팅의 @·/ 메뉴가 행을 id로 구분하고, 행을 탭해도 휴대폰 키보드가 내려가지 않으며, 제목에 대괄호가 든 @ 멘션도 칩으로 전송됩니다.",
      },
    ],
  },
  {
    id: "server",
    title: { en: "Endpoints and the server", ko: "엔드포인트와 서버" },
    href: "/cheatsheet/interface/endpoint",
    added: [
      {
        en: "A model or scalar argument is checked against the published request schema on HTTP, websocket and MCP before the handler runs. A wrong type, a value outside its enum or a missing required field answers 400 with data.name naming the path (data.items.2.price), and a key the input does not declare is dropped.",
        ko: "모델·스칼라 인자를 핸들러 실행 전에 HTTP, 웹소켓, MCP 모두에서 공개된 요청 스키마로 검사합니다. 타입이 틀리거나 enum 밖의 값이거나 필수 필드가 빠지면 data.name에 경로(data.items.2.price)를 담아 400으로 응답하고, 입력에 선언되지 않은 키는 버립니다.",
      },
      {
        en: "An endpoint declares the errors it throws on purpose, as in errors: { 409: [key] }. OpenAPI documents each status, the MCP tool description names each key, and Err.is(error, key) narrows a caught error, one restored from another server included.",
        ko: "엔드포인트가 의도해서 던지는 에러를 errors: { 409: [key] }처럼 선언합니다. OpenAPI가 상태 코드별로 문서화하고, MCP 도구 설명에 키가 실리며, Err.is(error, key)는 다른 서버에서 복원된 에러까지 포함해 잡은 에러를 좁힙니다.",
      },
      {
        en: "fetch.clone({ retry }) and a call's { retry, idempotencyKey } retry an unreachable server, a 502, 503 or 504, and a 429 after its Retry-After, within the call's one deadline. A mutation retries under one Idempotency-Key, which the server runs once per key, caller and arguments.",
        ko: "fetch.clone({ retry })와 호출별 { retry, idempotencyKey }가 서버에 닿지 않을 때, 502·503·504일 때, 그리고 429의 Retry-After 뒤에 호출의 한 데드라인 안에서 재시도합니다. mutation은 하나의 Idempotency-Key로 재시도하고, 서버는 키·호출자·인자마다 한 번만 실행합니다.",
      },
      {
        en: "The websocket client reconnects on a jittered backoff instead of every 3 seconds, at once when the device goes online or the tab becomes visible, and takes ws: { reconnect, headers, tls, onStateChange, onRevoked, onError }. It numbers each room's frames, drops a repeat and calls onResync at a hole, and a solo server on the built-in pub/sub replays what a resubscribe missed.",
        ko: "웹소켓 클라이언트가 3초 간격 대신 지터를 넣은 백오프로 재연결하되, 기기가 온라인이 되거나 탭이 보이면 바로 재연결하고, ws: { reconnect, headers, tls, onStateChange, onRevoked, onError }를 받습니다. 방마다 프레임에 번호를 매겨 중복은 버리고 빈 구간에서 onResync를 부르며, 기본 pub/sub을 쓰는 단일 서버는 재구독이 놓친 프레임을 다시 보내 줍니다.",
      },
      {
        en: "EndpointCacheControl.invalidate(endpoint, args?) drops an endpoint's { cache } answers before their TTL, on every instance at once.",
        ko: "EndpointCacheControl.invalidate(endpoint, args?)가 엔드포인트의 { cache } 응답을 TTL 전에 모든 인스턴스에서 한 번에 지웁니다.",
      },
      {
        en: "A process job's backoff takes maxDelay and its internal an onFailed dead-letter hook, AkanServer.start({ schedules: false }) runs none of the internals, as a test or a script wants, and Binary.toBase64 and Binary.fromBase64 (akanjs/base) are public.",
        ko: "process 작업의 backoff가 maxDelay를, internal이 onFailed 데드레터 훅을 받고, AkanServer.start({ schedules: false })는 테스트나 스크립트를 위해 internal을 하나도 실행하지 않습니다. Binary.toBase64와 Binary.fromBase64(akanjs/base)도 공개됐습니다.",
      },
    ],
    fixed: [
      {
        en: "Answers that used to be a 500: a malformed argument is 400 base.error.invalidArgument, a missing one 400 base.error.requiredArgument, a missing document 404 base.error.documentNotFound, and a required relation to a removed document 404 base.error.relationNotFound; a relation list leaves the removed one out.",
        ko: "500이던 응답을 바로잡았습니다. 형식이 틀린 인자는 400 base.error.invalidArgument, 빠진 인자는 400 base.error.requiredArgument, 없는 문서는 404 base.error.documentNotFound, 삭제된 문서를 가리키는 필수 relation은 404 base.error.relationNotFound이고, relation 목록에서는 삭제된 문서가 빠집니다.",
      },
      {
        en: "A { cache } hit answers exactly as the call that filled it, with its Maps, bytes and dates, and hands resolveField the declared model.",
        ko: "{ cache } 적중이 캐시를 채운 호출과 똑같이 Map, 바이트, 날짜까지 응답하고, resolveField에는 선언된 모델을 넘깁니다.",
      },
      {
        en: "A subscribe that loses a race with its socket's close or with its own unsubscribe joins no room, so no live room keeps a subscriber that will never leave.",
        ko: "소켓 종료나 자기 unsubscribe와 경합한 subscribe는 방에 들어가지 않으므로, 영영 나가지 않는 구독자가 실시간 방에 남지 않습니다.",
      },
      {
        en: "The fetch client sends multipart arguments as JSON, shows a proxy's own JSON 408, 429 or 5xx as the translated transport error, reads a 429's Retry-After: 0 as now instead of a minute, and keeps its parent's timeout in a clone.",
        ko: "fetch 클라이언트가 multipart 인자를 JSON으로 보내고, 프록시 자체의 JSON 408·429·5xx를 번역된 전송 오류로 보여 주며, 429의 Retry-After: 0을 1분이 아니라 즉시로 읽고, clone이 부모의 타임아웃을 유지합니다.",
      },
      {
        en: "A server-side WsClient and the tunnel agent terminate a silent socket instead of closing it, so they reconnect within one heartbeat on Bun 1.4.4.",
        ko: "서버 쪽 WsClient와 터널 에이전트가 응답 없는 소켓을 close 대신 terminate하므로, Bun 1.4.4에서도 하트비트 한 번 안에 재연결합니다.",
      },
      {
        en: "memory() declared with a model or scalar class reads back as an instance of that class, an endpoint returning Any is typed unknown on the client, and a class extending a one-argument adapt(name) typechecks in plug(TheClass) without a cast.",
        ko: "모델이나 스칼라 클래스로 선언한 memory()가 그 클래스의 인스턴스로 읽히고, Any를 돌려주는 엔드포인트는 클라이언트에서 unknown 타입이 되며, 인자 하나짜리 adapt(name)을 상속한 클래스는 캐스팅 없이 plug(TheClass)에서 타입 검사를 통과합니다.",
      },
      {
        en: "A module whose model relates to a disabled module is left out instead of answering 500, an untyped queue backoff waits its delay on bullmq, the gateway restarts a replica whose socket Bun 1.4.3 reports by errno, and memory ceilings read the process's own cgroup.",
        ko: "비활성 모듈과 relation이 있는 모듈은 500을 내는 대신 함께 빠지고, type 없는 큐 backoff가 bullmq에서도 지연을 기다리며, 게이트웨이는 Bun 1.4.3이 errno로 알리는 소켓 오류에도 레플리카를 재시작하고, 메모리 한도는 프로세스 자신의 cgroup에서 읽습니다.",
      },
    ],
  },
  {
    id: "data",
    title: { en: "Data and migrations", ko: "데이터와 마이그레이션" },
    href: "/cheatsheet/dev/migration",
    added: [
      {
        en: "Data migrations: akan create-migration writes a migration(title) with plan, apply and verify stages, and akan migrate <app> runs it, with apply --expect <planHash> refusing data that changed since the plan was reviewed. A built image runs the same through bun main.js ops migrate, and every run is recorded in the app's own database under a lease, so rollback restores what an apply changed.",
        ko: "데이터 마이그레이션이 생겼습니다. akan create-migration이 plan, apply, verify 단계를 가진 migration(title)을 만들고 akan migrate <app>이 실행하며, apply --expect <planHash>는 계획을 검토한 뒤 데이터가 바뀌었으면 거절합니다. 빌드된 이미지에서는 bun main.js ops migrate로 똑같이 돌고, 모든 실행은 lease 아래 앱 자신의 데이터베이스에 기록되어 rollback이 apply의 변경을 되돌립니다.",
      },
      {
        en: "POST /_akan/ops/migrate runs a migration over the ops channel, so a control plane reaches a host it has no shell on.",
        ko: "POST /_akan/ops/migrate가 ops 채널로 마이그레이션을 실행하므로, 셸이 없는 호스트에도 컨트롤 플레인이 닿습니다.",
      },
      {
        en: "purge<Filter>() and purgeMany(query) delete rows for good, removed ones included, 1,000 per statement, for data past its retention such as logs. An empty query, such as {} or a filter whose conditions all fell through, is refused, as is one with q.search().",
        ko: "purge<Filter>()와 purgeMany(query)가 삭제된 행까지 포함해 행을 영구 삭제합니다. 로그처럼 보존 기간이 지난 데이터용이며, 한 문장에 1,000행씩 지웁니다. {}나 조건이 모두 빠진 필터 같은 빈 쿼리는 거절하고, q.search()가 든 쿼리도 거절합니다.",
      },
      {
        en: "Model.upsertById(data, { preserveTimestamps }) writes a record under its own id with no hook, and an insight field sums with accumulate: { $sum }.",
        ko: "Model.upsertById(data, { preserveTimestamps })가 훅 없이 자기 id로 레코드를 쓰고, insight 필드는 accumulate: { $sum }으로 합계를 냅니다.",
      },
      {
        en: "StorageAdaptor.resolveLocalPath(path, access?) gives a stored file's disk path, or null for a key it refuses, so an app no longer casts the storage role to reach its internals.",
        ko: "StorageAdaptor.resolveLocalPath(path, access?)가 저장된 파일의 디스크 경로를 주고, 거부하는 키에는 null을 돌려줍니다. 앱이 스토리지 역할을 캐스팅해 내부에 손댈 필요가 없습니다.",
      },
    ],
    fixed: [
      {
        en: "A conditional updateOne or removeOne is a compare-and-set on Postgres too: of two concurrent calls that both read the row as matching, only one applies, so a balance guarded by balance >= amount can no longer go negative.",
        ko: "조건부 updateOne과 removeOne이 Postgres에서도 compare-and-set이 됩니다. 같은 행을 조건에 맞는다고 읽은 동시 호출 둘 중 하나만 적용되므로, balance >= amount로 지키던 잔액이 더는 음수가 되지 않습니다.",
      },
      {
        en: "An index declared without a name is named by its table and fields, never its position, so adding or reordering declarations no longer renames and rebuilds the others. An index akan built that nothing declares any more is dropped, concurrently on Postgres; one made by hand is left alone, even under a name akan would give.",
        ko: "name 없이 선언한 인덱스는 위치가 아니라 테이블과 필드로 이름이 붙으므로, 선언을 추가하거나 순서를 바꿔도 다른 인덱스의 이름이 바뀌어 다시 빌드되지 않습니다. akan이 만들었지만 더는 아무도 선언하지 않는 인덱스는 삭제되며(Postgres에서는 동시성 있게), 직접 만든 인덱스는 akan이 붙일 이름을 쓰고 있어도 건드리지 않습니다.",
      },
      {
        en: "In the single database mode, a job whose process died on its last attempt fails and reaches onFailed, instead of running again past its attempts.",
        ko: "single 데이터베이스 모드에서 마지막 시도 중에 프로세스가 죽은 job은 attempts를 넘겨 다시 실행되지 않고 실패로 처리되어 onFailed에 도달합니다.",
      },
      {
        en: "schema.index(fields, { where }) builds a real partial index on SQLite and Postgres; with unique, where: { removedAt: null } lets a soft-removed row give its key back.",
        ko: "schema.index(fields, { where })가 SQLite와 Postgres에서 실제 부분 인덱스를 만듭니다. unique와 함께 where: { removedAt: null }을 주면 소프트 삭제된 행이 키를 돌려줍니다.",
      },
      {
        en: "A cascade removes each document once and skips a target another owner's cascade already removed, instead of failing halfway and leaving files behind.",
        ko: "cascade가 문서마다 한 번만 삭제하고, 다른 소유자의 cascade가 이미 지운 대상은 건너뜁니다. 중간에 실패해 파일이 남는 일이 없습니다.",
      },
      {
        en: "A model with its own kind field can be queried by it, on SQLite only a statement SQLite reports as a write waits for another request's transaction, and updateManyByQuery and removeManyByQuery report true counts on models with search fields.",
        ko: "자기 kind 필드를 가진 모델도 그 필드로 조회할 수 있고, SQLite에서는 SQLite가 쓰기라고 판단한 문장만 다른 요청의 트랜잭션을 기다리며, 검색 필드가 있는 모델에서 updateManyByQuery와 removeManyByQuery가 실제 개수를 알려 줍니다.",
      },
      {
        en: "A live slice's .live({ payload: 'id' }) reaches its rooms.",
        ko: "라이브 슬라이스의 .live({ payload: 'id' })가 방에 제대로 전달됩니다.",
      },
    ],
  },
  {
    id: "ui",
    title: { en: "UI, forms and stores", ko: "UI, 폼, 스토어" },
    href: "/references/ui/forms",
    added: [
      {
        en: "Modal, Dialog.Modal, Model.New and the model modals take presentation ('dialog', 'sheet' or 'auto', a full-screen sheet below md that a drag down dismisses) and placement ('center' or 'right').",
        ko: "Modal, Dialog.Modal, Model.New와 모델 모달이 presentation('dialog', 'sheet', 그리고 md 미만에서 아래로 끌어 닫는 전체 화면 시트가 되는 'auto')과 placement('center', 'right')를 받습니다.",
      },
      {
        en: "Generated upload<Field>On<Model> actions belong to the form that started them. <model>FormUploading holds the uploads in flight and keeps submit disabled, and formUploadOf(setter) lets any control upload through the form.",
        ko: "생성된 upload<Field>On<Model> 액션이 업로드를 시작한 폼에 묶입니다. <model>FormUploading이 진행 중인 업로드를 담아 제출을 막고, formUploadOf(setter)로 어떤 컨트롤이든 폼을 통해 업로드할 수 있습니다.",
      },
      {
        en: "Load.Units refetches rows it seeded from a replayed navigation, and the generated invalidate<Model>() marks every slice of a model stale without a request.",
        ko: "Load.Units가 재생된 내비게이션에서 받은 행을 다시 불러오고, 생성된 invalidate<Model>()은 요청 없이 모델의 모든 슬라이스를 stale로 표시합니다.",
      },
      {
        en: "Signal.Doc and Constant.Doc render from a server page, Signal.Doc.Explorer lists every mounted signal, and groupBy='lib' groups models and signals by the library that registered them.",
        ko: "Signal.Doc과 Constant.Doc이 서버 페이지에서 렌더링되고, Signal.Doc.Explorer가 마운트된 모든 시그널을 나열하며, groupBy='lib'은 모델과 시그널을 등록한 라이브러리별로 묶습니다.",
      },
      {
        en: "topInset and bottomInset take breakpoints, the frame publishes --akan-content-height and --akan-keyboard-inset, and useVisualViewportFrame reports the web keyboard. Layout.BottomTab renders a named nav, matches tabs by segment, and marks the current one aria-current.",
        ko: "topInset과 bottomInset이 브레이크포인트를 받고, 프레임이 --akan-content-height와 --akan-keyboard-inset을 공개하며, useVisualViewportFrame이 웹 키보드를 알려 줍니다. Layout.BottomTab은 이름 붙은 nav를 렌더링하고 세그먼트 단위로 탭을 맞추며 현재 탭에 aria-current를 붙입니다.",
      },
      {
        en: "Tooltip draws on the overlay layer and flips to the side with room, and BottomSheet locks the page, pads for the safe area and opens above the frame. The agent launcher takes launcherPlacement and hideLauncherBelow.",
        ko: "Tooltip이 오버레이 레이어에 그려지고 공간이 있는 쪽으로 뒤집히며, BottomSheet는 페이지를 잠그고 안전 영역만큼 여백을 두고 프레임 위에서 열립니다. 에이전트 런처는 launcherPlacement와 hideLauncherBelow를 받습니다.",
      },
    ],
    fixed: [
      {
        en: "A modal stacks above every overlay on the page, a dropdown, select or nested modal opened inside one lands above its panel, toasts sit above modals, and the agent launcher sits under menus and modals.",
        ko: "모달이 페이지의 모든 오버레이 위에 쌓이고, 모달 안에서 연 드롭다운·셀렉트·중첩 모달은 패널 위에 뜨며, 토스트는 모달보다 위에, 에이전트 런처는 메뉴와 모달 아래에 놓입니다.",
      },
      {
        en: "Raw buttons inside akanjs/ui components declare type='button', so a password toggle, a list's add button or a copy button no longer submits an enclosing form.",
        ko: "akanjs/ui 컴포넌트 안의 raw 버튼이 type='button'을 선언하므로, 비밀번호 표시 토글, 목록의 추가 버튼, 복사 버튼이 더는 바깥 폼을 제출하지 않습니다.",
      },
      {
        en: "An open Load.Edit or Model.EditModal keeps what was typed when its page refreshes with the same seed, and Tab.Panel follows a change of its loading prop while hidden.",
        ko: "열린 Load.Edit와 Model.EditModal은 같은 시드로 페이지가 새로고침돼도 입력한 내용을 유지하고, Tab.Panel은 숨겨진 동안에도 loading prop 변경을 따릅니다.",
      },
      {
        en: "useDebounce keeps one timer per component, so a searchable Select searches once after typing stops, and a call still waiting at unmount runs then.",
        ko: "useDebounce가 컴포넌트마다 타이머 하나만 두므로 검색 가능한 Select가 입력이 멈춘 뒤 한 번만 검색하고, 언마운트 때 대기 중인 호출은 그때 실행합니다.",
      },
      {
        en: "A limit-0 live list keeps every row, Load.Units with loading={null} draws no reload overlay, and rows rendered with renderItem stay mounted across a live event.",
        ko: "limit 0인 라이브 목록이 모든 행을 유지하고, loading={null}인 Load.Units는 다시 불러올 때 오버레이를 그리지 않으며, renderItem으로 그린 행은 라이브 이벤트에도 마운트를 유지합니다.",
      },
      {
        en: "Model.LoadInit renders nothing. A list shown again from a CSR stack reloads its own query instead of keeping the rows of the page pushed over it, a live slice's room stays open until the last list showing it unmounts, and a slice loaded with { insight: false } skips the count on refetches until its next init.",
        ko: "Model.LoadInit은 아무것도 그리지 않습니다. CSR 스택에서 다시 보이는 목록은 위에 쌓였던 페이지의 행을 두지 않고 자기 쿼리를 다시 불러오며, 라이브 슬라이스의 방은 그 슬라이스를 보여 주는 마지막 목록이 언마운트될 때까지 열려 있고, { insight: false }로 불러온 슬라이스는 다음 init 전까지 다시 불러와도 count를 세지 않습니다.",
      },
      {
        en: "Select lists an enumOf class under its dictionary names, Model.ViewEditModal shows only the verbs the slice's guards open, Model.New opens under its own modal, and a store action for a verb the slice leaves closed fails with base.error.endpointClosed.",
        ko: "Select가 enumOf 클래스를 딕셔너리 이름으로 나열하고, Model.ViewEditModal은 슬라이스 가드가 연 동작만 보여 주며, Model.New는 자기 모달 아래에서 열리고, 슬라이스가 닫아 둔 동작의 스토어 액션은 base.error.endpointClosed로 실패합니다.",
      },
      {
        en: "An installed web app no longer rubber-bands its whole document, and an input smaller than 16px draws at 16px on a touch screen, where iOS would zoom into it.",
        ko: "홈 화면에 설치한 웹 앱은 문서 전체가 튕기지 않고, 16px보다 작은 입력은 iOS가 확대하지 않도록 터치 화면에서 16px로 그립니다.",
      },
      {
        en: "Link.Back is always a button a keyboard reaches, and Image and CsrImage no longer write placeholder and blurDataURL onto the img.",
        ko: "Link.Back은 언제나 키보드로 닿는 버튼이고, Image와 CsrImage는 더 이상 img에 placeholder와 blurDataURL을 쓰지 않습니다.",
      },
    ],
  },
  {
    id: "native",
    title: { en: "Native apps, desktop and OTA", ko: "네이티브 앱, 데스크톱, OTA" },
    href: "/cheatsheet/mobile/setup",
    added: [
      {
        en: "Phone web bundle updates move to protocol v2: one signed envelope per native API, a key ring of one to three keys in updates.publicKeys, and key revocation that a device keeps for good. native.updates.revokedKeys keeps a revocation in every later release, and a new binary trusts none of the revoked keys.",
        ko: "폰 웹 번들 업데이트가 프로토콜 v2로 바뀝니다. native API마다 서명된 envelope 하나, updates.publicKeys의 키 1~3개짜리 키 링, 그리고 기기가 영구히 기억하는 키 폐기입니다. native.updates.revokedKeys가 이후 모든 릴리즈에 폐기를 실어 보내고, 새 바이너리는 폐기된 키를 하나도 신뢰하지 않습니다.",
      },
      {
        en: "updates.report: { url } has a phone post what became of each release (downloaded, applied, confirmed, rolled back or failed), under a random install id and nothing about the user.",
        ko: "updates.report: { url }을 주면 폰이 릴리즈마다 다운로드, 적용, 확인, 롤백, 실패 중 어떻게 됐는지 보냅니다. 무작위 설치 id만 쓰고 사용자에 관한 정보는 보내지 않습니다.",
      },
      {
        en: "akan push-update packs a phone update and uploads it to an Akan Cloud project, which signs and publishes it, and akan register-binary registers a store build; both upload straight to storage. akan pack-update records each pack in pack.json, and the same commit packs to the same bytes.",
        ko: "akan push-update가 폰 업데이트를 묶어 Akan Cloud 프로젝트에 올리면 프로젝트가 서명해 배포하고, akan register-binary는 스토어 빌드를 등록합니다. 둘 다 스토리지로 바로 업로드합니다. akan pack-update는 묶음마다 pack.json을 남기고, 같은 커밋은 같은 바이트로 묶입니다.",
      },
      {
        en: "Every native build and pack records the AKAN_PUBLIC_* values its web bundle inlined, and --public-env <file> builds with exactly those values.",
        ko: "모든 네이티브 빌드와 업데이트 묶음이 웹 번들에 인라인한 AKAN_PUBLIC_* 값을 기록하고, --public-env <file>은 정확히 그 값으로 빌드합니다.",
      },
      {
        en: "A desktop app built with desktop.recovery: 'reload', the setting of a screen nobody attends, keeps its pages in: no print or file dialog, share sheet, download, or link handed to another program.",
        ko: "아무도 지켜보지 않는 화면용 설정인 desktop.recovery: 'reload'로 빌드한 데스크톱 앱은 페이지가 창 밖으로 나가지 못하게 합니다. 인쇄·파일 대화상자, 공유 시트, 다운로드, 다른 프로그램으로 넘기는 링크가 모두 막힙니다.",
      },
      {
        en: "The external-view plugin shows a third-party page first-party over a desktop window, with its own browser profile, an origin lock, evaluate, a trusted sendKey and capture. The window plugin adds placeOnDisplay, frameless windows, setMinSize and pointer hiding.",
        ko: "external-view 플러그인이 서드파티 페이지를 데스크톱 창 위에 자기 화면처럼 띄웁니다. 전용 브라우저 프로필, 출처 잠금, evaluate, 신뢰된 sendKey, capture를 갖습니다. window 플러그인에는 placeOnDisplay, 프레임 없는 창, setMinSize, 포인터 숨기기가 추가됐습니다.",
      },
      {
        en: "A desktop app's carried server takes { env, restart, watchdog, profile, modules }: restart 'forever', a health-route watchdog, and an edge profile whose env file keeps secrets off the installed computers. serve(ref, { operationMode: ['edge'] }) mounts a module only in the modes it lists, and MachineToken signs Ed25519 device tokens that a server verifies into account.machine.",
        ko: "데스크톱 앱이 싣는 서버가 { env, restart, watchdog, profile, modules }를 받습니다. restart 'forever', 헬스 라우트 watchdog, 그리고 설치된 컴퓨터에 시크릿을 두지 않는 edge 프로필 env 파일입니다. serve(ref, { operationMode: ['edge'] })는 나열한 모드에서만 모듈을 마운트하고, MachineToken은 서버가 account.machine으로 검증하는 Ed25519 기기 토큰을 서명합니다.",
      },
      {
        en: "native.backgroundColor paints a window before its page does, desktop.publisher names a Windows app's publisher, desktop.webview2: 'standalone' embeds WebView2 in the setup, updates.setChannel({ channel }) moves an installed desktop app to another channel, and native.devtools opens the inspector of an internal release build.",
        ko: "native.backgroundColor가 페이지보다 먼저 창을 칠하고, desktop.publisher가 Windows 앱의 게시자를 정하며, desktop.webview2: 'standalone'은 설치 프로그램에 WebView2를 넣고, updates.setChannel({ channel })은 설치된 데스크톱 앱을 다른 채널로 옮기며, native.devtools는 내부용 릴리즈 빌드의 인스펙터를 엽니다.",
      },
      {
        en: "akan publish-update --arch arm64|x64 publishes a desktop release for another CPU into that CPU's feed, and --upload s3://<bucket>/<prefix> uploads the release with its manifests last.",
        ko: "akan publish-update --arch arm64|x64가 다른 CPU용 데스크톱 릴리즈를 그 CPU의 피드에 게시하고, --upload s3://<bucket>/<prefix>는 릴리즈를 업로드하되 매니페스트를 마지막에 올립니다.",
      },
    ],
    fixed: [
      {
        en: "A signed desktop app refuses an update that the same team or subject did not sign, and records it as failed instead of offering it again.",
        ko: "서명된 데스크톱 앱은 같은 팀이나 주체가 서명하지 않은 업데이트를 거절하고, 다시 제안하지 않도록 실패로 기록합니다.",
      },
      {
        en: "On a phone, a release on trial whose page hangs rolls back while the app runs, and iOS and Android no longer roll back a trial after a background launch or an activity recreate. An iOS app built with the iOS 26 SDK launches on iOS 18.5 again.",
        ko: "폰에서 시험 중인 릴리즈의 페이지가 멈추면 앱이 실행 중일 때 롤백하고, iOS와 Android가 백그라운드 실행이나 액티비티 재생성 뒤에 시험 중인 릴리즈를 롤백하지 않습니다. iOS 26 SDK로 빌드한 iOS 앱이 iOS 18.5에서 다시 실행됩니다.",
      },
      {
        en: "Windows setups and uninstalls survive a watchdog restarting the app, a silent setup shows no window over a kiosk, the single-instance check holds across SSH and desktop sessions, and the executable names the app as its company instead of Bun.",
        ko: "Windows 설치와 제거가 watchdog의 앱 재시작에도 실패하지 않고, 조용한 설치는 키오스크 위에 창을 띄우지 않으며, 단일 인스턴스 검사가 SSH와 데스크톱 세션 사이에서도 유지되고, 실행 파일의 회사 이름이 Bun이 아니라 앱이 됩니다.",
      },
      {
        en: "A window size or position past one million pixels is refused instead of placing the window off every display, and native plugin sources accept Bun 1.4.4's extglob patterns.",
        ko: "백만 픽셀이 넘는 창 크기나 위치는 창을 모든 디스플레이 밖에 두는 대신 거절되고, 네이티브 플러그인 소스가 Bun 1.4.4의 extglob 패턴을 받습니다.",
      },
    ],
  },
  {
    id: "cli",
    title: { en: "CLI, build and workspace", ko: "CLI, 빌드, 워크스페이스" },
    href: "/references/cli/pipeline",
    added: [
      {
        en: "pipeline in an app's akan.config.ts lists its stages: build, docker, deploy and ota, plus shell stages with when, env, secrets, timeout and retry. A workspace-root akan.config.ts (WorkspaceConfig) holds the stages around every app, and akan pipeline dry-run, validate or plan prints the plan Akan Cloud runs.",
        ko: "앱 akan.config.ts의 pipeline이 build, docker, deploy, ota 단계와 when, env, secrets, timeout, retry를 갖는 셸 단계를 나열합니다. 워크스페이스 루트의 akan.config.ts(WorkspaceConfig)는 모든 앱을 둘러싼 단계를 담고, akan pipeline dry-run·validate·plan이 Akan Cloud가 실행할 계획을 출력합니다.",
      },
      {
        en: "akan upload-secret, list-secrets and remove-secret manage write-only pipeline secrets per project and branch, and the root config's cloud.host names a self-hosted Akan Cloud for every command.",
        ko: "akan upload-secret, list-secrets, remove-secret이 프로젝트·브랜치별 쓰기 전용 파이프라인 시크릿을 관리하고, 루트 설정의 cloud.host가 모든 명령에 자체 호스팅 Akan Cloud를 지정합니다.",
      },
      {
        en: "akan typecheck takes a library and checks the target's tests and specs too, and a new lint rule, no-conditional-st-hook, reports an st hook a render can skip.",
        ko: "akan typecheck이 라이브러리도 받고 대상의 테스트와 스펙까지 검사하며, 새 린트 규칙 no-conditional-st-hook이 렌더에서 건너뛸 수 있는 st 훅을 잡습니다.",
      },
      {
        en: "akan subspace plan prints what a push would ship from the checkout alone, and AKAN_BUILD_METAFILE=1 akan build writes the bundler's metafile for each backend entry.",
        ko: "akan subspace plan이 체크아웃만으로 push가 내보낼 내용을 출력하고, AKAN_BUILD_METAFILE=1 akan build는 백엔드 엔트리마다 번들러 metafile을 씁니다.",
      },
      {
        en: "akan code compacts at a share of the context window you choose (/autocompact, --compact-at) and searches and reads the web through DeepSeek when the workspace has a DeepSeek key.",
        ko: "akan code가 직접 고른 컨텍스트 창 비율에서 압축하고(/autocompact, --compact-at), 워크스페이스에 DeepSeek 키가 있으면 DeepSeek으로 웹을 검색하고 읽습니다.",
      },
      {
        en: "akan agent install writes an AGENTS.md about 60% smaller, with routing in a new pageRule guideline, and the guidelines cover .guard() and .app().",
        ko: "akan agent install이 약 60% 작아진 AGENTS.md를 쓰고, 라우팅은 새 pageRule 가이드라인으로 옮겼으며, 가이드라인이 .guard()와 .app()을 다룹니다.",
      },
    ],
    fixed: [
      {
        en: "No command reads a prompt's answer from a piped or closed stdin: a missing argument fails at once and names what to pass.",
        ko: "어떤 명령도 파이프로 들어오거나 닫힌 stdin을 프롬프트의 답으로 읽지 않습니다. 빠진 인자는 바로 실패하며 무엇을 넘겨야 하는지 알려 줍니다.",
      },
      {
        en: "Builds are reproducible: generated barrels list modules in name order, and akan build bakes the AKAN_PUBLIC_REPO_NAME and AKAN_PUBLIC_SERVE_DOMAIN its image carries into its bundles, as it did AKAN_PUBLIC_ENV, whatever the shell exported.",
        ko: "빌드가 재현됩니다. 생성된 barrel이 모듈을 이름순으로 나열하고, akan build는 셸이 무엇을 export했든 이미지가 가진 AKAN_PUBLIC_REPO_NAME과 AKAN_PUBLIC_SERVE_DOMAIN을 AKAN_PUBLIC_ENV처럼 번들에 넣습니다.",
      },
      {
        en: "akan script, console, db-export and db-import run from the workspace root and open the same SQLite database as akan start.",
        ko: "akan script, console, db-export, db-import가 워크스페이스 루트에서 실행되어 akan start와 같은 SQLite 데이터베이스를 엽니다.",
      },
      {
        en: "Tailwind classes with nested brackets, such as has-[[aria-expanded=true]]:opacity-100, compile, and a CSR shell that draws @lexical/code-prism under lazy() no longer fails with Prism is not defined.",
        ko: "has-[[aria-expanded=true]]:opacity-100처럼 대괄호가 중첩된 Tailwind 클래스가 컴파일되고, lazy() 아래에서 @lexical/code-prism을 그리는 CSR 셸이 Prism is not defined로 실패하지 않습니다.",
      },
      {
        en: "The default image is oven/bun:1.4.4-slim instead of a floating tag, a failed typecheck or build prints its diagnostics once, and a child server's errors show in the akan start terminal.",
        ko: "기본 이미지가 떠다니는 태그 대신 oven/bun:1.4.4-slim이 되고, 실패한 typecheck과 build는 진단을 한 번만 출력하며, 자식 서버의 에러가 akan start 터미널에 보입니다.",
      },
      {
        en: "Scaffolds write files that pass biome check and hand fetch.* results to sections unawaited, the CLI runs in a workspace with no root .env, and generated files name paths with / on Windows.",
        ko: "스캐폴드가 biome check를 통과하는 파일을 쓰고 fetch.* 결과를 await하지 않은 채 섹션에 넘기며, CLI가 루트 .env 없는 워크스페이스에서도 동작하고, 생성 파일이 Windows에서도 경로를 /로 씁니다.",
      },
      {
        en: "akan install-library copies a library from the installed akanjs version's tag in one shallow clone, the version-mismatch warning goes to stderr so JSON output stays parseable, and a gateway with no log file, as in the image, prints its children's stderr.",
        ko: "akan install-library가 설치된 akanjs 버전의 태그에서 얕은 clone 한 번으로 라이브러리를 복사하고, 버전 불일치 경고가 stderr로 나가 JSON 출력이 깨지지 않으며, 이미지처럼 로그 파일이 없는 gateway는 자식 프로세스의 stderr를 출력합니다.",
      },
    ],
  },
] as const;

const securityFixes = [
  {
    en: "A server render reads only its own request. A boundary React resumed after the shell, such as a client component streamed in behind a Suspense fallback, could read another visitor's cookies, session token and basePath under concurrent traffic.",
    ko: "서버 렌더가 자기 요청만 읽습니다. 셸 이후 React가 재개한 경계, 예를 들어 Suspense fallback 뒤에서 스트리밍된 클라이언트 컴포넌트가 동시 트래픽에서 다른 방문자의 쿠키, 세션 토큰, basePath를 읽을 수 있었습니다.",
  },
  {
    en: "A server-side call to another origin no longer carries the visitor's Authorization header, auth cookie or address; only a call to this server forwards them.",
    ko: "다른 출처로 가는 서버 쪽 호출이 더는 방문자의 Authorization 헤더, 인증 쿠키, 주소를 싣지 않습니다. 이 서버로 가는 호출만 전달합니다.",
  },
  {
    en: "A request body can no longer set a field outside its input class, such as removedAt or a role, for a service that forwards it.",
    ko: "요청 본문이 입력 클래스 밖의 필드, 예를 들어 removedAt이나 역할을 설정해 그대로 넘기는 서비스에 전달할 수 없습니다.",
  },
  {
    en: "Every reader of Authorization (the account layer, /mcp, machine tokens, the ops channel and the log stream) uses one grammar: Bearer, then one token and nothing after it.",
    ko: "Authorization을 읽는 모든 곳(계정 계층, /mcp, 머신 토큰, ops 채널, 로그 스트림)이 하나의 문법을 씁니다. Bearer 다음에 토큰 하나, 그 뒤에는 아무것도 없어야 합니다.",
  },
  {
    en: "The logger masks more secret names, among them webhook, DSN, access, session and signing keys and connection strings.",
    ko: "로거가 webhook, DSN, access·session·signing 키, 연결 문자열 등 더 많은 시크릿 이름을 가립니다.",
  },
  {
    en: "The RSC navigation cache and a CSR app's kept pages are dropped when the account changes, and a redirect raised while rendering a document carries Cache-Control: no-store.",
    ko: "계정이 바뀌면 RSC 내비게이션 캐시와 CSR 앱이 보관한 페이지를 버리고, 문서를 렌더링하다 발생한 redirect에는 Cache-Control: no-store가 붙습니다.",
  },
  {
    en: "An edge server starts with /mcp off, and update downloads ask for */*, so a CDN that injects scripts into HTML cannot alter signed bytes.",
    ko: "edge 서버는 /mcp를 끈 채 시작하고, 업데이트 다운로드는 */*를 요청하므로 HTML에 스크립트를 끼워 넣는 CDN이 서명된 바이트를 바꿀 수 없습니다.",
  },
  {
    en: "A CodeQL pass made the framework's regexes linear, keeps data: and vbscript: links out of the agent's screen text, and escapes what native config and the dev shim inline.",
    ko: "CodeQL 점검으로 프레임워크의 정규식을 선형 시간으로 바꾸고, 에이전트의 화면 텍스트에서 data:와 vbscript: 링크를 빼며, 네이티브 설정과 dev shim이 인라인하는 값을 이스케이프합니다.",
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

const performanceNotes = [
  {
    en: "An endpoint's middleware chain is composed once and reused, and a call skips the cache, idempotency and rate-limit steps it does not use.",
    ko: "엔드포인트의 미들웨어 체인을 한 번 조립해 재사용하고, 호출은 쓰지 않는 캐시·멱등성·rate limit 단계를 건너뜁니다.",
  },
  {
    en: "A response resolves from a field plan built once per model class, in one synchronous pass when nothing below it is a relation, and a call's traceId is spelled only when something reads it.",
    ko: "응답은 모델 클래스마다 한 번 만든 필드 계획으로 resolve되고, 아래에 relation이 없으면 동기 패스 한 번에 끝나며, 호출의 traceId는 무언가 읽을 때만 만듭니다.",
  },
  {
    en: "A websocket verifies a session's JWT signature once per connection, up to its expiry, instead of on every frame; revocation is still checked on every frame.",
    ko: "웹소켓이 세션 JWT 서명을 프레임마다가 아니라 만료 전까지 연결당 한 번 검증합니다. 폐기 여부는 여전히 프레임마다 확인합니다.",
  },
  {
    en: "/openapi.json is built once per process, and a server logs at debug how long each boot stage took.",
    ko: "/openapi.json은 프로세스당 한 번 만들고, 서버는 부팅 단계별 소요 시간을 debug 로그로 남깁니다.",
  },
] as const;

const upgradeGroups = [
  {
    title: { en: "Server and the wire", ko: "서버와 통신" },
    notes: [
      {
        en: "A body the published schema refuses (a numeric string for an Int, an { id } object for a relation, a missing required field) now answers 400, and a service no longer sees a key its input does not declare: declare the field on the input.",
        ko: "공개된 스키마가 거부하는 본문(Int 자리의 숫자 문자열, relation 자리의 { id } 객체, 빠진 필수 필드)은 이제 400으로 응답하고, 서비스는 입력에 선언되지 않은 키를 받지 못합니다. 필요한 필드는 입력에 선언합니다.",
        href: "/cheatsheet/interface/endpoint",
      },
      {
        en: "A malformed argument now answers 400 base.error.invalidArgument and a missing one 400 base.error.requiredArgument, where both were a 500: update a test or client that expected 500.",
        ko: "형식이 틀린 인자는 이제 400 base.error.invalidArgument로, 빠진 인자는 400 base.error.requiredArgument로 응답합니다. 둘 다 500이었으므로 500을 기대하던 테스트나 클라이언트를 고칩니다.",
        href: "/cheatsheet/observability/error",
      },
      {
        en: "A server-side clone toward another origin sends no visitor session: give it the token it should send with fetch.clone({ origin, jwt }). A clone of such a clone opens no websocket unless connect: true, and client and server deploy together, since multipart arguments now travel as JSON.",
        ko: "다른 출처를 향한 서버 쪽 clone은 방문자 세션을 보내지 않습니다. 보낼 토큰은 fetch.clone({ origin, jwt })로 넘깁니다. 그런 clone의 clone은 connect: true 없이 웹소켓을 열지 않고, multipart 인자가 이제 JSON으로 오가므로 클라이언트와 서버를 함께 배포합니다.",
        href: "/cheatsheet/interface/endpoint",
      },
      {
        en: "An Authorization header with anything but Bearer and one token reads as no credential, an AKAN_LOG_STREAM_TOKEN holding whitespace leaves /_akan/app/logs off, and pushRequestFallback is gone from akanjs/fetch: a read outside every request sees none, so run such code inside requestStorage.run(request, ...).",
        ko: "Bearer와 토큰 하나가 아닌 Authorization 헤더는 자격 증명이 없는 것으로 읽히고, 공백이 든 AKAN_LOG_STREAM_TOKEN은 /_akan/app/logs를 끈 채로 두며, akanjs/fetch에서 pushRequestFallback이 빠졌습니다. 어떤 요청 바깥에서 읽으면 요청이 없으므로 그런 코드는 requestStorage.run(request, ...) 안에서 실행합니다.",
        href: "/docs/core/runtime",
      },
      {
        en: "A memory() value of a model class is an instance, so copy it with new cnst.X().set(value), never a spread, and SignalContext.loadNested takes { arrDepth } only.",
        ko: "모델 클래스로 선언한 memory() 값은 인스턴스이므로 스프레드가 아니라 new cnst.X().set(value)로 복사하고, SignalContext.loadNested는 { arrDepth }만 받습니다.",
        href: "/cheatsheet/performance/caching",
      },
      {
        en: "A module that relates to a module you disable is left out as well, a { cache } TTL is capped at one day and answers cached before the upgrade are missed, and LibsqlDatabase is removed: use SqliteDatabase for a local file or the cluster mode for a shared server.",
        ko: "비활성으로 둔 모듈과 relation이 있는 모듈도 함께 빠지고, { cache } TTL은 최대 하루이며 업그레이드 전에 캐시된 응답은 적중하지 않고, LibsqlDatabase가 제거됐습니다. 로컬 파일은 SqliteDatabase를, 공유 서버는 cluster 모드를 씁니다.",
        href: "/docs/core/config",
      },
      {
        en: "An index that declared a where is rebuilt once on the next boot as a real partial index. A where no index can hold (q.search(), or a member test on an array field) stops the boot, and so do two different indexes given the same name.",
        ko: "where를 선언했던 인덱스는 다음 부팅 때 실제 부분 인덱스로 한 번 다시 빌드됩니다. 인덱스가 담을 수 없는 where(q.search(), 배열 필드의 원소 검사)와 같은 name을 받은 서로 다른 두 인덱스는 부팅을 멈춥니다.",
        href: "/cheatsheet/general/schema",
      },
      {
        en: "In the single database mode, a queued job whose process dies on its last attempt is failed and handed to onFailed instead of running again: a job left at the default attempts: 1 needs attempts: 2 to keep that retry.",
        ko: "single 데이터베이스 모드에서 마지막 시도 중에 프로세스가 죽은 job은 다시 실행되지 않고 실패로 처리되어 onFailed로 넘어갑니다. 기본값 attempts: 1로 둔 job이 그 재시도를 유지하려면 attempts: 2를 줍니다.",
        href: "/cheatsheet/performance/queue",
      },
      {
        en: "An edge server serves /mcp only with AKAN_MCP=true or option.setMcp(true), and a log search on a newly masked key sees [redacted].",
        ko: "edge 서버는 AKAN_MCP=true나 option.setMcp(true)일 때만 /mcp를 제공하고, 새로 가려진 키의 값을 찾던 로그 검색에는 [redacted]가 보입니다.",
        href: "/cheatsheet/general/edge",
      },
    ],
  },
  {
    title: { en: "Pages, UI and MCP", ko: "페이지, UI, MCP" },
    notes: [
      {
        en: "Every .prompt() page is now also listed in tools/list, as a tool with readOnlyHint: false, except on a read-only deployment. An app that serves its CSR bundle lets a client that declares MCP Apps support call its mcp: false endpoints and light<Model> reads under their guards, which 3.0.2 refused over MCP, and while it has an .app() page it speaks only the legacy MCP revisions unless option.setMcp({ modern: true }) or AKAN_MCP_MODERN=true. option.setMcp({ apps: false }) or AKAN_MCP_APPS=false undoes all three.",
        ko: "모든 .prompt() 페이지가 이제 tools/list에도 readOnlyHint: false인 도구로 나열됩니다. 읽기 전용 배포에서는 빠집니다. CSR 번들을 제공하는 앱에서는 MCP Apps 지원을 선언한 클라이언트가 mcp: false 엔드포인트와 light<Model> 조회를 가드 아래에서 호출할 수 있습니다. 3.0.2는 MCP에서 이를 거절했습니다. 그런 앱에 .app() 페이지가 있으면 option.setMcp({ modern: true })나 AKAN_MCP_MODERN=true가 아닌 한 레거시 MCP 리비전만 사용합니다. option.setMcp({ apps: false })나 AKAN_MCP_APPS=false를 주면 세 가지 모두 되돌립니다.",
        href: "/cheatsheet/interface/mcp",
      },
      {
        en: "An agent's call whose declaration changed on screen after it arrived is refused, and viewImage joins the default built-ins: list the built-ins you want to leave it out.",
        ko: "도착한 뒤 화면에서 선언이 바뀐 에이전트 호출은 거절되고, viewImage가 기본 도구에 들어갑니다. 빼려면 원하는 기본 도구를 나열합니다.",
        href: "/references/ui/agent",
      },
      {
        en: "A page no longer inherits a canonical link or og:url from a layout, so declare them in the page's own .head(); a page can drop manifest, icon and theme tags it restated from its root.",
        ko: "페이지가 레이아웃의 canonical 링크와 og:url을 더는 물려받지 않으므로 페이지 자신의 .head()에 선언합니다. 루트를 되풀이하던 manifest, icon, theme 태그는 지워도 됩니다.",
        href: "/docs/core/routing",
      },
      {
        en: "Link's prefix match is by path segment and / matches only itself, ServerPortal is gone, and Link.Back renders an inline-block button with type='button' instead of a div.",
        ko: "Link의 접두사 판정은 경로 세그먼트 단위이고 /는 자기 자신만 맞습니다. ServerPortal이 제거됐고, Link.Back은 div 대신 type='button'인 inline-block 버튼을 렌더링합니다.",
        href: "/references/ui/overlays",
      },
      {
        en: "Modals move from z-index 10 to 120, toasts from 100 to 140 and the agent launcher from 150 to 80: an element that relied on a z-index between 10 and 120 to sit above a modal now stays under it. An AgentLauncher override must apply its new style prop, and Tooltip's bubble is not in the DOM until it opens.",
        ko: "모달의 z-index가 10에서 120으로, 토스트가 100에서 140으로, 에이전트 런처가 150에서 80으로 바뀝니다. 10~120 사이 z-index로 모달 위에 있던 요소는 이제 모달 아래에 남습니다. AgentLauncher override는 새 style prop을 루트에 적용해야 하며, Tooltip 말풍선은 열릴 때까지 DOM에 없습니다.",
        href: "/references/ui/customize",
      },
      {
        en: "A page reached through the navigation cache issues one list request per Load.Units whose store held other query arguments; pass loading={null} to hide the reload overlay.",
        ko: "내비게이션 캐시로 도착한 페이지는 스토어가 다른 쿼리 인자를 갖고 있던 Load.Units마다 목록 요청을 한 번 보냅니다. 다시 불러올 때의 오버레이는 loading={null}로 숨깁니다.",
        href: "/cheatsheet/performance/realtime",
      },
      {
        en: "Constant.Doc's empty list now means none: leave the prop out to show every model.",
        ko: "Constant.Doc에 빈 목록을 주면 이제 아무것도 보이지 않습니다. 모든 모델을 보이려면 prop을 뺍니다.",
        href: "/cheatsheet/dev/docs",
      },
    ],
  },
  {
    title: { en: "Native apps", ko: "네이티브 앱" },
    notes: [
      {
        en: "Signing is opt-in: add --sign true to akan build-desktop and akan publish-update, and --notarize true for macOS. A signed installed app refuses an unsigned or differently signed release, so build each release the way the installed app was signed.",
        ko: "서명은 이제 직접 켭니다. akan build-desktop과 akan publish-update에 --sign true를, macOS는 --notarize true까지 줍니다. 서명된 설치 앱은 서명이 없거나 다른 릴리즈를 거절하므로, 릴리즈는 설치된 앱과 같은 방식으로 서명합니다.",
        href: "/cheatsheet/mobile/desktop-release",
      },
      {
        en: "No phone binary that shipped with updates reads the v2 layout: rebuild the binary before publishing, and point a signer at the new path.",
        ko: "updates를 넣어 배포했던 폰 바이너리는 v2 구조를 읽지 못합니다. 배포 전에 바이너리를 다시 빌드하고, 서명 도구가 새 경로를 보도록 합니다.",
        href: "/cheatsheet/mobile/setup",
      },
      {
        en: "akan pack-update --against now exits 2, not 1, when a pack needs a new store build, and 1 means any other failure: a CI step that read 1 as a new store build checks for 2.",
        ko: "akan pack-update --against는 새 스토어 빌드가 필요할 때 이제 1이 아니라 2로 종료하고, 1은 그 밖의 실패를 뜻합니다. 1을 새 스토어 빌드로 읽던 CI 단계는 2를 확인합니다.",
        href: "/references/cli/application",
      },
      {
        en: "Pages of an app built with desktop.recovery: 'reload' get no print dialog, file input, download or system-browser link; open those through the opener or file-picker plugin.",
        ko: "desktop.recovery: 'reload'로 빌드한 앱의 페이지는 인쇄 대화상자, 파일 입력, 다운로드, 시스템 브라우저 링크를 쓸 수 없습니다. 필요하면 opener나 file-picker 플러그인으로 엽니다.",
        href: "/cheatsheet/mobile/setup",
      },
      {
        en: "A release build or publish-update of a desktop app that carries its server is refused while that server's bundle holds a secret value of the workspace's server env files: build that server with native.desktop.server.profile.",
        ko: "서버를 싣는 데스크톱 앱은 그 서버 번들에 워크스페이스 서버 env 파일의 시크릿 값이 들어 있으면 릴리즈 빌드와 publish-update가 거절됩니다. 그 서버는 native.desktop.server.profile로 빌드합니다.",
        href: "/cheatsheet/general/edge",
      },
    ],
  },
  {
    title: { en: "CLI and workspace", ko: "CLI와 워크스페이스" },
    notes: [
      {
        en: "A CI step that answered a prompt through stdin fails fast now: pass the argument on the command line.",
        ko: "stdin으로 프롬프트에 답하던 CI 단계는 이제 바로 실패합니다. 인자를 명령줄로 넘깁니다.",
        href: "/references/cli/workspace",
      },
      {
        en: "akan typecheck checks tests and specs by default (--tests false for the old scope), akan sync refuses a test at the lib/ root or one not named after the file it covers, lint fails on a hook a render can skip (useHookAtTopLevel for React's own, no-conditional-st-hook for st hooks), and the theme contrast check reads every theme block.",
        ko: "akan typecheck은 기본으로 테스트와 스펙까지 검사하고(예전 범위는 --tests false), akan sync는 lib/ 루트의 테스트와 다루는 파일 이름을 따르지 않은 테스트를 거절하며, 린트는 렌더가 건너뛸 수 있는 훅에서 실패하고(React 훅은 useHookAtTopLevel, st 훅은 no-conditional-st-hook), 테마 대비 검사는 모든 테마 블록을 읽습니다.",
        href: "/conventions/workspace/lint",
      },
      {
        en: "akan.subspace.ts is no longer read: move it under subspace in the workspace-root akan.config.ts, then delete it, since subspace push and pull refuse while it exists.",
        ko: "akan.subspace.ts는 더는 읽지 않습니다. 내용을 워크스페이스 루트 akan.config.ts의 subspace로 옮긴 뒤 파일을 지웁니다. 파일이 남아 있으면 subspace push와 pull이 거절합니다.",
        href: "/references/cli/workspace",
      },
      {
        en: "A subspace no longer receives the workspace's Jenkinsfile: the copy a 3.0.2 push left becomes its own, so change it there. Quote a .env value that holds a #, since the build now ends an unquoted value there, as Bun does.",
        ko: "subspace는 더는 워크스페이스의 Jenkinsfile을 받지 않습니다. 3.0.2의 push가 남긴 사본이 subspace 자신의 파일이 되므로 그곳에서 고칩니다. 빌드도 이제 Bun처럼 따옴표 없는 값을 #에서 끝내므로, #이 들어간 .env 값은 따옴표로 감쌉니다.",
        href: "/docs/core/config",
      },
      {
        en: "akan script, console, db-export and db-import resolve relative paths from the workspace root, so build a script's paths from import.meta.dir.",
        ko: "akan script, console, db-export, db-import는 상대 경로를 워크스페이스 루트에서 풀므로 스크립트의 경로는 import.meta.dir로 만듭니다.",
        href: "/cheatsheet/dev/script",
      },
      {
        en: "A workspace with the shared or util library adds the type packages they compile against: bun add -d @types/react @types/react-dom, plus @types/nodemailer with util. Pin react-server-dom-webpack to 19.3.1, as react and react-dom are; akan now stops on a Bun older than 1.4.4.",
        ko: "shared나 util 라이브러리를 쓰는 워크스페이스는 컴파일에 필요한 타입 패키지를 추가합니다. bun add -d @types/react @types/react-dom을 실행하고, util을 쓰면 @types/nodemailer도 넣습니다. react-server-dom-webpack은 react, react-dom처럼 19.3.1로 고정합니다. akan은 이제 1.4.4보다 오래된 Bun에서 멈춥니다.",
        href: "/references/cli/library",
      },
      {
        en: "Run akan login again if a saved host was spelled with a trailing slash, uppercase or :443, and set docker.image to run another Bun than 1.4.4 in the image.",
        ko: "저장된 호스트를 끝 슬래시, 대문자, :443을 붙여 썼다면 akan login을 다시 하고, 이미지에서 1.4.4가 아닌 Bun을 쓰려면 docker.image를 지정합니다.",
        href: "/cheatsheet/dev/docker",
      },
      {
        en: "The optional peers move up a major: happy-dom and @happy-dom/global-registrator to 21, which loads no CSS file or iframe by default, and firebase to 13.",
        ko: "선택적 peer가 메이저 버전을 올립니다. happy-dom과 @happy-dom/global-registrator는 21이 되어 기본으로 CSS 파일과 iframe을 불러오지 않고, firebase는 13이 됩니다.",
        href: "/cheatsheet/dev/test",
      },
    ],
  },
] as const;

export default page()
  .config({ transition: "stack" })
  .head(({ lang }) => {
    const title =
      lang === "ko" ? "Akan.js 3.1.0 릴리즈 노트 | Akan.js 블로그" : "Akan.js 3.1.0 release notes | Akan.js Blog";
    const description =
      lang === "ko"
        ? "3.0.2에서 3.1.0까지 바뀐 모든 것을 영역별로 정리하고, 업그레이드할 때 손볼 곳을 모았습니다."
        : "Everything that changed from 3.0.2 to 3.1.0, by area, with the steps an upgrade needs.";
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
              <JellyKicker>Akan.js 3.1.0</JellyKicker>
            </div>
            <p className="mb-4 text-foreground/50 text-sm">
              {l.trans({ en: "Release notes · Oct 25, 2026", ko: "릴리즈 노트 · 2026년 10월 25일" })}
            </p>
            <h1 className="font-black text-4xl leading-[1.08] md:text-[3.25rem]">
              {l.trans({ en: "Akan.js 3.1.0 release notes", ko: "Akan.js 3.1.0 릴리즈 노트" })}
            </h1>
            <p className="mt-6 text-foreground/70 text-lg leading-8">
              {l.trans({
                en: "Everything that changed between 3.0.2 and 3.1.0, by area, followed by what an upgrade needs from you. Each package's CHANGELOG.md carries every entry in full.",
                ko: "3.0.2와 3.1.0 사이에 바뀐 모든 것을 영역별로 정리하고, 이어서 업그레이드할 때 손볼 곳을 모았습니다. 패키지마다 CHANGELOG.md에 모든 항목이 전문으로 실립니다.",
              })}
            </p>
            <Link
              href="/blog/v3-1release"
              className="mt-4 inline-flex items-center gap-2 font-semibold text-primary hover:underline"
            >
              {l.trans({ en: "Read the 3.1 announcement", ko: "3.1 발표 글 읽기" })} <BsArrowRight />
            </Link>
            <nav className="mt-8 flex flex-wrap gap-2">
              {areas.map((area) => (
                <a
                  key={area.id}
                  href={`#notes-${area.id}`}
                  className={badgeRecipe(
                    undefined,
                    "border-foreground/10 bg-foreground/5 text-foreground/70 hover:text-primary",
                  )}
                >
                  {l.trans(area.title)}
                </a>
              ))}
              <a
                href="#notes-security"
                className={badgeRecipe(
                  undefined,
                  "border-foreground/10 bg-foreground/5 text-foreground/70 hover:text-primary",
                )}
              >
                {l.trans({ en: "Security", ko: "보안" })}
              </a>
              <a
                href="#notes-performance"
                className={badgeRecipe(
                  undefined,
                  "border-foreground/10 bg-foreground/5 text-foreground/70 hover:text-primary",
                )}
              >
                {l.trans({ en: "Performance", ko: "성능" })}
              </a>
              <a
                href="#notes-upgrade"
                className={badgeRecipe(undefined, "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15")}
              >
                {l.trans({ en: "Upgrading from 3.0", ko: "3.0에서 올라올 때" })}
              </a>
            </nav>
          </header>

          <Scroll className="mt-14">
            <Scroll.Slide id="notes-requirements" title={l.trans({ en: "Requirements", ko: "요구 사항" })}>
              <h2 className="font-black text-2xl md:text-3xl">{l.trans({ en: "Requirements", ko: "요구 사항" })}</h2>
              <div className="jelly-glass mt-6 overflow-x-auto rounded-3xl px-5 py-2">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-border border-b">
                      <th className="py-3 pr-4 font-semibold text-foreground/45">
                        {l.trans({ en: "Package", ko: "패키지" })}
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-foreground/45">3.0</th>
                      <th className="px-4 py-3 text-right font-semibold text-foreground/45">3.1</th>
                      <th className="py-3 pl-4 font-semibold text-foreground/45">
                        {l.trans({ en: "Note", ko: "참고" })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirements.map((row) => (
                      <tr key={row.name} className="border-muted border-b last:border-none">
                        <td className="py-3 pr-4 font-medium text-foreground/80">{row.name}</td>
                        <td className="px-4 py-3 text-right font-mono text-foreground/55">{row.before}</td>
                        <td className="px-4 py-3 text-right font-mono text-primary">{row.after}</td>
                        <td className="py-3 pl-4 text-foreground/65">{l.trans(row.note)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-6 text-foreground/75 leading-7">
                {l.trans({
                  en: "Upgrade Bun, move the workspace and the global CLI to 3.1.0, then run akan sync once on every app and library, so its generated lib/cnst.ts and lib/sig.ts are rewritten:",
                  ko: "Bun을 올리고, 워크스페이스와 전역 CLI를 3.1.0으로 옮긴 다음, 생성 파일 lib/cnst.ts와 lib/sig.ts가 다시 쓰이도록 모든 앱과 라이브러리에서 akan sync를 한 번 실행합니다:",
                })}
              </p>
              <Code.Snippet className="mt-5 w-full" title="Terminal" code={upgradeSteps} showLineNumbers={false} />
            </Scroll.Slide>

            {areas.map((area) => (
              <Scroll.Slide key={area.id} id={`notes-${area.id}`} title={l.trans(area.title)} className="mt-16">
                <h2 className="font-black text-2xl md:text-3xl">{l.trans(area.title)}</h2>
                <h3 className="mt-6 font-bold text-primary text-sm uppercase tracking-[0.2em]">
                  {l.trans({ en: "New", ko: "새 기능" })}
                </h3>
                <ul className="mt-3 list-disc space-y-3 pl-5 text-foreground/75 leading-7">
                  {area.added.map((item) => (
                    <li key={item.en}>{l.trans(item)}</li>
                  ))}
                </ul>
                <h3 className="mt-8 font-bold text-foreground/50 text-sm uppercase tracking-[0.2em]">
                  {l.trans({ en: "Fixed", ko: "수정" })}
                </h3>
                <ul className="mt-3 list-disc space-y-3 pl-5 text-foreground/75 leading-7">
                  {area.fixed.map((item) => (
                    <li key={item.en}>{l.trans(item)}</li>
                  ))}
                </ul>
                <Link
                  href={area.href}
                  className="mt-5 inline-flex items-center gap-1 font-semibold text-primary text-sm hover:underline"
                >
                  {l.trans({ en: "Read the docs", ko: "문서 보기" })} <BsArrowRight />
                </Link>
              </Scroll.Slide>
            ))}

            <Scroll.Slide id="notes-security" title={l.trans({ en: "Security", ko: "보안" })} className="mt-16">
              <h2 className="font-black text-2xl md:text-3xl">{l.trans({ en: "Security", ko: "보안" })}</h2>
              <p className="jelly-callout tint-primary mt-6 rounded-3xl p-6 text-foreground/75 leading-7">
                {l.trans({
                  en: "Several of these close a leak between visitors or across servers. Every 3.0 app should take 3.1.0.",
                  ko: "이 가운데 여럿은 방문자 사이나 서버 사이의 유출을 막습니다. 3.0 앱은 모두 3.1.0으로 올리기를 권합니다.",
                })}
              </p>
              <ul className="mt-6 list-disc space-y-3 pl-5 text-foreground/75 leading-7">
                {securityFixes.map((item) => (
                  <li key={item.en}>{l.trans(item)}</li>
                ))}
              </ul>
            </Scroll.Slide>

            <Scroll.Slide id="notes-performance" title={l.trans({ en: "Performance", ko: "성능" })} className="mt-16">
              <h2 className="font-black text-2xl md:text-3xl">{l.trans({ en: "Performance", ko: "성능" })}</h2>
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
              <ul className="mt-6 list-disc space-y-3 pl-5 text-foreground/75 leading-7">
                {performanceNotes.map((item) => (
                  <li key={item.en}>{l.trans(item)}</li>
                ))}
              </ul>
            </Scroll.Slide>

            <Scroll.Slide
              id="notes-upgrade"
              title={l.trans({ en: "Upgrading from 3.0", ko: "3.0에서 올라올 때" })}
              className="mt-16"
            >
              <h2 className="font-black text-2xl md:text-3xl">
                {l.trans({ en: "Upgrading from 3.0", ko: "3.0에서 올라올 때" })}
              </h2>
              <p className="mt-3 text-foreground/65 leading-7">
                {l.trans({
                  en: "These are the changes that can need a hand. akan lint and akan typecheck point at most of them.",
                  ko: "손이 갈 수 있는 변경입니다. 대부분은 akan lint와 akan typecheck가 위치를 짚어 줍니다.",
                })}
              </p>
              {upgradeGroups.map((group) => (
                <div key={group.title.en} className="mt-8">
                  <h3 className="font-bold text-xl">{l.trans(group.title)}</h3>
                  <ol className="mt-4 grid gap-3">
                    {group.notes.map((note, idx) => (
                      <li key={note.en} className="jelly-glass flex gap-4 rounded-3xl p-4">
                        <span className="font-black font-mono text-foreground/30">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <div className="text-sm leading-6">
                          <p className="text-foreground/80">{l.trans(note)}</p>
                          <Link
                            href={note.href}
                            className="mt-1 inline-block font-semibold text-primary hover:underline"
                          >
                            {note.href}
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </Scroll.Slide>
            <DocsToc />
          </Scroll>
        </article>
      </main>
    );
  });
