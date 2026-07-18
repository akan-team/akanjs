# service.service.ts

- Source: /conventions/service/service
- Mirror: /llms/pages/conventions/service/service.md
- Section: conventions
- Category: Service
- Priority: P1

## Headings

- Service File (#service-file)
- Basic Service Shape (#basic-service)
- Runtime Values (#runtime-values)
- Service Injection (#service-injection)
- Server Mode (#server-mode)

## Content

service.service.ts

Service File

A service module service file owns the server workflow. It is where encryption, search indexing, file access, external API calls, and service-to-service coordination should live.

Unlike model services, service modules usually start from a string name: `serve("search" as const, ...)`. There may be no database model behind it.

Basic Service Shape

`serve()` gives the module a stable service name and creates typed instance properties for injected values. Put public methods on the class; signals call those methods later.

Runtime Values

Use `use<T>()` when the service needs a runtime value supplied by the app or runtime container. Secrets, clients, and environment-specific handles belong here rather than as hardcoded constants.

Service Injection

Use `service<OtherService>()` when this workflow coordinates other services. This keeps orchestration in the service layer instead of spreading it across cron jobs or UI code.

Server Mode

Some service modules are not meant for normal request servers. `{ serverMode: "batch" }` marks a service for batch or internal workers, which matches scheduled jobs in the signal file.

## Code Examples

### minimal service

```ts
export class SecurityService extends serve("security" as const, ({ use }) => ({
  jwtSecret: use<string>(),
})) {
  async verifyToken(token?: string) {
    return await resolveJwt(this.jwtSecret, token);
  }
}
```

### runtime injection

```ts
export class SecurityService extends serve("security" as const, ({ use }) => ({
  jwtSecret: use<string>(),
  aeskey: use<string>(),
})) {
  async encrypt(data: string) {
    return await aesEncrypt(data, this.aeskey);
  }
}
```

### service injection

```ts
export class SearchAdminService extends serve("searchAdmin" as const, ({ service }) => ({
  searchService: service<srv.SearchService>(),
})) {
  async refreshIndex(name: string) {
    await this.searchService.resyncSearchDocuments(name);
  }
}
```

### batch service

```ts
export class SearchWorkerService extends serve(
  "searchWorker" as const,
  { serverMode: "batch" },
  () => ({}),
) {
  async runBatch() {
    return true;
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

