import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="file-based-routing" title={l.trans({ en: "File Based Routing", ko: "파일 기반 라우팅" })}>
        <Docs.Title>{l.trans({ en: "File Based Routing", ko: "파일 기반 라우팅" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan uses file-based routing. You create files under page/, and the folder structure becomes the page URL. Most pages also get a language parameter automatically, so the same file can serve localized URLs.",
              ko: "Akan은 파일 기반 라우팅을 사용합니다. page/ 아래에 파일을 만들면 폴더 구조가 페이지 URL이 됩니다. 대부분의 페이지에는 언어 파라미터가 자동으로 붙어서 하나의 파일이 다국어 URL을 처리할 수 있습니다.",
            })}
          </div>
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
            <div className="mb-4 font-bold text-base-content">
              {l.trans({ en: "How files become routes", ko: "파일이 라우트가 되는 방식" })}
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {[
                {
                  label: l.trans({ en: "Page file", ko: "페이지 파일" }),
                  file: "page/(user)/project/[projectId]/_index.tsx",
                  result: "/:lang/project/:projectId",
                  desc: l.trans({
                    en: "The index file becomes the route endpoint.",
                    ko: "index 파일은 실제 라우트 진입점이 됩니다.",
                  }),
                },
                {
                  label: l.trans({ en: "Layout file", ko: "레이아웃 파일" }),
                  file: "page/(user)/project/[projectId]/_layout.tsx",
                  result: "wraps child pages",
                  desc: l.trans({
                    en: "The layout wraps pages below the same folder.",
                    ko: "layout은 같은 폴더 아래의 페이지를 감쌉니다.",
                  }),
                },
                {
                  label: l.trans({ en: "Route group", ko: "라우트 그룹" }),
                  file: "(user)",
                  result: "not in URL",
                  desc: l.trans({
                    en: "Parentheses organize files without adding a URL segment.",
                    ko: "괄호 폴더는 URL 세그먼트를 추가하지 않고 파일을 정리합니다.",
                  }),
                },
              ].map(({ label, file, result, desc }) => (
                <div key={label} className="rounded-xl border border-base-300 bg-base-200 p-4">
                  <div className="text-base-content/60 text-xs">{label}</div>
                  <div className="mt-2 break-all font-mono text-primary text-sm">{file}</div>
                  <div className="my-3 flex items-center gap-2 text-base-content/40 text-xs">
                    <div className="h-px flex-1 bg-base-300" />
                    <span>to</span>
                    <div className="h-px flex-1 bg-base-300" />
                  </div>
                  <div className="font-mono text-base-content text-sm">{result}</div>
                  <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1">
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
                  en: "Akan injects [lang] automatically.",
                  ko: "Akan이 [lang]을 자동으로 주입합니다.",
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
              <div key={title} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
                <span className="font-bold text-base-content">{title}: </span>

                <span className="text-base-content/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="file-convention" title={l.trans({ en: "File Convention", ko: "파일 컨벤션" })}>
        <Docs.Title>{l.trans({ en: "File Convention", ko: "파일 컨벤션" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A route file can be a page or a layout. _index.tsx renders the current segment, _layout.tsx wraps child segments, and route groups organize files without changing the URL.",
              ko: "라우트 파일은 page 또는 layout이 될 수 있습니다. _index.tsx는 현재 세그먼트를 렌더링하고, _layout.tsx는 하위 세그먼트를 감싸며, route group은 URL을 바꾸지 않고 파일을 정리합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="page/"
          language="bash"
          code={`page/
├── _layout.tsx
├── _index.tsx
├── (public)/
│   └── signin.tsx
│   └── signup.tsx
├── (user)/
│   └── project/
│       └── [projectId]/
│           ├── _layout.tsx
│           └── _index.tsx
└── robots.txt.tsx`}
        />
        <div className="space-y-1">
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-mono font-semibold text-primary">_index.tsx</div>
            <div className="mt-2 text-base-content/70 text-sm">
              {l.trans({
                en: "Page for the folder it lives in.",
                ko: "파일이 위치한 폴더 자체의 페이지입니다.",
              })}
            </div>
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-mono font-semibold text-primary">_layout.tsx</div>
            <div className="mt-2 text-base-content/70 text-sm">
              {l.trans({
                en: "Layout that wraps child pages below it.",
                ko: "아래에 있는 자식 페이지를 감싸는 레이아웃입니다.",
              })}
            </div>
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-mono font-semibold text-primary">(group)</div>
            <div className="mt-2 text-base-content/70 text-sm">
              {l.trans({
                en: "Organizes files without adding a URL segment.",
                ko: "URL 세그먼트를 추가하지 않고 파일을 정리합니다.",
              })}
            </div>
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-mono font-semibold text-primary">&lt;path&gt;.tsx</div>
            <div className="mt-2 text-base-content/70 text-sm">
              {l.trans({
                en: "Single-file page for a path segment. project.tsx becomes /:lang/project.",
                ko: "경로 세그먼트를 파일 하나로 선언하는 페이지입니다. project.tsx는 /:lang/project가 됩니다.",
              })}
            </div>
          </div>
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="font-mono font-semibold text-primary">[&lt;param&gt;].tsx</div>
            <div className="mt-2 text-base-content/70 text-sm">
              {l.trans({
                en: "Single-file dynamic page. [projectId].tsx becomes /:lang/:projectId.",
                ko: "동적 경로를 파일 하나로 선언하는 페이지입니다. [projectId].tsx는 /:lang/:projectId가 됩니다.",
              })}
            </div>
          </div>
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="page-module" title={l.trans({ en: "Page File Shape", ko: "페이지 파일 구성" })}>
        <Docs.Title>{l.trans({ en: "Page File Shape", ko: "페이지 파일 구성" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A page file must export a default component. It can also export optional helpers for page options, metadata, and loading UI.",
              ko: "페이지 파일은 반드시 default component를 export해야 합니다. 필요하면 페이지 옵션, 메타데이터, 로딩 UI를 위한 export를 함께 사용할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="page/(user)/project/[projectId]/_index.tsx"
          code={`import type { GenerateMetadata, PageConfig } from "akanjs/client";

interface PageProps {
  params: { lang: string; projectId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default function Page({ params }: PageProps) {
  return <div>Project {params.projectId}</div>;
}

export const pageConfig = { transition: "stack" } satisfies PageConfig;

export const generateMetadata = (({ params }) => ({
  title: \`Project \${params.projectId}\`,
  description: "Project workspace",
})) satisfies GenerateMetadata;

export function Loading() {
  return <div>Loading...</div>;
}`}
        />
        <Code.Snippet
          title="Static metadata example"
          code={`import type { AkanMetadata } from "akanjs/client";

export const metadata = {
  title: "Projects",
  description: "Browse your projects",
  openGraph: { title: "Projects", images: ["/og/projects.png"] },
  twitter: { card: "summary_large_image", images: ["/og/projects.png"] },
  alternates: {
    canonical: "https://example.com/projects",
    languages: {
      ko: "https://example.com/ko/projects",
      en: "https://example.com/en/projects",
    },
  },
} satisfies AkanMetadata;`}
        />
        <div className="space-y-1">
          {[
            {
              name: "default",
              desc: l.trans({
                en: "The page component. This is required.",
                ko: "페이지 컴포넌트입니다. 반드시 필요합니다.",
              }),
            },
            {
              name: "pageConfig",
              desc: l.trans({
                en: "Optional override for client frame behavior. If omitted, Akan applies platform defaults and frame components such as Navbar or BottomInset register their own insets.",
                ko: "클라이언트 frame 동작을 위한 선택적 override입니다. 생략하면 Akan이 플랫폼 기본값을 적용하고 Navbar, BottomInset 같은 frame 컴포넌트가 필요한 inset을 자동 등록합니다.",
              }),
            },
            {
              name: "metadata",
              desc: l.trans({
                en: "Declarative static metadata for title, description, robots, Open Graph, Twitter, canonical, and language alternates.",
                ko: "title, description, robots, Open Graph, Twitter, canonical, language alternate를 선언하는 정적 메타데이터입니다.",
              }),
            },
            {
              name: "generateMetadata",
              desc: l.trans({
                en: "Dynamic declarative metadata that can use route params and search params.",
                ko: "라우트 파라미터와 검색 파라미터를 사용할 수 있는 동적 선언형 메타데이터입니다.",
              }),
            },
            {
              name: "head / generateHead",
              desc: l.trans({
                en: "Escape hatch for custom JSX head elements when declarative metadata is not enough.",
                ko: "선언형 metadata로 충분하지 않을 때 직접 JSX head element를 넣는 escape hatch입니다.",
              }),
            },
            {
              name: "Loading",
              desc: l.trans({
                en: "Fallback UI shown while the page is loading.",
                ko: "페이지가 로딩되는 동안 보여줄 대체 UI입니다.",
              }),
            },
          ].map(({ name, desc }) => (
            <div key={name} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
              <div className="font-mono font-semibold text-primary">{name}</div>
              <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
            </div>
          ))}
        </div>
        <Docs.Alert type="info">
          {l.trans({
            en: "Use one metadata API per route module: metadata or generateMetadata. Do not mix metadata/generateMetadata with head/generateHead. Metadata is not merged across layouts and pages; the nearest route module wins.",
            ko: "라우트 모듈 하나에서는 metadata 또는 generateMetadata 중 하나만 사용합니다. metadata/generateMetadata와 head/generateHead를 섞지 마세요. metadata는 layout과 page 사이에서 병합되지 않고 가장 가까운 라우트 모듈의 설정 하나만 적용됩니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="layout-module" title={l.trans({ en: "Layout File Shape", ko: "레이아웃 파일 구성" })}>
        <Docs.Title>{l.trans({ en: "Layout File Shape", ko: "레이아웃 파일 구성" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A layout file wraps child pages. Use it for shared headers, tabs, sidebars, guards, or page-level shells.",
              ko: "레이아웃 파일은 하위 페이지를 감쌉니다. 공통 헤더, 탭, 사이드바, 접근 제어, 페이지 껍데기 같은 UI를 둘 때 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="page/(user)/project/[projectId]/_layout.tsx"
          code={`interface LayoutProps {
  children: React.ReactNode;
  params: { projectId: string };
}

export default function Layout({ children, params }: LayoutProps) {
  return (
    <section>
      <nav>Project {params.projectId}</nav>
      {children}
    </section>
  );
}

export function Loading() {
  return <div>Loading project...</div>;
}

export function NotFound({ pathname }: { pathname: string }) {
  return <div>Project route not found: {pathname}</div>;
}

export function Error({ error }: { error?: unknown }) {
  return <div>Project failed to render.</div>;
}`}
        />
        <div>
          {l.trans({
            en: "Layouts support default, metadata, generateMetadata, head, generateHead, Loading, NotFound, and Error. Layout metadata is used for child pages without their own metadata/head declaration, and the nearest layout fallback renders when a child route is missing or fails.",
            ko: "레이아웃은 default, metadata, generateMetadata, head, generateHead, Loading, NotFound, Error를 지원합니다. 자체 metadata/head 선언이 없는 child page에는 layout metadata가 사용되고, 하위 라우트를 찾지 못하거나 렌더링에 실패하면 가장 가까운 layout fallback이 렌더링됩니다.",
          })}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {[
            {
              name: "NotFound",
              desc: l.trans({
                en: "Layout-scoped 404 UI. It renders under the layout when a child route is missing or router.notFound() is called below it.",
                ko: "레이아웃 범위의 404 UI입니다. 하위 라우트를 찾지 못하거나 해당 layout 아래에서 router.notFound()가 호출되면 layout 안에서 렌더링됩니다.",
              }),
            },
            {
              name: "Error",
              desc: l.trans({
                en: "Layout-scoped server render error UI. It renders under the nearest layout when a child route throws during SSR.",
                ko: "레이아웃 범위의 서버 렌더링 에러 UI입니다. 하위 라우트가 SSR 중 에러를 던지면 가장 가까운 layout 안에서 렌더링됩니다.",
              }),
            },
          ].map(({ name, desc }) => (
            <div key={name} className="rounded-xl border border-base-300 bg-base-100 px-4 py-3">
              <div className="font-mono font-semibold text-primary">{name}</div>
              <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
            </div>
          ))}
        </div>
        <Docs.Alert type="info">
          {l.trans({
            en: "Custom NotFound and Error exports are available on _layout.tsx files, not page files. If a layout does not export one, Akan walks up to the nearest parent layout fallback, then falls back to the framework system page.",
            ko: "커스텀 NotFound와 Error export는 page 파일이 아니라 _layout.tsx 파일에서 사용할 수 있습니다. 해당 layout에 fallback이 없으면 Akan은 가장 가까운 상위 layout fallback을 찾고, 없으면 framework system page를 사용합니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <div className="divider" />

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
          title="apps/myapp/akan.config.ts"
          code={`const config = {
  routes: [
    { domains: { main: ["manager.myapp.com"] }, basePath: "manager" },
    { domains: { main: ["admin.myapp.com"] }, basePath: "admin" },
  ],
};`}
        />
        <Code.Snippet
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
      <div className="divider" />

      <Scroll.Slide id="root-layout-exports" title={l.trans({ en: "Root Layout Exports", ko: "Root Layout Exports" })}>
        <Docs.Title>{l.trans({ en: "Root Layout Exports", ko: "Root Layout Exports" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The root _layout.tsx can configure app-wide behavior. It is still a layout, but it may also export extra values for fonts, manifest, theme, realtime connection, analytics, and mobile-style rendering.",
              ko: "root _layout.tsx는 앱 전체의 동작을 설정할 수 있습니다. 기본적으로는 layout이지만, font, manifest, theme, realtime connection, analytics, mobile-style rendering 같은 앱 공통 설정을 추가로 export할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="page/_layout.tsx"
          code={`import type { Font, LayoutProps, WebAppManifest } from "akanjs/client";

export const fonts: Font[] = [
  {
    name: "pretendard",
    faces: [{ src: "/fonts/pretendard.woff2", weight: "400" }],
  },
];

export const manifest: WebAppManifest = {
  name: "Akan App",
  shortName: "Akan",
  startUrl: "/",
  display: "standalone",
  themeColor: "#111827",
};

export const theme = "dark";
export const reconnect = true;
export const wsConnect = true;
export const layoutStyle = "web";
export const gaTrackingId = "G-XXXXXXXXXX";

export default function Layout({ children }: LayoutProps) {
  return <>{children}</>;
}`}
        />
        <div className="space-y-1">
          {[
            {
              name: "fonts",
              desc: l.trans({
                en: "Registers app-wide fonts so pages can use them consistently.",
                ko: "앱 전체에서 사용할 폰트를 등록합니다.",
              }),
            },
            {
              name: "manifest",
              desc: l.trans({
                en: "Defines the web app manifest used for installable/PWA-like behavior.",
                ko: "설치형 앱이나 PWA에 가까운 동작에 사용하는 웹 앱 manifest를 정의합니다.",
              }),
            },
            {
              name: "theme",
              desc: l.trans({
                en: "Chooses the default theme policy, such as dark, light, system, or css.",
                ko: "dark, light, system, css 같은 기본 테마 정책을 정합니다.",
              }),
            },
            {
              name: "reconnect",
              desc: l.trans({
                en: "Controls whether the client tries to reconnect to realtime runtime channels.",
                ko: "클라이언트가 실시간 런타임 채널에 다시 연결할지 정합니다.",
              }),
            },
            {
              name: "wsConnect",
              desc: l.trans({
                en: "Controls whether the browser connects the client WebSocket runtime after load. The default is true. If false, message/pubsub calls warn in the browser console until fetch.instance.connect() is called.",
                ko: "브라우저 로드 후 client WebSocket runtime을 연결할지 정합니다. 기본값은 true입니다. false이면 fetch.instance.connect()를 호출하기 전 message/pubsub 호출 시 브라우저 콘솔에 warning이 표시됩니다.",
              }),
            },
            {
              name: "layoutStyle",
              desc: l.trans({
                en: "Switches the outer page container style. Use mobile for app-like mobile shells.",
                ko: "바깥 페이지 컨테이너 스타일을 바꿉니다. 앱 같은 모바일 화면에는 mobile을 사용합니다.",
              }),
            },
            {
              name: "pageConfig",
              desc: l.trans({
                en: "Optional layout-level frame override inherited by child pages. Page-level pageConfig still wins for explicitly declared fields.",
                ko: "하위 페이지가 상속하는 layout 단위 frame override입니다. 명시된 필드는 page 단위 pageConfig가 우선합니다.",
              }),
            },
            {
              name: "gaTrackingId",
              desc: l.trans({
                en: "Adds Google Analytics tracking for the app.",
                ko: "앱에 Google Analytics 추적을 추가합니다.",
              }),
            },
          ].map(({ name, desc }) => (
            <div key={name} className="rounded-xl border border-base-300 bg-base-100 px-4 py-0">
              <div className="font-mono font-semibold text-primary">{name}</div>
              <div className="mt-2 text-base-content/70 text-sm">{desc}</div>
            </div>
          ))}
        </div>
        <Docs.Alert type="info">
          {l.trans({
            en: "Most extra exports are for root layouts only. Nested layouts may also export pageConfig when they need a shared mobile frame override for their child pages.",
            ko: "대부분의 추가 export는 root layout 전용입니다. 다만 중첩 layout도 하위 페이지에 공통 모바일 frame override가 필요하면 pageConfig를 export할 수 있습니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
