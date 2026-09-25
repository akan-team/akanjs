import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const internalTypes: IntroItem[] = [
    {
      name: "resolveField(ReturnType)",
      desc: l.trans({
        en: "Calculates a resolved field declared in the constant model. The parent document is passed to exec by default.",
        ko: "constant model에 선언된 resolved field를 계산합니다. parent document가 exec에 기본으로 전달됩니다.",
      }),
      example: "like: resolveField(Int).exec(...)",
    },
    {
      name: "interval(ms)",
      desc: l.trans({
        en: "Runs a recurring server task every given number of milliseconds.",
        ko: "지정한 millisecond 간격으로 server task를 반복 실행합니다.",
      }),
      example: "sync: interval(1000 * 60).exec(...)",
    },
    {
      name: "cron(expression)",
      desc: l.trans({
        en: "Runs scheduled work with a cron expression. Commonly used with serverMode options for batch jobs.",
        ko: "cron expression으로 scheduled work를 실행합니다. batch job에는 serverMode option과 함께 자주 사용합니다.",
      }),
      example: 'cleanup: cron("0 0 * * *").exec(...)',
    },
    {
      name: "initialize(options?) / destroy(options?)",
      desc: l.trans({
        en: "Runs setup or teardown logic when the server process starts or stops.",
        ko: "server process가 시작되거나 종료될 때 setup 또는 teardown logic을 실행합니다.",
      }),
      example: "initialize().exec(...)",
    },
    {
      name: "process(ReturnType)",
      desc: l.trans({
        en: "Defines a background queue job. Use msg(...) to describe the job payload.",
        ko: "background queue job을 정의합니다. msg(...)로 job payload를 설명합니다.",
      }),
      example: "archive: process(Boolean).msg(...)",
    },
  ];

  const endpointTypes: IntroItem[] = [
    {
      name: "query(ReturnType, options?)",
      desc: l.trans({
        en: "Read API. Use it for loading one model, computed data, or public files.",
        ko: "읽기 API입니다. 단일 model, 계산된 데이터, public file을 불러올 때 사용합니다.",
      }),
      example: "story: query(Story).param(...).exec(...)",
    },
    {
      name: "mutation(ReturnType, options?)",
      desc: l.trans({
        en: "Write API. Use it for create, update, delete, or business actions.",
        ko: "쓰기 API입니다. create, update, delete 또는 business action에 사용합니다.",
      }),
      example: "createStory: mutation(Story).body(...).exec(...)",
    },
    {
      name: "message(ReturnType, options?)",
      desc: l.trans({
        en: "WebSocket message handler. Use msg(...) for incoming payload fields.",
        ko: "WebSocket message handler입니다. msg(...)로 들어오는 payload field를 정의합니다.",
      }),
      example: "readChat: message(Boolean).msg(...).exec(...)",
    },
    {
      name: "pubsub(ReturnType, options?)",
      desc: l.trans({
        en: "Realtime subscription channel. Use room(...) to describe the subscription room.",
        ko: "Realtime subscription channel입니다. room(...)으로 subscription room을 정의합니다.",
      }),
      example: "chatAdded: pubsub(Chat).room(...).exec(...)",
    },
  ];

  const paramBuilders: IntroItem[] = [
    {
      name: ".param(name, Type, options?)",
      desc: l.trans({
        en: "Required path-style argument. Common in query, mutation, and slice list methods.",
        ko: "필수 path-style argument입니다. query, mutation, slice list method에서 자주 사용합니다.",
      }),
      example: '.param("storyId", ID)',
    },
    {
      name: ".search(name, Type, options?)",
      desc: l.trans({
        en: "Optional search/query argument. It is nullable by default.",
        ko: "optional search/query argument입니다. 기본적으로 nullable입니다.",
      }),
      example: '.search("title", String)',
    },
    {
      name: ".body(name, Type, options?)",
      desc: l.trans({
        en: "Request body value, commonly used by mutation APIs.",
        ko: "request body 값이며 mutation API에서 주로 사용합니다.",
      }),
      example: '.body("data", StoryInput)',
    },
    {
      name: ".msg(name, Type, options?)",
      desc: l.trans({
        en: "Message or process payload argument.",
        ko: "message 또는 process payload argument입니다.",
      }),
      example: '.msg("root", ID)',
    },
    {
      name: ".room(name, Type, options?)",
      desc: l.trans({
        en: "Realtime room key for pubsub subscription channels.",
        ko: "pubsub subscription channel의 realtime room key입니다.",
      }),
      example: '.room("root", ID)',
    },
    {
      name: ".with(InternalArg, options?)",
      desc: l.trans({
        en: "Server-derived context such as Self, Req, Res, Ws, or custom internal args.",
        ko: "Self, Req, Res, Ws 또는 custom internal arg처럼 server에서 주입되는 context입니다.",
      }),
      example: ".with(Self, { nullable: true })",
    },
  ];

  const moduleAutoMethods: IntroItem[] = [
    {
      name: "view[Model](id)",
      desc: l.trans({
        en: "Fetch detail-view data generated from the model module.",
        ko: "model module에서 생성된 detail-view 데이터를 불러옵니다.",
      }),
      example: "await fetch.viewStory(storyId)",
    },
    {
      name: "edit[Model](id)",
      desc: l.trans({
        en: "Fetch edit-view data generated from the model module.",
        ko: "model module에서 생성된 edit-view 데이터를 불러옵니다.",
      }),
      example: "await fetch.editStory(storyId)",
    },
    {
      name: "merge[Model](id, data)",
      desc: l.trans({
        en: "Create or update model data through the generated module API.",
        ko: "generated module API를 통해 model data를 생성하거나 수정합니다.",
      }),
      example: "await fetch.mergeStory(storyId, data)",
    },
  ];

  const sliceAutoMethods: IntroItem[] = [
    {
      name: "[model]List[Suffix](...args, skip, limit, sort)",
      desc: l.trans({
        en: "Loads a paginated list for a slice definition.",
        ko: "slice definition에 대한 paginated list를 불러옵니다.",
      }),
      example: 'await fetch.storyListInRoot(rootId, 0, 20, "latest")',
    },
    {
      name: "[model]Insight[Suffix](...args)",
      desc: l.trans({
        en: "Loads aggregation data for the same slice query.",
        ko: "같은 slice query에 대한 aggregation data를 불러옵니다.",
      }),
      example: "await fetch.storyInsightInRoot(rootId)",
    },
    {
      name: "init[Model](query?, option?)",
      desc: l.trans({
        en: "Initializes the default model list with list and insight data.",
        ko: "기본 model list를 list와 insight data로 초기화합니다.",
      }),
      example: "await fetch.initStory()",
    },
    {
      name: "init[Model][Suffix](...args)",
      desc: l.trans({
        en: "Initializes a named slice list with args declared in signal.ts.",
        ko: "signal.ts에 선언한 arg를 사용해 named slice list를 초기화합니다.",
      }),
      example: "await fetch.initStoryInRoot(rootId)",
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="signal-overview" title="model.signal.ts">
        <Docs.Title>model.signal.ts</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Signals define the external interface of a module. They connect service logic to generated client APIs, list stores, realtime channels, and server-side jobs.",
              ko: "Signal은 module의 외부 interface를 정의합니다. service logic을 generated client API, list store, realtime channel, server-side job에 연결합니다.",
            })}
          </div>
          <div className="space-y-3">
            {[
              {
                title: "Internal",
                desc: l.trans({
                  en: "Server-only work such as resolved fields, cron jobs, lifecycle hooks, and background processes.",
                  ko: "resolved field, cron job, lifecycle hook, background process 같은 server-only 작업입니다.",
                }),
              },
              {
                title: "Endpoint",
                desc: l.trans({
                  en: "Public APIs and realtime handlers exposed through fetch, websocket message, or pubsub.",
                  ko: "fetch, websocket message, pubsub으로 노출되는 public API와 realtime handler입니다.",
                }),
              },
              {
                title: "Slice",
                desc: l.trans({
                  en: "Frontend-facing list surfaces used by generated stores, pagination, and insight loading.",
                  ko: "generated store, pagination, insight loading이 사용하는 frontend-facing list surface입니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4">
                <div className="font-bold text-base-content">{title}</div>
                <div className="text-base-content/70">{desc}</div>
              </div>
            ))}
          </div>
          <Code.Snippet
            title="story.signal.ts"
            code={`export class StoryInternal extends internal(srv.story, () => ({})) {}

export class StorySlice extends slice(srv.story, { guards: { root: Admin } }, () => ({})) {}

export class StoryEndpoint extends endpoint(srv.story, ({ query }) => ({
  story: query(cnst.Story).exec(async function () {
    return await this.storyService.getStory();
  }),
})) {}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="signal-extension"
        title={l.trans({ en: "Extending Generated Signals", ko: "Generated signal 확장" })}
      >
        <Docs.Title>{l.trans({ en: "Extending Generated Signals", ko: "Generated signal 확장" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When an app domain extends generated or library behavior, spread inherited signals at the end. This keeps base internals, slices, and endpoints while adding app-specific methods.",
              ko: "app domain이 generated 또는 library 동작을 확장할 때는 inherited signal을 마지막에 spread합니다. base internal, slice, endpoint를 유지하면서 app 전용 method를 추가할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="user.signal.ts"
          code={`export class UserInternal extends internal(srv.user, () => ({}), ...user.internals) {}

export class UserSlice extends slice(srv.user, {}, () => ({}), ...user.slices) {}

export class UserEndpoint extends endpoint(
  srv.user,
  ({ query }) => ({
    authCallback: query(String).search("code", String).exec(async function (code) {
      return await this.userService.authCallback(code);
    }),
  }),
  ...user.endpoints,
) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="internal-signal" title={l.trans({ en: "Defining Internal Tasks", ko: "Internal 작업 정의" })}>
        <Docs.Title>{l.trans({ en: "Defining Internal Tasks", ko: "Internal 작업 정의" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use internal() for work that belongs to the server runtime rather than a direct page call. This includes resolved fields, scheduled tasks, lifecycle hooks, and queue jobs.",
              ko: "page에서 직접 호출하는 API가 아니라 server runtime에 속하는 작업에는 internal()을 사용합니다. resolved field, scheduled task, lifecycle hook, queue job이 여기에 포함됩니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable type="method" items={internalTypes} />
        <Code.Snippet
          title="story.signal.ts"
          code={`export class StoryInternal extends internal(srv.story.with(srv.actionLog), ({ resolveField, cron }) => ({
  like: resolveField(Int)
    .with(Self, { nullable: true })
    .exec(async function (story, self) {
      if (!self) return 0;
      return await this.actionLogService.getLike(story.id, self.id);
    }),
  cleanup: cron("0 0 * * *").exec(async function () {
    await this.storyService.cleanup();
  }),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="endpoint-signal" title={l.trans({ en: "Defining Public APIs", ko: "Public API 정의" })}>
        <Docs.Title>{l.trans({ en: "Defining Public APIs", ko: "Public API 정의" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use endpoint() for API methods that the client can call. Endpoint builders cover read/write APIs and realtime surfaces.",
              ko: "client가 호출할 수 있는 API method에는 endpoint()를 사용합니다. endpoint builder는 read/write API와 realtime surface를 다룹니다.",
            })}
          </div>
        </Docs.Description>

        <Docs.SubTitle>Method Types</Docs.SubTitle>
        <Docs.IntroTable type="method" items={endpointTypes} />

        <Docs.SubTitle>Parameter Builders</Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "Parameter builders describe where each value comes from. The order becomes the order of exec arguments. Put nullable arguments near the end because required arguments cannot follow nullable ones.",
            ko: "parameter builder는 각 값이 어디에서 오는지 설명합니다. 선언 순서가 exec argument 순서가 됩니다. required argument가 nullable argument 뒤에 올 수 없으므로 nullable argument는 뒤쪽에 두세요.",
          })}
        </Docs.Description>
        <Docs.IntroTable type="field" items={paramBuilders} />

        <Docs.SubTitle>Endpoint Example</Docs.SubTitle>
        <Code.Snippet
          title="story.signal.ts"
          code={`export class StoryEndpoint extends endpoint(srv.story, ({ query, mutation }) => ({
  story: query(cnst.Story)
    .param("storyId", ID)
    .exec(async function (storyId) {
      return await this.storyService.getStory(storyId);
    }),
  createStory: mutation(cnst.Story)
    .body("data", cnst.StoryInput)
    .exec(async function (data) {
      return await this.storyService.createStory(data);
    }),
})) {}`}
        />

        <Docs.SubTitle>Realtime Example</Docs.SubTitle>
        <Code.Snippet
          title="chatRoom.signal.ts"
          code={`export class ChatRoomEndpoint extends endpoint(srv.chatRoom, ({ message, pubsub }) => ({
  readChat: message(Boolean).msg("root", ID).exec(async function (root) {
    return await this.chatRoomService.read(root);
  }),
  chatAdded: pubsub(cnst.Chat).room("root", ID).exec(async function () {}),
})) {}`}
        />

        <Docs.SubTitle>Public Path Endpoints</Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "Use endpoint options when a method should be exposed at a public path, such as sitemap.xml or other non-standard API routes.",
            ko: "sitemap.xml처럼 일반 API route가 아닌 public path로 method를 노출해야 할 때 endpoint option을 사용합니다.",
          })}
        </Docs.Description>
        <Code.Snippet
          title="site.signal.ts"
          code={`export class SiteEndpoint extends endpoint(srv.site, ({ query }) => ({
  sitemapXml: query(Any, { path: "sitemap.xml", prefix: false }).exec(async function () {
    return new Response(null, { headers: { "Content-Type": "application/xml" } });
  }),
})) {}`}
        />

        <Docs.SubTitle>Client Usage (fetch)</Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "Generated fetch methods call endpoint methods from page loaders, components, stores, or client actions.",
            ko: "generated fetch method는 page loader, component, store, client action에서 endpoint method를 호출할 때 사용합니다.",
          })}
        </Docs.Description>
        <Code.Snippet
          title="page.tsx"
          code={`const story = await fetch.story(storyId);
const created = await fetch.createStory(data);

await fetch.readChat(rootId);
const unsubscribe = fetch.subscribeChatAdded(rootId, (chat) => {
  console.info(chat);
});`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="standard-signal" title={l.trans({ en: "Standard Model APIs", ko: "표준 Model API" })}>
        <Docs.Title>{l.trans({ en: "Standard Model APIs", ko: "표준 Model API" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan generates standard model APIs for common view, edit, and merge flows. You usually add custom endpoints only when the business action needs its own name or behavior.",
              ko: "Akan은 일반적인 view, edit, merge 흐름을 위한 표준 model API를 생성합니다. 비즈니스 action에 고유한 이름이나 동작이 필요할 때 custom endpoint를 추가합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable type="method" items={moduleAutoMethods} />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="slice-signal" title={l.trans({ en: "Defining Slices And Stores", ko: "Slice와 Store 정의" })}>
        <Docs.Title>{l.trans({ en: "Defining Slices And Stores", ko: "Slice와 Store 정의" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use slice() to define list surfaces for pages. A slice starts from init(), receives params, search values, or internal args, and returns a service query.",
              ko: "page용 list surface를 정의할 때 slice()를 사용합니다. slice는 init()에서 시작해 param, search value, internal arg를 받고 service query를 반환합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Root guards apply to the generated slice surface. Method guards passed to init({ guards }) narrow a specific list.",
              ko: "root guard는 generated slice surface에 적용됩니다. init({ guards })에 전달한 method guard는 특정 list에만 적용됩니다.",
            })}
          </div>
        </Docs.Description>

        <Docs.SubTitle>Server Definition</Docs.SubTitle>
        <Code.Snippet
          title="story.signal.ts"
          code={`export class StorySlice extends slice(srv.story, {}, (init) => ({
  inRoot: init().param("root", ID).exec(function (root) {
    return this.storyService.queryInRoot(root);
  }),
})) {}`}
        />

        <Docs.SubTitle>Slice Auto-Generated Methods</Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "A slice definition generates list, insight, and init fetch methods. These methods are usually consumed by store and zone UI code.",
            ko: "slice definition은 list, insight, init fetch method를 생성합니다. 이 method들은 보통 store와 zone UI code에서 사용합니다.",
          })}
        </Docs.Description>
        <Docs.IntroTable type="method" items={sliceAutoMethods} />

        <Docs.SubTitle>Client Usage</Docs.SubTitle>
        <Code.Snippet title="page.tsx" code="const data = await fetch.initStoryInRoot(rootId);" />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="builder-types" title={l.trans({ en: "Builder Function Types", ko: "Builder 함수 타입" })}>
        <Docs.Title>{l.trans({ en: "Builder Function Types", ko: "Builder 함수 타입" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The builder functions above map directly to framework types: endpoint builders create EndpointInfo, slice init creates SliceInfo, and internal builders create InternalInfo.",
              ko: "위 builder 함수들은 framework type과 직접 연결됩니다. endpoint builder는 EndpointInfo, slice init은 SliceInfo, internal builder는 InternalInfo를 만듭니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-3">
          {[
            {
              title: "Endpoint builders",
              desc: "query(Return), mutation(Return), message(Return), pubsub(Return)",
            },
            {
              title: "Slice builder",
              desc: "init(signalOption?)",
            },
            {
              title: "Internal builders",
              desc: "resolveField(Return), interval(ms), cron(expr), timeout(ms), initialize(), destroy(), process(Return)",
            },
          ].map(({ title, desc }) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4">
              <div className="font-bold text-base-content">{title}</div>
              <div className="text-base-content/70">{desc}</div>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="practical-rules" title={l.trans({ en: "Practical Rules", ko: "실전 규칙" })}>
        <Docs.Title>{l.trans({ en: "Practical Rules", ko: "실전 규칙" })}</Docs.Title>
        <Docs.Description>
          <div className="space-y-1">
            {[
              l.trans({
                en: "Use Internal for server-only jobs, resolved fields, queue processes, and lifecycle hooks.",
                ko: "server-only job, resolved field, queue process, lifecycle hook에는 Internal을 사용합니다.",
              }),
              l.trans({
                en: "Use Endpoint for explicit client calls, mutations, websocket messages, and pubsub subscriptions.",
                ko: "명시적인 client call, mutation, websocket message, pubsub subscription에는 Endpoint를 사용합니다.",
              }),
              l.trans({
                en: "Use Slice for list surfaces that need generated stores, pagination, or insight loading.",
                ko: "generated store, pagination, insight loading이 필요한 list surface에는 Slice를 사용합니다.",
              }),
              l.trans({
                en: "Use ...model.internals, ...model.slices, and ...model.endpoints when extending generated or library domains.",
                ko: "generated 또는 library domain을 확장할 때는 ...model.internals, ...model.slices, ...model.endpoints를 사용합니다.",
              }),
              l.trans({
                en: "Use srv.model.with(otherSrv) when the signal needs another service in this.*Service.",
                ko: "signal에서 다른 service를 this.*Service로 사용해야 하면 srv.model.with(otherSrv)를 사용합니다.",
              }),
              l.trans({
                en: "Put nullable arguments near the end because required arguments cannot follow nullable ones.",
                ko: "required argument가 nullable argument 뒤에 올 수 없으므로 nullable argument는 뒤쪽에 둡니다.",
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
