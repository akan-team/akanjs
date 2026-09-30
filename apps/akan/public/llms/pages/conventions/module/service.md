# model.service.ts

- Source: /conventions/module/service
- Mirror: /llms/pages/conventions/module/service.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- model.service.ts (#service-overview)
- Service Shapes (#service-shapes)
- What serve() Gives You (#serve-runtime)
- Generated Methods (#generated-methods)
- Service Extension (#service-extension)
- Injection Builder (#injection-overview)
- Injection Types (#injection-types)
- Business Logic Flow (#business-flow)
- Lifecycle Hooks (#lifecycle-hooks)
- Practical Rules (#practical-rules)

## Content

model.service.ts

`<model>.service.ts` is where one business action runs from start to finish: load the documents, change them, save, then tell whoever else needs to know.

Open it when an action needs more than one document, another service, a background job, an external API, or anything that must stay on the server.

Which file owns the work

The work

document — *.document.ts

service — *.service.ts

signal — *.signal.ts

- Changing one document

  - state change: A chain method such as `story.approve()` validates, changes the document and returns `this`.

  - state precondition: The chain method throws when the document is in the wrong state for the change.

- Running a business action

  - multi-document workflow: Load the documents, call their chain methods, save, then notify.

  - cross-document rule: A rule that compares several documents throws its `Err` here.

  - external API · job · server-only code: Reached through injected adapters, signals and env values.

- Exposing it

  - who may call it: The endpoint's guards decide access.

  - the endpoint: Its `exec` calls one service method and nothing more.

Belongs here

Not here

Words used on this page

Term

- database service: A service bound to one model with `serve(db.<model>, …)`. It gets that model's methods.

- plain service: A service with no model, made with `serve("<name>" as const, …)`.

- injection builder: The function you pass to `serve()`. Each key it returns becomes a property on `this`.

- chain method: A document method that changes one document and returns `this`, e.g. `story.approve()`.

- hook: A method such as `_preCreate` that runs around `create<Model>`, `update<Model>` or `remove<Model>`.

Service Shapes

Every service is a class that extends `serve(…)`. What you pass to it decides which of three shapes the service takes:

Database Service

Bound to one model. It gets `storyModel`, the CRUD methods, and fourteen methods per filter.

Plain Service

No model. For runtime coordination, scheduled work, shared server features, or app-level orchestration.

Extended Service

A database service that also mixes in a lib's service for the same model, then adds app-specific behaviour.

A database service, complete with its imports:

**`db` is a value import, `srv` a type import.** `serve()` needs the model at runtime; services are only named as types, so the runtime import graph stays lazy.

**Injected keys become properties.** `actionLogService` is read as `this.actionLogService`.

**Methods stay short.** Load, call a chain method, then `return await ….save()`.

A plain service has no model. The framework's own `BaseService` is one:

What serve() Gives You

`serve()` returns a class for you to extend. What that class already carries depends on the first argument:

What you get

Database — serve(db.x, …)

Plain — serve("x", …)

- From the model

  - <model>Model: The model adaptor, such as `this.storyModel`.

  - get<Model> … remove<Model>: The six CRUD methods listed under Generated Methods.

  - list<Query> … updateOne<Query>: Fourteen methods for each filter in the document.

  - _preCreate … _postRemove: Hooks around create, update and remove.

- On every service

  - logger: A Logger named after the class, such as `StoryService`.

  - onInit · onDestroy: Run once at boot and once at shutdown.

  - injected properties: Every key your injection builder returns.

  - ...extendServices: Service classes passed after the builder, mixed in.

Included

Not included

Arguments

- db.<model> (DatabaseModel): First argument for a database service. — Example: `serve(db.story, ({ service }) => ({ actionLogService: service<srv.ActionLogService>() }))`

- "<name>" as const (string): First argument for a plain service. — Example: `serve("base" as const, ({ signal }) => ({ baseSignal: signal<Base>() }))`

- option ({ enabled?, serverMode? }, optional): Goes second when present. See Service Option below.

- injectBuilder (({ service, use, … }) => ({ … })): Returns the properties to inject. See Injection Builder.

- ...extendServices (ServiceCls[], optional): Mixes in their methods, injections and hooks. See Service Extension. — Example: `serve(db.user, ({ use }) => ({ githubApp: use<GithubApp>() }), ...user.services)`

Service Option

The option decides which processes run the service. A `batch` process runs background work and takes no traffic; a `federation` process serves traffic. The default single process runs as `all`, so both are on there.

- enabled (boolean | (() => boolean), default true): `false` leaves the service out. A function runs once, the first time it is read.

- serverMode ("batch" | "federation"): On only where `SERVER_MODE` is that value or `all`. `enabled` wins when both are set.

Generated Methods

A database service gets these without writing them. Their names follow the model name and the filters declared in `<model>.document.ts`.

Predefined Properties

Property

- <model>Model: The model adaptor, injected automatically. Call the model's own methods and filters on it. — Example: `const story = await this.storyModel.getStory(storyId);`

- logger: A Logger named after the service class. — Example: `this.logger.info("service is ready");`

CRUD Methods

Method

- get<Model>(id): Loads one document by id. Throws when it does not exist. — Example: `const story = await this.getStory(storyId);`

- load<Model>(id?): Loads one document by id. Returns null when it does not exist or the id is empty. — Example: `const story = await this.loadStory(storyId);`

- load<Model>Many(ids): Loads several documents by id in one batch. — Example: `const stories = await this.loadStoryMany(storyIds);`

- create<Model>(data): Creates a document through `_preCreate` and `_postCreate`. — Example: `const story = await this.createStory(data);`

- update<Model>(id, data): Applies a patch through `_preUpdate` and `_postUpdate`, then returns the document. — Example: `const story = await this.updateStory(storyId, { status: "active" });`

- remove<Model>(id): Soft-removes (sets `removedAt`) through the remove hooks, then runs cascades. — Example: `await this.removeStory(storyId);`

Filter Methods

Every filter in the document generates fourteen methods. `<Query>` is the filter's key with a capital first letter: filter `inRoot` gives `listInRoot`.

Reads

- list<Query>(...args, option?): Lists the matching documents. — Example: `const stories = await this.listInRoot(root);`

- listIds<Query>(...args, option?): Lists the ids of the matching documents. — Example: `const ids = await this.listIdsInRoot(root);`

- find<Query>(...args, option?): Finds one match, or returns null. — Example: `const story = await this.findByTitle(title);`

- findId<Query>(...args, option?): Finds the id of one match, or returns null. — Example: `const id = await this.findIdByTitle(title);`

- pick<Query>(...args, option?): Finds one match. Throws when there is none. — Example: `const story = await this.pickByTitle(title);`

- pickId<Query>(...args, option?): Finds the id of one match. Throws when there is none. — Example: `const id = await this.pickIdByTitle(title);`

- exists<Query>(...args): Checks for a match. Returns the id of one match, or null. — Example: `const existingId = await this.existsByTitle(title);`

- count<Query>(...args): Counts the matching documents. — Example: `const count = await this.countInRoot(root);`

- insight<Query>(...args): Computes the model's insight over the matching documents. — Example: `const insight = await this.insightInRoot(root);`

- query<Query>(...args): Returns the query descriptor itself, without running it. — Example: `const query = this.queryInRoot(root);`

**The trailing option.** `list` and `listIds` take `{ sort, skip, limit, sample, select }`; `find`, `findId`, `pick` and `pickId` take the same without `limit`. The rest take none.

Query-level writes

- remove<Query>(...args): Soft-removes every match in one atomic update. — Example: `await this.removeInRoot(root);`

- removeOne<Query>(...args): Soft-removes the newest match by `createdAt`. For at-most-one queries, not for queues. — Example: `await this.removeOneInRoot(root);`

- update<Query>(...args).set(patch): Updates every match atomically. The patch goes in `.set()`; the chain alone runs nothing. — Example: `await this.updateInRoot(root).set({ status: "archived" });`

- updateOne<Query>(...args).set(patch): Updates the newest match by `createdAt`. The result has counts, not which row changed. — Example: `await this.updateOneInRoot(root).set({ status: "archived" });`

**Query-level writes skip hooks and cascades.** Each is one atomic update, so no `_postRemove` runs and no `cascade` follows. When a model has either, remove its documents one at a time with `remove<Model>(id)`.

Full-text search

Full-text search is not a method of its own. A filter whose query calls `q.search()` generates the same fourteen methods every other filter does:

**`sort: "relevance"`** orders the results by match score, best first.

**Blank text matches nothing.** An empty or whitespace-only search returns no rows, not every row.

Service Extension

When an app declares a module with the same name as a lib module, such as `user` from `libs/shared`, the app's module replaces the lib's. Spread `...user.services` into `serve()` to keep the lib's behaviour and add your own on top.

`lib/__lib/lib.service.ts` exports one such entry for each model the app shares with a lib:

**The lib's methods come along.** Everything the lib's `UserService` defines is callable on `this`.

**Hooks stack instead of overriding.** The lib's `_preCreate` runs first, then yours, each receiving the previous result. Both `onInit` hooks run too.

**Your injections win a name clash.** A key you declare replaces the lib's key of the same name.

**Keep app-only integrations here.** Shared behaviour stays in the lib; what only this app needs, such as GitHub sign-in, goes in the app service.

Injection Builder

The function you pass to `serve()` is the injection builder. It receives seven helpers (`database`, `service`, `use`, `signal`, `plug`, `env`, `memory`) and returns an object whose keys become properties on `this`:

**Injected values are read-only.** Only `memory(…, { local: true })` stays writable.

**The key name is part of the wiring.** `service()` keys end in `Service`, `signal()` keys end in `Signal`, and `use()` keys match the name registered in `lib/option.ts`.

**Reach for them in this order.** `service()` for another module, `plug()` for an adapter, `use()` only for a value registered in `option.ts`, and `env()` for configuration.

Injection Types

Pick the helper by where the value comes from:

Helper

- service<T>(): Another service, a lib's included. The key must end in `Service`; the rest names the target.

- use<T>(): A value registered with `option.use()` in `lib/option.ts`. The key must match its name. — Example: `storageApi: use<StorageApi>(),`

- signal<T>(): A server signal, for queueing a background job or publishing an event. Key ends in `Signal`. — Example: `dbBackupSignal: signal<sig.DbBackup>(),`

- plug(Adaptor): An `adapt()` adapter. If an implementation was applied to that role, you get it instead. — Example: `ipfsApi: plug(IpfsApi),`

- env(factory): A value built at boot from the server env or `process.env`. Pass a factory, not `env("KEY")`. — Example: `dockerRegistry: env((options: ModulesOptions) => options.dockerRegistry),`

- memory(ref, opts): State kept in the cache adaptor, or on the instance with `local: true`. See below. — Example: `remoteMap: memory(Map, { of: String }),`

- database(): This service's own model. A database service already has it as `<model>Model`. — Example: `const story = await this.storyModel.getStory(storyId);`

use() and plug() in real code

The shared lib's file service reaches storage through `use()` and IPFS through `plug()`:

env() feeding a hook

The factory receives the app's server env, typed as `ModulesOptions`, and runs once at boot:

memory() in detail

`memory(ref, opts)` gives the service state that outlives one call. Without `local`, it lives in the app's cache adaptor. Its options:

- local (boolean, default false): Keep a plain writable value on this instance instead of in the cache; on a `Map`, a real `Map`.

- default: What a single value reads before its first `set()`, else `null`; a `local` one starts with it.

- of: The value type of a `Map` memory, a scalar or model class. Required when `ref` is `Map`.

- ttl (number (ms)): How long each write lives, unless that `set()` passes its own `{ expireAt }`.

- get ((stored) => value): Maps the stored value (a Map's entry value) to what code reads. Give it with `set` or not at all.

- set ((value) => stored): The inverse of `get`: turns what code writes back into the stored value.

What `this.x` turns out to be depends on how it was declared:

Declared as

- memory(ref, { local: true }): A plain value you read and assign directly. — Example: `this.localCounter += 1;`

- memory(ref): An object with three async methods. — Example: `get() · set(value, { expireAt }?) · delete()`

- memory(Map, { of: ref }): An async key–value map.

All three shapes side by side:

**Store a model, not hand-made JSON.** `memory(Map, { of: cnst.OauthClient })` serializes through the constant; never encode JSON into a `String` memory yourself.

**A memory belongs to the service or adaptor that declares it.** Two services may both declare `token`; each keeps its own value.

**A `Map` read of a missing key is `undefined`.** `default` applies to a single value only, so guard `get(key)` with `??`. Map entries expire one by one, on SQLite and Redis alike.

**`get` and `set` are not allowed with `local`.** A local memory holds the value as it is.

Business Logic Flow

A service method should read like the business action it performs. It can load documents, call their chain methods, work with other services, write logs and queue signals, all in one place.

A like is recorded through another service, then counted by the model:

A backup moves through several steps, and the slow part runs later as a queued job:

**Load, save, then notify.** Load every document the action needs, save, and only then call signals or other services.

**Write `return await` at the end.** Keep the `await` even where a bare `return` would work.

**Mark fire-and-forget with `void`.** When you deliberately do not wait for a call, write `void` in front of it so the missing `await` reads as intended.

**Return `null` or `false` for "not allowed" or "not found".** The signal decides whether that is an error.

Lifecycle Hooks

Hooks run around the service's `create<Model>`, `update<Model>` and `remove<Model>`, and once at boot and shutdown. Use one when a rule must always run; a one-off business action is a normal method.

Hook

- _preCreate(data): Runs before `create<Model>`. Return the data to create; you may change it. — Example: `override async _preCreate(data) { return data; }`

- _postCreate(doc): Runs after the document is created. Return the document. — Example: `override async _postCreate(doc) { return doc; }`

- _preUpdate(id, data): Runs before `update<Model>`. Return the patch to apply. — Example: `override async _preUpdate(id, data) { return data; }`

- _postUpdate(doc): Runs after the update. Return the document. — Example: `override async _postUpdate(doc) { return doc; }`

- _preRemove(id): Runs before `remove<Model>`. Check or clean up here; throw to stop the removal. — Example: `override async _preRemove(id) { … }`

- _postRemove(doc): Runs after the soft remove. Return the document.

- cascade: A cascade field removes its targets through their services, so their `_postRemove` runs too. — Example: `image: field(File, { cascade: "removeRef" }).optional()`

- onInit(): Runs once at boot, after this service's injections are filled in. — Example: `override async onInit() { this.logger.info("service is ready"); }`

- onDestroy(): Runs once when the server shuts down. — Example: `override async onDestroy() { this.logger.info("service is closing"); }`

**Only the service's own writes run these hooks.** `create<Model>`, `update<Model>` and `remove<Model>` go through them; a chain's `.save()` and the query-level writes do not.

**Removal runs in a fixed order:** `_preRemove`, the soft remove, `_postRemove`, then cascades.

Here a backup refuses to start twice for the same branch, and a new backup queues its own archive job:

**Throw `Err`, never `new Error`.** A bare `Error` reaches the caller as a generic "Internal Server Error". Throw an `Err` keyed to the module's dictionary, and register the key there as an `[en, ko]` pair:

Practical Rules

**Workflows go in the service.** Anything that coordinates several models, services, signals or external APIs is a service method.

**One-document changes go on the document.** Write a chain method, then call `.save()` from the service when the change must persist.

**Name injections by role.** Service keys end in `Service`, signal keys in `Signal`.

**Wrap external packages in `srvkit/`.** Write new ones as `adapt()` classes and inject them with `plug()`; `use()` is for values already registered in `lib/option.ts`.

**Extend a lib service instead of copying it.** Spread `...<model>.services` for shared behaviour and keep app-only integrations in the app service.

**No circular dependencies.** Two services cannot inject each other; move the shared operation into a smaller service or a `srvkit/` helper.

**Re-check ownership.** Check that the caller owns the document even when a guard already gated the call; the two are independent gates.

Write the chain methods and filters a service calls.

Expose service methods as guarded endpoints.

Server Utils (srvkit/)

Write the adapters a service injects with plug().

Dependency Injection

Recipes for service, plug, use and env.

## Code Examples

### apps/koyo/lib/story/story.service.ts

```ts
import { serve } from "akanjs/service";

import * as db from "../db";
import type * as srv from "../srv";

export class StoryService extends serve(db.story, ({ service }) => ({
  boardService: service<srv.BoardService>(),
  actionLogService: service<srv.ActionLogService>(),
})) {
  async approve(storyId: string) {
    const story = await this.storyModel.getStory(storyId);
    return await story.approve().save();
  }
}
```

### pkgs/akanjs/service/base.service.ts

```ts
export class BaseService extends serve("base" as const, ({ env, signal }) => ({
  onCleanup: env(({ onCleanup }: { onCleanup?: () => Promise<void> }) => onCleanup),
  baseSignal: signal<Base>(),
})) {
  publishPing() {
    this.baseSignal.pubsubPing("ping");
  }
}
```

### option

```ts
serve("myapp" as const, { serverMode: "batch" }, ({ service }) => ({
  summaryService: service<srv.SummaryService>(),
}))
```

### apps/koyo/lib/story/

```ts
// story.document.ts
export class StoryFilter extends from(cnst.Story, (filter) => ({
  query: {
    bySearch: filter()
      .arg("text", String)
      .query((text, q) => q.search(text, { prefix: true })),
  },
  sort: {},
})) {}

// story.service.ts
const stories = await this.listBySearch(text, { sort: "relevance" });
const count = await this.countBySearch(text);
```

### apps/koyo/lib/user/user.service.ts

```ts
import type { GithubApp } from "@libs/util/srvkit";
import { serve } from "akanjs/service";

import { user } from "../__lib/lib.service";
import * as db from "../db";

export class UserService extends serve(
  db.user,
  ({ use }) => ({
    githubApp: use<GithubApp>(),
  }),
  ...user.services,
) {
  async authCallback(code: string, userId: string) {
    const { accessToken } = await this.githubApp.getAccessToken(code);
    const user = await this.getUser(userId);
    return await user.set({ githubInfo: { accessToken } }).save();
  }
}
```

### apps/koyo/lib/example/example.service.ts

```ts
import { PaymentApi } from "@apps/koyo/srvkit";
import type { EmailApi } from "@libs/util/srvkit";
import { Int } from "akanjs/base";
import { serve } from "akanjs/service";

import * as db from "../db";
import type { ModulesOptions } from "../option";
import type * as sig from "../sig";
import type * as srv from "../srv";

export class ExampleService extends serve(
  db.example,
  ({ service, use, signal, plug, env, memory }) => ({
    userService: service<srv.UserService>(),
    emailApi: use<EmailApi>(),
    exampleSignal: signal<sig.Example>(),
    paymentApi: plug(PaymentApi),
    hostname: env((options: ModulesOptions) => options.hostname),
    localCounter: memory(Int, { local: true, default: 0 }),
  }),
) {}
```

### service<T>()

```ts
actionLogService: service<srv.ActionLogService>(),
fileService: service<srv.shared.FileService>(),
```

### libs/shared/lib/file/file.service.ts

```ts
import { IpfsApi, type StorageApi } from "@libs/util/srvkit";
import { serve } from "akanjs/service";

import * as db from "../db";

export class FileService extends serve(db.file, ({ use, plug }) => ({
  storageApi: use<StorageApi>(),
  ipfsApi: plug(IpfsApi),
})) {
  override async _postRemove(file: db.File) {
    await this.storageApi.deleteData(file.url);
    return file;
  }
  async getJsonFromUri<T = unknown>(uri: string) {
    return (await (await fetch(this.ipfsApi.getHttpsUri(uri))).json()) as T;
  }
}
```

### apps/koyo/lib/devProject/devProject.service.ts

```ts
export class DevProjectService extends serve(db.devProject, ({ service, env }) => ({
  userService: service<srv.UserService>(),
  dockerRegistry: env((options: ModulesOptions) => options.dockerRegistry),
})) {
  override async _preCreate(data: DataInputOf<db.DevProjectInput, db.DevProject>) {
    return { ...data, registry: this.dockerRegistry };
  }
}
```

### memory(Map, { of: ref })

```ts
get(key) · set(key, value) · delete(key) · clear()
getOrInsert(key, value) · getOrInsertComputed(key, fn)
keys() · entries() · forEach(fn)
```

### apps/koyo/lib/_runtime/runtime.service.ts

```ts
export class RuntimeService extends serve("runtime" as const, ({ memory }) => ({
  localCounter: memory(Int, { local: true, default: 3 }),
  remoteValue: memory(String),
  remoteMap: memory(Map, { of: String }),
})) {
  async updateRemoteValue(value: string) {
    await this.remoteValue.set(value);
    return await this.remoteValue.get();
  }
}
```

### apps/koyo/lib/story/story.service.ts

```ts
export class StoryService extends serve(db.story, ({ service }) => ({
  actionLogService: service<srv.ActionLogService>(),
})) {
  async like(target: string, user: string) {
    const prev = await this.actionLogService.set({ type: "story", target, user, action: "like" }, 1);
    return await this.storyModel.like(target, prev);
  }
}
```

### apps/koyo/lib/dbBackup/dbBackup.service.ts

```ts
export class DbBackupService extends serve(db.dbBackup, ({ service, signal }) => ({
  clusterService: service<srv.ClusterService>(),
  fileService: service<srv.shared.FileService>(),
  dbBackupSignal: signal<sig.DbBackup>(),
})) {
  async queueArchiveDbBackup(dbBackupId: string) {
    const dbBackup = await this.dbBackupModel.getDbBackup(dbBackupId);
    await dbBackup.set({ status: "preparing" }).save();
    await this.dbBackupSignal.archiveDbBackup(dbBackupId);
    return dbBackup;
  }

  async archiveDbBackup(dbBackupId: string) {
    const dbBackup = await this.dbBackupModel.getDbBackup(dbBackupId);
    const cluster = await this.clusterService.getCluster(dbBackup.devApp);
    // archive, upload, clean up, then mark the backup active
    return await dbBackup.set({ status: "active" }).save();
  }
}
```

### _postRemove(doc)

```ts
override async _postRemove(file) {
  await this.storageApi.deleteData(file.url);
  return file;
}
```

### apps/koyo/lib/dbBackup/dbBackup.service.ts

```ts
import type { DataInputOf } from "akanjs/document";
import { serve } from "akanjs/service";

import * as db from "../db";
import { Err } from "../dict";
import type * as sig from "../sig";

export class DbBackupService extends serve(db.dbBackup, ({ signal }) => ({
  dbBackupSignal: signal<sig.DbBackup>(),
})) {
  override async _preCreate(data: DataInputOf<db.DbBackupInput, db.DbBackup>) {
    if (await this.dbBackupModel.workingBackupExists(data.devApp, data.branch))
      throw new Err("dbBackup.error.workingBackupExists");
    return data;
  }

  override async _postCreate(doc: db.DbBackup) {
    await this.dbBackupSignal.archiveDbBackup(doc.id);
    return doc;
  }
}
```

### apps/koyo/lib/dbBackup/dbBackup.dictionary.ts

```ts
.error({
  workingBackupExists: [
    "A backup is already running for this branch",
    "이 브랜치에서 이미 백업이 실행 중입니다.",
  ],
})
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

