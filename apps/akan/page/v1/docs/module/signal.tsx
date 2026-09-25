import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const internalTypes: IntroItem[] = [
    {
      name: "interval(ms)",
      desc: l.trans({
        en: "Defines a recurring task executed every 'ms' milliseconds.",
        ko: "'ms' 밀리초마다 실행되는 반복 작업을 정의합니다.",
      }),
      example: `cronJob: interval(3000).exec(...)`,
    },
    {
      name: "process(ReturnType)",
      desc: l.trans({
        en: "Defines a background process queue handled by a worker.",
        ko: "워커가 처리하는 백그라운드 프로세스 큐를 정의합니다.",
      }),
      example: `sendEmail: process(Boolean).exec(...)`,
    },
  ];

  const endpointTypes: IntroItem[] = [
    {
      name: "query(ReturnType, options?)",
      desc: l.trans({
        en: "Defines a GraphQL Query or HTTP GET endpoint.",
        ko: "GraphQL Query 또는 HTTP GET 엔드포인트를 정의합니다.",
      }),
      example: `getProduct: query(Product).exec(...)`,
    },
    {
      name: "mutation(ReturnType, options?)",
      desc: l.trans({
        en: "Defines a GraphQL Mutation or HTTP POST endpoint.",
        ko: "GraphQL Mutation 또는 HTTP POST 엔드포인트를 정의합니다.",
      }),
      example: `createProduct: mutation(Product).exec(...)`,
    },
    {
      name: "message(ReturnType, options?)",
      desc: l.trans({
        en: "Defines a WebSocket message handler.",
        ko: "WebSocket 메시지 핸들러를 정의합니다.",
      }),
      example: `onJoin: message(Boolean).exec(...)`,
    },
    {
      name: "pubsub(payloadType)",
      desc: l.trans({
        en: "Defines a PubSub topic handler.",
        ko: "PubSub 토픽 핸들러를 정의합니다.",
      }),
      example: `onUpdate: pubsub(String).exec(...)`,
    },
  ];

  const paramBuilders: IntroItem[] = [
    {
      name: ".param(name, Type, options?)",
      desc: l.trans({
        en: "Required path parameter. (Available in: Query, Mutation, Process)",
        ko: "필수 경로 파라미터. (사용 가능: Query, Mutation, Process)",
      }),
      example: `.param("id", String)`,
    },
    {
      name: ".search(name, Type, options?)",
      desc: l.trans({
        en: "Query string or optional argument. (Available in: Query, Mutation)",
        ko: "쿼리 스트링 또는 선택적 인자. (사용 가능: Query, Mutation)",
      }),
      example: `.search("keyword", String)`,
    },
    {
      name: ".body(name, Type, options?)",
      desc: l.trans({
        en: "Request body parameter. (Available in: Mutation)",
        ko: "요청 바디 파라미터. (사용 가능: Mutation)",
      }),
      example: `.body("data", Input)`,
    },
    {
      name: ".msg(name, Type, options?)",
      desc: l.trans({
        en: "Message payload field. (Available in: Message)",
        ko: "메시지 페이로드 필드. (사용 가능: Message)",
      }),
      example: `.msg("content", String)`,
    },
    {
      name: ".room(name, Type, options?)",
      desc: l.trans({
        en: "PubSub room identifier. (Available in: PubSub)",
        ko: "PubSub 룸 식별자. (사용 가능: PubSub)",
      }),
      example: `.room("channelId", String)`,
    },
  ];

  const moduleAutoMethods: IntroItem[] = [
    {
      name: "view[Model](id: string): Promise<ViewReturn>",
      desc: l.trans({
        en: "Fetch detail view data. Returns { [Model], [Model]View }.",
        ko: "상세 보기 데이터를 가져옵니다. { [Model], [Model]View }를 반환합니다.",
      }),
      example: `await fetch.viewProduct(productId)`,
    },
    {
      name: "edit[Model](id: string): Promise<EditReturn>",
      desc: l.trans({
        en: "Fetch data for editing. Returns { [Model], [Model]Edit }.",
        ko: "편집을 위한 데이터를 가져옵니다. { [Model], [Model]Edit }를 반환합니다.",
      }),
      example: `await fetch.editProduct(productId)`,
    },
    {
      name: "merge[Model](id: string | null, data: Partial<Model>): Promise<Model>",
      desc: l.trans({
        en: "Create or Update model data. Returns updated Model.",
        ko: "모델 데이터를 생성하거나 업데이트합니다. 업데이트된 Model을 반환합니다.",
      }),
      example: `await fetch.mergeProduct(productId, data)`,
    },
  ];

  const sliceAutoMethods: IntroItem[] = [
    {
      name: "[Model]List[Suffix](...args, skip, limit, sort): Promise<Model[]>",
      desc: l.trans({
        en: "Get list of data with pagination arguments. Returns Model array.",
        ko: "페이지네이션 인자가 포함된 데이터 목록을 가져옵니다. Model 배열을 반환합니다.",
      }),
      example: `await fetch.productListInProject(projectId, 0, 20, "createdAt:desc")`,
    },
    {
      name: "[Model]Insight[Suffix](...args): Promise<Insight>",
      desc: l.trans({
        en: "Get aggregated statistics. Returns Insight object.",
        ko: "집계 통계를 가져옵니다. Insight 객체를 반환합니다.",
      }),
      example: `await fetch.productInsightInProject(projectId)`,
    },
    {
      name: "init[Model](query?, option?): Promise<InitReturn>",
      desc: l.trans({
        en: "Initialize list with default options. Returns { [Model]Init, [Model]List, [Model]Insight }.",
        ko: "기본 옵션으로 목록을 초기화합니다. { [Model]Init, [Model]List, [Model]Insight }를 반환합니다.",
      }),
      example: `await fetch.initProduct()`,
    },
    {
      name: "init[SliceName](...args): Promise<InitReturn>",
      desc: l.trans({
        en: "Initialize slice list data. Returns { [Slice]Init, [Slice]List, [Slice]Insight }.",
        ko: "Slice 목록 데이터를 초기화합니다. { [Slice]Init, [Slice]List, [Slice]Insight }를 반환합니다.",
      }),
      example: `await fetch.initProductInProject(projectId)`,
    },
  ];

  const guardLifecycle: IntroItem[] = [
    {
      name: "canActivate(context)",
      desc: l.trans({
        en: "Returns boolean indicating if the request is allowed.",
        ko: "요청이 허용되는지 여부를 나타내는 불리언 값을 반환합니다.",
      }),
      example: `canActivate(context): boolean { ... }`,
    },
    {
      name: "getRequest(context)",
      desc: l.trans({
        en: "Helper to extract the request object, including the user account.",
        ko: "사용자 계정을 포함한 요청 객체를 추출하는 헬퍼입니다.",
      }),
      example: `const { account } = getRequest(context);`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="signal-overview" title={"model.signal.ts"}>
        <Docs.Title>{"model.signal.ts"}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Signals define the external interface of your module. They connect your Service logic to the outside world via various protocols (HTTP, GQL, WebSocket).",
              ko: "Signal은 모듈의 외부 인터페이스를 정의합니다. 다양한 프로토콜(HTTP, GQL, WebSocket)을 통해 Service 로직을 외부 세계와 연결합니다.",
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-indigo-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-indigo-600">📡</span>
                <strong className="text-indigo-800">
                  {l.trans({ en: "Three Signal Types", ko: "세 가지 Signal 유형" })}
                </strong>
              </div>
              <ul className="list-inside list-disc text-indigo-700 text-sm">
                <li>
                  <strong>Internal</strong>:{" "}
                  {l.trans({ en: "Background tasks, cron jobs", ko: "백그라운드 작업, 크론 잡" })}
                </li>
                <li>
                  <strong>Endpoint</strong>:{" "}
                  {l.trans({ en: "Public API (REST/GQL, WebSocket)", ko: "공개 API (REST/GQL, WebSocket)" })}
                </li>
                <li>
                  <strong>Slice</strong>:{" "}
                  {l.trans({ en: "Frontend-facing data subsets", ko: "프론트엔드용 데이터 서브셋" })}
                </li>
              </ul>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      {/* Internal Definition */}
      <Scroll.Slide id="internal-signal" title={l.trans({ en: "Defining Internal Tasks", ko: "내부 작업 정의하기" })}>
        <Docs.Title>{l.trans({ en: "Defining Internal Tasks", ko: "내부 작업 정의하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `internal()` to define background tasks like cron jobs or process queues that run independently of user requests.",
              ko: "`internal()`을 사용하여 사용자 요청과 독립적으로 실행되는 크론 잡이나 프로세스 큐와 같은 백그라운드 작업을 정의합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable type="method" items={internalTypes} />
        <div className="mb-4" />
        <div className="rounded-lg bg-base-200 p-3 lg:p-4">
          <Code.Snippet
            title="product.signal.ts"
            language="typescript"
            code={`import { internal } from "@akanjs/signal";
import * as srv from "../srv";

export class ProductInternal extends internal(srv.product, ({ interval }) => ({
  // Run every hour
  removeExpired: interval(1000 * 60 * 60).exec(async function() {
    await this.productService.removeExpiredProducts();
  }),
})) {}`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      {/* Endpoint Definition */}
      <Scroll.Slide id="endpoint-signal" title={l.trans({ en: "Defining Public APIs", ko: "공개 API 정의하기" })}>
        <Docs.Title>{l.trans({ en: "Defining Public APIs", ko: "공개 API 정의하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `endpoint()` to define standard API methods. You can mix Query, Mutation, and Real-time subscriptions.",
              ko: "`endpoint()`를 사용하여 표준 API 메서드를 정의합니다. Query, Mutation, 실시간 구독을 혼합하여 사용할 수 있습니다.",
            })}
          </div>
        </Docs.Description>

        <Docs.SubTitle>Method Types</Docs.SubTitle>
        <Docs.IntroTable type="method" items={endpointTypes} />

        <div className="mb-8" />

        <Docs.SubTitle>Parameter Builders</Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "Parameters are strictly scoped. For example, you cannot use `.room()` in a Query or `.body()` in a Subscription.",
            ko: "파라미터는 엄격하게 범위가 지정됩니다. 예를 들어, Query에서 `.room()`을 사용하거나 Subscription에서 `.body()`를 사용할 수 없습니다.",
          })}
        </Docs.Description>
        <Docs.IntroTable type="field" items={paramBuilders} />

        <div className="mb-6" />

        <div className="rounded-lg bg-base-200 p-3 lg:p-4">
          <Code.Snippet
            title="Chat Example"
            language="typescript"
            code={`export class ChatEndpoint extends endpoint(srv.chat, ({ query, mutation, message, pubsub }) => ({
  // Query with Search params
  getChats: query([Chat])
    .param("roomId", ID)
    .search("limit", Number, { default: 20 })
    .exec(async function(roomId, limit) { ... }),

  // Mutation with Body params
  sendChat: mutation(Chat)
    .param("roomId", ID)
    .body("text", String)
    .exec(async function(roomId, text) { ... }),
    
  // Message Handler (WebSocket)
  typingChat: message(Boolean)
    .room("roomId", ID)
    .msg("isTyping", Boolean)
    .exec(function(roomId, isTyping) {
      // Handle typing status
    }),
    
  // PubSub with Room param
  onNewChat: pubsub(Chat)
    .room("roomId", ID)
    .exec(function(roomId) { 
      // Logic when a client subscribes
    }),
})) {}`}
          />
        </div>

        <div className="mb-6" />

        <Docs.SubTitle>Client Usage (fetch)</Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "Use the `fetch` object to call endpoint methods on the client.",
            ko: "`fetch` 객체를 사용하여 클라이언트에서 엔드포인트 메서드를 호출합니다.",
          })}
        </Docs.Description>
        <Code.Snippet
          title="Client Usage"
          language="typescript"
          code={`
// 1. Query & Mutation (Async/Await)
const chats = await fetch.getChats(roomId, 20);
const newChat = await fetch.sendChat(roomId, "Hello World");

// 2. Message (WebSocket Emit & Listen)
// Emit: Send data to server
await fetch.typingChat(roomId, true);

// Listen: Receive data from server (Event Handler)
const stopListening = fetch.listenTypingChat(roomId, (isTyping) => {
  console.log("Is user typing?", isTyping);
});

// 3. PubSub (Real-time Subscription)
// Subscribe: Listen for real-time events
const unsubscribe = fetch.subscribeOnNewChat(roomId, (chat) => {
  console.log("New chat received:", chat);
});

// Clean up listeners/subscriptions when done
stopListening();
unsubscribe();
`}
        />
      </Scroll.Slide>
      <div className="divider" />

      {/* Standard Signal Definition */}
      <Scroll.Slide id="standard-signal" title={l.trans({ en: "Standard Model APIs", ko: "표준 모델 API" })}>
        <Docs.Title>{l.trans({ en: "Standard Model APIs", ko: "표준 모델 API" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The following methods are automatically generated for every model and are available via the `fetch` object.",
              ko: "다음 메서드들은 모든 모델에 대해 자동으로 생성되며 `fetch` 객체를 통해 사용할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable type="method" items={moduleAutoMethods} />
      </Scroll.Slide>
      <div className="divider" />

      {/* Slice Definition */}
      <Scroll.Slide
        id="slice-signal"
        title={l.trans({ en: "Defining Slices & Stores", ko: "Slice 및 Store 정의하기" })}
      >
        <Docs.Title>{l.trans({ en: "Defining Slices & Stores", ko: "Slice 및 Store 정의하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `slice()` to group APIs for specific contexts (e.g., 'My Tickets', 'Project Tickets'). It automatically generates client-side stores and pagination Actions.",
              ko: "`slice()`를 사용하여 특정 컨텍스트(예: '내 티켓', '프로젝트 티켓')에 대한 API를 그룹화합니다. 클라이언트 측 Store와 페이지네이션 Action을 자동으로 생성합니다.",
            })}
          </div>
          <div className="mt-4">
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">⚡</span>
                <strong className="text-green-800">{l.trans({ en: "Automation Power", ko: "자동화 기능" })}</strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Defining a slice automatically creates `fetch.init[SliceName]` on the client. It handles data loading, pagination, and state management in one go.",
                  ko: "Slice를 정의하면 클라이언트에서 `fetch.init[SliceName]`이 자동으로 생성됩니다. 데이터 로딩, 페이지네이션, 상태 관리를 한 번에 처리합니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>

        <Docs.SubTitle>Server Definition</Docs.SubTitle>
        <Code.Snippet
          title="ticket.signal.ts"
          language="typescript"
          code={`export class TicketSlice extends slice(
  srv.ticket, 
  { guards: { root: Admin } }, // Default guards for this slice
  (init) => ({
    // 'init' helper generates list/count/exists APIs automatically
    inProject: init({ guards: [Every] })
      .param("projectId", ID)
      .search("status", String)
      .exec(function(projectId, status) {
        // Return a query builder or array
        return this.ticketService.queryInProject(projectId, status);
      }),
  })
) {}`}
        />

        <div className="mb-8" />

        <Docs.SubTitle>Slice Auto-Generated Methods</Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "Methods generated specifically for each slice definition.",
            ko: "각 Slice 정의에 대해 특별히 생성되는 메서드들입니다.",
          })}
        </Docs.Description>
        <Docs.IntroTable type="method" items={sliceAutoMethods} />

        <div className="mb-8" />

        <Docs.SubTitle>Client Usage</Docs.SubTitle>
        <Code.Snippet
          title="Client Page (page.tsx)"
          language="typescript"
          code={`// 1. Fetch data in loader
const { ticketInitInProject } = await fetch.initTicketInProject(projectId);

// 2. Pass init object to UI Component
<Ticket.Zone.Kanban 
  init={ticketInitInProject} 
  sliceName="ticketInProject" // Links UI actions to the store
/>`}
        />
      </Scroll.Slide>
      <div className="divider" />

      {/* Guard Definition */}
      <Scroll.Slide id="guards-usage" title={l.trans({ en: "Using & Defining Guards", ko: "Guard 사용 및 정의" })}>
        <Docs.Title>{l.trans({ en: "Using & Defining Guards", ko: "Guard 사용 및 정의" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Guards protect your Signals. You can use built-in guards or define your own by implementing the `Guard` interface.",
              ko: "Guard는 Signal을 보호합니다. 내장 가드를 사용하거나 `Guard` 인터페이스를 구현하여 직접 정의할 수 있습니다.",
            })}
          </div>
        </Docs.Description>

        <Docs.SubTitle>Creating a Custom Guard</Docs.SubTitle>
        <Docs.IntroTable type="method" items={guardLifecycle} />

        <div className="mb-4" />

        <div className="rounded-lg bg-base-200 p-3 lg:p-4">
          <Code.Snippet
            title="libs/shared/nest/authGuards.ts"
            language="typescript"
            code={`import { Guard, getRequest } from "@akanjs/nest";

export class Admin implements Guard {
  static name = "Admin";
  
  canActivate(context: ExecutionContext): boolean {
    const { account } = getRequest(context);
    
    // Check if user has 'admin' role
    if (account.me?.roles.includes("admin")) return true;
    
    return false;
  }
}`}
          />
        </div>

        <Docs.SubTitle>Applying Guards</Docs.SubTitle>
        <Code.Snippet
          language="typescript"
          code={`// 1. Class Level (Slice)
slice(srv.ticket, { guards: { root: Admin } }, ...)

// 2. Method Level
mutation(Ticket, { guards: [Admin] })...`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
