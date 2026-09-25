import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="multi-client" title={l.trans({ en: "Multi Client", ko: "다중 클라이언트" })}>
        <Docs.Title>{l.trans({ en: "Multi Client", ko: "다중 클라이언트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan can serve multiple web clients from one app by splitting pages with basePath. Each client gets its own first path segment during local development, but in production the matching domain can hide that segment and serve it as a separate site.",
              ko: "Akan은 basePath로 페이지를 나누어 하나의 앱에서 여러 웹 클라이언트를 제공할 수 있습니다. 로컬 개발에서는 각 클라이언트가 첫 번째 경로 세그먼트로 구분되지만, 배포 후에는 연결된 도메인이 그 세그먼트를 숨기고 별도의 사이트처럼 제공합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.Mermaid
          title="One app, many clients"
          chart={`flowchart LR
  app["Akan App<br/>single server and backend"] --> store["store web"]
  app --> admin["admin web"]
  app --> partner["partner web"]
  app --> demo["demo web"]
  store --> domain1["store.example.com"]
  admin --> domain2["admin.example.com"]
  partner --> local1["partner.example.com"]
  demo --> local2["demo.example.com"]`}
        />
        <div className="space-y-1">
          {[
            [
              l.trans({ en: "Multi web", ko: "멀티 웹" }),
              l.trans({
                en: "Each basePath can behave like its own website.",
                ko: "각 basePath가 하나의 독립 웹사이트처럼 동작할 수 있습니다.",
              }),
            ],
            [
              l.trans({ en: "Single backend", ko: "단일 백엔드" }),
              l.trans({
                en: "All clients still share the same app server, domain modules, and services.",
                ko: "모든 클라이언트는 같은 앱 서버, 도메인 모듈, 서비스를 공유합니다.",
              }),
            ],
            [
              l.trans({ en: "Separate builds", ko: "분리된 빌드" }),
              l.trans({
                en: "CSR web and mobile apps can be prepared per basePath.",
                ko: "CSR 웹과 모바일 앱은 basePath별로 준비될 수 있습니다.",
              }),
            ],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
              <span className="font-bold text-base-content">{title}: </span>

              <span className="text-base-content/70 text-sm">{desc}</span>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="route-config" title={l.trans({ en: "Route Config", ko: "라우트 설정" })}>
        <Docs.Title>{l.trans({ en: "Route Config", ko: "라우트 설정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Define clients in akan.config.ts with routes. The basePath names the client, and domains decide which production host should open that client.",
              ko: "akan.config.ts의 routes에서 클라이언트를 정의합니다. basePath는 클라이언트 이름이 되고, domains는 배포 환경에서 어떤 도메인이 그 클라이언트를 열지 결정합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="apps/myapp/akan.config.ts"
          code={`const config = {
  routes: [
    { domains: { main: ["store.example.com"] }, basePath: "store" },
    { domains: { main: ["admin.example.com"] }, basePath: "admin" },
    { domains: {}, basePath: "partner" },
    { domains: {}, basePath: "demo" },
  ],
};`}
        />
        <div className="space-y-1">
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-mono font-semibold text-primary">basePath</div>
            <div className="mt-2 text-base-content/70 text-sm">
              {l.trans({
                en: "The first page folder and the client boundary. For basePath: store, pages live under page/store.",
                ko: "첫 번째 page 폴더이자 클라이언트의 경계입니다. basePath가 store이면 page/store 아래에 페이지를 둡니다.",
              })}
            </div>
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-mono font-semibold text-primary">domains</div>
            <div className="mt-2 text-base-content/70 text-sm">
              {l.trans({
                en: "Production domains that should open this basePath. When the domain matches, users see the site without the basePath segment.",
                ko: "이 basePath를 열 배포 도메인입니다. 도메인이 매칭되면 사용자는 basePath 세그먼트 없이 사이트를 보게 됩니다.",
              })}
            </div>
          </div>
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="when-to-use" title={l.trans({ en: "When To Use", ko: "언제 나눌까" })}>
        <Docs.Title>{l.trans({ en: "When To Use", ko: "언제 나눌까" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use basePath when the business wants to operate separate client surfaces from one app. The codebase and backend stay together, but each client can have its own domain, entry page, build output, and app package.",
              ko: "하나의 앱에서 여러 클라이언트 화면을 별도로 운영해야 할 때 basePath를 사용합니다. 코드베이스와 백엔드는 하나로 유지하면서, 각 클라이언트는 별도의 도메인, 진입 페이지, 빌드 결과물, 앱 패키지를 가질 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-1">
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">
              {l.trans({ en: "Use basePath", ko: "basePath를 쓰는 경우" })}
            </div>
            <div className="mt-2 text-base-content/70 text-sm">
              {l.trans({
                en: "Use it for surfaces that are sold, deployed, or accessed as separate products, even if they share the same domain logic and backend services.",
                ko: "같은 도메인 로직과 백엔드 서비스를 공유하더라도, 제품이나 배포 단위, 접근 대상이 분리되어야 하는 화면에 사용합니다.",
              })}
            </div>
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-bold text-base-content">
              {l.trans({ en: "Use normal routing", ko: "일반 라우팅을 쓰는 경우" })}
            </div>
            <div className="mt-2 text-base-content/70 text-sm">
              {l.trans({
                en: "Use it for pages that are just sections inside the same client, such as account settings, dashboards, tabs, or grouped screens.",
                ko: "계정 설정, 대시보드, 탭 화면, 그룹 화면처럼 같은 클라이언트 안에 속한 페이지에는 일반 라우팅을 사용합니다.",
              })}
            </div>
          </div>
        </div>
        <div className="space-y-1">
          {[
            [
              l.trans({ en: "Customer-facing site and admin", ko: "고객 사이트와 관리자" }),
              l.trans({
                en: "A store site and an admin console often share products, orders, users, and permissions. Split them with basePath when they need different domains, layouts, or release targets.",
                ko: "스토어 사이트와 관리자 콘솔은 상품, 주문, 사용자, 권한을 공유하는 경우가 많습니다. 하지만 도메인, 화면 구성, 배포 대상이 다르다면 basePath로 나누는 것이 좋습니다.",
              }),
            ],
            [
              l.trans({ en: "Different customer groups", ko: "고객군이 다른 서비스" }),
              l.trans({
                en: "For example, a consumer client, partner portal, and internal staff tool can all use the same backend while presenting different home screens and navigation.",
                ko: "예를 들어 일반 고객용 화면, 파트너 포털, 내부 운영 도구는 같은 백엔드를 사용하면서도 서로 다른 홈 화면과 내비게이션을 가질 수 있습니다.",
              }),
            ],
            [
              l.trans({ en: "Separate mobile apps", ko: "별도 모바일 앱" }),
              l.trans({
                en: "If Android and iOS packages must be released separately per brand, region, or user type, each mobile target can point to a different basePath.",
                ko: "브랜드, 지역, 사용자 유형별로 Android와 iOS 앱을 따로 출시해야 한다면 각 모바일 target이 서로 다른 basePath를 바라보게 할 수 있습니다.",
              }),
            ],
            [
              l.trans({ en: "White-label or regional sites", ko: "화이트라벨 또는 지역 사이트" }),
              l.trans({
                en: "When several sites share business rules but need different domains, names, or first screens, basePath keeps them separate without creating multiple apps.",
                ko: "여러 사이트가 같은 비즈니스 규칙을 공유하지만 도메인, 이름, 첫 화면이 달라야 한다면 basePath로 앱을 여러 개 만들지 않고 분리할 수 있습니다.",
              }),
            ],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
              <span className="font-bold text-base-content">{title}: </span>

              <span className="text-base-content/70 text-sm">{desc}</span>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="page-structure" title={l.trans({ en: "Page Structure", ko: "페이지 구조" })}>
        <Docs.Title>{l.trans({ en: "Page Structure", ko: "페이지 구조" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When routes define base paths, every page file must be placed under one of those first folders. Pages directly under page/ are invalid because Akan cannot assign them to a client.",
              ko: "routes에 basePath가 있으면 모든 page 파일은 반드시 그 첫 번째 폴더 중 하나 아래에 있어야 합니다. page/ 바로 아래에 있는 페이지는 어떤 클라이언트에 속하는지 결정할 수 없으므로 유효하지 않습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="page/"
          language="bash"
          code={`page/
├── store/
│   ├── _layout.tsx
│   ├── _index.tsx
│   └── products/
│       └── _index.tsx
├── admin/
│   ├── _layout.tsx
│   └── users.tsx
└── partner/
    ├── _layout.tsx
    └── (public)/
        └── signin.tsx`}
        />
        <Docs.Alert type="info">
          {l.trans({
            en: "In local development, you open each client with its basePath, such as /store or /admin. After deployment, a configured domain can open that same client without showing the basePath in the URL.",
            ko: "로컬 개발에서는 /store, /admin처럼 basePath로 각 클라이언트를 엽니다. 배포 후에는 설정된 도메인이 같은 클라이언트를 basePath 없이 열 수 있습니다.",
          })}
        </Docs.Alert>
        <Docs.Alert type="warning">
          {l.trans({
            en: "Rule: once basePath is declared, pages outside page/basePath/ are not allowed. Akan raises an error instead of routing them.",
            ko: "규칙: basePath가 선언되면 page/basePath/ 밖에 페이지를 둘 수 없습니다. Akan은 이런 페이지를 라우팅하지 않고 에러를 발생시킵니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="local-production" title={l.trans({ en: "Local And Production", ko: "로컬과 배포" })}>
        <Docs.Title>{l.trans({ en: "Local And Production", ko: "로컬과 배포" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The same app can feel different depending on where it runs. Locally, basePath is visible so developers can move between clients in one web server. In production, domains can map directly to each client.",
              ko: "같은 앱이라도 실행 위치에 따라 보이는 방식이 달라집니다. 로컬에서는 하나의 웹 서버 안에서 여러 클라이언트를 오갈 수 있도록 basePath가 보입니다. 배포 환경에서는 도메인이 각 클라이언트로 바로 연결될 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-1">
          <Code.Snippet
            className="w-full"
            title={l.trans({ en: "Local development", ko: "로컬 개발" })}
            language="bash"
            code={`http://localhost:8282/store
http://localhost:8282/admin
http://localhost:8282/partner`}
          />
          <Code.Snippet
            className="w-full"
            title={l.trans({ en: "Production domains", ko: "배포 도메인" })}
            language="bash"
            code={`https://store.example.com  -> store
https://admin.example.com  -> admin
https://partner-main.example.com -> partner`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="csr-mobile" title={l.trans({ en: "CSR And Mobile Builds", ko: "CSR와 모바일 빌드" })}>
        <Docs.Title>{l.trans({ en: "CSR And Mobile Builds", ko: "CSR와 모바일 빌드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When the app is built, Akan can prepare CSR web output per basePath. Mobile targets can also point to a basePath, so Android and iOS apps can open the right client from the same backend.",
              ko: "앱을 빌드하면 Akan은 basePath별 CSR 웹 결과물을 준비할 수 있습니다. 모바일 target도 basePath를 바라볼 수 있으므로, Android와 iOS 앱이 같은 백엔드를 사용하면서 고객군별 클라이언트를 열 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.Mermaid
          title="Build outputs"
          chart={`flowchart LR
  source["Akan App"] --> csr["CSR Web<br/>per basePath"]
  source --> android["Android App<br/>per target"]
  source --> ios["iOS App<br/>per target"]
  csr --> backend["Single Server and Backend"]
  android --> backend
  ios --> backend`}
        />
        <Code.Snippet
          title="Mobile targets"
          code={`const config = {
  routes: [
    { domains: { main: ["store.example.com"] }, basePath: "store" },
    { domains: { main: ["admin.example.com"] }, basePath: "admin" },
  ],
  mobile: {
    appName: "Example App",
    appId: "com.example.app",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      store: {
        basePath: "store",
        appName: "Example Store",
        appId: "com.example.store",
      },
      admin: {
        basePath: "admin",
        appName: "Example Admin",
        appId: "com.example.admin",
      },
    },
  },
};`}
        />
        <Docs.Alert>
          {l.trans({
            en: "This is the main idea: multi web and multi app clients, but one Akan app, one server runtime, and one backend domain model.",
            ko: "핵심은 여러 웹과 여러 앱 클라이언트를 동시에 제공하더라도, Akan 앱과 서버 런타임, 백엔드 도메인 모델은 하나로 유지할 수 있다는 점입니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
