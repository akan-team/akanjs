# akanjs/signal

- Source: /references/akanjs/signal
- Mirror: /llms/pages/references/akanjs/signal.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/signal (#akanjs-signal)
- Public / None / guard (#Public / None / guard)
- McpProgress (#McpProgress)
- Req / Res / Ip / Ws (#Req / Res / Ws)
- middleware / Middleware (#middleware / Middleware)
- SignalRegistry (#SignalRegistry)

## Content

akanjs/signal

Export

`akanjs/signal` declares the API boundary around a service: what may be called, by whom, over which transport. You import it in `*.signal.ts` files and in the `srvkit/` files that hold guards and middleware.

What It Exports

- endpoint: Declares the calls a module exposes: queries, mutations and WebSocket endpoints.

- internal: Declares work the server starts itself: schedules, lifecycle hooks, queue jobs, resolved fields.

- slice: Declares the list queries a client store loads, and guards the generated CRUD endpoints.

- Public, None, guard: Guards. They run before the handler and decide whether the call may go on.

- Req, Res, Ip, Ws: Internal arguments: handler arguments the server fills in, such as the request.

- middleware, Logging, Timeout: Middleware wraps every endpoint call. The two built-ins are registered by default.

- McpProgress: Reports progress from inside a long MCP tool call.

- SignalRegistry, serverSignal: Look up registered signals, and publish or enqueue from a service.

- SignalContext: The per-call context guards and middleware receive: transport, arguments and caller.

Four Endpoint Kinds

The `endpoint` builder hands you four kinds, and each kind fixes its transport:

Kind

HTTP

WebSocket

- Request and response

  - query: Reads, over `GET`. The only kind that may declare `cache`.

  - mutation: Writes, over `POST`. The `method` option moves it to `PATCH`, `PUT` or `DELETE`.

- Realtime

  - pubsub: The client subscribes to a room, and the server publishes into it.

  - message: The client sends one message and gets one answer back.

travels over it

does not

An MCP prompt is not an endpoint kind. It is declared on a page with `page().prompt(name, description)`.

- The Signal File — How `Internal`, `Slice` and `Endpoint` are laid out in one `*.signal.ts`.

- MCP Prompts — Declared on a page with `page().prompt(name, description)`.

- The Guards That Ship — `Every`, `Admin`, `Person` and the other guards `libs/shared` provides.

- Report MCP Progress — The progress stream step by step, from the client's side too.

Public / None / guard

A guard decides whether a call may run, before its handler does. Every custom endpoint names its own `guards` array, and every guard in it must pass.

- Public: Always passes. Use it on slice reads such as `get:`, never as a mutation's only guard.

- None: Always refuses the call.

- guard(name): A base class with `static name` filled in and `scope` preset to `"account"`.

- Guard: The interface: `canPass(context)` returns a boolean, or a promise of one.

- GuardScope: `"account"` or `"resource"`: what the guard needs to reach a verdict.

Account Or Resource

Every guard carries a `static scope`, which says whether the verdict needs the call's arguments:

Reads arguments

Checked for MCP listing

- GuardScope

  - "account": Reads only the caller, through `context.get("account")`.

  - "resource": Reads the call's arguments via `context.getArg(name)`, so it is judged only at call time.

yes

no

**Role checks are `"account"`.** In `libs/shared`, `Every`, `Admin` and `Person` are `"account"`; `Owner`, `SelfOrAdmin` and any `Can<Verb><Model>` guard are `"resource"`.

**With `implements Guard`, declare it yourself.** `guard(name)` presets `"account"`, so a guard built on it that reads arguments overrides it with `"resource"`.

Writing A Guard

Guards live in `srvkit/guards.ts`, one class each:

Then name them on each endpoint. A `pubsub` room is not covered by slice guards, so it declares its own:

**Same guard, every transport.** Guards run on HTTP and WebSocket calls alike, so read the caller with `context.get("account")` instead of branching on the transport.

**In order, and the first refusal wins.** Guards run in the order declared, and the first one that refuses stops the call.

**Slice guards stop at CRUD.** A slice's `guards` cover only its generated query and mutation endpoints; each `pubsub` and `message` declares its own.

**Keep `static name`.** fetch serializes guard names, and the API explorer filters on them.

**A wrong scope misleads the MCP catalogue.** Exposure follows the guards, so a caller-only guard marked `"resource"` lists the endpoint to callers who cannot use it, and an argument-reading guard marked `"account"` hides it from everyone.

McpProgress

`McpProgress` reports how far a long MCP tool call has got, so the agent's client can show it. Call it wherever the work happens; nothing has to be passed down.

- McpProgress.report(progress, option?) ((progress: number, option?: McpProgressOption) => void): Sends one progress notification for the call running on this stack.

- option.total (number): Optional. The denominator the client renders; omit it when the amount of work is unknown.

- option.message (string): Optional. One short line on the current step; the user reads it, so write prose.

- McpProgress.streaming (boolean): `true` only while a client is streaming, so a costly message can be skipped.

A service that imports rows reports after each one:

**A no-op outside a stream.** Over plain HTTP, a WebSocket or in a test, `report` does nothing, so the same code runs unchanged.

**Reachable from any depth.** It rides `AsyncLocalStorage`, so a service, an adapter or a loop several frames down reports without a channel parameter.

**The client opts in.** A call streams only when the request sent both `Accept: text/event-stream` and a `_meta.progressToken`.

**The response switches on the first report.** Only then does the server answer with SSE; a call that never reports gets an ordinary response.

Req / Res / Ip / Ws

Internal arguments are handler arguments the server fills in, not the caller. Declare one with `.with(X)`, and the handler receives it after the declared arguments.

Argument

HTTP — query · mutation

WebSocket — pubsub · message

- The request

  - Req: The current Bun request, `Bun.BunRequest`.

  - Res: The `Response` class, for building a reply such as `res.json(value)`.

- The caller

  - Ip: The caller's IP as the nearest proxy recorded it, or `null`.

- The connection

  - Ws: `ws`, `socketId`, `subscribe`, and the `on` / `off` cleanup hooks.

available

not available

Libraries add their own, such as `Self`, `Me` and `Account` from `@libs/shared/srvkit`. Take the caller from those, never from an id the client sends.

A mutation that reads the raw request body and the caller's IP, and a message handler that cleans up when the socket closes:

**Required unless nullable.** A required internal argument that comes back `null` refuses the call with 401. Pass `{ nullable: true }` when `null` is a valid answer, as it is for `Ip`.

**A returned `Response` is sent as is.** Serialization is skipped, which is how an endpoint declared `Any` streams a file back.

**Cleanup belongs to the call that registered it.** `on("disconnect" | "unsubscribe", fn)` is scoped to the room for a `pubsub` and to the socket for a `message`. Register both when it must run either way.

**`socketId` names a connection, not a caller.** Key per-user state on the account, and never mint an id of your own.

**Never read the caller's IP off the socket or the request.** Behind the gateway, every peer is the gateway itself (`127.0.0.1`) for every caller. Take `.with(Ip)`.

middleware / Middleware

Middleware wraps every endpoint call, before and after the handler. Two are registered by default; write your own with `middleware(refName)`.

Middleware

Acts when

What it does

- `Logging` — Always. — Writes debug lines around the call, and an error line when it fails.

- `Timeout` — The endpoint declares `timeout` in ms. — Rejects with `base.error.gatewayTimeout` (504) once the time is spent.

An endpoint's `{ cache: <ms> }` is not a middleware. The stored answer is looked up inside the call, after the guards, so a hit reaches only a caller they admitted.

Call Order

From the outside in:

The two defaults: `Logging` → `Timeout`.

Middleware a `lib/option.ts` adds with `applyMiddleware(...)`, such as `AccountMiddleware` from `libs/shared`.

The endpoint's own `middlewares` option.

Guards, then internal arguments, then the `cache` lookup if the endpoint declares one, then the handler.

Writing One

A middleware that warns about slow calls:

Register it in one of two places:

Where

- lib/option.ts: Every endpoint the server runs, after the two defaults. — Example: `option.applyMiddleware(SlowCallMiddleware);`

- middlewares: The endpoint option. Applies to that endpoint only, inside every global middleware. — Example: `mutation(Boolean, { guards: [Admin], middlewares: [SlowCallMiddleware] })`

**`use(env)` runs once.** The handler it returns serves every call, so set up in `use` and keep per-call work in the handler.

**Skipping `next()` skips the guards.** Guards run inside `next()`, so never answer from a middleware on behalf of a guarded endpoint. For a stored answer, declare `{ cache: <ms> }` on the endpoint instead.

**`refName` is the key.** Registering a middleware under a `refName` already taken replaces the earlier one.

**A timeout does not cancel the work.** The handler keeps running with nobody holding its result, so a write still happens. The deadline answers the caller; it does not undo the call.

SignalRegistry

`SignalRegistry` finds a module's registered signals by refName at runtime. A refName nothing registered returns `undefined`.

Method

- getDatabase(refName): A database module's `internal`, `endpoint`, `slice`, `server` and `serializedSignal`.

- getService(refName): A service module's `internal`, `endpoint`, `server` and `serializedSignal`.

Look one up by refName:

Publishing From A Service

Each module also has a server signal, which a service injects with `signal<sig.X>()`. It turns endpoints and internals into methods:

- <pubsubKey>(...roomArgs, data): One per `pubsub` endpoint. Publishes `data` to the room the arguments name.

- <processKey>(...args, jobOptions?): One per `process` internal. Enqueues a job and returns its `AkanJob`.

The notice service saves a notice, then publishes it to the `noticeAdded` room from the guard example:

**Save first, then notify.** A subscriber then never receives a record that failed to save.

**The room's return model shapes the data.** `data` is serialized with the `pubsub` endpoint's return model, like any response.

**The field name picks the signal.** `noticeSignal` resolves to the `notice` module's server signal, and the `Signal` suffix is required.

## Code Examples

### apps/koyo/srvkit/guards.ts

```typescript
import { type Guard, type GuardScope, guard, type SignalContext } from "akanjs/signal";

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
}
```

### apps/koyo/lib/notice/notice.signal.ts

```typescript
import { AdminOnly, SelfOnly } from "@apps/koyo/srvkit";
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
})) {}
```

### apps/koyo/lib/task/task.service.ts

```typescript
import { McpProgress } from "akanjs/signal";
import { serve } from "akanjs/service";

import type * as cnst from "../cnst";
import * as db from "../db";

export class TaskService extends serve(db.task, () => ({})) {
  async importTasks(rows: cnst.TaskInput[]) {
    for (const [idx, row] of rows.entries()) {
      McpProgress.report(idx + 1, {
        total: rows.length,
        message: `Importing ${row.title}`,
      });
      await this.createTask(row);
    }
    return rows.length;
  }
}
```

### apps/koyo/lib/_wallpad/wallpad.signal.ts

```typescript
import { Every } from "@libs/shared/srvkit";
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
})) {}
```

### apps/koyo/srvkit/slowCallMiddleware.ts

```typescript
import { middleware, type SignalContext } from "akanjs/signal";

export class SlowCallMiddleware extends middleware("slowCall") {
  override async use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const start = Date.now();
      const result = await next();
      const ms = Date.now() - start;
      if (ms > 1000) context.adaptor.logger.warn(`${context.key}: ${ms}ms`);
      return result;
    };
  }
}
```

### apps/koyo/srvkit/signalLookup.ts

```typescript
import { SignalRegistry } from "akanjs/signal";

const userSignal = SignalRegistry.getDatabase("user");
const utilSignal = SignalRegistry.getService("util");
```

### apps/koyo/lib/notice/notice.service.ts

```typescript
import { serve } from "akanjs/service";

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
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

