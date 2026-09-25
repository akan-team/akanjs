import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const propsItems: IntroItem[] = [
    { name: "className?: string", desc: "Allows parent components to style the zone." },
    { name: "init?: ClientInit<Model, M>", desc: "Initial data for List/Units loading." },
    { name: "view?: ClientView<Model, M>", desc: "Initial data for View/Single loading." },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="zone-overview" title={"model.Zone.tsx"}>
        <Docs.Title>{"model.Zone.tsx"}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Zone components are 'Business Components' that bridge the gap between Pages and UI Units. They handle data fetching, state management, and business logic for a specific section of the UI.",
              ko: "Zone 컴포넌트는 Page와 UI Unit 사이를 연결하는 '비즈니스 컴포넌트'입니다. UI의 특정 섹션에 대한 데이터 페칭, 상태 관리, 비즈니스 로직을 처리합니다.",
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-orange-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-orange-600">🏗️</span>
                <strong className="text-orange-800">{l.trans({ en: "Page Composition", ko: "페이지 구성" })}</strong>
              </div>
              <div className="text-orange-700 text-sm">
                {l.trans({
                  en: "A Page should ideally be composed of just Layout and Zone components. Detailed UI rendering is delegated to Units or Views.",
                  ko: "Page는 이상적으로 Layout과 Zone 컴포넌트만으로 구성되어야 합니다. 상세한 UI 렌더링은 Unit이나 View에 위임합니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="file-convention" title={l.trans({ en: "File Convention", ko: "파일 규칙" })}>
        <Docs.Title>{l.trans({ en: "File Convention", ko: "파일 규칙" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Zone files are located in the library directory of their respective Model. The filename must follow the PascalCase convention.",
              ko: "Zone 파일은 해당 모델의 라이브러리 디렉토리에 위치합니다. 파일 이름은 파스칼 케이스(PascalCase) 규칙을 따릅니다.",
            })}
          </div>
          <div className="mt-4">
            <code className="rounded bg-base-200 px-2 py-1 text-sm">lib/[model]/[Model].Zone.tsx</code>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="component-structure" title={l.trans({ en: "Standard Structure", ko: "표준 구조" })}>
        <Docs.Title>{l.trans({ en: "Standard Structure", ko: "표준 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Zone components typically use `Load.View` or `Load.Units` to handle asynchronous data loading. They interact with the Store for global state and Service for actions.",
              ko: "Zone 컴포넌트는 보통 `Load.View`나 `Load.Units`를 사용하여 비동기 데이터 로딩을 처리합니다. 전역 상태를 위해 Store와, 액션을 위해 Service와 상호 작용합니다.",
            })}
          </div>
        </Docs.Description>

        <Docs.SubTitle>Props</Docs.SubTitle>
        <Docs.IntroTable type="field" items={propsItems} />

        <div className="mb-8" />

        <Docs.SubTitle>{l.trans({ en: "Example Code: List Zone", ko: "예제 코드: List Zone" })}</Docs.SubTitle>
        <Code.Snippet
          title="Product.Zone.tsx (List)"
          code={`"use client";
import { st, Product } from "@my-app/client";
import { Load } from "@akanjs/ui";
import type { ClientInit } from "@akanjs/signal";

interface ListProps {
  className?: string;
  init: ClientInit<"product", Product>; // Initial data from Server Component
}

export const List = ({ className, init }: ListProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      // 1. Loading State
      loading={<div className="loading">Loading...</div>} 
      // 2. Empty State
      renderEmpty={() => <div className="empty">No products found</div>}
      // 3. Render List
      renderList={(products) => (
        <div className="grid grid-cols-2 gap-4">
          {products.map((product) => (
            <Product.Unit.Card 
              key={product.id} 
              product={product} 
              onClick={() => st.do.selectProduct(product.id)} // Service Action
            />
          ))}
        </div>
      )}
    />
  );
};`}
        />

        <div className="mb-8" />

        <Docs.SubTitle>{l.trans({ en: "Example Code: View Zone", ko: "예제 코드: View Zone" })}</Docs.SubTitle>
        <Code.Snippet
          title="Product.Zone.tsx (View)"
          code={`"use client";
import { st, Product } from "@my-app/client";
import { Load } from "@akanjs/ui";
import type { ClientView } from "@akanjs/signal";

interface DetailProps {
  className?: string;
  view: ClientView<"product", Product>; // Initial data
}

export const Detail = ({ className, view }: DetailProps) => {
  const self = st.use.self(); // Store Access

  return (
    <Load.View
      className={className}
      view={view}
      renderView={(product) => (
        <div className="p-4">
           {/* Business Logic: Show Edit button only for owner */}
          {product.owner === self.id && (
            <button onClick={() => st.do.editProduct(product.id)}>Edit</button>
          )}
          
          <Product.View.Content product={product} />
          
          <Product.Zone.Reviews productId={product.id} />
        </div>
      )}
    />
  );
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="best-practices" title={l.trans({ en: "Zone Best Practices", ko: "Zone 모범 사례" })}>
        <Docs.Title>{l.trans({ en: "Zone Best Practices", ko: "Zone 모범 사례" })}</Docs.Title>
        <Docs.Description>
          <div className="my-4 space-y-4">
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">1️⃣</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Keep Pages Thin", ko: "페이지를 얇게 유지" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Move data loading and logic from Page files to Zone files. Pages should primarily focus on Layout composition and routing parameters.",
                  ko: "데이터 로딩과 로직을 Page 파일에서 Zone 파일로 옮기세요. Page는 주로 레이아웃 구성과 라우팅 파라미터에 집중해야 합니다.",
                })}
              </div>
            </div>

            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">2️⃣</span>
                <strong className="text-blue-800">
                  {l.trans({ en: "Handle Loading & Empty States", ko: "로딩 및 공백 상태 처리" })}
                </strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Use `Load.Units` or `Load.View` to gracefully handle loading and empty states within the Zone, providing a better user experience.",
                  ko: "`Load.Units`나 `Load.View`를 사용하여 Zone 내에서 로딩 및 공백 상태를 우아하게 처리하여 더 나은 사용자 경험을 제공하세요.",
                })}
              </div>
            </div>

            <div className="rounded-lg bg-purple-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">3️⃣</span>
                <strong className="text-purple-800">
                  {l.trans({ en: "Encapsulate Business Logic", ko: "비즈니스 로직 캡슐화" })}
                </strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: "Place interaction handlers (e.g., button clicks triggering Service actions) inside the Zone, keeping Unit/View components purely presentational.",
                  ko: "상호 작용 핸들러(예: Service 액션을 트리거하는 버튼 클릭)를 Zone 내부에 배치하여 Unit/View 컴포넌트를 순수하게 프레젠테이션용으로 유지하세요.",
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
