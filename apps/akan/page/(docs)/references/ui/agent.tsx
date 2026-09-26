import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, type UiComponentReference, UiComponentSlide } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const noteList = "my-2 list-disc space-y-1.5 pl-5 text-foreground/80";
  const codeChip =
    "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const termRows = [
    {
      name: l.trans({ en: "tool", ko: "툴 (tool)" }),
      desc: l.trans({
        en: "One action a component publishes with `st.tool`, usually the handler its button calls.",
        ko: "컴포넌트가 `st.tool`로 공개한 동작 하나입니다. 보통 버튼이 이미 부르는 핸들러입니다.",
      }),
    },
    {
      name: l.trans({ en: "surface", ko: "표면 (surface)" }),
      desc: l.trans({
        en: "Everything the agent can do and read on the current screen: the mounted tools and keys.",
        ko: "지금 화면에서 에이전트가 실행하고 읽을 수 있는 것 전부, 즉 마운트된 툴과 키입니다.",
      }),
    },
    {
      name: l.trans({ en: "session", ko: "세션 (session)" }),
      desc: l.trans({
        en: "One conversation with its loop and options. `Agent.Chat` and `Agent.Zone` each build one.",
        ko: "루프와 옵션을 가진 대화 하나입니다. `Agent.Chat`과 `Agent.Zone`이 각자 하나씩 만듭니다.",
      }),
    },
    {
      name: l.trans({ en: "transcript", ko: "대화 기록 (transcript)" }),
      desc: l.trans({
        en: "The conversation so far. It is sent to the model again on every turn.",
        ko: "지금까지의 대화입니다. 매 턴마다 모델에 다시 전송됩니다.",
      }),
    },
    {
      name: l.trans({ en: "built-ins", ko: "기본 툴 (builtins)" }),
      desc: l.trans({
        en: "Runtime tools every screen gets: `navigate`, `goBack`, `readScreen`, `readState`, `highlight`.",
        ko: "런타임이 모든 화면에 넣어 주는 툴입니다. `navigate`, `goBack`, `readScreen`, `readState`, `highlight`.",
      }),
    },
    {
      name: l.trans({ en: "resource", ko: "리소스 (resource)" }),
      desc: l.trans({
        en: "A value a component publishes with `st.expose` or `st.useState` for the agent to read.",
        ko: "컴포넌트가 `st.expose`나 `st.useState`로 공개해 에이전트가 읽을 수 있게 한 값입니다.",
      }),
    },
  ];

  const memberColumns = [
    { key: "ui", label: l.trans({ en: "Own UI", ko: "자체 UI" }) },
    { key: "session", label: l.trans({ en: "Own chat", ko: "자기 대화" }) },
    { key: "prefix", label: l.trans({ en: "Name prefix", ko: "이름 접두사" }) },
  ];

  const memberGroups = [
    {
      label: l.trans({ en: "What the user talks to", ko: "사용자가 대화하는 곳" }),
      rows: [
        {
          name: "Agent.Chat",
          desc: l.trans({
            en: "The chat panel: launcher, transcript, composer and approval card. Mount it once.",
            ko: "채팅 패널입니다. 런처, 대화창, 입력창, 승인 카드가 들어 있고 한 번만 마운트합니다.",
          }),
          marks: { ui: true, session: true, prefix: false },
        },
        {
          name: "Agent.Zone",
          desc: l.trans({
            en: "A section with its own conversation over a narrowed view of the same screen.",
            ko: "같은 화면을 좁혀 보는, 자기 대화를 가진 구획입니다.",
          }),
          marks: { ui: false, session: true, prefix: true },
        },
      ],
    },
    {
      label: l.trans({ en: "Guidance and scope", ko: "지침과 범위" }),
      rows: [
        {
          name: "Agent.Guide",
          desc: l.trans({
            en: "Standing instructions for a route subtree. Renders nothing.",
            ko: "라우트 하위 트리에 상시 적용되는 지침입니다. 아무것도 그리지 않습니다.",
          }),
          marks: { ui: false, session: false, prefix: false },
        },
        {
          name: "Agent.History",
          desc: l.trans({
            en: "Connects the enclosing zone's transcript to storage the app owns. Renders nothing.",
            ko: "감싸고 있는 zone의 대화 기록을 앱의 저장소에 연결합니다. 아무것도 그리지 않습니다.",
          }),
          marks: { ui: false, session: false, prefix: false },
        },
        {
          name: "Agent.Skip",
          desc: l.trans({
            en: "A region the default screen read leaves out, named so it can still be asked for.",
            ko: "기본 화면 읽기에서 빠지는 영역입니다. 이름이 있어서 필요하면 따로 읽을 수 있습니다.",
          }),
          marks: { ui: false, session: false, prefix: false },
        },
        {
          name: "Agent.Scope",
          desc: l.trans({
            en: "Prefixes the tools and resources below it, without opening a conversation.",
            ko: "대화를 열지 않고, 아래에서 등록되는 툴과 리소스 이름에 접두사만 붙입니다.",
          }),
          marks: { ui: false, session: false, prefix: true },
        },
      ],
    },
    {
      label: l.trans({ en: "Development", ko: "개발용" }),
      rows: [
        {
          name: "Agent.Dock",
          desc: l.trans({
            en: "The development inspector: tools, readable state, withheld keys and the transcript.",
            ko: "개발용 인스펙터입니다. 툴, 읽을 수 있는 상태, 보류된 키, 대화 기록을 보여 줍니다.",
          }),
          marks: { ui: true, session: false, prefix: false },
        },
        {
          name: <span className="font-sans">{l.trans({ en: "Dock parts", ko: "도크 부품" })}</span>,
          desc: l.trans({
            en: "`Agent.Context`, `Agent.Section`, `Agent.StateKey`, `Agent.Tool`, `Agent.Transcript`: the dock's pieces, for an inspector of your own.",
            ko: "`Agent.Context`, `Agent.Section`, `Agent.StateKey`, `Agent.Tool`, `Agent.Transcript`입니다. 직접 인스펙터를 조립할 때 씁니다.",
          }),
          marks: { ui: true, session: false, prefix: false },
        },
      ],
    },
  ];

  const nextReads = [
    {
      href: "/docs/arch/agentic",
      title: l.trans({ en: "In-Page Agent", ko: "인페이지 에이전트" }),
      desc: l.trans({
        en: "How the loop, the surface, the approval gate and compaction fit together.",
        ko: "루프, 표면, 승인 게이트, 압축이 어떻게 맞물리는지 설명합니다.",
      }),
    },
    {
      href: "/cheatsheet/interface/agent-chat",
      title: l.trans({ en: "Agent Chat Cheatsheet", ko: "에이전트 채팅 치트시트" }),
      desc: l.trans({
        en: "The short version: mount, configure, declare a tool, ship.",
        ko: "짧은 버전입니다. 마운트하고, 설정하고, 툴을 선언하고, 배포합니다.",
      }),
    },
  ];

  const chatSessionProps = [
    {
      key: "instructions",
      type: "string",
      desc: l.trans({
        en: "App-wide framing. Route guidance from mounted `Agent.Guide`s layers on top of it.",
        ko: "앱 전역 지침입니다. 라우트별 지침은 마운트된 `Agent.Guide`가 그 위에 겹칩니다.",
      }),
    },
    {
      key: "runner",
      type: "AgentRunner",
      default: "fetchRunner()",
      desc: l.trans({
        en: "Swaps the transport. The default posts to `runAgentTurn`; `httpRunner({ url })` posts elsewhere.",
        ko: "전송 방식을 바꿉니다. 기본값은 앱의 `runAgentTurn`으로 보내고, `httpRunner({ url })`는 다른 주소로 보냅니다.",
      }),
    },
    {
      key: "maxTurns",
      type: "number",
      default: "12",
      desc: l.trans({
        en: "Model round trips one ask may spend. At the limit, the chat asks the user whether to keep going.",
        ko: "질문 하나가 쓸 수 있는 모델 왕복 횟수입니다. 한도에 닿으면 계속할지 사용자에게 묻습니다.",
      }),
    },
    {
      key: "compact",
      type: "CompactOptions",
      default: "{ at: 24_000, keep: 6, buffer: 13_000 }",
      desc: l.trans({
        en: "Summarizes past `at` estimated tokens or `buffer` short of the known window. `{ at: 0 }` turns it off.",
        ko: "추정 토큰이 `at`을 넘거나 알려진 창까지 `buffer`만 남으면 요약합니다. `{ at: 0 }`이면 끕니다.",
      }),
    },
    {
      key: "builtins",
      type: "BuiltinOption",
      default: "true",
      desc: l.trans({
        en: "`true` gives all five built-ins, `false` none, an array only those named. `askUser` always stays.",
        ko: "`true`면 기본 툴 다섯 개 전부, `false`면 없음, 배열이면 적은 것만 줍니다. `askUser`는 항상 남습니다.",
      }),
    },
    {
      key: "persist",
      type: "PersistOption | SessionHistory",
      desc: l.trans({
        en: 'Transcript survives reloads in sessionStorage; `{ storage: "local" }` or `SessionHistory` moves it.',
        ko: '새로고침해도 대화 기록이 남도록 sessionStorage에 저장합니다. `{ storage: "local" }`이나 `SessionHistory`를 주면 다른 곳에 둡니다.',
      }),
    },
    {
      key: "onCompact",
      type: "(replaced, summary) => void",
      desc: l.trans({
        en: "Runs after a compaction replaced messages with one summary; a host syncs its own watermark here.",
        ko: "압축이 메시지들을 요약 하나로 바꾼 뒤 호출됩니다. 앱이 자기 워터마크를 맞추는 자리입니다.",
      }),
    },
    {
      key: "visual",
      type: "boolean | AgentVisualOption",
      default: "true",
      desc: l.trans({
        en: "Rings the calling control (`reveal`) and a pointer presses it (`cursor`). `false` turns both off.",
        ko: "호출한 컨트롤에 링을 두르고(`reveal`) 포인터가 눌러 보입니다(`cursor`). `false`면 둘 다 끕니다.",
      }),
    },
  ];

  const chatOpenProps = [
    {
      key: "defaultOpen",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "Starts the panel open. The chat keeps its own open state after that.",
        ko: "패널을 열린 채로 시작합니다. 그 뒤의 열림 상태는 채팅이 스스로 관리합니다.",
      }),
    },
    {
      key: "open / onOpenChange",
      type: "boolean / (open) => void",
      desc: l.trans({
        en: "Open state the app controls. `open` alone draws no close button.",
        ko: "앱이 제어하는 열림 상태입니다. `open`만 주면 닫기 버튼을 그리지 않습니다.",
      }),
    },
    {
      key: "launcher",
      type: "boolean",
      default: "true",
      desc: l.trans({
        en: "`false` draws no launcher, for an app that opens the panel from a control of its own.",
        ko: "`false`면 런처를 그리지 않습니다. 자기 컨트롤로 패널을 여는 앱을 위한 옵션입니다.",
      }),
    },
    {
      key: "inline",
      type: "boolean",
      default: "false",
      desc: l.trans({
        en: "Renders in the page flow instead of floating, for a zone chat inside its own section.",
        ko: "떠 있지 않고 페이지 흐름 안에 그립니다. 자기 구획 안에 두는 zone 채팅용입니다.",
      }),
    },
    {
      key: "shortcut",
      type: "boolean",
      default: "true",
      desc: l.trans({
        en: "Cmd/Ctrl+L opens the panel. `false` gives the chord back, for a shell that already uses it.",
        ko: "Cmd/Ctrl+L로 패널을 엽니다. 이 단축키를 이미 쓰는 앱이라면 `false`로 브라우저에 돌려줍니다.",
      }),
    },
  ];

  const chatLookProps = [
    {
      key: "className",
      type: "string",
      desc: l.trans({
        en: "Reaches whichever surface is showing: the launcher while closed, the panel while open.",
        ko: "지금 보이는 쪽에 붙습니다. 닫혀 있으면 런처, 열려 있으면 패널입니다.",
      }),
    },
    {
      key: "launcherClassName / panelClassName",
      type: "string",
      desc: l.trans({
        en: "Styles one surface each, where `className` reaches both.",
        ko: "런처와 패널에 각각 따로 붙습니다. `className`은 둘 모두에 붙습니다.",
      }),
    },
    {
      key: "title",
      type: "string",
      desc: l.trans({
        en: 'Panel heading. Left out, it reads "Agent" in the user\'s language.',
        ko: "패널 제목입니다. 생략하면 사용자 언어로 '에이전트'가 나옵니다.",
      }),
    },
    {
      key: "intro",
      type: "ReactNode",
      desc: l.trans({
        en: "Replaces the intro line while the transcript is empty. Starter questions go here.",
        ko: "대화 기록이 비어 있는 동안 기본 안내 문구 대신 보입니다. 시작 질문을 두는 자리입니다.",
      }),
    },
    {
      key: "header / chrome",
      type: "ReactNode / boolean",
      default: "chrome = true",
      desc: l.trans({
        en: "Controls left of clear and close. `chrome={false}` drops the whole bar, leaving `/new` to clear.",
        ko: "지우기·닫기 버튼 왼쪽에 컨트롤을 더합니다. `chrome={false}`면 헤더 바를 없애고, 지우기는 `/new`로 합니다.",
      }),
    },
  ];

  const chatComposerProps = [
    {
      key: "defaultDraft",
      type: "string",
      desc: l.trans({
        en: "Composer text read once at mount, e.g. a `?prompt=` value to prefill without sending it.",
        ko: "마운트할 때 한 번 읽는 입력창 초기 문구입니다. `?prompt=` 값을 보내지 않고 채워 둘 때 씁니다.",
      }),
    },
    {
      key: "attach",
      type: "AttachReader",
      desc: l.trans({
        en: "Turns a file into an attachment; `null` falls back to the built-in reader for images and text.",
        ko: "파일을 첨부물로 만듭니다. `null`을 돌려주면 이미지와 텍스트를 읽는 기본 리더가 처리합니다.",
      }),
    },
    {
      key: "attachLimits",
      type: "{ perFileBytes?, perMessageBytes?, perMessageCount? }",
      desc: l.trans({
        en: "Size and count caps. Defaults: 4 MB per file, 8 MB and five files per message.",
        ko: "크기와 개수 한도입니다. 기본값은 파일당 4MB, 메시지당 8MB와 5개입니다.",
      }),
    },
    {
      key: "reference / mentions",
      type: "ReferenceSource[] / boolean",
      desc: l.trans({
        en: "`@` menu sources, each with a `search`. `mentions` draws pointers as names, on when sources exist.",
        ko: "`@` 메뉴의 대상이며 각자 `search`를 가집니다. `mentions`는 포인터를 이름으로 그리고, 대상이 있으면 켜집니다.",
      }),
    },
    {
      key: "voice",
      type: "VoiceEngine",
      desc: l.trans({
        en: "Press-to-talk into the composer. Replies are read aloud only when the question was spoken.",
        ko: "눌러서 말한 내용이 입력창에 들어갑니다. 음성으로 물었을 때만 답을 소리 내어 읽습니다.",
      }),
    },
  ];

  const chatNotes = [
    l.trans({
      en: (
        <>
          <strong>Closing the panel keeps the conversation.</strong> The session lives in a ref, so it survives
          reopening; without <code>persist</code> it ends with the page.
        </>
      ),
      ko: (
        <>
          <strong>패널을 닫아도 대화는 남습니다.</strong> 세션이 ref에 들어 있어 다시 열어도 이어지고,{" "}
          <code>persist</code>가 없으면 페이지와 함께 사라집니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Function props need a small client component.</strong> <code>attach</code>, <code>voice</code>,{" "}
          <code>reference</code>, <code>runner</code>, <code>onCompact</code> and <code>onOpenChange</code> carry
          functions, which cannot cross the RSC boundary from a server layout. Wrap the chat in <code>ui/</code> the way{" "}
          <code>apps/akan/ui/DocsAgentChat.tsx</code> does with <code>useSpeech()</code> from{" "}
          <code>@libs/util/webkit</code>.
        </>
      ),
      ko: (
        <>
          <strong>함수를 넘기는 prop은 작은 클라이언트 컴포넌트가 필요합니다.</strong> <code>attach</code>,{" "}
          <code>voice</code>, <code>reference</code>, <code>runner</code>, <code>onCompact</code>,{" "}
          <code>onOpenChange</code>는 함수를 담고 있어 서버 레이아웃에서 RSC 경계를 넘길 수 없습니다.{" "}
          <code>apps/akan/ui/DocsAgentChat.tsx</code>처럼 <code>ui/</code>에 감싸는 컴포넌트를 두고, 음성 엔진은{" "}
          <code>@libs/util/webkit</code>의 <code>useSpeech()</code>로 만듭니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            A controlled <code>open</code> alone stays server-safe.
          </strong>{" "}
          Without <code>onOpenChange</code> no function is passed, so a server component can still render it.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>open</code>만 주는 제어 방식은 서버 컴포넌트에서도 쓸 수 있습니다.
          </strong>{" "}
          <code>onOpenChange</code>가 없으면 넘기는 함수가 없으므로 그대로 조립할 수 있습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>The launcher appears after hydration.</strong> The panel is a <code>lazy(…, {"{ ssr: false }"})</code>{" "}
          boundary, so its chunk loads once the page has hydrated. That is normal.
        </>
      ),
      ko: (
        <>
          <strong>런처는 하이드레이션 뒤에 나타납니다.</strong> 패널이 <code>lazy(…, {"{ ssr: false }"})</code> 경계라서
          코드 청크가 하이드레이션이 끝난 뒤에 로드됩니다. 정상 동작입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            Server settings live in <code>lib/option.ts</code>.
          </strong>{" "}
          <code>option.setLlm({"{ apiKey, model, host }"})</code> and <code>option.setAgentAccess(SignedIn)</code>{" "}
          configure it, never environment variables.
        </>
      ),
      ko: (
        <>
          <strong>
            서버 설정은 <code>lib/option.ts</code>에서 합니다.
          </strong>{" "}
          <code>option.setLlm({"{ apiKey, model, host }"})</code>와 <code>option.setAgentAccess(SignedIn)</code>
          으로 설정하며, 환경 변수로는 하지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            Answer <code>data</code> when the provider cannot reach a <code>url</code>.
          </strong>{" "}
          The provider fetches an <code>attach</code> result's <code>url</code> itself. Answering both sends the bytes
          to the model and keeps the address for the thumbnail.
        </>
      ),
      ko: (
        <>
          <strong>
            프로바이더가 닿지 못하는 <code>url</code>이면 <code>data</code>를 돌려주세요.
          </strong>{" "}
          <code>attach</code> 결과의 <code>url</code>은 프로바이더가 직접 가져갑니다. 둘 다 돌려주면 모델에는 바이트가
          가고, 주소는 썸네일에 쓰입니다.
        </>
      ),
    }),
  ];

  const dockSections = [
    {
      name: "Tools",
      desc: l.trans({
        en: "Did this screen publish what its author meant, under the names the instructions use?",
        ko: "이 화면이 작성자가 의도한 툴을, 지침에 적힌 이름 그대로 공개했는가?",
      }),
    },
    {
      name: "State",
      desc: l.trans({
        en: "Which keys are readable right now, and what does one actually return when read?",
        ko: "지금 읽을 수 있는 키는 무엇이고, 실제로 읽으면 무엇이 나오는가?",
      }),
    },
    {
      name: "Context",
      desc: l.trans({
        en: "What would the next turn carry? Assemble prints the tool names, guides and context blocks.",
        ko: "다음 턴에 무엇이 실리는가? Assemble 버튼이 툴 이름, 지침, 컨텍스트 블록을 찍어 줍니다.",
      }),
    },
    {
      name: "Withheld",
      desc: l.trans({
        en: "Which keys were refused, and for what reason.",
        ko: "어떤 키가 거절되었고, 그 이유는 무엇인가?",
      }),
    },
    {
      name: "Transcript",
      desc: l.trans({
        en: "What has the agent already done to this page?",
        ko: "에이전트가 이 페이지에 이미 무엇을 했는가?",
      }),
    },
  ];

  const dockParts = [
    {
      key: "Agent.Dock",
      type: "{ className?, bridge?, surface?, open? }",
      desc: l.trans({
        en: "The whole panel: `bridge` supplies the state keys, `surface` the tools, `open` expands Tools.",
        ko: "패널 전체입니다. `bridge`는 상태 키를, `surface`는 툴 목록을 제공하고, `open`은 Tools를 펼칩니다.",
      }),
    },
    {
      key: "Agent.Context",
      type: "{ className? }",
      desc: l.trans({
        en: "An Assemble button that prints what a turn would carry: tool names, guides, context blocks.",
        ko: "턴에 실릴 내용을 찍어 보여 주는 Assemble 버튼입니다. 툴 이름, 지침, 컨텍스트 블록이 나옵니다.",
      }),
    },
    {
      key: "Agent.Section",
      type: "{ className?, title, count, children, open? }",
      desc: l.trans({
        en: "One collapsible `<details>` group with a count beside its title. The dock draws five.",
        ko: "제목 옆에 개수가 붙는 접이식 `<details>` 그룹입니다. 도크는 이것을 다섯 개 그립니다.",
      }),
    },
    {
      key: "Agent.StateKey",
      type: "{ className?, bridge, name, entry, live? }",
      desc: l.trans({
        en: "One readable key, read and masked on click, so an object no model claims is refused here.",
        ko: "읽을 수 있는 키 하나입니다. 누를 때 읽고 마스킹하므로, 어떤 모델에도 속하지 않은 객체는 여기서 거절됩니다.",
      }),
    },
    {
      key: "Agent.Tool",
      type: "{ className?, surface, tool, onRun }",
      desc: l.trans({
        en: "One declared tool with its arguments as JSON, and a Run button that calls it in the running app.",
        ko: "선언된 툴 하나를 인자 JSON과 함께 보여 주고, Run 버튼으로 실행 중인 앱에서 호출합니다.",
      }),
    },
    {
      key: "Agent.Transcript",
      type: "{ className?, calls }",
      desc: l.trans({
        en: "What the agent did, oldest first, to check against what the page did. There is no undo.",
        ko: "에이전트가 한 일을 오래된 것부터 보여 주어 화면에서 본 것과 맞춰 보게 합니다. 되돌리기는 없습니다.",
      }),
    },
  ];

  const chatSlots = [
    "AgentLauncher",
    "AgentBubble",
    "AgentSteps",
    "AgentComposer",
    "AgentApproval",
    "AgentQuestion",
    "AgentQueued",
    "AgentMenu",
    "AgentMarkdown",
    "AgentToolCard",
    "AgentCode",
  ];

  const components: UiComponentReference[] = [
    {
      name: "Zone",
      desc: l.trans({
        en: "A section with its own conversation over a narrowed view of the same screen. An `Agent.Chat` inside binds to it automatically, so two zones on one screen run two conversations side by side, each seeing only its own subtree.",
        ko: "같은 화면을 좁혀 보는, 자기 대화를 가진 구획입니다. 안에 둔 `Agent.Chat`은 자동으로 이 zone에 묶이므로, 한 화면의 zone 두 개는 각자 자기 하위 트리만 보면서 대화 두 개를 나란히 돌립니다.",
      }),
      props: [
        {
          name: "id",
          type: "string",
          desc: l.trans({
            en: "Required. Sets the name prefix and `data-agent-zone`; characters outside `A-Za-z0-9_-` become `-`.",
            ko: "필수입니다. 이름 접두사와 `data-agent-zone` 값이 여기서 나오며, `A-Za-z0-9_-` 밖의 문자는 `-`가 됩니다.",
          }),
        },
        {
          name: "children",
          type: "ReactNode",
          desc: l.trans({
            en: "The section itself. Everything mounted here is part of the zone.",
            ko: "구획 자체입니다. 여기 마운트된 것은 모두 이 zone에 속합니다.",
          }),
        },
        {
          name: "className",
          type: "string",
          desc: l.trans({
            en: "Goes on the wrapper `div` that carries `data-agent-zone`.",
            ko: "`data-agent-zone`이 붙는 감싸는 `div`에 붙습니다.",
          }),
        },
        {
          name: "label",
          type: "string",
          desc: l.trans({
            en: "Readable name for the scope, sent to the model with the screen context.",
            ko: "scope의 읽기 쉬운 이름입니다. 화면 컨텍스트와 함께 모델에 전달됩니다.",
          }),
        },
        {
          name: "instructions",
          type: "string",
          desc: l.trans({
            en: "Zone guidance, mounted as an `Agent.Guide`: the root agent reads it too, a sibling zone never.",
            ko: "`Agent.Guide`로 마운트되는 zone 지침입니다. 루트 에이전트도 읽고, 형제 zone은 읽지 않습니다.",
          }),
        },
        {
          name: "runner / maxTurns / compact / builtins / persist / onCompact / visual",
          type: l.trans({ en: "same as Chat", ko: "Chat과 같음" }),
          desc: l.trans({
            en: "Same contracts as the chat's, applied to this zone's session and read once at mount.",
            ko: "채팅과 같은 옵션이며, 이 zone의 세션에 적용되고 마운트할 때 한 번 읽습니다.",
          }),
        },
        {
          name: "session",
          type: "AgentSession",
          desc: l.trans({
            en: "Runs the zone on a session the app built and owns; unmounting the zone leaves it running.",
            ko: "앱이 만들어 가진 세션 위에서 zone을 돌립니다. zone을 언마운트해도 세션은 멈추지 않습니다.",
          }),
        },
        {
          name: "onSession",
          type: "(session) => void",
          desc: l.trans({
            en: "Hands the session out once it exists, for a page or store that sends into it or watches it.",
            ko: "세션이 생기면 밖으로 건네줍니다. 메시지를 보내거나 지켜보려는 페이지나 스토어가 받습니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <>
              <strong>Zones are views, never walls.</strong> Tools, <code>st.use</code> subscriptions and guides mounted
              inside belong to this zone's session and to the root agent both.
            </>
          ),
          ko: (
            <>
              <strong>zone은 벽이 아니라 보는 창입니다.</strong> 안에 마운트된 툴, <code>st.use</code> 구독, 지침은 이
              zone의 세션과 루트 에이전트 양쪽에 함께 속합니다.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>
                Everything a zone publishes is named <code>{"<id>.<name>"}</code>.
              </strong>{" "}
              Instructions that name a tool must carry the prefix; a bare name is a tool that does not exist, and the
              model spends a turn on <code>Unknown tool</code>. Build the name from the id, and check the published list
              with <code>Agent.Context</code>'s Assemble.
            </>
          ),
          ko: (
            <>
              <strong>
                zone이 공개하는 것은 모두 <code>{"<id>.<name>"}</code>이라는 이름을 갖습니다.
              </strong>{" "}
              지침에 툴 이름을 적을 때는 접두사까지 적어야 합니다. 접두사 없는 이름은 없는 툴이라 모델이{" "}
              <code>Unknown tool</code>로 턴 하나를 버립니다. 이름은 id로 조립하고, 공개 목록은{" "}
              <code>Agent.Context</code>의 Assemble로 확인합니다.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>A zone that must stay on its screen withholds the rest.</strong>{" "}
              <code>{'builtins={["readScreen", "readState"]}'}</code> takes <code>navigate</code>, <code>goBack</code>{" "}
              and <code>highlight</code> away rather than discouraging them, so no prompt can talk the model past it.
            </>
          ),
          ko: (
            <>
              <strong>화면을 벗어나면 안 되는 zone은 나머지 툴을 빼 버립니다.</strong>{" "}
              <code>{'builtins={["readScreen", "readState"]}'}</code>를 주면 <code>navigate</code>, <code>goBack</code>,{" "}
              <code>highlight</code>를 권고가 아니라 아예 주지 않으므로, 프롬프트로 우회할 수 없습니다.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>Each zone persists on its own.</strong> <code>persist</code> is keyed by the zone's scope path, so
              two zones never share a transcript.
            </>
          ),
          ko: (
            <>
              <strong>zone마다 따로 저장됩니다.</strong> <code>persist</code>의 저장 키가 zone의 scope 경로라서 두
              zone이 대화 기록을 섞지 않습니다.
            </>
          ),
        }),
      ],
      codeTitle: "apps/koyo/ui/CommentZone.tsx",
      code: `import { Agent } from "akanjs/ui";
import type { ReactNode } from "react";

interface CommentZoneProps {
  className?: string;
  children: ReactNode;
}
export const CommentZone = ({ className, children }: CommentZoneProps) => {
  return (
    <Agent.Zone
      className={className}
      id="comments"
      label="Comment management"
      instructions="Moderate the comment queue. Call comments.approveComment to accept one."
      builtins={["readScreen", "readState"]}
      persist
    >
      {children}
      <Agent.Chat inline defaultOpen chrome={false} />
    </Agent.Zone>
  );
};`,
    },
    {
      name: "Guide",
      desc: l.trans({
        en: "Standing guidance for a route subtree. Render it from a `_layout.tsx` or a page, and its text joins every turn's instructions while that subtree is mounted. It draws nothing.",
        ko: "라우트 하위 트리에 상시 적용되는 지침입니다. `_layout.tsx`나 페이지에서 렌더하면 그 트리가 마운트된 동안 매 턴의 지침에 합쳐집니다. 화면에는 아무것도 그리지 않습니다.",
      }),
      props: [
        {
          name: "instructions",
          type: "string",
          desc: l.trans({
            en: "The text, always in English: the model reads it, so the `l()` rule does not apply.",
            ko: "지침 문구이며 항상 영어로 씁니다. 모델이 읽는 문자열이라 `l()` 규칙 대상이 아닙니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <>
              <strong>The render tree is the cascade.</strong> Each mounted Guide adds its own block, and navigating
              away withdraws it.
            </>
          ),
          ko: (
            <>
              <strong>렌더 트리가 곧 적용 범위입니다.</strong> 마운트된 Guide마다 자기 블록을 더하고, 다른 곳으로
              이동하면 빠집니다.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>It is a component, not a route stage.</strong> Neither <code>page()</code> nor{" "}
              <code>pageConfig</code> has an <code>instructions</code> field, and <code>*.abstract.md</code> is never
              served to agents.
            </>
          ),
          ko: (
            <>
              <strong>라우트 체인의 단계(stage)가 아니라 컴포넌트입니다.</strong> <code>page()</code>에도{" "}
              <code>pageConfig</code>에도 <code>instructions</code> 필드는 없고, <code>*.abstract.md</code>도
              에이전트에게 전달되지 않습니다.
            </>
          ),
        }),
      ],
      codeTitle: "apps/koyo/page/(user)/plan/_layout.tsx",
      code: `import { layout } from "akanjs/client";
import { Agent } from "akanjs/ui";

export default layout().render(({ children }) => (
  <>
    <Agent.Guide instructions="This section edits the weekly flight plan. Focus a waypoint before editing it." />
    {children}
  </>
));`,
    },
    {
      name: "History",
      desc: l.trans({
        en: "Connects the enclosing zone's transcript to storage the app owns. It does what `persist` does, as a mounted leaf instead of a prop, and draws nothing.",
        ko: "감싸고 있는 zone의 대화 기록을 앱이 가진 저장소에 연결합니다. `persist`와 같은 일을 prop 대신 마운트하는 컴포넌트로 하며, 화면에는 아무것도 그리지 않습니다.",
      }),
      props: [
        {
          name: "load / save / clear",
          type: 'SessionHistory["load" | "save" | "clear"]',
          desc: l.trans({
            en: "The three sides of the store. Inline closures are fine, since they are read through a ref.",
            ko: "저장소의 세 가지 동작입니다. ref로 읽으므로 인라인 함수로 적어도 됩니다.",
          }),
        },
        {
          name: "onCompact",
          type: "(replaced, summary) => void",
          desc: l.trans({
            en: "Where a host with its own server-side summary moves its watermark.",
            ko: "서버 쪽 요약을 따로 가진 앱이 자기 워터마크를 옮기는 자리입니다.",
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <>
              <strong>
                Why a component rather than <code>persist</code>.
              </strong>{" "}
              A function cannot cross the server/client boundary as a prop, so passing <code>persist</code> to whoever
              builds the session makes every ancestor up to it a client component. With this leaf as the only client
              module, the zone and its chat stay in a server component.
            </>
          ),
          ko: (
            <>
              <strong>
                <code>persist</code> 대신 컴포넌트인 이유.
              </strong>{" "}
              함수는 prop으로 서버/클라이언트 경계를 넘지 못하므로, 세션을 만드는 쪽에 <code>persist</code>를 넘기면 그
              위의 조상이 모두 클라이언트 컴포넌트가 됩니다. 이 말단 컴포넌트 하나만 클라이언트로 두면 zone과 채팅은
              서버 컴포넌트에 남습니다.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>It needs an enclosing session.</strong> Mount it inside <code>Agent.Zone</code> or{" "}
              <code>AgentProvider</code>, as in{" "}
              <code>{'<Agent.Zone id="thread"><ThreadHistory … /></Agent.Zone>'}</code>. The root{" "}
              <code>Agent.Chat</code> hands no session down, so use its <code>persist</code> there.
            </>
          ),
          ko: (
            <>
              <strong>감싸는 세션이 있어야 합니다.</strong>{" "}
              <code>{'<Agent.Zone id="thread"><ThreadHistory … /></Agent.Zone>'}</code>처럼 <code>Agent.Zone</code>이나{" "}
              <code>AgentProvider</code> 안에 마운트합니다. 루트 <code>Agent.Chat</code>은 세션을 아래로 내려 주지
              않으므로, 그쪽은 <code>persist</code>를 씁니다.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>Restoring happens only on a fresh conversation.</strong> Mounted with the zone, it restores;
              mounted after something has happened, it only saves from then on.
            </>
          ),
          ko: (
            <>
              <strong>복원은 대화가 비어 있을 때만 일어납니다.</strong> zone과 함께 마운트하면 복원되고, 대화에 무언가
              일어난 뒤에 마운트하면 그때부터 저장만 합니다.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>The store is attached only while this is mounted.</strong> A zone's own session ends with the zone
              anyway, but one the app passed in outlives this and stops saving on unmount. To keep saving, call{" "}
              <code>session.setHistory</code> yourself; that takes the slot, so a later unmount here leaves it alone.
            </>
          ),
          ko: (
            <>
              <strong>저장소는 이 컴포넌트가 마운트된 동안만 연결됩니다.</strong> zone이 만든 세션은 어차피 zone과 함께
              끝나지만, 앱이 넘긴 세션은 더 오래 살고 언마운트 시점에 저장이 멈춥니다. 계속 저장하려면{" "}
              <code>session.setHistory</code>를 직접 호출하세요. 그 호출이 자리를 차지하므로 이후의 언마운트가 건드리지
              않습니다.
            </>
          ),
        }),
      ],
      codeTitle: "apps/koyo/ui/ThreadHistory.tsx",
      code: `"use client";
import { Agent } from "akanjs/ui";

interface ThreadHistoryProps {
  threadId: string;
}
export const ThreadHistory = ({ threadId }: ThreadHistoryProps) => {
  return (
    <Agent.History
      load={() => loadThreadMessages(threadId)}
      save={(messages) => saveThreadMessages(threadId, messages)}
      clear={() => clearThreadMessages(threadId)}
    />
  );
};`,
    },
    {
      name: "Skip",
      desc: l.trans({
        en: "A region the default screen read leaves out: chrome that costs tokens and answers nothing, such as a footer, a cookie banner or a repeated nav.",
        ko: "기본 화면 읽기에서 빠지는 영역입니다. 푸터, 쿠키 배너, 반복되는 내비게이션처럼 토큰만 쓰고 답에는 도움이 안 되는 부분에 씁니다.",
      }),
      props: [
        {
          name: "label",
          type: "string",
          desc: l.trans({
            en: "Printed in place of the region, and the name `section` takes to read it anyway. Required.",
            ko: "읽기 결과에서 영역 대신 찍히는 이름이자 `section`으로 읽을 때 쓰는 이름입니다. 필수입니다.",
          }),
        },
        {
          name: "children",
          type: "ReactNode",
          desc: l.trans({ en: "The region itself.", ko: "건너뛸 영역 자체입니다." }),
        },
        {
          name: "className",
          type: "string",
          desc: l.trans({ en: "Goes on the wrapper `div`.", ko: "감싸는 `div`에 붙습니다." }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <>
              <strong>The agent knows what it skipped.</strong> <code>{"[skipped: <label>]"}</code> stands in its place,
              so asked about the footer it says it did not read one instead of saying there is none.{" "}
              <code>{'section: "<label>"'}</code> reads it on request.
            </>
          ),
          ko: (
            <>
              <strong>에이전트는 무엇을 건너뛰었는지 압니다.</strong> 그 자리에 <code>{"[skipped: <label>]"}</code>이
              남으므로, 푸터를 물으면 푸터가 없다고 하지 않고 읽지 않았다고 답합니다. 필요하면{" "}
              <code>{'section: "<label>"'}</code>으로 읽습니다.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>It hides text, not behaviour.</strong> Tools and state keys are declarations, not markup: an{" "}
              <code>st.tool</code> inside is published as before, and <code>highlight</code> still reaches a control in
              here.
            </>
          ),
          ko: (
            <>
              <strong>숨기는 것은 글이지 동작이 아닙니다.</strong> 툴과 상태 키는 마크업이 아니라 선언이므로, 안에 있는{" "}
              <code>st.tool</code>도 그대로 공개되고 <code>highlight</code>도 안쪽 컨트롤에 닿습니다.
            </>
          ),
        }),
        l.trans({
          en: (
            <>
              <strong>Where a wrapper would move the layout, use the attribute.</strong> Between a flex container and
              its children, put it on the element you already render:{" "}
              <code>{'<footer data-agent-skip="site footer">'}</code>.
            </>
          ),
          ko: (
            <>
              <strong>감싸는 div가 레이아웃을 흔든다면 속성을 씁니다.</strong> flex 컨테이너와 자식 사이처럼 div가 끼면
              안 되는 곳에서는 이미 그리는 요소에 직접 붙입니다. <code>{'<footer data-agent-skip="site footer">'}</code>
            </>
          ),
        }),
      ],
      codeTitle: "apps/koyo/ui/SiteFooter.tsx",
      code: `import { Agent } from "akanjs/ui";

export const SiteFooter = () => {
  return (
    <Agent.Skip label="site footer">
      <footer className="border-border border-t px-6 py-10 text-foreground/60">
        <LegalLinks />
      </footer>
    </Agent.Skip>
  );
};`,
    },
    {
      name: "Scope",
      desc: l.trans({
        en: "Prefixes every tool and resource registered below it, so repeated list items can reuse local names. It opens no conversation and holds no session.",
        ko: "아래에서 등록되는 툴과 리소스 이름에 접두사를 붙여, 반복되는 목록 항목이 같은 이름을 쓸 수 있게 합니다. 대화를 열지도, 세션을 갖지도 않습니다.",
      }),
      props: [
        {
          name: "id",
          type: "string",
          desc: l.trans({
            en: "The prefix: everything below is published as `<id>.<name>`, nested scopes joined with dots.",
            ko: "접두사입니다. 아래의 모든 것이 `<id>.<name>`으로 공개되고, 중첩된 scope는 점으로 이어집니다.",
          }),
        },
        {
          name: "children",
          type: "ReactNode",
          desc: l.trans({ en: "The subtree the prefix applies to.", ko: "접두사가 적용되는 하위 트리입니다." }),
        },
        {
          name: "label",
          type: "string",
          desc: l.trans({
            en: "Readable name for the scope, sent to the model with the screen context.",
            ko: "scope의 읽기 쉬운 이름입니다. 화면 컨텍스트와 함께 모델에 전달됩니다.",
          }),
        },
        {
          name: "kind",
          type: "string",
          desc: l.trans({
            en: 'What sort of scope this is. `Agent.Zone` opens its own with `kind="zone"`.',
            ko: 'scope의 종류입니다. `Agent.Zone`은 `kind="zone"`으로 자기 scope를 엽니다.',
          }),
        },
      ],
      notes: [
        l.trans({
          en: (
            <>
              <strong>Scope or Zone?</strong> Use <code>Agent.Scope</code> when a repeated subtree needs distinct tool
              names but shares the screen's one agent. <code>Agent.Zone</code> wraps a scope and adds a conversation of
              its own.
            </>
          ),
          ko: (
            <>
              <strong>Scope와 Zone 중 무엇을 쓸까?</strong> 반복되는 하위 트리에서 툴 이름만 구분하고 에이전트는 화면
              하나를 함께 쓰면 될 때 <code>Agent.Scope</code>를 씁니다. <code>Agent.Zone</code>은 scope를 감싸고 자기
              대화까지 엽니다.
            </>
          ),
        }),
      ],
      codeTitle: "apps/koyo/ui/WaypointRow.tsx",
      code: `import { Agent } from "akanjs/ui";

interface WaypointRowProps {
  waypointId: string;
  name: string;
}
export const WaypointRow = ({ waypointId, name }: WaypointRowProps) => {
  return (
    <Agent.Scope id={waypointId} label={name}>
      <WaypointEditor waypointId={waypointId} />
    </Agent.Scope>
  );
};`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="agent-ui" title={l.trans({ en: "Agent UI", ko: "에이전트 UI" })}>
        <Docs.Title>{l.trans({ en: "Agent UI", ko: "에이전트 UI" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "An assistant that presses the buttons already on the screen, under the same guards, while the person watches. It is not a separate API for robots.",
              ko: "화면에 이미 있는 버튼을 같은 가드 아래에서, 사람이 보는 앞에서 눌러 주는 도우미입니다. 로봇용 API를 따로 만드는 것이 아닙니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <>
                  The <code>Agent</code> namespace is that UI. One <code>{"<Agent.Chat />"}</code> in a layout is the
                  whole integration; the other members narrow it or show what it sees.
                </>
              ),
              ko: (
                <>
                  <code>Agent</code> 네임스페이스가 그 UI입니다. 레이아웃에 <code>{"<Agent.Chat />"}</code> 하나면
                  연결이 끝나고, 나머지 멤버는 범위를 좁히거나 에이전트가 보는 것을 보여 줍니다.
                </>
              ),
            })}
            <code className={codeChip}>{'import { Agent } from "akanjs/ui";'}</code>
          </div>
        </Docs.Description>
        <Docs.Alert type="info">
          {l.trans({
            en: (
              <>
                <strong>The relay endpoint never runs a tool.</strong> Every call runs in the user's own browser
                session, through the app's guards and the approval card. So a tool exists only where a component
                declared one, and what the screen does not offer the user, the agent cannot do either.
              </>
            ),
            ko: (
              <>
                <strong>릴레이 엔드포인트는 툴을 실행하지 않습니다.</strong> 모든 호출은 사용자 자신의 브라우저
                세션에서, 앱의 가드와 승인 카드를 거쳐 실행됩니다. 그래서 툴은 컴포넌트가 선언한 곳에만 있고, 화면이
                사용자에게 주지 않은 조작은 에이전트도 할 수 없습니다.
              </>
            ),
          })}
        </Docs.Alert>
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Members", ko: "멤버" })}</Docs.SubSubTitle>
          <Docs.Matrix
            type={l.trans({ en: "Member", ko: "멤버" })}
            columns={memberColumns}
            groups={memberGroups}
            markLabel={l.trans({ en: "Yes", ko: "있음" })}
            emptyLabel={l.trans({ en: "No", ko: "없음" })}
          />
          <Docs.SubSubTitle>{l.trans({ en: "Where the concepts live", ko: "개념 설명 문서" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "This page lists every member and its props. The ideas behind them are explained here:",
              ko: "이 페이지는 멤버와 props 목록입니다. 그 뒤의 개념은 아래 문서에서 다룹니다.",
            })}
          </div>
          <Docs.LinkGrid items={nextReads} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Chat" title="Chat">
        <Docs.Title>Chat</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The chat people see: a floating panel wired to the tools and state this screen declared. The loop and every tool call run in this browser. Mount it once, in a layout.",
              ko: "사용자가 보는 채팅입니다. 이 화면이 선언한 툴과 상태에 연결된 떠 있는 패널이며, 대화 루프와 모든 툴 호출이 이 브라우저에서 실행됩니다. 레이아웃에 한 번만 마운트합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.SubTitle>{l.trans({ en: "Props / API", ko: "속성과 API" })}</Docs.SubTitle>
        <Docs.SubSubTitle>{l.trans({ en: "Session Options", ko: "세션 옵션" })}</Docs.SubSubTitle>
        <Docs.Description>
          <div>
            {l.trans({
              en: "How the conversation runs, read once at mount. Inside an `Agent.Zone` or `AgentProvider` the chat joins that session, so these belong to whoever built it.",
              ko: "대화가 돌아가는 방식이며 마운트할 때 한 번만 읽습니다. `Agent.Zone`이나 `AgentProvider` 안에서는 채팅이 그 세션에 합류하므로, 이 값은 그 세션을 만든 쪽이 정합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.OptionTable items={chatSessionProps} />
        <Docs.SubSubTitle>{l.trans({ en: "Opening And Placement", ko: "열기와 배치" })}</Docs.SubSubTitle>
        <Docs.OptionTable items={chatOpenProps} />
        <Docs.SubSubTitle>{l.trans({ en: "Look", ko: "모양" })}</Docs.SubSubTitle>
        <Docs.OptionTable items={chatLookProps} />
        <Docs.SubSubTitle>{l.trans({ en: "Composer Input", ko: "입력창" })}</Docs.SubSubTitle>
        <Docs.OptionTable items={chatComposerProps} />
        <Docs.Description>
          <ul className={noteList}>
            {chatNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <div>
            {l.trans({
              en: "A layout mounts it once, with a translated title and a transcript that survives reloads:",
              ko: "레이아웃에 한 번 마운트하고, 번역된 제목과 새로고침해도 남는 대화 기록을 줍니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/page/(user)/_layout.tsx"
          code={`import { usePage } from "@apps/koyo/client";
import { layout } from "akanjs/client";
import { Agent } from "akanjs/ui";

export default layout().render(({ children }) => {
  const { l } = usePage();
  return (
    <>
      {children}
      <Agent.Chat
        title={l.trans({ en: "Assistant", ko: "도우미" })}
        instructions="Help the operator schedule flights. Confirm before submitting a plan."
        persist
        compact={{ at: 120_000, keep: 8 }}
      />
    </>
  );
});`}
        />
      </Scroll.Slide>
      <Divider />

      {components.flatMap((component) => [
        <UiComponentSlide key={component.name} component={component} />,
        <Divider key={`${component.name}-divider`} />,
      ])}

      <Scroll.Slide id="agent-dock" title={l.trans({ en: "Development Dock", ko: "개발용 도크" })}>
        <Docs.Title>{l.trans({ en: "Development Dock", ko: "개발용 도크" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <>
                  Each component declares its own agent surface, so no single file tells you what the whole screen
                  published. <code>Agent.Dock</code> shows it. Mount it next to the chat during development:
                </>
              ),
              ko: (
                <>
                  에이전트 표면은 컴포넌트마다 따로 선언하므로, 파일 하나만 봐서는 화면 전체가 무엇을 공개했는지 알 수
                  없습니다. <code>Agent.Dock</code>이 그것을 보여 줍니다. 개발 중에는 아래처럼 채팅 옆에 마운트합니다.
                </>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/page/(user)/_layout.tsx"
          code={`import { layout } from "akanjs/client";
import { Agent } from "akanjs/ui";

export default layout().render(({ children }) => (
  <>
    {children}
    <Agent.Chat persist />
    <Agent.Dock open />
  </>
));`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Production draws nothing.</strong> <code>Agent.Dock</code> and <code>Agent.Context</code>{" "}
                    render nothing when <code>AKAN_PUBLIC_ENV=main</code>, so leaving them mounted costs a visitor
                    nothing.
                  </>
                ),
                ko: (
                  <>
                    <strong>프로덕션에서는 그리지 않습니다.</strong> <code>Agent.Dock</code>과{" "}
                    <code>Agent.Context</code>는 <code>AKAN_PUBLIC_ENV=main</code>에서 아무것도 그리지 않으므로,
                    마운트해 두어도 방문자에게는 비용이 없습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The other parts do not check the environment.</strong> An inspector you assemble from{" "}
                    <code>Agent.Section</code>, <code>Agent.StateKey</code>, <code>Agent.Tool</code> or{" "}
                    <code>Agent.Transcript</code> has to hide itself in production.
                  </>
                ),
                ko: (
                  <>
                    <strong>나머지 부품은 환경을 확인하지 않습니다.</strong> <code>Agent.Section</code>,{" "}
                    <code>Agent.StateKey</code>, <code>Agent.Tool</code>, <code>Agent.Transcript</code>로 직접 만든
                    인스펙터는 프로덕션에서 스스로 숨겨야 합니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>open</code> expands Tools.
                    </strong>{" "}
                    Transcript always starts expanded; the other sections start folded.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>open</code>은 Tools를 펼칩니다.
                    </strong>{" "}
                    Transcript는 항상 펼친 채로, 나머지 섹션은 접힌 채로 시작합니다.
                  </>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>
            {l.trans({ en: "What each section answers", ko: "섹션별로 확인하는 것" })}
          </Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Section", ko: "섹션" })} items={dockSections} />
          <Docs.SubSubTitle>{l.trans({ en: "The parts", ko: "부품" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Each part is exported, so an app that wants a dock of its own shape composes them instead of re-reading the surface.",
              ko: "부품은 하나씩 따로 공개되어 있습니다. 자기 모양의 도크가 필요한 앱은 표면을 다시 읽지 않고 이것들을 조합합니다.",
            })}
          </div>
          <Docs.OptionTable items={dockParts} />
          <Docs.SubSubTitle>{l.trans({ en: "Restyling the chat", ko: "채팅 모양 바꾸기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <>
                  Eleven of the chat's own parts are override slots, so an app re-skins the transcript or the composer
                  without re-implementing the loop. <code>AgentChat</code> replaces the whole panel.
                </>
              ),
              ko: (
                <>
                  채팅을 이루는 부품 중 11개가 교체 슬롯이라, 앱은 루프를 다시 만들지 않고 대화창이나 입력창만 바꿀 수
                  있습니다. <code>AgentChat</code> 슬롯은 패널 전체를 바꿉니다.
                </>
              ),
            })}
          </div>
          <div className="my-3 flex flex-wrap gap-1.5">
            {chatSlots.map((slot) => (
              <code key={slot} className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">
                {slot}
              </code>
            ))}
          </div>
          <Docs.LinkGrid
            items={[
              {
                href: "/references/ui/customize#slots",
                title: l.trans({ en: "Overridable Slots", ko: "교체할 수 있는 슬롯" }),
                desc: l.trans({
                  en: (
                    <>
                      The full slot list, and how a <code>_overrides.tsx</code> binds one.
                    </>
                  ),
                  ko: (
                    <>
                      전체 슬롯 목록과 <code>_overrides.tsx</code>로 연결하는 방법입니다.
                    </>
                  ),
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>

      <DocsToc />
    </Scroll>
  );
});
