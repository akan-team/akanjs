import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  const symbols = [
    {
      name: "Public / None / guard",
      desc: l.trans({
        en: 'Guard classes decide whether a request can pass before endpoint or slice execution. `Public` always passes, `None` blocks, and `guard(name)` creates a named guard base class for app-specific rules. Guards run on every transport, so read the caller with `context.get("account")` instead of branching on http/websocket. Slice `guards` cover only the generated query/mutation endpoints — declare `guards` on each `pubsub`/`message` endpoint to protect a socket.',
        ko: 'Guard class는 endpoint 또는 slice 실행 전에 request가 통과할 수 있는지 결정합니다. `Public`은 항상 통과하고, `None`은 막으며, `guard(name)`은 app-specific rule을 위한 named guard base class를 생성합니다. Guard는 모든 transport에서 실행되므로 http/websocket을 분기하지 말고 `context.get("account")`로 caller를 읽으세요. Slice `guards`는 생성된 query/mutation endpoint만 덮으므로, socket을 보호하려면 각 `pubsub`/`message` endpoint에 `guards`를 선언해야 합니다.',
      }),
      code: `import { guard, Public } from "akanjs/signal";

export class AdminOnly extends guard("AdminOnly") {
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
      <div className="divider" />
      {symbols.map((symbol) => (
        <Scroll.Slide key={symbol.name} id={symbol.name} title={symbol.name}>
          <Docs.Title>{symbol.name}</Docs.Title>
          <Docs.Description>
            <div>{symbol.desc}</div>
          </Docs.Description>
          <Code.Snippet title={l.trans({ en: "Usage", ko: "사용 예시" })} language="typescript" code={symbol.code} />
        </Scroll.Slide>
      ))}
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
