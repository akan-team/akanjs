import { usePage } from "@apps/akan/client";
import { type BadgeVariants, badgeRecipe, Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

const moduleFiles = [
  {
    name: "model.abstract.md",
    boundary: "shared",
    en: "Business intent, domain rules, workflows and agent notes beside the module code.",
    ko: "모듈 코드 옆에 두는 비즈니스 의도, 도메인 규칙, 워크플로우, agent 주의사항입니다.",
  },
  {
    name: "model.constant.ts",
    boundary: "shared",
    en: "Constants, status values, default options, and shared model types.",
    ko: "상수, 상태값, 기본 옵션, 모델에서 공유하는 타입을 둡니다.",
  },
  {
    name: "model.dictionary.ts",
    boundary: "shared",
    en: "Labels, field names, and text keys the model uses, such as the price label.",
    ko: "모델에서 쓰는 라벨, 필드 이름, 문구 키를 둡니다. 예: 가격 라벨.",
  },
  {
    name: "model.document.ts",
    boundary: "server",
    en: "Stored data shape, filters, and document model definition.",
    ko: "저장되는 데이터 형태, 필터, 문서 모델 정의를 둡니다.",
  },
  {
    name: "model.service.ts",
    boundary: "server",
    en: "Server-side business logic, such as creating an order or applying a coupon.",
    ko: "서버 측 비즈니스 로직을 둡니다. 예: 주문 생성, 쿠폰 적용.",
  },
  {
    name: "model.signal.ts",
    boundary: "shared",
    en: "Public actions, slices, endpoints, and internal jobs that pages can call.",
    ko: "페이지에서 호출할 수 있는 공개 동작, slice, endpoint, 내부 작업을 둡니다.",
  },
  {
    name: "model.store.ts",
    boundary: "client",
    en: "Client or model state used across screens, such as selected filters or a cart.",
    ko: "여러 화면에서 쓰는 클라이언트 상태 또는 모델 상태입니다. 예: 선택된 필터, 장바구니.",
  },
  {
    name: "Model.Template.tsx",
    boundary: "client",
    en: "The create and edit form: reads st.use.productForm(), writes through generated setters.",
    ko: "생성과 수정 폼입니다. st.use.productForm()을 읽고 생성된 setter로 값을 씁니다.",
  },
  {
    name: "Model.Unit.tsx",
    boundary: "server",
    en: "One item in a list or grid, such as a row or card; takes the trimmed LightProduct.",
    ko: "목록이나 그리드의 한 항목(행, 카드 등)이며, 축약 형태인 LightProduct를 받습니다.",
  },
  {
    name: "Model.Util.tsx",
    boundary: "client",
    en: "A domain UI helper named for the endpoint verb minus the model noun, like Refund.",
    ko: "도메인 UI 보조 컴포넌트이며, endpoint 동사에서 모델 명사를 뺀 이름(Refund 등)을 씁니다.",
  },
  {
    name: "Model.View.tsx",
    boundary: "server",
    en: "One record in full detail: the full model, with fields a list never loads.",
    ko: "레코드 하나의 상세 화면입니다. 목록에서 불러오지 않는 필드까지 담은 전체 모델을 받습니다.",
  },
  {
    name: "Model.Zone.tsx",
    boundary: "client",
    en: "A composed page section: feeds the store to Load.Units or Load.View; Unit and View draw it.",
    ko: "페이지 구역을 조립합니다. 스토어 데이터를 Load.Units나 Load.View에 넘기고 마크업은 Unit과 View에 맡깁니다.",
  },
] as const;

type Boundary = (typeof moduleFiles)[number]["boundary"];

const boundaryVariant: { [key in Boundary]: NonNullable<BadgeVariants["variant"]> } = {
  client: "info",
  shared: "warning",
  server: "error",
} as const;

const fileChoices = [
  { en: "Do we store this data?", ko: "이 데이터를 저장하나요?", file: "model.document.ts" },
  { en: "Does the server process it?", ko: "서버에서 처리하나요?", file: "model.service.ts" },
  { en: "Should a page call it?", ko: "페이지에서 호출하나요?", file: "model.signal.ts" },
  { en: "Does one record get its own page?", ko: "레코드 하나가 자기 페이지를 갖나요?", file: "Model.View.tsx" },
  { en: "Is it one item in a list?", ko: "목록의 한 항목인가요?", file: "Model.Unit.tsx" },
  { en: "Does the user fill it in?", ko: "사용자가 값을 입력하나요?", file: "Model.Template.tsx" },
  { en: "Is it a domain UI action?", ko: "도메인 UI 액션인가요?", file: "Model.Util.tsx" },
  { en: "Is it a large screen area?", ko: "큰 화면 영역인가요?", file: "Model.Zone.tsx" },
];

const moduleKinds = [
  { key: "database", folder: "lib/product/", en: "Database", ko: "database" },
  { key: "service", folder: "lib/_payment/", en: "Service", ko: "service" },
  { key: "scalar", folder: "lib/__scalar/money/", en: "Scalar", ko: "scalar" },
] as const;

const moduleMatrix = [
  {
    en: "Business files",
    ko: "비즈니스 파일",
    prefix: "model",
    files: [
      { suffix: ".abstract.md", database: true, service: true, scalar: true },
      { suffix: ".constant.ts", database: true, service: false, scalar: true },
      { suffix: ".dictionary.ts", database: true, service: true, scalar: true },
      { suffix: ".document.ts", database: true, service: false, scalar: true },
      { suffix: ".service.ts", database: true, service: true, scalar: false },
      { suffix: ".signal.ts", database: true, service: true, scalar: false },
      { suffix: ".store.ts", database: true, service: true, scalar: false },
    ],
  },
  {
    en: "UI files",
    ko: "UI 파일",
    prefix: "Model",
    files: [
      { suffix: ".Template.tsx", database: true, service: false, scalar: true },
      { suffix: ".Unit.tsx", database: true, service: false, scalar: true },
      { suffix: ".Util.tsx", database: true, service: true, scalar: false },
      { suffix: ".View.tsx", database: true, service: false, scalar: false },
      { suffix: ".Zone.tsx", database: true, service: true, scalar: false },
    ],
  },
];

export default page()
  .config({ transition: "fade", rscPatchHeadSafe: true })
  .head(({ lang }) => {
    const title = lang === "ko" ? "핵심 개념: 파일 규칙 | Akan.js" : "Core Concepts: File Rule | Akan.js";
    const description =
      lang === "ko"
        ? "모듈을 이루는 파일과 각 역할이 담을 수 있는 것, 생성되는 배럴까지."
        : "The files a module is built from, what each role may hold, and the generated barrels.";
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
              className="w-full"
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
            <div className="space-y-1 pl-2">
              {[
                {
                  title: l.trans({ en: "Business meaning", ko: "비즈니스 의미" }),
                  desc: l.trans({
                    en: "A file suffix explains what kind of work the file does for the model.",
                    ko: "파일 접미사는 해당 모델에서 어떤 일을 담당하는지 설명합니다.",
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
                <div key={title}>
                  <span className="font-bold text-foreground">{title}: </span>
                  <span className="text-foreground/70 text-sm">{desc}</span>
                </div>
              ))}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

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
                en: "The abstract file is not only for LLMs. It keeps domain knowledge beside the code, so people and agents can understand business invariants before changing implementation files.",
                ko: "abstract 파일은 LLM만을 위한 파일이 아닙니다. 도메인 지식을 코드 옆에 두어 사람과 agent가 구현 파일을 수정하기 전에 비즈니스 불변 조건을 이해할 수 있게 합니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "The five UI suffixes are not five sizes of component either. Each one answers a different question: how the user edits one record, how one record looks in a list, how one record looks on its own page, how a page section is assembled, and what extra action the model offers. The first column of each row is which side of the client boundary the file lives on:",
                ko: "UI 접미사 다섯 개도 컴포넌트의 크기 다섯 단계가 아닙니다. 각각 다른 질문에 답합니다. 사용자가 한 레코드를 어떻게 편집하는지, 목록에서 한 레코드가 어떻게 보이는지, 단독 페이지에서 어떻게 보이는지, 페이지 구역이 어떻게 조립되는지, 그리고 모델이 제공하는 부가 동작이 무엇인지입니다. 각 행의 맨 앞은 그 파일이 클라이언트 경계의 어느 쪽에 있는지입니다:",
              })}
            </div>
            <Docs.IntroTable
              type={l.trans({ en: "File", ko: "파일" })}
              items={moduleFiles.map(({ name, boundary, en, ko }) => ({
                name,
                desc: (
                  <>
                    <span className={badgeRecipe({ variant: boundaryVariant[boundary], outline: true })}>
                      {boundary}
                    </span>
                    {" — "}
                    {l.trans({ en, ko })}
                  </>
                ),
              }))}
            />
            <Docs.Alert type="warning">
              {l.trans({
                en: 'The client boundary follows the suffix, not your judgment. Template, Zone, and Util always carry "use client" on line 1; Unit and View never do, so they render on the server and ship no JavaScript.',
                ko: '클라이언트 경계는 판단이 아니라 접미사를 따릅니다. Template, Zone, Util은 언제나 1번 줄에 "use client"를 두고, Unit과 View는 절대 두지 않습니다. 그래서 Unit과 View는 서버에서 렌더링되고 JavaScript를 전송하지 않습니다.',
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

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
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

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
            <div className="space-y-1 pl-2">
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
                <div key={title}>
                  <span className="font-bold text-foreground">{title}: </span>
                  <span className="text-foreground/70 text-sm">{desc}</span>
                </div>
              ))}
            </div>
            <div className="font-bold text-foreground text-lg">Barrel Imports</div>
            <div>
              {l.trans({
                en: "A page imports by business name from the package entry point instead of a deep file path.",
                ko: "페이지는 깊은 파일 경로 대신 패키지 진입점에서 비즈니스 이름으로 import합니다.",
              })}
            </div>
            <Code.Snippet
              className="w-full"
              title="page/store/products.tsx"
              code={`import { ProductCard } from "@apps/myapp/ui";`}
            />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

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
            <Docs.Matrix
              type={l.trans({ en: "File", ko: "파일" })}
              columns={moduleKinds.map(({ key, folder, en, ko }) => ({
                key,
                label: l.trans({ en, ko }),
                caption: folder,
              }))}
              groups={moduleMatrix.map(({ en, ko, prefix, files }) => ({
                label: l.trans({ en, ko }),
                rows: files.map(({ suffix, ...marks }) => ({
                  name: (
                    <>
                      <span className="hidden font-normal text-foreground/40 sm:inline">{prefix}</span>
                      {suffix}
                    </>
                  ),
                  marks,
                })),
              }))}
              countTemplate={l.trans({ en: "{num} files", ko: "파일 {num}개" })}
              markLabel={l.trans({ en: "Allowed in this module kind", ko: "이 모듈에 둘 수 있음" })}
              emptyLabel={l.trans({ en: "Not allowed in this module kind", ko: "이 모듈에는 둘 수 없음" })}
            />
            <div>
              {l.trans({
                en: "The abstract file is the one whose name changes: a service module drops the folder's underscore, so lib/_payment/ holds payment.abstract.md.",
                ko: "이름이 달라지는 것은 abstract 파일 하나입니다. service 모듈은 폴더의 밑줄을 빼므로 lib/_payment/에는 payment.abstract.md를 둡니다.",
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="workflow" title={l.trans({ en: "Common Choices", ko: "자주 하는 선택" })}>
          <Docs.Title>{l.trans({ en: "Common Choices", ko: "자주 하는 선택" })}</Docs.Title>
          <Docs.Description>
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
            <Docs.IntroTable
              type={l.trans({ en: "Question", ko: "질문" })}
              items={fileChoices.map(({ en, ko, file }) => ({
                name: <span className="font-sans">{l.trans({ en, ko })}</span>,
                desc: <code>{file}</code>,
              }))}
            />
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
