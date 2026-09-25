import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { Image, Link } from "akanjs/ui";
import { BiLinkExternal } from "react-icons/bi";

export default function Page() {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide
        id="write-once-deploy-everywhere"
        title={l.trans({ en: "Write once, deploy everywhere", ko: "한 번 작성하고 어디든 배포" })}
      >
        <Docs.Title>{l.trans({ en: "Write once, deploy everywhere", ko: "한 번 작성하고 어디든 배포" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Why do we need to create multiple separate projects to implement a single business?",
              ko: "왜 우리는 하나의 비즈니스를 구현하기 위해 쪼개진 여러 프로젝트를 만들어야 하는 걸까요?",
            })}
          </div>
          <div>
            {l.trans({
              en: "Isn't it confusing and inefficient to develop backend, frontend, Android, and iOS separately? Can't we do everything at once?",
              ko: "백엔드, 프론트엔드, 안드로이드, iOS등을 나누어서 개발하는 것은 혼란스럽고 비효율적인 것 아닐까요? 한 번에 모든 것을 할 수 없을까요?.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan.js is a full-stack framework that allows you to deploy your service to backend, frontend web, Android, and iOS with a single code written.",
              ko: "Akan.js는 풀스택 프레임워크로, 한번의 코드 작성으로 백엔드, 프론트엔드 웹, 안드로이드, iOS에 모두 배포할 수 있는 구조를 가지고 있습니다.",
            })}
          </div>
          <div className="flex justify-center">
            <Image className="md:w-3/4" width={1024} height={512} src="/akanjsImage/write-once-deploy-everywhere.png" />
          </div>
          <div>
            {l.trans({
              en: "With a single code written with type-safe way, you can deploy your service to backend, frontend web, Android, and iOS.",
              ko: "타입 안전한 방식의 한 번의 코드 작성으로 백엔드, 프론트엔드 웹, 안드로이드, iOS에 모두 배포할 수 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "With this, you no longer need to struggle with various platforms. You can focus on developing your service and providing a better user experience.",
              ko: "이를 통해, 다양한 플랫폼과의 씨름은 더 이상 필요없습니다. 서비스의 개발과 사용자의 편의를 위한 노력에 집중할 수 있습니다.",
            })}
          </div>
          <Docs.Alert>
            <div>
              {l.trans({
                en: "Akan.js integrates the following technologies smoothly to create an extensible system.",
                ko: "Akan.js는 다음의 배경 기술들을 매끄럽게 통합하여 확장가능한 시스템을 만들도록 도와줍니다.",
              })}
            </div>
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <div className="flex w-20 items-center whitespace-nowrap text-sm">
                  {l.trans({ en: "Web/Mobile", ko: "웹/모바일" })}:
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href="https://nextjs.org/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> Next.js
                    </button>
                  </Link>
                  <Link href="https://react.dev/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> React
                    </button>
                  </Link>
                  <Link href="https://capacitorjs.com/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> Capacitor
                    </button>
                  </Link>
                  <Link href="https://tailwindcss.com/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> TailwindCSS
                    </button>
                  </Link>
                  <Link href="https://daisyui.com/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> DaisyUI
                    </button>
                  </Link>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex w-20 items-center whitespace-nowrap text-sm">
                  {l.trans({ en: "Server", ko: "서버" })}:
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href="https://nestjs.com/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> NestJS
                    </button>
                  </Link>
                  <Link href="https://mongoosejs.com/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> MongoDB
                    </button>
                  </Link>
                  <Link href="https://redis.io/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> Redis
                    </button>
                  </Link>
                  <Link href="https://www.meilisearch.com/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> Meilisearch
                    </button>
                  </Link>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex w-20 items-center whitespace-nowrap text-sm">
                  {l.trans({ en: "Testing", ko: "테스팅" })}:
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href="https://jestjs.io/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> Jest
                    </button>
                  </Link>
                  <Link href="https://playwright.dev/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> Playwright
                    </button>
                  </Link>
                  <Link href="https://eslint.org/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> ESLint
                    </button>
                  </Link>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex w-20 items-center whitespace-nowrap text-sm">
                  {l.trans({ en: "Deployment", ko: "배포" })}:
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href="https://www.docker.com/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> Docker
                    </button>
                  </Link>
                  <Link href="https://kubernetes.io/" target="_blank">
                    <button className="btn btn-outline btn-xs">
                      <BiLinkExternal /> Kubernetes
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider"></div>
      <Scroll.Slide
        id="make-dev-a-businessman"
        title={l.trans({ en: "Make Developer a Businessman", ko: "개발자를 비즈니스맨으로" })}
      >
        <Docs.Title>{l.trans({ en: "Make Developer a Businessman", ko: "개발자를 비즈니스맨으로" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan.js helps you minimize technical code and focus on implementing business logic.",
              ko: "Akan.js는 기술적인 코드를 최소화하고, 비즈니스 로직을 구현하는 데 집중할 수 있도록 도와줍니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Akan.js also provides many convenient features for building applications and provides installable libraries to provide best practices for business development.",
              ko: "또한, 애플리케이션을 구축하기 위한 여러 편의기능을 내장하고 있고, 설치가능한 라이브러리들을 제공함으로써 비즈니스 개발의 모범 사례를 제공합니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Workspace (monorepo)", ko: "워크스페이스 (모노레포)" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Akan.js is a monorepo structure that allows a single organization (team) to develop multiple apps on a single repository (workspace). A single workspace contains multiple apps (apps) and common libraries (libs).",
              ko: "Akan.js에서는 하나의 조직(팀)이 하나의 레포지토리(workspace) 위에서 여러 앱을 개발하는 구조로 이루어져 있습니다. 하나의 workspace는 여러 앱(app)과 공통 라이브러리(lib)를 가지고 있습니다.",
            })}
          </div>
          <div className="flex justify-center">
            <Image className="md:w-3/4" width={1024} height={512} src="/akanjsImage/workspace-structure.png" />
          </div>
          <div>
            <span className="font-bold">{l.trans({ en: "App(apps): ", ko: "앱(apps): " })}</span>
            {l.trans({
              en: "Standalone application that can be deployed to all platforms (web, mobile, server, etc.)",
              ko: "앱은 독립적으로 배포될 수 있는 하나의 애플리케이션입니다. 웹 앱, 모바일 앱, 서버를 모두 포함하여 모든 플랫폼에 배포될 수 있습니다.",
            })}
          </div>
          <div>
            <span className="font-bold">
              {l.trans({ en: "Common library(libs): ", ko: "공통 라이브러리(libs): " })}
            </span>
            {l.trans({
              en: "Provide common features that can be used by multiple apps. For example, login, payment, notification, chat, etc. are common features used in various apps. By providing these features as common libraries, developers can reuse them to reduce development time.",
              ko: "여러 앱들이 사용할 수 있는 공통의 기능들을 제공합니다. 예를 들면, 로그인, 결제, 알림, 채팅 등은 일반적으로 다양한 앱에서 사용되는 기능들입니다. 이러한 기능들을 공통 라이브러리로 제공하면, 개발자들은 이러한 기능들을 재사용하여 개발 시간을 줄일 수 있습니다.",
            })}
          </div>
          <Code.Snippet
            language="bash"
            showLineNumbers={false}
            copy={false}
            code={`
├── apps/                   # ${l.trans({ en: "Application list", ko: "애플리케이션 목록" })}
│   └── appA/               # ${l.trans({ en: "Individual application", ko: "개별 애플리케이션" })}
│   └── appB/               # ${l.trans({ en: "Individual application", ko: "개별 애플리케이션" })}
└── libs/                   # ${l.trans({ en: "Library list", ko: "라이브러리 목록" })}
    ├── shared/             # ${l.trans({ en: "Shared library", ko: "공통 라이브러리" })}
    ├── util/               # ${l.trans({ en: "Utility library", ko: "유틸리티 라이브러리" })}
    └── [other libs]/       # ${l.trans({ en: "Other specific libraries", ko: "기타 특화 라이브러리" })}`}
          />
          <div>
            {l.trans({
              en: "When you run `akan create-workspace`, shared and util libraries are installed by default. These libraries are common libraries that can be used by all apps.",
              ko: "처음 `akan create-workspace`를 진행하면, 기본적으로 shared, util 라이브러리가 설치되고, 이는 공통 라이브러리로서 모든 앱에서 사용할 수 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "You can use common libraries in your created application (e.g. myapp). For example, you can use the shared library to provide admin page and file upload tool.",
              ko: "생성한 내 애플리케이션(e.g. myapp)에서 서버 로직, 도메인 모듈, 클라이언트 로직, 컴포넌트 등의 공통 라이브러리를 사용할 수 있습니다. 예를 들면, shared 라이브러리에서는 관리자페이지와 파일 업로드 도구 등을 제공합니다.",
            })}
          </div>
          <Docs.Alert>
            <div className="font-bold">
              {l.trans({
                en: "80:20 rule",
                ko: "80:20 규칙",
              })}
            </div>
            <div className="mt-2 space-y-2">
              <div>
                {l.trans({
                  en: "A healthy workspace maintains a structure where 80% of the code is shared between apps, and 20% is specific to each app.",
                  ko: "건강하게 유지되는 워크스페이스는 약 80%의 코드가 공통 라이브러리로 공유되고, 20%의 코드가 각 앱에 특화되어 운영되는 구조를 권장합니다.",
                })}
              </div>
              <div>
                {l.trans({
                  en: "However, you don't have to force yourself to follow the rule. Just maintain the workspace with your heart, and the ratio will naturally be adjusted as you maintain it.",
                  ko: "하지만 규칙을 지키려고 노력하지 않아도 됩니다. 당신이 마음을 담아 워크스페이스를 유지보수 하는 과정에서 자연스럽게 비율이 맞추어질 것입니다.",
                })}
              </div>
            </div>
          </Docs.Alert>
          <Docs.SubSubTitle>
            {l.trans({ en: "Workspace file structure", ko: "워크스페이스 파일 구조" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "To efficiently arrange server, client, and common code, the apps and libs structure has the following identical structure.",
              ko: "서버, 클라이언트, 그리고 공통의 코드들을 효율적으로 배치하기 위해 apps와 libs 구조는 다음과 같은 동일한 구조를 가집니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The server is implemented as a node.js application that is executed in the main.ts file, and the client is implemented as a Next.js app router-based file-based routing.",
              ko: "서버는 도메인 기반으로 묶여 최종적으로 main.ts 파일에서 실행되는 Node.js 어플리케이션으로 구현되며, 클라이언트는 Next.js app router 방식의 파일 기반 라우팅으로 구현됩니다.",
            })}
          </div>
          <Code.Snippet
            language="bash"
            showLineNumbers={false}
            copy={false}
            code={`
└── {apps,libs}/            # ${l.trans({ en: "Application or library code", ko: "애플리케이션 또는 라이브러리 코드" })}
    └── {appA,libA}/        # ${l.trans({ en: "Individual application or library", ko: "개별 애플리케이션 또는 라이브러리" })}
        ├── app/            # ${l.trans({ en: "File based routing (Only in apps)", ko: "파일 기반 라우팅 (앱에서만 존재)" })}
        ├── base/           # ${l.trans({ en: "Base code (not-modularized)", ko: "기본 코드 (모듈화 X)" })}
        ├── common/         # ${l.trans({ en: "Common code (modularized)", ko: "공통 코드 (모듈화 O)" })}
        ├── env/            # ${l.trans({ en: "Environment variables", ko: "환경 변수" })}
        ├── lib/            # ${l.trans({ en: "Domain modules", ko: "도메인 모듈" })}
        ├── nest/           # ${l.trans({ en: "Server-side logic code", ko: "서버 로직 코드" })}
        ├── next/           # ${l.trans({ en: "Client-side logic code (modularized)", ko: "클라이언트 로직 코드 (모듈화 O)" })}
        ├── public/         # ${l.trans({ en: "Assets files", ko: "애셋 파일" })}
        ├── ui/             # ${l.trans({ en: "UI code (modularized)", ko: "UI 코드 (모듈화 O)" })}
        ├── akan.config.ts  # ${l.trans({ en: "Application configuration", ko: "애플리케이션 설정" })}
        ├── main.ts         # ${l.trans({ en: "Backend entry point (Only in apps)", ko: "백엔드 진입점 (앱에서만 존재)" })}
        ├── client.ts       # ${l.trans({ en: "Client-side barrel file", ko: "클라이언트 바로잡기 파일" })}
        └── server.ts       # ${l.trans({ en: "Server-side barrel file", ko: "서버 바로잡기 파일" })}`}
          />
          <div>
            {l.trans({
              en: "To run the server and client, each server.ts and client.ts files implement the modularized code as a single file (barrel file).",
              ko: "서버와 클라이언트를 구동하기 위해서 각각 server.ts와 client.ts 파일에 모듈화된 코드들을 모아 하나의 파일(barrel file)로 구현합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "To implement this, the server, client, and common files are separated, and the file rules are taken, and roughly expressed as follows.",
              ko: "이를 위해 서버 파일, 클라이언트 파일, 공통 파일을 구분하여 파일 규칙을 가져가며, 이를 개략적으로 표현하면 다음과 같습니다.",
            })}
          </div>
          <div className="flex justify-center">
            <Image className="md:w-3/4" width={1024} height={512} src="/akanjsImage/app-structure.png" />
          </div>
          <div>
            {l.trans({
              en: "By arranging the server, client, and common files in accordance with the file rules, you can implement an extensible and reusable structure. You don't need to understand all the rules now. As you write code in the future practice, you can understand one by one. The most important thing is to understand where the code you want to implement is located in the server, client, and common files.",
              ko: "위 그림과 같이 파일 규칙에 맞추어 서버, 클라이언트, 공통파일을 잘 배치하여 확장가능하고 재사용가능한 구조를 구현할 수 있습니다. 지금 모든 규칙을 이해할 필요는 없습니다. 앞으로 나올 실습에 맞추어 코드를 작성하면서 하나씩 이해해보도록 합시다. 가장 중요한 것은 내가 구현하고자 하는 코드가 서버, 클라이언트, 공통파일 중 어디에 위치하는지를 파악하는 것입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "For example, if you want to implement a password-based login feature, the component that receives the ID and password is a client feature. The function of encrypting and storing it is a server feature, and checking if the password is more than 8 characters is a common feature needed by both.",
              ko: "예를 들면, 패스워드 기반 로그인 기능을 구현한다고 가정합시다. 아이디와 패스워드를 입력받는 컴포넌트는 클라이언트 기능입니다. 이를 암호화해서 저장하는 기능은 서버 기능이며, 비밀번호가 8자가 넘는지 체크하는 것은 양쪽 모두 필요한 공통 기능입니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider"></div>
      <Scroll.Slide id="collab-devs-cohesive" title={l.trans({ en: "Collab cohesively", ko: "동료들과 한몸처럼" })}>
        <Docs.Title>{l.trans({ en: "Collab cohesively", ko: "동료들과 한몸처럼" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan.js provides strict file rules to ensure that everyone implements the same way.",
              ko: "Akan.js는 엄격한 파일 규칙을 제공하여, 누가 구현하든 같은 방식으로 구현할 수 있도록 도와줍니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "This allows developers to collaborate seamlessly and have their colleagues take over their work while they take a vacation.",
              ko: "이를 통해 개발자들은 한몸처럼 협업할 수 있고, 내가 휴가를 떠난 동안 동료가 러닝커브 없이 내 작업을 대신 할 수 있습니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "The most common tasks in a workspace are 1) writing pages that are delivered to users and 2) writing domain modules that implement business concepts. To do this, file rules are defined.",
              ko: "워크스페이스에서 작업하면서 가장 많이 작업하는 것은 두 가지로, 1)사용자에게 전달되는 페이지를 작성하는 것과, 2)비즈니스 개념을 구현하는 도메인 모듈을 작성하는 것입니다. 두 작업에 대한 파일 규칙에 대해 알아봅시다.",
            })}
          </div>
          <Docs.SubSubTitle>
            {l.trans({ en: "Page file convention - File-based routing", ko: "페이지 파일 규칙 - 파일 기반 라우팅" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  The page is a file that implements the page and layout that are implemented according to the url path.
                  The page file is implemented in a folder structure, and is implemented in the same way as Next.js app
                  router.
                </span>
              ),
              ko: (
                <span>
                  페이지는 url 경로에 맞추어 구현되는 페이지와 레이아웃 등을 구현하는 파일입니다. 페이지 파일은 폴더
                  구조로 구현되며,{" "}
                  <Link
                    href="https://nextjs.org/docs/app/getting-started/layouts-and-pages"
                    target="_blank"
                    className="!underline italic"
                  >
                    Next.js app router
                  </Link>
                  와 동일한 방식으로 구현됩니다.
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            language="bash"
            showLineNumbers={false}
            copy={false}
            code={`
└── apps/               # ${l.trans({ en: "Application list", ko: "애플리케이션 목록" })}
    └── appA/           # ${l.trans({ en: "Individual application", ko: "개별 애플리케이션" })}
        └── app/        # ${l.trans({ en: "File based routing (Next.js app router)", ko: "파일 기반 라우팅 (Next.js app router)" })}
            ├── pageA/  # ${l.trans({ en: "Page folder", ko: "페이지 폴더" })}
            │   ├── layout.tsx     # ${l.trans({ en: "Layout component", ko: "레이아웃 컴포넌트" })}
            │   └── page.tsx       # ${l.trans({ en: "Page component", ko: "페이지 컴포넌트" })}
            └── pageB/             # ${l.trans({ en: "Another page", ko: "다른 페이지" })}
                ├── layout.tsx     # ${l.trans({ en: "Layout component", ko: "레이아웃 컴포넌트" })}
                ├── page.tsx       # ${l.trans({ en: "Page component", ko: "페이지 컴포넌트" })}
                └── [param]/       # ${l.trans({ en: "Dynamic segment", ko: "동적 세그먼트" })}
                    └── layout.tsx # ${l.trans({ en: "Layout component", ko: "레이아웃 컴포넌트" })}
                    └── page.tsx   # ${l.trans({ en: "Page component", ko: "페이지 컴포넌트" })}`}
          />
          <Docs.SubSubTitle>
            {l.trans({ en: "Domain module file convention", ko: "도메인 모듈 파일 규칙" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "The domain module is a representation of a single domain in the business. For example, there are user management, order management, payment management, etc. To represent this, it must be implemented in a structured form across the entire system, including data structure, service logic, and user UI.",
              ko: "도메인 모듈은 비즈니스 상에서 차지하는 하나의 도메인에 대한 표현입니다. 예를 들면, 회원 관리, 주문 관리, 결제 관리 등이 있으며 이를 표현하기 위해서는 데이터 구조, 서비스 로직, 사용자 UI 등 시스템 전체에 걸쳐 정렬된 형태로 구현해야 합니다.",
            })}
          </div>
          <Code.Snippet
            language="bash"
            showLineNumbers={false}
            copy={false}
            code={`
└── {apps,libs}/          # ${l.trans({ en: "Application or library code", ko: "애플리케이션 또는 라이브러리 코드" })}
    └── {appA,libA}/      # ${l.trans({ en: "Individual application or library", ko: "개별 애플리케이션 또는 라이브러리" })}
        └── lib/          # ${l.trans({ en: "Domain modules", ko: "도메인 모듈" })}
            └── moduleA/  # ${l.trans({ en: "Feature module", ko: "기능 모듈" })}
                ├── moduleA.constant.ts   # ${l.trans({ en: "Types and schemas", ko: "타입과 스키마" })}
                ├── moduleA.dictionary.ts # ${l.trans({ en: "Translations", ko: "번역" })}
                ├── moduleA.document.ts   # ${l.trans({ en: "Document", ko: "문서" })}
                ├── moduleA.service.ts    # ${l.trans({ en: "Business logic", ko: "비즈니스 로직" })}
                ├── moduleA.signal.ts     # ${l.trans({ en: "API endpoints", ko: "API 엔드포인트" })}
                ├── moduleA.store.ts      # ${l.trans({ en: "State management", ko: "상태 관리" })}
                ├── moduleA.Template.tsx  # ${l.trans({ en: "Form UI", ko: "수정/생성 UI" })}
                ├── moduleA.Unit.tsx      # ${l.trans({ en: "Overview UI", ko: "개요 UI" })}
                ├── moduleA.Util.tsx      # ${l.trans({ en: "Utility UI", ko: "유틸리티 UI" })}
                ├── moduleA.View.tsx      # ${l.trans({ en: "Detail view UI", ko: "상세 뷰 UI" })}
                └── moduleA.Zone.tsx      # ${l.trans({ en: "Integration UI", ko: "통합 UI" })}`}
          />
          <div>
            {l.trans({
              en: "A domain is a complex organism that operates like a single domain. From the schema definition in the constant file to the integration component of the Zone, it can be managed in a single folder, allowing for a version gap between the backend and frontend.",
              ko: "하나의 도메인은 복합적인 유기체처럼 활동합니다. constant 파일의 스키마 정의에서부터 Zone의 통합 컴포넌트까지 하나의 폴더에서 관리할 수 있으며, 이를 통해 백엔드-프론트엔드 간의 버전 격차, 비즈니스 로직 변경 시 발생하는 문제 등을 최소화할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider"></div>
      <Scroll.Slide id="who-should-use" title={l.trans({ en: "Who should use?", ko: "누구에게 적합한가요?" })}>
        <Docs.Title>{l.trans({ en: "Who should use?", ko: "누구에게 적합한가요?" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "It is suitable for developers who want to create a product-level solution and deliver it to customers.",
              ko: "고객에게 빠르게 제품 수준의 가치를 전달하고 싶은 개발자에게 적합합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "Live products need to be managed and operated continuously. Akan.js provides an environment where one developer can operate multiple projects at the same time, and multiple developers can collaborate on a single project as a single body.",
              ko: "살아있는 제품은 지속적으로 관리되고 운영되어야 합니다. Akan.js는 한 명의 개발자가 여러 프로젝트를 동시에 운영하고, 여러 개발자가 하나의 프로젝트를 한 몸처럼 협업할 수 있는 환경을 제공합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A framework always has a trade-off. If it is easy to use, it may be difficult to advance, and if it is diverse, it may be difficult to collaborate.",
              ko: "프레임워크는 언제나 trade-off를 가집니다. 단순하게 사용할 수 있다면 고도화가 어려울 수 있고, 다양성을 포용하면 협업이 어려울 수 있습니다. 우리는 이러한 문제에 대해 다음과 같은 부분에 집중합니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "What we focus on", ko: "우리가 집중하는 부분" })}</Docs.SubSubTitle>
          <div className="ml-2 flex flex-col gap-1 md:ml-4">
            <div>
              {l.trans({
                en: "✅ Abstraction of interfaces for representing business",
                ko: "✅ 비즈니스를 표현하기 위한 추상화된 인터페이스",
              })}
            </div>
            <div>
              {l.trans({
                en: "✅ Continuous stable reflection and update of the latest trends in technology for product-level quality",
                ko: "✅ 제품 수준의 퀄리티를 위한 최신 트렌드 기술의 검토, 안정화된 형태의 지속적 반영",
              })}
            </div>
            <div>
              {l.trans({
                en: "✅ Consistent workflow and best practices through strict and unified rules",
                ko: "✅ 엄격하고 단일화된 규칙을 통한 일관된 작업방식과 모범 사례 제공",
              })}
            </div>
          </div>

          <Docs.SubSubTitle>
            {l.trans({ en: "What we not focus on", ko: "우리가 집중하지 않는 부분" })}
          </Docs.SubSubTitle>
          <div className="ml-2 flex flex-col gap-1 md:ml-4">
            <div>
              {l.trans({
                en: "❌ Representing unnecessary technical details unrelated to business",
                ko: "❌ 비즈니스와 관련없는 불필요한 기술적 세부사항 표현",
              })}
            </div>
            <div>
              {l.trans({
                en: "❌ Unstable technical reflection and unnecessary optimization",
                ko: "❌ 불안정한 기술 반영과 불필요한 최적화",
              })}
            </div>
            <div>
              {l.trans({
                en: "❌ Allowing multiple approaches to work",
                ko: "❌ 다양한 작업 방식에 대한 복수 허용",
              })}
            </div>
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Work backward", ko: "역순으로 작업하기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Programming is to create business value by efficiently connecting our lives and customers' lives. Define the problem, create a product-level solution quickly through Akan.js, and easily deliver it to customers!",
              ko: "프로그래밍은 우리와 고객의 삶을 효율화하고 긴밀하게 연결해 비즈니스 가치를 창출하는 것입니다. 문제를 정의하고, 빠르게 Akan.js를 통해 제품 수준의 해결책을 만들어내어 손쉽게 고객에게 전달하세요!",
            })}
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  Akan.js is always open to your feedback. If you have any questions, please leave an issue on{" "}
                  <Link href="https://github.com/akan-team/akanjs" target="_blank" className="!underline italic">
                    GitHub
                  </Link>
                  . When you are working for customers, we are working for you.
                </span>
              ),
              ko: (
                <span>
                  언제든 Akan.js는 여러분의 프로젝트를 지원하고, 목소리를 듣는 중입니다. 만약 궁금한 점이 있다면,{" "}
                  <Link href="https://github.com/akan-team/akanjs" target="_blank" className="!underline italic">
                    GitHub
                  </Link>
                  에 이슈를 남겨주세요. 당신은 고객을 위해 일할 때, 우리는 당신을 위해 일합니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
