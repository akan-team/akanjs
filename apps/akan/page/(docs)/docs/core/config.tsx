import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

const configKeys = [
  {
    key: "routes",
    type: "AkanRouteConfig[]",
    en: "Public domains for the app, optionally split per client with basePath.",
    ko: "앱이 사용할 공개 도메인이며, basePath로 클라이언트를 나눌 수 있습니다.",
  },
  {
    key: "api",
    type: "{ prefix, websocketPrefix }",
    default: "/api, /ws",
    en: "Where signal endpoints and the websocket upgrade are mounted. Baked into every client bundle.",
    ko: "signal 엔드포인트와 웹소켓 업그레이드가 마운트될 경로입니다. 모든 클라이언트 번들에 구워집니다.",
  },
  {
    key: "web",
    type: "boolean | { csr: boolean }",
    default: "true",
    en: "Which web surfaces the build produces and the app mounts at boot.",
    ko: "빌드가 만들고 앱이 부팅 때 마운트하는 웹 표면을 정합니다.",
  },
  {
    key: "i18n",
    type: "{ defaultLocale, locales }",
    default: 'en, ["en", "ko"]',
    en: "The locale segment every route sits under. defaultLocale must be one of locales.",
    ko: "모든 라우트가 놓이는 locale 세그먼트입니다. defaultLocale은 locales 안에 있어야 합니다.",
  },
  {
    key: "native",
    type: "AkanNativeAppConfig",
    en: "The iOS, Android and desktop app: its identity, platform settings and targets.",
    ko: "iOS·Android·데스크톱 앱의 정보, 플랫폼 설정, target입니다.",
  },
  {
    key: "images",
    type: "AkanImageConfig",
    default: "webp, quality 75",
    en: "Allow-list, sizes, and limits for the image optimizer. A remote host not listed is refused.",
    ko: "이미지 최적화의 허용 목록·크기·제한입니다. 목록에 없는 원격 호스트는 거부됩니다.",
  },
  {
    key: "publicEnv",
    type: "string[]",
    default: "[]",
    en: "Extra process.env names the browser build may inline, beyond the built-in AKAN_PUBLIC_* pattern.",
    ko: "기본 AKAN_PUBLIC_* 패턴 외에 브라우저 빌드가 인라인해도 되는 process.env 이름입니다.",
  },
  {
    key: "secrets",
    type: "string[]",
    default: "[]",
    en: "Globs for files that cannot live inside env.server.*.ts. Shipped by upload-env and git-ignored.",
    ko: "env.server.*.ts 안에 담을 수 없는 파일의 glob입니다. upload-env가 함께 보내고 git-ignore됩니다.",
  },
  {
    key: "assets",
    type: "{ pruneFonts, keepFonts }",
    default: "true, []",
    en: "How akan build trims the public/ copy it ships. Source trees are never touched.",
    ko: "akan build가 배포용 public/ 복사본을 어떻게 줄일지 정합니다. 원본 트리는 건드리지 않습니다.",
  },
  {
    key: "syncPageLibs",
    type: "string[] | boolean",
    default: "false",
    en: "Which library page folders this app mounts as its own routes.",
    ko: "이 앱이 자기 라우트로 마운트할 라이브러리 page 폴더를 정합니다.",
  },
  {
    key: "plugins",
    type: "AkanPlugin[]",
    default: "[]",
    en: "Akan plugins this app contributes, read live by the CLI.",
    ko: "이 앱이 등록하는 Akan 플러그인이며, CLI가 실행 시점에 읽습니다.",
  },
  {
    key: "pipeline",
    type: "AppPipelineConfig",
    default: "build → docker → deploy",
    en: "The stages Akan Cloud runs to build and deploy this app, in order.",
    ko: "Akan Cloud가 이 앱을 빌드하고 배포할 때 순서대로 실행하는 stage입니다.",
  },
  {
    key: "docker",
    type: "string | DockerImageConfig",
    default: "oven/bun:1-slim",
    en: "A whole Dockerfile as a string, or the parts akan build assembles one from.",
    ko: "Dockerfile 전체 문자열이거나, akan build가 Dockerfile을 조립할 재료입니다.",
  },
  {
    key: "database",
    type: "{ modes: DatabaseMode[] }",
    default: '{ modes: ["single"] }',
    en: "The modes the build can run in; each deployment picks one with AKAN_DATABASE_MODE.",
    ko: "빌드가 실행될 수 있는 모드 목록이며, 배포마다 AKAN_DATABASE_MODE로 그중 하나를 고릅니다.",
  },
  {
    key: "externalLibs",
    type: "string[]",
    default: "[]",
    en: "Packages kept as production runtime dependencies instead of being bundled.",
    ko: "번들에 넣지 않고 프로덕션 런타임 의존성으로 유지할 패키지입니다.",
  },
  {
    key: "trustedDependencies",
    type: "string[]",
    default: "[]",
    en: "Packages whose install scripts bun install --production runs, in the image and in a desktop app's server.",
    ko: "bun install --production이 설치 스크립트를 실행할 패키지이며, 이미지와 데스크톱 앱의 서버 모두에 적용됩니다.",
  },
  {
    key: "bin",
    type: "Record<string, { [platform]: AkanBinSource }>",
    default: "{}",
    en: "Executables every desktop build carries, per platform, first on its PATH; the image ignores it.",
    ko: "모든 데스크톱 빌드가 싣고 가는 실행 파일이며 플랫폼마다 적고, PATH 맨 앞에 놓입니다. 이미지는 읽지 않습니다.",
  },
  {
    key: "barrelImports",
    type: "string[]",
    default: "akanjs + workspace",
    en: "Barrel paths Akan flattens while scanning and bundling.",
    ko: "스캔과 번들링에서 Akan이 펼치는 barrel 경로입니다.",
  },
  {
    key: "optimizeImports",
    type: "string[]",
    default: "built-in list",
    en: "Extra packages whose imports the client build rewrites to the exact source file.",
    ko: "클라이언트 빌드가 정확한 원본 파일 import로 바꿔 줄 추가 패키지입니다.",
  },
];

const nativeFields = [
  {
    key: "basePath",
    type: "string",
    en: "The client the app opens, a basePath routes declares. An app without basePaths leaves it out.",
    ko: "앱이 여는 클라이언트이며 routes에 선언된 basePath입니다. basePath가 없는 앱은 적지 않습니다.",
  },
  {
    key: "indexPath",
    type: "string",
    default: "/",
    en: "Start path, and where a deep link's stack and a back with no history fall back to. ios.indexPath, android.indexPath and desktop.indexPath win on their platform.",
    ko: "시작 경로이며, 딥링크로 열 때 아래에 쌓는 화면이자 기록 없는 뒤로 가기가 돌아가는 곳입니다. ios.indexPath, android.indexPath, desktop.indexPath는 그 플랫폼에서 이 값보다 우선합니다.",
  },
  {
    key: "appName",
    type: "string",
    default: "the app name",
    en: "Display name of the native app.",
    ko: "네이티브 앱 표시 이름입니다.",
  },
  {
    key: "appId",
    type: "string | { default?, ios?, android?, macos?, windows?, linux? }",
    default: "com.<repo>.<app>",
    en: "Android applicationId and iOS bundle id; one per platform when the store listings already differ.",
    ko: "Android applicationId이자 iOS bundle id이며, 스토어마다 id가 이미 다르면 플랫폼별로 적습니다.",
  },
  {
    key: "fileName",
    type: "string",
    default: "the app folder name",
    en: "Name of the executables and archives: letters, digits, `.`, `_` and `-`.",
    ko: "실행 파일과 아카이브의 이름이며, 영문자, 숫자, `.`, `_`, `-`만 씁니다.",
  },
  {
    key: "version",
    type: "string",
    default: "0.0.1",
    en: "User-facing app version, written to Android versionName and iOS MARKETING_VERSION.",
    ko: "사용자에게 보이는 앱 버전이며, Android versionName과 iOS MARKETING_VERSION에 기록됩니다.",
  },
  {
    key: "buildNum",
    type: "number",
    default: "1",
    en: "Store build number, written to Android versionCode and iOS CURRENT_PROJECT_VERSION.",
    ko: "스토어 제출 빌드 번호이며, Android versionCode와 iOS CURRENT_PROJECT_VERSION에 기록됩니다.",
  },
  {
    key: "icon",
    type: "string | { image, backgroundColor? }",
    en: "A square PNG relative to the app folder, or it with the color behind its transparent areas.",
    ko: "앱 폴더 기준의 정사각형 PNG이거나, 그 이미지와 투명한 부분 뒤에 칠할 색입니다.",
  },
  {
    key: "splash",
    type: "string | { image?, backgroundColor?, autoHide?, timeout? }",
    en: "A PNG shown centered at launch, or the launch screen's image, color and when it hides.",
    ko: "실행할 때 가운데에 보이는 PNG이거나, 시작 화면의 이미지, 색, 숨기는 시점입니다.",
  },
  {
    key: "backgroundColor",
    type: "string | { light, dark }",
    default: "white / black",
    en: "What a window and an external view show before their page paints, and the splash's default color.",
    ko: "창과 external view가 페이지를 그리기 전에 보이는 색이며, splash의 기본 색입니다.",
  },
  {
    key: "permissions",
    type: "camera | contacts | location | push | speech",
    default: "[]",
    en: "Native permission hints; each activates the matching plugin's native configuration.",
    ko: "네이티브 권한 힌트이며, 각 값이 해당 플러그인의 네이티브 설정을 켭니다.",
  },
  {
    key: "plugins",
    type: "string[]",
    default: "[]",
    en: "Runtime plugins beyond the ones the permissions bring, by builtin id (iap) or absolute folder.",
    ko: "권한이 가져오는 것 외에 더 싣는 런타임 플러그인이며, 내장 id(iap)나 절대 경로 폴더로 적습니다.",
  },
  {
    key: "deepLinks.schemes",
    type: "string[]",
    en: "Custom URL schemes such as example://.",
    ko: "example:// 같은 커스텀 URL scheme입니다.",
  },
  {
    key: "deepLinks.domains",
    type: "string[]",
    en: "App-link and universal-link hosts, normalized to the bare host.",
    ko: "app link·universal link 호스트이며, 호스트만 남도록 정규화됩니다.",
  },
  {
    key: "updates",
    type: "{ url, publicKeys, revokedKeys?, channel?, readyTimeout?, report? }",
    en: "Where installed apps find new releases: a phone updates itself, a desktop app when it calls updates.",
    ko: "설치된 앱이 새 릴리스를 찾는 곳이며, 폰은 스스로, 데스크톱 앱은 updates를 부를 때 업데이트합니다.",
  },
  {
    key: "updates.url",
    type: "string",
    en: "A static base URL, such as a storage bucket, holding what akan publish-update writes; https in a release build.",
    ko: "akan publish-update가 쓴 파일을 두는 정적 기본 URL(스토리지 버킷 등)이며, 릴리스 빌드에서는 https입니다.",
  },
  {
    key: "updates.publicKeys",
    type: "string[]",
    en: "1–3 keys from akan update-keygen, signing key first; a key revokes only those before it, and a desktop app trusts the first. publicKey is the one-key form, never beside it.",
    ko: "akan update-keygen이 출력한 키 1~3개로, 서명 키를 맨 앞에 둡니다. 키는 앞의 키만 폐기하고, 데스크톱 앱은 첫 키만 믿습니다. 키가 하나면 publicKey로 쓰며, 둘을 함께 쓰지는 않습니다.",
  },
  {
    key: "updates.revokedKeys",
    type: "string[]",
    en: "Up to 16 keyIds every phone release revokes, kept here so a release from a fresh checkout revokes them too. A phone build trusts none of them.",
    ko: "모든 폰 릴리스가 폐기할 keyId(최대 16개)이며, 여기 두어 새 체크아웃에서 게시한 릴리스도 폐기를 이어 갑니다. 폰 빌드는 이 키들을 믿지 않습니다.",
  },
  {
    key: "updates.channel",
    type: "string",
    default: "the --env it is built with",
    en: "The channel the app follows; unset, only releases of the env it was built with. A pilot target names its own.",
    ko: "앱이 따르는 채널이며, 적지 않으면 빌드할 때의 env로 게시한 릴리스만 받습니다. pilot 타깃은 자기 채널을 적습니다.",
  },
  {
    key: "updates.readyTimeout",
    type: "number",
    default: "10000",
    en: "How long, in ms, a release on trial has to mount its first page before it is rolled back.",
    ko: "시험 실행 중인 릴리스가 첫 페이지를 마운트하기까지의 시간(ms)이며, 넘기면 되돌립니다.",
  },
  {
    key: "updates.report",
    type: "{ url: string }",
    en: "Where a phone posts what became of each release, such as a rollback, so rollback rates are visible. Unset sends nothing.",
    ko: "폰이 릴리스마다 어떻게 됐는지(되돌림 등) 보내는 주소이며, 되돌림 비율을 볼 수 있습니다. 적지 않으면 보내지 않습니다.",
  },
  {
    key: "devtools",
    type: "boolean",
    default: "false",
    en: "The web inspector in a release build too: internal test targets only.",
    ko: "릴리스 빌드에서도 웹 인스펙터를 엽니다. 내부 테스트 타깃에만 씁니다.",
  },
  {
    key: "ios.teamId",
    type: "string",
    en: "Apple Developer Team ID for apple-app-site-association; universal links need it.",
    ko: "apple-app-site-association에 쓰는 Apple Developer Team ID이며, universal link에 필요합니다.",
  },
  {
    key: "ios.infoPlist",
    type: "Record<string, AkanNativeValue>",
    en: "Info.plist keys added to the iOS app.",
    ko: "iOS 앱의 Info.plist에 더할 키입니다.",
  },
  {
    key: "ios.entitlements",
    type: "Record<string, AkanNativeValue>",
    en: "Entitlements added to the iOS app.",
    ko: "iOS 앱에 더할 entitlements입니다.",
  },
  {
    key: "ios.privacy",
    type: "{ tracking?, trackingDomains?, collectedDataTypes?, accessedApis? }",
    en: "The app's part of the privacy manifest, PrivacyInfo.xcprivacy, which an App Store upload requires.",
    ko: "App Store 업로드에 필요한 개인정보 매니페스트(PrivacyInfo.xcprivacy) 중 앱의 몫입니다.",
  },
  {
    key: "ios.files",
    type: "Record<string, string>",
    en: "Files copied into the app bundle, keyed by their path there; the value is app-relative.",
    ko: "앱 번들에 복사할 파일이며, 키는 번들 안 경로, 값은 앱 폴더 기준 경로입니다.",
  },
  {
    key: "android.sha256CertFingerprints",
    type: "string[]",
    en: "assetlinks.json signing fingerprints: debug for a local build, release for Play Store.",
    ko: "assetlinks.json에 쓰는 서명 인증서 fingerprint이며, debug는 로컬 빌드, release는 Play Store 빌드용입니다.",
  },
  {
    key: "android.googleServices",
    type: "string",
    en: "The google-services.json FCM push reads, relative to the app folder.",
    ko: "FCM 푸시가 읽는 google-services.json의 앱 폴더 기준 경로입니다.",
  },
  {
    key: "android.push",
    type: "{ channel?, smallIcon?, color? }",
    en: "The channel pushes arrive in, the status bar icon (an app-relative PNG) and the accent color.",
    ko: "푸시가 들어갈 알림 채널, 상태 표시줄 아이콘(앱 폴더 기준 PNG), 강조 색입니다.",
  },
  {
    key: "android.autoplay",
    type: "boolean",
    default: "false",
    en: "Media plays with sound without a tap first, as it does on iOS and the desktop.",
    ko: "iOS·데스크톱처럼 소리 있는 미디어가 터치 없이 재생됩니다.",
  },
  {
    key: "android.manifest",
    type: "string[]",
    en: "XML added at the <manifest> level, with the applicationId placeholder filled in.",
    ko: "<manifest> 수준에 넣을 XML이며, applicationId 자리표시자를 채워 넣습니다.",
  },
  {
    key: "android.application",
    type: "string[]",
    en: "XML added inside <application>.",
    ko: "<application> 안에 넣을 XML입니다.",
  },
  {
    key: "android.activity",
    type: "string[]",
    en: "XML added inside the app's activity.",
    ko: "앱의 activity 안에 넣을 XML입니다.",
  },
  {
    key: "android.files",
    type: "Record<string, string>",
    en: "Files copied into the app, keyed res/<type>/<file> or assets/<path>; the value is app-relative.",
    ko: "앱에 복사할 파일이며, 키는 res/<type>/<file>이나 assets/<path>, 값은 앱 폴더 기준 경로입니다.",
  },
  {
    key: "desktop.server",
    type: "boolean | { omit?, profile?, modules?, env?, restart?, watchdog? }",
    default: "false",
    en: "Carries the app's server on loopback, the only backend its pages call; switching takes a reinstall. The object form carries it with some changes, the keys below.",
    ko: "앱의 서버를 loopback으로 싣고, 페이지는 그 서버만 부릅니다. 켜고 끄려면 다시 설치해야 합니다. 객체로 주면 아래 키대로 바꿔서 싣습니다.",
  },
  {
    key: "desktop.server.omit",
    type: "string[]",
    en: "Packages only the image needs, left out with what only they pull in; the server's own bundle must not import them.",
    ko: "이미지에만 필요한 패키지이며, 그것만 끌어오는 패키지와 함께 뺍니다. 서버 번들 자체가 이 패키지를 import하면 안 됩니다.",
  },
  {
    key: "desktop.server.profile",
    type: "string",
    en: "Bundles env/env.server.<env>.<profile>.ts in place of the environment's own file; the build refuses one holding a secret-named value.",
    ko: "환경 자신의 파일 대신 env/env.server.<env>.<profile>.ts를 번들합니다. 비밀 이름의 값이 든 파일은 빌드가 거부합니다.",
  },
  {
    key: "desktop.server.modules",
    type: "string[]",
    en: "What the server mounts, as AKAN_MODULES: module names, or @edge for every module whose serve() lists edge.",
    ko: "서버가 마운트할 것이며 AKAN_MODULES로 전달됩니다. 모듈 이름이나, serve()에 edge를 적은 모든 모듈을 뜻하는 @edge를 씁니다.",
  },
  {
    key: "desktop.server.env",
    type: "Record<string, string>",
    en: "Variables the server starts with over the image's, readable by anyone on the computer; secret-named ones and the stage's own are refused.",
    ko: "이미지의 값보다 우선해 서버가 시작할 때 받는 환경 변수이며, 그 컴퓨터의 누구나 읽을 수 있습니다. 비밀 이름의 변수와 stage가 정하는 변수는 거부합니다.",
  },
  {
    key: "desktop.server.restart",
    type: '"forever" | number',
    default: "5",
    en: 'Crashes in a row before the app gives up on its server; "forever" for a screen nobody attends.',
    ko: '앱이 서버를 포기하기 전까지 연달아 허용하는 크래시 횟수입니다. 아무도 지켜보지 않는 화면이면 "forever"를 씁니다.',
  },
  {
    key: "desktop.server.watchdog",
    type: "boolean | { intervalMs?, failures? }",
    default: "false",
    en: "Asks the server's health route every intervalMs (10000) and restarts it after failures (3) missed answers.",
    ko: "intervalMs(10000)마다 서버의 health route에 묻고, failures(3)번 답이 없으면 서버를 다시 띄웁니다.",
  },
  {
    key: "desktop.recovery",
    type: '"errorPage" | "reload"',
    default: '"errorPage"',
    en: '"reload" reloads a crashed page every time, relaunches the app and opens no dialog, share sheet, download or link for a page; "errorPage" shows an error page.',
    ko: '"reload"는 멈춘 페이지를 매번 다시 불러오고 앱을 다시 띄우며, 페이지가 대화상자·공유 시트·다운로드·링크를 열지 못하게 합니다. "errorPage"는 오류 화면을 보여 줍니다.',
  },
  {
    key: "desktop.window",
    type: "{ fullscreen?, skipTaskbar?, frameless? }",
    en: "Opens the main window from its first frame fullscreen, without a taskbar button (Windows, Linux), or without a title bar and border (frameless).",
    ko: "주 창을 첫 프레임부터 전체화면으로, 작업 표시줄 버튼 없이(Windows, Linux), 또는 제목 표시줄과 테두리 없이(frameless) 엽니다.",
  },
  {
    key: "desktop.screenCapture",
    type: '"picker" | "auto"',
    default: '"picker"',
    en: '"auto" (Windows) shares the first screen without a picker; leave it off in an app that asks for a camera.',
    ko: '"auto"(Windows)는 선택 창 없이 첫 화면을 공유합니다. 카메라를 요청하는 앱에서는 켜지 않습니다.',
  },
  {
    key: "desktop.webview2",
    type: '"bootstrapper" | "standalone"',
    default: '"bootstrapper"',
    en: 'Windows setup: "bootstrapper" downloads the WebView2 Runtime where none is installed; "standalone" carries the whole runtime (~200 MB) for a PC offline at install.',
    ko: 'Windows 설치 프로그램입니다. "bootstrapper"는 WebView2 Runtime이 없는 PC에서 내려받고, "standalone"은 설치 때 오프라인인 PC를 위해 런타임 전체(약 200 MB)를 싣습니다.',
  },
  {
    key: "desktop.publisher",
    type: "string",
    default: "the app name",
    en: "Windows: who publishes the app, as the installed app's Publisher and its executable's company name.",
    ko: "Windows에서 앱을 배포하는 주체이며, 설치된 앱의 게시자와 실행 파일의 회사 이름으로 쓰입니다.",
  },
  {
    key: "targets",
    type: "Record<string, AkanNativeSettings>",
    default: "{ default: {} }",
    en: "Several native apps from one Akan app; each takes the fields above, without targets.",
    ko: "Akan 앱 하나에서 만드는 여러 네이티브 앱이며, 각각 targets를 뺀 위 필드를 받습니다.",
  },
];

const buildFields = [
  {
    key: "externalLibs",
    type: "string[]",
    default: "[]",
    en: "Unbundled packages, installed in production at the workspace-pinned version.",
    ko: "번들하지 않는 패키지이며, 프로덕션에서 워크스페이스가 고정한 버전으로 설치됩니다.",
  },
  {
    key: "trustedDependencies",
    type: "string[]",
    default: "[]",
    en: "Packages allowed to run their install scripts, for an addon that builds itself at install.",
    ko: "설치 스크립트 실행을 허용할 패키지이며, 설치하면서 스스로 빌드하는 애드온에 씁니다.",
  },
  {
    key: "bin",
    type: "Record<string, { [platform]: AkanBinSource }>",
    default: "{}",
    en: "{ url, sha256, file? } or { path, file? } per platform, carried in a desktop app and put first on its PATH.",
    ko: "플랫폼마다 { url, sha256, file? } 또는 { path, file? }이며, 데스크톱 앱에 실려 그 PATH 맨 앞에 놓입니다.",
  },
  {
    key: "optimizeImports",
    type: "string[]",
    default: "built-in list",
    en: "Extra packages the client build imports by exact file, so an icon set does not ship whole.",
    ko: "클라이언트 빌드가 정확한 원본 파일로 import할 추가 패키지이며, 아이콘 세트를 통째로 싣지 않게 합니다.",
  },
  {
    key: "barrelImports",
    type: "string[]",
    default: "akanjs + workspace",
    en: "Extra barrels to flatten while scanning and bundling, for ones outside the workspace.",
    ko: "스캔과 번들링에서 펼칠 추가 barrel 경로이며, 워크스페이스 밖의 barrel에만 씁니다.",
  },
  {
    key: "database.modes",
    type: '("single" | "multiple" | "cluster")[]',
    default: '["single"]',
    en: "Every declared mode's drivers ship: multiple adds bullmq and ioredis, cluster also postgres.",
    ko: "선언한 모든 모드의 드라이버가 함께 설치됩니다. multiple은 bullmq·ioredis를, cluster는 postgres까지 더합니다.",
  },
  {
    key: "assets.pruneFonts",
    type: "boolean",
    default: "true",
    en: "Drops unreferenced fonts from dist's public/ copy; an optimize-on font's source goes too.",
    ko: "참조되지 않는 폰트를 dist의 public/ 복사본에서 제거합니다. optimize가 켜진 폰트의 원본도 제거됩니다.",
  },
  {
    key: "assets.keepFonts",
    type: "string[]",
    default: "[]",
    en: "Font globs kept whatever the scan concludes, such as a URL assembled at runtime.",
    ko: "스캔 결과와 무관하게 남길 폰트 glob이며, 런타임에 조립되는 URL 같은 경우에 씁니다.",
  },
  {
    key: "syncPageLibs",
    type: "string[] | boolean",
    default: "false",
    en: "true mounts every dependency lib with a page folder, an array only those; false unlinks all.",
    ko: "true는 page 폴더가 있는 모든 의존 라이브러리를, 배열은 적은 것만 마운트하고, false는 기존 링크를 모두 제거합니다.",
  },
  {
    key: "plugins",
    type: "AkanPlugin[]",
    default: "[]",
    en: "Read live by the CLI for runtime packages, native project setup, and public/ assets.",
    ko: "CLI가 실행 시점에 읽어 런타임 패키지, 네이티브 프로젝트 설정, public/ 에셋을 처리합니다.",
  },
  {
    key: "docker",
    type: "string | DockerImageConfig",
    default: "oven/bun:1-slim",
    en: "A whole Dockerfile, or its parts: image, preRuns and postRuns around bun install, command.",
    ko: "Dockerfile 전체이거나 그 재료입니다. image, bun install 앞뒤의 preRuns·postRuns, command입니다.",
  },
];

const pipelineKeys = [
  {
    key: "stages",
    type: "AppPipelineStageInput[]",
    en: "This app's stages in order, the built-in actions included.",
    ko: "이 앱의 stage를 순서대로 적으며, 내장 액션도 여기에 넣습니다.",
  },
  {
    key: "env",
    type: "Record<string, string>",
    en: "Environment for every step of this app.",
    ko: "이 앱의 모든 step에 줄 환경변수입니다.",
  },
  {
    key: "after",
    type: "string[]",
    en: "Apps whose deploy comes before this one's; apps outside the build are ignored.",
    ko: "이 앱보다 먼저 배포할 앱입니다. 빌드에 없는 앱은 무시합니다.",
  },
];

const stageKeys = [
  {
    key: "use",
    type: '"build" | "docker" | "deploy" | "ota"',
    tags: ["use"],
    en: "A built-in action. Each appears at most once per app, in this order; `ota` runs only when listed.",
    ko: "내장 액션입니다. 앱마다 각각 한 번까지, 이 순서로 씁니다. `ota`는 적었을 때만 돕니다.",
  },
  {
    key: "targets",
    type: "string[]",
    tags: ["use"],
    en: "`ota` only: native targets to pack. Default: every target with `native.updates`.",
    ko: "`ota` 전용: 업데이트를 묶을 네이티브 타깃입니다. 기본값은 `native.updates`가 있는 타깃 전부입니다.",
  },
  {
    key: "platforms",
    type: '("ios" | "android")[]',
    tags: ["use"],
    en: "`ota` only: phones to pack for. Default: both.",
    ko: "`ota` 전용: 업데이트를 묶을 휴대폰 플랫폼입니다. 기본값은 둘 다입니다.",
  },
  {
    key: "name",
    type: "string",
    tags: ["shell", "use"],
    en: "The name shown for the stage; a shell stage needs one.",
    ko: "stage에 표시할 이름으로, 셸 stage에는 꼭 필요합니다.",
  },
  {
    key: "sh",
    type: "string",
    tags: ["shell"],
    en: "A bash script run as one step. Give `sh` or `steps`, not both.",
    ko: "step 하나로 실행할 bash 스크립트입니다. `sh`와 `steps` 중 하나만 씁니다.",
  },
  {
    key: "steps",
    type: "(string | PipelineStepInput)[]",
    tags: ["shell"],
    en: "Commands run one after another, each its own step.",
    ko: "차례로 실행할 명령으로, 각각이 step 하나입니다.",
  },
  {
    key: "env",
    type: "Record<string, string>",
    tags: ["shell"],
    en: "Environment for this stage's steps, over the app's and the workspace's.",
    ko: "이 stage의 step에 줄 환경변수로, 앱과 워크스페이스의 값보다 우선합니다.",
  },
  {
    key: "secrets",
    type: "string[]",
    tags: ["shell"],
    en: "Pipeline secrets the steps receive as environment variables of the same name.",
    ko: "step이 같은 이름의 환경변수로 받을 파이프라인 시크릿입니다.",
  },
  {
    key: "when",
    type: "PipelineWhen",
    tags: ["shell", "use"],
    en: "Run the stage only when every condition given holds.",
    ko: "적은 조건이 모두 맞을 때만 stage를 실행합니다.",
  },
  {
    key: "timeout",
    type: "PipelineDuration",
    tags: ["shell", "use"],
    en: "Time limit for the whole stage: seconds, or `30s`, `10m`, `2h`.",
    ko: "stage 전체의 제한 시간으로, 초 단위 숫자나 `30s`, `10m`, `2h`로 씁니다.",
  },
  {
    key: "retry",
    type: "number | { attempts, delay? }",
    tags: ["shell"],
    en: "Total attempts for each step without a `retry` of its own, with an optional `delay` between them.",
    ko: "자기 `retry`가 없는 step마다 적용하는 총 시도 횟수이며, 시도 사이의 `delay`를 줄 수 있습니다.",
  },
  {
    key: "retry",
    type: "number",
    tags: ["use"],
    en: "Total attempts of the action; a number only, with no `delay`.",
    ko: "액션의 총 시도 횟수입니다. 숫자만 받고 `delay`는 없습니다.",
  },
  {
    key: "allowFailure",
    type: "boolean",
    default: "false",
    tags: ["shell", "use"],
    en: "A failure of this stage does not fail the build.",
    ko: "이 stage가 실패해도 빌드를 실패로 만들지 않습니다.",
  },
  {
    key: "milestone",
    type: "PipelineMilestone",
    tags: ["shell", "use"],
    en: "Progress label: prepare, build, verify, package, deploy or finish.",
    ko: "진행 표시용 이름으로 prepare, build, verify, package, deploy, finish 중 하나입니다.",
  },
  {
    key: "id",
    type: "string",
    tags: ["shell", "use"],
    en: "A stable id; it defaults to a slug of the name, or to the action.",
    ko: "고정 id로, 기본값은 이름을 바꾼 slug나 액션 이름입니다.",
  },
  {
    key: "description",
    type: "string",
    tags: ["shell", "use"],
    en: "A longer note shown with the stage.",
    ko: "stage와 함께 보여 줄 긴 설명입니다.",
  },
];

const stepKeys = [
  {
    key: "sh",
    type: "string",
    en: "The bash command; a plain string in `steps` is this alone.",
    ko: "실행할 bash 명령입니다. `steps`에 문자열만 쓰면 이것만 적은 것과 같습니다.",
  },
  {
    key: "name",
    type: "string",
    en: "The name shown for the step.",
    ko: "step에 표시할 이름입니다.",
  },
  {
    key: "cwd",
    type: "string",
    en: "Directory to run in, relative to the workspace root and never above it.",
    ko: "실행할 디렉터리로, 워크스페이스 루트 기준이며 루트 밖으로 나갈 수 없습니다.",
  },
  {
    key: "env",
    type: "Record<string, string>",
    en: "Environment for this step, over the stage's.",
    ko: "이 step의 환경변수로, stage의 값보다 우선합니다.",
  },
  {
    key: "secrets",
    type: "string[]",
    en: "Secrets this step receives on top of the stage's.",
    ko: "stage의 시크릿에 더해 이 step이 받을 시크릿입니다.",
  },
  {
    key: "timeout",
    type: "PipelineDuration",
    en: "Time limit for this step.",
    ko: "이 step의 제한 시간입니다.",
  },
  {
    key: "retry",
    type: "number | { attempts, delay? }",
    en: "Total attempts, with an optional `delay` between them.",
    ko: "총 시도 횟수이며, 시도 사이의 `delay`를 줄 수 있습니다.",
  },
  {
    key: "allowFailure",
    type: "boolean",
    default: "false",
    en: "A failure of this step does not fail its stage.",
    ko: "이 step이 실패해도 stage를 실패로 만들지 않습니다.",
  },
  {
    key: "skipExitCodes",
    type: "number[]",
    en: "Exit codes that end the step as skipped, along with the rest of its stage.",
    ko: "이 코드로 끝나면 step을 건너뜀으로 처리하고, stage의 나머지도 건너뜁니다.",
  },
  {
    key: "id",
    type: "string",
    en: "A stable id within the stage.",
    ko: "stage 안에서 쓰는 고정 id입니다.",
  },
];

const whenKeys = [
  {
    key: "branch",
    type: "string | string[]",
    en: "Patterns the build's branch must match.",
    ko: "빌드 브랜치가 맞아야 하는 패턴입니다.",
  },
  {
    key: "trigger",
    type: "PipelineTrigger | PipelineTrigger[]",
    en: "What may have started the build: push, redeploy, initial, rebuild or manual.",
    ko: "빌드를 시작한 계기로 push, redeploy, initial, rebuild, manual 중에서 고릅니다.",
  },
  {
    key: "changed",
    type: "string | string[]",
    en: "Path patterns, one of which changed since the branch's last good build.",
    ko: "브랜치의 마지막 성공 빌드 이후 바뀐 경로 중 하나가 맞아야 하는 패턴입니다.",
  },
];

const workspacePipelineKeys = [
  {
    key: "before",
    type: "WorkspacePipelineStageInput[]",
    en: "Stages that run before any app stage, one phase each.",
    ko: "어느 앱 stage보다 먼저 실행할 stage로, 각각이 phase 하나입니다.",
  },
  {
    key: "after",
    type: "WorkspacePipelineStageInput[]",
    en: "Stages that run after every app's last stage.",
    ko: "모든 앱의 마지막 stage 뒤에 실행할 stage입니다.",
  },
  {
    key: "post",
    type: "{ success, failure, canceled, always }",
    en: "Steps that close the build, picked by how it ended; `always` runs last.",
    ko: "빌드를 마무리하는 step으로, 끝난 결과에 따라 고르고 `always`는 마지막에 실행합니다.",
  },
  {
    key: "env",
    type: "Record<string, string>",
    en: "Environment for every step of the build, app stages included.",
    ko: "앱 stage를 포함해 빌드의 모든 step에 줄 환경변수입니다.",
  },
  {
    key: "timeout",
    type: "PipelineDuration",
    en: "Time limit for the whole build.",
    ko: "빌드 전체의 제한 시간입니다.",
  },
];

const workspaceCloudKeys = [
  {
    key: "cloud.host",
    type: "string",
    default: "Akan Cloud",
    en: "The cloud every cloud command talks to when it names no --host, such as a self-hosted one.",
    ko: "--host 없이 실행한 클라우드 명령이 연결할 클라우드입니다. 직접 운영하는 클라우드 등을 씁니다.",
  },
];

const workspaceSubspaceKeys = [
  {
    key: "subspace.pushableBranches",
    type: "string[]",
    default: "main, develop, debug",
    en: "Branches akan subspace push mirrors from; another is refused, so a feature branch never reaches a mirrored repo.",
    ko: "akan subspace push가 미러링하는 브랜치입니다. 다른 브랜치는 거부하므로 기능 브랜치가 미러 저장소로 가지 않습니다.",
  },
];

const workspaceStageKinds = [
  {
    shape: "{ name, sh | steps }",
    en: "A shell stage, run once, as in an app.",
    ko: "앱의 것과 같은 셸 stage로, 한 번 실행합니다.",
  },
  {
    shape: "{ name, parallel: [...] }",
    en: "Shell stages side by side; `maxParallel` caps them, `failFast` stops the rest on a failure.",
    ko: "셸 stage를 나란히 실행합니다. `maxParallel`로 수를 제한하고, `failFast`면 하나가 실패할 때 나머지를 멈춥니다.",
  },
  {
    shape: '{ name, matrix: "apps", sh }',
    en: "One copy per app of the build with `AKAN_CI_APP` set; `when.app` narrows the apps.",
    ko: "빌드의 앱마다 하나씩 `AKAN_CI_APP`을 정해 실행합니다. `when.app`으로 앱을 좁힙니다.",
  },
];

const phaseRows = [
  {
    phase: "before",
    en: "Each root `before` stage, one phase apiece.",
    ko: "루트 `before`의 stage마다 phase 하나입니다.",
  },
  { phase: "before-build", en: "App stages written before `build`.", ko: "`build`보다 앞에 적은 앱 stage입니다." },
  { phase: "build", en: "Every app's build, side by side.", ko: "모든 앱의 빌드를 나란히 실행합니다." },
  {
    phase: "after-build",
    en: "App stages written between `build` and `docker`.",
    ko: "`build`와 `docker` 사이에 적은 앱 stage입니다.",
  },
  { phase: "docker", en: "Every app's image.", ko: "모든 앱의 이미지를 만듭니다." },
  {
    phase: "after-docker",
    en: "App stages written between `docker` and `deploy`.",
    ko: "`docker`와 `deploy` 사이에 적은 앱 stage입니다.",
  },
  {
    phase: "deploy",
    en: "Every app's deploy, one at a time, in `after` order.",
    ko: "모든 앱을 `after` 순서에 따라 하나씩 배포합니다.",
  },
  { phase: "after-deploy", en: "App stages written after `deploy`.", ko: "`deploy` 뒤에 적은 앱 stage입니다." },
  { phase: "ota", en: "Over-the-air packs of apps that list `ota`.", ko: "`ota`를 적은 앱의 OTA 업데이트를 묶습니다." },
  { phase: "after-ota", en: "App stages written after `ota`.", ko: "`ota` 뒤에 적은 앱 stage입니다." },
  { phase: "after", en: "Each root `after` stage.", ko: "루트 `after`의 stage입니다." },
  {
    phase: "post",
    en: "The steps for how the build ended, then `always`.",
    ko: "끝난 결과에 맞는 step을 실행하고, 이어서 `always`를 실행합니다.",
  },
];

const ciEnvRows = [
  {
    name: ["AKAN_CI_BRANCH", "AKAN_CI_ENV", "AKAN_CI_TRIGGER", "AKAN_CI_BUILD_NUM", "AKAN_CI_COMMIT"],
    en: "The build's branch, env, trigger, number and commit.",
    ko: "빌드의 브랜치, env, 계기, 번호, 커밋입니다.",
  },
  {
    name: ["AKAN_CI_APPS", "AKAN_CI_APP"],
    en: "The apps the build covers, and the app a stage runs for.",
    ko: "빌드가 다루는 앱들과, stage가 실행되는 앱입니다.",
  },
  {
    name: ["AKAN_CI_PHASE", "AKAN_CI_STAGE", "AKAN_CI_STEP"],
    en: "The ids of what is running.",
    ko: "지금 실행 중인 것의 id입니다.",
  },
  {
    name: "AKAN_CI_RESULT",
    en: "How the build ended, for a `post` step.",
    ko: "`post` step에 알려 주는 빌드 결과입니다.",
  },
  {
    name: ["CI", "AKAN_CI"],
    en: "Set on every step, so a script can tell it runs in a build.",
    ko: "모든 step에 있어서, 스크립트가 빌드 안에서 실행되는지 알 수 있습니다.",
  },
];

export default page().render(() => {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="app-config" title={l.trans({ en: "App Config", ko: "앱 설정" })}>
        <Docs.Title>{l.trans({ en: "App Config", ko: "앱 설정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "akan.config.ts is the app-level settings file. You do not need to understand every option on day one. Start with an empty file, then add only the fields your app actually needs.",
              ko: "akan.config.ts는 앱 단위 설정 파일입니다. 처음부터 모든 옵션을 이해할 필요는 없습니다. 빈 파일로 시작하고, 앱에 필요한 필드만 하나씩 추가하면 됩니다.",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/minimal/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {};

export default config;`}
          />
          <div>
            {l.trans({
              en: "This is the whole key set. Every one of them has a default that a working app can live with, and the slides below cover the ones you are most likely to change:",
              ko: "설정 가능한 키는 아래가 전부입니다. 모두 앱이 그대로 동작하는 기본값을 갖고 있으며, 그중 자주 바꾸게 되는 것들을 이어지는 슬라이드에서 다룹니다:",
            })}
          </div>
          <Docs.OptionTable
            items={configKeys.map(({ key, type, default: fallback, en, ko }) => ({
              key,
              type,
              default: fallback,
              desc: l.trans({ en, ko }),
            }))}
          />
          <div className="space-y-1 pl-2">
            {[
              {
                title: l.trans({ en: "Start small", ko: "작게 시작" }),
                desc: l.trans({
                  en: "Most defaults are already prepared, so an empty config is valid.",
                  ko: "대부분의 기본값은 준비되어 있으므로 빈 config도 유효합니다.",
                }),
              },
              {
                title: l.trans({ en: "Add only what changes", ko: "필요한 것만 추가" }),
                desc: l.trans({
                  en: "Define only the parts your app actually needs to customize.",
                  ko: "앱에서 실제로 바꿔야 하는 부분만 선언하면 됩니다.",
                }),
              },
              {
                title: l.trans({ en: "One source of truth", ko: "하나의 기준점" }),
                desc: l.trans({
                  en: "CLI commands, production builds, and native app commands all read this file.",
                  ko: "CLI 명령, 프로덕션 빌드, 네이티브 앱 명령이 모두 이 파일을 기준으로 동작합니다.",
                }),
              },
            ].map(({ title, desc }) => (
              <div key={title}>
                <span className="font-bold text-foreground">{title}: </span>
                <span className="text-foreground/70 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="config-shape" title={l.trans({ en: "Config Shape", ko: "설정 파일 형태" })}>
        <Docs.Title>{l.trans({ en: "Config Shape", ko: "설정 파일 형태" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The default export can be a plain object or a function. Use an object for most apps. Use a function only when the config needs app metadata while it is being loaded.",
              ko: "default export는 일반 객체이거나 함수일 수 있습니다. 대부분의 앱은 객체로 충분합니다. config를 읽는 시점에 앱 메타데이터가 필요할 때만 함수를 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-1">
          <Code.Snippet
            className="w-full"
            title={l.trans({ en: "Object config", ko: "객체 설정" })}
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [{ domains: { main: ["www.example.com"] }, basePath: "store" }],
};

export default config;`}
          />
          <Code.Snippet
            className="w-full"
            title={l.trans({ en: "Function config", ko: "함수 설정" })}
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = (app) => ({
  native: {
    appName: app.name,
    appId: "com.example.app",
  },
});

export default config;`}
          />
        </div>
        <Docs.Alert type="info">
          {l.trans({
            en: "Akan treats config as partial settings. Missing fields are filled with framework defaults.",
            ko: "Akan은 config를 부분 설정으로 다룹니다. 선언하지 않은 값은 프레임워크 기본값으로 채워집니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="app-env" title={l.trans({ en: "Application Env", ko: "애플리케이션 환경설정" })}>
        <Docs.Title>{l.trans({ en: "Application Env", ko: "애플리케이션 환경설정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "akan.config.ts describes how the app is built and routed. The env/ folder describes the actual values the app uses at runtime, such as public client keys, server-only options, and environment-specific service settings.",
              ko: "akan.config.ts가 앱을 어떻게 빌드하고 라우팅할지 설명한다면, env/ 폴더는 앱이 실행 중 사용할 실제 값을 설명합니다. 공개 가능한 클라이언트 키, 서버 전용 옵션, 환경별 서비스 설정 같은 값이 여기에 들어갑니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-1">
          <Code.Snippet
            className="w-full"
            title="env/env.client.local.ts"
            code={`import type { AppClientEnv } from "./env.client.type";

export const env: AppClientEnv = {
  google: {
    mapKey: "local-map-key",
  },
} as const;`}
          />
          <Code.Snippet
            className="w-full"
            title="env/env.server.local.ts"
            code={`import type { ModulesOptions } from "../lib/option";
import { libEnv } from "./env.server.type";

export const env: ModulesOptions = {
  ...libEnv,
  hostname: null,
  security: {
    verifies: [["password", "phone"]],
    sso: {},
  },
};`}
          />
        </div>
        <Docs.IntroTable
          type={l.trans({ en: "File", ko: "파일" })}
          items={[
            {
              name: "env.client.*",
              desc: l.trans({
                en: "Public-safe values for client code, such as map keys, site keys, or feature switches.",
                ko: "클라이언트 코드가 쓰는 공개 가능한 값입니다. 지도 키, 사이트 키, 기능 스위치 같은 값입니다.",
              }),
            },
            {
              name: "env.server.*",
              desc: l.trans({
                en: "Server-only values: server options, connection settings, private service configuration.",
                ko: "서버 모듈에서만 쓰는 값입니다. 서버 옵션, 연결 설정, 비공개 서비스 설정을 둡니다.",
              }),
            },
            {
              name: ["local", "testing", "debug", "develop", "main"],
              desc: l.trans({
                en: "Suffixes chosen by AKAN_PUBLIC_ENV: your machine, tests, two shared stages, production.",
                ko: "AKAN_PUBLIC_ENV로 고르는 suffix이며, 순서대로 내 PC, 테스트, 공유 개발 단계 둘, 운영 환경입니다.",
              }),
            },
            {
              name: "env.*.type.ts",
              desc: l.trans({
                en: "The shape of env values, so a missing or misspelled setting is caught while coding.",
                ko: "env 값의 형태를 정의해, 빠지거나 이름이 틀린 설정을 코딩 중에 잡습니다.",
              }),
            },
          ]}
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: "Client env and publicEnv are different. env.client.* stores app values for each environment, while publicEnv only allows selected process.env names to be exposed to browser builds.",
            ko: "client env와 publicEnv는 다릅니다. env.client.*는 환경별 앱 값을 저장하고, publicEnv는 process.env 중 어떤 이름을 브라우저 빌드에 노출할지 허용하는 목록입니다.",
          })}
        </Docs.Alert>
        <Docs.Alert type="info">
          {l.trans({
            en: "Server env can also include options from shared libraries through env.server.type.ts. This lets an app keep one final server env object while reusing library-level defaults.",
            ko: "server env는 env.server.type.ts를 통해 shared library의 옵션을 함께 포함할 수 있습니다. 덕분에 앱은 라이브러리 기본값을 재사용하면서 최종 서버 env 객체 하나를 유지할 수 있습니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="server-option" title={l.trans({ en: "Server Option", ko: "서버 옵션" })}>
        <Docs.Title>{l.trans({ en: "Server Option", ko: "서버 옵션" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "lib/option.ts is where the app configures its server. env/ holds the values, akan.config.ts holds the build, and this file wires them into the runtime: use objects, signal middleware, adaptor overrides, web proxies, the MCP server, the agent relay's access policy, and the LLM that relay speaks to. Every library the app depends on brings its own option.ts, read in mount order with the app's last — so an app tightens what a library declared without restating it.",
              ko: "lib/option.ts는 앱이 서버를 설정하는 자리입니다. env/는 값을, akan.config.ts는 빌드를 담고, 이 파일은 그것을 런타임에 연결합니다. use 객체, signal middleware, adaptor override, web proxy에 더해 MCP 서버, agent relay 접근 정책, 그 relay가 말을 거는 LLM까지 여기서 정합니다. 앱이 의존하는 모든 라이브러리도 각자 option.ts를 가지며, 마운트 순서대로 읽고 앱의 것을 마지막에 얹습니다. 그래서 앱은 라이브러리가 선언한 값을 다시 쓰지 않고 조일 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="lib/option.ts"
          code={`import { AkanOption } from "akanjs/server";
import type { LlmOption } from "akanjs/service";

import { SignedIn } from "../srvkit";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions & {
  llm?: LlmOption;
};

export const option = new AkanOption<ModulesOptions>()
  .setLlm((options) => options.llm ?? {})
  .setAgentAccess(SignedIn)
  .setMcp({ instructions: "Domain tools for the app. Start from taskInTodo." });`}
        />
        <Docs.IntroTable
          type={l.trans({ en: "Stage", ko: "단계" })}
          items={[
            {
              name: "setLlm",
              desc: l.trans({
                en: "apiKey, model, and host for whichever adaptor holds LlmAdaptorRole.",
                ko: "LlmAdaptorRole을 차지한 어댑터가 쓸 apiKey·model·host입니다.",
              }),
            },
            {
              name: "setAgentAccess",
              desc: l.trans({
                en: "Guards (ANDed) for spending the LLM key via runAgentTurn; with none, every call is refused.",
                ko: "runAgentTurn으로 LLM 키를 쓰려면 통과해야 할 가드이며 AND로 묶입니다. 없으면 모든 호출이 거절됩니다.",
              }),
            },
            {
              name: "setMcp",
              desc: l.trans({
                en: "MCP server settings such as instructions, readOnly, and auth.",
                ko: "instructions·readOnly·auth 같은 MCP 서버 설정입니다.",
              }),
            },
            {
              name: ["use", "applyMiddleware", "applyAdaptor", "applyWebProxy"],
              desc: l.trans({
                en: "Register env-derived use<T>() singletons, signal middleware, adaptor overrides, web proxies.",
                ko: "service가 use<T>()로 잡는 env 기반 싱글턴, signal middleware, adaptor override, web proxy를 등록합니다.",
              }),
            },
          ]}
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: "Read the LLM key from the env object, never write it in option.ts: env.server.* is gitignored, this file is not.",
            ko: "LLM 키는 option.ts에 적지 말고 env 객체에서 읽으세요. env.server.*는 gitignore 대상이지만 이 파일은 아닙니다.",
          })}
        </Docs.Alert>
        <Docs.Alert type="info">
          {l.trans({
            en: "Each of these has an env spelling too (AKAN_MCP_*, AKAN_AGENT), for a deployment that must configure what the source does not. A value written in option.ts wins over the env of the same name.",
            ko: "이 설정들에는 env 이름도 하나씩 있습니다(AKAN_MCP_*, AKAN_AGENT). 소스에 없는 값을 배포 시점에 정해야 할 때를 위한 것이며, option.ts에 쓴 값이 같은 이름의 env를 이깁니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="routes" title={l.trans({ en: "Routes and Domains", ko: "Route와 Domain" })}>
        <Docs.Title>{l.trans({ en: "Routes and Domains", ko: "Route와 Domain" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "routes is where you list the public domains for the app. If your app has several clients, each route can also name the client with basePath. The multi-client page explains that structure in detail; here we focus on the config fields.",
              ko: "routes는 앱에서 사용할 공개 도메인을 적는 곳입니다. 앱에 여러 클라이언트가 있다면 각 route에 basePath로 클라이언트 이름도 적을 수 있습니다. 다중 클라이언트 구조 자체는 Multi Client 페이지에서 자세히 다루고, 여기서는 설정 필드에 집중합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  externalLibs: ["shiki"],
  routes: [
    { domains: { main: ["www.akanjs.com", "akanjs.com"] }, basePath: "akanjs" },
    { domains: { main: ["soft.akanjs.com"] }, basePath: "soft" },
    { domains: { main: ["office.akanjs.com"] }, basePath: "office" },
  ],
};

export default config;`}
        />
        <Docs.OptionTable
          items={[
            {
              key: "basePath",
              type: "string",
              desc: l.trans({
                en: "The client this route opens and its first page folder; without one, the route is the app.",
                ko: "이 route가 여는 클라이언트이자 첫 page 폴더입니다. basePath가 없는 route는 앱 자체입니다.",
              }),
            },
            {
              key: "domains",
              type: "Record<branch, string[]>",
              default: "{}",
              desc: l.trans({
                en: "Hosts that open this route, keyed by branch: debug, develop, main, or any key you add.",
                ko: "이 route를 여는 호스트이며 branch를 키로 씁니다. debug·develop·main은 항상 있고, 다른 키는 branch를 추가합니다.",
              }),
            },
          ]}
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: "If you declare basePath, the page folder must follow the same name. See Multi Client for the full page layout rule.",
            ko: "basePath를 선언했다면 page 폴더도 같은 이름을 따라야 합니다. 자세한 page 배치 규칙은 Multi Client 페이지를 참고하세요.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="web-surfaces" title={l.trans({ en: "Web Surfaces And Prefixes", ko: "웹 표면과 경로 접두사" })}>
        <Docs.Title>{l.trans({ en: "Web Surfaces And Prefixes", ko: "웹 표면과 경로 접두사" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "web decides which web surfaces the build produces, and api decides where the server mounts its endpoints. Both are declared here rather than only in main.ts, because both are baked into the client bundles: a prebuilt CSR shell or a native app never reaches a server that could tell it otherwise.",
              ko: "web은 빌드가 어떤 웹 표면을 만들지 정하고, api는 서버가 엔드포인트를 어디에 마운트할지 정합니다. 둘 다 main.ts만이 아니라 여기에 선언합니다. 두 값 모두 클라이언트 번들에 구워지며, 미리 빌드된 CSR 셸이나 네이티브 앱은 이를 알려 줄 서버에 닿지 못하기 때문입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  web: { csr: false },
  api: { prefix: "/backend", websocketPrefix: "/socket" },
};

export default config;`}
        />
        <Docs.OptionTable
          items={[
            {
              key: "web",
              type: "boolean | { csr: boolean }",
              default: "true",
              desc: l.trans({
                en: "true builds SSR and CSR, false is API-only, and { csr: false } drops only the CSR shell.",
                ko: "true는 SSR과 CSR을 모두 빌드하고, false는 API 전용이며, { csr: false }는 CSR 셸만 뺍니다.",
              }),
            },
            {
              key: "api.prefix",
              type: "string",
              default: "/api",
              desc: l.trans({
                en: "Where signal endpoints are mounted; read it back with getApiPrefix() from akanjs/base.",
                ko: "signal 엔드포인트가 마운트될 경로이며, akanjs/base의 getApiPrefix()로 읽습니다.",
              }),
            },
            {
              key: "api.websocketPrefix",
              type: "string",
              default: "/ws",
              desc: l.trans({
                en: "Where the websocket upgrade sits; read it back with getWsPrefix().",
                ko: "웹소켓 업그레이드가 놓이는 경로이며, getWsPrefix()로 읽습니다.",
              }),
            },
          ]}
        />
        <div>
          {l.trans({
            en: "Never write either prefix as a literal; new AkanApp({ prefix, websocketPrefix }) still overrides both for the server and every page it renders.",
            ko: "두 접두사를 문자열로 직접 적지 마세요. new AkanApp({ prefix, websocketPrefix })는 서버와 그 서버가 렌더링하는 모든 페이지에서 두 값을 여전히 덮어씁니다.",
          })}
        </div>
        <div>
          {l.trans({
            en: "AKAN_SSR and AKAN_CSR narrow the same choice at boot, and can only narrow it: a deployment cannot switch on a surface the build left out. akan start ignores web entirely, so the dev surface stays whole.",
            ko: "AKAN_SSR과 AKAN_CSR은 같은 선택을 부팅 시점에 좁히며, 좁히기만 합니다. 빌드가 빼놓은 표면을 배포가 다시 켤 수는 없습니다. akan start는 web을 무시하므로 개발 화면은 그대로 유지됩니다.",
          })}
        </div>
        <Docs.Alert type="warning">
          {l.trans({
            en: "A native app ships the CSR shell, so web: { csr: false } and a native section do not go together — drop the native section or leave CSR on.",
            ko: "네이티브 앱은 CSR 셸을 싣고 나가므로 web: { csr: false }와 native 섹션은 함께 쓸 수 없습니다. native 섹션을 빼거나 CSR을 켠 채로 두세요.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="native" title={l.trans({ en: "Native Apps", ko: "네이티브 앱" })}>
        <Docs.Title>{l.trans({ en: "Native Apps", ko: "네이티브 앱" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "native describes the app the Android, iOS and desktop commands build from this app's CSR client: its name, package id, version, permissions and plugins. A value only one platform reads sits in that platform's section, ios, android or desktop.",
              ko: "native는 Android·iOS·데스크톱 명령이 이 앱의 CSR 클라이언트로 만드는 앱을 설명합니다. 이름, 패키지 ID, 버전, 권한, 플러그인을 적고, 한 플랫폼만 읽는 값은 그 플랫폼의 섹션인 ios, android, desktop에 둡니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="Native config"
          code={`const config: AppConfig = {
  native: {
    appName: "Example",
    appId: "com.example.app",
    version: "1.0.0",
    buildNum: 1,
    indexPath: "/explore",
    icon: "public/icon.png",
    splash: "public/splash.png",
    permissions: ["camera", "push"],
    plugins: ["iap"],
    deepLinks: { schemes: ["example"], domains: ["example.com"] },
    ios: { teamId: "TEAMID" },
    android: {
      googleServices: "secrets/google-services.json",
      sha256CertFingerprints: [
        "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00",
      ],
      files: { "res/raw/chime.mp3": "public/chime.mp3" },
    },
  },
};`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "An app without basePaths leaves basePath out, and an app that ships one native app needs no targets. So the shortest config for a desktop app that carries the app's server is this:",
              ko: "basePath가 없는 앱은 basePath를 적지 않고, 네이티브 앱을 하나만 내는 앱에는 targets가 필요 없습니다. 그래서 앱의 서버를 싣는 데스크톱 앱의 가장 짧은 설정은 이렇습니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="native without basePath"
          code={`const config: AppConfig = {
  native: { desktop: { server: true } },
};`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: 'When the first page is not /, add indexPath beside it: native: { indexPath: "/board", desktop: { server: true } }. When one platform starts elsewhere, give that platform section its own: native: { indexPath: "/mobile", desktop: { indexPath: "/", server: true } } opens the phones on /mobile and the desktop app on /.',
              ko: '첫 페이지가 /가 아니면 그 옆에 indexPath를 더합니다: native: { indexPath: "/board", desktop: { server: true } }. 한 플랫폼만 다른 곳에서 시작하면 그 플랫폼 섹션에 indexPath를 따로 적습니다: native: { indexPath: "/mobile", desktop: { indexPath: "/", server: true } }는 폰 앱을 /mobile로, 데스크톱 앱을 /로 엽니다.',
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Targets", ko: "Target" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "targets builds several native apps from one Akan app, such as a store app and an admin app that each open their own basePath. A target takes every field of native but targets, and its own values win: objects (deepLinks, updates, ios, android, desktop and the objects inside them) merge key by key, while lists, icon, splash and every other value are replaced, so a target's permissions replace native's instead of adding to them. Without targets the app has one target, named default, or named after the app and opening that basePath when routes declares one with the app's name.",
              ko: "targets는 Akan 앱 하나로 네이티브 앱 여러 개를 만듭니다. 각자 자기 basePath를 여는 스토어 앱과 관리자 앱 같은 경우입니다. target은 targets를 뺀 native의 모든 필드를 받고, target이 적은 값이 이깁니다. 객체(deepLinks, updates, ios, android, desktop과 그 안의 객체)는 키마다 합치고, 목록, icon, splash와 나머지 값은 통째로 바꿉니다. 그래서 target의 permissions는 native의 목록에 더해지지 않고 그 목록을 대신합니다. targets가 없으면 앱에는 default라는 target 하나가 있고, routes에 앱 이름과 같은 basePath가 있으면 그 target은 앱 이름을 갖고 그 basePath를 엽니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="native.targets"
          code={`const config: AppConfig = {
  routes: [
    { domains: { main: ["store.example.com"] }, basePath: "store" },
    { domains: { main: ["admin.example.com"] }, basePath: "admin" },
  ],
  native: {
    appId: "com.example.store",
    permissions: ["push"],
    targets: {
      store: { basePath: "store" },
      admin: {
        basePath: "admin",
        appName: "Example Admin",
        appId: "com.example.admin",
        permissions: ["camera", "push"],
      },
    },
  },
};`}
        />
        <Docs.OptionTable
          items={nativeFields.map(({ key, type, default: fallback, en, ko }) => ({
            key,
            type,
            default: fallback,
            desc: l.trans({ en, ko }),
          }))}
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: "Firebase app registration and the stores must use the same appId.",
            ko: "Firebase 앱 등록과 스토어에도 같은 appId를 써야 합니다.",
          })}
        </Docs.Alert>
        <Docs.Alert type="info">
          <span>
            {l.trans({
              en: "ios.files and android.files copy app-relative source files into the app, keyed by where they land, such as a notification sound at res/raw/chime.mp3. Android FCM push reads google-services.json from android.googleServices instead, and iOS needs no GoogleService-Info.plist because its push goes to APNs. Keep server service account JSON out of these file mappings. For platform setup steps, see ",
              ko: "ios.files와 android.files는 앱 기준 원본 파일을 앱 안으로 복사하며, res/raw/chime.mp3의 알림음처럼 도착 위치를 키로 씁니다. Android FCM 푸시는 google-services.json을 android.googleServices에서 읽고, iOS 푸시는 APNs로 가므로 GoogleService-Info.plist가 필요 없습니다. 서버 service account JSON은 이 파일 목록에 넣지 마세요. 플랫폼별 설정 절차는 ",
            })}
          </span>
          <Link
            href="/cheatsheet/mobile/setup"
            className="text-primary underline underline-offset-4 hover:no-underline"
          >
            {l.trans({ en: "Native Setup", ko: "네이티브 설정" })}
          </Link>
          <span>{l.trans({ en: ".", ko: " 문서를 참고하세요." })}</span>
        </Docs.Alert>
        <Docs.Alert type="info">
          {l.trans({
            en: "When a multi-client app needs a separate native app per client, give each a target with its own basePath. The Multi Client page shows that pattern.",
            ko: "다중 클라이언트 앱에서 클라이언트별 네이티브 앱이 필요하다면 target마다 자기 basePath를 줍니다. 이 패턴은 Multi Client 페이지에서 다룹니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="images-env" title={l.trans({ en: "Images And Public Env", ko: "이미지와 공개 환경변수" })}>
        <Docs.Title>{l.trans({ en: "Images And Public Env", ko: "이미지와 공개 환경변수" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "images controls the allow-list for optimized remote images. publicEnv is an allow-list for extra browser-visible environment variables beyond the built-in AKAN_PUBLIC_* pattern.",
              ko: "images는 최적화할 수 있는 원격 이미지의 허용 목록을 정합니다. publicEnv는 기본 AKAN_PUBLIC_* 패턴 외에 브라우저에 노출할 환경변수 패턴을 추가하는 허용 목록입니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-1">
          <Code.Snippet
            className="w-full"
            title="images"
            code={`const config: AppConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "asset.example.com" }],
    qualities: [75, 90],
    dangerouslyAllowSVG: false,
  },
};`}
          />
          <Code.Snippet
            className="w-full"
            title="publicEnv"
            code={`const config: AppConfig = {
  publicEnv: ["AKAN_PUBLIC_FEATURE", "BUN_PUBLIC_*"],
};`}
          />
        </div>
        <Docs.Alert type="warning">
          {l.trans({
            en: "publicEnv does not store values. It only says which environment variable names are safe to expose to browser builds.",
            ko: "publicEnv는 값을 저장하는 곳이 아닙니다. 어떤 환경변수 이름을 브라우저 빌드에 노출해도 되는지 정하는 목록입니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="secret-files" title={l.trans({ en: "Secret Files", ko: "시크릿 파일" })}>
        <Docs.Title>{l.trans({ en: "Secret Files", ko: "시크릿 파일" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Some private values cannot live inside env.server.*.ts, such as service-account JSON, TLS certificates, or private key files. The secrets field lists glob patterns for these files so Akan ships them together with the env/ folder.",
              ko: "service-account JSON, TLS 인증서, private key 파일처럼 env.server.*.ts 안에 담을 수 없는 비공개 값이 있습니다. secrets 필드는 이런 파일의 glob 패턴을 나열해 Akan이 env/ 폴더와 함께 전송하도록 합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "akan upload-env archives every matched file, and akan download-env restores them. Patterns are resolved relative to the app directory, and one declaration both deploys and git-ignores the files.",
              ko: "akan upload-env는 매칭된 모든 파일을 아카이브하고, akan download-env는 이를 복원합니다. 패턴은 앱 디렉터리 기준으로 resolve되며, 한 번의 선언으로 배포와 git-ignore가 함께 처리됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="secrets"
          code={`const config: AppConfig = {
  secrets: ["secrets/**/*", "certs/*.pem"],
};`}
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: "publicEnv exposes variable names to the browser; secrets does the opposite. Only glob patterns live in config — the matched files stay local and git-ignored, so never commit their contents.",
            ko: "publicEnv는 변수 이름을 브라우저에 노출하지만, secrets는 그 반대입니다. config에는 glob 패턴만 존재하며, 매칭된 파일은 로컬에 남고 git-ignore되므로 내용을 절대 commit하지 마세요.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="build-runtime" title={l.trans({ en: "Build And Runtime", ko: "빌드와 런타임" })}>
        <Docs.Title>{l.trans({ en: "Build And Runtime", ko: "빌드와 런타임" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The rest of the config is for the build system and the production image. Most apps never touch it, but it is where a package stays external, a font survives pruning, a library's routes join the app, and the image gains a system dependency.",
              ko: "나머지 설정은 빌드 시스템과 프로덕션 이미지를 위한 것입니다. 대부분의 앱은 건드릴 일이 없지만, 특정 패키지를 외부 의존성으로 남기거나, 폰트를 정리 대상에서 빼거나, 라이브러리 라우트를 앱에 합치거나, 이미지에 시스템 의존성을 더할 때 사용합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="Build and runtime fields"
          code={`import { pushNotificationPlugin } from "./plugin/pushNotification.plugin";

const config: AppConfig = {
  externalLibs: ["shiki"],
  trustedDependencies: ["rclnodejs"],
  bin: {
    ffmpeg: {
      "linux-x64": { url: "https://files.example.com/ffmpeg-lgpl-linux64.tar.xz", sha256: "…", file: "bin/ffmpeg" },
      "darwin-arm64": { path: "tools/darwin-arm64/ffmpeg" },
    },
  },
  optimizeImports: ["custom-icons"],
  barrelImports: ["@acme/ui"],
  database: { modes: ["single", "cluster"] },
  assets: { pruneFonts: true, keepFonts: ["fonts/Assistant-*.woff2"] },
  syncPageLibs: ["shared"],
  plugins: [pushNotificationPlugin],
  docker: {
    image: { amd64: "oven/bun:amd64", arm64: "oven/bun:arm64" },
    preRuns: ["apt-get install -y ffmpeg"],
    postRuns: ["echo after"],
    command: ["bun", "main.js"],
  },
};`}
        />
        <Docs.OptionTable
          items={buildFields.map(({ key, type, default: fallback, en, ko }) => ({
            key,
            type,
            default: fallback,
            desc: l.trans({ en, ko }),
          }))}
        />
        <div>
          {l.trans({
            en: "A library contributes to five of these: its own externalLibs, trustedDependencies, docker.preRuns and docker.postRuns, and assets.keepFonts carry into every app that mounts it, and its bin into the apps that depend on it. The generated image installs ca-certificates and tzdata and nothing else, which is why an app that needs ffmpeg or a headless browser declares it.",
            ko: "라이브러리가 이 중 다섯에 값을 더합니다. 라이브러리 자신의 externalLibs, trustedDependencies, docker.preRuns·docker.postRuns, assets.keepFonts는 그 라이브러리를 마운트하는 모든 앱에, bin은 그 라이브러리에 의존하는 앱에 적용됩니다. 생성되는 이미지에는 ca-certificates와 tzdata만 설치되므로, ffmpeg나 헤드리스 브라우저가 필요한 앱은 직접 선언해야 합니다.",
          })}
        </div>
        <ul className="my-4 list-disc space-y-2 pl-5">
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>One image, several deployments.</strong> With <code>{'["single", "cluster"]'}</code> the same
                  image runs an edge site and a cloud cluster, and each deployment names its mode with{" "}
                  <code>AKAN_DATABASE_MODE</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>이미지 하나로 여러 배포를 합니다.</strong> <code>{'["single", "cluster"]'}</code>로 선언하면
                  같은 이미지가 엣지 사이트와 클라우드 클러스터를 모두 실행하고, 배포마다{" "}
                  <code>AKAN_DATABASE_MODE</code>로 모드를 정합니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>A desktop app carries its own executables.</strong> It gets none of the image's{" "}
                  <code>docker</code> steps, so <code>bin</code> puts ffmpeg, or anything else its server or a native
                  plugin spawns, into every desktop build for the computer it is built on, first on the app's PATH and
                  in a plugin's <code>ctx.binDir</code>. Carry a static LGPL build: a <code>--enable-nonfree</code>{" "}
                  build may not be redistributed.
                </span>
              ),
              ko: (
                <span>
                  <strong>데스크톱 앱은 실행 파일을 직접 싣고 갑니다.</strong> 데스크톱 앱에는 이미지의{" "}
                  <code>docker</code> 단계가 하나도 들어가지 않습니다. 그래서 <code>bin</code>이 ffmpeg처럼 서버나
                  네이티브 플러그인이 실행하는 파일을 빌드하는 컴퓨터용으로 모든 데스크톱 빌드에 넣고, 앱의 PATH 맨 앞과
                  플러그인의 <code>ctx.binDir</code>에 둡니다. 정적 LGPL 빌드를 넣으세요. <code>--enable-nonfree</code>
                  로 빌드한 것은 재배포할 수 없습니다.
                </span>
              ),
            })}
          </li>
        </ul>
        <Docs.Alert type="warning">
          {l.trans({
            en: "A docker written as a string is the whole Dockerfile, taken verbatim. Nothing is merged into it — including the preRuns and postRuns your libraries declared, which are silently dropped rather than silently unapplied.",
            ko: "docker를 문자열로 쓰면 그것이 Dockerfile 전체이며 그대로 사용됩니다. 아무것도 병합되지 않습니다. 라이브러리가 선언한 preRuns와 postRuns도 포함이며, 적용되지 않은 채 남지 않고 아예 버려집니다.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="pipeline" title={l.trans({ en: "Pipeline", ko: "파이프라인" })}>
        <Docs.Title>{l.trans({ en: "Pipeline", ko: "파이프라인" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>pipeline</code> lists the stages Akan Cloud runs for this app, in order. Without it the app runs{" "}
                  <code>build</code>, <code>docker</code> and <code>deploy</code>; once you declare it, the list is the
                  whole pipeline, so write those actions in it too.
                </span>
              ),
              ko: (
                <span>
                  <code>pipeline</code>은 Akan Cloud가 이 앱에 대해 순서대로 실행할 stage 목록입니다. 선언하지 않으면{" "}
                  <code>build</code>, <code>docker</code>, <code>deploy</code>를 실행합니다. 선언하면 그 목록이
                  파이프라인 전부이므로 이 액션들도 목록에 적습니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/web/akan.config.ts"
          code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  pipeline: {
    after: ["api"],
    stages: [
      { use: "build" },
      {
        name: "Test",
        sh: "bun run akan test web",
        when: { changed: ["apps/web/**", "libs/**"] },
      },
      { use: "docker" },
      { use: "deploy" },
      {
        name: "Smoke",
        sh: "curl -fsS https://web.example.com/en",
        allowFailure: true,
      },
    ],
  },
};

export default config;`}
        />
        <Docs.OptionTable
          items={pipelineKeys.map(({ key, type, en, ko }) => ({ key, type, desc: l.trans({ en, ko }) }))}
        />
        <ul className="my-4 list-disc space-y-2 pl-5">
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>A stage runs after the action before it.</strong> A stage written before any action runs
                  before the apps build, and one after <code>build</code> runs once every app's build is done.
                </span>
              ),
              ko: (
                <span>
                  <strong>stage는 바로 앞 액션 뒤에 실행됩니다.</strong> 어떤 액션보다 앞에 적은 stage는 앱들이 빌드하기
                  전에, <code>build</code> 뒤에 적은 stage는 모든 앱의 빌드가 끝난 뒤에 실행됩니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>Actions keep their order.</strong> <code>docker</code> needs a <code>build</code> before it,
                  since the image is made from that build. When an app's action is skipped or fails, its later actions
                  do not run.
                </span>
              ),
              ko: (
                <span>
                  <strong>액션은 순서를 지킵니다.</strong> 이미지는 그 빌드 결과로 만들기 때문에 <code>docker</code>{" "}
                  앞에는 <code>build</code>가 있어야 합니다. 앱의 액션 하나가 건너뛰어지거나 실패하면 그 뒤의 액션은
                  실행하지 않습니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>A function sees the build.</strong> <code>{"pipeline: (ctx) => ({ … })"}</code> reads{" "}
                  <code>ctx.app</code>, <code>ctx.branch</code>, <code>ctx.trigger</code> and the build's other facts.
                </span>
              ),
              ko: (
                <span>
                  <strong>함수형은 빌드 정보를 받습니다.</strong> <code>{"pipeline: (ctx) => ({ … })"}</code>는{" "}
                  <code>ctx.app</code>, <code>ctx.branch</code>, <code>ctx.trigger</code> 같은 빌드 정보를 읽습니다.
                </span>
              ),
            })}
          </li>
        </ul>

        <Docs.SubSubTitle>{l.trans({ en: "Stage Keys", ko: "stage 키" })}</Docs.SubSubTitle>
        <div>
          {l.trans({
            en: (
              <span>
                A stage is a built-in action (<code>use</code>) or a shell stage (<code>name</code> with <code>sh</code>{" "}
                or <code>steps</code>). The tags say which kind takes each key.
              </span>
            ),
            ko: (
              <span>
                stage는 내장 액션(<code>use</code>)이거나 셸 stage(<code>name</code>과 <code>sh</code> 또는{" "}
                <code>steps</code>)입니다. 태그는 각 키를 어느 쪽이 받는지 나타냅니다.
              </span>
            ),
          })}
        </div>
        <Docs.OptionTable
          items={stageKeys.map(({ key, type, default: fallback, tags, en, ko }) => ({
            key,
            type,
            default: fallback,
            tags,
            desc: l.trans({ en, ko }),
          }))}
        />

        <Docs.SubSubTitle>{l.trans({ en: "Step Keys", ko: "step 키" })}</Docs.SubSubTitle>
        <div>
          {l.trans({
            en: (
              <span>
                An entry of <code>steps</code> is a command string or an object with these keys:
              </span>
            ),
            ko: (
              <span>
                <code>steps</code>의 항목은 명령 문자열이거나, 아래 키를 가진 객체입니다:
              </span>
            ),
          })}
        </div>
        <Docs.OptionTable
          items={stepKeys.map(({ key, type, default: fallback, en, ko }) => ({
            key,
            type,
            default: fallback,
            desc: l.trans({ en, ko }),
          }))}
        />

        <Docs.SubSubTitle>{l.trans({ en: "When A Stage Runs", ko: "stage를 실행하는 조건" })}</Docs.SubSubTitle>
        <Docs.OptionTable items={whenKeys.map(({ key, type, en, ko }) => ({ key, type, desc: l.trans({ en, ko }) }))} />
        <ul className="my-4 list-disc space-y-2 pl-5">
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>Patterns.</strong> <code>*</code> matches within one path segment, <code>**</code> across
                  segments and <code>?</code> one character. A leading <code>!</code> excludes, and case matters.
                </span>
              ),
              ko: (
                <span>
                  <strong>패턴.</strong> <code>*</code>는 경로 한 마디 안에서, <code>**</code>는 여러 마디에 걸쳐,{" "}
                  <code>?</code>는 한 글자에 맞습니다. 앞에 <code>!</code>를 붙이면 제외하고, 대소문자를 구분합니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>When each is decided.</strong> <code>branch</code> and <code>trigger</code> are decided when
                  the plan is made, and <code>changed</code> just before the stage runs. With no earlier good build to
                  compare against, every path counts as changed.
                </span>
              ),
              ko: (
                <span>
                  <strong>판정 시점.</strong> <code>branch</code>와 <code>trigger</code>는 plan을 만들 때,{" "}
                  <code>changed</code>는 stage를 실행하기 직전에 판정합니다. 비교할 이전 성공 빌드가 없으면 모든 경로가
                  바뀐 것으로 봅니다.
                </span>
              ),
            })}
          </li>
        </ul>

        <Docs.SubSubTitle>
          {l.trans({ en: "Environment Every Step Gets", ko: "모든 step이 받는 환경변수" })}
        </Docs.SubSubTitle>
        <Docs.IntroTable
          type={l.trans({ en: "Variable", ko: "변수" })}
          items={ciEnvRows.map(({ name, en, ko }) => ({ name, desc: l.trans({ en, ko }) }))}
        />
        <ul className="my-4 list-disc space-y-2 pl-5">
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>The narrower value wins.</strong> A step's <code>env</code> beats its stage's, which beats the
                  app's, which beats the workspace's.
                </span>
              ),
              ko: (
                <span>
                  <strong>좁은 쪽 값이 이깁니다.</strong> step의 <code>env</code>가 stage보다, stage가 앱보다, 앱이
                  워크스페이스보다 우선합니다.
                </span>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <span>
                  <strong>Some names are reserved.</strong> <code>CI</code>, every <code>AKAN_CI_*</code> and shell
                  names such as <code>PATH</code> or <code>HOME</code> cannot be set in <code>env</code> or used for a
                  secret.
                </span>
              ),
              ko: (
                <span>
                  <strong>예약된 이름이 있습니다.</strong> <code>CI</code>, 모든 <code>AKAN_CI_*</code>,{" "}
                  <code>PATH</code>나 <code>HOME</code> 같은 셸 이름은 <code>env</code>에 쓰거나 시크릿 이름으로 쓸 수
                  없습니다.
                </span>
              ),
            })}
          </li>
        </ul>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="workspace-config" title={l.trans({ en: "Workspace Config", ko: "워크스페이스 설정" })}>
        <Docs.Title>{l.trans({ en: "Workspace Config", ko: "워크스페이스 설정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The <code>akan.config.ts</code> at the workspace root holds what spans every app: stages around all of
                  them, the steps that close a build, the cloud the CLI talks to, and the repositories it mirrors apps
                  to (<code>subspace</code>). It is typed <code>WorkspaceConfig</code>, and app or library settings stay
                  in their own files.
                </span>
              ),
              ko: (
                <span>
                  워크스페이스 루트의 <code>akan.config.ts</code>에는 모든 앱에 걸치는 설정, 곧 모든 앱의 앞뒤에 실행할
                  stage, 빌드를 마무리할 step, CLI가 연결할 클라우드, 앱을 미러링할 저장소(<code>subspace</code>)를
                  둡니다. 타입은 <code>WorkspaceConfig</code>이고, 앱과 라이브러리 설정은 각자의 파일에 둡니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="akan.config.ts"
          code={`import type { WorkspaceConfig } from "akanjs";

const config: WorkspaceConfig = {
  pipeline: {
    timeout: "1h",
    before: [
      {
        name: "Checks",
        parallel: [
          { name: "Lint", sh: "bun run lint" },
          { name: "Test", sh: "bun run test" },
        ],
      },
    ],
    after: [
      {
        name: "E2E",
        matrix: "apps",
        sh: "bun run e2e $AKAN_CI_APP",
        allowFailure: true,
      },
    ],
    post: {
      failure: [
        {
          name: "Notify",
          sh: "./scripts/notify.sh",
          secrets: ["DISCORD_WEBHOOK"],
        },
      ],
    },
  },
};

export default config;`}
        />
        <Docs.OptionTable
          items={workspacePipelineKeys.map(({ key, type, en, ko }) => ({ key, type, desc: l.trans({ en, ko }) }))}
        />
        <div>
          {l.trans({
            en: (
              <span>
                Like an app's, the root <code>pipeline</code> may be a function of the build,{" "}
                <code>{"(ctx) => ({ … })"}</code>, without <code>ctx.app</code>.
              </span>
            ),
            ko: (
              <span>
                앱의 것처럼 루트 <code>pipeline</code>도 빌드 정보를 받는 함수 <code>{"(ctx) => ({ … })"}</code>로 쓸 수
                있으며, <code>ctx.app</code>만 없습니다.
              </span>
            ),
          })}
        </div>

        <Docs.OptionTable
          items={workspaceCloudKeys.map(({ key, type, default: fallback, en, ko }) => ({
            key,
            type,
            default: fallback,
            desc: l.trans({ en, ko }),
          }))}
        />
        <Docs.OptionTable
          items={workspaceSubspaceKeys.map(({ key, type, default: fallback, en, ko }) => ({
            key,
            type,
            default: fallback,
            desc: l.trans({ en, ko }),
          }))}
        />

        <Docs.SubSubTitle>{l.trans({ en: "Root Stage Kinds", ko: "루트 stage의 종류" })}</Docs.SubSubTitle>
        <Docs.Table
          columns={[
            { key: "shape", label: l.trans({ en: "Shape", ko: "모양" }), code: true },
            { key: "runs", label: l.trans({ en: "Runs", ko: "실행" }) },
          ]}
          rows={workspaceStageKinds.map(({ shape, en, ko }) => ({ shape, runs: l.trans({ en, ko }) }))}
        />
        <div>
          {l.trans({
            en: (
              <span>
                Built-in actions belong to apps, so a root stage never takes <code>use</code>.
              </span>
            ),
            ko: (
              <span>
                내장 액션은 앱의 것이므로, 루트 stage는 <code>use</code>를 받지 않습니다.
              </span>
            ),
          })}
        </div>

        <Docs.SubSubTitle>{l.trans({ en: "Order Of A Build", ko: "빌드 순서" })}</Docs.SubSubTitle>
        <div>
          {l.trans({
            en: "Phases run one after another, and each waits until every stage of the one before has ended:",
            ko: "phase는 차례로 실행되며, 각 phase는 앞 phase의 stage가 모두 끝날 때까지 기다립니다:",
          })}
        </div>
        <Docs.Table
          columns={[
            { key: "phase", label: "phase", code: true },
            { key: "runs", label: l.trans({ en: "Runs", ko: "실행" }) },
          ]}
          rows={phaseRows.map(({ phase, en, ko }) => ({ phase, runs: l.trans({ en, ko }) }))}
        />
        <Docs.Alert type="warning">
          {l.trans({
            en: (
              <>
                <strong>App stages must stand on their own.</strong> Never rely on what a root <code>before</code> stage
                left on disk: an app built from a repository mirrored out of this workspace (a subspace) carries only
                its own <code>akan.config.ts</code>, so the root stages never run there.
              </>
            ),
            ko: (
              <>
                <strong>앱 stage는 스스로 완결돼야 합니다.</strong> 루트 <code>before</code> stage가 디스크에 남긴 것에
                기대지 마세요. 이 워크스페이스에서 미러링한 저장소(subspace)에서 빌드하는 앱은 자기{" "}
                <code>akan.config.ts</code>만 가져가므로, 그곳에서는 루트 stage가 실행되지 않습니다.
              </>
            ),
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="defaults" title={l.trans({ en: "Defaults And Rules", ko: "기본값과 규칙" })}>
        <Docs.Title>{l.trans({ en: "Defaults And Rules", ko: "기본값과 규칙" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan resolves the final app config by merging your file with framework defaults. For a first app, keep these rules in mind before adding advanced options.",
              ko: "Akan은 사용자가 작성한 파일과 프레임워크 기본값을 합쳐 최종 앱 설정을 만듭니다. 처음 앱을 만들 때는 고급 옵션을 추가하기 전에 아래 규칙만 기억하면 됩니다.",
            })}
          </div>
        </Docs.Description>
        <div className="space-y-1 pl-2">
          {[
            {
              title: l.trans({ en: "Environment values", ko: "환경별 값" }),
              desc: l.trans({
                en: "Put runtime values in env/ before adding config fields. Use client env for public values and server env for private server options.",
                ko: "config 필드를 추가하기 전에 런타임 값은 env/에 둡니다. 공개 값은 client env에, 서버 전용 비공개 옵션은 server env에 둡니다.",
              }),
            },
            {
              title: l.trans({ en: "Routes", ko: "라우트" }),
              desc: l.trans({
                en: "Skip routes until you need custom domains or multiple clients.",
                ko: "커스텀 도메인이나 여러 클라이언트가 필요해지기 전까지는 routes를 생략해도 됩니다.",
              }),
            },
            {
              title: l.trans({ en: "Native apps", ko: "네이티브 앱" }),
              desc: l.trans({
                en: "appName defaults to the app name, appId defaults to com.<repoName>.<appName>, version defaults to 0.0.1, and buildNum defaults to 1. Pin a real reverse-DNS appId before you ship: a placeholder such as com.example.app has almost always been claimed in Apple's portal already.",
                ko: "appName은 앱 이름, appId는 com.<repoName>.<appName>, version은 0.0.1, buildNum은 1이 기본값입니다. 출시 전에는 조직의 실제 reverse-DNS appId를 지정해야 합니다. com.example.app 같은 placeholder id는 Apple 포털에서 이미 선점되어 있는 경우가 대부분입니다.",
              }),
            },
            {
              title: l.trans({ en: "Images", ko: "이미지" }),
              desc: l.trans({
                en: "Remote images are blocked unless remotePatterns allow them. WebP and quality 75 are used by default.",
                ko: "remotePatterns가 허용하지 않은 원격 이미지는 차단됩니다. 기본 포맷은 WebP이고 기본 quality는 75입니다.",
              }),
            },
            {
              title: l.trans({ en: "i18n", ko: "다국어" }),
              desc: l.trans({
                en: "Locales default to en and ko with en first. Change it only to move the default locale or to serve a different set — defaultLocale must be one of locales.",
                ko: "locale 기본값은 en과 ko이며 기본 locale은 en입니다. 기본 locale을 옮기거나 다른 목록을 제공할 때만 바꿉니다. defaultLocale은 locales 안에 있어야 합니다.",
              }),
            },
          ].map(({ title, desc }) => (
            <div key={title}>
              <span className="font-bold text-foreground">{title}: </span>
              <span className="text-foreground/70 text-sm">{desc}</span>
            </div>
          ))}
        </div>
        <Docs.Alert type="info">
          {l.trans({
            en: "Recommended order: start with an empty config, fill env/ values as the app needs them, add routes when domains are needed, add native when native apps are needed, and add advanced build options only after the default build is not enough.",
            ko: "추천 순서: 빈 config로 시작하고, 앱에 필요한 env/ 값을 채운 뒤, 도메인이 필요할 때 routes를 추가하고, 네이티브 앱이 필요할 때 native를 추가하고, 기본 빌드로 부족할 때만 고급 빌드 옵션을 추가하세요.",
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
