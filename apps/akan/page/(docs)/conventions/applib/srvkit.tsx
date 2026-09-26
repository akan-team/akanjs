import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const layerPlacement: IntroItem[] = [
    {
      name: "common/",
      desc: l.trans({
        en: "Pure, isomorphic, zero-dependency; imports only sibling common/* and akanjs/base, not Err.",
        ko: "순수하고 서버·클라이언트 양쪽에서 실행되며 의존성이 없습니다. 형제 common/*과 akanjs/base만 import하고 Err는 못 씁니다.",
      }),
      example: "libs/util/common/isHttpUri.ts\n// camelCase file, filename equals the single export",
    },
    {
      name: "webkit/",
      desc: l.trans({
        en: "Touches window, navigator or Capacitor, or is a React hook.",
        ko: "window, navigator, Capacitor를 건드리거나 React hook입니다.",
      }),
      example: "libs/util/webkit/useGeoLocation.tsx\n// use<Thing>.tsx — .tsx even with no JSX",
    },
    {
      name: "srvkit/",
      desc: l.trans({
        en: "Touches node:*, Bun, process.env, a secret, or a server SDK.",
        ko: "node:*, Bun, process.env, secret, 서버 SDK 중 하나라도 건드립니다.",
      }),
      example: "libs/util/srvkit/cloudflareApi.ts\n// camelCase file, PascalCase class",
    },
    {
      name: "ui/",
      desc: l.trans({
        en: "Renders JSX or defines a recipe, bound to no model; a model-bound component goes in its module.",
        ko: "JSX를 그리거나 레시피로 모양을 정의하되 model 하나에 묶이지 않습니다. model에 묶인 컴포넌트는 그 module에 둡니다.",
      }),
      example: "apps/akan/ui/BrowserMockup.tsx\n// PascalCase component, camelCase sidecar",
    },
    {
      name: "plugin/",
      desc: l.trans({
        en: "A build-time or CLI-time AkanPlugin, registered in akan.config.ts.",
        ko: "빌드 시점이나 CLI 시점에 실행되는 AkanPlugin입니다. akan.config.ts에 등록합니다.",
      }),
      example: "libs/util/plugin/pushNotification.plugin.ts\n// <name>.plugin.ts",
    },
  ];

  const srvkitKinds: IntroItem[] = [
    {
      name: "Guard",
      desc: l.trans({
        en: "Decides whether a request may run an endpoint: sign-in, role or ownership checks.",
        ko: "요청이 endpoint를 실행해도 되는지 판단합니다. 로그인, role, 소유권 확인이 여기에 속합니다.",
      }),
      example: "libs/shared/srvkit/guards.ts",
    },
    {
      name: "InternalArg",
      desc: l.trans({
        en: "Reads a trusted value, such as the caller's account, and hands it to exec as an argument.",
        ko: "호출자의 account처럼 믿을 수 있는 값을 context에서 읽어 exec 인자로 넘깁니다.",
      }),
      example: "libs/shared/srvkit/internalArgs.ts",
    },
    {
      name: "Middleware",
      desc: l.trans({
        en: "Wraps every signal call and attaches server context before the endpoint's guards run.",
        ko: "모든 signal 호출을 감싸고, endpoint의 guard가 실행되기 전에 서버 context를 붙입니다.",
      }),
      example: "libs/shared/srvkit/accountMiddleware.ts",
    },
    {
      name: "WebProxy",
      desc: l.trans({
        en: "Runs before a page request is routed, to redirect, rewrite, or add headers.",
        ko: "페이지 요청이 라우팅되기 전에 실행되어 redirect, rewrite, header 추가를 처리합니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Server helper", ko: "서버 helper" })}</span>,
      desc: l.trans({
        en: "A reusable function for hashing, encryption, file handling, image inspection or tokens.",
        ko: "hash, 암호화, 파일 처리, 이미지 분석, token 처리 같은 재사용 함수입니다.",
      }),
      example: "libs/util/srvkit/aes.ts\nlibs/util/srvkit/getImageSize.ts",
    },
    {
      name: "Adaptor",
      desc: l.trans({
        en: "A singleton adapt() class wrapping storage, queues, email, payment or a vendor API.",
        ko: "storage, queue, email, 결제, vendor API를 감싸는 싱글턴 adapt() class입니다.",
      }),
      example: "libs/util/srvkit/ipfsApi.ts",
    },
    {
      name: <span className="font-sans">Class utility</span>,
      desc: l.trans({
        en: "Legacy: a server-only class, such as an SDK client, injected through option.ts.",
        ko: "legacy 형태입니다. SDK client 같은 서버 전용 class를 option.ts를 거쳐 주입합니다.",
      }),
      example: "libs/util/srvkit/cloudflareApi.ts",
    },
  ];

  const pathColumns = [
    { key: "page", label: l.trans({ en: "Page request", ko: "페이지 요청" }), caption: "/ko/docs" },
    { key: "signal", label: l.trans({ en: "Signal call", ko: "Signal 호출" }), caption: "HTTP · WS · MCP" },
  ];
  const onPage = { page: true, signal: false };
  const onSignal = { page: false, signal: true };
  const pathGroups = [
    {
      label: l.trans({ en: "Server level: registered once in option.ts", ko: "서버 레벨 — option.ts에 한 번 등록" }),
      rows: [
        {
          name: "WebProxy",
          desc: l.trans({
            en: "Redirects, rewrites or adds headers before the page is chosen.",
            ko: "page가 정해지기 전에 redirect, rewrite, header 추가를 합니다.",
          }),
          marks: onPage,
        },
        {
          name: "Middleware",
          desc: l.trans({
            en: "Attaches server context, such as the account, before guards run.",
            ko: "guard가 실행되기 전에 account 같은 서버 context를 붙입니다.",
          }),
          marks: onSignal,
        },
      ],
    },
    {
      label: l.trans({
        en: "Signal level: named on each endpoint or slice",
        ko: "Signal 레벨 — endpoint나 slice마다 지정",
      }),
      rows: [
        {
          name: "Guard",
          desc: l.trans({ en: "Allows or refuses the call.", ko: "호출을 허용하거나 거절합니다." }),
          marks: onSignal,
        },
        {
          name: "InternalArg",
          desc: l.trans({
            en: "Hands a server-made value to exec as an argument.",
            ko: "서버가 만든 값을 exec 인자로 넘깁니다.",
          }),
          marks: onSignal,
        },
      ],
    },
  ];

  const proxyReturnRows = [
    {
      value: "Response",
      effect: l.trans({
        en: "Sent as is; later proxies and the page do not run.",
        ko: "그대로 응답합니다. 뒤의 proxy와 page는 실행되지 않습니다.",
      }),
    },
    {
      value: "AkanResponse.redirect(url, status?)",
      effect: l.trans({
        en: "A redirect Response; the status defaults to 307.",
        ko: "redirect Response를 만듭니다. status 기본값은 307입니다.",
      }),
    },
    {
      value: "AkanResponse.next({ request })",
      effect: l.trans({
        en: "Continues with the request headers you changed.",
        ko: "바꾼 request header를 들고 다음 단계로 넘어갑니다.",
      }),
    },
    {
      value: "AkanResponse.rewrite(url)",
      effect: l.trans({
        en: "Serves another path while the address bar stays the same.",
        ko: "주소창은 그대로 두고 다른 경로의 page를 보여 줍니다.",
      }),
    },
    {
      value: "undefined",
      effect: l.trans({ en: "Passes the request on unchanged.", ko: "요청을 손대지 않고 넘깁니다." }),
    },
  ];

  const scopeRows = [
    {
      scope: '"account"',
      reads: l.trans({ en: "The caller only", ko: "호출자만" }),
      listing: l.trans({
        en: "An MCP listing runs it with no arguments and hides what this caller certainly cannot use.",
        ko: "MCP 목록은 인자 없이 이 guard를 평가해, 호출자가 확실히 쓸 수 없는 항목을 숨깁니다.",
      }),
    },
    {
      scope: '"resource"',
      reads: l.trans({ en: "The call's arguments too", ko: "호출 인자까지" }),
      listing: l.trans({
        en: "An MCP listing skips it, so the entry stays visible and is stopped at call time.",
        ko: "MCP 목록은 이 guard를 평가하지 않습니다. 항목은 그대로 보이고, 호출할 때 막힙니다.",
      }),
    },
  ];

  const readyInternalArgs: IntroItem[] = [
    {
      name: ["Req", "Res", "Ip", "Ws"],
      desc: l.trans({
        en: "From `akanjs/signal`: raw request, response, caller IP, and the socket with its `socketId`.",
        ko: "`akanjs/signal`에 있습니다. 원본 request, response, 호출자 IP, `socketId`가 붙은 socket을 넘깁니다.",
      }),
    },
    {
      name: ["Account", "Self", "Me", "AgentCall"],
      desc: l.trans({
        en: "From `@libs/shared/srvkit`: account, signed-in user, admin, and whether a model is calling.",
        ko: "`@libs/shared/srvkit`에 있습니다. account, 로그인한 user, admin, 모델이 호출 중인지를 넘깁니다.",
      }),
    },
  ];

  const wrapRows: IntroItem[] = [
    {
      name: <span className="font-sans">{l.trans({ en: "Function helper", ko: "함수 helper" })}</span>,
      desc: l.trans({
        en: "Imported straight from the srvkit barrel.",
        ko: "srvkit barrel에서 바로 import합니다.",
      }),
      example: 'import { createOrderHash } from "@apps/koyo/srvkit";',
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Singleton adaptor", ko: "싱글턴 adaptor" })}</span>,
      desc: l.trans({
        en: "`plug(Class)` in the service, with nothing in option.ts.",
        ko: "service에서 `plug(Class)`로 받고, option.ts에는 적지 않습니다.",
      }),
      example: "paymentApi: plug(PaymentApi),",
    },
    {
      name: (
        <span className="font-sans">{l.trans({ en: "Class instance (legacy)", ko: "class 인스턴스 (legacy)" })}</span>
      ),
      desc: l.trans({
        en: "Built in option.ts `.use()`, then injected with `use<T>()`.",
        ko: "option.ts의 `.use()`에서 만들고 `use<T>()`로 주입합니다.",
      }),
      example: "emailClient: use<EmailClient>(),",
    },
  ];

  const injectors: IntroItem[] = [
    {
      name: "use<T>()",
      desc: l.trans({
        en: "A value option.ts provides under the same key: the legacy path.",
        ko: "option.ts가 같은 key로 제공하는 값입니다. legacy 경로입니다.",
      }),
    },
    {
      name: "env(fn)",
      desc: l.trans({
        en: "A value read from the server options once, when the server starts.",
        ko: "서버가 시작될 때 서버 option에서 한 번 읽는 값입니다.",
      }),
    },
    {
      name: "plug(Class)",
      desc: l.trans({
        en: "Another adaptor, or a built-in role such as `StorageAdaptorRole`.",
        ko: "다른 adaptor나 `StorageAdaptorRole` 같은 기본 제공 role입니다.",
      }),
    },
    {
      name: "memory(Type, { of })",
      desc: l.trans({
        en: "A value this adaptor keeps in the cache adaptor; `local: true` keeps it in-process instead.",
        ko: "이 adaptor가 cache adaptor에 따로 두는 값입니다. `local: true`면 프로세스 안에 둡니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="srvkit-overview" title={l.trans({ en: "Server Utility Overview", ko: "서버 유틸리티 개요" })}>
        <Docs.Title>{l.trans({ en: "Server Utility Overview", ko: "서버 유틸리티 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>srvkit/</code> holds server-only code that services, signals and server jobs call. Keeping it
                  here lets the module files stay focused on business behavior.
                </span>
              ),
              ko: (
                <span>
                  <code>srvkit/</code>에는 서버에서만 실행되어야 하는 코드를 둡니다. service, signal, 서버 job이 이
                  코드를 불러 쓰므로, module 파일은 비즈니스 동작에만 집중할 수 있습니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "It is also the one safe door for external libraries: vendor SDKs and low-level server APIs pass through srvkit first.",
              ko: "외부 라이브러리를 들여오는 안전한 통로이기도 합니다. vendor SDK와 저수준 서버 API는 먼저 srvkit을 거칩니다.",
            })}
          </div>
          <Docs.Alert type="error">
            {l.trans({
              en: (
                <span>
                  <strong>Module files cannot import a third-party package.</strong> In <code>*.service.ts</code>,{" "}
                  <code>*.signal.ts</code> and the other module files, lint accepts only relative paths and workspace
                  packages such as <code>akanjs/*</code>, <code>@apps/*</code> and <code>@libs/*</code>. Even{" "}
                  <code>node:crypto</code> is refused, so import it in srvkit and export what the service needs.
                </span>
              ),
              ko: (
                <span>
                  <strong>module 파일은 외부 패키지를 import할 수 없습니다.</strong> <code>*.service.ts</code>,{" "}
                  <code>*.signal.ts</code> 같은 module 파일에서 lint는 상대 경로와 <code>akanjs/*</code>,{" "}
                  <code>@apps/*</code>, <code>@libs/*</code> 같은 workspace 패키지만 허용합니다.{" "}
                  <code>node:crypto</code>도 막히므로, srvkit에서 import하고 service에는 필요한 것만 export해 주세요.
                </span>
              ),
            })}
          </Docs.Alert>

          <Docs.SubSubTitle>{l.trans({ en: "Which folder?", ko: "어느 폴더에 둘까" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Code outside <code>lib/</code> goes in one of five folders. Choose by what the code touches, not what
                  it is for; the <code>common/</code> and <code>webkit/</code> pages open with this same table.
                </span>
              ),
              ko: (
                <span>
                  <code>lib/</code> 바깥 코드는 다섯 폴더 중 하나에 둡니다. 무엇을 위한 코드인지가 아니라 무엇을
                  건드리는지로 고르며, <code>common/</code>과 <code>webkit/</code> 문서도 같은 표로 시작합니다.
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Folder", ko: "폴더" })} items={layerPlacement} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="what-belongs" title={l.trans({ en: "What Belongs In srvkit/", ko: "srvkit/에 두는 것" })}>
        <Docs.Title>{l.trans({ en: "What Belongs In srvkit/", ko: "srvkit/에 두는 것" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "srvkit/ holds seven kinds of code. Four step into the request path, and three are tools a service calls:",
              ko: "srvkit/에는 일곱 종류의 코드를 둡니다. 넷은 요청 경로에 끼어들고, 셋은 service가 불러 쓰는 도구입니다:",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Kind", ko: "종류" })} items={srvkitKinds} />

          <Docs.SubSubTitle>
            {l.trans({ en: "Where the request-path four run", ko: "요청 경로의 네 가지는 어디서 실행되나" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A page request and a signal call take different paths, and each piece sits on only one of them:",
              ko: "페이지 요청과 signal 호출은 서로 다른 길로 들어오고, 네 가지는 각각 그중 한 길에만 있습니다:",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Piece", ko: "구성 요소" })}
            columns={pathColumns}
            groups={pathGroups}
            markLabel={l.trans({ en: "Runs here", ko: "여기서 실행" })}
            emptyLabel={l.trans({ en: "Not here", ko: "여기서는 실행하지 않음" })}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="server-level-appliance"
        title={l.trans({ en: "Server Level: WebProxy And Middleware", ko: "서버 레벨: WebProxy와 Middleware" })}
      >
        <Docs.Title>
          {l.trans({ en: "Server Level: WebProxy And Middleware", ko: "서버 레벨: WebProxy와 Middleware" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Both are registered once in the option chain and apply to every request of their kind. A WebProxy acts on page requests before routing; a Middleware wraps every signal call.",
              ko: "둘 다 option chain에 한 번 등록하면 해당 종류의 모든 요청에 적용됩니다. WebProxy는 라우팅 전에 페이지 요청을 다루고, Middleware는 모든 signal 호출을 감쌉니다.",
            })}
          </div>

          <Docs.SubSubTitle>WebProxy</Docs.SubSubTitle>
          <Docs.Flow
            nodes={{
              pageRequest: { label: l.trans({ en: "Page request", ko: "페이지 요청" }), tone: "muted" },
              webProxy: { label: "WebProxy", lines: ["redirect · rewrite · headers"] },
              render: { label: l.trans({ en: "Page render", ko: "page 렌더링" }) },
            }}
            edges={[
              ["pageRequest", "webProxy"],
              ["webProxy", "render"],
            ]}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  A WebProxy is a class with one <code>use(request)</code> method. This one sends a retired URL to its
                  new page:
                </span>
              ),
              ko: (
                <span>
                  WebProxy는 <code>use(request)</code> 메서드 하나를 가진 class입니다. 아래 예시는 더 이상 쓰지 않는
                  URL을 새 page로 보냅니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/srvkit/legacyPageRedirect.ts"
            code={`import { AkanResponse, type WebProxy } from "akanjs/server";

export class LegacyPageRedirect implements WebProxy {
  static readonly refName = "LegacyPageRedirect";

  use(request: Bun.BunRequest) {
    const url = new URL(request.url);
    const [, lang, ...rest] = url.pathname.split("/");
    if (rest.join("/") !== "old-docs") return;
    return AkanResponse.redirect(new URL(\`/\${lang}/docs\`, url), 308);
  }
}`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  What <code>use()</code> returns decides what happens next:
                </span>
              ),
              ko: (
                <span>
                  <code>use()</code>가 무엇을 돌려주느냐에 따라 다음 동작이 정해집니다:
                </span>
              ),
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "value", label: l.trans({ en: "Return value", ko: "반환값" }), code: true },
              { key: "effect", label: l.trans({ en: "What happens", ko: "결과" }) },
            ]}
            rows={proxyReturnRows}
            stacked
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Page requests only.</strong> API routes, the websocket and <code>/_akan/*</code> paths never
                    pass through a WebProxy. Static files (a path with an extension) skip it too, unless a matcher names
                    them.
                  </>
                ),
                ko: (
                  <>
                    <strong>페이지 요청에만 적용됩니다.</strong> API 경로, websocket, <code>/_akan/*</code> 경로는
                    WebProxy를 거치지 않습니다. 정적 파일(확장자가 붙은 경로)도 matcher로 직접 지정하지 않으면
                    건너뜁니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The locale redirect runs first.</strong> The built-in proxies run before yours and turn{" "}
                    <code>/old-docs</code> into <code>/ko/old-docs</code>, so match the path with its locale segment.
                  </>
                ),
                ko: (
                  <>
                    <strong>locale redirect가 먼저 실행됩니다.</strong> 기본 proxy가 내 proxy보다 먼저 실행되어{" "}
                    <code>/old-docs</code>를 <code>/ko/old-docs</code>로 바꾸므로, 경로는 locale 부분까지 포함해
                    비교합니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Narrow it with a matcher.</strong> In <code>applyWebProxy({"{ proxy, matcher }"})</code>,
                    the matcher is a path prefix, a <code>RegExp</code>, or a function of the request.
                  </>
                ),
                ko: (
                  <>
                    <strong>matcher로 범위를 좁힐 수 있습니다.</strong>{" "}
                    <code>applyWebProxy({"{ proxy, matcher }"})</code>의 matcher에는 경로 prefix, <code>RegExp</code>,
                    request를 받는 함수 중 하나를 넣습니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>Middleware</Docs.SubSubTitle>
          <Docs.Flow
            nodes={{
              signalCall: { label: l.trans({ en: "Signal call", ko: "Signal 호출" }), tone: "muted" },
              middleware: { label: "Middleware", lines: [l.trans({ en: "attach context", ko: "context 부착" })] },
              endpoint: { label: "Signal endpoint", lines: ["Guard → exec"] },
            }}
            edges={[
              ["signalCall", "middleware"],
              ["middleware", "endpoint"],
            ]}
          />
          <div>
            {l.trans({
              en: "This Middleware resolves the caller and stores it where guards and InternalArgs read it:",
              ko: "아래 Middleware는 호출자를 확인해서 guard와 InternalArg가 읽는 자리에 넣어 둡니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/srvkit/requestUserMiddleware.ts"
            code={`import type { Middleware, SignalContext } from "akanjs/signal";
import { resolveAccount } from "./account";

export class RequestUserMiddleware implements Middleware {
  static readonly refName = "RequestUserMiddleware";

  async use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const req =
        context.transport === "http"
          ? context.getHttpContext().req
          : context.getWebSocketContext().ws.data;
      Object.assign(req, { account: await resolveAccount(req) });
      return await next();
    };
  }
}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>use(env)</code> runs once per process.
                    </strong>{" "}
                    It receives the server options; only the function it returns runs on every call.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>use(env)</code>는 프로세스당 한 번 실행됩니다.
                    </strong>{" "}
                    서버 option을 받으며, 매 호출마다 실행되는 것은 <code>use</code>가 돌려준 함수뿐입니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Branch on transport here, and only here.</strong> Middleware writes <code>account</code>{" "}
                    onto the HTTP request or the socket data, and every guard and InternalArg reads it back with{" "}
                    <code>context.get("account")</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>transport 분기는 여기서만 합니다.</strong> Middleware가 HTTP request나 socket data에{" "}
                    <code>account</code>를 써 두면, guard와 InternalArg는 모두 <code>context.get("account")</code>로
                    읽습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Mounting libs/shared already does this.</strong> Its <code>AccountMiddleware</code> turns
                    the JWT into <code>account</code>, so most apps never write their own.
                  </>
                ),
                ko: (
                  <>
                    <strong>libs/shared를 쓰면 이미 들어 있습니다.</strong> 그 안의 <code>AccountMiddleware</code>가
                    JWT를 <code>account</code>로 바꿔 주므로, 대부분의 app은 직접 만들 일이 없습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>refName</code> is the registration key.
                    </strong>{" "}
                    Two middlewares with the same <code>refName</code> replace each other. For a single endpoint, use
                    the <code>middlewares</code> signal option instead.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>refName</code>이 등록 key입니다.
                    </strong>{" "}
                    <code>refName</code>이 같은 middleware 둘은 서로를 덮어씁니다. endpoint 하나에만 걸려면{" "}
                    <code>middlewares</code> signal option을 씁니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "Register them in option.ts", ko: "option.ts에 등록하기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Once both are declared in srvkit, register them in the app's or library's option chain:",
              ko: "srvkit에 선언했으면 app이나 library의 option chain에 등록합니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/option.ts"
            code={`import { AkanOption } from "akanjs/server";
import { LegacyPageRedirect, RequestUserMiddleware } from "../srvkit";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions;

export const option = new AkanOption<ModulesOptions>()
  .applyMiddleware(RequestUserMiddleware)
  .applyWebProxy(LegacyPageRedirect);`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Several at once, in order.</strong> <code>applyMiddleware</code> and{" "}
                    <code>applyWebProxy</code> each take several classes, and proxies run in the order you list them.
                  </>
                ),
                ko: (
                  <>
                    <strong>여러 개를 한 번에, 순서대로.</strong> <code>applyMiddleware</code>와{" "}
                    <code>applyWebProxy</code>는 class를 여러 개 받고, proxy는 적은 순서대로 실행됩니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Libraries bring their own.</strong> An app runs the middleware and proxies of every library
                    it mounts, and its own <code>option.ts</code> is applied last.
                  </>
                ),
                ko: (
                  <>
                    <strong>library의 것도 함께 실행됩니다.</strong> app은 mount한 모든 library의 middleware와 proxy를
                    실행하고, app 자신의 <code>option.ts</code>는 마지막에 적용됩니다.
                  </>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="signal-level-appliance"
        title={l.trans({ en: "Signal Level: Guard And InternalArg", ko: "Signal 레벨: Guard와 InternalArg" })}
      >
        <Docs.Title>
          {l.trans({ en: "Signal Level: Guard And InternalArg", ko: "Signal 레벨: Guard와 InternalArg" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Guards and internal args are named per endpoint or slice. A Guard decides whether the call may run; an InternalArg turns trusted server context into an exec argument.",
              ko: "Guard와 InternalArg는 endpoint나 slice마다 지정합니다. Guard는 호출을 실행해도 되는지 판단하고, InternalArg는 믿을 수 있는 서버 context를 exec 인자로 바꿉니다.",
            })}
          </div>
          <Docs.Flow
            title={l.trans({ en: "After Middleware prepares the context", ko: "Middleware가 context를 준비한 뒤" })}
            nodes={{
              middleware: { label: "Middleware", tone: "muted" },
              guard: { label: "Guard", lines: [l.trans({ en: "allow or refuse", ko: "허용 또는 거절" })] },
              internalArg: {
                label: "InternalArg",
                lines: [l.trans({ en: "build exec args", ko: "exec 인자 생성" })],
              },
              exec: { label: "Signal exec" },
              service: { label: l.trans({ en: "Service logic", ko: "Service 로직" }) },
            }}
            edges={[
              ["middleware", "guard"],
              ["guard", "internalArg"],
              ["internalArg", "exec"],
              ["exec", "service"],
            ]}
          />

          <Docs.SubSubTitle>Guard</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  A Guard is a class with <code>canPass(context)</code>. <code>SignedIn</code> reads only the caller;{" "}
                  <code>CanCancelOrder</code> also needs the call's arguments:
                </span>
              ),
              ko: (
                <span>
                  Guard는 <code>canPass(context)</code>를 가진 class입니다. <code>SignedIn</code>은 호출자만 읽고,{" "}
                  <code>CanCancelOrder</code>는 호출 인자까지 봅니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/srvkit/guards.ts"
            code={`import { Logger } from "akanjs/common";
import type { Guard, GuardScope, SignalContext } from "akanjs/signal";
import type * as srv from "../lib/srv";

interface KoyoAccount {
  self?: { id: string };
}

export class SignedIn implements Guard {
  // fetch serializes this name and the API explorer filters on it.
  static name = "SignedIn";
  static scope: GuardScope = "account"; // [!code highlight]

  canPass(context: SignalContext): boolean {
    return !!context.get<KoyoAccount>("account")?.self;
  }
}

export class CanCancelOrder implements Guard {
  static name = "CanCancelOrder";
  static scope: GuardScope = "resource"; // [!code highlight]
  static #logger = new Logger("CanCancelOrder");

  async canPass(context: SignalContext): Promise<boolean> {
    const self = context.get<KoyoAccount>("account")?.self;
    const orderId = context.getArg<string>("orderId");
    if (!self || !orderId) return false;
    try {
      const orderService = context.getService<srv.OrderService>("order");
      const order = await orderService.loadOrder(orderId);
      return order?.owner === self.id;
    } catch (error) {
      CanCancelOrder.#logger.warn(\`order \${orderId}: \${String(error)}\`);
      return false;
    }
  }
}`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  That difference is what <code>static scope</code> declares. It has no default, so every guard states
                  it:
                </span>
              ),
              ko: (
                <span>
                  그 차이를 선언하는 것이 <code>static scope</code>입니다. 기본값이 없으므로 모든 guard가 직접 적습니다:
                </span>
              ),
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "scope", label: "scope", code: true },
              { key: "reads", label: l.trans({ en: "Reads", ko: "읽는 것" }) },
              { key: "listing", label: l.trans({ en: "In an MCP listing", ko: "MCP 목록에서는" }) },
            ]}
            rows={scopeRows}
            stacked
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      Keep <code>static name</code>.
                    </strong>{" "}
                    fetch serializes guard names and the API explorer filters on them.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>static name</code>은 지우지 않습니다.
                    </strong>{" "}
                    fetch가 guard 이름을 직렬화하고, API explorer가 그 이름으로 필터링합니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      Read the caller with <code>context.get("account")</code>.
                    </strong>{" "}
                    Guards also run on websocket calls, and a pubsub room re-runs them whenever the socket's credential
                    changes, so never branch on <code>getHttpContext()</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      호출자는 <code>context.get("account")</code>로 읽습니다.
                    </strong>{" "}
                    guard는 websocket 호출에서도 실행되고, pubsub room은 socket의 credential이 바뀔 때마다 guard를 다시
                    실행하므로 <code>getHttpContext()</code>로 분기하지 않습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Side-effect free, and fail closed.</strong> A guard must be safe to re-run. No resource
                    named means <code>false</code>; a load that throws means <code>logger.warn</code>, then{" "}
                    <code>false</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>side effect는 없게, 실패하면 거절로.</strong> guard는 다시 실행해도 안전해야 합니다.
                    가리키는 resource가 없으면 <code>false</code>, 조회가 throw하면 <code>logger.warn</code> 후{" "}
                    <code>false</code>입니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Every guard must pass.</strong> The <code>guards</code> array is checked in order, and the
                    first refusal answers 403.
                  </>
                ),
                ko: (
                  <>
                    <strong>모든 guard를 통과해야 합니다.</strong> <code>guards</code> 배열은 순서대로 검사하고, 처음
                    거절한 guard에서 403으로 응답합니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>InternalArg</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "An InternalArg reads the request context and hands a server-made value to exec, so business logic gets it without asking the client:",
              ko: "InternalArg는 request context를 읽어 서버가 만든 값을 exec에 넘깁니다. 클라이언트에게 보내 달라고 하지 않아도 비즈니스 로직이 그 값을 받습니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/srvkit/internalArgs.ts"
            code={`import type { InternalArg, SignalContext } from "akanjs/signal";

export class CurrentUserId implements InternalArg<string> {
  getArg(context: SignalContext) {
    const account = context.get<{ self?: { id: string } }>("account");
    return account?.self?.id ?? null;
  }
}`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  Guards and internal args meet in the signal file. Guards go in the option, and <code>.with()</code>{" "}
                  appends an InternalArg after the declared params:
                </span>
              ),
              ko: (
                <span>
                  guard와 InternalArg는 signal 파일에서 만납니다. guard는 option에 넣고, InternalArg는{" "}
                  <code>.with()</code>로 선언한 param 뒤에 붙입니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/order/order.signal.ts"
            code={`import { CanCancelOrder, CurrentUserId, SignedIn } from "@apps/koyo/srvkit";
import { Admin } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint, internal, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class OrderInternal extends internal(srv.order, () => ({})) {}

export class OrderSlice extends slice(
  srv.order,
  { guards: { root: Admin, get: SignedIn, cru: Admin } }, // [!code highlight]
  () => ({}),
) {}

export class OrderEndpoint extends endpoint(srv.order, ({ mutation }) => ({
  cancelOrder: mutation(cnst.Order, { guards: [SignedIn, CanCancelOrder] }) // [!code highlight]
    .param("orderId", ID)
    .with(CurrentUserId) // [!code highlight]
    .exec(async function (orderId, currentUserId) {
      return await this.orderService.cancelOrder(orderId, currentUserId);
    }),
})) {}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Arguments arrive in order.</strong> exec receives the <code>.param()</code> values first,
                    then each <code>.with()</code> value.
                  </>
                ),
                ko: (
                  <>
                    <strong>인자는 순서대로 들어옵니다.</strong> exec는 <code>.param()</code> 값을 먼저, 그다음{" "}
                    <code>.with()</code> 값을 받습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>null</code> refuses the call.
                    </strong>{" "}
                    An InternalArg that returns <code>null</code> answers 401, unless you write{" "}
                    <code>.with(CurrentUserId, {"{ nullable: true }"})</code> and let exec receive <code>null</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>null</code>이면 호출이 거절됩니다.
                    </strong>{" "}
                    InternalArg가 <code>null</code>을 돌려주면 401로 응답합니다.{" "}
                    <code>.with(CurrentUserId, {"{ nullable: true }"})</code>로 쓰면 exec가 <code>null</code>을 그대로
                    받습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Never trust a client-supplied id.</strong> Take the acting user from an InternalArg, not
                    from a <code>.param()</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>클라이언트가 보낸 id는 믿지 않습니다.</strong> 행동하는 user는 <code>.param()</code>이
                    아니라 InternalArg에서 받습니다.
                  </>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: "Before writing your own, check the ones that already ship:",
              ko: "직접 만들기 전에 이미 있는 것부터 확인하세요:",
            })}
          </div>
          <Docs.IntroTable type="InternalArg" items={readyInternalArgs} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="service-logic"
        title={l.trans({ en: "Service Logic And External Libraries", ko: "서비스 로직과 외부 라이브러리" })}
      >
        <Docs.Title>
          {l.trans({ en: "Service Logic And External Libraries", ko: "서비스 로직과 외부 라이브러리" })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When a service needs crypto, an AI SDK, an HTTP client or another server-only package, wrap it in srvkit first. How the service then reaches it depends on what you wrapped:",
              ko: "service에 crypto, AI SDK, HTTP client 같은 서버 전용 패키지가 필요하면 먼저 srvkit에서 감쌉니다. 그다음 service가 가져다 쓰는 방법은 감싼 것의 종류에 따라 다릅니다:",
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "What you wrapped", ko: "감싼 것" })}
            descLabel={l.trans({ en: "How the service gets it", ko: "service가 받는 방법" })}
            items={wrapRows}
          />

          <Docs.SubSubTitle>{l.trans({ en: "Function helper", ko: "함수 helper" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  A function helper needs no wiring. This one uses <code>node:crypto</code>, which a service may not
                  import itself:
                </span>
              ),
              ko: (
                <span>
                  함수 helper는 따로 연결할 것이 없습니다. 아래 helper는 service가 직접 import할 수 없는{" "}
                  <code>node:crypto</code>를 씁니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/srvkit/createOrderHash.ts"
            code={`import { createHash } from "node:crypto";

export const createOrderHash = (orderId: string) => {
  return createHash("sha256").update(orderId).digest("hex");
};`}
          />

          <Docs.SubSubTitle>
            {l.trans({ en: "Class instance: the legacy shape", ko: "class 인스턴스: legacy 형태" })}
          </Docs.SubSubTitle>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Recognise this shape; do not copy it forward.</strong> The <code>option.ts</code> +{" "}
                  <code>use&lt;T&gt;()</code> pair is kept because existing code is written in it. New adaptors are an{" "}
                  <code>adapt()</code> class injected with <code>plug()</code>, as the next slide shows.
                </span>
              ),
              ko: (
                <span>
                  <strong>알아볼 수만 있으면 됩니다. 새로 쓰지는 마세요.</strong> <code>option.ts</code> +{" "}
                  <code>use&lt;T&gt;()</code> 조합은 기존 코드가 이 형태로 되어 있어 남아 있습니다. 새 adaptor는 다음
                  슬라이드처럼 <code>adapt()</code> class로 만들고 <code>plug()</code>로 주입합니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <div>
            {l.trans({
              en: "It takes three files. First, a plain class in srvkit:",
              ko: "파일 세 개가 필요합니다. 먼저 srvkit에 평범한 class를 둡니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/srvkit/emailClient.ts"
            code={`import { Mailer } from "some-mail-provider";

export class EmailClient {
  #mailer: Mailer;

  constructor(apiKey: string) {
    this.#mailer = new Mailer({ apiKey });
  }

  sendReceipt(to: string, receiptCode: string) {
    return this.#mailer.send({ to, subject: \`Receipt \${receiptCode}\` });
  }
}`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  Next, build one instance in <code>option.ts</code> under a key:
                </span>
              ),
              ko: (
                <span>
                  다음으로 <code>option.ts</code>에서 key 하나에 인스턴스를 만들어 둡니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/option.ts"
            code={`import { AkanOption } from "akanjs/server";
import { EmailClient } from "../srvkit";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions & {
  mailer: { apiKey: string };
};

export const option = new AkanOption<ModulesOptions>().use((options) => ({
  emailClient: new EmailClient(options.mailer.apiKey),
}));`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  Last, a <code>use&lt;T&gt;()</code> field with the same name in the service:
                </span>
              ),
              ko: (
                <span>
                  마지막으로 service에 같은 이름의 <code>use&lt;T&gt;()</code> 필드를 둡니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/order/order.service.ts"
            code={`import { createOrderHash, type EmailClient } from "@apps/koyo/srvkit";
import { serve } from "akanjs/service";

import * as db from "../db";

export class OrderService extends serve(db.order, ({ use }) => ({
  emailClient: use<EmailClient>(), // [!code highlight]
})) {
  async sendReceipt(order: db.Order) {
    const receiptCode = createOrderHash(order.id);
    await this.emailClient.sendReceipt(order.email, receiptCode);
  }
}`}
          />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>The field name is the key.</strong> <code>use&lt;T&gt;()</code> looks the value up by the
                    service field name, so <code>emailClient</code> must match the key in <code>.use()</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>필드 이름이 곧 key입니다.</strong> <code>use&lt;T&gt;()</code>는 service 필드 이름으로 값을
                    찾으므로, <code>emailClient</code>는 <code>.use()</code>의 key와 같아야 합니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>A function helper skips all of this.</strong> The same service imports{" "}
                    <code>createOrderHash</code> straight from <code>@apps/koyo/srvkit</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>함수 helper는 이 과정이 필요 없습니다.</strong> 같은 service가 <code>createOrderHash</code>
                    를 <code>@apps/koyo/srvkit</code>에서 바로 import합니다.
                  </>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="adaptor-plug" title={l.trans({ en: "Adaptor And plug", ko: "Adaptor와 plug" })}>
        <Docs.Title>{l.trans({ en: "Adaptor And plug", ko: "Adaptor와 plug" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  An adaptor is a singleton <code>adapt()</code> class that turns an outside system into a service
                  dependency. Declare it in srvkit and <code>plug()</code> it where it is needed; it registers itself,
                  so <code>option.ts</code> needs no entry.
                </span>
              ),
              ko: (
                <span>
                  Adaptor는 외부 시스템을 service dependency로 만드는 싱글턴 <code>adapt()</code> class입니다. srvkit에
                  선언하고 필요한 service에서 <code>plug()</code>하면 됩니다. 스스로 등록되므로 <code>option.ts</code>
                  에는 적을 것이 없습니다.
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/srvkit/paymentApi.ts"
            code={`import { adapt } from "akanjs/service";

export interface PaymentApiOptions {
  endpoint: string;
}

export class PaymentApi extends adapt("paymentApi" as const, ({ env }) => ({
  endpoint: env((option: PaymentApiOptions) => option.endpoint),
})) {
  async requestPayment(orderId: string, amount: number) {
    const body = JSON.stringify({ orderId, amount });
    return await this.#api("/payments", { method: "POST", body });
  }

  async #api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const url = \`\${this.endpoint}\${path}\`;
    const signal = AbortSignal.timeout(20_000);
    const response = await fetch(url, { ...init, signal });
    return (await response.json()) as T;
  }
}`}
          />
          <div>
            {l.trans({
              en: "The service plugs it by class:",
              ko: "service에서는 class를 그대로 plug합니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/order/order.service.ts"
            code={`import { PaymentApi } from "@apps/koyo/srvkit";
import { serve } from "akanjs/service";

import * as db from "../db";

export class OrderService extends serve(db.order, ({ plug }) => ({
  paymentApi: plug(PaymentApi), // [!code highlight]
})) {
  async pay(order: db.Order) {
    return await this.paymentApi.requestPayment(order.id, order.totalPrice);
  }
}`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  The <code>adapt()</code> builder hands you four injectors; destructure only the ones you use:
                </span>
              ),
              ko: (
                <span>
                  <code>adapt()</code>의 builder는 injector 네 가지를 넘겨줍니다. 쓰는 것만 구조 분해합니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Injector", ko: "주입 함수" })} items={injectors} />
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>One per process.</strong> <code>adapt()</code> is for singletons; a value object you create
                    per use stays a plain class you <code>new</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>프로세스당 하나입니다.</strong> <code>adapt()</code>는 싱글턴 전용입니다. 쓸 때마다 만드는
                    값 객체는 <code>new</code>로 만드는 평범한 class로 둡니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Adaptors can plug adaptors,</strong> as long as the plugs never form a cycle.
                  </>
                ),
                ko: (
                  <>
                    <strong>adaptor끼리도 plug할 수 있습니다.</strong> 단, plug가 순환을 이루면 안 됩니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Logger and lifecycle come built in.</strong> Use <code>this.logger</code> instead of a new{" "}
                    <code>Logger</code>, and put startup work in <code>override async onInit()</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>logger와 lifecycle은 기본 제공입니다.</strong> <code>Logger</code>를 새로 만들지 말고{" "}
                    <code>this.logger</code>를 쓰며, 시작 작업은 <code>override async onInit()</code>에 둡니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      Route remote calls through one <code>#api()</code>
                    </strong>{" "}
                    with <code>signal: AbortSignal.timeout(20_000)</code>, so no request hangs forever.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      원격 호출은 <code>#api()</code> 하나로 모읍니다.
                    </strong>{" "}
                    <code>signal: AbortSignal.timeout(20_000)</code>을 달아 요청이 끝없이 매달리지 않게 합니다.
                  </>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "Where the code goes", ko: "코드를 어디에 둘까" })}</Docs.SubSubTitle>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Move noisy server code out.</strong> Put server-only helper code in srvkit when a service or
                    signal would otherwise become noisy.
                  </>
                ),
                ko: (
                  <>
                    <strong>복잡해지는 서버 코드는 밖으로.</strong> service나 signal이 복잡해질 서버 전용 helper 코드는
                    srvkit에 둡니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>External libraries enter through srvkit.</strong> Wrap them here before any convention file
                    uses them.
                  </>
                ),
                ko: (
                  <>
                    <strong>외부 라이브러리는 srvkit으로 들어옵니다.</strong> convention 파일이 쓰기 전에 여기서 먼저
                    감쌉니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Guard to protect, InternalArg to supply.</strong> Guards protect requests; internal args
                    provide context-derived signal arguments.
                  </>
                ),
                ko: (
                  <>
                    <strong>막는 건 Guard, 넘기는 건 InternalArg.</strong> 요청 방어에는 Guard를, context에서 만든
                    signal 인자에는 InternalArg를 씁니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>adapt and plug for shared systems.</strong> Use them when a service needs a reusable
                    external system dependency.
                  </>
                ),
                ko: (
                  <>
                    <strong>공용 외부 시스템은 adapt와 plug로.</strong> service가 재사용 가능한 외부 시스템 dependency를
                    필요로 할 때 씁니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>App or library.</strong> App-specific integrations go in the app's srvkit; reusable ones go
                    in a library's srvkit.
                  </>
                ),
                ko: (
                  <>
                    <strong>app이냐 library냐.</strong> 앱 전용 연동은 app의 srvkit에, 재사용할 연동은 library의
                    srvkit에 둡니다.
                  </>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Inside a srvkit file", ko: "srvkit 파일 안에서" })}</Docs.SubSubTitle>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>camelCase file, PascalCase class.</strong> <code>paymentApi.ts</code> exports{" "}
                    <code>PaymentApi</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>파일은 camelCase, class는 PascalCase.</strong> <code>paymentApi.ts</code>가{" "}
                    <code>PaymentApi</code>를 export합니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Server only, in both directions.</strong> Client files (<code>ui/</code>,{" "}
                    <code>webkit/</code>, <code>*.store.ts</code>, every <code>.tsx</code>) cannot import srvkit, and
                    srvkit cannot import a store, <code>ui/</code>, <code>webkit/</code> or the <code>st</code> barrel.
                  </>
                ),
                ko: (
                  <>
                    <strong>클라이언트 코드와는 서로 import하지 않습니다.</strong> 클라이언트 파일(<code>ui/</code>,{" "}
                    <code>webkit/</code>, <code>*.store.ts</code>, 모든 <code>.tsx</code>)은 srvkit을 import할 수 없고,
                    srvkit도 store, <code>ui/</code>, <code>webkit/</code>, <code>st</code> barrel을 import할 수
                    없습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      Throw <code>Err</code>, never <code>Error</code>.
                    </strong>{" "}
                    Import <code>Err</code> from <code>../lib/dict</code>; an adaptor that catches logs with{" "}
                    <code>logger.error</code> and returns <code>null</code>.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>Error</code>가 아니라 <code>Err</code>를 throw합니다.
                    </strong>{" "}
                    <code>Err</code>는 <code>../lib/dict</code>에서 import하고, 예외를 잡은 adaptor는{" "}
                    <code>logger.error</code>로 남긴 뒤 <code>null</code>을 돌려줍니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>Resolve secrets inside a function.</strong> Write <code>process.env.X ?? options.x</code> in
                    the function that needs it, never at module scope.
                  </>
                ),
                ko: (
                  <>
                    <strong>secret은 함수 안에서 읽습니다.</strong> <code>process.env.X ?? options.x</code>는 필요한
                    함수 안에서 쓰고, module scope에는 두지 않습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>#private</code> is the house style here.
                    </strong>{" "}
                    Its lint ban covers only constant, document, service and store files.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      여기서는 <code>#private</code>이 기본입니다.
                    </strong>{" "}
                    <code>#private</code> 금지 lint는 constant, document, service, store 파일에만 걸립니다.
                  </>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <DocsToc />
    </Scroll>
  );
});
