import { usePage } from "@apps/akan/client";
import { cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page().render(() => {
  const { l } = usePage();

  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";
  const commandLabel = l.trans({ en: "Command", ko: "명령" });

  const notationRows = [
    {
      name: "<app>",
      desc: l.trans({
        en: "A value the command needs. Leave it off and the command asks for it.",
        ko: "명령에 필요한 값입니다. 생략하면 명령이 물어봅니다.",
      }),
    },
    {
      name: "[filename]",
      desc: l.trans({
        en: "An optional value. The command runs without it.",
        ko: "선택 값입니다. 없어도 명령이 실행됩니다.",
      }),
    },
    {
      name: "<app|lib|pkg>",
      desc: l.trans({
        en: "`|` means or: the name of an app, a library or a package.",
        ko: "`|`는 '또는'입니다. 앱, 라이브러리, 패키지 중 하나의 이름을 씁니다.",
      }),
    },
    {
      name: "<sys:module>",
      desc: l.trans({
        en: "An app or lib and a module, joined by a colon: `myapp:icecreamOrder`.",
        ko: "앱이나 라이브러리 이름과 모듈 이름을 콜론으로 잇습니다. 예: `myapp:icecreamOrder`.",
      }),
    },
    {
      name: "[apps...]",
      desc: l.trans({
        en: "One or more app names, space- or comma-separated, or `all` for every app.",
        ko: "앱 이름 하나 이상입니다. 공백이나 쉼표로 구분하고, `all`은 모든 앱입니다.",
      }),
    },
    {
      name: "--name <value>",
      desc: l.trans({
        en: "An option. Words are joined with dashes: `--max-diagnostics 0`.",
        ko: "옵션입니다. 단어는 `-`로 잇습니다. 예: `--max-diagnostics 0`.",
      }),
    },
    {
      name: "--fix false",
      desc: l.trans({
        en: "A boolean option takes `true` or `false`. The flag alone means `true`.",
        ko: "불리언 옵션은 `true`나 `false`를 받습니다. 값 없이 쓰면 `true`입니다.",
      }),
    },
    {
      name: "--no-write",
      desc: l.trans({
        en: "A boolean option that defaults to `true` also takes `--no-<name>` to turn it off.",
        ko: "기본값이 `true`인 불리언 옵션은 `--no-<name>`으로도 끌 수 있습니다.",
      }),
    },
  ];

  const sharedCards = [
    {
      title: l.trans({ en: "Verbose Output", ko: "자세한 출력" }),
      code: "-v, --verbose",
      desc: l.trans({
        en: "Every command accepts it. It prints the output of each process the command runs, which a spinner normally hides.",
        ko: "모든 명령이 받는 옵션입니다. 평소 스피너 뒤에 가려지는 프로세스 출력을 그대로 보여 줍니다.",
      }),
    },
    {
      title: l.trans({ en: "Help", ko: "도움말" }),
      code: "akan <command> --help",
      desc: l.trans({
        en: "Prints the command's arguments and options with their defaults and choices. Bare `akan` lists every command.",
        ko: "명령의 인자와 옵션을 기본값, 선택지와 함께 출력합니다. `akan`만 입력하면 전체 명령 목록이 나옵니다.",
      }),
    },
    {
      title: l.trans({ en: "Run From The Workspace Root", ko: "워크스페이스 루트에서 실행" }),
      code: "package.json · tsconfig.json · .env",
      desc: l.trans({
        en: "Run every command except `create-workspace` from the folder that holds these three files. Anywhere else it stops with an error.",
        ko: "`create-workspace`를 뺀 모든 명령은 이 세 파일이 있는 폴더에서 실행합니다. 다른 곳에서 실행하면 오류를 내고 멈춥니다.",
      }),
    },
    {
      title: l.trans({ en: "Short Aliases", ko: "짧은 별칭" }),
      code: "akan ba  =  akan build-android",
      desc: l.trans({
        en: "Seven commands also answer to the first letter of each dashed word. The table below lists all of them.",
        ko: "명령 일곱 개는 `-`로 나뉜 단어의 첫 글자만으로도 실행됩니다. 아래 표에 모두 있습니다.",
      }),
    },
  ];

  const aliasRows = [
    { alias: "akan s", command: "akan start" },
    { alias: "akan b", command: "akan build" },
    { alias: "akan t", command: "akan typecheck" },
    { alias: "akan bi", command: "akan build-ios" },
    { alias: "akan ba", command: "akan build-android" },
    { alias: "akan si", command: "akan start-ios" },
    { alias: "akan sa", command: "akan start-android" },
  ];

  const omittedRows = [
    {
      left: l.trans({ en: "A value with a default", ko: "기본값이 있는 값" }),
      result: l.trans({
        en: "The default is used: `akan quality` runs `quality scan`.",
        ko: "기본값을 씁니다. `akan quality`는 `quality scan`으로 실행됩니다.",
      }),
    },
    {
      left: l.trans({ en: "An optional value", ko: "선택 값" }),
      result: l.trans({ en: "It stays empty, and the command runs without it.", ko: "비워 둔 채로 실행합니다." }),
    },
    {
      left: "`<app>`",
      result: l.trans({
        en: "Picked from a list. A workspace with only one app uses it without asking.",
        ko: "목록에서 고릅니다. 워크스페이스에 앱이 하나뿐이면 묻지 않고 그 앱을 씁니다.",
      }),
    },
    {
      left: "`<lib>` `<pkg>` `<app|lib>` `<sys:module>`",
      result: l.trans({
        en: "Picked from a list. A module takes two picks: the app or lib, then the module.",
        ko: "목록에서 고릅니다. 모듈은 앱이나 라이브러리를 먼저 고른 다음 모듈을 고릅니다.",
      }),
    },
    {
      left: l.trans({ en: "`[apps...]` of `akan start`", ko: "`akan start`의 `[apps...]`" }),
      result: l.trans({
        en: "A checklist opens with your last choice ticked. A workspace with one app skips it.",
        ko: "지난번 선택이 체크된 체크리스트가 열립니다. 앱이 하나뿐이면 건너뜁니다.",
      }),
    },
    {
      left: l.trans({ en: "Anything else", ko: "그 밖의 값" }),
      result: l.trans({
        en: "A prompt asks for it: you type it, pick a choice, or answer yes or no.",
        ko: "프롬프트가 물어봅니다. 직접 입력하거나, 선택지에서 고르거나, 예/아니오로 답합니다.",
      }),
    },
  ];

  const validationSteps = [
    {
      command: "akan sync <app|lib>",
      desc: l.trans({
        en: "Updates dependencies, config and generated files. Needed after adding, renaming or deleting a file.",
        ko: "의존성, 설정, 생성 파일을 최신으로 맞춥니다. 파일을 추가하거나 이름을 바꾸거나 지운 뒤에 꼭 필요합니다.",
      }),
    },
    {
      command: "akan lint <app|lib|pkg>",
      desc: l.trans({
        en: "Formats and lints with Biome, including Akan's convention rules.",
        ko: "Biome으로 포맷과 린트를 합니다. Akan 컨벤션 규칙도 함께 검사합니다.",
      }),
    },
    {
      command: "akan typecheck <app>",
      desc: l.trans({ en: "Checks TypeScript types across the app.", ko: "앱 전체의 TypeScript 타입을 검사합니다." }),
    },
    {
      command: "akan test <app|lib|pkg>",
      desc: l.trans({ en: "Runs the test suites.", ko: "테스트를 실행합니다." }),
    },
    {
      command: "akan build <app>",
      desc: l.trans({ en: "Builds the production output.", ko: "프로덕션 결과물을 빌드합니다." }),
    },
  ];

  const reportRows = [
    {
      name: "doctor --strict --format json",
      desc: l.trans({
        en: "Lists where the workspace drifts from conventions. `--strict` counts recommended ones as errors.",
        ko: "워크스페이스가 Akan 컨벤션에서 벗어난 곳을 보여 줍니다. `--strict`는 권장 사항도 오류로 셉니다.",
      }),
    },
    {
      name: "quality scan",
      desc: l.trans({
        en: "Lists code-shape warnings across every app and lib.",
        ko: "모든 앱과 라이브러리의 코드 형태 경고를 보여 줍니다.",
      }),
    },
    {
      name: "quality ssr",
      desc: l.trans({
        en: "Prints each app's and lib's server render share. The floor is 50%, and a drop is a regression.",
        ko: "앱과 라이브러리마다 server render share를 출력합니다. 50%가 하한선이고, 비율이 떨어지면 회귀입니다.",
      }),
    },
  ];

  const commandGroups = [
    {
      title: l.trans({ en: "Workspace", ko: "워크스페이스" }),
      href: "/references/cli/workspace",
      desc: l.trans({
        en: "Create a workspace, and lint and sync everything in it at once.",
        ko: "워크스페이스를 만들고, 안의 모든 것을 한 번에 린트·동기화합니다.",
      }),
      commands: [
        {
          name: "create-workspace <workspaceName>",
          href: "/references/cli/workspace#create-workspace",
          desc: l.trans({
            en: "Creates a new workspace. `--app <app>` names its first app.",
            ko: "새 워크스페이스를 만듭니다. `--app <app>`으로 첫 앱의 이름을 정합니다.",
          }),
        },
        {
          name: "lint <app|lib|pkg>",
          href: "/references/cli/workspace#lint",
          desc: l.trans({
            en: "Lints one app, lib or package with Biome and fixes what it can. An app or lib is synced first.",
            ko: "앱, 라이브러리, 패키지 하나를 Biome으로 린트하고 고칠 수 있는 것은 고칩니다. 앱과 라이브러리는 먼저 동기화합니다.",
          }),
        },
        {
          name: "lint-all",
          href: "/references/cli/workspace#lint-all",
          desc: l.trans({
            en: "Syncs every app and lib, then lints every app, lib and package.",
            ko: "모든 앱과 라이브러리를 동기화한 다음, 모든 앱·라이브러리·패키지를 린트합니다.",
          }),
        },
        {
          name: "sync-all",
          href: "/references/cli/workspace#sync-all",
          desc: l.trans({
            en: "Syncs every library, then every app.",
            ko: "모든 라이브러리를 동기화한 다음, 모든 앱을 동기화합니다.",
          }),
        },
      ],
    },
    {
      title: l.trans({ en: "Application: Develop", ko: "애플리케이션: 개발" }),
      href: "/references/cli/application",
      desc: l.trans({
        en: "Create and remove apps, run them locally, and look into a running server.",
        ko: "앱을 만들고 지우고, 로컬에서 띄우고, 실행 중인 서버를 들여다봅니다.",
      }),
      commands: [
        {
          name: "create-application <appName>",
          href: "/references/cli/application#create-application",
          desc: l.trans({ en: "Creates a new app under `apps/`.", ko: "`apps/` 아래에 새 앱을 만듭니다." }),
        },
        {
          name: "remove-application <app>",
          href: "/references/cli/application#remove-application",
          desc: l.trans({ en: "Removes an app from the workspace.", ko: "워크스페이스에서 앱을 지웁니다." }),
        },
        {
          name: "sync <app|lib>",
          href: "/references/cli/application#sync",
          desc: l.trans({
            en: "Updates one app's or lib's dependencies, config and generated files.",
            ko: "앱이나 라이브러리 하나의 의존성, 설정, 생성 파일을 최신으로 맞춥니다.",
          }),
        },
        {
          name: "start [apps...]",
          href: "/references/cli/application#start",
          desc: l.trans({
            en: "Starts the dev server for one or more apps. Alias `s`.",
            ko: "앱 하나 이상의 개발 서버를 띄웁니다. 별칭은 `s`입니다.",
          }),
        },
        {
          name: "script <app> [filename]",
          href: "/references/cli/application#script",
          desc: l.trans({
            en: "Runs `apps/<app>/script/<filename>.ts`, and asks which file when you leave it off.",
            ko: "`apps/<app>/script/<filename>.ts`를 실행합니다. 파일을 생략하면 어느 것인지 묻습니다.",
          }),
        },
        {
          name: "console <app>",
          href: "/references/cli/application#console",
          desc: l.trans({ en: "Opens an interactive server console.", ko: "대화형 서버 콘솔을 엽니다." }),
        },
        {
          name: "logs <app>",
          href: "/references/cli/application#logs",
          desc: l.trans({
            en: "Tails the running app's logs, filtered by level, endpoint, trace and more.",
            ko: "실행 중인 앱의 로그를 레벨, 엔드포인트, trace 등으로 걸러 가며 봅니다.",
          }),
        },
        {
          name: ["dbup", "dbdown"],
          href: ["/references/cli/application#dbup", "/references/cli/application#dbdown"],
          desc: l.trans({
            en: "Starts or stops the local database services.",
            ko: "로컬 데이터베이스 서비스를 띄우거나 내립니다.",
          }),
        },
        {
          name: ["db-export <app>", "db-import <app>"],
          href: ["/references/cli/application#db-export", "/references/cli/application#db-import"],
          desc: l.trans({
            en: "Copies an app's data out of one database mode and into another.",
            ko: "앱의 데이터를 한 데이터베이스 모드에서 꺼내 다른 모드로 옮깁니다.",
          }),
        },
        {
          name: "configure-app <app>",
          desc: l.trans({ en: "Configures app settings interactively.", ko: "앱 설정을 대화형으로 구성합니다." }),
        },
        {
          name: "plan-slice <app>",
          href: "/references/cli/application#plan-slice",
          desc: l.trans({
            en: "Lists the exact files an app needs to live in a workspace of its own.",
            ko: "앱을 독립된 워크스페이스로 옮길 때 필요한 파일을 정확히 나열합니다.",
          }),
        },
      ],
    },
    {
      title: l.trans({ en: "Application: Check And Build", ko: "애플리케이션: 검사와 빌드" }),
      href: "/references/cli/application",
      desc: l.trans({
        en: "Typecheck, test and build before a change ships.",
        ko: "변경을 내보내기 전에 타입 검사, 테스트, 빌드를 합니다.",
      }),
      commands: [
        {
          name: "typecheck <app>",
          href: "/references/cli/application#typecheck",
          desc: l.trans({ en: "Typechecks the app. Alias `t`.", ko: "앱의 타입을 검사합니다. 별칭은 `t`입니다." }),
        },
        {
          name: "test <app|lib|pkg>",
          href: "/references/cli/application#test",
          desc: l.trans({
            en: "Prepares and runs the tests of an app, lib or package.",
            ko: "앱, 라이브러리, 패키지의 테스트를 준비하고 실행합니다.",
          }),
        },
        {
          name: "build <app>",
          href: "/references/cli/application#build",
          desc: l.trans({
            en: "Builds the app for production, frontend and backend together. Alias `b`.",
            ko: "프런트엔드와 백엔드를 함께 프로덕션용으로 빌드합니다. 별칭은 `b`입니다.",
          }),
        },
      ],
    },
    {
      title: l.trans({ en: "Application: Mobile", ko: "애플리케이션: 모바일" }),
      href: "/references/cli/application",
      desc: l.trans({
        en: "Build, run and release the iOS and Android apps with Capacitor.",
        ko: "Capacitor로 iOS와 Android 앱을 빌드하고, 실행하고, 출시합니다.",
      }),
      commands: [
        {
          name: ["build-ios <app>", "build-android <app>"],
          href: ["/references/cli/application#build-ios", "/references/cli/application#build-android"],
          desc: l.trans({
            en: "Builds the iOS or Android app with Capacitor. Aliases `bi` and `ba`.",
            ko: "Capacitor로 iOS나 Android 앱을 빌드합니다. 별칭은 `bi`, `ba`입니다.",
          }),
        },
        {
          name: ["start-ios <app>", "start-android <app>"],
          href: ["/references/cli/application#start-ios", "/references/cli/application#start-android"],
          desc: l.trans({
            en: "Runs the app in a simulator, an emulator or on a device. Aliases `si` and `sa`.",
            ko: "시뮬레이터, 에뮬레이터, 실기기에서 앱을 실행합니다. 별칭은 `si`, `sa`입니다.",
          }),
        },
        {
          name: ["release-ios <app>", "release-android <app>"],
          href: ["/references/cli/application#release-ios", "/references/cli/application#release-android"],
          desc: l.trans({
            en: "Builds and packages a release for the App Store or the Play Store.",
            ko: "App Store나 Play Store에 낼 릴리스를 빌드하고 패키징합니다.",
          }),
        },
        {
          name: "release-source <app>",
          desc: l.trans({
            en: "Releases the app source with over-the-air (OTA) update support.",
            ko: "OTA(무선) 업데이트를 받을 수 있도록 앱 소스를 릴리스합니다.",
          }),
        },
        {
          name: "codepush <app>",
          desc: l.trans({
            en: "Deploys an over-the-air (OTA) update to the mobile app.",
            ko: "모바일 앱에 OTA 업데이트를 배포합니다.",
          }),
        },
      ],
    },
    {
      title: l.trans({ en: "Library", ko: "라이브러리" }),
      href: "/references/cli/library",
      desc: l.trans({
        en: "Create, install, remove and sync the shared libraries that apps use.",
        ko: "앱이 쓰는 공유 라이브러리를 만들고, 설치하고, 지우고, 동기화합니다.",
      }),
      commands: [
        {
          name: "create-library <libName>",
          href: "/references/cli/library#create-library",
          desc: l.trans({
            en: "Creates a new shared library under `libs/`.",
            ko: "`libs/` 아래에 새 공유 라이브러리를 만듭니다.",
          }),
        },
        {
          name: "remove-library <lib>",
          href: "/references/cli/library#remove-library",
          desc: l.trans({ en: "Removes a library from the workspace.", ko: "워크스페이스에서 라이브러리를 지웁니다." }),
        },
        {
          name: "sync-library <lib>",
          href: "/references/cli/library#sync-library",
          desc: l.trans({
            en: "Syncs one library's dependencies and config.",
            ko: "라이브러리 하나의 의존성과 설정을 동기화합니다.",
          }),
        },
        {
          name: "install-library <libName>",
          href: "/references/cli/library#install-library",
          desc: l.trans({
            en: "Installs a pre-built library such as `shared` or `util`.",
            ko: "`shared`, `util` 같은 미리 만들어 둔 라이브러리를 설치합니다.",
          }),
        },
        {
          name: "library-status",
          href: "/references/cli/library#library-status",
          desc: l.trans({
            en: "Reports whether each library still matches the source it was installed from.",
            ko: "각 라이브러리가 설치해 온 원본과 아직 같은지 보고합니다.",
          }),
        },
      ],
    },
    {
      title: l.trans({ en: "Module", ko: "모듈" }),
      href: "/references/cli/module",
      desc: l.trans({
        en: "Generate database modules, service modules, and a module's optional UI files.",
        ko: "데이터베이스 모듈과 서비스 모듈, 그리고 모듈에 붙는 선택 UI 파일을 생성합니다.",
      }),
      commands: [
        {
          name: "create-module <moduleName> <app|lib>",
          href: "/references/cli/module#create-module",
          desc: l.trans({
            en: "Creates a database module: constant, service, signal, store and UI files.",
            ko: "데이터베이스 모듈을 만듭니다. constant, service, signal, store, UI 파일이 생깁니다.",
          }),
        },
        {
          name: "create-service <serviceName> <app|lib>",
          href: "/references/cli/module#create-service",
          desc: l.trans({
            en: "Creates a service module in `lib/_<service>`, with no database files.",
            ko: "`lib/_<service>`에 서비스 모듈을 만듭니다. 데이터베이스 파일은 없습니다.",
          }),
        },
        {
          name: "remove-module <sys:module>",
          href: "/references/cli/module#remove-module",
          desc: l.trans({ en: "Removes a module from an app or lib.", ko: "앱이나 라이브러리에서 모듈을 지웁니다." }),
        },
        {
          name: "create-view <sys:module>",
          href: "/references/cli/module#create-view",
          desc: l.trans({
            en: "Adds a View: the detail screen for one record.",
            ko: "View를 추가합니다. 레코드 하나의 상세 화면입니다.",
          }),
        },
        {
          name: "create-unit <sys:module>",
          href: "/references/cli/module#create-unit",
          desc: l.trans({
            en: "Adds a Unit: one row or card in a list.",
            ko: "Unit을 추가합니다. 목록의 행이나 카드 하나입니다.",
          }),
        },
        {
          name: "create-template <sys:module>",
          href: "/references/cli/module#create-template",
          desc: l.trans({ en: "Adds a Template: the module's form.", ko: "Template을 추가합니다. 모듈의 폼입니다." }),
        },
      ],
    },
    {
      title: l.trans({ en: "Scalar", ko: "스칼라" }),
      href: "/references/cli/scalar",
      desc: l.trans({
        en: "Create value types that live inside other models and have no database table of their own.",
        ko: "다른 모델 안에 들어가는 값 타입을 만듭니다. 자체 데이터베이스 테이블은 없습니다.",
      }),
      commands: [
        {
          name: "create-scalar <scalarName> <app|lib>",
          href: "/references/cli/scalar#create-scalar",
          desc: l.trans({
            en: "Creates a scalar in `lib/__scalar/<scalarName>`.",
            ko: "`lib/__scalar/<scalarName>`에 스칼라를 만듭니다.",
          }),
        },
        {
          name: "remove-scalar <scalarName> <app|lib>",
          href: "/references/cli/scalar#remove-scalar",
          desc: l.trans({ en: "Removes a scalar from an app or lib.", ko: "앱이나 라이브러리에서 스칼라를 지웁니다." }),
        },
      ],
    },
    {
      title: l.trans({ en: "Package", ko: "패키지" }),
      href: "/references/cli/package",
      desc: l.trans({
        en: "Create, build and verify the packages under `pkgs/`.",
        ko: "`pkgs/` 아래의 패키지를 만들고, 빌드하고, 검증합니다.",
      }),
      commands: [
        {
          name: "version",
          href: "/references/cli/package#version",
          desc: l.trans({
            en: "Prints the `akanjs` version the workspace runs.",
            ko: "워크스페이스가 쓰는 `akanjs` 버전을 출력합니다.",
          }),
        },
        {
          name: "create-package --name <name>",
          href: "/references/cli/package#create-package",
          desc: l.trans({ en: "Creates a new package in `pkgs/<name>`.", ko: "`pkgs/<name>`에 새 패키지를 만듭니다." }),
        },
        {
          name: "remove-package <pkg>",
          href: "/references/cli/package#remove-package",
          desc: l.trans({ en: "Removes a package from the workspace.", ko: "워크스페이스에서 패키지를 지웁니다." }),
        },
        {
          name: "sync-package <pkg>",
          href: "/references/cli/package#sync-package",
          desc: l.trans({
            en: "Syncs one package's dependencies and config.",
            ko: "패키지 하나의 의존성과 설정을 동기화합니다.",
          }),
        },
        {
          name: "build-package <pkg>",
          href: "/references/cli/package#build-package",
          desc: l.trans({ en: "Builds a package for distribution.", ko: "배포용으로 패키지를 빌드합니다." }),
        },
        {
          name: "verify-dist-package <pkg>",
          href: "/references/cli/package#verify-dist-package",
          desc: l.trans({
            en: "Checks a built package with an `npm pack` dry run.",
            ko: "빌드된 패키지를 `npm pack` dry run으로 확인합니다.",
          }),
        },
      ],
    },
    {
      title: l.trans({ en: "Page", ko: "페이지" }),
      href: "/references/cli/page",
      desc: l.trans({
        en: "Generate CRUD routes in an app for a module that already exists.",
        ko: "이미 있는 모듈을 위한 CRUD route를 앱 안에 생성합니다.",
      }),
      commands: [
        {
          name: "create-crud-page <app> <sys:module>",
          href: "/references/cli/page#create-crud-page",
          desc: l.trans({
            en: "Creates the list, detail, create and edit pages for the module.",
            ko: "모듈의 목록, 상세, 생성, 수정 페이지를 만듭니다.",
          }),
        },
      ],
    },
    {
      title: l.trans({ en: "Primitive", ko: "프리미티브" }),
      href: "/references/cli/primitive",
      desc: l.trans({
        en: "Add one piece to a module that already exists: a UI file, a field, or an enum field.",
        ko: "이미 있는 모듈에 조각 하나를 더합니다. UI 파일, 필드, enum 필드 중 하나입니다.",
      }),
      commands: [
        {
          name: "create-ui --module <module>",
          href: "/references/cli/primitive#create-ui",
          desc: l.trans({
            en: "Adds one View, Unit or Template. `--surface` picks which, and defaults to `template`.",
            ko: "View, Unit, Template 중 하나를 추가합니다. `--surface`로 고르며 기본값은 `template`입니다.",
          }),
        },
        {
          name: "add-field --field <field>",
          href: "/references/cli/primitive#add-field",
          desc: l.trans({
            en: "Adds one field to the module's constant and dictionary.",
            ko: "모듈의 constant와 dictionary에 필드 하나를 추가합니다.",
          }),
        },
        {
          name: "add-enum-field --values <a,b,c>",
          href: "/references/cli/primitive#add-enum-field",
          desc: l.trans({
            en: "Adds one enum field whose values are the comma-separated list.",
            ko: "쉼표로 구분한 값 목록으로 enum 필드 하나를 추가합니다.",
          }),
        },
      ],
    },
    {
      title: l.trans({ en: "Workflow", ko: "워크플로" }),
      href: "/references/cli/workflow",
      desc: l.trans({
        en: "Plan a change, read the plan, apply it, validate the result, and repair what validation caught.",
        ko: "변경을 계획하고, 계획을 읽고, 적용하고, 결과를 검증하고, 검증이 잡은 문제를 고칩니다.",
      }),
      commands: [
        {
          name: "workflow list",
          href: "/references/cli/workflow#workflow",
          desc: l.trans({ en: "Lists the available workflows.", ko: "쓸 수 있는 워크플로를 나열합니다." }),
        },
        {
          name: "workflow explain <name>",
          href: "/references/cli/workflow#workflow",
          desc: l.trans({ en: "Explains one workflow.", ko: "워크플로 하나를 설명합니다." }),
        },
        {
          name: "workflow plan <name> --out <path>",
          href: "/references/cli/workflow#workflow",
          desc: l.trans({
            en: "Plans a change and writes the plan JSON to `--out`, without touching source.",
            ko: "변경을 계획하고 계획 JSON을 `--out`에 씁니다. 소스는 건드리지 않습니다.",
          }),
        },
        {
          name: "workflow apply <planPath>",
          href: "/references/cli/workflow#workflow",
          desc: l.trans({
            en: "Applies a plan. `--dry-run` shows the predicted report without writing files.",
            ko: "계획을 적용합니다. `--dry-run`은 파일을 쓰지 않고 예상 보고서만 보여 줍니다.",
          }),
        },
        {
          name: "workflow validate <runId>",
          href: "/references/cli/workflow#workflow",
          desc: l.trans({ en: "Validates what a run changed.", ko: "실행이 바꾼 내용을 검증합니다." }),
        },
        {
          name: "workflow report <runId>",
          href: "/references/cli/workflow#workflow",
          desc: l.trans({ en: "Prints the report of a run.", ko: "실행의 보고서를 출력합니다." }),
        },
        {
          name: "repair <kind>",
          href: "/references/cli/workflow#repair",
          desc: l.trans({
            en: "Runs one narrow repair: `generated`, `format`, `imports`, `dictionary` or `module-shape`.",
            ko: "좁은 범위의 복구 하나를 실행합니다. `generated`, `format`, `imports`, `dictionary`, `module-shape` 중 하나입니다.",
          }),
        },
      ],
    },
    {
      title: l.trans({ en: "Quality", ko: "품질" }),
      href: "/references/cli/quality",
      desc: l.trans({
        en: "Report code-quality warnings for every app and lib, and measure each one's server render share.",
        ko: "모든 앱과 라이브러리의 코드 품질 경고를 보고하고, 각각의 server render share를 잽니다.",
      }),
      commands: [
        {
          name: "quality scan",
          href: "/references/cli/quality#quality",
          desc: l.trans({
            en: "Reports code-quality warnings across every app and lib. `akan quality` alone runs this.",
            ko: "모든 앱과 라이브러리의 코드 품질 경고를 보고합니다. `akan quality`만 써도 이것이 실행됩니다.",
          }),
        },
        {
          name: "quality ssr",
          href: "/references/cli/quality#quality",
          desc: l.trans({
            en: "Prints each app's and lib's server render share and its SSR warnings.",
            ko: "앱과 라이브러리마다 server render share와 SSR 경고를 출력합니다.",
          }),
        },
        {
          name: "quality ssr --format json",
          href: "/references/cli/quality#quality",
          desc: l.trans({
            en: "The same report as JSON, for tooling.",
            ko: "같은 보고서를 도구용 JSON으로 출력합니다.",
          }),
        },
      ],
    },
    {
      title: l.trans({ en: "Cloud", ko: "클라우드" }),
      href: "/references/cli/cloud",
      desc: l.trans({
        en: "Optional helpers: Akan Cloud sign-in, environment transfer and framework updates.",
        ko: "선택 기능입니다. Akan Cloud 로그인, 환경 변수 전송, 프레임워크 업데이트를 맡습니다.",
      }),
      commands: [
        {
          name: ["login", "logout"],
          href: ["/references/cli/cloud#login", "/references/cli/cloud#logout"],
          desc: l.trans({ en: "Signs in to or out of Akan Cloud.", ko: "Akan Cloud에 로그인하거나 로그아웃합니다." }),
        },
        {
          name: "update",
          href: "/references/cli/cloud#update",
          desc: l.trans({
            en: "Updates Akan.js to the latest version.",
            ko: "Akan.js를 최신 버전으로 업데이트합니다.",
          }),
        },
        {
          name: ["download-env", "upload-env"],
          href: ["/references/cli/cloud#download-env", "/references/cli/cloud#upload-env"],
          desc: l.trans({
            en: "Downloads or uploads environment variables, from or to the cloud or an SCP server.",
            ko: "클라우드나 SCP 서버에서 환경 변수를 내려받거나 올립니다.",
          }),
        },
      ],
    },
    {
      title: l.trans({ en: "Tunnel", ko: "터널" }),
      href: "/references/cli/tunnel",
      desc: l.trans({
        en: "Share a locally running app on a public URL as a command of its own, outside a dev session.",
        ko: "로컬에서 실행 중인 앱을 공개 URL로 공유합니다. 개발 세션과 별개인 독립 명령입니다.",
      }),
      commands: [
        {
          name: "tunnel [app]",
          href: "/references/cli/tunnel#tunnel",
          desc: l.trans({
            en: "Shares a running app on a public URL. `--ttl` sets the minutes before it expires.",
            ko: "실행 중인 앱을 공개 URL로 공유합니다. `--ttl`로 만료까지의 시간(분)을 정합니다.",
          }),
        },
        {
          name: "tunnel --list",
          href: "/references/cli/tunnel#tunnel",
          desc: l.trans({ en: "Lists the shares this account holds.", ko: "이 계정이 열어 둔 공유를 나열합니다." }),
        },
        {
          name: "tunnel --stop <code>",
          href: "/references/cli/tunnel#tunnel",
          desc: l.trans({ en: "Stops the share with that code.", ko: "해당 코드의 공유를 멈춥니다." }),
        },
      ],
    },
    {
      title: l.trans({ en: "Context And MCP", ko: "컨텍스트와 MCP" }),
      href: "/references/cli/context",
      desc: l.trans({
        en: "Hand coding agents the workspace context, convention diagnostics and the Akan MCP tools.",
        ko: "코딩 에이전트에게 워크스페이스 컨텍스트, 컨벤션 진단, Akan MCP 툴을 건넵니다.",
      }),
      commands: [
        {
          name: "context --format json",
          href: "/references/cli/context#context",
          desc: l.trans({
            en: "Prints the workspace context for agents. `--module` adds that module's abstract.",
            ko: "에이전트용 워크스페이스 컨텍스트를 출력합니다. `--module`을 주면 그 모듈의 abstract도 넣습니다.",
          }),
        },
        {
          name: "doctor --format json",
          href: "/references/cli/context#doctor",
          desc: l.trans({
            en: "Reports where the workspace drifts from Akan conventions.",
            ko: "워크스페이스가 Akan 컨벤션에서 벗어난 곳을 보고합니다.",
          }),
        },
        {
          name: "mcp --mode plan",
          href: "/references/cli/context#mcp",
          desc: l.trans({
            en: "Starts the Akan MCP server over stdio. `--mode` is `readonly` (default), `plan` or `apply`.",
            ko: "Akan MCP 서버를 stdio로 띄웁니다. 범위는 `--mode`로 `readonly`(기본값), `plan`, `apply` 중에서 정합니다.",
          }),
        },
        {
          name: "mcp-install [target]",
          desc: l.trans({
            en: "Writes the Akan MCP server entry for Cursor, Claude Code or Codex, or all three when left off.",
            ko: "Cursor, Claude Code, Codex 설정에 Akan MCP 서버 항목을 씁니다. 생략하면 셋 모두 씁니다.",
          }),
        },
      ],
    },
    {
      title: l.trans({ en: "Agent Rules", ko: "에이전트 규칙" }),
      href: "/references/cli/agent",
      desc: l.trans({
        en: "Install the rule files that editors and coding agents read.",
        ko: "에디터와 코딩 에이전트가 읽는 규칙 파일을 설치합니다.",
      }),
      commands: [
        {
          name: "agent install [target]",
          href: "/references/cli/agent#agent",
          desc: l.trans({
            en: "Writes the rules for `cursor`, `agents-md` or `claude`, or all three when left off.",
            ko: "`cursor`, `agents-md`, `claude` 규칙을 씁니다. 생략하면 셋 모두 씁니다.",
          }),
        },
      ],
    },
    {
      title: l.trans({ en: "Code Agent", ko: "코드 에이전트" }),
      href: "/references/cli/code",
      desc: l.trans({
        en: "Run the Akan coding agent in the terminal, with the workspace's own tools and skills.",
        ko: "워크스페이스의 툴과 스킬을 갖춘 Akan 코딩 에이전트를 터미널에서 실행합니다.",
      }),
      commands: [
        {
          name: "code [prompt]",
          href: "/references/cli/code#code",
          desc: l.trans({
            en: "Runs the agent on a prompt. Without one, it opens the full-screen session.",
            ko: "프롬프트 하나로 에이전트를 실행합니다. 프롬프트가 없으면 전체 화면 세션을 엽니다.",
          }),
        },
        {
          name: "code --profile review",
          href: "/references/cli/code#code",
          desc: l.trans({
            en: "Picks a profile: `local` (default), `pod`, `review` or `web`.",
            ko: "프로필을 `local`(기본값), `pod`, `review`, `web` 중에서 고릅니다.",
          }),
        },
        {
          name: "code --resume <session-id>",
          href: "/references/cli/code#code",
          desc: l.trans({ en: "Continues a stored session by its id.", ko: "저장된 세션을 id로 이어 갑니다." }),
        },
      ],
    },
    {
      title: l.trans({ en: "Guideline", ko: "가이드라인" }),
      href: "/references/cli/guideline",
      desc: l.trans({
        en: "Print the Akan guidelines that coding agents read.",
        ko: "코딩 에이전트가 읽는 Akan 가이드라인을 출력합니다.",
      }),
      commands: [
        {
          name: "guideline list",
          href: "/references/cli/guideline#guideline",
          desc: l.trans({ en: "Lists every guideline name.", ko: "모든 가이드라인 이름을 나열합니다." }),
        },
        {
          name: "guideline show framework",
          href: "/references/cli/guideline#guideline",
          desc: l.trans({
            en: "Prints one guideline by name, here `framework`.",
            ko: "이름으로 가이드라인 하나를 출력합니다. 예시는 `framework`입니다.",
          }),
        },
      ],
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="cli-commands" title={l.trans({ en: "CLI Commands", ko: "CLI 명령" })}>
        <Docs.Title>{l.trans({ en: "CLI Commands", ko: "CLI 명령" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The <code>akan</code> CLI runs the whole workspace lifecycle: creating workspaces and apps, generating
                  code, local development, mobile builds, local databases and optional cloud helpers.
                </span>
              ),
              ko: (
                <span>
                  <code>akan</code> CLI는 워크스페이스의 처음부터 끝까지를 맡습니다. 워크스페이스와 앱 생성, 코드 생성,
                  로컬 개발, 모바일 빌드, 로컬 데이터베이스, 선택 기능인 클라우드 도구까지 다룹니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "This page is the index. Each group links to a detail page with argument tables, option tables, notes and terminal examples.",
              ko: "이 페이지는 색인입니다. 그룹마다 인자 표, 옵션 표, 주의 사항, 터미널 예시가 담긴 상세 페이지로 연결됩니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Reading a command line", ko: "명령 표기 읽는 법" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Notation", ko: "표기" })} items={notationRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="shared-behaviour" title={l.trans({ en: "Shared Behaviour", ko: "공통 동작" })}>
        <Docs.Title>{l.trans({ en: "Shared Behaviour", ko: "공통 동작" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "These hold for every command, so the detail pages do not repeat them.",
              ko: "아래 내용은 모든 명령에 똑같이 적용되므로, 상세 페이지에서는 반복하지 않습니다.",
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {sharedCards.map(({ title, code, desc }) => (
              <div key={code} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{title}</div>
                <code className={chip}>{code}</code>
                <div className="mt-2 text-foreground/70 text-sm">
                  <Docs.CodeText>{desc}</Docs.CodeText>
                </div>
              </div>
            ))}
          </div>
          <Docs.Table
            columns={[
              { key: "alias", label: l.trans({ en: "Alias", ko: "별칭" }), code: true },
              { key: "command", label: l.trans({ en: "Runs", ko: "실행되는 명령" }), code: true },
            ]}
            rows={aliasRows}
          />
          <Docs.SubSubTitle>{l.trans({ en: "When a value is left off", ko: "값을 생략했을 때" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A value left off is filled from its default, or the command asks you for it.",
              ko: "생략한 값은 기본값으로 채우거나, 명령이 직접 물어봅니다.",
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "left", label: l.trans({ en: "Left off", ko: "생략한 값" }) },
              { key: "result", label: l.trans({ en: "What the CLI does", ko: "CLI의 동작" }) },
            ]}
            rows={omittedRows}
            stacked
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="validation-order" title={l.trans({ en: "Validation Order", ko: "검증 순서" })}>
        <Docs.Title>{l.trans({ en: "Validation Order", ko: "검증 순서" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Before you call a change done, run these five in order. It is the order the workspace's agent guide,{" "}
                  <code>AGENTS.md</code>, prescribes.
                </span>
              ),
              ko: (
                <span>
                  변경을 마쳤다고 하기 전에 아래 다섯 가지를 순서대로 실행합니다. 워크스페이스의 에이전트 가이드인{" "}
                  <code>AGENTS.md</code>가 정한 순서입니다.
                </span>
              ),
            })}
          </div>
          <ol className="my-4 list-decimal space-y-2 pl-5">
            {validationSteps.map(({ command, desc }) => (
              <li key={command}>
                <code>{command}</code>
                <div className="text-foreground/70 text-sm">{desc}</div>
              </li>
            ))}
          </ol>
          <Docs.SubSubTitle>{l.trans({ en: "Reports, not gates", ko: "보고만 하는 명령" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "These three only print a report, so they never fail the run. Read them before a review.",
              ko: "아래 세 명령은 보고서만 출력하므로 실행을 실패시키지 않습니다. 리뷰 전에 읽어 두세요.",
            })}
          </div>
          <Docs.IntroTable type={commandLabel} items={reportRows} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="command-index" title={l.trans({ en: "Command Index", ko: "명령 색인" })}>
        <Docs.Title>{l.trans({ en: "Command Index", ko: "명령 색인" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Every name below follows <code>akan</code>, as in <code>akan lint myapp</code>. Open a group title for
                  its arguments, options and examples.
                </span>
              ),
              ko: (
                <span>
                  아래 이름은 모두 <code>akan</code> 뒤에 붙여 씁니다. 예: <code>akan lint myapp</code>. 그룹 제목을
                  누르면 인자, 옵션, 예시가 있는 상세 페이지로 갑니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "Internal and development-only commands are left out on purpose.",
              ko: "내부용 명령과 개발 전용 명령은 일부러 뺐습니다.",
            })}
          </div>
          {commandGroups.map(({ title, href, desc, commands }) => (
            <div key={title} className="mt-8">
              <Docs.SubSubTitle>
                <Link href={href} className="hover:underline">
                  {title} →
                </Link>
              </Docs.SubSubTitle>
              <div className="text-foreground/70 text-sm">
                <Docs.CodeText>{desc}</Docs.CodeText>
              </div>
              <Docs.IntroTable type={commandLabel} items={commands} className="md:grid-cols-[16rem_minmax(0,1fr)]" />
            </div>
          ))}
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
