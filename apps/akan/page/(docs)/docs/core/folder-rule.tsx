import { usePage } from "@apps/akan/client";
import { type BadgeVariants, badgeRecipe, Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

const facets = [
  {
    name: "page/",
    side: "client",
    en: "A screen the user visits. When a feature has its own URL, put the page here. Example: page/orders.tsx serves /orders.",
    ko: "사용자가 방문하는 화면입니다. 기능에 자기 URL이 있으면 여기에 페이지를 둡니다. 예: page/orders.tsx는 /orders를 엽니다.",
  },
  {
    name: "lib/",
    side: "shared",
    en: "Business data and the rules that go with it. When a feature owns something you save, make it a module folder. Example: lib/order/ holds the order data and its behavior.",
    ko: "비즈니스 데이터와 그에 딸린 규칙입니다. 기능이 저장하는 대상을 가지면 모듈 폴더로 만듭니다. 예: lib/order/에 주문 데이터와 동작을 둡니다.",
  },
  {
    name: "ui/",
    side: "client",
    en: "Pieces of screen you reuse across pages and that are not tied to one model. Example: a card or a chart used in several places.",
    ko: "여러 페이지에서 재사용하는 화면 조각이며 특정 모델에 묶이지 않습니다. 예: 여러 곳에서 쓰는 카드나 차트.",
  },
  {
    name: "webkit/",
    side: "client",
    en: "Code that needs the browser or a device feature, or a React hook. Example: a clipboard helper, a camera hook.",
    ko: "브라우저나 기기 기능이 필요하거나 React hook인 코드입니다. 예: 클립보드 헬퍼, 카메라 hook.",
  },
  {
    name: "common/",
    side: "shared",
    en: "Small pure helpers both sides use. Example: date formatting, string utilities.",
    ko: "서버와 클라이언트가 함께 쓰는 작은 순수 헬퍼입니다. 예: 날짜 포맷, 문자열 유틸.",
  },
  {
    name: "srvkit/",
    side: "server",
    en: "Connections to outside services. Example: a payment API client, a mail sender.",
    ko: "외부 서비스에 연결하는 코드입니다. 예: 결제 API 클라이언트, 메일 발송기.",
  },
  {
    name: "env/",
    side: "shared",
    en: "Settings that differ per environment. Example: local and production API hosts.",
    ko: "환경마다 달라지는 설정입니다. 예: local과 production의 API 호스트.",
  },
  {
    name: "plugin/",
    side: "shared",
    en: "Code that changes how the app builds or runs. Example: a plugin that generates image sizes at build time.",
    ko: "앱이 빌드되거나 실행되는 방식을 바꾸는 코드입니다. 예: 빌드 때 이미지 크기를 생성하는 플러그인.",
  },
  {
    name: "native/",
    side: "client",
    en: "Its own native plugins, one folder per plugin id. Example: native/label-printer/ with its page API, Kotlin and Swift.",
    ko: "직접 가진 네이티브 플러그인이며, 플러그인 id마다 폴더 하나입니다. 예: native/label-printer/에 페이지 API, Kotlin, Swift.",
  },
  {
    name: "public/",
    side: "client",
    en: "Files served as they are, with no processing. Example: images, fonts, robots.txt.",
    ko: "가공 없이 그대로 제공되는 파일입니다. 예: 이미지, 폰트, robots.txt.",
  },
  {
    name: "private/",
    side: "server",
    en: "An asset folder the server reads at runtime and never serves to the browser. Example: an ONNX model file, a fixed JSON dataset.",
    ko: "서버가 실행 중에 읽고 브라우저에는 내보내지 않는 애셋 폴더입니다. 예: ONNX 모델 파일, 고정 JSON 데이터셋.",
  },
  {
    name: "script/",
    side: "server",
    en: "Developer scripts you run by hand against a running app. Example: filling the database with test data.",
    ko: "실행 중인 앱에 손으로 돌리는 개발용 스크립트입니다. 예: 테스트 데이터 넣기.",
  },
] as const;

type Side = (typeof facets)[number]["side"];

const sideVariant: { [key in Side]: NonNullable<BadgeVariants["variant"]> } = {
  client: "info",
  shared: "warning",
  server: "error",
} as const;

export default page().render(() => {
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
          <div className="space-y-1 pl-2">
            <div>
              <div>
                <span className="font-bold text-foreground">
                  {l.trans({ en: "Find ownership", ko: "소유 범위 찾기" })}:{" "}
                </span>
                <span className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "If only one product uses it, put it in that app. If several products share it, move it to a library.",
                    ko: "한 제품만 쓰면 해당 앱에 둡니다. 여러 제품이 함께 쓰면 라이브러리로 옮깁니다.",
                  })}
                </span>
              </div>
              <div>
                <span className="font-bold text-foreground">
                  {l.trans({ en: "Keep pages separate", ko: "페이지 분리" })}:{" "}
                </span>
                <span className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "Screens such as /orders or /admin/users go under page/. Reusable components and logic go elsewhere.",
                    ko: "/orders, /admin/users 같은 화면은 page/ 아래에 둡니다. 재사용 컴포넌트와 로직은 다른 폴더에 둡니다.",
                  })}
                </span>
              </div>
              <div>
                <span className="font-bold text-foreground">
                  {l.trans({ en: "Model the business", ko: "비즈니스 모델링" })}:{" "}
                </span>
                <span className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "Business nouns such as user, order, product, and invoice usually become folders under lib/.",
                    ko: "user, order, product, invoice 같은 비즈니스 명사는 보통 lib/ 아래 폴더가 됩니다.",
                  })}
                </span>
              </div>
            </div>
          </div>
          <Docs.Flow
            title={l.trans({ en: "Which folder does this file go in", ko: "이 파일은 어느 folder로 가는가" })}
            direction="LR"
            nodes={{
              owner: { label: l.trans({ en: "Who uses it?", ko: "누가 쓰는가?" }), tone: "info" },
              app: { label: "apps/myapp/", lines: [l.trans({ en: "one product", ko: "제품 하나" })] },
              lib: { label: "libs/shared/", lines: [l.trans({ en: "several products", ko: "여러 제품" })] },
              role: { label: l.trans({ en: "What does the file do?", ko: "이 파일은 무엇을 하는가?" }), tone: "info" },
              pageDir: { label: "page/", lines: [l.trans({ en: "a URL a user visits", ko: "사용자가 방문하는 URL" })] },
              modelDir: {
                label: "lib/model/",
                lines: [l.trans({ en: "data the business stores", ko: "비즈니스가 저장하는 데이터" })],
              },
              serviceDir: {
                label: "lib/_service/",
                lines: [l.trans({ en: "something the business does", ko: "비즈니스가 하는 일" })],
              },
              uiDir: { label: "ui/", lines: [l.trans({ en: "reusable markup", ko: "재사용하는 마크업" })] },
              webkitDir: {
                label: "webkit/",
                lines: [l.trans({ en: "browser API or React hook", ko: "browser API 또는 React hook" })],
              },
              srvkitDir: {
                label: "srvkit/",
                lines: [l.trans({ en: "node, Bun, or a secret", ko: "node, Bun, 또는 secret" })],
              },
              commonDir: {
                label: "common/",
                lines: [l.trans({ en: "pure and isomorphic", ko: "순수하고 isomorphic" })],
              },
            }}
            edges={[
              ["owner", "app"],
              ["owner", "lib"],
              ["app", "role"],
              ["lib", "role"],
              ["role", "pageDir"],
              ["role", "modelDir"],
              ["role", "serviceDir"],
              ["role", "uiDir"],
              ["role", "webkitDir"],
              ["role", "srvkitDir"],
              ["role", "commonDir"],
            ]}
            emphasis={["role"]}
          />
          <Code.Snippet
            className="w-full"
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
│   └── DisplayCard.tsx
├── srvkit/
│   └── paymentGateway.ts
└── public/
    └── brand-logo.svg`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
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
            className="w-full"
            title="Workspace"
            language="bash"
            code={`.
├── apps/   # runnable applications
├── libs/   # shared product libraries
└── pkgs/   # Akan framework packages and tools`}
          />
          <div className="space-y-1 pl-2">
            <div>
              <div>
                <span className="font-bold text-foreground">apps/: </span>
                <span className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "A business product that can run by itself. Examples: customer web, admin portal, brand site, or mobile-backed service.",
                    ko: "독립적으로 실행되는 비즈니스 제품입니다. 예: 커머스 플랫폼, SaaS 앱, ERP 시스템, 개인용 앱 등",
                  })}
                </span>
              </div>
              <div>
                <span className="font-bold text-foreground">libs/: </span>
                <span className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "Reusable product code shared by several apps. Examples: user account, billing, file upload, social features, security, admin features, etc.",
                    ko: "여러 앱이 공유하는 제품 코드입니다. 예: 사용자 계정, 결제, 파일 업로드, 소셜, 채팅, 보안, 관리자 기능 등.",
                  })}
                </span>
              </div>
              <div>
                <span className="font-bold text-foreground">pkgs/: </span>
                <span className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "Code with special purpose, used or published as npm packages. Examples: payment gateway, robot control code, etc.",
                    ko: "특수한 목적을 가진 코드로써, npm 패키지처럼 사용하거나 배포되는 폴더입니다. 예: 결제 연동 라이브러리, 로봇 특화 제어 코드 등",
                  })}
                </span>
              </div>
            </div>
          </div>
          <Docs.Alert type="info">
            {l.trans({
              en: "Generated folders such as .akan/ and dist/ are build outputs, and you normally do not edit them by hand.",
              ko: ".akan/과 dist/ 같은 생성 폴더는 빌드 결과물이며, 일반적으로 직접 수정하지 않습니다.",
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
      <Divider />
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
          <div className="w-full justify-center gap-2 space-y-1 lg:flex">
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
├── plugin/
├── native/
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
├── page/
├── ui/
├── env/
├── public/
├── srvkit/
├── private/
├── common/
├── webkit/
├── plugin/
├── native/
├── client.ts
├── server.ts
└── index.ts`}
            />
          </div>
          <div>
            {l.trans({
              en: "Each folder has an admission test rather than a theme, and the first column says which side of the client boundary its code runs on. A client folder ships to the browser, so nothing secret may reach one; a shared folder is read from both sides, so it must stay pure and environment-safe. A file that fails every test does not belong in the app or library root at all.",
              ko: "각 폴더에는 느낌이 아니라 들어올 수 있는 조건이 있고, 첫 열은 그 코드가 클라이언트 경계의 어느 쪽에서 도는지를 말합니다. client 폴더는 브라우저까지 전송되므로 비밀값이 닿아서는 안 되고, shared 폴더는 양쪽에서 읽으므로 순수하고 환경에 안전해야 합니다. 어떤 조건에도 맞지 않는 파일은 애초에 앱·라이브러리 루트에 두지 않습니다.",
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Folder", ko: "폴더" })}
            items={facets.map(({ name, side, en, ko }) => ({
              name,
              desc: (
                <>
                  <span className={badgeRecipe({ variant: sideVariant[side], outline: true })}>{side}</span>
                  {" — "}
                  {l.trans({ en, ko })}
                </>
              ),
            }))}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "When you are unsure, ask what the file does: screen goes to page/, reusable visual piece goes to ui/, saved business data goes to lib/<model>/, and private server integration goes to srvkit/ or lib/_<service>/.",
              ko: "헷갈릴 때는 파일이 하는 일을 물어보세요. 화면은 page/, 재사용 화면 조각은 ui/, 저장되는 비즈니스 데이터는 lib/<model>/, 비공개 서버 연동은 srvkit/ 또는 lib/_<service>/에 둡니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
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
            className="w-full"
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
          <div className="space-y-1 pl-2">
            <div>
              <div>
                <span className="font-bold text-foreground">lib/&lt;model&gt;/: </span>
                <span className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "Use this for nouns your business owns and saves. Keep model.abstract.md here for business intent, domain rules, workflows, and agent notes.",
                    ko: "비즈니스가 소유하고 저장하는 명사에 사용합니다. business intent, domain rule, workflow, agent note를 위해 model.abstract.md를 함께 둡니다.",
                  })}
                </span>
              </div>
              <div>
                <span className="font-bold text-foreground">lib/_&lt;service&gt;/: </span>
                <span className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "Use this for actions, workflows, or integrations. The folder keeps the underscore, but the abstract file drops it, such as lib/_payment/payment.abstract.md.",
                    ko: "행동, 워크플로우, 연동 기능에 사용합니다. 폴더에는 밑줄을 유지하지만 abstract 파일명은 lib/_payment/payment.abstract.md처럼 밑줄을 제외합니다.",
                  })}
                </span>
              </div>
              <div>
                <span className="font-bold text-foreground">lib/__scalar/&lt;type&gt;/: </span>
                <span className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "Use this for reusable value shapes shared by models. Keep scalar.abstract.md here when validation meaning or reuse rules need explanation.",
                    ko: "여러 모델이 함께 쓰는 값 형태에 사용합니다. validation 의미나 재사용 규칙 설명이 필요하면 scalar.abstract.md를 함께 둡니다.",
                  })}
                </span>
              </div>
            </div>
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
      <Divider />
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
            className="w-full"
            title="Code movement"
            language="bash"
            code={`apps/commerce/lib/order/
  # used only by commerce

libs/order/
  # reused by commerce, admin, and partner apps

pkgs/order-sdk/
  # installable or publishable as a standalone package`}
          />
          <div className="space-y-1 pl-2">
            <div>
              <div>
                <span className="font-bold text-foreground">apps/: </span>
                <span className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "Start here when the feature belongs to one product. This keeps early business code easy to find.",
                    ko: "기능이 하나의 제품에만 속한다면 여기서 시작합니다. 초기 비즈니스 코드를 찾기 쉽습니다.",
                  })}
                </span>
              </div>
              <div>
                <span className="font-bold text-foreground">libs/: </span>
                <span className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "Move here when two or more apps need the same business model, UI, or service flow.",
                    ko: "두 개 이상의 앱이 같은 비즈니스 모델, UI, 서비스 흐름을 필요로 할 때 옮깁니다.",
                  })}
                </span>
              </div>
              <div>
                <span className="font-bold text-foreground">pkgs/: </span>
                <span className="text-foreground/70 text-sm">
                  {l.trans({
                    en: "Move here only when the code should stand alone with its own package boundary.",
                    ko: "자체 패키지 경계를 가진 독립 코드가 되어야 할 때만 옮깁니다.",
                  })}
                </span>
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <DocsToc />
    </Scroll>
  );
});
