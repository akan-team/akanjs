import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const filterBuilderMethods: IntroItem[] = [
    {
      name: ".arg(name, Type, options?)",
      desc: l.trans({
        en: "Required parameter. Options include { ref, renderOption } for UI rendering in admin panels.",
        ko: "필수 파라미터. 관리자 패널의 UI 렌더링을 위한 { ref, renderOption } 옵션 포함.",
      }),
      example: `.arg("categoryId", ID)`,
    },
    {
      name: ".opt(name, Type, options?)",
      desc: l.trans({
        en: "Optional parameter. Value will be undefined if not provided. Use conditional spread in query.",
        ko: "선택적 파라미터. 제공되지 않으면 undefined. 쿼리에서 조건부 스프레드 사용.",
      }),
      example: `.opt("minPrice", Int)`,
    },
    {
      name: ".query((...args) => MongoQuery)",
      desc: l.trans({
        en: "Returns MongoDB query object. Arguments match the order of .arg() and .opt() calls.",
        ko: "MongoDB 쿼리 객체를 반환합니다. 인수는 .arg()와 .opt() 호출 순서와 일치합니다.",
      }),
      example: `.query((id, price) => ({ category: id, price: { $gte: price } }))`,
    },
  ];

  const documentBuiltInMethods: IntroItem[] = [
    {
      name: "this.set(data)",
      desc: l.trans({
        en: "Set multiple fields at once. Equivalent to Object.assign(this, data)",
        ko: "여러 필드를 한 번에 설정. Object.assign(this, data)와 동일",
      }),
      example: `this.set({ status: "active", price: 100 });`,
    },
    {
      name: "await this.save()",
      desc: l.trans({
        en: "Persist changes to MongoDB. Returns the saved document.",
        ko: "변경사항을 MongoDB에 저장. 저장된 문서를 반환.",
      }),
      example: `await this.save();`,
    },
    {
      name: "await this.refresh()",
      desc: l.trans({
        en: "Reload document from database, discarding local changes.",
        ko: "데이터베이스에서 문서를 다시 로드하고 로컬 변경사항을 삭제.",
      }),
      example: `await this.refresh();`,
    },
  ];

  const customLoaders: IntroItem[] = [
    {
      name: "byField(field)",
      desc: l.trans({ en: "Single doc by unique field", ko: "고유 필드로 단일 문서" }),
      example: `loader: byField("email")`,
    },
    {
      name: "byArrayField(field)",
      desc: l.trans({ en: "Multiple docs by field value", ko: "필드 값으로 여러 문서" }),
      example: `loader: byArrayField("role")`,
    },
    {
      name: "byQuery([fields])",
      desc: l.trans({ en: "Doc by multiple field conditions", ko: "여러 필드 조건으로 문서" }),
      example: `loader: byQuery(["org", "role"])`,
    },
  ];

  const autoCrudMethods: IntroItem[] = [
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

  const autoQueryMethods: IntroItem[] = [
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

  return (
    <Scroll>
      <Scroll.Slide id="document-overview" title={"model.document.ts"}>
        <Docs.Title>{"model.document.ts"}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The document file defines database operations for your module. For a high-level overview of the document schema structure (Input, Object, Light, Model), please refer to the Module Overview.",
              ko: "document 파일은 모듈의 데이터베이스 작업을 정의합니다. 문서 스키마 구조(Input, Object, Light, Model)에 대한 개요는 Module Overview를 참조하세요.",
            })}
          </div>
          <div>
            {l.trans({
              en: "This page focuses on the detailed API methods and properties available in the Document layer.",
              ko: "이 페이지는 Document 계층에서 사용할 수 있는 상세 API 메서드와 속성에 중점을 둡니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>

      <div className="divider" />

      <Scroll.Slide
        id="filter-definition"
        title={l.trans({ en: "Filter Definition - from()", ko: "Filter 정의 - from()" })}
      >
        <Docs.Title>{l.trans({ en: "Filter Definition - from()", ko: "Filter 정의 - from()" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The Filter class defines reusable query patterns. Each query becomes a set of auto-generated methods (list, find, count, insight, etc.).",
              ko: "Filter 클래스는 재사용 가능한 쿼리 패턴을 정의합니다. 각 쿼리는 자동 생성된 메서드 세트(list, find, count, insight 등)가 됩니다.",
            })}
          </div>
          <Code.Snippet
            title="product.document.ts"
            code={`import { ID, Int } from "@akanjs/base";
import { from } from "@akanjs/document";
import * as cnst from "../cnst";

export class ProductFilter extends from(cnst.Product, (filter) => ({
  query: {
    // Basic query with required argument
    inCategory: filter()
      .arg("categoryId", ID)  // Required parameter
      .query((categoryId) => ({
        category: categoryId,
        status: { $ne: "archived" },
      })),
    
    // Query with optional arguments
    inCategories: filter()
      .arg("categoryIds", [ID])    // Required array
      .opt("minPrice", Int)        // Optional number
      .query((categoryIds, minPrice) => ({
        category: { $in: categoryIds },
        status: { $ne: "archived" },
        ...(minPrice ? { price: { $gte: minPrice } } : {}),
      })),
  },
  sort: {
    // Custom sort definitions (optional)
    byPrice: { price: 1 },
    byPopular: { soldCount: -1, createdAt: -1 },
  },
})) {}`}
          />
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-yellow-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-yellow-600">⚡</span>
                <strong className="text-yellow-800">
                  {l.trans({ en: "Built-in Query & Sort", ko: "기본 제공 Query & Sort" })}
                </strong>
              </div>
              <div className="text-sm text-yellow-700">
                {l.trans({
                  en: "Every Filter automatically includes:",
                  ko: "모든 Filter에 자동으로 포함됩니다:",
                })}
              </div>
              <Code.Snippet
                code={`// Built-in query
query: {
  any: filter().query(() => ({})),  // Match all documents
  // ... your custom queries
}

// Built-in sort
sort: {
  latest: { createdAt: -1 },  // Newest first
  oldest: { createdAt: 1 },   // Oldest first
  // ... your custom sorts
}`}
              />
            </div>
          </div>
          <Code.Snippet
            title="Using Built-in Methods"
            code={`// Use built-in 'any' query with sort
await this.listAny({ sort: "latest" });   // All products, newest first
await this.listAny({ sort: "oldest" });   // All products, oldest first
await this.listAny({ sort: "byPopular" }); // Use custom sort

// Combine with options
await this.listAny({ skip: 0, limit: 10, sort: "latest" });
await this.countAny();   // Count all documents
await this.insightAny(); // Aggregate insight for all`}
          />
          <div>
            {l.trans({
              en: "Understanding filter builder methods:",
              ko: "필터 빌더 메서드 이해하기:",
            })}
          </div>
          <div className="my-4" />
          <Docs.IntroTable type="method" items={filterBuilderMethods} />
          <div>
            {l.trans({
              en: "Auto-generated methods from filters:",
              ko: "필터에서 자동 생성되는 메서드:",
            })}
          </div>
          <Code.Snippet
            title="Auto-generated Query Methods"
            code={`// From 'inCategory' filter, these methods are auto-generated:
await this.listInCategory(categoryId);           // Product[]
await this.listIdsInCategory(categoryId);        // string[]
await this.findInCategory(categoryId);           // Product | null
await this.findIdInCategory(categoryId);         // string | null
await this.pickInCategory(categoryId);           // Product (throws if not found)
await this.pickIdInCategory(categoryId);         // string (throws if not found)
await this.countInCategory(categoryId);          // number
await this.existsInCategory(categoryId);         // string | false
await this.insightInCategory(categoryId);        // ProductInsight

// With options - use sort key names
await this.listInCategory(categoryId, { skip: 0, limit: 10, sort: "latest" });`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="document-class" title={l.trans({ en: "Document Class - by()", ko: "Document 클래스 - by()" })}>
        <Docs.Title>{l.trans({ en: "Document Class - by()", ko: "Document 클래스 - by()" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The Document class defines instance methods that operate on individual documents. Methods should modify 'this' and return 'this' for method chaining.",
              ko: "Document 클래스는 개별 문서에서 작동하는 인스턴스 메서드를 정의합니다. 메서드는 'this'를 수정하고 메서드 체이닝을 위해 'this'를 반환해야 합니다.",
            })}
          </div>
          <Code.Snippet
            title="product.document.ts"
            code={`import { by } from "@akanjs/document";
import * as cnst from "../cnst";

export class Product extends by(cnst.Product) {
  // State transition - modify 'this' and return 'this' for chaining
  sell(quantity: number) {
    this.stock -= quantity;
    this.soldCount += quantity;
    if (this.stock <= 0) this.status = "soldOut";
    return this;
  }
  
  // Validation method
  canSell(quantity: number) {
    return this.stock >= quantity && this.status === "active";
  }
}`}
          />
          <div>
            {l.trans({
              en: "Built-in document methods:",
              ko: "내장된 문서 메서드:",
            })}
          </div>
          <div className="my-4" />
          <Docs.IntroTable type="method" items={documentBuiltInMethods} />
          <Docs.Alert>
            <div>
              {l.trans({
                en: "💡 Best Practice: Document methods should be pure state mutations. Business logic (notifications, validations across services) belongs in the Service layer.",
                ko: "💡 모범 사례: Document 메서드는 순수한 상태 변이여야 합니다. 비즈니스 로직(알림, 서비스 간 유효성 검사)은 Service 계층에 속합니다.",
              })}
            </div>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="model-class" title={l.trans({ en: "Model Class - into()", ko: "Model 클래스 - into()" })}>
        <Docs.Title>{l.trans({ en: "Model Class - into()", ko: "Model 클래스 - into()" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The Model class combines Document and Filter, adding collection-level operations. It auto-generates CRUD methods, query methods, and loaders.",
              ko: "Model 클래스는 Document와 Filter를 결합하여 컬렉션 레벨 작업을 추가합니다. CRUD 메서드, 쿼리 메서드, 로더를 자동 생성합니다.",
            })}
          </div>
          <Code.Snippet
            title="into() Signature"
            code={`// into(Document, Filter, cnst.modelName, loaderBuilder)
export class ProductModel extends into(
  Product,           // Document class
  ProductFilter,     // Filter class  
  cnst.product,      // Model config from constant
  ({ byField, byArrayField, byQuery }) => ({
    // Custom loaders (optional)
  })
) {
  // Custom collection methods
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="auto-crud-methods"
        title={l.trans({ en: "Auto-generated CRUD Methods", ko: "자동 생성 CRUD 메서드" })}
      >
        <Docs.Title>{l.trans({ en: "Auto-generated CRUD Methods", ko: "자동 생성 CRUD 메서드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The Model class automatically generates these CRUD methods based on your model name:",
              ko: "Model 클래스는 모델 이름을 기반으로 다음 CRUD 메서드를 자동 생성합니다:",
            })}
          </div>
          <Docs.IntroTable type="method" items={autoCrudMethods} />
          <Code.Snippet
            title="Additional Access"
            code={`// Native Mongoose model access
const products = await this.Product.find({ status: "active" });

// Built-in DataLoader for batched lookups
const product = await this.productLoader.load(id);  // Product | null

// Cache & Search
this.productCache;   // Redis cache
this.productSearch;  // Meilisearch`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="auto-query-methods"
        title={l.trans({ en: "Auto-generated Query Methods", ko: "자동 생성 쿼리 메서드" })}
      >
        <Docs.Title>{l.trans({ en: "Auto-generated Query Methods", ko: "자동 생성 쿼리 메서드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "For each query defined in Filter, 10 utility methods are auto-generated:",
              ko: "Filter에 정의된 각 쿼리에 대해 10개의 유틸리티 메서드가 자동 생성됩니다:",
            })}
          </div>
          <Docs.IntroTable type="method" items={autoQueryMethods} />
          <Docs.Alert>
            <div>
              {l.trans({
                en: "💡 The query name becomes PascalCase in method names: 'inCategory' → 'listInCategory', 'findInCategory'",
                ko: "💡 쿼리 이름은 메서드 이름에서 PascalCase가 됩니다: 'inCategory' → 'listInCategory', 'findInCategory'",
              })}
            </div>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="loaders" title={l.trans({ en: "Custom Loaders", ko: "커스텀 로더" })}>
        <Docs.Title>{l.trans({ en: "Custom Loaders", ko: "커스텀 로더" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The 4th argument of into() allows defining custom DataLoaders for efficient batched lookups by specific fields.",
              ko: "into()의 4번째 인수로 특정 필드별 효율적인 배치 조회를 위한 커스텀 DataLoader를 정의할 수 있습니다.",
            })}
          </div>
          <Code.Snippet
            title="Custom Loader Definition"
            code={`export class AdminModel extends into(Admin, AdminFilter, cnst.admin, ({ byField, byArrayField, byQuery }) => ({
  adminAccountIdLoader: byField("accountId"),           // Doc | null by unique field
  adminsByRoleLoader: byArrayField("role"),             // Doc[] by non-unique field
  adminByOrgRoleLoader: byQuery(["org", "role"] as const), // Doc | null by multiple fields
})) {
  async getByAccountId(accountId: string) {
    return await this.adminAccountIdLoader.load(accountId);
  }
}`}
          />
          <div className="my-4" />
          <Docs.IntroTable type="method" items={customLoaders} />
          <Docs.Alert>
            <div>
              {l.trans({
                en: "💡 DataLoaders automatically batch multiple .load() calls into a single DB query, improving performance in GraphQL resolvers and loops.",
                ko: "💡 DataLoader는 여러 .load() 호출을 자동으로 단일 DB 쿼리로 배치하여 GraphQL 리졸버와 루프에서 성능을 향상시킵니다.",
              })}
            </div>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="middleware-class" title={l.trans({ en: "Middleware Class", ko: "Middleware 클래스" })}>
        <Docs.Title>{l.trans({ en: "Middleware Class", ko: "Middleware 클래스" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The Middleware class provides access to the Mongoose schema for adding indexes and hooks. The onSchema method receives the schema for configuration.",
              ko: "Middleware 클래스는 인덱스와 훅을 추가하기 위해 Mongoose 스키마에 접근을 제공합니다. onSchema 메서드는 구성을 위해 스키마를 받습니다.",
            })}
          </div>
          <Code.Snippet
            title="product.document.ts"
            code={`export class ProductMiddleware extends beyond(ProductModel, Product) {
  onSchema(schema: SchemaOf<ProductModel, Product>) {
    // Indexes for query performance
    schema.index({ status: 1, category: 1 });
    schema.index({ name: "text" });  // Text search index
    
    // Pre-save hook for computed fields
    schema.pre<Product>("save", function (next) {
      if (this.stock <= 0) this.status = "soldOut";
      next();
    });
  }
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="usage-in-service" title={l.trans({ en: "Document in Service", ko: "Service의 Document" })}>
        <Docs.Title>{l.trans({ en: "Document in Service", ko: "Service의 Document" })}</Docs.Title>
        <Docs.Description>
          <Code.Snippet
            title="product.service.ts"
            code={`export class ProductService extends serve(db.product, ({ service }) => ({
  orderService: service<srv.OrderService>(),
})) {
  async sellProduct(productId: string, quantity: number) {
    const product = await this.getProduct(productId);  // Auto-generated method
    if (!product.canSell(quantity)) throw new Error("Cannot sell");
    return await product.sell(quantity).save();   // Document method + save
  }
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="best-practices" title={l.trans({ en: "Best Practices", ko: "모범 사례" })}>
        <Docs.Title>{l.trans({ en: "Best Practices", ko: "모범 사례" })}</Docs.Title>
        <Docs.Description>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-blue-600">1️⃣</span>
              <div>
                {l.trans({
                  en: "Document methods return 'this' for chaining: product.sell(5).save()",
                  ko: "Document 메서드는 체이닝을 위해 'this' 반환: product.sell(5).save()",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600">2️⃣</span>
              <div>
                {l.trans({
                  en: "Keep Document methods pure - external calls belong in Service",
                  ko: "Document 메서드는 순수하게 - 외부 호출은 Service에서",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-600">3️⃣</span>
              <div>
                {l.trans({
                  en: "Define queries in Filter for type-safe auto-generated methods",
                  ko: "타입 안전한 자동 생성 메서드를 위해 Filter에서 쿼리 정의",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-yellow-600">4️⃣</span>
              <div>
                {l.trans({
                  en: "Add indexes in Middleware for fields used in filters",
                  ko: "필터에서 사용되는 필드에 Middleware에서 인덱스 추가",
                })}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-orange-600">5️⃣</span>
              <div>
                {l.trans({
                  en: "Use custom loaders (byField/byArrayField) for N+1 prevention",
                  ko: "N+1 방지를 위해 커스텀 로더 (byField/byArrayField) 사용",
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
