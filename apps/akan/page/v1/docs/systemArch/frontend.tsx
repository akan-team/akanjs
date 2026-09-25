import { usePage } from "@apps/akan/client";
import { Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Image } from "akanjs/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="frontend-overview" title={l.trans({ en: "Frontend System", ko: "프론트엔드 시스템" })}>
        <Docs.Title>{l.trans({ en: "Frontend System", ko: "프론트엔드 시스템" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `The frontend system is built on Next.js 15 with App Router, providing server-side rendering, client-side interactivity, and a powerful component architecture. Each data model has its own frontend module for organized and maintainable code.`,
              ko: `프론트엔드 시스템은 App Router가 포함된 Next.js 15를 기반으로 구축되어 서버 사이드 렌더링, 클라이언트 측 인터랙티비티, 강력한 컴포넌트 아키텍처를 제공합니다. 각 데이터 모델은 체계적이고 유지보수 가능한 코드를 위해 자체 프론트엔드 모듈을 가집니다.`,
            })}
          </div>
          <div className="my-6 rounded-lg bg-primary/10 p-6">
            <div className="mb-3 font-bold text-lg text-primary">
              {l.trans({ en: "🎨 Architecture Highlights", ko: "🎨 아키텍처 하이라이트" })}
            </div>
            <div className="text-base-content/80 text-sm">
              {l.trans({
                en: `Each frontend module follows the pattern: Page → Component → Store → Fetch. This creates a clear data flow from UI to server synchronization.`,
                ko: `각 프론트엔드 모듈은 Page → Component → Store → Fetch 패턴을 따릅니다. 이것은 UI에서 서버 동기화까지의 명확한 데이터 흐름을 만듭니다.`,
              })}
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="module-structure"
        title={l.trans({ en: "Frontend Module Structure", ko: "프론트엔드 모듈 구조" })}
      >
        <Docs.Title>{l.trans({ en: "Frontend Module Structure", ko: "프론트엔드 모듈 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Each frontend module has a layered structure that separates concerns and enables efficient development:`,
              ko: `각 프론트엔드 모듈은 관심사를 분리하고 효율적인 개발을 가능하게 하는 계층 구조를 가집니다:`,
            })}
          </div>
          <div className="my-6 rounded-lg bg-base-200 p-6">
            <Image src="/akanjsImage/front_0.png" width={1000} height={1000} className="w-full rounded-lg" />
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg border border-base-300 bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-sm">
                  1
                </span>
                <strong className="text-base-content">Page</strong>
              </div>
              <div className="ml-8 text-base-content/70 text-sm">
                {l.trans({
                  en: `The entry point displayed to users. Pages compose Components and connect them to the Store for data and interactions.`,
                  ko: `사용자에게 표시되는 진입점입니다. 페이지는 컴포넌트를 조합하고 데이터와 상호작용을 위해 Store에 연결합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-sm">
                  2
                </span>
                <strong className="text-base-content">Component</strong>
              </div>
              <div className="ml-8 text-base-content/70 text-sm">
                {l.trans({
                  en: `Reusable UI building blocks (Unit, View, Edit, Util, Zone) that render data and handle user interactions.`,
                  ko: `데이터를 렌더링하고 사용자 상호작용을 처리하는 재사용 가능한 UI 빌딩 블록(Unit, View, Edit, Util, Zone)입니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-sm">
                  3
                </span>
                <strong className="text-base-content">Store</strong>
              </div>
              <div className="ml-8 text-base-content/70 text-sm">
                {l.trans({
                  en: `Global state management with auto-generated hooks. Manages form data, lists, and synchronization with the server.`,
                  ko: `자동 생성된 훅이 있는 전역 상태 관리. 폼 데이터, 리스트, 서버와의 동기화를 관리합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-sm">
                  4
                </span>
                <strong className="text-base-content">Fetch</strong>
              </div>
              <div className="ml-8 text-base-content/70 text-sm">
                {l.trans({
                  en: `Auto-generated GraphQL API calls that sync Store state with the backend. Handles queries, mutations, and subscriptions.`,
                  ko: `Store 상태를 백엔드와 동기화하는 자동 생성된 GraphQL API 호출. 쿼리, 뮤테이션, 구독을 처리합니다.`,
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="page-structure" title={l.trans({ en: "Page Structure", ko: "페이지 구조" })}>
        <Docs.Title>{l.trans({ en: "Page Structure", ko: "페이지 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Data-based pages follow a standard CRUD structure with four main page types:`,
              ko: `데이터 기반 페이지는 네 가지 주요 페이지 타입으로 표준 CRUD 구조를 따릅니다:`,
            })}
          </div>
          <div className="my-6 rounded-lg bg-base-200 p-6">
            <Image src="/akanjsImage/front_1.png" width={1000} height={1000} className="w-full rounded-lg" />
          </div>
          <div className="my-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 font-bold text-base-content">📋 Index Page</div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Lists and searches data units. Displays multiple items with filtering, sorting, and pagination capabilities.`,
                  ko: `데이터 유닛을 리스트업하고 검색합니다. 필터링, 정렬, 페이지네이션 기능과 함께 여러 아이템을 표시합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 font-bold text-base-content">➕ New Page</div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Creates new data entries. Renders a form with validation and submits to the server.`,
                  ko: `새로운 데이터 항목을 생성합니다. 검증이 있는 폼을 렌더링하고 서버에 제출합니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 font-bold text-base-content">👁️ View Page</div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Displays a single data item in detail. Shows all fields and related data with full information.`,
                  ko: `단일 데이터 아이템을 상세히 표시합니다. 모든 필드와 관련 데이터를 전체 정보와 함께 보여줍니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 font-bold text-base-content">✏️ Edit Page</div>
              <div className="text-base-content/70 text-sm">
                {l.trans({
                  en: `Modifies existing data. Pre-fills the form with current values and updates on submission.`,
                  ko: `기존 데이터를 수정합니다. 현재 값으로 폼을 미리 채우고 제출 시 업데이트합니다.`,
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="component-types" title={l.trans({ en: "Component Types", ko: "컴포넌트 타입" })}>
        <Docs.Title>{l.trans({ en: "Component Types", ko: "컴포넌트 타입" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Each data model has five component types, divided between server and client rendering:`,
              ko: `각 데이터 모델은 서버와 클라이언트 렌더링으로 나뉜 다섯 가지 컴포넌트 타입을 가집니다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-base-300 px-2 py-1 font-bold text-base-content text-xs">Server</span>
                <strong className="text-base-content">Unit</strong>
              </div>
              <div className="ml-8 text-base-content/70 text-sm">
                {l.trans({
                  en: `Renders summary view of data items. Receives LightType data and outputs HTML. Used in lists and grids on index pages.`,
                  ko: `데이터 아이템의 요약 뷰를 렌더링합니다. LightType 데이터를 받아 HTML을 출력합니다. index 페이지의 리스트와 그리드에서 사용됩니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-base-300 px-2 py-1 font-bold text-base-content text-xs">Server</span>
                <strong className="text-base-content">View</strong>
              </div>
              <div className="ml-8 text-base-content/70 text-sm">
                {l.trans({
                  en: `Renders full detail view of a single item. Receives FullType data with all fields and relations. Used on detail pages.`,
                  ko: `단일 아이템의 전체 상세 뷰를 렌더링합니다. 모든 필드와 관계가 포함된 FullType 데이터를 받습니다. 상세 페이지에서 사용됩니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-primary/70 px-2 py-1 font-bold text-primary-content text-xs">Client</span>
                <strong className="text-base-content">Edit</strong>
              </div>
              <div className="ml-8 text-base-content/70 text-sm">
                {l.trans({
                  en: `Renders forms for creating and editing data. Connects to Store for form state and validation. Used in new, edit, and admin pages.`,
                  ko: `데이터 생성 및 편집을 위한 폼을 렌더링합니다. 폼 상태와 검증을 위해 Store에 연결됩니다. new, edit, 관리자 페이지에서 사용됩니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-primary/70 px-2 py-1 font-bold text-primary-content text-xs">Client</span>
                <strong className="text-base-content">Util</strong>
              </div>
              <div className="ml-8 text-base-content/70 text-sm">
                {l.trans({
                  en: `Handles special interactions like likes, bookmarks, and custom actions. Connects to Store for state management and API calls.`,
                  ko: `좋아요, 북마크, 커스텀 액션 같은 특수 상호작용을 처리합니다. 상태 관리와 API 호출을 위해 Store에 연결됩니다.`,
                })}
              </div>
            </div>
            <div className="rounded-lg bg-base-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-primary/70 px-2 py-1 font-bold text-primary-content text-xs">Client</span>
                <strong className="text-base-content">Zone</strong>
              </div>
              <div className="ml-8 text-base-content/70 text-sm">
                {l.trans({
                  en: `Bridges SSR and client-side rendering. Combines Unit, View, and Util into container areas with loading states and real-time updates.`,
                  ko: `SSR과 클라이언트 측 렌더링을 연결합니다. Unit, View, Util을 로딩 상태와 실시간 업데이트가 있는 컨테이너 영역으로 결합합니다.`,
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="state-management" title={l.trans({ en: "State Management", ko: "상태 관리" })}>
        <Docs.Title>{l.trans({ en: "State Management", ko: "상태 관리" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Akan.js auto-generates a comprehensive state management system for each model:`,
              ko: `Akan.js는 각 모델에 대해 포괄적인 상태 관리 시스템을 자동 생성합니다:`,
            })}
          </div>
          <div className="my-4 space-y-2">
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-xs">
                1
              </span>
              <div>
                <strong>st.use.*</strong>:{" "}
                {l.trans({
                  en: "React hooks to read state values (e.g., st.use.icecreamOrderList(), st.use.icecreamOrderForm())",
                  ko: "상태 값을 읽는 React 훅 (예: st.use.icecreamOrderList(), st.use.icecreamOrderForm())",
                })}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-xs">
                2
              </span>
              <div>
                <strong>st.do.*</strong>:{" "}
                {l.trans({
                  en: "Actions to update state (e.g., st.do.setNameOnIcecreamOrder(), st.do.createIcecreamOrder())",
                  ko: "상태를 업데이트하는 액션 (예: st.do.setNameOnIcecreamOrder(), st.do.createIcecreamOrder())",
                })}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/70 font-bold text-primary-content text-xs">
                3
              </span>
              <div>
                <strong>st.slice.*</strong>:{" "}
                {l.trans({
                  en: "Access slice-specific state and actions for filtered data views",
                  ko: "필터링된 데이터 뷰를 위한 슬라이스별 상태와 액션에 접근",
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
