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

Work the server runs by itself: computed fields, schedules, lifecycle hooks, queue jobs.

Lists a page loads, like `inRoot`. Each one becomes fetch methods and store state.

Calls a client makes: queries, mutations, websocket messages and pubsub rooms.

A class that decides if a call may run: `Public`, `Every` (any signed-in account), `Admin`.

A value the server fills in, not the caller, such as the signed-in user from `.with(Self)`.

The model's camelCase name, like `story`. Routes and fetch method names are built from it.

The protocol AI agents use to call your endpoints. Akan serves it at `/mcp`.

Computes a `resolve` field of the constant. `exec` gets the parent document first.

Runs every `ms` milliseconds.

Runs on a cron schedule, such as every midnight.

Runs once, `ms` milliseconds after the server starts.

Runs when the server process starts or stops.

A background queue job. `.msg()` declares its payload, and a service enqueues it.

Which server roles run it. `"batch"` runs on batch and `"all"` servers, never on federation.

every mode

Runs only where `AKAN_PUBLIC_OPERATION_MODE` is in the list, like `["cloud"]`.

`interval` and `cron` skip a run while the previous one is still running in this process.

`false` turns the job off without deleting its code.

Request and answer

Reads data with a `GET`. The client awaits the answer.

Writes data or runs a business action with a `POST`.

Realtime

One message a client sends over the socket. `.msg()` declares its fields.

A room clients subscribe to and the server publishes into. `.room()` names it.

A required URL path segment. One scalar or `enumOf`, never a model or an array.

A query-string value. Always optional, so `exec` may receive `undefined`.

A request-body value of a mutation. A query is sent without a body, so give it `.search()` instead. `{ nullable: true }` makes it optional.

A payload field of a `message` or of a `process` job.

A key that names the pubsub room a client joins.

A server-supplied value: `Self`, `Me`, `Req`, `Res`, `Ws`, `Ip`, or your own. Missing means 401.

Resolves to the `Story`.

Resolves to the published `Story`. `.with(Self)` is not a client argument.

Returns nothing; it only sends. `fetch.listenReadChat(fn)` receives the replies.

Returns a function that unsubscribes. `fn` runs on every publish.

none

Run in order after every middleware; the first refusal answers 403. Without it, nothing is checked.

`false` keeps it away from AI agents. Guards and HTTP stay exactly the same.

client's 30 s

Past it the caller gets `base.error.gatewayTimeout`. The client waits the same budget.

not cached

Reuses the answer this long. Only for a query with no `.with()`; looked up after the guards pass.

Allows a `null` return. Without it, a handler that returns `null` fails.

Extra middleware for this endpoint only, run after the registered chain.

The HTTP verb of a mutation. Change it only when a foreign protocol requires another.

the endpoint key

A fixed route instead of the key. A trailing `*` matches the rest of the path.

the model refName

Replaces the model segment in front of the path, or drops it with `false`.

the API prefix

`false` drops the API prefix too. With `prefix: false`, the route sits at the site root.

Marks the mutation the generated upload action calls. The shared `file` module already has one.

When a subscriber falls behind: keep only the newest frame, or queue every frame.

Kind

Example

Note

Scalar

From `akanjs/base`; `String`, `Boolean` and `Date` are the JS globals.

Model

A class from the module's constant, usually the `Input`.

A value outside its list is refused.

Array

Any of the above in `[ ]`. Not allowed in `.param`.

Read

Loads the full model.

Loads the Light model.

Data for a detail page. Destructure it for one promise per field, or await it whole.

Data for an edit form, shaped like `view<Model>`. Exists only with a create, update or remove guard.

Write

Creates one from an input.

Updates one by id.

Calls `update<Model>` with only the fields you pass. Takes the model or its id.

Removes one. Removal is always soft.

One page of the list.

The aggregate numbers for the same query.

List and insight together, as one promise per field. Hand `storyInitInRoot` to a Zone.

The same init data as one awaited object.

The root slice. `queryKey` names a model filter (none means `any`), `args` its arguments.

Client

AI agent

Published to agents

Any guard is a decision, `Public` included, so a read publishes.

A write with a real guard publishes.

Served, but hidden from agents

no guards

Anyone can call it, and no agent can see it.

`Public` alone on a write counts as no guard.

Taken off the agent shelf on purpose. Guards are unchanged.

`Person` reserves the act for a human.

They ride the websocket, which an MCP call does not have.

A return typed `Any` or `Binary`, or a file upload, cannot be described to a model.

You open it when a page needs a new call or list, or the server needs a scheduled job. The logic stays in the service; handlers here only call it.

Class

Words used on this page

Term

The skeleton

Every signal file declares the three classes in this order, even when one is empty:

Extending A Library Model

Defining Internal Tasks

Builder

A computed like count and a nightly cleanup look like this:

Schedule options

Defining APIs With endpoint()

Four kinds

Travels over this

Not this

Argument builders

Query and mutation

A read anyone may make, and a write only a signed-in account may make:

Message and pubsub

A websocket message, and the room that tells everyone in it about a new chat:

Serving a fixed path

Calling them from the client

Declared

What the client gets

The Options Object

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

Access and caching

Routing and transport

What An Argument May Be

Every argument builder takes the same four kinds of type:

Three mistakes are worth knowing up front, because two of them are not type errors:

Int or Float, never Number

Upload is a body, never a field

Bytes are Binary, never Any

Generated Model APIs

Every database module gets these fetch methods without an endpoint. Write a custom endpoint only when a business action needs its own name.

Generated method

Guarded by this key

Not this key

A detail page hands the unawaited view to its Zone:

Slices: Lists For Pages

The stories under one root, readable by anyone:

Generated fetch methods

Method

Using it in a page

The page starts both queries and hands each result to the part that needs it:

Rules To Remember

Four rules cover most mistakes in a signal file:

What reaches an AI agent

What you declare

Can call it

Cannot see it

MCP Server

Configure /mcp, trim the catalogue, and publish page prompts.

Endpoint Actions

Declare a custom endpoint and call it from a store action.

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

