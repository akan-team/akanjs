import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "도메인: model.signal.ts | Akan.js" : "Domain: model.signal.ts | Akan.js";
    const description =
      lang === "ko"
        ? "internal 작업과 endpoint, 그 옵션, 페이지에 데이터를 대는 slice."
        : "Internal tasks, endpoints and their options, and the slices that feed pages.";
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

    const bulletList = "my-4 list-disc space-y-2 pl-5";
    const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

    const classRows = [
      {
        name: ["StoryInternal", "internal()"],
        desc: l.trans({
          en: "Work the server runs by itself: computed fields, schedules, lifecycle hooks, queue jobs.",
          ko: "서버가 스스로 하는 일입니다. 계산 필드, 예약 작업, 시작·종료 hook, queue job이 여기 있습니다.",
        }),
      },
      {
        name: ["StorySlice", "slice()"],
        desc: l.trans({
          en: "Lists a page loads, like `inRoot`. Each one becomes fetch methods and store state.",
          ko: "`inRoot`처럼 페이지가 불러오는 목록입니다. 각각 fetch 메서드와 store 상태가 됩니다.",
        }),
      },
      {
        name: ["StoryEndpoint", "endpoint()"],
        desc: l.trans({
          en: "Calls a client makes: queries, mutations, websocket messages and pubsub rooms.",
          ko: "클라이언트가 하는 호출입니다. query, mutation, websocket message, pubsub room이 있습니다.",
        }),
      },
    ];

    const termRows = [
      {
        name: "guard",
        desc: l.trans({
          en: "A class that decides if a call may run: `Public`, `Every` (any signed-in account), `Admin`.",
          ko: "호출을 실행해도 되는지 정하는 클래스입니다. `Public`, `Every`(로그인한 모든 계정), `Admin` 등이 있습니다.",
        }),
      },
      {
        name: "internal argument",
        desc: l.trans({
          en: "A value the server fills in, not the caller, such as the signed-in user from `.with(Self)`.",
          ko: "호출자가 아니라 서버가 채워 주는 값입니다. `.with(Self)`로 받는 로그인 사용자가 대표적입니다.",
        }),
      },
      {
        name: "refName",
        desc: l.trans({
          en: "The model's camelCase name, like `story`. Routes and fetch method names are built from it.",
          ko: "`story`처럼 camelCase로 쓴 모델 이름입니다. 경로와 fetch 메서드 이름이 여기서 만들어집니다.",
        }),
      },
      {
        name: "MCP",
        desc: l.trans({
          en: "The protocol AI agents use to call your endpoints. Akan serves it at `/mcp`.",
          ko: "AI 에이전트가 endpoint를 호출할 때 쓰는 프로토콜입니다. Akan은 `/mcp`에서 제공합니다.",
        }),
      },
    ];

    const internalBuilders = [
      {
        name: "resolveField(Type)",
        desc: l.trans({
          en: "Computes a `resolve` field of the constant. `exec` gets the parent document first.",
          ko: "constant의 `resolve` 필드 값을 계산합니다. `exec`는 첫 인자로 부모 document를 받습니다.",
        }),
        example: "like: resolveField(Int).exec(...)",
      },
      {
        name: "interval(ms)",
        desc: l.trans({
          en: "Runs every `ms` milliseconds.",
          ko: "`ms` 밀리초마다 실행합니다.",
        }),
        example: "sync: interval(1000 * 60).exec(...)",
      },
      {
        name: "cron(expression)",
        desc: l.trans({
          en: "Runs on a cron schedule, such as every midnight.",
          ko: "매일 자정처럼 cron 표현식이 정한 일정에 실행합니다.",
        }),
        example: 'cleanup: cron("0 0 * * *").exec(...)',
      },
      {
        name: "timeout(ms)",
        desc: l.trans({
          en: "Runs once, `ms` milliseconds after the server starts.",
          ko: "서버가 시작되고 `ms` 밀리초 뒤에 한 번 실행합니다.",
        }),
        example: "warmup: timeout(5000).exec(...)",
      },
      {
        name: ["initialize(options?)", "destroy(options?)"],
        desc: l.trans({
          en: "Runs when the server process starts or stops.",
          ko: "서버 프로세스가 시작하거나 종료할 때 실행합니다.",
        }),
        example: "seed: initialize().exec(...)",
      },
      {
        name: "process(Type)",
        desc: l.trans({
          en: "A background queue job. `.msg()` declares its payload, and a service enqueues it.",
          ko: "백그라운드 queue job입니다. `.msg()`로 payload를 선언하고, service가 queue에 넣습니다.",
        }),
        example: 'archive: process(Boolean).msg("storyId", ID).exec(...)',
      },
    ];

    const scheduleOptions = [
      {
        key: "serverMode",
        type: '"federation" | "batch" | "all"',
        default: '"all"',
        desc: l.trans({
          en: 'Which server roles run it. `"batch"` runs on batch and `"all"` servers, never on federation.',
          ko: '어느 역할의 서버가 실행할지 정합니다. `"batch"`는 batch와 `"all"` 서버에서 실행되고 federation 서버에서는 실행되지 않습니다.',
        }),
      },
      {
        key: "operationMode",
        type: '("cloud" | "edge" | "local")[]',
        default: l.trans({ en: "every mode", ko: "모든 모드" }),
        desc: l.trans({
          en: 'Runs only where `AKAN_PUBLIC_OPERATION_MODE` is in the list, like `["cloud"]`.',
          ko: '`AKAN_PUBLIC_OPERATION_MODE`가 목록에 있을 때만 실행합니다. 예: `["cloud"]`.',
        }),
      },
      {
        key: "lock",
        type: "boolean",
        default: "true",
        desc: l.trans({
          en: "`interval` and `cron` skip a run while the previous one is still running in this process.",
          ko: "이전 실행이 이 프로세스에서 아직 도는 중이면 `interval`과 `cron`은 이번 실행을 건너뜁니다.",
        }),
      },
      {
        key: "enabled",
        type: "boolean",
        default: "true",
        desc: l.trans({
          en: "`false` turns the job off without deleting its code.",
          ko: "`false`면 코드를 지우지 않고 작업을 끕니다.",
        }),
      },
    ];

    const transportColumns = [
      { key: "http", label: "HTTP" },
      { key: "ws", label: "WebSocket" },
    ];
    const overHttp = { http: true, ws: false };
    const overWs = { http: false, ws: true };
    const kindGroups = [
      {
        label: l.trans({ en: "Request and answer", ko: "요청과 응답" }),
        rows: [
          {
            name: "query(Type, options?)",
            desc: l.trans({
              en: "Reads data with a `GET`. The client awaits the answer.",
              ko: "`GET`으로 데이터를 읽습니다. 클라이언트는 응답을 await합니다.",
            }),
            marks: overHttp,
          },
          {
            name: "mutation(Type, options?)",
            desc: l.trans({
              en: "Writes data or runs a business action with a `POST`.",
              ko: "`POST`로 데이터를 쓰거나 비즈니스 동작을 실행합니다.",
            }),
            marks: overHttp,
          },
        ],
      },
      {
        label: l.trans({ en: "Realtime", ko: "실시간" }),
        rows: [
          {
            name: "message(Type, options?)",
            desc: l.trans({
              en: "One message a client sends over the socket. `.msg()` declares its fields.",
              ko: "클라이언트가 소켓으로 보내는 메시지 하나입니다. `.msg()`로 필드를 선언합니다.",
            }),
            marks: overWs,
          },
          {
            name: "pubsub(Type, options?)",
            desc: l.trans({
              en: "A room clients subscribe to and the server publishes into. `.room()` names it.",
              ko: "클라이언트가 구독하고 서버가 publish하는 room입니다. `.room()`으로 room을 정합니다.",
            }),
            marks: overWs,
          },
        ],
      },
    ];

    const argBuilders = [
      {
        name: ".param(name, Type)",
        desc: l.trans({
          en: "A required URL path segment. One scalar or `enumOf`, never a model or an array.",
          ko: "필수 URL 경로 구간입니다. scalar나 `enumOf` 하나만 받고, model이나 배열은 받지 않습니다.",
        }),
        example: '.param("storyId", ID)',
      },
      {
        name: ".search(name, Type)",
        desc: l.trans({
          en: "A query-string value. Always optional, so `exec` may receive `undefined`.",
          ko: "query string 값입니다. 항상 선택 인자라서 `exec`가 `undefined`를 받을 수 있습니다.",
        }),
        example: '.search("title", String)',
      },
      {
        name: ".body(name, Type, options?)",
        desc: l.trans({
          en: "A request-body value of a mutation. A query is sent without a body, so give it `.search()` instead. `{ nullable: true }` makes it optional.",
          ko: "mutation의 요청 body 값입니다. query는 body 없이 보내므로 query에는 `.search()`를 씁니다. `{ nullable: true }`면 선택 인자가 됩니다.",
        }),
        example: '.body("data", cnst.StoryInput)',
      },
      {
        name: ".msg(name, Type, options?)",
        desc: l.trans({
          en: "A payload field of a `message` or of a `process` job.",
          ko: "`message`나 `process` job의 payload 필드입니다.",
        }),
        example: '.msg("roomId", ID)',
      },
      {
        name: ".room(name, Type)",
        desc: l.trans({
          en: "A key that names the pubsub room a client joins.",
          ko: "클라이언트가 들어갈 pubsub room을 정하는 키입니다.",
        }),
        example: '.room("roomId", ID)',
      },
      {
        name: ".with(InternalArg, options?)",
        desc: l.trans({
          en: "A server-supplied value: `Self`, `Me`, `Req`, `Res`, `Ws`, `Ip`, or your own. Missing means 401.",
          ko: "서버가 넣어 주는 값입니다. `Self`, `Me`, `Req`, `Res`, `Ws`, `Ip`나 직접 만든 값을 쓰고, 값이 없으면 401입니다.",
        }),
        example: ".with(Self, { nullable: true })",
      },
    ];

    const clientCalls = [
      {
        name: "storyBySlug: query(…)",
        desc: l.trans({ en: "Resolves to the `Story`.", ko: "`Story` 값을 받습니다." }),
        example: "await fetch.storyBySlug(slug)",
      },
      {
        name: "publishStory: mutation(…)",
        desc: l.trans({
          en: "Resolves to the published `Story`. `.with(Self)` is not a client argument.",
          ko: "발행된 `Story`를 받습니다. `.with(Self)`는 클라이언트가 넘기는 인자가 아닙니다.",
        }),
        example: "await fetch.publishStory(storyId, note)",
      },
      {
        name: "readChat: message(…)",
        desc: l.trans({
          en: "Returns nothing; it only sends. `fetch.listenReadChat(fn)` receives the replies.",
          ko: "보내기만 하고 반환값은 없습니다. 응답은 `fetch.listenReadChat(fn)`으로 받습니다.",
        }),
        example: "fetch.readChat(roomId)",
      },
      {
        name: "chatAdded: pubsub(…)",
        desc: l.trans({
          en: "Returns a function that unsubscribes. `fn` runs on every publish.",
          ko: "구독을 끊는 함수를 받습니다. publish될 때마다 `fn`이 실행됩니다.",
        }),
        example: "fetch.subscribeChatAdded(roomId, fn)",
      },
    ];

    const accessOptions = [
      {
        key: "guards",
        type: "GuardCls[]",
        default: l.trans({ en: "none", ko: "없음" }),
        desc: l.trans({
          en: "Run in order after every middleware; the first refusal answers 403. Without it, nothing is checked.",
          ko: "모든 middleware 뒤에 선언 순서대로 실행되고, 처음 거절한 guard가 403으로 응답합니다. 없으면 아무것도 검사하지 않습니다.",
        }),
      },
      {
        key: "mcp",
        type: "boolean",
        default: "true",
        desc: l.trans({
          en: "`false` keeps it away from AI agents. Guards and HTTP stay exactly the same.",
          ko: "`false`면 AI 에이전트 목록에서만 빠집니다. guard와 HTTP 제공은 그대로입니다.",
        }),
      },
      {
        key: "timeout",
        type: "number (ms)",
        default: l.trans({ en: "client's 30 s", ko: "클라이언트 기본 30초" }),
        desc: l.trans({
          en: "Past it the caller gets `base.error.gatewayTimeout`. The client waits the same budget.",
          ko: "시간이 지나면 호출자는 `base.error.gatewayTimeout`을 받습니다. 클라이언트도 같은 시간만큼 기다립니다.",
        }),
      },
      {
        key: "cache",
        type: "number (ms)",
        default: l.trans({ en: "not cached", ko: "캐시 안 함" }),
        tags: ["query"],
        desc: l.trans({
          en: "Reuses the answer this long. Only for a query with no `.with()`; looked up after the guards pass.",
          ko: "이 시간 동안 응답을 재사용합니다. `.with()`가 없는 query만 쓸 수 있고, guard를 통과한 뒤에 조회합니다.",
        }),
      },
      {
        key: "nullable",
        type: "boolean",
        default: "false",
        desc: l.trans({
          en: "Allows a `null` return. Without it, a handler that returns `null` fails.",
          ko: "`null` 반환을 허용합니다. 없으면 `null`을 반환한 handler는 에러가 됩니다.",
        }),
      },
      {
        key: "middlewares",
        type: "MiddlewareCls[]",
        default: l.trans({ en: "none", ko: "없음" }),
        desc: l.trans({
          en: "Extra middleware for this endpoint only, run after the registered chain.",
          ko: "이 endpoint에만 붙는 middleware입니다. 등록된 체인 뒤에 실행됩니다.",
        }),
      },
    ];

    const routeOptions = [
      {
        key: "method",
        type: '"POST" | "PATCH" | "PUT" | "DELETE"',
        default: '"POST"',
        tags: ["mutation"],
        desc: l.trans({
          en: "The HTTP verb of a mutation. Change it only when a foreign protocol requires another.",
          ko: "mutation의 HTTP 메서드입니다. 외부 프로토콜이 다른 메서드를 요구할 때만 바꿉니다.",
        }),
      },
      {
        key: "path",
        type: "string",
        default: l.trans({ en: "the endpoint key", ko: "endpoint 키" }),
        desc: l.trans({
          en: "A fixed route instead of the key. A trailing `*` matches the rest of the path.",
          ko: "키 대신 쓰는 고정 경로입니다. 끝의 `*`는 나머지 경로 전체와 맞습니다.",
        }),
      },
      {
        key: "prefix",
        type: "false | string",
        default: l.trans({ en: "the model refName", ko: "모델 refName" }),
        desc: l.trans({
          en: "Replaces the model segment in front of the path, or drops it with `false`.",
          ko: "경로 앞의 모델 구간을 다른 문자열로 바꾸거나, `false`로 없앱니다.",
        }),
      },
      {
        key: "globalPrefix",
        type: "false",
        default: l.trans({ en: "the API prefix", ko: "API prefix" }),
        desc: l.trans({
          en: "`false` drops the API prefix too. With `prefix: false`, the route sits at the site root.",
          ko: "`false`면 API prefix도 뺍니다. `prefix: false`와 함께 쓰면 사이트 루트에 경로가 생깁니다.",
        }),
      },
      {
        key: "fileUpload",
        type: "boolean",
        default: "false",
        tags: ["mutation"],
        desc: l.trans({
          en: "Marks the mutation the generated upload action calls. The shared `file` module already has one.",
          ko: "생성된 업로드 action이 호출할 mutation임을 표시합니다. shared의 `file` 모듈에 이미 있습니다.",
        }),
      },
      {
        key: "backpressure",
        type: '"coalesce" | "queue"',
        default: '"coalesce"',
        tags: ["pubsub(Binary)"],
        desc: l.trans({
          en: "When a subscriber falls behind: keep only the newest frame, or queue every frame.",
          ko: "구독자가 따라오지 못할 때 최신 frame만 남길지, 모든 frame을 쌓을지 정합니다.",
        }),
      },
    ];

    const argKindColumns = [
      { key: "kind", label: l.trans({ en: "Kind", ko: "종류" }) },
      { key: "example", label: l.trans({ en: "Example", ko: "예" }), code: true },
      { key: "note", label: l.trans({ en: "Note", ko: "참고" }) },
    ];
    const argKindRows = [
      {
        kind: l.trans({ en: "Scalar", ko: "scalar" }),
        example: "ID · String · Int · Float · Boolean · Date",
        note: l.trans({
          en: "From `akanjs/base`; `String`, `Boolean` and `Date` are the JS globals.",
          ko: "`akanjs/base`에서 import합니다. `String`, `Boolean`, `Date`는 JS 전역을 그대로 씁니다.",
        }),
      },
      {
        kind: l.trans({ en: "Model", ko: "모델" }),
        example: "cnst.StoryInput",
        note: l.trans({
          en: "A class from the module's constant, usually the `Input`.",
          ko: "모듈 constant의 클래스입니다. 보통 `Input`을 씁니다.",
        }),
      },
      {
        kind: "enumOf",
        example: "cnst.StoryStatus",
        note: l.trans({
          en: "A value outside its list is refused.",
          ko: "목록에 없는 값은 거절됩니다.",
        }),
      },
      {
        kind: l.trans({ en: "Array", ko: "배열" }),
        example: "[ID] · [cnst.StoryInput]",
        note: l.trans({
          en: "Any of the above in `[ ]`. Not allowed in `.param`.",
          ko: "위의 것을 `[ ]`로 감쌉니다. `.param`에는 쓸 수 없습니다.",
        }),
      },
    ];

    const guardKeyColumns = [
      { key: "get", label: "get", code: true },
      { key: "cru", label: "cru", code: true },
    ];
    const byGet = { get: true, cru: false };
    const byCru = { get: false, cru: true };
    const modelApiGroups = [
      {
        label: l.trans({ en: "Read", ko: "읽기" }),
        rows: [
          {
            name: "<model>(id)",
            desc: l.trans({ en: "Loads the full model.", ko: "full 모델을 불러옵니다." }),
            marks: byGet,
          },
          {
            name: "light<Model>(id)",
            desc: l.trans({ en: "Loads the Light model.", ko: "Light 모델을 불러옵니다." }),
            marks: byGet,
          },
          {
            name: "view<Model>(id)",
            desc: l.trans({
              en: "Data for a detail page. Destructure it for one promise per field, or await it whole.",
              ko: "상세 화면용 데이터입니다. 구조 분해하면 필드별 promise, await하면 한꺼번에 받습니다.",
            }),
            marks: byGet,
          },
          {
            name: "edit<Model>(id)",
            desc: l.trans({
              en: "Data for an edit form, shaped like `view<Model>`. Exists only with a create, update or remove guard.",
              ko: "수정 폼용 데이터로, `view<Model>`과 같은 handle 형태입니다. create·update·remove guard가 있을 때만 생깁니다.",
            }),
            marks: byGet,
          },
        ],
      },
      {
        label: l.trans({ en: "Write", ko: "쓰기" }),
        rows: [
          {
            name: "create<Model>(data)",
            desc: l.trans({ en: "Creates one from an input.", ko: "input으로 하나를 만듭니다." }),
            marks: byCru,
          },
          {
            name: "update<Model>(id, data)",
            desc: l.trans({ en: "Updates one by id.", ko: "id로 하나를 수정합니다." }),
            marks: byCru,
          },
          {
            name: "merge<Model>(modelOrId, data)",
            desc: l.trans({
              en: "Calls `update<Model>` with only the fields you pass. Takes the model or its id.",
              ko: "넘긴 필드만으로 `update<Model>`을 호출합니다. 모델이나 id를 받습니다.",
            }),
            marks: byCru,
          },
          {
            name: "remove<Model>(id)",
            desc: l.trans({
              en: "Removes one. Removal is always soft.",
              ko: "하나를 삭제합니다. 삭제는 항상 soft delete입니다.",
            }),
            marks: byCru,
          },
        ],
      },
    ];

    const sliceMethods = [
      {
        name: "<model>List<Suffix>(...args, skip, limit, sort)",
        desc: l.trans({
          en: "One page of the list.",
          ko: "목록의 한 페이지를 불러옵니다.",
        }),
        example: 'await fetch.storyListInRoot(rootId, 0, 20, "latest")',
      },
      {
        name: "<model>Insight<Suffix>(...args)",
        desc: l.trans({
          en: "The aggregate numbers for the same query.",
          ko: "같은 query의 집계 값을 불러옵니다.",
        }),
        example: "await fetch.storyInsightInRoot(rootId)",
      },
      {
        name: "init<Model><Suffix>(...args, option?)",
        desc: l.trans({
          en: "List and insight together, as one promise per field. Hand `storyInitInRoot` to a Zone.",
          ko: "목록과 insight를 필드별 promise로 한 번에 받습니다. `storyInitInRoot`는 Zone에 넘깁니다.",
        }),
        example: "const { storyInitInRoot } = fetch.initStoryInRoot(rootId)",
      },
      {
        name: "get<Model>Init<Suffix>(...args, option?)",
        desc: l.trans({
          en: "The same init data as one awaited object.",
          ko: "같은 init 데이터를 await한 객체 하나로 받습니다.",
        }),
        example: "const storyInit = await fetch.getStoryInitInRoot(rootId)",
      },
      {
        name: "init<Model>(queryKey?, args?)",
        desc: l.trans({
          en: "The root slice. `queryKey` names a model filter (none means `any`), `args` its arguments.",
          ko: "root slice입니다. `queryKey`는 모델의 filter 이름(없으면 `any`), `args`는 그 인자입니다.",
        }),
        example: 'const { storyInit } = fetch.initStory("byOwner", [ownerId])',
      },
    ];

    const agentColumns = [
      { key: "client", label: l.trans({ en: "Client", ko: "클라이언트" }), caption: "fetch.*" },
      { key: "agent", label: l.trans({ en: "AI agent", ko: "AI 에이전트" }), caption: "/mcp" },
    ];
    const published = { client: true, agent: true };
    const clientOnly = { client: true, agent: false };
    const agentGroups = [
      {
        label: l.trans({ en: "Published to agents", ko: "에이전트에게 공개" }),
        rows: [
          {
            name: "query · guards: [Public]",
            desc: l.trans({
              en: "Any guard is a decision, `Public` included, so a read publishes.",
              ko: "`Public`도 guard이므로, 읽기는 공개됩니다.",
            }),
            marks: published,
          },
          {
            name: "mutation · guards: [Every]",
            desc: l.trans({
              en: "A write with a real guard publishes.",
              ko: "실질 guard가 있는 쓰기는 공개됩니다.",
            }),
            marks: published,
          },
        ],
      },
      {
        label: l.trans({ en: "Served, but hidden from agents", ko: "제공되지만 에이전트에게는 숨김" }),
        rows: [
          {
            name: <span className="font-sans">{l.trans({ en: "no guards", ko: "guard 없음" })}</span>,
            desc: l.trans({
              en: "Anyone can call it, and no agent can see it.",
              ko: "누구나 호출할 수 있고, 에이전트는 볼 수 없습니다.",
            }),
            marks: clientOnly,
          },
          {
            name: "mutation · guards: [Public]",
            desc: l.trans({
              en: "`Public` alone on a write counts as no guard.",
              ko: "쓰기에 `Public`만 달면 guard가 없는 것으로 봅니다.",
            }),
            marks: clientOnly,
          },
          {
            name: "mcp: false",
            desc: l.trans({
              en: "Taken off the agent shelf on purpose. Guards are unchanged.",
              ko: "일부러 에이전트 목록에서 뺀 것입니다. guard는 그대로입니다.",
            }),
            marks: clientOnly,
          },
          {
            name: "guards: [Every, Person]",
            desc: l.trans({
              en: "`Person` reserves the act for a human.",
              ko: "`Person`은 사람만 할 수 있는 동작으로 묶습니다.",
            }),
            marks: clientOnly,
          },
          {
            name: "message · pubsub",
            desc: l.trans({
              en: "They ride the websocket, which an MCP call does not have.",
              ko: "websocket으로 동작하므로, MCP 호출에는 쓸 수 없습니다.",
            }),
            marks: clientOnly,
          },
          {
            name: "Any · Binary · Upload",
            desc: l.trans({
              en: "A return typed `Any` or `Binary`, or a file upload, cannot be described to a model.",
              ko: "`Any`나 `Binary` 반환, 파일 업로드는 모델에게 설명할 수 없습니다.",
            }),
            marks: clientOnly,
          },
        ],
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="signal-overview" title="model.signal.ts">
          <Docs.Title>model.signal.ts</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>model.signal.ts</code> is the door to a module. It decides what a client can call, which lists
                    a page can load, and what the server runs on its own.
                  </span>
                ),
                ko: (
                  <span>
                    <code>model.signal.ts</code>는 모듈의 출입문입니다. 클라이언트가 무엇을 호출할 수 있는지, 페이지가
                    어떤 목록을 불러올지, 서버가 스스로 무엇을 실행할지를 이 파일이 정합니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "You open it when a page needs a new call or list, or the server needs a scheduled job. The logic stays in the service; handlers here only call it.",
                ko: "페이지에 새 호출이나 목록이 필요할 때, 또는 서버에 예약 작업이 필요할 때 이 파일을 엽니다. 로직은 service에 두고, 여기 handler는 service를 호출하기만 합니다.",
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Class", ko: "클래스" })} items={classRows} />

            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />

            <Docs.SubSubTitle>{l.trans({ en: "The skeleton", ko: "기본 뼈대" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "Every signal file declares the three classes in this order, even when one is empty:",
                ko: "모든 signal 파일은 세 클래스를 이 순서로 선언합니다. 비어 있어도 마찬가지입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/blog/lib/story/story.signal.ts"
              code={`import { Admin } from "@libs/shared/srvkit";
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class StoryInternal extends internal(srv.story, () => ({})) {}

export class StorySlice extends slice(srv.story, { guards: { root: Admin, get: Public, cru: Admin } }, () => ({})) {}

export class StoryEndpoint extends endpoint(srv.story, ({ query }) => ({
  featuredStory: query(cnst.Story, { guards: [Public] }).exec(async function () {
    return await this.storyService.getFeaturedStory();
  }),
})) {}`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>this</code> holds the services.
                      </strong>{" "}
                      Inside <code>exec</code>, <code>this.storyService</code> is the module's service, and{" "}
                      <code>srv.story.with(srv.actionLog)</code> adds <code>this.actionLogService</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>this</code>에 service가 있습니다.
                      </strong>{" "}
                      <code>exec</code> 안의 <code>this.storyService</code>가 이 모듈의 service이고,{" "}
                      <code>srv.story.with(srv.actionLog)</code>로 <code>this.actionLogService</code>를 더합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>exec</code> is one line.
                      </strong>{" "}
                      It calls one service method and returns the result; loading and deciding happen in the service.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>exec</code>는 한 줄입니다.
                      </strong>{" "}
                      service 메서드 하나를 불러 결과를 돌려줄 뿐이고, 조회와 판단은 service에서 합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Barrels come in as values.</strong> A signal imports <code>* as cnst</code> and{" "}
                      <code>* as srv</code> with a plain <code>import</code>, not <code>import type</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>barrel은 값으로 import합니다.</strong> signal은 <code>* as cnst</code>와{" "}
                      <code>* as srv</code>를 <code>import type</code>이 아닌 일반 <code>import</code>로 가져옵니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Every slice and every custom endpoint names its guards.</strong> <code>slice()</code> takes{" "}
                    <code>{"{ guards: { root: Admin, … } }"}</code>, and each custom endpoint its own{" "}
                    <code>{"guards: [...]"}</code>. The guards also decide what AI agents see: an endpoint with none is
                    open to anyone and hidden from agents.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>모든 slice와 custom endpoint는 guard를 직접 적습니다.</strong> <code>slice()</code>는{" "}
                    <code>{"{ guards: { root: Admin, … } }"}</code>를, custom endpoint는 각자{" "}
                    <code>{"guards: [...]"}</code>를 받습니다. guard는 AI 에이전트에게 보일지도 정합니다. guard가 없는
                    endpoint는 누구나 호출할 수 있고, 에이전트에게는 보이지 않습니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="signal-extension"
          title={l.trans({ en: "Extending A Library Model", ko: "라이브러리 모델 확장하기" })}
        >
          <Docs.Title>{l.trans({ en: "Extending A Library Model", ko: "라이브러리 모델 확장하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    An app can add its own <code>user</code> module on top of the one in <code>libs/shared</code>. Pass
                    the library's classes as the last arguments and write only what your app adds.
                  </span>
                ),
                ko: (
                  <span>
                    앱은 <code>libs/shared</code>의 <code>user</code> 모듈 위에 자기 <code>user</code> 모듈을 얹을 수
                    있습니다. 라이브러리 클래스를 마지막 인자로 넘기고, 앱이 더할 것만 적습니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>../__lib/lib.signal</code> exports the library's classes for each model:
                  </span>
                ),
                ko: (
                  <span>
                    <code>../__lib/lib.signal</code>이 모델별로 라이브러리 클래스를 모아 export합니다:
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/blog/lib/user/user.signal.ts"
            code={`import { Admin, SelfOrAdmin } from "@libs/shared/srvkit";
import { endpoint, internal, Public, slice } from "akanjs/signal";

import { user } from "../__lib/lib.signal";
import * as srv from "../srv";

export class UserInternal extends internal(srv.user, () => ({}), ...user.internals) {}

export class UserSlice extends slice(
  srv.user,
  { guards: { root: Admin, get: Public, cru: SelfOrAdmin } },
  () => ({}),
  ...user.slices,
) {}

export class UserEndpoint extends endpoint(
  srv.user,
  ({ query }) => ({
    authCallback: query(String, { guards: [Public] }).search("code", String).exec(async function (code) {
      return await this.userService.authCallback(code);
    }),
  }),
  ...user.endpoints,
) {}`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Spread them last.</strong> <code>internal()</code>, <code>slice()</code> and{" "}
                      <code>endpoint()</code> each take any number of library classes after the builder.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>마지막에 spread합니다.</strong> <code>internal()</code>, <code>slice()</code>,{" "}
                      <code>endpoint()</code>는 빌더 함수 뒤에 라이브러리 클래스를 몇 개든 받습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The library wins a name clash.</strong> Writing a key the library already declares does
                      not replace it, so give yours a new name.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>이름이 겹치면 라이브러리가 이깁니다.</strong> 라이브러리에 이미 있는 키를 적어도 교체되지
                      않으니, 새 이름을 붙이세요.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Their services come along.</strong> The library's services are on <code>this</code> beside
                      yours.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>service도 함께 옵니다.</strong> 라이브러리의 service도 내 service와 나란히{" "}
                      <code>this</code>
                      에서 쓸 수 있습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="internal-signal"
          title={l.trans({ en: "Defining Internal Tasks", ko: "internal 작업 정의하기" })}
        >
          <Docs.Title>{l.trans({ en: "Defining Internal Tasks", ko: "internal 작업 정의하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>internal()</code> holds work no client calls. The server runs it on a schedule, at startup or
                    shutdown, for a queued job, or when a computed field is read.
                  </span>
                ),
                ko: (
                  <span>
                    <code>internal()</code>에는 클라이언트가 호출하지 않는 일을 둡니다. 서버가 일정에 맞춰, 시작·종료할
                    때, queue에 job이 들어올 때, 계산 필드를 읽을 때 실행합니다.
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Builder", ko: "빌더" })} items={internalBuilders} />
            <div>
              {l.trans({
                en: "A computed like count and a nightly cleanup look like this:",
                ko: "좋아요 수를 계산하는 필드와 매일 밤 도는 정리 작업은 이렇게 씁니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/blog/lib/story/story.signal.ts"
            code={`export class StoryInternal extends internal(srv.story.with(srv.actionLog), ({ resolveField, cron }) => ({
  like: resolveField(Int)
    .with(Self, { nullable: true })
    .exec(async function (story, self) {
      if (!self) return 0;
      return await this.actionLogService.getLike(story.id, self.id);
    }),
  cleanup: cron("0 0 * * *", { serverMode: "batch" }).exec(async function () {
    await this.storyService.cleanup();
  }),
})) {}`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The constant declares the field.</strong> <code>like</code> must exist in the model's{" "}
                      <code>{"via(…, (resolve) => ({ like: resolve(Int) }))"}</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>필드는 constant에 선언합니다.</strong> <code>like</code>는 모델의{" "}
                      <code>{"via(…, (resolve) => ({ like: resolve(Int) }))"}</code>에 있어야 합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Schedules return nothing.</strong> Only <code>resolveField</code> and <code>process</code>{" "}
                      handlers return a value; the others return <code>void</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>예약 작업은 값을 반환하지 않습니다.</strong> 값을 반환하는 handler는{" "}
                      <code>resolveField</code>와 <code>process</code>뿐이고, 나머지는 <code>void</code>입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        A service enqueues a <code>process</code> job.
                      </strong>{" "}
                      It injects <code>{"storySignal: signal<sig.Story>()"}</code> and calls{" "}
                      <code>this.storySignal.archive(storyId)</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>process</code> job은 service가 queue에 넣습니다.
                      </strong>{" "}
                      <code>{"storySignal: signal<sig.Story>()"}</code>를 주입하고{" "}
                      <code>this.storySignal.archive(storyId)</code>를 호출합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>{l.trans({ en: "Schedule options", ko: "예약 작업 옵션" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    Every builder except <code>resolveField</code> takes these in its last argument:
                  </span>
                ),
                ko: (
                  <span>
                    <code>resolveField</code>를 뺀 모든 빌더는 마지막 인자로 이 옵션을 받습니다:
                  </span>
                ),
              })}
            </div>
            <Docs.OptionTable items={scheduleOptions} />
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>lock</code> does not coordinate servers.
                    </strong>{" "}
                    It only skips an overlapping run inside one process. Every server whose role matches runs its own
                    copy, so give a job that must run once <code>serverMode: "batch"</code> and run only one server that
                    takes batch work.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>lock</code>은 서버 사이를 조율하지 않습니다.
                    </strong>{" "}
                    한 프로세스 안에서 겹치는 실행만 건너뜁니다. 역할이 맞는 서버는 각자 자기 사본을 실행하므로, 한 번만
                    돌아야 하는 작업은 <code>serverMode: "batch"</code>로 두고 batch 작업을 맡는 서버를 하나만 띄웁니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="endpoint-signal"
          title={l.trans({ en: "Defining APIs With endpoint()", ko: "endpoint()로 API 정의하기" })}
        >
          <Docs.Title>{l.trans({ en: "Defining APIs With endpoint()", ko: "endpoint()로 API 정의하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>endpoint()</code> holds what a client can call. Choose the kind by what the call does, then
                    describe each argument with a builder.
                  </span>
                ),
                ko: (
                  <span>
                    <code>endpoint()</code>에는 클라이언트가 호출할 수 있는 것을 둡니다. 호출이 하는 일에 맞춰 종류를
                    고르고, 인자는 빌더로 하나씩 적습니다.
                  </span>
                ),
              })}
            </div>

            <Docs.SubSubTitle>{l.trans({ en: "Four kinds", ko: "네 가지 종류" })}</Docs.SubSubTitle>
            <Docs.Matrix
              type={l.trans({ en: "Kind", ko: "종류" })}
              columns={transportColumns}
              groups={kindGroups}
              markLabel={l.trans({ en: "Travels over this", ko: "이 통로로 전달" })}
              emptyLabel={l.trans({ en: "Not this", ko: "해당 없음" })}
            />

            <Docs.SubSubTitle>{l.trans({ en: "Argument builders", ko: "인자 빌더" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    Each builder says where one argument comes from. <code>exec</code> receives them in the order you
                    declare them, then the <code>.with()</code> values:
                  </span>
                ),
                ko: (
                  <span>
                    빌더는 인자 하나가 어디서 오는지 정합니다. <code>exec</code>는 선언한 순서대로 인자를 받고, 그 뒤에{" "}
                    <code>.with()</code> 값을 받습니다:
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Builder", ko: "빌더" })} items={argBuilders} />
            <div>
              {l.trans({
                en: (
                  <span>
                    Optional arguments go last: a required <code>.param</code>, <code>.msg</code> or <code>.room</code>{" "}
                    cannot come after a <code>.search</code> or a nullable argument.
                  </span>
                ),
                ko: (
                  <span>
                    선택 인자는 맨 뒤에 둡니다. 필수인 <code>.param</code>, <code>.msg</code>, <code>.room</code>은{" "}
                    <code>.search</code>나 nullable 인자 뒤에 올 수 없습니다.
                  </span>
                ),
              })}
            </div>

            <Docs.SubSubTitle>{l.trans({ en: "Query and mutation", ko: "query와 mutation" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "A read anyone may make, and a write only a signed-in account may make:",
                ko: "누구나 할 수 있는 읽기와, 로그인한 계정만 할 수 있는 쓰기입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/blog/lib/story/story.signal.ts"
              code={`export class StoryEndpoint extends endpoint(srv.story, ({ query, mutation }) => ({
  storyBySlug: query(cnst.Story, { guards: [Public] })
    .param("slug", String)
    .exec(async function (slug) {
      return await this.storyService.getStoryBySlug(slug);
    }),
  publishStory: mutation(cnst.Story, { guards: [Every] })
    .param("storyId", ID)
    .body("note", String, { nullable: true })
    .with(Self)
    .exec(async function (storyId, note, self) {
      return await this.storyService.publishStory(storyId, self.id, note);
    }),
})) {}`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Pick a name no generated API uses.</strong> Every <code>story</code> module already has{" "}
                      <code>story</code> and <code>createStory</code>, so a custom endpoint needs its own name, like{" "}
                      <code>storyBySlug</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>생성되는 API와 겹치지 않는 이름을 고릅니다.</strong> <code>story</code> 모듈에는 이미{" "}
                      <code>story</code>와 <code>createStory</code>가 있으니, custom endpoint는 <code>storyBySlug</code>
                      처럼 자기 이름을 씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Take the caller from <code>.with(Self)</code>.
                      </strong>{" "}
                      Never trust a user id the client sends; the service checks ownership again.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        호출자는 <code>.with(Self)</code>로 받습니다.
                      </strong>{" "}
                      클라이언트가 보낸 사용자 id는 믿지 않고, service에서 소유권을 한 번 더 확인합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>{l.trans({ en: "Message and pubsub", ko: "message와 pubsub" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "A websocket message, and the room that tells everyone in it about a new chat:",
                ko: "websocket 메시지 하나와, 새 채팅을 room 안의 모두에게 알리는 pubsub입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/blog/lib/chatRoom/chatRoom.signal.ts"
              code={`export class ChatRoomEndpoint extends endpoint(srv.chatRoom, ({ message, pubsub }) => ({
  readChat: message(Boolean, { guards: [Every] })
    .msg("roomId", ID)
    .with(Self)
    .exec(async function (roomId, self) {
      return await this.chatRoomService.read(roomId, self.id);
    }),
  chatAdded: pubsub(cnst.Chat, { guards: [Every] })
    .room("roomId", ID)
    .exec(async function () {}),
})) {}`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The service publishes.</strong> It injects{" "}
                      <code>{"chatRoomSignal: signal<sig.ChatRoom>()"}</code> and calls{" "}
                      <code>this.chatRoomSignal.chatAdded(roomId, chat)</code>. A pubsub's own <code>exec</code> runs
                      when a client subscribes.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>publish는 service가 합니다.</strong>{" "}
                      <code>{"chatRoomSignal: signal<sig.ChatRoom>()"}</code>를 주입하고{" "}
                      <code>this.chatRoomSignal.chatAdded(roomId, chat)</code>를 호출합니다. pubsub의 <code>exec</code>
                      는 클라이언트가 구독할 때 실행됩니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Guards go on the endpoint itself.</strong> A slice's guards map never reaches a message or
                      a pubsub, so without its own <code>guards</code> anyone can send or subscribe.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>guard는 endpoint에 직접 답니다.</strong> slice의 guards map은 message와 pubsub에 닿지
                      않으므로, 자기 <code>guards</code>가 없으면 누구나 보내고 구독할 수 있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Rooms are re-checked.</strong> A message runs its guards on every send. A subscribed room
                      runs them again when the socket's credential changes, and drops the subscription if they fail.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>room은 다시 검사됩니다.</strong> message는 보낼 때마다 guard를 실행합니다. 구독 중인
                      room은 소켓의 인증 정보가 바뀌면 guard를 다시 실행하고, 통과하지 못하면 구독을 끊습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>{l.trans({ en: "Serving a fixed path", ko: "고정 경로로 제공하기" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    Some files must live at a fixed address, like <code>/sitemap.xml</code>. The <code>path</code>,{" "}
                    <code>prefix</code> and <code>globalPrefix</code> options move an endpoint there:
                  </span>
                ),
                ko: (
                  <span>
                    <code>/sitemap.xml</code>처럼 정해진 주소에 있어야 하는 파일이 있습니다. <code>path</code>,{" "}
                    <code>prefix</code>, <code>globalPrefix</code> 옵션으로 endpoint를 그 주소로 옮깁니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/blog/lib/story/story.signal.ts"
              code={`export class StoryEndpoint extends endpoint(srv.story, ({ query }) => ({
  sitemapXml: query(Any, {
    guards: [Public],
    path: "sitemap.xml",
    prefix: false,
    globalPrefix: false,
  }).exec(async function () {
    const xml = await this.storyService.renderSitemap();
    return new Response(xml, { headers: { "Content-Type": "application/xml" } });
  }),
})) {}`}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Where it lands.</strong> <code>prefix: false</code> drops the <code>/story</code> segment
                      and <code>globalPrefix: false</code> the API prefix, so it answers at <code>/sitemap.xml</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>도착하는 주소.</strong> <code>prefix: false</code>가 <code>/story</code> 구간을,{" "}
                      <code>globalPrefix: false</code>가 API prefix를 빼므로 <code>/sitemap.xml</code>에서 응답합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Return a <code>Response</code>
                      </strong>{" "}
                      to set your own body and headers. It is sent as it is.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>Response</code>를 반환하면
                      </strong>{" "}
                      body와 header를 직접 정할 수 있습니다. 그대로 전송됩니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>
              {l.trans({ en: "Calling them from the client", ko: "클라이언트에서 호출하기" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    Each endpoint becomes a <code>fetch</code> method named after its key. A page awaits queries
                    directly; in the browser, call them from a store action.
                  </span>
                ),
                ko: (
                  <span>
                    endpoint마다 키 이름을 딴 <code>fetch</code> 메서드가 생깁니다. page는 query를 바로 await하고,
                    브라우저에서는 store action에서 호출합니다.
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "Declared", ko: "선언" })}
              descLabel={l.trans({ en: "What the client gets", ko: "클라이언트가 받는 것" })}
              items={clientCalls}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="endpoint-options" title={l.trans({ en: "The Options Object", ko: "옵션 객체" })}>
          <Docs.Title>{l.trans({ en: "The Options Object", ko: "옵션 객체" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    The second argument of <code>query</code>, <code>mutation</code>, <code>message</code> and{" "}
                    <code>pubsub</code> is the same options object. Most of it decides what happens before your handler
                    runs.
                  </span>
                ),
                ko: (
                  <span>
                    <code>query</code>, <code>mutation</code>, <code>message</code>, <code>pubsub</code>의 두 번째
                    인자는 모두 같은 옵션 객체입니다. 대부분은 handler가 실행되기 전에 일어날 일을 정합니다.
                  </span>
                ),
              })}
            </div>
            <Docs.Flow
              title={l.trans({ en: "What runs before exec", ko: "exec 앞에서 도는 것" })}
              direction="TB"
              nodes={{
                call: { label: "fetch.publishStory(storyId)" },
                logging: {
                  label: "Logging",
                  lines: [l.trans({ en: "errors, and every call at debug", ko: "에러, debug면 모든 호출" })],
                },
                timeout: {
                  label: "Timeout",
                  lines: [l.trans({ en: "the endpoint's own timeout ms", ko: "endpoint가 선언한 timeout ms" })],
                },
                account: {
                  label: "AccountMiddleware",
                  lines: [l.trans({ en: "and any the app registered", ko: "앱이 등록한 middleware도" })],
                },
                guards: { label: "guards", lines: [l.trans({ en: "in declaration order", ko: "선언 순서대로" })] },
                internal: {
                  label: l.trans({ en: "Internal arguments", ko: "internal 인자" }),
                  lines: [".with(Self) · .with(Me)"],
                },
                cache: {
                  label: l.trans({ en: "cache lookup", ko: "캐시 조회" }),
                  lines: [
                    l.trans({ en: "a query with no internal argument only", ko: "internal 인자가 없는 query만" }),
                  ],
                },
                handler: { label: "exec() handler" },
                resolve: {
                  label: "resolveReturn",
                  lines: [l.trans({ en: "hidden and secret fields masked", ko: "hidden·secret 필드 마스킹" })],
                },
                denied: { label: "403 Forbidden", tone: "danger" },
                gateway: {
                  label: "gatewayTimeout",
                  lines: [l.trans({ en: "the handler keeps running", ko: "handler는 계속 실행됩니다" })],
                  tone: "danger",
                },
                hit: {
                  label: l.trans({ en: "stored result", ko: "저장된 결과" }),
                  lines: [l.trans({ en: "only after the guards passed", ko: "guard를 통과한 뒤에만" })],
                  tone: "muted",
                },
              }}
              edges={[
                ["call", "logging"],
                ["logging", "timeout"],
                ["timeout", "account"],
                ["account", "guards"],
                ["guards", "internal"],
                ["internal", "cache"],
                ["cache", "handler"],
                ["handler", "resolve"],
                ["guards", "denied", { label: l.trans({ en: "first false", ko: "첫 false" }), dashed: true }],
                ["timeout", "gateway", { label: l.trans({ en: "budget spent", ko: "시간 초과" }), dashed: true }],
                ["cache", "hit", { label: "hit", dashed: true }],
                ["hit", "resolve", { dashed: true }],
              ]}
              emphasis={["guards"]}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Nothing to pay until declared.</strong> Logging and Timeout are always registered, but
                      Timeout steps aside for an endpoint with no <code>timeout</code>, and the cache lookup for one
                      with no <code>cache</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>선언하기 전에는 비용이 없습니다.</strong> Logging과 Timeout은 항상 등록되어 있지만,{" "}
                      <code>timeout</code>을 선언하지 않은 endpoint에서 Timeout은 비켜서고, <code>cache</code>를
                      선언하지 않으면 캐시 조회도 건너뜁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A timeout answers, it does not cancel.</strong> The caller gets{" "}
                      <code>base.error.gatewayTimeout</code>, while the handler still runs to the end.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>timeout은 응답할 뿐, 취소하지 않습니다.</strong> 호출자는{" "}
                      <code>base.error.gatewayTimeout</code>을 받지만, handler는 끝까지 실행됩니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>{l.trans({ en: "Access and caching", ko: "접근과 캐시" })}</Docs.SubSubTitle>
            <Docs.OptionTable items={accessOptions} />

            <Docs.SubSubTitle>{l.trans({ en: "Routing and transport", ko: "경로와 전송" })}</Docs.SubSubTitle>
            <Docs.OptionTable items={routeOptions} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="argument-types"
          title={l.trans({ en: "What An Argument May Be", ko: "인자로 쓸 수 있는 타입" })}
        >
          <Docs.Title>{l.trans({ en: "What An Argument May Be", ko: "인자로 쓸 수 있는 타입" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Every argument builder takes the same four kinds of type:",
                ko: "모든 인자 빌더는 같은 네 종류의 타입을 받습니다:",
              })}
            </div>
            <Docs.Table columns={argKindColumns} rows={argKindRows} stacked />
            <div>
              {l.trans({
                en: "Three mistakes are worth knowing up front, because two of them are not type errors:",
                ko: "실수 세 가지는 미리 알아 두세요. 그중 둘은 타입 에러로 잡히지 않습니다:",
              })}
            </div>
            <div className={cardGridRecipe({ cols: "three" }, "my-4")}>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "Int or Float, never Number", ko: "Number가 아니라 Int나 Float" })}
                </div>
                <code className={chip}>{'.body("count", Int)'}</code>
                <div className="mt-2 text-foreground/70 text-sm">
                  {l.trans({
                    en: (
                      <span>
                        A count is <code>Int</code> and a price is <code>Float</code>. <code>Number</code> does not
                        typecheck.
                      </span>
                    ),
                    ko: (
                      <span>
                        개수는 <code>Int</code>, 가격은 <code>Float</code>입니다. <code>Number</code>는 타입 검사를
                        통과하지 못합니다.
                      </span>
                    ),
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "Upload is a body, never a field", ko: "Upload는 body이지 필드가 아닙니다" })}
                </div>
                <code className={chip}>{'.body("files", [Upload])'}</code>
                <div className="mt-2 text-foreground/70 text-sm">
                  {l.trans({
                    en: (
                      <span>
                        An <code>Upload</code> body switches the request to multipart, and the mutation that owns
                        uploads declares <code>fileUpload: true</code>. A model points at the <code>File</code> model
                        instead.
                      </span>
                    ),
                    ko: (
                      <span>
                        <code>Upload</code> body가 있으면 요청이 multipart로 바뀌고, 업로드를 맡은 mutation은{" "}
                        <code>fileUpload: true</code>를 선언합니다. 모델은 대신 <code>File</code> 모델을 참조합니다.
                      </span>
                    ),
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "Bytes are Binary, never Any", ko: "바이트는 Any가 아니라 Binary" })}
                </div>
                <code className={chip}>{'.body("frame", Binary)'}</code>
                <div className="mt-2 text-foreground/70 text-sm">
                  {l.trans({
                    en: (
                      <span>
                        <code>Binary</code> is a <code>Uint8Array</code> on both sides and accepts base64, so it fits
                        JSON and websocket frames. <code>Any</code> turns a <code>Buffer</code> into a{" "}
                        <code>{"{ type, data }"}</code> object that never comes back: 3.6x the size, and it only breaks
                        at the first byte read.
                      </span>
                    ),
                    ko: (
                      <span>
                        <code>Binary</code>는 양쪽 모두 <code>Uint8Array</code>이고 base64도 받으므로 JSON과 websocket
                        frame에 모두 맞습니다. <code>Any</code>는 <code>Buffer</code>를 되돌릴 수 없는{" "}
                        <code>{"{ type, data }"}</code> 객체로 바꿔 크기가 3.6배가 되고, 첫 바이트를 읽을 때에야
                        깨집니다.
                      </span>
                    ),
                  })}
                </div>
              </div>
            </div>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>Binary</code> is not storable.
                    </strong>{" "}
                    Bytes a model keeps are a relation to the <code>File</code> model, never <code>field(Binary)</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>Binary</code>는 저장할 수 없습니다.
                    </strong>{" "}
                    모델이 보관할 바이트는 <code>field(Binary)</code>가 아니라 <code>File</code> 모델과의 관계로 둡니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="standard-signal"
          title={l.trans({ en: "Generated Model APIs", ko: "자동으로 생기는 모델 API" })}
        >
          <Docs.Title>{l.trans({ en: "Generated Model APIs", ko: "자동으로 생기는 모델 API" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Every database module gets these fetch methods without an endpoint. Write a custom endpoint only when a business action needs its own name.",
                ko: "모든 database 모듈은 endpoint를 쓰지 않아도 아래 fetch 메서드를 받습니다. custom endpoint는 비즈니스 동작에 고유한 이름이 필요할 때만 씁니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    The slice's guards map protects them: <code>get</code> guards the reads, <code>cru</code> the
                    writes.
                  </span>
                ),
                ko: (
                  <span>
                    이 메서드들은 slice의 guards map이 지킵니다. 읽기는 <code>get</code>이, 쓰기는 <code>cru</code>가
                    맡습니다.
                  </span>
                ),
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "Generated method", ko: "생성되는 메서드" })}
              columns={guardKeyColumns}
              groups={modelApiGroups}
              markLabel={l.trans({ en: "Guarded by this key", ko: "이 키의 guard가 적용" })}
              emptyLabel={l.trans({ en: "Not this key", ko: "해당 없음" })}
            />
            <div>
              {l.trans({
                en: "A detail page hands the unawaited view to its Zone:",
                ko: "상세 페이지는 await하지 않은 view를 Zone에 넘깁니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            language="tsx"
            title="apps/blog/page/story/[storyId]/_index.tsx"
            code={`import { fetch, Story } from "@apps/blog/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("storyId", ID)
  .render(({ storyId }) => {
    const { storyView } = fetch.viewStory(storyId);
    return <Story.Zone.General view={storyView} />;
  });`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Destructure to stream, await to wait.</strong> <code>fetch.viewStory(id)</code> hands out{" "}
                      <code>story</code> and <code>storyView</code> as separate promises; <code>await</code> gives both
                      at once.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>구조 분해하면 스트리밍, await하면 기다림.</strong> <code>fetch.viewStory(id)</code>는{" "}
                      <code>story</code>와 <code>storyView</code>를 따로 된 promise로 주고, <code>await</code>하면 둘을
                      한 번에 줍니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>merge</code> patches.
                      </strong>{" "}
                      In a store action, <code>{"await fetch.mergeStory(story, { title })"}</code> sends only{" "}
                      <code>title</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>merge</code>는 일부만 고칩니다.
                      </strong>{" "}
                      store action에서 <code>{"await fetch.mergeStory(story, { title })"}</code>는 <code>title</code>만
                      보냅니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Override one write with <code>create</code>, <code>update</code> or <code>remove</code>.
                      </strong>{" "}
                      Each replaces <code>cru</code> for that one method, as <code>libs/shared</code> does with{" "}
                      <code>create: Admin</code> for users.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>create</code>, <code>update</code>, <code>remove</code>로 쓰기 하나만 바꿉니다.
                      </strong>{" "}
                      각 키는 그 메서드 하나에 대해 <code>cru</code>를 대신합니다. <code>libs/shared</code>의 user가{" "}
                      <code>create: Admin</code>을 쓰는 방식입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="error">
              {l.trans({
                en: (
                  <span>
                    <strong>Never re-declare a generated name.</strong> <code>{"<model>"}</code>,{" "}
                    <code>{"light<Model>"}</code>, <code>{"create<Model>"}</code>, <code>{"update<Model>"}</code>,{" "}
                    <code>{"remove<Model>"}</code>, <code>{"view<Model>"}</code>, <code>{"edit<Model>"}</code> and{" "}
                    <code>{"merge<Model>"}</code> already exist; an endpoint with one of these names fails lint.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>생성되는 이름을 다시 선언하지 마세요.</strong> <code>{"<model>"}</code>,{" "}
                    <code>{"light<Model>"}</code>, <code>{"create<Model>"}</code>, <code>{"update<Model>"}</code>,{" "}
                    <code>{"remove<Model>"}</code>, <code>{"view<Model>"}</code>, <code>{"edit<Model>"}</code>,{" "}
                    <code>{"merge<Model>"}</code>는 이미 있습니다. 이 이름을 쓴 endpoint는 lint에서 걸립니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide
          id="slice-signal"
          title={l.trans({ en: "Slices: Lists For Pages", ko: "slice: 페이지가 불러오는 목록" })}
        >
          <Docs.Title>{l.trans({ en: "Slices: Lists For Pages", ko: "slice: 페이지가 불러오는 목록" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>slice()</code> declares the lists pages show. Each entry starts with <code>init()</code>,
                    takes <code>.param()</code>, <code>.search()</code> and <code>.with()</code> arguments like an
                    endpoint, and returns a service query. <code>.body()</code> is deprecated there: a list is loaded
                    with no request body, so its value never arrives.
                  </span>
                ),
                ko: (
                  <span>
                    <code>slice()</code>에는 페이지가 보여 줄 목록을 선언합니다. 각 항목은 <code>init()</code>으로
                    시작해 endpoint처럼 <code>.param()</code>, <code>.search()</code>, <code>.with()</code> 인자를 받고,
                    service query를 반환합니다. slice의 <code>.body()</code>는 지원이 중단되었습니다. 목록은 요청 body
                    없이 불러오므로 그 값이 전달되지 않습니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "The stories under one root, readable by anyone:",
                ko: "root 하나에 속한 story 목록이며, 누구나 읽을 수 있습니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/blog/lib/story/story.signal.ts"
            code={`export class StorySlice extends slice(
  srv.story,
  { guards: { root: Admin, get: Public, cru: Admin } },
  (init) => ({
    inRoot: init({ guards: [Public] })
      .param("rootId", ID)
      .exec(function (rootId) {
        return this.storyService.queryInRoot(rootId);
      }),
  }),
) {}`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>root</code> is always <code>Admin</code>.
                      </strong>{" "}
                      It guards the root slice, <code>{"init<Model>(queryKey, args)"}</code>, which can run any filter
                      the model declares.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>root</code>는 항상 <code>Admin</code>입니다.
                      </strong>{" "}
                      root slice인 <code>{"init<Model>(queryKey, args)"}</code>를 지키는데, 이것은 모델이 선언한 어떤
                      filter든 실행할 수 있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A named slice names its own guards</strong> in <code>{"init({ guards: [...] })"}</code>.
                      The map's <code>get</code> and <code>cru</code> never reach it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>이름 있는 slice는 자기 guard를</strong> <code>{"init({ guards: [...] })"}</code>에
                      적습니다. map의 <code>get</code>과 <code>cru</code>는 여기에 닿지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Return the query, do not shape it.</strong> <code>exec</code> returns a query descriptor
                      that takes no <code>.sort()</code> or <code>.limit()</code>; order and page size are fetch
                      options.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>query를 반환만 하고 다듬지 않습니다.</strong> <code>exec</code>가 반환하는 query에는{" "}
                      <code>.sort()</code>나 <code>.limit()</code>를 붙일 수 없고, 정렬과 페이지 크기는 fetch 옵션으로
                      정합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>
              {l.trans({ en: "Generated fetch methods", ko: "생성되는 fetch 메서드" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    Each slice key becomes the <code>Suffix</code> of these methods, so <code>inRoot</code> gives{" "}
                    <code>storyListInRoot</code>, <code>initStoryInRoot</code> and the rest:
                  </span>
                ),
                ko: (
                  <span>
                    slice 키가 이 메서드들의 <code>Suffix</code>가 됩니다. <code>inRoot</code>에서{" "}
                    <code>storyListInRoot</code>, <code>initStoryInRoot</code> 등이 생깁니다:
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={sliceMethods} />
            <div>
              {l.trans({
                en: (
                  <span>
                    Order and page size go in the last option:{" "}
                    <code>{'fetch.initStoryInRoot(rootId, { sort: "latest", limit: 20 })'}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    정렬과 페이지 크기는 마지막 옵션에 넣습니다:{" "}
                    <code>{'fetch.initStoryInRoot(rootId, { sort: "latest", limit: 20 })'}</code>.
                  </span>
                ),
              })}
            </div>

            <Docs.SubSubTitle>{l.trans({ en: "Using it in a page", ko: "page에서 쓰기" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "The page starts both queries and hands each result to the part that needs it:",
                ko: "page는 두 query를 함께 시작하고, 각 결과를 필요한 곳에 넘깁니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            language="tsx"
            title="apps/blog/page/root/[rootId]/_index.tsx"
            code={`import { fetch, Story } from "@apps/blog/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page()
  .param("rootId", ID)
  .render(({ rootId }) => {
    const { storyInitInRoot, storyListInRoot } = fetch.initStoryInRoot(rootId);
    return (
      <div className="flex flex-col gap-4">
        <Load.Stream of={storyListInRoot}>{(storyList) => <Story.Unit.Total count={storyList.length} />}</Load.Stream>
        <Story.Zone.Card init={storyInitInRoot} />
      </div>
    );
  });`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>storyInitInRoot</code> goes to a Zone,
                      </strong>{" "}
                      which fills the store from it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>storyInitInRoot</code>는 Zone에 넘깁니다.
                      </strong>{" "}
                      Zone이 이것으로 store를 채웁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>storyListInRoot</code> stays on the server.
                      </strong>{" "}
                      It holds model instances, which a client component cannot take as props, so read it in a server
                      component or a <code>Load.Stream</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>storyListInRoot</code>는 서버에 둡니다.
                      </strong>{" "}
                      모델 인스턴스를 담고 있어 클라이언트 컴포넌트의 prop이 될 수 없으므로, 서버 컴포넌트나{" "}
                      <code>Load.Stream</code>에서 읽습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Nothing is awaited.</strong> Both queries start at once, and each section renders when its
                      own promise lands.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>아무것도 await하지 않습니다.</strong> 두 query가 동시에 시작되고, 각 섹션은 자기 promise가
                      도착하는 대로 그려집니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="practical-rules" title={l.trans({ en: "Rules To Remember", ko: "꼭 기억할 규칙" })}>
          <Docs.Title>{l.trans({ en: "Rules To Remember", ko: "꼭 기억할 규칙" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Four rules cover most mistakes in a signal file:",
                ko: "signal 파일에서 하는 실수는 대부분 이 네 가지 규칙으로 막을 수 있습니다:",
              })}
            </div>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Extend, do not copy.</strong> When a library already has the model, spread{" "}
                      <code>...user.internals</code>, <code>...user.slices</code> and <code>...user.endpoints</code>{" "}
                      instead of re-declaring them.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>복사하지 말고 확장합니다.</strong> 라이브러리에 이미 있는 모델이면 다시 선언하지 말고{" "}
                      <code>...user.internals</code>, <code>...user.slices</code>, <code>...user.endpoints</code>를
                      spread합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Reach other services with <code>.with()</code>.
                      </strong>{" "}
                      <code>srv.story.with(srv.actionLog)</code> puts <code>this.actionLogService</code> in every
                      handler.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        다른 service는 <code>.with()</code>로 가져옵니다.
                      </strong>{" "}
                      <code>srv.story.with(srv.actionLog)</code>면 모든 handler에서 <code>this.actionLogService</code>를
                      쓸 수 있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Guards decide what AI agents see.</strong> There is no opt-in: <code>mcp: false</code>{" "}
                      only removes an already-guarded endpoint, and a slice's <code>{"mcp: { cru: false }"}</code>{" "}
                      mirrors its guards map for the root slice and generated CRUD.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>AI 에이전트에게 보일지는 guard가 정합니다.</strong> 따로 켜는 옵션은 없습니다.{" "}
                      <code>mcp: false</code>는 guard가 있는 endpoint를 빼는 용도이고, slice의{" "}
                      <code>{"mcp: { cru: false }"}</code>는 root slice와 생성된 CRUD에 한해 guards map과 같은 키로
                      적습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Prompts and apps live on pages.</strong> <code>endpoint()</code> has no builder for
                      either; a screen is published as an MCP prompt with <code>page().prompt(name, description)</code>,
                      and one of its components as an MCP App with <code>page().app(name, description, load)</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>prompt와 app은 page에 둡니다.</strong> <code>endpoint()</code>에는 둘 다 빌더가 없고,
                      화면은 <code>page().prompt(name, description)</code>로 MCP prompt가 되며, 화면의 컴포넌트 하나는{" "}
                      <code>page().app(name, description, load)</code>로 MCP App이 됩니다.
                    </span>
                  ),
                })}
              </li>
            </ul>

            <Docs.SubSubTitle>
              {l.trans({ en: "What reaches an AI agent", ko: "AI 에이전트에게 닿는 것" })}
            </Docs.SubSubTitle>
            <Docs.Matrix
              type={l.trans({ en: "What you declare", ko: "선언한 모습" })}
              columns={agentColumns}
              groups={agentGroups}
              markLabel={l.trans({ en: "Can call it", ko: "호출할 수 있음" })}
              emptyLabel={l.trans({ en: "Cannot see it", ko: "보이지 않음" })}
            />
            <Docs.LinkGrid
              items={[
                {
                  href: "/cheatsheet/interface/mcp",
                  title: l.trans({ en: "MCP Server", ko: "MCP 서버" }),
                  desc: l.trans({
                    en: "Configure /mcp, trim the catalogue, and publish page prompts.",
                    ko: "/mcp를 설정하고, 카탈로그를 다듬고, page prompt를 공개합니다.",
                  }),
                },
                {
                  href: "/cheatsheet/interface/endpoint",
                  title: l.trans({ en: "Endpoint Actions", ko: "업무 동작 Endpoint" }),
                  desc: l.trans({
                    en: "Declare a custom endpoint and call it from a store action.",
                    ko: "custom endpoint를 선언하고 store action에서 호출합니다.",
                  }),
                },
                {
                  href: "/cheatsheet/performance/realtime",
                  title: l.trans({ en: "Realtime", ko: "실시간" }),
                  desc: l.trans({
                    en: "Message and pubsub, end to end.",
                    ko: "message와 pubsub을 처음부터 끝까지 다룹니다.",
                  }),
                },
                {
                  href: "/cheatsheet/performance/queue",
                  title: l.trans({ en: "Queueing", ko: "큐 작업" }),
                  desc: l.trans({
                    en: "Enqueue a process job and pick which replica runs it.",
                    ko: "process job을 queue에 넣고, 어느 replica가 실행할지 정합니다.",
                  }),
                },
              ]}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <DocsToc />
      </Scroll>
    );
  });
