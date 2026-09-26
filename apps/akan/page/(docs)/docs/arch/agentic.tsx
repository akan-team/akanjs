import { usePage } from "@apps/akan/client";
import { AgentVisualDemo, Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page().render(() => {
  const { l } = usePage();

  const termRows = [
    {
      name: "tool",
      desc: l.trans({
        en: "One action a component publishes for the agent, usually the handler its button already calls.",
        ko: "컴포넌트가 에이전트에게 공개한 동작 하나입니다. 보통 버튼이 이미 부르는 핸들러입니다.",
      }),
    },
    {
      name: "surface",
      desc: l.trans({
        en: "Everything the agent can do and read on the current screen: the mounted tools and keys.",
        ko: "지금 화면에서 에이전트가 하고 읽을 수 있는 것 전부, 즉 마운트된 툴과 키입니다.",
      }),
    },
    {
      name: "turn",
      desc: l.trans({
        en: "One model answer, together with every tool call it made on the way.",
        ko: "모델의 응답 한 번과, 그 사이에 한 툴 호출 전부입니다.",
      }),
    },
    {
      name: "transcript",
      desc: l.trans({
        en: "The conversation so far. It is sent to the model again on every turn.",
        ko: "지금까지의 대화입니다. 매 턴마다 모델에 다시 전송됩니다.",
      }),
    },
    {
      name: "approval card",
      desc: l.trans({
        en: "A card that holds a call until the user approves it.",
        ko: "사용자가 승인할 때까지 호출을 붙잡아 두는 카드입니다.",
      }),
    },
    {
      name: "relay",
      desc: l.trans({
        en: "The server endpoint runAgentTurn. It passes the transcript to the LLM and never runs a tool.",
        ko: "서버 엔드포인트 runAgentTurn입니다. 대화를 LLM에 전달할 뿐 툴은 실행하지 않습니다.",
      }),
    },
    {
      name: "zone",
      desc: l.trans({
        en: "A section wrapped in Agent.Zone, with a conversation of its own.",
        ko: "Agent.Zone으로 감싼 구획입니다. 자기만의 대화를 가집니다.",
      }),
    },
  ];

  const runtimeRows = [
    {
      name: "Screen",
      desc: l.trans({
        en: "Mounted st.use / st.sel / st.ref keys, hook tools, and Agent.Guide text.",
        ko: "마운트된 st.use / st.sel / st.ref 키, 훅 툴, Agent.Guide 문구.",
      }),
    },
    {
      name: "Agent.Chat",
      desc: l.trans({
        en: "The loop, the approval card, and the six slash commands its / menu lists.",
        ko: "대화 루프, 승인 카드, 그리고 / 메뉴에 오르는 슬래시 커맨드 여섯 개.",
      }),
    },
    {
      name: "runAgentTurn",
      desc: l.trans({
        en: "A stateless HTTP relay. It spends the LLM key and never runs a tool.",
        ko: "무상태 HTTP 릴레이입니다. LLM 키만 쓰고 툴은 실행하지 않습니다.",
      }),
    },
    {
      name: "LlmAdaptor.chat",
      desc: l.trans({
        en: "The whole transcript in, one assistant answer out. OpenaiLlm is the default.",
        ko: "전체 대화가 들어가고 어시스턴트 응답 하나가 나옵니다. 기본값은 OpenaiLlm입니다.",
      }),
    },
  ];

  const chatOptionRows = [
    {
      name: "persist",
      desc: l.trans({
        en: 'Off by default. Keeps the transcript in sessionStorage; { storage: "local" } outlives the tab.',
        ko: '기본값은 꺼짐입니다. 대화를 sessionStorage에 보존하고, { storage: "local" }이면 탭을 닫아도 남습니다.',
      }),
    },
    {
      name: "streaming",
      desc: l.trans({
        en: "Text appears as it is generated. The same endpoint answers text/event-stream; no app code.",
        ko: "텍스트가 생성되는 대로 나타납니다. 같은 엔드포인트가 text/event-stream도 답하므로 앱 코드는 없습니다.",
      }),
    },
    {
      name: "instructions",
      desc: l.trans({
        en: "App-wide framing. Route-scoped guidance layers on through a mounted Agent.Guide.",
        ko: "앱 전역 지침입니다. 라우트 범위 지침은 마운트된 Agent.Guide가 그 위에 겹칩니다.",
      }),
    },
    {
      name: "attach",
      desc: l.trans({
        en: "Handles files that need a parser, like a PDF's text, or uploads the file and answers a url.",
        ko: "PDF 본문처럼 파서가 필요한 파일을 처리하거나, 업로드한 뒤 url로 답합니다.",
      }),
    },
    {
      name: "voice",
      desc: l.trans({
        en: "A press-to-talk microphone, and spoken replies to questions asked by voice.",
        ko: "눌러서 말하는 마이크와, 음성으로 물은 질문에 대한 음성 응답입니다.",
      }),
    },
  ];

  const attachNotes = [
    l.trans({
      en: (
        <>
          <strong>Images and text files attach on their own.</strong> <code>attach</code> is only for files that need a
          parser or an upload.
        </>
      ),
      ko: (
        <>
          <strong>이미지와 텍스트 파일은 알아서 첨부됩니다.</strong> <code>attach</code>는 파서나 업로드가 필요한
          파일에만 씁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Nothing is stored.</strong> The bytes ride one turn's request; after a reload the transcript keeps
          only the file name.
        </>
      ),
      ko: (
        <>
          <strong>저장하지 않습니다.</strong> 바이트는 한 턴의 요청에만 실리고, 새로고침한 대화에는 파일 이름만
          남습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Limits are per message:</strong> 4 MB per file, 8 MB and five files per message, and the same file
          twice is refused by name. A provider refuses the sum, and a request that cannot be sent leaves the user
          emptying the composer.
        </>
      ),
      ko: (
        <>
          <strong>상한은 메시지 단위입니다.</strong> 파일당 4MB, 메시지당 8MB와 5개이고, 같은 파일을 두 번 넣으면 이름을
          밝혀 거절합니다. 프로바이더가 거절하는 것은 합계이고, 보낼 수 없는 요청은 사용자가 작성창을 비워야만 빠져나올
          수 있기 때문입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Limits count what attach produced,</strong> so a url costs nothing. <code>attachLimits</code> raises
          them for a provider that carries more.
        </>
      ),
      ko: (
        <>
          <strong>상한은 attach가 만든 결과로 잽니다.</strong> 그래서 url은 비용이 없고, 더 큰 요청을 받는
          프로바이더라면 <code>attachLimits</code>로 올립니다.
        </>
      ),
    }),
  ];

  const voiceNotes = [
    l.trans({
      en: (
        <>
          <strong>Speak, then correct.</strong> What the user said lands in the composer, where it can be fixed before
          sending.
        </>
      ),
      ko: (
        <>
          <strong>말하고, 고치고.</strong> 말한 내용은 작성창에 들어가므로 보내기 전에 고칠 수 있습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Spoken replies only for spoken questions.</strong> The reply is read one sentence at a time, and a
          typed question never turns the speakers on.
        </>
      ),
      ko: (
        <>
          <strong>음성으로 물었을 때만 읽어 줍니다.</strong> 응답은 문장 단위로 읽고, 타이핑한 질문이 스피커를 켜는 일은
          없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>The engine is useSpeech</strong> from <code>@libs/util/webkit</code>: the browser's own recognition on
          the web, and Capacitor plugins in a WebView, which has neither.
        </>
      ),
      ko: (
        <>
          <strong>엔진은 useSpeech입니다.</strong> <code>@libs/util/webkit</code>에 있고, 웹에서는 브라우저 내장 인식을,
          둘 다 없는 WebView에서는 Capacitor 플러그인을 씁니다.
        </>
      ),
    }),
  ];

  const surfaceBasics = [
    l.trans({
      en: (
        <>
          <strong>st.tool publishes one action</strong> and returns the callable you wire to <code>onClick</code>.
        </>
      ),
      ko: (
        <>
          <strong>st.tool은 동작 하나를 공개하고,</strong> <code>onClick</code>에 연결할 callable을 돌려줍니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>st.use, st.sel and st.ref make one store key readable</strong> while the component reading it is
          mounted.
        </>
      ),
      ko: (
        <>
          <strong>st.use, st.sel, st.ref는 스토어 키 하나를 읽을 수 있게 합니다.</strong> 그 키를 읽는 컴포넌트가
          마운트된 동안만입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Unmount, and both withdraw</strong> on the next turn.
        </>
      ),
      ko: (
        <>
          <strong>언마운트되면 둘 다</strong> 다음 턴부터 사라집니다.
        </>
      ),
    }),
  ];

  const declareCards = [
    {
      title: "st.tool(name).desc(…).arg(…).opt(…).exec(fn)",
      notes: [
        l.trans({
          en: "The only way an action reaches an agent. It returns the callable to wire to onClick.",
          ko: "동작이 에이전트에게 닿는 유일한 길입니다. onClick에 연결할 callable을 돌려줍니다.",
        }),
        l.trans({
          en: "desc is required and comes first. arg is what the caller must pass; opt is what it may, and an omitted opt arrives as null.",
          ko: "desc는 필수이고 맨 앞에 옵니다. arg는 반드시 넘길 인자, opt는 생략할 수 있는 인자이며 생략된 opt는 null로 들어옵니다.",
        }),
        l.trans({
          en: "Both take a scalar, an enum, or one array level of either ([String], [TaskStatus]), so a list never has to be taught as a string format.",
          ko: "둘 다 스칼라, enum, 그리고 그 배열 한 겹([String], [TaskStatus])까지 받습니다. 목록을 문자열 포맷으로 가르칠 일이 없습니다.",
        }),
        l.trans({
          en: 'A third argument narrows the values at render time: .arg("branch", String, { oneOf: branchCodes }) is enumOf for values known only once the component has its data.',
          ko: '세 번째 인자는 렌더 시점에 값을 좁힙니다. .arg("branch", String, { oneOf: branchCodes })는 컴포넌트가 데이터를 받은 뒤에야 아는 값을 위한 enumOf입니다.',
        }),
      ],
    },
    {
      title: "st.tool(name, { confirm, settle })",
      notes: [
        l.trans({
          en: "confirm holds the call on the approval card: true for every call, or a function of the arguments for the ones that deserve it.",
          ko: "confirm은 호출을 승인 카드에 세웁니다. true면 항상, 인자를 받는 함수면 그럴 만한 호출에만 세웁니다.",
        }),
        l.trans({
          en: "A remove* name confirms by default, reading destructiveness off the name as MCP hints do. Write { confirm: false } to opt out.",
          ko: "remove*로 시작하는 이름은 MCP 힌트처럼 이름에서 파괴성을 읽어 기본으로 승인을 받습니다. 빼려면 { confirm: false }를 적습니다.",
        }),
        l.trans({
          en: "settle: false marks a read of what is already there, so the turn reports without waiting for the DOM. The default waits, since a write may still be landing.",
          ko: "settle: false는 이미 있는 것을 읽는 호출이라는 뜻이라 DOM을 기다리지 않고 보고합니다. 기본값은 기다립니다. 쓰기가 아직 착지 중일 수 있기 때문입니다.",
        }),
      ],
    },
    {
      title: 'st.tool(canRefund && "refundOrder")',
      notes: [
        l.trans({
          en: "A falsy name declares the tool without publishing it. The callable still handles a person's click; nothing reaches the agent.",
          ko: "falsy한 이름은 툴을 선언하되 공개하지 않습니다. callable은 사람의 클릭을 그대로 처리하고, 에이전트에게는 아무것도 가지 않습니다.",
        }),
        l.trans({
          en: "Every chain ends in a hook, so a conditional surface withholds the name instead of skipping the declaration.",
          ko: "모든 체인은 훅으로 끝나므로, 조건부 표면은 선언을 건너뛰지 않고 이름을 비웁니다.",
        }),
        l.trans({
          en: "The name follows the render: a control that appears later publishes, and one that goes away stops.",
          ko: "이름은 렌더를 따라갑니다. 나중에 나타난 컨트롤은 공개되고, 사라진 컨트롤은 공개를 멈춥니다.",
        }),
      ],
    },
    {
      title: "st.expose(name, Type).desc(…).value(v) · st.useState(name, Type).desc(…).init(v)",
      notes: [
        l.trans({
          en: "Derived values and local state, each ending in one hook. .value() takes the value the component holds, or a thunk when a ref the children fill builds it; .init() is useState and returns the same pair.",
          ko: "파생 값과 로컬 상태이며, 각각 훅 하나로 끝납니다. .value()는 컴포넌트가 쥔 값을 받고(자식이 채우는 ref로 만든 값이면 thunk), .init()은 useState라 같은 쌍을 돌려줍니다.",
        }),
        l.trans({
          en: "The declared type checks what you hand over and masks how it reads: a model class strips its hidden, secret and visual fields; Any passes untouched.",
          ko: "선언한 타입이 넘기는 값을 검사하고 읽히는 모양을 정합니다. 모델 클래스는 hidden, secret, visual 필드를 벗겨내고, Any는 그대로 통과합니다.",
        }),
        l.trans({
          en: "Read-only unless set: true, which publishes a set<Name> tool of the same type. { report: false } keeps a key that changes every second out of change reports.",
          ko: "set: true가 없으면 읽기 전용이고, set: true는 같은 타입의 set<Name> 툴을 공개합니다. { report: false }는 초마다 바뀌는 키를 변경 보고에서 뺍니다.",
        }),
      ],
    },
    {
      title: "agentAttrs(handler, key)",
      notes: [
        l.trans({
          en: "The data-akan-* attributes for a handler passed by reference, and {} for an inline arrow: a closure says nothing about what it does, and a guessed mark is worse than none.",
          ko: "레퍼런스로 넘긴 핸들러의 data-akan-* 속성이고, 인라인 화살표에는 {}입니다. 클로저는 무엇을 하는지 말해 주지 않고, 추측한 표식은 없느니만 못합니다.",
        }),
        l.trans({
          en: "Every akanjs/ui control already spreads it, so an app writes it only on a control of its own.",
          ko: "akanjs/ui의 모든 컨트롤이 이미 넣어 두므로, 앱은 직접 만든 컨트롤에만 적습니다.",
        }),
        l.trans({
          en: "key says which of several same-named controls this is, in the call argument's own words. Without it the pointer cannot tell a tab's menus apart, so it draws nothing.",
          ko: "key는 같은 이름의 컨트롤 중 어느 것인지를 호출 인자와 같은 말로 알려 줍니다. 없으면 포인터가 탭 메뉴들을 구별하지 못해 아무것도 그리지 않습니다.",
        }),
      ],
    },
    {
      title: "st.use.x({ agent: false })",
      notes: [
        l.trans({
          en: "Subscribes without joining the surface. There is no store-level switch; a store class says nothing about agents.",
          ko: "구독하되 표면에는 넣지 않습니다. 스토어 단위 스위치는 없습니다. 스토어 클래스는 에이전트에 대해 아무것도 말하지 않습니다.",
        }),
      ],
    },
  ];

  const builtinRows = [
    {
      name: "navigate",
      desc: l.trans({
        en: "Opens an internal path through the same router Link uses.",
        ko: "Link와 같은 라우터로 내부 경로를 엽니다.",
      }),
    },
    {
      name: "goBack",
      desc: l.trans({
        en: "Returns to the previous page in this session's history.",
        ko: "이 세션 히스토리의 이전 페이지로 돌아갑니다.",
      }),
    },
    {
      name: "readScreen(section?, images?)",
      desc: l.trans({
        en: "Reads the rendered screen as compact text.",
        ko: "렌더된 화면을 압축한 텍스트로 읽습니다.",
      }),
    },
    {
      name: "readState(key)",
      desc: l.trans({
        en: "Reads one store key, masked by its model.",
        ko: "스토어 키 하나를 모델로 마스킹해 읽습니다.",
      }),
    },
    {
      name: "highlight(target)",
      desc: l.trans({
        en: "Scrolls one thing into view and flashes it, to show the user where it is.",
        ko: "대상을 화면에 스크롤해 깜빡이며, 사용자에게 위치를 직접 보여 줍니다.",
      }),
    },
    {
      name: "askUser(question, choices?)",
      desc: l.trans({
        en: "Hands a decision back to the user on a question card.",
        ko: "질문 카드로 결정을 사용자에게 되돌립니다.",
      }),
    },
  ];

  const builtinNotes = [
    l.trans({
      en: (
        <>
          <strong>goBack is global like navigate.</strong> History is not a control a page owns; a page that draws no
          back link is not one you may not leave.
        </>
      ),
      ko: (
        <>
          <strong>goBack은 navigate처럼 전역입니다.</strong> 히스토리는 페이지가 가진 컨트롤이 아니고, 뒤로가기 링크를
          그리지 않은 페이지라고 떠날 수 없는 것은 아닙니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>readScreen keeps a long screen reachable.</strong> Headings carry their anchor, and a truncated read
          names the sections below the cut; pass one of those names, or a heading's text, as <code>section</code>.
        </>
      ),
      ko: (
        <>
          <strong>readScreen은 긴 화면도 닿게 합니다.</strong> 제목에는 앵커가 붙고, 잘린 읽기는 잘린 아래쪽 섹션 이름을
          알려 줍니다. 그 이름이나 제목 텍스트를 <code>section</code>으로 넘기면 됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Images are named, addresses are opt-in.</strong> Every image is named with or without an alt;{" "}
          <code>images: true</code> adds each address, off by default because a gallery is one long URL per thumbnail.
        </>
      ),
      ko: (
        <>
          <strong>이미지는 이름만, 주소는 선택입니다.</strong> alt가 없어도 이미지 자리는 남고,{" "}
          <code>images: true</code>를 주면 주소까지 붙습니다. 갤러리 하나가 썸네일마다 긴 URL이 되므로 기본값은
          꺼짐입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>highlight takes many kinds of target:</strong> a tool name, a state key, a scope path, an anchor or a
          heading's text. It flashes once the scroll lands, and nothing hidden ever resolves.
        </>
      ),
      ko: (
        <>
          <strong>highlight의 대상은 여러 가지입니다.</strong> 툴 이름, 상태 키, 스코프 경로, 앵커, 제목 텍스트를
          받습니다. 스크롤이 멈추면 깜빡이고, 숨겨진 것은 절대 잡히지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>askUser waits for an answer.</strong> The turn parks on the card until the user picks an option or
          writes one; dismissing it is an error the agent reads, never a silent empty answer.
        </>
      ),
      ko: (
        <>
          <strong>askUser는 답을 기다립니다.</strong> 사용자가 보기를 고르거나 직접 쓸 때까지 턴이 카드에서 멈춥니다.
          건너뛰면 조용한 빈 답이 아니라 에이전트가 읽는 오류가 됩니다.
        </>
      ),
    }),
  ];

  const readNotes = [
    l.trans({
      en: (
        <>
          <strong>Per key, not per store.</strong> A key the screen does not read stays unreadable, even while a sibling
          key of the same store is live.
        </>
      ),
      ko: (
        <>
          <strong>스토어가 아니라 키 단위입니다.</strong> 같은 스토어의 다른 키가 살아 있어도, 화면이 읽지 않는 키는
          읽히지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Masked by the model.</strong> Every read is masked by the model the key declares, so hidden and secret
          fields never cross.
        </>
      ),
      ko: (
        <>
          <strong>모델로 마스킹됩니다.</strong> 모든 읽기는 키가 선언한 모델로 마스킹되므로 hidden, secret 필드는
          넘어가지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Opt-out, not opt-in.</strong> A subscribed key joins the surface unless the read says{" "}
          <code>{"{ agent: false }"}</code>. Base-store plumbing does: routing, the caller's credential and the UI
          operation. To share a base key, write a plain read, as ThemeToggle does for <code>theme</code>.
        </>
      ),
      ko: (
        <>
          <strong>옵트인이 아니라 옵트아웃입니다.</strong> 구독한 키는 <code>{"{ agent: false }"}</code>로 막지 않는 한
          표면에 오릅니다. 라우팅, 호출자의 자격증명, UI operation 같은 base 스토어 배관은 막혀 있습니다. base 키를
          읽히고 싶다면 ThemeToggle이 <code>theme</code>에 하듯 평범하게 읽으면 됩니다.
        </>
      ),
    }),
  ];

  const resultNotes = [
    l.trans({
      en: (
        <>
          <strong>20,000 characters per result.</strong> Past that the JSON is clipped mid-structure, and a note tells
          the model what happened.
        </>
      ),
      ko: (
        <>
          <strong>결과 하나는 20,000자까지입니다.</strong> 넘으면 JSON이 구조 중간에서 잘리고, 무슨 일이 있었는지 알려
          주는 note가 붙습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>A result rides every later turn.</strong> Compaction cannot save it: it summarizes what is above the
          cut, and a result arrives below it.
        </>
      ),
      ko: (
        <>
          <strong>결과는 이후 모든 턴에 실립니다.</strong> 압축도 구하지 못합니다. 압축은 자른 지점 위를 요약하는데
          결과는 그 아래에 도착하기 때문입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Fix bulky fields once, at the model.</strong> <code>field.visual</code> keeps a field stored,
          searchable, formable and rendered, and strips it from every agent read and MCP result. It is cost, not
          secrecy; nothing is refused over one.
        </>
      ),
      ko: (
        <>
          <strong>덩치 큰 필드는 모델에서 한 번에 처리합니다.</strong> <code>field.visual</code>은 저장, 검색, 폼, 화면
          렌더는 그대로 두고 모든 에이전트 읽기와 MCP 결과에서만 벗겨냅니다. 비밀이 아니라 비용의 문제라, 그 때문에
          거절되는 것은 없습니다.
        </>
      ),
    }),
  ];

  const turnCards = [
    {
      title: l.trans({ en: "It waits for the screen", ko: "화면을 기다립니다" }),
      desc: l.trans({
        en: "router.push returns while the payload is still in flight, so navigate, and every tool not declared a read, waits for the DOM to hold still before reporting. Reading built-ins are declared, so looking around costs nothing.",
        ko: "router.push는 페이로드가 오는 중에 반환되므로, navigate와 읽기로 선언되지 않은 모든 툴은 DOM이 멈출 때까지 기다렸다 보고합니다. 읽기 빌트인은 선언돼 있어 둘러보기엔 비용이 없습니다.",
      }),
    },
    {
      title: l.trans({ en: "Calls travel in a batch", ko: "호출은 묶여서 갑니다" }),
      desc: l.trans({
        en: "Every call the model makes in a turn runs in order and comes back as one tool message: one round trip. Chained one per turn, each call would cost a round trip and a resend of the transcript.",
        ko: "모델이 한 턴에 만든 호출은 순서대로 실행되어 tool 메시지 하나로 돌아옵니다. 왕복 한 번입니다. 턴마다 하나씩 이으면 호출마다 왕복 한 번과 대화 전체 재전송이 듭니다.",
      }),
    },
    {
      title: l.trans({ en: "The turn cap asks", ko: "턴 상한은 묻습니다" }),
      desc: l.trans({
        en: "At maxTurns the agent asks whether to keep going. Whatever the user types instead rides as their own turn.",
        ko: "maxTurns에 닿으면 에이전트가 계속할지 묻습니다. 사용자가 대신 입력한 말은 그 사용자의 턴으로 들어갑니다.",
      }),
    },
  ];

  const longWorkNotes = [
    l.trans({
      en: (
        <>
          <strong>Await, don't poll.</strong> The session awaits the tool's own promise, so an <code>.exec</code> that
          awaits the store action finishing the job simply makes the turn that long, and the change report that follows
          carries the result. No second call.
        </>
      ),
      ko: (
        <>
          <strong>폴링하지 말고 await하세요.</strong> 세션은 툴의 promise를 기다립니다. 작업을 끝내는 스토어 액션을
          await하는 <code>.exec</code>은 턴을 그만큼 늘릴 뿐이고, 뒤따르는 변경 보고가 결과를 실어 옵니다. 두 번째
          호출이 필요 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Returning early is expensive.</strong> The agent asks again and again, one round trip per look, and
          burns the whole <code>maxTurns</code> budget in seconds on a job measured in minutes. Say so in the desc.
        </>
      ),
      ko: (
        <>
          <strong>일찍 반환하면 비쌉니다.</strong> 에이전트가 한 번 볼 때마다 왕복하며 계속 되묻고, 분 단위 작업에서{" "}
          <code>maxTurns</code> 예산을 몇 초 만에 태웁니다. desc에 그 사실을 적으세요.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Work a tool cannot await</strong> (started in an earlier turn, or by a person's click) gets a waiting
          tool of your own beside the control that starts it. A general built-in wait was removed: with no idea what any
          key means, it got spent on whatever key looked promising.
        </>
      ),
      ko: (
        <>
          <strong>툴이 기다릴 수 없는 작업</strong>(이전 턴이나 사람의 클릭으로 시작된 작업)은 그 작업을 시작하는 컨트롤
          옆에 기다리는 툴을 직접 선언합니다. 범용 대기 빌트인은 제거했습니다. 어떤 키가 무슨 뜻인지 모르니 그럴듯해
          보이는 키에 아무렇게나 쓰였습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Stop reaches a running tool.</strong> Every call races its abort signal, which a tool reads from{" "}
          <code>AgentAbort.current</code> (the same module slot as <code>AgentProgress</code>). Honouring it is
          optional; it buys the tool's own cleanup. Import both from <code>akanjs/store</code>, never{" "}
          <code>use-agentic</code>.
        </>
      ),
      ko: (
        <>
          <strong>Stop은 실행 중인 툴에도 닿습니다.</strong> 모든 호출은 abort 시그널과 경주하고, 툴은 그 시그널을{" "}
          <code>AgentAbort.current</code>(<code>AgentProgress</code>와 같은 모듈 슬롯)에서 읽습니다. 존중하는 것은
          선택이며, 얻는 것은 툴 자신의 정리입니다. 둘 다 <code>use-agentic</code>이 아니라 <code>akanjs/store</code>
          에서 가져옵니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>A stopped turn answers its unrun calls.</strong> Every provider refuses an assistant message whose
          tool_calls have no results, on that turn and every later one, so otherwise nothing could be sent again.
        </>
      ),
      ko: (
        <>
          <strong>중지된 턴은 실행하지 못한 호출에 답을 채웁니다.</strong> 모든 프로바이더는 결과 없는 tool_calls가 있는
          assistant 메시지를 그 턴과 이후 모든 턴에서 거절하므로, 그러지 않으면 더는 아무것도 보낼 수 없습니다.
        </>
      ),
    }),
  ];

  const commandRows = [
    { name: "/new (/clear)", desc: l.trans({ en: "Start a new conversation.", ko: "새 대화를 시작합니다." }) },
    { name: "/retry", desc: l.trans({ en: "Send the last message again.", ko: "마지막 메시지를 다시 보냅니다." }) },
    {
      name: "/compact",
      desc: l.trans({ en: "Summarize the conversation so far.", ko: "지금까지의 대화를 요약합니다." }),
    },
    { name: "/copy", desc: l.trans({ en: "Copy this conversation.", ko: "이 대화를 복사합니다." }) },
    { name: "/help", desc: l.trans({ en: "Show what you can do here.", ko: "여기서 할 수 있는 것을 보여 줍니다." }) },
    { name: "/tools", desc: l.trans({ en: "List this screen's tools.", ko: "이 화면의 툴 목록을 보여 줍니다." }) },
  ];

  const commandNotes = [
    l.trans({
      en: (
        <>
          <strong>The six are the whole menu.</strong> An app cannot add one. A screen a model should read is published
          with <code>page().prompt()</code> and reaches MCP clients as a prompt instead.
        </>
      ),
      ko: (
        <>
          <strong>메뉴는 이 여섯 개가 전부입니다.</strong> 앱이 추가할 수 없습니다. 모델이 읽어야 할 화면은{" "}
          <code>page().prompt()</code>로 공개하며, MCP 클라이언트에 prompt로 전달됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>/new and /copy work mid-turn,</strong> ahead of the question card, so /new ends the turn it clears
          instead of being sent into it as text.
        </>
      ),
      ko: (
        <>
          <strong>/new와 /copy는 턴 중에도 동작합니다.</strong> 질문 카드보다 앞서므로, /new는 답변 텍스트로 들어가지
          않고 비우려는 턴을 끝냅니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Output stays local.</strong> A command's output shows in the transcript but is never sent: the
          transcript is the model's history, and it would read that text as something it said.
        </>
      ),
      ko: (
        <>
          <strong>출력은 로컬에 남습니다.</strong> 커맨드의 출력은 대화창에 보이지만 전송되지 않습니다. 대화가 곧 모델의
          히스토리라, 보내면 모델이 자기가 한 말로 받아들입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>/copy is the only export.</strong> The relay keeps nothing, so copying is the one way a wrong answer
          reaches whoever could fix it.
        </>
      ),
      ko: (
        <>
          <strong>/copy가 유일한 내보내기입니다.</strong> 릴레이는 아무것도 보관하지 않으므로, 잘못된 답이 고칠 수 있는
          사람에게 닿는 길은 복사뿐입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Keys.</strong> ↑ and ↓ walk through what was sent, seeded from the transcript so a persisted chat
          keeps them. With the / menu open, Enter picks a row, Tab completes its name, and Escape closes the menu, then
          the panel.
        </>
      ),
      ko: (
        <>
          <strong>키.</strong> ↑와 ↓로 보낸 메시지를 오갑니다. 대화 기록에서 채우므로 persist된 대화에서도 남습니다. /
          메뉴가 열려 있으면 Enter는 줄을 고르고, Tab은 이름을 완성하며, Escape는 메뉴를 닫고 한 번 더 누르면 패널을
          닫습니다.
        </>
      ),
    }),
  ];

  const compactNotes = [
    l.trans({
      en: (
        <>
          <strong>Why it exists.</strong> The loop runs in the browser and the relay holds no session, so nothing else
          keeps the chat inside the model's window. Uncompacted, it grows until the provider refuses the whole request.
        </>
      ),
      ko: (
        <>
          <strong>왜 필요한가.</strong> 루프는 브라우저에서 돌고 릴레이는 세션이 없으므로, 대화를 모델의 컨텍스트 창
          안에 붙잡아 두는 것이 달리 없습니다. 압축하지 않으면 프로바이더가 요청 전체를 거절할 때까지 커집니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>When.</strong> Before every turn, on whichever comes first: the transcript passing{" "}
          <code>compact.at</code> estimated tokens, a ceiling on what each turn costs, or the prompt nearing the window
          the server reports. Then the history above the last <code>keep</code> messages becomes one summary. A provider
          answers an over-long request with a refusal, not a shorter answer.
        </>
      ),
      ko: (
        <>
          <strong>언제.</strong> 매 턴 직전, 둘 중 먼저 닿는 쪽에서 압축합니다. 하나는 대화 추정 토큰이{" "}
          <code>compact.at</code>을 넘을 때로, 턴마다 드는 비용의 상한입니다. 다른 하나는 프롬프트가 서버가 알려 준
          컨텍스트 창에 가까워질 때입니다. 그러면 마지막 <code>keep</code>개 위의 히스토리가 요약 하나로 바뀝니다.
          프로바이더는 너무 긴 요청에 짧은 답이 아니라 거절로 답합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>The window.</strong> <code>{"option.setLlm({ contextWindow })"}</code> tells the chat how large it is.
          The guard holds back the answer ceiling and a 13k buffer below it, and measures with the provider's own count
          of the last turn, so a Korean conversation the character estimate reads as small is still caught. If the
          provider refuses anyway, the chat compacts and sends the same turn once more, and learns the window from the
          refusal.
        </>
      ),
      ko: (
        <>
          <strong>컨텍스트 창.</strong> <code>{"option.setLlm({ contextWindow })"}</code>로 창 크기를 알려 줍니다.
          가드는 그 아래로 답변 한도와 13k 버퍼를 비워 두고, 직전 턴에 프로바이더가 직접 센 토큰 수로 잽니다. 그래서
          글자 수 추정이 작게 보는 한국어 대화도 놓치지 않습니다. 그래도 거절되면 압축한 뒤 같은 턴을 한 번 더 보내고,
          거절 문구에서 창 크기를 알아 둡니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Where it cuts.</strong> Always at a user message, so the kept part never opens with a tool result
          whose call was summarized away.
        </>
      ),
      ko: (
        <>
          <strong>어디서 자르나.</strong> 언제나 user 메시지에서 자릅니다. 그래서 남는 쪽이 호출은 요약돼 사라지고
          결과만 남은 tool 메시지로 시작하지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>How it summarizes.</strong> The summarizing turn carries no tools and no screen, and reads a bounded
          digest rather than the transcript, which is the one thing known not to fit.
        </>
      ),
      ko: (
        <>
          <strong>어떻게 요약하나.</strong> 요약 턴은 툴도 화면도 싣지 않고, 대화 자체가 아니라 길이가 제한된 요약본을
          읽습니다. 대화는 이미 들어가지 않는다고 알려진 바로 그것이니까요.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Tuning.</strong> <code>{"compact={{ at, keep, buffer }}"}</code> on Agent.Chat sets it,{" "}
          <code>{"{ at: Infinity }"}</code> leaves only the window guard, <code>{"{ at: 0 }"}</code> turns all of it
          off, and <code>/compact</code> runs it on demand keeping nothing.
        </>
      ),
      ko: (
        <>
          <strong>조절.</strong> Agent.Chat의 <code>{"compact={{ at, keep, buffer }}"}</code>로 정하고,{" "}
          <code>{"{ at: Infinity }"}</code>이면 창 가드만 남기며, <code>{"{ at: 0 }"}</code>이면 전부 끕니다.{" "}
          <code>/compact</code>로 언제든 남기는 것 없이 실행합니다.
        </>
      ),
    }),
  ];

  const zoneNotes = [
    l.trans({
      en: (
        <>
          <strong>A view, not a wall.</strong> Everything mounted inside (subscriptions, hook tools, guides) belongs to
          the zone's conversation and still to the root agent.
        </>
      ),
      ko: (
        <>
          <strong>벽이 아니라 뷰입니다.</strong> 안에 마운트된 모든 것(구독, 훅 툴, 가이드)은 zone의 대화에 속하면서
          root 에이전트에게도 그대로 보입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>It reads its own container.</strong> A zone's <code>readScreen</code> stops at the zone's edge.
        </>
      ),
      ko: (
        <>
          <strong>자기 컨테이너만 읽습니다.</strong> zone의 <code>readScreen</code>은 zone 경계에서 멈춥니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>An inner chat binds itself.</strong> An Agent.Chat mounted inside joins the zone's session
          automatically.
        </>
      ),
      ko: (
        <>
          <strong>안쪽 채팅은 알아서 묶입니다.</strong> 안에 마운트한 Agent.Chat은 자동으로 그 zone의 세션에
          바인딩됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Guides cascade like layouts.</strong> A zone reads its ancestors' guidance plus its own, never a
          sibling's.
        </>
      ),
      ko: (
        <>
          <strong>가이드는 레이아웃처럼 내려옵니다.</strong> zone은 조상과 자신의 지침을 읽고, 형제 zone의 것은 읽지
          않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>The root loses nothing.</strong> The root chat outside the zones keeps seeing the whole screen.
        </>
      ),
      ko: (
        <>
          <strong>root는 잃는 것이 없습니다.</strong> zone 밖의 root 채팅은 화면 전체를 계속 봅니다.
        </>
      ),
    }),
  ];

  const skipNotes = [
    l.trans({
      en: (
        <>
          <strong>A marker stays behind.</strong> A region deleted outright reads as absent: asked about the footer, the
          agent would say the page has none. The marker's name is a section, so naming it reads the region after all.
        </>
      ),
      ko: (
        <>
          <strong>이름 붙은 표시가 남습니다.</strong> 통째로 지우면 없는 영역으로 읽혀, 푸터를 물으면 에이전트가 이
          페이지엔 푸터가 없다고 답합니다. 표시의 이름이 곧 section이라, 이름을 넘기면 결국 읽을 수 있습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>It hides text, not behaviour.</strong> Tools and state keys are declarations, not markup: an st.tool
          inside is published as before, and highlight still reaches it. It is <code>field.visual</code> one layer up,
          cost rather than secrecy.
        </>
      ),
      ko: (
        <>
          <strong>감추는 것은 텍스트이지 동작이 아닙니다.</strong> 툴과 상태 키는 마크업이 아니라 선언이라, 안에서
          선언한 st.tool은 그대로 공개되고 highlight도 닿습니다. 한 층 위의 <code>field.visual</code>이고, 비밀이 아니라
          비용의 문제입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Reach for it second.</strong> Agent.Zone and <code>{"readScreen({ section })"}</code> narrow a read to
          one container, which beats blocklisting five regions. A footer is last in the document and already past the
          cut on a long page; the regions worth marking sit above the content.
        </>
      ),
      ko: (
        <>
          <strong>두 번째로 꺼낼 도구입니다.</strong> Agent.Zone과 <code>{"readScreen({ section })"}</code>으로 컨테이너
          하나만 읽는 편이 영역 다섯 개를 빼는 것보다 낫습니다. 푸터는 문서 맨 끝이라 긴 페이지에서는 이미 잘린 뒤에
          있으니, 표시할 만한 영역은 본문 위쪽에 있는 것들입니다.
        </>
      ),
    }),
  ];

  const pointerNotes = [
    l.trans({
      en: (
        <>
          <strong>One pointer per turn, not per call.</strong> Calls arrive seconds apart with the model's writing in
          between, so a per-call pointer kept vanishing and coming back.
        </>
      ),
      ko: (
        <>
          <strong>호출이 아니라 턴마다 포인터 하나.</strong> 호출 사이에는 모델이 글을 쓰는 몇 초가 끼어 있어서,
          호출마다 사는 포인터는 계속 사라졌다 나타났습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Press, step aside, wait.</strong> It appears at the first control it presses, drifts clear and waits
          as a spinner, then fades when the turn ends. A spinner left on the button would cover the change it caused.
        </>
      ),
      ko: (
        <>
          <strong>누르고, 비켜서고, 기다립니다.</strong> 처음 누르는 컨트롤에서 나타나 살짝 비켜선 자리에서 스피너로
          기다리다가 턴이 끝나면 사라집니다. 버튼 위에 남은 스피너는 자기가 일으킨 변화를 가리기 때문입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>No control, no pointer.</strong> An agent that only answered a question was never on the screen.
        </>
      ),
      ko: (
        <>
          <strong>컨트롤이 없으면 포인터도 없습니다.</strong> 질문에 답만 한 에이전트는 화면에 있었던 적이 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Scrolling shows a direction.</strong> While the page scrolls to the next control, the pointer holds
          still with a chevron pointing the way the view travels, so it reads as the one scrolling, not as a pointer
          that came loose.
        </>
      ),
      ko: (
        <>
          <strong>스크롤할 때는 방향을 보여 줍니다.</strong> 다음 컨트롤로 스크롤하는 동안 포인터는 제자리에서 화면이
          가는 방향의 셰브론을 답니다. 그래야 화면에서 떨어져 나온 포인터가 아니라 스크롤하는 주체로 읽힙니다.
        </>
      ),
    }),
  ];

  const refuseNotes = [
    l.trans({
      en: (
        <>
          <strong>Several controls share the name</strong> and the call's argument does not say which. A tab's menus
          share one tool, so each menu carries its key and the pointer picks the one switched to.
        </>
      ),
      ko: (
        <>
          <strong>같은 이름의 컨트롤이 여럿인데</strong> 호출 인자가 어느 것인지 말하지 않을 때. 탭 메뉴들은 툴 하나를
          공유하므로 각 메뉴가 자기 키를 달고, 포인터는 실제로 전환된 메뉴를 고릅니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>An approval or a guard turned the call back.</strong>
        </>
      ),
      ko: (
        <>
          <strong>승인이나 가드가 호출을 되돌렸을 때.</strong>
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>The control is not really visible:</strong> under a modal's backdrop, in a drawer that slid away, or
          faded to nothing.
        </>
      ),
      ko: (
        <>
          <strong>컨트롤이 실제로 보이지 않을 때.</strong> 모달 뒤, 밀려난 서랍 안, 투명해진 것이 그렇습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>The tab is in the background.</strong>
        </>
      ),
      ko: (
        <>
          <strong>탭이 백그라운드에 있을 때.</strong>
        </>
      ),
    }),
  ];

  const linkNotes = [
    l.trans({
      en: (
        <>
          <strong>No element, no drawing.</strong> A call that reaches no control on screen draws nothing, navigate
          mostly included: a bar across the top of the page read as page chrome, not as the agent acting.
        </>
      ),
      ko: (
        <>
          <strong>요소가 없으면 그리지 않습니다.</strong> 화면의 컨트롤에 닿지 않는 호출은 아무것도 그리지 않고,
          navigate도 대체로 그렇습니다. 페이지 상단에 걸었던 바는 에이전트의 동작이 아니라 페이지의 일부처럼 읽혔습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>A visible link is pressed.</strong> When exactly one visible link goes where the navigation is going,
          the pointer clicks it before the route moves. It is the only call the runtime waits for, capped at 600ms: a
          click drawn on a replaced tree is no click.
        </>
      ),
      ko: (
        <>
          <strong>보이는 링크는 누릅니다.</strong> 목적지로 가는 보이는 링크가 정확히 하나면, 라우팅 전에 포인터가
          그것을 누릅니다. 런타임이 기다려 주는 유일한 호출이며 상한은 600ms입니다. 라우터가 갈아치운 트리 위의 클릭은
          클릭이 아니니까요.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Links decide the drawing, not the permission.</strong> The agent may go anywhere the user could type.
        </>
      ),
      ko: (
        <>
          <strong>링크는 그릴지를 정할 뿐, 허용을 정하지 않습니다.</strong> 에이전트는 사용자가 주소창에 칠 수 있는
          곳이면 어디든 갑니다.
        </>
      ),
    }),
  ];

  const adaptorRows = [
    {
      name: "OpenaiLlm",
      desc: l.trans({
        en: "The default. Speaks chat-completions to any host: OpenAI, DeepSeek, Groq, OpenRouter, Ollama.",
        ko: "기본값입니다. host가 가리키는 곳에 chat-completions로 말합니다. OpenAI, DeepSeek, Groq, OpenRouter, Ollama.",
      }),
    },
    {
      name: "AnthropicLlm",
      desc: l.trans({
        en: "Speaks the Messages API, and reads a PDF as well as a picture.",
        ko: "Messages API로 말하고, 사진뿐 아니라 PDF도 읽습니다.",
      }),
    },
  ];

  const llmNotes = [
    l.trans({
      en: (
        <>
          <strong>model is required.</strong> A default would age into a 404, and would decide for the app whether it
          can see images.
        </>
      ),
      ko: (
        <>
          <strong>model은 필수입니다.</strong> 기본값을 두면 언젠가 404가 되고, 이미지를 볼 수 있는지를 앱 대신 정해
          버립니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>accepts overrides what the model reads.</strong> An adaptor answers for an API, and one API serves
          models that differ.
        </>
      ),
      ko: (
        <>
          <strong>accepts는 모델이 읽는 것을 덮어씁니다.</strong> 어댑터는 API 하나를 대변하고, 한 API가 서로 다른
          모델을 섬기기 때문입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Extra fields ride along.</strong> setLlm keeps whatever else it is handed, so your own adaptor reads
          its fields with <code>{"use<MyLlmOption>()"}</code>.
        </>
      ),
      ko: (
        <>
          <strong>추가 필드도 함께 실립니다.</strong> setLlm은 건네받은 나머지 필드도 보관하므로, 직접 쓴 어댑터는{" "}
          <code>{"use<MyLlmOption>()"}</code>로 자기 설정을 읽습니다.
        </>
      ),
    }),
  ];

  const bulletList = "my-4 list-disc space-y-2 pl-5";

  return (
    <Scroll>
      <Scroll.Slide id="agent-overview" title={l.trans({ en: "In-Page Agent", ko: "인페이지 에이전트" })}>
        <Docs.Title>{l.trans({ en: "In-Page Agent", ko: "인페이지 에이전트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Every Akan app can host a chat agent that reads the screen and works it for the user; the assistant on this page is one. It can only press what the screen already offers, so it never gets a lever the user does not have.",
              ko: "모든 Akan 앱에는 화면을 읽고 사용자 대신 조작하는 채팅 에이전트를 둘 수 있습니다. 지금 이 페이지의 어시스턴트가 바로 그것입니다. 에이전트는 화면이 이미 내어 준 컨트롤만 누를 수 있으므로, 사용자에게 없는 레버를 갖는 일은 없습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "What it may do is what a component declared, and what it may read is what a component subscribed. A store class alone publishes nothing.",
              ko: "할 수 있는 일은 컴포넌트가 선언한 것, 읽을 수 있는 것은 컴포넌트가 구독한 것입니다. 스토어 클래스만으로는 아무것도 공개되지 않습니다.",
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {[
              {
                title: l.trans({ en: "One mount", ko: "한 줄 마운트" }),
                desc: l.trans({
                  en: "<Agent.Chat /> in a layout is the whole integration: launcher, transcript, approval card and a streaming loop.",
                  ko: "레이아웃의 <Agent.Chat /> 한 줄이 통합의 전부입니다. 런처, 대화창, 승인 카드, 스트리밍 루프까지 들어 있습니다.",
                }),
              },
              {
                title: l.trans({ en: "Tools run in the browser", ko: "툴은 브라우저에서 실행" }),
                desc: l.trans({
                  en: "The server is a stateless relay that never runs a tool. Every action runs in the user's own session, behind guards and the approval card.",
                  ko: "서버는 툴을 실행하지 않는 무상태 릴레이입니다. 모든 동작은 사용자 자신의 세션에서, 가드와 승인 카드를 거쳐 실행됩니다.",
                }),
              },
              {
                title: l.trans({ en: "Built into the framework", ko: "프레임워크 내장" }),
                desc: l.trans({
                  en: "The relay endpoint, two LLM adaptors and the chat UI all ship with akanjs. There is no extra library to mount.",
                  ko: "릴레이 엔드포인트, LLM 어댑터 두 개, 채팅 UI가 모두 akanjs에 들어 있습니다. 따로 붙일 라이브러리가 없습니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-1 font-semibold text-primary">{title}</div>
                <div className="text-foreground/70 text-sm">{desc}</div>
              </div>
            ))}
          </div>
          <Docs.Figure
            title={l.trans({ en: "Tools run in the browser", ko: "툴은 브라우저에서 실행됩니다" })}
            image="agent-runtime"
            prompt={`
              A browser window drawn large across the left two thirds of the frame, labelled "Browser" at its top.
              Inside it on the left, a page sketch with a top bar, two short rows and two small buttons; a small mouse
              pointer rests on one button, and that pointer and button are traced as the red accent, labelled "Tools
              Run Here". Inside the browser on the right, a narrow chat panel holding three speech bubbles, labelled
              "Agent.Chat". A two-headed arrow runs from the chat panel to a server outside the browser at the right,
              labelled "Relay" with a smaller second line "never runs a tool". A two-headed arrow runs from the server
              to a cloud at the far right, labelled "LLM".
            `}
            alt={l.trans({
              en: "The chat and every tool run inside the user's browser, on the controls the page already shows. The server is only a relay that spends the LLM key and never runs a tool.",
              ko: "채팅과 모든 툴은 사용자의 브라우저 안에서, 페이지가 이미 보여주는 컨트롤 위에서 실행됩니다. 서버는 LLM 키만 쓰는 릴레이일 뿐이며 툴을 실행하지 않습니다.",
            })}
          />
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Runtime map", ko: "런타임 지도" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Piece", ko: "구성 요소" })} items={runtimeRows} />
          <Docs.Alert type="info">
            {l.trans({
              en: "External agents that call your domain over HTTP use the MCP server instead. It is a different catalogue, derived from signal guards.",
              ko: "HTTP로 도메인을 호출하는 외부 에이전트는 대신 MCP 서버를 씁니다. signal 가드에서 만들어지는 별도의 카탈로그입니다.",
            })}{" "}
            <Link href="/cheatsheet/interface/mcp" className="text-primary">
              {l.trans({ en: "MCP Server", ko: "MCP 서버" })}
            </Link>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="agent-mount" title={l.trans({ en: "Mount and Secure", ko: "마운트와 보안" })}>
        <Docs.Title>{l.trans({ en: "Mount and Secure", ko: "마운트와 보안" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Turning the agent on takes three steps: mount the chat, give it an LLM key, and name who may use it.",
              ko: "에이전트를 켜는 데는 세 단계면 됩니다. 채팅을 마운트하고, LLM 키를 주고, 누가 쓸 수 있는지 정합니다.",
            })}
          </div>
          <ol className="my-4 list-decimal space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Mount <Agent.Chat /> once, in a layout. The runAgentTurn relay is already served on every app.",
                ko: "레이아웃에 <Agent.Chat />을 한 번 마운트합니다. runAgentTurn 릴레이는 모든 앱에 이미 제공됩니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Give it a key with option.setLlm in lib/option.ts.",
                ko: "lib/option.ts에서 option.setLlm으로 키를 줍니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Name a guard with option.setAgentAccess. Until you do, every call is refused.",
                ko: "option.setAgentAccess로 가드를 지정합니다. 지정하기 전까지는 모든 호출이 거절됩니다.",
              })}
            </li>
          </ol>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/<app>/page/_layout.tsx · apps/<app>/lib/option.ts"
          code={`// page/_layout.tsx
<Agent.Chat persist />

// lib/option.ts — the key lives in env, which is gitignored
import { SignedIn } from "../srvkit";

export const option = new AkanOption<ModulesOptions>()
  .setLlm((options) => options.llm ?? {})
  .setAgentAccess(SignedIn);`}
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: "AgentRelayAccess refuses every call until a guard is registered, the same answer None gives, so the chat cannot spend the LLM key. A product with accounts names its own guard in option.ts, as it would on any endpoint. AKAN_AGENT=false removes the whole surface.",
            ko: "AgentRelayAccess는 가드가 등록되기 전까지 None과 똑같이 모든 호출을 거절하므로, 채팅이 LLM 키를 쓸 수 없습니다. 계정이 있는 제품은 다른 엔드포인트처럼 option.ts에서 자기 가드를 지정합니다. AKAN_AGENT=false는 표면 전체를 내립니다.",
          })}
        </Docs.Alert>
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "Agent.Chat options", ko: "Agent.Chat 옵션" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Option", ko: "옵션" })} items={chatOptionRows} />
          <div>
            {l.trans({
              en: (
                <span>
                  The panel itself (its controlled <code>open</code> pair, the twelve <code>_overrides.tsx</code> slots,
                  card tools, the <code>@</code> menu, the queue and the transcript store) is covered on{" "}
                  <Link href="/cheatsheet/interface/agent-chat" className="text-primary">
                    Agent Chat
                  </Link>
                  .
                </span>
              ),
              ko: (
                <span>
                  패널 자체(controlled <code>open</code> 쌍, <code>_overrides.tsx</code> 슬롯 열두 개, card 툴,{" "}
                  <code>@</code> 메뉴, 대기열, 대화 보관)는{" "}
                  <Link href="/cheatsheet/interface/agent-chat" className="text-primary">
                    Agent Chat
                  </Link>
                  에서 다룹니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Attachments", ko: "첨부" })}</Docs.SubSubTitle>
          <ul className={bulletList}>
            {attachNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Voice", ko: "음성" })}</Docs.SubSubTitle>
          <ul className={bulletList}>
            {voiceNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.Alert type="info">
            {l.trans({
              en: "attach and voice carry functions, and a function cannot cross the RSC boundary, so a server layout cannot pass them. Mount the chat from a small client component in ui/ instead:",
              ko: "attach와 voice는 함수를 담고 있고, 함수는 RSC 경계를 넘지 못합니다. 그래서 서버 레이아웃에서는 넘길 수 없습니다. 대신 ui/에 작은 클라이언트 컴포넌트를 두고 거기서 채팅을 마운트하세요:",
            })}
          </Docs.Alert>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/akan/ui/DocsAgentChat.tsx"
          code={`"use client";
import { useSpeech } from "@libs/util/webkit";
import { Agent } from "akanjs/ui";

export const DocsAgentChat = () => {
  const voice = useSpeech();
  return <Agent.Chat persist voice={voice} />;
};`}
        />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="agent-surface" title={l.trans({ en: "The Declared Surface", ko: "선언하는 표면" })}>
        <Docs.Title>{l.trans({ en: "The Declared Surface", ko: "선언하는 표면" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The agent's surface is exactly what the mounted components declare. Declare a tool beside the control that does the same thing, and the agent and the user press one handler.",
              ko: "에이전트의 표면은 마운트된 컴포넌트가 선언한 것, 딱 그만큼입니다. 같은 일을 하는 컨트롤 바로 옆에 툴을 선언하면, 에이전트와 사용자가 같은 핸들러 하나를 누릅니다.",
            })}
          </div>
          <ul className={bulletList}>
            {surfaceBasics.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="<Model>.Zone.tsx — the tool and the button are one declaration"
          code={`const waypointList = st.use.waypointList();
const publish = st.tool("publishPlan")
  .desc("Publish the flight plan being edited.")
  .exec(() => st.do.publishPlan());
const focusWaypoint = st.tool("focusWaypoint")
  .desc("Center the map on one waypoint.")
  .arg("waypointId", ID)
  .opt("zoom", Int)
  .exec((waypointId, zoom) => st.do.selectWaypoint(waypointId, zoom));

st.expose("selectedWaypointId", ID)
  .desc("The waypoint the map is centered on.")
  .value(selected?.id ?? null);

<Button onClick={publish}>{l("plan.publishPlan")}</Button>
<Agent.Guide instructions="This screen edits the weekly flight plan. Focus a waypoint before editing it." />`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>
            {l.trans({ en: "Declaring tools and state", ko: "툴과 상태를 선언하는 API" })}
          </Docs.SubSubTitle>
          <div className="my-4 space-y-3">
            {declareCards.map(({ title, notes }) => (
              <div key={title} className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="wrap-anywhere mb-2 font-mono font-semibold text-foreground text-sm">{title}</div>
                <ul className="list-disc space-y-1 pl-5 text-foreground/70 text-sm">
                  {notes.map((note, idx) => (
                    <li key={idx}>{note}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "Six built-in tools", ko: "기본 툴 여섯 가지" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "These are on every screen, whatever it declares. builtins narrows the first five; askUser belongs to the session and always stays.",
              ko: "화면이 무엇을 선언하든 항상 실리는 툴입니다. 앞의 다섯은 builtins로 줄일 수 있고, askUser는 세션의 것이라 항상 남습니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Tool", ko: "툴" })} items={builtinRows} />
          <ul className={bulletList}>
            {builtinNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "What the agent can read", ko: "에이전트가 읽을 수 있는 것" })}
          </Docs.SubSubTitle>
          <ul className={bulletList}>
            {readNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "Return the answer, not the record", ko: "레코드가 아니라 답을 돌려주기" })}
          </Docs.SubSubTitle>
          <ul className={bulletList}>
            {resultNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "How a turn runs", ko: "턴이 도는 방식" })}</Docs.SubSubTitle>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {turnCards.map(({ title, desc }) => (
              <div key={title} className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-1 font-semibold text-primary">{title}</div>
                <div className="text-foreground/70 text-sm">{desc}</div>
              </div>
            ))}
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "Long work and Stop", ko: "긴 작업과 중지" })}</Docs.SubSubTitle>
          <ul className={bulletList}>
            {longWorkNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Slash commands", ko: "슬래시 커맨드" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "The chat answers six commands of its own. An app writes none of them.",
              ko: "채팅은 자체 커맨드 여섯 개에 답합니다. 앱이 작성하는 것은 없습니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Command", ko: "커맨드" })} items={commandRows} />
          <ul className={bulletList}>
            {commandNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "Long conversations summarize themselves", ko: "긴 대화는 스스로 요약합니다" })}
          </Docs.SubSubTitle>
          <Docs.Figure
            title={l.trans({ en: "Compaction keeps the tail", ko: "압축은 끝부분을 남깁니다" })}
            image="transcript-compaction"
            prompt={`
              Two tall narrow columns side by side with a wide gap between them, and one thick arrow pointing from the
              left column to the right column. The left column is a stack of eight small speech bubbles; a dashed
              horizontal line crosses it between the fifth and the sixth bubble, labelled "Cut" beside the line. The
              right column has, at its top, one wide speech bubble traced as the red accent and labelled "Summary",
              and under it three small speech bubbles; a bracket beside those three is labelled "Kept". Nothing else.
            `}
            alt={l.trans({
              en: "Past the threshold, every message above the cut becomes one summary message, and the last few messages are kept as they were. The cut always lands on a user message.",
              ko: "기준을 넘으면 자른 지점 위의 메시지가 모두 요약 메시지 하나로 바뀌고, 마지막 몇 개는 그대로 남습니다. 자르는 지점은 언제나 user 메시지입니다.",
            })}
          />
          <ul className={bulletList}>
            {compactNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="agent-zones" title={l.trans({ en: "Zone Agents", ko: "Zone 에이전트" })}>
        <Docs.Title>{l.trans({ en: "Zone Agents", ko: "Zone 에이전트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Agent.Zone gives one section of a screen its own conversation, so each part of a busy page can have a focused agent.",
              ko: "Agent.Zone은 화면의 한 구획에 자기만의 대화를 줍니다. 복잡한 페이지의 각 부분이 집중된 에이전트를 하나씩 가질 수 있습니다.",
            })}
          </div>
          <Docs.Figure
            title={l.trans({ en: "Two zones, one root agent", ko: "zone 둘, root 에이전트 하나" })}
            image="agent-zones"
            prompt={`
              One browser window filling most of the frame, and nothing at all drawn outside it — no people, devices,
              clouds, servers or arrows. Inside it, two tall rounded rectangles side by side with a gap between them.
              The left one is labelled "Comments Zone" and holds three short list rows and, at its bottom, a small chat
              panel with two speech bubbles. The right one is labelled "Posts Zone" and holds a text editor sketch of
              several lines and, at its bottom, a small chat panel with two speech bubbles. A thin dashed outline is
              drawn around both zones together. In the browser's bottom right corner, a round chat button traced as
              the red accent, labelled "Root Agent".
            `}
            alt={l.trans({
              en: "Two zones on one screen, each with its own inline chat that reads only its own section, while the root agent's chat keeps seeing both.",
              ko: "한 화면의 zone 두 개가 각자 자기 구획만 읽는 인라인 채팅을 갖고, root 에이전트의 채팅은 둘 다 계속 봅니다.",
            })}
          />
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="two zones, two parallel conversations"
          code={`<Agent.Zone id="comments" label="Comment management" instructions="Moderate the comment queue." persist>
  <Comment.Zone.Board init={commentInit} />
  <Agent.Chat inline />
</Agent.Zone>

<Agent.Zone id="posts" label="Post management">
  <Post.Zone.Editor init={postInit} />
  <Agent.Chat inline />
</Agent.Zone>`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {zoneNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="agent-skip" title={l.trans({ en: "Skipping A Region", ko: "읽지 않을 영역" })}>
        <Docs.Title>{l.trans({ en: "Skipping A Region", ko: "읽지 않을 영역" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Agent.Skip keeps a region such as a footer, a cookie banner or a repeated nav out of the default readScreen. Those regions cost as many tokens as real content, on the read and on every later turn, because the read stays in the transcript.",
              ko: "Agent.Skip은 푸터, 쿠키 배너, 반복되는 내비게이션 같은 영역을 기본 readScreen에서 뺍니다. 그런 영역도 본문과 똑같이 토큰을 쓰고, 읽은 결과가 대화에 남으므로 이후 모든 턴에서 다시 씁니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="a region marked, and what the read prints instead"
          code={`<Agent.Skip label="site footer">
  <Footer />
</Agent.Skip>

// Or on the element the page already renders, where a wrapper div would move a flex or grid layout:
<footer id="footer" data-agent-skip="site footer">…</footer>

// readScreen then prints this in place of the whole region:
// [skipped: site footer (#footer)]`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {skipNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="agent-visual" title={l.trans({ en: "Showing the Work", ko: "작업을 보여주기" })}>
        <Docs.Title>{l.trans({ en: "Showing the Work", ko: "작업을 보여주기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The chat panel is closed as often as it is open, so the page itself shows what the agent does. The control a call came from is ringed, scrolled into view if needed, and a pointer travels to it and presses it.",
              ko: "채팅 패널은 열려 있는 만큼 닫혀 있으므로, 에이전트가 하는 일을 페이지가 직접 보여 줍니다. 호출이 나온 컨트롤에 링이 걸리고, 필요하면 화면으로 스크롤되며, 포인터가 그리로 가서 누릅니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "An app writes nothing for this. Passing the handler by reference, as in onChange={st.do.setTitleOnTask}, is what publishes the tool and marks the control, so an inline arrow silently loses all three: the tool, the mark and the pointer.",
              ko: "앱이 쓸 코드는 없습니다. onChange={st.do.setTitleOnTask}처럼 핸들러를 레퍼런스로 넘기는 것이 툴을 공개하고 컨트롤에 표식을 남기므로, 인라인 화살표 하나가 툴, 표식, 포인터 셋을 한꺼번에 조용히 잃게 합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Try it below. Both buttons hand their st.tool callable straight to onClick. Ask the agent to count up three times and reset, and watch where it presses.",
              ko: "아래에서 직접 해 보세요. 두 버튼 모두 st.tool의 callable을 onClick에 그대로 넘깁니다. 에이전트에게 세 번 올린 뒤 초기화해 달라고 하고 어디를 누르는지 보세요.",
            })}
          </div>
        </Docs.Description>
        <AgentVisualDemo />
        <Docs.Description>
          <Docs.SubSubTitle>
            {l.trans({ en: "The pointer lives for a turn", ko: "포인터는 한 턴 동안 머뭅니다" })}
          </Docs.SubSubTitle>
          <ul className={bulletList}>
            {pointerNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "What it refuses to draw", ko: "그리지 않는 경우" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A ring on the wrong element is worse than none, because it tells the user something untrue. So nothing is drawn when:",
              ko: "엉뚱한 요소에 걸린 링은 없느니만 못합니다. 방금 일어난 일에 대해 사용자에게 거짓을 말하기 때문입니다. 그래서 다음 경우에는 그리지 않습니다:",
            })}
          </div>
          <ul className={bulletList}>
            {refuseNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <div>
            {l.trans({
              en: "Almost nothing waits for the animation: the call starts the moment the effect receives its event, so decoration never slows the agent.",
              ko: "연출 때문에 기다리는 것은 거의 없습니다. 이벤트를 넘겨받는 순간 호출이 시작되므로, 연출이 에이전트를 느리게 하지 않습니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Navigation and links", ko: "이동과 링크" })}</Docs.SubSubTitle>
          <ul className={bulletList}>
            {linkNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <div>
            {l.trans({
              en: "To turn it off, visual={false} draws nothing, and visual={{ cursor: false }} keeps the ring but drops the pointer.",
              ko: "끄려면 visual={false}로 아무것도 그리지 않거나, visual={{ cursor: false }}로 링은 남기고 포인터만 뺍니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/<app>/page/_layout.tsx"
          code={`<Agent.Chat visual={false} />

<Agent.Chat visual={{ cursor: false }} />`}
        />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="agent-llm" title={l.trans({ en: "Swapping the Model", ko: "모델 교체" })}>
        <Docs.Title>{l.trans({ en: "Swapping the Model", ko: "모델 교체" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The model is configured in option.ts, never in the environment. setLlm fills apiKey, model, host, accepts, maxTokens and contextWindow for whichever adaptor holds LlmAdaptorRole, so the settings survive a provider swap.",
              ko: "모델은 환경변수가 아니라 option.ts에서 설정합니다. setLlm은 LlmAdaptorRole을 차지한 어댑터에 apiKey, model, host, accepts, maxTokens, contextWindow를 채우므로, 프로바이더를 바꿔도 설정은 그대로입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Two adaptors ship, one per wire:",
              ko: "어댑터는 와이어마다 하나씩, 두 개가 들어 있습니다:",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Adaptor", ko: "어댑터" })} items={adaptorRows} />
          <ul className={bulletList}>
            {llmNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Writing your own adaptor", ko: "어댑터 직접 쓰기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "An adaptor implements one method, chat(request, onDelta?): the whole transcript goes in and one assistant answer comes out. Install it with applyAdaptor; as with applyMiddleware, the last writer wins.",
              ko: "어댑터가 구현할 것은 chat(request, onDelta?) 하나입니다. 전체 대화가 들어가고 어시스턴트 응답 하나가 나옵니다. applyAdaptor로 끼우며, applyMiddleware처럼 마지막에 쓴 쪽이 이깁니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/<app>/lib/option.ts"
          code={`import { LlmAdaptorRole } from "akanjs/service";
import { MyLlm } from "../srvkit";

export const option = new AkanOption<ModulesOptions>()
  .setLlm((options) => options.llm ?? {})
  .applyAdaptor(LlmAdaptorRole, MyLlm);`}
        />
        <Code.Snippet
          className="w-full"
          title="akanjs/service — LlmAdaptor"
          code={`export interface LlmAdaptor {
  chat(request: LlmTurnRequest, onDelta?: (delta: string) => void): Promise<LlmTurnAnswer | null>;
}`}
        />
      </Scroll.Slide>
      <Divider />

      <DocsToc />
    </Scroll>
  );
});
