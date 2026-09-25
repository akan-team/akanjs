# model.signal.ts

- Source: /conventions/module/signal
- Mirror: /llms/pages/conventions/module/signal.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- model.signal.ts (#signal-overview)
- Extending Generated Signals (#signal-extension)
- Defining Internal Tasks (#internal-signal)
- Defining Public APIs (#endpoint-signal)
- Standard Model APIs (#standard-signal)
- Defining Slices And Stores (#slice-signal)
- Builder Function Types (#builder-types)
- Practical Rules (#practical-rules)

## Content

model.signal.ts

Calculates a resolved field declared in the constant model. The parent document is passed to exec by default.

Runs a recurring server task every given number of milliseconds.

Runs scheduled work with a cron expression. Commonly used with serverMode options for batch jobs.

Runs setup or teardown logic when the server process starts or stops.

Defines a background queue job. Use msg(...) to describe the job payload.

Read API. Use it for loading one model, computed data, or public files.

Write API. Use it for create, update, delete, or business actions.

WebSocket message handler. Use msg(...) for incoming payload fields.

Realtime subscription channel. Use room(...) to describe the subscription room.

Required path-style argument. Common in query, mutation, and slice list methods.

Optional search/query argument. It is nullable by default.

Request body value, commonly used by mutation APIs.

Message or process payload argument.

Realtime room key for pubsub subscription channels.

Server-derived context such as Self, Req, Res, Ws, or custom internal args.

Fetch detail-view data generated from the model module.

Fetch edit-view data generated from the model module.

Create or update model data through the generated module API.

Loads a paginated list for a slice definition.

Loads aggregation data for the same slice query.

Initializes the default model list with list and insight data.

Initializes a named slice list with args declared in signal.ts.

Signals define the external interface of a module. They connect service logic to generated client APIs, list stores, realtime channels, and server-side jobs.

Server-only work such as resolved fields, cron jobs, lifecycle hooks, and background processes.

Public APIs and realtime handlers exposed through fetch, websocket message, or pubsub.

Frontend-facing list surfaces used by generated stores, pagination, and insight loading.

Extending Generated Signals

When an app domain extends generated or library behavior, spread inherited signals at the end. This keeps base internals, slices, and endpoints while adding app-specific methods.

Defining Internal Tasks

Use internal() for work that belongs to the server runtime rather than a direct page call. This includes resolved fields, scheduled tasks, lifecycle hooks, and queue jobs.

Defining Public APIs

Use endpoint() for API methods that the client can call. Endpoint builders cover read/write APIs and realtime surfaces.

Parameter builders describe where each value comes from. The order becomes the order of exec arguments. Put nullable arguments near the end because required arguments cannot follow nullable ones.

Use endpoint options when a method should be exposed at a public path, such as sitemap.xml or other non-standard API routes.

Generated fetch methods call endpoint methods from page loaders, components, stores, or client actions.

Standard Model APIs

Akan generates standard model APIs for common view, edit, and merge flows. You usually add custom endpoints only when the business action needs its own name or behavior.

Defining Slices And Stores

Use slice() to define list surfaces for pages. A slice starts from init(), receives params, search values, or internal args, and returns a service query.

Root guards apply to the generated slice surface. Method guards passed to init({ guards }) narrow a specific list.

A slice definition generates list, insight, and init fetch methods. These methods are usually consumed by store and zone UI code.

Builder Function Types

The builder functions above map directly to framework types: endpoint builders create EndpointInfo, slice init creates SliceInfo, and internal builders create InternalInfo.

Practical Rules

Use Internal for server-only jobs, resolved fields, queue processes, and lifecycle hooks.

Use Endpoint for explicit client calls, mutations, websocket messages, and pubsub subscriptions.

Use Slice for list surfaces that need generated stores, pagination, or insight loading.

Use ...model.internals, ...model.slices, and ...model.endpoints when extending generated or library domains.

Use srv.model.with(otherSrv) when the signal needs another service in this.*Service.

Put nullable arguments near the end because required arguments cannot follow nullable ones.

## Code Examples

### story.signal.ts

```ts
export class StoryInternal extends internal(srv.story, () => ({})) {}

export class StorySlice extends slice(srv.story, { guards: { root: Admin } }, () => ({})) {}

export class StoryEndpoint extends endpoint(srv.story, ({ query }) => ({
  story: query(cnst.Story).exec(async function () {
    return await this.storyService.getStory();
  }),
})) {}
```

### user.signal.ts

```ts
export class UserInternal extends internal(srv.user, () => ({}), ...user.internals) {}

export class UserSlice extends slice(srv.user, {}, () => ({}), ...user.slices) {}

export class UserEndpoint extends endpoint(
  srv.user,
  ({ query }) => ({
    authCallback: query(String).search("code", String).exec(async function (code) {
      return await this.userService.authCallback(code);
    }),
  }),
  ...user.endpoints,
) {}
```

### story.signal.ts

```ts
export class StoryInternal extends internal(srv.story.with(srv.actionLog), ({ resolveField, cron }) => ({
  like: resolveField(Int)
    .with(Self, { nullable: true })
    .exec(async function (story, self) {
      if (!self) return 0;
      return await this.actionLogService.getLike(story.id, self.id);
    }),
  cleanup: cron("0 0 * * *").exec(async function () {
    await this.storyService.cleanup();
  }),
})) {}
```

### story.signal.ts

```ts
export class StoryEndpoint extends endpoint(srv.story, ({ query, mutation }) => ({
  story: query(cnst.Story)
    .param("storyId", ID)
    .exec(async function (storyId) {
      return await this.storyService.getStory(storyId);
    }),
  createStory: mutation(cnst.Story)
    .body("data", cnst.StoryInput)
    .exec(async function (data) {
      return await this.storyService.createStory(data);
    }),
})) {}
```

### chatRoom.signal.ts

```ts
export class ChatRoomEndpoint extends endpoint(srv.chatRoom, ({ message, pubsub }) => ({
  readChat: message(Boolean).msg("root", ID).exec(async function (root) {
    return await this.chatRoomService.read(root);
  }),
  chatAdded: pubsub(cnst.Chat).room("root", ID).exec(async function () {}),
})) {}
```

### site.signal.ts

```ts
export class SiteEndpoint extends endpoint(srv.site, ({ query }) => ({
  sitemapXml: query(Any, { path: "sitemap.xml", prefix: false }).exec(async function () {
    return new Response(null, { headers: { "Content-Type": "application/xml" } });
  }),
})) {}
```

### page.tsx

```ts
const story = await fetch.story(storyId);
const created = await fetch.createStory(data);

await fetch.readChat(rootId);
const unsubscribe = fetch.subscribeChatAdded(rootId, (chat) => {
  console.info(chat);
});
```

### story.signal.ts

```ts
export class StorySlice extends slice(srv.story, {}, (init) => ({
  inRoot: init().param("root", ID).exec(function (root) {
    return this.storyService.queryInRoot(root);
  }),
})) {}
```

### page.tsx

```ts
const data = await fetch.initStoryInRoot(rootId);
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

