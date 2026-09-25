import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsList, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Link } from "akanjs/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "MCP Server", ko: "MCP 서버" })}>
        <Docs.Title>{l.trans({ en: "MCP Server", ko: "MCP 서버" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Every signal you already wrote is served to AI agents at POST /mcp. There is no second API and nothing to write in a signal file: the same endpoint runs through the same guards, middleware, and service. The in-page chat is a different surface.",
              ko: "이미 작성한 signal이 POST /mcp에서 AI agent에게 그대로 제공됩니다. 별도의 API도, signal 파일에 적을 옵션도 없습니다. 같은 endpoint가 같은 guard·middleware·service를 탑니다. 페이지 안 채팅은 다른 표면입니다.",
            })}{" "}
            <Link href="/docs/arch/agentic" className="text-primary">
              {l.trans({ en: "In-Page Agent", ko: "인페이지 에이전트" })}
            </Link>
          </div>
          <div className="space-y-1">
            {[
              {
                title: "query · mutation",
                desc: l.trans({
                  en: "Become tools. A generated read also gets a resource URI.",
                  ko: "tool이 됩니다. 생성된 조회에는 resource URI도 붙습니다.",
                }),
              },
              {
                title: "prompt",
                desc: l.trans({
                  en: "A slash command the user invokes, not the model.",
                  ko: "model이 고르는 것이 아니라 사용자가 호출하는 slash command입니다.",
                }),
              },
              {
                title: "pubsub · message",
                desc: l.trans({
                  en: "Never exposed — their arguments read a socket MCP does not have.",
                  ko: "노출되지 않습니다. 인자가 MCP 요청에 없는 socket을 읽습니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className={panelRecipe({ padding: "row" })}>
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-foreground/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "Exposure follows the guards. A real guard publishes; no guards at all is refused; a mutation whose only guard is [Public] is refused. A Public read publishes. A refused endpoint answers the same unknown tool as one that does not exist.",
              ko: "노출은 guard를 따릅니다. 실질 guard가 있으면 게시되고, guard가 없으면 거부되며, [Public]만 있는 mutation도 거부됩니다. Public 읽기는 게시됩니다. 거부된 endpoint는 존재하지 않는 것과 같은 unknown tool을 돌려줍니다.",
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
              en: "/mcp is mounted by default. Configure it in lib/option.ts — not main.ts — so the process that mounts the route actually receives the settings. Every lib's option is read in mount order with the app's last. A value written in code wins over the env of the same name.",
              ko: "/mcp는 기본으로 마운트됩니다. 설정은 main.ts가 아니라 lib/option.ts에 씁니다. 실제로 라우트를 마운트하는 프로세스에 전달되는 파일이기 때문입니다. 모든 lib의 option을 마운트 순서대로 읽고 앱의 것을 마지막에 얹습니다. 코드에 쓴 값이 같은 이름의 env를 이깁니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="lib/option.ts"
          code={`export const option = new AkanOption<ModulesOptions>().setMcp({
  instructions: "Domain tools for the akan app. Start from taskListInTodo.",
  language: "en",
});`}
        />
        <div className="space-y-1">
          {[
            {
              title: "instructions",
              desc: l.trans({
                en: "What this app is for and which tool to reach for first. Handed to the model with the tool list.",
                ko: "이 앱이 무엇을 위한 것인지, 어떤 tool부터 잡아야 하는지. tool 목록과 함께 model에게 전달됩니다.",
              }),
            },
            {
              title: "readOnly · AKAN_MCP_READONLY",
              desc: l.trans({
                en: "Drops every mutation whatever it declared. A deployment valve, not the exposure switch.",
                ko: "선언과 무관하게 모든 mutation을 뺍니다. 노출 스위치가 아니라 배포 밸브입니다.",
              }),
            },
            {
              title: "path · language · pageSize",
              desc: l.trans({
                en: "Mount path defaults to /mcp. Catalogue language is en, built once at boot. pageSize is entries per listing page.",
                ko: "마운트 경로는 기본 /mcp입니다. 카탈로그 언어는 en이고 부팅 시 한 번 만들어집니다. pageSize는 목록 페이지당 항목 수입니다.",
              }),
            },
            {
              title: "allowedOrigins",
              desc: l.trans({
                en: "Only a browser-hosted client sends Origin. Native clients do not need this.",
                ko: "Origin을 보내는 것은 브라우저 client뿐입니다. native client에는 필요 없습니다.",
              }),
            },
            {
              title: "AKAN_MCP=false",
              desc: l.trans({
                en: "Takes the whole surface off. AKAN_PUBLIC_MCP is the same pairing OpenAPI already has.",
                ko: "표면 전체를 내립니다. AKAN_PUBLIC_MCP는 OpenAPI가 이미 가진 짝입니다.",
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

      <Scroll.Slide id="tool" title={l.trans({ en: "2. Write An Endpoint", ko: "2. Endpoint 작성하기" })}>
        <Docs.Title>{l.trans({ en: "2. Write An Endpoint", ko: "2. Endpoint 작성하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Name the guards and you are done. The tool name is the endpoint key, the input schema comes from the declared arguments, and the output schema from the return model.",
              ko: "guard만 적으면 끝입니다. tool 이름은 endpoint key 그대로이고, input schema는 선언한 인자에서, output schema는 반환 model에서 나옵니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="task.signal.ts"
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
        <Docs.Description>
          <div>
            {l.trans({
              en: "Write the dictionary entry at the same time. An agent picks a tool by its description, so a missing one is a broken tool — the boot log names every published entry that has none.",
              ko: "dictionary 항목도 같이 씁니다. agent는 설명을 보고 tool을 고르므로, 설명이 없는 tool은 고장난 tool입니다. 부팅 로그가 설명 없이 게시된 항목을 모두 남깁니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="task.dictionary.ts"
          code={`.endpoint<TaskEndpoint>((fn) => ({
  startTask: fn(["Start Task", "작업 시작"])
    .desc(["Moves one task from todo to in progress", "할 일 하나를 진행중으로 옮깁니다"])
    .arg((t) => ({ taskId: t(["Task ID", "할 일 ID"]).desc(["The task to start", "시작할 할 일"]) })),
}))`}
        />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="slice" title={l.trans({ en: "3. Slices And CRUD", ko: "3. Slice와 CRUD" })}>
        <Docs.Title>{l.trans({ en: "3. Slices And CRUD", ko: "3. Slice와 CRUD" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Generated CRUD publishes from the slice() guards map — get, cru, and the per-verb entries. A named slice does not inherit that map: write its own guards, or it is refused and named in the boot log.",
              ko: "생성된 CRUD는 slice() guards map — get·cru·verb별 항목 — 으로 게시됩니다. 이름 있는 slice는 그 맵을 물려받지 않습니다. 자기 guard를 직접 적으세요. 없으면 거부되고 부팅 로그에 이름이 남습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="task.signal.ts"
          code={`export class TaskSlice extends slice(
  srv.task,
  { guards: { root: Admin, get: SignedIn, cru: SignedIn } },
  (init) => ({
    inTodo: init({ guards: [SignedIn] }).exec(function () {
      return this.taskService.queryByStatuses(["todo"]);
    }),
  }),
) {}`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "Every generated read also gets a resource URI. An insight does not — it is an aggregate with nothing to point at. A custom endpoint keeps its tool and gets no template. The root list is the bare .../list, with no third segment, because that segment is the slice key.",
              ko: "생성된 조회에는 resource URI도 붙습니다. insight는 예외입니다. 집계값이라 가리킬 대상이 없습니다. 커스텀 endpoint는 tool은 갖고 template은 받지 않습니다. 모델 자체의 목록은 세 번째 segment 없이 .../list입니다. 그 자리는 slice key의 몫이기 때문입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title={l.trans({ en: "generated resource uris", ko: "생성되는 resource uri" })}
          code={`akan://task/{taskId}
akan://task/light/{taskId}
akan://task/list{?skip,limit,sort}
akan://task/list/inTodo{?skip,limit,sort}`}
        />
        <Docs.Alert type="info">
          {l.trans({
            en: "The root list's raw query argument is typed Any, so it is left out of the schema. Declare a named filter slice when an agent should narrow a list.",
            ko: "루트 목록의 원본 query 인자는 Any라 schema에서 빠집니다. agent가 목록을 좁히게 하려면 이름 있는 filter slice를 선언하세요.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="prompt" title={l.trans({ en: "4. Write A Prompt", ko: "4. Prompt 작성하기" })}>
        <Docs.Title>{l.trans({ en: "4. Write A Prompt", ko: "4. Prompt 작성하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A prompt is invoked by the user — a client renders it as a slash command. exec returns PromptMessage[], or a bare string that is wrapped into one user message. It takes .param() and .search() only: prompts/get sends a flat string map.",
              ko: "prompt는 사용자가 호출합니다. client는 slash command로 렌더링합니다. exec은 PromptMessage[]를 반환하며, 문자열 하나면 user message 하나로 감쌉니다. prompts/get이 flat string map을 보내므로 .param()과 .search()만 받습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="task.signal.ts"
          code={`reviewTask: prompt({ guards: [SignedIn] })
  .param("taskId", ID)
  .search("tone", String)
  .exec(async function (taskId, tone) {
    const task = await this.taskService.getLightTask(taskId);
    return [
      Msg.user(\`Review this task in a \${tone ?? "neutral"} tone and suggest next steps.\`),
      Msg.resource(\`akan://task/\${taskId}\`, task, { model: cnst.LightTask }),
    ];
  }),`}
        />
        <Docs.Description>
          <DocsList>
            <li>
              {l.trans({
                en: "Msg.user and Msg.assistant carry text. Msg.link points without embedding. Msg.resource embeds a value. Msg.image / Msg.imageOf / Msg.audio inline bytes.",
                ko: "Msg.user와 Msg.assistant는 텍스트를, Msg.link는 임베드 없이 참조를, Msg.resource는 값 자체를 싣고, Msg.image / Msg.imageOf / Msg.audio는 바이트를 인라인합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Name the model on an embedded value so hidden and secret fields are stripped: Msg.resource(uri, task, { model: cnst.LightTask }), or Msg.mask for one piece of an assembly. An undeclared value whose secret fields are populated is refused.",
                ko: "값을 실을 때 model을 적으면 hidden·secret field가 벗겨집니다. Msg.resource(uri, task, { model: cnst.LightTask }), 조립된 payload의 한 조각이면 Msg.mask입니다. model을 적지 않은 값에 secret field가 채워져 있으면 거부됩니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Give the instruction a high priority (0..1) and attachments a low one — a client with a full window otherwise drops blocks by position.",
                ko: "지시에는 높은 priority(0..1)를, 첨부에는 낮은 값을 주세요. 없으면 컨텍스트가 꽉 찬 client가 위치 순으로 블록을 버립니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "A prompt is also a plain HTTP GET whether or not MCP is on, so a web UI can preview it. Guard it like any other read.",
                ko: "prompt는 MCP를 켰든 아니든 평범한 HTTP GET으로도 올라갑니다. 웹 UI 미리보기용이며, 다른 조회와 똑같이 가드하세요.",
              })}
            </li>
          </DocsList>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="progress" title={l.trans({ en: "5. Report Progress", ko: "5. 진행률 보고하기" })}>
        <Docs.Title>{l.trans({ en: "5. Report Progress", ko: "5. 진행률 보고하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Report from wherever the work happens. Outside a streamed call it is a no-op, so the same service runs unchanged over HTTP, a websocket, and in tests.",
              ko: "실제 작업이 일어나는 곳에서 바로 보고하세요. streaming이 아닐 때는 no-op이라, 같은 service가 HTTP·websocket·test에서 그대로 동작합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="task.service.ts"
          code={`async importTasks(rows: cnst.TaskInput[]) {
  for (const [idx, row] of rows.entries()) {
    McpProgress.report(idx + 1, { total: rows.length, message: \`importing \${row.title}\` });
    await this.createTask(row);
  }
  return rows.length;
}`}
        />
        <Docs.Description>
          <DocsList>
            <li>
              {l.trans({
                en: "The client must send both Accept: text/event-stream and a progressToken. The server switches only after the first report.",
                ko: "client는 Accept: text/event-stream과 progressToken을 모두 보내야 합니다. server는 첫 보고가 온 뒤에야 전환합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Cancellation is the client closing the stream. Watch McpProgress.signal; the framework cannot stop an exec already in flight.",
                ko: "취소는 client가 스트림을 닫는 것입니다. McpProgress.signal을 보세요. 이미 실행 중인 exec을 프레임워크가 멈출 수는 없습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "McpProgress.streaming is true while anyone is reading, so an expensive message can be skipped.",
                ko: "누군가 읽고 있으면 McpProgress.streaming이 true입니다. 만들기 비싼 메시지는 그때만 조립하면 됩니다.",
              })}
            </li>
          </DocsList>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="auth" title={l.trans({ en: "Authorization", ko: "인가" })}>
        <Docs.Title>{l.trans({ en: "Authorization", ko: "인가" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "MCP arrives over HTTP and runs the ordinary pipeline, so guards, Self, and account middleware behave as they do for a browser call.",
              ko: "MCP는 HTTP로 도착해 평소 파이프라인을 탑니다. guard, Self, account middleware는 브라우저 호출과 같습니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: 'scope: "account"',
                desc: l.trans({
                  en: "The verdict reads the caller only. Evaluated when filtering a listing, so an anonymous agent is not offered admin tools it can only fail at.",
                  ko: "판정이 caller에만 의존합니다. 목록 필터링에 평가되므로, 익명 agent에게 실패만 할 admin tool을 내밀지 않습니다.",
                }),
              },
              {
                title: 'scope: "resource"',
                desc: l.trans({
                  en: "Needs the call's arguments, so it is never evaluated for a listing. The entry stays visible and is stopped at call time.",
                  ko: "호출 인자가 필요해서 목록에서는 평가되지 않습니다. 항목은 목록에 남고 호출 단계에서 막힙니다.",
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
              en: "Every guard must declare static scope with no default. SignedIn / Admin are account; every Can<Verb><Model> is resource. The listing is a UX filter — the call still runs every guard.",
              ko: "모든 guard는 기본값 없이 static scope를 선언합니다. SignedIn / Admin은 account, 모든 Can<Verb><Model>은 resource입니다. 목록은 UX 필터일 뿐, 호출은 여전히 모든 guard를 거칩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title={l.trans({ en: "OAuth resource server, by env", ko: "OAuth 리소스 서버, env로" })}
          code={`AKAN_MCP_AUTH_SERVERS=https://auth.example.com
AKAN_MCP_SCOPES=akan.read,akan.write
AKAN_MCP_RESOURCE=https://api.example.com/mcp`}
        />
        <Docs.Description>
          <DocsList>
            <li>
              {l.trans({
                en: "Unauthenticated calls get a WWW-Authenticate challenge, so a client authenticates instead of concluding the tool does not exist.",
                ko: "인증 없는 호출에는 WWW-Authenticate 챌린지가 나가므로, client는 tool이 없다고 결론짓지 않고 인증합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "insufficient_scope is enforced only once AKAN_MCP_SCOPES is set. First-party Akan tokens carry no scope claim.",
                ko: "insufficient_scope는 AKAN_MCP_SCOPES를 설정했을 때만 강제됩니다. 자체 발급 Akan 토큰에는 scope claim이 없습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "A token with no aud is refused once AKAN_MCP_AUTH_SERVERS names an issuer, and accepted while none is named.",
                ko: "aud가 없는 토큰은 AKAN_MCP_AUTH_SERVERS로 발급자를 지정한 순간부터 거부하고, 지정하지 않은 동안은 통과합니다.",
              })}
            </li>
          </DocsList>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <DocsList>
            <li>
              {l.trans({
                en: "A missing tool is explained in the boot log: MCP catalogue: tools=… then one verbose line per refusal. Turn verbose on, because there is no opt-in to notice — that log is the only place the answer exists.",
                ko: "기대한 tool이 없으면 부팅 로그를 보세요. MCP catalogue: tools=… 아래로 거부마다 verbose 한 줄입니다. verbose를 켜 두세요. 빠진 opt-in 같은 단서가 없어서 답이 있는 곳은 그 로그뿐입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Write the model's .desc(). Generated CRUD tools append it to Get X, and the root list borrows the .of() label — those entries have no other text.",
                ko: "model의 .desc()를 쓰세요. 생성된 CRUD tool은 Get X 뒤에 그것을 붙이고, 루트 목록은 .of() 라벨을 빌립니다. 그 항목들이 실을 수 있는 문구는 그것뿐입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "An Any or Upload return is refused. A required Any argument is refused too — leave optional Any out of the schema, and send nothing under that name.",
                ko: "Any나 Upload 반환은 거부됩니다. 필수 Any 인자도 거부됩니다. optional Any는 schema에서 빠지고, 그 이름으로 값을 보내면 거부됩니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "A prompt also refuses a list argument and any Any argument: its arguments are one string per name, with no schema beside them.",
                ko: "prompt는 배열 인자와 Any 인자도 거부합니다. 인자가 이름마다 문자열 하나이고 옆에 schema가 없기 때문입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "An unknown argument is reported as the caller's mistake. A missing document is too. Only a genuine failure answers that the server failed.",
                ko: "선언되지 않은 인자와 없는 document는 호출자 오류로 돌아옵니다. 실제 장애만 서버 실패로 응답합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "A guard's refusal reads You are not permitted to perform this action. — never the guard's name.",
                ko: "가드 거부는 You are not permitted to perform this action. 으로 나갑니다. 가드 이름은 실리지 않습니다.",
              })}
            </li>
          </DocsList>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
}
