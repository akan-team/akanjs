import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const termRows = [
    {
      name: "CSR",
      desc: l.trans({
        en: "Client-side rendering: the app draws every screen itself from JavaScript on the device.",
        ko: "클라이언트 사이드 렌더링입니다. 기기 안의 JavaScript가 모든 화면을 직접 그립니다.",
      }),
    },
    {
      name: "native runtime",
      desc: l.trans({
        en: "@akanjs/native, shipped inside akanjs. It builds your CSR client into iOS, Android, macOS, Windows and Linux apps, with no Xcode project, Gradle files or CocoaPods to keep.",
        ko: "akanjs 안에 들어 있는 @akanjs/native입니다. CSR 클라이언트를 iOS, Android, macOS, Windows, Linux 앱으로 빌드하며, 따로 관리할 Xcode 프로젝트, Gradle 파일, CocoaPods가 없습니다.",
      }),
    },
    {
      name: "native shell",
      desc: l.trans({
        en: "The small native app around your web client, built under .akan/native/<target>/build: icon, ID, signing.",
        ko: "웹 클라이언트를 감싸는 작은 네이티브 앱이며, .akan/native/<target>/build 아래에 생성되어 앱 아이콘, ID, 서명을 가집니다.",
      }),
    },
    {
      name: "plugin",
      desc: l.trans({
        en: "A native runtime plugin that exposes one device feature to JavaScript, such as camera, push or iap. This is the native bridge.",
        ko: "camera, push, iap처럼 기기 기능 하나를 JavaScript에 열어 주는 네이티브 런타임 plugin입니다. 이것이 네이티브 브리지입니다.",
      }),
    },
    {
      name: "target",
      desc: l.trans({
        en: "One native package built from an Akan app, with its own name and app ID.",
        ko: "Akan 앱에서 만들어지는 네이티브 패키지 하나입니다. 이름과 app ID를 따로 가집니다.",
      }),
    },
  ];

  const layerCards = [
    {
      title: l.trans({ en: "One UI surface", ko: "하나의 UI 표면" }),
      caption: l.trans({ en: "Written once, shared with the web", ko: "한 번 쓰고 웹과 함께 씁니다" }),
      desc: l.trans({
        en: "Web and mobile share the same Akan page tree, client router, generated fetch calls, dictionaries, and UI components.",
        ko: "웹과 모바일은 같은 Akan page tree, client router, generated fetch 호출, dictionary, UI component를 공유합니다.",
      }),
    },
    {
      title: l.trans({ en: "Native shell boundary", ko: "네이티브 shell 경계" }),
      caption: l.trans({ en: "What the native runtime generates", ko: "네이티브 런타임이 만드는 몫" }),
      desc: l.trans({
        en: "Native code owns packaging, signing, app capabilities, plugin linking, and store distribution.",
        ko: "네이티브 코드는 패키징, signing, app capability, plugin linking, store 배포를 담당합니다.",
      }),
    },
    {
      title: l.trans({ en: "Shared backend", ko: "공유 백엔드" }),
      caption: l.trans({ en: "The server you already run", ko: "이미 돌리고 있는 그 서버" }),
      desc: l.trans({
        en: "Android, iOS, and web clients call the same Akan services and can share auth, permission, database rules, and app-level domains. A desktop app whose target carries the server calls the copy of that server it carries instead.",
        ko: "Android, iOS, 웹 client는 같은 Akan service를 호출하고 auth, permission, database rule, app-level domain을 공유할 수 있습니다. 서버를 싣는 target의 데스크톱 앱은 대신 자기가 싣고 있는 서버를 호출합니다.",
      }),
    },
  ];

  const frameOptions = [
    {
      key: "transition",
      type: '"none" | "fade" | "bottomUp" | "stack" | "scaleOut"',
      desc: l.trans({
        en: "Controls CSR page motion so mobile navigation can feel closer to native apps.",
        ko: "CSR page motion을 제어해 모바일 내비게이션이 네이티브 앱에 가깝게 느껴지도록 합니다.",
      }),
    },
    {
      key: "safeArea",
      type: 'boolean | "top" | "bottom" | { top, bottom }',
      desc: l.trans({
        en: "Handles OS system areas such as notches, home indicators, and Android system bars.",
        ko: "노치, 홈 인디케이터, Android system bar 같은 OS 영역을 처리합니다.",
      }),
    },
    {
      key: "topInset / bottomInset",
      type: "number | boolean",
      desc: l.trans({
        en: "Reserves room in px for app chrome such as navbars, tabs and fixed actions; true reserves 48px.",
        ko: "navbar, tab, fixed action 같은 앱 chrome 자리를 px 단위로 비워 page content와 나눕니다. true는 48px입니다.",
      }),
    },
  ];

  const bridgeCards = [
    {
      title: "Permissions",
      desc: l.trans({
        en: "Permissions describe which native capabilities a native target intends to use.",
        ko: "Permissions는 네이티브 target이 사용하려는 네이티브 기능을 설명합니다.",
      }),
    },
    {
      title: "Files",
      desc: l.trans({
        en: "Native files such as google-services.json or a notification sound live in the app folder; the config names where each one lands.",
        ko: "google-services.json이나 알림음 같은 네이티브 파일은 app 폴더에 두고, config에 각 파일이 들어갈 자리를 적습니다.",
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
        en: "Push goes out through APNs on iOS and FCM on Android and the web, while click routing uses a standard data.url field.",
        ko: "Push는 iOS에서는 APNs, Android와 웹에서는 FCM으로 나가고, 클릭 라우팅은 표준 data.url 필드를 사용합니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="mobile-overview" title={l.trans({ en: "Mobile App Architecture", ko: "모바일 앱 아키텍처" })}>
        <Docs.Title>{l.trans({ en: "Mobile App Architecture", ko: "모바일 앱 아키텍처" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan ships the same product to the web and to the app stores, and you do not write a second app for mobile. The screens you already built for the web run inside a thin native app; only the parts that truly need the phone, such as packaging, signing and device features, are native.",
              ko: "Akan은 같은 제품을 웹과 앱스토어에 함께 내보내며, 모바일용 앱을 따로 만들지 않습니다. 웹용으로 만든 화면이 얇은 네이티브 앱 안에서 그대로 돌아가고, 패키징과 서명, 기기 기능처럼 정말로 폰이 필요한 부분만 네이티브가 맡습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Concretely, Akan mobile apps are CSR web clients running inside a native shell that akanjs's own runtime, @akanjs/native, generates. The product screen is still built with Akan page, UI, state, and service patterns; the runtime supplies the shell, app identity, store package, and device bridge from what akan.config.ts declares.",
              ko: "정확히 말하면 Akan 모바일 앱은 akanjs의 자체 런타임인 @akanjs/native가 만들어 내는 네이티브 shell 안에서 실행되는 CSR 웹 클라이언트입니다. 제품 화면은 여전히 Akan page, UI, state, service 패턴으로 만들고, 런타임이 akan.config.ts의 선언을 바탕으로 shell, 앱 식별 정보, 스토어 패키지, 디바이스 브리지를 제공합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The same target also builds a macOS, Windows or Linux app. A desktop app calls the shared backend like a phone does, or, with native.desktop.server on, carries the app's own server: it starts beside the window on a loopback port, keeps its data on that computer, and is the only backend the pages call, so the app works with no server elsewhere.",
              ko: "같은 target으로 macOS, Windows, Linux 앱도 빌드합니다. 데스크톱 앱은 폰처럼 공유 백엔드를 부르거나, native.desktop.server를 켜면 앱의 서버를 함께 싣습니다. 이 서버는 창과 함께 loopback 포트로 떠서 데이터를 그 컴퓨터에 두고, 페이지가 부르는 유일한 백엔드가 되므로 다른 곳에 서버 없이 앱이 동작합니다.",
            })}
          </div>
          <Docs.Figure
            title={l.trans({ en: "Akan mobile architecture", ko: "Akan 모바일 구조" })}
            image="mobile-architecture"
            prompt={`
              Application source at the far left labelled "Akan App", with a long arrow to the centre. In the centre one
              phone drawn large, about half the frame tall. Its screen holds a simple web page sketch — a top bar, one
              big block and three short rows — labelled "CSR Client" beside the screen. The phone's outer body is traced
              as the red accent and labelled "Akan Native Shell". Below the phone, a dashed arrow down to two small
              closed parcel boxes side by side, labelled "Android" and "iOS". To the right, a two-headed arrow from the
              phone to a server with a database cylinder beside it, labelled once "Shared Akan Backend".
            `}
            alt={l.trans({
              en: "The Akan app builds a CSR client that runs inside the Akan native shell, which is packaged for Android and iOS and talks to the shared Akan backend.",
              ko: "Akan 앱은 CSR 클라이언트를 빌드하고, 그 클라이언트는 Akan 네이티브 shell 안에서 실행됩니다. shell은 Android와 iOS 패키지로 나가며 공유 Akan 백엔드와 통신합니다.",
            })}
          />
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Who owns what", ko: "세 부분이 나눠 맡는 일" })}</Docs.SubSubTitle>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {layerCards.map((card, idx) => (
              <div
                key={card.title}
                className={panelRecipe(
                  { radius: "lg", padding: "sm" },
                  idx === layerCards.length - 1 && "md:col-span-2",
                )}
              >
                <div className="font-semibold text-primary">{card.title}</div>
                <div className="mb-2 text-foreground/50 text-xs">{card.caption}</div>
                <div className="text-foreground/70 text-sm">{card.desc}</div>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="native-targets" title={l.trans({ en: "Native Targets", ko: "네이티브 Target" })}>
        <Docs.Title>{l.trans({ en: "Native Targets", ko: "네이티브 Target" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Sometimes one product is really two apps in the store, such as a customer app and a staff app. Each needs its own name and app ID, yet both should run on the same backend. Native targets are for exactly that.",
              ko: "하나의 제품이 스토어에서는 두 개의 앱일 때가 있습니다. 예를 들어 고객용 앱과 직원용 앱이죠. 각자 이름과 app ID는 달라야 하지만 백엔드는 같이 써야 합니다. 네이티브 target은 바로 이럴 때 씁니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A native target is one native package built from an Akan app. A single Akan app can publish several packages by pointing each target at a different basePath while reusing the same backend modules. A target takes from native every value it does not set itself.",
              ko: "네이티브 target은 Akan 앱에서 만들어지는 하나의 네이티브 패키지입니다. 하나의 Akan 앱은 각 target이 서로 다른 basePath를 열도록 설정해 여러 패키지를 배포할 수 있고, 백엔드 모듈은 그대로 공유할 수 있습니다. target은 자기가 적지 않은 값을 native에서 받습니다.",
            })}
          </div>
          <Docs.Figure
            title={l.trans({ en: "One app, two store packages", ko: "앱 하나, 스토어 패키지 둘" })}
            image="mobile-targets"
            prompt={`
              On the left, application source labelled "Akan App", traced as the red accent. Two long arrows run from it
              to the right, one angled up and one angled down, ending at two phones stacked one above the other with
              clear space between them: the upper phone labelled "Store App" with a smaller second line
              "basePath store", the lower phone labelled "Admin App" with a smaller second line "basePath admin". On the
              far right, one server labelled "Shared Backend", joined to each phone by a thin dashed line. Nothing else.
            `}
            alt={l.trans({
              en: "One Akan app builds two store packages, a store app and an admin app, each opening its own basePath, and both talk to the same backend.",
              ko: "Akan 앱 하나가 스토어 앱과 관리자 앱, 두 개의 스토어 패키지를 만듭니다. 각 패키지는 자기 basePath를 열고, 둘 다 같은 백엔드와 통신합니다.",
            })}
          />
          <Code.Snippet
            className="w-full"
            title="apps/myapp/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [
    { domains: { main: ["store.example.com"] }, basePath: "store" },
    { domains: { main: ["admin.example.com"] }, basePath: "admin" },
  ],
  native: {
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
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              <code>routes</code>{" "}
              {l.trans({
                en: "— each basePath gets its own domain.",
                ko: "— basePath마다 도메인을 하나씩 줍니다.",
              })}
            </li>
            <li>
              <code>native</code>{" "}
              {l.trans({
                en: "— what every target shares, here the version and build number.",
                ko: "— 모든 target이 함께 쓰는 값이며, 여기서는 버전과 빌드 번호입니다.",
              })}
            </li>
            <li>
              <code>native.targets</code>{" "}
              {l.trans({
                en: "— one entry per package, each with its own basePath, display name and app ID.",
                ko: "— 패키지마다 항목 하나이며, 각자 basePath, 표시 이름, app ID를 가집니다.",
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: "Give each basePath its own host: the server resolves an incoming host to exactly one basePath, so two basePaths sharing a domain leave one of them unreachable.",
              ko: "basePath마다 host는 따로 주어야 합니다. 서버는 들어온 host를 정확히 하나의 basePath로만 해석하므로, 두 basePath가 도메인을 공유하면 한쪽은 열리지 않습니다.",
            })}
          </Docs.Alert>
          <Docs.Alert type="info">
            {l.trans({
              en: "Use targets when packages need different app IDs, display names, entry surfaces, permissions, deep links, or store release tracks.",
              ko: "패키지별로 app ID, 표시 이름, 진입 화면, 권한, 딥링크, 스토어 릴리즈 트랙이 다르면 target을 나누세요.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="csr-runtime" title={l.trans({ en: "CSR Runtime", ko: "CSR 런타임" })}>
        <Docs.Title>{l.trans({ en: "CSR Runtime", ko: "CSR 런타임" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "An app feels native because of small things: screens slide in, content stays clear of the notch, the tab bar stays put, and the keyboard does not cover the input. You get all of them without rewriting any UI in native code.",
              ko: "앱이 네이티브처럼 느껴지는 건 작은 것들 덕분입니다. 화면이 밀려 들어오고, 내용이 노치를 피하고, 탭 바는 제자리에 있고, 키보드가 입력칸을 가리지 않습니다. 이 모두를 네이티브 UI를 다시 만들지 않고 얻습니다.",
            })}
          </div>
          <Docs.Figure
            title={l.trans({ en: "The mobile page frame", ko: "모바일 page frame" })}
            image="mobile-page-frame"
            prompt={`
              One phone drawn large and upright in the centre, about four fifths of the frame tall, with nothing at all
              drawn outside it except the labels and their short leader lines. Inside the phone, from top to bottom: a
              small notch cutout at the top edge labelled "Safe Area"; just below it a thin bar holding a small back
              arrow, labelled "Top Inset"; a large empty region whose outline is traced as the red accent, labelled
              "Page Content"; a thin bar holding four small tab icons, labelled "Bottom Inset"; and a short home
              indicator line at the very bottom edge. Put every label to the right of the phone. Nothing else.
            `}
            alt={l.trans({
              en: "A phone screen split from top to bottom into the safe area around the notch, the top inset for the navbar, the page content, and the bottom inset for tabs above the home indicator.",
              ko: "폰 화면을 위에서 아래로 나누면 노치 둘레의 safe area, navbar를 위한 top inset, page content, 홈 인디케이터 위 탭을 위한 bottom inset이 있습니다.",
            })}
          />
          <div>
            {l.trans({
              en: "Inside the native shell, Akan uses the CSR router and mobile page frame. Page transitions, safe area, navbar/bottom inset layers, keyboard accessories, and page cache are handled at the client runtime layer instead of requiring a native UI rewrite. A page declares them with the .config() stage of its page() chain.",
              ko: "네이티브 shell 안에서 Akan은 CSR router와 모바일 page frame을 사용합니다. Page transition, safe area, navbar/bottom inset layer, keyboard accessory, page cache는 네이티브 UI를 다시 작성하지 않고 client runtime layer에서 처리됩니다. 페이지는 page() 체인의 .config() 단계로 이를 선언합니다.",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="page/store/product/[productId].tsx"
            code={`import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Layout } from "akanjs/ui";

export default page()
  .param("productId", ID, { desc: "The product to show." })
  .config({ transition: "stack" })
  .render(({ productId }) => {
    return (
      <>
        <Layout.Navbar back>Product detail</Layout.Navbar>
        <div>Product {productId}</div>
      </>
    );
  });`}
          />
          <div>
            {l.trans({
              en: "The frame settings a page can declare in .config():",
              ko: ".config()에 선언할 수 있는 frame 설정은 다음과 같습니다:",
            })}
          </div>
          <Docs.OptionTable items={frameOptions} />
          <Docs.Alert type="info">
            {l.trans({
              en: (
                <span>
                  <strong>Keyboard accessory anchoring.</strong> A <code>BottomInset</code> with{" "}
                  <code>keyboardSticky</code> can also opt into <code>contentAnchor="bottom"</code> so scrollable
                  content resizes with the keyboard while preserving the content bottom edge.
                </span>
              ),
              ko: (
                <span>
                  <strong>keyboard accessory 고정.</strong> <code>keyboardSticky</code>를 쓰는 <code>BottomInset</code>
                  은 <code>contentAnchor="bottom"</code>을 선택해, 키보드와 함께 scrollable content 크기를 줄이고
                  content의 하단 기준을 보존할 수 있습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="native-bridge" title={l.trans({ en: "Native Bridge", ko: "네이티브 브리지" })}>
        <Docs.Title>{l.trans({ en: "Native Bridge", ko: "네이티브 브리지" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Web code alone cannot reach the camera, push notifications or the file system. Device capabilities are accessed through the native runtime's plugins, and Akan keeps the app-level API small. Using one takes three steps:",
              ko: "카메라, 푸시 알림, 파일 시스템은 웹 코드만으로는 닿지 않습니다. 디바이스 기능은 네이티브 런타임의 plugin을 통해 접근하고, Akan은 앱 레벨 API를 작게 유지합니다. 기능 하나를 쓰는 데는 세 단계면 됩니다:",
            })}
          </div>
          <ol className="my-4 list-decimal space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Declare the native capability the app needs: a permission in native.permissions, or a plugin in native.plugins.",
                ko: "필요한 네이티브 기능을 선언합니다. native.permissions의 permission이나 native.plugins의 plugin입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Build or run the app (akan build-ios, akan start-android, …); the shell is generated with those plugins in it.",
                ko: "앱을 빌드하거나 실행합니다(akan build-ios, akan start-android, …). shell은 그 plugin을 넣은 채로 만들어집니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Call the matching client hook or plugin wrapper (akanjs/client/native) from the CSR app.",
                ko: "CSR 앱에서 해당 client hook 또는 plugin wrapper(akanjs/client/native)를 호출합니다.",
              })}
            </li>
          </ol>
          <Docs.SubSubTitle>{l.trans({ en: "What the bridge covers", ko: "브리지가 다루는 것" })}</Docs.SubSubTitle>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {bridgeCards.map((card) => (
              <div key={card.title} className={panelRecipe({ radius: "lg", padding: "sm" })}>
                <div className="mb-1 font-semibold text-primary">{card.title}</div>
                <div className="text-foreground/70 text-sm">{card.desc}</div>
              </div>
            ))}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Setup, step by step", ko: "구체적인 설정 절차" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "The concrete setup steps live in the mobile cheatsheets:",
              ko: "Cheatsheet의 모바일 문서에서 단계별로 따라 할 수 있습니다:",
            })}
          </div>
          <Docs.LinkGrid
            items={[
              {
                href: "/cheatsheet/mobile/setup",
                title: l.trans({ en: "Setup", ko: "설정" }),
                desc: l.trans({
                  en: "Native config, native plugins, and building and running the iOS, Android and desktop apps.",
                  ko: "native 설정, 네이티브 plugin, iOS·Android·데스크톱 앱의 빌드와 실행을 다룹니다.",
                }),
              },
              {
                href: "/cheatsheet/mobile/ui",
                title: "UI & Keyboard",
                desc: l.trans({
                  en: "Page transitions, the back gesture, the frame config and the keyboard inset.",
                  ko: "페이지 전환, 뒤로 가기 gesture, frame config, 키보드 inset을 다룹니다.",
                }),
              },
              {
                href: "/cheatsheet/mobile/links",
                title: "Deep Links",
                desc: l.trans({
                  en: "Custom schemes, universal links and app links.",
                  ko: "custom scheme, universal link, app link를 설정합니다.",
                }),
              },
              {
                href: "/cheatsheet/mobile/push",
                title: "Push Notifications",
                desc: l.trans({
                  en: "APNs and FCM setup, registering the device and storing its token.",
                  ko: "APNs와 FCM 설정, 기기 등록, token 저장을 다룹니다.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
    </Scroll>
  );
});
