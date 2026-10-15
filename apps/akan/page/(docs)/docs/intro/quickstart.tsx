import { usePage } from "@apps/akan/client";
import { BrowserMockup, Code, Divider, Docs, DocsToc, MobileMockup, Start } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "소개: 시작하기 | Akan.js" : "Introduction: Quick Start | Akan.js";
    const description =
      lang === "ko"
        ? "빈 디렉터리에서 실행 중인 앱까지. 워크스페이스를 만들고, 띄우고, 페이지를 고치고, 빌드합니다."
        : "From an empty directory to a running app: create a workspace, start it, edit a page and build it.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .render(() => {
    const { l } = usePage();
    return (
      <Scroll>
        <Scroll.Slide id="quick-start" title={l.trans({ en: "Quick Start", ko: "시작하기" })}>
          <Docs.Title>{l.trans({ en: "Quick Start", ko: "시작하기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Akan.js is a full-stack TypeScript framework that prioritizes designing and implementing actual business code.",
                ko: "Akan.js는 실제 비즈니스를 코드로 설계하고 구현하는 것을 최우선으로 하는 풀스택 TypeScript 프레임워크입니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "You can build a type-safe service with minimal code and deploy it to web, mobile, server, and DB infrastructure at the same time.",
                ko: "최소한의 코드로 타입 안전한 서비스를 만들어 웹, 모바일, 서버, DB 인프라에 동시에 배포할 수 있습니다.",
              })}
            </div>
            <div>
              {l.trans({
                en: "This guide takes you from an empty directory to a running app.",
                ko: "이 가이드는 빈 디렉터리에서 실행 중인 앱까지 안내합니다.",
              })}
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="requirements" title={l.trans({ en: "Requirements", ko: "요구사항" })}>
          <Docs.Title>{l.trans({ en: "Requirements", ko: "요구사항" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Bun is the only required dependency for the first run.",
                ko: "첫 실행에는 Bun만 있으면 됩니다.",
              })}
            </div>
            <div className="flex flex-col gap-1 p-4 font-medium">
              <div>
                <input className="size-4 rounded border border-input accent-primary" type="checkbox" checked readOnly />{" "}
                {l.trans({ en: "Bun 1.4.0 or higher", ko: "Bun 1.4.0 이상" })}
              </div>
              <div>
                <input
                  className="size-4 rounded border border-input accent-primary"
                  type="checkbox"
                  checked={false}
                  readOnly
                />{" "}
                {l.trans({ en: "Git for source code management", ko: "소스코드 관리를 위한 Git" })}
              </div>
              <div>
                <input
                  className="size-4 rounded border border-input accent-primary"
                  type="checkbox"
                  checked={false}
                  readOnly
                />{" "}
                {l.trans({
                  en: "Android Studio or Xcode for native app builds",
                  ko: "네이티브 앱 빌드를 위한 Android Studio 또는 Xcode",
                })}
              </div>
            </div>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="create-workspace" title={l.trans({ en: "Create a Workspace", ko: "워크스페이스 생성" })}>
          <Docs.Title>{l.trans({ en: "Create a Workspace", ko: "워크스페이스 생성" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "The quickest way is to let your coding agent do it. Open Claude Code or Codex in an empty directory and paste this prompt. It checks Bun, creates the workspace and starts the app:",
                ko: "가장 빠른 방법은 코딩 에이전트에게 맡기는 것입니다. 빈 디렉터리에서 Claude Code나 Codex를 열고 이 프롬프트를 붙여 넣으세요. Bun을 확인하고 워크스페이스를 만든 뒤 앱까지 띄웁니다:",
              })}
            </div>
          </Docs.Description>
          <Start.Prompt className="my-3 w-full" />
          <Docs.Description>
            <div>
              {l.trans({
                en: "To create it yourself, run the workspace creator. It asks for a workspace name and an app name:",
                ko: "직접 만들려면 workspace creator를 실행합니다. 워크스페이스 이름과 앱 이름을 묻습니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet className="w-full" title="Terminal" language="bash" code="bunx create-akan-workspace" />
          <Docs.Description>
            <div>
              {l.trans({
                en: "Or use the globally installed akan command:",
                ko: "또는 전역 설치된 akan 명령을 사용합니다:",
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
        <Divider />

        <Scroll.Slide id="run-app" title={l.trans({ en: "Run the App", ko: "앱 실행" })}>
          <Docs.Title>{l.trans({ en: "Run the App", ko: "앱 실행" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Start the app with one command:",
                ko: "명령 하나로 앱을 시작합니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet className="w-full" title="Terminal" language="bash" code="akan start myapp --open" />
          <Docs.Description>
            <div>
              {l.trans({
                en: "The app opens on http://localhost:8282. The dev port is 8282 plus the app's index in alphabetical order, so the only app is 8282.",
                ko: "앱은 http://localhost:8282 에서 열립니다. 개발 포트는 8282에 앱 이름의 알파벳순 인덱스를 더한 값이라, 앱이 하나면 8282입니다.",
              })}
            </div>
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
                en: "Akan pages live under apps/<app>/page. Edit the first screen and refresh:",
                ko: "Akan page는 apps/<app>/page 아래에 있습니다. 첫 화면을 수정하고 새로고침합니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/page/_index.tsx"
            code={`
import { page } from "akanjs/client";

export default page().render(() => {
  return (
    <div className="flex min-h-screen items-center justify-center text-2xl">
      Hello Akan.js! 🎉
    </div>
  );
});
      `}
          />
          <div className="w-full justify-center gap-4 sm:flex">
            <BrowserMockup>Hello Akan.js! 🎉</BrowserMockup>

            <MobileMockup className="hidden self-center sm:block">
              <span className="text-lg">Hello Akan.js! 🎉</span>
            </MobileMockup>
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
                en: "The generated main.ts starts the Akan runtime.",
                ko: "생성된 main.ts가 Akan runtime을 시작합니다.",
              })}
            </div>
          </Docs.Description>
          <div className="flex flex-col gap-2">
            <Code.Snippet
              className="w-full"
              title="apps/myapp/main.ts"
              code={`
import { AkanApp } from "akanjs/server/akanApp";

const run = async () => {
  await new AkanApp().start();
};

void run();
`}
            />
            <Docs.Description>
              <div>
                {l.trans({
                  en: "The terminal shows the local runtime status.",
                  ko: "터미널에서 local runtime 상태를 확인할 수 있습니다.",
                })}
              </div>
            </Docs.Description>
            <Code.Snippet
              className="w-full"
              language="bash"
              title="Terminal"
              showLineNumbers={false}
              code={`
...
...
[AkanApp] INFO  AkanApp gateway is running on port http://localhost:8282 +7ms
...
...`}
            />
          </div>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="build" title={l.trans({ en: "Build", ko: "빌드" })}>
          <Docs.Title>{l.trans({ en: "Build", ko: "빌드" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "Build the app for production:",
                ko: "production build를 실행합니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet className="w-full" title="Terminal" language="bash" code="akan build myapp" />
          <div>
            {l.trans({
              en: "The result is generated in the dist/apps/myapp directory.",
              ko: "결과물은 dist/apps/myapp 디렉터리에 생성됩니다.",
            })}
          </div>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
