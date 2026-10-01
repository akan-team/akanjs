import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, type MatrixGroup, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";
  const card = panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0");
  const surfacesTitle = l.trans({ en: "AkanServer Web Surfaces", ko: "AkanServer 웹 표면" });

  const termRows = [
    {
      name: "gateway",
      desc: l.trans({
        en: "The front process: it starts the replicas and relays HTTP and WebSocket traffic to them.",
        ko: "앞단 프로세스입니다. replica를 띄우고 HTTP와 WebSocket 요청을 replica로 넘깁니다.",
      }),
    },
    {
      name: "replica",
      desc: l.trans({
        en: "One server process that runs your modules. It takes traffic, runs batch work, or both.",
        ko: "모듈을 실행하는 서버 프로세스 하나입니다. 요청을 받거나, batch 작업을 돌리거나, 둘 다 합니다.",
      }),
    },
    {
      name: "solo",
      desc: l.trans({
        en: "A single replica running inside the `main.ts` process itself, with no gateway in front.",
        ko: "gateway 없이 `main.ts` 프로세스 안에서 바로 도는 replica 하나입니다.",
      }),
    },
    {
      name: "RSC worker",
      desc: l.trans({
        en: "A separate process that renders pages on the server. Each replica serving pages has one.",
        ko: "서버에서 페이지를 그리는 별도 프로세스입니다. 페이지를 서비스하는 replica마다 하나씩 있습니다.",
      }),
    },
    {
      name: "web proxy",
      desc: l.trans({
        en: "A class that sees each page load before the router and can redirect, rewrite or answer it.",
        ko: "라우터보다 먼저 페이지 로드를 받아 redirect하거나, rewrite하거나, 직접 응답하는 class입니다.",
      }),
    },
  ];

  const exportRows = [
    {
      name: "AkanApp",
      href: "#AkanApp",
      desc: l.trans({
        en: "Starts the app from `main.ts`: one process, or a gateway with replicas.",
        ko: "`main.ts`에서 앱을 띄웁니다. 프로세스 하나로, 또는 gateway와 replica로 실행합니다.",
      }),
    },
    {
      name: "AkanAppOptions",
      href: "#AkanAppOptions",
      desc: l.trans({
        en: "What `new AkanApp()` takes: replicas, port, route prefixes and which modules boot.",
        ko: "`new AkanApp()`이 받는 옵션입니다. replica 수, 포트, 경로 prefix, 부팅할 모듈을 정합니다.",
      }),
    },
    {
      name: "AkanServer",
      desc: l.trans({
        en: "One replica's server, generated into `server.ts`. It decides which web surfaces are served.",
        ko: "replica 하나의 서버입니다. `server.ts`에 생성되며, 어떤 웹 표면을 서비스할지 정합니다.",
      }),
    },
    {
      name: "AkanLib",
      desc: l.trans({
        en: "Bundles one app's or lib's modules and option. Also generated into `server.ts`.",
        ko: "앱이나 lib 하나의 모듈과 option을 묶습니다. 이것도 `server.ts`에 생성됩니다.",
      }),
    },
    {
      name: "AkanOption",
      href: "#AkanOption",
      desc: l.trans({
        en: "The builder `lib/option.ts` exports: injected values, middleware, proxies, MCP and LLM settings.",
        ko: "`lib/option.ts`가 export하는 builder입니다. 주입 값, middleware, proxy, MCP·LLM 설정을 담습니다.",
      }),
    },
    {
      name: "AkanResponse",
      href: "#AkanResponse",
      desc: l.trans({
        en: "Helpers a web proxy returns to continue, rewrite or redirect a request.",
        ko: "web proxy가 돌려주는 helper입니다. 요청을 계속 보내거나, rewrite하거나, redirect합니다.",
      }),
    },
    {
      name: "WebProxy",
      href: "#WebProxy",
      desc: l.trans({
        en: "The interface a web proxy class implements: one `use(request)` method.",
        ko: "web proxy class가 구현하는 interface입니다. `use(request)` 메서드 하나뿐입니다.",
      }),
    },
    {
      name: ["LocaleWebProxy", "HostBasePathWebProxy"],
      href: ["#WebProxy", "#WebProxy"],
      desc: l.trans({
        en: "The two built-in proxies. Every app runs them before its own.",
        ko: "기본 proxy 두 개입니다. 모든 앱이 자기 proxy보다 먼저 실행합니다.",
      }),
    },
    {
      name: "Try",
      href: "#Try",
      desc: l.trans({
        en: "Legacy decorator: logs a warning and returns `undefined` instead of throwing.",
        ko: "legacy decorator입니다. 에러를 던지는 대신 경고를 남기고 `undefined`를 반환합니다.",
      }),
    },
    {
      name: "Transaction",
      href: "#Transaction",
      desc: l.trans({
        en: "Legacy decorator: runs a method in a database transaction.",
        ko: "legacy decorator입니다. 메서드를 DB transaction 안에서 실행합니다.",
      }),
    },
    {
      name: <span className="font-sans">{l.trans({ en: "Everything else", ko: "그 밖의 export" })}</span>,
      desc: l.trans({
        en: "Build-artifact types and console, OAuth, sitemap and metrics helpers the framework and CLI use.",
        ko: "빌드 artifact 타입과 console·OAuth·sitemap·metrics helper입니다. 프레임워크와 CLI가 씁니다.",
      }),
    },
  ];

  const importRows = [
    {
      name: "main.ts",
      desc: l.trans({
        en: "Use the leaf path, which keeps the SSR renderer out of the gateway.",
        ko: "이 경로로 import해야 gateway가 SSR 렌더러를 싣지 않습니다.",
      }),
      example: 'import { AkanApp } from "akanjs/server/akanApp";',
    },
    {
      name: "server.ts",
      desc: l.trans({ en: "Generated; never edit it by hand.", ko: "생성되는 파일이므로 직접 고치지 않습니다." }),
      example: 'import { AkanLib, AkanServer } from "akanjs/server";',
    },
    {
      name: "lib/option.ts",
      desc: l.trans({ en: "One per app and one per lib.", ko: "앱마다, lib마다 하나씩 있습니다." }),
      example: 'import { AkanOption } from "akanjs/server";',
    },
    {
      name: "srvkit/*.ts",
      desc: l.trans({
        en: "Server-only helpers: proxy classes and legacy decorated classes.",
        ko: "서버 전용 helper입니다. proxy class와 legacy decorator를 쓰는 class가 있습니다.",
      }),
      example: 'import { AkanResponse, Try, type WebProxy } from "akanjs/server";',
    },
  ];

  const onlySolo = { solo: true };
  const onlyGateway = { gateway: true };
  const soloColumns = [
    { key: "solo", label: l.trans({ en: "Solo", ko: "solo 실행" }) },
    { key: "gateway", label: l.trans({ en: "Gateway", ko: "gateway 실행" }) },
  ];
  const soloGroups: MatrixGroup[] = [
    {
      label: l.trans({ en: "Default", ko: "기본값" }),
      rows: [
        {
          name: "AKAN_REPLICA=0,0,1",
          desc: l.trans({
            en: "One replica that takes traffic and runs batch work. There is nothing to balance.",
            ko: "요청과 batch 작업을 모두 맡는 replica 하나입니다. 나눠 줄 대상이 없습니다.",
          }),
          marks: onlySolo,
        },
      ],
    },
    {
      label: l.trans({ en: "Brings the gateway back", ko: "gateway가 다시 필요한 경우" }),
      rows: [
        {
          name: "AKAN_REPLICA=0,0,2",
          desc: l.trans({
            en: "Two or more replicas: the gateway spreads traffic across them.",
            ko: "replica가 둘 이상이면 gateway가 요청을 나눠 줍니다.",
          }),
          marks: onlyGateway,
        },
        {
          name: "AKAN_REPLICA=0,1,0",
          desc: l.trans({
            en: "A batch-only replica never listens, so the gateway answers health checks.",
            ko: "batch 전용 replica는 요청을 받지 않으므로 health check는 gateway가 답합니다.",
          }),
          marks: onlyGateway,
        },
        {
          name: "new AkanApp({ replica })",
          desc: l.trans({
            en: "Stating a replica layout in code asks for the gateway that serves it.",
            ko: "코드에 replica 구성을 적으면 그 구성을 위한 gateway를 띄웁니다.",
          }),
          marks: onlyGateway,
        },
        {
          name: "AKAN_SOLO=false",
          desc: l.trans({
            en: "Forces the gateway even for one replica.",
            ko: "replica가 하나여도 gateway를 띄웁니다.",
          }),
          marks: onlyGateway,
        },
        {
          name: "akan start",
          desc: l.trans({
            en: "The dev server always runs the gateway.",
            ko: "개발 서버는 항상 gateway로 실행합니다.",
          }),
          marks: onlyGateway,
        },
      ],
    },
  ];

  const appOptionRows = [
    {
      key: "replica",
      type: "number | string",
      default: '"0,0,1"',
      tags: ["AKAN_REPLICA"],
      desc: l.trans({
        en: "Replica counts as `federation,batch,all`. Passing it here keeps the gateway on.",
        ko: "`federation,batch,all` 순서의 replica 수입니다. 여기에 적으면 gateway가 켜집니다.",
      }),
    },
    {
      key: "serverPath",
      type: "string",
      default: '"./server"',
      desc: l.trans({
        en: "The server module each replica runs, resolved next to `main.ts`.",
        ko: "replica가 실행할 server 모듈입니다. `main.ts` 옆에서 찾습니다.",
      }),
    },
    {
      key: "runtimeDir",
      type: "string",
      default: "local/apps/<app>/runtime",
      tags: ["AKAN_RUNTIME_DIR"],
      desc: l.trans({
        en: "Replica sockets and rotating logs. It is `./runtime` when `NODE_ENV=production`.",
        ko: "replica 소켓과 순환 로그 파일을 두는 곳입니다. `NODE_ENV=production`이면 `./runtime`입니다.",
      }),
    },
    {
      key: "port",
      type: "number",
      default: "8282",
      tags: ["PORT"],
      desc: l.trans({
        en: "The port the app listens on. A replica calling itself uses it too.",
        ko: "앱이 요청을 받는 포트입니다. 서버가 자기 자신을 호출할 때도 이 포트를 씁니다.",
      }),
    },
    {
      key: "wsBasePort",
      type: "number",
      default: "port + 10000",
      tags: ["AKAN_WS_BASE_PORT"],
      desc: l.trans({
        en: "Replica `i` takes WebSocket traffic from the gateway on this port plus `i`.",
        ko: "`i`번 replica는 이 포트에 `i`를 더한 포트로 gateway의 WebSocket 요청을 받습니다.",
      }),
    },
    {
      key: "openapi",
      type: "boolean",
      default: "false",
      tags: ["AKAN_OPENAPI"],
      desc: l.trans({
        en: "Serves `/openapi.json`, a description of every endpoint.",
        ko: "모든 endpoint를 설명하는 `/openapi.json`을 제공합니다.",
      }),
    },
    {
      key: "prefix",
      type: "string",
      default: '"/api"',
      tags: ["AKAN_API_PREFIX"],
      desc: l.trans({
        en: "Where endpoints are mounted. CSR and mobile bundles follow `api.prefix` in `akan.config.ts`.",
        ko: "endpoint가 붙는 경로입니다. CSR·모바일 번들은 `akan.config.ts`의 `api.prefix`를 따릅니다.",
      }),
    },
    {
      key: "websocketPrefix",
      type: "string",
      default: '"/ws"',
      tags: ["AKAN_WS_PREFIX"],
      desc: l.trans({
        en: "Where the WebSocket upgrade sits, under `prefix`.",
        ko: "`prefix` 아래에서 WebSocket 연결을 받는 경로입니다.",
      }),
    },
    {
      key: "modules",
      type: "string[]",
      tags: ["AKAN_MODULES"],
      desc: l.trans({
        en: "Boot only these modules and the ones they reach. Empty boots every enabled module.",
        ko: "이 모듈과 이 모듈이 닿는 모듈만 부팅합니다. 비워 두면 활성화된 모듈을 전부 부팅합니다.",
      }),
    },
    {
      key: "disableModules",
      type: "string[]",
      tags: ["AKAN_DISABLE_MODULES"],
      desc: l.trans({
        en: "Boot everything except these and whatever reaches them. Applied after `modules`.",
        ko: "이 모듈과 이 모듈에 닿는 모듈만 빼고 전부 부팅합니다. `modules` 다음에 적용됩니다.",
      }),
    },
    {
      key: "disableLibs",
      type: "string[]",
      tags: ["AKAN_DISABLE_LIBS"],
      desc: l.trans({
        en: "Leave out every module the named libs registered, and whatever reaches them.",
        ko: "지정한 lib이 등록한 모듈 전부와, 그 모듈에 닿는 모듈을 뺍니다.",
      }),
    },
    {
      key: "solo",
      type: "boolean",
      tags: ["AKAN_SOLO"],
      desc: l.trans({
        en: "Overrides the automatic solo or gateway choice. The env can turn solo off, never on.",
        ko: "solo·gateway 자동 선택을 덮어씁니다. 환경변수로는 solo를 끌 수만 있고 켤 수는 없습니다.",
      }),
    },
  ];

  const replicaRows = [
    {
      name: ["1", "federation"],
      desc: l.trans({
        en: 'Takes traffic. Skips work declared `serverMode: "batch"`.',
        ko: '요청을 받습니다. `serverMode: "batch"`로 선언한 작업은 건너뜁니다.',
      }),
    },
    {
      name: ["2", "batch"],
      desc: l.trans({
        en: 'Never listens. Skips work declared `serverMode: "federation"`.',
        ko: '요청을 받지 않습니다. `serverMode: "federation"`으로 선언한 작업은 건너뜁니다.',
      }),
    },
    {
      name: ["3", "all"],
      desc: l.trans({ en: "Takes traffic and runs every kind of work.", ko: "요청도 받고 모든 작업을 실행합니다." }),
    },
  ];

  const surfaceColumns = [
    { key: "api", label: "API", caption: "/api" },
    { key: "ssr", label: "SSR", caption: "RSC worker" },
    { key: "csr", label: "CSR", caption: "/__csr" },
  ];
  const surfaceGroups: MatrixGroup[] = [
    {
      label: l.trans({ en: "At build — `akan.config.ts`", ko: "빌드 — `akan.config.ts`" }),
      rows: [
        {
          name: "web: true",
          desc: l.trans({
            en: "The default: pages, the mobile bundle and the API.",
            ko: "기본값입니다. 페이지, 모바일 번들, API를 모두 제공합니다.",
          }),
          marks: { api: true, ssr: true, csr: true },
        },
        {
          name: "web: { csr: false }",
          desc: l.trans({
            en: "No mobile bundle, so `/__csr` and `?csr=true` are gone. Not allowed with a `native` section.",
            ko: "모바일 번들이 없어 `/__csr`와 `?csr=true`가 사라집니다. `native` 설정이 있으면 쓸 수 없습니다.",
          }),
          marks: { api: true, ssr: true },
        },
        {
          name: "web: false",
          desc: l.trans({
            en: "An API-only build. Nothing under `page/` is served.",
            ko: "API 전용 빌드입니다. `page/` 아래는 아무것도 제공하지 않습니다.",
          }),
          marks: { api: true },
        },
      ],
    },
    {
      label: l.trans({ en: "At runtime — env", ko: "실행 중 — 환경변수" }),
      rows: [
        {
          name: "AKAN_CSR=false",
          desc: l.trans({
            en: "Drops the CSR bundle for this deployment.",
            ko: "이 배포에서 CSR 번들만 끕니다.",
          }),
          marks: { api: true, ssr: true },
        },
        {
          name: "AKAN_SSR=false",
          desc: l.trans({
            en: "Drops pages and the RSC worker. CSR goes too, since its bundle reuses the SSR stylesheet.",
            ko: "페이지와 RSC worker를 끕니다. CSR 번들은 SSR 스타일시트를 쓰므로 함께 꺼집니다.",
          }),
          marks: { api: true },
        },
      ],
    },
  ];

  const optionMethodRows = [
    {
      name: "use(fn | object)",
      desc: l.trans({
        en: "Registers values a service reads with `use<T>()`. A function gets the env; a Promise is awaited.",
        ko: "service가 `use<T>()`로 읽을 값을 등록합니다. 함수는 env를 받고, Promise 값은 기다렸다가 씁니다.",
      }),
    },
    {
      name: "applyMiddleware(...classes)",
      desc: l.trans({
        en: "Adds signal middleware. `Logging` and `Timeout` are already registered.",
        ko: "signal middleware를 추가합니다. `Logging`과 `Timeout`은 이미 등록되어 있습니다.",
      }),
    },
    {
      name: "applyAdaptor(role, adaptor)",
      desc: l.trans({
        en: "Swaps a built-in adaptor role, such as `LlmAdaptorRole`, for your own class.",
        ko: "`LlmAdaptorRole` 같은 기본 adaptor 역할을 내 class로 바꿉니다.",
      }),
    },
    {
      name: "applyWebProxy(...proxies)",
      desc: l.trans({
        en: "Adds web proxies, each as a class or `{ proxy, matcher }`.",
        ko: "web proxy를 추가합니다. class 또는 `{ proxy, matcher }` 형태로 넘깁니다.",
      }),
    },
    {
      name: "setMcp(option | fn)",
      desc: l.trans({
        en: "Settings for the MCP server at `/mcp`. `false` takes it off.",
        ko: "`/mcp`에 뜨는 MCP 서버의 설정입니다. `false`를 주면 MCP 서버를 내립니다.",
      }),
    },
    {
      name: "setAgentAccess(guards)",
      desc: l.trans({
        en: "Guards a caller must pass to spend the LLM key through the agent chat. Several are ANDed.",
        ko: "agent 채팅으로 LLM 키를 쓰려면 통과해야 하는 guard입니다. 여러 개면 모두 통과해야 합니다.",
      }),
    },
    {
      name: "setLlm(option | fn)",
      desc: l.trans({
        en: "The model the agent relay talks to: `apiKey`, `model`, `host` and more.",
        ko: "agent relay가 말을 거는 모델입니다. `apiKey`, `model`, `host` 등을 줍니다.",
      }),
    },
    {
      name: "setCrossSite(option)",
      desc: l.trans({
        en: "Extra origins a browser may send mutations and open the websocket from. `{ enabled: false }` turns the check off.",
        ko: "브라우저가 mutation을 보내고 웹소켓을 열어도 되는 다른 origin입니다. `{ enabled: false }`면 검사를 끕니다.",
      }),
    },
  ];

  const mergeRows = [
    {
      name: "use",
      desc: l.trans({
        en: "Keys must be unique across all libs. `llmOption` is reserved.",
        ko: "키는 모든 lib을 통틀어 겹치면 안 됩니다. `llmOption`은 예약된 키입니다.",
      }),
    },
    {
      name: "applyMiddleware",
      desc: l.trans({
        en: "One per `refName`; the later registration wins.",
        ko: "`refName`마다 하나입니다. 나중에 등록한 것이 이깁니다.",
      }),
    },
    {
      name: "applyAdaptor",
      desc: l.trans({ en: "The last override of a role wins.", ko: "같은 역할이면 마지막 override가 이깁니다." }),
    },
    {
      name: "applyWebProxy",
      desc: l.trans({
        en: "All run: the two built-ins first, then each lib's in order.",
        ko: "모두 실행됩니다. 기본 proxy 두 개가 먼저, 그다음 lib 순서대로입니다.",
      }),
    },
    {
      name: "setMcp",
      desc: l.trans({
        en: "Merged field by field; the app's values win.",
        ko: "필드 단위로 합쳐지고, 앱의 값이 이깁니다.",
      }),
    },
    {
      name: "setLlm",
      desc: l.trans({
        en: "Merged field by field, so a lib may name the host and the app the key.",
        ko: "필드 단위로 합쳐집니다. lib이 host를, 앱이 키를 정할 수 있습니다.",
      }),
    },
    {
      name: "setAgentAccess",
      desc: l.trans({
        en: "The last call wins; `null` clears what a lib set.",
        ko: "마지막 호출이 이깁니다. `null`은 lib이 정한 값을 지웁니다.",
      }),
    },
    {
      name: "setCrossSite",
      desc: l.trans({ en: "The last call wins.", ko: "마지막 호출이 이깁니다." }),
    },
  ];

  const optionLinks = [
    {
      href: "/cheatsheet/interface/mcp#enable",
      title: l.trans({ en: "MCP Server", ko: "MCP 서버" }),
      desc: l.trans({
        en: "Turning `/mcp` on and off, and what `setMcp` configures.",
        ko: "`/mcp`를 켜고 끄는 법과 `setMcp`로 정하는 것들입니다.",
      }),
    },
    {
      href: "/cheatsheet/interface/agent-chat#mount",
      title: l.trans({ en: "Agent Chat", ko: "agent 채팅" }),
      desc: l.trans({
        en: "Mounting the chat, then `setLlm` and `setAgentAccess`.",
        ko: "채팅을 마운트하고 `setLlm`, `setAgentAccess`를 설정합니다.",
      }),
    },
    {
      href: "/conventions/applib/srvkit#server-level-appliance",
      title: l.trans({ en: "Middleware And Web Proxies", ko: "middleware와 web proxy" }),
      desc: l.trans({
        en: "Writing the classes `applyMiddleware` and `applyWebProxy` take.",
        ko: "`applyMiddleware`, `applyWebProxy`에 넘길 class를 작성합니다.",
      }),
    },
  ];

  const helperColumns = [
    { key: "helper", label: l.trans({ en: "Helper", ko: "helper" }), code: true },
    { key: "effect", label: l.trans({ en: "What happens", ko: "결과" }) },
  ];
  const helperRows = [
    {
      helper: "AkanResponse.next({ request: { headers } })",
      effect: l.trans({
        en: "Goes on to the next proxy and the page, carrying the headers you set.",
        ko: "바꾼 header를 들고 다음 proxy와 page로 넘어갑니다.",
      }),
    },
    {
      helper: "AkanResponse.rewrite(url, { request? })",
      effect: l.trans({
        en: "Goes on with a new URL. The browser's address bar keeps the old one.",
        ko: "새 URL로 계속 진행합니다. 브라우저 주소창은 원래 URL 그대로입니다.",
      }),
    },
    {
      helper: "AkanResponse.redirect(url, status = 307)",
      effect: l.trans({
        en: "Returns a redirect `Response`. Later proxies and the page do not run.",
        ko: "redirect `Response`를 돌려줍니다. 뒤의 proxy와 page는 실행되지 않습니다.",
      }),
    },
  ];

  const returnRows = [
    {
      name: "undefined",
      desc: l.trans({ en: "Passes the request on unchanged.", ko: "요청을 손대지 않고 넘깁니다." }),
    },
    {
      name: "Response",
      desc: l.trans({
        en: "Answers right away. Later proxies and the page do not run.",
        ko: "바로 응답합니다. 뒤의 proxy와 page는 실행되지 않습니다.",
      }),
    },
    {
      name: ["AkanResponse.next", "AkanResponse.rewrite"],
      desc: l.trans({
        en: "Goes on with new headers or a new URL, as the AkanResponse section shows.",
        ko: "새 header나 새 URL로 계속 진행합니다. 자세한 내용은 AkanResponse 절에 있습니다.",
      }),
    },
  ];

  const matcherRows = [
    {
      name: <span className="font-sans">{l.trans({ en: "(omitted)", ko: "(생략)" })}</span>,
      desc: l.trans({
        en: "Page paths only: skips `/__csr`, `/_akan/*` and paths with a file extension.",
        ko: "페이지 경로만 받습니다. `/__csr`, `/_akan/*`, 확장자가 붙은 경로는 건너뜁니다.",
      }),
    },
    {
      name: '"/ko/shop"',
      desc: l.trans({ en: "That path and everything under it.", ko: "그 경로와 그 아래 전부입니다." }),
    },
    {
      name: "/^\\/[a-z]{2}\\/shop/",
      desc: l.trans({
        en: "A `RegExp`, tested against the pathname.",
        ko: "pathname에 대해 검사하는 `RegExp`입니다.",
      }),
    },
    {
      name: "(request) => boolean",
      desc: l.trans({ en: "Your own test on the whole request.", ko: "요청 전체를 보고 직접 판단하는 함수입니다." }),
    },
  ];

  const builtinProxyRows = [
    {
      name: "LocaleWebProxy",
      desc: l.trans({
        en: "Redirects a path with no locale to `/<locale>/…` (307) and sets `x-locale` and `x-path`.",
        ko: "locale이 없는 경로를 `/<locale>/…`로 redirect(307)하고 `x-locale`, `x-path` header를 붙입니다.",
      }),
    },
    {
      name: "HostBasePathWebProxy",
      desc: l.trans({
        en: "Maps the host to a basePath from `routes` in `akan.config.ts` and rewrites into it.",
        ko: "요청 host를 `akan.config.ts`의 `routes`에 적은 basePath로 연결하고 그 경로로 rewrite합니다.",
      }),
    },
  ];

  const proxyTypeRows = [
    {
      name: "WebProxy",
      desc: l.trans({
        en: "The interface. `use(request)` returns a `WebProxyReturn`, sync or async.",
        ko: "interface입니다. `use(request)`는 `WebProxyReturn`을 동기나 비동기로 돌려줍니다.",
      }),
    },
    {
      name: "WebProxyCls",
      desc: l.trans({
        en: "A proxy class: constructed with no arguments, with a `static refName`.",
        ko: "proxy class입니다. 인자 없이 생성되고 `static refName`을 가집니다.",
      }),
    },
    {
      name: "WebProxyRegistration",
      desc: l.trans({
        en: "What `applyWebProxy` takes: a class, or `{ proxy, matcher? }`.",
        ko: "`applyWebProxy`가 받는 값입니다. class 또는 `{ proxy, matcher? }`입니다.",
      }),
    },
    {
      name: "WebProxyMatcher",
      desc: l.trans({
        en: "A path prefix `string`, a `RegExp`, or `(request) => boolean`.",
        ko: "경로 prefix `string`, `RegExp`, `(request) => boolean` 중 하나입니다.",
      }),
    },
    {
      name: "WebProxyReturn",
      desc: l.trans({
        en: "`Response`, a `WebProxyResult`, or `undefined`.",
        ko: "`Response`, `WebProxyResult`, `undefined` 중 하나입니다.",
      }),
    },
    {
      name: ["WebProxyResult", "WebProxyNextInit"],
      desc: l.trans({
        en: "What `next` and `rewrite` return, and the `{ request: { headers } }` they take.",
        ko: "`next`와 `rewrite`가 돌려주는 값, 그리고 두 helper가 받는 `{ request: { headers } }`입니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="akanjs-server" title="akanjs/server">
        <Docs.Title>akanjs/server</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`akanjs/server` is the server half of Akan: it starts the app, holds the server settings, and sees page loads before the router. Import it only from server files — `main.ts`, `lib/option.ts` and `srvkit/`.",
              ko: "`akanjs/server`는 Akan의 서버 쪽 패키지입니다. 앱을 띄우고, 서버 설정을 담고, 라우터보다 먼저 페이지 로드를 봅니다. `main.ts`, `lib/option.ts`, `srvkit/` 같은 서버 파일에서만 import합니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words Used On This Page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Exports", ko: "export 목록" })}</Docs.SubSubTitle>
          <Docs.IntroTable type="export" items={exportRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Where It Is Imported", ko: "어디서 import하나" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "File", ko: "파일" })} items={importRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="AkanApp" title="AkanApp">
        <Docs.Title>AkanApp</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`AkanApp` is what `main.ts` starts. It decides how many server processes run, and keeps them running until the container stops.",
              ko: "`AkanApp`은 `main.ts`가 실행하는 객체입니다. 서버 프로세스를 몇 개 띄울지 정하고, 컨테이너가 멈출 때까지 그 프로세스들을 살려 둡니다.",
            })}
          </div>
          <div>{l.trans({ en: "A whole `main.ts`:", ko: "`main.ts` 전체는 이 정도입니다:" })}</div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/main.ts"
          code={`import { AkanApp } from "akanjs/server/akanApp";

const run = async () => {
  await new AkanApp("./server", { openapi: true }).start();
};
void run();`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Two call shapes.</strong> <code>new AkanApp(serverPath?, options?)</code> or{" "}
                    <code>new AkanApp(options)</code>. The server path defaults to <code>./server</code>, next to{" "}
                    <code>main.ts</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>두 가지로 부릅니다.</strong> <code>new AkanApp(serverPath?, options?)</code> 또는{" "}
                    <code>new AkanApp(options)</code>입니다. server 경로 기본값은 <code>main.ts</code> 옆의{" "}
                    <code>./server</code>입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>start()</code> boots everything.
                    </strong>{" "}
                    In solo mode it loads <code>server.ts</code> in the same process; otherwise it spawns one child per
                    replica.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>start()</code>가 전부 띄웁니다.
                    </strong>{" "}
                    solo일 때는 같은 프로세스에서 <code>server.ts</code>를 불러오고, 아니면 replica마다 자식 프로세스를
                    하나씩 띄웁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>
            {l.trans({ en: "One Process Or A Gateway", ko: "프로세스 하나, 또는 gateway" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "With one replica that takes traffic there is nothing to balance, so `AkanApp` runs it inside its own process. Anything else puts a gateway in front:",
              ko: "요청을 받는 replica가 하나뿐이면 나눠 줄 대상이 없으므로, `AkanApp`은 그 replica를 자기 프로세스 안에서 실행합니다. 그 밖의 경우에는 앞에 gateway를 둡니다:",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Setting", ko: "설정" })}
            columns={soloColumns}
            groups={soloGroups}
            markLabel={l.trans({ en: "runs this way", ko: "이렇게 실행" })}
            emptyLabel={l.trans({ en: "does not", ko: "해당 없음" })}
          />
          <div>{l.trans({ en: "What the gateway does:", ko: "gateway가 하는 일은 네 가지입니다:" })}</div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            <div className={card}>
              <div className="font-semibold text-primary">{l.trans({ en: "Starts Replicas", ko: "replica 실행" })}</div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: "Spawns each replica and restarts one that crashes, waiting 1s, 2s, 4s… up to 30s.",
                  ko: "replica를 자식 프로세스로 띄우고, 죽으면 1초, 2초, 4초… 최대 30초 간격으로 다시 띄웁니다.",
                })}
              </div>
            </div>
            <div className={card}>
              <div className="font-semibold text-primary">{l.trans({ en: "Relays Traffic", ko: "요청 중계" })}</div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: "Forwards HTTP over a unix socket and WebSocket over a local port to each replica.",
                  ko: "HTTP는 unix socket으로, WebSocket은 로컬 포트로 각 replica에 넘깁니다.",
                })}
              </div>
            </div>
            <div className={card}>
              <div className="font-semibold text-primary">{l.trans({ en: "Reports Health", ko: "상태 보고" })}</div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: "Collects each replica's metrics and answers for the whole tree.",
                  ko: "replica마다 metrics를 모아 전체 프로세스의 상태를 알려 줍니다.",
                })}
              </div>
              <code className={chip}>/_akan/app/health · /_akan/app/metrics</code>
            </div>
            <div className={card}>
              <div className="font-semibold text-primary">{l.trans({ en: "Stops Cleanly", ko: "깔끔한 종료" })}</div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: "On SIGINT or SIGTERM it asks each replica to stop, then kills what is left after 30s.",
                  ko: "SIGINT나 SIGTERM을 받으면 replica마다 종료를 요청하고, 30초 뒤에도 남은 프로세스는 강제로 끝냅니다.",
                })}
              </div>
            </div>
          </div>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Solo answers the same routes.</strong> A solo process serves <code>/_akan/app/health</code>{" "}
                    and <code>/_akan/app/metrics</code> in the gateway's shape, so a probe reads one contract either
                    way.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>solo도 같은 경로에 답합니다.</strong> solo 프로세스도 <code>/_akan/app/health</code>와{" "}
                    <code>/_akan/app/metrics</code>를 gateway와 같은 모양으로 제공하므로, probe는 어느 쪽이든 똑같이
                    읽습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Nothing restarts a solo process but your orchestrator.</strong> Keep liveness and readiness
                    probes on the container.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>solo 프로세스를 다시 띄우는 것은 오케스트레이터뿐입니다.</strong> 컨테이너에 liveness,
                    readiness probe를 걸어 둡니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Import <code>AkanApp</code> from <code>akanjs/server/akanApp</code>.
                  </strong>{" "}
                  The <code>akanjs/server</code> barrel also loads <code>AkanServer</code> with the SSR renderer and the
                  database driver, which the gateway never runs.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>AkanApp</code>은 <code>akanjs/server/akanApp</code>에서 import합니다.
                  </strong>{" "}
                  <code>akanjs/server</code> barrel은 <code>AkanServer</code>와 함께 SSR 렌더러, DB 드라이버까지
                  불러오는데, gateway는 이것들을 전혀 쓰지 않습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="AkanAppOptions" title="AkanAppOptions">
        <Docs.Title>AkanAppOptions</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Every field is optional. With none, `AkanApp` runs one replica on port 8282, and each field can also come from the env named beside it; the option wins.",
              ko: "모든 필드는 선택입니다. 아무것도 주지 않으면 8282 포트에서 replica 하나로 실행합니다. 각 필드는 옆에 적힌 환경변수로도 줄 수 있고, 둘 다 있으면 옵션이 이깁니다.",
            })}
          </div>
          <Docs.OptionTable items={appOptionRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Reading replica", ko: "replica 값 읽는 법" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "`replica` is three counts separated by commas, one per role:",
              ko: "`replica`는 쉼표로 나눈 숫자 세 개이고, 자리마다 역할이 다릅니다:",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Position · role", ko: "자리 · 역할" })} items={replicaRows} />
          <div>
            {l.trans({
              en: "Three replicas behind a gateway, all booting only the `article` module:",
              ko: "gateway 뒤에 replica 세 개를 두고, 모두 `article` 모듈만 부팅하는 예시입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/main.ts"
          code={`import { AkanApp, type AkanAppOptions } from "akanjs/server/akanApp";

const options: AkanAppOptions = {
  replica: "1,0,2",
  runtimeDir: "./runtime",
  modules: ["article"],
};

const run = async () => {
  await new AkanApp(options).start();
};
void run();`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>1,0,2</code> is three processes.
                    </strong>{" "}
                    One <code>federation</code> replica and two <code>all</code> replicas, with the gateway in front.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>1,0,2</code>는 프로세스 세 개입니다.
                    </strong>{" "}
                    <code>federation</code> replica 하나와 <code>all</code> replica 둘이고, 앞에 gateway가 섭니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A bare number means federation.</strong> <code>replica: 3</code> is <code>3,0,0</code>, so
                    work declared <code>{'serverMode: "batch"'}</code> runs nowhere.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>숫자 하나만 쓰면 federation입니다.</strong> <code>replica: 3</code>은 <code>3,0,0</code>
                    이므로, <code>{'serverMode: "batch"'}</code>로 선언한 작업은 어디서도 돌지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Modules bring their dependencies.</strong> <code>{'modules: ["article"]'}</code> also boots
                    every service and signal that <code>article</code> injects, in every replica.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>모듈은 의존하는 모듈을 데려옵니다.</strong> <code>{'modules: ["article"]'}</code>는{" "}
                    <code>article</code>이 주입받는 service와 signal까지 모든 replica에서 함께 부팅합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.LinkGrid
            items={[
              {
                href: "/docs/core/runtime#module-selection",
                title: l.trans({ en: "Selective Module Boot", ko: "모듈 선택 실행" }),
                desc: l.trans({
                  en: "`modules`, `disableModules` and `disableLibs` in depth.",
                  ko: "`modules`, `disableModules`, `disableLibs`를 자세히 다룹니다.",
                }),
              },
              {
                href: "/docs/core/runtime#openapi-json",
                title: "OpenAPI JSON",
                desc: l.trans({
                  en: "What `openapi: true` serves at `/openapi.json`.",
                  ko: "`openapi: true`가 `/openapi.json`에서 제공하는 문서입니다.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="AkanServer web surfaces" title={surfacesTitle}>
        <Docs.Title>{surfacesTitle}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Besides its API, an app serves up to two web surfaces: SSR pages, and the CSR bundle the mobile app ships. The build decides which exist; at runtime you can only turn them off.",
              ko: "앱은 API 말고도 웹 표면을 최대 두 개 제공합니다. SSR 페이지와, 모바일 앱에 들어가는 CSR 번들입니다. 무엇이 있을지는 빌드가 정하고, 실행 중에는 끄는 것만 할 수 있습니다.",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Setting", ko: "설정" })}
            columns={surfaceColumns}
            groups={surfaceGroups}
            markLabel={l.trans({ en: "served", ko: "제공함" })}
            emptyLabel={l.trans({ en: "not served", ko: "제공 안 함" })}
          />
          <div>
            {l.trans({
              en: "To turn a surface off for one deployment, set the env:",
              ko: "배포 하나에서만 표면을 끌 때는 환경변수를 씁니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="Terminal"
          language="bash"
          code={`# api only, no RSC worker process
AKAN_SSR=false bun main.js

# web without the mobile SPA bundle
AKAN_CSR=false bun main.js`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Runtime only narrows.</strong> <code>false</code> or <code>0</code> turns a surface off, and
                    a surface the build left out never comes back.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>실행 중에는 좁히기만 합니다.</strong> <code>false</code>나 <code>0</code>이면 표면을 끄고,
                    빌드에서 뺀 표면은 다시 켤 수 없습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The same from code.</strong> <code>{"server.setWeb(true | false | { csr })"}</code> or{" "}
                    <code>{"server.init({ web })"}</code> narrows the same way, before the server starts.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>코드로도 똑같이 합니다.</strong> <code>{"server.setWeb(true | false | { csr })"}</code>나{" "}
                    <code>{"server.init({ web })"}</code>로, 서버가 시작하기 전에 같은 방식으로 좁힙니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Why turn SSR off.</strong> SSR is the RSC renderer plus its own RSC worker process per
                    replica; an API-only process runs neither.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>SSR을 끄는 이유.</strong> SSR은 RSC 렌더러와, replica마다 따로 도는 RSC worker 프로세스로
                    이뤄집니다. API 전용 프로세스는 둘 다 띄우지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Dev ignores it.</strong> <code>akan start</code> serves every surface, whatever{" "}
                    <code>web</code> says.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>개발 서버는 무시합니다.</strong> <code>akan start</code>는 <code>web</code> 설정과 상관없이
                    모든 표면을 제공합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.LinkGrid
            items={[
              {
                href: "/docs/core/config#web-surfaces",
                title: l.trans({ en: "Web Surfaces And Prefixes", ko: "웹 표면과 경로 접두사" }),
                desc: l.trans({
                  en: "Declaring `web` and `api` in `akan.config.ts`.",
                  ko: "`akan.config.ts`에 `web`과 `api`를 선언하는 법입니다.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="AkanOption" title="AkanOption">
        <Docs.Title>AkanOption</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`lib/option.ts` exports one `AkanOption`. It carries the server settings a lib or app owns, from injected values to MCP and LLM settings.",
              ko: "`lib/option.ts`는 `AkanOption` 하나를 export합니다. 주입할 값부터 MCP·LLM 설정까지, lib이나 앱이 가진 서버 설정을 담습니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={optionMethodRows} />
          <div>{l.trans({ en: "A typical app option:", ko: "앱의 option은 보통 이렇게 생겼습니다:" })}</div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/option.ts"
          code={`import { AkanOption } from "akanjs/server";
import type { LlmOption } from "akanjs/service";

import {
  AuditMiddleware,
  LegacyPageRedirect,
  PartnerApi,
  type PartnerApiOptions,
  SignedIn,
} from "../srvkit";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions & {
  partner?: PartnerApiOptions;
  llm?: LlmOption;
};

export const option = new AkanOption<ModulesOptions>()
  .use((options) => ({ partnerApi: new PartnerApi(options.partner) }))
  .applyMiddleware(AuditMiddleware)
  .applyWebProxy(LegacyPageRedirect)
  .setMcp({ instructions: "Domain tools for the myapp app." })
  .setLlm((options) => options.llm ?? {})
  .setAgentAccess(SignedIn);`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The type parameter is the env.</strong> <code>{"AkanOption<ModulesOptions>"}</code> types
                    what every function form receives, so keys and secrets come from the app's server env.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>타입 인자는 env의 모양입니다.</strong> <code>{"AkanOption<ModulesOptions>"}</code>가 함수
                    형태가 받는 값의 타입을 정하므로, 키와 secret은 앱의 서버 env에서 꺼냅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>use</code> is for constructor-style clients.
                    </strong>{" "}
                    An <code>adapt()</code> adaptor registers itself, so never list one here.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>use</code>는 생성자 방식 client용입니다.
                    </strong>{" "}
                    <code>adapt()</code> adaptor는 스스로 등록되므로 여기에 적지 않습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>
            {l.trans({ en: "When Several Libs Set It", ko: "여러 lib이 같은 설정을 하면" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Every lib's option is read in mount order, and the app's comes last:",
              ko: "lib의 option은 마운트 순서대로 읽고, 앱의 option을 마지막에 읽습니다:",
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Method", ko: "메서드" })}
            descLabel={l.trans({ en: "When several libs set it", ko: "여러 lib이 설정하면" })}
            items={mergeRows}
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    Without <code>setAgentAccess</code>, the agent chat refuses every call.
                  </strong>{" "}
                  No guard means nobody may spend the LLM key; name the guard your app already uses, such as{" "}
                  <code>SignedIn</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    <code>setAgentAccess</code>가 없으면 agent 채팅은 모든 호출을 거절합니다.
                  </strong>{" "}
                  guard가 없으면 아무도 LLM 키를 쓸 수 없습니다. <code>SignedIn</code>처럼 앱이 이미 쓰는 guard를
                  지정합니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <Docs.LinkGrid items={optionLinks} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="AkanResponse" title="AkanResponse">
        <Docs.Title>AkanResponse</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`AkanResponse` builds what a web proxy's `use()` returns. Each helper says whether the request goes on, moves to another URL, or ends here.",
              ko: "`AkanResponse`는 web proxy의 `use()`가 돌려줄 값을 만듭니다. 요청을 계속 보낼지, 다른 URL로 옮길지, 여기서 끝낼지를 정합니다.",
            })}
          </div>
          <Docs.Table columns={helperColumns} rows={helperRows} stacked />
          <div>{l.trans({ en: "A proxy that uses all three:", ko: "세 helper를 모두 쓰는 proxy입니다:" })}</div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/srvkit/docsRoutingProxy.ts"
          code={`import { AkanResponse, type WebProxy } from "akanjs/server";

export class DocsRoutingProxy implements WebProxy {
  static readonly refName = "DocsRoutingProxy";

  use(request: Bun.BunRequest) {
    const url = new URL(request.url);
    const [, lang, section] = url.pathname.split("/");
    if (section === "old-docs") {
      return AkanResponse.redirect(new URL(\`/\${lang}/docs\`, url), 308);
    }
    if (section === "help") {
      return AkanResponse.rewrite(new URL(\`/\${lang}/docs/intro\`, url));
    }
    const headers = new Headers(request.headers);
    headers.set("x-docs-section", section ?? "");
    return AkanResponse.next({ request: { headers } });
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Headers you pass replace the originals.</strong> Start from{" "}
                    <code>new Headers(request.headers)</code>; pass none and the originals go on unchanged.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>넘긴 header는 원래 header를 통째로 대신합니다.</strong>{" "}
                    <code>new Headers(request.headers)</code>에서 시작하고, 아무것도 넘기지 않으면 원래 header가 그대로
                    갑니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A rewrite keeps the request.</strong> The method, the body and the route <code>params</code>{" "}
                    carry over; only the URL changes.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>rewrite는 요청을 그대로 둡니다.</strong> method, body, route <code>params</code>는 유지되고
                    URL만 바뀝니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>redirect</code> is a plain <code>Response</code>.
                    </strong>{" "}
                    Returning any <code>Response</code> ends the chain the same way.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>redirect</code>는 평범한 <code>Response</code>입니다.
                    </strong>{" "}
                    어떤 <code>Response</code>든 돌려주면 똑같이 거기서 끝납니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A client-side navigation gets none of it.</strong> A <code>{"<Link>"}</code> to{" "}
                    <code>/en/help</code> renders <code>/en/help</code> itself, neither redirected nor rewritten, so
                    link to the page the proxy would have chosen.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>클라이언트 쪽 이동에는 하나도 적용되지 않습니다.</strong> <code>/en/help</code>로 가는{" "}
                    <code>{"<Link>"}</code>는 redirect도 rewrite도 없이 <code>/en/help</code> 자체를 그리므로, proxy가
                    골랐을 페이지로 바로 링크합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="WebProxy" title="WebProxy">
        <Docs.Title>WebProxy</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A `WebProxy` is a class with one `use(request)` method. It sees every page load before the router, so it suits redirects, host-based routing and headers a page reads. A client-side navigation, a `<Link>` click or `router.push`, is not a page load and never reaches it.",
              ko: "`WebProxy`는 `use(request)` 메서드 하나를 가진 class입니다. 라우터보다 먼저 모든 페이지 로드를 보므로, redirect, host 기반 라우팅, page가 읽을 header 설정에 알맞습니다. `<Link>` 클릭이나 `router.push` 같은 클라이언트 쪽 이동은 페이지 로드가 아니어서 proxy에 닿지 않습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A proxy that closes the shop pages during maintenance:",
              ko: "점검 중에 shop 페이지를 닫는 proxy입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/srvkit/maintenanceProxy.ts"
          code={`import type { WebProxy } from "akanjs/server";

export class MaintenanceProxy implements WebProxy {
  static readonly refName = "MaintenanceProxy";

  use() {
    if (process.env.SHOP_MAINTENANCE !== "1") return;
    return new Response("Shop is under maintenance", { status: 503 });
  }
}`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "Register it in `lib/option.ts`, narrowed to the shop pages with a matcher:",
              ko: "`lib/option.ts`에 등록하고, matcher로 shop 페이지만 걸러냅니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/option.ts"
          code={`import { AkanOption } from "akanjs/server";

import { MaintenanceProxy } from "../srvkit";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions;

export const option = new AkanOption<ModulesOptions>().applyWebProxy({
  proxy: MaintenanceProxy,
  matcher: /^\\/[a-z]{2}\\/shop(\\/|$)/,
});`}
        />
        <Docs.Description>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>A client-side navigation into the shop still opens it.</strong> The proxy answers page loads,
                  so a visitor already in the app reaches the shop through a <code>{"<Link>"}</code>. Block content with
                  guards on the endpoints it reads, and require sign-in with <code>{"getSelf({ unauthorize })"}</code>{" "}
                  in the section's <code>_layout.tsx</code>; both apply to a client-side navigation too.
                </span>
              ),
              ko: (
                <span>
                  <strong>클라이언트 쪽 이동으로는 shop에 그대로 들어갑니다.</strong> proxy는 페이지 로드에만
                  응답하므로, 이미 앱 안에 있는 방문자는 <code>{"<Link>"}</code>로 shop에 들어갑니다. 콘텐츠는 그
                  페이지가 읽는 endpoint의 guard로 막고, 로그인은 해당 구역 <code>_layout.tsx</code>의{" "}
                  <code>{"getSelf({ unauthorize })"}</code>로 요구합니다. 둘 다 클라이언트 쪽 이동에도 적용됩니다.
                </span>
              ),
            })}
          </Docs.Alert>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Page loads only.</strong> Endpoints under the API prefix, the WebSocket,{" "}
                    <code>/_akan/*</code> and client-side navigations, which load from <code>/__rsc</code>, never reach
                    a proxy. A navigation still gets the built-in locale and basePath handling.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>페이지 로드에만 적용됩니다.</strong> API prefix 아래 endpoint, WebSocket,{" "}
                    <code>/_akan/*</code>, 그리고 <code>/__rsc</code>로 불러오는 클라이언트 쪽 이동은 proxy를 거치지
                    않습니다. 이동에도 기본 locale·basePath 처리는 그대로 적용됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Built-ins run first.</strong> <code>LocaleWebProxy</code> and{" "}
                    <code>HostBasePathWebProxy</code> run before yours, so the path you see already starts with a
                    locale.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>기본 proxy가 먼저 돕니다.</strong> <code>LocaleWebProxy</code>와{" "}
                    <code>HostBasePathWebProxy</code>가 내 proxy보다 먼저 실행되므로, 내가 받는 경로는 이미 locale로
                    시작합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Each proxy sees the previous one's request.</strong> Proxies run in registration order, and
                    the headers or URL one sets are what the next one reads.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>proxy는 앞 proxy가 넘긴 요청을 받습니다.</strong> 등록한 순서대로 실행되며, 앞에서 바꾼
                    header나 URL을 다음 proxy가 그대로 읽습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>static refName</code> is required.
                    </strong>{" "}
                    It names the proxy, and the class type demands it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>static refName</code>은 꼭 있어야 합니다.
                    </strong>{" "}
                    proxy의 이름이며, class 타입이 이 값을 요구합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "What use() Returns", ko: "use()의 반환값" })}</Docs.SubSubTitle>
          <Docs.IntroTable
            type={l.trans({ en: "Return value", ko: "반환값" })}
            descLabel={l.trans({ en: "What happens", ko: "결과" })}
            items={returnRows}
          />
          <Docs.SubSubTitle>{l.trans({ en: "Matchers", ko: "matcher" })}</Docs.SubSubTitle>
          <Docs.IntroTable
            type="matcher"
            descLabel={l.trans({ en: "What it matches", ko: "걸리는 요청" })}
            items={matcherRows}
          />
          <Docs.SubSubTitle>{l.trans({ en: "Built-In Proxies", ko: "기본 proxy" })}</Docs.SubSubTitle>
          <Docs.IntroTable type="proxy" items={builtinProxyRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Types", ko: "타입" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Type", ko: "타입" })} items={proxyTypeRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Try" title="Try">
        <Docs.Title>Try</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`@Try()` is a legacy method decorator for best-effort external calls: when the method throws, it logs a warning and returns `undefined` instead. The storage adaptors in `libs/util` still use it.",
              ko: "`@Try()`는 실패해도 호출한 쪽이 멈추면 안 되는 외부 호출에 쓰던 legacy method decorator입니다. 메서드가 에러를 던지면 경고를 남기고 대신 `undefined`를 반환합니다. `libs/util`의 storage adaptor가 아직 씁니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The legacy shape, on a constructor-style client:",
              ko: "생성자 방식 client에 붙인 legacy 형태입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/srvkit/partnerApi.ts"
          code={`import { Logger } from "akanjs/common";
import { Try } from "akanjs/server";

export interface PartnerApiOptions {
  host?: string;
}

export class PartnerApi {
  readonly logger = new Logger("PartnerApi");
  readonly #host: string;

  constructor(options: PartnerApiOptions = {}) {
    this.#host = options.host ?? "https://partner.example.com";
  }

  @Try()
  async syncInventory() {
    const res = await fetch(\`\${this.#host}/inventory\`, {
      signal: AbortSignal.timeout(20_000),
    });
    return (await res.json()) as { sku: string; stock: number }[];
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      It logs through <code>this.logger</code>.
                    </strong>{" "}
                    On a class without a <code>logger</code> field, the error disappears silently.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>this.logger</code>로 기록합니다.
                    </strong>{" "}
                    <code>logger</code> 필드가 없는 class에서는 에러가 조용히 사라집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      The caller gets <code>undefined</code>.
                    </strong>{" "}
                    Check the result before you use it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      호출한 쪽은 <code>undefined</code>를 받습니다.
                    </strong>{" "}
                    결과를 쓰기 전에 확인합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The method becomes async.</strong> The wrapper always returns a Promise, even around a
                    synchronous method.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>메서드가 async가 됩니다.</strong> 동기 메서드에 붙여도 감싼 함수는 항상 Promise를
                    돌려줍니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: (
                <span>
                  New code catches the error itself in an <code>adapt()</code> adaptor, as <code>catch</code> →{" "}
                  <code>logger.error</code> → <code>return null</code>:
                </span>
              ),
              ko: (
                <span>
                  새 코드는 <code>adapt()</code> adaptor 안에서 에러를 직접 잡습니다. <code>catch</code> →{" "}
                  <code>logger.error</code> → <code>return null</code> 순서입니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/srvkit/partnerApi.ts"
          code={`import { adapt } from "akanjs/service";

export class PartnerApi extends adapt("partnerApi" as const) {
  async syncInventory() {
    try {
      const res = await fetch("https://partner.example.com/inventory", {
        signal: AbortSignal.timeout(20_000),
      });
      return (await res.json()) as { sku: string; stock: number }[];
    } catch (error) {
      this.logger.error(\`syncInventory failed: \${error}\`);
      return null;
    }
  }
}`}
        />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="Transaction" title="Transaction">
        <Docs.Title>Transaction</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`@Transaction()` is one more legacy method decorator from the same file, for server-side services. It is all or nothing: it commits when the method returns and rolls back when it throws.",
              ko: "`@Transaction()`은 같은 파일에 있는 legacy method decorator로, 서버 쪽 service에 붙입니다. 전부 되거나 전부 안 됩니다. 메서드가 끝나면 commit하고, 에러를 던지면 rollback합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "On a database service, two writes that must land together:",
              ko: "DB service에서, 함께 반영되어야 하는 쓰기 두 번을 묶는 예시입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/wallet/wallet.service.ts"
          code={`import { Transaction } from "akanjs/server";
import { serve } from "akanjs/service";

import * as db from "../db";

export class WalletService extends serve(db.wallet, () => ({})) {
  @Transaction()
  async transferPoint(fromId: string, toId: string, amount: number) {
    const [from, to] = await Promise.all([
      this.walletModel.getWallet(fromId),
      this.walletModel.getWallet(toId),
    ]);
    await from.withdraw(amount).save();
    return await to.deposit(amount).save();
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Nested calls join.</strong> A transactional method called from inside another runs in the
                    outer transaction.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>안쪽 호출은 바깥 transaction에 합류합니다.</strong> transaction 안에서 다른 transaction
                    메서드를 부르면 바깥 transaction에서 함께 실행됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>It needs a database.</strong> It finds one on a model or a database service; on any other
                    class it throws.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>DB가 있어야 합니다.</strong> model이나 DB service에서 DB를 찾으며, 그 밖의 class에서는
                    에러를 던집니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Caching is not a decorator.</strong> For a remembered answer, declare{" "}
                    <code>{"{ cache: <ms> }"}</code> on a query endpoint, or keep the value in a{" "}
                    <code>memory(...)</code> field.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>캐시는 decorator로 하지 않습니다.</strong> 응답을 기억해 두려면 query endpoint에{" "}
                    <code>{"{ cache: <ms> }"}</code>를 선언하거나, 값을 <code>memory(...)</code> 필드에 담으세요.
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
