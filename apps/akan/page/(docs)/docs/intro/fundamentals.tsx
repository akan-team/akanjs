import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Link } from "akanjs/ui";
import { BiLinkExternal } from "react-icons/bi";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide
        id="write-once-deploy-everywhere"
        title={l.trans({ en: "Write once, deploy everywhere", ko: "한 번 작성하고 어디든 배포" })}
      >
        <Docs.Title>{l.trans({ en: "Write once, deploy everywhere", ko: "한 번 작성하고 어디든 배포" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Why do we need to create multiple separate projects to implement a single business?",
              ko: "왜 우리는 하나의 비즈니스를 구현하기 위해 쪼개진 여러 프로젝트를 만들어야 하는 걸까요?",
            })}
          </div>
          <div>
            {l.trans({
              en: "Isn't it confusing and inefficient to describe the same business intent separately for backend, frontend, app, database, and deployment? Can't one definition flow through every surface?",
              ko: "백엔드, 프론트엔드, 앱, 데이터베이스, 배포를 위해 같은 비즈니스 의도를 따로 설명하는 것은 혼란스럽고 비효율적인 것 아닐까요? 하나의 정의가 모든 surface로 흐를 수는 없을까요?",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan.js is a full-stack TypeScript framework where business definitions become the source of truth for web, app-oriented client surfaces, server runtime, data contracts, and deployment artifacts.",
              ko: "Akan.js는 비즈니스 정의가 web, app-oriented client surface, server runtime, data contract, deployment artifact의 단일 기준이 되는 풀스택 TypeScript 프레임워크입니다.",
            })}
          </div>
          <div className="my-6 rounded-xl bg-base-200 p-4 md:p-6">
            <div className="grid items-center gap-4 xl:grid-cols-[1fr_auto_1fr]">
              <div className="rounded-xl bg-base-100 p-5 shadow">
                <div className="mb-2 font-bold text-primary text-xl">TypeScript</div>
                <div className="text-base-content/70 text-sm">
                  {l.trans({
                    en: "Write business definitions once: pages, domain modules, signals, services, stores, and UI.",
                    ko: "page, domain module, signal, service, store, UI를 비즈니스 정의로 한 번 작성합니다.",
                  })}
                </div>
              </div>

              <div className="hidden font-bold text-3xl text-primary xl:block">→</div>

              <div className="grid gap-3">
                <div className="rounded-xl border border-primary/20 bg-base-100 p-4 shadow">
                  <div className="mb-1 font-bold">{l.trans({ en: "Akan Runtime", ko: "Akan Runtime" })}</div>
                  <div className="flex flex-wrap gap-2">
                    <span className="badge badge-primary">Bun</span>
                    <span className="badge badge-outline">AkanApp</span>
                    <span className="badge badge-outline">Gateway</span>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl bg-base-100 p-4 shadow">
                    <div className="mb-2 font-bold">{l.trans({ en: "Pages", ko: "Page" })}</div>
                    <div className="text-base-content/70 text-sm">
                      {l.trans({
                        en: "File-routed web and app-oriented client surfaces.",
                        ko: "파일 라우팅 기반 web 및 app-oriented client surface.",
                      })}
                    </div>
                  </div>
                  <div className="rounded-xl bg-base-100 p-4 shadow">
                    <div className="mb-2 font-bold">{l.trans({ en: "Server", ko: "Server" })}</div>
                    <div className="text-base-content/70 text-sm">
                      {l.trans({
                        en: "Services, signals, API traffic, realtime traffic, and background work.",
                        ko: "service, signal, API traffic, realtime traffic, background work.",
                      })}
                    </div>
                  </div>
                  <div className="rounded-xl bg-base-100 p-4 shadow">
                    <div className="mb-2 font-bold">{l.trans({ en: "Data", ko: "Data" })}</div>
                    <div className="flex flex-wrap gap-2">
                      <span className="badge badge-outline">SQLite</span>
                      <span className="badge badge-outline">libSQL</span>
                      <span className="badge badge-outline">Postgres</span>
                      <span className="badge badge-outline">Redis</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-base-100 p-4 shadow">
                  <div className="font-semibold text-sm">
                    {l.trans({
                      en: "One convention-driven workspace produces runtime surfaces, data contracts, generated artifacts, and deployable packages.",
                      ko: "하나의 컨벤션 기반 workspace가 runtime surface, data contract, generated artifact, deployable package를 만들어냅니다.",
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: "With one type-safe business definition, Akan conventions carry your intent across pages, API contracts, services, stores, schemas, and runtime surfaces.",
              ko: "타입 안전한 하나의 비즈니스 정의에서 출발하면 Akan 컨벤션이 page, API contract, service, store, schema, runtime surface까지 의도를 이어줍니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "With this, you spend less time wrestling with platform glue and more time designing the product your customers experience. The same clarity also gives agents a predictable structure to extend.",
              ko: "이를 통해 다양한 플랫폼을 붙이는 일보다 고객이 경험할 제품을 설계하는 데 집중할 수 있습니다. 같은 명료함은 에이전트가 안전하게 확장할 수 있는 예측 가능한 구조도 제공합니다.",
            })}
          </div>
          <Docs.Alert>
            <div>
              {l.trans({
                en: "Akan.js smooths over the following background technologies so your application can grow as one extensible system.",
                ko: "Akan.js는 다음의 배경 기술들을 매끄럽게 통합해 애플리케이션이 하나의 확장 가능한 시스템으로 성장하도록 돕습니다.",
              })}
            </div>
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <div className="flex w-20 items-center whitespace-nowrap text-sm">
                  {l.trans({ en: "Web/Mobile", ko: "웹/모바일" })}:
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href="https://react.dev/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> React
                    </button>
                  </Link>
                  <Link href="https://capacitorjs.com/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> Capacitor
                    </button>
                  </Link>
                  <Link href="https://tailwindcss.com/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> TailwindCSS
                    </button>
                  </Link>
                  <Link href="https://daisyui.com/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> DaisyUI
                    </button>
                  </Link>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex w-20 items-center whitespace-nowrap text-sm">
                  {l.trans({ en: "Server", ko: "서버" })}:
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href="https://bun.sh/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> Bun
                    </button>
                  </Link>
                  <Link href="https://www.sqlite.org/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> SQLite
                    </button>
                  </Link>
                  <Link href="https://turso.tech/libsql" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> libSQL
                    </button>
                  </Link>
                  <Link href="https://www.postgresql.org/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> PostgreSQL
                    </button>
                  </Link>
                  <Link href="https://redis.io/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> Redis
                    </button>
                  </Link>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex w-20 items-center whitespace-nowrap text-sm">
                  {l.trans({ en: "Testing", ko: "테스팅" })}:
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href="https://biomejs.dev/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> Biome
                    </button>
                  </Link>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex w-20 items-center whitespace-nowrap text-sm">
                  {l.trans({ en: "Deployment", ko: "배포" })}:
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href="https://www.docker.com/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> Docker
                    </button>
                  </Link>
                  <Link href="https://kubernetes.io/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> Kubernetes
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider"></div>
      <Scroll.Slide
        id="make-dev-a-businessman"
        title={l.trans({ en: "Make Developer a Businessman", ko: "개발자를 비즈니스맨으로" })}
      >
        <Docs.Title>{l.trans({ en: "Make Developer a Businessman", ko: "개발자를 비즈니스맨으로" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan.js helps you minimize technical plumbing and focus on expressing business logic.",
              ko: "Akan.js는 기술적인 배관 코드를 최소화하고, 비즈니스 로직을 표현하는 데 집중할 수 있도록 도와줍니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan.js also provides built-in application features and installable libraries so proven business patterns can be reused instead of rewritten.",
              ko: "또한, 애플리케이션을 구축하기 위한 편의 기능과 설치 가능한 라이브러리를 제공하여 검증된 비즈니스 패턴을 반복 구현하지 않고 재사용할 수 있게 합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "This is especially important in the age of agentic coding. Agents write better code when business intent has one obvious place and conventions decide where the rest should go.",
              ko: "이는 에이전틱 코딩 시대에 더욱 중요합니다. 비즈니스 의도가 놓일 자리가 분명하고 나머지 배치가 컨벤션으로 정해져 있을 때, 에이전트는 더 좋은 코드를 작성할 수 있습니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Workspace (monorepo)", ko: "워크스페이스 (모노레포)" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Akan.js is monorepo-native. A single organization can develop multiple apps and shared libraries in one repository, and app execution, production builds, library development, and package management all happen from the workspace root.",
              ko: "Akan.js는 monorepo 구조를 기본으로 합니다. 하나의 조직(팀)은 하나의 레포지토리(workspace) 위에서 여러 앱과 공통 라이브러리를 개발하며, 앱 실행부터 production build, library 개발, package 관리까지 모두 workspace root에서 실행하고 운영합니다.",
            })}
          </div>
          <div className="my-6 rounded-xl bg-base-200 p-4 md:p-6">
            <div className="mb-4 text-center font-bold text-2xl">
              {l.trans({ en: "Akan Workspace", ko: "Akan Workspace" })}
            </div>
            <div className="rounded-3xl border border-base-content/20 bg-base-100 p-4 md:p-6">
              <div className="grid gap-4 md:grid-cols-[auto_1fr_auto]">
                <div className="flex flex-row items-center gap-3 md:flex-col md:items-start">
                  <div className="font-bold text-info text-xl">apps</div>
                  <div className="h-px flex-1 border-base-content/30 border-t border-dashed md:h-28 md:border-t-0 md:border-l" />
                  <div className="font-bold text-success text-xl">libs</div>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    {["appA", "appB", "appC"].map((app) => (
                      <div key={app} className="rounded-xl border border-info/30 bg-info/10 p-5 text-center font-bold">
                        {app}
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-success/30 bg-success/10 p-8 text-center font-bold text-xl">
                      libA
                    </div>
                    <div className="rounded-xl border border-success/30 bg-success/10 p-8 text-center font-bold text-xl">
                      libB
                    </div>
                  </div>

                  <div className="grid gap-2 text-base-content/70 text-sm md:grid-cols-3">
                    <div>{l.trans({ en: "appA imports libA", ko: "appA는 libA를 사용" })}</div>
                    <div>{l.trans({ en: "appB imports libA and libB", ko: "appB는 libA와 libB를 사용" })}</div>
                    <div>{l.trans({ en: "appC imports libB", ko: "appC는 libB를 사용" })}</div>
                  </div>
                </div>

                <div className="rounded-xl bg-base-200 p-4 text-center md:w-32">
                  <div className="text-base-content/70 text-sm">{l.trans({ en: "code amount", ko: "코드 비중" })}</div>
                  <div className="mt-2 font-bold text-3xl text-info">20%</div>
                  <div className="text-base-content/60 text-xs">apps</div>
                  <div className="mt-4 font-bold text-3xl text-success">80%</div>
                  <div className="text-base-content/60 text-xs">libs</div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <span className="font-bold">{l.trans({ en: "App(apps): ", ko: "앱(apps): " })}</span>
            {l.trans({
              en: "A deployable product surface. An app owns its pages, runtime entry, app configuration, assets, and app-specific domain code.",
              ko: "독립적으로 배포될 수 있는 제품 surface입니다. 앱은 page, runtime entry, app configuration, asset, 앱 전용 domain code를 가집니다.",
            })}
          </div>
          <div>
            <span className="font-bold">
              {l.trans({ en: "Common library(libs): ", ko: "공통 라이브러리(libs): " })}
            </span>
            {l.trans({
              en: "Reusable business and utility modules shared by multiple apps. Authentication, files, payments, notifications, chat, admin features, and domain modules can live here and be reused safely.",
              ko: "여러 앱이 공유하는 재사용 가능한 비즈니스 및 유틸리티 모듈입니다. 인증, 파일, 결제, 알림, 채팅, 관리자 기능, 도메인 모듈 등을 이곳에 두고 안전하게 재사용할 수 있습니다.",
            })}
          </div>
          <Code.Snippet
            language="bash"
            showLineNumbers={false}
            copy={false}
            code={`
├── apps/                   # ${l.trans({ en: "Application list", ko: "애플리케이션 목록" })}
│   └── appA/               # ${l.trans({ en: "Individual application", ko: "개별 애플리케이션" })}
│   └── appB/               # ${l.trans({ en: "Individual application", ko: "개별 애플리케이션" })}
└── libs/                   # ${l.trans({ en: "Library list", ko: "라이브러리 목록" })}
    ├── shared/             # ${l.trans({ en: "Shared library", ko: "공통 라이브러리" })}
    ├── util/               # ${l.trans({ en: "Utility library", ko: "유틸리티 라이브러리" })}
    └── [other libs]/       # ${l.trans({ en: "Other specific libraries", ko: "기타 특화 라이브러리" })}`}
          />
          <div>
            {l.trans({
              en: "When you run `akan create-workspace`, shared and util libraries are installed by default. These libraries are common libraries that can be used by all apps.",
              ko: "처음 `akan create-workspace`를 진행하면, 기본적으로 shared, util 라이브러리가 설치되고, 이는 공통 라이브러리로서 모든 앱에서 사용할 수 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "You can use common libraries in your created application (e.g. myapp). For example, you can use the shared library to provide admin page and file upload tool.",
              ko: "생성한 내 애플리케이션(e.g. myapp)에서 서버 로직, 도메인 모듈, 클라이언트 로직, 컴포넌트 등의 공통 라이브러리를 사용할 수 있습니다. 예를 들면, shared 라이브러리에서는 관리자페이지와 파일 업로드 도구 등을 제공합니다.",
            })}
          </div>
          <Docs.Alert>
            <div className="font-bold">
              {l.trans({
                en: "80:20 rule",
                ko: "80:20 규칙",
              })}
            </div>
            <div className="mt-2 space-y-2">
              <div>
                {l.trans({
                  en: "A healthy workspace maintains a structure where 80% of the code is shared between apps, and 20% is specific to each app.",
                  ko: "건강하게 유지되는 워크스페이스는 약 80%의 코드가 공통 라이브러리로 공유되고, 20%의 코드가 각 앱에 특화되어 운영되는 구조를 권장합니다.",
                })}
              </div>
              <div>
                {l.trans({
                  en: "However, you don't have to force yourself to follow the rule. Just maintain the workspace with your heart, and the ratio will naturally be adjusted as you maintain it.",
                  ko: "하지만 규칙을 지키려고 노력하지 않아도 됩니다. 당신이 마음을 담아 워크스페이스를 유지보수 하는 과정에서 자연스럽게 비율이 맞추어질 것입니다.",
                })}
              </div>
            </div>
          </Docs.Alert>
          <Docs.SubSubTitle>
            {l.trans({ en: "Workspace file structure", ko: "워크스페이스 파일 구조" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Apps and libraries share a predictable shape so pages, domain modules, assets, and runtime entries are easy to find.",
              ko: "앱과 라이브러리는 예측 가능한 구조를 공유합니다. 그래서 page, domain module, asset, runtime entry가 어디에 있는지 쉽게 찾을 수 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "An app runs through main.ts with AkanApp, while user-facing routes are declared under page/. Domain modules live under lib/ and can be shared from apps or libs.",
              ko: "앱은 main.ts에서 AkanApp으로 실행되고, 사용자에게 전달되는 route는 page/ 아래에 선언합니다. 도메인 모듈은 lib/ 아래에 위치하며 apps와 libs 어디에서든 공유할 수 있습니다.",
            })}
          </div>
          <Code.Snippet
            language="bash"
            showLineNumbers={false}
            copy={false}
            code={`
└── {apps,libs}/            # ${l.trans({ en: "Application or library code", ko: "애플리케이션 또는 라이브러리 코드" })}
    └── {appA,libA}/        # ${l.trans({ en: "Individual application or library", ko: "개별 애플리케이션 또는 라이브러리" })}
        ├── page/           # ${l.trans({ en: "File-routed pages (apps)", ko: "파일 라우팅 page (앱)" })}
        ├── lib/            # ${l.trans({ en: "Domain modules", ko: "도메인 모듈" })}
        ├── public/         # ${l.trans({ en: "Assets files", ko: "애셋 파일" })}
        ├── ui/             # ${l.trans({ en: "UI code (modularized)", ko: "UI 코드 (모듈화 O)" })}
        ├── akan.config.ts  # ${l.trans({ en: "App configuration (apps)", ko: "앱 설정 (앱)" })}
        └── main.ts         # ${l.trans({ en: "Akan runtime entry (apps)", ko: "Akan runtime entry (앱)" })}`}
          />
          <div>
            {l.trans({
              en: "You do not need to understand every file rule at first. Start by knowing whether you are changing a user-facing page, a business domain module, a reusable UI component, or the app runtime configuration.",
              ko: "처음부터 모든 파일 규칙을 이해할 필요는 없습니다. 먼저 내가 바꾸려는 코드가 사용자에게 전달되는 page인지, 비즈니스 domain module인지, 재사용 UI인지, 앱 runtime configuration인지 파악하면 됩니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Because the same conventions are repeated across the workspace, people and agents can navigate unfamiliar code without guessing the architecture from scratch.",
              ko: "워크스페이스 전체에서 같은 컨벤션이 반복되기 때문에 사람과 에이전트 모두 낯선 코드를 처음부터 추측하지 않고 탐색할 수 있습니다.",
            })}
          </div>
          <div className="my-6 rounded-xl bg-base-200 p-4 md:p-6">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="font-bold text-2xl">
                {l.trans({ en: "Application or Library Anatomy", ko: "Application or Library Anatomy" })}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="badge badge-error badge-outline">{l.trans({ en: "server", ko: "server" })}</span>
                <span className="badge badge-success badge-outline">{l.trans({ en: "client", ko: "client" })}</span>
                <span className="badge badge-warning badge-outline">{l.trans({ en: "shared", ko: "shared" })}</span>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-2xl border border-base-content/20 bg-base-100 p-4">
                <div className="mb-3 font-bold text-xl">{l.trans({ en: "Domain modules", ko: "Domain modules" })}</div>
                <div className="grid gap-3">
                  <div className="rounded-xl border border-warning/30 bg-warning/10 p-3">
                    <div className="font-semibold">{l.trans({ en: "Interface", ko: "Interface" })}</div>
                    <div className="text-base-content/70 text-sm">
                      lib/product/product.abstract.md · constant.ts · dictionary.ts · signal.ts
                    </div>
                  </div>
                  <div className="rounded-xl border border-error/30 bg-error/10 p-3">
                    <div className="font-semibold">{l.trans({ en: "Data and service", ko: "Data and service" })}</div>
                    <div className="text-base-content/70 text-sm">lib/product/product.document.ts · service.ts</div>
                  </div>
                  <div className="rounded-xl border border-success/30 bg-success/10 p-3">
                    <div className="font-semibold">{l.trans({ en: "UI and state", ko: "UI and state" })}</div>
                    <div className="text-base-content/70 text-sm">
                      lib/product/product.store.ts · Product.Template.tsx · Unit.tsx · View.tsx · Zone.tsx
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
                  <div className="font-bold">{l.trans({ en: "Scalar modules", ko: "Scalar modules" })}</div>
                  <div className="text-base-content/70 text-sm">
                    lib/__scalar/fileMeta/fileMeta.abstract.md · constant.ts
                  </div>
                </div>
                <div className="rounded-2xl border border-error/30 bg-error/10 p-4">
                  <div className="font-bold">{l.trans({ en: "Service utilities", ko: "Service utilities" })}</div>
                  <div className="text-base-content/70 text-sm">srvkit/account.ts · srvkit/guards.ts</div>
                </div>
                <div className="rounded-2xl border border-success/30 bg-success/10 p-4">
                  <div className="font-bold">{l.trans({ en: "UI and webkit", ko: "UI and webkit" })}</div>
                  <div className="text-base-content/70 text-sm">ui/Field.tsx · webkit/usePushNotification.tsx</div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-success/30 bg-success/10 p-3">
                <div className="font-bold">page/</div>
                <div className="text-base-content/70 text-sm">{l.trans({ en: "App routes", ko: "앱 route" })}</div>
              </div>
              <div className="rounded-xl border border-error/30 bg-error/10 p-3">
                <div className="font-bold">main.ts</div>
                <div className="text-base-content/70 text-sm">
                  {l.trans({ en: "Runtime entry", ko: "runtime entry" })}
                </div>
              </div>
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-3">
                <div className="font-bold">base/ · common/</div>
                <div className="text-base-content/70 text-sm">
                  {l.trans({ en: "Pure shared logic", ko: "순수 공유 로직" })}
                </div>
              </div>
              <div className="rounded-xl bg-base-100 p-3">
                <div className="font-bold">public/ · private/</div>
                <div className="text-base-content/70 text-sm">{l.trans({ en: "Static assets", ko: "정적 asset" })}</div>
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: "By following file rules, an application can remain extensible and reusable as it grows. The important question is not which framework layer to fight with, but which business intent you are expressing and where that intent belongs.",
              ko: "파일 규칙을 따르면 애플리케이션이 커져도 확장 가능하고 재사용 가능한 구조를 유지할 수 있습니다. 중요한 질문은 어떤 프레임워크 레이어와 씨름할지가 아니라, 어떤 비즈니스 의도를 표현하고 있으며 그 의도가 어디에 위치해야 하는지입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "For example, in password-based login, the form belongs near the page or UI component, password rules belong near the shared domain definition, and persistence or security behavior belongs in the service layer of the domain module.",
              ko: "예를 들어 패스워드 기반 로그인 기능에서는 입력 폼은 page 또는 UI component 가까이에, 비밀번호 규칙은 공유 domain definition 가까이에, 저장과 보안 동작은 domain module의 service layer에 두는 식입니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider"></div>
      <Scroll.Slide id="collab-devs-cohesive" title={l.trans({ en: "Collab cohesively", ko: "동료들과 한몸처럼" })}>
        <Docs.Title>{l.trans({ en: "Collab cohesively", ko: "동료들과 한몸처럼" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan.js provides strict file rules so people and agents can implement features in the same shape.",
              ko: "Akan.js는 엄격한 파일 규칙을 제공하여 사람과 에이전트가 같은 형태로 기능을 구현할 수 있도록 돕습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "This lets developers collaborate seamlessly, lets teammates take over work without a long ramp-up, and gives coding agents fewer architectural choices to guess.",
              ko: "이를 통해 개발자들은 한몸처럼 협업할 수 있고, 동료는 긴 러닝커브 없이 작업을 이어받을 수 있으며, 코딩 에이전트는 추측해야 할 아키텍처 선택지를 줄일 수 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The most common tasks in a workspace are 1) writing pages delivered to users and 2) writing domain modules that express business concepts. Akan gives both tasks clear conventions.",
              ko: "워크스페이스에서 가장 많이 작업하는 것은 두 가지입니다. 1) 사용자에게 전달되는 page를 작성하는 것, 2) 비즈니스 개념을 표현하는 domain module을 작성하는 것입니다. Akan은 두 작업 모두에 명확한 컨벤션을 제공합니다.",
            })}
          </div>
          <Docs.SubSubTitle>
            {l.trans({ en: "Page file convention - File-based routing", ko: "페이지 파일 규칙 - 파일 기반 라우팅" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Pages are files that implement user-facing routes and layouts. Akan scans the folder structure under{" "}
                  <code>page/</code>, then serves the generated route artifacts through the Akan runtime.
                </span>
              ),
              ko: (
                <span>
                  페이지는 URL 경로에 맞추어 사용자에게 전달되는 route와 layout을 구현하는 파일입니다. Akan은{" "}
                  <code>page/</code> 아래의 폴더 구조를 스캔하고, 생성된 route artifact를 Akan runtime을 통해
                  제공합니다.
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            language="bash"
            showLineNumbers={false}
            copy={false}
            code={`
└── apps/               # ${l.trans({ en: "Application list", ko: "애플리케이션 목록" })}
    └── appA/           # ${l.trans({ en: "Individual application", ko: "개별 애플리케이션" })}
        └── page/       # ${l.trans({ en: "File-routed pages", ko: "파일 라우팅 page" })}
            ├── pageA/  # ${l.trans({ en: "Page folder", ko: "페이지 폴더" })}
            │   ├── _layout.tsx    # ${l.trans({ en: "Layout component", ko: "레이아웃 컴포넌트" })}
            │   └── _index.tsx       # ${l.trans({ en: "Page component", ko: "페이지 컴포넌트" })}
            └── pageB/             # ${l.trans({ en: "Another page", ko: "다른 페이지" })}
                ├── _layout.tsx    # ${l.trans({ en: "Layout component", ko: "레이아웃 컴포넌트" })}
                ├── _index.tsx       # ${l.trans({ en: "Page component", ko: "페이지 컴포넌트" })}
                └── [param]/       # ${l.trans({ en: "Dynamic segment", ko: "동적 세그먼트" })}
                    ├── _layout.tsx # ${l.trans({ en: "Layout component", ko: "레이아웃 컴포넌트" })}
                    └── _index.tsx  # ${l.trans({ en: "Page component", ko: "페이지 컴포넌트" })}`}
          />
          <Docs.SubSubTitle>
            {l.trans({ en: "Domain module file convention", ko: "도메인 모듈 파일 규칙" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A domain module represents one business concept: user management, orders, payments, projects, and so on. Akan keeps the business abstract, data shape, service behavior, API contract, state, and UI for that concept aligned in one predictable folder.",
              ko: "도메인 모듈은 회원 관리, 주문, 결제, 프로젝트처럼 비즈니스에서 하나의 도메인을 차지하는 개념의 표현입니다. Akan은 해당 개념의 business abstract, 데이터 구조, 서비스 동작, API contract, 상태, UI를 하나의 예측 가능한 폴더 안에서 정렬합니다.",
            })}
          </div>
          <Code.Snippet
            language="bash"
            showLineNumbers={false}
            copy={false}
            code={`
└── {apps,libs}/          # ${l.trans({ en: "Application or library code", ko: "애플리케이션 또는 라이브러리 코드" })}
    └── {appA,libA}/      # ${l.trans({ en: "Individual application or library", ko: "개별 애플리케이션 또는 라이브러리" })}
        └── lib/          # ${l.trans({ en: "Domain modules", ko: "도메인 모듈" })}
            └── moduleA/  # ${l.trans({ en: "Feature module", ko: "기능 모듈" })}
                ├── moduleA.abstract.md   # ${l.trans({ en: "Business intent", ko: "비즈니스 의도" })}
                ├── moduleA.constant.ts   # ${l.trans({ en: "Types and schemas", ko: "타입과 스키마" })}
                ├── moduleA.dictionary.ts # ${l.trans({ en: "Translations", ko: "번역" })}
                ├── moduleA.document.ts   # ${l.trans({ en: "Document", ko: "문서" })}
                ├── moduleA.service.ts    # ${l.trans({ en: "Business logic", ko: "비즈니스 로직" })}
                ├── moduleA.signal.ts     # ${l.trans({ en: "API endpoints", ko: "API 엔드포인트" })}
                ├── moduleA.store.ts      # ${l.trans({ en: "State management", ko: "상태 관리" })}
                ├── moduleA.Template.tsx  # ${l.trans({ en: "Form UI", ko: "수정/생성 UI" })}
                ├── moduleA.Unit.tsx      # ${l.trans({ en: "Overview UI", ko: "개요 UI" })}
                ├── moduleA.Util.tsx      # ${l.trans({ en: "Utility UI", ko: "유틸리티 UI" })}
                ├── moduleA.View.tsx      # ${l.trans({ en: "Detail view UI", ko: "상세 뷰 UI" })}
                └── moduleA.Zone.tsx      # ${l.trans({ en: "Integration UI", ko: "통합 UI" })}`}
          />
          <div>
            {l.trans({
              en: "A domain acts like a living organism. Start with abstract.md for business intent, then keep the schema definition in constant.ts, behavior in service.ts, public contract in signal.ts, and integration UI in Zone.tsx close together. This reduces frontend-backend drift, business logic regressions, and the number of places an agent must inspect before making a change.",
              ko: "하나의 도메인은 복합적인 유기체처럼 활동합니다. abstract.md에는 비즈니스 의도를 두고, constant.ts에는 스키마 정의를, service.ts에는 동작을, signal.ts에는 공개 contract를, Zone.tsx에는 통합 UI를 가까이 둡니다. 이를 통해 백엔드-프론트엔드 간의 버전 격차, 비즈니스 로직 변경 시 발생하는 문제, 에이전트가 변경 전에 탐색해야 하는 위치를 줄일 수 있습니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider"></div>
      <Scroll.Slide id="who-should-use" title={l.trans({ en: "Who should use?", ko: "누구에게 적합한가요?" })}>
        <Docs.Title>{l.trans({ en: "Who should use?", ko: "누구에게 적합한가요?" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan is suitable for developers and teams who want to create product-level value quickly and deliver it to customers.",
              ko: "Akan은 고객에게 빠르게 제품 수준의 가치를 전달하고 싶은 개발자와 팀에게 적합합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Live products must be maintained continuously. Akan.js provides an environment where one developer can operate multiple projects, multiple developers can collaborate as one body, and agents can contribute within the same conventions.",
              ko: "살아있는 제품은 지속적으로 관리되고 운영되어야 합니다. Akan.js는 한 명의 개발자가 여러 프로젝트를 동시에 운영하고, 여러 개발자가 하나의 프로젝트를 한 몸처럼 협업하며, 에이전트도 같은 컨벤션 안에서 기여할 수 있는 환경을 제공합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A framework always has trade-offs. If it is simple, it can be hard to advance. If it allows every style, collaboration becomes harder. Akan chooses convention, business focus, and product delivery.",
              ko: "프레임워크는 언제나 trade-off를 가집니다. 단순하게 사용할 수 있다면 고도화가 어려울 수 있고, 다양성을 포용하면 협업이 어려울 수 있습니다. 우리는 이러한 문제에 대해 다음과 같은 부분에 집중합니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "What we focus on", ko: "우리가 집중하는 부분" })}</Docs.SubSubTitle>
          <div className="ml-2 flex flex-col gap-1 md:ml-4">
            <div>
              {l.trans({
                en: "✅ Abstract interfaces for representing business intent",
                ko: "✅ 비즈니스를 표현하기 위한 추상화된 인터페이스",
              })}
            </div>
            <div>
              {l.trans({
                en: "✅ Continuous stable reflection and update of the latest trends in technology for product-level quality",
                ko: "✅ 제품 수준의 퀄리티를 위한 최신 트렌드 기술의 검토, 안정화된 형태의 지속적 반영",
              })}
            </div>
            <div>
              {l.trans({
                en: "✅ Consistent workflows and best practices through strict, unified rules",
                ko: "✅ 엄격하고 단일화된 규칙을 통한 일관된 작업방식과 모범 사례 제공",
              })}
            </div>
            <div>
              {l.trans({
                en: "✅ Agent-friendly codebases where intent has one obvious place",
                ko: "✅ 의도가 놓일 자리가 분명한 에이전트 친화적 코드베이스",
              })}
            </div>
          </div>

          <Docs.SubSubTitle>
            {l.trans({ en: "What we not focus on", ko: "우리가 집중하지 않는 부분" })}
          </Docs.SubSubTitle>
          <div className="ml-2 flex flex-col gap-1 md:ml-4">
            <div>
              {l.trans({
                en: "❌ Representing unnecessary technical details unrelated to business",
                ko: "❌ 비즈니스와 관련없는 불필요한 기술적 세부사항 표현",
              })}
            </div>
            <div>
              {l.trans({
                en: "❌ Unstable technical reflection and unnecessary optimization",
                ko: "❌ 불안정한 기술 반영과 불필요한 최적화",
              })}
            </div>
            <div>
              {l.trans({
                en: "❌ Allowing many equivalent ways to express the same work",
                ko: "❌ 다양한 작업 방식에 대한 복수 허용",
              })}
            </div>
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Work backward", ko: "역순으로 작업하기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Programming is to create business value by efficiently connecting our lives and customers' lives. Define the problem, create a product-level solution quickly through Akan.js, and easily deliver it to customers!",
              ko: "프로그래밍은 우리와 고객의 삶을 효율화하고 긴밀하게 연결해 비즈니스 가치를 창출하는 것입니다. 문제를 정의하고, 빠르게 Akan.js를 통해 제품 수준의 해결책을 만들어내어 손쉽게 고객에게 전달하세요!",
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  Akan.js is always open to your feedback. If you have any questions, please leave an issue on{" "}
                  <Link href="https://github.com/akan-team/akanjs" target="_blank" className="underline! italic">
                    GitHub
                  </Link>
                  . When you are working for customers, we are working for you.
                </span>
              ),
              ko: (
                <span>
                  언제든 Akan.js는 여러분의 프로젝트를 지원하고, 목소리를 듣는 중입니다. 만약 궁금한 점이 있다면,{" "}
                  <Link href="https://github.com/akan-team/akanjs" target="_blank" className="underline! italic">
                    GitHub
                  </Link>
                  에 이슈를 남겨주세요. 당신은 고객을 위해 일할 때, 우리는 당신을 위해 일합니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
