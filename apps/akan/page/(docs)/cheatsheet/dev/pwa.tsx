import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const stepList = "my-4 list-decimal space-y-2 pl-5";

  const methodCards = [
    {
      title: l.trans({ en: "Static JSON File", ko: "정적 JSON 파일" }),
      chip: "apps/<app>/public/manifest.json",
      facts: [
        {
          label: l.trans({ en: "Keys", ko: "키" }),
          text: l.trans({
            en: "Standard snake_case, exactly what the browser reads.",
            ko: "브라우저가 읽는 그대로의 snake_case로 씁니다.",
          }),
        },
        {
          label: l.trans({ en: "Linked by", ko: "연결" }),
          text: l.trans({
            en: (
              <span>
                A <code>{'<link rel="manifest">'}</code> you write in <code>.head()</code>.
              </span>
            ),
            ko: (
              <span>
                <code>.head()</code>에 직접 쓰는 <code>{'<link rel="manifest">'}</code>로 연결합니다.
              </span>
            ),
          }),
        },
        {
          label: l.trans({ en: "Pick it when", ko: "이럴 때" }),
          text: l.trans({
            en: "Designers or operators need to review the JSON directly.",
            ko: "디자이너나 운영자가 JSON을 직접 확인해야 할 때 고릅니다.",
          }),
        },
      ],
    },
    {
      title: l.trans({ en: ".manifest() Object", ko: ".manifest() 객체" }),
      chip: "apps/<app>/page/_layout.tsx",
      facts: [
        {
          label: l.trans({ en: "Keys", ko: "키" }),
          text: l.trans({
            en: "camelCase, converted to snake_case for you.",
            ko: "camelCase로 쓰면 snake_case로 바꿔 줍니다.",
          }),
        },
        {
          label: l.trans({ en: "Linked by", ko: "연결" }),
          text: l.trans({
            en: (
              <span>
                A <code>data:</code> URL link Akan adds to the head, so no file is served.
              </span>
            ),
            ko: (
              <span>
                Akan이 head에 넣는 <code>data:</code> URL 링크라서 파일은 따로 없습니다.
              </span>
            ),
          }),
        },
        {
          label: l.trans({ en: "Pick it when", ko: "이럴 때" }),
          text: l.trans({
            en: "You want TypeScript help and app metadata in one place.",
            ko: "TypeScript 도움을 받으며 앱 메타데이터를 한곳에 두고 싶을 때 고릅니다.",
          }),
        },
      ],
    },
  ];

  const fitColumns = [
    { key: "pwa", label: l.trans({ en: "PWA alone", ko: "PWA만으로" }) },
    { key: "native", label: l.trans({ en: "Native too", ko: "네이티브 병행" }) },
  ];
  const pwaAlone = { pwa: true, native: false };
  const nativeToo = { pwa: false, native: true };
  const fitGroups = [
    {
      label: l.trans({ en: "Good fit", ko: "잘 맞는 경우" }),
      rows: [
        {
          name: <span className="font-sans">{l.trans({ en: "Daily workflow", ko: "매일 쓰는 업무 흐름" })}</span>,
          desc: l.trans({
            en: "Users return to the same flow every day: office tasks, approvals, reports or checklists.",
            ko: "사무 업무, 승인, 보고서, 체크리스트처럼 사용자가 매일 같은 흐름으로 돌아옵니다.",
          }),
          marks: pwaAlone,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "No app store first", ko: "스토어보다 웹 먼저" })}</span>,
          desc: l.trans({
            en: "One deployed web app covers desktop and mobile before any app-store release.",
            ko: "앱스토어에 내기 전에, 배포한 웹 앱 하나로 데스크톱과 모바일을 함께 지원합니다.",
          }),
          marks: pwaAlone,
        },
      ],
    },
    {
      label: l.trans({ en: "Be careful", ko: "주의할 경우" }),
      rows: [
        {
          name: <span className="font-sans">{l.trans({ en: "Deep native features", ko: "깊은 네이티브 기능" })}</span>,
          desc: l.trans({
            en: "The core of the product needs device features the browser does not expose.",
            ko: "제품의 핵심이 브라우저가 열어 주지 않는 기기 기능에 달려 있습니다.",
          }),
          marks: nativeToo,
        },
        {
          name: (
            <span className="font-sans">{l.trans({ en: "Heavy background work", ko: "무거운 백그라운드 작업" })}</span>
          ),
          desc: l.trans({
            en: "The app has to do heavy work while it is not on screen.",
            ko: "앱이 화면에 없을 때도 무거운 작업을 계속해야 합니다.",
          }),
          marks: nativeToo,
        },
        {
          name: <span className="font-sans">{l.trans({ en: "App-store presence", ko: "앱스토어 입점" })}</span>,
          desc: l.trans({
            en: "Being listed in the app stores is a hard requirement.",
            ko: "앱스토어에 올라가 있는 것이 꼭 필요합니다.",
          }),
          marks: nativeToo,
        },
      ],
    },
  ];

  const manifestKeys = [
    {
      key: "name",
      type: "string",
      desc: l.trans({
        en: "Full app name shown in the install dialog and the app list.",
        ko: "설치 창과 앱 목록에 보이는 전체 이름입니다.",
      }),
    },
    {
      key: "shortName",
      type: "string",
      desc: l.trans({
        en: "Short name shown under the home-screen icon.",
        ko: "홈 화면 아이콘 아래에 붙는 짧은 이름입니다.",
      }),
    },
    {
      key: "description",
      type: "string",
      desc: l.trans({ en: "One-line description of the app.", ko: "앱을 한 줄로 설명합니다." }),
    },
    {
      key: "startUrl",
      type: "string",
      desc: l.trans({ en: "The page the installed app opens first.", ko: "설치된 앱을 열면 처음 뜨는 페이지입니다." }),
    },
    {
      key: "scope",
      type: "string",
      desc: l.trans({
        en: "The URLs that stay inside the installed app window.",
        ko: "설치된 앱 창 안에 머무는 URL 범위입니다.",
      }),
    },
    {
      key: "display",
      type: '"fullscreen" | "standalone" | "minimal-ui" | "browser"',
      desc: l.trans({
        en: "How the window opens; `standalone` hides the browser toolbar.",
        ko: "창을 여는 방식으로, `standalone`은 브라우저 도구 막대를 숨깁니다.",
      }),
    },
    {
      key: "displayOverride",
      type: "string[]",
      desc: l.trans({
        en: "Display modes to try in order before `display`.",
        ko: "`display`보다 먼저 차례대로 시도할 표시 방식 목록입니다.",
      }),
    },
    {
      key: "orientation",
      type: "string",
      desc: l.trans({
        en: "Default screen orientation, such as `portrait`.",
        ko: "`portrait` 같은 기본 화면 방향입니다.",
      }),
    },
    {
      key: "themeColor",
      type: "string",
      desc: l.trans({
        en: "Color of the title bar and system UI around the app.",
        ko: "앱을 둘러싼 제목 표시줄과 시스템 UI의 색입니다.",
      }),
    },
    {
      key: "backgroundColor",
      type: "string",
      desc: l.trans({
        en: "Background of the splash screen shown while the app loads.",
        ko: "앱이 뜨는 동안 보이는 시작 화면의 배경색입니다.",
      }),
    },
    {
      key: "lang",
      type: "string",
      desc: l.trans({
        en: "Language of text values such as `name` and `description`, for example `ko`.",
        ko: "`name`, `description` 같은 텍스트 값의 언어(예: `ko`)입니다.",
      }),
    },
    {
      key: "dir",
      type: '"ltr" | "rtl" | "auto"',
      desc: l.trans({
        en: "Text direction of those same text values.",
        ko: "그 텍스트 값들의 쓰기 방향입니다.",
      }),
    },
    {
      key: "icons",
      type: "WebAppManifestIcon[]",
      desc: l.trans({
        en: "App icons; each entry takes `src`, plus optional `sizes`, `type` and `purpose`.",
        ko: "앱 아이콘 목록으로, 항목마다 `src`는 필수이고 `sizes`, `type`, `purpose`는 선택입니다.",
      }),
    },
    {
      key: "categories",
      type: "string[]",
      desc: l.trans({
        en: "Categories that describe the app, such as `business`.",
        ko: "`business`처럼 앱을 분류하는 값입니다.",
      }),
    },
    {
      key: "screenshots",
      type: "WebAppManifestIcon[]",
      desc: l.trans({
        en: "Images for richer install dialogs, in the same shape as `icons`.",
        ko: "더 풍부한 설치 창에 쓰는 이미지로, 항목 형태는 `icons`와 같습니다.",
      }),
    },
    {
      key: "[key: string]",
      type: "unknown",
      desc: l.trans({
        en: "Any other member, such as `shortcuts` or `id`, passes through with its keys converted.",
        ko: "`shortcuts`, `id` 같은 다른 멤버도 키 이름만 snake_case로 바뀌어 그대로 전달됩니다.",
      }),
    },
  ];

  const assetRows = [
    {
      name: ["/icon-192x192.png", "/icon-512x512.png"],
      desc: l.trans({
        en: "Good first sizes for install prompts; Chrome needs at least one icon of 144px or larger.",
        ko: "설치 안내에 쓰기 좋은 첫 크기이며, Chrome은 144px 이상인 아이콘이 하나는 있어야 합니다.",
      }),
    },
    {
      name: "startUrl",
      desc: l.trans({
        en: "The page the installed app opens at launch, so it must load on the deployed app.",
        ko: "설치된 앱을 시작하면 열리는 페이지라서, 배포된 앱에서 실제로 열려야 합니다.",
      }),
    },
    {
      name: "scope",
      desc: l.trans({
        en: "Limits which URLs belong to the installed app window.",
        ko: "설치된 앱 창에 속하는 URL 범위를 제한합니다.",
      }),
    },
    {
      name: 'display: "standalone"',
      desc: l.trans({
        en: "Opens the app without the normal browser toolbar.",
        ko: "앱을 일반 브라우저 도구 막대 없이 엽니다.",
      }),
    },
  ];

  const relatedLinks = [
    {
      href: "/docs/core/routing#root-layout-exports",
      title: l.trans({ en: "Root Layout Stages", ko: "루트 레이아웃 단계" }),
      desc: l.trans({
        en: (
          <span>
            Every stage only the root layout takes, next to <code>.manifest()</code>.
          </span>
        ),
        ko: (
          <span>
            <code>.manifest()</code>와 함께 루트 레이아웃만 받는 단계를 모았습니다.
          </span>
        ),
      }),
    },
    {
      href: "/docs/core/routing#base-paths",
      title: l.trans({ en: "Base Paths", ko: "Base Path" }),
      desc: l.trans({
        en: "How one app serves several services under separate page folders.",
        ko: "한 앱이 page 폴더를 나눠 여러 서비스를 제공하는 방법입니다.",
      }),
    },
    {
      href: "/cheatsheet/mobile/setup",
      title: l.trans({ en: "Mobile Setup", ko: "모바일 설정" }),
      desc: l.trans({
        en: "Build the same app as a native iOS and Android app with the @akanjs/native runtime.",
        ko: "같은 앱을 @akanjs/native 런타임으로 iOS·Android 네이티브 앱으로 만듭니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "PWA", ko: "PWA" })}>
        <Docs.Title>{l.trans({ en: "PWA", ko: "PWA" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A PWA (Progressive Web App) runs in the browser but can be installed and launched like an app. The browser adds the icon, the app window without a toolbar, and the install prompt.",
              ko: "PWA(Progressive Web App)는 브라우저에서 실행되지만 앱처럼 설치하고 실행할 수 있는 웹 앱입니다. 아이콘, 도구 막대 없는 앱 창, 설치 안내는 브라우저가 붙여 줍니다.",
            })}
          </div>
          <ul className={bulletList}>
            <li>
              <strong>{l.trans({ en: "When it helps.", ko: "도움이 될 때." })}</strong>{" "}
              {l.trans({
                en: "Users open the same web app again and again, and a home-screen or desktop launcher saves them time.",
                ko: "사용자가 같은 웹 앱을 자주 열어서, 홈 화면이나 데스크톱에서 바로 실행하면 편한 경우입니다.",
              })}
            </li>
            <li>
              <strong>{l.trans({ en: "Typical apps.", ko: "대표적인 앱." })}</strong>{" "}
              {l.trans({
                en: "Admin tools, field-work apps, internal dashboards, lightweight commerce apps and content apps.",
                ko: "관리자 도구, 현장 업무 앱, 사내 대시보드, 가벼운 커머스 앱, 콘텐츠 앱입니다.",
              })}
            </li>
            <li>
              <strong>{l.trans({ en: "Where it starts.", ko: "시작점." })}</strong>{" "}
              {l.trans({
                en: "A web app manifest that tells the browser the app's name, icon, start URL, display mode and colors.",
                ko: "앱의 이름, 아이콘, 시작 URL, 표시 방식, 색을 브라우저에 알려 주는 웹 앱 매니페스트 하나입니다.",
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Add It In Three Steps", ko: "세 단계로 추가하기" })}</Docs.SubSubTitle>
          <ol className={stepList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    Put the icons in <code>apps/&lt;app&gt;/public/</code>. That folder is served from the site root, so{" "}
                    <code>public/icon-192x192.png</code> loads as <code>/icon-192x192.png</code>.
                  </span>
                ),
                ko: (
                  <span>
                    아이콘을 <code>apps/&lt;app&gt;/public/</code>에 둡니다. 이 폴더는 사이트 루트에서 제공되므로{" "}
                    <code>public/icon-192x192.png</code>는 <code>/icon-192x192.png</code>로 열립니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    Declare the manifest in one of two ways: a static <code>manifest.json</code> linked from{" "}
                    <code>.head()</code>, or <code>rootLayout().manifest({"{...}"})</code>.
                  </span>
                ),
                ko: (
                  <span>
                    매니페스트를 두 방법 중 하나로 선언합니다. <code>.head()</code>에서 링크하는 정적{" "}
                    <code>manifest.json</code>, 또는 <code>rootLayout().manifest({"{...}"})</code>입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: "Deploy, check that every URL in the manifest loads, then test installation.",
                ko: "배포한 뒤 매니페스트 안의 URL이 모두 열리는지 확인하고, 설치를 시험합니다.",
              })}
            </li>
          </ol>
          <Docs.SubSubTitle>{l.trans({ en: "Two Ways To Declare It", ko: "선언하는 두 방법" })}</Docs.SubSubTitle>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {methodCards.map((card) => (
              <div key={card.chip} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{card.title}</div>
                <code className="mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs">
                  {card.chip}
                </code>
                <ul className="mt-2 space-y-1.5 text-foreground/70 text-sm">
                  {card.facts.map((fact, idx) => (
                    <li key={idx}>
                      <strong className="text-foreground">{fact.label}.</strong> {fact.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="when-to-use" title={l.trans({ en: "When To Use PWA", ko: "PWA를 쓰기 좋은 경우" })}>
        <Docs.Title>{l.trans({ en: "When To Use PWA", ko: "PWA를 쓰기 좋은 경우" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A PWA makes a web app easier to come back to. It does not replace every native app, but it is a strong first choice when shipping on the web fast matters and the app needs no deep device APIs.",
              ko: "PWA는 웹 앱에 다시 들어오기 쉽게 만드는 방법입니다. 모든 네이티브 앱을 대신하지는 못하지만, 웹으로 빨리 배포하는 것이 중요하고 깊은 기기 API가 필요 없다면 좋은 첫 선택입니다.",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Situation", ko: "상황" })}
            columns={fitColumns}
            groups={fitGroups}
            markLabel={l.trans({ en: "Applies", ko: "해당" })}
            emptyLabel={l.trans({ en: "Does not apply", ko: "해당 없음" })}
          />
          <div>
            {l.trans({
              en: "In the three careful cases, plan a native wrapper or a native app next to the PWA.",
              ko: "주의할 세 경우에는 PWA와 함께 네이티브 래퍼나 네이티브 앱도 계획하세요.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="static-manifest" title={l.trans({ en: "Static Manifest File", ko: "정적 매니페스트 파일" })}>
        <Docs.Title>{l.trans({ en: "Static Manifest File", ko: "정적 매니페스트 파일" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Use this when you already have a <code>manifest.json</code> or want to edit the exact JSON the browser
                  reads. First, put the file in <code>public/</code>:
                </span>
              ),
              ko: (
                <span>
                  이미 <code>manifest.json</code>이 있거나, 브라우저가 읽는 JSON을 직접 다루고 싶을 때 씁니다. 먼저
                  파일을 <code>public/</code>에 둡니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/public/manifest.json"
          code={`{
  "name": "My Akan App",
  "short_name": "MyApp",
  "description": "A simple Akan app",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0C1E3E",
  "background_color": "#ffffff",
  "icons": [
    {
      "src": "/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Then link it from <code>.head()</code> of the root <code>_layout.tsx</code>:
                </span>
              ),
              ko: (
                <span>
                  그다음 루트 <code>_layout.tsx</code>의 <code>.head()</code>에서 링크합니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/page/_layout.tsx"
          code={`import "./styles.css";
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .head(
    <>
      <title>My Akan App</title>
      <link rel="icon" href="/favicon.ico" />
      <link rel="manifest" href="/manifest.json" />
    </>,
  )
  .render(({ children }) => children);`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              <strong>{l.trans({ en: "Standard keys.", ko: "표준 키." })}</strong>{" "}
              {l.trans({
                en: (
                  <span>
                    The file is served as is, so write the browser's own snake_case keys such as <code>short_name</code>{" "}
                    and <code>start_url</code>.
                  </span>
                ),
                ko: (
                  <span>
                    파일이 그대로 전달되므로 <code>short_name</code>, <code>start_url</code>처럼 브라우저가 쓰는
                    snake_case 키로 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              <strong>{l.trans({ en: "A real URL.", ko: "실제 URL." })}</strong>{" "}
              {l.trans({
                en: (
                  <span>
                    <code>public/manifest.json</code> is served at <code>/manifest.json</code>, so you can open it in
                    the browser to check it.
                  </span>
                ),
                ko: (
                  <span>
                    <code>public/manifest.json</code>은 <code>/manifest.json</code>으로 제공되므로 브라우저에서 바로
                    열어 확인할 수 있습니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="layout-manifest"
        title={l.trans({ en: "Layout Manifest Object", ko: "레이아웃 매니페스트 객체" })}
      >
        <Docs.Title>{l.trans({ en: "Layout Manifest Object", ko: "레이아웃 매니페스트 객체" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>rootLayout().manifest({"{...}"})</code> keeps the manifest in app code instead of a separate
                  JSON file. Write the keys in camelCase:
                </span>
              ),
              ko: (
                <span>
                  <code>rootLayout().manifest({"{...}"})</code>를 쓰면 매니페스트를 별도 JSON 파일이 아닌 앱 코드에 둘
                  수 있습니다. 키는 camelCase로 씁니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/page/_layout.tsx"
          code={`import "./styles.css";
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .manifest({
    name: "My Akan App",
    shortName: "MyApp",
    description: "A simple Akan app",
    startUrl: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    themeColor: "#0C1E3E",
    backgroundColor: "#ffffff",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  })
  .head(<title>My Akan App</title>)
  .render(({ children }) => children);`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              <strong>
                {l.trans({ en: "camelCase in, snake_case out.", ko: "camelCase로 쓰고 snake_case로 전달." })}
              </strong>{" "}
              {l.trans({
                en: (
                  <span>
                    <code>shortName</code>, <code>startUrl</code> and <code>themeColor</code> reach the browser as the
                    standard <code>short_name</code>, <code>start_url</code> and <code>theme_color</code>, at every
                    depth.
                  </span>
                ),
                ko: (
                  <span>
                    <code>shortName</code>, <code>startUrl</code>, <code>themeColor</code>는 어느 깊이에 있든 표준 키인{" "}
                    <code>short_name</code>, <code>start_url</code>, <code>theme_color</code>로 바뀌어 전달됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              <strong>{l.trans({ en: "No file to serve.", ko: "따로 제공할 파일 없음." })}</strong>{" "}
              {l.trans({
                en: (
                  <span>
                    The object becomes a <code>{'<link rel="manifest">'}</code> in the head whose <code>href</code> is a{" "}
                    <code>data:</code> URL, so there is no <code>/manifest.json</code> to open.
                  </span>
                ),
                ko: (
                  <span>
                    객체는 head의 <code>{'<link rel="manifest">'}</code>가 되고 <code>href</code>는 <code>data:</code>{" "}
                    URL이라서, 열어 볼 <code>/manifest.json</code>은 없습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              <strong>{l.trans({ en: "Root layout only.", ko: "루트 레이아웃 전용." })}</strong>{" "}
              {l.trans({
                en: (
                  <span>
                    <code>.manifest()</code> is a <code>rootLayout()</code> stage, so it goes in the app's (or a base
                    path's) root <code>_layout.tsx</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <code>.manifest()</code>는 <code>rootLayout()</code>의 단계이므로 앱(또는 base path)의 루트{" "}
                    <code>_layout.tsx</code>에 씁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Keys You Can Write", ko: "쓸 수 있는 키" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  The argument is typed as <code>WebAppManifest</code> from <code>akanjs/client</code>. Every key is
                  optional.
                </span>
              ),
              ko: (
                <span>
                  인자 타입은 <code>akanjs/client</code>의 <code>WebAppManifest</code>입니다. 모든 키는 선택입니다.
                </span>
              ),
            })}
          </div>
          <Docs.OptionTable items={manifestKeys} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="assets" title={l.trans({ en: "Required Assets", ko: "필요한 파일과 URL" })}>
        <Docs.Title>{l.trans({ en: "Required Assets", ko: "필요한 파일과 URL" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Before testing installation, make sure every URL in the manifest loads on the deployed app. These are the ones to check first:",
              ko: "설치를 시험하기 전에, 매니페스트 안의 모든 URL이 배포된 앱에서 열리는지 확인하세요. 먼저 볼 것은 다음과 같습니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "File or key", ko: "파일 또는 키" })} items={assetRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "팁과 주의점" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "팁과 주의점" })}</Docs.Title>
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              <strong>{l.trans({ en: "Start simple.", ko: "단순하게 시작하세요." })}</strong>{" "}
              {l.trans({
                en: (
                  <span>
                    Ship one minimal manifest first. Add <code>screenshots</code>, <code>categories</code> or{" "}
                    <code>shortcuts</code> once installation works.
                  </span>
                ),
                ko: (
                  <span>
                    처음에는 단순한 매니페스트 하나로 시작하고, 설치가 되면 <code>screenshots</code>,{" "}
                    <code>categories</code>, <code>shortcuts</code>를 더하세요.
                  </span>
                ),
              })}
            </li>
            <li>
              <strong>{l.trans({ en: "Under a base path.", ko: "base path 아래라면." })}</strong>{" "}
              {l.trans({
                en: (
                  <span>
                    Set <code>startUrl</code> and <code>scope</code> to that path instead of <code>/</code>. A base
                    path's root <code>_layout.tsx</code> with no <code>.manifest()</code> of its own uses the app
                    root's.
                  </span>
                ),
                ko: (
                  <span>
                    <code>startUrl</code>과 <code>scope</code>를 <code>/</code> 대신 그 경로로 지정하세요. 자기{" "}
                    <code>.manifest()</code>가 없는 base path 루트 <code>_layout.tsx</code>는 앱 루트의 매니페스트를
                    씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              <strong>{l.trans({ en: "Pick one method.", ko: "방법은 하나만." })}</strong>{" "}
              {l.trans({
                en: (
                  <span>
                    With both, the page carries two <code>{'<link rel="manifest">'}</code> tags and the browser reads
                    only the first.
                  </span>
                ),
                ko: (
                  <span>
                    둘 다 쓰면 페이지에 <code>{'<link rel="manifest">'}</code>가 두 개 생기고, 브라우저는 첫 번째만
                    읽습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              <strong>{l.trans({ en: "Test over HTTPS.", ko: "HTTPS에서 시험하세요." })}</strong>{" "}
              {l.trans({
                en: "Browsers offer installation only on HTTPS or localhost. Chrome DevTools → Application → Manifest shows what the browser parsed and why it will not install.",
                ko: "브라우저는 HTTPS나 localhost에서만 설치를 제안합니다. Chrome 개발자 도구의 Application → Manifest에서 읽힌 값과 설치가 안 되는 이유를 볼 수 있습니다.",
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Read next", ko: "이어서 읽기" })}</Docs.SubSubTitle>
          <Docs.LinkGrid items={relatedLinks} />
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
