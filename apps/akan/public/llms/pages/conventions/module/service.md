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

Database model adaptor automatically injected for database services.

Internal database model adaptor injected together with the named model property.

Built-in logger for service logs.

Load one document by id. Throws when it cannot be found.

Load one document by id. Returns null when it cannot be found.

Batch load documents by ids.

Create a document from input data.

Update a document and return the updated document.

Remove or soft-remove a document through the generated database service flow.

Search documents and return docs with count.

Search documents and return docs only.

Count documents that match search text.

List documents matching a document filter.

List document ids matching a document filter.

Find one matching document or return null.

Find one matching document id or return null.

Find one matching document. Throws when missing.

Find one matching document id. Throws when missing.

Check whether a matching document exists.

Count matching documents.

Load aggregated insight for matching documents.

Return the raw query object for a document filter.

Runs before create. Return the input data to continue.

Runs after create. Return the document to continue.

Runs before update. Return the update data to continue.

Runs after update. Return the document to continue.

Runs before remove.

Runs after remove. Return the document to continue.

A service file is where business workflows run. It coordinates documents, other services, signals, external APIs, environment options, and service lifecycle hooks.

Use service methods for operations that need more than one model, external runtime objects, background jobs, or server-only logic. Keep simple state changes on the document when possible.

Service Shapes

Most services are database services created with serve(db.model, ...). Some services are plain runtime services created with serve("name" as const, ...). Apps can also extend generated or library services with the rest argument.

What serve() Gives You

serve() creates a typed service class. For database services, it also adds the model adaptor, generated document helpers, logger, lifecycle hooks, and injected properties.

serve(db.story, builder) automatically injects storyModel and __databaseModel, then exposes generated helpers such as getStory, loadStory, createStory, and query-based document methods.

serve("base" as const, builder) creates a service without a database model. Use it for runtime coordination, scheduled behavior, shared server features, or app-level orchestration.

The optional service option can disable a service or limit it to a server mode such as batch or federation.

Extra service classes passed after the injection builder are mixed into the final service. Their injection maps and lifecycle hooks are merged first.

Generated Methods

Database services receive model access and generated helper methods from the document definition. These names are based on the model name and document filters.

Description

Example

Query based methods are generated from filters declared in the document file.

Service Extension

Generated app domains can extend library service behavior with ...model.services. This keeps shared behavior in the generated/library layer while allowing the app service to add app-specific integrations.

Injection Builder

The second argument of serve() is an injection builder. It receives helpers for database, service, use, signal, plug, env, and memory. Each returned key becomes a readonly property on this service instance.

Injection Types

Choose the injection helper based on where the value comes from. Service dependencies, global runtime objects, signals, adaptors, environment options, and cached memory each use a different helper.

Database model injection is usually automatic for database services. Use the generated property such as storyModel instead of declaring database() by hand.

Inject another Akan service. The property key must end with Service so the runtime can resolve the registered service.

Inject a globally registered runtime object such as an API client, host value, or server-only wrapper from srvkit.

Inject a server signal so the service can enqueue background jobs or publish server events.

Inject an adaptor instance. If an adaptor role is registered, the runtime resolves the role implementation before injection.

Inject a value derived from module options or process env. The current pattern is a factory function, not env("KEY").

Inject memory owned by the service. local memory is writable on the instance; non-local memory uses the registered cache adaptor. Map memory requires an of option.

Business Logic Flow

Service methods should read like business actions. They can load documents, call document methods, coordinate other services, update logs, and enqueue signals in one transaction-like workflow.

Lifecycle Hooks

Use hooks when a rule must always run around create, update, remove, init, or destroy. If the behavior is only one business action, prefer a normal service method.

Practical Rules

Put workflows that coordinate multiple models, services, signals, or external APIs in service methods.

Use document methods for simple state changes on one document, then call .save() from the service when persistence is needed.

Name injected services with a Service suffix and injected signals with a Signal suffix.

Wrap external packages in srvkit, register them as use or adaptor values, then inject them into service files.

Use service extension for generated/library behavior, but keep app-specific integrations in the app service.

Avoid circular service dependencies. If two services need each other, move the shared operation into a smaller service or srvkit helper.

## Code Examples

### story.service.ts

```ts
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

### base.service.ts

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

### user.service.ts

```ts
export class UserService extends serve(
  db.user,
  ({ use }) => ({
    githubApp: use<GithubApp>(),
  }),
  ...user.services,
) {
  async refreshGithubToken(userId: string) {
    const user = await this.getUser(userId);
    // app-specific behavior extends generated user services
    return user;
  }
}
```

### serve signatures

```ts
serve(db.story, ({ service }) => ({ actionLogService: service<srv.ActionLogService>() }));

serve("myapp" as const, { serverMode: "batch" }, ({ service }) => ({
  summaryService: service<srv.SummaryService>(),
}));

serve(db.user, ({ use }) => ({ githubApp: use<GithubApp>() }), ...user.services);
```

### apps/myapp/lib/user/user.service.ts

```ts
import { user } from "../__lib/lib.service";

export class UserService extends serve(
  db.user,
  ({ use }) => {
    return {
      githubApp: use<GithubApp>(),
    };
  },
  ...user.services,
) {
  async authCallback(code: string, userId: string) {
    const { accessToken } = await this.githubApp.getAccessToken(code);
    const user = await this.getUser(userId);
    return await user.set({ githubInfo: { accessToken } }).save();
  }
}
```

### service injection shape

```ts
export class ExampleService extends serve(db.example, ({ service, use, signal, plug, env, memory }) => ({
  userService: service<srv.UserService>(),
  emailApi: use<EmailApi>(),
  exampleSignal: signal<sig.Example>(),
  paymentApi: plug(PaymentApi),
  apiHost: env((options: ModulesOptions) => options.apiHost),
  localCounter: memory(Int, { local: true, default: 0 }),
})) {}
```

### model access

```ts
async approve(storyId: string) {
  const story = await this.storyModel.getStory(storyId);
  return await story.approve().save();
}
```

### story.service.ts

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

### user.service.ts

```ts
export class UserService extends serve(db.user, ({ use }) => ({
  githubApp: use<GithubApp>(),
})) {
  async refreshGithubToken(userId: string) {
    const user = await this.getUser(userId);
    return await this.githubApp.refreshAccessToken(user.githubInfo.refreshToken);
  }
}
```

### dbBackup.service.ts

```ts
export class DbBackupService extends serve(db.dbBackup, ({ service, signal }) => ({
  fileService: service<srv.shared.FileService>(),
  dbBackupSignal: signal<sig.DbBackup>(),
})) {
  async queueArchiveDbBackup(dbBackupId: string) {
    const dbBackup = await this.dbBackupModel.getDbBackup(dbBackupId);
    await dbBackup.set({ status: "preparing" }).save();
    await this.dbBackupSignal.archiveDbBackup(dbBackupId);
    return dbBackup;
  }
}
```

### file.service.ts

```ts
export class FileService extends serve(db.file, ({ use, plug }) => ({
  storageApi: use<StorageApi>(),
  ipfsApi: plug(IpfsApi),
})) {
  async getJsonFromUri<T = any>(uri: string) {
    return (await fetch(this.ipfsApi.getHttpsUri(uri))).json() as T;
  }
}
```

### devProject.service.ts

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

### memory examples

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

### story.service.ts

```ts
async like(target: string, user: string) {
  const prev = await this.actionLogService.set({ type: "story", target, user, action: "like" }, 1);
  return await this.storyModel.like(target, prev);
}
```

### dbBackup.service.ts

```ts
override async _postCreate(doc: db.DbBackup): Promise<db.DbBackup> {
  await this.dbBackupSignal.archiveDbBackup(doc.id);
  return doc;
}

async archiveDbBackup(dbBackupId: string) {
  const dbBackup = await this.dbBackupModel.getDbBackup(dbBackupId);
  const cluster = await this.clusterService.getCluster(dbBackup.devApp);
  // archive, upload, cleanup, and update dbBackup status
  return await dbBackup.set({ status: "active" }).save();
}
```

### pre/post database hooks

```ts
override async _preCreate(data: DataInputOf<db.DbBackupInput, db.DbBackup>) {
  if (await this.dbBackupModel.workingBackupExists(data.devApp, data.branch)) {
    throw new Error("Working backup exists");
  }
  return data;
}

override async _postCreate(doc: db.DbBackup) {
  await this.dbBackupSignal.archiveDbBackup(doc.id);
  return doc;
}
```

### service lifecycle

```ts
async onInit() {
  this.logger.info("service is ready");
}

async onDestroy() {
  this.logger.info("service is closing");
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

