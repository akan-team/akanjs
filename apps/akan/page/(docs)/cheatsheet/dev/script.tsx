import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "Development: 스크립트 | Akan.js" : "Development: Script | Akan.js";
    const description =
      lang === "ko"
        ? "앱 서버를 띄워 작업 하나를 하고 끝나는 TypeScript 파일."
        : "A TypeScript file that boots the app's server, does one job and exits.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .render(() => {
    const { l } = usePage();

    const toolColumns = [
      { key: "tool", label: l.trans({ en: "Command", ko: "명령" }) },
      { key: "form", label: l.trans({ en: "Form", ko: "형태" }) },
      { key: "use", label: l.trans({ en: "Good for", ko: "잘 맞는 일" }) },
    ];
    const toolRows = [
      {
        tool: "`akan script`",
        form: l.trans({
          en: "A file in `script/` you can review and rerun",
          ko: "검토하고 다시 돌릴 수 있는 `script/` 속 파일",
        }),
        use: l.trans({
          en: "Seed data, checks, small maintenance fixes",
          ko: "시드 데이터, 점검, 작은 유지보수 수정",
        }),
      },
      {
        tool: "`akan migrate`",
        form: l.trans({
          en: "A migration in `script/migration/`, recorded and reversible",
          ko: "기록이 남고 되돌릴 수 있는 `script/migration/` 속 마이그레이션",
        }),
        use: l.trans({
          en: "Reshaping stored data after a code change, in every environment",
          ko: "코드 변경 뒤 저장된 데이터를 모든 환경에서 새 모양으로 고치는 일",
        }),
      },
      {
        tool: "`akan console`",
        form: l.trans({ en: "A prompt that is gone when you close it", ko: "닫으면 사라지는 프롬프트" }),
        use: l.trans({
          en: "Inspecting a service, trying a query, one small operator command",
          ko: "서비스 점검, 쿼리 시험, 작은 운영 명령 하나",
        }),
      },
    ];

    const relatedLinks = [
      {
        href: "/cheatsheet/dev/migration",
        title: l.trans({ en: "Data Migrations", ko: "데이터 마이그레이션" }),
        desc: l.trans({
          en: "Reshape stored data with a plan, a record and a rollback.",
          ko: "계획, 기록, 되돌리기를 갖춰 저장된 데이터를 고칩니다.",
        }),
      },
      {
        href: "/cheatsheet/dev/console",
        title: l.trans({ en: "Server Console", ko: "서버 콘솔" }),
        desc: l.trans({
          en: "Inspect services and try queries at a prompt.",
          ko: "프롬프트에서 서비스를 점검하고 쿼리를 시험합니다.",
        }),
      },
      {
        href: "/references/cli/application#script",
        title: l.trans({ en: "akan script Reference", ko: "akan script 레퍼런스" }),
        desc: l.trans({
          en: "The command's signature and arguments.",
          ko: "명령의 시그니처와 인자를 정리했습니다.",
        }),
      },
    ];

    const argItems = [
      {
        key: "app",
        type: "String",
        tags: [l.trans({ en: "optional", ko: "선택" })],
        desc: l.trans({
          en: "The app name, needed with a file name. Left out, it asks from a list or uses the only app.",
          ko: "앱 이름이며, 파일 이름을 넘길 때는 꼭 적습니다. 빼면 목록에서 고르고, 앱이 하나뿐이면 그 앱을 씁니다.",
        }),
        example: "koyo",
      },
      {
        key: "filename",
        type: "String",
        tags: [l.trans({ en: "optional", ko: "선택" })],
        desc: l.trans({
          en: "A file directly in `script/`; the `.ts` suffix is optional. Leave it out to pick from a list.",
          ko: "`script/` 바로 아래 파일입니다. `.ts`는 붙여도 빼도 됩니다. 빼면 `.ts` 파일 목록에서 고릅니다.",
        }),
        example: "hello",
      },
    ];

    const lookupColumns = [
      { key: "by", label: l.trans({ en: "Finds by", ko: "찾는 기준" }) },
      { key: "call", label: l.trans({ en: "Call", ko: "호출" }), code: true },
      { key: "desc", label: l.trans({ en: "What you get", ko: "꺼내는 것" }) },
    ];
    const lookupRows = [
      {
        call: "server.get(srv.IcecreamOrderService)",
        by: l.trans({ en: "Class", ko: "클래스" }),
        desc: l.trans({
          en: "A service, signal or adaptor instance, fully typed.",
          ko: "서비스, 시그널, 어댑터 인스턴스를 타입과 함께 꺼냅니다.",
        }),
      },
      {
        call: "server.get(StorageAdaptorRole)",
        by: l.trans({ en: "Role", ko: "역할" }),
        desc: l.trans({
          en: "The storage adaptor the app actually uses, whatever its implementation.",
          ko: "구현과 상관없이 앱이 실제로 쓰는 스토리지 어댑터를 꺼냅니다.",
        }),
      },
      {
        call: 'server.getService("icecreamOrder")',
        by: "refName",
        desc: l.trans({ en: "A service.", ko: "서비스를 꺼냅니다." }),
      },
      {
        call: 'server.getSignal("icecreamOrder")',
        by: "refName",
        desc: l.trans({
          en: "A signal, when the script should run signal logic.",
          ko: "시그널 로직을 실행해야 할 때 시그널을 꺼냅니다.",
        }),
      },
      {
        call: 'server.getAdaptor("blobStorage")',
        by: "refName",
        desc: l.trans({ en: "An adaptor, for infrastructure work.", ko: "인프라 작업에 쓸 어댑터를 꺼냅니다." }),
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="overview" title={l.trans({ en: "Scripts", ko: "스크립트" })}>
          <Docs.Title>{l.trans({ en: "Scripts", ko: "스크립트" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A script is a TypeScript file that boots your app's server, does one job, and exits. Reach for it when the job should live in a file rather than at a prompt:",
                ko: "스크립트는 앱 서버를 띄워 작업 하나를 하고 끝나는 TypeScript 파일입니다. 프롬프트에서 치고 끝낼 일이 아니라 파일로 남길 일에 씁니다:",
              })}
            </div>
            <Docs.Table columns={toolColumns} rows={toolRows} stacked />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Same wiring as the app.</strong> A script reuses the services, signals and adaptors the
                      app already wires together.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>앱과 같은 구성.</strong> 앱이 이미 연결해 둔 서비스, 시그널, 어댑터를 그대로 씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>No traffic, no schedules.</strong> It opens no port and runs none of the app's init,
                      interval, cron or queue jobs.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>요청도 스케줄도 없음.</strong> 포트를 열지 않고, 앱의 init·interval·cron·queue 작업도
                      실행하지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Small and disposable.</strong> Keep one job per script, and delete it once the job is
                      done.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>작게, 쓰고 버리게.</strong> 스크립트 하나에는 작업 하나만 담고, 작업이 끝나면 지웁니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.LinkGrid items={relatedLinks} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="command" title={l.trans({ en: "Create And Run", ko: "만들고 실행하기" })}>
          <Docs.Title>{l.trans({ en: "Create And Run", ko: "만들고 실행하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Put the file directly in the app's <code>script/</code> folder, then pass its name to{" "}
                    <code>akan script</code>.
                  </span>
                ),
                ko: (
                  <span>
                    파일을 앱의 <code>script/</code> 폴더 바로 아래에 두고, 그 이름을 <code>akan script</code>에
                    넘깁니다.
                  </span>
                ),
              })}
            </div>
            <ol className="my-4 list-decimal space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      Create <code>apps/koyo/script/hello.ts</code>. The next section shows what goes in it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <code>apps/koyo/script/hello.ts</code>를 만듭니다. 안에 들어갈 내용은 다음 섹션에 있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      From the workspace root, pass the app name and the file name. This runs{" "}
                      <code>apps/koyo/script/hello.ts</code>:
                    </span>
                  ),
                  ko: (
                    <span>
                      워크스페이스 루트에서 앱 이름과 파일 이름을 넘깁니다. 아래 명령은{" "}
                      <code>apps/koyo/script/hello.ts</code>를 실행합니다:
                    </span>
                  ),
                })}
              </li>
            </ol>
            <Code.Snippet className="w-full" title="Terminal" language="bash" code="akan script koyo hello" />
            <Docs.SubSubTitle>{l.trans({ en: "Arguments", ko: "인자" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "Both arguments may be left out, and the command then asks. They are positional, so the app comes first:",
                ko: "두 인자 모두 빼도 되며, 빼면 명령이 물어봅니다. 순서대로 받으므로 앱 이름이 먼저 옵니다:",
              })}
            </div>
            <Docs.OptionTable items={argItems} />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>No subfolders.</strong> Keep every script at the top of <code>script/</code>.{" "}
                      <code>script/migration/</code> holds migrations, which <code>akan migrate</code> runs.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>하위 폴더는 안 됩니다.</strong> 스크립트는 모두 <code>script/</code> 바로 아래에 둡니다.{" "}
                      <code>script/migration/</code>은 <code>akan migrate</code>가 실행하는 마이그레이션 자리입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>It runs from the workspace root</strong>, like <code>akan start</code>, so it opens the
                      same local database. Relative paths start at the root; reach a file beside the script through{" "}
                      <code>import.meta.dir</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>워크스페이스 루트에서 실행됩니다.</strong> <code>akan start</code>와 같은 곳이라 같은 로컬
                      DB를 엽니다. 상대 경로는 루트에서 시작하므로, 스크립트 옆의 파일은 <code>import.meta.dir</code>로
                      찾습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="lifecycle" title={l.trans({ en: "Server Lifecycle", ko: "서버 시작과 종료" })}>
          <Docs.Title>{l.trans({ en: "Server Lifecycle", ko: "서버 시작과 종료" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Every script has the same frame: start the server, do the job, and stop the server in{" "}
                    <code>finally</code>. The smallest script looks like this:
                  </span>
                ),
                ko: (
                  <span>
                    모든 스크립트의 뼈대는 같습니다. 서버를 시작하고, 작업하고, <code>finally</code>에서 서버를
                    멈춥니다. 가장 작은 스크립트는 이렇습니다:
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/script/hello.ts"
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
          <Docs.Description>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>server</code> is the app's own.
                      </strong>{" "}
                      It comes from <code>apps/koyo/server.ts</code>, so the script boots the same modules the app does.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>server</code>는 앱의 것입니다.
                      </strong>{" "}
                      <code>apps/koyo/server.ts</code>에서 가져오므로, 스크립트는 앱과 똑같은 모듈로 부팅합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>start()</code> wires the app but opens no port.
                      </strong>{" "}
                      Under <code>akan script</code> it connects the databases and creates the adaptors, services and
                      signals, and stops there.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>start()</code>는 앱을 조립하되 포트는 열지 않습니다.
                      </strong>{" "}
                      <code>akan script</code>에서는 데이터베이스를 연결하고 어댑터, 서비스, 시그널을 만드는 데서
                      멈춥니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>stop()</code> belongs in <code>finally</code>.
                      </strong>{" "}
                      Even when the job throws, database connections, timers and adaptors are cleaned up.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>stop()</code>은 <code>finally</code>에 둡니다.
                      </strong>{" "}
                      작업이 예외를 던져도 데이터베이스 연결, 타이머, 어댑터가 제대로 정리됩니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="service" title={l.trans({ en: "Use Services", ko: "서비스로 작업하기" })}>
          <Docs.Title>{l.trans({ en: "Use Services", ko: "서비스로 작업하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Do the work through services rather than direct database writes. A service already knows the domain rules, the database access and its other dependencies.",
                ko: "작업은 데이터베이스에 직접 쓰지 말고 서비스를 거쳐 합니다. 서비스는 도메인 규칙, 데이터베이스 접근, 다른 의존성을 이미 알고 있습니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    This script finishes every ice cream order still left in <code>served</code>:
                  </span>
                ),
                ko: (
                  <span>
                    다음 스크립트는 <code>served</code> 상태로 남은 아이스크림 주문을 모두 완료 처리합니다:
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/script/finishServedOrders.ts"
            code={`import { server, srv } from "../server";

const run = async () => {
  await server.start();

  try {
    const icecreamOrderService = server.get(srv.IcecreamOrderService);
    const servedOrders = await icecreamOrderService.listByStatuses(["served"]);

    console.info("served orders", servedOrders.length);

    for (const order of servedOrders) {
      await icecreamOrderService.finishIcecreamOrder(order.id);
    }
  } finally {
    await server.stop();
  }
};

void run();`}
          />
          <Docs.Description>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>server.get(srv.IcecreamOrderService)</code>
                      </strong>{" "}
                      finds the service by its class, so every method is typed.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>server.get(srv.IcecreamOrderService)</code>
                      </strong>
                      는 클래스로 서비스를 찾으므로 모든 메서드에 타입이 붙습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>listByStatuses</code>
                      </strong>{" "}
                      comes from the model's <code>byStatuses</code> filter. Every filter gives the service a{" "}
                      <code>{"list<Filter>"}</code> like it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>listByStatuses</code>
                      </strong>
                      는 모델의 <code>byStatuses</code> 필터에서 나옵니다. 필터마다 서비스에 이런{" "}
                      <code>{"list<Filter>"}</code>가 생깁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>finishIcecreamOrder</code>
                      </strong>{" "}
                      runs the same state check the app does, so an order that is not <code>served</code> is refused.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>finishIcecreamOrder</code>
                      </strong>
                      는 앱과 같은 상태 검사를 거치므로, <code>served</code>가 아닌 주문은 거부됩니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="lookup" title={l.trans({ en: "Lookup Helpers", ko: "인스턴스 찾기" })}>
          <Docs.Title>{l.trans({ en: "Lookup Helpers", ko: "인스턴스 찾기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Once <code>server.start()</code> resolves, <code>server</code> hands out any service, signal or
                    adaptor the app registered. Prefer a class to a name string, which is not type-checked.
                  </span>
                ),
                ko: (
                  <span>
                    <code>server.start()</code>가 끝나면 <code>server</code>가 앱에 등록된 서비스, 시그널, 어댑터를
                    무엇이든 꺼내 줍니다. 이름 문자열은 타입 검사가 안 되므로 가능하면 클래스로 찾습니다.
                  </span>
                ),
              })}
            </div>
            <Docs.Table columns={lookupColumns} rows={lookupRows} stacked />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A refName is the name a module registers under.</strong> For a service or signal it is the
                      camelCase module name, such as <code>icecreamOrder</code>; for an adaptor it is the key passed to{" "}
                      <code>adapt()</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>refName은 모듈이 등록된 이름입니다.</strong> 서비스와 시그널은 <code>icecreamOrder</code>{" "}
                      같은 camelCase 모듈 이름이고, 어댑터는 <code>adapt()</code>에 넘긴 키입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A lib's classes sit under the lib's name,</strong> as in{" "}
                      <code>srv.shared.UserService</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>lib의 클래스는 lib 이름 아래에 있습니다.</strong> <code>srv.shared.UserService</code>
                      처럼 씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Import <code>StorageAdaptorRole</code> from <code>akanjs/service</code>.
                      </strong>{" "}
                      A role finds the adaptor even after the app swaps in its own implementation.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>StorageAdaptorRole</code>은 <code>akanjs/service</code>에서 가져옵니다.
                      </strong>{" "}
                      앱이 구현을 바꿔 끼워도 역할로는 그 어댑터를 찾을 수 있습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Look up only after start.</strong> Until <code>await server.start()</code> resolves, every
                    lookup throws.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>조회는 start 뒤에만 합니다.</strong> <code>await server.start()</code>가 끝나기 전에는 모든
                    조회가 예외를 던집니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="tips" title={l.trans({ en: "Change Data Safely", ko: "데이터를 안전하게 바꾸기" })}>
          <Docs.Title>{l.trans({ en: "Change Data Safely", ko: "데이터를 안전하게 바꾸기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A script that changes data should show what it is about to do before it does it. Three habits cover most of it:",
                ko: "데이터를 바꾸는 스크립트는 실제로 바꾸기 전에 무엇을 할지 먼저 보여 줘야 합니다. 세 가지 습관이면 대부분 해결됩니다:",
              })}
            </div>
            <ol className="my-4 list-decimal space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Print the target environment first.</strong> <code>getEnv().environment</code> names the
                      environment the script is about to change.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>대상 환경부터 출력합니다.</strong> <code>getEnv().environment</code>가 스크립트가 바꿀
                      환경을 알려 줍니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Make a dry run the default.</strong> It only shows what would change. Read an env var such
                      as <code>APPLY=1</code>, and change nothing without it.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>기본은 dry run으로 둡니다.</strong> 바꿀 대상을 보여 주기만 하는 실행입니다.{" "}
                      <code>APPLY=1</code> 같은 환경 변수를 읽고, 이 값이 없으면 아무것도 바꾸지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Write through service methods.</strong> The domain rules then stay in one place instead of
                      being copied into the script.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>쓰기는 서비스 메서드로 합니다.</strong> 그래야 도메인 규칙이 스크립트에 복사되지 않고
                      한곳에 남습니다.
                    </span>
                  ),
                })}
              </li>
            </ol>
            <div>
              {l.trans({
                en: "Here is the script from above with the first two habits added:",
                ko: "위의 스크립트에 앞의 두 습관을 더하면 이렇습니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/script/finishServedOrders.ts"
            code={`import { getEnv } from "akanjs/base";
import { server, srv } from "../server";

const isApply = process.env.APPLY === "1";

const run = async () => {
  await server.start();

  try {
    console.info(\`environment: \${getEnv().environment}, apply: \${isApply}\`);

    const icecreamOrderService = server.get(srv.IcecreamOrderService);
    const servedOrders = await icecreamOrderService.listByStatuses(["served"]);

    console.info("served orders", servedOrders.length);
    if (!isApply) return;

    for (const order of servedOrders) {
      await icecreamOrderService.finishIcecreamOrder(order.id);
    }
  } finally {
    await server.stop();
  }
};

void run();`}
          />
          <Docs.Description>
            <div>
              {l.trans({
                en: "Run it once to read the count, then again to apply it:",
                ko: "한 번 실행해 개수를 확인하고, 다시 실행해 적용합니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`akan script koyo finishServedOrders
APPLY=1 akan script koyo finishServedOrders`}
          />
          <Docs.Description>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>AKAN_PUBLIC_ENV</code> picks the environment.
                      </strong>{" "}
                      The server reads the matching <code>{"env/env.server.<env>.ts"}</code>, and a new workspace's{" "}
                      <code>.env</code> sets it to <code>local</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        환경은 <code>AKAN_PUBLIC_ENV</code>가 정합니다.
                      </strong>{" "}
                      서버는 그 값에 맞는 <code>{"env/env.server.<env>.ts"}</code>를 읽습니다. 새 워크스페이스의{" "}
                      <code>.env</code>에는 <code>local</code>로 들어 있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        A <code>return</code> inside <code>try</code> still reaches <code>finally</code>,
                      </strong>{" "}
                      so the dry run stops the server too.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>try</code> 안의 <code>return</code>도 <code>finally</code>를 거칩니다.
                      </strong>{" "}
                      그래서 dry run에서도 서버가 멈춥니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Nothing after the file name reaches the script.</strong> <code>akan script</code> takes only
                    the app and the file name, and an extra argument or unknown flag is an error. Environment variables
                    do reach the script, so pass a flag as one.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>파일 이름 뒤에 적은 것은 스크립트로 가지 않습니다.</strong> <code>akan script</code>는 앱
                    이름과 파일 이름만 받고, 인자를 더 붙이거나 모르는 플래그를 붙이면 오류가 납니다. 환경 변수는
                    스크립트까지 그대로 가므로, 플래그는 환경 변수로 넘깁니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
