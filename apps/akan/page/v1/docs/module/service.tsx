import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const predefinedVariables: IntroItem[] = [
    {
      name: "<MODEL_NAME>Model",
      desc: l.trans({
        en: "Database model instance declared in model.document.ts",
        ko: "model.document.ts에서 선언된 데이터베이스 모델 인스턴스",
      }),
      example: `async loadMyProduct() {
  const product = await this.productModel.loadProductByName("myProduct");
  return product;
}`,
    },
    {
      name: "logger",
      desc: l.trans({
        en: "Built-in logger module for stdout logging",
        ko: "stdout 로깅을 위한 내장 로거 모듈",
      }),
      example: `async initialize() {
  this.logger.log("Product module initialized");
}`,
    },
  ];

  const predefinedMethods: IntroItem[] = [
    {
      name: "getProduct(id: string)",
      desc: l.trans({
        en: "Load document by ID. Throws error if not found.",
        ko: "ID로 문서를 불러옵니다. 없으면 에러를 반환합니다.",
      }),
      example: `const product = await this.getProduct("prod-123");`,
    },
    {
      name: "loadProduct(id?: string)",
      desc: l.trans({
        en: "Load document by ID. Returns null if not found.",
        ko: "ID로 문서를 불러옵니다. 없으면 null을 반환합니다.",
      }),
      example: `const product = await this.loadProduct("prod-123");`,
    },
    {
      name: "loadProductMany(ids: string[])",
      desc: l.trans({
        en: "Batch load documents by IDs. Returns array of docs or nulls.",
        ko: "ID 배열로 문서를 일괄 로드합니다. 문서 또는 null 배열을 반환합니다.",
      }),
      example: `const products = await this.loadProductMany(["p-1", "p-2"]);`,
    },
    {
      name: "createProduct(data: db.ProductInput)",
      desc: l.trans({
        en: "Create a new document with input data.",
        ko: "입력 데이터로 새 문서를 생성합니다.",
      }),
      example: `const product = await this.createProduct({ name: "New Product" });`,
    },
    {
      name: "updateProduct(id: string, data: Partial<db.Product>)",
      desc: l.trans({
        en: "Update document by ID. Returns updated document.",
        ko: "ID로 문서를 업데이트합니다. 업데이트된 문서를 반환합니다.",
      }),
      example: `const product = await this.updateProduct("p-1", { price: 100 });`,
    },
    {
      name: "removeProduct(id: string)",
      desc: l.trans({
        en: "Soft-delete document by ID. Sets status to 'archived'.",
        ko: "ID로 문서를 소프트 삭제합니다. 상태를 'archived'로 설정합니다.",
      }),
      example: `await this.removeProduct("p-1");`,
    },
    {
      name: "searchProduct(searchText: string, queryOption?: ListQueryOption)",
      desc: l.trans({
        en: "Search documents by text. Returns docs and count.",
        ko: "텍스트로 문서를 검색합니다. 문서 목록과 개수를 반환합니다.",
      }),
      example: `const { docs, count } = await this.searchProduct("iphone");`,
    },
    {
      name: "searchDocsProduct(searchText: string, queryOption?: ListQueryOption)",
      desc: l.trans({
        en: "Search documents by text. Returns docs only.",
        ko: "텍스트로 문서를 검색합니다. 문서 목록만 반환합니다.",
      }),
      example: `const products = await this.searchDocsProduct("iphone");`,
    },
    {
      name: "searchCountProduct(searchText: string)",
      desc: l.trans({
        en: "Count documents matching search text.",
        ko: "검색 텍스트와 일치하는 문서 수를 셉니다.",
      }),
      example: `const count = await this.searchCountProduct("iphone");`,
    },
  ];

  const queryBasedMethods: IntroItem[] = [
    {
      name: "list<Query>(...args, option?)",
      desc: l.trans({
        en: "List documents matching defined query.",
        ko: "정의된 쿼리와 일치하는 문서를 나열합니다.",
      }),
      example: `const products = await this.listInCategory(categoryId);`,
    },
    {
      name: "listIds<Query>(...args, option?)",
      desc: l.trans({
        en: "List document IDs matching defined query.",
        ko: "정의된 쿼리와 일치하는 문서 ID를 나열합니다.",
      }),
      example: `const productIds = await this.listIdsInCategory(categoryId);`,
    },
    {
      name: "find<Query>(...args, option?)",
      desc: l.trans({
        en: "Find single document matching defined query.",
        ko: "정의된 쿼리와 일치하는 단일 문서를 찾습니다.",
      }),
      example: `const product = await this.findByName("iPhone");`,
    },
    {
      name: "findId<Query>(...args, option?)",
      desc: l.trans({
        en: "Find single document ID matching defined query.",
        ko: "정의된 쿼리와 일치하는 단일 문서 ID를 찾습니다.",
      }),
      example: `const productId = await this.findIdByName("iPhone");`,
    },
    {
      name: "pick<Query>(...args, option?)",
      desc: l.trans({
        en: "Find single document matching query. Throws if not found.",
        ko: "정의된 쿼리와 일치하는 단일 문서를 찾습니다. 없으면 에러를 던집니다.",
      }),
      example: `const product = await this.pickByName("iPhone");`,
    },
    {
      name: "pickId<Query>(...args, option?)",
      desc: l.trans({
        en: "Find single document ID matching query. Throws if not found.",
        ko: "정의된 쿼리와 일치하는 단일 문서 ID를 찾습니다. 없으면 에러를 던집니다.",
      }),
      example: `const productId = await this.pickIdByName("iPhone");`,
    },
    {
      name: "exists<Query>(...args)",
      desc: l.trans({
        en: "Check if document exists matching defined query. Returns ID or null.",
        ko: "정의된 쿼리와 일치하는 문서가 존재하는지 확인합니다. ID 또는 null을 반환합니다.",
      }),
      example: `const exists = await this.existsByName("iPhone");`,
    },
    {
      name: "count<Query>(...args)",
      desc: l.trans({
        en: "Count documents matching defined query.",
        ko: "정의된 쿼리와 일치하는 만서 수를 셉니다.",
      }),
      example: `const count = await this.countInCategory(categoryId);`,
    },
    {
      name: "insight<Query>(...args)",
      desc: l.trans({
        en: "Get aggregated statistics matching defined query.",
        ko: "정의된 쿼리와 일치하는 집계 통계를 가져옵니다.",
      }),
      example: `const insight = await this.insightInCategory(categoryId);`,
    },
    {
      name: "query<Query>(...args)",
      desc: l.trans({
        en: "Get the raw query object defined in Filter.",
        ko: "Filter에 정의된 원시 쿼리 객체를 가져옵니다.",
      }),
      example: `const query = this.queryInCategory(categoryId);`,
    },
  ];

  const middlewareMethods: IntroItem[] = [
    {
      name: "_preCreate(data)",
      desc: l.trans({
        en: "Hook called before creation. Return modified data.",
        ko: "생성 전에 호출되는 훅입니다. 수정된 데이터를 반환하세요.",
      }),
      example: `async _preCreate(data) { ... return data; }`,
    },
    {
      name: "_postCreate(doc)",
      desc: l.trans({
        en: "Hook called after creation. Return modified doc.",
        ko: "생성 후에 호출되는 훅입니다. 수정된 문서를 반환하세요.",
      }),
      example: `async _postCreate(doc) { ... return doc; }`,
    },
    {
      name: "_preUpdate(id, data)",
      desc: l.trans({
        en: "Hook called before update.",
        ko: "업데이트 전에 호출되는 훅입니다.",
      }),
      example: `async _preUpdate(id, data) { ... return data; }`,
    },
    {
      name: "_postUpdate(doc)",
      desc: l.trans({
        en: "Hook called after update.",
        ko: "업데이트 후에 호출되는 훅입니다.",
      }),
      example: `async _postUpdate(doc) { ... return doc; }`,
    },
    {
      name: "_preRemove(id)",
      desc: l.trans({
        en: "Hook called before removal.",
        ko: "삭제 전에 호출되는 훅입니다.",
      }),
      example: `async _preRemove(id) { ... }`,
    },
    {
      name: "_postRemove(doc)",
      desc: l.trans({
        en: "Hook called after removal.",
        ko: "삭제 후에 호출되는 훅입니다.",
      }),
      example: `async _postRemove(doc) { ... return doc; }`,
    },
    {
      name: "listenPre(type, listener)",
      desc: l.trans({
        en: "Register dynamic pre-hook listener.",
        ko: "동적 pre-hook 리스너를 등록합니다.",
      }),
      example: `this.listenPre("create", async (data) => { ... });`,
    },
    {
      name: "listenPost(type, listener)",
      desc: l.trans({
        en: "Register dynamic post-hook listener.",
        ko: "동적 post-hook 리스너를 등록합니다.",
      }),
      example: `this.listenPost("update", async (doc) => { ... });`,
    },
  ];

  const injectionMethods: IntroItem[] = [
    {
      name: "service<T>()",
      desc: l.trans({
        en: "Inject other services.",
        ko: "다른 서비스를 주입합니다.",
      }),
      example: `userService: service<UserService>()`,
    },
    {
      name: "use<T>()",
      desc: l.trans({
        en: "Inject external classes or variables.",
        ko: "외부 클래스나 변수를 주입합니다.",
      }),
      example: `paymentApi: use<PaymentApi>()`,
    },
    {
      name: "env<T>(key, factory?)",
      desc: l.trans({
        en: "Inject environment variable. Throws if missing.",
        ko: "환경 변수를 주입합니다. 없으면 에러를 발생시킵니다.",
      }),
      example: `apiKey: env("API_KEY")`,
    },
    {
      name: "envOptional<T>(key, factory?)",
      desc: l.trans({
        en: "Inject environment variable safely. Returns undefined if missing.",
        ko: "환경 변수를 안전하게 주입합니다. 없으면 undefined를 반환합니다.",
      }),
      example: `debugMode: envOptional("DEBUG")`,
    },
    {
      name: "generate<T>(factory)",
      desc: l.trans({
        en: "Generate a value dynamically based on environment.",
        ko: "환경에 따라 값을 동적으로 생성합니다.",
      }),
      example: `secret: generate((env) => getSecret(env))`,
    },
    {
      name: "signal<T>()",
      desc: l.trans({
        en: "Inject signal (Websocket/Queue) module.",
        ko: "시그널(웹소켓/큐) 모듈을 주입합니다.",
      }),
      example: `modelSignal: signal<ModelSignal>()`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="service-overview" title={"model.service.ts"}>
        <Docs.Title>{"model.service.ts"}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The service file is the heart of your business logic. It handles complex operations, coordinates between different modules, and ensures atomic data consistency.",
              ko: "service 파일은 비즈니스 로직의 핵심입니다. 복잡한 작업을 처리하고, 서로 다른 모듈 간을 조정하며, 원자적 데이터 일관성을 보장합니다.",
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🧠</span>
                <strong className="text-blue-800">{l.trans({ en: "Business Logic", ko: "비즈니스 로직" })}</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Validations, calculations, and decision-making logic reside here, separate from data definitions.",
                  ko: "유효성 검사, 계산, 의사 결정 로직이 데이터 정의와 분리되어 이곳에 존재합니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="class-structure" title={l.trans({ en: "Service Class Structure", ko: "Service 클래스 구조" })}>
        <Docs.Title>{l.trans({ en: "Service Class Structure", ko: "Service 클래스 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Services are defined using the serve() function, which binds the database model and allows dependency injection via a callback.",
              ko: "서비스는 serve() 함수를 사용하여 정의되며, 이 함수는 데이터베이스 모델을 바인딩하고 콜백을 통해 의존성 주입을 허용합니다.",
            })}
          </div>
          <Code.Snippet
            title="product.service.ts"
            code={`import { serve } from "@akanjs/service";
import * as db from "../db";
import type * as srv from "../srv";

// serve(model, dependencyCallback)
export class ProductService extends serve(db.product, ({ service }) => ({
  // Inject other services
  userService: service<srv.UserService>(),
  orderService: service<srv.OrderService>(),
})) {
  // Define methods
  async sellProduct(productId: string, quantity: number) {
    /* ... */
  }
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="predefined-methods" title={l.trans({ en: "Methods & Variables", ko: "메서드 및 변수" })}>
        <Docs.Title>{l.trans({ en: "Methods & Variables", ko: "메서드 및 변수" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The serve() function automatically equips your class with CRUD methods and access to the underlying model.",
              ko: "serve() 함수는 클래스에 CRUD 메서드와 기본 모델에 대한 접근 권한을 자동으로 장착합니다.",
            })}
          </div>
        </Docs.Description>

        <Docs.SubTitle>1.1. Predefined Variables</Docs.SubTitle>
        <Docs.IntroTable type="field" items={predefinedVariables} />

        <div className="mb-8" />

        <Docs.SubTitle>1.2. Predefined Methods (CRUD)</Docs.SubTitle>
        <Docs.IntroTable type="method" items={predefinedMethods} />

        <div className="mb-8" />

        <Docs.SubTitle>1.3. Query Based Methods</Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "Methods generated from 'Filter' definitions in model.document.ts.",
            ko: "model.document.ts의 'Filter' 정의에서 생성된 메서드들입니다.",
          })}
        </Docs.Description>
        <Docs.IntroTable type="method" items={queryBasedMethods} />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="middleware-methods" title={l.trans({ en: "Middleware Methods", ko: "미들웨어 메서드" })}>
        <Docs.Title>{l.trans({ en: "Middleware Methods", ko: "미들웨어 메서드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "You can override specific middleware methods to hook into the data creation process.",
              ko: "데이터 생성 과정에 개입하기 위해 특정 미들웨어 메서드를 재정의할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable type="method" items={middlewareMethods} />
        <div className="mb-4" />
        <div className="rounded-lg bg-base-200 p-3 lg:p-4">
          <div className="mb-2">
            <span className="font-bold font-mono text-primary text-sm">Example: _preCreate</span>
          </div>
          <Code.Snippet
            language="typescript"
            code={`async _preCreate(data: DataInputOf<db.ProductInput, db.Product>):
Promise<DataInputOf<db.ProductInput, db.Product>> {
  if (data.price < 0) throw new Error("Price cannot be negative");
  if (!data.sku) data.sku = this.generateSku();
  return data;
}`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="injections" title={l.trans({ en: "Dependency Injection", ko: "의존성 주입" })}>
        <Docs.Title>{l.trans({ en: "Dependency Injection", ko: "의존성 주입" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Dependencies are injected via the callback function in serve(). This ensures type safety and prevents circular dependency issues.",
              ko: "의존성은 serve()의 콜백 함수를 통해 주입됩니다. 이는 타입 안전성을 보장하고 순환 의존성 문제를 방지합니다.",
            })}
          </div>
        </Docs.Description>

        <Docs.SubTitle>3.1. Supported Injections</Docs.SubTitle>
        <Docs.IntroTable type="method" items={injectionMethods} />

        <div className="mb-8" />

        <Docs.SubTitle>3.2. Examples</Docs.SubTitle>
        <div className="mb-6 rounded-lg bg-base-200 p-3 lg:p-4">
          <Code.Snippet
            title="Injecting Services & Envs"
            language="typescript"
            code={`import type * as srv from '../srv';

export class ProductService extends serve(db.product, ({ service, env }) => ({
  userService: service<srv.UserService>(),
  paymentKey: env<string>("PAYMENT_KEY"),
})) {
  /* ... */
}`}
          />
        </div>

        <div className="rounded-lg bg-orange-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-orange-600">⚠️</span>
            <strong className="text-orange-800">{l.trans({ en: "Injection Setup", ko: "주입 설정" })}</strong>
          </div>
          <Docs.Description>
            {l.trans({
              en: "Global injections must be registered in lib/option.ts using useGlobals().",
              ko: "전역 주입은 lib/option.ts 파일에서 useGlobals()를 사용하여 등록해야 합니다.",
            })}
          </Docs.Description>
          <div className="mt-2 rounded bg-orange-100 p-3 text-sm">
            <Code.Snippet
              title="lib/option.ts"
              language="typescript"
              code={`export const registerGlobalModule = (options: ModulesOptions) => {
  return useGlobals({
    uses: {
      emailApi: options.mailer ? new EmailApi(options.mailer) : null,
    },
    useAsyncs: {
      customApi: async () => await new CustomApi().init(),
    },
  });
};`}
            />
          </div>
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="best-practices" title={l.trans({ en: "Service Best Practices", ko: "Service 모범 사례" })}>
        <Docs.Title>{l.trans({ en: "Service Best Practices", ko: "Service 모범 사례" })}</Docs.Title>
        <Docs.Description>
          <div className="my-4 space-y-4">
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">1️⃣</span>
                <strong className="text-blue-800">
                  {l.trans({ en: "Keep Document Pure", ko: "Document는 순수하게" })}
                </strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Put simple state changes in Document methods. Put complex logic involving other services in Service methods.",
                  ko: "단순한 상태 변경은 Document 메서드에 둡니다. 다른 서비스가 포함된 복잡한 로직은 Service 메서드에 둡니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">2️⃣</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Use Auto-generated Methods", ko: "자동 생성 메서드 활용" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Prefer auto-generated list/find methods over raw DB queries. They maintain consistency and type safety.",
                  ko: "원시 DB 쿼리보다 자동 생성된 list/find 메서드를 선호하세요. 일관성과 타입 안전성을 유지합니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
