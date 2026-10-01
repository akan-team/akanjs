import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

const situations = [
  {
    en: "A customer storefront and an admin console",
    ko: "고객 사이트와 관리자 콘솔",
    split: true,
    whyEn:
      "They share products, orders, users, and permissions, but need different domains, layouts, and release targets.",
    whyKo: "상품, 주문, 사용자, 권한을 공유하지만 도메인, 화면 구성, 배포 대상이 다릅니다.",
  },
  {
    en: "A consumer client, a partner portal, and an internal tool",
    ko: "일반 고객 화면, 파트너 포털, 내부 운영 도구",
    split: true,
    whyEn: "One backend, three audiences. Each gets its own home screen and navigation without a second app.",
    whyKo: "백엔드는 하나이고 대상은 셋입니다. 앱을 새로 만들지 않고도 각자 홈 화면과 내비게이션을 가집니다.",
  },
  {
    en: "Android and iOS packages released per brand, region, or user type",
    ko: "브랜드·지역·사용자 유형별로 따로 출시하는 Android·iOS 패키지",
    split: true,
    whyEn: "A native target points at a basePath, so each package opens its own client from the same backend.",
    whyKo: "네이티브 target이 basePath를 가리키므로, 각 패키지가 같은 백엔드에서 자기 클라이언트를 엽니다.",
  },
  {
    en: "White-label or regional sites on shared business rules",
    ko: "같은 비즈니스 규칙을 쓰는 화이트라벨·지역 사이트",
    split: true,
    whyEn: "Different domains, names, and first screens over the same domain models — the case basePath exists for.",
    whyKo: "같은 도메인 모델 위에 도메인, 이름, 첫 화면만 다릅니다. basePath가 있는 이유가 이것입니다.",
  },
  {
    en: "Account settings, dashboards, tabs, grouped screens",
    ko: "계정 설정, 대시보드, 탭 화면, 그룹 화면",
    split: false,
    whyEn:
      "These are sections inside one client. A route group such as (user) organizes them without adding a URL segment.",
    whyKo: "하나의 클라이언트 안의 구역입니다. (user) 같은 route group이 URL 세그먼트를 더하지 않고 정리해 줍니다.",
  },
  {
    en: "A section that only some signed-in users may open",
    ko: "일부 로그인 사용자만 열 수 있는 구역",
    split: false,
    whyEn:
      "Authorization is a guard and a layout gate, not a deployment boundary. Splitting on it buys nothing and costs a domain.",
    whyKo:
      "권한은 guard와 layout에서 막는 문제이지 배포 경계가 아닙니다. 이것 때문에 나누면 얻는 것 없이 도메인만 하나 더 씁니다.",
  },
];

export default page().render(() => {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="when-to-use" title={l.trans({ en: "When To Split", ko: "언제 나눌까" })}>
        <Docs.Title>{l.trans({ en: "When To Split", ko: "언제 나눌까" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Your app has grown a second audience. The storefront and the admin console want different domains, different first screens, maybe different mobile packages — but the same products, the same orders, the same permissions. Creating a second app would duplicate all of that. Splitting the pages with basePath does not.",
              ko: "앱에 두 번째 사용자층이 생겼습니다. 스토어와 관리자 콘솔은 서로 다른 도메인, 다른 첫 화면, 때로는 다른 모바일 패키지를 원하지만 상품도 주문도 권한도 같습니다. 앱을 하나 더 만들면 그 전부가 복제됩니다. basePath로 페이지를 나누면 그러지 않아도 됩니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The test is whether the surfaces are sold, deployed, or reached as separate products. If they are, split them; if one is a section of the other, a route group is enough:",
              ko: "기준은 그 화면들이 제품·배포·접근 단위로 나뉘는지입니다. 나뉘면 basePath로 분리하고, 한쪽이 다른 쪽의 구역이라면 route group으로 충분합니다:",
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Situation", ko: "상황" })}
            items={situations.map(({ en, ko, split, whyEn, whyKo }) => ({
              name: <span className="font-sans">{l.trans({ en, ko })}</span>,
              desc: (
                <>
                  <code>{split ? "basePath" : l.trans({ en: "normal routing", ko: "일반 라우팅" })}</code>
                  {" — "}
                  {l.trans({ en: whyEn, ko: whyKo })}
                </>
              ),
            }))}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="multi-client" title={l.trans({ en: "Multi Client", ko: "다중 클라이언트" })}>
        <Docs.Title>{l.trans({ en: "Multi Client", ko: "다중 클라이언트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan can serve multiple web clients from one app by splitting pages with basePath. Every route sits under the locale, so locally a client is the segment right after it — /en/store — but in production the matching domain hides that segment and serves the client as a separate site.",
              ko: "Akan은 basePath로 페이지를 나누어 하나의 앱에서 여러 웹 클라이언트를 제공할 수 있습니다. 모든 라우트는 locale 아래에 놓이므로, 로컬에서 클라이언트는 locale 바로 다음 세그먼트입니다. 예를 들어 /en/store입니다. 배포 후에는 연결된 도메인이 그 세그먼트를 숨기고 별도의 사이트처럼 제공합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.Flow
          title={l.trans({ en: "One app, many clients", ko: "앱 하나, 여러 client" })}
          nodes={{
            app: {
              label: l.trans({ en: "Akan App", ko: "Akan 앱" }),
              lines: [l.trans({ en: "single server and backend", ko: "서버 하나, 백엔드 하나" })],
            },
            store: { label: l.trans({ en: "store web", ko: "store 웹" }) },
            admin: { label: l.trans({ en: "admin web", ko: "admin 웹" }) },
            partner: { label: l.trans({ en: "partner web", ko: "partner 웹" }) },
            demo: { label: l.trans({ en: "demo web", ko: "demo 웹" }) },
            storeDomain: { label: "store.example.com", tone: "muted" },
            adminDomain: { label: "admin.example.com", tone: "muted" },
            partnerDomain: { label: "partner.example.com", tone: "muted" },
            demoDomain: { label: "demo.example.com", tone: "muted" },
          }}
          edges={[
            ["app", "store"],
            ["app", "admin"],
            ["app", "partner"],
            ["app", "demo"],
            ["store", "storeDomain"],
            ["admin", "adminDomain"],
            ["partner", "partnerDomain"],
            ["demo", "demoDomain"],
          ]}
        />
        <div className="space-y-1 pl-2">
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
            <div key={title}>
              <span className="font-bold text-foreground">{title}: </span>
              <span className="text-foreground/70 text-sm">{desc}</span>
            </div>
          ))}
        </div>
      </Scroll.Slide>
      <Divider />

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
          className="w-full"
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
        <Docs.OptionTable
          items={[
            {
              key: "basePath",
              type: "string",
              desc: l.trans({
                en: "The client this route opens and its first page folder: basePath store lives in page/store.",
                ko: "이 route가 여는 클라이언트이자 첫 page 폴더입니다. basePath가 store이면 page/store 아래에 둡니다.",
              }),
            },
            {
              key: "domains",
              type: "Record<branch, string[]>",
              default: "{}",
              desc: l.trans({
                en: "Hosts per branch that open this basePath; a matching host hides the basePath segment.",
                ko: "이 basePath를 여는 호스트이며 branch를 키로 씁니다. 매칭된 호스트에서는 basePath 세그먼트가 보이지 않습니다.",
              }),
            },
          ]}
        />
      </Scroll.Slide>
      <Divider />

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
          className="w-full"
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
            en: "In local development, you open each client with the locale followed by its basePath, such as /en/store or /ko/admin. After deployment, a configured domain can open that same client without showing the basePath in the URL.",
            ko: "로컬 개발에서는 locale 다음에 basePath를 붙여 각 클라이언트를 엽니다. /en/store, /ko/admin 같은 형태입니다. 배포 후에는 설정된 도메인이 같은 클라이언트를 basePath 없이 열 수 있습니다.",
          })}
        </Docs.Alert>
        <Docs.Alert type="warning">
          {l.trans({
            en: "Rule: once basePath is declared, pages outside page/basePath/ are not allowed.",
            ko: "규칙: basePath가 선언되면 page/basePath/ 밖에 페이지를 둘 수 없습니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

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
            code={`http://localhost:8282/en/store
http://localhost:8282/en/admin
http://localhost:8282/en/partner`}
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
        <div>
          {l.trans({
            en: "partner declares no domain of its own, and still has one. Akan derives <basePath>-<branch>.<serveDomain> for every basePath on every branch it knows, so partner-main.example.com and partner-develop.example.com exist without being written down.",
            ko: "partner는 도메인을 직접 선언하지 않았는데도 도메인을 갖습니다. Akan이 알고 있는 모든 branch에 대해 basePath별로 <basePath>-<branch>.<serveDomain>을 자동으로 만들기 때문입니다. 그래서 partner-main.example.com과 partner-develop.example.com은 적지 않아도 존재합니다.",
          })}
        </div>
        <div>
          {l.trans({
            en: "A mapped domain serves its own client only. On store.example.com, /en/admin/users is looked up inside store, on a reload and a client-side navigation alike, so link to another client through its own domain.",
            ko: "클라이언트에 연결된 도메인은 그 클라이언트만 엽니다. store.example.com에서 /en/admin/users는 새로고침이든 클라이언트 쪽 이동이든 store 안에서 찾으므로, 다른 클라이언트로는 그 클라이언트의 도메인으로 링크합니다.",
          })}
        </div>
        <Docs.Alert type="info">
          {l.trans({
            en: "Locally the site root has no page of its own, so Akan answers it with a list of every basePath in the build instead of a 404. Deployed hosts never see that list; the matching domain opens its client directly.",
            ko: "로컬에서는 사이트 루트에 해당하는 페이지가 없으므로, Akan이 404 대신 빌드에 포함된 모든 basePath 목록을 보여줍니다. 배포 환경에서는 이 목록이 나타나지 않고 매칭된 도메인이 해당 클라이언트를 바로 엽니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="csr-mobile" title={l.trans({ en: "CSR And Mobile Builds", ko: "CSR와 모바일 빌드" })}>
        <Docs.Title>{l.trans({ en: "CSR And Mobile Builds", ko: "CSR와 모바일 빌드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When the app is built, Akan can prepare CSR web output per basePath. Native targets can also point to a basePath, so Android and iOS apps can open the right client from the same backend.",
              ko: "앱을 빌드하면 Akan은 basePath별 CSR 웹 결과물을 준비할 수 있습니다. 네이티브 target도 basePath를 바라볼 수 있으므로, Android와 iOS 앱이 같은 백엔드를 사용하면서 고객군별 클라이언트를 열 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.Figure
          title={l.trans({ en: "Build outputs", ko: "빌드 산출물" })}
          image="build-outputs"
          prompt={`
            Application source at the far left labelled "Akan App". Three arrows fan out to a middle column: a browser
            at the top labelled "CSR Web" with a smaller second line "per basePath"; a phone in the middle labelled
            "Android App"; a second phone with a rounder body at the bottom labelled "iOS App". Three arrows converge
            from the middle column into one server with a database cylinder beside it at the right, the server's outline
            traced as the red accent, labelled "One Backend".
          `}
          alt={l.trans({
            en: "One Akan app builds CSR web output per basePath and an Android and iOS app per target, and all three talk to one server and backend.",
            ko: "Akan 앱 하나가 basePath마다 CSR 웹 결과물을, target마다 Android와 iOS 앱을 빌드하고, 셋 모두 하나의 서버와 백엔드를 사용합니다.",
          })}
        />
        <Code.Snippet
          className="w-full"
          title="Native targets"
          code={`const config = {
  routes: [
    { domains: { main: ["store.example.com"] }, basePath: "store" },
    { domains: { main: ["admin.example.com"] }, basePath: "admin" },
  ],
  native: {
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
        <Docs.Alert type="warning">
          {l.trans({
            en: "A target's basePath must name one the routes declared.",
            ko: "target의 basePath는 routes에 선언된 값이어야 합니다.",
          })}
        </Docs.Alert>
        <Docs.Alert>
          {l.trans({
            en: "This is the main idea: multi web and multi app clients, but one Akan app, one server runtime, and one backend domain model.",
            ko: "핵심은 여러 웹과 여러 앱 클라이언트를 동시에 제공하더라도, Akan 앱과 서버 런타임, 백엔드 도메인 모델은 하나로 유지할 수 있다는 점입니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
