# service.signal.ts

- Source: /conventions/service/signal
- Mirror: /llms/pages/conventions/service/signal.md
- Section: conventions
- Category: Service
- Priority: P1

## Headings

- Signal File (#signal-file)
- Endpoint Queries (#endpoint-query)
- Endpoint Mutations (#endpoint-mutation)
- Internal And Cron (#internal-and-cron)
- Custom Routes (#custom-routes)

## Content

service.signal.ts

Signal File

A service module signal file exposes the service workflow. It can define endpoint APIs for clients, internal tasks for the server, cron jobs for workers, and special routes that are not tied to a model.

The signal still points at the service module: `endpoint(srv.search, ...)` or `internal(srv.localFile, ...)`. The service method stays in service; the access shape stays in signal.

Endpoint Queries

Service module endpoints can be ordinary typed queries or mutations even when there is no model CRUD. The `_search` endpoint receives params and search values, then calls `searchService`.

Endpoint Mutations

Use mutations for service actions that change data, create tokens, send messages, or run side effects. The endpoint should stay thin and delegate the actual work to the service.

Internal And Cron

Internal signals are for server-side work that is not called directly from browser UI. Cron jobs can be scoped to a server mode, which is common for batch service modules.

Custom Routes

A service endpoint can also expose a custom path, such as `localFile/getBlob/*`. Add `Req` or `Res` when the handler needs raw request context.

## Code Examples

### minimal query endpoint

```ts
export class SearchEndpoint extends endpoint(srv.search, ({ query }) => ({
  getSearchResult: query(cnst.SearchResult)
    .param("searchIndexName", String)
    .search("searchString", String)
    .exec(async function (searchIndexName, searchString) {
      return await this.searchService.getSearchResult(searchIndexName, { searchString });
    }),
})) {}
```

### minimal mutation endpoint

```ts
export class SecurityEndpoint extends endpoint(srv.security, ({ mutation }) => ({
  encrypt: mutation(String)
    .body("data", String)
    .exec(async function (data) {
      return await this.securityService.encrypt(data);
    }),
})) {}
```

### minimal cron

```ts
export class SearchInternal extends internal(srv.search, ({ cron }) => ({
  refreshIndex: cron("0 * * * *", { serverMode: "batch" }).exec(async function () {
    await this.searchService.resyncSearchDocuments("story");
  }),
})) {}
```

### prefixless endpoint

```ts
export class LocalFileEndpoint extends endpoint(srv.localFile, ({ query }) => ({
  getBlob: query(Any, { path: "localFile/getBlob/*" })
    .with(Req)
    .exec(async function (req) {
      return new Response(await this.localFileService.readLocalFile(req.url));
    }),
})) {}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

