import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="template-overview" title={"model.Template.tsx"}>
        <Docs.Title>{"model.Template.tsx"}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Templates are UI components dedicated to rendering forms for a specific Model. They bridge the gap between the Store (state) and the Page (layout).",
              ko: "Template은 특정 모델의 폼(Form)을 렌더링하는 전용 UI 컴포넌트입니다. Store(상태)와 Page(레이아웃) 사이를 연결합니다.",
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-indigo-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-indigo-600">🎨</span>
                <strong className="text-indigo-800">
                  {l.trans({ en: "Presentational Component", ko: "프레젠테이션 컴포넌트" })}
                </strong>
              </div>
              <div className="text-indigo-700 text-sm">
                {l.trans({
                  en: "Templates should focus on UI layout and field rendering. Business logic should remain in the Store or Service.",
                  ko: "Template은 UI 레이아웃과 필드 렌더링에 집중해야 합니다. 비즈니스 로직은 Store나 Service에 남겨두어야 합니다.",
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
              en: "Templates are located in the library directory corresponding to their Model. The filename must follow the PascalCase convention.",
              ko: "Template은 해당 모델에 대응하는 라이브러리 디렉토리에 위치합니다. 파일 이름은 파스칼 케이스(PascalCase) 규칙을 따릅니다.",
            })}
          </div>
          <div className="mt-4">
            <code className="rounded bg-base-200 px-2 py-1 text-sm">lib/[model]/[Model].Template.tsx</code>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="component-structure" title={l.trans({ en: "Standard Structure", ko: "표준 구조" })}>
        <Docs.Title>{l.trans({ en: "Standard Structure", ko: "표준 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A Template file typically exports one or more functional components. Each component should accept a className prop.",
              ko: "Template 파일은 보통 하나 이상의 라우트 컴포넌트를 export 합니다. 각 컴포넌트는 className prop을 받아야 합니다.",
            })}
          </div>
        </Docs.Description>

        <div className="mb-8" />

        <Docs.SubTitle>{l.trans({ en: "Example Code", ko: "예제 코드" })}</Docs.SubTitle>
        <Code.Snippet
          title="Product.Template.tsx"
          code={`"use client";
import { Field, Layout } from "@akanjs/ui";
import { st, usePage } from "@my-app/client";

interface GeneralProps {
  className?: string;
}

// 1. Export as a named component
export const General = ({ className }: GeneralProps) => {
  const { l } = usePage();
  
  // 2. Access Form State
  const productForm = st.use.productForm();

  return (
    // 3. Wrap with Layout.Template
    <Layout.Template className={className}>
      
      {/* 4. Use Field Components */}
      <Field.Text
        label={l("product.name")}
        desc={l("product.name.desc")}
        value={productForm.name}
        onChange={st.do.setNameOnProduct} // Auto-generated Action
      />
      
      <Field.Number
        label={l("product.price")}
        value={productForm.price}
        onChange={st.do.setPriceOnProduct}
      />
      
    </Layout.Template>
  );
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="template-usage" title={l.trans({ en: "Template Usage Patterns", ko: "Template 사용 패턴" })}>
        <Docs.Title>{l.trans({ en: "Template Usage Patterns", ko: "Template 사용 패턴" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Templates are designed to be used within wrapper components that handle data loading, modal management, and form submission contexts.",
              ko: "Template은 데이터 로딩, 모달 관리, 폼 제출 컨텍스트를 처리하는 래퍼 컴포넌트 내에서 사용되도록 설계되었습니다.",
            })}
          </div>
        </Docs.Description>

        <Docs.SubTitle>1. In Modal (Model.Edit)</Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "Use 'Model.Edit' to render the template inside a modal or an inline edit view. The wrapper handles the edit state based on the slice Name and model ID.",
            ko: "'Model.Edit'을 사용하여 모달이나 인라인 편집 뷰 내에서 Template을 렌더링하세요. 래퍼가 Slice 이름과 모델 ID를 기반으로 편집 상태를 처리합니다.",
          })}
        </Docs.Description>
        <Code.Snippet
          title="Ticket.Util.tsx"
          code={`import { Model } from "@akanjs/ui";

// Inside a component
<Model.Edit 
  renderTitle="title" 
  sliceName="ticket" 
  modelId={ticketId}
>
  <Ticket.Template.General />
</Model.Edit>`}
        />

        <div className="mb-8" />

        <Docs.SubTitle>2. In Page (Load.Edit)</Docs.SubTitle>
        <Docs.Description>
          {l.trans({
            en: "Use 'Load.Edit' for full-page editing scenarios where data is pre-fetched by a loader. It connects the 'edit' object from the loader to the Template.",
            ko: "로더에 의해 데이터가 미리 로드되는 전체 페이지 편집 시나리오에는 'Load.Edit'을 사용하세요. 로더의 'edit' 객체를 Template에 연결합니다.",
          })}
        </Docs.Description>
        <Code.Snippet
          title="EditPage.tsx"
          code={`import { Load } from "@akanjs/ui";

// Inside a Page component
<Load.Edit
  className="container"
  sliceName="storyInRoot"
  edit={storyEdit} // Passed from loader
  type="form"
  onCancel="back"
  onSubmit="back"
>
  <Story.Template.General storyId={story.id} />
</Load.Edit>`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="best-practices" title={l.trans({ en: "Template Best Practices", ko: "Template 모범 사례" })}>
        <Docs.Title>{l.trans({ en: "Template Best Practices", ko: "Template 모범 사례" })}</Docs.Title>
        <Docs.Description>
          <div className="my-4 space-y-4">
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">1️⃣</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Use Layout.Template", ko: "Layout.Template 사용" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Always wrap the content in <Layout.Template> to ensure consistent padding and spacing within the form context.",
                  ko: "폼 컨텍스트 내에서 일관된 패딩과 간격을 보장하기 위해 항상 <Layout.Template>으로 콘텐츠를 감싸세요.",
                })}
              </div>
            </div>

            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">2️⃣</span>
                <strong className="text-blue-800">
                  {l.trans({ en: "Use Auto-Generated Actions", ko: "자동 생성된 액션 사용" })}
                </strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Bind 'onChange' directly to 'st.do.set[Field]On[Model]' whenever possible. This reduces boilerplate code.",
                  ko: "가능한 경우 'onChange'를 'st.do.set[Field]On[Model]'에 직접 바인딩하세요. 보일러플레이트 코드를 줄여줍니다.",
                })}
              </div>
            </div>

            <div className="rounded-lg bg-purple-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">3️⃣</span>
                <strong className="text-purple-800">{l.trans({ en: "Split Large Forms", ko: "대형 폼 분리" })}</strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: "If a model has many fields, create multiple components (e.g., General, Detail, Settings) in the same file to organize them logically.",
                  ko: "모델에 필드가 많은 경우, 같은 파일 내에 여러 컴포넌트(예: General, Detail, Settings)를 생성하여 논리적으로 정리하세요.",
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
