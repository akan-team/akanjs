import { usePage } from "@apps/akan/client";
import {
  type CommandReferenceItem,
  CommandReferenceSlide,
  Divider,
  Docs,
  DocsToc,
  type ReferenceRow,
} from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Fragment } from "react";

export default page().render(() => {
  const { l } = usePage();

  const writeOption: ReferenceRow = {
    name: "--write",
    type: "Boolean",
    defaultValue: "true",
    desc: l.trans({
      en: "Run `akan sync` first so generated files are current.",
      ko: "먼저 `akan sync`를 실행해 생성 파일을 최신으로 맞춥니다.",
    }),
  };
  const targetOption: ReferenceRow = {
    name: "--target",
    type: "String",
    desc: l.trans({
      en: "A key of `mobile.targets` in `akan.config.ts`, or `all`. Asked for when there are several.",
      ko: "`akan.config.ts`의 `mobile.targets` 키 또는 `all`입니다. 타깃이 여럿이면 물어봅니다.",
    }),
  };
  const envDesc = l.trans({
    en: "Backend environment the app connects to.",
    ko: "앱이 연결할 백엔드 환경입니다.",
  });
  const debugEnvOption: ReferenceRow = {
    name: "--env",
    type: "String",
    defaultValue: "debug",
    enumOrFlag: "local | debug | develop | main",
    desc: envDesc,
  };
  const localEnvOption: ReferenceRow = {
    name: "--env",
    type: "String",
    defaultValue: "local",
    enumOrFlag: "local | debug | develop | main",
    desc: envDesc,
  };
  const releaseEnvOption: ReferenceRow = {
    name: "--env",
    type: "String",
    defaultValue: "main",
    enumOrFlag: "debug | develop | main | local",
    desc: envDesc,
  };
  const regenerateOption: ReferenceRow = {
    name: "--regenerate",
    type: "Boolean",
    defaultValue: "false",
    enumOrFlag: "-g",
    desc: l.trans({
      en: "Delete the native project folder and generate it again.",
      ko: "네이티브 프로젝트 폴더를 지우고 새로 만듭니다.",
    }),
  };
  const allowLocalReleaseOption: ReferenceRow = {
    name: "--allow-local-release",
    type: "Boolean",
    defaultValue: "false",
    enumOrFlag: "-l",
    desc: l.trans({
      en: "Allow a release built with `--env local`.",
      ko: "`--env local`로 만든 릴리스를 허용합니다.",
    }),
  };
  const releaseModeOption: ReferenceRow = {
    name: "--release",
    type: "Boolean",
    defaultValue: "false",
    desc: l.trans({
      en: "Bundle a production web build into the app instead of loading the dev server.",
      ko: "개발 서버를 불러오는 대신 배포용 웹 빌드를 앱에 넣습니다.",
    }),
  };
  const aliasNote = (alias: string): ReferenceRow => ({
    name: l.trans({ en: "alias", ko: "줄임 명령" }),
    desc: l.trans({ en: `\`akan ${alias}\` runs this command.`, ko: `\`akan ${alias}\`로도 실행합니다.` }),
  });
  const devServerNote: ReferenceRow = {
    name: l.trans({ en: "dev server", ko: "개발 서버" }),
    desc: l.trans({
      en: "Without `--release` the app loads from the dev server, so keep `akan start <app>` running.",
      ko: "`--release` 없이 실행하면 앱이 개발 서버에서 화면을 불러오므로 `akan start <app>`을 켜 둡니다.",
    }),
  };
  const singleTargetNote: ReferenceRow = {
    name: l.trans({ en: "one target", ko: "타깃 하나" }),
    desc: l.trans({
      en: "Works only when the app has one mobile target, since it takes no `--target`.",
      ko: "`--target` 옵션이 없어 모바일 타깃이 하나인 앱에서만 동작합니다.",
    }),
  };
  const signingNote: ReferenceRow = {
    name: l.trans({ en: "signing", ko: "서명" }),
    desc: l.trans({
      en: "Needs release signing keys in `android/gradle.properties` or `ORG_GRADLE_PROJECT_*` env vars.",
      ko: "`android/gradle.properties`나 `ORG_GRADLE_PROJECT_*` 환경 변수에 릴리스 서명 키가 있어야 합니다.",
    }),
  };

  const catalogue = [
    {
      label: l.trans({ en: "Manage Apps", ko: "앱 관리" }),
      items: [
        {
          name: "create-application",
          href: "#create-application",
          desc: l.trans({
            en: "Create a new app under `apps/` from the template.",
            ko: "템플릿으로 `apps/` 아래에 새 앱을 만듭니다.",
          }),
        },
        {
          name: "remove-application",
          href: "#remove-application",
          desc: l.trans({
            en: "Delete an app's folder from the workspace.",
            ko: "워크스페이스에서 앱 폴더를 지웁니다.",
          }),
        },
        {
          name: "sync",
          href: "#sync",
          desc: l.trans({
            en: "Regenerate the generated files of an app or library.",
            ko: "앱이나 라이브러리의 생성 파일을 다시 만듭니다.",
          }),
        },
        {
          name: "plan-slice",
          href: "#plan-slice",
          desc: l.trans({
            en: "List the files an app needs to move into a workspace of its own.",
            ko: "앱을 별도 워크스페이스로 옮길 때 필요한 파일을 나열합니다.",
          }),
        },
      ],
    },
    {
      label: l.trans({ en: "Local Development", ko: "로컬 개발" }),
      items: [
        {
          name: "start",
          href: "#start",
          desc: l.trans({
            en: "Run the dev server for one or more apps.",
            ko: "앱 하나 또는 여럿을 개발 서버로 띄웁니다.",
          }),
        },
        {
          name: "dbup",
          href: "#dbup",
          desc: l.trans({ en: "Start the local database containers.", ko: "로컬 데이터베이스 컨테이너를 띄웁니다." }),
        },
        {
          name: "dbdown",
          href: "#dbdown",
          desc: l.trans({ en: "Stop the local database containers.", ko: "로컬 데이터베이스 컨테이너를 내립니다." }),
        },
        {
          name: ["db-export", "db-import"],
          href: ["#db-export", "#db-import"],
          desc: l.trans({
            en: "Copy an app's data out of one database mode and into another.",
            ko: "앱의 데이터를 한 데이터베이스 모드에서 꺼내 다른 모드로 옮깁니다.",
          }),
        },
        {
          name: "script",
          href: "#script",
          desc: l.trans({
            en: "Run a file from the app's `script/` folder.",
            ko: "앱의 `script/` 폴더에 있는 파일을 실행합니다.",
          }),
        },
        {
          name: "console",
          href: "#console",
          desc: l.trans({ en: "Open an interactive server console.", ko: "대화형 서버 콘솔을 엽니다." }),
        },
        {
          name: "logs",
          href: "#logs",
          desc: l.trans({
            en: "Follow a running app's logs, filtered.",
            ko: "실행 중인 앱의 로그를 필터로 걸러 봅니다.",
          }),
        },
      ],
    },
    {
      label: l.trans({ en: "Check and Build", ko: "검사와 빌드" }),
      items: [
        {
          name: "typecheck",
          href: "#typecheck",
          desc: l.trans({ en: "Typecheck the app.", ko: "앱의 타입을 검사합니다." }),
        },
        {
          name: "test",
          href: "#test",
          desc: l.trans({
            en: "Run the tests of an app, library or package.",
            ko: "앱, 라이브러리, 패키지의 테스트를 실행합니다.",
          }),
        },
        {
          name: "build",
          href: "#build",
          desc: l.trans({
            en: "Build the app for production into `dist/apps/<app>`.",
            ko: "배포용 빌드를 `dist/apps/<app>`에 만듭니다.",
          }),
        },
      ],
    },
    {
      label: l.trans({ en: "Mobile", ko: "모바일" }),
      items: [
        {
          name: ["start-ios", "start-android"],
          href: ["#start-ios", "#start-android"],
          desc: l.trans({
            en: "Run the app on a simulator, an emulator or a connected device.",
            ko: "시뮬레이터, 에뮬레이터, 연결된 기기에서 앱을 실행합니다.",
          }),
        },
        {
          name: ["build-ios", "build-android"],
          href: ["#build-ios", "#build-android"],
          desc: l.trans({
            en: "Build the native app with Capacitor.",
            ko: "Capacitor로 네이티브 앱을 빌드합니다.",
          }),
        },
        {
          name: ["release-ios", "release-android"],
          href: ["#release-ios", "#release-android"],
          desc: l.trans({
            en: "Build the app for an App Store or Play Store release.",
            ko: "App Store나 Play Store 출시용으로 앱을 빌드합니다.",
          }),
        },
        // {
        //   name: "release-source",
        //   desc: l.trans({
        //     en: "Package the build and source and push them to Akan Cloud as a release.",
        //     ko: "빌드와 소스를 묶어 Akan Cloud에 릴리스로 올립니다.",
        //   }),
        // },
        // {
        //   name: "configure-app",
        //   desc: l.trans({
        //     en: "Add camera, contacts or location permissions to the native projects.",
        //     ko: "네이티브 프로젝트에 카메라, 연락처, 위치 권한을 추가합니다.",
        //   }),
        // },
        // {
        //   name: "codepush",
        //   desc: l.trans({
        //     en: "Reserved for over-the-air updates; it does not deploy anything yet.",
        //     ko: "OTA 업데이트용 자리입니다. 아직 실제로 배포하지는 않습니다.",
        //   }),
        // },
      ],
    },
  ];

  const aliasRows = [
    { alias: "akan b", command: "akan build" },
    { alias: "akan t", command: "akan typecheck" },
    { alias: "akan s", command: "akan start" },
    { alias: "akan bi", command: "akan build-ios" },
    { alias: "akan ba", command: "akan build-android" },
    { alias: "akan si", command: "akan start-ios" },
    { alias: "akan sa", command: "akan start-android" },
  ];

  const commands: CommandReferenceItem[] = [
    {
      name: "create-application",
      signature: "akan create-application <appName> [--start <boolean>]",
      desc: l.trans({
        en: "Create `apps/<appName>` from the app template, then sync it. With `--start` it also boots the dev server.",
        ko: "앱 템플릿으로 `apps/<appName>`을 만들고 sync까지 실행합니다. `--start`를 주면 개발 서버도 바로 띄웁니다.",
      }),
      args: [
        {
          name: "appName",
          type: "String",
          required: "yes",
          desc: l.trans({
            en: "App name. It is lowercased, and spaces become hyphens.",
            ko: "앱 이름입니다. 소문자로 바뀌고 공백은 하이픈이 됩니다.",
          }),
        },
      ],
      options: [
        {
          name: "--start",
          type: "Boolean",
          defaultValue: "false",
          desc: l.trans({
            en: "Start the dev server and open the browser once the app is created.",
            ko: "앱을 만든 직후 개발 서버를 띄우고 브라우저를 엽니다.",
          }),
        },
      ],
      examples: `akan create-application blog
akan create-application blog --start true`,
    },
    {
      name: "remove-application",
      signature: "akan remove-application <app>",
      desc: l.trans({
        en: "Delete the `apps/<app>` folder, so the app drops out of sync, builds and deployment. Commit first if you may want it back.",
        ko: "`apps/<app>` 폴더를 지워 앱을 sync, 빌드, 배포에서 뺍니다. 되살릴 수도 있다면 먼저 커밋해 둡니다.",
      }),
      examples: "akan remove-application blog",
    },
    {
      name: "sync",
      signature: "akan sync <app|lib>",
      desc: l.trans({
        en: "Rescan an app or library and rewrite its generated files. Run it after adding, renaming or deleting a file, or after changing its imports.",
        ko: "앱이나 라이브러리를 다시 스캔해 생성 파일을 새로 씁니다. 파일을 추가·이름 변경·삭제했거나 import를 바꾼 뒤에 실행합니다.",
      }),
      notes: [
        {
          name: l.trans({ en: "generated files", ko: "생성 파일" }),
          desc: l.trans({
            en: "Barrels like `index.ts`, `cnst.ts` and `st.ts`, `akan.<app|lib>.json`, and the scoped `AGENTS.md`.",
            ko: "`index.ts`, `cnst.ts`, `st.ts` 같은 배럴 파일, `akan.<app|lib>.json`, 범위별 `AGENTS.md`입니다.",
          }),
        },
        {
          name: l.trans({ en: "dependencies", ko: "의존성" }),
          desc: l.trans({
            en: "Each package the code imports is written into its own `package.json`, at the root's version.",
            ko: "코드가 import하는 패키지를 루트와 같은 버전으로 자기 `package.json`에 적습니다.",
          }),
        },
        {
          name: l.trans({ en: "apps only", ko: "앱에서만" }),
          desc: l.trans({
            en: "Also links lib assets into `public/libs` and, with `syncPageLibs`, lib routes into `page/(libs)`.",
            ko: "lib 에셋을 `public/libs`에 연결하고, `syncPageLibs`를 켰다면 lib 라우트도 `page/(libs)`에 연결합니다.",
          }),
        },
        {
          name: l.trans({ en: "run for you", ko: "자동 실행" }),
          desc: l.trans({
            en: "`start`, `build`, `typecheck` and `test` run it first through `--write`.",
            ko: "`start`, `build`, `typecheck`, `test`는 `--write`로 이 작업을 먼저 실행합니다.",
          }),
        },
      ],
      examples: `akan sync myapp
akan sync util`,
    },
    {
      name: "plan-slice",
      signature: "akan plan-slice <app> [--format <text|json>]",
      desc: l.trans({
        en: "Print the exact files an app needs to live in a workspace of its own. It only prints the plan and writes nothing.",
        ko: "앱이 독립된 워크스페이스로 옮겨 갈 때 필요한 파일을 정확히 출력합니다. 계획만 보여 주고 아무것도 쓰지 않습니다.",
      }),
      options: [
        {
          name: "--format",
          type: "String",
          defaultValue: "text",
          enumOrFlag: "text | json",
          desc: l.trans({ en: "Output format.", ko: "출력 형식입니다." }),
        },
      ],
      notes: [
        {
          name: l.trans({ en: "contents", ko: "담기는 것" }),
          desc: l.trans({
            en: "The app, every lib it reaches, the workspace shell around them, and a root `package.json`.",
            ko: "앱, 앱이 닿는 모든 lib, 이를 감싸는 워크스페이스 뼈대, 루트 `package.json`입니다.",
          }),
        },
        {
          name: l.trans({ en: "file source", ko: "파일 출처" }),
          desc: l.trans({
            en: "Files come from git, so gitignored files such as env values are left out.",
            ko: "파일 목록을 git에서 가져오므로 env 값처럼 gitignore된 파일은 빠집니다.",
          }),
        },
        {
          name: l.trans({ en: "root manifest", ko: "루트 매니페스트" }),
          desc: l.trans({
            en: "Keeps only the packages the slice imports, at the workspace's own version specs.",
            ko: "슬라이스가 import하는 패키지만 워크스페이스의 버전 그대로 남깁니다.",
          }),
        },
        {
          name: l.trans({ en: "warnings", ko: "경고" }),
          desc: l.trans({
            en: "Untracked files under the app or its libs are listed, because git would not carry them.",
            ko: "앱이나 lib 아래의 추적되지 않는 파일은 git이 옮기지 않으므로 경고로 나열합니다.",
          }),
        },
      ],
      examples: `akan plan-slice myapp
akan plan-slice myapp --format json`,
    },
    {
      name: "start",
      signature:
        "akan start [apps...] [--plain <boolean>] [--kill <boolean>] [--concurrency <number>] [--dbup <boolean>] [--open <boolean>] [--share <boolean>] [--write <boolean>]",
      desc: l.trans({
        en: "Run the dev server, SSR frontend and backend together. Name apps space- or comma-separated, pass `all`, or leave them out to tick them in a checklist. Several apps share one session.",
        ko: "SSR 프론트엔드와 백엔드를 함께 띄우는 개발 서버입니다. 앱은 공백이나 쉼표로 나열하거나 `all`을 주고, 생략하면 체크 목록에서 고릅니다. 여러 앱도 한 세션에서 함께 돌아갑니다.",
      }),
      options: [
        {
          name: "--plain",
          type: "Boolean",
          defaultValue: "false",
          desc: l.trans({
            en: "Print prefixed, interleaved lines instead of the full-screen view.",
            ko: "전체 화면 뷰 대신 앱 이름이 붙은 줄을 섞어 출력합니다.",
          }),
        },
        {
          name: "--kill",
          type: "Boolean",
          defaultValue: "false",
          desc: l.trans({
            en: "Free the dev ports first. A holder that is not an akan process is reported and left alone.",
            ko: "개발 포트를 먼저 비웁니다. akan 프로세스가 아닌 점유자는 알리기만 하고 그대로 둡니다.",
          }),
        },
        {
          name: "--concurrency",
          type: "Number",
          desc: l.trans({
            en: "Apps booted at a time. Unset: the lower of half the memory ÷ 900MB and cores ÷ 4.",
            ko: "동시에 부팅할 앱 수입니다. 비우면 (메모리 절반 ÷ 900MB)와 (코어 수 ÷ 4) 중 작은 값입니다.",
          }),
        },
        {
          name: "--dbup",
          type: "Boolean",
          defaultValue: "true",
          desc: l.trans({
            en: "Start the local services of the mode each app runs in first. On exit it stops only what it started.",
            ko: "앱마다 실행할 모드의 로컬 서비스를 먼저 띄웁니다. 끝날 때는 자기가 띄운 것만 내립니다.",
          }),
        },
        {
          name: "--open",
          type: "Boolean",
          defaultValue: "false",
          desc: l.trans({ en: "Open the app in the browser.", ko: "브라우저로 앱을 엽니다." }),
        },
        {
          name: "--share",
          type: "Boolean",
          defaultValue: "false",
          desc: l.trans({
            en: "Also publish each app on a public URL through an akan tunnel. `s` in the view copies it.",
            ko: "akan 터널로 각 앱을 공개 URL에도 올립니다. 뷰에서 `s`를 누르면 복사됩니다.",
          }),
        },
        writeOption,
      ],
      notes: [
        aliasNote("s"),
        {
          name: l.trans({ en: "plain output", ko: "자동 전환" }),
          desc: l.trans({
            en: "A pipe, a redirect or a terminal with no size switches to `--plain` on its own.",
            ko: "파이프, 리다이렉트, 크기를 알 수 없는 터미널에서는 저절로 `--plain`이 됩니다.",
          }),
        },
        {
          name: l.trans({ en: "session log", ko: "세션 로그" }),
          desc: l.trans({
            en: "Each app writes `local/apps/<app>/runtime/dev.log`, except one app under `--plain`.",
            ko: "앱마다 `local/apps/<app>/runtime/dev.log`에 기록합니다. 앱 하나를 `--plain`으로 띄울 때만 빠집니다.",
          }),
        },
        {
          name: l.trans({ en: "memory budget", ko: "메모리 예산" }),
          desc: l.trans({
            en: "`AKAN_MEMORY_LIMIT` lowers the memory `--concurrency` is derived from.",
            ko: "`AKAN_MEMORY_LIMIT`을 주면 `--concurrency` 계산에 쓰는 메모리가 줄어듭니다.",
          }),
        },
      ],
      examples: `akan start myapp
akan start myapp,admin --concurrency 2
akan start all --kill true --plain true
akan start myapp --share true`,
    },
    {
      name: "dbup",
      signature: "akan dbup [--mode <mode>]",
      desc: l.trans({
        en: "Start the local database services with Docker Compose: Redis for `multiple`, Redis and Postgres 18 for `cluster`. `akan start` already runs it unless `--dbup false`.",
        ko: "Docker Compose로 로컬 데이터베이스 서비스를 띄웁니다. `multiple`에는 Redis를, `cluster`에는 Redis와 Postgres 18을 띄웁니다. `akan start`는 `--dbup false`가 아니면 이 작업을 알아서 합니다.",
      }),
      options: [
        {
          name: "--mode",
          type: "String",
          enumOrFlag: "single | multiple | cluster",
          desc: l.trans({
            en: "Start one mode's services; `single` needs none. Left out, every mode the workspace's apps declare.",
            ko: "한 모드의 서비스만 띄웁니다. `single`에는 필요한 서비스가 없습니다. 빼면 워크스페이스의 앱들이 선언한 모든 모드를 띄웁니다.",
          }),
        },
      ],
      notes: [
        {
          name: "Docker",
          desc: l.trans({
            en: "Needs a running Docker daemon. Services already running are left as they are.",
            ko: "Docker 데몬이 실행 중이어야 합니다. 이미 떠 있는 서비스는 그대로 둡니다.",
          }),
        },
        {
          name: l.trans({ en: "compose file", ko: "compose 파일" }),
          desc: l.trans({
            en: "`local/docker-compose.yaml` is written on first use and then left to you.",
            ko: "`local/docker-compose.yaml`은 처음 실행할 때 만들어지고, 그 뒤로는 직접 관리합니다.",
          }),
        },
        {
          name: l.trans({ en: "missing service", ko: "빠진 서비스" }),
          desc: l.trans({
            en: "An older compose file may lack one. Add it, or move the file aside to get the current template.",
            ko: "예전 compose 파일에는 서비스가 빠져 있을 수 있습니다. 직접 더하거나, 파일을 치워 두면 현재 템플릿으로 새로 만듭니다.",
          }),
        },
      ],
      examples: `akan dbup
akan dbup --mode multiple
akan dbup --mode cluster`,
    },
    {
      name: "dbdown",
      signature: "akan dbdown",
      desc: l.trans({
        en: "Stop the local database with `docker compose down` in `local/`. Every service of that compose project stops, whichever app started it.",
        ko: "`local/`에서 `docker compose down`을 실행해 로컬 데이터베이스를 내립니다. 어느 앱이 띄웠든 그 compose 프로젝트의 서비스가 모두 멈춥니다.",
      }),
      examples: "akan dbdown",
    },
    {
      name: "db-export",
      signature: "akan db-export <app> [--dir <dir>]",
      desc: l.trans({
        en: "Write every model table of the app to one NDJSON file each, from the database of the mode the shell names. Pair it with `db-import` to move data between modes, such as `single` to `cluster`.",
        ko: "셸이 가리키는 모드의 데이터베이스에서 앱의 model 테이블마다 NDJSON 파일 하나씩을 씁니다. `db-import`와 짝지어 `single`에서 `cluster`처럼 모드 사이에 데이터를 옮깁니다.",
      }),
      options: [
        {
          name: "--dir",
          type: "String",
          defaultValue: "local/transfer",
          desc: l.trans({
            en: "Folder to write the files into, relative to the workspace root.",
            ko: "파일을 쓸 폴더로, 워크스페이스 루트 기준입니다.",
          }),
        },
      ],
      notes: [
        {
          name: l.trans({ en: "mode", ko: "모드" }),
          desc: l.trans({
            en: "The shell's `AKAN_DATABASE_MODE`, or the app's first declared mode.",
            ko: "셸의 `AKAN_DATABASE_MODE`, 없으면 앱이 처음으로 선언한 모드입니다.",
          }),
        },
        {
          name: l.trans({ en: "deployed data", ko: "배포된 데이터" }),
          desc: l.trans({
            en: "For a deployed `single` app, copy its SQLite file and point `SQLITE_DATABASE_PATH` at the copy.",
            ko: "배포된 `single` 앱이라면 SQLite 파일을 복사하고 `SQLITE_DATABASE_PATH`가 그 복사본을 가리키게 합니다.",
          }),
        },
        {
          name: l.trans({ en: "no traffic", ko: "요청 없음" }),
          desc: l.trans({
            en: "Boots the app without listening and without running cron or init jobs.",
            ko: "요청을 받지 않고 cron과 init 작업도 돌리지 않는 채로 앱을 띄웁니다.",
          }),
        },
      ],
      examples: `akan db-export myapp
SQLITE_DATABASE_PATH=$PWD/backup/myapp-main.db \\
  akan db-export myapp --dir local/transfer/main`,
    },
    {
      name: "db-import",
      signature: "akan db-import <app> [--dir <dir>]",
      desc: l.trans({
        en: "Read the files `db-export` wrote into the database of the mode the shell names. The app must declare that mode.",
        ko: "`db-export`가 쓴 파일을 셸이 가리키는 모드의 데이터베이스로 읽어 들입니다. 앱이 그 모드를 선언해야 합니다.",
      }),
      options: [
        {
          name: "--dir",
          type: "String",
          defaultValue: "local/transfer",
          desc: l.trans({
            en: "Folder to read the files from, relative to the workspace root.",
            ko: "파일을 읽을 폴더로, 워크스페이스 루트 기준입니다.",
          }),
        },
      ],
      notes: [
        {
          name: l.trans({ en: "rows", ko: "행" }),
          desc: l.trans({
            en: "Rows move as stored, removed ones included. An existing id is replaced, so a rerun is safe.",
            ko: "행은 저장된 그대로, 삭제된 행까지 옮겨집니다. 이미 있는 id는 덮어쓰므로 다시 실행해도 됩니다.",
          }),
        },
        {
          name: l.trans({ en: "text search", ko: "텍스트 검색" }),
          desc: l.trans({
            en: "The search index is rebuilt after the import.",
            ko: "가져오기가 끝나면 검색 인덱스를 다시 만듭니다.",
          }),
        },
        {
          name: l.trans({ en: "not moved", ko: "옮기지 않는 것" }),
          desc: l.trans({
            en: "Sessions and queued jobs stay behind, so users sign in again. Copy uploads in `local/` yourself.",
            ko: "세션과 대기 중인 작업은 옮기지 않으므로 사용자는 다시 로그인합니다. `local/`의 업로드 파일은 직접 복사합니다.",
          }),
        },
        {
          name: l.trans({ en: "no traffic", ko: "요청 없음" }),
          desc: l.trans({
            en: "Boots the app without listening and without running cron or init jobs.",
            ko: "요청을 받지 않고 cron과 init 작업도 돌리지 않는 채로 앱을 띄웁니다.",
          }),
        },
      ],
      examples: `akan db-import myapp
AKAN_DATABASE_MODE=cluster \\
  POSTGRES_URL=postgres://app:secret@db.example.com:5432/app \\
  REDIS_URI=redis://redis.example.com:6379 \\
  akan db-import myapp`,
    },
    {
      name: "script",
      signature: "akan script <app> [filename]",
      desc: l.trans({
        en: "Sync the app, then run `apps/<app>/script/<filename>.ts` with Bun. Leave the filename out to pick one from a list.",
        ko: "앱을 sync한 뒤 `apps/<app>/script/<filename>.ts`를 Bun으로 실행합니다. 파일 이름을 빼면 목록에서 고릅니다.",
      }),
      args: [
        {
          name: "filename",
          type: "String",
          required: "no",
          desc: l.trans({
            en: "A file directly in `script/`; the `.ts` suffix is optional. Subfolder paths are refused.",
            ko: "`script/` 바로 아래 파일입니다. `.ts`는 붙여도 되고 빼도 됩니다. 하위 폴더 경로는 거부됩니다.",
          }),
        },
      ],
      examples: `akan script myapp
akan script myapp seed.ts`,
    },
    {
      name: "console",
      signature: "akan console <app>",
      desc: l.trans({
        en: "Open an interactive console for inspecting the app's services and data at runtime. `akan build` also writes `console.js` beside `main.js`, so the same console runs inside a container.",
        ko: "앱의 서비스와 데이터를 실행 환경에서 직접 들여다보는 대화형 콘솔을 엽니다. `akan build`가 `main.js` 옆에 `console.js`도 만들어 두므로 컨테이너 안에서도 같은 콘솔을 씁니다.",
      }),
      notes: [
        {
          name: l.trans({ en: "process", ko: "프로세스" }),
          desc: l.trans({
            en: "Boots a separate server with no traffic and no internal jobs; it never attaches to `main.js`.",
            ko: "요청을 받지 않고 internal 작업도 돌리지 않는 별도 서버를 띄웁니다. `main.js`에 붙지 않습니다.",
          }),
        },
        {
          name: l.trans({ en: "globals", ko: "전역 변수" }),
          desc: l.trans({
            en: "`srv`, `sig`, `db`, `cnst`, `dict` and `option` are ready at the prompt.",
            ko: "프롬프트에서 `srv`, `sig`, `db`, `cnst`, `dict`, `option`을 바로 씁니다.",
          }),
        },
        {
          name: l.trans({ en: "container", ko: "컨테이너" }),
          desc: l.trans({
            en: "Run `AKAN_CONSOLE=1 bun console.js` inside a built container or pod.",
            ko: "빌드된 컨테이너나 pod 안에서는 `AKAN_CONSOLE=1 bun console.js`를 실행합니다.",
          }),
        },
        {
          name: l.trans({ en: "production", ko: "운영 환경" }),
          desc: l.trans({
            en: "Refused under `main` env, `cloud`/`edge` mode or `NODE_ENV=production` unless `AKAN_CONSOLE=1`.",
            ko: "`main` 환경, `cloud`·`edge` 모드, `NODE_ENV=production`에서는 `AKAN_CONSOLE=1` 없이 열리지 않습니다.",
          }),
        },
      ],
      examples: `akan console myapp
docker exec -it myapp sh -lc 'AKAN_CONSOLE=1 bun console.js'
kubectl exec -it -n prod pod/myapp-xxxxx -c myapp -- sh -lc 'AKAN_CONSOLE=1 bun console.js'`,
    },
    {
      name: "logs",
      signature:
        "akan logs <app> [--level <level>] [--grep <text>] [--endpoint <glob>] [--trace <traceId>] [--child <idx>] [--role <role>] [--origin <origin>] [--since <since>] [--replay <n>] [--json <boolean>] [--follow <boolean>] [--runtime-dir <dir>]",
      desc: l.trans({
        en: "Follow a running app's logs through its `akan-control.sock`. Every record carries the traceId, endpoint and origin of its call, so you filter by call rather than by text alone.",
        ko: "실행 중인 앱의 `akan-control.sock`에 붙어 로그를 따라 봅니다. 모든 기록에 호출의 traceId, endpoint, origin이 붙어 있어 글자뿐 아니라 호출 단위로 거를 수 있습니다.",
      }),
      options: [
        {
          name: "--level",
          type: "String",
          enumOrFlag: "trace | verbose | debug | info | warn | error",
          desc: l.trans({ en: "Lowest level to print.", ko: "출력할 가장 낮은 레벨입니다." }),
        },
        {
          name: "--grep",
          type: "String",
          desc: l.trans({ en: "Text the message must contain.", ko: "메시지에 들어 있어야 할 글자입니다." }),
        },
        {
          name: "--endpoint",
          type: "String",
          desc: l.trans({
            en: "Endpoint globs, comma-separated: `mutation:*`, `query:userList`.",
            ko: "쉼표로 구분한 endpoint 글롭입니다. 예: `mutation:*`, `query:userList`.",
          }),
        },
        {
          name: "--trace",
          type: "String",
          desc: l.trans({
            en: "One request's traceId; collects every line that request wrote.",
            ko: "요청 하나의 traceId입니다. 그 요청이 남긴 모든 줄을 모읍니다.",
          }),
        },
        {
          name: "--child",
          type: "String",
          desc: l.trans({ en: "Replica indexes, comma-separated.", ko: "쉼표로 구분한 레플리카 번호입니다." }),
        },
        {
          name: "--role",
          type: "String",
          enumOrFlag: "-R",
          desc: l.trans({
            en: "Process roles: `gateway`, `federation`, `batch`, `all`, `rsc-worker`.",
            ko: "프로세스 역할입니다: `gateway`, `federation`, `batch`, `all`, `rsc-worker`.",
          }),
        },
        {
          name: "--origin",
          type: "String",
          desc: l.trans({
            en: "Call origins: `http`, `websocket`, `mcp`, `internal`, `page`.",
            ko: "호출 출처입니다: `http`, `websocket`, `mcp`, `internal`, `page`.",
          }),
        },
        {
          name: "--since",
          type: "String",
          desc: l.trans({
            en: "Only newer records: `30s`, `5m`, `2h`, `1d`, or epoch ms.",
            ko: "이보다 새 기록만 봅니다: `30s`, `5m`, `2h`, `1d` 또는 epoch ms.",
          }),
        },
        {
          name: "--replay",
          type: "Number",
          defaultValue: "0",
          enumOrFlag: "-n",
          desc: l.trans({
            en: "Buffered records to print before following. With `--follow false` it caps the history.",
            ko: "따라 보기 전에 버퍼에서 먼저 출력할 기록 수입니다. `--follow false`일 때는 출력할 기록 수의 상한입니다.",
          }),
        },
        {
          name: "--json",
          type: "Boolean",
          defaultValue: "false",
          desc: l.trans({
            en: "Print NDJSON records instead of rendered lines.",
            ko: "사람이 읽는 줄 대신 NDJSON 기록을 출력합니다.",
          }),
        },
        {
          name: "--follow",
          type: "Boolean",
          defaultValue: "true",
          desc: l.trans({
            en: "Keep streaming. `--follow false` prints the history and exits.",
            ko: "계속 따라 봅니다. `--follow false`는 지난 기록만 출력하고 끝냅니다.",
          }),
        },
        {
          name: "--runtime-dir",
          type: "String",
          defaultValue: "local/apps/<app>/runtime",
          enumOrFlag: "-d",
          desc: l.trans({
            en: "Folder holding `akan-control.sock`. Without it, `AKAN_RUNTIME_DIR` and then the default apply.",
            ko: "`akan-control.sock`이 있는 폴더입니다. 비우면 `AKAN_RUNTIME_DIR`, 그다음 기본값을 씁니다.",
          }),
        },
      ],
      notes: [
        {
          name: l.trans({ en: "in the console", ko: "콘솔에서" }),
          desc: l.trans({
            en: "`akan console` has the same filters as `.tail` and `.trace <id>`.",
            ko: "`akan console`에서도 `.tail`과 `.trace <id>`로 같은 필터를 씁니다.",
          }),
        },
      ],
      examples: `akan logs myapp --level warn
akan logs myapp --endpoint 'mutation:*' --replay 200
akan logs myapp --trace 0f3c9a1b --follow false
akan logs myapp --json true | jq 'select(.attrs.userId)'`,
    },
    {
      name: "typecheck",
      signature: "akan typecheck <app> [--write <boolean>] [--clean <boolean>] [--incremental <boolean>]",
      desc: l.trans({
        en: "Typecheck the app with TypeScript. It reuses an incremental cache, which `--clean` clears first.",
        ko: "TypeScript로 앱의 타입을 검사합니다. 증분 캐시를 재사용하며, `--clean`을 주면 먼저 캐시를 지웁니다.",
      }),
      options: [
        writeOption,
        {
          name: "--clean",
          type: "Boolean",
          defaultValue: "false",
          desc: l.trans({
            en: "Delete the incremental cache (`tsconfig.tsbuildinfo`) before checking.",
            ko: "검사 전에 증분 캐시(`tsconfig.tsbuildinfo`)를 지웁니다.",
          }),
        },
        {
          name: "--incremental",
          type: "Boolean",
          defaultValue: "true",
          desc: l.trans({
            en: "Reuse the TypeScript incremental cache.",
            ko: "TypeScript 증분 캐시를 재사용합니다.",
          }),
        },
      ],
      notes: [aliasNote("t")],
      examples: `akan typecheck myapp
akan typecheck myapp --clean true --incremental false`,
    },
    {
      name: "test",
      signature: "akan test <app|lib|pkg> [--write <boolean>]",
      desc: l.trans({
        en: "Prepare an app, library or package, then run its tests with `bun test --isolate` in that folder.",
        ko: "앱, 라이브러리, 패키지를 준비한 뒤 그 폴더에서 `bun test --isolate`로 테스트를 실행합니다.",
      }),
      options: [
        {
          ...writeOption,
          desc: l.trans({
            en: "Sync an app target first. Libraries and packages are always prepared.",
            ko: "대상이 앱이면 먼저 sync합니다. 라이브러리와 패키지는 항상 준비 과정을 거칩니다.",
          }),
        },
      ],
      examples: `akan test myapp
akan test myapp --write false
akan test util`,
    },
    {
      name: "build",
      signature: "akan build <app> [--write <boolean>] [--fast <boolean>] [--quiet <boolean>]",
      desc: l.trans({
        en: "Build the app for production into `dist/apps/<app>`. It typechecks, then compiles the backend, the SSR routes and the CSR bundle.",
        ko: "배포용 빌드를 `dist/apps/<app>`에 만듭니다. 타입을 검사한 뒤 백엔드, SSR 라우트, CSR 번들을 차례로 만듭니다.",
      }),
      options: [
        writeOption,
        {
          name: "--fast",
          type: "Boolean",
          defaultValue: "false",
          desc: l.trans({ en: "Skip the typecheck step.", ko: "타입 검사 단계를 건너뜁니다." }),
        },
        {
          name: "--quiet",
          type: "Boolean",
          defaultValue: "false",
          desc: l.trans({
            en: "Hide the progress output and the build summary.",
            ko: "진행 상황과 빌드 요약을 출력하지 않습니다.",
          }),
        },
      ],
      notes: [
        aliasNote("b"),
        {
          name: l.trans({ en: "web surfaces", ko: "웹 화면" }),
          desc: l.trans({
            en: "The SSR and CSR steps follow `web` in `akan.config.ts`; a surface turned off is skipped.",
            ko: "SSR과 CSR 단계는 `akan.config.ts`의 `web` 설정을 따르며, 꺼 둔 쪽은 건너뜁니다.",
          }),
        },
      ],
      examples: `akan build myapp
akan build myapp --write true --fast false --quiet false`,
    },
    {
      name: "start-ios",
      signature:
        "akan start-ios <app> [--target <target>] [--env <env>] [--open <boolean>] [--release <boolean>] [--write <boolean>] [--regenerate <boolean>] [--allow-provisioning-updates <boolean>] [--device <device>]",
      desc: l.trans({
        en: "Run the iOS app on a simulator or a connected device. By default it loads from your local dev server; `--release` bundles a production web build instead.",
        ko: "iOS 시뮬레이터나 연결된 기기에서 앱을 실행합니다. 기본은 로컬 개발 서버에서 화면을 불러오고, `--release`를 주면 배포용 웹 빌드를 앱에 넣습니다.",
      }),
      options: [
        targetOption,
        localEnvOption,
        {
          name: "--open",
          type: "Boolean",
          defaultValue: "false",
          desc: l.trans({ en: "Also open the native project in Xcode.", ko: "네이티브 프로젝트를 Xcode로도 엽니다." }),
        },
        releaseModeOption,
        writeOption,
        regenerateOption,
        {
          name: "--allow-provisioning-updates",
          type: "Boolean",
          defaultValue: "true",
          enumOrFlag: "-a",
          desc: l.trans({
            en: "Lets Xcode make or update device provisioning profiles; `--no-allow-provisioning-updates` stops it.",
            ko: "기기용 프로비저닝 프로필을 Xcode가 만들거나 갱신하게 합니다. `--no-allow-provisioning-updates`로 끕니다.",
          }),
        },
        {
          name: "--device",
          type: "String",
          desc: l.trans({
            en: "Pick the run target without a prompt: a UDID, a device name, or a runtime such as `iOS 18`.",
            ko: "묻지 않고 실행 대상을 고릅니다. UDID, 기기 이름, `iOS 18` 같은 런타임을 줍니다.",
          }),
        },
      ],
      notes: [aliasNote("si"), devServerNote],
      examples: `akan start-ios myapp --target all --env local --open true
akan start-ios myapp --device "iPhone 16"
akan start-ios myapp --no-allow-provisioning-updates`,
    },
    {
      name: "start-android",
      signature:
        "akan start-android <app> [--target <target>] [--env <env>] [--release <boolean>] [--open <boolean>] [--write <boolean>] [--regenerate <boolean>]",
      desc: l.trans({
        en: "Run the Android app on an emulator or a connected device. It works like `start-ios`: the dev server by default, a bundled build with `--release`.",
        ko: "Android 에뮬레이터나 연결된 기기에서 앱을 실행합니다. `start-ios`와 같이 기본은 개발 서버를, `--release`면 번들한 빌드를 씁니다.",
      }),
      options: [
        targetOption,
        localEnvOption,
        releaseModeOption,
        {
          name: "--open",
          type: "Boolean",
          defaultValue: "false",
          desc: l.trans({
            en: "Also open the native project in Android Studio.",
            ko: "네이티브 프로젝트를 Android Studio로도 엽니다.",
          }),
        },
        writeOption,
        regenerateOption,
      ],
      notes: [aliasNote("sa"), devServerNote],
      examples: "akan start-android myapp --target all --env local --open true",
    },
    {
      name: "build-ios",
      signature: "akan build-ios <app> [--target <target>] [--env <env>] [--write <boolean>] [--regenerate <boolean>]",
      desc: l.trans({
        en: "Build the iOS app with Capacitor. It first makes a production web build against `--env`, then runs the native build for each target.",
        ko: "Capacitor로 iOS 앱을 빌드합니다. 먼저 `--env` 환경으로 배포용 웹 빌드를 만든 뒤 타깃마다 네이티브 빌드를 실행합니다.",
      }),
      options: [targetOption, debugEnvOption, writeOption, regenerateOption],
      notes: [aliasNote("bi")],
      examples: "akan build-ios myapp --target all --env debug",
    },
    {
      name: "build-android",
      signature:
        "akan build-android <app> [--target <target>] [--env <env>] [--write <boolean>] [--regenerate <boolean>]",
      desc: l.trans({
        en: "Build a release APK of the Android app with Capacitor. Like `build-ios`, it makes a production web build against `--env` first.",
        ko: "Capacitor로 Android 앱의 릴리스 APK를 빌드합니다. `build-ios`처럼 먼저 `--env` 환경으로 배포용 웹 빌드를 만듭니다.",
      }),
      options: [targetOption, debugEnvOption, writeOption, regenerateOption],
      notes: [aliasNote("ba"), signingNote],
      examples: "akan build-android myapp --target all --env debug",
    },
    {
      name: "release-ios",
      signature:
        "akan release-ios <app> [--target <target>] [--env <env>] [--write <boolean>] [--regenerate <boolean>] [--allow-local-release <boolean>]",
      desc: l.trans({
        en: "Build the iOS app for an App Store release. It defaults to the `main` backend and refuses `--env local` unless `--allow-local-release` is passed.",
        ko: "App Store 출시용으로 iOS 앱을 빌드합니다. 기본 백엔드는 `main`이고, `--allow-local-release` 없이 `--env local`을 주면 거부합니다.",
      }),
      options: [targetOption, releaseEnvOption, writeOption, regenerateOption, allowLocalReleaseOption],
      examples: "akan release-ios myapp --target all --env main",
    },
    {
      name: "release-android",
      signature:
        "akan release-android <app> [--assemble-type <type>] [--target <target>] [--env <env>] [--write <boolean>] [--regenerate <boolean>] [--allow-local-release <boolean>]",
      desc: l.trans({
        en: "Build the Android app for a Play Store release, as an APK or an AAB. Like `release-ios`, it defaults to `main` and refuses `--env local` without `--allow-local-release`.",
        ko: "Play Store 출시용으로 Android 앱을 APK나 AAB로 빌드합니다. `release-ios`처럼 기본은 `main`이고, `--allow-local-release` 없이 `--env local`은 거부합니다.",
      }),
      options: [
        {
          name: "--assemble-type",
          type: "String",
          defaultValue: "apk",
          enumOrFlag: "apk | aab",
          desc: l.trans({
            en: "`apk` for direct installs, `aab` for a Play Store upload.",
            ko: "`apk`는 직접 설치용, `aab`는 Play Store 업로드용입니다.",
          }),
        },
        targetOption,
        releaseEnvOption,
        writeOption,
        regenerateOption,
        allowLocalReleaseOption,
      ],
      notes: [
        signingNote,
        {
          name: l.trans({ en: "output", ko: "결과물" }),
          desc: l.trans({
            en: "Written under `apps/<app>/android/app/build/outputs/`; the command prints the path.",
            ko: "`apps/<app>/android/app/build/outputs/` 아래에 만들어지며, 명령이 경로를 출력합니다.",
          }),
        },
      ],
      examples: `akan release-android myapp --assemble-type apk --target all --env main
akan release-android myapp --assemble-type aab --target all --env main`,
    },
    // {
    //   name: "release-source",
    //   signature:
    //     "akan release-source <app> [--rebuild <boolean>] [--build-num <number>] [--environment <environment>] [--local <boolean>]",
    //   desc: l.trans({
    //     en: "Package the app's build, source and CSR bundle, and push them to Akan Cloud as a release. The version comes from `mobile.version` in `akan.config.ts`.",
    //     ko: "앱의 빌드, 소스, CSR 번들을 묶어 Akan Cloud에 릴리스로 올립니다. 버전은 `akan.config.ts`의 `mobile.version`을 씁니다.",
    //   }),
    //   options: [
    //     {
    //       name: "--rebuild",
    //       type: "Boolean",
    //       defaultValue: "false",
    //       desc: l.trans({
    //         en: "Build again even when `dist/apps/<app>/backend` already exists.",
    //         ko: "`dist/apps/<app>/backend`가 이미 있어도 다시 빌드합니다.",
    //       }),
    //     },
    //     {
    //       name: "--build-num",
    //       type: "Number",
    //       defaultValue: "0",
    //       desc: l.trans({
    //         en: "Build number; names the `<version>-<buildNum>` folder in the archive.",
    //         ko: "빌드 번호입니다. 압축본 안의 `<version>-<buildNum>` 폴더 이름에 쓰입니다.",
    //       }),
    //     },
    //     {
    //       name: "--environment",
    //       type: "String",
    //       defaultValue: "debug",
    //       desc: l.trans({
    //         en: "Environment the release is pushed to.",
    //         ko: "릴리스를 올릴 환경입니다.",
    //       }),
    //     },
    //     {
    //       name: "--local",
    //       type: "Boolean",
    //       defaultValue: "true",
    //       desc: l.trans({
    //         en: "Upload to a local Akan Cloud at `localhost:8282` instead of `cloud.akanjs.com`.",
    //         ko: "`cloud.akanjs.com` 대신 `localhost:8282`의 로컬 Akan Cloud로 올립니다.",
    //       }),
    //     },
    //   ],
    //   notes: [
    //     {
    //       name: l.trans({ en: "archives", ko: "압축본" }),
    //       desc: l.trans({
    //         en: "Written to `releases/builds/` and `releases/sources/` at the workspace root before the upload.",
    //         ko: "업로드 전에 워크스페이스 루트의 `releases/builds/`와 `releases/sources/`에 만들어집니다.",
    //       }),
    //     },
    //   ],
    //   examples: "akan release-source myapp --environment debug --build-num 12 --local true",
    // },
    // {
    //   name: "configure-app",
    //   signature: "akan configure-app <app>",
    //   desc: l.trans({
    //     en: "Set up the native projects of the app's mobile target, then ask whether to add camera, contacts and location permissions.",
    //     ko: "앱의 모바일 타깃에 네이티브 프로젝트를 준비한 뒤, 카메라·연락처·위치 권한을 추가할지 묻습니다.",
    //   }),
    //   notes: [
    //     {
    //       name: l.trans({ en: "interactive", ko: "대화형" }),
    //       desc: l.trans({
    //         en: "Three yes/no prompts: camera, contacts, location.",
    //         ko: "카메라, 연락처, 위치를 차례로 예/아니오로 묻습니다.",
    //       }),
    //     },
    //     singleTargetNote,
    //   ],
    //   examples: "akan configure-app myapp",
    // },
    // {
    //   name: "codepush",
    //   signature: "akan codepush <app>",
    //   desc: l.trans({
    //     en: "Reserved for over-the-air updates. Today it asks for the OS, then only makes sure the mobile target has its native projects; nothing is deployed.",
    //     ko: "OTA 업데이트용으로 마련된 명령입니다. 지금은 OS를 물은 뒤 모바일 타깃에 네이티브 프로젝트가 있는지만 확인하며, 실제로 배포하지는 않습니다.",
    //   }),
    //   notes: [
    //     {
    //       name: l.trans({ en: "interactive", ko: "대화형" }),
    //       desc: l.trans({ en: "Prompts for the OS: `ios` or `android`.", ko: "OS를 묻습니다: `ios` 또는 `android`." }),
    //     },
    //     singleTargetNote,
    //   ],
    //   examples: "akan codepush myapp",
    // },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="application-cli" title={l.trans({ en: "Application CLI", ko: "애플리케이션 CLI" })}>
        <Docs.Title>{l.trans({ en: "Application CLI", ko: "애플리케이션 CLI" })}</Docs.Title>
        <Docs.Description>
          {l.trans({
            en: "These commands carry an app from creation to release: create it, run it locally, check and build it, then ship it to mobile.",
            ko: "앱을 만드는 순간부터 출시까지 쓰는 명령입니다. 앱을 만들고, 로컬에서 띄우고, 검사·빌드한 뒤 모바일로 내보냅니다.",
          })}
          {catalogue.map((group) => (
            <Fragment key={group.label}>
              <Docs.SubSubTitle>{group.label}</Docs.SubSubTitle>
              <Docs.IntroTable type={l.trans({ en: "Command", ko: "명령" })} items={group.items} />
            </Fragment>
          ))}
        </Docs.Description>
      </Scroll.Slide>
      {commands.flatMap((command) => [
        <Divider key={`${command.name}-divider`} />,
        <CommandReferenceSlide key={command.name} command={command} />,
      ])}
      <Divider />
      <Scroll.Slide
        id="application-rules"
        title={l.trans({ en: "Rules Every Command Shares", ko: "모든 명령에 공통인 규칙" })}
      >
        <Docs.Title>{l.trans({ en: "Rules Every Command Shares", ko: "모든 명령에 공통인 규칙" })}</Docs.Title>
        <Docs.Description>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Choosing the app.</strong> <code>&lt;app&gt;</code> is a folder name under{" "}
                    <code>apps/</code>. Leave it out and the CLI asks you to pick, or takes the only app there is.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>앱 지정.</strong> <code>&lt;app&gt;</code>은 <code>apps/</code> 아래 폴더 이름입니다.
                    생략하면 CLI가 고르라고 묻고, 앱이 하나뿐이면 그 앱을 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Boolean options.</strong> <code>--fast</code> on its own means true. To turn an option off,
                    give the value: <code>--write false</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>불리언 옵션.</strong> <code>--fast</code>처럼 이름만 쓰면 true입니다. 끄려면 값을 붙입니다:{" "}
                    <code>--write false</code>.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Short flags.</strong> Each option also answers to its first letter (<code>-w</code> for{" "}
                    <code>--write</code>) unless its row shows another. <code>--verbose</code> (<code>-v</code>) works
                    on every command.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>짧은 플래그.</strong> 옵션은 첫 글자로도 씁니다(<code>--write</code>는 <code>-w</code>).
                    다른 글자를 쓰는 옵션은 표에 따로 적혀 있고, <code>--verbose</code>(<code>-v</code>)는 모든 명령에서
                    씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>--write</code> runs sync first.
                    </strong>{" "}
                    It is on by default, so generated files are fresh before the command runs.{" "}
                    <code>--write false</code> skips it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>--write</code>는 sync를 먼저 실행합니다.
                    </strong>{" "}
                    기본으로 켜져 있어 명령 전에 생성 파일이 최신이 됩니다. 건너뛰려면 <code>--write false</code>를
                    줍니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The database mode.</strong> <code>start</code>, <code>build</code>, <code>script</code>,{" "}
                    <code>console</code>, <code>db-export</code> and <code>db-import</code> use the shell's{" "}
                    <code>AKAN_DATABASE_MODE</code>, which must be one the app declares, or else its first declared
                    mode.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>데이터베이스 모드.</strong> <code>start</code>, <code>build</code>, <code>script</code>,{" "}
                    <code>console</code>, <code>db-export</code>, <code>db-import</code>는 셸의{" "}
                    <code>AKAN_DATABASE_MODE</code>를 쓰고, 없으면 앱이 처음으로 선언한 모드를 씁니다. 셸에서 고른
                    모드는 앱이 선언한 것이어야 합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide id="application-short-names" title={l.trans({ en: "Short Names", ko: "줄임 명령" })}>
        <Docs.Title>{l.trans({ en: "Short Names", ko: "줄임 명령" })}</Docs.Title>
        <Docs.Description>
          <Docs.Table
            columns={[
              { key: "alias", label: l.trans({ en: "Short name", ko: "줄임 명령" }), code: true },
              { key: "command", label: l.trans({ en: "Runs", ko: "실행되는 명령" }), code: true },
            ]}
            rows={aliasRows}
          />
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
