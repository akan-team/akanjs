import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Link } from "akanjs/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="mobile-overview" title={l.trans({ en: "Mobile App Architecture", ko: "모바일 앱 아키텍처" })}>
        <Docs.Title>{l.trans({ en: "Mobile App Architecture", ko: "모바일 앱 아키텍처" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan mobile apps are CSR web clients running inside a Capacitor native shell. The product screen is still built with Akan page, UI, state, and service patterns; Capacitor supplies the native project, app identity, store package, and device bridge.",
              ko: "Akan 모바일 앱은 Capacitor 네이티브 shell 안에서 실행되는 CSR 웹 클라이언트입니다. 제품 화면은 여전히 Akan page, UI, state, service 패턴으로 만들고, Capacitor가 네이티브 프로젝트, 앱 식별 정보, 스토어 패키지, 디바이스 브리지를 제공합니다.",
            })}
          </div>
          <Docs.Mermaid
            title="Akan mobile architecture"
            chart={`flowchart LR
  akanApp["Akan App"] --> csr["CSR Client"]
  csr --> capacitor["Capacitor Native Shell"]
  capacitor --> android["Android Package"]
  capacitor --> ios["iOS Package"]
  android --> backend["Shared Akan Backend"]
  ios --> backend`}
          />
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "One UI surface", ko: "하나의 UI 표면" }),
                desc: l.trans({
                  en: "Web and mobile share the same Akan page tree, client router, generated fetch calls, dictionaries, and UI components.",
                  ko: "웹과 모바일은 같은 Akan page tree, client router, generated fetch 호출, dictionary, UI component를 공유합니다.",
                }),
              },
              {
                title: l.trans({ en: "Native shell boundary", ko: "네이티브 shell 경계" }),
                desc: l.trans({
                  en: "Native code owns packaging, signing, app capabilities, plugin linking, and store distribution.",
                  ko: "네이티브 코드는 패키징, signing, app capability, plugin linking, store 배포를 담당합니다.",
                }),
              },
              {
                title: l.trans({ en: "Shared backend", ko: "공유 백엔드" }),
                desc: l.trans({
                  en: "Android, iOS, and web clients call the same Akan services and can share auth, permission, database rules, and app-level domains.",
                  ko: "Android, iOS, 웹 client는 같은 Akan service를 호출하고 auth, permission, database rule, app-level domain을 공유할 수 있습니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-bold text-base-content">{title}: </span>
                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="mobile-targets" title={l.trans({ en: "Mobile Targets", ko: "모바일 Target" })}>
        <Docs.Title>{l.trans({ en: "Mobile Targets", ko: "모바일 Target" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A mobile target is one native package built from an Akan app. A single Akan app can publish multiple mobile packages by pointing each target at a different basePath while reusing the same backend modules.",
              ko: "모바일 target은 Akan 앱에서 만들어지는 하나의 네이티브 패키지입니다. 하나의 Akan 앱은 각 target이 서로 다른 basePath를 열도록 설정해 여러 모바일 패키지를 배포할 수 있고, 백엔드 모듈은 그대로 공유할 수 있습니다.",
            })}
          </div>
          <Code.Snippet
            title="apps/myapp/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [
    { domains: { main: ["example.com"] }, basePath: "store" },
    { domains: { main: ["example.com"] }, basePath: "admin" },
  ],
  mobile: {
    appName: "Example App",
    appId: "com.example.app",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      store: { basePath: "store", appName: "Example Store", appId: "com.example.store" },
      admin: { basePath: "admin", appName: "Example Admin", appId: "com.example.admin" },
    },
  },
};

export default config;`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "Use targets when packages need different app IDs, display names, entry surfaces, permissions, deep links, or store release tracks.",
              ko: "패키지별로 app ID, 표시 이름, 진입 화면, 권한, 딥링크, 스토어 릴리즈 트랙이 다르면 target을 나누세요.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="csr-runtime" title={l.trans({ en: "CSR Runtime", ko: "CSR 런타임" })}>
        <Docs.Title>{l.trans({ en: "CSR Runtime", ko: "CSR 런타임" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Inside the native shell, Akan uses the CSR router and mobile page frame. Page transitions, safe area, navbar/bottom inset layers, keyboard accessories, and page cache are handled at the client runtime layer instead of requiring a native UI rewrite.",
              ko: "네이티브 shell 안에서 Akan은 CSR router와 모바일 page frame을 사용합니다. Page transition, safe area, navbar/bottom inset layer, keyboard accessory, page cache는 네이티브 UI를 다시 작성하지 않고 client runtime layer에서 처리됩니다.",
            })}
          </div>
          <Code.Snippet
            title="page/store/product/[productId].tsx"
            code={`import type { PageConfig } from "akanjs/client";
import { Layout } from "akanjs/ui";

export default function Page() {
  return (
    <>
      <Layout.Navbar back>Product detail</Layout.Navbar>
      <div>Product detail</div>
    </>
  );
}

export const pageConfig = {
  transition: "stack",
} satisfies PageConfig;`}
          />
          <div className="space-y-1">
            {[
              {
                title: "transition",
                desc: l.trans({
                  en: "Controls CSR page motion so mobile navigation can feel closer to native apps.",
                  ko: "CSR page motion을 제어해 모바일 내비게이션이 네이티브 앱에 가깝게 느껴지도록 합니다.",
                }),
              },
              {
                title: "safeArea",
                desc: l.trans({
                  en: "Handles OS system areas such as notches, home indicators, and Android system bars.",
                  ko: "노치, 홈 인디케이터, Android system bar 같은 OS 영역을 처리합니다.",
                }),
              },
              {
                title: "topInset / bottomInset",
                desc: l.trans({
                  en: "Separates app chrome such as navbars, tabs, fixed actions, and keyboard accessories from page content.",
                  ko: "navbar, tab, fixed action, keyboard accessory 같은 앱 chrome을 page content와 분리합니다.",
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

      <Scroll.Slide id="native-bridge" title={l.trans({ en: "Native Bridge", ko: "네이티브 브리지" })}>
        <Docs.Title>{l.trans({ en: "Native Bridge", ko: "네이티브 브리지" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Device capabilities are accessed through Capacitor plugins. Akan keeps the app-level API small: declare the needed native capability, sync/build the native project, then call the matching client hook or plugin wrapper from the CSR app.",
              ko: "디바이스 기능은 Capacitor plugin을 통해 접근합니다. Akan은 앱 레벨 API를 작게 유지합니다. 필요한 네이티브 기능을 선언하고, 네이티브 프로젝트를 sync/build한 뒤 CSR 앱에서 해당 client hook 또는 plugin wrapper를 호출합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: "Permissions",
                desc: l.trans({
                  en: "Permissions describe which native capabilities a mobile target intends to use.",
                  ko: "Permissions는 모바일 target이 사용하려는 네이티브 기능을 설명합니다.",
                }),
              },
              {
                title: "Files",
                desc: l.trans({
                  en: "Native config files such as Firebase config are copied from the app folder into generated native project paths.",
                  ko: "Firebase 설정 같은 네이티브 config 파일은 app 폴더에서 생성된 네이티브 프로젝트 경로로 복사됩니다.",
                }),
              },
              {
                title: "Deep links",
                desc: l.trans({
                  en: "Native schemes, universal links, and app links enter the Akan CSR router as normalized routes.",
                  ko: "네이티브 scheme, universal link, app link는 정규화된 route로 Akan CSR router에 들어옵니다.",
                }),
              },
              {
                title: "Push notifications",
                desc: l.trans({
                  en: "Push delivery uses Firebase/FCM setup, while click routing uses a standard data.url field.",
                  ko: "Push 수신은 Firebase/FCM 설정을 사용하고, 클릭 라우팅은 표준 data.url 필드를 사용합니다.",
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
            <span>
              {l.trans({
                en: "For concrete setup steps, see ",
                ko: "구체적인 설정 절차는 ",
              })}
            </span>
            <Link href="/cheatsheet/dev/mobile" className="link link-primary">
              {l.trans({ en: "Cheatsheet > Development > Mobile", ko: "Cheatsheet > 개발 > 모바일" })}
            </Link>
            <span>
              {l.trans({
                en: ".",
                ko: " 문서를 참고하세요.",
              })}
            </span>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
    </Scroll>
  );
}
