import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Link } from "akanjs/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="agent-overview" title={l.trans({ en: "In-Page Agent", ko: "인페이지 에이전트" })}>
        <Docs.Title>{l.trans({ en: "In-Page Agent", ko: "인페이지 에이전트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Every Akan app can host a chat agent that reads the rendered screen and drives it — the assistant on this page is one. What it may do is what a component declared, and what it may read is what a component subscribed. A store class publishes nothing on its own: an agent presses the controls the screen already offers the user, and never a lever the screen does not have.",
              ko: "모든 Akan 앱은 렌더된 화면을 읽고 조작하는 채팅 에이전트를 품을 수 있습니다. 지금 이 페이지의 어시스턴트가 바로 그것입니다. 에이전트가 할 수 있는 일은 컴포넌트가 선언한 것이고, 읽을 수 있는 것은 컴포넌트가 구독한 것입니다. 스토어 클래스만으로는 아무것도 발행되지 않습니다. 에이전트는 화면이 이미 사용자에게 주는 컨트롤을 누를 뿐, 화면에 없는 레버는 당기지 않습니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "One mount", ko: "한 줄 마운트" }),
                desc: l.trans({
                  en: "<Agent.Chat /> in a layout is the whole integration — launcher, transcript, approval card, and a streaming loop.",
                  ko: "레이아웃의 <Agent.Chat /> 한 줄이 통합의 전부입니다. 런처, 대화창, 승인 카드, 스트리밍 루프까지.",
                }),
              },
              {
                title: l.trans({ en: "Tools run in the browser", ko: "툴은 브라우저에서 실행" }),
                desc: l.trans({
                  en: "The server is a stateless relay that never executes a tool. Every action runs in the caller's own session, gated by guards and the approval card.",
                  ko: "서버는 툴을 절대 실행하지 않는 무상태 릴레이입니다. 모든 액션은 호출자 자신의 세션에서, 가드와 승인 카드를 거쳐 실행됩니다.",
                }),
              },
              {
                title: l.trans({ en: "Framework built-in", ko: "프레임워크 내장" }),
                desc: l.trans({
                  en: "The relay endpoint, the DeepSeek adaptor, and the chat UI all ship with akanjs — no extra library to mount.",
                  ko: "릴레이 엔드포인트, DeepSeek 어댑터, 채팅 UI가 모두 akanjs에 내장돼 있어 추가로 마운트할 라이브러리가 없습니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className={panelRecipe({ padding: "row" })}>
                <span className="font-bold text-foreground">{title}: </span>
                <span className="text-foreground/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <div className={panelRecipe({ radius: "2xl", padding: "lg" })}>
            <div className="mb-4 font-bold text-foreground">{l.trans({ en: "Runtime Map", ko: "런타임 지도" })}</div>
            <div className="space-y-1">
              {[
                {
                  title: "Screen",
                  desc: l.trans({
                    en: "Mounted st.use / st.sel / st.ref keys, hook tools, and Agent.Guide text.",
                    ko: "마운트된 st.use / st.sel / st.ref 키, 훅 툴, Agent.Guide 문구.",
                  }),
                },
                {
                  title: "Agent.Chat",
                  desc: l.trans({
                    en: "The loop, the approval card, its own /new · /retry · /compact · /copy · /help · /tools, and slash commands from prompt() endpoints.",
                    ko: "대화 루프, 승인 카드, 자체 커맨드(/new · /retry · /compact · /copy · /help · /tools), prompt() 엔드포인트에서 온 slash command.",
                  }),
                },
                {
                  title: "runAgentTurn",
                  desc: l.trans({
                    en: "A stateless HTTP relay. It spends the LLM key and never runs a tool.",
                    ko: "무상태 HTTP 릴레이입니다. LLM 키만 쓰고 툴은 실행하지 않습니다.",
                  }),
                },
                {
                  title: "LlmAdaptor.chat",
                  desc: l.trans({
                    en: "The whole transcript in, one assistant answer out. DeepSeek is the default.",
                    ko: "전체 대화가 들어가고 어시스턴트 응답 하나가 나옵니다. 기본값은 DeepSeek입니다.",
                  }),
                },
              ].map(({ title, desc }) => (
                <div key={title} className="rounded-xl border border-border bg-muted px-4 py-2">
                  <span className="font-mono font-semibold text-primary">{title}: </span>
                  <span className="text-foreground/70 text-sm">{desc}</span>
                </div>
              ))}
            </div>
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "External agents that call your domain over HTTP use the MCP server instead — a different catalogue, derived from signal guards.",
              ko: "HTTP로 도메인을 호출하는 외부 agent는 MCP 서버를 씁니다. 다른 카탈로그이며, signal guard에서 파생됩니다.",
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
              en: "Mount the chat once in a layout. The framework serves runAgentTurn on every app. option.setLlm gives it a key; AKAN_AGENT=false removes the whole surface.",
              ko: "레이아웃에 채팅을 한 번 마운트하세요. 프레임워크가 모든 앱에 runAgentTurn을 기본 제공합니다. option.setLlm으로 키를 주고, AKAN_AGENT=false로 표면 전체를 내립니다.",
            })}
          </div>
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
            en: "AgentRelayAccess refuses every call until a guard is registered — the same answer None gives. Without one the chat cannot spend the LLM key. A product with accounts names its own guard in the same option.ts, as it would on any other endpoint.",
            ko: "AgentRelayAccess는 가드 등록 전까지 모든 호출을 None과 같이 거절합니다. 가드가 없으면 채팅이 LLM 키를 쓸 수 없습니다. 계정이 있는 제품은 다른 엔드포인트와 똑같이 같은 option.ts에서 자기 가드를 지정합니다.",
          })}
        </Docs.Alert>
        <div className="space-y-1">
          {[
            {
              title: "persist",
              desc: l.trans({
                en: 'Keeps the transcript across reloads in sessionStorage. Pass { storage: "local" } to outlive the tab. Off by default.',
                ko: '새로고침을 견디도록 대화를 sessionStorage에 보존합니다. { storage: "local" }이면 탭을 닫아도 유지됩니다. 기본값은 꺼짐입니다.',
              }),
            },
            {
              title: "streaming",
              desc: l.trans({
                en: "The same endpoint answers text/event-stream. Assistant text arrives as it is generated, with zero app code.",
                ko: "같은 엔드포인트가 text/event-stream도 답합니다. 어시스턴트 텍스트가 생성되는 대로 도착하며 앱 코드는 필요 없습니다.",
              }),
            },
            {
              title: "instructions",
              desc: l.trans({
                en: "App-global framing on Agent.Chat. Route-scoped guidance layers on through mounted Agent.Guide.",
                ko: "Agent.Chat의 앱 전역 프레이밍입니다. 라우트 범위 지침은 마운트된 Agent.Guide가 겹칩니다.",
              }),
            },
            {
              title: "attach",
              desc: l.trans({
                en: "The composer attaches images and text files on its own; attach is where an app reads what needs a parser, like a PDF's text. Nothing is stored — the bytes ride one turn's request, and a reloaded transcript keeps the name without the content. The ceilings are the message's rather than the file's — 4 MB per file, 8 MB and five files per message, and the same file twice refused by name — because what a provider refuses is the sum, and a request that cannot be sent is one the user has to empty the composer to escape.",
                ko: "작성창은 이미지와 텍스트 파일을 스스로 첨부합니다. PDF 본문처럼 파서가 필요한 것은 앱이 attach에서 읽습니다. 저장은 하지 않습니다 — 바이트는 한 턴의 요청에만 실리고, 새로고침된 대화는 내용 없이 이름만 남깁니다. 상한은 파일 하나가 아니라 메시지 단위입니다 — 파일당 4MB, 메시지당 8MB와 5개, 같은 파일은 이름을 밝히며 거절합니다. 프로바이더가 거절하는 것은 합계이고, 보낼 수 없는 요청에서 빠져나오려면 작성창을 비우는 수밖에 없기 때문입니다.",
              }),
            },
            {
              title: "voice",
              desc: l.trans({
                en: "A press-to-talk microphone whose transcript lands in the composer to be corrected, and a reply read aloud one sentence at a time — but only when the ask itself came in by voice, so a typed question never turns the speakers on. useSpeech from @libs/util/webkit is the engine: the browser's own recognition on the web, Capacitor plugins in a WebView, which has neither.",
                ko: "눌러서 말하는 마이크입니다. 전사는 작성창에 들어가 고칠 수 있고, 응답은 문장 단위로 읽어줍니다. 단 음성으로 물었을 때만 읽으므로 타이핑한 질문이 스피커를 켜는 일은 없습니다. 엔진은 @libs/util/webkit의 useSpeech — 웹은 브라우저 내장 인식, WebView는 둘 다 없으므로 Capacitor 플러그인입니다.",
              }),
            },
            {
              title: "a client wrapper",
              desc: l.trans({
                en: "attach and voice carry functions, and a function cannot cross the RSC boundary — so a server layout cannot pass either. Mount the chat from a small client component in ui/ that calls the hook, the way apps/akan/ui/DocsAgentChat.tsx does.",
                ko: "attach와 voice는 함수를 담고 있고 함수는 RSC 경계를 넘지 못합니다. 그래서 서버 레이아웃에서는 둘 다 넘길 수 없습니다. ui/에 훅을 호출하는 작은 클라이언트 컴포넌트를 두고 거기서 채팅을 마운트하세요 — apps/akan/ui/DocsAgentChat.tsx가 그 예입니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className={panelRecipe({ padding: "row" })}>
              <span className="font-mono font-semibold text-primary">{title}: </span>
              <span className="text-foreground/70 text-sm">{desc}</span>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="agent-surface" title={l.trans({ en: "The Declared Surface", ko: "선언하는 표면" })}>
        <Docs.Title>{l.trans({ en: "The Declared Surface", ko: "선언하는 표면" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "st.tool publishes one action and hands back the callable you wire to onClick, so the agent and the user press the same handler. st.use, st.sel, and st.ref make one store key readable while the component reading it is mounted. Unmount and both withdraw on the next turn.",
              ko: "st.tool은 액션 하나를 발행하고 onClick에 연결할 callable을 돌려줍니다. 에이전트와 사용자가 같은 핸들러를 누르는 셈입니다. st.use·st.sel·st.ref는 그 키를 읽는 컴포넌트가 마운트된 동안 스토어 키 하나를 읽을 수 있게 합니다. 언마운트되면 다음 턴부터 둘 다 철회됩니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Six tools are on every screen whatever it declares:",
              ko: "화면이 무엇을 선언하든 항상 실리는 툴이 여섯 있습니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: "navigate",
                desc: l.trans({
                  en: "Internal paths only, the same router Link rides.",
                  ko: "내부 경로 전용입니다. Link가 타는 같은 라우터입니다.",
                }),
              },
              {
                title: "goBack",
                desc: l.trans({
                  en: "The previous page in this session's history. Global like navigate, because history is not a control a page owns — a page that draws no back link is not a page you may not leave.",
                  ko: "이 세션 히스토리의 이전 페이지. navigate처럼 전역입니다 — 히스토리는 페이지가 소유한 컨트롤이 아니고, 뒤로가기 링크를 그리지 않은 페이지가 떠날 수 없는 페이지는 아니니까요.",
                }),
              },
              {
                title: "readScreen(section?)",
                desc: l.trans({
                  en: "The rendered DOM as compact text. Headings carry their anchor and a truncated read names the sections below the cut, so a long screen stays reachable: pass one of those names — or a heading's own text — as section.",
                  ko: "렌더된 DOM을 압축 텍스트로. 제목에 앵커가 붙고, 잘린 읽기는 잘린 아래쪽 섹션 이름을 알려줍니다. 그래서 긴 화면도 닿을 수 있습니다 — 그 이름이나 제목 텍스트를 section으로 넘기면 됩니다.",
                }),
              },
              {
                title: "readState(key)",
                desc: l.trans({ en: "One masked store key.", ko: "마스킹된 스토어 키 하나." }),
              },
              {
                title: "highlight(target)",
                desc: l.trans({
                  en: "Scrolls one thing into view and flashes it once the scroll lands, so the agent can show the user where a thing is instead of describing where it is. The target is a tool name, a state key, a scope path, an anchor, or a heading's text. Nothing hidden ever resolves.",
                  ko: "대상을 화면으로 스크롤한 뒤, 스크롤이 멈추면 깜빡입니다. 어디 있는지 설명하는 대신 직접 가리킵니다. 대상은 툴 이름·상태 키·스코프 경로·앵커·제목 텍스트이고, 숨겨진 것은 절대 잡히지 않습니다.",
                }),
              },
              {
                title: "askUser(question, choices?)",
                desc: l.trans({
                  en: "Hands a decision back to the user. The turn parks on the question card until they pick an option or write their own answer; dismissing it is an error the agent reads, never a silent empty answer.",
                  ko: "결정을 사용자에게 되돌립니다. 턴은 질문 카드에서 멈추고, 사용자가 보기를 고르거나 직접 답할 때까지 기다립니다. 건너뛰면 조용한 빈 답이 아니라 에이전트가 읽는 오류가 됩니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className={panelRecipe({ padding: "row" })}>
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-foreground/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <div>
            {l.trans({
              en: "A tool that changes the screen waits for the screen before it answers: router.push returns while the payload is still in flight, so navigate — and the session, after every non-query tool — waits for the DOM to hold still before reporting. And the turn cap is a question rather than a dead end: at maxTurns the agent asks whether to keep going, and what the user types instead rides as their own turn.",
              ko: "화면을 바꾸는 툴은 화면이 정착한 뒤에 답합니다. router.push는 페이로드가 아직 오는 중에 반환되므로, navigate는 (그리고 세션은 query가 아닌 모든 툴 뒤에서) DOM이 멈출 때까지 기다린 다음 변경을 보고합니다. 턴 상한도 막다른 길이 아니라 질문입니다 — maxTurns에 닿으면 계속할지 묻고, 사용자가 대신 입력한 말은 그 사용자의 턴으로 들어갑니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Long work is awaited, not polled. The session awaits a tool's own promise, so a .exec that awaits the store action finishing the job simply makes the turn take that long — and the change report that follows carries whatever landed, so the model needs no second call to read it. A tool that returns early leaves the agent to ask again and again, one round trip per look, which burns the whole maxTurns budget in seconds on a job measured in minutes. Say so in the desc. For the job a tool cannot await — one started in an earlier turn, or by a person clicking the button — declare a waiting tool of your own beside the control that starts the work: a general built-in wait was tried and removed, because a tool reachable on every screen with no idea what any key means gets spent on whatever key looks promising, parking turns nobody asked to park. Stop reaches a tool that is still running: the session races every call against its abort signal, and the signal itself arrives through AgentAbort.current, the same module slot AgentProgress is. Honouring it is optional, since the race lands whatever the tool does; what it buys is the tool's own cleanup. Import both from akanjs/store — an app may not reach use-agentic directly. A stopped turn answers the calls it never ran: every provider dialect refuses an assistant message whose tool_calls have no results, on that turn and on every later one, so Stop landing between a call and its result would otherwise leave a transcript nothing can be sent from.",
              ko: "긴 작업은 폴링이 아니라 await 합니다. 세션은 툴의 promise를 기다리므로, 작업을 끝내는 스토어 액션을 await 하는 .exec은 그냥 턴이 그만큼 걸리게 만듭니다. 그리고 뒤따르는 변경 보고가 그 사이 도착한 것을 실어 나르므로, 모델은 결과를 읽기 위해 두 번째 호출을 할 필요가 없습니다. 일찍 반환하는 툴은 에이전트에게 계속 되묻게 만들고, 한 번 볼 때마다 모델 왕복이 한 번이라, 분 단위 작업에서 maxTurns 예산을 몇 초 만에 태웁니다. 그 사실을 desc에 적으세요. 툴이 기다릴 수 없는 작업 — 이전 턴에서, 또는 사용자가 버튼을 눌러 시작된 작업 — 은 그 작업을 시작하는 컨트롤 옆에 기다리는 툴을 직접 선언하세요. 범용 대기 빌트인은 만들었다가 제거했습니다. 모든 화면에서 닿을 수 있으면서 어떤 키가 무슨 뜻인지는 모르는 툴은 그럴듯해 보이는 키에 아무렇게나 쓰이고, 아무도 부탁하지 않은 대기로 턴을 세워 둡니다. Stop은 아직 돌고 있는 툴에도 닿습니다. 세션이 모든 호출을 abort 시그널과 레이스시키고, 시그널 자체는 AgentProgress와 같은 모듈 슬롯인 AgentAbort.current로 옵니다. 레이스가 어떤 툴이든 멈춰 세우므로 시그널을 존중하는 것은 선택입니다. 존중해서 얻는 것은 툴 자신의 정리입니다. 둘 다 akanjs/store에서 가져오세요 — 앱은 use-agentic에 직접 닿을 수 없습니다. 중지된 턴은 실행하지 못한 호출에 대신 답을 채웁니다. 모든 프로바이더 방언은 결과 없는 tool_calls를 가진 assistant 메시지를 거절하며, 그 턴뿐 아니라 이후 모든 턴에서 거절합니다. 그래서 호출과 결과 사이에 Stop이 떨어지면 아무것도 보낼 수 없는 트랜스크립트가 남게 됩니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The chat answers six commands of its own, listed in the same / menu ahead of the prompts: /new (/clear), /retry, /compact, /copy, /help and /tools. An app writes none of them and cannot add one — a product's own command is a prompt() endpoint, which is guarded and server-side. A built-in wins a name collision with a prompt, the mirror image of the tool rule: a component's st.tool may shadow a built-in it means to replace, but no library's prompt may take /new away from the user who typed it. /new and /copy work mid-turn and ahead of the question card, so /new ends the turn it is clearing instead of being answered into it as text. A command's output is a local message — rendered in the transcript, withheld from the wire, because the transcript is the model's history and text appended plainly would come back next turn as something the assistant believes it said. /copy exists because nothing else keeps the transcript: the relay is stateless, so an export is the one path a wrong answer has to whoever could fix it. And ↑ walks back through what was sent, ↓ forward — seeded from the transcript, so a persisted chat does not lose only what was just typed — while the / menu takes those keys whenever it is open: Enter picks the highlighted row, Tab completes its name, and Escape closes the menu and then the panel.",
              ko: "채팅은 자체 커맨드 여섯 개를 가집니다. 같은 / 메뉴에서 prompt보다 앞에 놓입니다 — /new(/clear), /retry, /compact, /copy, /help, /tools. 앱은 이 중 아무것도 작성하지 않고 추가할 수도 없습니다. 제품 고유의 커맨드는 guard가 걸린 서버 쪽 prompt() 엔드포인트입니다. 이름이 겹치면 빌트인이 이깁니다 — 툴 규칙의 반대입니다. 컴포넌트의 st.tool은 대체하려는 빌트인을 가릴 수 있지만, 어떤 라이브러리의 prompt도 사용자가 직접 입력한 /new를 빼앗을 수는 없습니다. /new와 /copy는 턴 중에도, 그리고 질문 카드보다 앞서 동작합니다. 그래서 /new는 질문에 대한 답변 텍스트로 삼켜지는 대신 비우려는 턴을 끝냅니다. 커맨드의 출력은 local 메시지입니다 — 트랜스크립트에는 렌더되고 와이어에는 실리지 않습니다. 트랜스크립트가 곧 모델의 히스토리라서, 그냥 붙이면 다음 턴에 모델이 자기가 한 말로 받아들입니다. /copy가 있는 이유는 트랜스크립트를 보관하는 곳이 달리 없기 때문입니다 — 릴레이는 stateless이므로, 잘못된 답이 고칠 수 있는 사람에게 닿는 유일한 경로가 내보내기입니다. 그리고 ↑는 보낸 것들을 거슬러 가고 ↓는 되돌아옵니다 — 트랜스크립트에서 시작되므로 persist된 대화가 방금 입력한 것만 잃는 일은 없습니다. / 메뉴가 열려 있는 동안에는 그 키들을 메뉴가 가져갑니다. Enter는 선택된 줄을 실행하고, Tab은 이름을 완성하며, Escape는 메뉴를 닫고 한 번 더 누르면 패널을 닫습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A long conversation summarizes itself, because nothing else keeps it inside the model's window: the loop runs in the browser and the relay holds no session, so an uncompacted chat grows until the provider refuses the whole request. Past compact.at estimated tokens the history above the last keep messages becomes one message standing in for it — before the turn that would have overflowed, since a provider answers an over-long request with a refusal rather than a shorter answer. The cut only ever lands on a user message, so the kept half never opens with a tool result whose call was summarized away. The summarizing turn carries no tools and no screen context, and is fed a bounded digest rather than the transcript itself, which is the one thing already known not to fit. compact={{ at, keep }} on Agent.Chat tunes it per provider, { at: 0 } turns it off, and /compact does the same on demand keeping nothing.",
              ko: "긴 대화는 스스로를 요약합니다. 루프는 브라우저에서 돌고 릴레이는 세션을 갖지 않으므로, 대화를 모델의 컨텍스트 창 안에 붙잡아 두는 것이 달리 없습니다 — 압축하지 않으면 프로바이더가 요청 전체를 거절할 때까지 자랍니다. 추정 토큰이 compact.at을 넘으면 마지막 keep개 위의 히스토리가 그것을 대신하는 메시지 하나가 됩니다. 넘칠 턴이 나가기 전에 그렇게 합니다. 프로바이더는 너무 긴 요청에 짧은 답이 아니라 거절로 답하기 때문입니다. 자르는 지점은 언제나 user 메시지입니다. 그래서 남는 쪽이 호출은 요약돼 사라지고 결과만 남은 tool 메시지로 시작하는 일이 없습니다. 요약 턴은 툴도 화면 컨텍스트도 싣지 않고, 트랜스크립트 자체가 아니라 길이가 제한된 요약본을 받습니다. 트랜스크립트는 이미 들어가지 않는다고 알려진 바로 그것이니까요. Agent.Chat의 compact={{ at, keep }}로 프로바이더에 맞게 조절하고, { at: 0 }으로 끄고, /compact로 언제든 남기는 것 없이 같은 일을 시킵니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Reading is per key, not per store: a key the screen does not read stays unreadable even while a sibling key of the same store is live, and every read is masked by the model that key declares. hidden and secret fields never cross the boundary. Base-store plumbing is subscribed with `{ agent: false }` so routing and the caller's credential stay off the surface; a component that wants an agent to read a base key opts it in, as ThemeToggle does for theme.",
              ko: "읽기는 스토어 단위가 아니라 키 단위입니다. 같은 스토어의 형제 키가 live여도 화면이 읽지 않는 키는 읽히지 않고, 모든 읽기는 그 키가 선언한 모델로 마스킹됩니다. hidden·secret 필드는 경계를 넘지 않습니다. base 스토어의 plumbing은 `{ agent: false }`로 구독해서 라우팅과 호출자의 자격증명이 표면에 올라가지 않게 하고, 에이전트가 읽어야 하는 키는 ThemeToggle의 theme처럼 옵트인합니다.",
            })}
          </div>
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
        <div className="space-y-1">
          {[
            {
              title: "st.tool(name).desc(…).arg(…).opt(…).exec(fn)",
              desc: l.trans({
                en: "The only way an action reaches an agent. desc is required and comes first; arg is what the caller must pass and opt what it may. Returns the callable to wire to onClick; a remove* name confirms by default.",
                ko: "액션이 에이전트에게 닿는 유일한 경로입니다. desc는 필수이고 맨 앞에 옵니다. arg는 호출자가 반드시 넘겨야 하는 인자, opt는 생략할 수 있는 인자입니다. onClick에 연결할 callable을 돌려주고, remove* 이름은 기본으로 승인을 받습니다.",
              }),
            },
            {
              title: "st.expose(name, Type) · st.useState(name, Type)",
              desc: l.trans({
                en: "Derived values and local state. The declared type typechecks what you hand over and masks how it reads — a model class strips its own hidden, secret, and visual fields; Any passes untouched. Read-only unless set: true.",
                ko: "파생 값과 로컬 상태입니다. 선언한 타입이 넘기는 값을 typecheck하고 읽히는 형태를 결정합니다 — 모델 클래스는 그 모델의 hidden·secret·visual을 벗겨내고, Any는 그대로 통과시킵니다. set: true 전에는 읽기 전용입니다.",
              }),
            },
            {
              title: "st.use.x({ agent: false })",
              desc: l.trans({
                en: "Subscribes without joining the surface. There is no store-level exposure switch — a store class says nothing about agents.",
                ko: "구독하되 표면에는 넣지 않습니다. 스토어 단위 노출 스위치는 없습니다. 스토어 클래스는 에이전트에 대해 아무것도 말하지 않습니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title} className={panelRecipe({ padding: "row" })}>
              <span className="font-mono font-semibold text-primary">{title}: </span>
              <span className="text-foreground/70 text-sm">{desc}</span>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="agent-zones" title={l.trans({ en: "Zone Agents", ko: "Zone 에이전트" })}>
        <Docs.Title>{l.trans({ en: "Zone Agents", ko: "Zone 에이전트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Wrap a section in Agent.Zone and everything mounted inside — subscriptions, hook tools, guides — belongs to that zone's own conversation as well as to the root agent. Zones are views of the screen, never walls between its parts. A zone's readScreen reads only its own container, and an Agent.Chat mounted inside binds to the zone session automatically.",
              ko: "구획을 Agent.Zone으로 감싸면 그 안에 마운트된 모든 것(구독, 훅 툴, 가이드)이 그 zone의 대화에 속하면서 root 에이전트에도 그대로 보입니다. zone은 화면의 뷰이지 벽이 아닙니다. zone의 readScreen은 자기 컨테이너만 읽고, 안에 마운트된 Agent.Chat은 자동으로 그 zone의 세션에 바인딩됩니다.",
            })}
          </div>
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
          <div>
            {l.trans({
              en: "Guides follow the layout cascade: a zone reads its ancestors' guidance plus its own, and never a sibling's. The root chat outside the zones keeps seeing the whole screen, so wrapping a section costs the root agent nothing.",
              ko: "가이드는 레이아웃 캐스케이드를 따릅니다. zone은 조상의 지침과 자신의 지침을 읽고, 형제 zone의 것은 절대 읽지 않습니다. zone 밖의 root 채팅은 화면 전체를 계속 보므로, 구획을 감싸도 root 에이전트가 잃는 것은 없습니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="agent-skip" title={l.trans({ en: "Skipping A Region", ko: "읽지 않을 영역" })}>
        <Docs.Title>{l.trans({ en: "Skipping A Region", ko: "읽지 않을 영역" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "readScreen reads the whole rendered screen, and a footer, a cookie banner, or a nav that repeats on every route costs the same tokens as the content — on that read and on every later turn, since the read stays in the transcript. Agent.Skip leaves a region out of the default read.",
              ko: "readScreen은 렌더된 화면 전체를 읽고, 푸터·쿠키 배너·모든 라우트에 반복되는 내비게이션도 본문과 같은 토큰을 씁니다. 그 읽기에서 한 번, 그리고 이후 모든 턴에서 다시 — 읽은 결과가 트랜스크립트에 남기 때문입니다. Agent.Skip은 그 영역을 기본 읽기에서 빼냅니다.",
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
          <div>
            {l.trans({
              en: "What stands in its place is a named marker, never nothing. A deleted region reads as an absent one — an agent asked about the footer would answer that the page has none. The name in the marker is a section, so naming it reads the region after all: the marker is what the default read leaves out, not a wall.",
              ko: "그 자리에는 이름 붙은 표시가 남습니다. 아무것도 남기지 않으면 지워진 영역이 없는 영역으로 읽힙니다 — 푸터에 대해 물으면 에이전트는 이 페이지에 푸터가 없다고 답하게 됩니다. 표시의 이름은 그대로 section이므로, 이름을 넘기면 결국 읽을 수 있습니다. 표시는 기본 읽기가 빼놓은 것이지 벽이 아닙니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "It hides text, not behaviour. Tools and state keys are declarations rather than markup, so an st.tool declared inside is published exactly as before and highlight still reaches a control in there. This is field.visual one layer up: cost, not secrecy.",
              ko: "감추는 것은 텍스트이지 동작이 아닙니다. 툴과 상태 키는 마크업이 아니라 선언이므로, 안에서 선언한 st.tool은 그대로 발행되고 highlight도 그 안의 컨트롤에 여전히 닿습니다. field.visual과 같은 이야기를 한 층 위에서 하는 것입니다 — 비밀이 아니라 비용입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Reach for it second. A read is scoped from the other side too: Agent.Zone and readScreen({ section }) narrow to one container, which beats blocklisting five regions on a screen that is mostly chrome. And a footer is last in the document, so on a page long enough to truncate it was already past the cut — the regions worth marking are the ones above the content.",
              ko: "먼저 꺼낼 도구는 아닙니다. 읽기는 반대쪽에서도 좁힐 수 있습니다. Agent.Zone과 readScreen({ section })은 컨테이너 하나로 범위를 줄이고, 화면 대부분이 크롬인 경우엔 영역 다섯 개를 하나씩 빼는 것보다 그 편이 낫습니다. 그리고 푸터는 문서의 마지막이므로, 잘릴 만큼 긴 페이지에서는 이미 컷 뒤에 있었습니다 — 표시할 값이 있는 영역은 본문 위쪽에 있는 것들입니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="agent-llm" title={l.trans({ en: "Swapping the Model", ko: "모델 교체" })}>
        <Docs.Title>{l.trans({ en: "Swapping the Model", ko: "모델 교체" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Everything the model needs is declared in option.ts, never in the environment. setLlm fills apiKey, model, and host for whichever adaptor holds LlmAdaptorRole, so the settings survive a provider swap. DeepSeek is the built-in default — deepseek-v4-flash at https://api.deepseek.com. With no apiKey the app still boots and the chat says no model is configured; a refusal the provider explained is thrown instead of swallowed, so the chat prints that reason in the user's language.",
              ko: "모델에 필요한 설정은 환경변수가 아니라 option.ts에 선언합니다. setLlm은 LlmAdaptorRole을 차지한 어댑터에 apiKey·model·host를 채우므로, 프로바이더를 바꿔도 설정은 그대로입니다. 기본값은 DeepSeek입니다. deepseek-v4-flash, https://api.deepseek.com. apiKey가 없어도 앱은 기동하고, 채팅은 모델이 설정되지 않았다고 답합니다. 프로바이더가 이유를 밝힌 거절은 삼키지 않고 던지므로, 채팅이 그 이유를 사용자의 언어로 보여줍니다.",
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
        <Docs.Description>
          <div>
            {l.trans({
              en: "An adaptor implements one method — chat(request, onDelta?). The whole transcript goes in, one assistant answer comes out. Rebind the role the way applyMiddleware rebinds middleware: last writer wins.",
              ko: "어댑터가 구현할 것은 chat(request, onDelta?) 하나입니다. 전체 대화가 들어가고 어시스턴트 응답 하나가 나옵니다. 롤 다시 묶기는 applyMiddleware와 같습니다. 마지막에 쓴 쪽이 이깁니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <DocsToc />
    </Scroll>
  );
}
