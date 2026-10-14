import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const cardTitle = "mb-1 font-semibold text-primary";
  const cardBody = "text-foreground/70 text-sm";
  const codeChip =
    "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const termRows = [
    {
      name: l.trans({ en: "turn", ko: "턴 (turn)" }),
      desc: l.trans({
        en: "Everything the agent says and does between one user message and the next.",
        ko: "사용자 메시지 하나와 다음 메시지 사이에 에이전트가 말하고 한 일 전부입니다.",
      }),
    },
    {
      name: l.trans({ en: "transcript", ko: "대화 (transcript)" }),
      desc: l.trans({
        en: "The conversation so far, kept in the browser tab and sent to the model every turn.",
        ko: "브라우저 탭에 있고 매 턴 모델에 다시 전송되는, 지금까지의 대화입니다.",
      }),
    },
    {
      name: l.trans({ en: "relay", ko: "릴레이 (relay)" }),
      desc: l.trans({
        en: "The `runAgentTurn` endpoint, which passes the transcript to the LLM and never runs a tool.",
        ko: "대화를 LLM에 전달할 뿐 툴은 실행하지 않는 `runAgentTurn` 엔드포인트입니다.",
      }),
    },
    {
      name: l.trans({ en: "tool", ko: "툴 (tool)" }),
      desc: l.trans({
        en: "One action a component publishes with `st.tool`, usually the handler its button calls.",
        ko: "컴포넌트가 `st.tool`로 공개한 동작 하나로, 보통 버튼이 이미 부르는 핸들러입니다.",
      }),
    },
    {
      name: l.trans({ en: "approval card", ko: "승인 카드" }),
      desc: l.trans({
        en: "A card that holds a call until the user approves it.",
        ko: "사용자가 승인할 때까지 호출을 붙잡아 두는 카드입니다.",
      }),
    },
    {
      name: l.trans({ en: "slot", ko: "슬롯 (slot)" }),
      desc: l.trans({
        en: "One part of the chat you can replace in `_overrides.tsx`.",
        ko: "`_overrides.tsx`에서 갈아 끼울 수 있는 채팅의 한 부분입니다.",
      }),
    },
    {
      name: l.trans({ en: "reference", ko: "참조 (reference)" }),
      desc: l.trans({
        en: "Data the user pointed at with `@`, carried inside their message.",
        ko: "사용자가 `@`로 가리켜 자기 메시지에 실어 보내는 데이터입니다.",
      }),
    },
    {
      name: "zone",
      desc: l.trans({
        en: "A section wrapped in `Agent.Zone`, with a conversation of its own.",
        ko: "`Agent.Zone`으로 감싸 자기만의 대화를 가진 구획입니다.",
      }),
    },
  ];

  const turnRows = [
    {
      question: l.trans({ en: "Which machine ran the refund?", ko: "환불은 어느 기계에서 실행됐나요?" }),
      answer: l.trans({
        en: "The customer's browser tab, through the handler the Refund button calls.",
        ko: "고객의 브라우저 탭입니다. 환불 버튼이 부르는 바로 그 핸들러로 실행됐습니다.",
      }),
    },
    {
      question: l.trans({ en: "Whose credential did it carry?", ko: "누구의 자격증명으로 실행됐나요?" }),
      answer: l.trans({
        en: "The signed-in user's own, exactly like a click on that page.",
        ko: "로그인한 사용자 자신의 것입니다. 그 페이지에서 버튼을 누른 것과 똑같습니다.",
      }),
    },
    {
      question: l.trans({
        en: "What kept it off someone else's order?",
        ko: "남의 주문에 손대지 못하게 막은 것은?",
      }),
      answer: l.trans({
        en: "The guards every call passes, plus the approval card when the tool asks for one.",
        ko: "모든 호출이 지나는 가드, 그리고 툴이 요구하면 승인 카드입니다.",
      }),
    },
    {
      question: l.trans({ en: "What did the server do?", ko: "서버는 무엇을 했나요?" }),
      answer: l.trans({
        en: "`runAgentTurn` forwarded the transcript and tool descriptions and returned one answer.",
        ko: "`runAgentTurn`이 대화와 툴 설명을 프로바이더에 넘기고 응답 하나를 돌려줬습니다.",
      }),
    },
    {
      question: l.trans({ en: "What did the server keep?", ko: "서버에 남은 것은?" }),
      answer: l.trans({
        en: "Nothing: it holds no session and stores no transcript.",
        ko: "없습니다. 세션도 대화도 서버에 남지 않습니다.",
      }),
    },
  ];

  const mountNotes = [
    l.trans({
      en: (
        <>
          <strong>
            <code>instructions</code> is English, always.
          </strong>{" "}
          The model reads it whatever language the shop sells in, and the same holds for every <code>.desc()</code> and{" "}
          <code>Agent.Guide</code>.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>instructions</code>는 항상 영어입니다.
          </strong>{" "}
          가게가 어느 언어로 장사하든 모델이 읽는 글이라서, 모든 <code>.desc()</code>와 <code>Agent.Guide</code>도
          마찬가지입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>title</code> and <code>intro</code> go through <code>l()</code>.
          </strong>{" "}
          <code>l()</code> is for strings a person reads, which is why <code>instructions</code> does not use it.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>title</code>과 <code>intro</code>는 <code>l()</code>을 거칩니다.
          </strong>{" "}
          <code>l()</code>은 사람이 읽는 문자열용이라서 <code>instructions</code>에는 쓰지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>persist</code> keeps the conversation across reloads.
          </strong>{" "}
          The last section covers where it is kept.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>persist</code>는 새로고침해도 대화를 남깁니다.
          </strong>{" "}
          어디에 보관되는지는 마지막 섹션에서 다룹니다.
        </>
      ),
    }),
  ];

  const builtinRows = [
    {
      name: "navigate",
      desc: l.trans({
        en: "Opens an internal path through the same router `Link` uses.",
        ko: "`Link`와 같은 라우터로 내부 경로를 엽니다.",
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
      name: "readScreen",
      desc: l.trans({
        en: "Reads the rendered screen as compact text.",
        ko: "렌더된 화면을 압축한 텍스트로 읽습니다.",
      }),
    },
    {
      name: "readState",
      desc: l.trans({
        en: "Reads one store key the screen subscribed, masked by its model.",
        ko: "화면이 구독한 스토어 키 하나를 모델로 마스킹해 읽습니다.",
      }),
    },
    {
      name: "highlight",
      desc: l.trans({
        en: "Scrolls one thing into view and flashes it, to show the user where it is.",
        ko: "대상을 화면으로 스크롤해 깜빡이며, 사용자에게 위치를 보여 줍니다.",
      }),
    },
  ];

  const builtinNotes = [
    l.trans({
      en: (
        <>
          <strong>Keep a chat on its screen</strong> with{" "}
          <code>{'builtins={["readScreen", "readState", "highlight"]}'}</code>. Without <code>navigate</code> and{" "}
          <code>goBack</code> it cannot leave.
        </>
      ),
      ko: (
        <>
          <strong>화면을 떠나면 안 되는 채팅</strong>은{" "}
          <code>{'builtins={["readScreen", "readState", "highlight"]}'}</code>로 둡니다. <code>navigate</code>와{" "}
          <code>goBack</code>이 없으면 떠날 수 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>A withheld tool does not exist for the model.</strong> Calling it anyway answers "unknown tool", the
          same as a name that was never registered.
        </>
      ),
      ko: (
        <>
          <strong>뺀 툴은 모델에게 없는 툴입니다.</strong> 이름을 짐작해 호출해도, 등록된 적 없는 이름과 똑같이 "unknown
          tool"로 답합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>A screen's own tool is never withheld.</strong> A tool a component declares under a built-in's name
          belongs to the screen, so <code>builtins</code> leaves it alone.
        </>
      ),
      ko: (
        <>
          <strong>화면이 선언한 툴은 빠지지 않습니다.</strong> 컴포넌트가 기본 툴과 같은 이름으로 선언한 툴은 화면의
          것이라 <code>builtins</code>가 건드리지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>askUser</code> is not on this list.
          </strong>{" "}
          It belongs to the session, so <code>builtins</code> never removes it.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>askUser</code>는 이 목록에 없습니다.
          </strong>{" "}
          세션의 툴이라 <code>builtins</code>로 빠지지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>There is no general wait tool.</strong> One was built and removed because, knowing no key's meaning,
          it parked turns on whatever key looked promising; declare a waiting tool beside the control that starts the
          work instead.
        </>
      ),
      ko: (
        <>
          <strong>범용 대기 툴은 없습니다.</strong> 만들었다가, 키의 뜻을 모른 채 그럴듯한 키마다 턴을 세워 두는 바람에
          제거했습니다. 대신 그 작업을 시작하는 컨트롤 옆에 기다리는 툴을 직접 선언하세요.
        </>
      ),
    }),
  ];

  const slots = [
    {
      name: "AgentChat",
      fallback: "",
      en: "The whole panel (launcher, transcript, cards and composer), so reach for it last.",
      ko: "런처, 대화, 카드, 작성창까지 패널 전체라서 가장 마지막에 꺼냅니다.",
    },
    {
      name: "AgentLauncher",
      fallback: "DefaultLauncher",
      en: "The closed-state button, given `label`, `hotkey`, `unread` for a new-message badge, and `style` carrying its layer, which it spreads onto its root as it does `className`.",
      ko: "`label`, `hotkey`, 새 메시지 뱃지용 `unread`, 그리고 레이어를 담은 `style`을 받는 닫힌 상태의 버튼입니다. `style`은 `className`처럼 루트에 펼쳐 넣습니다.",
    },
    {
      name: "AgentBubble",
      fallback: "DefaultBubble",
      en: "One message; wrap yours in `memo()`, since the transcript re-renders on every delta.",
      ko: "메시지 하나이며, 대화가 스트리밍 조각마다 다시 그려지므로 `memo()`로 감싸세요.",
    },
    {
      name: "AgentSteps",
      fallback: "DefaultSteps",
      en: "One whole agent turn plus `isRunning`; the default adds no element.",
      ko: "에이전트 턴 하나 전체와 `isRunning`을 받으며, 기본 구현은 요소를 더하지 않습니다.",
    },
    {
      name: "AgentComposer",
      fallback: "DefaultComposer",
      en: "The input row with Send and Stop, whose field shell comes from the `input` recipe slot.",
      ko: "Send와 Stop이 있는 입력 줄이며, 입력 필드 모양은 `input` recipe 슬롯에서 옵니다.",
    },
    {
      name: "AgentApproval",
      fallback: "DefaultApproval",
      en: "The confirm gate above the composer, which a `remove*` tool reaches by default.",
      ko: "`remove*` 툴이 기본으로 거치는, 작성창 위의 승인 관문입니다.",
    },
    {
      name: "AgentQuestion",
      fallback: "DefaultQuestion",
      en: "The `askUser` card, which shows the choices while a free-text answer goes in the composer.",
      ko: "보기만 보여 주는 `askUser` 카드이며, 직접 쓰는 답은 작성창에 입력합니다.",
    },
    {
      name: "AgentQueued",
      fallback: "DefaultQueued",
      en: "The message parked while a turn runs, with its take-back and drop controls.",
      ko: "턴이 도는 동안 대기 중인 메시지로, 되돌리기와 버리기 버튼을 함께 그립니다.",
    },
    {
      name: "AgentMenu",
      fallback: "DefaultAgentMenu",
      en: "The completion list above the composer: `/` commands and `@` references.",
      ko: "`/` 커맨드와 `@` 참조를 보여 주는, 작성창 위의 자동완성 목록입니다.",
    },
    {
      name: "AgentMarkdown",
      fallback: "DefaultMarkdown",
      en: "Assistant text, built as React elements and never with `dangerouslySetInnerHTML`.",
      ko: "어시스턴트 텍스트이며, 기본 렌더러는 `dangerouslySetInnerHTML` 없이 React 요소만 만듭니다.",
    },
    {
      name: "AgentCode",
      fallback: "DefaultCode",
      en: "A fenced code block in that text, where a highlighter binds; `lang` is the fence's language.",
      ko: "신택스 하이라이터를 붙이는 코드 블록 자리이며, `lang`은 펜스에 적힌 언어입니다.",
    },
    {
      name: "AgentToolCard",
      fallback: "DefaultToolCard",
      en: "The frame around a card tool's own component.",
      ko: "card 툴이 그리는 앱 컴포넌트를 감싸는 틀입니다.",
    },
  ];

  const slotNotes = [
    l.trans({
      en: (
        <>
          <strong>Compose the default.</strong> Eleven slots export their default beside them, so a replacement can wrap
          the one it replaces instead of rewriting it.
        </>
      ),
      ko: (
        <>
          <strong>기본 구현을 겹쳐 쓰세요.</strong> 슬롯 열한 개는 기본 구현을 함께 내보내므로, 교체본은 원본을 다시
          쓰지 않고 감싸서 쓸 수 있습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>AgentChat</code> is the last resort.
          </strong>{" "}
          It replaces the whole panel and has no exported default to compose.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>AgentChat</code>은 최후의 수단입니다.
          </strong>{" "}
          패널 전체를 바꾸고, 겹쳐 쓸 기본 구현을 내보내지 않습니다.
        </>
      ),
    }),
  ];

  const stepsNotes = [
    l.trans({
      en: (
        <>
          <strong>A turn is the unit only this slot sees.</strong> Neither message on either side of a turn boundary
          knows it sits at an edge, so a per-message slot cannot fold one.
        </>
      ),
      ko: (
        <>
          <strong>턴은 이 슬롯만 보는 단위입니다.</strong> 턴 경계 양쪽의 메시지는 자기가 끝에 있다는 것을 모르므로,
          메시지 단위 슬롯으로는 턴을 접을 수 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>isRunning</code> is true only for the last turn while the session works on it.
          </strong>{" "}
          Without it, a live progress line and a finished turn's header look the same.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>isRunning</code>은 세션이 작업 중인 마지막 턴에서만 true입니다.
          </strong>{" "}
          이것이 없으면 진행 중인 줄과 끝난 턴의 머리글을 구별할 수 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>The default adds nothing.</strong> <code>DefaultSteps</code> draws the same flat bubbles into a
          Fragment, so it takes no <code>className</code> and no existing layout notices it.
        </>
      ),
      ko: (
        <>
          <strong>기본 구현은 아무것도 더하지 않습니다.</strong> <code>DefaultSteps</code>는 같은 말풍선을 Fragment 안에
          평평하게 그리므로 <code>className</code>을 받지 않고, 기존 레이아웃도 차이를 느끼지 못합니다.
        </>
      ),
    }),
  ];

  const cardSteps = [
    l.trans({
      en: (
        <>
          Declare the tool with <code>st.tool(name)</code>, a <code>.desc()</code>, and the <code>.arg()</code>s the
          model passes.
        </>
      ),
      ko: (
        <>
          <code>st.tool(name)</code>으로 툴을 선언하고 <code>.desc()</code>와 모델이 넘길 <code>.arg()</code>를
          적습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          End the chain with <code>.card(render)</code> instead of <code>.exec(fn)</code>. The call parks in the chat
          and your form renders there.
        </>
      ),
      ko: (
        <>
          체인을 <code>.exec(fn)</code> 대신 <code>.card(render)</code>로 끝냅니다. 호출은 채팅에 멈춰 서고, 그 자리에
          앱의 폼이 그려집니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          In the form, call <code>submit(value)</code> to answer or <code>cancel(reason)</code> to decline.
        </>
      ),
      ko: (
        <>
          폼에서 <code>submit(value)</code>로 답하거나 <code>cancel(reason)</code>으로 거절합니다.
        </>
      ),
    }),
  ];

  const cardRules = [
    {
      title: "submit(value)",
      code: true,
      desc: l.trans({
        en: (
          <>
            What the form submits is the call's result, which the model reads back. <code>cancel(reason)</code> arrives
            as an error instead, so a dismissed card is something the agent can respond to.
          </>
        ),
        ko: (
          <>
            폼이 제출한 값이 곧 호출 결과이고, 모델이 그것을 읽습니다. <code>cancel(reason)</code>은 오류로 전달되므로,
            닫힌 카드도 에이전트가 반응할 수 있는 답이 됩니다.
          </>
        ),
      }),
    },
    {
      title: l.trans({ en: "Arguments Are Checked First", ko: "인자는 먼저 검사합니다" }),
      code: false,
      desc: l.trans({
        en: "Before the card is parked, never while it renders. A bad argument reaches the model as a refusal it can fix; a throw in your component would take the chat panel down.",
        ko: "카드를 세우기 전에 검사하고, 렌더 중에는 하지 않습니다. 잘못된 인자는 모델이 고칠 수 있는 거절로 돌아가고, 컴포넌트 안의 예외는 채팅 패널까지 무너뜨리기 때문입니다.",
      }),
    },
    {
      title: l.trans({ en: "It Waits Outside The Tool Queue", ko: "툴 대기열 밖에서 기다립니다" }),
      code: false,
      desc: l.trans({
        en: "A form in front of a person is not work. Holding the execution lock through it would freeze every other agent on the page behind one unanswered card.",
        ko: "사람 앞에 놓인 폼은 작업이 아닙니다. 그동안 실행 락을 쥐고 있으면 답하지 않은 카드 하나 때문에 페이지의 다른 에이전트가 모두 멈춥니다.",
      }),
    },
    {
      title: "confirm",
      code: true,
      desc: l.trans({
        en: (
          <>
            Not read for a <code>.card()</code> at all. The card in front of the user is already the asking.
          </>
        ),
        ko: (
          <>
            <code>.card()</code>에서는 읽지 않습니다. 사용자 앞에 놓인 카드가 이미 묻는 행위이기 때문입니다.
          </>
        ),
      }),
    },
  ];

  const cardNotes = [
    l.trans({
      en: (
        <>
          <strong>The frame always draws a dismiss,</strong> even when your form has no cancel button, so a turn never
          parks on something the user cannot get out of.
        </>
      ),
      ko: (
        <>
          <strong>틀은 항상 닫기 버튼을 그립니다.</strong> 폼에 취소 버튼이 없어도 그리므로, 사용자가 빠져나갈 수 없는
          카드에 턴이 멈춰 서는 일은 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Store writes are still reported.</strong> The screen is snapshotted before and after the wait, so a
          card that writes what it collected into the store reports what moved like any other call.
        </>
      ),
      ko: (
        <>
          <strong>스토어에 쓴 값도 보고됩니다.</strong> 기다리는 앞뒤로 화면을 스냅샷하므로, 모은 값을 스토어에 쓰는
          카드는 다른 호출처럼 무엇이 바뀌었는지 보고합니다.
        </>
      ),
    }),
  ];

  const referenceOptions = [
    {
      key: "refName",
      type: "string",
      desc: l.trans({
        en: "Your own model name, the vocabulary your published tools already speak.",
        ko: "앱이 공개한 툴이 이미 쓰는 이름 그대로의 모델 이름입니다.",
      }),
    },
    {
      key: "label",
      type: "string",
      desc: l.trans({
        en: "What this group of rows is called in the `@` menu, so pass it through `l()`.",
        ko: "`@` 메뉴에서 이 묶음을 부르는 이름이라 `l()`을 거칩니다.",
      }),
    },
    {
      key: "type",
      type: "AgentFieldType",
      desc: l.trans({
        en: "The model class that masks the value before it leaves the browser.",
        ko: "값이 브라우저를 떠나기 전에 마스킹할 모델 클래스입니다.",
      }),
    },
    {
      key: "search",
      type: "(query, signal) => Promise<ReferenceCandidate[]>",
      desc: l.trans({
        en: "Your query for the menu rows, whose `signal` aborts when the user keeps typing.",
        ko: "메뉴 행을 찾는 앱의 쿼리이며, 사용자가 계속 입력하면 `signal`이 중단됩니다.",
      }),
    },
    {
      key: "resolve",
      type: "(refId) => Promise<unknown>",
      desc: l.trans({
        en: "Loads the document, once, when the user picks a row.",
        ko: "사용자가 행을 고를 때 한 번 호출되어 문서를 불러옵니다.",
      }),
    },
  ];

  const sourceNotes = [
    l.trans({
      en: (
        <>
          <strong>
            <code>type</code> decides what leaves the browser.
          </strong>{" "}
          It uses <code>st.expose</code>'s vocabulary: the value is masked by the model class you name, so its{" "}
          <code>hidden</code>, <code>secret</code> and <code>visual</code> fields never travel.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>type</code>이 브라우저 밖으로 나가는 것을 정합니다.
          </strong>{" "}
          <code>st.expose</code>와 같은 방식으로, 지정한 모델 클래스가 값을 마스킹하므로 <code>hidden</code>,{" "}
          <code>secret</code>, <code>visual</code> 필드는 나가지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Name the class that carries the field.</strong> A <code>Light</code> class usually does not, and a
          reference masked by one arrives without the field that was the reason for pointing.
        </>
      ),
      ko: (
        <>
          <strong>가리킬 필드를 가진 클래스를 지정하세요.</strong> <code>Light</code> 클래스에는 대개 그 필드가 없고,
          그것으로 마스킹된 참조는 정작 가리킨 이유였던 필드 없이 도착합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>search</code> needs a query the browser may call.
          </strong>{" "}
          Here it is a slice wrapping a <code>q.search()</code> filter, which belongs only on data that is safe to
          enumerate.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>search</code>에는 브라우저가 부를 수 있는 쿼리가 필요합니다.
          </strong>{" "}
          여기서는 <code>q.search()</code> 필터를 감싼 slice이며, 이런 slice는 목록으로 훑어도 괜찮은 데이터에만 둡니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Mount this chat from a client component.</strong> <code>reference</code> holds functions, which a
          server layout cannot pass, so the chat lives in a small component under <code>ui/</code>.
        </>
      ),
      ko: (
        <>
          <strong>이 채팅은 클라이언트 컴포넌트에서 마운트합니다.</strong> <code>reference</code>에는 함수가 들어 있어
          서버 레이아웃이 넘길 수 없으므로, <code>ui/</code> 아래 작은 컴포넌트에 둡니다.
        </>
      ),
    }),
  ];

  const fieldNotes = [
    l.trans({
      en: (
        <>
          <strong>It needs a session above it,</strong> so render the button inside an <code>Agent.Zone</code> or an{" "}
          <code>AgentProvider</code>. A root <code>Agent.Chat</code> beside <code>children</code> does not share its
          session, and outside a zone the call only logs a warning.
        </>
      ),
      ko: (
        <>
          <strong>위에 세션이 있어야 하므로,</strong> 버튼을 <code>Agent.Zone</code>이나 <code>AgentProvider</code>
          안에 그리세요. <code>children</code> 옆의 루트 <code>Agent.Chat</code>은 세션을 내주지 않아서, zone 밖에서는
          경고만 남기고 아무 일도 하지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>path</code> names the field.
          </strong>{" "}
          It is a dotted path into the document, so two fields of one document are two separate references.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>path</code>가 필드를 가리킵니다.
          </strong>{" "}
          문서 안의 점 경로이므로, 한 문서의 필드 두 개는 서로 다른 참조 두 개입니다.
        </>
      ),
    }),
  ];

  const composerNotes = [
    l.trans({
      en: (
        <>
          <strong>Pointers read as names.</strong> Where sources are declared, a Lexical editor loaded as its own chunk
          shows each pointer as the name it points at, not as the raw <code>@[label](mention:…)</code> token.
        </>
      ),
      ko: (
        <>
          <strong>포인터는 이름으로 보입니다.</strong> source를 선언하면 별도 청크로 로드되는 Lexical 에디터가 각
          포인터를 원시 <code>@[label](mention:…)</code> 토큰 대신 가리키는 대상의 이름으로 보여 줍니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>{"mentions={false}"}</code> keeps the plain textarea.
          </strong>{" "}
          Use it when you override the composer or want to see the tokens you send; the draft string is identical either
          way.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>{"mentions={false}"}</code>는 평범한 textarea를 유지합니다.
          </strong>{" "}
          작성창을 교체했거나 보내는 토큰을 그대로 보고 싶을 때 쓰며, 보내는 문자열은 어느 쪽이든 같습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>The token carries the reference.</strong> Deleting it drops the reference just as removing the chip
          does, and a token pasted from an earlier message travels as a pointer with no value.
        </>
      ),
      ko: (
        <>
          <strong>참조를 실어 나르는 것은 토큰입니다.</strong> 토큰을 지우면 칩을 지운 것과 똑같이 참조가 빠지고, 이전
          메시지에서 복사해 붙인 토큰은 값 없는 포인터로만 갑니다.
        </>
      ),
    }),
  ];

  const queueNotes = [
    l.trans({
      en: (
        <>
          <strong>One slot.</strong> A second send joins the first on a new line, so the model receives one user
          message, not two.
        </>
      ),
      ko: (
        <>
          <strong>자리는 하나입니다.</strong> 두 번째로 보낸 것은 첫 번째 아래 줄에 붙으므로, 모델은 메시지 두 개가
          아니라 하나를 받습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>It is shown, not held silently.</strong> The <code>AgentQueued</code> card above the composer offers
          take-back and drop, since a send that left the composer but is not in the transcript would read as lost.
        </>
      ),
      ko: (
        <>
          <strong>조용히 들고 있지 않고 보여 줍니다.</strong> 작성창에서 사라졌는데 대화에도 없는 메시지는 잃어버린
          것처럼 보이므로, 작성창 위 <code>AgentQueued</code> 카드에서 되돌리거나 버릴 수 있게 합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Stop means stop.</strong> Stop hands the parked message back to the composer instead of opening the
          next turn with it.
        </>
      ),
      ko: (
        <>
          <strong>Stop은 정말 멈춥니다.</strong> 대기 중인 메시지로 다음 턴을 열지 않고 작성창으로 돌려줍니다.
        </>
      ),
    }),
  ];

  const commands = [
    {
      name: ["/new", "/clear"],
      en: "Starts a new conversation, even mid-turn or over an open question card.",
      ko: "턴 중이거나 질문 카드가 떠 있어도 새 대화를 시작합니다.",
    },
    {
      name: "/retry",
      en: "Resends the last user message and leaves everything above it in place.",
      ko: "마지막 사용자 메시지만 다시 보내고 그 위는 그대로 둡니다.",
    },
    {
      name: "/compact",
      en: "Summarizes the whole conversation now, keeping nothing verbatim.",
      ko: "원문을 하나도 남기지 않고 지금 대화 전체를 요약합니다.",
    },
    {
      name: "/copy",
      en: "Copies the transcript as markdown with the page URL and time; local notes are left out.",
      ko: "대화를 페이지 URL과 시각을 붙인 마크다운으로 복사하며, 로컬 메모는 빠집니다.",
    },
    {
      name: "/help",
      en: "Lists the commands as a local note that is never sent to the model.",
      ko: "커맨드 목록을 모델에게 전송되지 않는 로컬 메모로 보여 줍니다.",
    },
    {
      name: "/tools",
      en: "Lists the tools and readable keys this screen published; a zone chat lists its zone only.",
      ko: "이 화면이 공개한 툴과 읽을 수 있는 키를 보여 주며, zone 채팅은 그 zone만 보여 줍니다.",
    },
  ];

  const commandNotes = [
    l.trans({
      en: (
        <>
          <strong>An app cannot add a / command.</strong> A product's own reusable request is a{" "}
          <code>page().prompt()</code>, which MCP clients list and the in-page chat does not.
        </>
      ),
      ko: (
        <>
          <strong>앱은 / 커맨드를 추가할 수 없습니다.</strong> 제품 고유의 재사용 요청은 <code>page().prompt()</code>로
          만들며, 이는 MCP 클라이언트에만 나열되고 인페이지 채팅에는 나오지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Anything else is a message.</strong> A <code>/word</code> that is not one of the six is sent to the
          model as ordinary text.
        </>
      ),
      ko: (
        <>
          <strong>나머지는 그냥 메시지입니다.</strong> 여섯 개가 아닌 <code>/단어</code>는 평범한 텍스트로 모델에게
          전송됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Commands run mid-turn.</strong> They work while a turn is in flight or a question card is open;{" "}
          <code>/retry</code> and <code>/compact</code> answer that the agent is busy.
        </>
      ),
      ko: (
        <>
          <strong>커맨드는 턴 중에도 실행됩니다.</strong> 턴이 진행 중이거나 질문 카드가 떠 있어도 동작하고,{" "}
          <code>/retry</code>와 <code>/compact</code>는 에이전트가 작업 중이라고 알려 줍니다.
        </>
      ),
    }),
  ];

  const keyRows = [
    {
      name: "Enter",
      desc: l.trans({
        en: "Sends, parks the message during a turn, or picks the row when a menu is open.",
        ko: "보내되, 턴 중에는 메시지를 대기시키고 메뉴가 열려 있으면 행을 고릅니다.",
      }),
    },
    {
      name: "Shift+Enter",
      desc: l.trans({ en: "Adds a new line.", ko: "줄을 바꿉니다." }),
    },
    {
      name: "↑ / ↓",
      desc: l.trans({
        en: "Walks what was sent from the first or last line, or moves the selection in an open menu.",
        ko: "커서가 첫 줄이나 마지막 줄에 있으면 보낸 메시지를 오가고, 메뉴가 열려 있으면 선택을 옮깁니다.",
      }),
    },
    {
      name: "Tab",
      desc: l.trans({
        en: "Completes the selected / command, or picks the selected @ row.",
        ko: "선택한 / 커맨드를 완성하거나, 선택한 @ 행을 고릅니다.",
      }),
    },
    {
      name: "Esc",
      desc: l.trans({
        en: "Hides an open menu; otherwise closes the panel.",
        ko: "열린 메뉴를 숨기고, 메뉴가 없으면 패널을 닫습니다.",
      }),
    },
    {
      name: "⌘L / Ctrl+L",
      desc: l.trans({
        en: "Opens the chat and focuses the composer, unless `shortcut={false}`.",
        ko: "`shortcut={false}`가 아니면 채팅을 열고 작성창에 포커스합니다.",
      }),
    },
  ];

  const sessionRows = [
    {
      name: "session.note(text)",
      desc: l.trans({
        en: "Writes a local note: shown in the transcript, never sent to the model.",
        ko: "대화에는 보이지만 모델에게는 전송되지 않는 로컬 메모를 씁니다.",
      }),
    },
    {
      name: "session.report(error)",
      desc: l.trans({
        en: "Records a host-side failure, such as a command that threw, as an error in the transcript.",
        ko: "예외를 던진 커맨드 같은 호스트 쪽 실패를 대화에 오류로 기록합니다.",
      }),
    },
    {
      name: "session.retry()",
      desc: l.trans({
        en: "Resends only the last user message and keeps everything above it.",
        ko: "마지막 사용자 메시지만 다시 보내고 그 위는 그대로 둡니다.",
      }),
    },
  ];

  const sessionNotes = [
    l.trans({
      en: (
        <>
          <strong>Why a note and not a plain message.</strong> The transcript is the model's history, so{" "}
          <code>/help</code> text appended plainly would come back next turn as something the assistant believes it
          said.
        </>
      ),
      ko: (
        <>
          <strong>일반 메시지가 아니라 메모인 이유.</strong> 대화가 곧 모델의 히스토리라서, <code>/help</code> 출력을
          그냥 붙이면 다음 턴에 어시스턴트가 자기가 한 말로 받아들입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Reaching the session.</strong> <code>Agent.Zone</code>'s <code>onSession</code> hands it over,{" "}
          <code>useAgent()</code> reads it inside a zone, and a composer override receives it as the{" "}
          <code>session</code> prop.
        </>
      ),
      ko: (
        <>
          <strong>세션에 닿는 법.</strong> <code>Agent.Zone</code>의 <code>onSession</code>이 세션을 건네주고, zone
          안에서는 <code>useAgent()</code>로 읽으며, 교체한 작성창은 <code>session</code> prop으로 받습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            With <code>persist</code>, recall survives a reload.
          </strong>{" "}
          The ↑/↓ list is seeded from the restored transcript, and the half-written draft you walked away from comes
          back at the end of the walk.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>persist</code>를 켜면 새로고침 뒤에도 다시 부를 수 있습니다.
          </strong>{" "}
          ↑/↓ 목록은 복원된 대화에서 채워지고, 쓰다 만 초안은 목록 끝에서 다시 돌아옵니다.
        </>
      ),
    }),
  ];

  const storageRows = [
    {
      write: "persist",
      desc: l.trans({
        en: "`sessionStorage`, which survives a refresh but dies with the tab, so no shared PC keeps it.",
        ko: "새로고침은 견디고 탭과 함께 사라져 공용 PC에 남지 않는 `sessionStorage`에 둡니다.",
      }),
    },
    {
      write: 'persist={{ storage: "local" }}',
      desc: l.trans({
        en: "`localStorage`, for a conversation that should outlive the tab.",
        ko: "탭을 닫아도 대화가 남아야 할 때 `localStorage`에 둡니다.",
      }),
    },
    {
      write: 'persist={{ key: "…" }}',
      desc: l.trans({
        en: "Your own storage key; the default is `akan.agent.<appName>`, plus the zone path in a zone.",
        ko: "저장 키를 직접 정하며, 기본값은 `akan.agent.<appName>`에 zone 안이면 zone 경로가 붙습니다.",
      }),
    },
    {
      write: "<Agent.History />",
      desc: l.trans({
        en: "Your own server, through three functions you write.",
        ko: "직접 작성한 함수 세 개로 앱의 서버에 보관합니다.",
      }),
    },
  ];

  const historyNotes = [
    l.trans({
      en: (
        <>
          <strong>It needs an enclosing session.</strong> Put <code>Agent.History</code> inside an{" "}
          <code>Agent.Zone</code> or <code>AgentProvider</code>; outside one it throws while rendering.
        </>
      ),
      ko: (
        <>
          <strong>감싸는 세션이 필요합니다.</strong> <code>Agent.History</code>는 <code>Agent.Zone</code>이나{" "}
          <code>AgentProvider</code> 안에 둡니다. 그 밖에서는 렌더링 중에 오류를 던집니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Session options go on the zone.</strong> Inside an <code>Agent.Zone</code> the chat binds to the
          zone's session, so <code>persist</code>, <code>builtins</code> and <code>instructions</code> set on that{" "}
          <code>Agent.Chat</code> are ignored.
        </>
      ),
      ko: (
        <>
          <strong>세션 옵션은 zone에 적습니다.</strong> <code>Agent.Zone</code> 안의 채팅은 zone의 세션에 붙으므로, 그{" "}
          <code>Agent.Chat</code>에 적은 <code>persist</code>, <code>builtins</code>, <code>instructions</code>는
          무시됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>onCompact</code> follows compaction.
          </strong>{" "}
          It is called after a compaction replaced messages with one summary, which is where a host with its own
          server-side summary moves its watermark.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>onCompact</code>는 압축 뒤에 불립니다.
          </strong>{" "}
          압축이 메시지들을 요약 하나로 바꾼 뒤 호출되며, 서버에 자체 요약을 두는 호스트가 기준점을 옮기는 자리입니다.
        </>
      ),
    }),
  ];

  const storeGroups = [
    {
      label: l.trans({ en: "Every store", ko: "모든 저장소" }),
      rows: [
        {
          name: (
            <span className="font-sans">
              {l.trans({ en: "Restores into an untouched chat only", ko: "손대지 않은 대화에만 복원" })}
            </span>
          ),
          desc: l.trans({
            en: "Mounted with the zone, it restores; mounted later, it only saves from then on.",
            ko: "zone과 함께 마운트되면 복원하고, 나중에 마운트되면 그때부터 저장만 합니다.",
          }),
          marks: { web: true, history: true },
        },
        {
          name: (
            <span className="font-sans">{l.trans({ en: "Saves after every change", ko: "바뀔 때마다 저장" })}</span>
          ),
          desc: l.trans({
            en: "Debounced and one save at a time; a failed save is silent.",
            ko: "디바운스되고 한 번에 하나씩 저장하며, 실패한 저장은 조용히 넘어갑니다.",
          }),
          marks: { web: true, history: true },
        },
      ],
    },
    {
      label: l.trans({ en: "Web storage only", ko: "웹 스토리지만" }),
      rows: [
        {
          name: (
            <span className="font-sans">{l.trans({ en: "Keeps the newest 50 messages", ko: "최근 50개만 보관" })}</span>
          ),
          marks: { web: true, history: false },
        },
        {
          name: (
            <span className="font-sans">
              {l.trans({ en: "Drops file bytes and reference values", ko: "파일 내용과 참조 값은 버림" })}
            </span>
          ),
          desc: l.trans({
            en: "A file keeps its name, type, url and ref; a reference keeps its pointer and a note to read it again.",
            ko: "파일은 이름·타입·url·ref만, 참조는 포인터와 “다시 읽으라”는 메모만 남깁니다.",
          }),
          marks: { web: true, history: false },
        },
      ],
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="one-turn" title={l.trans({ en: "Where A Turn Runs", ko: "턴은 어디서 실행되나" })}>
        <Docs.Title>{l.trans({ en: "Where A Turn Runs", ko: "턴은 어디서 실행되나" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <>
                  <code>Agent.Chat</code> adds a chat that drives your screens for the user. The server only relays
                  messages; every tool runs in the user's own browser tab.
                </>
              ),
              ko: (
                <>
                  <code>Agent.Chat</code>은 화면에 채팅을 붙이고, 그 채팅이 사용자 대신 화면을 조작합니다. 서버는
                  메시지를 전달만 하고, 모든 툴은 사용자 자신의 브라우저 탭에서 실행됩니다.
                </>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "One refund, traced", ko: "환불 한 번을 따라가 보기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A customer on the order screen types “refund the last one”, and a moment later the order is refunded. These are the questions a security reviewer asks first:",
              ko: "주문 화면의 고객이 “마지막 주문 환불해줘”라고 쓰자, 잠시 뒤 주문이 환불됩니다. 보안 검토자가 가장 먼저 묻는 질문과 답은 이렇습니다:",
            })}
          </div>
          <Docs.Table
            stacked
            columns={[
              { key: "question", label: l.trans({ en: "Question", ko: "질문" }) },
              { key: "answer", label: l.trans({ en: "Answer", ko: "답" }) },
            ]}
            rows={turnRows}
          />
          <Docs.Flow
            title={l.trans({ en: "One turn, end to end", ko: "턴 하나의 처음과 끝" })}
            direction="TB"
            nodes={{
              screen: {
                label: l.trans({ en: "Screen", ko: "화면" }),
                lines: [l.trans({ en: "st.tool declarations · subscribed keys", ko: "st.tool 선언 · 구독한 키" })],
              },
              chat: {
                label: "Agent.Chat",
                lines: [l.trans({ en: "the transcript lives in this tab", ko: "대화는 이 탭에 있음" })],
              },
              relay: {
                label: "POST runAgentTurn",
                lines: [l.trans({ en: "guarded by AgentRelayAccess", ko: "AgentRelayAccess 가드" })],
              },
              llm: {
                label: l.trans({ en: "LLM provider", ko: "LLM 프로바이더" }),
                lines: [l.trans({ en: "named in option.setLlm", ko: "option.setLlm에서 지정" })],
              },
              calls: { label: l.trans({ en: "The tool calls the model asked for", ko: "모델이 요청한 툴 호출" }) },
              gate: {
                label: l.trans({ en: "Approval card", ko: "승인 카드" }),
                lines: [l.trans({ en: "confirm and guard", ko: "확인과 가드" })],
              },
              run: {
                label: l.trans({ en: "The tool runs in this browser", ko: "툴은 이 브라우저에서 실행" }),
                lines: [l.trans({ en: "the handler the button calls", ko: "버튼이 부르는 그 핸들러" })],
              },
              report: {
                label: l.trans({ en: "Change report", ko: "변경 보고" }),
                lines: [l.trans({ en: "what moved on screen", ko: "화면에서 바뀐 것" })],
              },
              nothing: {
                label: l.trans({ en: "Nothing is stored server-side", ko: "서버에는 아무것도 저장하지 않음" }),
                tone: "muted",
              },
            }}
            edges={[
              ["screen", "chat"],
              ["chat", "relay"],
              ["relay", "llm"],
              ["llm", "calls"],
              ["calls", "gate"],
              ["gate", "run"],
              ["run", "report"],
              ["report", "chat"],
              [
                "relay",
                "nothing",
                {
                  label: l.trans({ en: "holds no session, runs no tool", ko: "세션 없음, 툴 실행 없음" }),
                  dashed: true,
                },
              ],
            ]}
            emphasis={["run"]}
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <>
                  <strong>Name a guard, or the chat answers no one.</strong> <code>AgentRelayAccess</code> refuses every
                  caller until <code>lib/option.ts</code> calls <code>option.setAgentAccess(SignedIn)</code> with your
                  own guard. It takes the same guards any endpoint names, ANDed when there are several.
                </>
              ),
              ko: (
                <>
                  <strong>가드를 지정하지 않으면 채팅은 누구에게도 답하지 않습니다.</strong>{" "}
                  <code>AgentRelayAccess</code>는 <code>lib/option.ts</code>에서 앱의 가드로{" "}
                  <code>option.setAgentAccess(SignedIn)</code>을 호출하기 전까지 모든 호출을 거절합니다. 다른
                  엔드포인트에 적는 것과 같은 가드를 받고, 여러 개면 모두 통과해야 합니다(AND).
                </>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="mount" title={l.trans({ en: "Mounting The Chat", ko: "채팅 마운트하기" })}>
        <Docs.Title>{l.trans({ en: "Mounting The Chat", ko: "채팅 마운트하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <>
                  Mount <code>Agent.Chat</code> once, in the layout that wraps every screen the agent should reach. That
                  one element brings the launcher, the transcript, the approval card and the streaming loop:
                </>
              ),
              ko: (
                <>
                  <code>Agent.Chat</code>은 에이전트가 닿아야 할 모든 화면을 감싸는 레이아웃에 한 번만 마운트합니다. 이
                  요소 하나에 런처, 대화창, 승인 카드, 스트리밍 루프가 모두 들어 있습니다:
                </>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/page/(shop)/_layout.tsx"
            code={`import { usePage } from "@apps/koyo/client";
import { layout } from "akanjs/client";
import { Agent } from "akanjs/ui";

export default layout().render(({ children }) => {
  const { l } = usePage();
  return (
    <>
      {children}
      <Agent.Chat
        title={l("koyo.assistant")}
        instructions="This is a Korean-style yogurt ice cream shop. An order moves draft -> paid -> served."
        intro={<p className="py-6 text-center text-foreground/50 text-sm">{l("koyo.assistantIntro")}</p>}
        persist
      />
    </>
  );
});`}
          />
          <ul className={bulletList}>
            {mountNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <>
                  <strong>Do not mount it conditionally to close it.</strong> Unmounting aborts the session and throws
                  the conversation away. To open the chat from your own control, pass the controlled pair{" "}
                  <code>open</code> and <code>onOpenChange</code>.
                </>
              ),
              ko: (
                <>
                  <strong>닫으려고 조건부로 마운트하지 마세요.</strong> 언마운트하면 세션이 중단되고 대화가 버려집니다.
                  앱의 컨트롤로 채팅을 열고 닫으려면 <code>open</code>과 <code>onOpenChange</code>를 함께 넘겨 바깥에서
                  제어하세요.
                </>
              ),
            })}
          </Docs.Alert>
          <Docs.SubSubTitle>{l.trans({ en: "Props", ko: "Props" })}</Docs.SubSubTitle>
          <Docs.OptionTable
            items={[
              {
                key: "title",
                type: "string",
                default: 'l("base.agent")',
                desc: l.trans({
                  en: "Header text and the panel's accessible name.",
                  ko: "헤더 제목이자 패널의 접근성 이름입니다.",
                }),
              },
              {
                key: "instructions",
                type: "string",
                desc: l.trans({
                  en: "App-wide guidance for the model, in English, which `Agent.Guide` adds route guidance to.",
                  ko: "영어로 쓰는 앱 전역 모델 지침이며, 라우트별 지침은 `Agent.Guide`가 그 위에 더합니다.",
                }),
              },
              {
                key: "defaultOpen",
                type: "boolean",
                default: "false",
                desc: l.trans({
                  en: "Opens the panel on first render while the panel owns its state.",
                  ko: "패널이 상태를 스스로 관리할 때, 처음부터 열린 채로 시작합니다.",
                }),
              },
              {
                key: "open",
                type: "boolean",
                desc: l.trans({
                  en: "Controlled open state, paired with `onOpenChange`; left off, the panel owns it.",
                  ko: "`onOpenChange`와 함께 넘겨 바깥에서 제어하는 열림 상태이며, 빼면 패널이 스스로 관리합니다.",
                }),
              },
              {
                key: "onOpenChange",
                type: "(open: boolean) => void",
                desc: l.trans({
                  en: "Called on open and close; without it, a controlled panel draws no close button.",
                  ko: "열고 닫을 때 호출되며, 없으면 바깥에서 제어하는 패널은 닫기 버튼을 그리지 않습니다.",
                }),
              },
              {
                key: "launcher",
                type: "boolean",
                default: "true",
                desc: l.trans({
                  en: "`false` draws no floating button, for a shell that already has its own entry point.",
                  ko: "이미 진입점이 있는 셸이라면 `false`로 떠 있는 버튼을 그리지 않습니다.",
                }),
              },
              {
                key: "launcherPlacement",
                type: '"right" | "left"',
                default: '"right"',
                desc: l.trans({
                  en: "The button's corner, kept above a tab bar or composer and the safe area, and under menus and modals.",
                  ko: "버튼이 놓일 모서리이며, 탭 바나 입력창과 safe area 위, 메뉴와 modal 아래에 놓입니다.",
                }),
              },
              {
                key: "hideLauncherBelow",
                type: '"sm" | "md" | "lg"',
                desc: l.trans({
                  en: "Hides the button below this breakpoint; ⌘L / Ctrl+L or a controlled `open` still opens the panel.",
                  ko: "이 breakpoint보다 좁으면 버튼을 숨기며, ⌘L / Ctrl+L이나 제어하는 `open`으로는 패널이 열립니다.",
                }),
              },
              {
                key: "intro",
                type: "ReactNode",
                desc: l.trans({
                  en: "Replaces the empty-state line while the transcript is empty, where starter questions go.",
                  ko: "대화가 비어 있는 동안 기본 안내 문구를 대신하는, 예시 질문을 두는 자리입니다.",
                }),
              },
              {
                key: "header",
                type: "ReactNode",
                desc: l.trans({
                  en: "Extra controls in the header bar, left of the built-in clear and close buttons.",
                  ko: "기본 비우기·닫기 버튼 왼쪽, 헤더 바에 더할 컨트롤입니다.",
                }),
              },
              {
                key: "chrome",
                type: "boolean",
                default: "true",
                desc: l.trans({
                  en: "`false` drops the header bar and `header` for an inline chat; `/new` still clears.",
                  ko: "`false`면 inline 채팅용으로 헤더 바와 `header`를 빼며, 비우기는 `/new`로 합니다.",
                }),
              },
              {
                key: "defaultDraft",
                type: "string",
                default: '""',
                desc: l.trans({
                  en: "The composer's opening text, read once at mount and never sent, where a `?prompt=` value goes.",
                  ko: "마운트 때 한 번 읽고 전송하지 않는 작성창 초기 텍스트로, `?prompt=` 값을 넣는 자리입니다.",
                }),
              },
              {
                key: "inline",
                type: "boolean",
                default: "false",
                desc: l.trans({
                  en: "Renders in the page flow instead of floating, for a zone chat inside its own section.",
                  ko: "자기 구획 안의 zone 채팅처럼, 떠 있지 않고 페이지 흐름 안에 그립니다.",
                }),
              },
              {
                key: "shortcut",
                type: "boolean",
                default: "true",
                desc: l.trans({
                  en: "⌘L on Apple platforms and Ctrl+L elsewhere; `false` gives the chord back to the browser.",
                  ko: "Apple 플랫폼은 ⌘L, 그 외는 Ctrl+L이며, `false`면 이 단축키를 브라우저에 돌려줍니다.",
                }),
              },
              {
                key: "launcherClassName",
                type: "string",
                desc: l.trans({
                  en: "Classes for the closed button only, where `className` reaches both surfaces.",
                  ko: "닫힌 버튼에만 적용되는 클래스이며, `className`은 두 곳 모두에 적용됩니다.",
                }),
              },
              {
                key: "panelClassName",
                type: "string",
                desc: l.trans({
                  en: "Classes for the open panel only.",
                  ko: "열린 패널에만 적용되는 클래스입니다.",
                }),
              },
              {
                key: "builtins",
                type: "boolean | AgentBuiltin[]",
                default: "true",
                desc: l.trans({
                  en: "Which built-in tools this chat's agent gets: all, none, or exactly the ones listed.",
                  ko: "이 채팅의 에이전트가 받을 기본 툴을 전부, 없음, 또는 나열한 것만으로 고릅니다.",
                }),
              },
              {
                key: "persist",
                type: "PersistOption | SessionHistory",
                desc: l.trans({
                  en: "Keeps the transcript across reloads, as the last section shows.",
                  ko: "새로고침해도 대화를 보존하며, 마지막 섹션에서 다룹니다.",
                }),
              },
            ]}
          />
          <div>
            {l.trans({
              en: (
                <>
                  <code>attach</code>, <code>voice</code>, <code>visual</code>, <code>maxTurns</code>,{" "}
                  <code>compact</code> and the rest are listed in the{" "}
                  <Link href="/references/ui/agent" className="text-primary">
                    Agent UI reference
                  </Link>
                  .
                </>
              ),
              ko: (
                <>
                  <code>attach</code>, <code>voice</code>, <code>visual</code>, <code>maxTurns</code>,{" "}
                  <code>compact</code> 등 나머지 prop은{" "}
                  <Link href="/references/ui/agent" className="text-primary">
                    Agent UI 레퍼런스
                  </Link>
                  에 있습니다.
                </>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Five built-in tools", ko: "기본 툴 다섯 개" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <>
                  Besides what the screen declares, the runtime gives every chat these five tools. <code>builtins</code>{" "}
                  picks which ones this chat's agent gets.
                </>
              ),
              ko: (
                <>
                  화면이 선언한 툴 외에도 런타임은 모든 채팅에 이 다섯 툴을 줍니다. <code>builtins</code>로 이 채팅의
                  에이전트가 받을 툴을 고릅니다.
                </>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Tool", ko: "툴" })} items={builtinRows} />
          <ul className={bulletList}>
            {builtinNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="slots" title={l.trans({ en: "Every Part Is A Slot", ko: "모든 부분이 슬롯" })}>
        <Docs.Title>{l.trans({ en: "Every Part Is A Slot", ko: "모든 부분이 슬롯" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <>
                  A brand rarely wants the framework's bubble, but always wants its approval gate. So you replace parts,
                  not the chat: twelve slots bind in a <code>{"page/**/_overrides.tsx"}</code> manifest and cascade down
                  the route tree like layouts.
                </>
              ),
              ko: (
                <>
                  브랜드가 프레임워크의 말풍선을 그대로 원하는 경우는 드물지만, 승인 관문은 언제나 그대로 쓰고 싶어
                  합니다. 그래서 채팅 전체가 아니라 부분을 바꿉니다. 슬롯 열두 개를{" "}
                  <code>{"page/**/_overrides.tsx"}</code> 매니페스트에 묶으면 레이아웃처럼 라우트 트리를 따라
                  내려갑니다.
                </>
              ),
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Slot", ko: "슬롯" })}
            descLabel={l.trans({ en: "Description and default export", ko: "설명과 기본 구현 export" })}
            items={slots.map(({ name, fallback, en, ko }) => ({
              name,
              desc: l.trans({ en, ko }),
              example: fallback ? `import { ${fallback} } from "akanjs/ui";` : null,
            }))}
          />
          <ul className={bulletList}>
            {slotNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>
            {l.trans({ en: "Folding a turn with AgentSteps", ko: "AgentSteps로 턴 접기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <>
                  <code>AgentSteps</code> is the one slot that is not a re-skin. It receives a whole turn, so it can
                  fold the steps into a <code>{"<details>"}</code> and leave the final answer outside:
                </>
              ),
              ko: (
                <>
                  <code>AgentSteps</code>는 겉모습만 바꾸는 슬롯이 아닙니다. 턴 전체를 받으므로, 중간 단계는{" "}
                  <code>{"<details>"}</code>로 접고 최종 답만 밖에 둘 수 있습니다:
                </>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/ui/KoyoTurn.tsx"
            code={`"use client";
import { usePage } from "@apps/koyo/client";
import { DefaultSteps, type StepsProps } from "akanjs/ui";

export const KoyoTurn = ({ messages, isRunning, progress, results }: StepsProps) => {
  const { l } = usePage();
  const answer = messages.at(-1);
  const steps = isRunning ? messages : messages.slice(0, -1);
  return (
    <div className="flex flex-col gap-1">
      <details open={isRunning}>
        <summary className="cursor-pointer text-foreground/50 text-xs">
          {isRunning ? l("koyo.turnWorking") : l("koyo.turnSteps", { count: steps.length })}
        </summary>
        <DefaultSteps isRunning={isRunning} messages={steps} progress={progress} results={results} />
      </details>
      {isRunning || !answer ? null : <DefaultSteps isRunning={false} messages={[answer]} results={results} />}
    </div>
  );
};`}
          />
          <div>
            {l.trans({
              en: "Then bind it, with any other slots, in the route's manifest:",
              ko: "그리고 다른 슬롯과 함께 라우트의 매니페스트에 묶습니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/page/(shop)/_overrides.tsx"
            code={`import { KoyoBubble, KoyoTurn } from "@apps/koyo/ui";
import { override } from "akanjs/ui";

export default override({ AgentBubble: KoyoBubble, AgentSteps: KoyoTurn });`}
          />
          <ul className={bulletList}>
            {stepsNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="card" title={l.trans({ en: "A Tool The User Answers", ko: "사용자가 답하는 툴" })}>
        <Docs.Title>{l.trans({ en: "A Tool The User Answers", ko: "사용자가 답하는 툴" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Some arguments are the user's to give: a delivery address, a phone number, a date someone has to look up. A model that fills them in has answered its own question, and prompting cannot reliably stop it.",
              ko: "어떤 인자는 사용자가 줘야 합니다. 배달 주소, 전화번호, 누군가 확인해야 아는 날짜 같은 것입니다. 모델이 이런 값을 채우면 자기 질문에 스스로 답한 셈이고, 프롬프트로는 이를 확실히 막을 수 없습니다.",
            })}
          </div>
          <ol className="my-4 list-decimal space-y-2 pl-5">
            {cardSteps.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
          <div>
            {l.trans({
              en: "Here the model asks the customer for an address, and the Deliver button stays off until one exists:",
              ko: "아래에서는 모델이 고객에게 주소를 묻고, 주소가 생기기 전까지 배달 버튼은 꺼져 있습니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Zone.tsx"
            code={`"use client";
import { IcecreamOrder, st, usePage } from "@apps/koyo/client";
import { ID } from "akanjs/base";
import { Button } from "akanjs/ui";

interface DeliveryProps {
  className?: string;
  icecreamOrderId: string;
}

export const Delivery = ({ className, icecreamOrderId }: DeliveryProps) => {
  const { l } = usePage();
  const address = st.use.deliveryAddress();
  st.tool("collectDeliveryAddress")
    .desc("Ask the customer for the address this order goes to. Never write an address the customer did not give.")
    .arg("icecreamOrderId", ID)
    .card(({ submit, cancel }, orderId) => (
      <IcecreamOrder.Template.Address
        icecreamOrderId={orderId}
        onCancel={() => cancel("the customer closed the address form")}
        onSubmit={submit}
      />
    ));
  const deliver = st.tool("deliverIcecreamOrder")
    .desc("Deliver this order to the address already on it.")
    .exec(() => st.do.deliverIcecreamOrder(icecreamOrderId));
  return (
    <div className={className}>
      <Button disabled={!address} onClick={deliver}>
        {l("icecreamOrder.deliverIcecreamOrder")}
      </Button>
    </div>
  );
};`}
          />
          <Docs.SubSubTitle>
            {l.trans({ en: "How a card differs from an exec", ko: "card가 exec과 다른 점" })}
          </Docs.SubSubTitle>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {cardRules.map(({ title, code, desc }, idx) => (
              <div key={idx} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className={code ? `${cardTitle} font-mono` : cardTitle}>{title}</div>
                <div className={cardBody}>{desc}</div>
              </div>
            ))}
          </div>
          <ul className={bulletList}>
            {cardNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="reference" title={l.trans({ en: "Pointing At Data", ko: "데이터를 가리키기" })}>
        <Docs.Title>{l.trans({ en: "Pointing At Data", ko: "데이터를 가리키기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "“Why was this one refunded?” can only be answered if the chat knows which one. The @ menu lets the user point at it, instead of typing an id or making the agent spend a turn searching.",
              ko: "“이건 왜 환불됐어요?”에 답하려면 채팅이 ‘이건’이 무엇인지 알아야 합니다. @ 메뉴를 쓰면 사용자가 id를 입력하거나 에이전트가 턴을 들여 검색할 필요 없이 대상을 바로 가리킬 수 있습니다.",
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className={cardTitle}>{l.trans({ en: "A Whole Document", ko: "문서 하나 전체" })}</div>
              <div className={cardBody}>
                {l.trans({
                  en: (
                    <>
                      Declared on the chat's <code>reference</code> prop. The <code>@</code> menu finds rows with your
                      own search.
                    </>
                  ),
                  ko: (
                    <>
                      채팅의 <code>reference</code> prop에 선언합니다. <code>@</code> 메뉴가 앱의 검색으로 행을
                      찾습니다.
                    </>
                  ),
                })}
              </div>
              <code className={codeChip}>{"<Agent.Chat reference={[…]} />"}</code>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className={cardTitle}>{l.trans({ en: "One Field On Screen", ko: "화면의 필드 하나" })}</div>
              <div className={cardBody}>
                {l.trans({
                  en: "Called from the component that draws the field. It hands over the value it already holds, with no round trip.",
                  ko: "그 필드를 그리는 컴포넌트에서 호출합니다. 이미 쥔 값을 왕복 없이 그대로 건넵니다.",
                })}
              </div>
              <code className={codeChip}>{"useAgentReference()"}</code>
            </div>
          </div>
          <Docs.SubSubTitle>
            {l.trans({ en: "Whole documents in the @ menu", ko: "@ 메뉴로 문서 가리키기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Which documents a user may point at is the app's answer, not the framework's, so each source brings its own search:",
              ko: "사용자가 어떤 문서를 가리킬 수 있는지는 프레임워크가 아니라 앱이 정할 문제입니다. 그래서 source마다 자기 검색을 가져옵니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/ui/KoyoAgentChat.tsx"
            code={`"use client";
import { cnst, fetch, usePage } from "@apps/koyo/client";
import { Agent } from "akanjs/ui";

export const KoyoAgentChat = () => {
  const { l } = usePage();
  return (
    <Agent.Chat
      persist
      reference={[
        {
          refName: "icecreamOrder",
          label: l("icecreamOrder.modelName"),
          type: cnst.IcecreamOrder,
          search: async (query, signal) => {
            const orders = await fetch.icecreamOrderListInMention(query, 0, 8, "relevance");
            if (signal.aborted) return [];
            return orders.map((order) => ({ refId: order.id, label: order.code, description: order.status }));
          },
          resolve: (refId) => fetch.icecreamOrder(refId),
        },
      ]}
    />
  );
};`}
          />
          <div>
            {l.trans({
              en: (
                <>
                  Each source is a <code>ReferenceSource</code>, an object of five fields:
                </>
              ),
              ko: (
                <>
                  source 하나는 다섯 필드로 된 <code>ReferenceSource</code> 객체입니다:
                </>
              ),
            })}
          </div>
          <Docs.OptionTable items={referenceOptions} />
          <ul className={bulletList}>
            {sourceNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>
            {l.trans({ en: "One field with useAgentReference", ko: "useAgentReference로 필드 하나 가리키기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <>
                  The component that draws a field already holds its value. It is also the only thing that knows a
                  rich-text field stored as <code>field(Any)</code> reads as a paragraph, not as an editor document:
                </>
              ),
              ko: (
                <>
                  필드를 그리는 컴포넌트는 이미 그 값을 쥐고 있습니다. 또한 <code>field(Any)</code>로 저장된 리치
                  텍스트가 에디터 문서가 아니라 한 문단으로 읽혀야 한다는 것을 아는 것도 그 컴포넌트뿐입니다:
                </>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Util.tsx"
            code={`"use client";
import { usePage } from "@apps/koyo/client";
import { Button, useAgentReference } from "akanjs/ui";

interface ReferMemoProps {
  className?: string;
  icecreamOrderId: string;
  code: string;
  memo: string;
}

export const ReferMemo = ({ className, icecreamOrderId, code, memo }: ReferMemoProps) => {
  const { l } = usePage();
  const refer = useAgentReference();
  return (
    <Button
      className={className}
      onClick={() =>
        refer({
          refName: "icecreamOrder",
          refId: icecreamOrderId,
          label: code,
          path: "memo",
          type: String,
          value: memo,
        })
      }
      size="xs"
      variant="ghost"
    >
      {l("icecreamOrder.referMemo")}
    </Button>
  );
};`}
          />
          <ul className={bulletList}>
            {fieldNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "In the composer", ko: "작성창에서는" })}</Docs.SubSubTitle>
          <ul className={bulletList}>
            {composerNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <>
                  <strong>A reference is a snapshot, capped at 20,000 characters.</strong> Past that, the JSON is
                  clipped mid-structure and a note tells the model so. Unlike a tool result, which answers one turn, it
                  rides <em>every</em> turn after its message and is the last thing compaction folds.
                </>
              ),
              ko: (
                <>
                  <strong>참조는 스냅샷이며 20,000자에서 잘립니다.</strong> 넘으면 JSON이 구조 중간에서 끊기고, 그
                  사실을 알리는 메모가 모델에게 붙습니다. 한 턴에만 답하는 툴 결과와 달리 참조는 실린 메시지 이후{" "}
                  <em>모든</em> 턴에 함께 가고, 압축에서도 가장 마지막에 접힙니다.
                </>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="queue" title={l.trans({ en: "The Queue And The Slash Menu", ko: "대기열과 슬래시 메뉴" })}>
        <Docs.Title>{l.trans({ en: "The Queue And The Slash Menu", ko: "대기열과 슬래시 메뉴" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A turn takes seconds, and a user who thinks of the next thing should not have to wait to type it. Enter during a turn parks the message and sends it the moment the turn ends.",
              ko: "턴 하나는 몇 초가 걸리는데, 그 사이 다음 할 말이 떠오른 사용자가 입력을 기다릴 이유는 없습니다. 턴 중에 Enter를 누르면 메시지를 대기시켰다가 턴이 끝나는 순간 보냅니다.",
            })}
          </div>
          <ul className={bulletList}>
            {queueNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Slash commands", ko: "슬래시 커맨드" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "The / menu lists these six commands and nothing else:",
              ko: "/ 메뉴에는 이 여섯 커맨드만 나옵니다:",
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Command", ko: "커맨드" })}
            items={commands.map(({ name, en, ko }) => ({ name, desc: l.trans({ en, ko }) }))}
          />
          <ul className={bulletList}>
            {commandNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Keys in the composer", ko: "작성창 단축키" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Key", ko: "키" })} items={keyRows} />
          <Docs.SubSubTitle>
            {l.trans({ en: "Session calls behind the menu", ko: "메뉴 뒤의 세션 호출" })}
          </Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Call", ko: "호출" })} items={sessionRows} />
          <ul className={bulletList}>
            {sessionNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="transcript" title={l.trans({ en: "Keeping The Transcript", ko: "대화를 보관하기" })}>
        <Docs.Title>{l.trans({ en: "Keeping The Transcript", ko: "대화를 보관하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <>
                  The relay keeps no session, so the conversation lives in one browser tab and nowhere else.{" "}
                  <code>persist</code> keeps it across reloads, and <code>Agent.History</code> keeps it on your server.
                </>
              ),
              ko: (
                <>
                  릴레이는 세션을 갖지 않으므로, 대화는 브라우저 탭 하나에만 있습니다. <code>persist</code>는
                  새로고침해도 대화를 남기고, <code>Agent.History</code>는 앱의 서버에 보관합니다.
                </>
              ),
            })}
          </div>
          <Docs.Table
            stacked
            columns={[
              { key: "write", label: l.trans({ en: "Write", ko: "쓰는 법" }), code: true },
              { key: "desc", label: l.trans({ en: "How it is kept", ko: "보관 방식" }) },
            ]}
            rows={storageRows}
          />
          <Docs.SubSubTitle>
            {l.trans({ en: "On your server: Agent.History", ko: "서버에 보관하기: Agent.History" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <>
                  A server store is a <code>SessionHistory</code> of three functions. A function cannot cross the RSC
                  boundary as a prop, so passing it would make every ancestor up to the session's owner a client
                  component. Instead it mounts as a leaf component inside the zone it keeps, the way{" "}
                  <code>Agent.Guide</code> does:
                </>
              ),
              ko: (
                <>
                  서버 저장소는 함수 세 개로 된 <code>SessionHistory</code>입니다. 함수는 prop으로 RSC 경계를 넘지
                  못하므로, prop으로 넘기면 세션을 만드는 곳까지의 모든 조상이 클라이언트 컴포넌트가 됩니다. 그래서{" "}
                  <code>Agent.Guide</code>처럼 잎 컴포넌트로, 보관할 zone 안에 마운트합니다:
                </>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Zone.tsx"
            code={`"use client";
import { fetch } from "@apps/koyo/client";
import { Agent } from "akanjs/ui";
import type { ReactNode } from "react";

interface DeskProps {
  className?: string;
  children: ReactNode;
}

export const Desk = ({ className, children }: DeskProps) => {
  return (
    <Agent.Zone className={className} id="orderDesk" instructions="Work the order desk." label="Order desk">
      <Agent.History
        clear={() => void fetch.clearIcecreamOrderChat()}
        load={async () => (await fetch.loadIcecreamOrderChat()).messages}
        save={(messages) => void fetch.saveIcecreamOrderChat(messages)}
      />
      {children}
      <Agent.Chat chrome={false} inline />
    </Agent.Zone>
  );
};`}
          />
          <ul className={bulletList}>
            {historyNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "What each store keeps", ko: "저장소마다 보관하는 것" })}</Docs.SubSubTitle>
          <Docs.Matrix
            type={l.trans({ en: "Rule", ko: "규칙" })}
            columns={[
              { key: "web", label: "persist", code: true },
              { key: "history", label: "Agent.History", code: true },
            ]}
            groups={storeGroups}
            markLabel={l.trans({ en: "Applies", ko: "적용됨" })}
            emptyLabel={l.trans({ en: "Does not apply", ko: "적용되지 않음" })}
          />
          <div>
            {l.trans({
              en: (
                <>
                  Web storage holds a few megabytes and one screenshot fills much of it. A failed save is silent, so
                  storing file bytes would quietly stop saving the transcript. <code>Agent.History</code> receives the
                  messages as they are, content included.
                </>
              ),
              ko: (
                <>
                  웹 스토리지는 몇 메가바이트뿐이고 스크린샷 하나가 그 상당 부분을 차지합니다. 실패한 저장은 조용히
                  넘어가므로, 파일 내용까지 담으면 대화 저장 자체가 조용히 멈춥니다. <code>Agent.History</code>는
                  내용까지 포함한 메시지를 그대로 받습니다.
                </>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Read next", ko: "다음으로 읽을 것" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <>
                  What the chat can <em>do</em> on these screens is a separate subject: a component declares one action
                  with <code>st.tool</code> and makes one store key readable by reading it, and nothing is derived from
                  a store class.
                </>
              ),
              ko: (
                <>
                  이 화면에서 채팅이 무엇을 <em>할 수 있는지</em>는 별개의 주제입니다. 컴포넌트가 <code>st.tool</code>로
                  동작 하나를 선언하고, 컴포넌트가 구독한 스토어 키만 에이전트도 읽을 수 있으며, 스토어 클래스에서
                  저절로 생기는 것은 없습니다.
                </>
              ),
            })}
          </div>
          <Docs.LinkGrid
            items={[
              {
                href: "/docs/arch/agentic",
                title: l.trans({ en: "In-Page Agent", ko: "인페이지 에이전트" }),
                desc: l.trans({
                  en: "The agent's surface: st.tool actions, readable keys, zones and LLM adaptors.",
                  ko: "에이전트의 표면: st.tool 동작, 읽을 수 있는 키, zone, LLM 어댑터.",
                }),
              },
              {
                href: "/references/ui/agent",
                title: l.trans({ en: "Agent UI Reference", ko: "Agent UI 레퍼런스" }),
                desc: l.trans({
                  en: "Every prop of Agent.Chat, Agent.Zone, Agent.History and the rest.",
                  ko: "Agent.Chat, Agent.Zone, Agent.History 등의 모든 prop.",
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
