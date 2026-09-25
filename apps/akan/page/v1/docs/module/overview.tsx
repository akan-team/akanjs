import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const fileStructureItems: IntroItem[] = [
    {
      name: "constant.ts",
      desc: l.trans({
        en: "Defines data models using the via() function pattern for type-safe schema definitions",
        ko: "via() 함수 패턴을 사용하여 타입 안전한 스키마 정의를 위한 데이터 모델 정의",
      }),
      example: null,
    },
    {
      name: "document.ts",
      desc: l.trans({
        en: "MongoDB schema with filters, methods, and middleware using from(), by(), into(), beyond()",
        ko: "from(), by(), into(), beyond()를 사용한 필터, 메서드, 미들웨어가 포함된 MongoDB 스키마",
      }),
      example: null,
    },
    {
      name: "service.ts",
      desc: l.trans({
        en: "Business logic implementation using serve() with dependency injection",
        ko: "의존성 주입과 함께 serve()를 사용한 비즈니스 로직 구현",
      }),
      example: null,
    },
    {
      name: "signal.ts",
      desc: l.trans({
        en: "API endpoints using slice() and endpoint() for type-safe client-server communication",
        ko: "타입 안전한 클라이언트-서버 통신을 위한 slice()와 endpoint() 사용 API 엔드포인트",
      }),
      example: null,
    },
    {
      name: "store.ts",
      desc: l.trans({
        en: "Client-side state management using store() with automatic slice integration",
        ko: "자동 슬라이스 통합이 포함된 store()를 사용한 클라이언트 측 상태 관리",
      }),
      example: null,
    },
  ];

  const constantItems: IntroItem[] = [
    {
      name: "enumOf()",
      desc: l.trans({
        en: "Creates a type-safe enum class with the given name and values. Use 'as const' to preserve literal types for strict type checking.",
        ko: "주어진 이름과 값으로 타입 안전한 enum 클래스를 생성합니다. 엄격한 타입 검사를 위해 리터럴 타입을 보존하려면 'as const'를 사용하세요.",
      }),
      example: null,
    },
    {
      name: "via((field) => ({...}))",
      desc: l.trans({
        en: "The field() function defines each property with its type, default value, validation, and other options like .optional() for nullable fields.",
        ko: "field() 함수는 각 속성을 타입, 기본값, 유효성 검사, nullable 필드를 위한 .optional() 같은 옵션과 함께 정의합니다.",
      }),
      example: null,
    },
    {
      name: "Class Hierarchy",
      desc: l.trans({
        en: "Input → Object → Light → Model. Each layer adds specific functionality. Light classes select specific fields for optimized list queries.",
        ko: "Input → Object → Light → Model 순서입니다. 각 계층은 특정 기능을 추가합니다. Light 클래스는 최적화된 목록 쿼리를 위해 특정 필드를 선택합니다.",
      }),
      example: null,
    },
  ];

  const documentItems: IntroItem[] = [
    {
      name: "from() - Filter Definition",
      desc: l.trans({
        en: "Defines reusable query patterns with .arg() for required parameters and .opt() for optional ones. The .query() method returns the MongoDB query object.",
        ko: "필수 파라미터를 위한 .arg()와 선택적 파라미터를 위한 .opt()로 재사용 가능한 쿼리 패턴을 정의합니다. .query() 메서드는 MongoDB 쿼리 객체를 반환합니다.",
      }),
      example: null,
    },
    {
      name: "by() - Document Methods",
      desc: l.trans({
        en: "Creates a document class with instance methods that operate on individual documents. Methods can modify the document and should return 'this' for chaining.",
        ko: "개별 문서에서 작동하는 인스턴스 메서드가 있는 문서 클래스를 생성합니다. 메서드는 문서를 수정할 수 있으며 체이닝을 위해 'this'를 반환해야 합니다.",
      }),
      example: null,
    },
    {
      name: "into() - Model Operations",
      desc: l.trans({
        en: "Creates a model class with collection-level operations. Auto-generates query methods from filters (e.g., queryInCategory from inCategory filter).",
        ko: "컬렉션 수준 작업이 있는 모델 클래스를 생성합니다. 필터에서 쿼리 메서드를 자동 생성합니다 (예: inCategory 필터에서 queryInCategory).",
      }),
      example: null,
    },
    {
      name: "beyond() - Middleware",
      desc: l.trans({
        en: "Adds schema-level configurations like indexes, pre/post hooks, and virtual fields through the onSchema method.",
        ko: "onSchema 메서드를 통해 인덱스, pre/post 훅, 가상 필드 같은 스키마 수준 구성을 추가합니다.",
      }),
      example: null,
    },
  ];

  const serviceItems: IntroItem[] = [
    {
      name: "serve()",
      desc: l.trans({
        en: "Creates a service class that automatically inherits CRUD operations from the document model (getProduct, loadProductMany, etc.).",
        ko: "문서 모델에서 CRUD 작업(getProduct, loadProductMany 등)을 자동으로 상속받는 서비스 클래스를 생성합니다.",
      }),
      example: null,
    },
    {
      name: "service<T>()",
      desc: l.trans({
        en: "Dependency injection for other services. Declared services are automatically available as this.serviceName in methods.",
        ko: "다른 서비스를 위한 의존성 주입입니다. 선언된 서비스는 메서드에서 this.serviceName으로 자동 사용 가능합니다.",
      }),
      example: null,
    },
    {
      name: "Method Chaining",
      desc: l.trans({
        en: "Document methods return 'this' allowing chains like product.sell(5).save(). Always call .save() to persist changes.",
        ko: "문서 메서드가 'this'를 반환하여 product.sell(5).save() 같은 체이닝이 가능합니다. 변경사항을 저장하려면 항상 .save()를 호출하세요.",
      }),
      example: null,
    },
  ];

  const signalItems: IntroItem[] = [
    {
      name: "slice()",
      desc: l.trans({
        en: "Defines data-fetching endpoints that support pagination, search, and real-time updates. Use .param() for URL params and .search() for query strings.",
        ko: "페이지네이션, 검색, 실시간 업데이트를 지원하는 데이터 가져오기 엔드포인트를 정의합니다. URL 파라미터에는 .param()을, 쿼리 스트링에는 .search()를 사용합니다.",
      }),
      example: null,
    },
    {
      name: "endpoint() + mutation()",
      desc: l.trans({
        en: "Defines mutation endpoints that modify data. First argument is the return type, then guards, params (.param()), and body data (.body()).",
        ko: "데이터를 수정하는 mutation 엔드포인트를 정의합니다. 첫 번째 인수는 반환 타입, 그 다음 가드, 파라미터(.param()), 바디 데이터(.body())입니다.",
      }),
      example: null,
    },
    {
      name: "guards",
      desc: l.trans({
        en: "Access control with Admin, User, Every, Public guards. Use .with(Self) to inject the current user context into the exec function.",
        ko: "Admin, User, Every, Public 가드로 접근 제어합니다. .with(Self)를 사용하여 현재 사용자 컨텍스트를 exec 함수에 주입합니다.",
      }),
      example: null,
    },
    {
      name: "srv.product.with()",
      desc: l.trans({
        en: "Combines multiple services for cross-module operations. All combined services are available as this.serviceName in exec functions.",
        ko: "모듈 간 작업을 위해 여러 서비스를 결합합니다. 결합된 모든 서비스는 exec 함수에서 this.serviceName으로 사용 가능합니다.",
      }),
      example: null,
    },
  ];

  const storeItems: IntroItem[] = [
    {
      name: "store(sig.module, state)",
      desc: l.trans({
        en: "Creates a store class connected to the signal. Auto-generates state and setters for slices (productList, setProduct, productForm, etc.).",
        ko: "시그널에 연결된 스토어 클래스를 생성합니다. 슬라이스를 위한 상태와 setter를 자동 생성합니다 (productList, setProduct, productForm 등).",
      }),
      example: null,
    },
    {
      name: "fetch",
      desc: l.trans({
        en: "Type-safe API client auto-generated from signals. Methods match signal endpoint names (fetch.sellProduct, fetch.createProduct).",
        ko: "시그널에서 자동 생성된 타입 안전한 API 클라이언트입니다. 메서드는 시그널 엔드포인트 이름과 일치합니다 (fetch.sellProduct, fetch.createProduct).",
      }),
      example: null,
    },
    {
      name: "msg",
      desc: l.trans({
        en: "Toast notification helper using dictionary keys. msg.loading(), msg.success(), msg.error() with translation support.",
        ko: "딕셔너리 키를 사용하는 토스트 알림 헬퍼입니다. 번역을 지원하는 msg.loading(), msg.success(), msg.error()를 제공합니다.",
      }),
      example: null,
    },
  ];

  const uiItems: IntroItem[] = [
    {
      name: "Template - Form Components",
      desc: l.trans({
        en: "Form components that use st.use.[model]Form() for state and st.do.set[Field]On[Model] for updates. Wrapped in Layout.Template.",
        ko: "상태를 위해 st.use.[model]Form()을, 업데이트를 위해 st.do.set[Field]On[Model]을 사용하는 폼 컴포넌트입니다. Layout.Template으로 감싸집니다.",
      }),
      example: null,
    },
    {
      name: "Unit - Card Components",
      desc: l.trans({
        en: "Displays LightModel data in card/list format. Receives the model as a prop and renders summarized information with optional actions.",
        ko: "LightModel 데이터를 카드/리스트 형식으로 표시합니다. 모델을 prop으로 받고 선택적 액션과 함께 요약 정보를 렌더링합니다.",
      }),
      example: null,
    },
    {
      name: "View - Detail Components",
      desc: l.trans({
        en: "Shows full model details. Receives the complete model (not Light) and displays all relevant information in a structured layout.",
        ko: "전체 모델 상세 정보를 표시합니다. 완전한 모델(Light가 아닌)을 받아 구조화된 레이아웃에 모든 관련 정보를 표시합니다.",
      }),
      example: null,
    },
    {
      name: "Zone - Layout Components",
      desc: l.trans({
        en: "Container components that handle data loading via Load.Units and organize Unit/View components. Often include modals and real-time refresh.",
        ko: "Load.Units를 통해 데이터 로딩을 처리하고 Unit/View 컴포넌트를 구성하는 컨테이너 컴포넌트입니다. 종종 모달과 실시간 새로고침을 포함합니다.",
      }),
      example: null,
    },
    {
      name: "Util - Action Components",
      desc: l.trans({
        en: "Reusable action buttons and utilities (Process, Serve, Cancel). Accept modelId and disabled props, call store methods on click.",
        ko: "재사용 가능한 액션 버튼과 유틸리티입니다(Process, Serve, Cancel). modelId와 disabled props를 받고, 클릭 시 스토어 메서드를 호출합니다.",
      }),
      example: null,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide
        id="module-overview"
        title={l.trans({
          en: "Database Module in Akan.js",
          ko: "Akan.js 데이터베이스 모듈",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Database Module in Akan.js",
            ko: "Akan.js 데이터베이스 모듈",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Database modules in Akan.js provide a structured approach to building domain-specific features with seamless integration between server and client. Each module encapsulates all related functionality - from data models to UI components - in a consistent, type-safe structure.",
              ko: "Akan.js의 데이터베이스 모듈은 서버와 클라이언트 간의 원활한 통합을 통해 도메인별 기능을 구축하는 구조화된 접근 방식을 제공합니다. 각 모듈은 데이터 모델부터 UI 컴포넌트까지 관련된 모든 기능을 일관되고 타입 안전한 구조로 캡슐화합니다.",
            })}
          </div>
          <div className="my-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">📦</span>
                <strong className="text-blue-800">
                  {l.trans({ en: "Domain Encapsulation", ko: "도메인 캡슐화" })}
                </strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Encapsulate all domain-specific logic in a consistent structure",
                  ko: "일관된 구조로 도메인별 로직 캡슐화",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">🔗</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Full-Stack Integration", ko: "풀스택 통합" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Seamless integration between MongoDB, NestJS server, and React client",
                  ko: "MongoDB, NestJS 서버 및 React 클라이언트 간의 원활한 통합",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">🔒</span>
                <strong className="text-purple-800">{l.trans({ en: "Type Safety", ko: "타입 안전성" })}</strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: "Ensure type safety across entire stack with auto-generated types",
                  ko: "자동 생성된 타입으로 전체 스택에 걸쳐 타입 안전성 보장",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-yellow-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-yellow-600">⚡</span>
                <strong className="text-yellow-800">{l.trans({ en: "Automated CRUD", ko: "자동 CRUD" })}</strong>
              </div>
              <div className="text-sm text-yellow-700">
                {l.trans({
                  en: "Provide automatic CRUD operations through standardized patterns",
                  ko: "표준화된 패턴을 통한 자동 CRUD 작업 제공",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="file-structure" title={l.trans({ en: "File Structure", ko: "파일 구조" })}>
        <Docs.Title>{l.trans({ en: "File Structure", ko: "파일 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A complete database module follows this structured organization. Think of it like organizing a restaurant kitchen - each station has its specific role, and together they create a seamless dining experience.",
              ko: "완전한 데이터베이스 모듈은 다음 구조를 따릅니다. 레스토랑 주방을 정리하는 것처럼 생각하세요 - 각 스테이션은 특정 역할을 가지며, 함께 원활한 식사 경험을 만들어냅니다.",
            })}
          </div>
          <Code.Snippet
            title="Module Directory Structure"
            code={`libs/shared/lib/[module-name]/
├── [ModuleName].Template.tsx      # Form components for creating/editing
├── [ModuleName].Unit.tsx          # Card/list item components
├── [ModuleName].Util.tsx          # Utility components (buttons, actions)
├── [ModuleName].View.tsx          # Detailed view components
├── [ModuleName].Zone.tsx          # Layout containers with data loading
├── [module-name].constant.ts      # Model definitions and types
├── [module-name].dictionary.ts    # Internationalization translations
├── [module-name].document.ts      # Database schema and filters
├── [module-name].service.ts       # Business logic implementation
├── [module-name].signal.ts        # API endpoints (slice, endpoint)
├── [module-name].store.ts         # Client-side state management
└── index.tsx                      # Module exports`}
          />
          <div className="my-4" />
          <Docs.IntroTable type="field" items={fileStructureItems} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="constant-model"
        title={l.trans({
          en: "Creating a Model Schema",
          ko: "모델 스키마 생성",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Creating a Model Schema",
            ko: "모델 스키마 생성",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Define your data model using the via() function pattern. This approach provides type-safe field definitions with validation, default values, and relationships.",
              ko: "via() 함수 패턴을 사용하여 데이터 모델을 정의합니다. 이 접근 방식은 유효성 검사, 기본값, 관계와 함께 타입 안전한 필드 정의를 제공합니다.",
            })}
          </div>
          <Code.Snippet
            title="product.constant.ts"
            code={`import { enumOf, Int } from "@akanjs/base";
import { via } from "@akanjs/constant";

// Define enum using enumOf()
export class ProductStatus extends enumOf("productStatus", [
  "active", "soldOut", "archived",
] as const) {}

// Input class - fields required for creation
export class ProductInput extends via((field) => ({
  name: field(String),
  price: field(Int),
  description: field(String, { default: "" }),
  category: field(LightCategory),
})) {}

// Object class - extends Input with additional fields
export class ProductObject extends via(ProductInput, (field) => ({
  status: field(ProductStatus, { default: "active" }),
  stock: field(Int, { default: 0 }),
  images: field([shared.File]),
})) {}

// Light class - subset of fields for list views
export class LightProduct extends via(
  ProductObject,
  ["name", "price", "status", "category"] as const,
  (resolve) => ({})
) {}

// Full model class - combines Object and Light
export class Product extends via(ProductObject, LightProduct, (resolve) => ({})) {
  static getActiveList(products: LightProduct[]) {
    return products.filter((p) => p.status === "active");
  }
}`}
          />
          <div>
            {l.trans({
              en: "Let's understand the key concepts of the model definition:",
              ko: "모델 정의의 핵심 개념을 이해해봅시다:",
            })}
          </div>
          <div className="my-4" />
          <Docs.IntroTable type="field" items={constantItems} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="document-schema"
        title={l.trans({
          en: "Implementing Database Schema",
          ko: "데이터베이스 스키마 구현",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Implementing Database Schema",
            ko: "데이터베이스 스키마 구현",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Create MongoDB schema with filters, document methods, and middleware using the functional pattern. This file bridges your constant definitions with the actual database operations.",
              ko: "함수형 패턴을 사용하여 필터, 문서 메서드, 미들웨어가 포함된 MongoDB 스키마를 생성합니다. 이 파일은 constant 정의와 실제 데이터베이스 작업을 연결합니다.",
            })}
          </div>
          <Code.Snippet
            title="product.document.ts"
            code={`import { ID, Int } from "@akanjs/base";
import { beyond, by, from, into, type SchemaOf } from "@akanjs/document";

import * as cnst from "../cnst";

// Filter class - defines query patterns
export class ProductFilter extends from(cnst.Product, (filter) => ({
  query: {
    inCategory: filter()
      .arg("categoryId", ID)
      .query((categoryId) => ({
        category: categoryId,
        status: { $ne: "archived" },
      })),
  },
  sort: { byPrice: { price: 1 } },
})) {}

// Document class - instance methods (return 'this' for chaining)
export class Product extends by(cnst.Product) {
  sell(quantity: number) {
    this.stock -= quantity;
    if (this.stock <= 0) this.status = "soldOut";
    return this;
  }
}

// Model class - collection operations
export class ProductModel extends into(Product, ProductFilter, cnst.product, () => ({})) {}

// Middleware class - schema hooks and indexes
export class ProductMiddleware extends beyond(ProductModel, Product) {
  onSchema(schema: SchemaOf<ProductModel, Product>) {
    schema.index({ category: 1, status: 1 });
  }
}`}
          />
          <div>
            {l.trans({
              en: "Let's understand the document layer functions:",
              ko: "문서 계층 함수들을 이해해봅시다:",
            })}
          </div>
          <div className="my-4" />
          <Docs.IntroTable type="field" items={documentItems} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="service-logic"
        title={l.trans({
          en: "Business Logic in Services",
          ko: "서비스의 비즈니스 로직",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Business Logic in Services",
            ko: "서비스의 비즈니스 로직",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Services contain the business logic of your application. They orchestrate document operations, handle cross-module dependencies, and implement complex workflows.",
              ko: "서비스는 애플리케이션의 비즈니스 로직을 포함합니다. 문서 작업을 조율하고, 모듈 간 의존성을 처리하며, 복잡한 워크플로우를 구현합니다.",
            })}
          </div>
          <Code.Snippet
            title="product.service.ts"
            code={`import { serve } from "@akanjs/service";

import * as db from "../db";
import type * as srv from "../srv";

export class ProductService extends serve(db.product, ({ service }) => ({
  orderService: service<srv.OrderService>(),
})) {
  async sellProduct(productId: string, quantity: number, buyerId: string) {
    const product = await this.getProduct(productId);  // Auto-generated method
    if (product.stock < quantity) throw new Error("Out of stock");
    
    // Create order using injected service
    await this.orderService.createOrder({ product: productId, quantity, buyer: buyerId });

    // Document method + save
    return await product.sell(quantity).save();
  }
}`}
          />
          <div>
            {l.trans({
              en: "Key aspects of the service layer:",
              ko: "서비스 계층의 핵심 요소:",
            })}
          </div>
          <div className="my-4" />
          <Docs.IntroTable type="field" items={serviceItems} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="signal-api"
        title={l.trans({
          en: "Defining API Endpoints",
          ko: "API 엔드포인트 정의",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Defining API Endpoints",
            ko: "API 엔드포인트 정의",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Signals define the API layer that connects clients to services. They include slices for data fetching and endpoints for mutations, all with type-safe parameters and guards.",
              ko: "시그널은 클라이언트를 서비스에 연결하는 API 계층을 정의합니다. 데이터 가져오기를 위한 슬라이스와 변이를 위한 엔드포인트를 포함하며, 모두 타입 안전한 파라미터와 가드가 있습니다.",
            })}
          </div>
          <Code.Snippet
            title="product.signal.ts"
            code={`import { ID, Int } from "@akanjs/base";
import { Public } from "@akanjs/nest";
import { endpoint, slice } from "@akanjs/signal";
import { Admin, Every, Self, User } from "@shared/nest";

import * as cnst from "../cnst";
import * as srv from "../srv";

// Slice APIs (data fetching with guards)
export class ProductSlice extends slice(
  srv.product,
  { guards: { root: Admin, get: Public, cru: Every } },
  (init) => ({
    inCategory: init({ guards: [Public] })
      .param("categoryId", ID)
      .exec(function (categoryId) {
        return this.productService.queryInCategory(categoryId);
      }),
  })
) {}

// Endpoint APIs (mutations)
export class ProductEndpoint extends endpoint(srv.product, ({ mutation }) => ({
  sellProduct: mutation(cnst.Product, { guards: [User] })
    .param("productId", ID)
    .body("quantity", Int)
    .with(Self)
    .exec(async function (productId, quantity, self) {
      return await this.productService.sellProduct(productId, quantity, self.id);
    }),
}))} {}`}
          />
          <div>
            {l.trans({
              en: "Understanding the signal layer components:",
              ko: "시그널 계층 구성 요소 이해하기:",
            })}
          </div>
          <div className="my-4" />
          <Docs.IntroTable type="field" items={signalItems} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="store-state"
        title={l.trans({
          en: "Client-Side State Management",
          ko: "클라이언트 측 상태 관리",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Client-Side State Management",
            ko: "클라이언트 측 상태 관리",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The store manages client-side state and provides methods for interacting with the API. It automatically integrates with slices and provides a consistent interface for UI components.",
              ko: "스토어는 클라이언트 측 상태를 관리하고 API와 상호작용하는 메서드를 제공합니다. 슬라이스와 자동으로 통합되며 UI 컴포넌트를 위한 일관된 인터페이스를 제공합니다.",
            })}
          </div>
          <Code.Snippet
            title="product.store.ts"
            code={`import { store } from "@akanjs/store";
import { msg } from "@apps/akan/client";

import * as cnst from "../cnst";
import { fetch, sig } from "../useClient";

export class ProductStore extends store(sig.product, {
  // Additional state beyond auto-generated slice state
  cartProducts: [] as cnst.LightProduct[],
}) {
  async sellProduct(id: string, quantity: number) {
    msg.loading("product.sellLoading");
    this.setProduct(await fetch.sellProduct(id, quantity));  // fetch = type-safe API client
    msg.success("product.sellSuccess");
  }
}`}
          />
          <div>
            {l.trans({
              en: "Understanding the store layer:",
              ko: "스토어 계층 이해하기:",
            })}
          </div>
          <div className="my-4" />
          <Docs.IntroTable type="field" items={storeItems} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="ui-components"
        title={l.trans({
          en: "UI Component Organization",
          ko: "UI 컴포넌트 구성",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "UI Component Organization",
            ko: "UI 컴포넌트 구성",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "UI components are organized by their purpose: Template for forms, Unit for cards, View for details, Zone for layouts, and Util for actions. Each follows a consistent pattern.",
              ko: "UI 컴포넌트는 목적에 따라 구성됩니다: 폼을 위한 Template, 카드를 위한 Unit, 상세 정보를 위한 View, 레이아웃을 위한 Zone, 액션을 위한 Util. 각각 일관된 패턴을 따릅니다.",
            })}
          </div>
          <div className="my-4" />
          <Docs.IntroTable type="field" items={uiItems} />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="data-flow"
        title={l.trans({
          en: "Data Flow in Database Modules",
          ko: "데이터베이스 모듈의 데이터 흐름",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Data Flow in Database Modules",
            ko: "데이터베이스 모듈의 데이터 흐름",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Understanding how data flows through the module layers helps you debug issues and design efficient features. Here's the complete flow from user interaction to database:",
              ko: "모듈 계층을 통해 데이터가 어떻게 흐르는지 이해하면 문제를 디버깅하고 효율적인 기능을 설계하는 데 도움이 됩니다. 사용자 상호작용에서 데이터베이스까지의 전체 흐름입니다:",
            })}
          </div>
          <div className="my-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 font-bold text-white">
                1
              </div>
              <div className="flex-1 rounded-lg bg-blue-50 p-3">
                <strong className="text-blue-800">{l.trans({ en: "User Interaction", ko: "사용자 상호작용" })}</strong>
                <div className="text-blue-700 text-sm">
                  {l.trans({
                    en: "User clicks button in Unit/Template component",
                    ko: "사용자가 Unit/Template 컴포넌트의 버튼 클릭",
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 font-bold text-white">
                2
              </div>
              <div className="flex-1 rounded-lg bg-green-50 p-3">
                <strong className="text-green-800">{l.trans({ en: "Store Action", ko: "스토어 액션" })}</strong>
                <div className="text-green-700 text-sm">
                  {l.trans({
                    en: "Store method called (st.do.sellProduct)",
                    ko: "스토어 메서드 호출 (st.do.sellProduct)",
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500 font-bold text-white">
                3
              </div>
              <div className="flex-1 rounded-lg bg-purple-50 p-3">
                <strong className="text-purple-800">{l.trans({ en: "API Call", ko: "API 호출" })}</strong>
                <div className="text-purple-700 text-sm">
                  {l.trans({
                    en: "fetch.sellProduct() sends request to endpoint",
                    ko: "fetch.sellProduct()이 엔드포인트에 요청 전송",
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500 font-bold text-white">
                4
              </div>
              <div className="flex-1 rounded-lg bg-yellow-50 p-3">
                <strong className="text-yellow-800">
                  {l.trans({ en: "Signal → Service", ko: "Signal → Service" })}
                </strong>
                <div className="text-sm text-yellow-700">
                  {l.trans({
                    en: "Signal exec() calls service method with validated params",
                    ko: "Signal exec()가 검증된 파라미터로 서비스 메서드 호출",
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 font-bold text-white">
                5
              </div>
              <div className="flex-1 rounded-lg bg-orange-50 p-3">
                <strong className="text-orange-800">{l.trans({ en: "Document Operation", ko: "문서 작업" })}</strong>
                <div className="text-orange-700 text-sm">
                  {l.trans({
                    en: "Document methods update and save to MongoDB",
                    ko: "문서 메서드가 MongoDB에 업데이트 및 저장",
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-500 font-bold text-white">
                6
              </div>
              <div className="flex-1 rounded-lg bg-pink-50 p-3">
                <strong className="text-pink-800">{l.trans({ en: "UI Update", ko: "UI 업데이트" })}</strong>
                <div className="text-pink-700 text-sm">
                  {l.trans({
                    en: "Store updates state, React re-renders components",
                    ko: "스토어가 상태 업데이트, React가 컴포넌트 리렌더링",
                  })}
                </div>
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="best-practices"
        title={l.trans({
          en: "Module Best Practices",
          ko: "모듈 모범 사례",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Module Best Practices",
            ko: "모듈 모범 사례",
          })}
        </Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Following these best practices ensures your modules remain maintainable, performant, and consistent with the Akan.js ecosystem:",
              ko: "이러한 모범 사례를 따르면 모듈이 유지보수 가능하고 성능이 좋으며 Akan.js 생태계와 일관성을 유지합니다:",
            })}
          </div>
          <div className="my-4 space-y-4">
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">1️⃣</span>
                <strong className="text-blue-800">{l.trans({ en: "Naming Conventions", ko: "명명 규칙" })}</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Use PascalCase for classes/components (ProductService, Product.Template.General), camelCase for files (product.service.ts) and methods.",
                  ko: "클래스/컴포넌트에는 PascalCase (ProductService, Product.Template.General), 파일과 메서드에는 camelCase (product.service.ts)를 사용합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">2️⃣</span>
                <strong className="text-green-800">{l.trans({ en: "Code Organization", ko: "코드 구성" })}</strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Keep business logic in services, use signals only for API definitions. Document methods should be simple state mutations.",
                  ko: "비즈니스 로직은 서비스에 유지하고, 시그널은 API 정의에만 사용합니다. 문서 메서드는 간단한 상태 변이여야 합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">3️⃣</span>
                <strong className="text-purple-800">{l.trans({ en: "Performance", ko: "성능" })}</strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: "Use Light classes for list queries, create proper indexes in middleware, use Promise.all for parallel fetches in loaders.",
                  ko: "목록 쿼리에는 Light 클래스를 사용하고, 미들웨어에서 적절한 인덱스를 생성하며, 로더에서 병렬 fetch를 위해 Promise.all을 사용합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-yellow-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-yellow-600">4️⃣</span>
                <strong className="text-yellow-800">{l.trans({ en: "Security", ko: "보안" })}</strong>
              </div>
              <div className="text-sm text-yellow-700">
                {l.trans({
                  en: "Apply appropriate guards to all endpoints. Use .with(Self) to access current user. Never expose sensitive data in Light classes.",
                  ko: "모든 엔드포인트에 적절한 가드를 적용합니다. 현재 사용자 접근에는 .with(Self)를 사용합니다. Light 클래스에 민감한 데이터를 절대 노출하지 않습니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-pink-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-pink-600">5️⃣</span>
                <strong className="text-pink-800">{l.trans({ en: "UI Components", ko: "UI 컴포넌트" })}</strong>
              </div>
              <div className="text-pink-700 text-sm">
                {l.trans({
                  en: "Separate concerns into Template/Unit/View/Zone/Util. Use props to control behavior (showControls, disabled) for component reuse.",
                  ko: "관심사를 Template/Unit/View/Zone/Util로 분리합니다. 컴포넌트 재사용을 위해 동작 제어에 props(showControls, disabled)를 사용합니다.",
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
