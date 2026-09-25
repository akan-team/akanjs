import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="quickstart" title={l.trans({ en: "Quick Start", ko: "시작하기" })}>
        <div className="mb-8 border-base-content">
          <h1 className="font-extrabold text-2xl lg:text-4xl">{l.trans({ en: "Quick Start", ko: "시작하기" })}</h1>
        </div>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan.js is a full-stack TypeScript framework that prioritizes designing and implementing actual business code.",
              ko: "Akan.js는 실제 비즈니스를 코드로 설계하고 구현하는 것을 최우선으로 하는 풀스택 TypeScript 프레임워크입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "To achieve this, technical parts are abstracted as much as possible so that developers do not need to implement them directly.",
              ko: "이를 위해 기술적인 부분들은 최대한 추상화되고, 개발자가 직접 구현하지 않아도 되도록 설계되었습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "You can build a type-safe service with minimal code and deploy it to web, mobile, server, and DB infrastructure at the same time.",
              ko: "최소한의 코드로 타입 안전한 서비스를 구축하고 웹, 모바일, 서버, DB인프라에 동시에 배포할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />
      <Scroll.Slide id="installation" title={l.trans({ en: "Installation", ko: "설치하기" })}>
        <Docs.Title>{l.trans({ en: "Installation", ko: "설치하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan.js can be installed with a simple command. Before installation, there's a few requirements.",
              ko: "Akan.js는 간단한 명령어로 설치할 수 있습니다. 설치 전 몇 가지 요구사항이 있습니다.",
            })}
          </div>
          <div>
            <div className="">{l.trans({ en: "System Requirements:", ko: "시스템 요구사항" })}</div>
            <div className="flex flex-col gap-1 p-4 font-medium">
              <div>
                <input className="checkbox" type="checkbox" checked readOnly />{" "}
                {l.trans({ en: "Node.js 20.x or higher", ko: "Node.js 20.x 이상" })}
              </div>
              <div>
                <input className="checkbox" type="checkbox" checked readOnly />{" "}
                {l.trans({ en: "pnpm 10.x or higher", ko: "pnpm 10.x 이상" })}
              </div>
              <div>
                <input className="checkbox" type="checkbox" checked readOnly />{" "}
                {l.trans({ en: "Docker", ko: "Docker" })}
              </div>
              <div>
                <input className="checkbox" type="checkbox" checked={false} readOnly />{" "}
                {l.trans({
                  en: "Android Studio (if you want to use Android)",
                  ko: "Android Studio (Android 사용 시)",
                })}
              </div>
              <div>
                <input className="checkbox" type="checkbox" checked={false} readOnly />{" "}
                {l.trans({ en: "Xcode (if you want to use iOS)", ko: "Xcode (iOS 사용 시)" })}
              </div>
            </div>
          </div>
        </Docs.Description>
        <h3 className="mb-2 pt-6 font-semibold text-base lg:text-lg">
          {l.trans({ en: "Create a new project", ko: "새 프로젝트 생성" })}
        </h3>
        <Docs.Description>
          {l.trans({
            en: "First, create a new project using the Akan.js CLI. To create a project, run the following command:",
            ko: "먼저 Akan.js CLI를 사용하여 새 프로젝트를 생성합니다. 프로젝트를 만들려면 다음 명령어를 실행하세요:",
          })}
        </Docs.Description>
        <Code.Snippet className="w-full" title="Terminal" language="bash" code="npx create-akan-workspace@1" />
        <div className="mt-2">
          {l.trans({
            en: "When you enter it, the following prompt will be displayed:",
            ko: "입력 시 다음과 같은 프롬프트가 표시됩니다:",
          })}
        </div>
        <Code.Snippet
          className="w-full"
          title="Terminal"
          language="bash"
          code={`what is the name of your organization?: # ex: myorg
describe your first application to create.: # ex: myapp
Do you want to install shared and util libraries? (admin, user file, etc.): # No (Recommended)`}
        />
        <h3 className="mt-8 mb-2 font-semibold text-base lg:text-lg">
          {l.trans({ en: "Run the development environment", ko: "개발 환경 실행" })}
        </h3>
        <Code.Snippet
          className="w-full"
          title="Terminal"
          language="bash"
          code="cd myorg && akan start myapp --open=true"
        />
      </Scroll.Slide>

      <div className="divider" />
      <Scroll.Slide id="execution" title={l.trans({ en: "Execution", ko: "실행하기" })}>
        <Docs.Title>{l.trans({ en: "Execution", ko: "실행하기" })}</Docs.Title>
        <Docs.Description>
          {l.trans({
            en: "Now, you can get Nextjs client, React client, and Nestjs Server.",
            ko: "이제 Nextjs 클라이언트, React 클라이언트, 그리고 Nestjs Server를 사용할 수 있습니다.",
          })}
        </Docs.Description>

        <Docs.SubTitle>
          {l.trans({
            en: "Client control",
            ko: "클라이언트 제어",
          })}
        </Docs.SubTitle>
        <Docs.Description>
          <div>
            {l.trans({
              en: "You can edit page with Next.js App Router interface. For example, you can edit the default page(/) as follows.",
              ko: "Next.js App Router 인터페이스로 페이지를 수정할 수 있습니다. 기본 페이지(/)를 수정하는 예시는 다음과 같습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "You can edit the default template to write Hello Akan.js as follows.",
              ko: "기본으로 생성된 템플릿을 수정하여 Hello Akan.js를 작성할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="apps/<my-app>/app/[lang]/page.tsx"
          code={`
export default function Page() {
  // You can edit page with Next.js interface.
  return (
    <div className="flex h-screen w-screen items-center justify-center text-2xl">
      Hello Akan.js! 🎉
    </div>
  );
}
      `}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "Next.js page is available at http://localhost:4200 and it works with server-side rendering, which is optimized for web-based operations.",
              ko: "Next.js 페이지는 http://localhost:4200에서 확인할 수 있습니다. 서버사이드 렌더링 방식으로 작동되며, 웹 기반 운영에 최적화된 방식으로 작동합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "React page is available at http://localhost:4201 and it works with client-side rendering, which is optimized for mobile app-based operations.  ",
              ko: "React 페이지는 http://localhost:4201에서 확인할 수 있습니다. 클라이언트사이드 렌더링 방식으로 작동되며, 모바일 앱 기반 운영에 최적화된 방식으로 작동합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="w-full justify-center gap-4 sm:flex">
          <div className="mockup-browser w-full border-2 border-base-content/30 bg-base-100">
            <div className="mockup-browser-toolbar">
              <div className="input">http://localhost:4200</div>
            </div>
            <div className="flex h-80 place-content-center items-center justify-center text-2xl">Hello Akan.js! 🎉</div>
          </div>

          <div className="relative hidden h-96 w-80 sm:block">
            <div className="mockup-phone absolute -translate-x-1/4 -translate-y-1/4 scale-50">
              <div className="mockup-phone-camera"></div>
              <div className="mockup-phone-display flex items-center justify-center bg-base-100 text-4xl">
                Hello Akan.js! 🎉
              </div>
            </div>
          </div>
        </div>

        <div className="h-12" />

        <Docs.SubTitle>
          {l.trans({
            en: "Server control",
            ko: "서버 제어",
          })}
        </Docs.SubTitle>
        <Docs.Description>
          <div>
            {l.trans({
              en: "You can edit the main.ts to log Hello Akan.js as follows. It is the entry point file for the Node.js server.",
              ko: "main.ts 코드를 수정하여 Hello Akan.js 로깅을 작성해봅니다. Node.js 서버가 실행되는 엔트리 포인트 파일입니다.",
            })}
          </div>
        </Docs.Description>
        <div className="flex flex-col gap-2">
          <Code.Snippet
            title="apps/<my-app>/main.ts"
            code={`
import { Logger } from "@akanjs/common";
import { createNestApp } from "@akanjs/server"; // [!code collapse:5]

import { env } from "./env/env.server";
import { registerMiddlewares, registerModules } from "./server";

const bootstrap = async () => {
  const serverMode = process.env.SERVER_MODE as "federation" | "batch" | "all" | null; // [!code collapse:3]
  if (!serverMode) throw new Error("SERVER_MODE environment variable is not defined");
  await createNestApp({ registerModules, registerMiddlewares, serverMode, env });
  Logger.info("Hello Akan.js! 🎉");
};
void bootstrap();
`}
          />
          <Docs.Description>
            <div>
              {l.trans({
                en: "Nest.js server is running at http://localhost:8080. You can see the log in the terminal.",
                ko: "Nest.js 서버가 실행되며 http://localhost:8080에서 작동합니다. 터미널에서 로그가 표시되는 것을 확인할 수 있습니다.",
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
[Backend] 33852 - 06/22/2025, 14:54:36 PM     LOG  🚀 Server is running on: http://[::1]:8080 +3579ms
[App] 33852 - 06/22/2025, 14:54:36 PM    INFO  Hello Akan.js! 🎉 +3581ms
...
...`}
          />
        </div>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
