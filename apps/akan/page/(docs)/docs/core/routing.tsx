import { usePage } from "@apps/akan/client";
import { badgeRecipe, Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

const routeFiles = [
  {
    name: "folder/_index.tsx",
    en: "The page for the folder it sits in: project/_index.tsx serves /:lang/project.",
    ko: "자기가 놓인 폴더의 페이지입니다. project/_index.tsx는 /:lang/project를 제공합니다.",
  },
  {
    name: "folder/_layout.tsx",
    en: "Wraps every page below its folder. The root one is a rootLayout() chain.",
    ko: "자기 폴더 아래의 모든 페이지를 감쌉니다. root _layout.tsx는 rootLayout() 체인입니다.",
  },
  {
    name: "folder/_overrides.tsx",
    en: "A logic-free manifest of UI overrides for the subtree: one export default override({ … }).",
    ko: "하위 트리의 UI override를 적는 로직 없는 매니페스트입니다. export default override({ … }) 하나만 둡니다.",
  },
  {
    name: "path.tsx",
    en: "A segment as one file: project.tsx serves /:lang/project. Never an uppercase first letter.",
    ko: "세그먼트를 파일 하나로 선언합니다. project.tsx는 /:lang/project를 제공하며, 대문자로 시작할 수 없습니다.",
  },
  {
    name: "[param].tsx",
    en: "A dynamic segment as one file: [projectId].tsx serves /:lang/:projectId.",
    ko: "동적 세그먼트를 파일 하나로 선언합니다. [projectId].tsx는 /:lang/:projectId를 제공합니다.",
  },
  {
    name: "(group)/",
    en: "Organizes files without adding a URL segment, such as (user) or (public).",
    ko: "URL 세그먼트를 더하지 않고 파일을 정리합니다. (user), (public) 같은 이름을 씁니다.",
  },
  {
    name: "[lang]/",
    en: "Never written: Akan injects the locale.",
    ko: "직접 쓰지 않습니다. Akan이 locale을 주입합니다.",
  },
];

const crawlerFiles = [
  {
    name: "/robots.txt",
    en: "Opens public pages to every crawler, AI crawlers included, and closes the API and admin paths.",
    ko: "AI 크롤러를 포함한 모든 크롤러에게 공개 페이지를 열고, API와 관리자 경로는 닫습니다.",
  },
  {
    name: "/sitemap.xml",
    en: "Lists every static page once per locale; a page with a [param] segment is left out.",
    ko: "정적 페이지를 언어마다 모두 나열합니다. [param] 세그먼트가 있는 페이지는 빠집니다.",
  },
];

const chainStages = [
  {
    en: "Every chain",
    ko: "모든 체인",
    stages: [
      {
        name: ".param",
        args: "(name, Type)",
        page: true,
        layout: true,
        rootLayout: true,
        required: false,
        en: "Declares one [x] path segment, typed; a value the type refuses answers not-found.",
        ko: "경로의 [x] 세그먼트 하나를 타입과 함께 선언합니다. 타입이 거부하는 값은 not-found로 응답합니다.",
      },
      {
        name: ".search",
        args: "(key, Type)",
        page: true,
        layout: true,
        rootLayout: true,
        required: false,
        en: "An optional query key; [String] reads a list, and a value the type refuses is dropped.",
        ko: "선택 사항인 쿼리 키입니다. [String]은 목록을 읽고, 타입이 거부하는 값은 버려집니다.",
      },
      {
        name: ".config",
        args: "({ … })",
        page: true,
        layout: true,
        rootLayout: true,
        required: false,
        en: "Client frame behaviour such as transition and devOnly; child pages inherit a layout's.",
        ko: "transition·devOnly 같은 클라이언트 frame 동작입니다. 하위 페이지는 레이아웃의 값을 상속합니다.",
      },
      {
        name: ".head",
        args: "(jsx | fn)",
        page: true,
        layout: true,
        rootLayout: true,
        required: false,
        en: "The route's <head> as JSX (title, meta, link), or a function of the args that returns it.",
        ko: "라우트의 <head>를 JSX(title, meta, link)로 넘기거나, 인자를 받아 그 JSX를 반환하는 함수로 넘깁니다.",
      },
      {
        name: ".loading",
        args: "(fn)",
        page: true,
        layout: true,
        rootLayout: true,
        required: false,
        en: "Fallback UI while the route loads; every .search() value reads undefined inside it.",
        ko: "라우트가 로딩되는 동안의 대체 UI입니다. 그 안에서 .search() 값은 모두 undefined입니다.",
      },
    ],
  },
  {
    en: "page() only",
    ko: "page() 전용",
    stages: [
      {
        name: ".prompt",
        args: "(name, desc)",
        page: true,
        layout: false,
        rootLayout: false,
        required: false,
        en: "Publishes the screen as an MCP prompt: .param() args are required, .search() optional.",
        ko: "화면을 MCP prompt로 공개합니다. .param()은 필수 인자, .search()는 선택 인자가 됩니다.",
      },
    ],
  },
  {
    en: "layout() and rootLayout()",
    ko: "layout()·rootLayout()",
    stages: [
      {
        name: ".notFound",
        args: "(fn)",
        page: false,
        layout: true,
        rootLayout: true,
        required: false,
        en: "404 UI rendered inside the layout when a child route is missing; takes raw route props.",
        ko: "하위 라우트가 없을 때 레이아웃 안에 그리는 404 UI입니다. 타입 인자가 아니라 원본 route props를 받습니다.",
      },
      {
        name: ".error",
        args: "(fn)",
        page: false,
        layout: true,
        rootLayout: true,
        required: false,
        en: "SSR error UI under the nearest layout when a child throws; raw props, error and digest.",
        ko: "하위 라우트가 SSR 중 에러를 던지면 가장 가까운 레이아웃 안에 그리는 UI입니다. 원본 props에 error와 digest가 더해집니다.",
      },
    ],
  },
  {
    en: "rootLayout() only",
    ko: "rootLayout() 전용",
    stages: [
      {
        name: ".fonts",
        args: "([…])",
        page: false,
        layout: false,
        rootLayout: true,
        required: false,
        en: "Registers app-wide fonts; optimize subsets a font and serves it from /_akan/fonts.",
        ko: "앱 전체 폰트를 등록합니다. optimize를 켜면 subset해서 /_akan/fonts에서 제공합니다.",
      },
      {
        name: ".manifest",
        args: "({ … })",
        page: false,
        layout: false,
        rootLayout: true,
        required: false,
        en: "The web app manifest (name, startUrl, icons…), served at /manifest.webmanifest so the app installs.",
        ko: "설치형 앱에 쓰는 web app manifest(name, startUrl, icons 등)이며, /manifest.webmanifest로 제공합니다.",
      },
      {
        name: ".theme",
        args: "(name)",
        page: false,
        layout: false,
        rootLayout: true,
        required: false,
        en: "The document's default theme (dark, light, system); an empty string is honoured.",
        ko: "문서의 기본 테마(dark, light, system)입니다. 빈 문자열도 그대로 적용됩니다.",
      },
      {
        name: ".reconnect",
        args: "(on)",
        page: false,
        layout: false,
        rootLayout: true,
        required: false,
        en: "The connection-lost overlay only, not reconnection; off unless you set it.",
        ko: "연결 끊김 오버레이만 켜며 재연결과는 무관합니다. 선언하지 않으면 꺼져 있습니다.",
      },
      {
        name: ".wsConnect",
        args: "(on)",
        page: false,
        layout: false,
        rootLayout: true,
        required: false,
        en: "Connects the WebSocket on load (default true); false waits for fetch.instance.connect().",
        ko: "로드 후 WebSocket을 연결합니다(기본값 true). false이면 fetch.instance.connect()를 기다립니다.",
      },
      {
        name: ".layoutStyle",
        args: "(style)",
        page: false,
        layout: false,
        rootLayout: true,
        required: false,
        en: "The outer page container style, web or mobile. Use mobile for app-like shells.",
        ko: "바깥 페이지 컨테이너 스타일이며 web 또는 mobile입니다. 앱 같은 화면에는 mobile을 씁니다.",
      },
      {
        name: ".viewport",
        args: "({ … })",
        page: false,
        layout: false,
        rootLayout: true,
        required: false,
        en: "The viewport meta: fitCover for edge-to-edge, the keyboard's interactiveWidget, and themeColor.",
        ko: "viewport meta입니다. 화면 끝까지 그리는 fitCover, 키보드의 interactiveWidget, themeColor를 정합니다.",
      },
    ],
  },
  {
    en: "Ends the chain",
    ko: "체인의 끝",
    stages: [
      {
        name: ".render",
        args: "(fn)",
        page: true,
        layout: true,
        rootLayout: true,
        required: true,
        en: "The component, ending the chain; gets lang, the declared args, and children on a layout.",
        ko: "컴포넌트이자 체인의 끝입니다. lang과 선언한 인자, 레이아웃이면 children도 받습니다.",
      },
    ],
  },
];

export default page().render(() => {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="file-based-routing" title={l.trans({ en: "File Based Routing", ko: "파일 기반 라우팅" })}>
        <Docs.Title>{l.trans({ en: "File Based Routing", ko: "파일 기반 라우팅" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan uses file-based routing. You create files under page/, and the folder structure becomes the page URL. Every route also sits under a locale segment that Akan injects for you, so the same file serves every language you ship.",
              ko: "Akan은 파일 기반 라우팅을 사용합니다. page/ 아래에 파일을 만들면 폴더 구조가 페이지 URL이 됩니다. 모든 라우트는 Akan이 자동으로 주입하는 locale 세그먼트 아래에 놓이므로, 하나의 파일이 제공하는 모든 언어를 처리합니다.",
            })}
          </div>
          <Docs.Flow
            title={l.trans({ en: "From folder to URL", ko: "폴더에서 URL까지" })}
            direction="TB"
            nodes={{
              file: { label: "page/(user)/project/", lines: ["[projectId]/_index.tsx"] },
              group: { label: l.trans({ en: "(user) adds no segment", ko: "(user)는 세그먼트를 더하지 않습니다" }) },
              lang: { label: l.trans({ en: "Akan injects the locale", ko: "Akan이 locale을 주입합니다" }) },
              url: { label: "/:lang/project/:projectId" },
            }}
            edges={[
              ["file", "group"],
              ["group", "lang"],
              ["lang", "url"],
            ]}
            emphasis={["url"]}
          />
          <div className="space-y-1 pl-2">
            {[
              [
                l.trans({ en: "File-based", ko: "파일 기반" }),
                l.trans({
                  en: "Folders and files decide the URL shape.",
                  ko: "폴더와 파일이 URL 형태를 결정합니다.",
                }),
              ],
              [
                l.trans({ en: "Locale-aware", ko: "다국어 지원" }),
                l.trans({
                  en: "Akan injects the locale segment automatically and hands it to every route as lang.",
                  ko: "Akan이 locale 세그먼트를 자동으로 주입하고 모든 라우트에 lang으로 전달합니다.",
                }),
              ],
              [
                l.trans({ en: "Explicit files", ko: "명시적인 파일" }),
                l.trans({
                  en: "Use page and layout files instead of hidden magic.",
                  ko: "숨겨진 규칙보다 page와 layout 파일을 명시적으로 사용합니다.",
                }),
              ],
            ].map(([title, desc]) => (
              <div key={title}>
                <span className="font-bold text-foreground">{title}: </span>
                <span className="text-foreground/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="file-convention" title={l.trans({ en: "File Convention", ko: "파일 컨벤션" })}>
        <Docs.Title>{l.trans({ en: "File Convention", ko: "파일 컨벤션" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A route file is a page, a layout, or an overrides manifest. Everything under page/ must be a .tsx route module — no helper file, no logic file, no filename starting with an uppercase letter.",
              ko: "라우트 파일은 page, layout, overrides 매니페스트 중 하나입니다. page/ 아래에는 .tsx 라우트 모듈만 둘 수 있습니다. helper 파일도, 로직 파일도, 대문자로 시작하는 파일명도 허용되지 않습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="page/"
          language="bash"
          code={`page/
├── _layout.tsx
├── _index.tsx
├── (public)/
│   ├── signin.tsx
│   └── signup.tsx
└── (user)/
    └── project/
        └── [projectId]/
            ├── _layout.tsx
            ├── _overrides.tsx
            └── _index.tsx`}
        />
        <Docs.IntroTable
          type={l.trans({ en: "File", ko: "파일" })}
          items={routeFiles.map(({ name, en, ko }) => ({ name, desc: l.trans({ en, ko }) }))}
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: "_index.tsx, _layout.tsx and _overrides.tsx are the only reserved names an underscore may introduce.",
            ko: "밑줄로 시작할 수 있는 예약 파일명은 _index.tsx, _layout.tsx, _overrides.tsx 셋뿐입니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="page-module" title={l.trans({ en: "Page File Shape", ko: "페이지 파일 구성" })}>
        <Docs.Title>{l.trans({ en: "Page File Shape", ko: "페이지 파일 구성" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A page file exports a single page() chain and nothing else. Each route setting is one stage of the chain: .param() and .search() declare the values the page reads, .config() tunes the route, .head() and .loading() set the head tags and the loading fallback, and .render() returns the component. The render callback receives the declared values flat, already typed.",
              ko: "페이지 파일은 page() 체인 하나만 export합니다. 라우트 설정은 각각 체인의 한 단계입니다. .param()과 .search()는 페이지가 읽는 값을 선언하고, .config()는 라우트 동작을 정하며, .head()와 .loading()은 head 태그와 로딩 화면을 설정하고, .render()가 컴포넌트를 반환합니다. render 콜백은 선언한 값을 이미 타입이 붙은 평탄한 형태로 받습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="page/(user)/project/[projectId]/_index.tsx"
          code={`import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("projectId", ID, { desc: "The project to open." })
  .search("tab", String, { desc: "Which tab opens first." })
  .config({ transition: "stack" })
  .head(({ projectId }) => (
    <>
      <title>{\`Project \${projectId}\`}</title>
      <meta name="description" content="Project workspace" />
    </>
  ))
  .loading(() => <div>Loading...</div>)
  .render(({ projectId, tab }) => {
    return (
      <div>
        Project {projectId} ({tab ?? "overview"})
      </div>
    );
  });`}
        />
        <Code.Snippet
          className="w-full"
          title="Static head example"
          code={`import { page } from "akanjs/client";

export default page()
  .head(
    <>
      <title>Projects</title>
      <meta name="description" content="Browse your projects" />
      <meta property="og:title" content="Projects" />
      <meta property="og:image" content="/og/projects.png" />
      <meta name="twitter:card" content="summary_large_image" />
      <link rel="canonical" href="https://example.com/projects" />
    </>,
  )
  .render(() => <div>Projects</div>);`}
        />
        <Docs.Alert type="info">
          {l.trans({
            en: "Heads merge from the root down: a deeper .head() replaces the <title>, a meta with the same name or property, and a canonical, manifest or icon link, and keeps everything else. A canonical link and og:url each name one URL, so a page carries them only from its own .head(), never from a layout's. Give <title> one string child, a template literal when it includes a value, and skip the hreflang alternates since Akan adds one per locale. A page() chain must be the module's only export, and the names in .param() and .prompt() are string literals.",
            ko: "head는 root부터 아래로 병합됩니다. 더 깊은 .head()는 <title>, name이나 property가 같은 meta, canonical·manifest·icon link를 덮어쓰고 나머지는 그대로 둡니다. canonical link와 og:url은 URL 하나를 가리키므로, 페이지는 레이아웃의 것을 물려받지 않고 자기 .head()에 적은 것만 씁니다. <title>의 자식은 문자열 하나로 쓰고, 값이 들어가면 template literal을 사용합니다. hreflang alternate는 Akan이 locale마다 직접 넣으므로 적지 않습니다. page() 체인은 모듈의 유일한 export여야 하며, .param()과 .prompt()의 이름은 문자열 리터럴로 씁니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="chain-stages" title={l.trans({ en: "Chain Stages", ko: "체인 단계" })}>
        <Docs.Title>{l.trans({ en: "Chain Stages", ko: "체인 단계" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "There are fifteen stages, and the three chains share most of them. page() adds .prompt(); layout() adds .notFound() and .error(); rootLayout() is a layout that also carries the app-wide stages. The three columns mark which builder each stage is legal on.",
              ko: "단계는 모두 열다섯 개이고, 세 체인이 그 대부분을 공유합니다. page()는 .prompt()를, layout()은 .notFound()와 .error()를 더하며, rootLayout()은 앱 공통 단계까지 가진 layout입니다. 세 열은 각 단계를 어느 체인에서 쓸 수 있는지 표시합니다.",
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Stage", ko: "단계" })}
            columns={["page", "layout", "rootLayout"].map((key) => ({ key, label: `${key}()`, code: true }))}
            groups={chainStages.map(({ en, ko, stages }) => ({
              label: l.trans({ en, ko }),
              rows: stages.map(({ name, args, required, en, ko, ...marks }) => ({
                name: (
                  <>
                    {name}
                    <wbr />
                    <span className="whitespace-nowrap">{args}</span>
                    {required ? (
                      <span className={badgeRecipe({ variant: "primary", size: "xs" }, "ml-2 font-sans")}>
                        {l.trans({ en: "required", ko: "필수" })}
                      </span>
                    ) : null}
                  </>
                ),
                desc: l.trans({ en, ko }),
                marks,
              })),
            }))}
            countTemplate={l.trans({ en: "{num} stages", ko: "단계 {num}개" })}
            markLabel={l.trans({ en: "Available on this chain", ko: "이 체인에서 사용 가능" })}
            emptyLabel={l.trans({ en: "Not on this chain", ko: "이 체인에는 없음" })}
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: 'On rootLayout(), the app-wide stages must come before .param() and .search(). Those two stages return a layout type rather than the chain\'s own type, so .theme() and its siblings are gone from what follows them — rootLayout().theme("dark").param("orgId", ID) compiles and the reverse order does not.',
              ko: 'rootLayout()에서는 앱 공통 단계를 .param()·.search()보다 먼저 씁니다. 이 두 단계는 체인 자신의 타입이 아니라 layout 타입을 반환하므로, 그 뒤에서는 .theme()과 형제 단계들이 사라집니다. rootLayout().theme("dark").param("orgId", ID)는 컴파일되고 순서를 뒤집으면 되지 않습니다.',
            })}
          </Docs.Alert>
          <Docs.Alert type="info">
            {l.trans({
              en: "lang is never declared. Every route sits under the locale, and the value reaches every stage as lang. A page must declare every [x] segment of its path; a layout may leave some undeclared.",
              ko: "lang은 선언하지 않습니다. 모든 라우트가 locale 아래에 놓이고 값이 lang으로 모든 단계에 전달됩니다. 페이지는 경로의 [x] 세그먼트를 모두 선언해야 하고, 레이아웃은 일부를 남겨 둘 수 있습니다.",
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="layout-module" title={l.trans({ en: "Layout File Shape", ko: "레이아웃 파일 구성" })}>
        <Docs.Title>{l.trans({ en: "Layout File Shape", ko: "레이아웃 파일 구성" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A layout file wraps child pages. Use it for shared headers, tabs, sidebars, guards, or page-level shells. Its own .head() covers child pages that declare none, and its .notFound() and .error() are the fallback for everything below it.",
              ko: "레이아웃 파일은 하위 페이지를 감쌉니다. 공통 헤더, 탭, 사이드바, 접근 제어, 페이지 껍데기 같은 UI를 둘 때 사용합니다. 자체 .head()는 head를 선언하지 않은 하위 페이지에 쓰이고, .notFound()와 .error()는 그 아래 전체의 fallback이 됩니다.",
            })}
          </div>
          <Docs.Figure
            title={l.trans({ en: "Layouts wrap the page", ko: "레이아웃이 페이지를 감쌉니다" })}
            image="layout-nesting"
            prompt={`
              One browser window drawn large. Inside it, three rounded rectangles nested one inside the next, each
              leaving a wide margin around the one it holds. The outermost is labelled "Root Layout" at its top left
              with a smaller second line "fonts · theme · head". The middle one is labelled "Layout" at its top left
              with a smaller second line "nav · guard · notFound", and a thin bar runs across its top like a menu.
              The innermost, traced as the red accent, is labelled "Page" in its centre with a smaller second line
              "the route itself".
            `}
            alt={l.trans({
              en: "The root layout wraps every layout below it, each layout wraps the pages under its folder, and the page renders innermost.",
              ko: "root layout이 그 아래의 모든 layout을 감싸고, 각 layout은 자기 폴더 아래의 페이지를 감싸며, 페이지는 가장 안쪽에서 렌더링됩니다.",
            })}
          />
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="page/(user)/project/[projectId]/_layout.tsx"
          code={`import { ID } from "akanjs/base";
import { layout } from "akanjs/client";

export default layout()
  .param("projectId", ID)
  .loading(() => <div>Loading project...</div>)
  .notFound(({ pathname }) => <div>Project route not found: {pathname}</div>)
  .error(() => <div>Project failed to render.</div>)
  .render(({ children, projectId }) => {
    return (
      <section>
        <nav>Project {projectId}</nav>
        {children}
      </section>
    );
  });`}
        />
        <Docs.Alert type="info">
          {l.trans({
            en: "The .notFound() and .error() stages exist on layout(), not on page(). If a layout declares neither, Akan walks up to the nearest parent layout fallback, then falls back to the framework system page.",
            ko: ".notFound()와 .error() 단계는 page()가 아니라 layout()에 있습니다. 해당 layout이 둘 다 선언하지 않으면 Akan은 가장 가까운 상위 layout fallback을 찾고, 없으면 framework system page를 사용합니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="root-layout-exports" title={l.trans({ en: "Root Layout Stages", ko: "Root Layout 단계" })}>
        <Docs.Title>{l.trans({ en: "Root Layout Stages", ko: "Root Layout 단계" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The root _layout.tsx of an app, or of a basePath, is a rootLayout() chain. It is still a layout, but it also carries the app-wide stages for fonts, manifest, theme, viewport, realtime connection, and mobile-style rendering. The stylesheet import stays the first line of the file.",
              ko: "앱 또는 basePath의 root _layout.tsx는 rootLayout() 체인입니다. 기본적으로는 layout이지만 font, manifest, theme, viewport, realtime connection, mobile-style rendering 같은 앱 공통 단계를 함께 가집니다. 스타일시트 import는 파일의 첫 줄에 그대로 둡니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="page/_layout.tsx"
          code={`import "./styles.css";
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .fonts([
    {
      name: "pretendard",
      default: true,
      paths: [{ src: "/fonts/pretendard.woff2", weight: 400 }],
    },
  ])
  .manifest({
    name: "Akan App",
    shortName: "Akan",
    startUrl: "/",
    display: "standalone",
    themeColor: "#111827",
  })
  .theme("dark")
  .reconnect(true)
  .wsConnect(true)
  .layoutStyle("web")
  .head(
    <>
      <title>Akan App</title>
      <link rel="icon" href="/favicon.ico" />
    </>,
  )
  .render(({ children }) => children);`}
        />
        <div>
          {l.trans({
            en: "Each of these is one row of the Chain Stages table above, and only .fonts(), .manifest(), .theme(), .reconnect(), .wsConnect() and .layoutStyle() are exclusive to this file. Everything else here — .config(), .head(), .loading(), .notFound(), .error(), .render() — is the ordinary layout surface.",
            ko: "여기 쓰인 단계는 모두 위의 Chain Stages 표에 한 행씩 있으며, 이 파일에만 있는 것은 .fonts(), .manifest(), .theme(), .reconnect(), .wsConnect(), .layoutStyle() 여섯 개뿐입니다. 나머지 .config(), .head(), .loading(), .notFound(), .error(), .render()는 일반 layout에도 있는 단계입니다.",
          })}
        </div>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="google-analytics" title={l.trans({ en: "Google Analytics", ko: "Google Analytics" })}>
        <Docs.Title>{l.trans({ en: "Google Analytics", ko: "Google Analytics" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan has no analytics stage. Which tags load, in which environment and behind which consent banner are the app's decisions, so a tag is an ordinary client component that the root layout renders. The one below loads gtag.js once for the whole app.",
              ko: "Akan에는 analytics 단계가 없습니다. 어떤 태그를 어느 환경에서, 어떤 동의 배너 뒤에서 불러올지는 앱이 정할 일이므로, 태그는 root layout이 렌더링하는 평범한 클라이언트 컴포넌트입니다. 아래 컴포넌트는 앱 전체에서 gtag.js를 한 번 불러옵니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="ui/Analytics.tsx"
          code={`"use client";
import { useEffect } from "react";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

interface AnalyticsProps {
  measurementId: string;
}
export const Analytics = ({ measurementId }: AnalyticsProps) => {
  useEffect(() => {
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag() {
      // biome-ignore lint/complexity/noArguments: gtag.js reads only an Arguments object off dataLayer, never an array
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", measurementId);
  }, [measurementId]);
  return <script async src={\`https://www.googletagmanager.com/gtag/js?id=\${measurementId}\`} />;
};`}
        />
        <Code.Snippet
          className="w-full"
          title="page/_layout.tsx"
          code={`import "./styles.css";
import { Analytics } from "@apps/myapp/ui";
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .theme("dark")
  .head(<title>My App</title>)
  .render(({ children }) => (
    <>
      <Analytics measurementId="G-XXXXXXXXXX" />
      {children}
    </>
  ));`}
        />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="search-engines" title={l.trans({ en: "Search Engines", ko: "검색엔진" })}>
        <Docs.Title>{l.trans({ en: "Search Engines", ko: "검색엔진" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Every page renders on the server, and a crawler — a search engine, an AI crawler or a link preview — gets it whole, with every section already in place. The two files crawlers look for are served as well.",
              ko: "모든 페이지는 서버에서 렌더링되고, 검색엔진·AI 크롤러·링크 미리보기 같은 크롤러는 모든 섹션이 제자리에 들어간 완성된 페이지를 받습니다. 크롤러가 찾는 파일 두 개도 함께 제공됩니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable
          type={l.trans({ en: "Path", ko: "경로" })}
          items={crawlerFiles.map(({ name, en, ko }) => ({ name, desc: l.trans({ en, ko }) }))}
        />
        <Code.Snippet
          className="w-full"
          title="/robots.txt"
          language="yaml"
          code={`User-agent: *
Allow: /
Disallow: /api
Disallow: /_akan
Disallow: /admin
Disallow: /manager
Disallow: /private`}
        />
        <Docs.Alert type="info">
          {l.trans({
            en: (
              <span>
                To change either file, put your own <code>robots.txt</code> or <code>sitemap.xml</code> in{" "}
                <code>public/</code>, and it is served instead. A sitemap that has to list <code>[param]</code> pages
                can come from an endpoint, as in{" "}
                <Link href="/conventions/module/signal#endpoint-signal" className="text-primary">
                  Serving a fixed path
                </Link>
                .
              </span>
            ),
            ko: (
              <span>
                바꾸려면 <code>public/</code>에 직접 쓴 <code>robots.txt</code>나 <code>sitemap.xml</code>을 두면 그
                파일이 대신 나갑니다. <code>[param]</code> 페이지까지 담아야 하는 sitemap은{" "}
                <Link href="/conventions/module/signal#endpoint-signal" className="text-primary">
                  고정 경로로 제공하기
                </Link>
                처럼 endpoint에서 만들 수 있습니다.
              </span>
            ),
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="base-paths" title={l.trans({ en: "Base Paths", ko: "Base Path" })}>
        <Docs.Title>{l.trans({ en: "Base Paths", ko: "Base Path" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When an app defines base paths in akan.config.ts, page files must live under one of those base path folders. This keeps multi-service or multi-domain apps explicit.",
              ko: "앱이 akan.config.ts에서 base path를 정의하면 page 파일은 해당 base path 폴더 아래에 있어야 합니다. 여러 서비스나 여러 도메인을 가진 앱의 라우트를 명확하게 나누기 위한 규칙입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/akan.config.ts"
          code={`const config = {
  routes: [
    { domains: { main: ["manager.myapp.com"] }, basePath: "manager" },
    { domains: { main: ["admin.myapp.com"] }, basePath: "admin" },
  ],
};`}
        />
        <Code.Snippet
          className="w-full"
          title="page/"
          language="bash"
          code={`page/
├── manager/
│   └── _index.tsx
└── admin/
    └── _index.tsx`}
        />
        <Docs.Alert type="info">
          {l.trans({
            en: "If base paths are configured, putting a page directly under page/ is invalid. Move it under page/<basePath>/ so Akan can tell which route group owns it.",
            ko: "base path가 설정된 앱에서는 page/ 바로 아래에 페이지를 두면 올바르지 않습니다. Akan이 어떤 라우트 묶음에 속하는지 알 수 있도록 page/<basePath>/ 아래로 옮겨야 합니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="library-pages" title={l.trans({ en: "Library Pages", ko: "라이브러리 페이지" })}>
        <Docs.Title>{l.trans({ en: "Library Pages", ko: "라이브러리 페이지" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A library can ship routes from its own page folder. An app opts in with syncPageLibs, and a library route keeps its own path.",
              ko: "라이브러리도 자체 page 폴더에 라우트를 담을 수 있습니다. 앱이 syncPageLibs로 사용을 선언하면, 라이브러리 라우트는 자기 경로를 그대로 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="apps/myapp/akan.config.ts"
          code={`const config = {
  // true: every lib dependency that has a page folder
  // ["shared"]: only the libs listed
  // false (default): nothing is synced
  syncPageLibs: ["shared"],
};`}
        />
        <Code.Snippet
          title="library route mapping"
          language="bash"
          code={`# Source in a library
libs/shared/page/login/_index.tsx

# Browser request
/login`}
        />
        <Docs.Alert type="info">
          {l.trans({
            en: "Apps with base paths get the library routes under every base path.",
            ko: "base path가 있는 앱은 모든 base path 아래에 라이브러리 라우트를 받습니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="dev-only-routes" title={l.trans({ en: "Dev Only Routes", ko: "개발 전용 라우트" })}>
        <Docs.Title>{l.trans({ en: "Dev Only Routes", ko: "개발 전용 라우트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: ".config({ devOnly: true }) keeps a route out of akan build. It still serves under akan start and is still typechecked, but nothing about it reaches production: no bundle, no route manifest entry, no URL.",
              ko: ".config({ devOnly: true })를 켜면 해당 라우트가 akan build에서 제외됩니다. akan start에서는 그대로 동작하고 타입 검사도 계속 받지만, 번들에도 라우트 매니페스트에도 들어가지 않아 프로덕션에서는 존재하지 않습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="page/(dev)/playground/_index.tsx"
          code={`import { page } from "akanjs/client";

export default page()
  .config({ devOnly: true })
  .render(() => <div>Component playground</div>);`}
        />
        <Docs.Alert type="info">
          {l.trans({
            en: "On a _layout file, devOnly removes every route under that directory too, so a whole dev-only section can be marked once. Write it as a literal true or false.",
            ko: "_layout 파일에 지정하면 그 디렉토리 아래 라우트가 모두 함께 제외되므로 개발 전용 구역 전체를 한 번에 표시할 수 있습니다. 값은 리터럴 true 또는 false로 작성합니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
