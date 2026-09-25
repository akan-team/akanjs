import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Domain Module", ko: "도메인 모듈" })}>
        <Docs.Title>{l.trans({ en: "Domain Module", ko: "도메인 모듈" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A Domain Module is a standardized folder structure that encapsulates all code related to a single domain (e.g., User, Product, Order). It follows Domain-Driven Design principles to organize code around business domains rather than technical concerns.",
              ko: "도메인 모듈은 하나의 도메인(예: User, Product, Order)과 관련된 모든 코드를 캡슐화하는 표준화된 폴더 구조입니다. 기술적 관심사가 아닌 비즈니스 도메인을 중심으로 코드를 구성하는 도메인 주도 설계 원칙을 따릅니다.",
            })}
          </div>
          <Code.Snippet
            title="Domain Module Structure"
            code={`lib/product/
├── product.constant.ts    # Common: Type definitions & schemas
├── product.dictionary.ts  # Common: Internationalization
├── product.signal.ts      # Common: API endpoint definitions
├── product.document.ts    # Backend: MongoDB model & queries
├── product.service.ts     # Backend: Business logic
├── product.store.ts       # Frontend: State management
├── Product.Template.tsx   # Frontend: Form components
├── Product.Unit.tsx       # Frontend: List item components
├── Product.Util.tsx       # Frontend: Utility components
├── Product.View.tsx       # Frontend: Detail view components
└── Product.Zone.tsx       # Frontend: Page container components`}
          />
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">🎯</span>
                <strong className="text-blue-800">{l.trans({ en: "Goal", ko: "목표" })}</strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "The goal is to produce reusable UI components and business logic that can be used in Nest.js backend modules and Next.js frontend pages.",
                  ko: "Nest.js 백엔드 모듈과 Next.js 프론트엔드 페이지에서 사용할 수 있는 재사용 가능한 UI 컴포넌트와 비즈니스 로직을 생산하는 것이 목표입니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="architecture" title={l.trans({ en: "Module Architecture", ko: "모듈 아키텍처" })}>
        <Docs.Title>{l.trans({ en: "Module Architecture", ko: "모듈 아키텍처" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Domain modules are divided into three categories: Common files (shared), Backend files, and Frontend files. This separation eliminates duplicate code declarations.",
              ko: "도메인 모듈은 공통 파일(공유), 백엔드 파일, 프론트엔드 파일의 세 가지 카테고리로 나뉩니다. 이러한 분리는 중복 코드 선언을 제거합니다.",
            })}
          </div>
          <div className="my-6 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-100 p-4 text-slate-900 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-100">
              <div className="mb-3 text-center font-bold text-slate-900 dark:text-slate-100">
                {l.trans({ en: "Data Flow", ko: "데이터 흐름" })}
              </div>
              <div className="space-y-2">
                <div className="rounded-lg border border-green-200 bg-green-100 p-3 text-slate-900 dark:border-green-900/60 dark:bg-green-900/25 dark:text-slate-100">
                  <strong>Common + Backend</strong> → MongoDB Model, Service Logic, Endpoint →{" "}
                  <span className="text-green-700 dark:text-green-300">Nest.js Module</span>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-100 p-3 text-slate-900 dark:border-blue-900/60 dark:bg-blue-900/25 dark:text-slate-100">
                  <strong>Common + Frontend</strong> → Fetch Client, Flux Store, UI Components →{" "}
                  <span className="text-blue-700 dark:text-blue-300">Next.js Component</span>
                </div>
              </div>
            </div>
          </div>
          <div className="my-4 overflow-x-auto">
            <table className="table-zebra table w-full text-sm">
              <thead>
                <tr className="bg-base-300">
                  <th>{l.trans({ en: "Category", ko: "카테고리" })}</th>
                  <th>{l.trans({ en: "Files", ko: "파일" })}</th>
                  <th>{l.trans({ en: "Output", ko: "결과물" })}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span className="badge badge-warning">Common</span>
                  </td>
                  <td>constant, dictionary, signal</td>
                  <td>
                    {l.trans({ en: "Type definitions, translations, API contracts", ko: "타입 정의, 번역, API 계약" })}
                  </td>
                </tr>
                <tr>
                  <td>
                    <span className="badge badge-success">Backend</span>
                  </td>
                  <td>document, service</td>
                  <td>{l.trans({ en: "MongoDB models, business logic", ko: "MongoDB 모델, 비즈니스 로직" })}</td>
                </tr>
                <tr>
                  <td>
                    <span className="badge badge-info">Frontend</span>
                  </td>
                  <td>store, Template, Unit, View, Zone, Util</td>
                  <td>{l.trans({ en: "State management, UI components", ko: "상태 관리, UI 컴포넌트" })}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="common-files" title={l.trans({ en: "Common Files", ko: "공통 파일" })}>
        <Docs.Title>{l.trans({ en: "Common Files", ko: "공통 파일" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Common files are shared between backend and frontend. They must be written in pure JavaScript/TypeScript without platform-specific dependencies.",
              ko: "공통 파일은 백엔드와 프론트엔드 간에 공유됩니다. 플랫폼별 의존성 없이 순수 JavaScript/TypeScript로 작성되어야 합니다.",
            })}
          </div>
          <div className="my-4 overflow-x-auto">
            <table className="table-zebra table w-full text-sm">
              <thead>
                <tr className="bg-base-300">
                  <th>{l.trans({ en: "File", ko: "파일" })}</th>
                  <th>{l.trans({ en: "Description", ko: "설명" })}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code className="font-bold text-purple-600">constant.ts</code>
                  </td>
                  <td>
                    {l.trans({
                      en: "Defines data schemas (Input, Object, Light, Full, Insight) and enums using the via() builder pattern.",
                      ko: "via() 빌더 패턴을 사용하여 데이터 스키마(Input, Object, Light, Full, Insight)와 enum을 정의합니다.",
                    })}
                  </td>
                </tr>
                <tr>
                  <td>
                    <code className="font-bold text-purple-600">dictionary.ts</code>
                  </td>
                  <td>
                    {l.trans({
                      en: "Provides multi-language translations for model names, field labels, enum values, API descriptions, and error messages.",
                      ko: "모델 이름, 필드 레이블, enum 값, API 설명, 에러 메시지에 대한 다국어 번역을 제공합니다.",
                    })}
                  </td>
                </tr>
                <tr>
                  <td>
                    <code className="font-bold text-purple-600">signal.ts</code>
                  </td>
                  <td>
                    {l.trans({
                      en: "Defines API endpoints (queries, mutations, subscriptions) and their type contracts between frontend and backend.",
                      ko: "API 엔드포인트(쿼리, 뮤테이션, 구독)와 프론트엔드-백엔드 간의 타입 계약을 정의합니다.",
                    })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <Docs.Alert>
            <div>
              {l.trans({
                en: "Common files cannot import backend-only (mongoose, fs) or frontend-only (window, document) dependencies. Only @akanjs/base and @akanjs/common are allowed. Type imports are safe as they disappear during transpilation.",
                ko: "공통 파일은 백엔드 전용(mongoose, fs) 또는 프론트엔드 전용(window, document) 의존성을 import할 수 없습니다. @akanjs/base와 @akanjs/common만 허용됩니다. 타입 import는 트랜스파일 시 사라지므로 안전합니다.",
              })}
            </div>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="backend-files" title={l.trans({ en: "Backend Files", ko: "백엔드 파일" })}>
        <Docs.Title>{l.trans({ en: "Backend Files", ko: "백엔드 파일" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Backend files create MongoDB models, implement business logic, and are combined to create a Nest.js module.",
              ko: "백엔드 파일은 MongoDB 모델을 생성하고, 비즈니스 로직을 구현하며, Nest.js 모듈을 만들기 위해 결합됩니다.",
            })}
          </div>
          <div className="my-4 overflow-x-auto">
            <table className="table-zebra table w-full text-sm">
              <thead>
                <tr className="bg-base-300">
                  <th>{l.trans({ en: "File", ko: "파일" })}</th>
                  <th>{l.trans({ en: "Description", ko: "설명" })}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code className="font-bold text-green-600">document.ts</code>
                  </td>
                  <td>
                    {l.trans({
                      en: "Creates MongoDB Document/Model from constant schema. Defines database queries, filters, and data processing logic (Redis cache, text search, etc.).",
                      ko: "constant 스키마로부터 MongoDB Document/Model을 생성합니다. 데이터베이스 쿼리, 필터, 데이터 처리 로직(Redis 캐시, 텍스트 검색 등)을 정의합니다.",
                    })}
                  </td>
                </tr>
                <tr>
                  <td>
                    <code className="font-bold text-green-600">service.ts</code>
                  </td>
                  <td>
                    {l.trans({
                      en: "Implements domain-specific business logic. Handles complex operations, validations, and interactions with other services.",
                      ko: "도메인별 비즈니스 로직을 구현합니다. 복잡한 작업, 검증, 다른 서비스와의 상호작용을 처리합니다.",
                    })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <Code.Snippet
            title="Backend Data Flow"
            code={`// Server-side flow
constant.ts (Schema) 
    → document.ts (MongoDB Model) 
    → service.ts (Business Logic) 
    → signal.ts (API Endpoint)
    → Nest.js Module`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="frontend-files" title={l.trans({ en: "Frontend Files", ko: "프론트엔드 파일" })}>
        <Docs.Title>{l.trans({ en: "Frontend Files", ko: "프론트엔드 파일" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Frontend files define state management, data fetching, and UI components for the domain.",
              ko: "프론트엔드 파일은 도메인에 대한 상태 관리, 데이터 페칭, UI 컴포넌트를 정의합니다.",
            })}
          </div>
          <div className="my-4 overflow-x-auto">
            <table className="table-zebra table w-full text-sm">
              <thead>
                <tr className="bg-base-300">
                  <th>{l.trans({ en: "File", ko: "파일" })}</th>
                  <th>{l.trans({ en: "Type", ko: "타입" })}</th>
                  <th>{l.trans({ en: "Description", ko: "설명" })}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code className="font-bold text-blue-600">store.ts</code>
                  </td>
                  <td>Client</td>
                  <td>
                    {l.trans({
                      en: "Global state management with Zustand. Defines domain-related state and actions.",
                      ko: "Zustand를 사용한 글로벌 상태 관리. 도메인 관련 state와 action을 정의합니다.",
                    })}
                  </td>
                </tr>
                <tr>
                  <td>
                    <code className="font-bold text-blue-600">Template.tsx</code>
                  </td>
                  <td>Client</td>
                  <td>
                    {l.trans({
                      en: "Form components for Create/Update operations with integrated state management.",
                      ko: "상태 관리가 통합된 Create/Update 작업용 폼 컴포넌트.",
                    })}
                  </td>
                </tr>
                <tr>
                  <td>
                    <code className="font-bold text-blue-600">Unit.tsx</code>
                  </td>
                  <td>Server</td>
                  <td>
                    {l.trans({
                      en: "Card/list item components for displaying multiple items. Uses LightModel for efficient rendering.",
                      ko: "여러 항목 표시를 위한 카드/목록 아이템 컴포넌트. 효율적인 렌더링을 위해 LightModel을 사용합니다.",
                    })}
                  </td>
                </tr>
                <tr>
                  <td>
                    <code className="font-bold text-blue-600">View.tsx</code>
                  </td>
                  <td>Server</td>
                  <td>
                    {l.trans({
                      en: "Detail view components for single item display. Uses full Model with all properties.",
                      ko: "단일 항목 상세 표시를 위한 뷰 컴포넌트. 모든 속성이 포함된 전체 Model을 사용합니다.",
                    })}
                  </td>
                </tr>
                <tr>
                  <td>
                    <code className="font-bold text-blue-600">Zone.tsx</code>
                  </td>
                  <td>Client</td>
                  <td>
                    {l.trans({
                      en: "Page container components that compose Template, Unit, View into complete UI sections.",
                      ko: "Template, Unit, View를 완전한 UI 섹션으로 구성하는 페이지 컨테이너 컴포넌트.",
                    })}
                  </td>
                </tr>
                <tr>
                  <td>
                    <code className="font-bold text-blue-600">Util.tsx</code>
                  </td>
                  <td>Client</td>
                  <td>
                    {l.trans({
                      en: "Specialized utility components for domain-specific features (buttons, badges, etc.).",
                      ko: "도메인별 기능(버튼, 배지 등)을 위한 특수 유틸리티 컴포넌트.",
                    })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="my-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="mb-1 font-semibold text-blue-800">
                {l.trans({ en: "State Management", ko: "상태 관리" })}
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "store.ts handles domain state and business logic on client.",
                  ko: "store.ts가 클라이언트에서 도메인 상태와 비즈니스 로직을 처리합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="mb-1 font-semibold text-green-800">
                {l.trans({ en: "UI Components", ko: "UI 컴포넌트" })}
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Template, Unit, View provide reusable UI patterns.",
                  ko: "Template, Unit, View가 재사용 가능한 UI 패턴을 제공합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
              <div className="mb-1 font-semibold text-purple-800">{l.trans({ en: "Container", ko: "컨테이너" })}</div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: "Zone composes components into complete pages.",
                  ko: "Zone이 컴포넌트를 완전한 페이지로 구성합니다.",
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="naming-convention" title={l.trans({ en: "File Naming Convention", ko: "파일 명명 규칙" })}>
        <Docs.Title>{l.trans({ en: "File Naming Convention", ko: "파일 명명 규칙" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan.js follows a consistent naming convention to distinguish between different file types:",
              ko: "Akan.js는 다양한 파일 타입을 구분하기 위해 일관된 명명 규칙을 따릅니다:",
            })}
          </div>
          <div className="my-4 overflow-x-auto">
            <table className="table-zebra table w-full text-sm">
              <thead>
                <tr className="bg-base-300">
                  <th>{l.trans({ en: "Pattern", ko: "패턴" })}</th>
                  <th>{l.trans({ en: "Example", ko: "예시" })}</th>
                  <th>{l.trans({ en: "Description", ko: "설명" })}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>model.*.ts</code>
                  </td>
                  <td>product.constant.ts</td>
                  <td>{l.trans({ en: "Logic files (lowercase)", ko: "로직 파일 (소문자)" })}</td>
                </tr>
                <tr>
                  <td>
                    <code>Model.*.tsx</code>
                  </td>
                  <td>Product.View.tsx</td>
                  <td>{l.trans({ en: "React components (PascalCase)", ko: "React 컴포넌트 (PascalCase)" })}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Code.Snippet
            title="Complete Module Example"
            code={`lib/product/
├── product.constant.ts    # lowercase: logic file
├── product.dictionary.ts  # lowercase: logic file
├── product.signal.ts      # lowercase: logic file
├── product.document.ts    # lowercase: logic file
├── product.service.ts     # lowercase: logic file
├── product.store.ts       # lowercase: logic file
├── Product.Template.tsx   # PascalCase: React component
├── Product.Unit.tsx       # PascalCase: React component
├── Product.Util.tsx       # PascalCase: React component
├── Product.View.tsx       # PascalCase: React component
└── Product.Zone.tsx       # PascalCase: React component`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="best-practices"
        title={l.trans({ en: "Domain Module Best Practices", ko: "도메인 모듈 모범 사례" })}
      >
        <Docs.Title>{l.trans({ en: "Domain Module Best Practices", ko: "도메인 모듈 모범 사례" })}</Docs.Title>
        <Docs.Description>
          <div className="my-4 space-y-4">
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-blue-600">1️⃣</span>
                <strong className="text-blue-800">
                  {l.trans({ en: "Keep Common Files Pure", ko: "공통 파일을 순수하게 유지" })}
                </strong>
              </div>
              <div className="text-blue-700 text-sm">
                {l.trans({
                  en: "Never import platform-specific code in constant.ts, dictionary.ts, or signal.ts. These files must work in both Node.js and browser environments.",
                  ko: "constant.ts, dictionary.ts, signal.ts에서 플랫폼별 코드를 import하지 마세요. 이 파일들은 Node.js와 브라우저 환경 모두에서 동작해야 합니다.",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-green-600">2️⃣</span>
                <strong className="text-green-800">
                  {l.trans({ en: "Use Appropriate Model Types", ko: "적절한 모델 타입 사용" })}
                </strong>
              </div>
              <div className="text-green-700 text-sm">
                {l.trans({
                  en: "Unit.tsx uses LightModel (fewer fields, better performance). View.tsx uses full Model (all fields for detail display).",
                  ko: "Unit.tsx는 LightModel을 사용합니다 (적은 필드, 더 나은 성능). View.tsx는 전체 Model을 사용합니다 (상세 표시를 위한 모든 필드).",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-purple-600">3️⃣</span>
                <strong className="text-purple-800">
                  {l.trans({ en: "Server vs Client Components", ko: "서버 vs 클라이언트 컴포넌트" })}
                </strong>
              </div>
              <div className="text-purple-700 text-sm">
                {l.trans({
                  en: "Unit.tsx and View.tsx are Server Components (no 'use client'). Template.tsx, Zone.tsx, and Util.tsx are Client Components (with 'use client').",
                  ko: "Unit.tsx와 View.tsx는 서버 컴포넌트입니다 ('use client' 없음). Template.tsx, Zone.tsx, Util.tsx는 클라이언트 컴포넌트입니다 ('use client' 포함).",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-yellow-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-yellow-600">4️⃣</span>
                <strong className="text-yellow-800">
                  {l.trans({ en: "Organize by Domain", ko: "도메인별로 구성" })}
                </strong>
              </div>
              <div className="text-sm text-yellow-700">
                {l.trans({
                  en: "Keep all related files in the same folder. This makes it easy to understand and maintain the domain as a whole.",
                  ko: "관련된 모든 파일을 같은 폴더에 유지하세요. 이렇게 하면 도메인 전체를 이해하고 유지보수하기 쉬워집니다.",
                })}
              </div>
            </div>
          </div>
          <div className="my-6 rounded-lg bg-gradient-to-r from-purple-100 to-pink-100 p-6">
            <div className="mb-3 font-bold text-lg text-purple-800">
              {l.trans({ en: "🎉 What You've Learned:", ko: "🎉 학습한 내용:" })}
            </div>
            <ul className="space-y-2 text-purple-700 text-sm">
              <li>
                ✓{" "}
                {l.trans({
                  en: "Domain module structure with 11 standardized files",
                  ko: "11개의 표준화된 파일로 구성된 도메인 모듈 구조",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Three categories: Common (shared), Backend, Frontend",
                  ko: "세 가지 카테고리: 공통(공유), 백엔드, 프론트엔드",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Data flow from constant → document → service → signal",
                  ko: "constant → document → service → signal 데이터 흐름",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Frontend component hierarchy: Zone → Template/Unit/View",
                  ko: "프론트엔드 컴포넌트 계층: Zone → Template/Unit/View",
                })}
              </li>
              <li>
                ✓{" "}
                {l.trans({
                  en: "Naming conventions: lowercase.ts for logic, PascalCase.tsx for components",
                  ko: "명명 규칙: 로직은 소문자.ts, 컴포넌트는 PascalCase.tsx",
                })}
              </li>
            </ul>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
