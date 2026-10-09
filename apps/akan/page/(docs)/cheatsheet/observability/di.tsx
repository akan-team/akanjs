import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";

  const termRows = [
    {
      name: l.trans({ en: "injector", ko: "주입기 (injector)" }),
      desc: l.trans({
        en: "A helper like `service()` or `plug()` inside `serve()` or `adapt()`. Each one fills one field.",
        ko: "`serve()`나 `adapt()` 안에서 쓰는 `service()`, `plug()` 같은 도우미입니다. 하나가 필드 하나를 채웁니다.",
      }),
    },
    {
      name: "adaptor",
      desc: l.trans({
        en: "A class built with `adapt()` that wraps one outside tool, such as storage or a mail API.",
        ko: "`adapt()`로 만든 class입니다. storage나 메일 API 같은 외부 도구 하나를 감쌉니다.",
      }),
    },
    {
      name: "role",
      desc: l.trans({
        en: "A slot for a built-in adaptor, such as `StorageAdaptorRole`. The app decides what fills it.",
        ko: "`StorageAdaptorRole`처럼 기본 adaptor가 들어가는 자리입니다. 무엇으로 채울지는 앱이 정합니다.",
      }),
    },
    {
      name: "singleton",
      desc: l.trans({
        en: "One instance per server process, shared by everything that injects it.",
        ko: "서버 프로세스마다 하나뿐인 인스턴스입니다. 주입받는 모든 곳이 같은 것을 씁니다.",
      }),
    },
    {
      name: "server env",
      desc: l.trans({
        en: "The object in `env/env.server.<environment>.ts`, typed by `ModulesOptions` in `lib/option.ts`.",
        ko: "`env/env.server.<environment>.ts`에 있는 객체입니다. 타입은 `lib/option.ts`의 `ModulesOptions`입니다.",
      }),
    },
  ];

  const builderColumns = [
    { key: "serve", label: "serve()", code: true },
    { key: "adapt", label: "adapt()", code: true },
  ];
  const everywhere = { serve: true, adapt: true };
  const serviceOnly = { serve: true, adapt: false };

  const injectorGroups = [
    {
      label: l.trans({
        en: "Pick in this order: the first that fits wins",
        ko: "이 순서로 고릅니다. 먼저 맞는 것이 정답입니다",
      }),
      rows: [
        {
          name: "service<T>()",
          desc: l.trans({
            en: "Another service's business method.",
            ko: "다른 service의 업무 메서드를 씁니다.",
          }),
          marks: serviceOnly,
        },
        {
          name: "plug(Class)",
          desc: l.trans({
            en: "A replaceable tool such as storage, a cache or a message API.",
            ko: "storage, cache, 메시지 API처럼 교체할 수 있는 도구를 씁니다.",
          }),
          marks: everywhere,
        },
        {
          name: "use<T>()",
          desc: l.trans({
            en: "A legacy singleton registered in `option.ts`. Recognise it; do not write new ones.",
            ko: "`option.ts`에 등록된 레거시 singleton입니다. 알아보기만 하고 새로 쓰지는 않습니다.",
          }),
          marks: everywhere,
        },
        {
          name: "env(factory)",
          desc: l.trans({
            en: "Runtime configuration, read without passing it through every function.",
            ko: "런타임 설정을 함수마다 넘기지 않고 읽습니다.",
          }),
          marks: everywhere,
        },
      ],
    },
    {
      label: l.trans({ en: "For one specific job", ko: "특정 용도 전용" }),
      rows: [
        {
          name: "memory(Type)",
          desc: l.trans({
            en: "A small value that survives between calls.",
            ko: "호출 사이에도 유지되는 작은 값입니다.",
          }),
          marks: everywhere,
        },
        {
          name: "signal<T>()",
          desc: l.trans({
            en: "A server signal, to publish an event or queue a job. The field name ends in `Signal`.",
            ko: "이벤트를 발행하거나 작업을 큐에 넣는 server signal입니다. 필드 이름은 `Signal`로 끝납니다.",
          }),
          marks: serviceOnly,
        },
      ],
    },
  ];

  const overviewNotes = [
    l.trans({
      en: (
        <>
          <strong>Destructure only what you use.</strong> <code>{"({ service, env }) => ({ … })"}</code> names the
          injectors this class needs, and nothing else.
        </>
      ),
      ko: (
        <>
          <strong>쓰는 것만 꺼냅니다.</strong> <code>{"({ service, env }) => ({ … })"}</code>처럼 이 class에 필요한
          주입기만 적습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            Every field is ready before <code>onInit()</code>.
          </strong>{" "}
          Injected values are filled first, so <code>onInit()</code> can already use them.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>onInit()</code> 전에 모든 필드가 채워집니다.
          </strong>{" "}
          그래서 <code>onInit()</code>에서 주입받은 값을 바로 쓸 수 있습니다.
        </>
      ),
    }),
  ];

  const serviceNotes = [
    l.trans({
      en: (
        <>
          <strong>The field name picks the service.</strong> <code>subscriptionService</code> resolves to the service
          named <code>subscription</code>, so the name must end in <code>Service</code>. The type argument only adds
          types.
        </>
      ),
      ko: (
        <>
          <strong>필드 이름이 service를 고릅니다.</strong> <code>subscriptionService</code>는 <code>subscription</code>{" "}
          service로 연결되므로, 이름은 <code>Service</code>로 끝나야 합니다. 타입 인자는 타입을 알려 줄 뿐입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>A lib's service goes through its namespace.</strong> From an app it is typed{" "}
          <code>srv.shared.FileService</code>; the field is still <code>fileService</code>.
        </>
      ),
      ko: (
        <>
          <strong>lib의 service는 namespace를 거칩니다.</strong> 앱에서는 <code>srv.shared.FileService</code>로 타입을
          적고, 필드 이름은 그대로 <code>fileService</code>입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            Import <code>srv</code> as a type.
          </strong>{" "}
          <code>import type * as srv from "../srv"</code> keeps the runtime import graph lazy.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>srv</code>는 타입으로만 import합니다.
          </strong>{" "}
          <code>import type * as srv from "../srv"</code>로 적어야 런타임 import가 가볍게 유지됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Generated methods come with the service.</strong> A database service already has{" "}
          <code>this.getArticle</code>, <code>this.updateArticle</code> and <code>this.articleModel</code>.
        </>
      ),
      ko: (
        <>
          <strong>자동 생성 메서드는 이미 들어 있습니다.</strong> database service에는 <code>this.getArticle</code>,{" "}
          <code>this.updateArticle</code>, <code>this.articleModel</code>이 처음부터 있습니다.
        </>
      ),
    }),
  ];

  const adaptorNotes = [
    l.trans({
      en: (
        <>
          <strong>
            <code>plug(Class)</code> is all the registration there is.
          </strong>{" "}
          No <code>option.ts</code> entry: the class itself is the token.
        </>
      ),
      ko: (
        <>
          <strong>
            등록은 <code>plug(Class)</code>가 전부입니다.
          </strong>{" "}
          <code>option.ts</code>에 적을 것이 없고, class 자체가 식별자입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>One instance per process.</strong> Every service that plugs <code>ImageStorage</code> shares the same
          object.
        </>
      ),
      ko: (
        <>
          <strong>프로세스마다 하나입니다.</strong> <code>ImageStorage</code>를 plug한 service는 모두 같은 객체를
          씁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>this.logger</code> is built in.
          </strong>{" "}
          Never construct a <code>Logger</code> in an adaptor; put setup work in <code>override async onInit()</code>.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>this.logger</code>는 기본으로 있습니다.
          </strong>{" "}
          adaptor 안에서 <code>Logger</code>를 만들지 말고, 초기화 작업은 <code>override async onInit()</code>에 둡니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Give it a name no other adaptor uses.</strong> Write the name passed to <code>adapt()</code>{" "}
          <code>as const</code>, unique across the app and its libs.
        </>
      ),
      ko: (
        <>
          <strong>다른 adaptor와 겹치지 않는 이름을 줍니다.</strong> <code>adapt()</code>에 넘기는 이름은{" "}
          <code>as const</code>로 적고, 앱과 lib 전체에서 하나만 있어야 합니다.
        </>
      ),
    }),
  ];

  const roleColumns = [
    { key: "role", label: l.trans({ en: "Role", ko: "Role" }), code: true },
    { key: "fallback", label: l.trans({ en: "Default", ko: "기본 구현" }), code: true },
    { key: "use", label: l.trans({ en: "Used for", ko: "쓰임" }) },
  ];
  const roleRows = [
    {
      role: "DatabaseAdaptorRole",
      fallback: "SqliteDatabase",
      use: l.trans({ en: "Documents and queries", ko: "document 저장과 쿼리" }),
    },
    {
      role: "CacheAdaptorRole",
      fallback: "SolidCache",
      use: l.trans({ en: "`memory()` values and the document cache", ko: "`memory()` 값과 document cache" }),
    },
    {
      role: "StorageAdaptorRole",
      fallback: "BlobStorage",
      use: l.trans({ en: "Uploaded files, on local disk by default", ko: "업로드한 파일. 기본은 로컬 디스크입니다" }),
    },
    {
      role: "QueueAdaptorRole",
      fallback: "SolidQueue",
      use: l.trans({ en: "Background jobs queued by signals", ko: "signal이 큐에 넣는 백그라운드 작업" }),
    },
    {
      role: "ScheduleAdaptorRole",
      fallback: "Scheduler",
      use: l.trans({ en: "Cron and interval jobs", ko: "cron과 interval 작업" }),
    },
    {
      role: "LoggingAdaptorRole",
      fallback: "ConsoleLogger",
      use: l.trans({ en: "Writing log lines by level", ko: "레벨별 로그 출력" }),
    },
    {
      role: "WebsocketAdaptorRole",
      fallback: "SolidPubSub",
      use: l.trans({ en: "Pubsub rooms for websocket clients", ko: "websocket 클라이언트의 pubsub room" }),
    },
    {
      role: "CompressAdaptorRole",
      fallback: "JsonCompressor",
      use: l.trans({ en: "Encoding a typed value to bytes and back", ko: "타입이 있는 값을 바이트로 바꾸고 되돌리기" }),
    },
    {
      role: "LlmAdaptorRole",
      fallback: "OpenaiLlm",
      use: l.trans({ en: "LLM calls from the in-page agent relay", ko: "인페이지 에이전트 relay의 LLM 호출" }),
    },
  ];

  const roleNotes = [
    l.trans({
      en: (
        <>
          <strong>The replacement implements the role's interface.</strong> <code>R2Storage</code> is an{" "}
          <code>adapt()</code> class that <code>implements StorageAdaptor</code>.
        </>
      ),
      ko: (
        <>
          <strong>교체 구현은 role의 interface를 구현합니다.</strong> <code>R2Storage</code>는{" "}
          <code>implements StorageAdaptor</code>를 붙인 <code>adapt()</code> class입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Only these nine roles can be swapped.</strong> <code>applyAdaptor</code> ignores any other class, and
          it is not a way to register an adaptor.
        </>
      ),
      ko: (
        <>
          <strong>교체할 수 있는 것은 이 아홉 role뿐입니다.</strong> <code>applyAdaptor</code>는 다른 class를 무시하며,
          adaptor를 등록하는 방법도 아닙니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>The app has the last word.</strong> The app's <code>option.ts</code> is read after every lib's, so its
          choice wins.
        </>
      ),
      ko: (
        <>
          <strong>마지막 결정은 앱이 합니다.</strong> 앱의 <code>option.ts</code>는 모든 lib 다음에 읽히므로 앱의 선택이
          이깁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Defaults follow the database mode.</strong> The database stays SQLite in <code>multiple</code> mode
          and becomes Postgres in <code>cluster</code> mode. Both modes move cache and websocket to Redis, and queue to
          BullMQ.
        </>
      ),
      ko: (
        <>
          <strong>기본 구현은 database mode를 따릅니다.</strong> database는 <code>multiple</code> 모드에서도 SQLite이고,{" "}
          <code>cluster</code> 모드에서는 Postgres로 바뀝니다. 두 모드 모두 cache와 websocket은 Redis, queue는 BullMQ를
          씁니다.
        </>
      ),
    }),
  ];

  const useNotes = [
    l.trans({
      en: (
        <>
          <strong>The field name is the key.</strong> <code>mailApi: use&lt;MailApi | null&gt;()</code> reads what was
          registered as <code>mailApi</code>; the type argument does not choose it.
        </>
      ),
      ko: (
        <>
          <strong>필드 이름이 곧 key입니다.</strong> <code>mailApi: use&lt;MailApi | null&gt;()</code>는{" "}
          <code>mailApi</code>로 등록된 값을 읽습니다. 타입 인자로는 고를 수 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Each key is registered once.</strong> An app mounting <code>libs/util</code> already has{" "}
          <code>storageApi</code>, <code>emailApi</code> and <code>host</code>, so a second registration of those is an
          error.
        </>
      ),
      ko: (
        <>
          <strong>key는 한 번만 등록합니다.</strong> <code>libs/util</code>을 쓰는 앱에는 이미 <code>storageApi</code>,{" "}
          <code>emailApi</code>, <code>host</code>가 있으므로, 같은 key를 또 등록하면 오류입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>A value may be a Promise.</strong> It is awaited before any service or adaptor starts.
        </>
      ),
      ko: (
        <>
          <strong>값은 Promise여도 됩니다.</strong> service나 adaptor가 시작되기 전에 await됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Migrate when you touch it.</strong> Move a <code>use</code> singleton to <code>adapt()</code> only
          when you are already changing it.
        </>
      ),
      ko: (
        <>
          <strong>손댈 때 옮깁니다.</strong> <code>use</code> singleton은 어차피 수정하게 될 때에만 <code>adapt()</code>
          로 옮깁니다.
        </>
      ),
    }),
  ];

  const envColumns = [
    { key: "need", label: l.trans({ en: "What you need", ko: "필요한 값" }) },
    { key: "read", label: l.trans({ en: "Read it with", ko: "읽는 방법" }) },
  ];
  const envRows = [
    {
      need: l.trans({
        en: "A server env field: hostname, a feature flag, an API option",
        ko: "server env의 필드: hostname, feature flag, API 옵션",
      }),
      read: "`env((options: ModulesOptions) => options.hostname)`",
    },
    {
      need: l.trans({
        en: "App identity: appName, environment, operationMode",
        ko: "앱 정보: appName, environment, operationMode",
      }),
      read: "`env(() => getEnv().operationMode)`",
    },
    {
      need: l.trans({ en: "A container variable or a secret", ko: "컨테이너 환경 변수나 secret" }),
      read: "`env(() => process.env.PAYMENT_KEY)`",
    },
  ];

  const envNotes = [
    l.trans({
      en: (
        <>
          <strong>It runs once, at startup.</strong> The value is fixed for the life of the process, and the factory may
          be <code>async</code>.
        </>
      ),
      ko: (
        <>
          <strong>시작할 때 한 번 실행됩니다.</strong> 값은 프로세스가 끝날 때까지 고정되며, factory는{" "}
          <code>async</code>여도 됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Pass a factory.</strong> <code>env()</code> takes a function; there is no <code>env("KEY")</code>{" "}
          form.
        </>
      ),
      ko: (
        <>
          <strong>factory 함수를 넘깁니다.</strong> <code>env()</code>는 함수를 받으며, <code>env("KEY")</code> 같은
          형태는 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            Call <code>getEnv()</code> inside the factory.
          </strong>{" "}
          At module scope it throws during <code>akan build</code>, which has no app env to give it.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>getEnv()</code>는 factory 안에서 부릅니다.
          </strong>{" "}
          모듈 최상단에서 부르면 앱 환경값이 없는 <code>akan build</code> 도중에 오류가 납니다.
        </>
      ),
    }),
  ];

  const tipNotes = [
    l.trans({
      en: (
        <>
          <strong>Declare one client, not one per call.</strong> Do not create external clients inside every method;
          declare one <code>adapt()</code> class and <code>plug()</code> it.
        </>
      ),
      ko: (
        <>
          <strong>client는 한 번만 선언합니다.</strong> 외부 client를 메서드마다 만들지 말고, <code>adapt()</code>{" "}
          class로 한 번 선언해 <code>plug()</code>로 받습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>service()</code> for business, <code>plug()</code> for infrastructure.
          </strong>{" "}
          Business collaboration goes through services; replaceable infrastructure goes through adaptors.
        </>
      ),
      ko: (
        <>
          <strong>
            업무 협력은 <code>service()</code>, 인프라는 <code>plug()</code>.
          </strong>{" "}
          업무 흐름은 service끼리 잇고, 교체할 수 있는 인프라는 adaptor로 받습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Inject prepared clients, not raw credentials.</strong> Keep secrets in the server env or{" "}
          <code>process.env</code>, and resolve them inside a function:{" "}
          <code>process.env.X ?? options.x ?? generate(…)</code>, never at module scope.
        </>
      ),
      ko: (
        <>
          <strong>raw credential보다 준비된 client를 주입합니다.</strong> secret은 server env나 <code>process.env</code>
          에 두고, 모듈 최상단이 아니라 함수 안에서 <code>process.env.X ?? options.x ?? generate(…)</code> 순서로
          읽습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>adapt()</code> is for singletons only.
          </strong>{" "}
          A per-use value object stays a plain class you <code>new</code> at the call site.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>adapt()</code>는 singleton 전용입니다.
          </strong>{" "}
          쓸 때마다 새로 만드는 값 객체는 호출하는 곳에서 <code>new</code> 하는 평범한 class로 둡니다.
        </>
      ),
    }),
  ];

  const nextLinks = [
    {
      href: "/conventions/module/service#injection-types",
      title: l.trans({ en: "Injection Types", ko: "주입 종류" }),
      desc: l.trans({
        en: "Every injector with its naming rules, in the service convention.",
        ko: "service 컨벤션에서 주입기 전부와 이름 규칙을 봅니다.",
      }),
    },
    {
      href: "/conventions/applib/srvkit#adaptor-plug",
      title: l.trans({ en: "Adaptor And plug", ko: "Adaptor와 plug" }),
      desc: l.trans({
        en: "Where adaptors live in `srvkit/` and how they are shaped.",
        ko: "adaptor를 `srvkit/`의 어디에 어떤 모양으로 두는지 봅니다.",
      }),
    },
    {
      href: "/cheatsheet/performance/caching#service-memory",
      title: l.trans({ en: "Service Memory", ko: "Service memory" }),
      desc: l.trans({
        en: "`memory()` values that survive between calls.",
        ko: "호출 사이에 유지되는 `memory()` 값을 다룹니다.",
      }),
    },
    {
      href: "/cheatsheet/performance/realtime#flow",
      title: l.trans({ en: "Chat Flow", ko: "채팅 흐름" }),
      desc: l.trans({
        en: "A service that publishes through an injected `signal()`.",
        ko: "주입받은 `signal()`로 publish하는 service를 봅니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Dependency Injection", ko: "의존성 주입" })}>
        <Docs.Title>{l.trans({ en: "Dependency Injection", ko: "의존성 주입" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <>
                  A service lists what it needs in the builder of <code>serve()</code>, and Akan fills each field before
                  the service starts. Business code stays small, and an outside system can be swapped without touching
                  it.
                </>
              ),
              ko: (
                <>
                  service는 필요한 것을 <code>serve()</code>의 builder에 적어 두기만 합니다. Akan이 service가 시작되기
                  전에 그 필드를 채워 주므로, 비즈니스 코드는 작게 유지되고 외부 시스템은 코드를 건드리지 않고 바꿀 수
                  있습니다.
                </>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Which injector to use", ko: "어떤 주입기를 쓸까" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Reach for them in this order; the first that fits is the right one. The marks show where each works.",
              ko: "위에서부터 차례로 고르고, 먼저 맞는 것을 씁니다. 표시는 어느 builder에서 쓸 수 있는지를 뜻합니다.",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Injector", ko: "주입기" })}
            columns={builderColumns}
            groups={injectorGroups}
            markLabel={l.trans({ en: "Available", ko: "쓸 수 있음" })}
            emptyLabel={l.trans({ en: "Not available", ko: "쓸 수 없음" })}
          />
          <ul className={bulletList}>
            {overviewNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="service" title={l.trans({ en: "Inject Services", ko: "Service 주입" })}>
        <Docs.Title>{l.trans({ en: "Inject Services", ko: "Service 주입" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <>
                  When one service needs another service's business method, declare it with{" "}
                  <code>service&lt;T&gt;()</code>. It is clearer than importing the other service and constructing it
                  yourself:
                </>
              ),
              ko: (
                <>
                  한 service가 다른 service의 업무 메서드를 써야 하면 <code>service&lt;T&gt;()</code>로 선언합니다. 직접
                  import해서 생성하는 것보다 흐름이 분명합니다:
                </>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/article/article.service.ts"
          code={`import { serve } from "akanjs/service";

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
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {serviceNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <>
                  <strong>Two services cannot inject each other.</strong> If <code>ArticleService</code> injects{" "}
                  <code>SubscriptionService</code>, the reverse is a circular dependency. Move the shared step into one
                  of them.
                </>
              ),
              ko: (
                <>
                  <strong>두 service가 서로를 주입할 수는 없습니다.</strong> <code>ArticleService</code>가{" "}
                  <code>SubscriptionService</code>를 주입한다면, 그 반대는 순환 의존입니다. 겹치는 단계를 한쪽 service로
                  옮기세요.
                </>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="adaptor" title={l.trans({ en: "Adapt And Plug", ko: "adapt와 plug" })}>
        <Docs.Title>{l.trans({ en: "Adapt And Plug", ko: "adapt와 plug" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use an adaptor for a tool that has behavior of its own and may be replaced later. The service asks for the class or the role; it never builds the client.",
              ko: "자체 동작이 있고 나중에 교체될 수 있는 도구는 adaptor로 만듭니다. service는 class나 role을 요청할 뿐, client를 직접 만들지 않습니다.",
            })}
          </div>
          <Docs.SubSubTitle>
            {l.trans({ en: "1. Declare it in srvkit/", ko: "1. srvkit/에 선언하기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <>
                  Write the adaptor as an <code>adapt()</code> class under <code>srvkit/</code>. This one adds image
                  paths on top of whatever storage the app runs:
                </>
              ),
              ko: (
                <>
                  adaptor는 <code>srvkit/</code> 아래에 <code>adapt()</code> class로 작성합니다. 아래 예시는 앱이 쓰는
                  storage 위에 이미지 경로 규칙을 얹습니다:
                </>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/srvkit/imageStorage.ts"
          code={`import { getEnv } from "akanjs/base";
import { adapt, StorageAdaptorRole } from "akanjs/service";

export class ImageStorage extends adapt("imageStorage" as const, ({ env, plug }) => ({
  folder: env(() => \`images/\${getEnv().environment}\`),
  storage: plug(StorageAdaptorRole),
})) {
  async upload(localPath: string, filename: string) {
    const path = \`\${this.folder}/\${filename}\`;
    return await this.storage.uploadDataFromLocal({ path, localPath });
  }
}`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>
            {l.trans({ en: "2. Plug it into a service", ko: "2. service에 plug하기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <>
                  The service names the class with <code>plug()</code> and calls it like any field:
                </>
              ),
              ko: (
                <>
                  service는 <code>plug()</code>로 class를 지정하고, 다른 필드처럼 호출합니다:
                </>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/article/article.service.ts"
          code={`import { ImageStorage } from "@apps/koyo/srvkit";
import { serve } from "akanjs/service";

import * as db from "../db";

export class ArticleService extends serve(db.article, ({ plug }) => ({
  imageStorage: plug(ImageStorage),
})) {
  async setCover(articleId: string, localPath: string) {
    const filename = \`\${articleId}.webp\`;
    const coverUrl = await this.imageStorage.upload(localPath, filename);
    return await this.updateArticle(articleId, { coverUrl });
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {adaptorNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "3. Swap a built-in role", ko: "3. 기본 role 교체하기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <>
                  Framework infrastructure is plugged by role. <code>plug(StorageAdaptorRole)</code> gets whatever fills
                  that role, and these are the nine roles with their defaults:
                </>
              ),
              ko: (
                <>
                  프레임워크 인프라는 role로 plug합니다. <code>plug(StorageAdaptorRole)</code>은 그 role을 채운 구현을
                  받으며, role 아홉 개와 기본 구현은 다음과 같습니다:
                </>
              ),
            })}
          </div>
          <Docs.Table columns={roleColumns} rows={roleRows} stacked />
          <div>
            {l.trans({
              en: (
                <>
                  To replace one for the whole app, call <code>applyAdaptor</code> in <code>lib/option.ts</code>:
                </>
              ),
              ko: (
                <>
                  앱 전체에서 하나를 바꾸려면 <code>lib/option.ts</code>에서 <code>applyAdaptor</code>를 부릅니다:
                </>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/option.ts"
          code={`import { R2Storage } from "@apps/koyo/srvkit";
import { AkanOption } from "akanjs/server";
import { StorageAdaptorRole } from "akanjs/service";

export const option = new AkanOption<ModulesOptions>()
  .applyAdaptor(StorageAdaptorRole, R2Storage);`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {roleNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="env" title={l.trans({ en: "Read Environment", ko: "환경값 읽기" })}>
        <Docs.Title>{l.trans({ en: "Read Environment", ko: "환경값 읽기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <>
                  <code>env()</code> builds a value from runtime configuration when the service or adaptor starts. Use
                  it when code needs the app's identity, a hostname or a feature flag.
                </>
              ),
              ko: (
                <>
                  <code>env()</code>는 service나 adaptor가 시작될 때 런타임 설정으로 값을 만듭니다. 앱 정보, hostname,
                  feature flag가 필요한 코드에서 씁니다.
                </>
              ),
            })}
          </div>
          <Docs.Table columns={envColumns} rows={envRows} stacked />
          <Docs.SubSubTitle>
            {l.trans({ en: "Add a setting of your own", ko: "직접 설정값 추가하기" })}
          </Docs.SubSubTitle>
          <ol className="my-4 list-decimal space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <>
                    Declare the field on <code>ModulesOptions</code> in <code>lib/option.ts</code>.
                  </>
                ),
                ko: (
                  <>
                    <code>lib/option.ts</code>의 <code>ModulesOptions</code>에 필드를 선언합니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    Set it in each <code>env/env.server.&lt;environment&gt;.ts</code> that needs it.
                  </>
                ),
                ko: (
                  <>
                    값이 필요한 <code>env/env.server.&lt;environment&gt;.ts</code>마다 값을 적습니다.
                  </>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    Read it with <code>env()</code> in a service or an adaptor.
                  </>
                ),
                ko: (
                  <>
                    service나 adaptor에서 <code>env()</code>로 읽습니다.
                  </>
                ),
              })}
            </li>
          </ol>
          <div>
            {l.trans({
              en: "Steps 1 and 2 take a few lines each:",
              ko: "1단계와 2단계는 각각 몇 줄이면 됩니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/option.ts · apps/koyo/env/env.server.local.ts"
          code={`// lib/option.ts
export type ModulesOptions = LibOptions & {
  shareEnabled?: boolean;
};

// env/env.server.local.ts
export const env: ModulesOptions = {
  ...libEnv,
  shareEnabled: true,
};`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "Step 3 reads it next to the app's identity:",
              ko: "3단계에서는 앱 정보와 함께 읽습니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/koyo/lib/article/article.service.ts"
          code={`import { getEnv } from "akanjs/base";
import { serve } from "akanjs/service";

import * as db from "../db";
import type { ModulesOptions } from "../option";

export class ArticleService extends serve(db.article, ({ env }) => ({
  publicUrl: env((options: ModulesOptions) => {
    const isLocal = getEnv().operationMode === "local";
    return isLocal ? "http://localhost:8282" : \`https://\${options.hostname}\`;
  }),
  isShareEnabled: env((options: ModulesOptions) => !!options.shareEnabled),
})) {
  getShareUrl(articleId: string) {
    if (!this.isShareEnabled) return null;
    return \`\${this.publicUrl}/article/\${articleId}\`;
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            {envNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className={bulletList}>
            {tipNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Read next", ko: "더 읽을 곳" })}</Docs.SubSubTitle>
          <Docs.LinkGrid items={nextLinks} />
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
