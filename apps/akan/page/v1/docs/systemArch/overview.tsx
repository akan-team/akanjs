import { usePage } from "@apps/akan/client";
import { Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="architecture-overview" title={l.trans({ en: "Architecture Overview", ko: "아키텍처 개요" })}>
        <Docs.Title>{l.trans({ en: "Architecture Overview", ko: "아키텍처 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Akan.js is a full-stack framework designed to accelerate modern web application development. It provides a cohesive architecture that seamlessly integrates backend, frontend, and DevOps systems into one unified development experience.`,
              ko: `Akan.js는 현대적인 웹 애플리케이션 개발을 가속화하기 위해 설계된 풀스택 프레임워크입니다. 백엔드, 프론트엔드, 데브옵스 시스템을 하나의 통합된 개발 경험으로 원활하게 결합하는 응집력 있는 아키텍처를 제공합니다.`,
            })}
          </div>
          <div className="my-6 rounded-lg bg-primary/10 p-6">
            <div className="mb-3 font-bold text-lg text-primary">
              {l.trans({ en: "🎯 Core Philosophy", ko: "🎯 핵심 철학" })}
            </div>
            <div className="text-base-content/80 text-sm">
              {l.trans({
                en: `"Write once, use everywhere" - Define your data models once, and Akan.js automatically generates GraphQL APIs, database schemas, TypeScript types, frontend stores, and UI components.`,
                ko: `"한 번 작성하면 어디서나 사용" - 데이터 모델을 한 번 정의하면, Akan.js가 GraphQL API, 데이터베이스 스키마, TypeScript 타입, 프론트엔드 스토어, UI 컴포넌트를 자동으로 생성합니다.`,
              })}
            </div>
          </div>
        </Docs.Description>
        <Docs.SubTitle>{l.trans({ en: "System Components", ko: "시스템 구성 요소" })}</Docs.SubTitle>
        <Docs.Description>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-2xl">📦</span>
                <strong className="text-base-content text-lg">
                  {l.trans({ en: "Domain Module", ko: "도메인 모듈" })}
                </strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Standardized folder structure implementing Domain-Driven Design. Encapsulates Backend, Frontend, and Common logic for each business domain (e.g., User, Product) into self-contained modules.`,
                  ko: `도메인 주도 설계를 구현하는 표준화된 폴더 구조입니다. 각 비즈니스 도메인(예: User, Product)에 대한 백엔드, 프론트엔드, 공통 로직을 독립적인 모듈로 캡슐화합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-2xl">🖥️</span>
                <strong className="text-base-content text-lg">
                  {l.trans({ en: "Backend System", ko: "백엔드 시스템" })}
                </strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Built on Nest.js, featuring a robust server cluster architecture (Federation & Batch modes). Uses MongoDB for persistence and Redis for caching/subscriptions.`,
                  ko: `Nest.js 기반으로 구축되었으며, 견고한 서버 클러스터 아키텍처(페더레이션 및 배치 모드)를 특징으로 합니다. 영속성을 위해 MongoDB를, 캐싱/구독을 위해 Redis를 사용합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-2xl">🎨</span>
                <strong className="text-base-content text-lg">
                  {l.trans({ en: "Frontend System", ko: "프론트엔드 시스템" })}
                </strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Powered by Next.js 15 App Router. features auto-generated stores (Zustand) and a comprehensive component library (Unit, View, Edit, Zone) for rapid UI development.`,
                  ko: `Next.js 15 App Router를 기반으로 합니다. 빠른 UI 개발을 위해 자동 생성된 스토어(Zustand)와 포괄적인 컴포넌트 라이브러리(Unit, View, Edit, Zone)를 특징으로 합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-2xl">🌍</span>
                <strong className="text-base-content text-lg">{l.trans({ en: "Environment", ko: "환경 설정" })}</strong>
              </div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Centralized configuration via baseEnv and baseClientEnv. Manages settings across diverse environments (Local, Debug, Develop, Main) and modes (SSR/CSR).`,
                  ko: `baseEnv와 baseClientEnv를 통한 중앙 집중식 설정입니다. 다양한 환경(Local, Debug, Develop, Main)과 모드(SSR/CSR) 전반의 설정을 관리합니다.`,
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="domain-architecture" title={l.trans({ en: "Domain Architecture", ko: "도메인 아키텍처" })}>
        <Docs.Title>{l.trans({ en: "Domain Architecture", ko: "도메인 아키텍처" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `At the heart of Akan.js is a module-based architecture where each data model becomes a self-contained module. This structure promotes code organization, reusability, and maintainability across your entire application.`,
              ko: `Akan.js의 핵심에는 각 데이터 모델이 독립적인 모듈이 되는 모듈 기반 아키텍처가 있습니다. 이 구조는 전체 애플리케이션에서 코드 구성, 재사용성, 유지보수성을 촉진합니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `Each module is composed of specialized files that handle specific responsibilities:`,
              ko: `각 모듈은 특정 책임을 처리하는 특화된 파일들로 구성됩니다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg border border-base-300 bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-sm">
                  1
                </span>
                <strong className="text-base-content">Constant & Scalar</strong>
              </div>
              <div className="ml-10 text-base-content/70 text-sm">
                {l.trans({
                  en: `Defines data models, types, and enums using built-in scalars (String, Int) and custom scalars (ID, JSON). This is the single source of truth.`,
                  ko: `내장 스칼라(String, Int)와 커스텀 스칼라(ID, JSON)를 사용하여 데이터 모델, 타입, 열거형을 정의합니다. 이것이 단일 진실의 원천입니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-sm">
                  2
                </span>
                <strong className="text-base-content">Document & Service</strong>
              </div>
              <div className="ml-10 text-base-content/70 text-sm">
                {l.trans({
                  en: `Backend layer. Document handles MongoDB operations and schema validation. Service contains business logic and orchestrates data flow.`,
                  ko: `백엔드 레이어. Document는 MongoDB 작업과 스키마 검증을 처리합니다. Service는 비즈니스 로직을 포함하고 데이터 흐름을 조율합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-sm">
                  3
                </span>
                <strong className="text-base-content">Signal (API)</strong>
              </div>
              <div className="ml-10 text-base-content/70 text-sm">
                {l.trans({
                  en: `Shared interface defining GraphQL endpoints (Slices, Endpoints). Acts as the contract between backend implementations and frontend consumers.`,
                  ko: `GraphQL 엔드포인트(Slice, Endpoint)를 정의하는 공유 인터페이스. 백엔드 구현과 프론트엔드 소비자 사이의 계약 역할을 합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-sm">
                  4
                </span>
                <strong className="text-base-content">Store & Components (Zone, View, Unit)</strong>
              </div>
              <div className="ml-10 text-base-content/70 text-sm">
                {l.trans({
                  en: `Frontend layer. Store manages state via Zustand. Standardized components (Zone, View, Unit) provide consistent UI rendering for models.`,
                  ko: `프론트엔드 레이어. Store는 Zustand를 통해 상태를 관리합니다. 표준화된 컴포넌트(Zone, View, Unit)는 모델에 대한 일관된 UI 렌더링을 제공합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-sm">
                  5
                </span>
                <strong className="text-base-content">Dictionary & CSS</strong>
              </div>
              <div className="ml-10 text-base-content/70 text-sm">
                {l.trans({
                  en: `Support layer. Dictionary handles i18n text. TailwindCSS & DaisyUI provide the styling foundation.`,
                  ko: `지원 레이어. Dictionary는 i18n 텍스트를 처리합니다. TailwindCSS와 DaisyUI는 스타일링 기반을 제공합니다.`,
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="data-flow" title={l.trans({ en: "Data Flow Overview", ko: "데이터 흐름 개요" })}>
        <Docs.Title>{l.trans({ en: "Data Flow Overview", ko: "데이터 흐름 개요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Akan.js ensures a predictable data flow from user interaction to database persistence and back to the UI.`,
              ko: `Akan.js는 사용자 상호작용에서 데이터베이스 영속성까지, 그리고 다시 UI로 돌아오는 예측 가능한 데이터 흐름을 보장합니다.`,
            })}
          </div>
          <div className="my-6 rounded-lg bg-base-200 p-6">
            <div className="mb-4 text-center font-bold text-base-content text-lg">
              {l.trans({ en: "End-to-End Flow", ko: "End-to-End 흐름" })}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
              <div className="rounded-lg bg-primary/70 px-4 py-2 font-medium text-primary-content">UI (Page/Zone)</div>
              <span className="text-base-content/50">→</span>
              <div className="rounded-lg bg-base-300 px-4 py-2 font-medium text-base-content">Store</div>
              <span className="text-base-content/50">→</span>
              <div className="rounded-lg bg-base-300 px-4 py-2 font-medium text-base-content">Signal (GraphQL)</div>
              <span className="text-base-content/50">→</span>
              <div className="rounded-lg bg-base-300 px-4 py-2 font-medium text-base-content">Service</div>
              <span className="text-base-content/50">→</span>
              <div className="rounded-lg bg-base-300 px-4 py-2 font-medium text-base-content">Document</div>
              <span className="text-base-content/50">→</span>
              <div className="rounded-lg bg-primary/70 px-4 py-2 font-medium text-primary-content">MongoDB</div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `For detailed explanations of each layer, refer to the specific documentation sections in the sidebar menu.`,
              ko: `각 레이어에 대한 자세한 설명은 사이드바 메뉴의 특정 문서 섹션을 참조하세요.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
