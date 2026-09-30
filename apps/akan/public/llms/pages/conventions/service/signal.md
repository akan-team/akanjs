# service.signal.ts

- Source: /conventions/service/signal
- Mirror: /llms/pages/conventions/service/signal.md
- Section: conventions
- Category: Service
- Priority: P1

## Headings

- service.signal.ts (#signal-file)
- Every Endpoint Names Its Guards (#guards)
- Routes A Protocol Fixes (#custom-routes)
- Work The Runtime Starts (#internal)
- Realtime Without A Model (#realtime)

## Content

service.signal.ts

service.signal.ts is the door in front of a service module. The signal decides who may call and with which arguments, and the service decides what happens. You open it to add an endpoint, a scheduled job or a realtime room.

Words used on this page

Term

- service module: A module in `lib/_<name>` with no table of its own, such as `_security` or `_oauth`.

- guard: A class that decides whether a call may run, such as `Public`, `Every` or `Admin`.

- internal argument: A value the server fills in rather than the caller, taken with `.with(...)`.

- MCP: The protocol AI agents use to call your endpoints. Akan serves it at `/mcp`.

- serverMode: A server's role: `federation` answers requests, `batch` runs background work, `all` does both.

Two classes, not three

A model module's signal declares three classes. A service module's declares two, because it has no table to put a slice in front of:

Class

Model module — lib/<model>

Service module — lib/_<service>

- Declared in this order

  - XInternal: Work the runtime starts: schedules, queue jobs, boot and shutdown. Written even when empty.

  - XSlice: A paged window onto a table, with an insight query behind it. No table, no slice.

  - XEndpoint: What callers reach: `query`, `mutation`, `pubsub` and `message`.

Declared

Not declared

Here is the whole file for a receipt module with one endpoint:

**The Internal class stays, even empty.** It marks where scheduled work goes.

**`exec` is one line.** It hands the arguments to the service and returns what the service returns.

**The signal adds the noun back.** The service method is `print` and the endpoint is `printReceipt`, so `st.do.printReceipt` reads like `fetch.printReceipt`.

Common mistake: an endpoint with no guards

This `libs/util` file used to have the shape to avoid. The red line is how it read; the green line is the fix it carries now:

**An endpoint that names no guards runs zero checks.** Without one, anyone could encrypt any input with the app's own key, which turns `encrypt` into an oracle. A library that cannot reach `libs/shared`'s `Admin` closes the endpoint with `[None]` and keeps it off MCP with `mcp: false`.

Every Endpoint Names Its Guards

In a model module, the slice's guards map covers the generated CRUD endpoints. A service module has no slice, so there is no default to inherit: each endpoint writes its own `guards` array right beside it.

The same array also decides whether AI agents see the endpoint over MCP:

What the endpoint declares

Checks the caller

Agents see it — MCP

- Names a real guard

  - { guards: [Every] }: Published. An agent's call is checked like anyone else's.

  - { guards: [Every], mcp: false }: HTTP serves it as before. Only the agent listing drops it.

  - { guards: [Every, Person] }: A person-only act. A model is refused and never sees the entry.

- Names Public, or nothing

  - query(T, { guards: [Public] }): An open read, decided on purpose. Published, like the doc tools below.

  - mutation(T, { guards: [Public] }): Runs for anyone over HTTP. MCP treats it as having no guard.

  - no guards: Zero checks over HTTP, and refused by MCP.

Yes

No

An open endpoint is fine when it is a decision, written down as one. The docs app's own signal does exactly that:

**`[Public]` is the decision here.** The same markdown is already served anonymously under `/llms/pages`, so a guard would protect nothing and lock out the agents these tools exist for.

**The class comment says why.** Why an obvious alternative was rejected is one of the few kinds of comment this codebase keeps.

**A miss is an `Err`, not an empty page.** `readDocPage` throws `doc.error.docPageNotFound` so an agent is told it asked for nothing.

**`[Public]` on a mutation is having no guard, spelled out.** MCP refuses a `mutation` whose only guard is `Public`, just as it refuses one with no guards at all. Which guard to use when is on the Authorization cheatsheet.

Routes A Protocol Fixes

Most endpoints are reached through the path Akan builds, and nobody types it. A protocol endpoint is different: RFC 8414 fixes the metadata document at `/.well-known/oauth-authorization-server`, and a client that does not find it there has nowhere else to look.

`libs/shared` puts its OAuth endpoints exactly where the RFCs say:

Four options place a route. One shared `protocolRoute` const keeps the five protocol endpoints from disagreeing about them:

- path (string, default endpoint name): A literal route, in place of the one built from the endpoint name and its `.param()`s.

- prefix (false | string, default model refName): The segment before the path. A model module puts its refName there; a service module, nothing.

- globalPrefix (false, default API prefix (/api)): `false` drops the app's API prefix, so the route sits at the origin root.

- mcp (boolean, default true): `false` keeps it off the agent listing without changing who may call it.

**`[Public]` is the decision again.** A client holds no credential yet, and getting one is why it came.

**`prefix: false` states the root position outright.** A service module adds no prefix anyway, so the line documents intent rather than changing the route.

Values the server fills in

`.with(X)` hands `exec` a value the caller never sends, after the declared arguments:

Internal argument

- .with(Req): The raw `Request`, for a form body or a header Akan does not parse for you.

- .with(Ip): The caller's IP as the nearest proxy recorded it, or `null` when no address is known at all.

- .with(Account): The verified account of the caller, imported from `@libs/shared/srvkit`.

**Missing means refused, unless nullable.** A `null` value without `{ nullable: true }` rejects the call as `Unauthorized`. `authorizeOAuth` and `registerOAuthClient` opt in because they answer strangers.

**Never read the IP off the socket.** Behind the gateway every peer is `127.0.0.1`, which is why `Ip` reads what a proxy recorded.

**Never take the acting user from the body.** Read it with `.with(Account)`, `Self` or `Me`, which the caller cannot forge.

Return a Response as it is

A `Response` returned from `exec` is sent as it stands, with no serialization. The OAuth endpoints use it to answer with the exact status, headers or 302 redirect a client expects. `localFile` uses it to stream a file back with no copy:

**`[Public]` makes anonymous reads a stated decision.** `mcp: false` keeps the file stream off the MCP shelf.

**`*` matches the rest of the URL.** `exec` reads the file path back out of `req.url`.

**The file goes out the way Bun sends a file.** The service sets no Content-Type, so Bun types the body by its stored name and answers a Range with 206, and the response is neither buffered nor compressed. Every answer but a PDF's carries `nosniff` and a sandboxing Content-Security-Policy, so an uploaded HTML or SVG never runs on the API's origin.

Work The Runtime Starts

`internal()` holds work the runtime starts on its own: a schedule, a queue job, a step at boot or shutdown. The runtime is the only caller, so there is no request to authorize and no guards to write.

Builder

- cron(expression): Runs on a cron schedule, such as every midnight. — Example: `purgeReceipts: cron("0 0 * * *").exec(...)`

- interval(ms): Runs every `ms` milliseconds.

- timeout(ms): Runs once, `ms` milliseconds after the server starts.

- initialize(), destroy(): Runs once when the process starts, and once when it stops.

- process(Type): A background queue job. `.msg()` names each field of its payload. — Example: `reprint: process(Boolean).msg("icecreamOrderId", ID).exec(...)`

- resolveField(Type): Computes a model's `resolve` field. A service module has no model, so it never uses this.

A job that should run once a night, not once per server, names the batch worker:

Every builder except `resolveField` takes these options as its last argument:

- serverMode ("federation" | "batch" | "all", default "all"): Which server roles run it. `"batch"` runs on batch and `"all"` servers, never on federation.

- operationMode (("cloud" | "edge" | "local")[], default every mode): Runs only where `AKAN_PUBLIC_OPERATION_MODE` is in the list, like `["cloud"]`.

- lock (boolean, default true): For `cron` and `interval`, skips a run while the previous one still runs in the same process.

- enabled (boolean, default true): `false` turns the job off without deleting its code.

**Match the service's `serverMode`.** When the service declares one, the internal must declare the same, or the job is scheduled where that service is switched off.

**Empty is normal.** All eight service modules in this workspace still have an empty Internal class; that is its shape until the first scheduled job arrives.

**`lock` does not coordinate servers.** It only skips an overlapping run inside one process. Every server whose role matches runs its own copy, so give run-once work `serverMode: "batch"` and run a single batch worker.

Realtime Without A Model

`pubsub` and `message` need no table either, so a service module can carry a realtime feature on its own. Both ride the websocket:

A room clients subscribe to. It declares the room's arguments and the payload type.

One frame a client sends. Each field is declared with `.msg()`, and `exec` answers it.

The minimal app pairs one of each for a fan-out benchmark:

The service publishes into the room through its own signal, injected with `signal<sig.Minimal>()`:

**Declare `Binary` for bytes.** `pubsub(Binary)` skips the JSON envelope and, under backpressure, keeps only the newest frame. Add `{ backpressure: "queue" }` when every frame matters.

**Neither reaches MCP.** Agents never see a `pubsub` or a `message`, whatever its guards say.

**A `pubsub` or `message` is open until it names its own `guards`.** Nothing above covers it, not even a slice default in a model module. Both endpoints above say `[Public]` only because `minimal` is a benchmark app, not an example. A room's guards re-run whenever the socket's credential changes.

## Code Examples

### apps/koyo/lib/_receipt/receipt.signal.ts

```ts
import { Every } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint, internal } from "akanjs/signal";

import * as srv from "../srv";

export class ReceiptInternal extends internal(srv.receipt, () => ({})) {}

export class ReceiptEndpoint extends endpoint(srv.receipt, ({ mutation }) => ({
  printReceipt: mutation(Boolean, { guards: [Every] })
    .param("icecreamOrderId", ID)
    .exec(async function (icecreamOrderId) {
      return await this.receiptService.print(icecreamOrderId);
    }),
})) {}
```

### libs/util/lib/_security/security.signal.ts

```ts
import { endpoint, internal, None } from "akanjs/signal";

import * as srv from "../srv";

export class SecurityInternal extends internal(srv.security, () => ({})) {}

export class SecurityEndpoint extends endpoint(srv.security, ({ mutation }) => ({
  encrypt: mutation(String) // [!code --]
  encrypt: mutation(String, { guards: [None], mcp: false }) // [!code ++]
    .body("data", String)
    .exec(async function (data) {
      return await this.securityService.encrypt(data);
    }),
})) {}
```

### apps/akan/lib/_doc/doc.signal.ts

```ts
import { Int } from "akanjs/base";
import { endpoint, internal, Public } from "akanjs/signal";

import * as cnst from "../cnst";
import { Err } from "../dict";
import * as srv from "../srv";

export class DocInternal extends internal(srv.doc, () => ({})) {}

/**
 * The framework's own documentation, served to agents.
 *
 * `[Public]` on every one of these is the decision, not an omission: the corpus is the same markdown the site
 * already serves anonymously under `/llms/pages`, so a guard here would protect nothing while making the tools
 * unusable to the agents they exist for.
 */
export class DocEndpoint extends endpoint(srv.doc, ({ query }) => ({
  listDocPages: query([cnst.DocPage], { guards: [Public] })
    .search("section", cnst.DocSection)
    .exec(async function (section) {
      return await this.docService.listPages(section);
    }),

  readDocPage: query(String, { guards: [Public] })
    .param("href", String, { example: "/references/akanjs/signal" })
    .exec(async function (href) {
      // An href that names nothing is the caller's own mistake, and an agent that gets it wrong needs to be told
      // so rather than handed an empty page it would go on to summarize.
      const body = await this.docService.readPage(href);
      if (!body) throw new Err("doc.error.docPageNotFound");
      return body;
    }),

  searchDocPages: query([cnst.DocPage], { guards: [Public] })
    .param("text", String, { example: "cascade remove" })
    .search("limit", Int)
    .exec(async function (text, limit) {
      return await this.docService.searchPages(text, limit);
    }),
})) {}
```

### libs/shared/lib/_oauth/oauth.signal.ts

```ts
import { Account } from "@libs/shared/srvkit";
import { Any } from "akanjs/base";
import { endpoint, Ip, Public, Req } from "akanjs/signal";

import * as srv from "../srv";

// The protocol endpoints live at the origin's root, where RFC 8414 and the clients look for them, and are `mcp: false`
// because they are the way onto the shelf rather than anything on it. `[Public]` is the decision: a client holds no
// credential yet, which is what it is here to obtain.
const protocolRoute = { guards: [Public], prefix: false as const, globalPrefix: false as const, mcp: false as const };

export class OauthEndpoint extends endpoint(srv.oauth, ({ query, mutation }) => ({
  oauthAuthorizationServerMetadata: query(Any, {
    ...protocolRoute,
    path: ".well-known/oauth-authorization-server",
  }).exec(function () {
    return this.oauthService.metadata();
  }),

  authorizeOAuth: query(Any, { ...protocolRoute, path: "oauth/authorize" })
    .with(Req)
    .with(Account, { nullable: true })
    .exec(async function (req, account) {
      return await this.oauthService.authorize(req, account);
    }),

  // Nullable: a child reached over a unix socket learns the caller only from the gateway's headers, and a
  // deployment that lost them should register under a shared, wider bucket rather than refuse every client.
  registerOAuthClient: mutation(Any, { ...protocolRoute, path: "oauth/register" })
    .with(Req)
    .with(Ip, { nullable: true })
    .exec(async function (req, ip) {
      return await this.oauthService.register(await req.json().catch(() => null), ip);
    }),
})) {}
```

### libs/util/lib/_localFile/localFile.signal.ts

```ts
export class LocalFileEndpoint extends endpoint(srv.localFile, ({ query }) => ({
  getBlob: query(Any, { guards: [Public], path: "localFile/getBlob/*", mcp: false }) // [!code highlight]
    .with(Req)
    .exec(async function (req) {
      const path = req.url.split("/localFile/getBlob/").slice(1).join("/localFile/getBlob/");
      return await this.localFileService.serveLocalFile(path);
    }),
})) {}
```

### apps/koyo/lib/_receipt/receipt.signal.ts

```ts
import { Every } from "@libs/shared/srvkit";
import { ID } from "akanjs/base";
import { endpoint, internal } from "akanjs/signal";

import * as srv from "../srv";

export class ReceiptInternal extends internal(srv.receipt, ({ cron }) => ({ // [!code ++]
  purgeReceipts: cron("0 0 * * *", { serverMode: "batch" }).exec(async function () { // [!code ++]
    await this.receiptService.purgeExpired(); // [!code ++]
  }), // [!code ++]
})) {} // [!code ++]

export class ReceiptEndpoint extends endpoint(srv.receipt, ({ mutation }) => ({
  printReceipt: mutation(Boolean, { guards: [Every] })
    .param("icecreamOrderId", ID)
    .exec(async function (icecreamOrderId) {
      return await this.receiptService.print(icecreamOrderId);
    }),
})) {}
```

### apps/minimal/lib/_minimal/minimal.signal.ts

```ts
export class MinimalEndpoint extends endpoint(srv.minimal, ({ query, message, pubsub }) => ({
  benchFanout: pubsub(Any, { guards: [Public], mcp: false })
    .room("roomId", String)
    .exec(() => undefined),
  benchPublish: message(Boolean, { guards: [Public], mcp: false })
    .msg("roomId", String)
    .msg("seq", Int)
    .msg("sentAt", Int)
    .exec(async function (roomId, seq, sentAt) {
      return await this.minimalService.publishBenchFanout(roomId, seq, sentAt);
    }),
})) {}
```

### apps/minimal/lib/_minimal/minimal.service.ts

```ts
export class MinimalService extends serve("minimal" as const, { serverMode: "batch" }, ({ signal }) => ({
  minimalSignal: signal<sig.Minimal>(),
})) {
  async publishBenchFanout(roomId: string, seq: number, sentAt: number) {
    await this.minimalSignal.benchFanout(roomId, { seq, sentAt });
    return true;
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

