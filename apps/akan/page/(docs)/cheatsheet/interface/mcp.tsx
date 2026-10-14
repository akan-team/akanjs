import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";

  const termRows = [
    {
      name: "MCP",
      desc: l.trans({
        en: "Model Context Protocol: the standard AI clients like Claude Code and Cursor use to call a server.",
        ko: "Model Context Protocol입니다. Claude Code, Cursor 같은 AI 클라이언트가 서버를 호출할 때 쓰는 표준입니다.",
      }),
    },
    {
      name: "tool",
      desc: l.trans({
        en: "A function the model may call; each published endpoint becomes one, named by its key.",
        ko: "모델이 호출할 수 있는 함수입니다. 게시된 엔드포인트 하나가 툴 하나가 되며, 이름은 엔드포인트 키입니다.",
      }),
    },
    {
      name: "resource",
      desc: l.trans({
        en: "A read addressed by an `akan://` URI, which a client can attach as context.",
        ko: "`akan://` URI로 가리키는 조회입니다. 클라이언트가 컨텍스트로 붙일 수 있습니다.",
      }),
    },
    {
      name: "prompt",
      desc: l.trans({
        en: "A screen published for the user to run as a slash command in the MCP client.",
        ko: "사용자가 MCP 클라이언트에서 슬래시 커맨드로 실행하도록 게시한 화면입니다.",
      }),
    },
    {
      name: "catalogue",
      desc: l.trans({
        en: "The list of tools, resources and prompts a client downloads when it connects.",
        ko: "클라이언트가 접속할 때 내려받는 툴, 리소스, 프롬프트 목록입니다.",
      }),
    },
  ];

  const kindColumns = [
    { key: "tool", label: "tool", code: true },
    { key: "resource", label: "resource", code: true },
    { key: "prompt", label: "prompt", code: true },
  ];

  const kindGroups = [
    {
      label: l.trans({ en: "Signal (*.signal.ts)", ko: "시그널 (*.signal.ts)" }),
      rows: [
        {
          name: "query · mutation",
          desc: l.trans({
            en: "Custom endpoints and the generated create, update and remove become tools named by their key.",
            ko: "커스텀 엔드포인트와 생성된 create, update, remove는 키 이름 그대로 툴이 됩니다.",
          }),
          marks: { tool: true, resource: false, prompt: false },
        },
        {
          name: "<model> · <model>List…",
          desc: l.trans({
            en: "Generated reads are tools that also get an `akan://` resource URI.",
            ko: "생성된 조회는 툴이면서 `akan://` 리소스 URI도 받습니다.",
          }),
          marks: { tool: true, resource: true, prompt: false },
        },
        {
          name: "<model>Insight…",
          desc: l.trans({
            en: "An aggregate with nothing to point at, so it stays a tool with no URI.",
            ko: "가리킬 대상이 없는 집계값이라 URI 없이 툴로만 남습니다.",
          }),
          marks: { tool: true, resource: false, prompt: false },
        },
        {
          name: "pubsub · message",
          desc: l.trans({
            en: "Never exposed: their arguments read a socket an MCP request does not have.",
            ko: "노출되지 않습니다. 인자가 MCP 요청에는 없는 소켓을 읽기 때문입니다.",
          }),
          marks: { tool: false, resource: false, prompt: false },
        },
      ],
    },
    {
      label: l.trans({ en: "Page (page/**)", ko: "페이지 (page/**)" }),
      rows: [
        {
          name: "page().prompt()",
          desc: l.trans({
            en: "A screen: a slash command for the user, a tool for the model, and its page alone in the chat of an MCP Apps client.",
            ko: "화면 하나가 사용자에겐 슬래시 커맨드, 모델에겐 툴이 되고, MCP Apps 클라이언트에선 레이아웃 없이 페이지만 채팅에 뜹니다.",
          }),
          marks: { tool: true, resource: false, prompt: true },
        },
      ],
    },
  ];

  const refusalRows = [
    {
      when: l.trans({ en: "It declares `mcp: false`", ko: "`mcp: false`를 선언했다" }),
      why: l.trans({
        en: "Curated off the shelf on purpose; guards and HTTP stay as they were, and a screen drawn in the chat still calls it.",
        ko: "일부러 선반에서 뺀 것입니다. 가드와 HTTP는 그대로이고, 채팅 안에 뜬 화면은 여전히 부를 수 있습니다.",
      }),
    },
    {
      when: l.trans({
        en: "A guard declares `static agents = false`, like `Person`",
        ko: "`Person`처럼 `static agents = false`인 가드가 붙어 있다",
      }),
      why: l.trans({
        en: "It is an act reserved for a person, so no model is ever offered it.",
        ko: "사람만 할 수 있는 행위라 어떤 모델에게도 내밀지 않습니다.",
      }),
    },
    {
      when: l.trans({
        en: "It declares no `guards`, or an empty list",
        ko: "`guards`를 적지 않았거나 빈 배열이다",
      }),
      why: l.trans({
        en: "Nobody decided who may call it; write `guards: [Public]` if anonymous access is the intent.",
        ko: "누가 호출할지 정한 적이 없습니다. 익명 호출이 의도라면 `guards: [Public]`을 적으세요.",
      }),
    },
    {
      when: l.trans({ en: "It is the generated `light<Model>` read", ko: "생성된 `light<Model>` 조회다" }),
      why: l.trans({
        en: "It reads the same document as `<model>` in a smaller shape, so the agent calls `<model>` instead; a screen drawn in the chat still calls it, under its guards.",
        ko: "`<model>`과 같은 도큐먼트를 작은 형태로 읽을 뿐이라, 에이전트는 대신 `<model>`을 호출합니다. 채팅 안에 뜬 화면은 가드 아래에서 여전히 부를 수 있습니다.",
      }),
    },
    {
      when: l.trans({ en: "It is a `pubsub` or a `message`", ko: "`pubsub`이나 `message`다" }),
      why: l.trans({
        en: "It rides the websocket, and its arguments read a socket an MCP request does not have.",
        ko: "웹소켓으로 동작하고, 인자가 MCP 요청에는 없는 소켓을 읽습니다.",
      }),
    },
    {
      when: l.trans({
        en: "The deployment is read-only and it is not a `query`",
        ko: "읽기 전용 배포인데 `query`가 아니다",
      }),
      why: l.trans({
        en: "The `readOnly` valve drops every mutation, whatever its guards allow.",
        ko: "`readOnly` 밸브는 가드가 무엇을 허용하든 모든 mutation을 뺍니다.",
      }),
    },
    {
      when: l.trans({ en: "It returns `Any`, `Upload` or `Binary`", ko: "`Any`, `Upload`, `Binary`를 반환한다" }),
      why: l.trans({
        en: "A model cannot be told what comes back, and raw bytes only fill its context window.",
        ko: "무엇이 돌아오는지 모델에게 설명할 수 없고, 원시 바이트는 컨텍스트 창만 채웁니다.",
      }),
    },
    {
      when: l.trans({ en: "It takes a file upload", ko: "파일 업로드를 받는다" }),
      why: l.trans({
        en: "A file upload has no MCP representation.",
        ko: "파일 업로드는 MCP로 표현할 방법이 없습니다.",
      }),
    },
    {
      when: l.trans({
        en: "It is a `mutation` whose only guard is `Public`",
        ko: "가드가 `Public` 하나뿐인 `mutation`이다",
      }),
      why: l.trans({
        en: "`[Public]` on a write is having no guard, spelled out; add a real one.",
        ko: "쓰기에 `[Public]`만 붙인 것은 가드가 없다는 말을 풀어 쓴 것입니다. 실제 가드를 붙이세요.",
      }),
    },
    {
      when: l.trans({ en: "A required argument is typed `Any`", ko: "필수 인자의 타입이 `Any`다" }),
      why: l.trans({
        en: "`Any` is left out of the schema, so expose a named filter slice instead.",
        ko: "`Any`는 스키마에서 빠지므로, 대신 이름 있는 filter 슬라이스를 노출하세요.",
      }),
    },
  ];

  const enableNotes = [
    l.trans({
      en: (
        <>
          <strong>Mount order.</strong> Every lib's <code>option.ts</code> is read in mount order and the app's last, so
          the app has the final word.
        </>
      ),
      ko: (
        <>
          <strong>마운트 순서.</strong> 모든 lib의 <code>option.ts</code>를 마운트 순서대로 읽고 앱의 것을 마지막에
          읽으므로, 최종 결정은 앱이 합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Code beats env, except the off switch.</strong> A value written in code wins over the{" "}
          <code>AKAN_MCP_*</code> env of the same name, but writing <code>undefined</code> does not erase the env's
          value. <code>AKAN_MCP=false</code> keeps <code>/mcp</code> off whatever the code says.
        </>
      ),
      ko: (
        <>
          <strong>코드가 env를 이깁니다. 끄는 스위치만 예외입니다.</strong> 코드에 쓴 값이 같은 이름의{" "}
          <code>AKAN_MCP_*</code> env보다 우선하지만, <code>undefined</code>를 쓴다고 env 값이 지워지지는 않습니다.{" "}
          <code>AKAN_MCP=false</code>이면 코드와 상관없이 <code>/mcp</code>가 꺼집니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Turning it off.</strong> Write <code>setMcp(false)</code> in code, or set <code>AKAN_MCP=false</code>{" "}
          in the env.
        </>
      ),
      ko: (
        <>
          <strong>끄는 방법.</strong> 코드에서는 <code>setMcp(false)</code>, env에서는 <code>AKAN_MCP=false</code>
          입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Function form.</strong> <code>{"setMcp((options) => ({ … }))"}</code> receives the server options from{" "}
          <code>env.server.*</code>, for a value decided at boot. <code>libs/shared</code> builds its <code>auth</code>{" "}
          this way.
        </>
      ),
      ko: (
        <>
          <strong>함수 형태.</strong> <code>{"setMcp((options) => ({ … }))"}</code>는 <code>env.server.*</code>의 서버
          옵션을 받으므로, 부팅 때 정해지는 값에 씁니다. <code>libs/shared</code>가 <code>auth</code>를 이렇게 만듭니다.
        </>
      ),
    }),
  ];

  const optionRows = [
    {
      key: "enabled",
      type: "boolean",
      default: "true",
      tags: ["AKAN_MCP", "AKAN_PUBLIC_MCP"],
      desc: l.trans({
        en: "Whether `/mcp` is mounted; `false` or `0` in the env turns it off whatever the code says.",
        ko: "`/mcp`를 마운트할지 정합니다. env에 `false`나 `0`을 주면 코드와 상관없이 꺼집니다.",
      }),
    },
    {
      key: "readOnly",
      type: "boolean",
      default: "false",
      tags: ["AKAN_MCP_READONLY", "AKAN_PUBLIC_MCP_READONLY"],
      desc: l.trans({
        en: "Publishes queries only, whatever the guards allow, and turns MCP Apps off; the env turns it on only on `true` or `1`.",
        ko: "가드가 무엇을 허용하든 query만 게시하고, MCP Apps를 끕니다. env는 `true`나 `1`일 때만 켭니다.",
      }),
    },
    {
      key: "path",
      type: "string",
      default: "/mcp",
      tags: ["AKAN_MCP_PATH"],
      desc: l.trans({
        en: "Mount path; the OAuth resource identifier, and so the `aud` a token needs, follows it.",
        ko: "마운트 경로입니다. OAuth 리소스 식별자가 이 값을 따르므로, 토큰에 담을 `aud`도 함께 바뀝니다.",
      }),
    },
    {
      key: "version",
      type: "string",
      default: "0.0.0",
      tags: ["AKAN_MCP_VERSION"],
      desc: l.trans({
        en: "Reported as `serverInfo.version`, the same placeholder the OpenAPI document uses.",
        ko: "`serverInfo.version`으로 보고됩니다. OpenAPI 문서와 같은 자리표시자입니다.",
      }),
    },
    {
      key: "instructions",
      type: "string",
      default: "Domain tools for the <app> app.",
      tags: ["AKAN_MCP_INSTRUCTIONS"],
      desc: l.trans({
        en: "Sent to the model with the tool list: what the app is for and which tool to reach first.",
        ko: "툴 목록과 함께 모델에 전달됩니다. 앱의 용도와 먼저 쓸 툴을 적습니다.",
      }),
    },
    {
      key: "allowedOrigins",
      type: "string[]",
      default: "[]",
      tags: ["AKAN_MCP_ALLOWED_ORIGINS"],
      desc: l.trans({
        en: "Extra origins past the DNS-rebinding check; only a browser-hosted client sends an Origin.",
        ko: "DNS rebinding 검사를 통과시킬 추가 origin입니다. Origin은 브라우저에서 도는 클라이언트만 보냅니다.",
      }),
    },
    {
      key: "pageSize",
      type: "number",
      default: "100",
      tags: ["AKAN_MCP_PAGE_SIZE"],
      desc: l.trans({
        en: "Entries per catalogue page; a client follows `nextCursor` for the rest.",
        ko: "카탈로그 한 페이지의 항목 수입니다. 클라이언트는 `nextCursor`로 나머지를 받습니다.",
      }),
    },
    {
      key: "language",
      type: "string",
      default: "en",
      tags: ["AKAN_MCP_LANGUAGE"],
      desc: l.trans({
        en: "The one language of the catalogue and its error text, server-wide.",
        ko: "카탈로그와 에러 문구에 쓰는 언어 하나이며, 서버 전체에 적용됩니다.",
      }),
    },
    {
      key: "outputSchema",
      type: '"full" | "shallow" | "none"',
      default: "shallow",
      tags: ["AKAN_MCP_OUTPUT_SCHEMA"],
      desc: l.trans({
        en: "Result shape a tool advertises: `shallow` names nested models, `full` inlines, `none` omits.",
        ko: "툴이 공개하는 결과 형태입니다. `shallow`는 중첩 모델의 이름만, `full`은 전부 인라인, `none`은 생략입니다.",
      }),
    },
    {
      key: "legacyTextBlock",
      type: "boolean",
      default: "true",
      tags: ["AKAN_MCP_LEGACY_TEXT"],
      desc: l.trans({
        en: "Repeats a structured result as JSON in the text block; the env can only turn it off.",
        ko: "구조화된 결과를 text block에 JSON으로 한 번 더 싣습니다. env로는 끄기만 할 수 있습니다.",
      }),
    },
    {
      key: "rateLimit",
      type: "{ calls?, windowMs?, concurrent? } | false",
      default: "120 calls / 60s, 8 in flight",
      tags: ["AKAN_MCP_RATE_LIMIT", "AKAN_MCP_CONCURRENT"],
      desc: l.trans({
        en: "Per-caller budget for `tools/call`, `resources/read` and `prompts/get`, counted per process.",
        ko: "`tools/call`, `resources/read`, `prompts/get`에 대한 호출자별 예산이며, 프로세스마다 셉니다.",
      }),
      example: "AKAN_MCP_RATE_LIMIT=60/30   # 60 calls per 30s; off disables\nAKAN_MCP_CONCURRENT=4",
    },
    {
      key: "promptBudget",
      type: "number",
      default: "60000",
      tags: ["AKAN_MCP_PROMPT_BUDGET"],
      desc: l.trans({
        en: "Characters of screen data one page prompt may attach before its lists are cut.",
        ko: "페이지 프롬프트 하나가 목록이 잘리기 전까지 붙일 수 있는 화면 데이터의 글자 수입니다.",
      }),
    },
    {
      key: "apps",
      type: "boolean",
      default: "true",
      tags: ["AKAN_MCP_APPS"],
      desc: l.trans({
        en: "Publish each `.prompt()` page as a tool too, drawn in the chat by a client that renders MCP Apps. A read-only deployment has none: no page tools, views or app-only tools.",
        ko: "`.prompt()` 페이지를 툴로도 게시하고, MCP Apps를 그리는 클라이언트는 그 화면을 채팅 안에 띄웁니다. 읽기 전용 배포에는 페이지 툴, 화면, 앱 전용 툴이 모두 없습니다.",
      }),
    },
    {
      key: "modern",
      type: "boolean",
      default: "true unless a page shows a view",
      tags: ["AKAN_MCP_MODERN"],
      desc: l.trans({
        en: "Offer the `2026-07-28` revision; withheld while a `.prompt()` page may show as a view, until the RSC worker lists none, as claude.ai draws one only after `initialize`.",
        ko: "`2026-07-28` 리비전을 제공합니다. claude.ai가 `initialize` 뒤에만 화면을 그리므로, `.prompt()` 페이지가 화면으로 뜰 수 있는 동안에는 빼 두고, RSC worker가 그런 페이지가 없다고 하면 제공합니다.",
      }),
    },
    {
      key: "auth",
      type: "{ authorizationServers?, scopes?, resource?, verify? }",
      default: "{}",
      tags: ["AKAN_MCP_AUTH_SERVERS", "AKAN_MCP_SCOPES", "AKAN_MCP_RESOURCE"],
      desc: l.trans({
        en: "The OAuth resource-server identity; naming an authorization server makes a token mandatory.",
        ko: "OAuth 리소스 서버로서의 신원입니다. authorization server를 적으면 토큰이 필수가 됩니다.",
      }),
    },
  ];

  const optionNotes = [
    l.trans({
      en: (
        <>
          <strong>Over the rate limit</strong> a call answers <code>429</code> with <code>Retry-After</code>. Listings
          are not counted, and N replicas grant N budgets.
        </>
      ),
      ko: (
        <>
          <strong>예산을 넘으면</strong> <code>Retry-After</code>와 함께 <code>429</code>로 답합니다. 목록 조회는 세지
          않고, 레플리카가 N개면 예산도 N개입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>{'outputSchema: "none"'}</code> keeps the text block
          </strong>{" "}
          whatever <code>legacyTextBlock</code> says: a client reads <code>structuredContent</code> only against a
          declared schema.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>{'outputSchema: "none"'}</code>이면 text block은 유지됩니다.
          </strong>{" "}
          <code>legacyTextBlock</code> 값과 상관없습니다. 클라이언트는 선언된 스키마가 있을 때만{" "}
          <code>structuredContent</code>를 읽기 때문입니다.
        </>
      ),
    }),
  ];

  const toolPartRows = [
    {
      name: "name",
      desc: l.trans({
        en: "The endpoint key as written, such as `startTask`.",
        ko: "적은 그대로의 엔드포인트 키입니다. 예를 들면 `startTask`입니다.",
      }),
    },
    {
      name: "inputSchema",
      desc: l.trans({
        en: "Every `.param()`, `.search()` and `.body()` argument in one object; `.search()` ones are optional.",
        ko: "`.param()`, `.search()`, `.body()` 인자를 한 객체로 모읍니다. `.search()` 인자는 선택입니다.",
      }),
    },
    {
      name: "outputSchema",
      desc: l.trans({
        en: "The return model; a scalar or a nullable single return ships as text only.",
        ko: "반환 모델입니다. 스칼라나 null이 될 수 있는 단일 반환은 텍스트로만 나갑니다.",
      }),
    },
    {
      name: ["title", "description"],
      desc: l.trans({
        en: "The endpoint's dictionary label and its `.desc()`.",
        ko: "엔드포인트의 딕셔너리 라벨과 `.desc()`입니다.",
      }),
    },
    {
      name: "annotations",
      desc: l.trans({
        en: "`readOnlyHint` on a query, `destructiveHint` on a `remove…` or `delete…` mutation.",
        ko: "query에는 `readOnlyHint`, `remove…`나 `delete…` mutation에는 `destructiveHint`가 붙습니다.",
      }),
    },
  ];

  const dictionaryNotes = [
    l.trans({
      en: (
        <>
          <strong>An agent picks a tool by its description,</strong> so a tool without <code>.desc()</code> is a broken
          tool, not an untidy one.
        </>
      ),
      ko: (
        <>
          <strong>에이전트는 설명을 보고 툴을 고릅니다.</strong> 그래서 <code>.desc()</code>가 없는 툴은 지저분한 게
          아니라 고장 난 툴입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Describe every argument</strong> in <code>.arg()</code>: each description rides in the input schema.
        </>
      ),
      ko: (
        <>
          <strong>인자마다 설명을 적으세요.</strong> <code>.arg()</code>의 설명이 input schema에 그대로 실립니다.
        </>
      ),
    }),
  ];

  const sliceEntryRows = [
    {
      name: ["taskList", "taskInsight"],
      desc: l.trans({
        en: "The root slice: guarded by `guards.root`, opted out with `mcp: { root: false }`.",
        ko: "루트 슬라이스입니다. `guards.root`로 막고, `mcp: { root: false }`로 뺍니다.",
      }),
    },
    {
      name: ["task"],
      desc: l.trans({
        en: "The full read: `guards.get` and `mcp: { get: false }`; `lightTask` is never published.",
        ko: "전체 조회입니다. `guards.get`과 `mcp: { get: false }`를 따르며, `lightTask`는 게시되지 않습니다.",
      }),
    },
    {
      name: ["createTask", "updateTask", "removeTask"],
      desc: l.trans({
        en: "`guards.cru` and `mcp: { cru: false }`, or a per-verb key such as `create`.",
        ko: "`guards.cru`와 `mcp: { cru: false }`를 따르고, `create` 같은 동사별 키로 따로 정할 수도 있습니다.",
      }),
    },
    {
      name: ["taskListInTodo", "taskInsightInTodo"],
      desc: l.trans({
        en: "A named slice: only its own `init({ guards, mcp })` counts.",
        ko: "이름 있는 슬라이스입니다. 자기 `init({ guards, mcp })`만 봅니다.",
      }),
    },
  ];

  const mcpFalseNotes = [
    l.trans({
      en: (
        <>
          <strong>
            <code>mcp: false</code> is curation, not authorization.
          </strong>{" "}
          It takes an entry off the shelf; its guards and HTTP stay the same.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>mcp: false</code>는 권한이 아니라 큐레이션입니다.
          </strong>{" "}
          항목을 선반에서 뺄 뿐, 가드와 HTTP는 그대로입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            The <code>slice()</code> map mirrors <code>guards</code> key for key
          </strong>{" "}
          (<code>root</code>, <code>get</code>, <code>cru</code>, <code>create</code>, <code>update</code>,{" "}
          <code>remove</code>) and reaches exactly as far: the root slice and generated CRUD.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>slice()</code>의 맵은 <code>guards</code>와 키가 똑같습니다.
          </strong>{" "}
          <code>root</code>, <code>get</code>, <code>cru</code>, <code>create</code>, <code>update</code>,{" "}
          <code>remove</code>이고, 닿는 범위도 루트 슬라이스와 생성된 CRUD로 같습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            A bare <code>mcp: false</code> turns them all off.
          </strong>{" "}
          It expands to <code>root</code>, <code>get</code> and <code>cru</code>, and <code>create</code>,{" "}
          <code>update</code> and <code>remove</code> inherit <code>cru</code>.
        </>
      ),
      ko: (
        <>
          <strong>
            그냥 <code>mcp: false</code>라고 쓰면 전부 꺼집니다.
          </strong>{" "}
          <code>root</code>, <code>get</code>, <code>cru</code>로 펼쳐지고, <code>create</code>, <code>update</code>,{" "}
          <code>remove</code>는 <code>cru</code>를 물려받습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>A named slice or a custom endpoint writes a plain boolean</strong> in its own option, never the map.
        </>
      ),
      ko: (
        <>
          <strong>이름 있는 슬라이스와 커스텀 엔드포인트는 자기 옵션에 boolean을 씁니다.</strong> 맵은 쓰지 않습니다.
        </>
      ),
    }),
  ];

  const uriNotes = [
    l.trans({
      en: (
        <>
          <strong>
            Only <code>{"<model>"}</code> and the <code>{"<model>List…"}</code> reads have one.
          </strong>{" "}
          An insight is an aggregate with nothing to point at, and a custom endpoint keeps its tool but gets no
          template.
        </>
      ),
      ko: (
        <>
          <strong>
            URI는 <code>{"<model>"}</code>과 <code>{"<model>List…"}</code> 조회에만 붙습니다.
          </strong>{" "}
          insight는 가리킬 대상이 없는 집계값이고, 커스텀 엔드포인트는 툴은 갖지만 템플릿은 받지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            The root list is the bare <code>…/list</code>.
          </strong>{" "}
          The third segment belongs to the slice key, so the root list has none.
        </>
      ),
      ko: (
        <>
          <strong>
            루트 목록은 세 번째 경로 조각이 없는 <code>…/list</code>입니다.
          </strong>{" "}
          그 자리는 슬라이스 키의 몫이기 때문입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>lightTask</code> gets neither
          </strong>{" "}
          a tool nor a URI.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>lightTask</code>는 툴도 URI도 없습니다.
          </strong>
        </>
      ),
    }),
  ];

  const promptNotes = [
    l.trans({
      en: (
        <>
          <strong>The description is the whole instruction.</strong> Write it in English, in API vocabulary;{" "}
          <code>{"<Agent.Guide>"}</code> text never reaches a prompt.
        </>
      ),
      ko: (
        <>
          <strong>description이 지시의 전부입니다.</strong> API 용어로, 영어로 씁니다. <code>{"<Agent.Guide>"}</code>{" "}
          문구는 프롬프트에 전달되지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Arguments come from the page's declaration.</strong> <code>.param()</code> is required,{" "}
          <code>.search()</code> is optional, and <code>desc</code> becomes the argument's description.
        </>
      ),
      ko: (
        <>
          <strong>인자는 페이지 선언에서 나옵니다.</strong> <code>.param()</code>은 필수, <code>.search()</code>는
          선택이고, <code>desc</code>가 인자 설명이 됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>A list argument is typed comma-separated.</strong> Its description gets{" "}
          <code>Comma-separated list.</code> appended, and an ID, Int or enum value is checked by the page's own
          declaration.
        </>
      ),
      ko: (
        <>
          <strong>배열 인자는 쉼표로 구분해 입력합니다.</strong> 설명 끝에 <code>Comma-separated list.</code>가 붙고,
          ID, Int, enum 값은 페이지 자신의 선언으로 검증합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Names are unique.</strong> A name matches <code>{"^[A-Za-z0-9_-]{1,64}$"}</code> and is unique across
          pages; <code>prompts/list</code> lists every page with <code>.prompt()</code>.
        </>
      ),
      ko: (
        <>
          <strong>이름은 유일해야 합니다.</strong> <code>{"^[A-Za-z0-9_-]{1,64}$"}</code>에 맞고 모든 페이지에서 겹치지
          않아야 하며, <code>prompts/list</code>는 <code>.prompt()</code>가 있는 페이지를 모두 나열합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Only pages declare prompts.</strong> A signal has no <code>prompt()</code> builder, and{" "}
          <code>Msg</code> is not a public API.
        </>
      ),
      ko: (
        <>
          <strong>프롬프트는 페이지에서만 선언합니다.</strong> 시그널에는 <code>prompt()</code> 빌더가 없고,{" "}
          <code>Msg</code>는 공개 API가 아닙니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>The same page is a tool, and can be the screen itself.</strong> Claude Code reads the briefing and a
          link; claude.ai, ChatGPT and VS Code draw the page in the chat, where a tap acts with the agent's token, so a{" "}
          <code>Person</code> act stays on the web. The tool declares <code>readOnlyHint: false</code>, since running
          the page makes its own <code>fetch.*</code> calls, mutations included.
        </>
      ),
      ko: (
        <>
          <strong>같은 페이지가 툴이 되고, 화면 자체로도 뜹니다.</strong> Claude Code는 브리핑과 링크를 받고,
          claude.ai·ChatGPT·VS Code는 채팅 안에 페이지를 그립니다. 거기서 누르는 동작은 에이전트 토큰으로 실행되므로{" "}
          <code>Person</code> 행위는 웹에서 합니다. 페이지를 실행하면 mutation을 포함한 그 페이지의 <code>fetch.*</code>{" "}
          호출이 일어나므로, 툴은 <code>readOnlyHint: false</code>를 선언합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>A client that renders views is known by a signed session.</strong> A legacy client that declares the
          MCP Apps extension at <code>initialize</code> is issued{" "}
          <code>{"Mcp-Session-Id: ui.<nonce>.<signature>"}</code>, signed by the app; an id it did not sign is served as
          a client without views.
        </>
      ),
      ko: (
        <>
          <strong>화면을 그리는 클라이언트는 서명된 세션으로 알아봅니다.</strong> <code>initialize</code>에서 MCP Apps
          확장을 선언한 legacy 클라이언트는 앱이 서명한 <code>{"Mcp-Session-Id: ui.<nonce>.<signature>"}</code>를 받고,
          앱이 서명하지 않은 id는 화면이 없는 클라이언트로 대합니다.
        </>
      ),
    }),
  ];

  const promptMessageRows = [
    {
      name: "user",
      desc: l.trans({
        en: "The page's description, as the first user message.",
        ko: "페이지의 description이 첫 user 메시지로 들어갑니다.",
      }),
    },
    {
      name: "resource",
      desc: l.trans({
        en: "One per query, masked by its endpoint's return model: no hidden, secret or visual fields.",
        ko: "조회마다 하나씩이며, 엔드포인트의 반환 모델로 마스킹해 hidden, secret, visual 필드를 뺍니다.",
      }),
    },
    {
      name: "uri",
      desc: l.trans({
        en: "The `akan://` URI the tool answers to; a custom read gets `akan://<toolKey>?args`.",
        ko: "그 툴이 응답하는 `akan://` URI입니다. 커스텀 조회는 `akan://<toolKey>?args`입니다.",
      }),
    },
    {
      name: "Tools for this screen: …",
      desc: l.trans({
        en: "The fetched modules' published tools that the caller may see, minus the attached reads.",
        ko: "조회한 모듈의 게시된 툴 중 호출자가 볼 수 있는 것이며, 이미 첨부한 조회는 뺍니다.",
      }),
    },
  ];

  const failureRows = [
    {
      name: (
        <span className="font-sans">
          {l.trans({ en: "A required argument was left out", ko: "필수 인자가 빠졌다" })}
        </span>
      ),
      desc: l.trans({
        en: "The page is not run; the answer names the tool that finds the id.",
        ko: "페이지를 실행하지 않고, 그 id를 찾을 수 있는 툴을 알려 줍니다.",
      }),
      example:
        'No <arg> was named for "<prompt>".\nFind it with <model>List…, then run this prompt again with <arg>=<id>.',
    },
    {
      name: (
        <span className="font-sans">
          {l.trans({ en: "An argument fails the page's declaration", ko: "인자가 페이지 선언에 맞지 않는다" })}
        </span>
      ),
      desc: l.trans({
        en: "The page is not run; the declaration's own error message is returned.",
        ko: "페이지를 실행하지 않고, 선언이 낸 에러 메시지를 그대로 돌려줍니다.",
      }),
    },
    {
      name: (
        <span className="font-sans">
          {l.trans({
            en: "A redirect or a guard refusal, with no token",
            ko: "redirect나 가드 거절, 토큰 없음",
          })}
        </span>
      ),
      desc: l.trans({
        en: "A `401` credential challenge, so the client signs in instead of giving up.",
        ko: "`401` 인증 챌린지입니다. 클라이언트는 포기하지 않고 로그인하러 갑니다.",
      }),
    },
    {
      name: (
        <span className="font-sans">
          {l.trans({
            en: "A redirect or a guard refusal, with a token",
            ko: "redirect나 가드 거절, 토큰 있음",
          })}
        </span>
      ),
      desc: l.trans({
        en: "One fixed answer, so it never confirms whether an id exists.",
        ko: "항상 같은 답이라 id가 존재하는지 확인해 주지 않습니다.",
      }),
      example: "This screen is not available to the signed-in account.",
    },
    {
      name: (
        <span className="font-sans">
          {l.trans({
            en: (
              <>
                <code>router.notFound()</code>, or a document it reads is missing
              </>
            ),
            ko: (
              <>
                <code>router.notFound()</code>, 또는 읽는 도큐먼트가 없다
              </>
            ),
          })}
        </span>
      ),
      desc: l.trans({
        en: "Answered as not-found for these arguments.",
        ko: "이 인자로는 화면이 없다고 답합니다.",
      }),
      example: "No screen exists for these arguments.",
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Any other throw", ko: "그 밖의 예외" })}</span>,
      desc: l.trans({
        en: "The real error is logged on the server and never described to the caller.",
        ko: "실제 에러는 서버 로그에만 남고 호출자에게는 설명하지 않습니다.",
      }),
      example: "The page failed to load.",
    },
  ];

  const failureNotes = [
    l.trans({
      en: (
        <>
          <strong>
            Lists are cut to <code>promptBudget</code>
          </strong>{" "}
          (60,000 characters by default), largest first, with a note:{" "}
          <code>{"Attached the first N of M rows of <key>; call it for the rest."}</code> A single document is never
          cut.
        </>
      ),
      ko: (
        <>
          <strong>
            목록은 <code>promptBudget</code>에 맞게 잘립니다.
          </strong>{" "}
          기본값은 60,000자이고, 큰 목록부터 자르며{" "}
          <code>{"Attached the first N of M rows of <key>; call it for the rest."}</code> 안내가 붙습니다. 단일
          도큐먼트는 자르지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Tool exposure is unchanged.</strong> Guards decide, and <code>mcp: false</code> and{" "}
          <code>Person</code> still apply.
        </>
      ),
      ko: (
        <>
          <strong>툴 노출 규칙은 그대로입니다.</strong> 가드가 정하고, <code>mcp: false</code>와 <code>Person</code>도
          그대로 적용됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>The in-page chat lists no app prompts.</strong> It keeps only its six built-in slash commands.
        </>
      ),
      ko: (
        <>
          <strong>페이지 안 채팅에는 앱 프롬프트가 나오지 않습니다.</strong> 내장 슬래시 커맨드 여섯 개만 있습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>An API-only build has no prompts,</strong> because the RSC worker answers them and{" "}
          <code>web: false</code> runs none.
        </>
      ),
      ko: (
        <>
          <strong>API 전용 빌드에는 프롬프트가 없습니다.</strong> 프롬프트는 RSC worker가 답하는데,{" "}
          <code>web: false</code>에는 RSC worker가 없기 때문입니다.
        </>
      ),
    }),
  ];

  const progressNotes = [
    l.trans({
      en: (
        <>
          <strong>The client asks for it</strong> with both <code>Accept: text/event-stream</code> and a{" "}
          <code>_meta.progressToken</code>. Only <code>tools/call</code> streams.
        </>
      ),
      ko: (
        <>
          <strong>클라이언트가 요청해야 합니다.</strong> <code>Accept: text/event-stream</code>과{" "}
          <code>_meta.progressToken</code>을 모두 보내야 하며, 스트리밍은 <code>tools/call</code>에만 있습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>The stream opens at the first report.</strong> A call that never reports answers as plain JSON.
        </>
      ),
      ko: (
        <>
          <strong>스트림은 첫 보고 때 열립니다.</strong> 한 번도 보고하지 않는 호출은 일반 JSON으로 답합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Cancelling is the client closing the stream.</strong> Later reports are dropped, but the framework
          cannot stop an <code>exec</code> already running; it finishes with nobody waiting.
        </>
      ),
      ko: (
        <>
          <strong>취소는 클라이언트가 스트림을 닫는 것입니다.</strong> 이후 보고는 버려지지만, 이미 실행 중인{" "}
          <code>exec</code>을 프레임워크가 멈추지는 못합니다. 기다리는 쪽 없이 끝까지 실행됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>McpProgress.streaming</code>
          </strong>{" "}
          is <code>true</code> while a caller is reading, so build an expensive message only then.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>McpProgress.streaming</code>
          </strong>
          은 누군가 읽는 동안 <code>true</code>입니다. 만들기 비싼 메시지는 그때만 조립하세요.
        </>
      ),
    }),
  ];

  const scopeColumns = [
    { key: "list", label: l.trans({ en: "Hides from listing", ko: "목록에서 숨김" }) },
    { key: "call", label: l.trans({ en: "Checked at call", ko: "호출 때 검사" }) },
  ];

  const scopeGroups = [
    {
      label: 'scope: "account"',
      rows: [
        {
          name: "SignedIn · Admin · Every",
          desc: l.trans({
            en: "Reads only the caller, so an anonymous agent is not offered admin tools it can only fail.",
            ko: "호출자만 보고 판정하므로, 익명 에이전트에게 실패할 수밖에 없는 관리자 툴을 내밀지 않습니다.",
          }),
          marks: { list: true, call: true },
        },
      ],
    },
    {
      label: 'scope: "resource"',
      rows: [
        {
          name: "Can<Verb><Model> · SelfOrAdmin",
          desc: l.trans({
            en: "Needs the call's arguments, so the entry stays listed and is stopped at call time.",
            ko: "호출 인자가 있어야 판정하므로, 항목은 목록에 남고 호출 단계에서 막힙니다.",
          }),
          marks: { list: false, call: true },
        },
      ],
    },
  ];

  const issuerCards = [
    {
      title: l.trans({ en: "Your app mounts libs/shared", ko: "libs/shared를 마운트한 앱" }),
      desc: l.trans({
        en: "Nothing to set. The app serves the OAuth 2.1 server itself (metadata, consent, registration, token, revocation) and names itself the issuer.",
        ko: "설정할 것이 없습니다. 앱이 OAuth 2.1 인가 서버(메타데이터, 동의, 클라이언트 등록, 토큰, 폐기)를 직접 제공하고 자신을 issuer로 둡니다.",
      }),
      chip: "/.well-known/oauth-authorization-server",
    },
    {
      title: l.trans({ en: "Somebody else's issuer", ko: "외부 issuer" }),
      desc: l.trans({
        en: (
          <>
            Point <code>/mcp</code> at it with the three env vars below. Naming an issuer is what makes{" "}
            <code>/mcp</code> demand a token.
          </>
        ),
        ko: (
          <>
            아래 env 세 개로 <code>/mcp</code>를 그 issuer에 연결합니다. issuer를 지정하는 순간 <code>/mcp</code>가
            토큰을 요구합니다.
          </>
        ),
      }),
      chip: "AKAN_MCP_AUTH_SERVERS",
    },
  ];

  const tokenNotes = [
    l.trans({
      en: (
        <>
          <strong>No credential.</strong> Once an issuer is named, a request with no bearer gets a <code>401</code> with{" "}
          <code>WWW-Authenticate</code>; before that, only a call a guard refuses does. Either way the client signs in
          instead of concluding the tool does not exist. An <code>Authorization</code> header that is not{" "}
          <code>Bearer &lt;one token&gt;</code> counts as no credential.
        </>
      ),
      ko: (
        <>
          <strong>자격 증명이 없을 때.</strong> issuer를 지정하면 bearer 없는 모든 요청이 <code>WWW-Authenticate</code>
          와 함께 <code>401</code>을 받고, 지정 전에는 가드가 거절한 호출만 받습니다. 어느 쪽이든 클라이언트는 툴이
          없다고 결론짓지 않고 로그인합니다. <code>Bearer &lt;토큰 하나&gt;</code> 꼴이 아닌 <code>Authorization</code>{" "}
          헤더는 자격 증명이 없는 것으로 봅니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Scopes are for somebody else's issuer.</strong> <code>insufficient_scope</code> is enforced only once{" "}
          <code>AKAN_MCP_SCOPES</code> is set. Tokens an app mounting <code>libs/shared</code> issues itself carry no
          scope claim, so setting it there refuses every one of them with <code>403</code>.
        </>
      ),
      ko: (
        <>
          <strong>scope는 외부 issuer용입니다.</strong> <code>insufficient_scope</code>는 <code>AKAN_MCP_SCOPES</code>를
          설정했을 때만 검사합니다. <code>libs/shared</code>를 마운트한 앱이 직접 발급하는 토큰에는 scope claim이
          없으므로, 그런 앱에 설정하면 그 토큰이 모두 <code>403</code>으로 거절됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Audience.</strong> A token with no <code>aud</code> is refused once an issuer is named and accepted
          while none is. An <code>aud</code> naming another resource is always refused.
        </>
      ),
      ko: (
        <>
          <strong>audience 검사.</strong> <code>aud</code>가 없는 토큰은 issuer가 지정된 뒤부터 거부되고, 지정되지 않은
          동안은 통과합니다. 다른 리소스를 가리키는 <code>aud</code>는 항상 거부됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Signature.</strong> The env vars cannot check a token's signature. Pass <code>auth.verify</code>{" "}
          through <code>setMcp()</code> so a forged token is refused instead of read as an anonymous caller;{" "}
          <code>libs/shared</code> does this for its own tokens.
        </>
      ),
      ko: (
        <>
          <strong>서명.</strong> env만으로는 토큰 서명을 검사하지 못합니다. <code>setMcp()</code>로{" "}
          <code>auth.verify</code>를 넘겨야 위조 토큰이 익명 호출자로 읽히지 않고 거부됩니다. <code>libs/shared</code>는
          자기 토큰에 이렇게 합니다.
        </>
      ),
    }),
  ];

  const tipNotes = [
    l.trans({
      en: (
        <>
          <strong>A tool is missing? The boot log is the only place the answer is,</strong> since there is no opt-in you
          could have forgotten. <code>MCP catalogue: tools=…</code> is followed by one line per refused endpoint with
          its reason, and both sit below the default level, so set <code>AKAN_PUBLIC_LOG_LEVEL=verbose</code>.
        </>
      ),
      ko: (
        <>
          <strong>툴이 안 보이면 부팅 로그를 보세요.</strong> 빠뜨릴 opt-in 자체가 없어서 답은 그 로그에만 있습니다.{" "}
          <code>MCP catalogue: tools=…</code> 아래에 거부된 엔드포인트마다 이유가 한 줄씩 나오는데, 둘 다 기본 로그
          레벨보다 낮으니 <code>AKAN_PUBLIC_LOG_LEVEL=verbose</code>로 켜세요.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            Write the model's <code>.desc()</code>
          </strong>{" "}
          in its dictionary <code>.of()</code>. Generated CRUD tools append it to "Get X", and the root list and insight
          use the <code>.of()</code> label and description; those entries have no other text.
        </>
      ),
      ko: (
        <>
          <strong>
            딕셔너리 <code>.of()</code>에 모델의 <code>.desc()</code>를 적으세요.
          </strong>{" "}
          생성된 CRUD 툴은 "Get X" 뒤에 그 설명을 붙이고, 루트 목록과 insight는 <code>.of()</code>의 라벨과 설명을
          그대로 씁니다. 이 항목들이 가질 수 있는 문구는 그것뿐입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Narrow by cost.</strong> MCP forbids a <code>$ref</code> across entries, so every entry inlines the
          schema of every model it mentions, and the whole listing is re-sent to every agent that connects. The
          per-signal <code>MCP catalogue cost:</code> line says where the bytes went;{" "}
          <code>{"mcp: { cru: false }"}</code> is the usual lever.
        </>
      ),
      ko: (
        <>
          <strong>비용을 보고 줄이세요.</strong> MCP는 항목 사이의 <code>$ref</code>를 금지하므로, 항목마다 언급한
          모델의 스키마를 통째로 인라인하고 그 목록 전체를 접속하는 에이전트마다 다시 보냅니다. 시그널별{" "}
          <code>MCP catalogue cost:</code> 줄이 바이트가 어디에 쓰였는지 알려 주고, 보통{" "}
          <code>{"mcp: { cru: false }"}</code>가 가장 큰 효과를 냅니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Caller mistakes read as caller mistakes.</strong> An undeclared argument answers{" "}
          <code>{'Unknown argument "x".'}</code> and a missing document{" "}
          <code>{"No <model> found for the arguments given."}</code> Only a genuine failure says the server failed.
        </>
      ),
      ko: (
        <>
          <strong>호출자의 실수는 호출자의 실수로 돌아갑니다.</strong> 선언하지 않은 인자는{" "}
          <code>{'Unknown argument "x".'}</code>, 없는 도큐먼트는{" "}
          <code>{"No <model> found for the arguments given."}</code>로 답합니다. 진짜 장애만 서버가 실패했다고 답합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            Bulky fields take <code>field.visual</code>.
          </strong>{" "}
          It is stripped from every MCP result and from the readable schema, so the two agree.
        </>
      ),
      ko: (
        <>
          <strong>
            덩치 큰 필드에는 <code>field.visual</code>을 쓰세요.
          </strong>{" "}
          모든 MCP 결과와 readable schema에서 함께 빠지므로 둘이 어긋나지 않습니다.
        </>
      ),
    }),
  ];

  const relatedLinks = [
    {
      href: "/cheatsheet/general/mcp-auth",
      title: l.trans({ en: "OAuth For Agents", ko: "에이전트를 위한 OAuth" }),
      desc: l.trans({
        en: "Where an agent's token comes from, and how to revoke it.",
        ko: "에이전트의 토큰이 어디서 오고 어떻게 폐기하는지 다룹니다.",
      }),
    },
    {
      href: "/docs/arch/agentic",
      title: l.trans({ en: "In-Page Agent", ko: "인페이지 에이전트" }),
      desc: l.trans({
        en: "The chat inside your own pages, a different surface from MCP.",
        ko: "내 페이지 안의 채팅입니다. MCP와는 다른 표면입니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "MCP Server", ko: "MCP 서버" })}>
        <Docs.Title>{l.trans({ en: "MCP Server", ko: "MCP 서버" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Every signal you already wrote is served to AI agents at <code>POST /mcp</code>. There is no second
                  API and nothing to add to a signal file: the same endpoint runs through the same guards, middleware
                  and service. The chat inside your own pages is a different surface, the{" "}
                  <Link href="/docs/arch/agentic" className="text-primary">
                    In-Page Agent
                  </Link>
                  .
                </span>
              ),
              ko: (
                <span>
                  이미 작성한 시그널이 <code>POST /mcp</code>에서 AI 에이전트에게 그대로 제공됩니다. 별도의 API도,
                  시그널 파일에 더 적을 것도 없이 같은 엔드포인트가 같은 가드, 미들웨어, 서비스를 거칩니다. 내 페이지
                  안의 채팅은 다른 표면인{" "}
                  <Link href="/docs/arch/agentic" className="text-primary">
                    인페이지 에이전트
                  </Link>
                  입니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />

          <Docs.SubSubTitle>{l.trans({ en: "What becomes what", ko: "무엇이 무엇으로 게시되나" })}</Docs.SubSubTitle>
          <Docs.Matrix
            type={l.trans({ en: "What you wrote", ko: "작성한 것" })}
            columns={kindColumns}
            groups={kindGroups}
            markLabel={l.trans({ en: "Published as", ko: "이렇게 게시됨" })}
            emptyLabel={l.trans({ en: "Not published as", ko: "해당 없음" })}
          />

          <Docs.SubSubTitle>
            {l.trans({ en: "When an endpoint is refused", ko: "엔드포인트가 거부되는 경우" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Exposure follows the guards, and there is no per-endpoint opt-in. An endpoint is published unless one of these applies, checked top to bottom:",
              ko: "노출은 가드를 따르며, 엔드포인트별 opt-in은 없습니다. 아래 조건을 위에서부터 확인해 하나도 해당하지 않으면 게시됩니다:",
            })}
          </div>
          <Docs.Table
            stacked
            columns={[
              { key: "when", label: l.trans({ en: "Refused when", ko: "거부 조건" }) },
              { key: "why", label: l.trans({ en: "Why, and what to do", ko: "이유와 대처" }) },
            ]}
            rows={refusalRows}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: (
                <span>
                  <strong>A refused tool looks exactly like a missing one.</strong> Both answer{" "}
                  <code>Unknown tool</code>, and a guard's refusal always reads{" "}
                  <code>You are not permitted to perform this action.</code> without naming the guard. Never make either
                  message more helpful: the difference would let a caller enumerate your private surface.
                </span>
              ),
              ko: (
                <span>
                  <strong>거부된 툴은 없는 툴과 똑같아 보입니다.</strong> 둘 다 <code>Unknown tool</code>로 답하고,
                  가드의 거절은 가드 이름 없이 항상 <code>You are not permitted to perform this action.</code>입니다. 두
                  메시지를 더 친절하게 만들지 마세요. 그 차이가 비공개 표면을 하나하나 알아내는 단서가 됩니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="enable" title={l.trans({ en: "1. Turn The Server On", ko: "1. 서버 켜기" })}>
        <Docs.Title>{l.trans({ en: "1. Turn The Server On", ko: "1. 서버 켜기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>/mcp</code> is mounted by default, so a new app already serves it. Change its settings in{" "}
                  <code>lib/option.ts</code> with <code>setMcp()</code>, not in <code>main.ts</code>:
                </span>
              ),
              ko: (
                <span>
                  <code>/mcp</code>는 기본으로 마운트되므로 새 앱도 이미 제공하고 있습니다. 설정은 <code>main.ts</code>
                  가 아니라 <code>lib/option.ts</code>에서 <code>setMcp()</code>로 바꿉니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/option.ts"
            code={`export const option = new AkanOption<ModulesOptions>().setMcp({
  instructions: "Task tracking for one team. Start from taskListInTodo.",
  language: "en",
  outputSchema: "shallow",
});

// A value decided at boot takes a function of the env.server.* options:
//   .setMcp(() => ({ readOnly: getEnv().environment === "debug" }))`}
          />
          <ul className={bulletList}>
            {enableNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Options", ko: "옵션" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={optionRows} />
          <ul className={bulletList}>
            {optionNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tool" title={l.trans({ en: "2. Write An Endpoint", ko: "2. 엔드포인트 작성하기" })}>
        <Docs.Title>{l.trans({ en: "2. Write An Endpoint", ko: "2. 엔드포인트 작성하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Name the guards and you are done. A custom <code>query</code> or <code>mutation</code> with a real
                  guard is published as a tool:
                </span>
              ),
              ko: (
                <span>
                  가드만 적으면 끝입니다. 실제 가드가 붙은 커스텀 <code>query</code>나 <code>mutation</code>은 툴로
                  게시됩니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/task/task.signal.ts"
            code={`export class TaskEndpoint extends endpoint(srv.task, ({ query, mutation }) => ({
  taskSummary: query(cnst.TaskInsight, { guards: [SignedIn] })
    .search("status", cnst.TaskStatus)
    .exec(async function (status) {
      return await this.taskService.insightByStatuses([status ?? "todo"]);
    }),
  startTask: mutation(cnst.Task, { guards: [CanWriteTask] })
    .param("taskId", ID)
    .exec(async function (taskId) {
      return await this.taskService.startTask(taskId);
    }),
})) {}`}
          />
          <Docs.IntroTable type={l.trans({ en: "Tool part", ko: "툴 구성" })} items={toolPartRows} />
          <div>
            {l.trans({
              en: "Write the dictionary entry in the same change:",
              ko: "딕셔너리 항목도 같은 변경에서 함께 씁니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/task/task.dictionary.ts"
            code={`.endpoint<TaskEndpoint>((fn) => ({
  startTask: fn(["Start Task", "작업 시작"])
    .desc(["Moves one task from todo to in progress", "할 일 하나를 진행중으로 옮깁니다"])
    .arg((t) => ({
      taskId: t(["Task ID", "할 일 ID"]).desc(["The task to start", "시작할 할 일"]),
    })),
}))`}
          />
          <ul className={bulletList}>
            {dictionaryNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="slice" title={l.trans({ en: "3. Slices And CRUD", ko: "3. 슬라이스와 CRUD" })}>
        <Docs.Title>{l.trans({ en: "3. Slices And CRUD", ko: "3. 슬라이스와 CRUD" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The generated reads and CRUD publish through the <code>slice()</code> guards map. A named slice does
                  not inherit that map: write its own guards, or it is not published.
                </span>
              ),
              ko: (
                <span>
                  생성된 조회와 CRUD는 <code>slice()</code>의 guards 맵으로 게시됩니다. 이름 있는 슬라이스는 그 맵을
                  물려받지 않으므로, 자기 가드를 직접 적어야 게시됩니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Generated entry", ko: "생성되는 항목" })} items={sliceEntryRows} />
          <div>
            {l.trans({
              en: (
                <span>
                  To keep an entry off the shelf, use <code>mcp: false</code>. On <code>slice()</code> it is a map keyed
                  like <code>guards</code>:
                </span>
              ),
              ko: (
                <span>
                  항목을 선반에서 빼려면 <code>mcp: false</code>를 씁니다. <code>slice()</code>에서는{" "}
                  <code>guards</code>와 같은 키의 맵입니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/task/task.signal.ts"
            code={`export class TaskSlice extends slice(
  srv.task,
  {
    guards: { root: Admin, get: SignedIn, cru: SignedIn },
    mcp: { cru: false }, // [!code highlight]
  },
  (init) => ({
    inTodo: init({ guards: [SignedIn] }).exec(function () {
      return this.taskService.queryByStatuses(["todo"]);
    }),
  }),
) {}

// A named slice and a custom endpoint carry a plain boolean, never the map:
//   inArchive: init({ guards: [SignedIn], mcp: false })
//   requestPhoneCode: mutation(Boolean, { guards: [SignedIn], mcp: false })`}
          />
          <ul className={bulletList}>
            {mcpFalseNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Resource URIs", ko: "리소스 URI" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Every published generated read also gets a URI a client can read directly:",
              ko: "게시된 생성 조회에는 클라이언트가 바로 읽을 수 있는 URI도 붙습니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title={l.trans({ en: "Generated resource URIs", ko: "생성되는 리소스 URI" })}
            language="markdown"
            code={`akan://task/{taskId}
akan://task/list{?queryKey,skip,limit,sort}
akan://task/list/inTodo{?skip,limit,sort}`}
          />
          <ul className={bulletList}>
            {uriNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.Alert type="info">
            {l.trans({
              en: (
                <span>
                  <strong>The root list filters by name only.</strong> <code>queryKey</code> takes one of the model's
                  filter names, but <code>args</code> is typed <code>Any</code>, so it is left out of the schema and a
                  value sent for it is refused. Declare a named filter slice when an agent should pass a filter's
                  arguments.
                </span>
              ),
              ko: (
                <span>
                  <strong>루트 목록은 filter 이름으로만 좁힙니다.</strong> <code>queryKey</code>는 모델의 filter 이름
                  하나를 받지만, <code>args</code>는 <code>Any</code>라 스키마에서 빠지고 값을 보내면 거부됩니다.
                  에이전트가 filter 인자까지 넘겨야 한다면 이름 있는 filter 슬라이스를 선언하세요.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="prompt"
        title={l.trans({ en: "4. Publish A Screen As A Prompt", ko: "4. 화면을 프롬프트로 게시하기" })}
      >
        <Docs.Title>
          {l.trans({ en: "4. Publish A Screen As A Prompt", ko: "4. 화면을 프롬프트로 게시하기" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A prompt is a screen, not an endpoint. Declare it on the page with{" "}
                  <code>.prompt(name, description)</code>: the user runs it as a slash command, and the model receives
                  what the page loads:
                </span>
              ),
              ko: (
                <span>
                  프롬프트는 엔드포인트가 아니라 화면입니다. 페이지에 <code>.prompt(name, description)</code>으로
                  선언하면, 사용자가 슬래시 커맨드로 실행하고 모델은 그 페이지가 불러온 데이터를 받습니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/page/project/[projectId]/tickets.tsx"
            code={`export default page()
  .param("projectId", ID, { desc: "The project to brief." })
  .search("statuses", [String], { desc: "Statuses to include." })
  .prompt("briefProjectTickets", "Brief the ticket board of one project.")
  .render(async ({ projectId, statuses }) => {
    const [{ project }, { ticketInitInProject }] = await Promise.all([
      fetch.viewProject(projectId),
      fetch.initTicketInProject(projectId, statuses),
    ]);
    return (
      <>
        <Project.View.General project={project} />
        <Ticket.Zone.Card init={ticketInitInProject} projectId={projectId} />
      </>
    );
  });`}
          />
          <ul className={bulletList}>
            {promptNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "What prompts/get sends back", ko: "prompts/get이 돌려주는 것" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>prompts/get</code> runs the page body (root layouts, layouts, then <code>render</code>) in the
                  RSC worker under the caller's bearer token. Nothing is rendered and no client component runs; each{" "}
                  <code>fetch.*</code> query the page makes becomes part of the answer:
                </span>
              ),
              ko: (
                <span>
                  <code>prompts/get</code>은 페이지 body(root layout, layout, 그다음 <code>render</code>)를 호출자의
                  bearer 토큰으로 RSC worker에서 실행합니다. 렌더링은 하지 않고 클라이언트 컴포넌트도 돌지 않습니다.
                  페이지가 보낸 <code>fetch.*</code> 조회 하나하나가 응답이 됩니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Part", ko: "구성" })} items={promptMessageRows} />
          <div>
            {l.trans({
              en: (
                <span>
                  One document read in two shapes, such as a layout's <code>project</code> and a page's{" "}
                  <code>lightProject</code>, is attached once, as the larger.
                </span>
              ),
              ko: (
                <span>
                  layout의 <code>project</code>와 page의 <code>lightProject</code>처럼 같은 도큐먼트를 두 모양으로
                  읽으면, 더 큰 쪽 하나만 첨부합니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="prompt-failures"
        title={l.trans({ en: "When A Prompt Cannot Run", ko: "프롬프트를 실행할 수 없을 때" })}
      >
        <Docs.Title>{l.trans({ en: "When A Prompt Cannot Run", ko: "프롬프트를 실행할 수 없을 때" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A prompt cannot re-run itself and has no fallback context, so every way a screen can decline comes back as a message the caller can act on. Each of these answers instead of the page's data:",
              ko: "프롬프트는 스스로 다시 실행할 수 없고 대신 쓸 컨텍스트도 없습니다. 그래서 화면이 거절하는 모든 경우는 호출자가 다음 행동을 고를 수 있는 메시지로 돌아옵니다. 아래 응답은 페이지 데이터 대신 나갑니다:",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "What happened", ko: "상황" })} items={failureRows} />
          <ul className={bulletList}>
            {failureNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="progress" title={l.trans({ en: "5. Report Progress", ko: "5. 진행률 보고하기" })}>
        <Docs.Title>{l.trans({ en: "5. Report Progress", ko: "5. 진행률 보고하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A long tool call can stream progress to the client. Report from wherever the work happens: outside a
                  streamed call <code>report</code> does nothing, so the same service runs unchanged over HTTP, a
                  websocket and in tests:
                </span>
              ),
              ko: (
                <span>
                  오래 걸리는 툴 호출은 클라이언트에 진행률을 스트리밍할 수 있습니다. 실제 작업이 일어나는 곳에서
                  보고하세요. 스트리밍 호출이 아니면 <code>report</code>는 아무것도 하지 않으므로, 같은 서비스가 HTTP,
                  웹소켓, 테스트에서 그대로 동작합니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/lib/task/task.service.ts"
            code={`import { McpProgress } from "akanjs/signal";

export class TaskService extends serve(db.task, () => ({})) {
  async importTasks(rows: cnst.TaskInput[]) {
    for (const [idx, row] of rows.entries()) {
      McpProgress.report(idx + 1, {
        total: rows.length,
        message: \`importing \${row.title}\`,
      });
      await this.createTask(row);
    }
    return rows.length;
  }
}`}
          />
          <ul className={bulletList}>
            {progressNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="auth" title={l.trans({ en: "Authorization", ko: "인증과 권한" })}>
        <Docs.Title>{l.trans({ en: "Authorization", ko: "인증과 권한" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  MCP arrives over HTTP and runs the ordinary pipeline, so guards, <code>Self</code> and the account
                  middleware behave as they do for a browser. One difference: the cookie header is dropped at the door,
                  so the <code>Authorization</code> header is the only credential.
                </span>
              ),
              ko: (
                <span>
                  MCP는 HTTP로 들어와 평소의 파이프라인을 그대로 탑니다. 가드, <code>Self</code>, account 미들웨어는
                  브라우저 호출과 똑같이 동작합니다. 다른 점은 하나, cookie 헤더를 입구에서 버리므로 받는 자격 증명은{" "}
                  <code>Authorization</code> 헤더뿐입니다.
                </span>
              ),
            })}
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "What a caller is shown", ko: "호출자에게 보이는 목록" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Every guard declares <code>static scope</code>, with no default. It decides whether the guard can hide
                  an entry from a caller's listing:
                </span>
              ),
              ko: (
                <span>
                  모든 가드는 기본값 없이 <code>static scope</code>를 선언합니다. 이 값이 가드가 호출자의 목록에서
                  항목을 숨길 수 있는지 정합니다:
                </span>
              ),
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Guard", ko: "가드" })}
            columns={scopeColumns}
            groups={scopeGroups}
            markLabel={l.trans({ en: "Yes", ko: "예" })}
            emptyLabel={l.trans({ en: "No", ko: "아니오" })}
          />
          <div>
            {l.trans({
              en: "The listing is only a convenience filter; the call still runs every guard.",
              ko: "목록은 편의를 위한 필터일 뿐이고, 호출은 여전히 모든 가드를 거칩니다.",
            })}
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "Where tokens come from", ko: "토큰은 어디서 오나" })}</Docs.SubSubTitle>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {issuerCards.map(({ title, desc, chip }) => (
              <div key={chip} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="mb-1 font-semibold text-primary">{title}</div>
                <div className="text-foreground/70 text-sm">{desc}</div>
                <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs">
                  {chip}
                </code>
              </div>
            ))}
          </div>
          <div>
            {l.trans({
              en: "For somebody else's issuer, set these in the deployment env:",
              ko: "외부 issuer를 쓸 때는 배포 env에 다음을 설정합니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title={l.trans({ en: "OAuth resource server, by env", ko: "OAuth 리소스 서버, env로" })}
            language="bash"
            code={`AKAN_MCP_AUTH_SERVERS=https://auth.example.com
AKAN_MCP_SCOPES=akan.read,akan.write
AKAN_MCP_RESOURCE=https://api.example.com/mcp`}
          />
          <ul className={bulletList}>
            {tokenNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <div>
            {l.trans({
              en: (
                <span>
                  How an agent obtains a token from an app mounting <code>libs/shared</code>, step by step:{" "}
                  <Link href="/cheatsheet/general/mcp-auth" className="text-primary">
                    OAuth For Agents
                  </Link>
                  .
                </span>
              ),
              ko: (
                <span>
                  <code>libs/shared</code>를 마운트한 앱에서 에이전트가 토큰을 받는 과정은{" "}
                  <Link href="/cheatsheet/general/mcp-auth" className="text-primary">
                    에이전트를 위한 OAuth
                  </Link>
                  에서 단계별로 다룹니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className={bulletList}>
            {tipNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.LinkGrid items={relatedLinks} />
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
