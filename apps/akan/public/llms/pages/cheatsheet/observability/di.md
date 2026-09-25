# Dependency Injection

- Source: /cheatsheet/observability/di
- Mirror: /llms/pages/cheatsheet/observability/di.md
- Section: cheatsheet
- Category: Observability
- Priority: P2

## Headings

- Dependency Injection (#overview)
- Register With use (#use)
- Adapt And Plug (#adaptor)
- Inject Services (#service)
- Read Environment (#env)
- Tips (#tips)

## Content

Dependency Injection

Dependency injection means a service receives what it needs instead of creating everything by itself. This keeps business code small and makes external systems easier to replace.

`use` receives values registered in app or library options.

`adapt` and `plug` are good for replaceable tools such as storage, cache, or message APIs.

`service` connects one service to another service.

`env` reads runtime configuration without passing it through every function.

Register With use

`AkanOption.use()` is a simple place to prepare global values. Put API clients, generated secrets, host values, and shared settings there.

Option registers values

Service receives values

Adapt And Plug

Use an adaptor when a tool has behavior and can be replaced later. The service only asks for the role it needs.

Declare adaptor

Plug adaptor into service

Inject Services

Use `service()` when one service needs another service's business method. This is clearer than importing and creating the other service yourself.

Service to service

Read Environment

`env()` is useful when the service needs runtime identity such as app name, operation mode, hostname, or a feature flag.

Environment value

Tips

Do not create external clients inside every method. Register them once with `use` or `adapt`.

Use `service()` for business collaboration, and `plug()` for replaceable infrastructure.

Keep secrets in env/options and inject prepared clients, not raw credentials, when possible.

If a value is shared across many services, `AkanOption.use()` is usually the cleanest home.

## Code Examples

### Code

```ts
export const option = new AkanOption<AppEnv>().use((env) => ({
  mailApi: env.mail ? new MailApi(env.mail) : null,
  storageApi: env.storage ? new CloudStorage(env.storage) : new LocalStorage(),
  appHost: env.operationMode === "local" ? "localhost" : env.hostname,
}));
```

### Code

```ts
export class ArticleService extends serve(db.article, ({ use }) => ({
  mailApi: use<MailApi>(),
  storageApi: use<StorageApi>(),
  appHost: use<string>(),
})) {
  async sendPublishedMail(articleId: string) {
    await this.mailApi.send(`${this.appHost}/article/${articleId}`);
  }
}
```

### Code

```ts
export class ImageStorage extends adapt("imageStorage", ({ env }) => ({
  bucket: env((env: AppEnv) => env.imageBucket),
})) {
  async upload(file: File) {
    return await uploadToBucket(this.bucket, file);
  }
}
```

### Code

```ts
export class ArticleService extends serve(db.article, ({ plug }) => ({
  imageStorage: plug(ImageStorage),
})) {
  async setCover(articleId: string, file: File) {
    const url = await this.imageStorage.upload(file);
    return await this.articleModel.update(articleId, { cover: url });
  }
}
```

### Code

```ts
export class ArticleService extends serve(db.article, ({ service }) => ({
  fileService: service<srv.FileService>(),
  notificationService: service<srv.NotificationService>(),
})) {
  async publish(articleId: string) {
    const article = await this.articleModel.update(articleId, { status: "published" });
    await this.notificationService.notify("articlePublished", article.id);
    return article;
  }
}
```

### Code

```ts
export class ArticleService extends serve(db.article, ({ env }) => ({
  publicUrl: env((env: AppEnv) =>
    env.operationMode === "local" ? "http://localhost:8282" : `https://${env.hostname}`,
  ),
})) {
  getShareUrl(articleId: string) {
    return `${this.publicUrl}/article/${articleId}`;
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

