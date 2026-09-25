import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Scripts", ko: "Scripts" })}>
        <Docs.Title>{l.trans({ en: "Scripts", ko: "Scripts" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `akan script` for one-time developer or operator jobs: seed data, migrations, checks, and small maintenance fixes.",
              ko: "`akan script`는 seed data, migration, 점검, 작은 유지보수 수정 같은 일회성 개발/운영 작업에 사용합니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "The script starts the app server container without opening a normal web page.",
                ko: "Script는 일반 web page를 열지 않고 app server container를 시작합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "You can reuse services, signals, and adaptors that the app already wires together.",
                ko: "App이 이미 연결해 둔 service, signal, adaptor를 재사용할 수 있습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Keep each script small and easy to delete after the job is done.",
                ko: "각 script는 작게 유지하고 작업이 끝나면 지우기 쉽게 만드세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use `akan console` instead when the job is interactive inspection or a small operator command.",
                ko: "Interactive 점검이나 작은 운영 명령에는 `akan console`을 사용하세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="command" title={l.trans({ en: "Command", ko: "명령어" })}>
        <Docs.Title>{l.trans({ en: "Command", ko: "명령어" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Put scripts under `apps/myapp/script`. The filename becomes the command target.",
              ko: "Script는 `apps/myapp/script` 아래에 둡니다. 파일명이 command target이 됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Run a script", ko: "Script 실행" })}
          code={`akan script myapp hello

# runs this file
apps/myapp/script/hello.ts`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="lifecycle" title={l.trans({ en: "Server Lifecycle", ko: "Server lifecycle" })}>
        <Docs.Title>{l.trans({ en: "Server Lifecycle", ko: "Server lifecycle" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Start the server, do the job, and always stop it in `finally`. This makes database connections, timers, and adaptors clean up correctly.",
              ko: "Server를 시작하고 작업한 뒤 `finally`에서 반드시 종료하세요. 그래야 database connection, timer, adaptor가 올바르게 정리됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="apps/myapp/script/hello.ts"
          code={`import { server } from "../server";

const run = async () => {
  await server.start();

  try {
    console.info("hello from script");
  } finally {
    await server.stop();
  }
};

void run();`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="service" title={l.trans({ en: "Use Services", ko: "Service 사용" })}>
        <Docs.Title>{l.trans({ en: "Use Services", ko: "Service 사용" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Most maintenance jobs should call services. Services already know the domain rules, database access, and other dependencies.",
              ko: "대부분의 유지보수 작업은 service를 호출하는 방식이 좋습니다. Service는 domain rule, database access, 다른 의존성을 이미 알고 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Read and update data", ko: "데이터 조회와 수정" })}
          code={`import { server, srv } from "../server";

const run = async () => {
  await server.start();

  try {
    const articleService = server.get(srv.ArticleService);
    const draftArticles = await articleService.findDrafts();

    console.info("draft count", draftArticles.length);

    for (const article of draftArticles) {
      await articleService.markAsReady(article.id);
    }
  } finally {
    await server.stop();
  }
};

void run();`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="lookup" title={l.trans({ en: "Lookup Helpers", ko: "Lookup helper" })}>
        <Docs.Title>{l.trans({ en: "Lookup Helpers", ko: "Lookup helper" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "`server.get(ArticleService)`: class-based lookup with strong types.",
                ko: "`server.get(ArticleService)`: class 기반 조회로 type이 잘 잡힙니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: '`server.getService("article")`: refName-based service lookup.',
                ko: '`server.getService("article")`: refName 기반 service 조회입니다.',
              })}
            </li>
            <li>
              {l.trans({
                en: '`server.getSignal("article")`: signal lookup for a script that wants to call signal logic.',
                ko: '`server.getSignal("article")`: signal logic을 호출하고 싶을 때 사용합니다.',
              })}
            </li>
            <li>
              {l.trans({
                en: '`server.getAdaptor("storage")`: adaptor lookup for infrastructure tasks.',
                ko: '`server.getAdaptor("storage")`: infrastructure 작업에서 adaptor를 조회할 때 사용합니다.',
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Print the target environment before changing data.",
                ko: "데이터를 변경하기 전에 대상 environment를 출력하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "For destructive scripts, add a confirm flag or dry-run mode.",
                ko: "파괴적인 script에는 confirm flag나 dry-run mode를 추가하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Prefer service methods over direct database writes so domain rules stay in one place.",
                ko: "Domain rule이 한곳에 남도록 직접 database를 쓰기보다 service method를 우선 사용하세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
