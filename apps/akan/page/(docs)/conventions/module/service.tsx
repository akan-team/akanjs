import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, type IntroItem, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "도메인: model.service.ts | Akan.js" : "Domain: model.service.ts | Akan.js";
    const description =
      lang === "ko"
        ? "serve()가 건네주는 것과 생성되는 메서드, 메서드 하나의 생김새."
        : "What serve() hands you, the methods it generates, and how one method reads.";
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

    const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

    const ownerColumns = [
      { key: "document", label: "document", code: true, caption: "*.document.ts" },
      { key: "service", label: "service", code: true, caption: "*.service.ts" },
      { key: "signal", label: "signal", code: true, caption: "*.signal.ts" },
    ];
    const onDocument = { document: true, service: false, signal: false };
    const onService = { document: false, service: true, signal: false };
    const onSignal = { document: false, service: false, signal: true };

    const ownerGroups = [
      {
        label: l.trans({ en: "Changing one document", ko: "문서 하나 바꾸기" }),
        rows: [
          {
            name: <span className="font-sans">{l.trans({ en: "state change", ko: "상태 변경" })}</span>,
            desc: l.trans({
              en: "A chain method such as `story.approve()` validates, changes the document and returns `this`.",
              ko: "`story.approve()` 같은 chain method가 검증하고, document를 바꾸고, `this`를 반환합니다.",
            }),
            marks: onDocument,
          },
          {
            name: <span className="font-sans">{l.trans({ en: "state precondition", ko: "상태 전제 조건" })}</span>,
            desc: l.trans({
              en: "The chain method throws when the document is in the wrong state for the change.",
              ko: "document가 그 변경을 할 수 없는 상태면 chain method가 에러를 던집니다.",
            }),
            marks: onDocument,
          },
        ],
      },
      {
        label: l.trans({ en: "Running a business action", ko: "비즈니스 동작 실행" }),
        rows: [
          {
            name: (
              <span className="font-sans">
                {l.trans({ en: "multi-document workflow", ko: "여러 문서에 걸친 흐름" })}
              </span>
            ),
            desc: l.trans({
              en: "Load the documents, call their chain methods, save, then notify.",
              ko: "document를 불러오고, chain method를 부르고, 저장한 뒤 알립니다.",
            }),
            marks: onService,
          },
          {
            name: <span className="font-sans">{l.trans({ en: "cross-document rule", ko: "문서 간 규칙" })}</span>,
            desc: l.trans({
              en: "A rule that compares several documents throws its `Err` here.",
              ko: "여러 document를 비교하는 규칙은 여기서 `Err`를 던집니다.",
            }),
            marks: onService,
          },
          {
            name: (
              <span className="font-sans">
                {l.trans({ en: "external API · job · server-only code", ko: "외부 API · 작업 · 서버 전용 코드" })}
              </span>
            ),
            desc: l.trans({
              en: "Reached through injected adapters, signals and env values.",
              ko: "주입받은 adapter, signal, env 값으로 다룹니다.",
            }),
            marks: onService,
          },
        ],
      },
      {
        label: l.trans({ en: "Exposing it", ko: "밖으로 공개하기" }),
        rows: [
          {
            name: <span className="font-sans">{l.trans({ en: "who may call it", ko: "호출 권한" })}</span>,
            desc: l.trans({
              en: "The endpoint's guards decide access.",
              ko: "endpoint의 guard가 접근을 결정합니다.",
            }),
            marks: onSignal,
          },
          {
            name: <span className="font-sans">{l.trans({ en: "the endpoint", ko: "endpoint" })}</span>,
            desc: l.trans({
              en: "Its `exec` calls one service method and nothing more.",
              ko: "`exec`는 service method 하나만 호출합니다.",
            }),
            marks: onSignal,
          },
        ],
      },
    ];

    const termRows: IntroItem[] = [
      {
        name: "database service",
        desc: l.trans({
          en: "A service bound to one model with `serve(db.<model>, …)`. It gets that model's methods.",
          ko: "`serve(db.<model>, …)`로 모델 하나에 묶인 service입니다. 그 모델의 method를 받습니다.",
        }),
      },
      {
        name: "plain service",
        desc: l.trans({
          en: 'A service with no model, made with `serve("<name>" as const, …)`.',
          ko: '`serve("<name>" as const, …)`로 만드는, 모델이 없는 service입니다.',
        }),
      },
      {
        name: "injection builder",
        desc: l.trans({
          en: "The function you pass to `serve()`. Each key it returns becomes a property on `this`.",
          ko: "`serve()`에 넘기는 함수입니다. 이 함수가 반환한 key마다 `this`의 property가 됩니다.",
        }),
      },
      {
        name: "chain method",
        desc: l.trans({
          en: "A document method that changes one document and returns `this`, e.g. `story.approve()`.",
          ko: "document 하나를 바꾸고 `this`를 반환하는 document method입니다. 예: `story.approve()`.",
        }),
      },
      {
        name: "hook",
        desc: l.trans({
          en: "A method such as `_preCreate` that runs around `create<Model>`, `update<Model>` or `remove<Model>`.",
          ko: "`_preCreate`처럼 `create<Model>`, `update<Model>`, `remove<Model>` 앞뒤로 실행되는 method입니다.",
        }),
      },
    ];

    const runtimeColumns = [
      {
        key: "database",
        label: l.trans({ en: "Database", ko: "데이터베이스" }),
        caption: "serve(db.x, …)",
      },
      { key: "plain", label: l.trans({ en: "Plain", ko: "일반" }), caption: 'serve("x", …)' },
    ];
    const databaseOnly = { database: true, plain: false };
    const bothShapes = { database: true, plain: true };

    const runtimeGroups = [
      {
        label: l.trans({ en: "From the model", ko: "모델에서 오는 것" }),
        rows: [
          {
            name: "<model>Model",
            desc: l.trans({
              en: "The model adaptor, such as `this.storyModel`.",
              ko: "`this.storyModel` 같은 model adaptor.",
            }),
            marks: databaseOnly,
          },
          {
            name: "get<Model> … remove<Model>",
            desc: l.trans({
              en: "The six CRUD methods listed under Generated Methods.",
              ko: "자동 생성 메서드에 정리된 CRUD method 여섯 개.",
            }),
            marks: databaseOnly,
          },
          {
            name: "list<Query> … updateOne<Query>",
            desc: l.trans({
              en: "Fifteen methods for each filter in the document.",
              ko: "document의 filter마다 method 열다섯 개.",
            }),
            marks: databaseOnly,
          },
          {
            name: "_preCreate … _postRemove",
            desc: l.trans({
              en: "Hooks around create, update and remove.",
              ko: "create, update, remove 앞뒤의 hook.",
            }),
            marks: databaseOnly,
          },
        ],
      },
      {
        label: l.trans({ en: "On every service", ko: "모든 service에" }),
        rows: [
          {
            name: "logger",
            desc: l.trans({
              en: "A Logger named after the class, such as `StoryService`.",
              ko: "`StoryService`처럼 class 이름을 단 Logger.",
            }),
            marks: bothShapes,
          },
          {
            name: "onInit · onDestroy",
            desc: l.trans({ en: "Run once at boot and once at shutdown.", ko: "부팅 때 한 번, 종료 때 한 번 실행." }),
            marks: bothShapes,
          },
          {
            name: <span className="font-sans">{l.trans({ en: "injected properties", ko: "주입된 property" })}</span>,
            desc: l.trans({
              en: "Every key your injection builder returns.",
              ko: "injection builder가 반환한 모든 key.",
            }),
            marks: bothShapes,
          },
          {
            name: "...extendServices",
            desc: l.trans({
              en: "Service classes passed after the builder, mixed in.",
              ko: "builder 뒤에 넘긴 service class를 섞어 넣은 것.",
            }),
            marks: bothShapes,
          },
        ],
      },
    ];

    const serveArgs = [
      {
        key: "db.<model>",
        type: "DatabaseModel",
        desc: l.trans({
          en: "First argument for a database service.",
          ko: "database service의 첫 번째 인자입니다.",
        }),
        example: "serve(db.story, ({ service }) => ({ actionLogService: service<srv.ActionLogService>() }))",
      },
      {
        key: '"<name>" as const',
        type: "string",
        desc: l.trans({
          en: "First argument for a plain service.",
          ko: "plain service의 첫 번째 인자입니다.",
        }),
        example: 'serve("base" as const, ({ signal }) => ({ baseSignal: signal<Base>() }))',
      },
      {
        key: "option",
        type: "{ enabled?, serverMode? }",
        tags: ["optional"],
        desc: l.trans({
          en: "Goes second when present. See Service Option below.",
          ko: "쓸 때는 두 번째 자리에 둡니다. 아래 Service 옵션을 보세요.",
        }),
        example: `serve("myapp" as const, { serverMode: "batch" }, ({ service }) => ({
  summaryService: service<srv.SummaryService>(),
}))`,
      },
      {
        key: "injectBuilder",
        type: "({ service, use, … }) => ({ … })",
        desc: l.trans({
          en: "Returns the properties to inject. See Injection Builder.",
          ko: "주입할 property를 반환합니다. 주입 빌더 섹션을 보세요.",
        }),
      },
      {
        key: "...extendServices",
        type: "ServiceCls[]",
        tags: ["optional"],
        desc: l.trans({
          en: "Mixes in their methods, injections and hooks. See Service Extension.",
          ko: "그 service들의 method, 주입, hook을 섞어 넣습니다. Service 확장 섹션을 보세요.",
        }),
        example: "serve(db.user, ({ use }) => ({ githubApp: use<GithubApp>() }), ...user.services)",
      },
    ];

    const serviceOptions = [
      {
        key: "enabled",
        type: "boolean | (() => boolean)",
        default: "true",
        desc: l.trans({
          en: "`false` leaves the service out. A function runs once, the first time it is read.",
          ko: "`false`면 service가 켜지지 않습니다. 함수를 주면 처음 읽힐 때 한 번만 실행됩니다.",
        }),
      },
      {
        key: "serverMode",
        type: '"batch" | "federation"',
        desc: l.trans({
          en: "On only where `SERVER_MODE` is that value or `all`. `enabled` wins when both are set.",
          ko: "`SERVER_MODE`가 그 값이거나 `all`일 때만 켜집니다. 둘 다 쓰면 `enabled`가 우선합니다.",
        }),
      },
    ];

    const predefinedVariables: IntroItem[] = [
      {
        name: "<model>Model",
        desc: l.trans({
          en: "The model adaptor, injected automatically. Call the model's own methods and filters on it.",
          ko: "자동으로 주입되는 model adaptor입니다. 모델 자체의 method와 filter method를 여기서 부릅니다.",
        }),
        example: "const story = await this.storyModel.getStory(storyId);",
      },
      {
        name: "logger",
        desc: l.trans({
          en: "A Logger named after the service class.",
          ko: "service class 이름을 단 Logger입니다.",
        }),
        example: 'this.logger.info("service is ready");',
      },
    ];

    const crudMethods: IntroItem[] = [
      {
        name: "get<Model>(id)",
        desc: l.trans({
          en: "Loads one document by id. Throws when it does not exist.",
          ko: "id로 document 하나를 불러옵니다. 없으면 에러를 던집니다.",
        }),
        example: "const story = await this.getStory(storyId);",
      },
      {
        name: "load<Model>(id?)",
        desc: l.trans({
          en: "Loads one document by id. Returns null when it does not exist or the id is empty.",
          ko: "id로 document 하나를 불러옵니다. 없거나 id가 비어 있으면 null을 반환합니다.",
        }),
        example: "const story = await this.loadStory(storyId);",
      },
      {
        name: "load<Model>Many(ids)",
        desc: l.trans({
          en: "Loads several documents by id in one batch.",
          ko: "여러 id의 document를 한 번에 묶어 불러옵니다.",
        }),
        example: "const stories = await this.loadStoryMany(storyIds);",
      },
      {
        name: "create<Model>(data)",
        desc: l.trans({
          en: "Creates a document through `_preCreate` and `_postCreate`.",
          ko: "`_preCreate`와 `_postCreate`를 거쳐 document를 생성합니다.",
        }),
        example: "const story = await this.createStory(data);",
      },
      {
        name: "update<Model>(id, data)",
        desc: l.trans({
          en: "Applies a patch through `_preUpdate` and `_postUpdate`, then returns the document.",
          ko: "`_preUpdate`와 `_postUpdate`를 거쳐 patch를 적용하고, 수정된 document를 반환합니다.",
        }),
        example: 'const story = await this.updateStory(storyId, { status: "active" });',
      },
      {
        name: "remove<Model>(id)",
        desc: l.trans({
          en: "Soft-removes (sets `removedAt`) through the remove hooks, then runs cascades.",
          ko: "remove hook을 거쳐 soft remove(`removedAt` 설정)하고, 이어서 cascade를 실행합니다.",
        }),
        example: "await this.removeStory(storyId);",
      },
    ];

    const readMethods: IntroItem[] = [
      {
        name: "list<Query>(...args, option?)",
        desc: l.trans({ en: "Lists the matching documents.", ko: "일치하는 document 목록을 가져옵니다." }),
        example: "const stories = await this.listInRoot(root);",
      },
      {
        name: "listIds<Query>(...args, option?)",
        desc: l.trans({
          en: "Lists the ids of the matching documents.",
          ko: "일치하는 document의 id 목록을 가져옵니다.",
        }),
        example: "const ids = await this.listIdsInRoot(root);",
      },
      {
        name: "find<Query>(...args, option?)",
        desc: l.trans({
          en: "Finds one match, or returns null.",
          ko: "일치하는 document 하나를 찾고, 없으면 null을 반환합니다.",
        }),
        example: "const story = await this.findByTitle(title);",
      },
      {
        name: "findId<Query>(...args, option?)",
        desc: l.trans({
          en: "Finds the id of one match, or returns null.",
          ko: "일치하는 document 하나의 id를 찾고, 없으면 null을 반환합니다.",
        }),
        example: "const id = await this.findIdByTitle(title);",
      },
      {
        name: "pick<Query>(...args, option?)",
        desc: l.trans({
          en: "Finds one match. Throws when there is none.",
          ko: "일치하는 document 하나를 찾습니다. 없으면 에러를 던집니다.",
        }),
        example: "const story = await this.pickByTitle(title);",
      },
      {
        name: "pickId<Query>(...args, option?)",
        desc: l.trans({
          en: "Finds the id of one match. Throws when there is none.",
          ko: "일치하는 document 하나의 id를 찾습니다. 없으면 에러를 던집니다.",
        }),
        example: "const id = await this.pickIdByTitle(title);",
      },
      {
        name: "exists<Query>(...args)",
        desc: l.trans({
          en: "Checks for a match. Returns the id of one match, or null.",
          ko: "일치하는 document가 있는지 확인합니다. 있으면 그 id를, 없으면 null을 반환합니다.",
        }),
        example: "const existingId = await this.existsByTitle(title);",
      },
      {
        name: "count<Query>(...args)",
        desc: l.trans({ en: "Counts the matching documents.", ko: "일치하는 document 수를 셉니다." }),
        example: "const count = await this.countInRoot(root);",
      },
      {
        name: "insight<Query>(...args)",
        desc: l.trans({
          en: "Computes the model's insight over the matching documents.",
          ko: "일치하는 document에 대해 모델의 insight(집계)를 계산합니다.",
        }),
        example: "const insight = await this.insightInRoot(root);",
      },
      {
        name: "query<Query>(...args)",
        desc: l.trans({
          en: "Returns the query descriptor itself, without running it.",
          ko: "query를 실행하지 않고 query descriptor 자체를 반환합니다.",
        }),
        example: "const query = this.queryInRoot(root);",
      },
    ];

    const writeMethods: IntroItem[] = [
      {
        name: "remove<Query>(...args)",
        desc: l.trans({
          en: "Soft-removes every match in one atomic update.",
          ko: "일치하는 document 전부를 원자적 업데이트 한 번으로 soft remove합니다.",
        }),
        example: "await this.removeInRoot(root);",
      },
      {
        name: "removeOne<Query>(...args)",
        desc: l.trans({
          en: "Soft-removes the newest match by `createdAt`. For at-most-one queries, not for queues.",
          ko: "`createdAt` 기준 가장 최근 document 하나를 soft remove합니다. 한 건짜리 query용이며 큐 소비용이 아닙니다.",
        }),
        example: "await this.removeOneInRoot(root);",
      },
      {
        name: "purge<Query>(...args)",
        desc: l.trans({
          en: "Deletes every match for good, removed rows too, and returns the count. An empty query is refused.",
          ko: "삭제된 document까지 일치하는 document 전부를 영구히 지우고 개수를 반환합니다. 빈 query는 거부합니다.",
        }),
        example: "await this.purgeInRoot(root);",
      },
      {
        name: "update<Query>(...args).set(patch)",
        desc: l.trans({
          en: "Updates every match atomically. The patch goes in `.set()`; the chain alone runs nothing.",
          ko: "일치하는 document 전부를 원자적으로 수정합니다. patch는 `.set()`에 넘기며, chain만으로는 실행되지 않습니다.",
        }),
        example: 'await this.updateInRoot(root).set({ status: "archived" });',
      },
      {
        name: "updateOne<Query>(...args).set(patch)",
        desc: l.trans({
          en: "Updates the newest match by `createdAt`. The result has counts, not which row changed.",
          ko: "`createdAt` 기준 가장 최근 document 하나를 수정합니다. 결과에는 개수만 있고 어느 행인지는 없습니다.",
        }),
        example: 'await this.updateOneInRoot(root).set({ status: "archived" });',
      },
    ];

    const injectionHelpers: IntroItem[] = [
      {
        name: "service<T>()",
        desc: l.trans({
          en: "Another service, a lib's included. The key must end in `Service`; the rest names the target.",
          ko: "다른 service이며 lib의 service도 됩니다. key는 `Service`로 끝나야 하고, 앞부분이 대상 이름입니다.",
        }),
        example: `actionLogService: service<srv.ActionLogService>(),
fileService: service<srv.shared.FileService>(),`,
      },
      {
        name: "use<T>()",
        desc: l.trans({
          en: "A value registered with `option.use()` in `lib/option.ts`. The key must match its name.",
          ko: "`lib/option.ts`에서 `option.use()`로 등록한 값입니다. key가 등록한 이름과 같아야 합니다.",
        }),
        example: "storageApi: use<StorageApi>(),",
      },
      {
        name: "signal<T>()",
        desc: l.trans({
          en: "A server signal, for queueing a background job or publishing an event. Key ends in `Signal`.",
          ko: "background job을 queue에 넣거나 event를 publish할 server signal입니다. key는 `Signal`로 끝납니다.",
        }),
        example: "dbBackupSignal: signal<sig.DbBackup>(),",
      },
      {
        name: "plug(Adaptor)",
        desc: l.trans({
          en: "An `adapt()` adapter. If an implementation was applied to that role, you get it instead.",
          ko: "`adapt()` adapter입니다. 그 role에 구현체가 적용되어 있으면 구현체가 들어옵니다.",
        }),
        example: "ipfsApi: plug(IpfsApi),",
      },
      {
        name: "env(factory)",
        desc: l.trans({
          en: 'A value built at boot from the server env or `process.env`. Pass a factory, not `env("KEY")`.',
          ko: '부팅 때 server env나 `process.env`에서 만든 값입니다. `env("KEY")`가 아니라 factory를 넘깁니다.',
        }),
        example: "dockerRegistry: env((options: ModulesOptions) => options.dockerRegistry),",
      },
      {
        name: "memory(ref, opts)",
        desc: l.trans({
          en: "State kept in the cache adaptor, or on the instance with `local: true`. See below.",
          ko: "cache adaptor에 두는 상태이며, `local: true`면 instance에 둡니다. 아래에서 자세히 봅니다.",
        }),
        example: "remoteMap: memory(Map, { of: String }),",
      },
      {
        name: "database()",
        desc: l.trans({
          en: "This service's own model. A database service already has it as `<model>Model`.",
          ko: "이 service의 모델입니다. database service에는 이미 `<model>Model`로 들어 있습니다.",
        }),
        example: "const story = await this.storyModel.getStory(storyId);",
      },
    ];

    const memoryOptions = [
      {
        key: "local",
        type: "boolean",
        default: "false",
        desc: l.trans({
          en: "Keep a plain writable value on this instance instead of in the cache; on a `Map`, a real `Map`.",
          ko: "cache 대신 이 instance에 쓰기 가능한 일반 값으로 둡니다. `Map`이면 진짜 `Map`입니다.",
        }),
      },
      {
        key: "default",
        type: "",
        desc: l.trans({
          en: "What a single value reads before its first `set()`, else `null`; a `local` one starts with it.",
          ko: "단일 값이 첫 `set()` 전에 읽는 값이며, 없으면 `null`입니다. `local` memory는 이 값으로 시작합니다.",
        }),
      },
      {
        key: "of",
        type: "",
        desc: l.trans({
          en: "The value type of a `Map` memory, a scalar or model class. Required when `ref` is `Map`.",
          ko: "`Map` memory의 값 타입으로, scalar나 model class입니다. `ref`가 `Map`이면 꼭 필요합니다.",
        }),
      },
      {
        key: "ttl",
        type: "number (ms)",
        desc: l.trans({
          en: "How long each write lives, unless that `set()` passes its own `{ expireAt }`.",
          ko: "쓴 값 하나하나가 살아 있는 시간입니다. `set()`이 `{ expireAt }`를 직접 주면 그 값이 우선합니다.",
        }),
      },
      {
        key: "get",
        type: "(stored) => value",
        desc: l.trans({
          en: "Maps the stored value (a Map's entry value) to what code reads. Give it with `set` or not at all.",
          ko: "저장된 값(Map이면 항목 값)을 코드가 읽는 모양으로 바꿉니다. `set`과 함께만 줍니다.",
        }),
      },
      {
        key: "set",
        type: "(value) => stored",
        desc: l.trans({
          en: "The inverse of `get`: turns what code writes back into the stored value.",
          ko: "`get`의 반대로, 코드가 쓰는 값을 저장할 값으로 되돌립니다.",
        }),
      },
    ];

    const memoryShapes: IntroItem[] = [
      {
        name: "memory(ref, { local: true })",
        desc: l.trans({
          en: "A plain value you read and assign directly.",
          ko: "바로 읽고 대입하는 일반 값입니다.",
        }),
        example: "this.localCounter += 1;",
      },
      {
        name: "memory(ref)",
        desc: l.trans({ en: "An object with three async methods.", ko: "async method 세 개를 가진 객체입니다." }),
        example: "get() · set(value, { expireAt }?) · delete()",
      },
      {
        name: "memory(Map, { of: ref })",
        desc: l.trans({ en: "An async key–value map.", ko: "async key-value map입니다." }),
        example: `get(key) · set(key, value) · delete(key) · clear()
getOrInsert(key, value) · getOrInsertComputed(key, fn)
keys() · entries() · forEach(fn)`,
      },
    ];

    const middlewareMethods: IntroItem[] = [
      {
        name: "_preCreate(data)",
        desc: l.trans({
          en: "Runs before `create<Model>`. Return the data to create; you may change it.",
          ko: "`create<Model>` 전에 실행됩니다. 생성할 data를 반환하며, 바꿔서 반환해도 됩니다.",
        }),
        example: "override async _preCreate(data) { return data; }",
      },
      {
        name: "_postCreate(doc)",
        desc: l.trans({
          en: "Runs after the document is created. Return the document.",
          ko: "document가 생성된 뒤 실행됩니다. document를 반환합니다.",
        }),
        example: "override async _postCreate(doc) { return doc; }",
      },
      {
        name: "_preUpdate(id, data)",
        desc: l.trans({
          en: "Runs before `update<Model>`. Return the patch to apply.",
          ko: "`update<Model>` 전에 실행됩니다. 적용할 patch를 반환합니다.",
        }),
        example: "override async _preUpdate(id, data) { return data; }",
      },
      {
        name: "_postUpdate(doc)",
        desc: l.trans({
          en: "Runs after the update. Return the document.",
          ko: "수정이 끝난 뒤 실행됩니다. document를 반환합니다.",
        }),
        example: "override async _postUpdate(doc) { return doc; }",
      },
      {
        name: "_preRemove(id)",
        desc: l.trans({
          en: "Runs before `remove<Model>`. Check or clean up here; throw to stop the removal.",
          ko: "`remove<Model>` 전에 실행됩니다. 여기서 확인하거나 정리하고, 에러를 던지면 삭제가 멈춥니다.",
        }),
        example: "override async _preRemove(id) { … }",
      },
      {
        name: "_postRemove(doc)",
        desc: l.trans({
          en: "Runs after the soft remove. Return the document.",
          ko: "soft remove가 끝난 뒤 실행됩니다. document를 반환합니다.",
        }),
        example: `override async _postRemove(file) {
  await this.storageApi.deleteData(file.url);
  return file;
}`,
      },
      {
        name: "cascade",
        desc: l.trans({
          en: "A cascade field removes its targets through their services, so their `_postRemove` runs too.",
          ko: "cascade field는 대상의 service를 거쳐 삭제하므로, 대상의 `_postRemove`도 함께 실행됩니다.",
        }),
        example: 'image: field(File, { cascade: "removeRef" }).optional()',
      },
      {
        name: "onInit()",
        desc: l.trans({
          en: "Runs once at boot, after this service's injections are filled in.",
          ko: "부팅 때 이 service의 주입이 채워진 뒤 한 번 실행됩니다.",
        }),
        example: 'override async onInit() { this.logger.info("service is ready"); }',
      },
      {
        name: "onDestroy()",
        desc: l.trans({
          en: "Runs once when the server shuts down.",
          ko: "서버가 종료될 때 한 번 실행됩니다.",
        }),
        example: 'override async onDestroy() { this.logger.info("service is closing"); }',
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="service-overview" title="model.service.ts">
          <Docs.Title>model.service.ts</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>{"<model>.service.ts"}</code> is where one business action runs from start to finish: load the
                    documents, change them, save, then tell whoever else needs to know.
                  </span>
                ),
                ko: (
                  <span>
                    <code>{"<model>.service.ts"}</code>는 비즈니스 동작 하나가 처음부터 끝까지 실행되는 곳입니다.
                    document를 불러와 바꾸고, 저장한 뒤, 알아야 할 곳에 알립니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: "Open it when an action needs more than one document, another service, a background job, an external API, or anything that must stay on the server.",
                ko: "동작에 document 여러 개, 다른 service, background job, 외부 API, 서버에만 있어야 하는 코드가 필요할 때 이 파일을 엽니다.",
              })}
            </div>
            <Docs.SubSubTitle>
              {l.trans({ en: "Which file owns the work", ko: "어느 파일이 맡는 일인가" })}
            </Docs.SubSubTitle>
            <Docs.Matrix
              type={l.trans({ en: "The work", ko: "할 일" })}
              columns={ownerColumns}
              groups={ownerGroups}
              markLabel={l.trans({ en: "Belongs here", ko: "여기에 둡니다" })}
              emptyLabel={l.trans({ en: "Not here", ko: "여기가 아닙니다" })}
            />
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="service-shapes" title={l.trans({ en: "Service Shapes", ko: "Service의 세 가지 형태" })}>
          <Docs.Title>{l.trans({ en: "Service Shapes", ko: "Service의 세 가지 형태" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Every service is a class that extends <code>serve(…)</code>. What you pass to it decides which of
                    three shapes the service takes:
                  </span>
                ),
                ko: (
                  <span>
                    모든 service는 <code>serve(…)</code>를 상속하는 class입니다. <code>serve()</code>에 무엇을
                    넘기느냐에 따라 세 가지 형태 중 하나가 됩니다:
                  </span>
                ),
              })}
            </div>
            <div className={cardGridRecipe({ cols: "three" }, "my-4")}>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "Database Service", ko: "데이터베이스 service" })}
                </div>
                <code className={chip}>serve(db.story, …)</code>
                <div className="mt-2 text-foreground/70 text-sm">
                  {l.trans({
                    en: (
                      <span>
                        Bound to one model. It gets <code>storyModel</code>, the CRUD methods, and fifteen methods per
                        filter.
                      </span>
                    ),
                    ko: (
                      <span>
                        모델 하나에 묶입니다. <code>storyModel</code>, CRUD method, filter마다 method 열다섯 개를
                        받습니다.
                      </span>
                    ),
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "Plain Service", ko: "일반(plain) service" })}
                </div>
                <code className={chip}>{'serve("base" as const, …)'}</code>
                <div className="mt-2 text-foreground/70 text-sm">
                  {l.trans({
                    en: "No model. For runtime coordination, scheduled work, shared server features, or app-level orchestration.",
                    ko: "모델이 없습니다. runtime 조정, 예약 작업, 공용 서버 기능, 앱 단위 오케스트레이션에 씁니다.",
                  })}
                </div>
              </div>
              <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">
                  {l.trans({ en: "Extended Service", ko: "확장 service" })}
                </div>
                <code className={chip}>serve(db.user, …, ...user.services)</code>
                <div className="mt-2 text-foreground/70 text-sm">
                  {l.trans({
                    en: "A database service that also mixes in a lib's service for the same model, then adds app-specific behaviour.",
                    ko: "같은 모델을 가진 lib의 service를 섞어 넣고, 그 위에 앱만의 동작을 더하는 database service입니다.",
                  })}
                </div>
              </div>
            </div>
            <div>
              {l.trans({
                en: "A database service, complete with its imports:",
                ko: "import까지 모두 갖춘 database service입니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/story/story.service.ts"
              code={`import { serve } from "akanjs/service";

import * as db from "../db";
import type * as srv from "../srv";

export class StoryService extends serve(db.story, ({ service }) => ({
  boardService: service<srv.BoardService>(),
  actionLogService: service<srv.ActionLogService>(),
})) {
  async approve(storyId: string) {
    const story = await this.storyModel.getStory(storyId);
    return await story.approve().save();
  }
}`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>db</code> is a value import, <code>srv</code> a type import.
                      </strong>{" "}
                      <code>serve()</code> needs the model at runtime; services are only named as types, so the runtime
                      import graph stays lazy.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>db</code>는 값으로, <code>srv</code>는 type으로 import합니다.
                      </strong>{" "}
                      <code>serve()</code>는 런타임에 모델이 필요하고, service는 type으로만 쓰므로 런타임 import
                      그래프가 가볍게 유지됩니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Injected keys become properties.</strong> <code>actionLogService</code> is read as{" "}
                      <code>this.actionLogService</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>주입한 key는 property가 됩니다.</strong> <code>actionLogService</code>는{" "}
                      <code>this.actionLogService</code>로 읽습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Methods stay short.</strong> Load, call a chain method, then{" "}
                      <code>return await ….save()</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>method는 짧게 둡니다.</strong> 불러오고, chain method를 부르고,{" "}
                      <code>return await ….save()</code>로 끝냅니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <div>
              {l.trans({
                en: (
                  <span>
                    A plain service has no model. The framework's own <code>BaseService</code> is one:
                  </span>
                ),
                ko: (
                  <span>
                    plain service에는 모델이 없습니다. framework의 <code>BaseService</code>가 그 예입니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="pkgs/akanjs/service/base.service.ts"
              code={`export class BaseService extends serve("base" as const, ({ env, signal }) => ({
  onCleanup: env(({ onCleanup }: { onCleanup?: () => Promise<void> }) => onCleanup),
  baseSignal: signal<Base>(),
})) {
  publishPing() {
    this.baseSignal.pubsubPing("ping");
  }
}`}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="serve-runtime" title={l.trans({ en: "What serve() Gives You", ko: "serve()가 주는 것" })}>
          <Docs.Title>{l.trans({ en: "What serve() Gives You", ko: "serve()가 주는 것" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>serve()</code> returns a class for you to extend. What that class already carries depends on
                    the first argument:
                  </span>
                ),
                ko: (
                  <span>
                    <code>serve()</code>는 상속할 class를 돌려줍니다. 그 class에 무엇이 이미 들어 있는지는 첫 번째
                    인자에 따라 다릅니다:
                  </span>
                ),
              })}
            </div>
            <Docs.Matrix
              type={l.trans({ en: "What you get", ko: "받는 것" })}
              columns={runtimeColumns}
              groups={runtimeGroups}
              markLabel={l.trans({ en: "Included", ko: "들어 있음" })}
              emptyLabel={l.trans({ en: "Not included", ko: "없음" })}
            />
            <Docs.SubSubTitle>{l.trans({ en: "Arguments", ko: "인자" })}</Docs.SubSubTitle>
            <Docs.OptionTable items={serveArgs} />
            <Docs.SubSubTitle>{l.trans({ en: "Service Option", ko: "Service 옵션" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    The option decides which processes run the service. A <code>batch</code> process runs background
                    work and takes no traffic; a <code>federation</code> process serves traffic. The default single
                    process runs as <code>all</code>, so both are on there.
                  </span>
                ),
                ko: (
                  <span>
                    이 옵션은 어느 프로세스에서 service를 켤지 정합니다. <code>batch</code> 프로세스는 트래픽 없이
                    백그라운드 작업을 돌리고, <code>federation</code> 프로세스는 트래픽을 받습니다. 기본 단일 프로세스는{" "}
                    <code>all</code>로 돌기 때문에 거기서는 둘 다 켜집니다.
                  </span>
                ),
              })}
            </div>
            <Docs.OptionTable items={serviceOptions} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="generated-methods" title={l.trans({ en: "Generated Methods", ko: "자동 생성 메서드" })}>
          <Docs.Title>{l.trans({ en: "Generated Methods", ko: "자동 생성 메서드" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    A database service gets these without writing them. Their names follow the model name and the
                    filters declared in <code>{"<model>.document.ts"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    database service는 아래 method를 직접 쓰지 않아도 받습니다. 이름은 모델 이름과{" "}
                    <code>{"<model>.document.ts"}</code>에 선언한 filter를 따릅니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubTitle>{l.trans({ en: "Predefined Properties", ko: "기본으로 붙는 속성" })}</Docs.SubTitle>
            <Docs.IntroTable type={l.trans({ en: "Property", ko: "속성" })} items={predefinedVariables} />

            <Docs.SubTitle>{l.trans({ en: "CRUD Methods", ko: "CRUD 메서드" })}</Docs.SubTitle>
            <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={crudMethods} />

            <Docs.SubTitle>{l.trans({ en: "Filter Methods", ko: "Filter 메서드" })}</Docs.SubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    Every filter in the document generates fifteen methods. <code>{"<Query>"}</code> is the filter's key
                    with a capital first letter: filter <code>inRoot</code> gives <code>listInRoot</code>.
                  </span>
                ),
                ko: (
                  <span>
                    document의 filter 하나마다 method 열다섯 개가 생깁니다. <code>{"<Query>"}</code>는 filter key의 첫
                    글자를 대문자로 바꾼 것입니다. filter <code>inRoot</code>는 <code>listInRoot</code>가 됩니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>{l.trans({ en: "Reads", ko: "읽기" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={readMethods} />
            <div>
              {l.trans({
                en: (
                  <span>
                    <strong>The trailing option.</strong> <code>list</code> and <code>listIds</code> take{" "}
                    <code>{"{ sort, skip, limit, sample, select }"}</code>; <code>find</code>, <code>findId</code>,{" "}
                    <code>pick</code> and <code>pickId</code> take the same without <code>limit</code>. The rest take
                    none.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>마지막 option 인자.</strong> <code>list</code>와 <code>listIds</code>는{" "}
                    <code>{"{ sort, skip, limit, sample, select }"}</code>를 받고, <code>find</code>,{" "}
                    <code>findId</code>, <code>pick</code>, <code>pickId</code>는 여기서 <code>limit</code>만 빼고
                    받습니다. 나머지는 option을 받지 않습니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>{l.trans({ en: "Query-level writes", ko: "쿼리 단위 쓰기" })}</Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={writeMethods} />
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>Query-level writes skip hooks and cascades.</strong> Each goes straight to the database, so
                    no <code>_postRemove</code> runs and no <code>cascade</code> follows. When a model has either,
                    remove its documents one at a time with <code>{"remove<Model>(id)"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>쿼리 단위 쓰기는 hook과 cascade를 건너뜁니다.</strong> 데이터베이스에 바로 가므로{" "}
                    <code>_postRemove</code>도 돌지 않고 <code>cascade</code>도 이어지지 않습니다. 둘 중 하나라도 있는
                    모델은 <code>{"remove<Model>(id)"}</code>로 document를 하나씩 삭제하세요.
                  </span>
                ),
              })}
            </Docs.Alert>
            <Docs.SubSubTitle>{l.trans({ en: "Full-text search", ko: "전문 검색" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    Full-text search is not a method of its own. A filter whose query calls <code>q.search()</code>{" "}
                    generates the same fifteen methods every other filter does:
                  </span>
                ),
                ko: (
                  <span>
                    전문 검색은 별도의 method가 아닙니다. query에서 <code>q.search()</code>를 호출하는 filter도 다른
                    filter와 똑같이 method 열다섯 개를 만듭니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/story/"
              code={`// story.document.ts
export class StoryFilter extends from(cnst.Story, (filter) => ({
  query: {
    bySearch: filter()
      .arg("text", String)
      .query((text, q) => q.search(text, { prefix: true })),
  },
  sort: {},
})) {}

// story.service.ts
const stories = await this.listBySearch(text, { sort: "relevance" });
const count = await this.countBySearch(text);`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>{'sort: "relevance"'}</code>
                      </strong>{" "}
                      orders the results by match score, best first.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>{'sort: "relevance"'}</code>
                      </strong>
                      는 일치 점수가 높은 순서로 정렬합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Blank text matches nothing.</strong> An empty or whitespace-only search returns no rows,
                      not every row.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>빈 검색어는 아무것도 찾지 않습니다.</strong> 비어 있거나 공백뿐인 검색은 전체가 아니라 빈
                      결과를 돌려줍니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="service-extension" title={l.trans({ en: "Service Extension", ko: "Service 확장" })}>
          <Docs.Title>{l.trans({ en: "Service Extension", ko: "Service 확장" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    When an app declares a module with the same name as a lib module, such as <code>user</code> from{" "}
                    <code>libs/shared</code>, the app's module replaces the lib's. Spread <code>...user.services</code>{" "}
                    into <code>serve()</code> to keep the lib's behaviour and add your own on top.
                  </span>
                ),
                ko: (
                  <span>
                    앱이 lib 모듈과 같은 이름의 모듈을 선언하면(예: <code>libs/shared</code>의 <code>user</code>) 앱의
                    모듈이 lib의 모듈을 대신합니다. <code>serve()</code>에 <code>...user.services</code>를 펼쳐 넣으면
                    lib의 동작을 그대로 두고 그 위에 앱의 동작을 더할 수 있습니다.
                  </span>
                ),
              })}
            </div>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>lib/__lib/lib.service.ts</code> exports one such entry for each model the app shares with a
                    lib:
                  </span>
                ),
                ko: (
                  <span>
                    <code>lib/__lib/lib.service.ts</code>는 앱이 lib과 공유하는 모델마다 이런 항목을 하나씩
                    export합니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/user/user.service.ts"
              code={`import type { GithubApp } from "@libs/util/srvkit";
import { serve } from "akanjs/service";

import { user } from "../__lib/lib.service";
import * as db from "../db";

export class UserService extends serve(
  db.user,
  ({ use }) => ({
    githubApp: use<GithubApp>(),
  }),
  ...user.services,
) {
  async authCallback(code: string, userId: string) {
    const { accessToken } = await this.githubApp.getAccessToken(code);
    const user = await this.getUser(userId);
    return await user.set({ githubInfo: { accessToken } }).save();
  }
}`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The lib's methods come along.</strong> Everything the lib's <code>UserService</code>{" "}
                      defines is callable on <code>this</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>lib의 method가 함께 옵니다.</strong> lib의 <code>UserService</code>가 정의한 것은 모두{" "}
                      <code>this</code>에서 부를 수 있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Hooks stack instead of overriding.</strong> The lib's <code>_preCreate</code> runs first,
                      then yours, each receiving the previous result. Both <code>onInit</code> hooks run too.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>hook은 덮어쓰지 않고 쌓입니다.</strong> lib의 <code>_preCreate</code>가 먼저, 그다음 앱의
                      것이 앞 결과를 받아 실행됩니다. <code>onInit</code>도 둘 다 실행됩니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Your injections win a name clash.</strong> A key you declare replaces the lib's key of the
                      same name.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>이름이 겹치면 앱의 주입이 이깁니다.</strong> 앱에서 선언한 key가 lib의 같은 이름 key를
                      대신합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Keep app-only integrations here.</strong> Shared behaviour stays in the lib; what only
                      this app needs, such as GitHub sign-in, goes in the app service.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>앱 전용 연동은 여기에 둡니다.</strong> 공용 동작은 lib에 두고, GitHub 로그인처럼 이 앱에만
                      필요한 것은 앱 service에 둡니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="injection-overview" title={l.trans({ en: "Injection Builder", ko: "주입 빌더" })}>
          <Docs.Title>{l.trans({ en: "Injection Builder", ko: "주입 빌더" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    The function you pass to <code>serve()</code> is the injection builder. It receives seven helpers (
                    <code>database</code>, <code>service</code>, <code>use</code>, <code>signal</code>,{" "}
                    <code>plug</code>, <code>env</code>, <code>memory</code>) and returns an object whose keys become
                    properties on <code>this</code>:
                  </span>
                ),
                ko: (
                  <span>
                    <code>serve()</code>에 넘기는 함수가 주입 빌더입니다. helper 일곱 개(<code>database</code>,{" "}
                    <code>service</code>, <code>use</code>, <code>signal</code>, <code>plug</code>, <code>env</code>,{" "}
                    <code>memory</code>)를 받아 객체를 반환하고, 그 key가 <code>this</code>의 property가 됩니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/example/example.service.ts"
              code={`import { PaymentApi } from "@apps/koyo/srvkit";
import type { EmailApi } from "@libs/util/srvkit";
import { Int } from "akanjs/base";
import { serve } from "akanjs/service";

import * as db from "../db";
import type { ModulesOptions } from "../option";
import type * as sig from "../sig";
import type * as srv from "../srv";

export class ExampleService extends serve(
  db.example,
  ({ service, use, signal, plug, env, memory }) => ({
    userService: service<srv.UserService>(),
    emailApi: use<EmailApi>(),
    exampleSignal: signal<sig.Example>(),
    paymentApi: plug(PaymentApi),
    hostname: env((options: ModulesOptions) => options.hostname),
    localCounter: memory(Int, { local: true, default: 0 }),
  }),
) {}`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Injected values are read-only.</strong> Only <code>{"memory(…, { local: true })"}</code>{" "}
                      stays writable.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>주입된 값은 읽기 전용입니다.</strong> <code>{"memory(…, { local: true })"}</code>만 쓸 수
                      있습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>The key name is part of the wiring.</strong> <code>service()</code> keys end in{" "}
                      <code>Service</code>, <code>signal()</code> keys end in <code>Signal</code>, and{" "}
                      <code>use()</code> keys match the name registered in <code>lib/option.ts</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>key 이름이 곧 연결 정보입니다.</strong> <code>service()</code>의 key는{" "}
                      <code>Service</code>
                      로, <code>signal()</code>의 key는 <code>Signal</code>로 끝나고, <code>use()</code>의 key는{" "}
                      <code>lib/option.ts</code>에 등록한 이름과 같아야 합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Reach for them in this order.</strong> <code>service()</code> for another module,{" "}
                      <code>plug()</code> for an adapter, <code>use()</code> only for a value registered in{" "}
                      <code>option.ts</code>, and <code>env()</code> for configuration.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>고르는 순서가 있습니다.</strong> 다른 모듈은 <code>service()</code>, adapter는{" "}
                      <code>plug()</code>, <code>option.ts</code>에 등록된 값만 <code>use()</code>, 설정은{" "}
                      <code>env()</code>로 받습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="injection-types" title={l.trans({ en: "Injection Types", ko: "주입 종류" })}>
          <Docs.Title>{l.trans({ en: "Injection Types", ko: "주입 종류" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Pick the helper by where the value comes from:",
                ko: "값이 어디에서 오는지를 보고 helper를 고릅니다:",
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Helper", ko: "helper" })} items={injectionHelpers} />

            <Docs.SubSubTitle>
              {l.trans({ en: "use() and plug() in real code", ko: "실제 코드의 use()와 plug()" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    The shared lib's file service reaches storage through <code>use()</code> and IPFS through{" "}
                    <code>plug()</code>:
                  </span>
                ),
                ko: (
                  <span>
                    shared lib의 file service는 storage를 <code>use()</code>로, IPFS를 <code>plug()</code>로 받습니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="libs/shared/lib/file/file.service.ts"
              code={`import { IpfsApi, type StorageApi } from "@libs/util/srvkit";
import { serve } from "akanjs/service";

import * as db from "../db";

export class FileService extends serve(db.file, ({ use, plug }) => ({
  storageApi: use<StorageApi>(),
  ipfsApi: plug(IpfsApi),
})) {
  override async _postRemove(file: db.File) {
    await this.storageApi.deleteData(file.url);
    return file;
  }
  async getJsonFromUri<T = unknown>(uri: string) {
    return (await (await fetch(this.ipfsApi.getHttpsUri(uri))).json()) as T;
  }
}`}
            />

            <Docs.SubSubTitle>{l.trans({ en: "env() feeding a hook", ko: "hook에서 쓰는 env()" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    The factory receives the app's server env, typed as <code>ModulesOptions</code>, and runs once at
                    boot:
                  </span>
                ),
                ko: (
                  <span>
                    factory는 <code>ModulesOptions</code> 타입의 앱 server env를 받아 부팅 때 한 번 실행됩니다:
                  </span>
                ),
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/devProject/devProject.service.ts"
              code={`export class DevProjectService extends serve(db.devProject, ({ service, env }) => ({
  userService: service<srv.UserService>(),
  dockerRegistry: env((options: ModulesOptions) => options.dockerRegistry),
})) {
  override async _preCreate(data: DataInputOf<db.DevProjectInput, db.DevProject>) {
    return { ...data, registry: this.dockerRegistry };
  }
}`}
            />

            <Docs.SubSubTitle>{l.trans({ en: "memory() in detail", ko: "memory() 자세히" })}</Docs.SubSubTitle>
            <div>
              {l.trans({
                en: (
                  <span>
                    <code>memory(ref, opts)</code> gives the service state that outlives one call. Without{" "}
                    <code>local</code>, it lives in the app's cache adaptor. Its options:
                  </span>
                ),
                ko: (
                  <span>
                    <code>memory(ref, opts)</code>는 호출이 끝나도 남아 있는 상태를 service에 둡니다. <code>local</code>
                    이 없으면 앱의 cache adaptor에 저장됩니다. option은 다음과 같습니다:
                  </span>
                ),
              })}
            </div>
            <Docs.OptionTable items={memoryOptions} />
            <div>
              {l.trans({
                en: (
                  <span>
                    What <code>this.x</code> turns out to be depends on how it was declared:
                  </span>
                ),
                ko: (
                  <span>
                    <code>this.x</code>가 어떤 모양이 되는지는 선언 방식에 따라 다릅니다:
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "Declared as", ko: "선언" })}
              descLabel={l.trans({ en: "What you get", ko: "받는 것" })}
              items={memoryShapes}
            />
            <div>
              {l.trans({
                en: "All three shapes side by side:",
                ko: "세 가지 모양을 한곳에 모으면 이렇습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/_runtime/runtime.service.ts"
              code={`export class RuntimeService extends serve("runtime" as const, ({ memory }) => ({
  localCounter: memory(Int, { local: true, default: 3 }),
  remoteValue: memory(String),
  remoteMap: memory(Map, { of: String }),
})) {
  async updateRemoteValue(value: string) {
    await this.remoteValue.set(value);
    return await this.remoteValue.get();
  }
}`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Store a model, not hand-made JSON.</strong>{" "}
                      <code>{"memory(Map, { of: cnst.OauthClient })"}</code> serializes through the constant; never
                      encode JSON into a <code>String</code> memory yourself.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>JSON을 직접 만들지 말고 모델을 저장하세요.</strong>{" "}
                      <code>{"memory(Map, { of: cnst.OauthClient })"}</code>는 constant를 거쳐 직렬화됩니다.{" "}
                      <code>String</code> memory에 JSON을 손으로 인코딩해 넣지 마세요.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>A memory belongs to the service or adaptor that declares it.</strong> Two services may
                      both declare <code>token</code>; each keeps its own value.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>memory는 선언한 service나 adaptor의 것입니다.</strong> 두 service가 모두{" "}
                      <code>token</code>을 선언해도 값은 각자 따로 가집니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        A <code>Map</code> read of a missing key is <code>undefined</code>.
                      </strong>{" "}
                      <code>default</code> applies to a single value only, so guard <code>get(key)</code> with{" "}
                      <code>??</code>. Map entries expire one by one, on SQLite and Redis alike.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>Map</code>에 없는 key를 읽으면 <code>undefined</code>입니다.
                      </strong>{" "}
                      <code>default</code>는 단일 값에만 적용되므로 <code>get(key)</code>는 <code>??</code>로 감쌉니다.
                      Map 항목은 SQLite든 Redis든 하나씩 따로 만료됩니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        <code>get</code> and <code>set</code> are not allowed with <code>local</code>.
                      </strong>{" "}
                      A local memory holds the value as it is.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        <code>local</code>에는 <code>get</code>과 <code>set</code>을 쓸 수 없습니다.
                      </strong>{" "}
                      local memory는 값을 그대로 들고 있습니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="business-flow" title={l.trans({ en: "Business Logic Flow", ko: "비즈니스 로직 흐름" })}>
          <Docs.Title>{l.trans({ en: "Business Logic Flow", ko: "비즈니스 로직 흐름" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "A service method should read like the business action it performs. It can load documents, call their chain methods, work with other services, write logs and queue signals, all in one place.",
                ko: "service method는 그 method가 수행하는 비즈니스 동작이 그대로 읽혀야 합니다. document를 불러오고, chain method를 부르고, 다른 service와 협력하고, log를 남기고, signal을 queue에 넣는 일을 한곳에서 합니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "A like is recorded through another service, then counted by the model:",
                ko: "좋아요는 다른 service로 기록한 뒤, 모델이 개수를 셉니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/story/story.service.ts"
              code={`export class StoryService extends serve(db.story, ({ service }) => ({
  actionLogService: service<srv.ActionLogService>(),
})) {
  async like(target: string, user: string) {
    const prev = await this.actionLogService.set({ type: "story", target, user, action: "like" }, 1);
    return await this.storyModel.like(target, prev);
  }
}`}
            />
            <div>
              {l.trans({
                en: "A backup moves through several steps, and the slow part runs later as a queued job:",
                ko: "백업은 여러 단계를 거치고, 오래 걸리는 부분은 queue에 넣은 job으로 나중에 실행됩니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/dbBackup/dbBackup.service.ts"
              code={`export class DbBackupService extends serve(db.dbBackup, ({ service, signal }) => ({
  clusterService: service<srv.ClusterService>(),
  fileService: service<srv.shared.FileService>(),
  dbBackupSignal: signal<sig.DbBackup>(),
})) {
  async queueArchiveDbBackup(dbBackupId: string) {
    const dbBackup = await this.dbBackupModel.getDbBackup(dbBackupId);
    await dbBackup.set({ status: "preparing" }).save();
    await this.dbBackupSignal.archiveDbBackup(dbBackupId);
    return dbBackup;
  }

  async archiveDbBackup(dbBackupId: string) {
    const dbBackup = await this.dbBackupModel.getDbBackup(dbBackupId);
    const cluster = await this.clusterService.getCluster(dbBackup.devApp);
    // archive, upload, clean up, then mark the backup active
    return await dbBackup.set({ status: "active" }).save();
  }
}`}
            />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Load, save, then notify.</strong> Load every document the action needs, save, and only
                      then call signals or other services.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>불러오고, 저장하고, 그다음 알립니다.</strong> 필요한 document를 모두 불러와 저장한 뒤에야
                      signal이나 다른 service를 부릅니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Write <code>return await</code> at the end.
                      </strong>{" "}
                      Keep the <code>await</code> even where a bare <code>return</code> would work.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        마지막은 <code>return await</code>로 씁니다.
                      </strong>{" "}
                      그냥 <code>return</code>해도 될 자리여도 <code>await</code>를 지우지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Mark fire-and-forget with <code>void</code>.
                      </strong>{" "}
                      When you deliberately do not wait for a call, write <code>void</code> in front of it so the
                      missing <code>await</code> reads as intended.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        기다리지 않는 호출에는 <code>void</code>를 붙입니다.
                      </strong>{" "}
                      일부러 기다리지 않는 호출 앞에 <code>void</code>를 쓰면 <code>await</code>를 빠뜨린 게 아니라 뺀
                      것임이 드러납니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Return <code>null</code> or <code>false</code> for "not allowed" or "not found".
                      </strong>{" "}
                      The signal decides whether that is an error.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        "허용 안 됨"이나 "없음"은 <code>null</code> 또는 <code>false</code>로 반환합니다.
                      </strong>{" "}
                      그것을 에러로 볼지는 signal이 정합니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="lifecycle-hooks" title={l.trans({ en: "Lifecycle Hooks", ko: "라이프사이클 훅" })}>
          <Docs.Title>{l.trans({ en: "Lifecycle Hooks", ko: "라이프사이클 훅" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Hooks run around the service's <code>{"create<Model>"}</code>, <code>{"update<Model>"}</code> and{" "}
                    <code>{"remove<Model>"}</code>, and once at boot and shutdown. Use one when a rule must always run;
                    a one-off business action is a normal method.
                  </span>
                ),
                ko: (
                  <span>
                    hook은 service의 <code>{"create<Model>"}</code>, <code>{"update<Model>"}</code>,{" "}
                    <code>{"remove<Model>"}</code> 앞뒤와, 부팅과 종료 때 한 번씩 실행됩니다. 항상 지켜야 하는 규칙이면
                    hook을, 한 번의 비즈니스 동작이면 일반 method를 씁니다.
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Hook", ko: "hook" })} items={middlewareMethods} />
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Only the service's own writes run these hooks.</strong> <code>{"create<Model>"}</code>,{" "}
                      <code>{"update<Model>"}</code> and <code>{"remove<Model>"}</code> go through them; a chain's{" "}
                      <code>.save()</code> and the query-level writes do not.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>이 hook은 service 자신의 쓰기에서만 실행됩니다.</strong> <code>{"create<Model>"}</code>,{" "}
                      <code>{"update<Model>"}</code>, <code>{"remove<Model>"}</code>은 hook을 거치지만, chain의{" "}
                      <code>.save()</code>와 쿼리 단위 쓰기는 거치지 않습니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Removal runs in a fixed order:</strong> <code>_preRemove</code>, the soft remove,{" "}
                      <code>_postRemove</code>, then cascades.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>삭제는 정해진 순서로 진행됩니다.</strong> <code>_preRemove</code>, soft remove,{" "}
                      <code>_postRemove</code>, 그다음 cascade입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <div>
              {l.trans({
                en: "Here a backup refuses to start twice for the same branch, and a new backup queues its own archive job:",
                ko: "아래 예에서 백업은 같은 브랜치에서 두 번 시작되지 않고, 새 백업은 스스로 archive job을 queue에 넣습니다:",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/dbBackup/dbBackup.service.ts"
              code={`import type { DataInputOf } from "akanjs/document";
import { serve } from "akanjs/service";

import * as db from "../db";
import { Err } from "../dict";
import type * as sig from "../sig";

export class DbBackupService extends serve(db.dbBackup, ({ signal }) => ({
  dbBackupSignal: signal<sig.DbBackup>(),
})) {
  override async _preCreate(data: DataInputOf<db.DbBackupInput, db.DbBackup>) {
    if (await this.dbBackupModel.workingBackupExists(data.devApp, data.branch))
      throw new Err("dbBackup.error.workingBackupExists");
    return data;
  }

  override async _postCreate(doc: db.DbBackup) {
    await this.dbBackupSignal.archiveDbBackup(doc.id);
    return doc;
  }
}`}
            />
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Throw <code>Err</code>, never <code>new Error</code>.
                    </strong>{" "}
                    A bare <code>Error</code> reaches the caller as a generic "Internal Server Error". Throw an{" "}
                    <code>Err</code> keyed to the module's dictionary, and register the key there as an{" "}
                    <code>[en, ko]</code> pair:
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>new Error</code>가 아니라 <code>Err</code>를 던지세요.
                    </strong>{" "}
                    맨 <code>Error</code>는 호출한 쪽에 "Internal Server Error"로만 전달됩니다. module dictionary의
                    key를 가리키는 <code>Err</code>를 던지고, 그 key를 dictionary에 <code>[en, ko]</code> 쌍으로
                    등록하세요:
                  </span>
                ),
              })}
            </Docs.Alert>
            <Code.Snippet
              className="w-full"
              title="apps/koyo/lib/dbBackup/dbBackup.dictionary.ts"
              code={`.error({
  workingBackupExists: [
    "A backup is already running for this branch",
    "이 브랜치에서 이미 백업이 실행 중입니다.",
  ],
})`}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
          <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
          <Docs.Description>
            <ul className="my-4 list-disc space-y-2 pl-5">
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Workflows go in the service.</strong> Anything that coordinates several models, services,
                      signals or external APIs is a service method.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>흐름은 service에 둡니다.</strong> 여러 model, service, signal, 외부 API를 조합하는 일은
                      service method입니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>One-document changes go on the document.</strong> Write a chain method, then call{" "}
                      <code>.save()</code> from the service when the change must persist.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>document 하나의 변경은 document에 둡니다.</strong> chain method로 쓰고, 저장이 필요하면
                      service에서 <code>.save()</code>를 호출합니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Name injections by role.</strong> Service keys end in <code>Service</code>, signal keys in{" "}
                      <code>Signal</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>주입 key는 역할대로 이름 짓습니다.</strong> service는 <code>Service</code>로, signal은{" "}
                      <code>Signal</code>로 끝납니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>
                        Wrap external packages in <code>srvkit/</code>.
                      </strong>{" "}
                      Write new ones as <code>adapt()</code> classes and inject them with <code>plug()</code>;{" "}
                      <code>use()</code> is for values already registered in <code>lib/option.ts</code>.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>
                        외부 패키지는 <code>srvkit/</code>에서 감쌉니다.
                      </strong>{" "}
                      새로 만들 때는 <code>adapt()</code> class로 쓰고 <code>plug()</code>로 주입합니다.{" "}
                      <code>use()</code>는 <code>lib/option.ts</code>에 이미 등록된 값에 씁니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Extend a lib service instead of copying it.</strong> Spread{" "}
                      <code>{"...<model>.services"}</code> for shared behaviour and keep app-only integrations in the
                      app service.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>lib service는 복사하지 말고 확장합니다.</strong> 공용 동작은{" "}
                      <code>{"...<model>.services"}</code>로 가져오고, 앱 전용 연동은 앱 service에 둡니다.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>No circular dependencies.</strong> Two services cannot inject each other; move the shared
                      operation into a smaller service or a <code>srvkit/</code> helper.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>순환 의존은 안 됩니다.</strong> 두 service가 서로를 주입할 수 없습니다. 공유하는 동작을 더
                      작은 service나 <code>srvkit/</code> helper로 옮기세요.
                    </span>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <span>
                      <strong>Re-check ownership.</strong> Check that the caller owns the document even when a guard
                      already gated the call; the two are independent gates.
                    </span>
                  ),
                  ko: (
                    <span>
                      <strong>소유권은 한 번 더 확인합니다.</strong> guard가 이미 호출을 걸렀더라도 호출자가 document의
                      주인인지 service에서 다시 확인합니다. 둘은 서로 독립된 관문입니다.
                    </span>
                  ),
                })}
              </li>
            </ul>
            <Docs.LinkGrid
              items={[
                {
                  href: "/conventions/module/document",
                  title: "model.document.ts",
                  desc: l.trans({
                    en: "Write the chain methods and filters a service calls.",
                    ko: "service가 부르는 chain method와 filter를 씁니다.",
                  }),
                },
                {
                  href: "/conventions/module/signal",
                  title: "model.signal.ts",
                  desc: l.trans({
                    en: "Expose service methods as guarded endpoints.",
                    ko: "service method를 guard가 걸린 endpoint로 공개합니다.",
                  }),
                },
                {
                  href: "/conventions/applib/srvkit",
                  title: l.trans({ en: "Server Utils (srvkit/)", ko: "서버 유틸리티 (srvkit/)" }),
                  desc: l.trans({
                    en: "Write the adapters a service injects with plug().",
                    ko: "service가 plug()로 주입하는 adapter를 씁니다.",
                  }),
                },
                {
                  href: "/cheatsheet/observability/di",
                  title: l.trans({ en: "Dependency Injection", ko: "의존성 주입" }),
                  desc: l.trans({
                    en: "Recipes for service, plug, use and env.",
                    ko: "service, plug, use, env 사용 레시피입니다.",
                  }),
                },
              ]}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <DocsToc />
      </Scroll>
    );
  });
