import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const symbols = [
    {
      name: "Public / None / guard",
      desc: l.trans({
        en: 'Guard classes decide whether a request can pass before endpoint or slice execution. `Public` always passes, `None` blocks, and `guard(name)` creates a named guard base class for app-specific rules. Guards run on every transport, so read the caller with `context.get("account")` instead of branching on http/websocket. Slice `guards` cover only the generated query/mutation endpoints — declare `guards` on each `pubsub`/`message` endpoint to protect a socket. Every guard declares `static scope: GuardScope`, and it is required: `"account"` when the verdict depends only on the caller, `"resource"` when it needs the arguments of the call. Only `account` guards are evaluated when filtering an MCP catalogue, and since exposure follows the guards, a wrong mark would list an endpoint to callers who cannot use it.',
        ko: 'Guard class는 endpoint 또는 slice 실행 전에 request가 통과할 수 있는지 결정합니다. `Public`은 항상 통과하고, `None`은 막으며, `guard(name)`은 app-specific rule을 위한 named guard base class를 생성합니다. Guard는 모든 transport에서 실행되므로 http/websocket을 분기하지 말고 `context.get("account")`로 caller를 읽으세요. Slice `guards`는 생성된 query/mutation endpoint만 덮으므로, socket을 보호하려면 각 `pubsub`/`message` endpoint에 `guards`를 선언해야 합니다. 모든 guard는 `static scope: GuardScope`를 선언하며 필수입니다. 판정이 caller에만 의존하면 `"account"`, 호출 인자가 필요하면 `"resource"`입니다. MCP 카탈로그 필터링에는 `account` guard만 평가되고, 노출이 guard를 따르므로 잘못 표기하면 쓸 수 없는 caller에게도 endpoint가 목록에 나갑니다.',
      }),
      code: `import { guard, Public } from "akanjs/signal";

export class AdminOnly extends guard("AdminOnly") {
  static override scope = "account" as const;
  override canPass(context) {
    return context.get("account")?.role === "admin";
  }
}

export class RoomEndpoint extends endpoint(roomSrv, ({ pubsub }) => ({
  feed: pubsub(cnst.Message, { guards: [AdminOnly] })
    .room("roomId", ID)
    .exec(() => undefined),
})) {}`,
    },
    {
      name: "prompt / Msg",
      desc: l.trans({
        en: "`prompt()` is the fifth endpoint kind and the one a *user* invokes by name — an MCP client renders it as a slash command — rather than one the model chooses. `exec` returns `PromptMessage[]`, or a bare string that is wrapped into a single user message. Build messages with `Msg.user`, `Msg.assistant`, `Msg.link`, `Msg.resource`, `Msg.image`, `Msg.audio`, and `Msg.imageOf`. A prompt takes `.param()` and `.search()` only, because `prompts/get` carries a flat string map. An embedded payload is masked by the model you name — `Msg.resource(uri, task, { model: cnst.Task })`, or `Msg.mask(cnst.Task, task)` for one piece of an assembly — and an undeclared value whose secret fields are populated is refused rather than sent.",
        ko: "`prompt()`는 다섯 번째 endpoint 종류로, model이 고르는 것이 아니라 *사용자*가 이름으로 호출합니다 — MCP client는 slash command로 렌더링합니다. `exec`는 `PromptMessage[]`를 반환하며, 문자열 하나를 반환하면 user message 하나로 감쌉니다. message는 `Msg.user`, `Msg.assistant`, `Msg.link`, `Msg.resource`, `Msg.image`, `Msg.audio`, `Msg.imageOf`로 만듭니다. `prompts/get`이 flat string map을 실어 보내므로 prompt는 `.param()`과 `.search()`만 받습니다. 실어 보내는 payload는 이름을 적은 model 기준으로 마스킹됩니다 — `Msg.resource(uri, task, { model: cnst.Task })`, 조립된 payload의 한 조각이라면 `Msg.mask(cnst.Task, task)` — 그리고 model을 적지 않은 값에 secret field가 채워져 있으면 보내지 않고 거부합니다.",
      }),
      code: `import { SignedIn } from "@apps/myapp/srvkit"; // guards are yours, not the framework's
import { endpoint, Msg } from "akanjs/signal";

export class TaskEndpoint extends endpoint(srv.task, ({ prompt }) => ({
  reviewTask: prompt({ guards: [SignedIn] }) // guards decide MCP exposure; there is no opt-in to write
    .param("taskId", ID)
    .search("tone", String)
    .exec(async function (taskId, tone) {
      const task = await this.taskService.getLightTask(taskId);
      return [
        Msg.user(\`Review this task in a \${tone ?? "neutral"} tone.\`),
        Msg.resource(\`akan://task/\${taskId}\`, task, { model: cnst.LightTask }),
      ];
    }),
})) {}`,
    },
    {
      name: "McpProgress",
      desc: l.trans({
        en: "Reports progress for a long-running MCP tool call. Reached through `AsyncLocalStorage`, so an endpoint reports from wherever the work happens — a service, an adapter, a loop several frames down — without threading a channel through every signature. Outside a streamed call it is a no-op, so the same code runs unchanged over plain HTTP, a websocket, and in tests. The server switches to an SSE response only once the first report arrives, and only when the client asked with both `Accept: text/event-stream` and a `_meta.progressToken`.",
        ko: "장기 실행 MCP tool call의 진행률을 보고합니다. `AsyncLocalStorage`로 접근하므로 service, adapter, 몇 프레임 아래 loop 등 실제 작업이 일어나는 곳에서 바로 보고할 수 있고, 그 사이 모든 signature에 channel을 달 필요가 없습니다. streaming이 아닐 때는 no-op이라 같은 code가 일반 HTTP, websocket, test에서 그대로 동작합니다. server는 첫 보고가 도착한 뒤에야 SSE 응답으로 전환하며, client가 `Accept: text/event-stream`과 `_meta.progressToken`을 모두 보냈을 때만 해당합니다.",
      }),
      code: `import { McpProgress } from "akanjs/signal";

export class ImportService extends serve(db.task, () => ({})) {
  async importTasks(rows: TaskInput[]) {
    for (const [idx, row] of rows.entries()) {
      McpProgress.report(idx + 1, { total: rows.length, message: \`importing \${row.title}\` });
      await this.createTask(row);
    }
    return rows.length;
  }
}`,
    },
    {
      name: "Req / Res / Ws",
      desc: l.trans({
        en: "Internal argument providers for advanced endpoints. `Req` gives the Bun request, `Res` gives the mutable response context, and `Ws` gives websocket subscription state and event hooks.",
        ko: "advanced endpoint를 위한 internal argument provider입니다. `Req`는 Bun request, `Res`는 mutable response context, `Ws`는 websocket subscription state와 event hook을 제공합니다.",
      }),
      code: `import { endpoint, Req, Res, Ws } from "akanjs/signal";

export class WallpadEndpoint extends endpoint(wallpadSrv, ({ mutation, message }) => ({
  proxy: mutation(String).internal("req", Req).internal("res", Res).exec((req, res) => "ok"),
  join: message(Boolean).internal("ws", Ws).exec((ws) => ws.subscribe),
})) {}`,
    },
    {
      name: "middleware / Middleware",
      desc: l.trans({
        en: "Middleware wraps endpoint execution. Built-ins include Logging, Cache, Timeout, and Retry, while custom middleware can read `SignalContext` and decide when to call `next()`.",
        ko: "Middleware는 endpoint execution을 감쌉니다. built-in에는 Logging, Cache, Timeout, Retry가 있고 custom middleware는 `SignalContext`를 읽어 언제 `next()`를 호출할지 결정할 수 있습니다.",
      }),
      code: `import { middleware, type SignalContext } from "akanjs/signal";

export class TraceMiddleware extends middleware("Trace") {
  override async use() {
    return async (context: SignalContext, next) => {
      context.adaptor.logger.info(context.key);
      return next();
    };
  }
}`,
    },
    {
      name: "SignalRegistry",
      desc: l.trans({
        en: "Global registry for database and service signals. App `sig.ts` files register every module signal so serialized fetch metadata, server routes, and runtime signal lookup can be built consistently.",
        ko: "database 및 service signal을 위한 global registry입니다. app `sig.ts` 파일은 serialized fetch metadata, server route, runtime signal lookup을 일관되게 만들기 위해 모든 module signal을 등록합니다.",
      }),
      code: `import { SignalRegistry } from "akanjs/signal";

const userSignal = SignalRegistry.getDatabase("user");
const utilSignal = SignalRegistry.getService("util");`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-signal" title="akanjs/signal">
        <Docs.Title>akanjs/signal</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akanjs/signal` declares the API boundary around services. Import it in `*.signal.ts` files to define endpoints, internal jobs, database slices, guards, middleware, request arguments, and registered server signals.",
              ko: "`akanjs/signal`은 service 주변의 API boundary를 선언합니다. `*.signal.ts`에서 endpoint, internal job, database slice, guard, middleware, request argument, registered server signal을 정의할 때 사용합니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      {symbols.map((symbol) => (
        <Scroll.Slide key={symbol.name} id={symbol.name} title={symbol.name}>
          <Docs.Title>{symbol.name}</Docs.Title>
          <Docs.Description>
            <div>{symbol.desc}</div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title={l.trans({ en: "Usage", ko: "사용 예시" })}
            language="typescript"
            code={symbol.code}
          />
        </Scroll.Slide>
      ))}
      <DocsToc />
    </Scroll>
  );
}
