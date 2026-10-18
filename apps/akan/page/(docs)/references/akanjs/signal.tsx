import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, type MatrixGroup } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "akanjs/signal | Akan.js" : "akanjs/signal | Akan.js";
    const description =
      lang === "ko"
        ? "가드와 미들웨어, 요청·소켓 인자, signal 레지스트리."
        : "Guards, middleware, request and socket arguments, and the signal registry.";
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
    const orderedList = "my-4 list-decimal space-y-2 pl-5";
    const exportLabel = l.trans({ en: "Export", ko: "export" });

    const exportRows = [
      {
        name: "endpoint",
        desc: l.trans({
          en: "Declares the calls a module exposes: queries, mutations and WebSocket endpoints.",
          ko: "모듈이 공개하는 호출을 선언합니다. 조회, 변경, WebSocket 엔드포인트가 여기에 들어갑니다.",
        }),
      },
      {
        name: "internal",
        desc: l.trans({
          en: "Declares work the server starts itself: schedules, lifecycle hooks, queue jobs, resolved fields.",
          ko: "서버가 스스로 시작하는 작업을 선언합니다. 스케줄, 라이프사이클 훅, 큐 작업, resolve 필드가 여기에 들어갑니다.",
        }),
      },
      {
        name: "slice",
        desc: l.trans({
          en: "Declares the list queries a client store loads, and guards the generated CRUD endpoints.",
          ko: "클라이언트 store가 불러올 목록 쿼리를 선언하고, 자동 생성되는 CRUD 엔드포인트의 가드를 정합니다.",
        }),
      },
      {
        name: ["Public", "None", "guard"],
        desc: l.trans({
          en: "Guards. They run before the handler and decide whether the call may go on.",
          ko: "가드입니다. 핸들러보다 먼저 실행되어 호출을 계속할지 정합니다.",
        }),
      },
      {
        name: ["Req", "Res", "Ip", "Ws"],
        desc: l.trans({
          en: "Internal arguments: handler arguments the server fills in, such as the request.",
          ko: "내부 인자(internal argument)입니다. 요청 객체처럼 호출자가 아니라 서버가 채워 주는 핸들러 인자입니다.",
        }),
      },
      {
        name: ["middleware", "Logging", "Timeout"],
        desc: l.trans({
          en: "Middleware wraps every endpoint call. The two built-ins are registered by default.",
          ko: "미들웨어는 모든 엔드포인트 호출을 감쌉니다. 기본 제공 두 개는 처음부터 등록되어 있습니다.",
        }),
      },
      {
        name: "McpProgress",
        desc: l.trans({
          en: "Reports progress from inside a long MCP tool call.",
          ko: "오래 걸리는 MCP 툴 호출 안에서 진행률을 보고합니다.",
        }),
      },
      {
        name: ["SignalRegistry", "serverSignal"],
        desc: l.trans({
          en: "Look up registered signals, and publish or enqueue from a service.",
          ko: "등록된 signal을 찾고, 서비스에서 발행하거나 큐에 작업을 넣습니다.",
        }),
      },
      {
        name: "SignalContext",
        desc: l.trans({
          en: "The per-call context guards and middleware receive: transport, arguments and caller.",
          ko: "가드와 미들웨어가 받는 호출 단위 context입니다. 전송 방식, 인자, 호출자를 담습니다.",
        }),
      },
    ];

    const transportColumns = [
      { key: "http", label: "HTTP" },
      { key: "ws", label: "WebSocket" },
    ];
    const kindGroups: MatrixGroup[] = [
      {
        label: l.trans({ en: "Request and response", ko: "요청과 응답" }),
        rows: [
          {
            name: "query",
            desc: l.trans({
              en: "Reads, over `GET`. The only kind that may declare `cache`.",
              ko: "`GET`으로 읽습니다. `cache`를 선언할 수 있는 유일한 종류입니다.",
            }),
            marks: { http: true },
          },
          {
            name: "mutation",
            desc: l.trans({
              en: "Writes, over `POST`. The `method` option moves it to `PATCH`, `PUT` or `DELETE`.",
              ko: "`POST`로 씁니다. `method` 옵션으로 `PATCH`, `PUT`, `DELETE`로 바꿀 수 있습니다.",
            }),
            marks: { http: true },
          },
        ],
      },
      {
        label: l.trans({ en: "Realtime", ko: "실시간" }),
        rows: [
          {
            name: "pubsub",
            desc: l.trans({
              en: "The client subscribes to a room, and the server publishes into it.",
              ko: "클라이언트가 room을 구독하고, 서버가 그 room에 발행합니다.",
            }),
            marks: { ws: true },
          },
          {
            name: "message",
            desc: l.trans({
              en: "The client sends one message and gets one answer back.",
              ko: "클라이언트가 메시지 하나를 보내고 응답 하나를 받습니다.",
            }),
            marks: { ws: true },
          },
        ],
      },
    ];

    const relatedLinks = [
      {
        href: "/conventions/module/signal",
        title: l.trans({ en: "The Signal File", ko: "signal 파일" }),
        desc: l.trans({
          en: "How `Internal`, `Slice` and `Endpoint` are laid out in one `*.signal.ts`.",
          ko: "`*.signal.ts` 하나에 `Internal`, `Slice`, `Endpoint`를 배치하는 방법입니다.",
        }),
      },
      {
        href: "/references/akanjs/client#prompt",
        title: l.trans({ en: "MCP Prompts", ko: "MCP 프롬프트" }),
        desc: l.trans({
          en: "Declared on a page with `page().prompt(name, description)`.",
          ko: "페이지에서 `page().prompt(name, description)`로 선언합니다.",
        }),
      },
      {
        href: "/cheatsheet/general/auth#guards",
        title: l.trans({ en: "The Guards That Ship", ko: "기본 제공 가드" }),
        desc: l.trans({
          en: "`Every`, `Admin`, `Person` and the other guards `libs/shared` provides.",
          ko: "`libs/shared`가 제공하는 `Every`, `Admin`, `Person` 같은 가드입니다.",
        }),
      },
      {
        href: "/cheatsheet/interface/mcp#progress",
        title: l.trans({ en: "Report MCP Progress", ko: "MCP 진행률 보고하기" }),
        desc: l.trans({
          en: "The progress stream step by step, from the client's side too.",
          ko: "진행률 스트림을 클라이언트 쪽까지 단계별로 설명합니다.",
        }),
      },
    ];

    const guardRows = [
      {
        name: "Public",
        desc: l.trans({
          en: "Always passes. Use it on slice reads such as `get:`, never as a mutation's only guard.",
          ko: "항상 통과합니다. slice의 `get:` 같은 읽기에 쓰고, mutation의 유일한 가드로는 쓰지 않습니다.",
        }),
      },
      {
        name: "None",
        desc: l.trans({ en: "Always refuses the call.", ko: "호출을 항상 거절합니다." }),
      },
      {
        name: "guard(name)",
        desc: l.trans({
          en: 'A base class with `static name` filled in and `scope` preset to `"account"`.',
          ko: '`static name`이 채워져 있고 `scope`가 `"account"`로 미리 정해진 기반 클래스입니다.',
        }),
      },
      {
        name: "Guard",
        desc: l.trans({
          en: "The interface: `canPass(context)` returns a boolean, or a promise of one.",
          ko: "인터페이스입니다. `canPass(context)`가 boolean이나 boolean의 Promise를 반환합니다.",
        }),
      },
      {
        name: "GuardScope",
        desc: l.trans({
          en: '`"account"` or `"resource"`: what the guard needs to reach a verdict.',
          ko: '`"account"` 또는 `"resource"`입니다. 가드가 판정하는 데 무엇이 필요한지 나타냅니다.',
        }),
      },
    ];

    const scopeColumns = [
      { key: "args", label: l.trans({ en: "Reads arguments", ko: "인자 읽음" }) },
      { key: "listing", label: l.trans({ en: "Checked for MCP listing", ko: "MCP 목록에서 평가" }) },
    ];
    const scopeGroups: MatrixGroup[] = [
      {
        label: "GuardScope",
        rows: [
          {
            name: '"account"',
            desc: l.trans({
              en: 'Reads only the caller, through `context.get("account")`.',
              ko: '호출자만 읽습니다. `context.get("account")`를 씁니다.',
            }),
            marks: { listing: true },
          },
          {
            name: '"resource"',
            desc: l.trans({
              en: "Reads the call's arguments via `context.getArg(name)`, so it is judged only at call time.",
              ko: "`context.getArg(name)`로 호출 인자를 읽으므로, 호출할 때에만 판정합니다.",
            }),
            marks: { args: true },
          },
        ],
      },
    ];

    const progressItems = [
      {
        key: "McpProgress.report(progress, option?)",
        type: "(progress: number, option?: McpProgressOption) => void",
        desc: l.trans({
          en: "Sends one progress notification for the call running on this stack.",
          ko: "지금 실행 중인 호출의 진행률 알림을 하나 보냅니다.",
        }),
      },
      {
        key: "option.total",
        type: "number",
        desc: l.trans({
          en: "Optional. The denominator the client renders; omit it when the amount of work is unknown.",
          ko: "선택입니다. 클라이언트가 표시할 분모이며, 전체 작업량을 모르면 생략합니다.",
        }),
      },
      {
        key: "option.message",
        type: "string",
        desc: l.trans({
          en: "Optional. One short line on the current step; the user reads it, so write prose.",
          ko: "선택입니다. 현재 단계를 설명하는 짧은 한 줄이며, 사용자가 읽으므로 문장으로 씁니다.",
        }),
      },
      {
        key: "McpProgress.streaming",
        type: "boolean",
        desc: l.trans({
          en: "`true` only while a client is streaming, so a costly message can be skipped.",
          ko: "클라이언트가 스트리밍 중일 때만 `true`입니다. 만들기 비싼 메시지를 건너뛸 때 씁니다.",
        }),
      },
    ];

    const internalArgColumns = [
      { key: "http", label: "HTTP", caption: "query · mutation" },
      { key: "ws", label: "WebSocket", caption: "pubsub · message" },
    ];
    const internalArgGroups: MatrixGroup[] = [
      {
        label: l.trans({ en: "The request", ko: "요청" }),
        rows: [
          {
            name: "Req",
            desc: l.trans({
              en: "The current Bun request, `Bun.BunRequest`.",
              ko: "현재 Bun 요청(`Bun.BunRequest`)입니다.",
            }),
            marks: { http: true },
          },
          {
            name: "Res",
            desc: l.trans({
              en: "The `Response` class, for building a reply such as `res.json(value)`.",
              ko: "응답을 만드는 `Response` 클래스입니다. `res.json(value)`처럼 씁니다.",
            }),
            marks: { http: true },
          },
        ],
      },
      {
        label: l.trans({ en: "The caller", ko: "호출자" }),
        rows: [
          {
            name: "Ip",
            desc: l.trans({
              en: "The caller's IP as the nearest proxy recorded it, or `null`.",
              ko: "가장 가까운 프록시가 기록한 호출자 IP입니다. 알 수 없으면 `null`입니다.",
            }),
            marks: { http: true, ws: true },
          },
        ],
      },
      {
        label: l.trans({ en: "The connection", ko: "연결" }),
        rows: [
          {
            name: "Ws",
            desc: l.trans({
              en: "`ws`, `socketId`, `subscribe`, and the `on` / `off` cleanup hooks.",
              ko: "`ws`, `socketId`, `subscribe`, 그리고 정리용 `on` / `off` 훅입니다.",
            }),
            marks: { ws: true },
          },
        ],
      },
    ];

    const builtInColumns = [
      { key: "name", label: l.trans({ en: "Middleware", ko: "미들웨어" }) },
      { key: "when", label: l.trans({ en: "Acts when", ko: "동작 조건" }) },
      { key: "does", label: l.trans({ en: "What it does", ko: "하는 일" }) },
    ];
    const builtInRows = [
      {
        name: "`Logging`",
        when: l.trans({ en: "Always.", ko: "항상 동작합니다." }),
        does: l.trans({
          en: "Writes debug lines around the call, and an error line when it fails.",
          ko: "호출 앞뒤로 debug 로그를 남기고, 실패하면 error 로그를 남깁니다.",
        }),
      },
      {
        name: "`Timeout`",
        when: l.trans({
          en: "The endpoint declares `timeout` in ms.",
          ko: "엔드포인트가 `timeout`(ms)을 선언했을 때.",
        }),
        does: l.trans({
          en: "Rejects with `base.error.gatewayTimeout` (504) once the time is spent.",
          ko: "시간이 다 되면 `base.error.gatewayTimeout`(504)으로 거절합니다.",
        }),
      },
    ];

    const registerRows = [
      {
        name: "lib/option.ts",
        desc: l.trans({
          en: "Every endpoint the server runs, after the two defaults.",
          ko: "서버가 실행하는 모든 엔드포인트에 적용되며, 기본 두 개 다음에 실행됩니다.",
        }),
        example: "option.applyMiddleware(SlowCallMiddleware);",
      },
      {
        name: "middlewares",
        desc: l.trans({
          en: "The endpoint option. Applies to that endpoint only, inside every global middleware.",
          ko: "엔드포인트 옵션입니다. 그 엔드포인트에만 적용되며, 전역 미들웨어보다 안쪽에서 실행됩니다.",
        }),
        example: "mutation(Boolean, { guards: [Admin], middlewares: [SlowCallMiddleware] })",
      },
    ];

    const registryRows = [
      {
        name: "getDatabase(refName)",
        desc: l.trans({
          en: "A database module's `internal`, `endpoint`, `slice`, `server` and `serializedSignal`.",
          ko: "데이터베이스 모듈의 `internal`, `endpoint`, `slice`, `server`, `serializedSignal`을 돌려줍니다.",
        }),
      },
      {
        name: "getService(refName)",
        desc: l.trans({
          en: "A service module's `internal`, `endpoint`, `server` and `serializedSignal`.",
          ko: "서비스 모듈의 `internal`, `endpoint`, `server`, `serializedSignal`을 돌려줍니다.",
        }),
      },
    ];

    const serverSignalRows = [
      {
        name: "<pubsubKey>(...roomArgs, data)",
        desc: l.trans({
          en: "One per `pubsub` endpoint. Publishes `data` to the room the arguments name.",
          ko: "`pubsub` 엔드포인트마다 하나씩 생깁니다. 인자가 가리키는 room에 `data`를 발행합니다.",
        }),
      },
      {
        name: "<processKey>(...args, jobOptions?)",
        desc: l.trans({
          en: "One per `process` internal. Enqueues a job and returns its `AkanJob`.",
          ko: "`process` internal마다 하나씩 생깁니다. 큐에 작업을 넣고 `AkanJob`을 반환합니다.",
        }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="akanjs-signal" title="akanjs/signal">
          <Docs.Title>akanjs/signal</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "`akanjs/signal` declares the API boundary around a service: what may be called, by whom, over which transport. You import it in `*.signal.ts` files and in the `srvkit/` files that hold guards and middleware.",
                ko: "`akanjs/signal`은 서비스를 둘러싼 API 경계를 선언합니다. 무엇을, 누가, 어떤 전송 방식으로 호출할 수 있는지 정합니다. `*.signal.ts` 파일과, 가드·미들웨어를 두는 `srvkit/` 파일에서 import합니다.",
              })}
            </div>
            <Docs.SubSubTitle>{l.trans({ en: "What It Exports", ko: "주요 export" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={exportLabel} items={exportRows} />
            <Docs.SubSubTitle>{l.trans({ en: "Four Endpoint Kinds", ko: "엔드포인트 네 종류" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "The `endpoint` builder hands you four kinds, and each kind fixes its transport:",
                ko: "`endpoint` 빌더는 네 종류를 제공하며, 종류마다 전송 방식이 정해져 있습니다:",
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "Kind", ko: "종류" })}
              columns={transportColumns}
              groups={kindGroups}
              markLabel={l.trans({ en: "travels over it", ko: "이 방식으로 전송" })}
              emptyLabel={l.trans({ en: "does not", ko: "해당 없음" })}
            />
            <div>
              {l.trans({
                en: "An MCP prompt is not an endpoint kind. It is declared on a page with `page().prompt(name, description)`.",
                ko: "MCP 프롬프트는 엔드포인트 종류가 아닙니다. 페이지에서 `page().prompt(name, description)`로 선언합니다.",
              })}
            </div>
            <Docs.LinkGrid items={relatedLinks} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="Public-None-guard" title="Public / None / guard">
          <Docs.Title>Public / None / guard</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A guard decides whether a call may run, before its handler does. Every custom endpoint names its own `guards` array, and every guard in it must pass.",
                ko: "가드는 핸들러보다 먼저 실행되어 호출을 통과시킬지 정합니다. 직접 만든 엔드포인트는 모두 자기 `guards` 배열을 선언하고, 그 안의 가드를 전부 통과해야 합니다.",
              })}
            </div>
            <Docs.IntroTable type={exportLabel} items={guardRows} />
            <Docs.SubSubTitle>{l.trans({ en: "Account Or Resource", ko: "account와 resource" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "Every guard carries a `static scope`, which says whether the verdict needs the call's arguments:",
                ko: "모든 가드에는 `static scope`가 있으며, 판정에 호출 인자가 필요한지를 나타냅니다:",
              })}
            </div>
            <Docs.Matrix
              type="scope"
              columns={scopeColumns}
              groups={scopeGroups}
              markLabel={l.trans({ en: "yes", ko: "예" })}
              emptyLabel={l.trans({ en: "no", ko: "아니요" })}
            />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Role checks are <code>"account"</code>.
                      </strong>{" "}
                      In <code>libs/shared</code>, <code>Every</code>, <code>Admin</code> and <code>Person</code> are{" "}
                      <code>"account"</code>; <code>Owner</code>, <code>SelfOrAdmin</code> and any{" "}
                      <code>{"Can<Verb><Model>"}</code> guard are <code>"resource"</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        역할 검사는 <code>"account"</code>입니다.
                      </strong>{" "}
                      <code>libs/shared</code>의 <code>Every</code>, <code>Admin</code>, <code>Person</code>은{" "}
                      <code>"account"</code>이고, <code>Owner</code>, <code>SelfOrAdmin</code>, 그리고{" "}
                      <code>{"Can<Verb><Model>"}</code> 형태의 가드는 <code>"resource"</code>입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        With <code>implements Guard</code>, declare it yourself.
                      </strong>{" "}
                      <code>guard(name)</code> presets <code>"account"</code>, so a guard built on it that reads
                      arguments overrides it with <code>"resource"</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>implements Guard</code>로 만들면 직접 선언합니다.
                      </strong>{" "}
                      <code>guard(name)</code>은 <code>"account"</code>가 기본값이므로, 이를 상속해 인자를 읽는 가드는{" "}
                      <code>"resource"</code>로 덮어씁니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Writing A Guard", ko: "가드 작성하기" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "Guards live in `srvkit/guards.ts`, one class each:",
                ko: "가드는 `srvkit/guards.ts`에 가드마다 클래스 하나로 둡니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/srvkit/guards.ts"
            language="typescript"
            code={`import { type Guard, type GuardScope, guard, type SignalContext } from "akanjs/signal";

export class AdminOnly implements Guard {
  static name = "AdminOnly";
  static scope: GuardScope = "account";
  canPass(context: SignalContext) {
    const account = context.get<{ me?: { roles: string[] } }>("account");
    return !!account?.me?.roles.includes("admin");
  }
}

export class SelfOnly extends guard("SelfOnly") {
  static override scope: GuardScope = "resource";
  override canPass(context: SignalContext) {
    const userId = context.getArg<string>("userId");
    const account = context.get<{ self?: { id: string } }>("account");
    return !!userId && account?.self?.id === userId;
  }
}`}
          />
          <Docs.Description>
            <div>
              {l.trans({
                en: "Then name them on each endpoint. A `pubsub` room is not covered by slice guards, so it declares its own:",
                ko: "그다음 엔드포인트마다 가드를 적습니다. `pubsub` room은 slice 가드가 덮지 않으므로 직접 선언합니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/notice/notice.signal.ts"
            language="typescript"
            code={`import { AdminOnly, SelfOnly } from "@apps/koyo/srvkit";
import { ID } from "akanjs/base";
import { endpoint } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class NoticeEndpoint extends endpoint(srv.notice, ({ mutation, pubsub }) => ({
  broadcastNotice: mutation(Boolean, { guards: [AdminOnly] })
    .body("text", String)
    .exec(async function (text) {
      return await this.noticeService.broadcast(text);
    }),
  noticeAdded: pubsub(cnst.Notice, { guards: [SelfOnly] })
    .room("userId", ID)
    .exec(() => undefined),
})) {}`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Same guard, every transport.</strong> Guards run on HTTP and WebSocket calls alike, so
                      read the caller with <code>context.get("account")</code> instead of branching on the transport.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>전송 방식과 상관없이 같은 가드입니다.</strong> 가드는 HTTP 호출과 WebSocket 호출에서
                      똑같이 실행됩니다. 전송 방식으로 분기하지 말고 <code>context.get("account")</code>로 호출자를
                      읽으세요.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>In order, and the first refusal wins.</strong> Guards run in the order declared, and the
                      first one that refuses stops the call.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>선언한 순서대로, 처음 거절에서 멈춥니다.</strong> 가드는 적은 순서대로 실행되고, 처음
                      거절한 가드에서 호출이 멈춥니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Slice guards stop at CRUD.</strong> A slice's <code>guards</code> cover only its generated
                      query and mutation endpoints; each <code>pubsub</code> and <code>message</code> declares its own.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>slice 가드는 CRUD까지만 덮습니다.</strong> slice의 <code>guards</code>는 자동 생성된
                      query와 mutation 엔드포인트에만 적용됩니다. <code>pubsub</code>와 <code>message</code>는 각자
                      선언합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Keep <code>static name</code>.
                      </strong>{" "}
                      fetch serializes guard names, and the API explorer filters on them.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>static name</code>을 지우지 마세요.
                      </strong>{" "}
                      fetch가 가드 이름을 직렬화하고, API 탐색기가 그 이름으로 필터링합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>A wrong scope misleads the MCP catalogue.</strong> Exposure follows the guards, so a
                    caller-only guard marked <code>"resource"</code> lists the endpoint to callers who cannot use it,
                    and an argument-reading guard marked <code>"account"</code> hides it from everyone.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>scope를 잘못 표기하면 MCP 목록이 틀어집니다.</strong> 노출 여부는 가드를 따르므로, 호출자만
                    읽는 가드를 <code>"resource"</code>로 표기하면 쓸 수 없는 호출자에게도 엔드포인트가 보이고, 인자를
                    읽는 가드를 <code>"account"</code>로 표기하면 모두에게서 숨겨집니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="McpProgress" title="McpProgress">
          <Docs.Title>McpProgress</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "`McpProgress` reports how far a long MCP tool call has got, so the agent's client can show it. Call it wherever the work happens; nothing has to be passed down.",
                ko: "`McpProgress`는 오래 걸리는 MCP 툴 호출이 어디까지 진행됐는지 보고해서, 에이전트 쪽 클라이언트가 보여 줄 수 있게 합니다. 실제 작업이 일어나는 곳에서 바로 호출하면 되고, 인자로 넘겨줄 것은 없습니다.",
              })}
            </div>
            <Docs.OptionTable items={progressItems} />
            <div>
              {l.trans({
                en: "A service that imports rows reports after each one:",
                ko: "행을 가져오는 서비스가 한 행마다 진행률을 보고합니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/task/task.service.ts"
            language="typescript"
            code={`import { McpProgress } from "akanjs/signal";
import { serve } from "akanjs/service";

import type * as cnst from "../cnst";
import * as db from "../db";

export class TaskService extends serve(db.task, () => ({})) {
  async importTasks(rows: cnst.TaskInput[]) {
    for (const [idx, row] of rows.entries()) {
      McpProgress.report(idx + 1, {
        total: rows.length,
        message: \`Importing \${row.title}\`,
      });
      await this.createTask(row);
    }
    return rows.length;
  }
}`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A no-op outside a stream.</strong> Over plain HTTP, a WebSocket or in a test,{" "}
                      <code>report</code> does nothing, so the same code runs unchanged.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>스트림이 아니면 아무것도 하지 않습니다.</strong> 일반 HTTP, WebSocket, 테스트에서는{" "}
                      <code>report</code>가 무시되므로 같은 코드가 그대로 동작합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Reachable from any depth.</strong> It rides <code>AsyncLocalStorage</code>, so a service,
                      an adapter or a loop several frames down reports without a channel parameter.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>어느 깊이에서든 부를 수 있습니다.</strong> <code>AsyncLocalStorage</code>를 쓰기 때문에
                      서비스, 어댑터, 몇 단계 아래의 반복문에서도 채널 인자 없이 보고합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The client opts in.</strong> A call streams only when the request sent both{" "}
                      <code>Accept: text/event-stream</code> and a <code>_meta.progressToken</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>클라이언트가 요청해야 스트리밍합니다.</strong> 요청에{" "}
                      <code>Accept: text/event-stream</code>과 <code>_meta.progressToken</code>이 모두 있어야 합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The response switches on the first report.</strong> Only then does the server answer with
                      SSE; a call that never reports gets an ordinary response.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>첫 보고가 도착해야 응답 방식이 바뀝니다.</strong> 그때 서버가 SSE로 응답하고, 한 번도
                      보고하지 않은 호출은 일반 응답을 받습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="Req-Res-Ws" title="Req / Res / Ip / Ws">
          <Docs.Title>Req / Res / Ip / Ws</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Internal arguments are handler arguments the server fills in, not the caller. Declare one with `.with(X)`, and the handler receives it after the declared arguments.",
                ko: "내부 인자(internal argument)는 호출자가 아니라 서버가 채워 주는 핸들러 인자입니다. `.with(X)`로 선언하면 핸들러는 선언된 인자 다음 순서로 이 값을 받습니다.",
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "Argument", ko: "인자" })}
              columns={internalArgColumns}
              groups={internalArgGroups}
              markLabel={l.trans({ en: "available", ko: "사용 가능" })}
              emptyLabel={l.trans({ en: "not available", ko: "사용 불가" })}
            />
            <div>
              {l.trans({
                en: "Libraries add their own, such as `Self`, `Me` and `Account` from `@libs/shared/srvkit`. Take the caller from those, never from an id the client sends.",
                ko: "라이브러리도 자기 인자를 제공합니다. 예를 들어 `@libs/shared/srvkit`에는 `Self`, `Me`, `Account`가 있습니다. 호출자는 이 인자로 받고, 클라이언트가 보낸 id는 믿지 마세요.",
              })}
            </div>
            <div>
              {l.trans({
                en: "A mutation that reads the raw request body and the caller's IP, and a message handler that cleans up when the socket closes:",
                ko: "원본 요청 본문과 호출자 IP를 읽는 mutation, 그리고 소켓이 닫힐 때 정리하는 메시지 핸들러입니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/_wallpad/wallpad.signal.ts"
            language="typescript"
            code={`import { Every } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint, Ip, Req, Ws } from "akanjs/signal";

import * as srv from "../srv";

export class WallpadEndpoint extends endpoint(srv.wallpad, ({ mutation, message }) => ({
  reportWallpadEvent: mutation(Boolean, { guards: [Every] })
    .with(Req)
    .with(Ip, { nullable: true })
    .exec(async function (req, ip) {
      return await this.wallpadService.reportEvent(await req.json(), ip);
    }),
  watchWallpad: message(Boolean, { guards: [Every] })
    .msg("wallpadId", ID)
    .with(Ws)
    .exec(async function (wallpadId, { socketId, on }) {
      on("disconnect", async () => {
        await this.wallpadService.unwatch(wallpadId, socketId);
      });
      return await this.wallpadService.watch(wallpadId, socketId);
    }),
})) {}`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Required unless nullable.</strong> A required internal argument that comes back{" "}
                      <code>null</code> refuses the call with 401. Pass <code>{"{ nullable: true }"}</code> when{" "}
                      <code>null</code> is a valid answer, as it is for <code>Ip</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>nullable이 아니면 필수입니다.</strong> 필수 내부 인자가 <code>null</code>이면 호출은 401로
                      거절됩니다. <code>Ip</code>처럼 <code>null</code>도 정상 값이면{" "}
                      <code>{"{ nullable: true }"}</code>를 넘기세요.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        A returned <code>Response</code> is sent as is.
                      </strong>{" "}
                      Serialization is skipped, which is how an endpoint declared <code>Any</code> streams a file back.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>Response</code>를 반환하면 그대로 전송됩니다.
                      </strong>{" "}
                      직렬화를 건너뛰므로, 반환 타입이 <code>Any</code>인 엔드포인트가 파일을 그대로 흘려보낼 수
                      있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Cleanup belongs to the call that registered it.</strong>{" "}
                      <code>on("disconnect" | "unsubscribe", fn)</code> is scoped to the room for a <code>pubsub</code>{" "}
                      and to the socket for a <code>message</code>. Register both when it must run either way.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>정리 함수는 등록한 호출의 범위를 따릅니다.</strong>{" "}
                      <code>on("disconnect" | "unsubscribe", fn)</code>은 <code>pubsub</code>에서는 room에,{" "}
                      <code>message</code>에서는 소켓에 묶입니다. 어느 쪽이든 실행돼야 하면 둘 다 등록하세요.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>socketId</code> names a connection, not a caller.
                      </strong>{" "}
                      Key per-user state on the account, and never mint an id of your own.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>socketId</code>는 호출자가 아니라 연결을 가리킵니다.
                      </strong>{" "}
                      사용자별 상태는 계정 기준으로 저장하고, id를 직접 만들지 마세요.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Never read the caller's IP off the socket or the request.</strong> Behind the gateway, every
                    peer is the gateway itself (<code>127.0.0.1</code>) for every caller. Take <code>.with(Ip)</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>호출자 IP를 소켓이나 요청에서 직접 읽지 마세요.</strong> gateway 뒤에서는 모든 호출자의
                    peer가 gateway 자신(<code>127.0.0.1</code>)입니다. <code>.with(Ip)</code>를 쓰세요.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="middleware-Middleware" title="middleware / Middleware">
          <Docs.Title>middleware / Middleware</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Middleware wraps every endpoint call, before and after the handler. Two are registered by default; write your own with `middleware(refName)`.",
                ko: "미들웨어는 모든 엔드포인트 호출을 핸들러 앞뒤로 감쌉니다. 기본으로 두 개가 등록되어 있고, 직접 만들 때는 `middleware(refName)`을 씁니다.",
              })}
            </div>
            <Docs.Table columns={builtInColumns} rows={builtInRows} stacked />
            <div>
              {l.trans({
                en: "An endpoint's `{ cache: <ms> }` is not a middleware. The stored answer is looked up inside the call, after the guards, so a hit reaches only a caller they admitted.",
                ko: "엔드포인트의 `{ cache: <ms> }`는 미들웨어가 아닙니다. 저장된 응답은 호출 안에서 가드 다음에 찾으므로, 캐시 적중도 가드가 통과시킨 호출자에게만 돌아갑니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: 'A write drops the answers it made stale before their TTL. Declare `endpointCache: plug(EndpointCacheControl)` in the service, then `await this.endpointCache.invalidate("bannerListInPublic")` for every answer of the endpoint, plus `bannerInsightInPublic` for a slice\'s count. `invalidate("bannerInPublic", [category])` drops the one call with those arguments: pass every declared argument, `null` for an omitted search argument; a slice list carries skip, limit and sort, so drop it with the endpoint-wide form. Every instance sees it at once.',
                ko: '쓰기는 자신이 낡게 만든 응답을 TTL이 지나기 전에 버릴 수 있습니다. 서비스에 `endpointCache: plug(EndpointCacheControl)`를 선언하고, 엔드포인트의 모든 응답은 `await this.endpointCache.invalidate("bannerListInPublic")`로 버리며 슬라이스의 개수는 `bannerInsightInPublic`도 함께 버립니다. 특정 인자로 한 호출의 응답은 `invalidate("bannerInPublic", [category])`로 버리는데, 선언한 인자를 모두 넘기고 생략한 search 인자는 `null`로 넘깁니다. 슬라이스 목록은 skip, limit, sort를 함께 받으므로 엔드포인트 전체 형태로 버립니다. 모든 인스턴스에 곧바로 반영됩니다.',
              })}
            </div>
            <Docs.SubSubTitle>{l.trans({ en: "Call Order", ko: "실행 순서" })}</Docs.SubSubTitle>
            <div>{l.trans({ en: "From the outside in:", ko: "바깥쪽부터 차례로 실행됩니다:" })}</div>
            <ol className={orderedList}>
              <li>
                {l.trans({
                  en: "The two defaults: `Logging` → `Timeout`.",
                  ko: "기본 미들웨어 두 개: `Logging` → `Timeout`.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Middleware a `lib/option.ts` adds with `applyMiddleware(...)`, such as `AccountMiddleware` from `libs/shared`.",
                  ko: "`lib/option.ts`가 `applyMiddleware(...)`로 추가한 미들웨어. 예를 들어 `libs/shared`의 `AccountMiddleware`가 있습니다.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "The endpoint's own `middlewares` option.",
                  ko: "엔드포인트 옵션의 `middlewares`.",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Guards, then internal arguments, then the `cache` lookup if the endpoint declares one, then the handler.",
                  ko: "가드, 내부 인자, 엔드포인트가 `cache`를 선언했다면 캐시 조회, 그리고 핸들러.",
                })}
              </li>
            </ol>
            <Docs.SubSubTitle>{l.trans({ en: "Writing One", ko: "직접 만들기" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "A middleware that warns about slow calls:",
                ko: "느린 호출을 경고하는 미들웨어입니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/srvkit/slowCallMiddleware.ts"
            language="typescript"
            code={`import { middleware, type SignalContext } from "akanjs/signal";

export class SlowCallMiddleware extends middleware("slowCall") {
  override async use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const start = Date.now();
      const result = await next();
      const ms = Date.now() - start;
      if (ms > 1000) context.adaptor.logger.warn(\`\${context.key}: \${ms}ms\`);
      return result;
    };
  }
}`}
          />
          <Docs.Description>
            <div>
              {l.trans({
                en: "Register it in one of two places:",
                ko: "등록하는 곳은 두 군데입니다:",
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Where", ko: "등록 위치" })} items={registerRows} />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>use(env)</code> runs once.
                      </strong>{" "}
                      The handler it returns serves every call, so set up in <code>use</code> and keep per-call work in
                      the handler.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>use(env)</code>는 한 번만 실행됩니다.
                      </strong>{" "}
                      반환한 핸들러를 모든 호출이 재사용하므로, 준비 작업은 <code>use</code>에서, 호출마다 할 일은
                      핸들러 안에서 합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Skipping <code>next()</code> skips the guards.
                      </strong>{" "}
                      Guards run inside <code>next()</code>, so never answer from a middleware on behalf of a guarded
                      endpoint. For a stored answer, declare <code>{"{ cache: <ms> }"}</code> on the endpoint instead.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>next()</code>를 건너뛰면 가드도 건너뜁니다.
                      </strong>{" "}
                      가드는 <code>next()</code> 안에서 실행되므로, 가드가 걸린 엔드포인트를 대신해 미들웨어가 직접
                      응답하면 안 됩니다. 저장해 둔 응답이 필요하면 엔드포인트에 <code>{"{ cache: <ms> }"}</code>를
                      선언하세요.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>refName</code> is the key.
                      </strong>{" "}
                      Registering a middleware under a <code>refName</code> already taken replaces the earlier one.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>refName</code>이 식별자입니다.
                      </strong>{" "}
                      이미 쓰인 <code>refName</code>으로 등록하면 앞의 미들웨어를 대체합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>A timeout does not cancel the work.</strong> The handler keeps running with nobody holding
                    its result, so a write still happens. The deadline answers the caller; it does not undo the call.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>timeout은 작업을 취소하지 않습니다.</strong> 결과를 받을 곳이 없어도 핸들러는 끝까지
                    실행되므로 쓰기 작업은 그대로 일어납니다. 마감 시간은 호출자에게 답할 뿐, 호출을 되돌리지 않습니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="SignalRegistry" title="SignalRegistry">
          <Docs.Title>SignalRegistry</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "`SignalRegistry` finds a module's registered signals by refName at runtime. A refName nothing registered returns `undefined`.",
                ko: "`SignalRegistry`는 런타임에 refName으로 모듈의 등록된 signal을 찾습니다. 등록되지 않은 refName이면 `undefined`를 반환합니다.",
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={registryRows} />
            <div>{l.trans({ en: "Look one up by refName:", ko: "refName으로 찾습니다:" })}</div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/srvkit/signalLookup.ts"
            language="typescript"
            code={`import { SignalRegistry } from "akanjs/signal";

const userSignal = SignalRegistry.getDatabase("user");
const utilSignal = SignalRegistry.getService("util");`}
          />
          <Docs.Description>
            <Docs.SubSubTitle>
              {l.trans({ en: "Publishing From A Service", ko: "서비스에서 발행하기" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "Each module also has a server signal, which a service injects with `signal<sig.X>()`. It turns endpoints and internals into methods:",
                ko: "모듈마다 server signal도 있으며, 서비스가 `signal<sig.X>()`로 주입받습니다. 엔드포인트와 internal이 메서드가 됩니다:",
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={serverSignalRows} />
            <div>
              {l.trans({
                en: "The notice service saves a notice, then publishes it to the `noticeAdded` room from the guard example:",
                ko: "공지 서비스가 공지를 저장한 뒤, 가드 예제의 `noticeAdded` room에 발행합니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/notice/notice.service.ts"
            language="typescript"
            code={`import { serve } from "akanjs/service";

import * as db from "../db";
import type * as sig from "../sig";

export class NoticeService extends serve(db.notice, ({ signal }) => ({
  noticeSignal: signal<sig.Notice>(),
})) {
  async send(userId: string, text: string) {
    const notice = await this.createNotice({ userId, text });
    await this.noticeSignal.noticeAdded(userId, notice);
    return notice;
  }
}`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Save first, then notify.</strong> A subscriber then never receives a record that failed to
                      save.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>먼저 저장하고 그다음 알립니다.</strong> 그래야 저장에 실패한 데이터가 구독자에게 가지
                      않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The room's return model shapes the data.</strong> <code>data</code> is serialized with the{" "}
                      <code>pubsub</code> endpoint's return model, like any response.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>room의 반환 모델이 데이터 모양을 정합니다.</strong> <code>data</code>는 일반 응답처럼{" "}
                      <code>pubsub</code> 엔드포인트의 반환 모델로 직렬화됩니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The field name picks the signal.</strong> <code>noticeSignal</code> resolves to the{" "}
                      <code>notice</code> module's server signal, and the <code>Signal</code> suffix is required.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>필드 이름이 signal을 고릅니다.</strong> <code>noticeSignal</code>은 <code>notice</code>{" "}
                      모듈의 server signal로 연결되며, <code>Signal</code> 접미사는 필수입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
