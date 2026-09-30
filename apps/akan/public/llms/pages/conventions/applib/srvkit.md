# Server Utils (srvkit/)

- Source: /conventions/applib/srvkit
- Mirror: /llms/pages/conventions/applib/srvkit.md
- Section: conventions
- Category: App & Library
- Priority: P1

## Headings

- Server Utility Overview (#srvkit-overview)
- What Belongs In srvkit/ (#what-belongs)
- Server Level: WebProxy And Middleware (#server-level-appliance)
- Signal Level: Guard And InternalArg (#signal-level-appliance)
- Service Logic And External Libraries (#service-logic)
- Adaptor And plug (#adaptor-plug)
- Practical Rules (#practical-rules)

## Content

Server Utils (srvkit/)

Server Utility Overview

`srvkit/` holds server-only code that services, signals and server jobs call. Keeping it here lets the module files stay focused on business behavior.

It is also the one safe door for external libraries: vendor SDKs and low-level server APIs pass through srvkit first.

**Module files cannot import a third-party package.** In `*.service.ts`, `*.signal.ts` and the other module files, lint accepts only relative paths and workspace packages such as `akanjs/*`, `@apps/*` and `@libs/*`. Even `node:crypto` is refused, so import it in srvkit and export what the service needs.

Which folder?

Code outside `lib/` goes in one of five folders. Choose by what the code touches, not what it is for; the `common/` and `webkit/` pages open with this same table.

Folder

- common/: Pure, isomorphic, zero-dependency; imports only sibling common/* and akanjs/base, not Err.

- webkit/: Touches window, navigator or the native bridge (akanjs/client/native), or is a React hook.

- srvkit/: Touches node:*, Bun, process.env, a secret, or a server SDK.

- ui/: Renders JSX or defines a recipe, bound to no model; a model-bound component goes in its module.

- plugin/: A build-time or CLI-time AkanPlugin, registered in akan.config.ts.

What Belongs In srvkit/

srvkit/ holds seven kinds of code. Four step into the request path, and three are tools a service calls:

Kind

- Guard: Decides whether a request may run an endpoint: sign-in, role or ownership checks. — Example: `libs/shared/srvkit/guards.ts`

- InternalArg: Reads a trusted value, such as the caller's account, and hands it to exec as an argument. — Example: `libs/shared/srvkit/internalArgs.ts`

- Middleware: Wraps every signal call and attaches server context before the endpoint's guards run. — Example: `libs/shared/srvkit/accountMiddleware.ts`

- WebProxy: Runs before a page load is routed, to redirect, rewrite, or add headers.

- Server helper: A reusable function for hashing, encryption, file handling, image inspection or tokens.

- Adaptor: A singleton adapt() class wrapping storage, queues, email, payment or a vendor API. — Example: `libs/util/srvkit/ipfsApi.ts`

- Class utility: Legacy: a server-only class, such as an SDK client, injected through option.ts. — Example: `libs/util/srvkit/cloudflareApi.ts`

Where the request-path four run

A page load and a signal call take different paths, and each piece sits on only one of them:

Piece

Page load — /ko/docs

Signal call — HTTP · WS · MCP

- Server level: registered once in option.ts

  - WebProxy: Redirects, rewrites or adds headers before the page is chosen.

  - Middleware: Attaches server context, such as the account, before guards run.

- Signal level: named on each endpoint or slice

  - Guard: Allows or refuses the call.

  - InternalArg: Hands a server-made value to exec as an argument.

Runs here

Not here

Server Level: WebProxy And Middleware

Both are registered once in the option chain and apply to every request of their kind. A WebProxy acts on page loads before routing; a Middleware wraps every signal call.

Page load

Page render

A WebProxy is a class with one `use(request)` method. This one sends a retired URL to its new page:

What `use()` returns decides what happens next:

Return value

What happens

- Response — Sent as is; later proxies and the page do not run.

- AkanResponse.redirect(url, status?) — A redirect Response; the status defaults to 307.

- AkanResponse.next({ request }) — Continues with the request headers you changed.

- AkanResponse.rewrite(url) — Serves another path while the address bar stays the same.

- undefined — Passes the request on unchanged.

**Page loads only.** API routes, the websocket and `/_akan/*` paths never pass through a WebProxy. Static files (a path with an extension) skip it too, unless a matcher names them.

**A client-side navigation skips it.** A `<Link>` to `/ko/old-docs` or a `router.push` there is not redirected and renders `/ko/old-docs` itself, usually a 404; the built-in locale and basePath handling still applies. Link to the new page directly, and keep access control out of proxies: guards on the endpoints, and `getSelf({ unauthorize })` in a `_layout.tsx`.

**The locale redirect runs first.** The built-in proxies run before yours and turn `/old-docs` into `/ko/old-docs`, so match the path with its locale segment.

**Narrow it with a matcher.** In `applyWebProxy({ proxy, matcher })`, the matcher is a path prefix, a `RegExp`, or a function of the request.

Signal call

attach context

This Middleware resolves the caller and stores it where guards and InternalArgs read it:

**`use(env)` runs once per process.** It receives the server options; only the function it returns runs on every call.

**Branch on transport here, and only here.** Middleware writes `account` onto the HTTP request or the socket data, and every guard and InternalArg reads it back with `context.get("account")`.

**Mounting libs/shared already does this.** Its `AccountMiddleware` turns the JWT into `account`, so most apps never write their own.

**`refName` is the registration key.** Two middlewares with the same `refName` replace each other. For a single endpoint, use the `middlewares` signal option instead.

Register them in option.ts

Once both are declared in srvkit, register them in the app's or library's option chain:

**Several at once, in order.** `applyMiddleware` and `applyWebProxy` each take several classes, and proxies run in the order you list them.

**Libraries bring their own.** An app runs the middleware and proxies of every library it mounts, and its own `option.ts` is applied last.

Signal Level: Guard And InternalArg

Guards and internal args are named per endpoint or slice. A Guard decides whether the call may run; an InternalArg turns trusted server context into an exec argument.

After Middleware prepares the context

allow or refuse

build exec args

Service logic

A Guard is a class with `canPass(context)`. `SignedIn` reads only the caller; `CanCancelOrder` also needs the call's arguments:

That difference is what `static scope` declares. It has no default, so every guard states it:

Reads

In an MCP listing

- "account" — The caller only — An MCP listing runs it with no arguments and hides what this caller certainly cannot use.

- "resource" — The call's arguments too — An MCP listing skips it, so the entry stays visible and is stopped at call time.

**Keep `static name`.** fetch serializes guard names and the API explorer filters on them.

**Read the caller with `context.get("account")`.** Guards also run on websocket calls, and a pubsub room re-runs them whenever the socket's credential changes, so never branch on `getHttpContext()`.

**Side-effect free, and fail closed.** A guard must be safe to re-run. No resource named means `false`; a load that throws means `logger.warn`, then `false`.

**Every guard must pass.** The `guards` array is checked in order, and the first refusal answers 403.

An InternalArg reads the request context and hands a server-made value to exec, so business logic gets it without asking the client:

Guards and internal args meet in the signal file. Guards go in the option, and `.with()` appends an InternalArg after the declared params:

**Arguments arrive in order.** exec receives the `.param()` values first, then each `.with()` value.

**`null` refuses the call.** An InternalArg that returns `null` answers 401, unless you write `.with(CurrentUserId, { nullable: true })` and let exec receive `null`.

**Never trust a client-supplied id.** Take the acting user from an InternalArg, not from a `.param()`.

Before writing your own, check the ones that already ship:

- Req, Res, Ip, Ws: From `akanjs/signal`: raw request, response, caller IP, and the socket with its `socketId`.

- Account, Self, Me, AgentCall: From `@libs/shared/srvkit`: account, signed-in user, admin, and whether a model is calling.

Service Logic And External Libraries

When a service needs crypto, an AI SDK, an HTTP client or another server-only package, wrap it in srvkit first. How the service then reaches it depends on what you wrapped:

What you wrapped

How the service gets it

- Function helper: Imported straight from the srvkit barrel. — Example: `import { createOrderHash } from "@apps/koyo/srvkit";`

- Singleton adaptor: `plug(Class)` in the service, with nothing in option.ts. — Example: `paymentApi: plug(PaymentApi),`

- Class instance (legacy): Built in option.ts `.use()`, then injected with `use<T>()`. — Example: `emailClient: use<EmailClient>(),`

Function helper

A function helper needs no wiring. This one uses `node:crypto`, which a service may not import itself:

Class instance: the legacy shape

**Recognise this shape; do not copy it forward.** The `option.ts` + `use<T>()` pair is kept because existing code is written in it. New adaptors are an `adapt()` class injected with `plug()`, as the next slide shows.

It takes three files. First, a plain class in srvkit:

Next, build one instance in `option.ts` under a key:

Last, a `use<T>()` field with the same name in the service:

**The field name is the key.** `use<T>()` looks the value up by the service field name, so `emailClient` must match the key in `.use()`.

**A function helper skips all of this.** The same service imports `createOrderHash` straight from `@apps/koyo/srvkit`.

Adaptor And plug

An adaptor is a singleton `adapt()` class that turns an outside system into a service dependency. Declare it in srvkit and `plug()` it where it is needed; it registers itself, so `option.ts` needs no entry.

The service plugs it by class:

The `adapt()` builder hands you four injectors; destructure only the ones you use:

Injector

- use<T>(): A value option.ts provides under the same key: the legacy path.

- env(fn): A value read from the server options once, when the server starts.

- plug(Class): Another adaptor, or a built-in role such as `StorageAdaptorRole`.

- memory(Type, { of }): A value this adaptor keeps in the cache adaptor; `local: true` keeps it in-process instead.

**One per process.** `adapt()` is for singletons; a value object you create per use stays a plain class you `new`.

**Adaptors can plug adaptors,** as long as the plugs never form a cycle.

**Logger and lifecycle come built in.** Use `this.logger` instead of a new `Logger`, and put startup work in `override async onInit()`.

**Route remote calls through one `#api()`** with `signal: AbortSignal.timeout(20_000)`, so no request hangs forever.

Practical Rules

Where the code goes

**Move noisy server code out.** Put server-only helper code in srvkit when a service or signal would otherwise become noisy.

**External libraries enter through srvkit.** Wrap them here before any convention file uses them.

**Guard to protect, InternalArg to supply.** Guards protect requests; internal args provide context-derived signal arguments.

**adapt and plug for shared systems.** Use them when a service needs a reusable external system dependency.

**App or library.** App-specific integrations go in the app's srvkit; reusable ones go in a library's srvkit.

Inside a srvkit file

**camelCase file, PascalCase class.** `paymentApi.ts` exports `PaymentApi`.

**Server only, in both directions.** Client files (`ui/`, `webkit/`, `*.store.ts`, every `.tsx`) cannot import srvkit, and srvkit cannot import a store, `ui/`, `webkit/` or the `st` barrel.

**Throw `Err`, never `Error`.** Import `Err` from `../lib/dict`; an adaptor that catches logs with `logger.error` and returns `null`.

**Resolve secrets inside a function.** Write `process.env.X ?? options.x` in the function that needs it, never at module scope.

**`#private` is the house style here.** Its lint ban covers only constant, document, service and store files.

## Code Examples

### common/

```ts
libs/util/common/isHttpUri.ts
// camelCase file, filename equals the single export
```

### webkit/

```ts
libs/util/webkit/useSpeech.tsx
// use<Thing>.tsx — .tsx even with no JSX
```

### srvkit/

```ts
libs/util/srvkit/cloudflareApi.ts
// camelCase file, PascalCase class
```

### ui/

```ts
apps/akan/ui/BrowserMockup.tsx
// PascalCase component, camelCase sidecar
```

### plugin/

```ts
libs/util/plugin/pushNotification.plugin.ts
// <name>.plugin.ts
```

### Server helper

```ts
libs/util/srvkit/aes.ts
libs/util/srvkit/getImageSize.ts
```

### apps/koyo/srvkit/legacyPageRedirect.ts

```ts
import { AkanResponse, type WebProxy } from "akanjs/server";

export class LegacyPageRedirect implements WebProxy {
  static readonly refName = "LegacyPageRedirect";

  use(request: Bun.BunRequest) {
    const url = new URL(request.url);
    const [, lang, ...rest] = url.pathname.split("/");
    if (rest.join("/") !== "old-docs") return;
    return AkanResponse.redirect(new URL(`/${lang}/docs`, url), 308);
  }
}
```

### apps/koyo/srvkit/requestUserMiddleware.ts

```ts
import type { Middleware, SignalContext } from "akanjs/signal";
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
}
```

### apps/koyo/lib/option.ts

```ts
import { AkanOption } from "akanjs/server";
import { LegacyPageRedirect, RequestUserMiddleware } from "../srvkit";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions;

export const option = new AkanOption<ModulesOptions>()
  .applyMiddleware(RequestUserMiddleware)
  .applyWebProxy(LegacyPageRedirect);
```

### apps/koyo/srvkit/guards.ts

```ts
import { Logger } from "akanjs/common";
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
      CanCancelOrder.#logger.warn(`order ${orderId}: ${String(error)}`);
      return false;
    }
  }
}
```

### apps/koyo/srvkit/internalArgs.ts

```ts
import type { InternalArg, SignalContext } from "akanjs/signal";

export class CurrentUserId implements InternalArg<string> {
  getArg(context: SignalContext) {
    const account = context.get<{ self?: { id: string } }>("account");
    return account?.self?.id ?? null;
  }
}
```

### apps/koyo/lib/order/order.signal.ts

```ts
import { CanCancelOrder, CurrentUserId, SignedIn } from "@apps/koyo/srvkit";
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
})) {}
```

### apps/koyo/srvkit/createOrderHash.ts

```ts
import { createHash } from "node:crypto";

export const createOrderHash = (orderId: string) => {
  return createHash("sha256").update(orderId).digest("hex");
};
```

### apps/koyo/srvkit/emailClient.ts

```ts
import { Mailer } from "some-mail-provider";

export class EmailClient {
  #mailer: Mailer;

  constructor(apiKey: string) {
    this.#mailer = new Mailer({ apiKey });
  }

  sendReceipt(to: string, receiptCode: string) {
    return this.#mailer.send({ to, subject: `Receipt ${receiptCode}` });
  }
}
```

### apps/koyo/lib/option.ts

```ts
import { AkanOption } from "akanjs/server";
import { EmailClient } from "../srvkit";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions & {
  mailer: { apiKey: string };
};

export const option = new AkanOption<ModulesOptions>().use((options) => ({
  emailClient: new EmailClient(options.mailer.apiKey),
}));
```

### apps/koyo/lib/order/order.service.ts

```ts
import { createOrderHash, type EmailClient } from "@apps/koyo/srvkit";
import { serve } from "akanjs/service";

import * as db from "../db";

export class OrderService extends serve(db.order, ({ use }) => ({
  emailClient: use<EmailClient>(), // [!code highlight]
})) {
  async sendReceipt(order: db.Order) {
    const receiptCode = createOrderHash(order.id);
    await this.emailClient.sendReceipt(order.email, receiptCode);
  }
}
```

### apps/koyo/srvkit/paymentApi.ts

```ts
import { adapt } from "akanjs/service";

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
    const url = `${this.endpoint}${path}`;
    const signal = AbortSignal.timeout(20_000);
    const response = await fetch(url, { ...init, signal });
    return (await response.json()) as T;
  }
}
```

### apps/koyo/lib/order/order.service.ts

```ts
import { PaymentApi } from "@apps/koyo/srvkit";
import { serve } from "akanjs/service";

import * as db from "../db";

export class OrderService extends serve(db.order, ({ plug }) => ({
  paymentApi: plug(PaymentApi), // [!code highlight]
})) {
  async pay(order: db.Order) {
    return await this.paymentApi.requestPayment(order.id, order.totalPrice);
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

