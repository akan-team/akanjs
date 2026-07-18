import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { clsx } from "akanjs/client";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="file-rule" title={l.trans({ en: "File Rule", ko: "파일 규칙" })}>
        <Docs.Title>{l.trans({ en: "File Rule", ko: "파일 규칙" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Folder names tell Akan what business area a file belongs to. File names tell Akan what role the file plays inside that business area. For example, product.document.ts describes stored product data, while Product.View.tsx describes how product data is shown on screen.",
              ko: "폴더 이름은 파일이 어떤 비즈니스 영역에 속하는지 알려줍니다. 파일 이름은 그 비즈니스 영역 안에서 어떤 역할을 하는지 알려줍니다. 예를 들어 product.document.ts는 저장되는 상품 데이터를 설명하고, Product.View.tsx는 상품 데이터를 화면에 어떻게 보여줄지 설명합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Think of a module as a small business department. A product module may know what fields a product has, how to save it, how users request it, and how it is shown in the admin screen. Each file handles one of those jobs.",
              ko: "모듈을 작은 비즈니스 부서라고 생각하면 쉽습니다. product 모듈은 상품에 어떤 필드가 있는지, 어떻게 저장하는지, 사용자가 어떻게 요청하는지, 관리자 화면에서 어떻게 보여줄지까지 다룰 수 있습니다. 각 파일은 그중 하나의 역할을 맡습니다.",
            })}
          </div>
          <Code.Snippet
            title="lib/product/"
            language="bash"
            code={`lib/product/
├── product.abstract.md
├── product.constant.ts
├── product.dictionary.ts
├── product.document.ts
├── product.service.ts
├── product.signal.ts
├── product.store.ts
├── Product.Template.tsx
├── Product.Unit.tsx
├── Product.Util.tsx
├── Product.View.tsx
└── Product.Zone.tsx`}
          />
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "Business meaning", ko: "비즈니스 의미" }),
                desc: l.trans({
                  en: "A file suffix explains what kind of work the file does for the model.",
                  ko: "파일 접미사는 해당 모델에서 어떤 일을 담당하는지 설명합니다.",
                }),
              },
              {
                title: l.trans({ en: "Scanner friendly", ko: "스캔 가능한 규칙" }),
                desc: l.trans({
                  en: "Akan scans these suffixes and connects models, services, signals, and UI pieces.",
                  ko: "Akan은 이 접미사를 스캔해서 모델, 서비스, 시그널, UI 조각을 연결합니다.",
                }),
              },
              {
                title: l.trans({ en: "Start small", ko: "작게 시작" }),
                desc: l.trans({
                  en: "You do not need every file. Add files only when the business feature needs them.",
                  ko: "모든 파일이 항상 필요한 것은 아닙니다. 비즈니스 기능에 필요할 때만 추가하면 됩니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-bold text-base-content">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "You can start with only one or two files. For example, a simple read-only catalog may only need product.document.ts and Product.View.tsx at first.",
              ko: "처음부터 모든 파일을 만들 필요는 없습니다. 예를 들어 단순히 보여주기만 하는 상품 카탈로그라면 처음에는 product.document.ts와 Product.View.tsx만으로 시작할 수 있습니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="module-files" title={l.trans({ en: "Module Files", ko: "모듈 파일" })}>
        <Docs.Title>{l.trans({ en: "Module Files", ko: "모듈 파일" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "These files describe the data, server logic, API surface, and state around a business model. If you are building products, orders, users, invoices, or reservations, these are the files you will touch most often.",
              ko: "이 파일들은 비즈니스 모델의 데이터, 서버 로직, API 표면, 상태를 설명합니다. 상품, 주문, 사용자, 청구서, 예약 같은 기능을 만들 때 가장 자주 다루게 됩니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "For example, an order feature may keep order status values in order.constant.ts, saved order fields in order.document.ts, payment completion logic in order.service.ts, and page-callable actions in order.signal.ts.",
              ko: "예를 들어 주문 기능을 만든다면 order.constant.ts에는 주문 상태값을, order.document.ts에는 저장되는 주문 필드를, order.service.ts에는 결제 완료 처리 로직을, order.signal.ts에는 페이지에서 호출할 수 있는 동작을 둘 수 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The abstract file is not only for LLMs. It keeps domain knowledge beside the code, so people and agents can understand business invariants before changing implementation files.",
              ko: "abstract 파일은 LLM만을 위한 파일이 아닙니다. 도메인 지식을 코드 옆에 두어 사람과 agent가 구현 파일을 수정하기 전에 비즈니스 불변 조건을 이해할 수 있게 합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: "model.abstract.md",
                type: "shared",
                desc: l.trans({
                  en: "Business intent, domain rules, workflows, and agent notes kept next to the module code. Example: order cancellation rules or status transition policy.",
                  ko: "모듈 코드 옆에 두는 비즈니스 의도, 도메인 규칙, 워크플로우, agent 주의사항입니다. 예: 주문 취소 규칙이나 상태 전이 정책.",
                }),
              },
              {
                title: "model.constant.ts",
                type: "shared",
                desc: l.trans({
                  en: "Constants, status values, default options, and shared model types. Example: order status such as pending, paid, shipped.",
                  ko: "상수, 상태값, 기본 옵션, 모델에서 공유하는 타입을 둡니다. 예: pending, paid, shipped 같은 주문 상태.",
                }),
              },
              {
                title: "model.dictionary.ts",
                type: "shared",
                desc: l.trans({
                  en: "Labels, field names, and text keys used by the model. Example: product name, price, stock labels.",
                  ko: "모델에서 쓰는 라벨, 필드 이름, 문구 키를 둡니다. 예: 상품명, 가격, 재고 라벨.",
                }),
              },
              {
                title: "model.document.ts",
                type: "server",
                desc: l.trans({
                  en: "Stored data shape, filters, and document model definition. Example: what fields an invoice saves and how it can be queried.",
                  ko: "저장되는 데이터 형태, 필터, 문서 모델 정의를 둡니다. 예: 청구서가 어떤 필드를 저장하고 어떻게 조회되는지.",
                }),
              },
              {
                title: "model.service.ts",
                type: "server",
                desc: l.trans({
                  en: "Server-side business logic. Example: create an order, apply a coupon, calculate shipping, or complete payment.",
                  ko: "서버 측 비즈니스 로직을 둡니다. 예: 주문 생성, 쿠폰 적용, 배송비 계산, 결제 완료 처리.",
                }),
              },
              {
                title: "model.signal.ts",
                type: "shared",
                desc: l.trans({
                  en: "Public actions, slices, endpoints, and internal jobs that pages can call. Example: load order list or request OCR.",
                  ko: "페이지에서 호출할 수 있는 공개 동작, slice, endpoint, 내부 작업을 둡니다. 예: 주문 목록 불러오기, OCR 요청하기.",
                }),
              },
              {
                title: "model.store.ts",
                type: "client",
                desc: l.trans({
                  en: "Client or model state used across screens. Example: selected filters, cart state, or temporary form state.",
                  ko: "여러 화면에서 쓰는 클라이언트 상태 또는 모델 상태를 둡니다. 예: 선택된 필터, 장바구니 상태, 임시 폼 상태.",
                }),
              },
            ].map(({ title, type, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <div className="flex items-center justify-between">
                  <div
                    className={clsx("font-mono font-semibold", {
                      "text-success": type === "client",
                      "text-primary": type === "server",
                      "text-warning": type === "shared",
                    })}
                  >
                    {title}
                  </div>
                  <div
                    className={clsx("rounded-full px-2 py-1 font-semibold text-xs", {
                      "bg-success/10 text-success": type === "client",
                      "bg-primary/10 text-primary": type === "server",
                      "bg-warning/10 text-warning": type === "shared",
                    })}
                  >
                    {type}
                  </div>
                </div>
                <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
              </div>
            ))}
          </div>
          <div className="font-bold text-base-content text-lg">{l.trans({ en: "UI Files", ko: "UI 파일" })}</div>
          <div>
            {l.trans({
              en: "UI files describe how a model appears on screen. They use PascalCase because they export React components or UI groups.",
              ko: "UI 파일은 모델이 화면에 어떻게 보이는지 설명합니다. React 컴포넌트나 UI 묶음을 export하므로 PascalCase 이름을 사용합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A business model usually appears in several screen sizes: a small badge, a list row, a detail card, an admin panel, and sometimes a full dashboard section. UI files help you keep those screen pieces close to the model they represent.",
              ko: "하나의 비즈니스 모델은 여러 화면 크기로 등장합니다. 작은 배지, 목록 행, 상세 카드, 관리자 패널, 대시보드 섹션처럼 다양한 형태가 생깁니다. UI 파일은 이런 화면 조각을 해당 모델 가까이에 모아두도록 도와줍니다.",
            })}
          </div>
          <Code.Snippet
            title="lib/bizCard/"
            language="bash"
            code={`BizCard.View.tsx      # how a biz card is displayed
BizCard.Unit.tsx      # small reusable UI pieces
BizCard.Template.tsx  # repeated layout or template
BizCard.Util.tsx      # UI actions or helpers
BizCard.Zone.tsx      # large screen areas such as admin/list/detail`}
          />
          <div className="space-y-1">
            {[
              {
                title: "Model.View.tsx",
                desc: l.trans({
                  en: "Use it for display components, such as ProductCard, OrderSummary, UserProfile, or InvoicePreview.",
                  ko: "ProductCard, OrderSummary, UserProfile, InvoicePreview처럼 데이터를 보여주는 컴포넌트에 사용합니다.",
                }),
              },
              {
                title: "Model.Unit.tsx",
                desc: l.trans({
                  en: "Use it for small reusable units inside the model UI, such as status badges, price rows, or avatar blocks.",
                  ko: "상태 배지, 가격 행, 아바타 블록처럼 모델 UI 안에서 재사용되는 작은 단위 컴포넌트에 사용합니다.",
                }),
              },
              {
                title: "Model.Template.tsx",
                desc: l.trans({
                  en: "Use it for repeated screen templates or layout patterns, such as a standard admin detail layout.",
                  ko: "표준 관리자 상세 레이아웃처럼 반복되는 화면 템플릿이나 레이아웃 패턴에 사용합니다.",
                }),
              },
              {
                title: "Model.Util.tsx",
                desc: l.trans({
                  en: "Use it for UI-level actions or helper components, such as remove buttons, edit modal triggers, or upload controls.",
                  ko: "삭제 버튼, 수정 모달 트리거, 업로드 컨트롤처럼 UI 레벨 액션이나 보조 컴포넌트에 사용합니다.",
                }),
              },
              {
                title: "Model.Zone.tsx",
                desc: l.trans({
                  en: "Use it for larger areas, such as admin screens, list/detail zones, tab content, or dashboard sections.",
                  ko: "관리자 화면, 목록/상세 영역, 탭 콘텐츠, 대시보드 섹션처럼 큰 화면 구역에 사용합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-success">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="naming-rule" title={l.trans({ en: "Naming Rule", ko: "이름 규칙" })}>
        <Docs.Title>{l.trans({ en: "Naming Rule", ko: "이름 규칙" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan file names use two patterns. Business core files use the model name in lower camel case. UI files use the model name in PascalCase.",
              ko: "Akan 파일 이름은 두 가지 패턴을 사용합니다. 비즈니스 핵심 파일은 모델 이름을 lower camel case로 쓰고, UI 파일은 PascalCase로 씁니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "This makes a module easy to scan with your eyes. When you open lib/product/, every product.* file is business logic and every Product.* file is UI. You can immediately tell where to add a new query, screen component, or server action.",
              ko: "이 규칙을 지키면 모듈을 눈으로 훑기 쉬워집니다. lib/product/를 열었을 때 product.* 파일은 비즈니스 로직이고 Product.* 파일은 UI라는 것을 바로 알 수 있습니다. 새 조회, 화면 컴포넌트, 서버 동작을 어디에 추가할지 빠르게 판단할 수 있습니다.",
            })}
          </div>
          <div className="space-y-1">
            <Code.Snippet
              className="w-full"
              title={l.trans({ en: "Business files", ko: "비즈니스 파일" })}
              language="bash"
              code={`product.abstract.md
product.constant.ts
product.dictionary.ts
product.document.ts
product.service.ts
product.signal.ts
product.store.ts`}
            />
            <Code.Snippet
              className="w-full"
              title={l.trans({ en: "UI files", ko: "UI 파일" })}
              language="bash"
              code={`Product.Template.tsx
Product.Unit.tsx
Product.Util.tsx
Product.View.tsx
Product.Zone.tsx`}
            />
          </div>
          <Docs.Alert type="warning">
            {l.trans({
              en: "Do not declare arbitrary files inside a module folder outside these rules. For example, product.helper.ts or ProductComponents.tsx should be moved into the closest allowed role such as product.service.ts, Product.Util.tsx, or Product.Unit.tsx.",
              ko: "모듈 폴더 안에서는 이 규칙을 벗어난 임의의 파일 선언을 금지합니다. 예를 들어 product.helper.ts나 ProductComponents.tsx는 product.service.ts, Product.Util.tsx, Product.Unit.tsx처럼 가장 가까운 허용 역할로 옮겨야 합니다.",
            })}
          </Docs.Alert>
          <Docs.Alert type="info">
            {l.trans({
              en: "The suffix is not just style. Akan scans these suffixes to understand what files exist in each module.",
              ko: "접미사는 단순한 스타일이 아닙니다. Akan은 이 접미사를 스캔해서 각 모듈에 어떤 파일이 있는지 이해합니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="facet-files" title={l.trans({ en: "Facet Files And Barrels", ko: "Facet 파일과 Barrel" })}>
        <Docs.Title>{l.trans({ en: "Facet Files And Barrels", ko: "Facet 파일과 Barrel" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Files under ui/ and webkit/ are usually exported through barrel files such as @apps/myapp/ui or @libs/shared/webkit. To keep imports predictable and easy to optimize, prefer one main export per file and make the file name match the export name.",
              ko: "ui/와 webkit/ 아래 파일은 보통 @apps/myapp/ui, @libs/shared/webkit 같은 barrel 파일을 통해 export됩니다. import를 예측하기 쉽고 최적화하기 좋게 유지하려면, 한 파일에는 대표 export 하나를 두고 파일명과 export 이름을 맞추는 것을 권장합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "This convention is especially helpful when a business grows. A storefront, admin app, and partner app can all import the same ProductCard without knowing where the implementation lives.",
              ko: "이 규칙은 비즈니스가 커질수록 특히 유용합니다. 스토어, 관리자 앱, 파트너 앱이 모두 ProductCard를 가져다 쓰더라도 실제 구현 위치를 자세히 알 필요가 없습니다.",
            })}
          </div>
          <div className="space-y-1">
            <Code.Snippet
              className="w-full"
              title={l.trans({ en: "✅ Recommended", ko: "✅ 권장" })}
              code={`// ui/ProductCard.tsx
export const ProductCard = () => {
  return <div>Product</div>;
}

// webkit/usePaymentStatus.tsx
export const usePaymentStatus() {
  return { status: "ready" };
}`}
            />
            <Code.Snippet
              className="w-full"
              title={l.trans({ en: "❌ Avoid", ko: "❌ 피하기" })}
              code={`// ui/components.tsx
export const ProductCard = () => {}
export const OrderBadge = () => {}
export const PriceText = () => {}

// hard to know which import belongs to which file`}
            />
          </div>
          <div className="space-y-1">
            {[
              {
                title: "ui/",
                desc: l.trans({
                  en: "Use this for reusable visual components. Example: ProductCard.tsx should export ProductCard.",
                  ko: "재사용 가능한 화면 컴포넌트에 사용합니다. 예: ProductCard.tsx는 ProductCard를 export하는 것이 좋습니다.",
                }),
              },
              {
                title: "webkit/",
                desc: l.trans({
                  en: "Use this for browser/client hooks and helpers. Example: usePaymentStatus.tsx should export usePaymentStatus.",
                  ko: "브라우저/클라이언트 hook과 helper에 사용합니다. 예: usePaymentStatus.tsx는 usePaymentStatus를 export하는 것이 좋습니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <div className="font-bold text-base-content text-lg">Barrel Imports</div>
          <div>
            {l.trans({
              en: "A barrel file re-exports many files from one entry point. Akan can analyze configured barrel imports and rewrite imports to the exact source file, so importing from @apps/myapp/ui can stay convenient without always pulling the entire barrel into the bundle.",
              ko: "barrel 파일은 여러 파일을 하나의 진입점에서 다시 export하는 파일입니다. Akan은 설정된 barrel import를 분석해서 정확한 원본 파일 import로 바꿀 수 있으므로, @apps/myapp/ui에서 편하게 가져오면서도 항상 전체 barrel을 번들에 끌어오지 않도록 도와줍니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "In day-to-day product work, this means your page can import by business name instead of deep file path. You write a clean import, and Akan keeps the build focused on the exact files that are used.",
              ko: "일상적인 제품 개발에서는 깊은 파일 경로 대신 비즈니스 이름으로 import할 수 있다는 뜻입니다. 개발자는 깔끔한 import를 작성하고, Akan은 실제로 쓰는 파일만 빌드에 포함되도록 도와줍니다.",
            })}
          </div>
          <Code.Snippet
            title="barrel import"
            code={`// ui/index.ts
export * from "./ProductCard";
export * from "./OrderBadge";

// page/store/products.tsx
import { ProductCard } from "@apps/myapp/ui";`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "This is why one file, one main export is recommended. It helps the barrel analyzer map ProductCard to ui/ProductCard.tsx clearly.",
              ko: "그래서 한 파일에 대표 export 하나를 두는 방식을 권장합니다. ProductCard가 ui/ProductCard.tsx에서 왔다는 것을 barrel analyzer가 명확하게 매핑할 수 있습니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="module-differences" title={l.trans({ en: "Module Differences", ko: "모듈별 차이" })}>
        <Docs.Title>{l.trans({ en: "Module Differences", ko: "모듈별 차이" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Not every folder type uses every file type. Database modules can have the full set. Service modules focus on behavior. Scalar modules focus on reusable value definitions.",
              ko: "모든 폴더 타입이 모든 파일 타입을 쓰는 것은 아닙니다. database module은 전체 파일 구성을 가질 수 있고, service module은 동작 중심이며, scalar module은 재사용 값 정의 중심입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Choose the file set by the business role of the folder. product is a thing you store, so it can have document and store files. _payment is something you do, so it usually focuses on service and signal files. money is a reusable value shape, so it stays small and definition-oriented.",
              ko: "폴더의 비즈니스 역할에 따라 파일 구성을 선택합니다. product는 저장하는 대상이므로 document와 store 파일을 가질 수 있습니다. _payment는 수행하는 기능이므로 보통 service와 signal 중심입니다. money는 재사용 값 형태이므로 작고 정의 중심으로 유지합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: "lib/<model>/",
                desc: l.trans({
                  en: "Can use abstract, constant, dictionary, document, service, signal, store, Template, Unit, Util, View, and Zone.",
                  ko: "abstract, constant, dictionary, document, service, signal, store, Template, Unit, Util, View, Zone을 사용할 수 있습니다.",
                }),
              },
              {
                title: "lib/_<service>/",
                desc: l.trans({
                  en: "Can use abstract, dictionary, service, signal, store, Template, Unit, Util, View, and Zone. The abstract filename drops the folder underscore, such as payment.abstract.md in lib/_payment/.",
                  ko: "abstract, dictionary, service, signal, store, Util, Zone을 사용할 수 있습니다. abstract 파일명은 폴더의 밑줄을 제외해 lib/_payment/ 안에서는 payment.abstract.md를 사용합니다.",
                }),
              },
              {
                title: "lib/__scalar/<type>/",
                desc: l.trans({
                  en: "Can use abstract, constant, dictionary, document, Template, Unit, Util, View, and Zone.",
                  ko: "abstract, constant, dictionary, document을 사용할 수 있습니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="workflow" title={l.trans({ en: "Codegen And Choices", ko: "자동생성과 선택 기준" })}>
        <Docs.Title>{l.trans({ en: "Codegen And Choices", ko: "자동생성과 선택 기준" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan scans module files and generates helper indexes around them. This lets application code import model features through stable module exports instead of manually wiring every file.",
              ko: "Akan은 모듈 파일을 스캔하고 그 주변에 필요한 helper index를 생성합니다. 그래서 애플리케이션 코드는 각 파일을 직접 연결하지 않고 안정적인 모듈 export를 통해 기능을 가져올 수 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "For a product team, this removes repeated wiring work. When a module grows from a document into views, units, and zones, Akan can keep the module entry organized as long as the file names follow the convention.",
              ko: "제품 팀 입장에서는 반복적인 연결 작업이 줄어듭니다. 모듈이 document에서 시작해 view, unit, zone으로 커져도 파일 이름이 컨벤션을 따르면 Akan이 모듈 진입점을 정리해줄 수 있습니다.",
            })}
          </div>
          <Code.Snippet
            title="Generated UI index idea"
            code={`import * as Unit from "./Product.Unit";
import * as Util from "./Product.Util";
import * as View from "./Product.View";
import * as Zone from "./Product.Zone";

export const Product = { Unit, Util, View, Zone };`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "This is why naming matters. If Product.View.tsx is renamed randomly, Akan cannot recognize it as the View file for the Product module.",
              ko: "그래서 이름 규칙이 중요합니다. Product.View.tsx를 임의로 바꾸면 Akan은 그 파일을 Product 모듈의 View 파일로 인식할 수 없습니다.",
            })}
          </Docs.Alert>
          <div className="font-bold text-base-content text-lg">
            {l.trans({ en: "Common Choices", ko: "자주 하는 선택" })}
          </div>
          <div>
            {l.trans({
              en: "When you are not sure which file to create, start from the business question you are trying to answer.",
              ko: "어떤 파일을 만들어야 할지 모르겠다면, 해결하려는 비즈니스 질문에서 시작하면 됩니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "For example, 'Can the customer see the order?' points to View. 'Can the customer cancel the order?' points to signal and service. 'What fields does an order save?' points to document.",
              ko: "예를 들어 '고객이 주문을 볼 수 있나요?'는 View로 이어집니다. '고객이 주문을 취소할 수 있나요?'는 signal과 service로 이어집니다. '주문이 어떤 필드를 저장하나요?'는 document로 이어집니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "Do we store this data?", ko: "이 데이터를 저장하나요?" }),
                desc: "model.document.ts",
              },
              {
                title: l.trans({ en: "Does the server process it?", ko: "서버에서 처리하나요?" }),
                desc: "model.service.ts",
              },
              {
                title: l.trans({ en: "Should a page call it?", ko: "페이지에서 호출하나요?" }),
                desc: "model.signal.ts",
              },
              {
                title: l.trans({ en: "Does it show data?", ko: "데이터를 보여주나요?" }),
                desc: "Model.View.tsx",
              },
              {
                title: l.trans({ en: "Is it a small UI action?", ko: "작은 UI 액션인가요?" }),
                desc: "Model.Unit.tsx or Model.Util.tsx",
              },
              {
                title: l.trans({ en: "Is it a large screen area?", ko: "큰 화면 영역인가요?" }),
                desc: "Model.Zone.tsx",
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-bold text-base-content">{title}: </span>

                <span className="font-mono text-primary text-sm">{desc}</span>
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
