import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function ViewDocsPage() {
  const { l } = usePage();

  const comparisonItems: IntroItem[] = [
    {
      name: "Model.View",
      desc: l.trans({
        en: "Renders the Full Model (cnst.Model). Used for main pages.",
        ko: "전체 모델(cnst.Model)을 렌더링합니다. 메인 페이지에 사용됩니다.",
      }),
      example: "Product.View.General",
    },
    {
      name: "Model.Unit",
      desc: l.trans({
        en: "Renders the Light Model (cnst.LightModel). Used for lists/cards.",
        ko: "라이트 모델(cnst.LightModel)을 렌더링합니다. 목록/카드에 사용됩니다.",
      }),
      example: "Product.Unit.Card",
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={"Model.View.tsx"}>
        <Docs.Title>{"Model.View.tsx"}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Model.View.tsx files are specialized server components dedicated to the comprehensive presentation of proper models (Full Models). Unlike Units which display summaries (Light Models), Views are responsible for rendering the full detail of a domain entity, often serving as the main content for detail pages.",
              ko: "Model.View.tsx 파일은 적절한 모델(Full Model)의 포괄적인 프레젠테이션을 전담하는 전문 서버 컴포넌트입니다. 요약(Light Model)을 표시하는 Unit과 달리, View는 도메인 엔터티의 전체 상세 정보를 렌더링하는 역할을 하며, 주로 상세 페이지의 메인 콘텐츠로 사용됩니다.",
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">💎</span>
                <strong className="text-blue-800">{l.trans({ en: "Full Detail", ko: "전체 상세 정보" })}</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Views have access to all properties of a model, including heavy fields like content bodies, detailed arrays, or sensitive data not present in Light Models.",
                  ko: "View는 본문 내용, 상세 배열 또는 Light Model에 없는 민감한 데이터를 포함하여 모델의 모든 속성에 액세스할 수 있습니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="comparison" title={l.trans({ en: "View vs Unit", ko: "View vs Unit" })}>
        <Docs.SubTitle>
          {l.trans({
            en: "View vs Unit: Understanding the Difference",
            ko: "View vs Unit: 차이점 이해하기",
          })}
        </Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "It is crucial to distinguish between View and Unit components to maintain a clean architecture and optimal performance.",
            ko: "깨끗한 아키텍처와 최적의 성능을 유지하기 위해 View와 Unit 컴포넌트를 구별하는 것이 중요합니다.",
          })}
        </Docs.Description>
        <Docs.IntroTable type="Comparison" items={comparisonItems} />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="file-location" title={l.trans({ en: "File Location", ko: "파일 위치" })}>
        <Docs.Title>{l.trans({ en: "File Location", ko: "파일 위치" })}</Docs.Title>
        <Code.Snippet
          title="File Structure"
          code={`
apps/
  [app_name]/
    lib/
      product/
        Product.View.tsx     // Handles cnst.Product (Full)
        Product.Unit.tsx     // Handles cnst.LightProduct (Light)
        Product.Template.tsx // Logic & Interactive forms
          `}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="implementation" title={l.trans({ en: "Implementation", ko: "구현" })}>
        <Docs.Title>{l.trans({ en: "Implementation", ko: "구현" })}</Docs.Title>
        <Docs.Description>
          {l.trans({
            en: "Views typically export a 'General' component and other specialized layouts. They receive the full Model types defined in your constants.",
            ko: "View는 일반적으로 'General' 컴포넌트와 기타 전문 레이아웃을 내보냅니다. 이들은 상수에 정의된 전체 Model 타입을 받습니다.",
          })}
        </Docs.Description>

        <Docs.SubTitle>1. Interface Definition</Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "Define props using the Full Model type (e.g., cnst.Product, not cnst.LightProduct).",
            ko: "전체 Model 타입(예: cnst.LightProduct가 아닌 cnst.Product)을 사용하여 props를 정의하세요.",
          })}
        </Docs.Description>
        <Code.Snippet
          language="typescript"
          code={`
import { cnst } from "@my-app/client";

interface GeneralProps {
  className?: string;
  product: cnst.Product; // 👈 Full Model, not LightProduct
}
          `}
        />

        <div className="mb-8" />

        <Docs.SubTitle>2. General Component</Docs.SubTitle>
        <Code.Snippet
          language="tsx"
          code={`
export const General = ({ className, product }: GeneralProps) => {
  const { l } = usePage();

  return (
    <div className={clsx(className, "flex flex-col gap-8")}>
      {/* 1. Header Section */}
      <div className="flex flex-col gap-4 border-b pb-6">
        <h1 className="text-4xl font-bold">{product.name}</h1>
        <div className="flex items-center gap-2">
           <Product.Util.StatusBadge status={product.status} />
           <span className="text-sm opacity-70">
             {l("base.created", { date: product.createdAt.format("YYYY-MM-DD") })}
           </span>
        </div>
      </div>

      {/* 2. Main Content (Using Full Model Data) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="col-span-2 space-y-6">
           {/* Detail fields available only in Full Model */}
           <div className="prose max-w-none">
             <h3>{l("product.details")}</h3>
             <Product.Unit.Markdown content={product.detailContent} />
           </div>
           
           {/* Nested Arrays */}
           <div className="space-y-4">
             <h3>{l("product.options")}</h3>
             {product.options.map(option => (
               <div key={option.name} className="p-4 bg-base-200 rounded-lg">
                 {option.name}: {option.values.join(", ")}
               </div>
             ))}
           </div>
        </div>
        
        {/* 3. Sidebar / Metadata */}
        <div className="col-span-1">
          <Product.Zone.Sidebar product={product} />
        </div>
      </div>
    </div>
  );
};
          `}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="usage" title={l.trans({ en: "Usage in Detail Pages", ko: "상세 페이지에서의 사용" })}>
        <Docs.Title>{l.trans({ en: "Usage in Detail Pages", ko: "상세 페이지에서의 사용" })}</Docs.Title>
        <Docs.Description>
          {l.trans({
            en: "Views are designed to be served in dynamic routes (e.g., [id]/page.tsx) where the full model is fetched.",
            ko: "View는 전체 모델이 로드되는 동적 라우트(예: [id]/page.tsx)에서 제공되도록 설계되었습니다.",
          })}
        </Docs.Description>

        <Docs.SubTitle>{l.trans({ en: "Using Load.Page", ko: "Load.Page 사용" })}</Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "For optimal performance and clean handling of async data, use the `Load.Page` utility.",
            ko: "최적의 성능과 비동기 데이터의 깔끔한 처리를 위해 `Load.Page` 유틸리티를 사용하세요.",
          })}
        </Docs.Description>
        <Code.Snippet
          language="tsx"
          title="app/[lang]/shop/product/[productId]/page.tsx"
          code={`
import { Load } from "@akanjs/ui";
import { fetch } from "@my-app/client";
import { Product } from "@my-app/client";

export default function Page({ params }: PageProps) {
  return (
    <Load.Page
      of={Page}
      loader={async () => {
        const { productId } = await params;
        
        // 1. Fetch data in parallel
        // 'viewProduct' returns a ClientView object needed for Zone.View
        const [productView] = await Promise.all([
          fetch.viewProduct(productId),
          // other data fetching
        ]);
        
        return { productView } as const;
      }}
      render={({ productView }) => (
        <div className="container py-12">
          {/* 2. Render Zone.View for stable hydration */}
          <Product.Zone.View view={productView} />
        </div>
      )}
    />
  );
}
          `}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="load-view" title={l.trans({ en: "Load.View", ko: "Load.View" })}>
        <Docs.Title>{l.trans({ en: "Load.View", ko: "Load.View" })}</Docs.Title>
        <Docs.Description>
          {l.trans({
            en: "When using Views within Client Components (like Zones or Tab layouts), simply passing props can lead to hydration mismatches. The `Load.View` utility solves this by safely hydrating the model state into the store.",
            ko: "클라이언트 컴포넌트(Zone 또는 탭 레이아웃 등) 내에서 View를 사용할 때, 단순히 props를 전달하면 하이드레이션 불일치가 발생할 수 있습니다. `Load.View` 유틸리티는 모델 상태를 스토어에 안전하게 하이드레이션하여 이 문제를 해결합니다.",
          })}
        </Docs.Description>

        <Docs.SubTitle>
          {l.trans({
            en: "Pattern: Zone.View Wrapper",
            ko: "패턴: Zone.View 래퍼",
          })}
        </Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "Define a specialized Zone component that takes a `ClientView` object and renders your View using `Load.View`.",
            ko: "`ClientView` 객체를 받아 `Load.View`를 사용하여 View를 렌더링하는 특수한 Zone 컴포넌트를 정의하세요.",
          })}
        </Docs.Description>

        <Code.Snippet
          language="tsx"
          title="lib/product/Product.Zone.tsx"
          code={`
import { Load } from "@akanjs/ui";
import { ClientView } from "@akanjs/signal";
import { cnst } from "@my-app/client";
import * as Product from "./Product";

interface ViewProps {
  className?: string;
  view: ClientView<"product", cnst.Product>;
}

export const View = ({ className, view }: ViewProps) => {
  return (
    <Load.View 
      view={view} 
      renderView={(product) => (
        <Product.View.General className={className} product={product} />
      )} 
    />
  );
};
          `}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="composition" title={l.trans({ en: "Composition Strategy", ko: "구성 전략" })}>
        <Docs.Title>{l.trans({ en: "Composition Strategy", ko: "구성 전략" })}</Docs.Title>
        <Docs.Description>
          {l.trans({
            en: "Ideally, a View should not contain complex logic or huge amounts of code. Its main job is to assemble smaller pieces—Units (data), Utilities (actions), and Zones (layouts)—into a complete page.",
            ko: "이상적으로 View는 복잡한 로직이나 방대한 코드를 포함하지 않아야 합니다. View의 주된 역할은 Unit(데이터), Utility(동작), Zone(레이아웃)과 같은 작은 조각들을 조립하여 완성된 페이지를 만드는 것입니다.",
          })}
        </Docs.Description>

        <div className="mt-6 grid grid-cols-1 gap-4">
          <div className="rounded-xl border bg-base-100 p-4">
            <div className="mb-2 font-bold text-lg">View (Parent)</div>
            <div className="text-sm opacity-70">
              {l.trans({ en: "Layouts, Structural grids, Headings", ko: "레이아웃, 구조적 그리드, 제목" })}
            </div>
          </div>
          <div className="flex flex-col items-center justify-center text-2xl opacity-30">⬇️</div>
          <div className="rounded-xl border bg-base-100 p-4">
            <div className="mb-2 font-bold text-lg">Children</div>
            <div className="text-sm opacity-70">
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  <strong>Unit</strong>:{" "}
                  {l.trans({ en: "Sub-items, lists within the view", ko: "하위 항목, 뷰 내의 목록" })}
                </li>
                <li>
                  <strong>Util</strong>:{" "}
                  {l.trans({ en: "Interactive buttons (Like, Share)", ko: "상호 작용 버튼 (좋아요, 공유)" })}
                </li>
                <li>
                  <strong>Zone</strong>:{" "}
                  {l.trans({ en: "Complex subsections (Comments)", ko: "복잡한 하위 섹션 (댓글)" })}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </Scroll.Slide>

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
