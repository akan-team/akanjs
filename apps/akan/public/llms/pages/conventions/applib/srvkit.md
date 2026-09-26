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

Pure, isomorphic, zero-dependency; imports only sibling common/* and akanjs/base, not Err.

Touches window, navigator or Capacitor, or is a React hook.

Touches node:*, Bun, process.env, a secret, or a server SDK.

Renders JSX or defines a recipe, bound to no model; a model-bound component goes in its module.

A build-time or CLI-time AkanPlugin, registered in akan.config.ts.

Decides whether a request may run an endpoint: sign-in, role or ownership checks.

Reads a trusted value, such as the caller's account, and hands it to exec as an argument.

Wraps every signal call and attaches server context before the endpoint's guards run.

Runs before a page request is routed, to redirect, rewrite, or add headers.

Server helper

A reusable function for hashing, encryption, file handling, image inspection or tokens.

A singleton adapt() class wrapping storage, queues, email, payment or a vendor API.

Legacy: a server-only class, such as an SDK client, injected through option.ts.

Page request

Signal call

Server level: registered once in option.ts

Redirects, rewrites or adds headers before the page is chosen.

Attaches server context, such as the account, before guards run.

Signal level: named on each endpoint or slice

Allows or refuses the call.

Hands a server-made value to exec as an argument.

Sent as is; later proxies and the page do not run.

A redirect Response; the status defaults to 307.

Continues with the request headers you changed.

Serves another path while the address bar stays the same.

Passes the request on unchanged.

The caller only

An MCP listing runs it with no arguments and hides what this caller certainly cannot use.

The call's arguments too

An MCP listing skips it, so the entry stays visible and is stopped at call time.

From `akanjs/signal`: raw request, response, caller IP, and the socket with its `socketId`.

From `@libs/shared/srvkit`: account, signed-in user, admin, and whether a model is calling.

Function helper

Imported straight from the srvkit barrel.

Singleton adaptor

`plug(Class)` in the service, with nothing in option.ts.

Class instance (legacy)

Built in option.ts `.use()`, then injected with `use<T>()`.

A value option.ts provides under the same key: the legacy path.

A value read from the server options once, when the server starts.

Another adaptor, or a built-in role such as `StorageAdaptorRole`.

A value this adaptor keeps in the cache adaptor; `local: true` keeps it in-process instead.

Server Utility Overview

It is also the one safe door for external libraries: vendor SDKs and low-level server APIs pass through srvkit first.

Which folder?

Folder

What Belongs In srvkit/

srvkit/ holds seven kinds of code. Four step into the request path, and three are tools a service calls:

Kind

Where the request-path four run

A page request and a signal call take different paths, and each piece sits on only one of them:

Piece

Runs here

Not here

Server Level: WebProxy And Middleware

Both are registered once in the option chain and apply to every request of their kind. A WebProxy acts on page requests before routing; a Middleware wraps every signal call.

Page render

Return value

What happens

attach context

This Middleware resolves the caller and stores it where guards and InternalArgs read it:

Register them in option.ts

Once both are declared in srvkit, register them in the app's or library's option chain:

Signal Level: Guard And InternalArg

Guards and internal args are named per endpoint or slice. A Guard decides whether the call may run; an InternalArg turns trusted server context into an exec argument.

After Middleware prepares the context

allow or refuse

build exec args

Service logic

Reads

In an MCP listing

An InternalArg reads the request context and hands a server-made value to exec, so business logic gets it without asking the client:

Before writing your own, check the ones that already ship:

Service Logic And External Libraries

When a service needs crypto, an AI SDK, an HTTP client or another server-only package, wrap it in srvkit first. How the service then reaches it depends on what you wrapped:

What you wrapped

How the service gets it

Class instance: the legacy shape

It takes three files. First, a plain class in srvkit:

Adaptor And plug

The service plugs it by class:

Injector

Practical Rules

Where the code goes

Inside a srvkit file

## Code Examples

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

