import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="quick-start" title={l.trans({ en: "Quick Start", ko: "시작하기" })}>
        <Docs.Title>{l.trans({ en: "Quick Start", ko: "시작하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "This guide gets you from an empty directory to a running Akan application.",
              ko: "이 가이드는 빈 디렉터리에서 실행 중인 Akan 애플리케이션까지 안내합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Along the way, you will see the Akan way: describe business intent once, then let conventions connect pages, APIs, services, stores, data, and deployment surfaces.",
              ko: "그 과정에서 Akan 방식도 함께 보게 됩니다. 비즈니스 의도를 한 번 설명하면 컨벤션이 page, API, service, store, data, deployment surface를 연결합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan.js is monorepo-native. App execution, production builds, library development, and package management all happen from the workspace root.",
              ko: "Akan.js는 monorepo 구조를 기본으로 합니다. 앱 실행부터 production build, library 개발, package 관리까지 모두 workspace root에서 실행하고 운영합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "After reading this guide, you will know how to create a workspace, start the local runtime, find the first files to edit, and build the app for production.",
              ko: "이 가이드를 읽고 나면 workspace 생성, local runtime 실행, 엔트리 파일을 확인, production build까지 알 수 있습니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="requirements" title={l.trans({ en: "Requirements", ko: "요구사항" })}>
        <Docs.Title>{l.trans({ en: "Requirements", ko: "요구사항" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "For the first run, Bun is the only required dependency. Docker and native IDEs become useful when you add local services or mobile builds.",
              ko: "첫 실행에는 Bun만 있으면 됩니다. Docker와 네이티브 IDE는 로컬 서비스나 모바일 빌드를 추가할 때 필요해집니다.",
            })}
          </div>
          <div className="flex flex-col gap-1 p-4 font-medium">
            <div>
              <input className="checkbox" type="checkbox" checked readOnly />{" "}
              {l.trans({ en: "Bun 1.3.13 or higher", ko: "Bun 1.3.13 이상" })}
            </div>
            <div>
              <input className="checkbox" type="checkbox" checked={false} readOnly />{" "}
              {l.trans({ en: "Docker for local database services", ko: "로컬 데이터 서비스 실행을 위한 Docker" })}
            </div>
            <div>
              <input className="checkbox" type="checkbox" checked={false} readOnly />{" "}
              {l.trans({
                en: "Android Studio or Xcode for native app builds",
                ko: "네이티브 앱 빌드를 위한 Android Studio 또는 Xcode",
              })}
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="create-workspace" title={l.trans({ en: "Create a Workspace", ko: "워크스페이스 생성" })}>
        <Docs.Title>{l.trans({ en: "Create a Workspace", ko: "워크스페이스 생성" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Start with the workspace creator. It asks a few questions, then lays out the monorepo conventions Akan uses for apps, libraries, pages, and domain modules.",
              ko: "workspace creator로 시작하세요. 몇 가지 질문에 답하면 Akan이 app, library, page, domain module에 사용하는 모노레포 컨벤션을 구성합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Run terminal commands without copying the leading prompt symbol.",
              ko: "터미널 명령어를 복사할 때는 앞의 프롬프트 기호를 제외하고 실행하세요.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet className="w-full" title="Terminal" language="bash" code="bunx create-akan-workspace" />
        <Docs.Description>
          <div>
            {l.trans({
              en: "If you prefer a globally installed CLI, the same lifecycle is available through the akan command.",
              ko: "전역 설치된 CLI를 선호한다면 같은 작업 흐름을 akan 명령으로 사용할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="Terminal"
          language="bash"
          code={`bun install -g @akanjs/cli
akan create-workspace myorg --app myapp
cd myorg`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="run-app" title={l.trans({ en: "Run the App", ko: "앱 실행" })}>
        <Docs.Title>{l.trans({ en: "Run the App", ko: "앱 실행" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Start the local Akan runtime with one command. It scans the workspace, reads the conventions, prepares generated artifacts, and opens the app.",
              ko: "하나의 명령으로 local Akan runtime을 시작합니다. 워크스페이스를 스캔하고, 컨벤션을 읽고, 생성 산출물을 준비한 뒤 앱을 엽니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet className="w-full" title="Terminal" language="bash" code="akan start myapp --open" />
        <Docs.Description>
          <div>
            {l.trans({
              en: "By default, the local gateway listens on http://localhost:8282. Pages, API calls, WebSocket traffic, and generated assets all flow through this runtime.",
              ko: "local gateway는 기본적으로 http://localhost:8282 에서 실행됩니다. page, API call, WebSocket traffic, generated asset이 모두 이 runtime을 통해 흐릅니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.Description>
          {l.trans({
            en: "Now the app is running through the Akan gateway. Edit a page and the same workspace can serve web, app-oriented client surfaces, API traffic, realtime traffic, and generated assets.",
            ko: "이제 앱은 Akan gateway를 통해 실행됩니다. 페이지를 수정하면 같은 워크스페이스에서 web, app-oriented client surface, API traffic, realtime traffic, generated asset을 함께 제공합니다.",
          })}
        </Docs.Description>

        <Docs.SubTitle>
          {l.trans({
            en: "Edit a page",
            ko: "페이지 수정하기",
          })}
        </Docs.SubTitle>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan pages live under apps/<app>/page. Index pages use the _index.tsx convention, so the first screen of myapp is apps/myapp/page/_index.tsx.",
              ko: "Akan page는 apps/<app>/page 아래에 위치합니다. index page는 _index.tsx 컨벤션을 사용하므로 myapp의 첫 화면은 apps/myapp/page/_index.tsx입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Change the component and refresh the local gateway to confirm your first UI change.",
              ko: "컴포넌트를 수정한 뒤 local gateway를 새로고침해 첫 UI 변경을 확인하세요.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="apps/myapp/page/_index.tsx"
          code={`
export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center text-2xl">
      Hello Akan.js! 🎉
    </div>
  );
}
      `}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "Open http://localhost:8282 to see the page through the Akan gateway.",
              ko: "http://localhost:8282 를 열어 Akan gateway를 통해 페이지를 확인합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The runtime uses the same page convention for the surfaces Akan builds, so you work in one page tree instead of maintaining separate client projects.",
              ko: "Akan runtime은 생성하는 surface에 같은 page 컨벤션을 사용합니다. 따라서 분리된 client project를 따로 유지하지 않고 하나의 page tree에서 작업합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="w-full justify-center gap-4 sm:flex">
          <div className="mockup-browser w-full border-2 border-base-content/30 bg-base-100">
            <div className="mockup-browser-toolbar">
              <div className="input">http://localhost:8282</div>
            </div>
            <div className="flex h-80 place-content-center items-center justify-center text-2xl">Hello Akan.js! 🎉</div>
          </div>

          <div className="relative hidden h-96 w-80 sm:block">
            <div className="mockup-phone absolute -translate-x-1/4 -translate-y-1/4 scale-50">
              <div className="mockup-phone-camera"></div>
              <div className="mockup-phone-display flex items-center justify-center bg-base-100 px-4 text-center text-4xl">
                Hello Akan.js! 🎉
              </div>
            </div>
          </div>
        </div>

        <div className="h-12" />

        <Docs.SubTitle>
          {l.trans({
            en: "Know the app entry",
            ko: "앱 엔트리 이해하기",
          })}
        </Docs.SubTitle>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The generated main.ts starts the Akan runtime. Most application work happens in pages and domain modules, so you rarely need to edit this file.",
              ko: "생성된 main.ts는 Akan runtime을 시작합니다. 대부분의 애플리케이션 작업은 page와 domain module에서 이루어지므로 이 파일을 자주 수정할 필요는 없습니다.",
            })}
          </div>
        </Docs.Description>
        <div className="flex flex-col gap-2">
          <Code.Snippet
            title="apps/myapp/main.ts"
            code={`
import { AkanApp } from "akanjs/server";

const run = async () => {
  await new AkanApp().start();
};

void run();
`}
          />
          <Docs.Description>
            <div>
              {l.trans({
                en: "When akan start is running, the terminal shows the local runtime status. Use the gateway URL for pages and generated runtime surfaces.",
                ko: "akan start가 실행 중이면 터미널에서 local runtime 상태를 확인할 수 있습니다. page와 generated runtime surface는 gateway URL에서 확인합니다.",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            language="bash"
            title="Terminal"
            showLineNumbers={false}
            code={`
...
...
[AkanApp] INFO  AkanApp gateway is running on port 8282 +7ms
...
...`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="build" title={l.trans({ en: "Build", ko: "빌드" })}>
        <Docs.Title>{l.trans({ en: "Build", ko: "빌드" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When the app is ready to ship, build it with the same conventions. Akan generates the server artifact, route manifests, client entries, static assets, and package metadata needed for production.",
              ko: "앱을 배포할 준비가 되면 같은 컨벤션으로 빌드합니다. Akan은 production에 필요한 server artifact, route manifest, client entry, static asset, package metadata를 생성합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet className="w-full" title="Terminal" language="bash" code="akan build myapp" />
        <div>
          {l.trans({
            en: "The production build result is generated in the dist/apps/myapp directory.",
            ko: "dist/apps/myapp 디렉터리에 production build 결과가 생성됩니다.",
          })}
        </div>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
