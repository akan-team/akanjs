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
      en: "A key of `native.targets` in `akan.config.ts`, or `all`. Asked for when there are several.",
      ko: "`akan.config.ts`의 `native.targets` 키 또는 `all`입니다. 타깃이 여럿이면 물어봅니다.",
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
  const debugBuildOption: ReferenceRow = {
    name: "--debug",
    type: "Boolean",
    defaultValue: "false",
    desc: l.trans({
      en: "Make a debug build instead of a release one.",
      ko: "릴리스 대신 디버그 빌드를 만듭니다.",
    }),
  };
  const deviceOption: ReferenceRow = {
    name: "--device",
    type: "String",
    desc: l.trans({
      en: "The simulator, emulator or device to run on: its id or name, such as `iPhone 17` or `Pixel_10`. A paired iPhone's name makes a signed iPhone build. Left out, a booted iPhone simulator (else the newest one) or a connected Android device (else the first emulator, started) is used.",
      ko: "실행할 시뮬레이터, 에뮬레이터, 기기입니다. `iPhone 17`이나 `Pixel_10`처럼 id나 이름을 줍니다. 페어링한 iPhone 이름을 주면 서명한 iPhone 빌드를 만듭니다. 생략하면 켜져 있는 iPhone 시뮬레이터(없으면 가장 최신 것)나 연결된 Android 기기(없으면 첫 에뮬레이터를 띄워서)를 씁니다.",
    }),
  };
  const teamOption: ReferenceRow = {
    name: "--team",
    type: "String",
    enumOrFlag: "-T",
    desc: l.trans({
      en: "The Apple team id the signing is narrowed to, when the Mac holds profiles of several teams.",
      ko: "Mac에 여러 팀의 프로필이 있을 때 서명을 좁힐 Apple 팀 id입니다.",
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
      en: "Run a release build that carries its own production web build instead of loading the dev server.",
      ko: "개발 서버를 불러오는 대신 배포용 웹 빌드를 담은 릴리스 빌드를 실행합니다.",
    }),
  };
  const aliasNote = (alias: string): ReferenceRow => ({
    name: l.trans({ en: "alias", ko: "줄임 명령" }),
    desc: l.trans({ en: `\`akan ${alias}\` runs this command.`, ko: `\`akan ${alias}\`로도 실행합니다.` }),
  });
  const devServerNote: ReferenceRow = {
    name: l.trans({ en: "dev server", ko: "개발 서버" }),
    desc: l.trans({
      en: "Without `--release` the app loads its pages from `akan start <app>` through the dev gateway, so every save shows up; keep the dev server running, or the command stops and says so.",
      ko: "`--release` 없이 실행하면 앱이 dev gateway를 거쳐 `akan start <app>`에서 화면을 불러오므로 저장할 때마다 반영됩니다. 개발 서버를 켜 두세요. 꺼져 있으면 명령이 그렇게 알리고 멈춥니다.",
    }),
  };
  const serverSwitchNote: ReferenceRow = {
    name: "desktop.server",
    desc: l.trans({
      en: "With `native: { desktop: { server: true } }` in `akan.config.ts`, or `desktop.server` in one target, the desktop app carries the app's server: it starts beside the window on a loopback port and the pages call nothing else. `build-desktop`, `start-desktop --release` and `publish-update` all read it. An installed app refuses an update that adds or drops the server, so turning it on or off for an app already out there takes a reinstall.",
      ko: "`akan.config.ts`에 `native: { desktop: { server: true } }`를 주거나 한 타깃에 `desktop.server`를 주면, 데스크톱 앱이 앱의 서버를 싣습니다. 서버는 창과 함께 loopback 포트로 뜨고, 페이지는 그 서버만 부릅니다. `build-desktop`, `start-desktop --release`, `publish-update`가 모두 이 값을 읽습니다. 설치된 앱은 서버를 더하거나 빼는 업데이트를 받지 않으므로, 이미 배포한 앱에서 켜거나 끄려면 다시 설치해야 합니다.",
    }),
  };
  const carriedServerNote: ReferenceRow = {
    name: l.trans({ en: "carried server", ko: "내장 서버" }),
    desc: l.trans({
      en: "The server runs on the app's own Bun as an API-only server (`operationMode` edge, database mode `single`, SSR, CSR and MCP off) bound to 127.0.0.1, refusing any other Host header; any program on the computer can still call it, so guard its endpoints as a network server's. The app needs `single` in `database.modes`. Its data and a per-install JWT secret stay in the app data folder's `server/` (under `%LOCALAPPDATA%` on Windows; a `--debug` build keeps `server-debug/`). It carries `private/` (each lib's too, under `private/libs/<lib>`), the `--env` environment's `env.server.<env>.ts` and the server env defaults of the libs it uses (each lib's `env.server.testing.ts`), in plain text that anyone with the app can read, so keep deployment secrets, keys and license files out of them. It has no `public/`, and its working folder is its data folder: read a file it needs at runtime from the app folder, `AKAN_APP_DIR` or else the folder of `Bun.main`, never from `process.cwd()`. It runs none of the image's `docker` steps: an executable it spawns comes from `bin`, and a package that builds itself at install from `trustedDependencies`.",
      ko: "서버는 앱에 든 Bun으로 API만 서빙합니다(`operationMode` edge, DB 모드 `single`, SSR·CSR·MCP 끔). 127.0.0.1에만 바인딩하고 다른 Host 헤더는 거부합니다. 그래도 이 컴퓨터의 다른 프로그램은 부를 수 있으므로, 엔드포인트는 네트워크 서버처럼 가드합니다. 앱의 `database.modes`에 `single`이 있어야 합니다. 데이터와 설치마다 만드는 JWT 시크릿은 앱 데이터 폴더의 `server/`에 둡니다(Windows는 `%LOCALAPPDATA%` 아래, `--debug` 빌드는 `server-debug/`). `private/`(lib의 것도 `private/libs/<lib>`로), `--env` 환경의 `env.server.<env>.ts`, 앱이 쓰는 lib의 서버 env 기본값(lib마다 `env.server.testing.ts`)이 앱을 가진 누구나 읽을 수 있는 평문으로 들어가므로, 배포용 비밀·키·라이선스 파일을 두지 마세요. `public/`은 없고 작업 폴더는 데이터 폴더이므로, 실행 중에 읽는 파일은 `process.cwd()`가 아니라 앱 폴더(`AKAN_APP_DIR`, 없으면 `Bun.main`의 폴더) 기준으로 읽습니다. 이미지의 `docker` 단계는 하나도 실행하지 않습니다. 서버가 실행하는 파일은 `bin`에, 설치하면서 스스로 빌드하는 패키지는 `trustedDependencies`에 적습니다.",
    }),
  };
  const binNote: ReferenceRow = {
    name: "bin",
    desc: l.trans({
      en: "An executable `bin` names in `akan.config.ts` is fetched for this computer and carried in every desktop app, whether or not it carries a server: it is first on the app's PATH, so the carried server's `spawn(\"ffmpeg\")` runs it, and a native plugin finds it in `ctx.binDir`.",
      ko: '`akan.config.ts`의 `bin`에 적은 실행 파일은 이 컴퓨터용으로 받아 서버를 싣는지와 상관없이 모든 데스크톱 앱에 들어갑니다. 앱의 PATH 맨 앞에 있으므로 내장 서버의 `spawn("ffmpeg")`가 그 파일을 실행하고, 네이티브 플러그인은 `ctx.binDir`에서 찾습니다.',
    }),
  };
  const oneTargetNote: ReferenceRow = {
    name: l.trans({ en: "one target", ko: "타깃 하나" }),
    desc: l.trans({
      en: "Runs one native target at a time; with several, pass `--target <name>`.",
      ko: "네이티브 타깃을 한 번에 하나만 실행합니다. 여럿이면 `--target <name>`을 줍니다.",
    }),
  };
  const outputNote = (platform: string): ReferenceRow => ({
    name: l.trans({ en: "output", ko: "결과물" }),
    desc: l.trans({
      en: `Written under \`apps/<app>/.akan/native/<target>/build/${platform}\`; the command prints each file's path.`,
      ko: `\`apps/<app>/.akan/native/<target>/build/${platform}\` 아래에 만들어지며, 명령이 파일마다 경로를 출력합니다.`,
    }),
  });
  const devOutputNote = (platform: string): ReferenceRow => ({
    name: l.trans({ en: "output", ko: "결과물" }),
    desc: l.trans({
      en: `A dev build goes under \`apps/<app>/.akan/native/<target>/dev/${platform}\`; a \`--release\` run under \`…/build/${platform}\`.`,
      ko: `개발 빌드는 \`apps/<app>/.akan/native/<target>/dev/${platform}\`, \`--release\` 실행은 \`…/build/${platform}\` 아래에 만들어집니다.`,
    }),
  });
  const androidSigningNote: ReferenceRow = {
    name: l.trans({ en: "signing", ko: "서명" }),
    desc: l.trans({
      en: "Signed with the upload key the environment names: `MYAPP_RELEASE_STORE_FILE`, `MYAPP_RELEASE_STORE_PASSWORD` and `MYAPP_RELEASE_KEY_ALIAS`, plus `MYAPP_RELEASE_KEY_PASSWORD` when the key has its own. A missing one stops the command before it builds.",
      ko: "환경 변수가 가리키는 업로드 키로 서명합니다. `MYAPP_RELEASE_STORE_FILE`, `MYAPP_RELEASE_STORE_PASSWORD`, `MYAPP_RELEASE_KEY_ALIAS`, 키에 비밀번호가 따로 있으면 `MYAPP_RELEASE_KEY_PASSWORD`도 둡니다. 하나라도 없으면 빌드 전에 멈춥니다.",
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
          name: "start-desktop",
          href: "#start-desktop",
          desc: l.trans({
            en: "Run the app as a desktop app on this computer.",
            ko: "이 컴퓨터에서 앱을 데스크톱 앱으로 실행합니다.",
          }),
        },
        {
          name: ["build-ios", "build-android", "build-desktop"],
          href: ["#build-ios", "#build-android", "#build-desktop"],
          desc: l.trans({
            en: "Build the native app on the native runtime.",
            ko: "네이티브 런타임으로 네이티브 앱을 빌드합니다.",
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
        {
          name: ["update-keygen", "publish-update", "pack-update"],
          href: ["#update-keygen", "#publish-update", "#pack-update"],
          desc: l.trans({
            en: "Sign and publish releases installed apps update themselves to, or pack a phone update for a signer elsewhere.",
            ko: "설치된 앱이 스스로 업데이트할 릴리스를 서명해 게시하거나, 다른 곳에서 서명할 폰 업데이트를 묶습니다.",
          }),
        },
      ],
    },
  ];

  const aliasRows = [
    { alias: "akan b", command: "akan build" },
    { alias: "akan t", command: "akan typecheck" },
    { alias: "akan s", command: "akan start" },
    { alias: "akan bi", command: "akan build-ios" },
    { alias: "akan ba", command: "akan build-android" },
    { alias: "akan bd", command: "akan build-desktop" },
    { alias: "akan si", command: "akan start-ios" },
    { alias: "akan sa", command: "akan start-android" },
    { alias: "akan sd", command: "akan start-desktop" },
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
            en: "Apps booted at a time. Unset: the lower of half the memory ÷ 1.8GB and cores ÷ 4.",
            ko: "동시에 부팅할 앱 수입니다. 비우면 (메모리 절반 ÷ 1.8GB)와 (코어 수 ÷ 4) 중 작은 값입니다.",
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
        "akan start-ios <app> [--target <target>] [--env <env>] [--release <boolean>] [--device <device>] [--team <team>] [--write <boolean>]",
      desc: l.trans({
        en: "Run the iOS app on a simulator or a paired iPhone. By default it is a debug build whose pages come from your local dev server; `--release` runs a release build of its own bundle instead.",
        ko: "iOS 시뮬레이터나 페어링한 iPhone에서 앱을 실행합니다. 기본은 로컬 개발 서버에서 화면을 불러오는 디버그 빌드이고, `--release`를 주면 자기 번들을 담은 릴리스 빌드를 실행합니다.",
      }),
      options: [targetOption, localEnvOption, releaseModeOption, deviceOption, teamOption, writeOption],
      notes: [aliasNote("si"), devServerNote, oneTargetNote, devOutputNote("ios")],
      examples: `akan start-ios myapp --target default --env local
akan start-ios myapp --device "iPhone 17"
akan start-ios myapp --device "Jane's iPhone" --team ABCDE12345`,
    },
    {
      name: "start-android",
      signature:
        "akan start-android <app> [--target <target>] [--env <env>] [--release <boolean>] [--device <device>] [--write <boolean>]",
      desc: l.trans({
        en: "Run the Android app on an emulator or a connected device. It works like `start-ios`: the dev server by default, a bundled release build with `--release`.",
        ko: "Android 에뮬레이터나 연결된 기기에서 앱을 실행합니다. `start-ios`와 같이 기본은 개발 서버를, `--release`면 번들을 담은 릴리스 빌드를 씁니다.",
      }),
      options: [targetOption, localEnvOption, releaseModeOption, deviceOption, writeOption],
      notes: [aliasNote("sa"), devServerNote, oneTargetNote, devOutputNote("android")],
      examples: `akan start-android myapp --target default --env local
akan start-android myapp --device Pixel_10`,
    },
    {
      name: "start-desktop",
      signature: "akan start-desktop <app> [--target <target>] [--env <env>] [--release <boolean>] [--write <boolean>]",
      desc: l.trans({
        en: "Run a native target as a desktop app on this computer: macOS, Windows or Linux, whichever it is, since a desktop app builds only on its own OS. It works like `start-ios`, with no device or team to pick.",
        ko: "네이티브 타깃을 이 컴퓨터에서 데스크톱 앱으로 실행합니다. 데스크톱 앱은 자기 OS에서만 빌드되므로 macOS, Windows, Linux 중 지금 컴퓨터의 것을 씁니다. `start-ios`와 같이 동작하며, 고를 기기나 팀은 없습니다.",
      }),
      options: [targetOption, localEnvOption, releaseModeOption, writeOption],
      notes: [
        aliasNote("sd"),
        devServerNote,
        {
          name: l.trans({ en: "a server without --release", ko: "--release 없이 서버를 싣는 타깃" }),
          desc: l.trans({
            en: "For a target that carries its server, a dev server already answering on the app's dev port is used as it is. Otherwise `akan start <app>` runs in the same command, the app opens once it serves, and Ctrl+C or closing the app stops both. `--env` does not reach the dev server, which follows the workspace `.env`.",
            ko: "서버를 싣는 타깃이면, 앱의 개발 포트에서 이미 응답하는 개발 서버가 있을 때 그대로 씁니다. 없으면 같은 명령에서 `akan start <app>`을 띄우고, 서버가 응답하면 앱을 엽니다. Ctrl+C를 누르거나 앱을 닫으면 둘 다 멈춥니다. `--env`는 개발 서버에 영향을 주지 않고, 개발 서버는 워크스페이스 `.env`를 따릅니다.",
          }),
        },
        serverSwitchNote,
        carriedServerNote,
        binNote,
        oneTargetNote,
        devOutputNote("<macos|windows|linux>"),
      ],
      examples: `akan start-desktop myapp --target default
akan start-desktop myapp --target kiosk
akan start-desktop myapp --target kiosk --release true --env debug`,
    },
    {
      name: "build-ios",
      signature: "akan build-ios <app> [--target <target>] [--env <env>] [--debug <boolean>] [--write <boolean>]",
      desc: l.trans({
        en: "Build the iOS app on the native runtime. It first makes a production web build against `--env`, then builds a simulator app for each target.",
        ko: "네이티브 런타임으로 iOS 앱을 빌드합니다. 먼저 `--env` 환경으로 배포용 웹 빌드를 만든 뒤 타깃마다 시뮬레이터용 앱을 빌드합니다.",
      }),
      options: [targetOption, debugEnvOption, debugBuildOption, writeOption],
      notes: [aliasNote("bi"), outputNote("ios")],
      examples: "akan build-ios myapp --target all --env debug",
    },
    {
      name: "build-android",
      signature: "akan build-android <app> [--target <target>] [--env <env>] [--debug <boolean>] [--write <boolean>]",
      desc: l.trans({
        en: "Build an APK of the Android app on the native runtime. Like `build-ios`, it makes a production web build against `--env` first.",
        ko: "네이티브 런타임으로 Android 앱의 APK를 빌드합니다. `build-ios`처럼 먼저 `--env` 환경으로 배포용 웹 빌드를 만듭니다.",
      }),
      options: [targetOption, debugEnvOption, debugBuildOption, writeOption],
      notes: [
        aliasNote("ba"),
        {
          name: l.trans({ en: "signing", ko: "서명" }),
          desc: l.trans({
            en: "Signed with `~/.akan/native/debug.keystore`, which is fine for testing; a Play Store file comes from `release-android`.",
            ko: "`~/.akan/native/debug.keystore`로 서명하므로 테스트용입니다. Play Store에 낼 파일은 `release-android`로 만듭니다.",
          }),
        },
        outputNote("android"),
      ],
      examples: "akan build-android myapp --target all --env debug",
    },
    {
      name: "build-desktop",
      signature:
        "akan build-desktop <app> [--target <target>] [--env <env>] [--debug <boolean>] [--installer <boolean>] [--arch <arm64|x64>] [--write <boolean>]",
      desc: l.trans({
        en: "Build the desktop app on this computer's OS: a `.app` on macOS and an app folder on Windows and Linux. Like `build-ios`, it makes a production web build against `--env` first. A release build signs from the environment — a Developer ID with notarization on macOS (`AKAN_NATIVE_MACOS_*`), Authenticode on Windows (`AKAN_NATIVE_WINDOWS_*`) — and warns when it cannot, since a downloaded copy is blocked or flagged. See the Desktop Release cheatsheet.",
        ko: "이 컴퓨터의 OS용 데스크톱 앱을 빌드합니다. macOS는 `.app`, Windows와 Linux는 앱 폴더입니다. `build-ios`처럼 먼저 `--env` 환경으로 배포용 웹 빌드를 만듭니다. release 빌드는 환경 변수로 서명합니다. macOS는 Developer ID 서명과 공증(`AKAN_NATIVE_MACOS_*`), Windows는 Authenticode(`AKAN_NATIVE_WINDOWS_*`)이고, 서명하지 못하면 경고합니다. 내려받은 사본이 막히거나 경고를 받기 때문입니다. 데스크톱 배포 치트시트를 보세요.",
      }),
      options: [
        targetOption,
        debugEnvOption,
        debugBuildOption,
        {
          name: "--installer",
          type: "Boolean",
          defaultValue: "false",
          desc: l.trans({
            en: "Also what a person downloads: on Windows `<file>-<version>-<arch>-setup.exe` with NSIS (`winget install NSIS.NSIS`), on macOS a `.dmg`, on Linux an `.AppImage` (needs `mksquashfs`).",
            ko: "내려받을 파일도 만듭니다. Windows는 NSIS로 `<file>-<version>-<arch>-setup.exe`(`winget install NSIS.NSIS`), macOS는 `.dmg`, Linux는 `.AppImage`(`mksquashfs` 필요)입니다.",
          }),
        },
        {
          name: "--arch",
          type: "String",
          defaultValue: l.trans({ en: "this computer's", ko: "이 컴퓨터의 CPU" }),
          desc: l.trans({
            en: "The CPU a Windows or Linux app runs on: `arm64` or `x64`. The server's addons and `bin` follow it. A macOS app is Apple silicon (arm64) only.",
            ko: "Windows·Linux 앱이 도는 CPU입니다. `arm64` 또는 `x64`이고, 서버의 애드온과 `bin`도 따릅니다. macOS 앱은 Apple silicon(arm64)만 만듭니다.",
          }),
        },
        writeOption,
      ],
      notes: [
        aliasNote("bd"),
        serverSwitchNote,
        carriedServerNote,
        binNote,
        {
          name: l.trans({ en: "installer", ko: "설치 프로그램" }),
          desc: l.trans({
            en: "It installs for the current user under `%LOCALAPPDATA%\\Programs`, where updates swap the app without an administrator, and adds the WebView2 Runtime where it is missing. `/S` installs silently and `/RUN` starts the app afterwards.",
            ko: "현재 사용자로 `%LOCALAPPDATA%\\Programs` 아래에 설치하므로 업데이트가 관리자 권한 없이 앱을 바꾸고, WebView2 Runtime이 없는 PC에는 함께 설치합니다. `/S`는 무인 설치, `/RUN`은 설치 뒤 실행입니다.",
          }),
        },
        {
          name: l.trans({ en: "reinstall", ko: "다시 설치" }),
          desc: l.trans({
            en: "`/D=<folder>` picks the install folder. Run again without it, the setup installs where the app already is; one started while another runs refuses to start.",
            ko: "`/D=<folder>`로 설치 폴더를 고릅니다. 이것 없이 다시 실행하면 앱이 이미 있는 폴더에 설치하고, 다른 설치 프로그램이 도는 동안 띄운 것은 시작하지 않습니다.",
          }),
        },
        outputNote("<macos|windows|linux>"),
      ],
      examples: `akan build-desktop myapp --target default
akan build-desktop myapp --target kiosk --env main
akan build-desktop myapp --installer true --env main`,
    },
    {
      name: "release-ios",
      signature:
        "akan release-ios <app> [--target <target>] [--env <env>] [--team <team>] [--ad-hoc <boolean>] [--write <boolean>] [--allow-local-release <boolean>]",
      desc: l.trans({
        en: "Build and sign the iOS app for an App Store release: an iPhone app and its `.ipa`. It defaults to the `main` backend and refuses `--env local` unless `--allow-local-release` is passed.",
        ko: "App Store 출시용으로 iOS 앱을 빌드하고 서명합니다. iPhone 앱과 그 `.ipa`를 만듭니다. 기본 백엔드는 `main`이고, `--allow-local-release` 없이 `--env local`을 주면 거부합니다.",
      }),
      options: [
        targetOption,
        releaseEnvOption,
        teamOption,
        {
          name: "--ad-hoc",
          type: "Boolean",
          defaultValue: "false",
          desc: l.trans({
            en: "Sign with an ad-hoc profile instead of an App Store one.",
            ko: "App Store 프로필 대신 ad-hoc 프로필로 서명합니다.",
          }),
        },
        writeOption,
        allowLocalReleaseOption,
      ],
      notes: [
        {
          name: l.trans({ en: "signing", ko: "서명" }),
          desc: l.trans({
            en: "The certificate and profile are found among the ones Xcode keeps on this Mac: the profile must cover the app id and every capability the app asks for. The command prints the one it used.",
            ko: "이 Mac에 Xcode가 둔 인증서와 프로필 중에서 찾습니다. 프로필은 app id와 앱이 요청하는 모든 capability를 덮어야 합니다. 명령이 쓴 서명을 출력합니다.",
          }),
        },
        outputNote("ios"),
      ],
      examples: `akan release-ios myapp --target all --env main
akan release-ios myapp --target default --ad-hoc true`,
    },
    {
      name: "release-android",
      signature:
        "akan release-android <app> [--assemble-type <type>] [--target <target>] [--env <env>] [--write <boolean>] [--allow-local-release <boolean>]",
      desc: l.trans({
        en: "Build and sign the Android app for a Play Store release, as an AAB or an APK. Like `release-ios`, it defaults to `main` and refuses `--env local` without `--allow-local-release`.",
        ko: "Play Store 출시용으로 Android 앱을 AAB나 APK로 빌드하고 서명합니다. `release-ios`처럼 기본은 `main`이고, `--allow-local-release` 없이 `--env local`은 거부합니다.",
      }),
      options: [
        {
          name: "--assemble-type",
          type: "String",
          defaultValue: "aab",
          enumOrFlag: "aab | apk",
          desc: l.trans({
            en: "`aab` for a Play Store upload, `apk` for direct installs.",
            ko: "`aab`는 Play Store 업로드용, `apk`는 직접 설치용입니다.",
          }),
        },
        targetOption,
        releaseEnvOption,
        writeOption,
        allowLocalReleaseOption,
      ],
      notes: [androidSigningNote, outputNote("android")],
      examples: `akan release-android myapp --target all --env main
akan release-android myapp --assemble-type apk --target all --env main`,
    },
    {
      name: "update-keygen",
      signature: "akan update-keygen <app> [--platform <platform>] [--target <target>]",
      desc: l.trans({
        en: "Make, once per app id, the Ed25519 key update releases are signed with, and print its public key for `native.updates.publicKey`. Run again, it reads the key it made. The key lives in `~/.akan/native/keys/<app id>.update.key`, or where `AKAN_NATIVE_UPDATE_KEY` points: keep it in the secret store the release machine reads, since an installed app takes no release it cannot verify. An `appId` that differs per platform has a key per id, so name the `--platform` you publish for.",
        ko: "업데이트 릴리스에 서명할 Ed25519 키를 app id마다 한 번 만들고, `native.updates.publicKey`에 넣을 공개 키를 출력합니다. 다시 실행하면 만든 키를 읽습니다. 키는 `~/.akan/native/keys/<app id>.update.key`나 `AKAN_NATIVE_UPDATE_KEY`가 가리키는 곳에 있습니다. 설치된 앱은 검증할 수 없는 릴리스를 받지 않으므로, 릴리스 머신이 읽는 비밀 저장소에 보관합니다. `appId`가 플랫폼마다 다르면 id마다 키가 있으므로, 게시할 `--platform`을 적습니다.",
      }),
      options: [
        {
          name: "--platform",
          type: "String",
          defaultValue: "desktop",
          enumOrFlag: "desktop | android | ios",
          desc: l.trans({
            en: "The platform whose app id the key signs for.",
            ko: "키가 서명할 app id의 플랫폼입니다.",
          }),
        },
        targetOption,
      ],
      examples: `akan update-keygen myapp
akan update-keygen myapp --platform android`,
    },
    {
      name: "publish-update",
      signature:
        "akan publish-update <app> [--platform <platform>] [--target <target>] [--env <env>] [--channel <channel>] [--write <boolean>] [--allow-local-release <boolean>]",
      desc: l.trans({
        en: "Build a release and sign it for installed apps: the whole app for a desktop (this computer's OS and CPU, delta from the release before), the web bundle for Android and iOS. It writes `<channel>.json`, its signature and its files under `.akan/native/<target>/updates`, which holds only what you upload: upload that folder to `native.updates.url`, `<channel>.json` and its `.sig` last and together, and keep a CDN from caching those two apart. A desktop release of a target that carries its server carries it too.",
        ko: "릴리스를 빌드해 설치된 앱용으로 서명합니다. 데스크톱은 앱 전체(이 컴퓨터의 OS와 CPU, 이전 릴리스와의 delta 포함), Android와 iOS는 웹 번들입니다. `.akan/native/<target>/updates` 아래에 `<channel>.json`, 서명, 파일을 쓰며, 그 폴더에는 올릴 것만 있습니다. 그 폴더를 `native.updates.url`에 올리되 `<channel>.json`과 `.sig`는 마지막에 함께 올리고, CDN이 두 파일을 따로 캐시하지 않게 합니다. 서버를 싣는 타깃의 데스크톱 릴리스에는 서버도 들어갑니다.",
      }),
      options: [
        {
          name: "--platform",
          type: "String",
          defaultValue: "desktop",
          enumOrFlag: "desktop | android | ios",
          desc: l.trans({
            en: "`desktop` is this computer's own OS and CPU.",
            ko: "`desktop`은 이 컴퓨터의 OS와 CPU입니다.",
          }),
        },
        targetOption,
        releaseEnvOption,
        {
          name: "--channel",
          type: "String",
          desc: l.trans({
            en: "Default `updates.channel`, else `--env`. It names only the manifest written, not the channel the release follows.",
            ko: "기본값은 `updates.channel`, 없으면 `--env`입니다. 쓸 매니페스트만 정하고, 릴리스가 따르는 채널은 바꾸지 않습니다.",
          }),
        },
        writeOption,
        allowLocalReleaseOption,
      ],
      notes: [
        serverSwitchNote,
        {
          name: "--env",
          desc: l.trans({
            en: "An app takes releases on `updates.channel`, else on the `--env` it was built with: publish with that `--env`.",
            ko: "앱은 `updates.channel`, 없으면 빌드할 때의 `--env` 채널로 릴리스를 받습니다. 그 `--env`로 게시합니다.",
          }),
        },
        {
          name: "pilot",
          desc: l.trans({
            en: "A release keeps its build's channel: give a pilot group a target whose `updates.channel` is the pilot's.",
            ko: "릴리스는 빌드할 때의 채널을 가집니다. pilot 그룹에는 `updates.channel`이 pilot인 타깃을 씁니다.",
          }),
        },
        {
          name: l.trans({ en: "server change", ko: "서버 유무 변경" }),
          desc: l.trans({
            en: "Refused before it builds when the channel's last release differs in carrying a server, as installed apps would refuse it: publish on another channel (`updates.channel`) or remove its `<channel>.json` from the output folder to start over.",
            ko: "채널의 직전 릴리스와 서버 유무가 다르면, 설치된 앱이 거부할 것이므로 빌드 전에 거부합니다. 다른 채널(`updates.channel`)로 게시하거나 출력 폴더에서 그 `<channel>.json`을 지워 새로 시작합니다.",
          }),
        },
        {
          name: l.trans({ en: "readable", ko: "공개" }),
          desc: l.trans({
            en: "Anyone who reaches `updates.url` can read the release; the updater sends no credentials. A desktop release is the whole app, the carried server's `private/` and env file included.",
            ko: "`updates.url`에 닿는 누구나 릴리스를 읽을 수 있고, 업데이터는 인증 정보를 보내지 않습니다. 데스크톱 릴리스는 앱 전체이므로 내장 서버의 `private/`와 env 파일도 들어 있습니다.",
          }),
        },
      ],
      examples: `akan publish-update myapp --env main
akan publish-update myapp --target pilot --env main
akan publish-update myapp --platform android --env main`,
    },
    {
      name: "pack-update",
      signature:
        "akan pack-update <app> --platform <platform> [--target <target>] [--env <env>] [--out <dir>] [--against <bundle.json>] [--write <boolean>] [--allow-local-release <boolean>]",
      desc: l.trans({
        en: "Pack an Android or iOS web bundle update unsigned, for a signer that keeps the key off this machine: `files/<sha256>`, `bundle.json` and `manifest.template.json`, the manifest with `channel`, `sequence` and `bundle` left for the signer, who signs exactly the bytes it uploads and uploads `files/` first. `publish-update` does the same with a key on this machine.",
        ko: "Android·iOS 웹 번들 업데이트를 서명 없이 묶습니다. 키를 이 컴퓨터 밖에 두는 서명자를 위한 것입니다. `files/<sha256>`, `bundle.json`, `manifest.template.json`을 쓰고, 매니페스트의 `channel`·`sequence`·`bundle`은 서명자가 채웁니다. 서명자는 올리는 바이트 그대로에 서명하고 `files/`를 먼저 올립니다. 이 컴퓨터의 키로 하는 것이 `publish-update`입니다.",
      }),
      options: [
        {
          name: "--platform",
          type: "String",
          enumOrFlag: "ios | android",
          desc: l.trans({ en: "The app it updates.", ko: "업데이트할 앱입니다." }),
        },
        targetOption,
        releaseEnvOption,
        {
          name: "--out",
          type: "String",
          desc: l.trans({
            en: "Default `.akan/native/<target>/updates/<platform>`.",
            ko: "기본값은 `.akan/native/<target>/updates/<platform>`입니다.",
          }),
        },
        {
          name: "--against",
          type: "String",
          desc: l.trans({
            en: "The `bundle.json` of the store build it must run in: writes `compat.json`, and fails when the bundle needs a new binary.",
            ko: "이 번들이 돌아야 할 스토어 빌드의 `bundle.json`입니다. `compat.json`을 쓰고, 새 바이너리가 필요하면 실패합니다.",
          }),
        },
        writeOption,
        allowLocalReleaseOption,
      ],
      examples: `akan pack-update myapp --platform android --env main
akan pack-update myapp --platform ios --env main --against store/bundle.json`,
    },
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
