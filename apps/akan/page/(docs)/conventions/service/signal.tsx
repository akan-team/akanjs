import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="signal-file" title={l.trans({ en: "Signal File", ko: "Signal 파일" })}>
        <Docs.Title>{l.trans({ en: "Signal File", ko: "Signal 파일" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A service module signal file exposes the service workflow. It can define endpoint APIs for clients, internal tasks for the server, cron jobs for workers, and special routes that are not tied to a model.",
              ko: "Service module의 signal 파일은 service workflow를 외부로 노출합니다. client용 endpoint API, server용 internal task, worker용 cron job, model과 무관한 special route를 정의할 수 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The signal still points at the service module: `endpoint(srv.search, ...)` or `internal(srv.localFile, ...)`. The service method stays in service; the access shape stays in signal.",
              ko: "Signal은 여전히 `endpoint(srv.search, ...)`, `internal(srv.localFile, ...)`처럼 service module을 가리킵니다. service method는 service에, access shape은 signal에 둡니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="endpoint-query" title={l.trans({ en: "Endpoint Queries", ko: "Endpoint query" })}>
        <Docs.Title>{l.trans({ en: "Endpoint Queries", ko: "Endpoint query" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Service module endpoints can be ordinary typed queries or mutations even when there is no model CRUD. The `_search` endpoint receives params and search values, then calls `searchService`.",
              ko: "Service module endpoint는 model CRUD가 없어도 일반 typed query나 mutation이 될 수 있습니다. `_search` endpoint는 param과 search value를 받은 뒤 `searchService`를 호출합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="minimal query endpoint"
          code={`export class SearchEndpoint extends endpoint(srv.search, ({ query }) => ({
  getSearchResult: query(cnst.SearchResult)
    .param("searchIndexName", String)
    .search("searchString", String)
    .exec(async function (searchIndexName, searchString) {
      return await this.searchService.getSearchResult(searchIndexName, { searchString });
    }),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="endpoint-mutation" title={l.trans({ en: "Endpoint Mutations", ko: "Endpoint mutation" })}>
        <Docs.Title>{l.trans({ en: "Endpoint Mutations", ko: "Endpoint mutation" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use mutations for service actions that change data, create tokens, send messages, or run side effects. The endpoint should stay thin and delegate the actual work to the service.",
              ko: "data 변경, token 생성, message 전송, side effect 실행 같은 service action에는 mutation을 사용합니다. endpoint는 얇게 유지하고 실제 작업은 service에 위임합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="minimal mutation endpoint"
          code={`export class SecurityEndpoint extends endpoint(srv.security, ({ mutation }) => ({
  encrypt: mutation(String)
    .body("data", String)
    .exec(async function (data) {
      return await this.securityService.encrypt(data);
    }),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="internal-and-cron" title={l.trans({ en: "Internal And Cron", ko: "Internal과 cron" })}>
        <Docs.Title>{l.trans({ en: "Internal And Cron", ko: "Internal과 cron" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Internal signals are for server-side work that is not called directly from browser UI. Cron jobs can be scoped to a server mode, which is common for batch service modules.",
              ko: "Internal signal은 browser UI에서 직접 호출하지 않는 server-side work에 사용합니다. Cron job은 server mode에 묶을 수 있고, batch service module에서 자주 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="minimal cron"
          code={`export class SearchInternal extends internal(srv.search, ({ cron }) => ({
  refreshIndex: cron("0 * * * *", { serverMode: "batch" }).exec(async function () {
    await this.searchService.resyncSearchDocuments("story");
  }),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="custom-routes" title={l.trans({ en: "Custom Routes", ko: "Custom route" })}>
        <Docs.Title>{l.trans({ en: "Custom Routes", ko: "Custom route" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A service endpoint can also expose a custom path, such as `localFile/getBlob/*`. Add `Req` or `Res` when the handler needs raw request context.",
              ko: "Service endpoint는 `localFile/getBlob/*` 같은 custom path도 노출할 수 있습니다. raw request context가 필요하면 `Req`나 `Res`를 추가합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="prefixless endpoint"
          code={`export class LocalFileEndpoint extends endpoint(srv.localFile, ({ query }) => ({
  getBlob: query(Any, { path: "localFile/getBlob/*" })
    .with(Req)
    .exec(async function (req) {
      return new Response(await this.localFileService.readLocalFile(req.url));
    }),
})) {}`}
        />
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
