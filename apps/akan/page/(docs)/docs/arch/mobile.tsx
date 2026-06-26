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
              en: "Akan mobile apps are built by opening a CSR web client inside a Capacitor native shell, then packaging that shell as Android and iOS apps. The screen is developed with the same Akan UI system, while Capacitor provides the native project, app identity, and device bridge.",
              ko: "Akan 모바일 앱은 CSR 웹 클라이언트를 Capacitor 네이티브 shell 안에서 열고, 이를 Android와 iOS 앱으로 패키징하는 방식입니다. 화면은 같은 Akan UI 시스템으로 개발하고, Capacitor가 네이티브 프로젝트, 앱 식별 정보, 디바이스 브리지를 제공합니다.",
            })}
          </div>
          <Docs.Mermaid
            title="Akan mobile architecture"
            chart={`flowchart LR
  akanApp["Akan App"] --> basePath["basePath CSR Client"]
  basePath --> capacitor["Capacitor Native Shell"]
  capacitor --> android["Android Package"]
  capacitor --> ios["iOS Package"]
  android --> backend["Shared Akan Backend"]
  ios --> backend`}
          />
          <div>
            {l.trans({
              en: "If the app declares multiple basePaths, one Akan app can release multiple mobile packages. For example, a customer app, an admin stock app, and a field worker app can each open a different basePath while sharing the same services, permissions, database rules, and generated fetch calls.",
              ko: "앱이 여러 basePath를 선언하면 하나의 Akan app에서 여러 모바일 패키지를 릴리즈할 수 있습니다. 예를 들어 고객 앱, 관리자 재고 앱, 현장 작업자 앱은 서로 다른 basePath를 열면서도 같은 service, permission, database rule, generated fetch 호출을 공유할 수 있습니다.",
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
          <div className="space-y-1">
            {[
              {
                title: l.trans({ en: "CSR web surface", ko: "CSR 웹 표면" }),
                desc: l.trans({
                  en: "The app opens a Single Page Application client, not a separate native UI rewrite.",
                  ko: "앱은 별도 네이티브 UI를 다시 작성하는 것이 아니라 Single Page Application 클라이언트를 엽니다.",
                }),
              },
              {
                title: l.trans({ en: "Capacitor package", ko: "Capacitor 패키지" }),
                desc: l.trans({
                  en: "Capacitor wraps the CSR client with Android and iOS project files, app metadata, and device APIs.",
                  ko: "Capacitor는 CSR 클라이언트를 Android/iOS 프로젝트 파일, 앱 메타데이터, 디바이스 API와 함께 감쌉니다.",
                }),
              },
              {
                title: l.trans({ en: "Shared business logic", ko: "공유 비즈니스 로직" }),
                desc: l.trans({
                  en: "Web and mobile use the same Akan service, signal, document, auth, and generated client helpers.",
                  ko: "웹과 모바일은 같은 Akan service, signal, document, auth, generated client helper를 사용합니다.",
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

      <Scroll.Slide id="csr-web-workflow" title={l.trans({ en: "CSR Web Workflow", ko: "CSR 웹 작업" })}>
        <Docs.Title>{l.trans({ en: "CSR Web Workflow", ko: "CSR 웹 작업" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan mobile work starts as normal UI work. Build the page, component, st state, fetch calls, and dictionary text the same way you would for the web. Then test it as a CSR Single Page Application before packaging it into Android or iOS.",
              ko: "Akan 모바일 작업은 일반 UI 작업에서 시작합니다. page, component, st 상태, fetch 호출, dictionary 문구를 웹과 같은 방식으로 개발합니다. 그 다음 Android나 iOS로 패키징하기 전에 CSR Single Page Application으로 테스트합니다.",
            })}
          </div>
          <Code.Snippet
            title="Open a CSR page in the browser"
            language="bash"
            code={`http://localhost:8282/store/product/123?csr=true`}
          />
          <div>
            {l.trans({
              en: "The csr=true search parameter is useful when you want to check SPA navigation, client state, page transition, and mobile-like behavior from the browser. This is faster than opening the simulator for every small UI change.",
              ko: "csr=true search parameter는 브라우저에서 SPA 내비게이션, 클라이언트 상태, page transition, 모바일과 유사한 동작을 확인할 때 유용합니다. 작은 UI 변경마다 시뮬레이터를 여는 것보다 빠르게 확인할 수 있습니다.",
            })}
          </div>
          <Code.Snippet
            title="Enable sync navigation while developing"
            language="bash"
            code={`AKAN_PUBLIC_SYNC_NAVIGATION=true akan start myapp`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "Sync navigation is a local development helper. When enabled, Akan's HMR channel broadcasts CSR navigation between open clients, so a browser, simulator, and physical device can follow the same route while you tune mobile layout and transitions.",
              ko: "Sync navigation은 로컬 개발용 보조 기능입니다. 활성화하면 Akan HMR 채널이 열려 있는 클라이언트 사이에 CSR 내비게이션을 전달하므로, 브라우저, 시뮬레이터, 실기기가 같은 route를 따라가며 모바일 레이아웃과 전환을 조정할 수 있습니다.",
            })}
          </Docs.Alert>
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
  transition: "bottomUp",
} satisfies PageConfig;`}
          />
          <div className="space-y-1">
            {[
              {
                title: "transition",
                desc: l.trans({
                  en: "Optional override for the platform default. If you do not set it, Akan chooses an iOS/Android-native feel automatically: iOS detail pages default to stack, Android detail pages default to scaleOut, and tab/root pages default to none.",
                  ko: "플랫폼 기본값을 위한 선택적 override입니다. 값을 지정하지 않으면 Akan이 iOS/Android 룩앤필에 맞는 전환을 자동으로 선택합니다. iOS 상세 페이지는 기본 stack, Android 상세 페이지는 기본 scaleOut, 탭/root 페이지는 기본 none을 사용합니다.",
                }),
              },
              {
                title: "safeArea",
                desc: l.trans({
                  en: "Handles OS system areas such as notches, home indicators, and Android edge-to-edge system bars. Android avoids double padding unless reliable edge-to-edge inset values are available.",
                  ko: "노치, 홈 인디케이터, Android edge-to-edge system bar 같은 OS 영역을 처리합니다. Android는 신뢰 가능한 edge-to-edge inset 값이 있을 때만 추가해 중복 padding을 피합니다.",
                }),
              },
              {
                title: "topInset / bottomInset",
                desc: l.trans({
                  en: "Handles app UI space through CSR frame layers. Layout.Navbar, Layout.BottomTab, and Layout.BottomInset register this automatically; keyboardSticky BottomInset is isolated into the keyboard layer while normal bottom UI stays in the bottom chrome layer.",
                  ko: "CSR frame layer를 통해 앱 UI 공간을 처리합니다. Layout.Navbar, Layout.BottomTab, Layout.BottomInset이 자동 등록하며, keyboardSticky BottomInset은 keyboard layer로 분리되고 일반 하단 UI는 bottom chrome layer에 유지됩니다.",
                }),
              },
              {
                title: "keyboardSticky",
                desc: l.trans({
                  en: "On mobile CSR, keyboardSticky BottomInset becomes a keyboard accessory. The framework resizes the primary page scroll container, so mobile pages should let .akan-page-content own the main scroll instead of creating a separate primary overflow container.",
                  ko: "모바일 CSR에서 keyboardSticky BottomInset은 keyboard accessory로 동작합니다. 프레임워크가 기본 page scroll container를 줄이므로, 모바일 페이지는 별도 primary overflow container를 만들기보다 .akan-page-content가 주 스크롤을 맡도록 구성하는 것이 좋습니다.",
                }),
              },
              {
                title: "cache",
                desc: l.trans({
                  en: "Keeps CSR page state when users return to list or tab screens.",
                  ko: "목록이나 탭 화면으로 돌아올 때 CSR 페이지 상태를 유지합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Code.Snippet
            title="Android edge-to-edge safe area"
            code={`import type { PageConfig } from "akanjs/client";

export const pageConfig = {
  safeArea: {
    top: true,
    bottom: true,
    android: "edge-to-edge",
  },
} satisfies PageConfig;`}
          />
          <div className="space-y-1">
            {[
              {
                title: 'android: "auto"',
                desc: l.trans({
                  en: "Default Android behavior. Akan uses CSS safe-area values only when they are present, which avoids adding duplicate padding in normal Android WebView layouts.",
                  ko: "Android 기본 동작입니다. CSS safe-area 값이 실제로 있을 때만 사용하므로 일반 Android WebView 레이아웃에서 padding이 중복되는 것을 피합니다.",
                }),
              },
              {
                title: 'android: "edge-to-edge"',
                desc: l.trans({
                  en: "Use when the Android app draws behind the status bar or navigation bar. Akan applies the larger value from native device insets and CSS safe-area insets so content can avoid system bars.",
                  ko: "Android 앱이 status bar나 navigation bar 뒤까지 화면을 그릴 때 사용합니다. Akan은 native device inset과 CSS safe-area inset 중 더 큰 값을 적용해 콘텐츠가 시스템 바에 가리지 않게 합니다.",
                }),
              },
              {
                title: 'android: "none"',
                desc: l.trans({
                  en: "Disables Android safe-area padding for pages that manage system-bar spacing manually or intentionally use an immersive/full-bleed surface.",
                  ko: "시스템 바 여백을 직접 관리하거나 의도적으로 immersive/full-bleed 화면을 만들 때 Android safe-area padding을 끕니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <div>
            {l.trans({
              en: "Akan CSR pages can apply mobile-style page transitions from pageConfig. Use the demos below to compare the four transition presets in a browser CSR environment before packaging the same pages into a native shell.",
              ko: "Akan CSR 페이지는 pageConfig를 통해 모바일 앱처럼 보이는 페이지 전환 효과를 override할 수 있습니다. 아래 데모에서 4가지 transition preset을 브라우저 CSR 환경에서 비교한 뒤, 같은 페이지를 네이티브 shell로 패키징할 수 있습니다.",
            })}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                title: "bottomup",
                src: l.trans({
                  en: "/csr/bottomup_en.mp4",
                  ko: "/csr/bottomup_ko.mp4",
                }),
                desc: l.trans({
                  en: "Good for modal-like flows or pages that should rise from the bottom.",
                  ko: "모달에 가까운 흐름이나 아래에서 올라오는 화면에 어울립니다.",
                }),
              },
              {
                title: "fade",
                src: l.trans({
                  en: "/csr/fade_en.mp4",
                  ko: "/csr/fade_ko.mp4",
                }),
                desc: l.trans({
                  en: "Keeps the movement calm when the screen context changes without hierarchy.",
                  ko: "화면 계층보다 맥락 전환이 중요한 경우 차분하게 화면을 교체합니다.",
                }),
              },
              {
                title: "scale",
                src: l.trans({
                  en: "/csr/scale_en.mp4",
                  ko: "/csr/scale_ko.mp4",
                }),
                desc: l.trans({
                  en: "Adds a light zoom motion for focused entry into the next page.",
                  ko: "다음 페이지로 집중해서 진입하는 느낌의 가벼운 확대 모션을 더합니다.",
                }),
              },
              {
                title: "stack",
                src: l.trans({
                  en: "/csr/stack_en.mp4",
                  ko: "/csr/stack_ko.mp4",
                }),
                desc: l.trans({
                  en: "Works well for detail pages that push over a list or parent screen.",
                  ko: "목록이나 상위 화면 위로 상세 화면이 쌓이는 흐름에 적합합니다.",
                }),
              },
            ].map(({ title, src, desc }) => (
              <div key={title} className="rounded-2xl border border-base-300 bg-base-100 p-3">
                <div className="mb-3">
                  <div className="font-mono font-semibold text-primary">{title}</div>
                  <div className="mt-1 text-base-content/70 text-sm leading-5">{desc}</div>
                </div>
                <div className="overflow-hidden rounded-xl border border-base-content/10 bg-base-content/5">
                  <video
                    src={src}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="mx-auto aspect-9/16 max-h-[420px] w-full object-contain"
                  />
                </div>
              </div>
            ))}
          </div>
          <Docs.Alert type="info">
            <div className="font-bold">
              {l.trans({
                en: "FAQ: Are hybrid apps worse than native apps?",
                ko: "FAQ: 하이브리드 앱이면 네이티브 앱보다 별로인가요?",
              })}
            </div>
            <div className="mt-2">
              {l.trans({
                en: "Akan improves the user experience with page transitions, safe-area handling, inset support, CSR page cache, and mobile pageConfig. Device capabilities are not blocked by the hybrid model: Capacitor plugins can bridge camera, Bluetooth, device, haptics, keyboard, safe area, and other native APIs when needed.",
                ko: "Akan은 page transition, safe-area 처리, inset 지원, CSR page cache, 모바일 pageConfig로 사용자 경험을 개선합니다. 기능 면에서도 하이브리드 모델이 제약이 되지 않습니다. 필요하면 Capacitor plugin을 통해 카메라, 블루투스, 디바이스, 햅틱, 키보드, safe area 등 네이티브 API를 사용할 수 있습니다.",
              })}
            </div>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="android-packaging"
        title={l.trans({ en: "Android Packaging Workflow", ko: "Android 패키징 작업" })}
      >
        <Docs.Title>{l.trans({ en: "Android Packaging Workflow", ko: "Android 패키징 작업" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use the Android flow when you want to run the CSR client in an emulator/device, verify the native Android project, or prepare Play Store artifacts. Akan prepares the Capacitor project, syncs Android, applies metadata, and builds APK or AAB outputs.",
              ko: "CSR 클라이언트를 에뮬레이터/디바이스에서 실행하거나, 네이티브 Android 프로젝트를 검증하거나, Play Store 산출물을 준비할 때 Android 흐름을 사용합니다. Akan은 Capacitor 프로젝트를 준비하고, Android를 sync하고, 메타데이터를 적용한 뒤 APK 또는 AAB 산출물을 빌드합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: "Run on emulator or device",
                desc: l.trans({
                  en: "Use startAndroid while developing screens and checking live reload.",
                  ko: "화면을 개발하고 live reload를 확인할 때 startAndroid를 사용합니다.",
                }),
              },
              {
                title: "Build native package",
                desc: l.trans({
                  en: "Use buildAndroid to prepare the Android project and verify the release bundle.",
                  ko: "Android 프로젝트를 준비하고 릴리즈 번들을 검증할 때 buildAndroid를 사용합니다.",
                }),
              },
              {
                title: "Release for Play Store",
                desc: l.trans({
                  en: "Use releaseAndroid with a non-local env and a store-ready assemble type such as aab.",
                  ko: "local이 아닌 env와 aab 같은 스토어 제출용 assemble type으로 releaseAndroid를 사용합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Code.Snippet
            className="w-full"
            title="Android commands"
            language="bash"
            code={`akan start-android myapp --target store
akan build-android myapp --target store
akan release-android myapp --target store --env main --assembleType aab`}
          />
          <Code.Snippet
            className="w-full"
            title="Android local prerequisites"
            language="bash"
            code={`# Gradle/Android builds require JDK 21
brew install openjdk@21
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export PATH="$JAVA_HOME/bin:$PATH"

# Android SDK should be discoverable by Gradle
export ANDROID_HOME="$HOME/Library/Android/sdk"`}
          />
          <Code.Snippet
            className="w-full"
            title="apps/myapp/package.json"
            code={`{
  "dependencies": {
    "@capacitor/app": "*",
    "@capacitor/browser": "*",
    "@capacitor/camera": "*",
    "@capacitor/core": "*",
    "@capacitor/device": "*",
    "@capacitor/geolocation": "*",
    "@capacitor/haptics": "*",
    "@capacitor/keyboard": "*",
    "@capacitor/preferences": "*",
    "capacitor-plugin-safe-area": "*"
  }
}`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: 'Declare the Capacitor packages that your app uses in the app package.json with "*" versions. This lets Capacitor sync discover and link native plugins from the app project, while the workspace controls the actual installed versions.',
              ko: '앱에서 사용하는 Capacitor 패키지는 app package.json에 "*" 버전으로 선언하세요. 이렇게 하면 실제 설치 버전은 workspace가 관리하면서도 Capacitor sync가 앱 프로젝트에서 네이티브 플러그인을 발견하고 연결할 수 있습니다.',
            })}
          </Docs.Alert>
          <Docs.Alert type="warning">
            {l.trans({
              en: "Android release needs stable package identity and signing. Keep appId stable after release, increase buildNum for native releases, and prepare release keystore settings for Play Store artifacts.",
              ko: "Android 릴리즈에는 안정적인 패키지 식별 정보와 서명이 필요합니다. 릴리즈 후 appId는 안정적으로 유지하고, 네이티브 릴리즈마다 buildNum을 올리며, Play Store 산출물을 위한 release keystore 설정을 준비하세요.",
            })}
          </Docs.Alert>
          <Docs.Alert type="info">
            {l.trans({
              en: "For device APIs and Capacitor details, use the Capacitor documentation as the native bridge reference.",
              ko: "디바이스 API와 Capacitor 상세는 네이티브 브리지 참고 문서로 Capacitor 문서를 확인하세요.",
            })}{" "}
            <Link href="https://capacitorjs.com/docs" className="link link-primary" target="_blank" rel="noreferrer">
              {l.trans({ en: "Capacitor Docs", ko: "Capacitor 문서" })}
            </Link>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="ios-packaging" title={l.trans({ en: "iOS Packaging Workflow", ko: "iOS 패키징 작업" })}>
        <Docs.Title>{l.trans({ en: "iOS Packaging Workflow", ko: "iOS 패키징 작업" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use the iOS flow when you want to run the CSR client in the iOS simulator/device, verify the Xcode project, or prepare App Store artifacts. Akan prepares the Capacitor project, syncs iOS, applies bundle metadata, and opens or builds the native project.",
              ko: "CSR 클라이언트를 iOS 시뮬레이터/디바이스에서 실행하거나, Xcode 프로젝트를 검증하거나, App Store 산출물을 준비할 때 iOS 흐름을 사용합니다. Akan은 Capacitor 프로젝트를 준비하고, iOS를 sync하고, bundle 메타데이터를 적용한 뒤 네이티브 프로젝트를 열거나 빌드합니다.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: "Run on simulator or device",
                desc: l.trans({
                  en: "Use startIos while developing screens and checking live reload.",
                  ko: "화면을 개발하고 live reload를 확인할 때 startIos를 사용합니다.",
                }),
              },
              {
                title: "Build native project",
                desc: l.trans({
                  en: "Use buildIos to prepare the iOS project, sync Capacitor, and verify the native build.",
                  ko: "iOS 프로젝트를 준비하고 Capacitor를 sync하며 네이티브 빌드를 검증할 때 buildIos를 사용합니다.",
                }),
              },
              {
                title: "Release for App Store",
                desc: l.trans({
                  en: "Use releaseIos with a non-local env, then finish signing, archive, and submission in the Apple toolchain.",
                  ko: "local이 아닌 env로 releaseIos를 사용하고, 이후 Apple 도구에서 signing, archive, submission을 마무리합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Code.Snippet
            className="w-full"
            title="iOS commands"
            language="bash"
            code={`akan start-ios myapp --target store
akan build-ios myapp --target store
akan release-ios myapp --target store --env main`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: 'For iOS, keep the same app-level Capacitor dependencies in apps/myapp/package.json before running start-ios or build-ios. If a plugin is missing there, the JavaScript module can load while the native iOS plugin is not linked, causing "plugin is not implemented" errors in the simulator.',
              ko: 'iOS에서도 start-ios나 build-ios를 실행하기 전에 apps/myapp/package.json에 앱 단위 Capacitor dependency를 선언해 두세요. 해당 선언이 빠지면 JavaScript 모듈은 로드되지만 네이티브 iOS 플러그인이 연결되지 않아 시뮬레이터에서 "plugin is not implemented" 오류가 날 수 있습니다.',
            })}
          </Docs.Alert>
          <Docs.Alert type="warning">
            {l.trans({
              en: "iOS release needs stable bundle identity and Apple signing setup. Keep appId stable after release, increase buildNum for native releases, and verify provisioning, certificates, and App Store Connect settings before submission.",
              ko: "iOS 릴리즈에는 안정적인 bundle 식별 정보와 Apple signing 설정이 필요합니다. 릴리즈 후 appId는 안정적으로 유지하고, 네이티브 릴리즈마다 buildNum을 올리며, 제출 전에 provisioning, certificate, App Store Connect 설정을 확인하세요.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="native-build-troubleshooting"
        title={l.trans({ en: "Native Build Troubleshooting", ko: "네이티브 빌드 문제 해결" })}
      >
        <Docs.Title>{l.trans({ en: "Native Build Troubleshooting", ko: "네이티브 빌드 문제 해결" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Most mobile build issues come from native toolchain setup, plugin sync state, or confusing local mode with release mode. Check these items before debugging page code.",
              ko: "대부분의 모바일 빌드 문제는 네이티브 도구 설정, 플러그인 sync 상태, local/release 모드 혼동에서 발생합니다. 페이지 코드를 디버깅하기 전에 아래 항목을 먼저 확인하세요.",
            })}
          </div>
          <div className="space-y-1">
            {[
              {
                title: "Android SDK",
                desc: l.trans({
                  en: "Set ANDROID_HOME or android/local.properties so Gradle can find the SDK. Start an emulator or connect a device before running start-android.",
                  ko: "Gradle이 SDK를 찾을 수 있도록 ANDROID_HOME 또는 android/local.properties를 설정하세요. start-android 실행 전 에뮬레이터를 켜거나 디바이스를 연결해야 합니다.",
                }),
              },
              {
                title: "Java 21",
                desc: l.trans({
                  en: "Capacitor Android builds require a Java 21 compiler. If you see invalid source release: 21, update JAVA_HOME and PATH to JDK 21.",
                  ko: "Capacitor Android 빌드는 Java 21 컴파일러가 필요합니다. invalid source release: 21 오류가 나오면 JAVA_HOME과 PATH가 JDK 21을 가리키도록 설정하세요.",
                }),
              },
              {
                title: "Plugin sync",
                desc: l.trans({
                  en: "After adding or removing Capacitor packages, rerun start-ios/start-android or a build command so native projects regenerate plugin files.",
                  ko: "Capacitor 패키지를 추가하거나 제거한 뒤에는 start-ios/start-android 또는 build 명령을 다시 실행해 네이티브 프로젝트의 플러그인 파일을 갱신하세요.",
                }),
              },
              {
                title: "iOS plugins",
                desc: l.trans({
                  en: "If Safari console says a plugin is not implemented, the JavaScript module loaded but the native plugin was not linked. Check app package.json and rerun iOS sync/build.",
                  ko: "Safari 콘솔에 plugin is not implemented가 보이면 JavaScript 모듈은 로드됐지만 네이티브 플러그인이 연결되지 않은 상태입니다. app package.json을 확인하고 iOS sync/build를 다시 실행하세요.",
                }),
              },
              {
                title: "Safe area",
                desc: l.trans({
                  en: "safeArea handles device system bars; topInset and bottomInset handle app UI such as nav bars, tabs, and fixed bottom actions.",
                  ko: "safeArea는 디바이스 시스템 바를 처리하고, topInset/bottomInset은 nav bar, tab, 고정 하단 액션 같은 앱 UI 공간을 처리합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-mono font-semibold text-primary">{title}: </span>
                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
          <Code.Snippet
            className="w-full"
            title="Common local fixes"
            language="bash"
            code={`# Android SDK path
echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties

# Java 21 for Gradle
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export PATH="$JAVA_HOME/bin:$PATH"

# Re-sync after plugin/package changes
akan start-android myapp --target store
akan start-ios myapp --target store`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "Local mode uses a live server.url and does not package built CSR assets into the native app. Release mode builds CSR output first and copies the target HTML into the Capacitor webDir.",
              ko: "local 모드는 live server.url을 사용하므로 빌드된 CSR asset을 네이티브 앱 안에 패키징하지 않습니다. release 모드는 먼저 CSR 산출물을 만들고 target HTML을 Capacitor webDir로 복사합니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
