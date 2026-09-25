import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const predefinedVariables: IntroItem[] = [
    {
      name: "<model>Model",
      desc: l.trans({
        en: "Database model adaptor automatically injected for database services.",
        ko: "database service에 자동으로 주입되는 database model adaptor입니다.",
      }),
      example: `const story = await this.storyModel.getStory(storyId);`,
    },
    {
      name: "__databaseModel",
      desc: l.trans({
        en: "Internal database model adaptor injected together with the named model property.",
        ko: "이름이 붙은 model property와 함께 주입되는 내부 database model adaptor입니다.",
      }),
      example: `// Usually use this.storyModel instead.`,
    },
    {
      name: "logger",
      desc: l.trans({
        en: "Built-in logger for service logs.",
        ko: "service log를 남기기 위한 built-in logger입니다.",
      }),
      example: `this.logger.info("service is ready");`,
    },
  ];

  const crudMethods: IntroItem[] = [
    {
      name: "get<Model>(id)",
      desc: l.trans({
        en: "Load one document by id. Throws when it cannot be found.",
        ko: "id로 document 하나를 불러옵니다. 없으면 error를 던집니다.",
      }),
      example: `const story = await this.getStory(storyId);`,
    },
    {
      name: "load<Model>(id?)",
      desc: l.trans({
        en: "Load one document by id. Returns null when it cannot be found.",
        ko: "id로 document 하나를 불러옵니다. 없으면 null을 반환합니다.",
      }),
      example: `const story = await this.loadStory(storyId);`,
    },
    {
      name: "load<Model>Many(ids)",
      desc: l.trans({
        en: "Batch load documents by ids.",
        ko: "id 배열로 document를 batch load합니다.",
      }),
      example: `const stories = await this.loadStoryMany(storyIds);`,
    },
    {
      name: "create<Model>(data)",
      desc: l.trans({
        en: "Create a document from input data.",
        ko: "input data로 document를 생성합니다.",
      }),
      example: `const story = await this.createStory(data);`,
    },
    {
      name: "update<Model>(id, data)",
      desc: l.trans({
        en: "Update a document and return the updated document.",
        ko: "document를 수정하고 수정된 document를 반환합니다.",
      }),
      example: `const story = await this.updateStory(storyId, { status: "active" });`,
    },
    {
      name: "remove<Model>(id)",
      desc: l.trans({
        en: "Remove or soft-remove a document through the generated database service flow.",
        ko: "generated database service 흐름으로 document를 삭제하거나 soft-remove합니다.",
      }),
      example: `await this.removeStory(storyId);`,
    },
    {
      name: "search<Model>(text, option?)",
      desc: l.trans({
        en: "Search documents and return docs with count.",
        ko: "document를 검색하고 docs와 count를 반환합니다.",
      }),
      example: `const { docs, count } = await this.searchStory("notice");`,
    },
    {
      name: "searchDocs<Model>(text, option?)",
      desc: l.trans({
        en: "Search documents and return docs only.",
        ko: "document를 검색하고 docs만 반환합니다.",
      }),
      example: `const stories = await this.searchDocsStory("notice");`,
    },
    {
      name: "searchCount<Model>(text)",
      desc: l.trans({
        en: "Count documents that match search text.",
        ko: "검색어와 일치하는 document 수를 반환합니다.",
      }),
      example: `const count = await this.searchCountStory("notice");`,
    },
  ];

  const queryMethods: IntroItem[] = [
    {
      name: "list<Query>(...args, option?)",
      desc: l.trans({
        en: "List documents matching a document filter.",
        ko: "document filter와 일치하는 목록을 조회합니다.",
      }),
      example: `const stories = await this.listInRoot(root);`,
    },
    {
      name: "listIds<Query>(...args, option?)",
      desc: l.trans({
        en: "List document ids matching a document filter.",
        ko: "document filter와 일치하는 id 목록을 조회합니다.",
      }),
      example: `const ids = await this.listIdsInRoot(root);`,
    },
    {
      name: "find<Query>(...args, option?)",
      desc: l.trans({
        en: "Find one matching document or return null.",
        ko: "일치하는 document 하나를 찾고 없으면 null을 반환합니다.",
      }),
      example: `const story = await this.findByTitle(title);`,
    },
    {
      name: "findId<Query>(...args, option?)",
      desc: l.trans({
        en: "Find one matching document id or return null.",
        ko: "일치하는 document id 하나를 찾고 없으면 null을 반환합니다.",
      }),
      example: `const id = await this.findIdByTitle(title);`,
    },
    {
      name: "pick<Query>(...args, option?)",
      desc: l.trans({
        en: "Find one matching document. Throws when missing.",
        ko: "일치하는 document 하나를 찾습니다. 없으면 error를 던집니다.",
      }),
      example: `const story = await this.pickByTitle(title);`,
    },
    {
      name: "pickId<Query>(...args, option?)",
      desc: l.trans({
        en: "Find one matching document id. Throws when missing.",
        ko: "일치하는 document id 하나를 찾습니다. 없으면 error를 던집니다.",
      }),
      example: `const id = await this.pickIdByTitle(title);`,
    },
    {
      name: "exists<Query>(...args)",
      desc: l.trans({
        en: "Check whether a matching document exists.",
        ko: "일치하는 document가 존재하는지 확인합니다.",
      }),
      example: `const exists = await this.existsByTitle(title);`,
    },
    {
      name: "count<Query>(...args)",
      desc: l.trans({ en: "Count matching documents.", ko: "일치하는 document 수를 반환합니다." }),
      example: `const count = await this.countInRoot(root);`,
    },
    {
      name: "insight<Query>(...args)",
      desc: l.trans({
        en: "Load aggregated insight for matching documents.",
        ko: "일치하는 document의 aggregated insight를 조회합니다.",
      }),
      example: `const insight = await this.insightInRoot(root);`,
    },
    {
      name: "query<Query>(...args)",
      desc: l.trans({
        en: "Return the raw query object for a document filter.",
        ko: "document filter의 raw query object를 반환합니다.",
      }),
      example: `const query = this.queryInRoot(root);`,
    },
  ];

  const middlewareMethods: IntroItem[] = [
    {
      name: "_preCreate(data)",
      desc: l.trans({
        en: "Runs before create. Return the input data to continue.",
        ko: "create 전에 실행됩니다. 계속 진행하려면 input data를 반환합니다.",
      }),
      example: `override async _preCreate(data) { return data; }`,
    },
    {
      name: "_postCreate(doc)",
      desc: l.trans({
        en: "Runs after create. Return the document to continue.",
        ko: "create 후에 실행됩니다. 계속 진행하려면 document를 반환합니다.",
      }),
      example: `override async _postCreate(doc) { return doc; }`,
    },
    {
      name: "_preUpdate(id, data)",
      desc: l.trans({
        en: "Runs before update. Return the update data to continue.",
        ko: "update 전에 실행됩니다. 계속 진행하려면 update data를 반환합니다.",
      }),
      example: `override async _preUpdate(id, data) { return data; }`,
    },
    {
      name: "_postUpdate(doc)",
      desc: l.trans({
        en: "Runs after update. Return the document to continue.",
        ko: "update 후에 실행됩니다. 계속 진행하려면 document를 반환합니다.",
      }),
      example: `override async _postUpdate(doc) { return doc; }`,
    },
    {
      name: "pre remove hook",
      desc: l.trans({
        en: "Runs before remove.",
        ko: "remove 전에 실행됩니다.",
      }),
      example: "override _preRemove to check or clean up before remove",
    },
    {
      name: "_postRemove(doc)",
      desc: l.trans({
        en: "Runs after remove. Return the document to continue.",
        ko: "remove 후에 실행됩니다. 계속 진행하려면 document를 반환합니다.",
      }),
      example: `override async _postRemove(doc) { return doc; }`,
    },
    {
      name: "cascade remove",
      desc: l.trans({
        en: "A relation field declared with cascade: \"remove\" removes its target through the target's service, so the target's _postRemove runs too.",
        ko: 'cascade: "remove"로 선언한 관계 field는 대상의 service를 거쳐 삭제하므로 대상의 _postRemove도 함께 실행됩니다.',
      }),
      example: `image: field(File, { cascade: "remove" }).optional()`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="service-overview" title="model.service.ts">
        <Docs.Title>model.service.ts</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A service file is where business workflows run. It coordinates documents, other services, signals, external APIs, environment options, and service lifecycle hooks.",
              ko: "service 파일은 비즈니스 workflow가 실행되는 곳입니다. document, 다른 service, signal, external API, environment option, service lifecycle hook을 조합합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Use service methods for operations that need more than one model, external runtime objects, background jobs, or server-only logic. Keep simple state changes on the document when possible.",
              ko: "하나 이상의 model, 외부 runtime 객체, background job, server-only logic이 필요한 작업은 service method에 둡니다. 단순 상태 변경은 가능하면 document에 둡니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="service-shapes" title={l.trans({ en: "Service Shapes", ko: "Service 형태" })}>
        <Docs.Title>{l.trans({ en: "Service Shapes", ko: "Service 형태" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: 'Most services are database services created with serve(db.model, ...). Some services are plain runtime services created with serve("name" as const, ...). Apps can also extend generated or library services with the rest argument.',
              ko: '대부분의 service는 serve(db.model, ...)로 만드는 database service입니다. 일부 service는 serve("name" as const, ...)로 만드는 plain runtime service입니다. 앱은 rest argument로 generated 또는 library service를 확장할 수도 있습니다.',
            })}
          </div>
        </Docs.Description>
        <div className="space-y-3">
          <Code.Snippet
            title="story.service.ts"
            code={`export class StoryService extends serve(db.story, ({ service }) => ({
  boardService: service<srv.BoardService>(),
  actionLogService: service<srv.ActionLogService>(),
})) {
  async approve(storyId: string) {
    const story = await this.storyModel.getStory(storyId);
    return await story.approve().save();
  }
}`}
          />
          <Code.Snippet
            title="base.service.ts"
            code={`export class BaseService extends serve("base" as const, ({ env, signal }) => ({
  onCleanup: env(({ onCleanup }: { onCleanup?: () => Promise<void> }) => onCleanup),
  baseSignal: signal<Base>(),
})) {
  publishPing() {
    this.baseSignal.pubsubPing("ping");
  }
}`}
          />
          <Code.Snippet
            title="user.service.ts"
            code={`export class UserService extends serve(
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
}`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="serve-runtime" title={l.trans({ en: "What serve() Gives You", ko: "serve()가 제공하는 것" })}>
        <Docs.Title>{l.trans({ en: "What serve() Gives You", ko: "serve()가 제공하는 것" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "serve() creates a typed service class. For database services, it also adds the model adaptor, generated document helpers, logger, lifecycle hooks, and injected properties.",
              ko: "serve()는 typed service class를 만듭니다. database service에서는 model adaptor, generated document helper, logger, lifecycle hook, injected property도 함께 붙습니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-3">
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">Database service</div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: "serve(db.story, builder) automatically injects storyModel and __databaseModel, then exposes generated helpers such as getStory, loadStory, createStory, and query-based document methods.",
                ko: "serve(db.story, builder)는 storyModel과 __databaseModel을 자동 주입하고 getStory, loadStory, createStory, query 기반 document method 같은 generated helper를 노출합니다.",
              })}
            </div>
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">Plain service</div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: 'serve("base" as const, builder) creates a service without a database model. Use it for runtime coordination, scheduled behavior, shared server features, or app-level orchestration.',
                ko: 'serve("base" as const, builder)는 database model 없이 service를 만듭니다. runtime coordination, scheduled behavior, shared server feature, app-level orchestration에 사용합니다.',
              })}
            </div>
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">Service option</div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: "The optional service option can disable a service or limit it to a server mode such as batch or federation.",
                ko: "선택적 service option으로 service를 비활성화하거나 batch, federation 같은 server mode에만 활성화할 수 있습니다.",
              })}
            </div>
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">Extension services</div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: "Extra service classes passed after the injection builder are mixed into the final service. Their injection maps and lifecycle hooks are merged first.",
                ko: "injection builder 뒤에 전달한 service class들은 최종 service에 mixin됩니다. 해당 service들의 injection map과 lifecycle hook이 먼저 병합됩니다.",
              })}
            </div>
          </div>
        </div>
        <Code.Snippet
          title="serve signatures"
          code={`serve(db.story, ({ service }) => ({ actionLogService: service<srv.ActionLogService>() }));

serve("myapp" as const, { serverMode: "batch" }, ({ service }) => ({
  summaryService: service<srv.SummaryService>(),
}));

serve(db.user, ({ use }) => ({ githubApp: use<GithubApp>() }), ...user.services);`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="generated-methods" title={l.trans({ en: "Generated Methods", ko: "Generated Method" })}>
        <Docs.Title>{l.trans({ en: "Generated Methods", ko: "Generated Method" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Database services receive model access and generated helper methods from the document definition. These names are based on the model name and document filters.",
              ko: "database service는 document 정의에서 model access와 generated helper method를 받습니다. method 이름은 model 이름과 document filter를 기준으로 생성됩니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.SubTitle>Predefined Variables</Docs.SubTitle>
        <Docs.IntroTable type="field" items={predefinedVariables} />
        <div className="mb-8" />

        <Docs.SubTitle>Predefined Methods (CRUD)</Docs.SubTitle>
        <div className="hidden overflow-x-auto lg:block">
          <table className="table w-full table-fixed">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[30%]" />
              <col className="w-[50%]" />
            </colgroup>
            <thead>
              <tr className="bg-base-200">
                <th className="text-base-content">method</th>
                <th className="text-base-content">{l.trans({ en: "Description", ko: "설명" })}</th>
                <th className="text-base-content">{l.trans({ en: "Example", ko: "예제" })}</th>
              </tr>
            </thead>
            <tbody>
              {crudMethods.map((item, index) => (
                <tr key={index}>
                  <td className="font-mono">{item.name}</td>
                  <td>{item.desc}</td>
                  <td>
                    <Code.Raw showLineNumbers={false} language="typescript" code={item.example as string} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-4 lg:hidden">
          {crudMethods.map((item, index) => (
            <div key={index} className="rounded-lg bg-base-100 p-3">
              <div className="mb-2">
                <span className="block font-bold font-mono text-primary">{item.name}</span>
              </div>
              <p className="mb-3 leading-relaxed">{item.desc}</p>
              <Code.Raw showLineNumbers={false} language="typescript" code={item.example as string} />
            </div>
          ))}
        </div>
        <div className="mb-8" />

        <Docs.SubTitle>Query Based Methods</Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "Query based methods are generated from filters declared in the document file.",
            ko: "Query based method는 document 파일에 선언한 filter를 기준으로 생성됩니다.",
          })}
        </Docs.Description>
        <Docs.IntroTable type="method" items={queryMethods} />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="service-extension" title={l.trans({ en: "Service Extension", ko: "Service 확장" })}>
        <Docs.Title>{l.trans({ en: "Service Extension", ko: "Service 확장" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Generated app domains can extend library service behavior with ...model.services. This keeps shared behavior in the generated/library layer while allowing the app service to add app-specific integrations.",
              ko: "generated app domain은 ...model.services로 library service 동작을 확장할 수 있습니다. shared behavior는 generated/library layer에 두고, app service는 app-specific integration을 추가합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="apps/myapp/lib/user/user.service.ts"
          code={`import { user } from "../__lib/lib.service";

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
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="injection-overview" title={l.trans({ en: "Injection Builder", ko: "Injection Builder" })}>
        <Docs.Title>{l.trans({ en: "Injection Builder", ko: "Injection Builder" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The second argument of serve() is an injection builder. It receives helpers for database, service, use, signal, plug, env, and memory. Each returned key becomes a readonly property on this service instance.",
              ko: "serve()의 두 번째 인자는 injection builder입니다. database, service, use, signal, plug, env, memory helper를 받습니다. 반환한 key는 service instance의 readonly property가 됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="service injection shape"
          code={`export class ExampleService extends serve(db.example, ({ service, use, signal, plug, env, memory }) => ({
  userService: service<srv.UserService>(),
  emailApi: use<EmailApi>(),
  exampleSignal: signal<sig.Example>(),
  paymentApi: plug(PaymentApi),
  apiHost: env((options: ModulesOptions) => options.apiHost),
  localCounter: memory(Int, { local: true, default: 0 }),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="injection-types" title={l.trans({ en: "Injection Types", ko: "Injection 타입" })}>
        <Docs.Title>{l.trans({ en: "Injection Types", ko: "Injection 타입" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Choose the injection helper based on where the value comes from. Service dependencies, global runtime objects, signals, adaptors, environment options, and cached memory each use a different helper.",
              ko: "값이 어디에서 오는지에 따라 injection helper를 선택합니다. service dependency, global runtime object, signal, adaptor, environment option, cached memory는 각각 다른 helper를 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-3">
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">database()</div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: "Database model injection is usually automatic for database services. Use the generated property such as storyModel instead of declaring database() by hand.",
                ko: "database model injection은 database service에서 보통 자동입니다. 직접 database()를 선언하기보다 storyModel 같은 generated property를 사용합니다.",
              })}
            </div>
            <Code.Snippet
              title="model access"
              code={`async approve(storyId: string) {
  const story = await this.storyModel.getStory(storyId);
  return await story.approve().save();
}`}
            />
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">service&lt;T&gt;()</div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: "Inject another Akan service. The property key must end with Service so the runtime can resolve the registered service.",
                ko: "다른 Akan service를 주입합니다. runtime이 등록된 service를 찾을 수 있도록 property key는 Service로 끝나야 합니다.",
              })}
            </div>
            <Code.Snippet
              title="story.service.ts"
              code={`export class StoryService extends serve(db.story, ({ service }) => ({
  actionLogService: service<srv.ActionLogService>(),
})) {
  async like(target: string, user: string) {
    const prev = await this.actionLogService.set({ type: "story", target, user, action: "like" }, 1);
    return await this.storyModel.like(target, prev);
  }
}`}
            />
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">use&lt;T&gt;()</div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: "Inject a globally registered runtime object such as an API client, host value, or server-only wrapper from srvkit.",
                ko: "API client, host 값, srvkit의 server-only wrapper처럼 전역 등록된 runtime object를 주입합니다.",
              })}
            </div>
            <Code.Snippet
              title="user.service.ts"
              code={`export class UserService extends serve(db.user, ({ use }) => ({
  githubApp: use<GithubApp>(),
})) {
  async refreshGithubToken(userId: string) {
    const user = await this.getUser(userId);
    return await this.githubApp.refreshAccessToken(user.githubInfo.refreshToken);
  }
}`}
            />
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">signal&lt;T&gt;()</div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: "Inject a server signal so the service can enqueue background jobs or publish server events.",
                ko: "service가 background job을 queue하거나 server event를 publish할 수 있도록 server signal을 주입합니다.",
              })}
            </div>
            <Code.Snippet
              title="dbBackup.service.ts"
              code={`export class DbBackupService extends serve(db.dbBackup, ({ service, signal }) => ({
  fileService: service<srv.shared.FileService>(),
  dbBackupSignal: signal<sig.DbBackup>(),
})) {
  async queueArchiveDbBackup(dbBackupId: string) {
    const dbBackup = await this.dbBackupModel.getDbBackup(dbBackupId);
    await dbBackup.set({ status: "preparing" }).save();
    await this.dbBackupSignal.archiveDbBackup(dbBackupId);
    return dbBackup;
  }
}`}
            />
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">plug(Adaptor)</div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: "Inject an adaptor instance. If an adaptor role is registered, the runtime resolves the role implementation before injection.",
                ko: "adaptor instance를 주입합니다. adaptor role이 등록되어 있으면 runtime이 해당 role implementation을 resolve한 뒤 주입합니다.",
              })}
            </div>
            <Code.Snippet
              title="file.service.ts"
              code={`export class FileService extends serve(db.file, ({ use, plug }) => ({
  storageApi: use<StorageApi>(),
  ipfsApi: plug(IpfsApi),
})) {
  async getJsonFromUri<T = any>(uri: string) {
    return (await fetch(this.ipfsApi.getHttpsUri(uri))).json() as T;
  }
}`}
            />
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">env(factory)</div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: 'Inject a value derived from module options or process env. The current pattern is a factory function, not env("KEY").',
                ko: 'module option 또는 process env에서 파생된 값을 주입합니다. 현재 패턴은 env("KEY")가 아니라 factory function입니다.',
              })}
            </div>
            <Code.Snippet
              title="devProject.service.ts"
              code={`export class DevProjectService extends serve(db.devProject, ({ service, env }) => ({
  userService: service<srv.UserService>(),
  dockerRegistry: env((options: ModulesOptions) => options.dockerRegistry),
})) {
  override async _preCreate(data: DataInputOf<db.DevProjectInput, db.DevProject>) {
    return { ...data, registry: this.dockerRegistry };
  }
}`}
            />
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">memory(modelRef, opts)</div>
            <div className="mt-2 text-base-content/70">
              {l.trans({
                en: "Inject memory owned by the service. local memory is writable on the instance; non-local memory uses the registered cache adaptor. Map memory requires an of option.",
                ko: "service가 소유하는 memory를 주입합니다. local memory는 instance에 writable 값으로 붙고, non-local memory는 등록된 cache adaptor를 사용합니다. Map memory는 of option이 필요합니다.",
              })}
            </div>
            <Code.Snippet
              title="memory examples"
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
          </div>
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="business-flow" title={l.trans({ en: "Business Logic Flow", ko: "비즈니스 로직 흐름" })}>
        <Docs.Title>{l.trans({ en: "Business Logic Flow", ko: "비즈니스 로직 흐름" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Service methods should read like business actions. They can load documents, call document methods, coordinate other services, update logs, and enqueue signals in one transaction-like workflow.",
              ko: "service method는 비즈니스 action처럼 읽혀야 합니다. document를 load하고, document method를 호출하고, 다른 service와 조합하고, log를 갱신하고, signal을 queue하는 흐름을 한 곳에서 표현할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-3">
          <Code.Snippet
            title="story.service.ts"
            code={`async like(target: string, user: string) {
  const prev = await this.actionLogService.set({ type: "story", target, user, action: "like" }, 1);
  return await this.storyModel.like(target, prev);
}`}
          />
          <Code.Snippet
            title="dbBackup.service.ts"
            code={`override async _postCreate(doc: db.DbBackup): Promise<db.DbBackup> {
  await this.dbBackupSignal.archiveDbBackup(doc.id);
  return doc;
}

async archiveDbBackup(dbBackupId: string) {
  const dbBackup = await this.dbBackupModel.getDbBackup(dbBackupId);
  const cluster = await this.clusterService.getCluster(dbBackup.devApp);
  // archive, upload, cleanup, and update dbBackup status
  return await dbBackup.set({ status: "active" }).save();
}`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="lifecycle-hooks" title={l.trans({ en: "Lifecycle Hooks", ko: "Lifecycle Hook" })}>
        <Docs.Title>{l.trans({ en: "Lifecycle Hooks", ko: "Lifecycle Hook" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use hooks when a rule must always run around create, update, remove, init, or destroy. If the behavior is only one business action, prefer a normal service method.",
              ko: "create, update, remove, init, destroy 전후에 항상 실행되어야 하는 규칙에는 hook을 사용합니다. 특정 business action에서만 필요한 동작이라면 일반 service method를 선호하세요.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable type="method" items={middlewareMethods} />
        <div className="mb-8" />
        <div className="space-y-3">
          <Code.Snippet
            title="pre/post database hooks"
            code={`override async _preCreate(data: DataInputOf<db.DbBackupInput, db.DbBackup>) {
  if (await this.dbBackupModel.workingBackupExists(data.devApp, data.branch)) {
    throw new Error("Working backup exists");
  }
  return data;
}

override async _postCreate(doc: db.DbBackup) {
  await this.dbBackupSignal.archiveDbBackup(doc.id);
  return doc;
}`}
          />
          <Code.Snippet
            title="service lifecycle"
            code={`async onInit() {
  this.logger.info("service is ready");
}

async onDestroy() {
  this.logger.info("service is closing");
}`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Put workflows that coordinate multiple models, services, signals, or external APIs in service methods.",
                ko: "여러 model, service, signal, external API를 조합하는 workflow는 service method에 둡니다.",
              }),
              l.trans({
                en: "Use document methods for simple state changes on one document, then call .save() from the service when persistence is needed.",
                ko: "하나의 document에 대한 단순 상태 변경은 document method에 두고, 저장이 필요하면 service에서 .save()를 호출합니다.",
              }),
              l.trans({
                en: "Name injected services with a Service suffix and injected signals with a Signal suffix.",
                ko: "주입되는 service property는 Service suffix로, signal property는 Signal suffix로 끝나게 이름을 짓습니다.",
              }),
              l.trans({
                en: "Wrap external packages in srvkit, register them as use or adaptor values, then inject them into service files.",
                ko: "외부 패키지는 srvkit에서 감싸고 use 또는 adaptor 값으로 등록한 뒤 service 파일에 주입합니다.",
              }),
              l.trans({
                en: "Use service extension for generated/library behavior, but keep app-specific integrations in the app service.",
                ko: "generated/library behavior는 service extension으로 확장하고, app-specific integration은 app service에 둡니다.",
              }),
              l.trans({
                en: "Avoid circular service dependencies. If two services need each other, move the shared operation into a smaller service or srvkit helper.",
                ko: "service 간 순환 의존성을 피합니다. 두 service가 서로 필요하다면 shared operation을 더 작은 service나 srvkit helper로 분리합니다.",
              }),
            ].map((rule) => (
              <div key={rule} className="rounded-xl border border-base-300 bg-base-100 px-4 text-base-content/70">
                {rule}
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
