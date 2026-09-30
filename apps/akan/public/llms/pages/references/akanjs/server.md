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
- AkanOption (#AkanOption)
- AkanResponse (#AkanResponse)
- WebProxy (#WebProxy)
- Try (#Try)
- Transaction (#Transaction)

## Content

akanjs/server

AkanServer Web Surfaces

The front process: it starts the replicas and relays HTTP and WebSocket traffic to them.

One server process that runs your modules. It takes traffic, runs batch work, or both.

A single replica running inside the `main.ts` process itself, with no gateway in front.

A separate process that renders pages on the server. Each replica serving pages has one.

A class that sees each page load before the router and can redirect, rewrite or answer it.

Starts the app from `main.ts`: one process, or a gateway with replicas.

What `new AkanApp()` takes: replicas, port, route prefixes and which modules boot.

One replica's server, generated into `server.ts`. It decides which web surfaces are served.

Bundles one app's or lib's modules and option. Also generated into `server.ts`.

The builder `lib/option.ts` exports: injected values, middleware, proxies, MCP and LLM settings.

Helpers a web proxy returns to continue, rewrite or redirect a request.

The interface a web proxy class implements: one `use(request)` method.

The two built-in proxies. Every app runs them before its own.

Legacy decorator: logs a warning and returns `undefined` instead of throwing.

Legacy decorator: runs a method in a database transaction.

Everything else

Build-artifact types and console, OAuth, sitemap and metrics helpers the framework and CLI use.

Use the leaf path, which keeps the SSR renderer out of the gateway.

Generated; never edit it by hand.

One per app and one per lib.

Server-only helpers: proxy classes and legacy decorated classes.

Solo

Gateway

Default

One replica that takes traffic and runs batch work. There is nothing to balance.

Brings the gateway back

Two or more replicas: the gateway spreads traffic across them.

A batch-only replica never listens, so the gateway answers health checks.

Stating a replica layout in code asks for the gateway that serves it.

Forces the gateway even for one replica.

The dev server always runs the gateway.

Replica counts as `federation,batch,all`. Passing it here keeps the gateway on.

The server module each replica runs, resolved next to `main.ts`.

Replica sockets and rotating logs. It is `./runtime` when `NODE_ENV=production`.

The port the app listens on. A replica calling itself uses it too.

Replica `i` takes WebSocket traffic from the gateway on this port plus `i`.

Serves `/openapi.json`, a description of every endpoint.

Where endpoints are mounted. CSR and mobile bundles follow `api.prefix` in `akan.config.ts`.

Where the WebSocket upgrade sits, under `prefix`.

Boot only these modules and the ones they reach. Empty boots every enabled module.

Boot everything except these and whatever reaches them. Applied after `modules`.

Leave out every module the named libs registered, and whatever reaches them.

Overrides the automatic solo or gateway choice. The env can turn solo off, never on.

Takes traffic. Skips work declared `serverMode: "batch"`.

Never listens. Skips work declared `serverMode: "federation"`.

Takes traffic and runs every kind of work.

At build — `akan.config.ts`

The default: pages, the mobile bundle and the API.

No mobile bundle, so `/__csr` and `?csr=true` are gone. Not allowed with a `mobile` section.

An API-only build. Nothing under `page/` is served.

At runtime — env

Drops the CSR bundle for this deployment.

Drops pages and the RSC worker. CSR goes too, since its bundle reuses the SSR stylesheet.

Registers values a service reads with `use<T>()`. A function gets the env; a Promise is awaited.

Adds signal middleware. `Logging` and `Timeout` are already registered.

Swaps a built-in adaptor role, such as `LlmAdaptorRole`, for your own class.

Adds web proxies, each as a class or `{ proxy, matcher }`.

Settings for the MCP server at `/mcp`. `false` takes it off.

Guards a caller must pass to spend the LLM key through the agent chat. Several are ANDed.

The model the agent relay talks to: `apiKey`, `model`, `host` and more.

Extra origins a browser may send mutations from. `{ enabled: false }` turns the check off.

Keys must be unique across all libs. `llmOption` is reserved.

One per `refName`; the later registration wins.

The last override of a role wins.

All run: the two built-ins first, then each lib's in order.

Merged field by field; the app's values win.

Merged field by field, so a lib may name the host and the app the key.

The last call wins; `null` clears what a lib set.

The last call wins.

MCP Server

Turning `/mcp` on and off, and what `setMcp` configures.

Agent Chat

Mounting the chat, then `setLlm` and `setAgentAccess`.

Middleware And Web Proxies

Writing the classes `applyMiddleware` and `applyWebProxy` take.

Helper

What happens

Goes on to the next proxy and the page, carrying the headers you set.

Goes on with a new URL. The browser's address bar keeps the old one.

Returns a redirect `Response`. Later proxies and the page do not run.

Passes the request on unchanged.

Answers right away. Later proxies and the page do not run.

Goes on with new headers or a new URL, as the AkanResponse section shows.

(omitted)

Page paths only: skips `/__csr`, `/_akan/*` and paths with a file extension.

That path and everything under it.

A `RegExp`, tested against the pathname.

Your own test on the whole request.

Redirects a path with no locale to `/<locale>/…` (307) and sets `x-locale` and `x-path`.

Maps the host to a basePath from `routes` in `akan.config.ts` and rewrites into it.

The interface. `use(request)` returns a `WebProxyReturn`, sync or async.

A proxy class: constructed with no arguments, with a `static refName`.

What `applyWebProxy` takes: a class, or `{ proxy, matcher? }`.

A path prefix `string`, a `RegExp`, or `(request) => boolean`.

`Response`, a `WebProxyResult`, or `undefined`.

What `next` and `rewrite` return, and the `{ request: { headers } }` they take.

`akanjs/server` is the server half of Akan: it starts the app, holds the server settings, and sees page loads before the router. Import it only from server files — `main.ts`, `lib/option.ts` and `srvkit/`.

Words Used On This Page

Term

Exports

Where It Is Imported

File

AkanApp

`AkanApp` is what `main.ts` starts. It decides how many server processes run, and keeps them running until the container stops.

A whole `main.ts`:

One Process Or A Gateway

With one replica that takes traffic there is nothing to balance, so `AkanApp` runs it inside its own process. Anything else puts a gateway in front:

Setting

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

AkanAppOptions

Every field is optional. With none, `AkanApp` runs one replica on port 8282, and each field can also come from the env named beside it; the option wins.

Reading replica

`replica` is three counts separated by commas, one per role:

Position · role

Three replicas behind a gateway, all booting only the `article` module:

Selective Module Boot

`modules`, `disableModules` and `disableLibs` in depth.

What `openapi: true` serves at `/openapi.json`.

Besides its API, an app serves up to two web surfaces: SSR pages, and the CSR bundle the mobile app ships. The build decides which exist; at runtime you can only turn them off.

served

not served

To turn a surface off for one deployment, set the env:

Web Surfaces And Prefixes

Declaring `web` and `api` in `akan.config.ts`.

AkanOption

`lib/option.ts` exports one `AkanOption`. It carries the server settings a lib or app owns, from injected values to MCP and LLM settings.

Method

A typical app option:

When Several Libs Set It

Every lib's option is read in mount order, and the app's comes last:

When several libs set it

AkanResponse

`AkanResponse` builds what a web proxy's `use()` returns. Each helper says whether the request goes on, moves to another URL, or ends here.

A proxy that uses all three:

WebProxy

A `WebProxy` is a class with one `use(request)` method. It sees every page load before the router, so it suits redirects, host-based routing and headers a page reads. A client-side navigation, a `<Link>` click or `router.push`, is not a page load and never reaches it.

A proxy that closes the shop pages during maintenance:

Register it in `lib/option.ts`, narrowed to the shop pages with a matcher:

What use() Returns

Return value

Matchers

What it matches

Built-In Proxies

Types

Type

Try

`@Try()` is a legacy method decorator for best-effort external calls: when the method throws, it logs a warning and returns `undefined` instead. The storage adaptors in `libs/util` still use it.

The legacy shape, on a constructor-style client:

Transaction

`@Transaction()` is one more legacy method decorator from the same file, for server-side services. It is all or nothing: it commits when the method returns and rolls back when it throws.

On a database service, two writes that must land together:

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

