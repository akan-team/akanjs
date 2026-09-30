# Dependency Injection

- Source: /cheatsheet/observability/di
- Mirror: /llms/pages/cheatsheet/observability/di.md
- Section: cheatsheet
- Category: Observability
- Priority: P2

## Headings

- Dependency Injection (#overview)
- Inject Services (#service)
- Adapt And Plug (#adaptor)
- Read Environment (#env)
- Tips (#tips)

## Content

Dependency Injection

**The field name is the key.** `mailApi: use<MailApi | null>()` reads what was registered as `mailApi`; the type argument does not choose it.

**Each key is registered once.** An app mounting `libs/util` already has `storageApi`, `emailApi` and `host`, so a second registration of those is an error.

**A value may be a Promise.** It is awaited before any service or adaptor starts.

**Migrate when you touch it.** Move a `use` singleton to `adapt()` only when you are already changing it.

A service lists what it needs in the builder of `serve()`, and Akan fills each field before the service starts. Business code stays small, and an outside system can be swapped without touching it.

Words used on this page

Term

- injector: A helper like `service()` or `plug()` inside `serve()` or `adapt()`. Each one fills one field.

- adaptor: A class built with `adapt()` that wraps one outside tool, such as storage or a mail API.

- role: A slot for a built-in adaptor, such as `StorageAdaptorRole`. The app decides what fills it.

- singleton: One instance per server process, shared by everything that injects it.

- server env: The object in `env/env.server.<environment>.ts`, typed by `ModulesOptions` in `lib/option.ts`.

Which injector to use

Reach for them in this order; the first that fits is the right one. The marks show where each works.

Injector

serve()

adapt()

- Pick in this order: the first that fits wins

  - service<T>(): Another service's business method.

  - plug(Class): A replaceable tool such as storage, a cache or a message API.

  - use<T>(): A legacy singleton registered in `option.ts`. Recognise it; do not write new ones.

  - env(factory): Runtime configuration, read without passing it through every function.

- For one specific job

  - memory(Type): A small value that survives between calls.

  - signal<T>(): A server signal, to publish an event or queue a job. The field name ends in `Signal`.

Available

Not available

**Destructure only what you use.** `({ service, env }) => ({ … })` names the injectors this class needs, and nothing else.

**Every field is ready before `onInit()`.** Injected values are filled first, so `onInit()` can already use them.

Inject Services

When one service needs another service's business method, declare it with `service<T>()`. It is clearer than importing the other service and constructing it yourself:

**The field name picks the service.** `subscriptionService` resolves to the service named `subscription`, so the name must end in `Service`. The type argument only adds types.

**A lib's service goes through its namespace.** From an app it is typed `srv.shared.FileService`; the field is still `fileService`.

**Import `srv` as a type.** `import type * as srv from "../srv"` keeps the runtime import graph lazy.

**Generated methods come with the service.** A database service already has `this.getArticle`, `this.updateArticle` and `this.articleModel`.

**Two services cannot inject each other.** If `ArticleService` injects `SubscriptionService`, the reverse is a circular dependency. Move the shared step into one of them.

Adapt And Plug

Use an adaptor for a tool that has behavior of its own and may be replaced later. The service asks for the class or the role; it never builds the client.

1. Declare it in srvkit/

Write the adaptor as an `adapt()` class under `srvkit/`. This one adds image paths on top of whatever storage the app runs:

2. Plug it into a service

The service names the class with `plug()` and calls it like any field:

**`plug(Class)` is all the registration there is.** No `option.ts` entry: the class itself is the token.

**One instance per process.** Every service that plugs `ImageStorage` shares the same object.

**`this.logger` is built in.** Never construct a `Logger` in an adaptor; put setup work in `override async onInit()`.

**Give it a name no other adaptor uses.** Write the name passed to `adapt()` `as const`, unique across the app and its libs.

3. Swap a built-in role

Framework infrastructure is plugged by role. `plug(StorageAdaptorRole)` gets whatever fills that role, and these are the nine roles with their defaults:

Role

Default

Used for

- DatabaseAdaptorRole — SqliteDatabase — Documents and queries

- CacheAdaptorRole — SolidCache — `memory()` values and the document cache

- StorageAdaptorRole — BlobStorage — Uploaded files, on local disk by default

- QueueAdaptorRole — SolidQueue — Background jobs queued by signals

- ScheduleAdaptorRole — Scheduler — Cron and interval jobs

- LoggingAdaptorRole — ConsoleLogger — Writing log lines by level

- WebsocketAdaptorRole — SolidPubSub — Pubsub rooms for websocket clients

- CompressAdaptorRole — JsonCompressor — Encoding a typed value to bytes and back

- LlmAdaptorRole — OpenaiLlm — LLM calls from the in-page agent relay

To replace one for the whole app, call `applyAdaptor` in `lib/option.ts`:

**The replacement implements the role's interface.** `R2Storage` is an `adapt()` class that `implements StorageAdaptor`.

**Only these nine roles can be swapped.** `applyAdaptor` ignores any other class, and it is not a way to register an adaptor.

**The app has the last word.** The app's `option.ts` is read after every lib's, so its choice wins.

**Defaults follow the database mode.** The database becomes libsql in `multiple` mode and Postgres in `cluster` mode. Both modes move cache and websocket to Redis, and queue to BullMQ.

Read Environment

`env()` builds a value from runtime configuration when the service or adaptor starts. Use it when code needs the app's identity, a hostname or a feature flag.

What you need

Read it with

- A server env field: hostname, a feature flag, an API option — `env((options: ModulesOptions) => options.hostname)`

- App identity: appName, environment, operationMode — `env(() => getEnv().operationMode)`

- A container variable or a secret — `env(() => process.env.PAYMENT_KEY)`

Add a setting of your own

Declare the field on `ModulesOptions` in `lib/option.ts`.

Set it in each `env/env.server.<environment>.ts` that needs it.

Read it with `env()` in a service or an adaptor.

Steps 1 and 2 take a few lines each:

Step 3 reads it next to the app's identity:

**It runs once, at startup.** The value is fixed for the life of the process, and the factory may be `async`.

**Pass a factory.** `env()` takes a function; there is no `env("KEY")` form.

**Call `getEnv()` inside the factory.** At module scope it throws during `akan build`, which has no app env to give it.

Tips

**Declare one client, not one per call.** Do not create external clients inside every method; declare one `adapt()` class and `plug()` it.

**`service()` for business, `plug()` for infrastructure.** Business collaboration goes through services; replaceable infrastructure goes through adaptors.

**Inject prepared clients, not raw credentials.** Keep secrets in the server env or `process.env`, and resolve them inside a function: `process.env.X ?? options.x ?? generate(…)`, never at module scope.

**`adapt()` is for singletons only.** A per-use value object stays a plain class you `new` at the call site.

Read next

- Injection Types — Every injector with its naming rules, in the service convention.

- Adaptor And plug — Where adaptors live in `srvkit/` and how they are shaped.

- Service Memory — `memory()` values that survive between calls.

- Chat Flow — A service that publishes through an injected `signal()`.

## Code Examples

### apps/koyo/lib/article/article.service.ts

```ts
import { serve } from "akanjs/service";

import * as db from "../db";
import type * as srv from "../srv";

export class ArticleService extends serve(db.article, ({ service }) => ({
  fileService: service<srv.shared.FileService>(),
  subscriptionService: service<srv.SubscriptionService>(),
})) {
  async publish(articleId: string) {
    const article = await this.updateArticle(articleId, { status: "published" });
    await this.subscriptionService.notifySubscribers(article.id);
    return article;
  }
  async getCoverUrl(articleId: string) {
    const { cover } = await this.getArticle(articleId);
    const file = cover ? await this.fileService.getFile(cover) : null;
    return file?.url ?? null;
  }
}
```

### apps/koyo/srvkit/imageStorage.ts

```ts
import { getEnv } from "akanjs/base";
import { adapt, StorageAdaptorRole } from "akanjs/service";

export class ImageStorage extends adapt("imageStorage" as const, ({ env, plug }) => ({
  folder: env(() => `images/${getEnv().environment}`),
  storage: plug(StorageAdaptorRole),
})) {
  async upload(localPath: string, filename: string) {
    const path = `${this.folder}/${filename}`;
    return await this.storage.uploadDataFromLocal({ path, localPath });
  }
}
```

### apps/koyo/lib/article/article.service.ts

```ts
import { ImageStorage } from "@apps/koyo/srvkit";
import { serve } from "akanjs/service";

import * as db from "../db";

export class ArticleService extends serve(db.article, ({ plug }) => ({
  imageStorage: plug(ImageStorage),
})) {
  async setCover(articleId: string, localPath: string) {
    const filename = `${articleId}.webp`;
    const coverUrl = await this.imageStorage.upload(localPath, filename);
    return await this.updateArticle(articleId, { coverUrl });
  }
}
```

### apps/koyo/lib/option.ts

```ts
import { R2Storage } from "@apps/koyo/srvkit";
import { AkanOption } from "akanjs/server";
import { StorageAdaptorRole } from "akanjs/service";

export const option = new AkanOption<ModulesOptions>()
  .applyAdaptor(StorageAdaptorRole, R2Storage);
```

### apps/koyo/lib/option.ts · apps/koyo/env/env.server.local.ts

```ts
// lib/option.ts
export type ModulesOptions = LibOptions & {
  shareEnabled?: boolean;
};

// env/env.server.local.ts
export const env: ModulesOptions = {
  ...libEnv,
  shareEnabled: true,
};
```

### apps/koyo/lib/article/article.service.ts

```ts
import { getEnv } from "akanjs/base";
import { serve } from "akanjs/service";

import * as db from "../db";
import type { ModulesOptions } from "../option";

export class ArticleService extends serve(db.article, ({ env }) => ({
  publicUrl: env((options: ModulesOptions) => {
    const isLocal = getEnv().operationMode === "local";
    return isLocal ? "http://localhost:8282" : `https://${options.hostname}`;
  }),
  isShareEnabled: env((options: ModulesOptions) => !!options.shareEnabled),
})) {
  getShareUrl(articleId: string) {
    if (!this.isShareEnabled) return null;
    return `${this.publicUrl}/article/${articleId}`;
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

