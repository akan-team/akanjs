# model.signal.ts

- Source: /conventions/module/signal
- Mirror: /llms/pages/conventions/module/signal.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- model.signal.ts (#signal-overview)
- Extending A Library Model (#signal-extension)
- Defining Internal Tasks (#internal-signal)
- Defining APIs With endpoint() (#endpoint-signal)
- The Options Object (#endpoint-options)
- What An Argument May Be (#argument-types)
- Generated Model APIs (#standard-signal)
- Slices: Lists For Pages (#slice-signal)
- Rules To Remember (#practical-rules)

## Content

model.signal.ts

`model.signal.ts` is the door to a module. It decides what a client can call, which lists a page can load, and what the server runs on its own.

You open it when a page needs a new call or list, or the server needs a scheduled job. The logic stays in the service; handlers here only call it.

Class

- StoryInternal, internal(): Work the server runs by itself: computed fields, schedules, lifecycle hooks, queue jobs.

- StorySlice, slice(): Lists a page loads, like `inRoot`. Each one becomes fetch methods and store state.

- StoryEndpoint, endpoint(): Calls a client makes: queries, mutations, websocket messages and pubsub rooms.

Words used on this page

Term

- guard: A class that decides if a call may run: `Public`, `Every` (any signed-in account), `Admin`.

- internal argument: A value the server fills in, not the caller, such as the signed-in user from `.with(Self)`.

- refName: The model's camelCase name, like `story`. Routes and fetch method names are built from it.

- MCP: The protocol AI agents use to call your endpoints. Akan serves it at `/mcp`.

The skeleton

Every signal file declares the three classes in this order, even when one is empty:

**`this` holds the services.** Inside `exec`, `this.storyService` is the module's service, and `srv.story.with(srv.actionLog)` adds `this.actionLogService`.

**`exec` is one line.** It calls one service method and returns the result; loading and deciding happen in the service.

**Barrels come in as values.** A signal imports `* as cnst` and `* as srv` with a plain `import`, not `import type`.

**Every slice and every custom endpoint names its guards.** `slice()` takes `{ guards: { root: Admin, … } }`, and each custom endpoint its own `guards: [...]`. The guards also decide what AI agents see: an endpoint with none is open to anyone and hidden from agents.

Extending A Library Model

An app can add its own `user` module on top of the one in `libs/shared`. Pass the library's classes as the last arguments and write only what your app adds.

`../__lib/lib.signal` exports the library's classes for each model:

**Spread them last.** `internal()`, `slice()` and `endpoint()` each take any number of library classes after the builder.

**The library wins a name clash.** Writing a key the library already declares does not replace it, so give yours a new name.

**Their services come along.** The library's services are on `this` beside yours.

Defining Internal Tasks

`internal()` holds work no client calls. The server runs it on a schedule, at startup or shutdown, for a queued job, or when a computed field is read.

Builder

- resolveField(Type): Computes a `resolve` field of the constant. `exec` gets the parent document first. — Example: `like: resolveField(Int).exec(...)`

- interval(ms): Runs every `ms` milliseconds. — Example: `sync: interval(1000 * 60).exec(...)`

- cron(expression): Runs on a cron schedule, such as every midnight. — Example: `cleanup: cron("0 0 * * *").exec(...)`

- timeout(ms): Runs once, `ms` milliseconds after the server starts. — Example: `warmup: timeout(5000).exec(...)`

- initialize(options?), destroy(options?): Runs when the server process starts or stops. — Example: `seed: initialize().exec(...)`

- process(Type): A background queue job. `.msg()` declares its payload, and a service enqueues it. — Example: `archive: process(Boolean).msg("storyId", ID).exec(...)`

A computed like count and a nightly cleanup look like this:

**The constant declares the field.** `like` must exist in the model's `via(…, (resolve) => ({ like: resolve(Int) }))`.

**Schedules return nothing.** Only `resolveField` and `process` handlers return a value; the others return `void`.

**A service enqueues a `process` job.** It injects `storySignal: signal<sig.Story>()` and calls `this.storySignal.archive(storyId)`.

Schedule options

Every builder except `resolveField` takes these in its last argument:

- serverMode ("federation" | "batch" | "all", default "all"): Which server roles run it. `"batch"` runs on batch and `"all"` servers, never on federation.

- operationMode (("cloud" | "edge" | "local")[], default every mode): Runs only where `AKAN_PUBLIC_OPERATION_MODE` is in the list, like `["cloud"]`.

- lock (boolean, default true): `interval` and `cron` skip a run while the previous one is still running in this process.

- enabled (boolean, default true): `false` turns the job off without deleting its code.

**`lock` does not coordinate servers.** It only skips an overlapping run inside one process. Every server whose role matches runs its own copy, so give a job that must run once `serverMode: "batch"` and run only one server that takes batch work.

Defining APIs With endpoint()

`endpoint()` holds what a client can call. Choose the kind by what the call does, then describe each argument with a builder.

Four kinds

Kind

HTTP

WebSocket

- Request and answer

  - query(Type, options?): Reads data with a `GET`. The client awaits the answer.

  - mutation(Type, options?): Writes data or runs a business action with a `POST`.

- Realtime

  - message(Type, options?): One message a client sends over the socket. `.msg()` declares its fields.

  - pubsub(Type, options?): A room clients subscribe to and the server publishes into. `.room()` names it.

Travels over this

Not this

Argument builders

Each builder says where one argument comes from. `exec` receives them in the order you declare them, then the `.with()` values:

- .param(name, Type): A required URL path segment. One scalar or `enumOf`, never a model or an array. — Example: `.param("storyId", ID)`

- .search(name, Type): A query-string value. Always optional, so `exec` may receive `undefined`. — Example: `.search("title", String)`

- .body(name, Type, options?): A request-body value of a mutation. A query is sent without a body, so give it `.search()` instead. `{ nullable: true }` makes it optional. — Example: `.body("data", cnst.StoryInput)`

- .msg(name, Type, options?): A payload field of a `message` or of a `process` job. — Example: `.msg("roomId", ID)`

- .room(name, Type): A key that names the pubsub room a client joins. — Example: `.room("roomId", ID)`

- .with(InternalArg, options?): A server-supplied value: `Self`, `Me`, `Req`, `Res`, `Ws`, `Ip`, or your own. Missing means 401. — Example: `.with(Self, { nullable: true })`

Optional arguments go last: a required `.param`, `.msg` or `.room` cannot come after a `.search` or a nullable argument.

Query and mutation

A read anyone may make, and a write only a signed-in account may make:

**Pick a name no generated API uses.** Every `story` module already has `story` and `createStory`, so a custom endpoint needs its own name, like `storyBySlug`.

**Take the caller from `.with(Self)`.** Never trust a user id the client sends; the service checks ownership again.

Message and pubsub

A websocket message, and the room that tells everyone in it about a new chat:

**The service publishes.** It injects `chatRoomSignal: signal<sig.ChatRoom>()` and calls `this.chatRoomSignal.chatAdded(roomId, chat)`. A pubsub's own `exec` runs when a client subscribes.

**Guards go on the endpoint itself.** A slice's guards map never reaches a message or a pubsub, so without its own `guards` anyone can send or subscribe.

**Rooms are re-checked.** A message runs its guards on every send. A subscribed room runs them again when the socket's credential changes, and drops the subscription if they fail.

Serving a fixed path

Some files must live at a fixed address, like `/sitemap.xml`. The `path`, `prefix` and `globalPrefix` options move an endpoint there:

**Where it lands.** `prefix: false` drops the `/story` segment and `globalPrefix: false` the API prefix, so it answers at `/sitemap.xml`.

**Return a `Response`** to set your own body and headers. It is sent as it is.

Calling them from the client

Each endpoint becomes a `fetch` method named after its key. A page awaits queries directly; in the browser, call them from a store action.

Declared

What the client gets

- storyBySlug: query(…): Resolves to the `Story`. — Example: `await fetch.storyBySlug(slug)`

- publishStory: mutation(…): Resolves to the published `Story`. `.with(Self)` is not a client argument. — Example: `await fetch.publishStory(storyId, note)`

- readChat: message(…): Returns nothing; it only sends. `fetch.listenReadChat(fn)` receives the replies. — Example: `fetch.readChat(roomId)`

- chatAdded: pubsub(…): Returns a function that unsubscribes. `fn` runs on every publish. — Example: `fetch.subscribeChatAdded(roomId, fn)`

The Options Object

The second argument of `query`, `mutation`, `message` and `pubsub` is the same options object. Most of it decides what happens before your handler runs.

What runs before exec

errors, and every call at debug

the endpoint's own timeout ms

and any the app registered

in declaration order

Internal arguments

cache lookup

a query with no internal argument only

hidden and secret fields masked

the handler keeps running

stored result

only after the guards passed

first false

budget spent

**Nothing to pay until declared.** Logging and Timeout are always registered, but Timeout steps aside for an endpoint with no `timeout`, and the cache lookup for one with no `cache`.

**A timeout answers, it does not cancel.** The caller gets `base.error.gatewayTimeout`, while the handler still runs to the end.

Access and caching

- guards (GuardCls[], default none): Run in order after every middleware; the first refusal answers 403. Without it, nothing is checked.

- mcp (boolean, default true): `false` keeps it away from AI agents. Guards and HTTP stay exactly the same.

- timeout (number (ms), default client's 30 s): Past it the caller gets `base.error.gatewayTimeout`. The client waits the same budget.

- cache (number (ms), default not cached, query): Reuses the answer this long. Only for a query with no `.with()`; looked up after the guards pass.

- nullable (boolean, default false): Allows a `null` return. Without it, a handler that returns `null` fails.

- middlewares (MiddlewareCls[], default none): Extra middleware for this endpoint only, run after the registered chain.

Routing and transport

- method ("POST" | "PATCH" | "PUT" | "DELETE", default "POST", mutation): The HTTP verb of a mutation. Change it only when a foreign protocol requires another.

- path (string, default the endpoint key): A fixed route instead of the key. A trailing `*` matches the rest of the path.

- prefix (false | string, default the model refName): Replaces the model segment in front of the path, or drops it with `false`.

- globalPrefix (false, default the API prefix): `false` drops the API prefix too. With `prefix: false`, the route sits at the site root.

- fileUpload (boolean, default false, mutation): Marks the mutation the generated upload action calls. The shared `file` module already has one.

- backpressure ("coalesce" | "queue", default "coalesce", pubsub(Binary)): When a subscriber falls behind: keep only the newest frame, or queue every frame.

What An Argument May Be

Every argument builder takes the same four kinds of type:

Example

Note

- Scalar — Example: `ID · String · Int · Float · Boolean · Date` — From `akanjs/base`; `String`, `Boolean` and `Date` are the JS globals.

- Model — Example: `cnst.StoryInput` — A class from the module's constant, usually the `Input`.

- enumOf — Example: `cnst.StoryStatus` — A value outside its list is refused.

- Array — Example: `[ID] · [cnst.StoryInput]` — Any of the above in `[ ]`. Not allowed in `.param`.

Three mistakes are worth knowing up front, because two of them are not type errors:

Int or Float, never Number

A count is `Int` and a price is `Float`. `Number` does not typecheck.

Upload is a body, never a field

An `Upload` body switches the request to multipart, and the mutation that owns uploads declares `fileUpload: true`. A model points at the `File` model instead.

Bytes are Binary, never Any

`Binary` is a `Uint8Array` on both sides and accepts base64, so it fits JSON and websocket frames. `Any` turns a `Buffer` into a `{ type, data }` object that never comes back: 3.6x the size, and it only breaks at the first byte read.

**`Binary` is not storable.** Bytes a model keeps are a relation to the `File` model, never `field(Binary)`.

Generated Model APIs

Every database module gets these fetch methods without an endpoint. Write a custom endpoint only when a business action needs its own name.

The slice's guards map protects them: `get` guards the reads, `cru` the writes.

Generated method

get

cru

- Read

  - <model>(id): Loads the full model.

  - light<Model>(id): Loads the Light model.

  - view<Model>(id): Data for a detail page. Destructure it for one promise per field, or await it whole.

  - edit<Model>(id): Data for an edit form, shaped like `view<Model>`. Exists only with a create, update or remove guard.

- Write

  - create<Model>(data): Creates one from an input.

  - update<Model>(id, data): Updates one by id.

  - merge<Model>(modelOrId, data): Calls `update<Model>` with only the fields you pass. Takes the model or its id.

  - remove<Model>(id): Removes one. Removal is always soft.

Guarded by this key

Not this key

A detail page hands the unawaited view to its Zone:

**Destructure to stream, await to wait.** `fetch.viewStory(id)` hands out `story` and `storyView` as separate promises; `await` gives both at once.

**`merge` patches.** In a store action, `await fetch.mergeStory(story, { title })` sends only `title`.

**Override one write with `create`, `update` or `remove`.** Each replaces `cru` for that one method, as `libs/shared` does with `create: Admin` for users.

**Never re-declare a generated name.** `<model>`, `light<Model>`, `create<Model>`, `update<Model>`, `remove<Model>`, `view<Model>`, `edit<Model>` and `merge<Model>` already exist; an endpoint with one of these names fails lint.

Slices: Lists For Pages

`slice()` declares the lists pages show. Each entry starts with `init()`, takes `.param()`, `.search()` and `.with()` arguments like an endpoint, and returns a service query. `.body()` is deprecated there: a list is loaded with no request body, so its value never arrives.

The stories under one root, readable by anyone:

**`root` is always `Admin`.** It guards the root slice, `init<Model>(queryKey, args)`, which can run any filter the model declares.

**A named slice names its own guards** in `init({ guards: [...] })`. The map's `get` and `cru` never reach it.

**Return the query, do not shape it.** `exec` returns a query descriptor that takes no `.sort()` or `.limit()`; order and page size are fetch options.

Generated fetch methods

Each slice key becomes the `Suffix` of these methods, so `inRoot` gives `storyListInRoot`, `initStoryInRoot` and the rest:

Method

- <model>List<Suffix>(...args, skip, limit, sort): One page of the list. — Example: `await fetch.storyListInRoot(rootId, 0, 20, "latest")`

- <model>Insight<Suffix>(...args): The aggregate numbers for the same query. — Example: `await fetch.storyInsightInRoot(rootId)`

- init<Model><Suffix>(...args, option?): List and insight together, as one promise per field. Hand `storyInitInRoot` to a Zone. — Example: `const { storyInitInRoot } = fetch.initStoryInRoot(rootId)`

- get<Model>Init<Suffix>(...args, option?): The same init data as one awaited object. — Example: `const storyInit = await fetch.getStoryInitInRoot(rootId)`

- init<Model>(queryKey?, args?): The root slice. `queryKey` names a model filter (none means `any`), `args` its arguments. — Example: `const { storyInit } = fetch.initStory("byOwner", [ownerId])`

Order and page size go in the last option: `fetch.initStoryInRoot(rootId, { sort: "latest", limit: 20 })`.

Using it in a page

The page starts both queries and hands each result to the part that needs it:

**`storyInitInRoot` goes to a Zone,** which fills the store from it.

**`storyListInRoot` stays on the server.** It holds model instances, which a client component cannot take as props, so read it in a server component or a `Load.Stream`.

**Nothing is awaited.** Both queries start at once, and each section renders when its own promise lands.

Rules To Remember

Four rules cover most mistakes in a signal file:

**Extend, do not copy.** When a library already has the model, spread `...user.internals`, `...user.slices` and `...user.endpoints` instead of re-declaring them.

**Reach other services with `.with()`.** `srv.story.with(srv.actionLog)` puts `this.actionLogService` in every handler.

**Guards decide what AI agents see.** There is no opt-in: `mcp: false` only removes an already-guarded endpoint, and a slice's `mcp: { cru: false }` mirrors its guards map for the root slice and generated CRUD.

**Prompts live on pages.** `endpoint()` has no prompt builder; a screen is published as an MCP prompt with `page().prompt(name, description)`.

What reaches an AI agent

What you declare

Client — fetch.*

AI agent — /mcp

- Published to agents

  - query · guards: [Public]: Any guard is a decision, `Public` included, so a read publishes.

  - mutation · guards: [Every]: A write with a real guard publishes.

- Served, but hidden from agents

  - no guards: Anyone can call it, and no agent can see it.

  - mutation · guards: [Public]: `Public` alone on a write counts as no guard.

  - mcp: false: Taken off the agent shelf on purpose. Guards are unchanged.

  - guards: [Every, Person]: `Person` reserves the act for a human.

  - message · pubsub: They ride the websocket, which an MCP call does not have.

  - Any · Binary · Upload: A return typed `Any` or `Binary`, or a file upload, cannot be described to a model.

Can call it

Cannot see it

MCP Server

Configure /mcp, trim the catalogue, and publish page prompts.

Endpoint Actions

Declare a custom endpoint and call it from a store action.

Realtime

Message and pubsub, end to end.

Queueing

Enqueue a process job and pick which replica runs it.

## Code Examples

### apps/blog/lib/story/story.signal.ts

```ts
import { Admin } from "@libs/shared/srvkit";
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class StoryInternal extends internal(srv.story, () => ({})) {}

export class StorySlice extends slice(srv.story, { guards: { root: Admin, get: Public, cru: Admin } }, () => ({})) {}

export class StoryEndpoint extends endpoint(srv.story, ({ query }) => ({
  featuredStory: query(cnst.Story, { guards: [Public] }).exec(async function () {
    return await this.storyService.getFeaturedStory();
  }),
})) {}
```

### apps/blog/lib/user/user.signal.ts

```ts
import { Admin, SelfOrAdmin } from "@libs/shared/srvkit";
import { endpoint, internal, Public, slice } from "akanjs/signal";

import { user } from "../__lib/lib.signal";
import * as srv from "../srv";

export class UserInternal extends internal(srv.user, () => ({}), ...user.internals) {}

export class UserSlice extends slice(
  srv.user,
  { guards: { root: Admin, get: Public, cru: SelfOrAdmin } },
  () => ({}),
  ...user.slices,
) {}

export class UserEndpoint extends endpoint(
  srv.user,
  ({ query }) => ({
    authCallback: query(String, { guards: [Public] }).search("code", String).exec(async function (code) {
      return await this.userService.authCallback(code);
    }),
  }),
  ...user.endpoints,
) {}
```

### apps/blog/lib/story/story.signal.ts

```ts
export class StoryInternal extends internal(srv.story.with(srv.actionLog), ({ resolveField, cron }) => ({
  like: resolveField(Int)
    .with(Self, { nullable: true })
    .exec(async function (story, self) {
      if (!self) return 0;
      return await this.actionLogService.getLike(story.id, self.id);
    }),
  cleanup: cron("0 0 * * *", { serverMode: "batch" }).exec(async function () {
    await this.storyService.cleanup();
  }),
})) {}
```

### apps/blog/lib/story/story.signal.ts

```ts
export class StoryEndpoint extends endpoint(srv.story, ({ query, mutation }) => ({
  storyBySlug: query(cnst.Story, { guards: [Public] })
    .param("slug", String)
    .exec(async function (slug) {
      return await this.storyService.getStoryBySlug(slug);
    }),
  publishStory: mutation(cnst.Story, { guards: [Every] })
    .param("storyId", ID)
    .body("note", String, { nullable: true })
    .with(Self)
    .exec(async function (storyId, note, self) {
      return await this.storyService.publishStory(storyId, self.id, note);
    }),
})) {}
```

### apps/blog/lib/chatRoom/chatRoom.signal.ts

```ts
export class ChatRoomEndpoint extends endpoint(srv.chatRoom, ({ message, pubsub }) => ({
  readChat: message(Boolean, { guards: [Every] })
    .msg("roomId", ID)
    .with(Self)
    .exec(async function (roomId, self) {
      return await this.chatRoomService.read(roomId, self.id);
    }),
  chatAdded: pubsub(cnst.Chat, { guards: [Every] })
    .room("roomId", ID)
    .exec(async function () {}),
})) {}
```

### apps/blog/lib/story/story.signal.ts

```ts
export class StoryEndpoint extends endpoint(srv.story, ({ query }) => ({
  sitemapXml: query(Any, {
    guards: [Public],
    path: "sitemap.xml",
    prefix: false,
    globalPrefix: false,
  }).exec(async function () {
    const xml = await this.storyService.renderSitemap();
    return new Response(xml, { headers: { "Content-Type": "application/xml" } });
  }),
})) {}
```

### apps/blog/page/story/[storyId]/_index.tsx

```tsx
import { fetch, Story } from "@apps/blog/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("storyId", ID)
  .render(({ storyId }) => {
    const { storyView } = fetch.viewStory(storyId);
    return <Story.Zone.General view={storyView} />;
  });
```

### apps/blog/lib/story/story.signal.ts

```ts
export class StorySlice extends slice(
  srv.story,
  { guards: { root: Admin, get: Public, cru: Admin } },
  (init) => ({
    inRoot: init({ guards: [Public] })
      .param("rootId", ID)
      .exec(function (rootId) {
        return this.storyService.queryInRoot(rootId);
      }),
  }),
) {}
```

### apps/blog/page/root/[rootId]/_index.tsx

```tsx
import { fetch, Story } from "@apps/blog/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page()
  .param("rootId", ID)
  .render(({ rootId }) => {
    const { storyInitInRoot, storyListInRoot } = fetch.initStoryInRoot(rootId);
    return (
      <div className="flex flex-col gap-4">
        <Load.Stream of={storyListInRoot}>{(storyList) => <Story.Unit.Total count={storyList.length} />}</Load.Stream>
        <Story.Zone.Card init={storyInitInRoot} />
      </div>
    );
  });
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

