# akanjs/server

- Source: /references/akanjs/server
- Mirror: /llms/pages/references/akanjs/server.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/server (#akanjs-server)
- AkanApp (#AkanApp)
- AkanAppOptions (#AkanAppOptions)
- AkanServer Web Surfaces (#AkanServer web surfaces)
- AkanOption (#AkanOption)
- AkanResponse (#AkanResponse)
- WebProxy (#WebProxy)
- Try (#Try)
- Transaction (#Transaction)

## Content

akanjs/server

AkanServer Web Surfaces

`akanjs/server` is the server half of Akan: it starts the app, holds the server settings, and sees page loads before the router. Import it only from server files — `main.ts`, `lib/option.ts` and `srvkit/`.

Words Used On This Page

Term

- gateway: The front process: it starts the replicas and relays HTTP and WebSocket traffic to them.

- replica: One server process that runs your modules. It takes traffic, runs batch work, or both.

- solo: A single replica running inside the `main.ts` process itself, with no gateway in front.

- RSC worker: A separate process that renders pages on the server. Each replica serving pages has one.

- web proxy: A class that sees each page load before the router and can redirect, rewrite or answer it.

Exports

- AkanApp: Starts the app from `main.ts`: one process, or a gateway with replicas.

- AkanAppOptions: What `new AkanApp()` takes: replicas, port, route prefixes and which modules boot.

- AkanServer: One replica's server, generated into `server.ts`. It decides which web surfaces are served.

- AkanLib: Bundles one app's or lib's modules and option. Also generated into `server.ts`.

- AkanOption: The builder `lib/option.ts` exports: injected values, middleware, proxies, MCP and LLM settings.

- AkanResponse: Helpers a web proxy returns to continue, rewrite or redirect a request.

- WebProxy: The interface a web proxy class implements: one `use(request)` method.

- LocaleWebProxy, HostBasePathWebProxy: The two built-in proxies. Every app runs them before its own.

- Try: Legacy decorator: logs a warning and returns `undefined` instead of throwing.

- Transaction: Legacy decorator: runs a method in a database transaction.

- Everything else: Build-artifact types and console, OAuth, sitemap and metrics helpers the framework and CLI use.

Where It Is Imported

File

- main.ts: Use the leaf path, which keeps the SSR renderer out of the gateway. — Example: `import { AkanApp } from "akanjs/server/akanApp";`

- server.ts: Generated; never edit it by hand. — Example: `import { AkanLib, AkanServer } from "akanjs/server";`

- lib/option.ts: One per app and one per lib. — Example: `import { AkanOption } from "akanjs/server";`

- srvkit/*.ts: Server-only helpers: proxy classes and legacy decorated classes. — Example: `import { AkanResponse, Try, type WebProxy } from "akanjs/server";`

AkanApp

`AkanApp` is what `main.ts` starts. It decides how many server processes run, and keeps them running until the container stops.

A whole `main.ts`:

**Two call shapes.** `new AkanApp(serverPath?, options?)` or `new AkanApp(options)`. The server path defaults to `./server`, next to `main.ts`.

**`start()` boots everything.** In solo mode it loads `server.ts` in the same process; otherwise it spawns one child per replica.

One Process Or A Gateway

With one replica that takes traffic there is nothing to balance, so `AkanApp` runs it inside its own process. Anything else puts a gateway in front:

Setting

Solo

Gateway

- Default

  - AKAN_REPLICA=0,0,1: One replica that takes traffic and runs batch work. There is nothing to balance.

- Brings the gateway back

  - AKAN_REPLICA=0,0,2: Two or more replicas: the gateway spreads traffic across them.

  - AKAN_REPLICA=0,1,0: A batch-only replica never listens, so the gateway answers health checks.

  - new AkanApp({ replica }): Stating a replica layout in code asks for the gateway that serves it.

  - AKAN_SOLO=false: Forces the gateway even for one replica.

  - akan start: The dev server always runs the gateway.

runs this way

does not

What the gateway does:

Starts Replicas

Spawns each replica and restarts one that crashes, waiting 1s, 2s, 4s… up to 30s.

Relays Traffic

Forwards HTTP over a unix socket and WebSocket over a local port to each replica.

Reports Health

Collects each replica's metrics and answers for the whole tree.

Stops Cleanly

On SIGINT or SIGTERM it asks each replica to stop, then kills what is left after 30s.

**Solo answers the same routes.** A solo process serves `/_akan/app/health` and `/_akan/app/metrics` in the gateway's shape, so a probe reads one contract either way.

**Nothing restarts a solo process but your orchestrator.** Keep liveness and readiness probes on the container.

**Import `AkanApp` from `akanjs/server/akanApp`.** The `akanjs/server` barrel also loads `AkanServer` with the SSR renderer and the database driver, which the gateway never runs.

AkanAppOptions

Every field is optional. With none, `AkanApp` runs one replica on port 8282, and each field can also come from the env named beside it; the option wins.

- replica (number | string, default "0,0,1", AKAN_REPLICA): Replica counts as `federation,batch,all`. Passing it here keeps the gateway on.

- serverPath (string, default "./server"): The server module each replica runs, resolved next to `main.ts`.

- runtimeDir (string, default local/apps/<app>/runtime, AKAN_RUNTIME_DIR): Replica sockets and rotating logs. It is `./runtime` when `NODE_ENV=production`.

- port (number, default 8282, PORT): The port the app listens on. A replica calling itself uses it too.

- wsBasePort (number, default port + 10000, AKAN_WS_BASE_PORT): Replica `i` takes WebSocket traffic from the gateway on this port plus `i`.

- openapi (boolean, default false, AKAN_OPENAPI): Serves `/openapi.json`, a description of every endpoint.

- prefix (string, default "/api", AKAN_API_PREFIX): Where endpoints are mounted. CSR and mobile bundles follow `api.prefix` in `akan.config.ts`.

- websocketPrefix (string, default "/ws", AKAN_WS_PREFIX): Where the WebSocket upgrade sits, under `prefix`.

- modules (string[], AKAN_MODULES): Boot only these modules and the ones they reach. Empty boots every enabled module.

- disableModules (string[], AKAN_DISABLE_MODULES): Boot everything except these and whatever reaches them. Applied after `modules`.

- disableLibs (string[], AKAN_DISABLE_LIBS): Leave out every module the named libs registered, and whatever reaches them.

- solo (boolean, AKAN_SOLO): Overrides the automatic solo or gateway choice. The env can turn solo off, never on.

Reading replica

`replica` is three counts separated by commas, one per role:

Position · role

- 1, federation: Takes traffic. Skips work declared `serverMode: "batch"`.

- 2, batch: Never listens. Skips work declared `serverMode: "federation"`.

- 3, all: Takes traffic and runs every kind of work.

Three replicas behind a gateway, all booting only the `article` module:

**`1,0,2` is three processes.** One `federation` replica and two `all` replicas, with the gateway in front.

**A bare number means federation.** `replica: 3` is `3,0,0`, so work declared `serverMode: "batch"` runs nowhere.

**Modules bring their dependencies.** `modules: ["article"]` also boots every service and signal that `article` injects, in every replica.

Selective Module Boot

`modules`, `disableModules` and `disableLibs` in depth.

What `openapi: true` serves at `/openapi.json`.

Besides its API, an app serves up to two web surfaces: SSR pages, and the CSR bundle the mobile app ships. The build decides which exist; at runtime you can only turn them off.

API — /api

SSR — RSC worker

CSR — /__csr

- At build — `akan.config.ts`

  - web: true: The default: pages, the mobile bundle and the API.

  - web: { csr: false }: No mobile bundle, so `/__csr` and `?csr=true` are gone. Not allowed with a `native` section.

  - web: false: An API-only build. Nothing under `page/` is served.

- At runtime — env

  - AKAN_CSR=false: Drops the CSR bundle for this deployment.

  - AKAN_SSR=false: Drops pages and the RSC worker. CSR goes too, since its bundle reuses the SSR stylesheet.

served

not served

To turn a surface off for one deployment, set the env:

**Runtime only narrows.** `false` or `0` turns a surface off, and a surface the build left out never comes back.

**The same from code.** `server.setWeb(true | false | { csr })` or `server.init({ web })` narrows the same way, before the server starts.

**Why turn SSR off.** SSR is the RSC renderer plus its own RSC worker process per replica; an API-only process runs neither.

**Dev ignores it.** `akan start` serves every surface, whatever `web` says.

Web Surfaces And Prefixes

Declaring `web` and `api` in `akan.config.ts`.

AkanOption

`lib/option.ts` exports one `AkanOption`. It carries the server settings a lib or app owns, from injected values to MCP and LLM settings.

Method

- use(fn | object): Registers values a service reads with `use<T>()`. A function gets the env; a Promise is awaited.

- applyMiddleware(...classes): Adds signal middleware. `Logging` and `Timeout` are already registered.

- applyAdaptor(role, adaptor): Swaps a built-in adaptor role, such as `LlmAdaptorRole`, for your own class.

- applyWebProxy(...proxies): Adds web proxies, each as a class or `{ proxy, matcher }`.

- setMcp(option | fn): Settings for the MCP server at `/mcp`. `false` takes it off.

- setAgentAccess(guards): Guards a caller must pass to spend the LLM key through the agent chat. Several are ANDed.

- setLlm(option | fn): The model the agent relay talks to: `apiKey`, `model`, `host` and more.

- setCrossSite(option): Extra origins a browser may send mutations and open the websocket from. `{ enabled: false }` turns the check off.

A typical app option:

**The type parameter is the env.** `AkanOption<ModulesOptions>` types what every function form receives, so keys and secrets come from the app's server env.

**`use` is for constructor-style clients.** An `adapt()` adaptor registers itself, so never list one here.

When Several Libs Set It

Every lib's option is read in mount order, and the app's comes last:

When several libs set it

- use: Keys must be unique across all libs. `llmOption` is reserved.

- applyMiddleware: One per `refName`; the later registration wins.

- applyAdaptor: The last override of a role wins.

- applyWebProxy: All run: the two built-ins first, then each lib's in order.

- setMcp: Merged field by field; the app's values win.

- setLlm: Merged field by field, so a lib may name the host and the app the key.

- setAgentAccess: The last call wins; `null` clears what a lib set.

- setCrossSite: The last call wins.

**Without `setAgentAccess`, the agent chat refuses every call.** No guard means nobody may spend the LLM key; name the guard your app already uses, such as `SignedIn`.

- MCP Server — Turning `/mcp` on and off, and what `setMcp` configures.

- Agent Chat — Mounting the chat, then `setLlm` and `setAgentAccess`.

- Middleware And Web Proxies — Writing the classes `applyMiddleware` and `applyWebProxy` take.

AkanResponse

`AkanResponse` builds what a web proxy's `use()` returns. Each helper says whether the request goes on, moves to another URL, or ends here.

Helper

What happens

- AkanResponse.next({ request: { headers } }) — Goes on to the next proxy and the page, carrying the headers you set.

- AkanResponse.rewrite(url, { request? }) — Goes on with a new URL. The browser's address bar keeps the old one.

- AkanResponse.redirect(url, status = 307) — Returns a redirect `Response`. Later proxies and the page do not run.

A proxy that uses all three:

**Headers you pass replace the originals.** Start from `new Headers(request.headers)`; pass none and the originals go on unchanged.

**A rewrite keeps the request.** The method, the body and the route `params` carry over; only the URL changes.

**`redirect` is a plain `Response`.** Returning any `Response` ends the chain the same way.

**A client-side navigation gets none of it.** A `<Link>` to `/en/help` renders `/en/help` itself, neither redirected nor rewritten, so link to the page the proxy would have chosen.

WebProxy

A `WebProxy` is a class with one `use(request)` method. It sees every page load before the router, so it suits redirects, host-based routing and headers a page reads. A client-side navigation, a `<Link>` click or `router.push`, is not a page load and never reaches it.

A proxy that closes the shop pages during maintenance:

Register it in `lib/option.ts`, narrowed to the shop pages with a matcher:

**A client-side navigation into the shop still opens it.** The proxy answers page loads, so a visitor already in the app reaches the shop through a `<Link>`. Block content with guards on the endpoints it reads, and require sign-in with `getSelf({ unauthorize })` in the section's `_layout.tsx`; both apply to a client-side navigation too.

**Page loads only.** Endpoints under the API prefix, the WebSocket, `/_akan/*` and client-side navigations, which load from `/__rsc`, never reach a proxy. A navigation still gets the built-in locale and basePath handling.

**Built-ins run first.** `LocaleWebProxy` and `HostBasePathWebProxy` run before yours, so the path you see already starts with a locale.

**Each proxy sees the previous one's request.** Proxies run in registration order, and the headers or URL one sets are what the next one reads.

**`static refName` is required.** It names the proxy, and the class type demands it.

What use() Returns

Return value

- undefined: Passes the request on unchanged.

- Response: Answers right away. Later proxies and the page do not run.

- AkanResponse.next, AkanResponse.rewrite: Goes on with new headers or a new URL, as the AkanResponse section shows.

Matchers

What it matches

- (omitted): Page paths only: skips `/__csr`, `/_akan/*` and paths with a file extension.

- "/ko/shop": That path and everything under it.

- /^\/[a-z]{2}\/shop/: A `RegExp`, tested against the pathname.

- (request) => boolean: Your own test on the whole request.

Built-In Proxies

- LocaleWebProxy: Redirects a path with no locale to `/<locale>/…` (307) and sets `x-locale` and `x-path`.

- HostBasePathWebProxy: Maps the host to a basePath from `routes` in `akan.config.ts` and rewrites into it.

Types

Type

- WebProxy: The interface. `use(request)` returns a `WebProxyReturn`, sync or async.

- WebProxyCls: A proxy class: constructed with no arguments, with a `static refName`.

- WebProxyRegistration: What `applyWebProxy` takes: a class, or `{ proxy, matcher? }`.

- WebProxyMatcher: A path prefix `string`, a `RegExp`, or `(request) => boolean`.

- WebProxyReturn: `Response`, a `WebProxyResult`, or `undefined`.

- WebProxyResult, WebProxyNextInit: What `next` and `rewrite` return, and the `{ request: { headers } }` they take.

Try

`@Try()` is a legacy method decorator for best-effort external calls: when the method throws, it logs a warning and returns `undefined` instead. The storage adaptors in `libs/util` still use it.

The legacy shape, on a constructor-style client:

**It logs through `this.logger`.** On a class without a `logger` field, the error disappears silently.

**The caller gets `undefined`.** Check the result before you use it.

**The method becomes async.** The wrapper always returns a Promise, even around a synchronous method.

New code catches the error itself in an `adapt()` adaptor, as `catch` → `logger.error` → `return null`:

Transaction

`@Transaction()` is one more legacy method decorator from the same file, for server-side services. It is all or nothing: it commits when the method returns and rolls back when it throws.

On a database service, two writes that must land together:

**Nested calls join.** A transactional method called from inside another runs in the outer transaction.

**It needs a database.** It finds one on a model or a database service; on any other class it throws.

**Caching is not a decorator.** For a remembered answer, declare `{ cache: <ms> }` on a query endpoint, or keep the value in a `memory(...)` field.

## Code Examples

### apps/myapp/main.ts

```ts
import { AkanApp } from "akanjs/server/akanApp";

const run = async () => {
  await new AkanApp("./server", { openapi: true }).start();
};
void run();
```

### apps/myapp/main.ts

```ts
import { AkanApp, type AkanAppOptions } from "akanjs/server/akanApp";

const options: AkanAppOptions = {
  replica: "1,0,2",
  runtimeDir: "./runtime",
  modules: ["article"],
};

const run = async () => {
  await new AkanApp(options).start();
};
void run();
```

### Terminal

```bash
# api only, no RSC worker process
AKAN_SSR=false bun main.js

# web without the mobile SPA bundle
AKAN_CSR=false bun main.js
```

### apps/myapp/lib/option.ts

```ts
import { AkanOption } from "akanjs/server";
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
  .setAgentAccess(SignedIn);
```

### apps/myapp/srvkit/docsRoutingProxy.ts

```ts
import { AkanResponse, type WebProxy } from "akanjs/server";

export class DocsRoutingProxy implements WebProxy {
  static readonly refName = "DocsRoutingProxy";

  use(request: Bun.BunRequest) {
    const url = new URL(request.url);
    const [, lang, section] = url.pathname.split("/");
    if (section === "old-docs") {
      return AkanResponse.redirect(new URL(`/${lang}/docs`, url), 308);
    }
    if (section === "help") {
      return AkanResponse.rewrite(new URL(`/${lang}/docs/intro`, url));
    }
    const headers = new Headers(request.headers);
    headers.set("x-docs-section", section ?? "");
    return AkanResponse.next({ request: { headers } });
  }
}
```

### apps/myapp/srvkit/maintenanceProxy.ts

```ts
import type { WebProxy } from "akanjs/server";

export class MaintenanceProxy implements WebProxy {
  static readonly refName = "MaintenanceProxy";

  use() {
    if (process.env.SHOP_MAINTENANCE !== "1") return;
    return new Response("Shop is under maintenance", { status: 503 });
  }
}
```

### apps/myapp/lib/option.ts

```ts
import { AkanOption } from "akanjs/server";

import { MaintenanceProxy } from "../srvkit";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions;

export const option = new AkanOption<ModulesOptions>().applyWebProxy({
  proxy: MaintenanceProxy,
  matcher: /^\/[a-z]{2}\/shop(\/|$)/,
});
```

### apps/myapp/srvkit/partnerApi.ts

```ts
import { Logger } from "akanjs/common";
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
    const res = await fetch(`${this.#host}/inventory`, {
      signal: AbortSignal.timeout(20_000),
    });
    return (await res.json()) as { sku: string; stock: number }[];
  }
}
```

### apps/myapp/srvkit/partnerApi.ts

```ts
import { adapt } from "akanjs/service";

export class PartnerApi extends adapt("partnerApi" as const) {
  async syncInventory() {
    try {
      const res = await fetch("https://partner.example.com/inventory", {
        signal: AbortSignal.timeout(20_000),
      });
      return (await res.json()) as { sku: string; stock: number }[];
    } catch (error) {
      this.logger.error(`syncInventory failed: ${error}`);
      return null;
    }
  }
}
```

### apps/myapp/lib/wallet/wallet.service.ts

```ts
import { Transaction } from "akanjs/server";
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
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

