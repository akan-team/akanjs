import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function UnitDocsPage() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Model.Unit.tsx", ko: "Model.Unit.tsx" })}>
        <Docs.Title>{l.trans({ en: "Model.Unit.tsx", ko: "Model.Unit.tsx" })}</Docs.Title>

        <Docs.Description>
          {l.trans({
            en: "Model.Unit.tsx files are presentational components responsible for rendering a model's summary view, primarily as Cards or List Items. They provide a standard way to display model instances across the application.",
            ko: "Model.Unit.tsx 파일은 모델의 요약 뷰(주로 카드 또는 리스트 아이템)를 렌더링하는 프레젠테이션 컴포넌트입니다. 애플리케이션 전반에서 모델 인스턴스를 표시하는 표준 방법을 제공합니다.",
          })}
        </Docs.Description>
      </Scroll.Slide>

      <div className="divider"></div>

      <Scroll.Slide id="location" title={l.trans({ en: "File Location", ko: "파일 위치" })}>
        <Docs.SubTitle>
          {l.trans({
            en: "File Location and Naming Convention",
            ko: "파일 위치 및 명명 규칙",
          })}
        </Docs.SubTitle>

        <Docs.Description>
          {l.trans({
            en: "Unit files are located alongside other model definitions:",
            ko: "Unit 파일은 다른 모델 정의와 함께 위치합니다:",
          })}
        </Docs.Description>

        <Code.Snippet
          language="typescript"
          code={`
// Standard path pattern
{apps,libs}/*/lib/[model]/[Model].Unit.tsx

// Examples:
libs/social/lib/story/Story.Unit.tsx
apps/my-app/lib/project/Project.Unit.tsx
          `}
        />
      </Scroll.Slide>

      <div className="divider"></div>

      <Scroll.Slide id="interface" title={l.trans({ en: "Interface", ko: "인터페이스" })}>
        <Docs.SubTitle>
          {l.trans({
            en: "Core Interface: ModelProps",
            ko: "핵심 인터페이스: ModelProps",
          })}
        </Docs.SubTitle>

        <Docs.Description>
          {l.trans({
            en: "The @akanjs/client package provides generic props for uniform Unit component implementation.",
            ko: "@akanjs/client 패키지는 통일된 Unit 컴포넌트 구현을 위한 제네릭 props를 제공합니다.",
          })}
        </Docs.Description>

        <Code.Snippet
          language="typescript"
          code={`
import { ModelProps } from "@akanjs/client";
import * as cnst from "../cnst";

// ModelProps automatically types 'className', 'href', and the model prop
// ModelProps<"project", cnst.LightProject>
// -> { className?: string; href?: string; project: cnst.LightProject }
export const Card = ({ className, project, href }: ModelProps<"project", cnst.LightProject>) => { ... }
          `}
        />
      </Scroll.Slide>

      <div className="divider"></div>

      <Scroll.Slide id="basic-usage" title={l.trans({ en: "Basic Usage", ko: "기본 사용법" })}>
        <Docs.SubTitle>
          {l.trans({
            en: "Basic Usage pattern",
            ko: "기본 사용 패턴",
          })}
        </Docs.SubTitle>

        <Docs.SubSubTitle>
          {l.trans({
            en: "Standard Card Component",
            ko: "표준 카드 컴포넌트",
          })}
        </Docs.SubSubTitle>

        <Docs.Description>
          {l.trans({
            en: "The most common export is 'Card'. It should accept 'href' for navigation and 'className' for external styling.",
            ko: "가장 일반적인 export는 'Card'입니다. 네비게이션을 위한 'href'와 외부 스타일링을 위한 'className'을 허용해야 합니다.",
          })}
        </Docs.Description>

        <Code.Snippet
          language="typescript"
          code={`
import { clsx, ModelProps } from "@akanjs/client";
import { Link } from "@akanjs/ui";
import { usePage } from "@my-app/client";
import * as cnst from "../cnst";

export const Card = ({ className, user, href }: ModelProps<"user", cnst.LightUser>) => {
  const { l } = usePage();
  
  return (
    <Link 
      href={href}
      className={clsx(
        "bg-base-100 border-base-200 block rounded-xl border p-4 transition-all hover:shadow-md", 
        className
      )}
    >
      <div className="flex items-center gap-3">
        {/* Helper function usage */}
        <div className="font-bold">{user.nickname}</div>
        <div className="text-sm opacity-50">{user.getAge()}</div>
      </div>
    </Link>
  );
};
          `}
        />
      </Scroll.Slide>

      <div className="divider"></div>

      <Scroll.Slide id="advanced" title={l.trans({ en: "Advanced Usage", ko: "고급 사용법" })}>
        <Docs.SubTitle>
          {l.trans({
            en: "Advanced Patterns",
            ko: "고급 패턴",
          })}
        </Docs.SubTitle>

        <Docs.SubSubTitle>
          {l.trans({
            en: "Handling Actions & State",
            ko: "액션 및 상태 처리",
          })}
        </Docs.SubSubTitle>

        <Docs.Description>
          {l.trans({
            en: "Units can contain interactive elements like toggle buttons or status indicators.",
            ko: "Unit은 토글 버튼이나 상태 표시기와 같은 상호 작용 요소를 포함할 수 있습니다.",
          })}
        </Docs.Description>

        <Code.Snippet
          language="typescript"
          code={`
export const Card = ({ project }: ModelProps<"project", cnst.LightProject>) => {
  
  return (
    <div className="relative p-4">
      <h3>{project.name}</h3>
      
      <div className="mt-2 flex gap-2">
        {/* Conditional rendering based on status */}
        {project.status === "active" ? (
           <Project.Util.ArchiveButton id={project.id} />
        ) : (
           <Project.Util.RestoreButton id={project.id} />
        )}
      </div>
    </div>
  );
};
          `}
        />
      </Scroll.Slide>

      <div className="divider"></div>

      <Scroll.Slide
        id="load-units"
        title={l.trans({
          en: "Integration with Load.Units",
          ko: "Load.Units와의 통합",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Integration with Load.Units",
            ko: "Load.Units와의 통합",
          })}
        </Docs.Title>

        <Docs.Description>
          {l.trans({
            en: "Load.Units is a powerful utility component from @akanjs/ui that handles data fetching, pagination, and list rendering for models. It is the primary way to display lists of Unit components.",
            ko: "Load.Units는 모델의 데이터 가져오기, 페이지 매김 및 목록 렌더링을 처리하는 @akanjs/ui의 강력한 유틸리티 컴포넌트입니다. Unit 컴포넌트 목록을 표시하는 주된 방법입니다.",
          })}
        </Docs.Description>

        <Docs.SubTitle>
          {l.trans({
            en: "Key Props",
            ko: "주요 Props",
          })}
        </Docs.SubTitle>

        <Docs.OptionTable
          items={[
            {
              key: "init",
              type: "ClientInit<T, L>",
              default: "-",
              desc: l.trans({
                en: "The initial data source token.",
                ko: "초기 데이터 소스 토큰입니다.",
              }),
              example: "init={init}",
            },
            {
              key: "renderItem",
              type: "(model, idx) => ReactNode",
              default: "-",
              desc: l.trans({
                en: "Render function for each item.",
                ko: "각 항목을 위한 렌더링 함수입니다.",
              }),
              example: "renderItem={(m) => <Card ... />}",
            },
            {
              key: "renderList",
              type: "(list) => ReactNode",
              default: "-",
              desc: l.trans({
                en: "Alternative to renderItem. Gives full control.",
                ko: "renderItem의 대안입니다. 리스트 제어권을 가집니다.",
              }),
              example: "renderList={(list) => ...}",
            },
            {
              key: "renderEmpty",
              type: "() => ReactNode",
              default: "-",
              desc: l.trans({
                en: "Component to render when empty.",
                ko: "비어 있을 때 렌더링할 컴포넌트입니다.",
              }),
              example: "renderEmpty={() => <Empty />}",
            },
            {
              key: "pagination",
              type: "boolean",
              default: "true",
              desc: l.trans({
                en: "Whether to enable pagination.",
                ko: "페이지 매김 활성화 여부입니다.",
              }),
              example: "pagination={false}",
            },
            {
              key: "filter",
              type: "(item, idx) => boolean",
              default: "-",
              desc: l.trans({
                en: "Client-side filter function.",
                ko: "클라이언트 측 필터 함수입니다.",
              }),
              example: "filter={(m) => m.isActive}",
            },
            {
              key: "sort",
              type: "(a, b) => number",
              default: "-",
              desc: l.trans({
                en: "Client-side sort function.",
                ko: "클라이언트 측 정렬 함수입니다.",
              }),
              example: "sort={(a, b) => a.age - b.age}",
            },
            {
              key: "className",
              type: "string",
              default: "-",
              desc: l.trans({
                en: "Class for the container.",
                ko: "컨테이너를 위한 클래스입니다.",
              }),
              example: 'className="grid-cols-2"',
            },
          ]}
        />

        <Code.Snippet
          language="typescript"
          code={`
import { Load } from "@akanjs/ui";
import { ClientInit } from "@akanjs/signal";
import { st } from "@akanjs/store";
import * as cnst from "../cnst";
import * as Project from "./Project"; // Your Unit export

interface CardProps {
  className?: string;
  init: ClientInit<"project", cnst.LightProject>;
}
export const Card = ({ init }: CardProps) => {
  return (
    <Load.Units
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
      init={init}
      pagination={true}
      renderEmpty={() => (
        <div className="text-center p-10">No projects found</div>
      )}
      renderItem={(project: cnst.LightProject) => (
        <Project.Unit.Card 
          key={project.id} 
          project={project} 
          href={\`/projects/\${project.id}\`} 
        />
      )}
    />
  );
};
          `}
        />
      </Scroll.Slide>

      <div className="divider"></div>

      <Scroll.Slide
        id="examples"
        title={l.trans({
          en: "Real-world Implementation Examples",
          ko: "실제 구현 예시",
        })}
      >
        <Docs.Title>
          {l.trans({
            en: "Real-world Implementation Examples",
            ko: "실제 구현 예시",
          })}
        </Docs.Title>

        <Docs.SubTitle>
          {l.trans({
            en: "1. Inside a Zone Component",
            ko: "1. Zone 컴포넌트 내부",
          })}
        </Docs.SubTitle>

        <Docs.Description>
          {l.trans({
            en: "Zone components often wrap Load.Units to provide a complete 'section' of the UI managed by a store slice.",
            ko: "Zone 컴포넌트는 종종 스토어 슬라이스로 관리되는 UI의 전체 '섹션'을 제공하기 위해 Load.Units를 래핑합니다.",
          })}
        </Docs.Description>

        <Code.Snippet
          language="typescript"
          code={`
// apps/my-app/lib/project/Project.Zone.tsx
export const Card = ({ className, init, prefix = "" }: CardProps) => {
  const { l } = usePage();
  const org = st.use.org();

  return (
    <Load.Units
      className={className}
      init={init}
      renderEmpty={() => (
        <button
          className="btn btn-outline border-dashed h-full w-full"
          onClick={() => st.do.newProject({ org })}
        >
          + {l("base.createModel", { model: l("project.modelName") })}
        </button>
      )}
      renderItem={(project: cnst.LightProject) => (
        <Project.Unit.Card 
          key={project.id} 
          href={\`\${prefix}/project/\${project.id}\`} 
          project={project} 
        />
      )}
    />
  );
};
          `}
        />

        <Docs.SubTitle>
          {l.trans({
            en: "2. Direct List Rendering (without Load.Units)",
            ko: "2. 직접 리스트 렌더링 (Load.Units 미사용)",
          })}
        </Docs.SubTitle>

        <Docs.Description>
          {l.trans({
            en: "For static lists or when data is already available as an array, map over the data and render Unit components directly. This pattern is highly effective for SSR (Server-Side Rendering) where data is pre-fetched and passed as props, avoiding client-side loading states.",
            ko: "정적 목록이나 데이터가 이미 배열로 사용 가능한 경우, 데이터를 map으로 순회하여 Unit 컴포넌트를 직접 렌더링합니다. 이 패턴은 데이터가 미리 가져와져 props로 전달되는 SSR(서버 사이드 렌더링)에서 클라이언트 측 로딩 상태를 방지하는 데 매우 효과적입니다.",
          })}
        </Docs.Description>

        <Code.Snippet
          language="typescript"
          code={`
// apps/my-app/app/.../story/page.tsx
{storyList.map((story, index) => (
  <div key={index} className="card bg-base-100 shadow-sm">
    <div className="card-body">
      <h3 className="card-title">Stories</h3>

      {/* Rendering a list of Units */}
      <div className="flex flex-col gap-2">
        {storyList.map((story) => (
          <Story.Unit.Abstract 
            key={story.id} 
            href={\`/board/\${board.id}/story/\${story.id}\`} 
            story={story} 
          />
        ))}
      </div>
    </div>
  </div>
))}
          `}
        />
      </Scroll.Slide>

      <div className="divider"></div>

      <Scroll.Slide id="best-practices" title={l.trans({ en: "Best Practices", ko: "모범 사례" })}>
        <Docs.SubTitle>
          {l.trans({
            en: "Best Practices",
            ko: "모범 사례",
          })}
        </Docs.SubTitle>

        <div className="space-y-4">
          <div className="rounded-lg bg-blue-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-blue-600">🎨</span>
              <strong className="text-blue-800">{l.trans({ en: "Consistent Styling", ko: "일관된 스타일링" })}</strong>
            </div>
            <div className="text-blue-700 text-sm">
              {l.trans({
                en: "Use 'clsx' for merging external className props to allow easy overrides.",
                ko: "외부 className props 병합에는 'clsx'를 사용하여 쉽게 재정의할 수 있도록 하세요.",
              })}
            </div>
          </div>

          <div className="rounded-lg bg-green-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-green-600">🔗</span>
              <strong className="text-green-800">
                {l.trans({ en: "Proper Navigation", ko: "올바른 네비게이션" })}
              </strong>
            </div>
            <div className="text-green-700 text-sm">
              {l.trans({
                en: "Use <Link> from @akanjs/ui for internal navigation to ensure efficient routing.",
                ko: "효율적인 라우팅을 보장하기 위해 내부 네비게이션에는 @akanjs/ui의 <Link>를 사용하세요.",
              })}
            </div>
          </div>

          <div className="rounded-lg bg-purple-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-purple-600">⚡</span>
              <strong className="text-purple-800">{l.trans({ en: "Performance First", ko: "성능 우선" })}</strong>
            </div>
            <div className="text-purple-700 text-sm">
              {l.trans({
                en: "Use 'Light' types (cnst.LightModel) for performance in lists. Avoid loading full heavy models in Units.",
                ko: "리스트 성능을 위해 'Light' 타입(cnst.LightModel)을 사용하세요. Unit에서 무거운 전체 모델을 로드하는 것을 피하세요.",
              })}
            </div>
          </div>

          <div className="rounded-lg bg-orange-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-orange-600">🧩</span>
              <strong className="text-orange-800">{l.trans({ en: "Logic Separation", ko: "로직 분리" })}</strong>
            </div>
            <div className="text-orange-700 text-sm">
              {l.trans({
                en: "Keep logic minimal in Unit components. Delegate complex interactions (like buttons) to separate Utility components.",
                ko: "Unit 컴포넌트의 로직을 최소화하세요. 복잡한 상호 작용(예: 버튼)은 별도의 유틸리티 컴포넌트에 위임하세요.",
              })}
            </div>
          </div>

          <div className="rounded-lg bg-base-200 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span>♿</span>
              <strong>{l.trans({ en: "Accessibility", ko: "접근성" })}</strong>
            </div>
            <div className="text-sm opacity-80">
              {l.trans({
                en: "Ensure standard HTML semantics (headings, lists) for accessibility.",
                ko: "접근성을 위해 표준 HTML 시맨틱(제목, 목록)을 준수하세요.",
              })}
            </div>
          </div>
        </div>
      </Scroll.Slide>

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
