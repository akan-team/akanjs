import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "PWA", ko: "PWA" })}>
        <Docs.Title>{l.trans({ en: "PWA", ko: "PWA" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A PWA, or Progressive Web App, is a web app that can feel closer to an installed app. It still runs through the browser, but it can use install metadata, app icons, standalone display, and other browser features to create a more app-like experience.",
              ko: "PWA(Progressive Web App)는 설치된 앱에 가까운 경험을 줄 수 있는 web app입니다. 여전히 browser 위에서 실행되지만, 설치 metadata, app icon, standalone 표시 방식, 여러 browser 기능을 사용해 더 앱다운 경험을 만들 수 있습니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Use it when users repeatedly open the same web app and benefit from a home-screen or desktop launcher.",
                ko: "사용자가 같은 web app을 자주 열고, 홈 화면이나 desktop launcher에서 바로 실행하면 편한 경우에 사용합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "It is useful for admin tools, field-work apps, internal dashboards, lightweight commerce apps, and content apps.",
                ko: "Admin tool, 현장 업무 앱, 내부 dashboard, 가벼운 commerce 앱, content 앱에 유용합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Start PWA support by telling the browser what your app is: its name, icon, start URL, display mode, and colors.",
                ko: "PWA 지원은 browser에게 앱의 이름, icon, 시작 URL, 표시 방식, 색상을 알려주는 것에서 시작합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="when-to-use" title={l.trans({ en: "When To Use PWA", ko: "PWA를 쓰기 좋은 경우" })}>
        <Docs.Title>{l.trans({ en: "When To Use PWA", ko: "PWA를 쓰기 좋은 경우" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Think of PWA as a way to make a web app easier to return to. It is not a replacement for every native app, but it is a strong first choice when web deployment speed matters and the app does not need deep device-specific APIs.",
              ko: "PWA는 web app에 다시 들어오기 쉽게 만드는 방법으로 이해하면 좋습니다. 모든 native app을 대체하는 것은 아니지만, web 배포 속도가 중요하고 깊은 device 전용 API가 필요하지 않은 앱에는 좋은 첫 선택입니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Good fit: users need quick access to the same workflow every day, such as office tasks, approvals, reports, or checklists.",
                ko: "잘 맞는 경우: office 업무, 승인, 보고서, checklist처럼 사용자가 매일 같은 workflow에 빠르게 접근해야 합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Good fit: you want one deployed web app to cover desktop and mobile without app-store distribution first.",
                ko: "잘 맞는 경우: app store 배포보다 먼저 하나의 배포된 web app으로 desktop과 mobile을 함께 지원하고 싶습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Be careful: if the product depends on deep native features, heavy background work, or strict app-store presence, plan a native wrapper or native app too.",
                ko: "주의할 경우: 깊은 native 기능, 무거운 background 작업, 엄격한 app-store 존재감이 핵심이라면 native wrapper나 native app도 함께 계획하세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="static-manifest" title={l.trans({ en: "Static Manifest File", ko: "정적 manifest 파일" })}>
        <Docs.Title>{l.trans({ en: "Static Manifest File", ko: "정적 manifest 파일" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use this when you already have a `manifest.json` file or want to edit the exact JSON that the browser reads.",
              ko: "이미 `manifest.json` 파일이 있거나 browser가 읽는 JSON을 직접 관리하고 싶다면 이 방식을 사용하세요.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
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
        <Code.Snippet
          title="apps/myapp/page/_layout.tsx"
          code={`import type { LayoutProps } from "akanjs/client";

export const head = (
  <>
    <title>My Akan App</title>
    <link rel="icon" href="/favicon.ico" />
    <link rel="manifest" href="/manifest.json" />
  </>
);

export default function Layout({ children }: LayoutProps) {
  return <>{children}</>;
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="layout-manifest"
        title={l.trans({ en: "Layout Manifest Object", ko: "Layout manifest object" })}
      >
        <Docs.Title>{l.trans({ en: "Layout Manifest Object", ko: "Layout manifest object" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan can also read a `manifest` export from the root layout. The object is converted into a manifest link for the document head.",
              ko: "Akan은 root layout에서 export한 `manifest`도 읽을 수 있습니다. 이 object는 document head의 manifest link로 변환됩니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Write author-facing keys in camelCase, such as `shortName`, `startUrl`, and `themeColor`.",
                ko: "`shortName`, `startUrl`, `themeColor`처럼 작성하기 편한 camelCase key를 사용합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Akan converts them to standard manifest keys like `short_name`, `start_url`, and `theme_color`.",
                ko: "Akan이 이를 `short_name`, `start_url`, `theme_color` 같은 표준 manifest key로 변환합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "This is convenient when the manifest belongs to app code instead of a standalone JSON file.",
                ko: "Manifest를 독립 JSON 파일보다 app code와 함께 관리하고 싶을 때 편합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
        <Code.Snippet
          title="apps/myapp/page/_layout.tsx"
          code={`import type { LayoutProps, WebAppManifest } from "akanjs/client";

export const manifest: WebAppManifest = {
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
};

export const head = <title>My Akan App</title>;

export default function Layout({ children }: LayoutProps) {
  return <>{children}</>;
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="assets" title={l.trans({ en: "Required Assets", ko: "필수 asset" })}>
        <Docs.Title>{l.trans({ en: "Required Assets", ko: "필수 asset" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Before testing installation, make sure every URL in the manifest is reachable from the deployed app.",
              ko: "설치 테스트 전에 manifest 안의 모든 URL이 배포된 app에서 접근 가능한지 확인하세요.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "`/icon-192x192.png` and `/icon-512x512.png` are good first icon sizes for browser install prompts.",
                ko: "`/icon-192x192.png`와 `/icon-512x512.png`는 browser 설치 prompt를 위한 첫 icon 크기로 좋습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`startUrl` is the page that opens when the installed app starts.",
                ko: "`startUrl`은 설치된 앱을 열 때 처음 표시되는 page입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`scope` limits which URLs belong to the installed app window.",
                ko: "`scope`는 설치된 app window에 속하는 URL 범위를 제한합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: '`display: "standalone"` makes the app open without the normal browser toolbar.',
                ko: '`display: "standalone"`은 앱을 일반 browser toolbar 없이 열리게 합니다.',
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Start with one simple manifest, then add screenshots, categories, or shortcuts after installation works.",
                ko: "처음에는 단순한 manifest 하나로 시작하고, 설치가 동작한 뒤 screenshots, categories, shortcuts를 추가하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "If your app is served under a base path, set `startUrl` and `scope` to that path instead of `/`.",
                ko: "앱이 base path 아래에서 제공된다면 `startUrl`과 `scope`를 `/` 대신 그 경로로 설정하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use the static JSON file when designers or operators need to review the manifest directly.",
                ko: "Designer나 operator가 manifest를 직접 확인해야 한다면 정적 JSON 파일 방식을 사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use the layout object when you want TypeScript help and app metadata in one place.",
                ko: "TypeScript 도움을 받고 app metadata를 한곳에서 관리하고 싶다면 layout object 방식을 사용하세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
