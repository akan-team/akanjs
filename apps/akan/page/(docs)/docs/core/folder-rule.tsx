import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { clsx } from "akanjs/client";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="folder-rule" title={l.trans({ en: "Folder Rule", ko: "폴더 규칙" })}>
        <Docs.Title>{l.trans({ en: "Folder Rule", ko: "폴더 규칙" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan folders are designed around business ownership. When you add a new feature, first ask a simple question: is this a page customers visit, business data the app owns, shared UI, or server-only integration code?",
              ko: "Akan의 폴더는 비즈니스 소유 범위를 기준으로 나뉩니다. 새 기능을 만들 때는 먼저 간단히 물어보면 됩니다. 고객이 방문하는 페이지인가요, 앱이 소유하는 비즈니스 데이터인가요, 공유 UI인가요, 아니면 서버에서만 쓰는 연동 코드인가요?",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "Find ownership", ko: "소유 범위 찾기" }),
                desc: l.trans({
                  en: "If only one product uses it, put it in that app. If several products share it, move it to a library.",
                  ko: "한 제품만 쓰면 해당 앱에 둡니다. 여러 제품이 함께 쓰면 라이브러리로 옮깁니다.",
                }),
              },
              {
                title: l.trans({ en: "Keep pages separate", ko: "페이지 분리" }),
                desc: l.trans({
                  en: "Screens such as /orders or /admin/users go under page/. Reusable components and logic go elsewhere.",
                  ko: "/orders, /admin/users 같은 화면은 page/ 아래에 둡니다. 재사용 컴포넌트와 로직은 다른 폴더에 둡니다.",
                }),
              },
              {
                title: l.trans({ en: "Model the business", ko: "비즈니스 모델링" }),
                desc: l.trans({
                  en: "Business nouns such as user, order, product, and invoice usually become folders under lib/.",
                  ko: "user, order, product, invoice 같은 비즈니스 명사는 보통 lib/ 아래 폴더가 됩니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-bold text-base-content">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Code.Snippet
            title="Commerce app example"
            language="bash"
            code={`apps/commerce/
├── page/
│   ├── store/          # customer storefront pages
│   └── admin/          # admin console pages
├── lib/
│   ├── product/        # product data and behavior
│   ├── order/          # order data and behavior
│   └── _payment/       # payment workflow
├── ui/
│   └── ProductCard.tsx
├── srvkit/
│   └── paymentGateway.ts
└── public/
    └── brand-logo.svg`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="workspace-rule" title={l.trans({ en: "Workspace Rule", ko: "워크스페이스 규칙" })}>
        <Docs.Title>{l.trans({ en: "Workspace Rule", ko: "워크스페이스 규칙" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "At the workspace root, choose the folder by how widely the code is used. A single product goes to apps/. Shared product code goes to libs/. Framework code goes to pkgs/.",
              ko: "워크스페이스 루트에서는 코드가 얼마나 넓게 사용되는지를 기준으로 폴더를 선택합니다. 하나의 제품 코드는 apps/에, 여러 제품이 공유하는 코드는 libs/에, 프레임워크 코드는 pkgs/에 둡니다.",
            })}
          </div>
          <Code.Snippet
            title="Workspace"
            language="bash"
            code={`.
├── apps/   # runnable applications
├── libs/   # shared product libraries
└── pkgs/   # Akan framework packages and tools`}
          />
          <div className="space-y-1">
            {[
              {
                title: "apps/",
                desc: l.trans({
                  en: "A business product that can run by itself. Examples: customer web, admin portal, brand site, or mobile-backed service.",
                  ko: "독립적으로 실행되는 비즈니스 제품입니다. 예: 커머스 플랫폼, SaaS 앱, ERP 시스템, 개인용 앱 등",
                }),
              },
              {
                title: "libs/",
                desc: l.trans({
                  en: "Reusable product code shared by several apps. Examples: user account, billing, file upload, social features, security, admin features, etc.",
                  ko: "여러 앱이 공유하는 제품 코드입니다. 예: 사용자 계정, 결제, 파일 업로드, 소셜, 채팅, 보안, 관리자 기능 등.",
                }),
              },
              {
                title: "pkgs/",
                desc: l.trans({
                  en: "Code with special purpose, used or published as npm packages. Examples: payment gateway, robot control code, blockchain integration code, etc.",
                  ko: "특수한 목적을 가진 코드로써, npm 패키지처럼 사용하거나 배포되는 폴더입니다. 예: 결제 연동 라이브러리, 로봇 특화 제어 코드, 블록체인 연동 코드 등",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "Generated folders such as .akan/ and dist/ are build outputs. They help Akan run fast, but you normally do not edit them by hand.",
              ko: ".akan/과 dist/ 같은 생성 폴더는 빌드 결과물입니다. Akan이 빠르게 실행되도록 돕지만, 일반적으로 직접 수정하지 않습니다.",
            })}
          </Docs.Alert>
          <Docs.Alert>
            {l.trans({
              en: "Use pkgs/ only when the code should feel like a separate installable package. Ordinary one-app business logic belongs in apps/, and shared product logic usually belongs in libs/ first.",
              ko: "pkgs/는 코드가 별도 설치 패키지처럼 독립적으로 느껴질 때만 사용합니다. 한 앱의 일반 비즈니스 로직은 apps/에, 여러 제품이 공유하는 제품 로직은 보통 먼저 libs/에 둡니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide
        id="app-lib-folder-rule"
        title={l.trans({ en: "App/Library Folder Rule", ko: "앱/라이브러리 폴더 규칙" })}
      >
        <Docs.Title>{l.trans({ en: "App/Library Folder Rule", ko: "앱/라이브러리 폴더 규칙" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "An app is where a product becomes visible to users. A library is where reusable business capabilities live. They look similar because both can have domain modules, UI, assets, and server helpers.",
              ko: "앱은 제품이 사용자에게 보이는 공간입니다. 라이브러리는 재사용 가능한 비즈니스 기능이 사는 공간입니다. 둘 다 도메인 모듈, UI, 자산, 서버 헬퍼를 가질 수 있기 때문에 구조가 비슷합니다.",
            })}
          </div>
          <div className="space-y-1">
            <Code.Snippet
              className="w-full"
              title="apps/myapp/"
              language="bash"
              code={`apps/myapp/
├── akan.config.ts
├── main.ts
├── page/
├── lib/
├── ui/
├── common/
├── webkit/
├── env/
├── public/
├── srvkit/
├── private/
├── script/
├── client.ts
└── server.ts`}
            />
            <Code.Snippet
              className="w-full"
              title="libs/shared/"
              language="bash"
              code={`libs/shared/
├── akan.config.ts
├── lib/
├── ui/
├── env/
├── public/
├── srvkit/
├── private/
├── common/
├── webkit/
├── client.ts
├── server.ts
└── index.ts`}
            />
          </div>
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "Client", ko: "클라이언트" }),
                type: "client",
                desc: l.trans({
                  en: "Runs in the browser or client app. Keep secrets out of this type.",
                  ko: "브라우저나 클라이언트 앱에서 실행됩니다. 비밀값을 넣으면 안 됩니다.",
                }),
              },
              {
                title: l.trans({ en: "Server", ko: "서버" }),
                type: "server",
                desc: l.trans({
                  en: "Runs on the server. Good for private API calls, scripts, and protected logic.",
                  ko: "서버에서 실행됩니다. 비공개 API 호출, 스크립트, 보호된 로직에 적합합니다.",
                }),
              },
              {
                title: l.trans({ en: "Shared", ko: "공용" }),
                type: "shared",
                desc: l.trans({
                  en: "Can be used from both server and client. Keep it pure and environment-safe.",
                  ko: "서버와 클라이언트 양쪽에서 사용할 수 있습니다. 순수하고 환경에 안전한 코드로 유지하세요.",
                }),
              },
            ].map(({ title, type, desc }) => (
              <div
                key={title}
                className={clsx("rounded-xl border p-4", {
                  "border-success/30 bg-success/10 text-success": type === "client",
                  "border-primary/30 bg-primary/10 text-primary": type === "server",
                  "border-warning/30 bg-warning/10 text-warning": type === "shared",
                })}
              >
                <div className="font-bold">{title}</div>
                <div className="mt-2 text-sm opacity-80">{desc}</div>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            {[
              {
                title: "page/",
                type: "client",
                desc: l.trans({
                  en: "Put pages here when a user can visit them by URL. Examples: home, sign in, product detail, admin dashboard.",
                  ko: "사용자가 URL로 방문하는 화면을 둡니다. 예: 홈, 로그인, 상품 상세, 관리자 대시보드.",
                }),
              },
              {
                title: "lib/",
                type: "shared",
                desc: l.trans({
                  en: "Put business concepts here. Examples: user, product, order, invoice, payment, notification.",
                  ko: "비즈니스 개념을 둡니다. 예: user, product, order, invoice, payment, notification.",
                }),
              },
              {
                title: "ui/",
                type: "client",
                desc: l.trans({
                  en: "Put reusable visual components here. Examples: Header, ProductCard, DatePicker, EmptyState.",
                  ko: "재사용 가능한 화면 컴포넌트를 둡니다. 예: Header, ProductCard, DatePicker, EmptyState.",
                }),
              },
              {
                title: "common/",
                type: "shared",
                desc: l.trans({
                  en: "Put shared code that both server and client can access. Examples: formatters, validators, constants, and pure utilities.",
                  ko: "서버와 클라이언트가 모두 접근할 수 있는 공유 코드를 둡니다. 예: 포맷터, 검증 함수, 상수, 순수 유틸리티.",
                }),
              },
              {
                title: "webkit/",
                type: "client",
                desc: l.trans({
                  en: "Put browser/client helpers here. Examples: hooks for notifications, device APIs, local storage, or web-only behavior.",
                  ko: "브라우저/클라이언트 헬퍼를 둡니다. 예: 알림 hook, 디바이스 API, 로컬 스토리지, 웹 전용 동작.",
                }),
              },
              {
                title: "env/",
                type: "shared",
                desc: l.trans({
                  en: "Environment adapters and environment-specific files generated or used by Akan.",
                  ko: "Akan이 생성하거나 사용하는 환경별 어댑터와 환경 파일을 둡니다.",
                }),
              },
              {
                title: "public/",
                type: "client",
                desc: l.trans({
                  en: "Put static files here. Examples: logos, icons, fonts, downloadable PDFs, sample images.",
                  ko: "정적 파일을 둡니다. 예: 로고, 아이콘, 폰트, 다운로드용 PDF, 샘플 이미지.",
                }),
              },
              {
                title: "srvkit/",
                type: "server",
                desc: l.trans({
                  en: "Put server-only helpers here. Examples: payment API clients, cloud SDK wrappers, private scripts.",
                  ko: "서버에서만 쓰는 헬퍼를 둡니다. 예: 결제 API 클라이언트, 클라우드 SDK 래퍼, 비공개 스크립트.",
                }),
              },
              {
                title: "private/",
                type: "server",
                desc: l.trans({
                  en: "Put implementation-only code here when it should not become part of the public app or library API.",
                  ko: "앱이나 라이브러리의 공개 API가 되면 안 되는 내부 구현 코드를 둡니다.",
                }),
              },
              {
                title: "script/",
                type: "server",
                desc: l.trans({
                  en: "Put development scripts here when you run them while the Akan server is running.",
                  ko: "개발 중 Akan 서버를 켠 상태에서 실행하는 스크립트를 둡니다.",
                }),
              },
            ].map(({ title, type, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <div className="flex items-center gap-3">
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
          <Docs.Alert type="info">
            {l.trans({
              en: "When you are unsure, ask what the file does: screen goes to page/, reusable visual piece goes to ui/, saved business data goes to lib/<model>/, and private server integration goes to srvkit/ or lib/_<service>/.",
              ko: "헷갈릴 때는 파일이 하는 일을 물어보세요. 화면은 page/, 재사용 화면 조각은 ui/, 저장되는 비즈니스 데이터는 lib/<model>/, 비공개 서버 연동은 srvkit/ 또는 lib/_<service>/에 둡니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="module-folder-rule" title={l.trans({ en: "Module Folder Rule", ko: "모듈 폴더 규칙" })}>
        <Docs.Title>{l.trans({ en: "Module Folder Rule", ko: "모듈 폴더 규칙" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Inside lib/, folder names describe the kind of business concept you are building. Use a normal folder for data your business owns, an underscore folder for a capability or integration, and __scalar for reusable value shapes.",
              ko: "lib/ 안에서는 폴더 이름이 만들고 있는 비즈니스 개념의 종류를 설명합니다. 비즈니스가 소유하는 데이터는 일반 폴더, 기능이나 외부 연동은 밑줄 폴더, 재사용 값 형태는 __scalar에 둡니다.",
            })}
          </div>
          <Code.Snippet
            title="lib/"
            language="bash"
            code={`lib/
├── user/             # database module
│   └── user.abstract.md
├── project/          # database module
├── _payment/         # service module
│   └── payment.abstract.md
├── _notification/    # service module
└── __scalar/
    ├── address/
    └── money/
        └── money.abstract.md`}
          />
          <div className="space-y-1">
            {[
              {
                title: "lib/<model>/",
                desc: l.trans({
                  en: "Use this for nouns your business owns and saves. Keep model.abstract.md here for business intent, domain rules, workflows, and agent notes.",
                  ko: "비즈니스가 소유하고 저장하는 명사에 사용합니다. business intent, domain rule, workflow, agent note를 위해 model.abstract.md를 함께 둡니다.",
                }),
              },
              {
                title: "lib/_<service>/",
                desc: l.trans({
                  en: "Use this for actions, workflows, or integrations. The folder keeps the underscore, but the abstract file drops it, such as lib/_payment/payment.abstract.md.",
                  ko: "행동, 워크플로우, 연동 기능에 사용합니다. 폴더에는 밑줄을 유지하지만 abstract 파일명은 lib/_payment/payment.abstract.md처럼 밑줄을 제외합니다.",
                }),
              },
              {
                title: "lib/__scalar/<type>/",
                desc: l.trans({
                  en: "Use this for reusable value shapes shared by models. Keep scalar.abstract.md here when validation meaning or reuse rules need explanation.",
                  ko: "여러 모델이 함께 쓰는 값 형태에 사용합니다. validation 의미나 재사용 규칙 설명이 필요하면 scalar.abstract.md를 함께 둡니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "A simple rule of thumb: if you can say 'this is a thing we store', use lib/<model>/. If you can say 'this is something we do', use lib/_<service>/.",
              ko: "간단한 기준은 이렇습니다. '저장하는 대상'이라면 lib/<model>/을, '수행하는 기능'이라면 lib/_<service>/를 사용하세요.",
            })}
          </Docs.Alert>
          <Docs.Alert>
            {l.trans({
              en: "For external integrations, keep raw vendor clients in srvkit/ and business-facing workflows in lib/_<service>/. For example, paymentGateway.ts calls the vendor API, while lib/_payment creates a payment for an order.",
              ko: "외부 연동에서는 벤더 API를 직접 다루는 낮은 수준의 클라이언트는 srvkit/에 두고, 앱이 이해하는 비즈니스 워크플로우는 lib/_<service>/에 둡니다. 예를 들어 paymentGateway.ts는 결제사 API를 호출하고, lib/_payment는 주문 결제를 생성합니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="growth-path" title={l.trans({ en: "Growth Path", ko: "성장에 따른 이동" })}>
        <Docs.Title>{l.trans({ en: "Growth Path", ko: "성장에 따른 이동" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Folder choice can change as the business grows. Start close to the product, then move code outward only when sharing or packaging becomes real.",
              ko: "비즈니스가 성장하면 코드의 위치도 바뀔 수 있습니다. 처음에는 제품 가까이에 두고, 실제로 공유나 패키징이 필요해질 때 바깥으로 옮기면 됩니다.",
            })}
          </div>
          <Code.Snippet
            title="Code movement"
            language="bash"
            code={`apps/commerce/lib/order/
  # used only by commerce

libs/order/
  # reused by commerce, admin, and partner apps

pkgs/order-sdk/
  # installable or publishable as a standalone package`}
          />
          <div className="space-y-1">
            {[
              {
                title: "apps/",
                desc: l.trans({
                  en: "Start here when the feature belongs to one product. This keeps early business code easy to find.",
                  ko: "기능이 하나의 제품에만 속한다면 여기서 시작합니다. 초기 비즈니스 코드를 찾기 쉽습니다.",
                }),
              },
              {
                title: "libs/",
                desc: l.trans({
                  en: "Move here when two or more apps need the same business model, UI, or service flow.",
                  ko: "두 개 이상의 앱이 같은 비즈니스 모델, UI, 서비스 흐름을 필요로 할 때 옮깁니다.",
                }),
              },
              {
                title: "pkgs/",
                desc: l.trans({
                  en: "Move here only when the code should stand alone with its own package boundary.",
                  ko: "자체 패키지 경계를 가진 독립 코드가 되어야 할 때만 옮깁니다.",
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
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
