# Authorization

- Source: /cheatsheet/general/auth
- Mirror: /llms/pages/cheatsheet/general/auth.md
- Section: cheatsheet
- Category: General
- Priority: P2

## Headings

- Authorization (#overview)
- The Guards That Ship (#guards)
- Declare The Scope (#scope)
- Resource Guards Fail Closed (#resource-guard)
- The Acting User Comes From The Server (#acting-user)
- Guards Are Also The Agent Decision (#agent-exposure)

## Content

Authorization

You ship the order list for a shop with several branches, and every row looks right because the branch id comes from the URL. Then a customer edits the URL, and the same endpoint hands them somebody else's orders.

Authorization answers two questions in front of every endpoint: who is calling, and may they do this? Three steps answer them, the same over HTTP, a websocket or the MCP endpoint:

**Middleware reads the caller.** `AccountMiddleware` from `libs/shared` verifies the token and leaves the result on the call as the account.

**Guards decide.** Each guard in the `guards` array answers `canPass(context)` in declaration order, and the first refusal ends the call.

**Internal arguments hand the handler its values.** `.with(Self)` and its kind fill in values the server resolved, never ones the client typed.

Words used on this page

Term

- account: What the middleware leaves on the call. A guest's account holds neither `self` nor `me`.

- self, me: The two identities an account can carry: `self` is the user, `me` is the admin.

- scope: What a guard needs to answer: the caller alone (`account`) or the call's arguments (`resource`).

- agent: An AI model calling through the MCP endpoint or on an OAuth token, instead of a person.

One call, from the door to the handler

Request

Arguments parsed

Middleware

guards array

in declaration order

Internal arguments

exec() handler

hidden and secret fields masked

first refusal

**No guards array means no checks.** Akan has no default policy: an endpoint that names no `guards` runs zero checks. A `mutation` without guards is callable by anyone who can reach the route, and nothing asks them to sign in first.

The Guards That Ship

A guard is a class with one method, `canPass`. A slice names guards in its `guards` map, and every custom endpoint in its own `guards` array:

**Every `slice()` takes a guards map, and `root:` is always `Admin`.** The root slice lets its caller pick any filter the model declares, which is an admin's job.

**A named slice and a custom endpoint never inherit the map.** Each names its own array, `init({ guards: [...] })` or `mutation(..., { guards: [...] })`, so a reader sees who may call it without opening another file.

**The generated CRUD stays admin-only here.** Customers reach their own orders through endpoints that read the caller, shown further down.

Keys of the slice guards map

Each key guards the endpoints the slice generates for the model:

- root (GuardCls | GuardCls[]): The root slice: an admin list API that takes a filter name and its args. Always `Admin`.

- get (GuardCls | GuardCls[]): The single-document reads `icecreamOrder(id)` and `lightIcecreamOrder(id)`.

- cru (GuardCls | GuardCls[]): `createIcecreamOrder`, `updateIcecreamOrder` and `removeIcecreamOrder` together.

- create (GuardCls | GuardCls[], default cru): Overrides `cru` for `createIcecreamOrder` alone.

- update (GuardCls | GuardCls[], default cru): Overrides `cru` for `updateIcecreamOrder` alone.

- remove (GuardCls | GuardCls[], default cru): Overrides `cru` for `removeIcecreamOrder` alone.

Guards on the shelf

`akanjs/signal` ships two guards that judge nobody. `@libs/shared/srvkit` ships the role ladder that every app mounting `libs/shared` inherits.

Guard

Guest

user

admin

superAdmin

- akanjs/signal

  - Public: Passes everyone, guests and agents included. For a slice `get:`, never a mutation.

  - None: Refuses everyone: the explicit way to close a generated endpoint.

- @libs/shared/srvkit

  - Every: Any signed-in caller: `user`, `admin` or `superAdmin`.

  - User: The `user` role only. An admin who is not also a user is refused.

  - Admin: `admin` or `superAdmin`. The admin-console guard, and every slice's `root:`.

  - SuperAdmin: `superAdmin` only.

  - Owner: The roles of `Every`, but `resource` scope: judged at call time, never in a listing.

  - SelfOrAdmin: `resource` scope. The user the `userId` argument names, or an admin; no `userId` refuses all.

  - Person: Passes any person and refuses an agent. Pair it with a role guard: `guards: [Every, Person]`.

Passes

Refused

An agent's token carries the same `self` or `me` as the person who granted it, so every guard above except `Person` judges the agent like that person.

401 or 403

Which status a refused call gets depends on where it was refused:

Refused because

Status

What the caller learns

- Role guard: no identity at all — 401 — An MCP client reads this status as “obtain a token”.

- Role guard: signed in, lacks the role — 403 — Names the roles required and the roles the caller holds.

- Any guard: returns `false` — 403 — Names the guard that refused, by its `static name`.

- Internal argument: a required `.with()` value is `null` — 401 — Names the missing argument; mark it `{ nullable: true }` if the handler can do without it.

Declare The Scope

Every guard class also declares `static scope: GuardScope`, required and with no default. It says what the guard needs in order to answer, so an agent catalogue can evaluate some guards before any call exists.

A guard that reads only the caller is `"account"`:

- scope = "account" — `SignedIn · Every · Admin · Person` — The verdict reads the caller and nothing about the call, so it runs with no arguments. An agent listing uses it to hide what this caller certainly cannot use.

- scope = "resource" — `Can<Verb><Model> · Owner · SelfOrAdmin` — It reads the call's arguments through `context.getArg()` and refuses without them, so a listing never evaluates it. The entry stays visible and is stopped at call time.

Marking it wrong

Neither mistake is a type error: both strings satisfy `GuardScope`, and the compiler cannot see whether `canPass` reads an argument. The two fail differently:

Mistake

What happens

A resource guard marked `"account"`

A listing runs it argument-free; it refuses or throws and hides the entry from legitimate callers.

An account guard marked `"resource"`

It filters nothing: the entry is listed to every caller, even one it will refuse at call time.

**Rule of thumb:** `SignedIn`, `Admin` and every role check are `"account"`; every `Can<Verb><Model>` is `"resource"`. Among the shipped guards, only `Owner` and `SelfOrAdmin` are `"resource"`.

Resource Guards Fail Closed

A role guard answers who you are, not whether this record is yours. That is a `Can<Verb><Model>` class in `srvkit/guards.ts`: it loads the record the call names, then decides.

1. Write the guard

Add it beside the other guards in `srvkit/guards.ts`:

Four things in that body are the pattern, not this model's details:

**Admin bypass goes first.** An admin never owns the record, so an ownership test above the bypass locks the admin console out of its own data.

**No resource named ⇒ `false`.** Returning `true` here would pass every call that forgot to send the argument.

**A load that throws ⇒ warn, then `false`.** A database hiccup must not read as permission granted, and the warn is the only sign that the guard refuses for the wrong reason.

**`static name` stays.** It looks like dead code, but fetch serializes guard names onto every endpoint and the API explorer filters on them; deleting it breaks that UI.

Three more hold for every guard you write, not only resource guards:

**Read the caller with `context.get("account")`.** It answers the same over HTTP, a websocket and MCP; branching on `getHttpContext()` does not.

**No side effects.** When a socket's credential changes, the guards of every room it joined run again outside any request.

**No per-call state on the instance.** One instance of each guard class serves every call, so a field set in one call is seen by the next.

2. Name it on the endpoint

Put it after the role guard in the endpoint's own `guards` array:

**Order matters.** Guards run in declaration order and stop at the first refusal, so `Every` answers an anonymous caller with 401 before the record is ever loaded.

Two independent gates

**Guards ship with the library that owns the model.** Its own signals import them, so an app that mounts the library inherits the authorization and cannot forget it.

**The service re-checks ownership anyway.** A service method is also reached from another service, a cron trigger or a queue job, and none of those passed a guard.

The Acting User Comes From The Server

A guard decides whether the call runs; an internal argument tells the handler who is running it. `.with(...)` reads that value from the account the middleware verified, after the guards pass, and never from the request body.

Two endpoints that read the caller:

**`.with(Self)`** hands `listMyIcecreamOrders` the signed-in user, so the client sends no id at all.

**`{ nullable: true }`** lets `refundIcecreamOrder` run without an admin. Without it, a `null` value answers 401 Unauthorized, which is the safe default.

**`.with(AgentCall)`** keeps the refund open to an agent but skips the customer mail when one drives it. To refuse agents outright, use `guards: [Every, Person]` instead.

Internal arguments on the shelf

`@libs/shared/srvkit` ships the first four. Write your own in `srvkit/` the same way: a class with one `getArg(context)`.

Internal argument

- .with(Self): The signed-in user, or `null`. The one to reach for in a user-facing endpoint.

- .with(Me): The signed-in admin, or `null`. `Self` and `Me` are two identities on one account, not two roles.

- .with(Account): The whole account, for a handler that branches on both identities at once.

- .with(AgentCall): `true` when an agent drives the call. It narrows what the call does, not who may make it.

- CurrentUserId: The workspace scaffold writes it to `srvkit/internalArgs.ts`, for handlers needing only an id.

- Ip, Ws, Req, Res: From `akanjs/signal`: the caller's IP, the websocket, and the raw HTTP request and response.

**Never take the acting user as a body or param.** A `userId` the client typed is a value the client chose: the handler cannot tell it from the caller's own id, and a guard that already passed says nothing about it.

Guards Are Also The Agent Decision

Every signal is also served to AI agents as an MCP server on `POST /mcp`, mounted by default. There is no per-endpoint opt-in: the guards you already wrote decide what is published.

Guards are already the authorization decision, so a second switch would add nothing. It would only keep every endpoint added later invisible to agents until somebody remembered to flip it.

Endpoint

- Decided by the guards

  - guards: [Every]: A real guard publishes the endpoint, and the same guard judges every call on both.

  - no guards: Anyone may call it over HTTP, and it is never published. Write `guards: [Public]` if that is the intent.

  - query · [Public]: Anonymous access, written down: a query publishes.

  - mutation · [Public]: Not published: `[Public]` on a mutation is having no guard, spelled out.

  - [Every, Person]: `Person` sets `static agents = false`: the act is gone from the catalogue, not hidden per caller.

- Your own choice

  - mcp: false: Off the shelf, guards untouched. Curation, not authorization: HTTP serves it as before.

  - mcp: { cru: false }: The same on `slice()`, as a map keyed like its `guards` map.

Served

Left out

**Never make a refusal more helpful.** A refused endpoint answers the same unknown-tool error as one that does not exist, and a guard's 401 or 403 reaches the agent as one generic sentence. The gap between “no such tool” and “you may not call it” is exactly what enumerates your private surface.

Related pages

MCP Server

Resource URIs, OAuth metadata, rate limits and the rest of the wire.

OAuth For Agents

How an agent signs in and gets the token these guards judge.

## Code Examples

### apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts

```ts
import { Admin, Every, Self } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint, internal, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class IcecreamOrderInternal extends internal(srv.icecreamOrder, () => ({})) {}

export class IcecreamOrderSlice extends slice(
  srv.icecreamOrder,
  { guards: { root: Admin, get: Admin, cru: Admin } }, // [!code highlight]
  () => ({}),
) {}

export class IcecreamOrderEndpoint extends endpoint(srv.icecreamOrder, ({ mutation }) => ({
  cancelIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Every] }) // [!code highlight]
    .param("icecreamOrderId", ID)
    .with(Self)
    .exec(async function (icecreamOrderId, self) {
      return await this.icecreamOrderService.cancel(icecreamOrderId, self.id);
    }),
})) {}
```

### apps/koyo/srvkit/guards.ts

```ts
import type { Guard, GuardScope, SignalContext } from "akanjs/signal";

export class SignedIn implements Guard {
  // fetch serializes guard names and the API explorer filters on them; deleting this breaks that UI.
  static name = "SignedIn";
  static scope: GuardScope = "account"; // [!code highlight]

  canPass(context: SignalContext): boolean {
    return !!context.get<{ self?: { id: string } }>("account")?.self;
  }
}
```

### apps/koyo/srvkit/guards.ts

```ts
import { Logger } from "akanjs/common"; // [!code ++]
import type { Guard, GuardScope, SignalContext } from "akanjs/signal";
import type * as srv from "../lib/srv"; // [!code ++]

export class SignedIn implements Guard { // [!code collapse:9]
  // fetch serializes guard names and the API explorer filters on them; deleting this breaks that UI.
  static name = "SignedIn";
  static scope: GuardScope = "account";

  canPass(context: SignalContext): boolean {
    return !!context.get<{ self?: { id: string } }>("account")?.self;
  }
}

export class CanCancelIcecreamOrder implements Guard { // [!code ++:21]
  static name = "CanCancelIcecreamOrder";
  static scope: GuardScope = "resource";
  static #logger = new Logger("CanCancelIcecreamOrder");

  async canPass(context: SignalContext): Promise<boolean> {
    const account = context.get<{ self?: { id: string }; me?: { id: string } }>("account");
    if (account?.me) return true;
    const selfId = account?.self?.id;
    const icecreamOrderId = context.getArg<string>("icecreamOrderId");
    if (!selfId || !icecreamOrderId) return false;
    try {
      const service = context.getService<srv.IcecreamOrderService>("icecreamOrder");
      const icecreamOrder = await service.getIcecreamOrder(icecreamOrderId);
      return icecreamOrder.owner === selfId;
    } catch (error) {
      CanCancelIcecreamOrder.#logger.warn(`cancel guard could not load ${icecreamOrderId}: ${String(error)}`);
      return false;
    }
  }
}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts

```ts
import { CanCancelIcecreamOrder } from "@apps/koyo/srvkit"; // [!code ++]
import { Every, Self } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class IcecreamOrderEndpoint extends endpoint(srv.icecreamOrder, ({ mutation }) => ({
  cancelIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Every, CanCancelIcecreamOrder] }) // [!code highlight]
    .param("icecreamOrderId", ID)
    .with(Self)
    .exec(async function (icecreamOrderId, self) {
      return await this.icecreamOrderService.cancel(icecreamOrderId, self.id);
    }),
})) {}
```

### apps/koyo/lib/icecreamOrder/icecreamOrder.signal.ts

```ts
import { AgentCall, Every, Me, Self, User } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class IcecreamOrderEndpoint extends endpoint(srv.icecreamOrder, ({ query, mutation }) => ({
  listMyIcecreamOrders: query([cnst.LightIcecreamOrder], { guards: [User] })
    .with(Self) // [!code highlight]
    .exec(async function (self) {
      return await this.icecreamOrderService.listByOwner(self.id);
    }),
  refundIcecreamOrder: mutation(cnst.IcecreamOrder, { guards: [Every] })
    .param("icecreamOrderId", ID)
    .with(Me, { nullable: true }) // [!code highlight]
    .with(AgentCall)
    .exec(async function (icecreamOrderId, me, isAgentCall) {
      return await this.icecreamOrderService.refund(icecreamOrderId, {
        byAdmin: !!me,
        notifyCustomer: !isAgentCall,
      });
    }),
})) {}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

