import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="service-file" title={l.trans({ en: "Service File", ko: "Service 파일" })}>
        <Docs.Title>{l.trans({ en: "Service File", ko: "Service 파일" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A service module service file owns the server workflow. It is where encryption, search indexing, file access, external API calls, and service-to-service coordination should live.",
              ko: "Service module의 service 파일은 server workflow를 담당합니다. encryption, search indexing, file access, external API call, service-to-service coordination 같은 로직을 여기에 둡니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: 'Unlike model services, service modules usually start from a string name: `serve("search" as const, ...)`. There may be no database model behind it.',
              ko: 'Model service와 달리 service module은 보통 `serve("search" as const, ...)`처럼 string name에서 시작합니다. 뒤에 database model이 없을 수 있습니다.',
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="basic-service" title={l.trans({ en: "Basic Service Shape", ko: "기본 service 형태" })}>
        <Docs.Title>{l.trans({ en: "Basic Service Shape", ko: "기본 service 형태" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`serve()` gives the module a stable service name and creates typed instance properties for injected values. Put public methods on the class; signals call those methods later.",
              ko: "`serve()`는 module에 stable service name을 주고 injected value를 typed instance property로 만듭니다. public method는 class에 두고 signal이 나중에 이 method를 호출합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="minimal service"
          code={`export class SecurityService extends serve("security" as const, ({ use }) => ({
  jwtSecret: use<string>(),
})) {
  async verifyToken(token?: string) {
    return await resolveJwt(this.jwtSecret, token);
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="runtime-values" title={l.trans({ en: "Runtime Values", ko: "Runtime value" })}>
        <Docs.Title>{l.trans({ en: "Runtime Values", ko: "Runtime value" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `use<T>()` when the service needs a runtime value supplied by the app or runtime container. Secrets, clients, and environment-specific handles belong here rather than as hardcoded constants.",
              ko: "App이나 runtime container가 공급하는 값이 필요하면 `use<T>()`를 사용합니다. secret, client, environment-specific handle은 hardcoded constant가 아니라 여기에 둡니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="runtime injection"
          code={`export class SecurityService extends serve("security" as const, ({ use }) => ({
  jwtSecret: use<string>(),
  aeskey: use<string>(),
})) {
  async encrypt(data: string) {
    return await aesEncrypt(data, this.aeskey);
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="service-injection" title={l.trans({ en: "Service Injection", ko: "Service injection" })}>
        <Docs.Title>{l.trans({ en: "Service Injection", ko: "Service injection" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `service<OtherService>()` when this workflow coordinates other services. This keeps orchestration in the service layer instead of spreading it across cron jobs or UI code.",
              ko: "이 workflow가 다른 service를 조율한다면 `service<OtherService>()`를 사용합니다. 이렇게 하면 orchestration이 cron job이나 UI code에 흩어지지 않고 service layer에 남습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="service injection"
          code={`export class SearchAdminService extends serve("searchAdmin" as const, ({ service }) => ({
  searchService: service<srv.SearchService>(),
})) {
  async refreshIndex(name: string) {
    await this.searchService.resyncSearchDocuments(name);
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="server-mode" title={l.trans({ en: "Server Mode", ko: "Server mode" })}>
        <Docs.Title>{l.trans({ en: "Server Mode", ko: "Server mode" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: 'Some service modules are not meant for normal request servers. `{ serverMode: "batch" }` marks a service for batch or internal workers, which matches scheduled jobs in the signal file.',
              ko: '일부 service module은 일반 request server용이 아닙니다. `{ serverMode: "batch" }`는 batch나 internal worker용 service임을 표시하며 signal 파일의 scheduled job과 맞물립니다.',
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="batch service"
          code={`export class SearchWorkerService extends serve(
  "searchWorker" as const,
  { serverMode: "batch" },
  () => ({}),
) {
  async runBatch() {
    return true;
  }
}`}
        />
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
