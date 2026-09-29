import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, ExternalLink, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page().render(() => {
  const { l } = usePage();
  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const stepList = "my-4 list-decimal space-y-2 pl-5";
  const inlineLink = "text-primary underline underline-offset-4 hover:no-underline";

  const termRows = [
    {
      name: l.trans({ en: "native runtime", ko: "네이티브 런타임" }),
      desc: l.trans({
        en: "@akanjs/native, shipped inside akanjs. It runs your web app in a WebView and reaches device APIs through plugins.",
        ko: "akanjs 안에 들어 있는 @akanjs/native입니다. 웹 앱을 WebView 안에서 실행하고, 플러그인으로 기기 기능을 쓰게 해 줍니다.",
      }),
    },
    {
      name: l.trans({ en: "CSR bundle", ko: "CSR 번들" }),
      desc: l.trans({
        en: "The single-page build of your app. The native app ships it, so keep `web.csr` on.",
        ko: "앱을 한 페이지짜리 웹 앱으로 빌드한 결과물입니다. 네이티브 앱에 이 번들이 들어가므로 `web.csr`을 끄면 안 됩니다.",
      }),
    },
    {
      name: "target",
      desc: l.trans({
        en: "One native app built from your Akan app. Its key in `mobile.targets` is the `--target` value.",
        ko: "Akan 앱 하나에서 만드는 네이티브 앱 하나입니다. `mobile.targets`의 키가 곧 `--target`에 넘기는 값입니다.",
      }),
    },
    {
      name: "appId",
      desc: l.trans({
        en: "The app's permanent ID: the package name on Android and the bundle ID on iOS.",
        ko: "앱의 고정 ID입니다. Android에서는 package name, iOS에서는 bundle ID가 됩니다.",
      }),
    },
    {
      name: ".akan/mobile/<target>",
      desc: l.trans({
        en: "Where each run writes the target's web root and native builds. It is generated and ignored by git: there is no Xcode or Android Studio project to edit.",
        ko: "실행할 때마다 target의 웹 루트와 네이티브 빌드를 쓰는 곳입니다. 생성되는 폴더이고 git에서 제외되며, 고칠 Xcode나 Android Studio 프로젝트는 없습니다.",
      }),
    },
    {
      name: l.trans({ en: "plugin", ko: "플러그인" }),
      desc: l.trans({
        en: "A native runtime module such as camera or push. The app ships it when a permission or `native.plugins` names it.",
        ko: "카메라, 푸시 같은 네이티브 런타임 모듈입니다. 권한이나 `native.plugins`가 이름을 대면 앱에 들어갑니다.",
      }),
    },
  ];

  const flowCards = [
    {
      title: l.trans({ en: "1. Mobile config", ko: "1. mobile 설정" }),
      desc: l.trans({
        en: (
          <span>
            Name the app, fix its <code>appId</code>, and choose targets and permissions in <code>akan.config.ts</code>.
          </span>
        ),
        ko: (
          <span>
            <code>akan.config.ts</code>에서 앱 이름과 <code>appId</code>를 정하고, target과 권한을 고릅니다.
          </span>
        ),
      }),
    },
    {
      title: l.trans({ en: "2. Native plugins", ko: "2. 네이티브 플러그인" }),
      desc: l.trans({
        en: (
          <span>
            Permissions bring their plugin; name any other one in <code>native.plugins</code>.
          </span>
        ),
        ko: (
          <span>
            권한이 제 플러그인을 가져오고, 그 밖의 플러그인은 <code>native.plugins</code>에 적습니다.
          </span>
        ),
      }),
    },
    {
      title: "3. Android · iOS · Desktop",
      desc: l.trans({
        en: "Install the toolchains, run the app on a device, then set up signing and store builds.",
        ko: "개발 도구를 설치하고 기기에서 앱을 띄운 뒤, 서명과 스토어 빌드를 준비합니다.",
      }),
    },
    {
      title: l.trans({ en: "4. Verify", ko: "4. 확인" }),
      desc: l.trans({
        en: "Check each feature on a real device instead of stopping at a green build.",
        ko: "빌드 성공에서 멈추지 말고, 실제 기기에서 기능을 하나씩 확인합니다.",
      }),
    },
  ];

  const mobileFields = [
    {
      key: "appName",
      type: "string",
      default: l.trans({ en: "app name", ko: "앱 이름" }),
      desc: l.trans({
        en: "Name under the home-screen icon. A store listing may show a different name.",
        ko: "홈 화면 아이콘 아래에 보이는 이름입니다. 스토어 목록에는 다른 이름이 보일 수 있습니다.",
      }),
    },
    {
      key: "appId",
      type: "string",
      default: "com.<repo>.<app>",
      desc: l.trans({
        en: "Android package name and iOS bundle ID. Console and Firebase registrations must match it.",
        ko: "Android package name이자 iOS bundle ID입니다. 스토어 콘솔과 Firebase에 등록할 때도 똑같이 씁니다.",
      }),
    },
    {
      key: "version",
      type: "string",
      default: "0.0.1",
      desc: l.trans({
        en: "The version users see: Android `versionName` and iOS `CFBundleShortVersionString`.",
        ko: "사용자에게 보이는 버전입니다. Android `versionName`과 iOS `CFBundleShortVersionString`에 들어갑니다.",
      }),
    },
    {
      key: "buildNum",
      type: "number",
      default: "1",
      desc: l.trans({
        en: "Store build number: Android `versionCode`, iOS `CFBundleVersion`. Raise it for every store upload.",
        ko: "스토어 빌드 번호입니다. Android `versionCode`와 iOS `CFBundleVersion`에 들어가며, 스토어에 올릴 때마다 올립니다.",
      }),
    },
    {
      key: "targets",
      type: "Record<string, Target>",
      default: "{ default: {} }",
      desc: l.trans({
        en: "One entry per native app. The key is the name `--target` takes.",
        ko: "네이티브 앱마다 항목 하나입니다. 키가 곧 `--target`에 넘기는 이름입니다.",
      }),
    },
    {
      key: "targets.*.permissions",
      type: "MobilePermission[]",
      desc: l.trans({
        en: "Device features to prepare. Only `camera`, `contacts`, `location`, `push` and `speech` exist.",
        ko: "준비할 기기 기능입니다. `camera`, `contacts`, `location`, `push`, `speech` 다섯 가지뿐입니다.",
      }),
    },
    {
      key: "targets.*.indexPath",
      type: "string",
      default: "/",
      desc: l.trans({
        en: "Home route. A deep link opens on top of it, and Android back returns to it before exiting.",
        ko: "앱의 홈 route입니다. 딥링크는 그 위에 열리고, Android 뒤로 가기는 앱을 닫기 전에 여기로 돌아옵니다.",
      }),
    },
    {
      key: "targets.*.basePath",
      type: "string",
      desc: l.trans({
        en: "The client to open in a multi-client app. It must be a `basePath` declared in `routes`.",
        ko: "다중 클라이언트 앱에서 열 클라이언트입니다. `routes`에 선언한 `basePath`여야 합니다.",
      }),
    },
    {
      key: "targets.*.native",
      type: "{ plugins?, ios?, android?, desktop? }",
      desc: l.trans({
        en: "Native settings: more `plugins`, `ios.infoPlist` and `ios.entitlements` keys, `android.manifest` / `application` / `activity` XML, `android.googleServices` for FCM, `android.autoplay`, and for an unattended desktop app `desktop.recovery` and `desktop.window`.",
        ko: "네이티브 설정입니다. 추가 `plugins`, `ios.infoPlist`·`ios.entitlements` 키, `android.manifest`·`application`·`activity` XML, FCM용 `android.googleServices`, `android.autoplay`, 그리고 지키는 사람이 없는 데스크톱 앱용 `desktop.recovery`·`desktop.window`를 적습니다.",
      }),
    },
    {
      key: "targets.*.files",
      type: "Record<string, string>",
      desc: l.trans({
        en: "Copies app files into the app. Key: where it lands, `ios/<path>`, `android/res/<type>/<file>` or `android/assets/<path>`. Value: the source, relative to the app folder.",
        ko: "앱 파일을 앱 안으로 복사합니다. 키는 들어갈 자리로 `ios/<path>`, `android/res/<type>/<file>`, `android/assets/<path>` 중 하나이고, 값은 앱 폴더 기준 원본 경로입니다.",
      }),
    },
    {
      key: "targets.*.appId",
      type: "string",
      desc: l.trans({
        en: "Per-target override, like `appName`, `version`, `buildNum`. A different `appId` is a separate app. `files` and `native` at the `mobile` root merge into every target.",
        ko: "`appName`, `version`, `buildNum`처럼 target별로 루트 값을 덮어씁니다. `appId`가 다르면 별개의 앱입니다. `mobile` 루트의 `files`와 `native`는 모든 target에 합쳐집니다.",
      }),
    },
  ];

  const permissionRows = [
    {
      permission: "camera",
      plugin: "`camera`",
      ios: l.trans({ en: "Camera and photo library usage texts", ko: "카메라·사진 보관함 사용 안내 문구" }),
      android: l.trans({
        en: "None: the system camera and photo picker need no permission",
        ko: "없음. 시스템 카메라와 사진 선택기는 권한이 필요 없습니다",
      }),
    },
    {
      permission: "contacts",
      plugin: l.trans({ en: "`contacts` (read-only)", ko: "`contacts` (읽기 전용)" }),
      ios: l.trans({ en: "Contacts usage text", ko: "연락처 사용 안내 문구" }),
      android: "`READ_CONTACTS`",
    },
    {
      permission: "location",
      plugin: "`geolocation`",
      ios: l.trans({
        en: "Location usage texts, for always and while in use",
        ko: "위치 사용 안내 문구 (항상 / 사용 중)",
      }),
      android: "`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`",
    },
    {
      permission: "push",
      plugin: "`push`",
      ios: l.trans({
        en: "Remote-notification background mode and the `aps-environment` entitlement",
        ko: "원격 알림 백그라운드 모드와 `aps-environment` entitlement",
      }),
      android: l.trans({
        en: "`POST_NOTIFICATIONS` and the FCM module (needs `native.android.googleServices`)",
        ko: "`POST_NOTIFICATIONS`와 FCM 모듈 (`native.android.googleServices`가 필요합니다)",
      }),
    },
    {
      permission: "speech",
      plugin: l.trans({ en: "None yet: the app ships without it", ko: "아직 없음. 없이 빌드됩니다" }),
      ios: l.trans({ en: "What a lib's plugin declares", ko: "lib 플러그인이 선언한 것" }),
      android: l.trans({ en: "What a lib's plugin declares", ko: "lib 플러그인이 선언한 것" }),
    },
  ];

  const configPitfalls = [
    l.trans({
      en: (
        <>
          <strong>Pick a real appId.</strong> IDs with a segment like <code>example</code>, <code>myapp</code> or{" "}
          <code>test</code> are usually taken on Apple's portal, so phone signing fails. <code>akan doctor --ios</code>{" "}
          flags them.
        </>
      ),
      ko: (
        <>
          <strong>실제 appId를 쓰세요.</strong> <code>example</code>, <code>myapp</code>, <code>test</code> 같은 단어가
          들어간 ID는 Apple 포털에서 대개 이미 쓰이고 있어 실기기 서명이 실패합니다. <code>akan doctor --ios</code>가
          이런 ID를 짚어 줍니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Keep the CSR bundle on.</strong> The native app ships it, so <code>{"web: { csr: false }"}</code>{" "}
          cannot sit next to a <code>mobile</code> block.
        </>
      ),
      ko: (
        <>
          <strong>CSR 번들을 켜 두세요.</strong> 네이티브 앱에 이 번들이 들어가므로 <code>{"web: { csr: false }"}</code>
          와 <code>mobile</code> 블록은 함께 쓸 수 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Capacitor keys are refused.</strong> <code>plugins</code>, <code>ios</code> and <code>android</code>{" "}
          directly under <code>mobile</code> or a target stop the build; they live under <code>native</code> now.
        </>
      ),
      ko: (
        <>
          <strong>Capacitor 시절 키는 거부됩니다.</strong> <code>mobile</code>이나 target 바로 아래의{" "}
          <code>plugins</code>, <code>ios</code>, <code>android</code>는 빌드를 멈춥니다. 이제는 <code>native</code>{" "}
          아래에 둡니다.
        </>
      ),
    }),
  ];

  const pluginColumns = [
    { key: "base", label: l.trans({ en: "Always", ko: "항상" }) },
    { key: "permission", label: l.trans({ en: "By a permission", ko: "권한으로" }), caption: "permissions" },
    { key: "config", label: l.trans({ en: "By name", ko: "이름으로" }), caption: "native.plugins" },
  ];
  const base = { base: true, permission: false, config: false };
  const byPermission = { base: false, permission: true, config: false };
  const byName = { base: false, permission: false, config: true };

  const pluginGroups = [
    {
      label: l.trans({ en: "What every Akan page may call", ko: "모든 Akan 페이지가 쓰는 것" }),
      rows: [
        {
          name: "app",
          desc: l.trans({
            en: "App info, the Android back button, deep-link events and app exit.",
            ko: "앱 정보, Android 뒤로 가기, 딥링크 이벤트, 앱 종료를 다룹니다.",
          }),
          marks: base,
        },
        {
          name: "app-state",
          desc: l.trans({ en: "Foreground and background changes.", ko: "앱이 앞·뒤로 오가는 변화를 알립니다." }),
          marks: base,
        },
        {
          name: "device",
          desc: l.trans({
            en: "The platform, model and device language.",
            ko: "플랫폼, 기종, 기기 언어를 읽습니다.",
          }),
          marks: base,
        },
        {
          name: "keyboard",
          desc: l.trans({
            en: "Reports the keyboard height so the screen can move with it.",
            ko: "키보드 높이를 알려 주어 화면이 따라 움직이게 합니다.",
          }),
          marks: base,
        },
        {
          name: "preferences",
          desc: l.trans({
            en: "On-device storage, where the sign-in token is kept.",
            ko: "기기 저장소이며, 로그인 토큰을 여기에 둡니다.",
          }),
          marks: base,
        },
        {
          name: "secure-storage",
          desc: l.trans({ en: "The keychain or keystore, for secrets.", ko: "비밀 값을 두는 키체인·키스토어입니다." }),
          marks: base,
        },
        {
          name: "browser · opener",
          desc: l.trans({
            en: "Opens a page in an in-app browser, or a link in the system.",
            ko: "앱 안 브라우저로 페이지를 열거나, 링크를 시스템에 넘깁니다.",
          }),
          marks: base,
        },
        {
          name: "auth-session",
          desc: l.trans({
            en: "The system sign-in sheet an OAuth flow opens.",
            ko: "OAuth 로그인이 여는 시스템 로그인 창입니다.",
          }),
          marks: base,
        },
        {
          name: "dialog · haptics",
          desc: l.trans({
            en: "System alerts and action sheets, and haptic feedback.",
            ko: "시스템 알림창·액션 시트와 진동 피드백입니다.",
          }),
          marks: base,
        },
      ],
    },
    {
      label: l.trans({ en: "Per feature", ko: "기능별" }),
      rows: [
        {
          name: "camera",
          desc: l.trans({
            en: "Camera and photo picker. Brought by `camera`.",
            ko: "카메라와 사진 선택입니다. `camera`가 가져옵니다.",
          }),
          marks: byPermission,
        },
        {
          name: "geolocation",
          desc: l.trans({
            en: "Current and watched location. Brought by `location`.",
            ko: "현재 위치와 위치 추적입니다. `location`이 가져옵니다.",
          }),
          marks: byPermission,
        },
        {
          name: "push",
          desc: l.trans({
            en: "APNs on iOS, FCM on Android. Brought by `push`.",
            ko: "iOS는 APNs, Android는 FCM입니다. `push`가 가져옵니다.",
          }),
          marks: byPermission,
        },
        {
          name: "iap",
          desc: l.trans({
            en: "In-app purchase: StoreKit 2 and Play Billing.",
            ko: "인앱 결제입니다. StoreKit 2와 Play Billing을 씁니다.",
          }),
          marks: byName,
        },
        {
          name: "share · biometric · …",
          desc: l.trans({
            en: "The runtime's other plugins, by id, or a plugin folder by its absolute path.",
            ko: "런타임의 다른 플러그인은 id로, 직접 만든 플러그인 폴더는 절대 경로로 적습니다.",
          }),
          marks: byName,
        },
      ],
    },
  ];

  const pluginNotes = [
    l.trans({
      en: (
        <>
          <strong>Nothing goes in package.json.</strong> The plugins ship inside akanjs, so the app installs no native
          package and pins no version of its own.
        </>
      ),
      ko: (
        <>
          <strong>package.json에는 아무것도 적지 않습니다.</strong> 플러그인은 akanjs 안에 들어 있으므로, 앱이 네이티브
          패키지를 설치하거나 버전을 따로 고정하지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>A lib can claim a permission.</strong> A <code>{"<name>.plugin.ts"}</code> with a <code>native</code>{" "}
          block names the permission, its plugins, usage texts and Android permissions; every app that mounts the lib
          gets them, and it replaces the builtin entry for that permission.
        </>
      ),
      ko: (
        <>
          <strong>lib가 권한을 맡을 수 있습니다.</strong> <code>native</code> 블록을 가진{" "}
          <code>{"<name>.plugin.ts"}</code>가 권한, 그 플러그인, 사용 안내 문구, Android 권한을 적으면 그 lib를 쓰는
          모든 앱이 이를 받고, 그 권한의 기본 항목을 대신합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Rerun after a change.</strong> After changing permissions or <code>native</code>, run{" "}
          <code>start-ios</code>, <code>start-android</code> or a build command again; the app is generated anew each
          time.
        </>
      ),
      ko: (
        <>
          <strong>바꾼 뒤에는 다시 실행하세요.</strong> 권한이나 <code>native</code>를 바꾼 뒤에는{" "}
          <code>start-ios</code>, <code>start-android</code>, 빌드 명령 중 하나를 다시 실행합니다. 앱은 매번 새로
          만들어집니다.
        </>
      ),
    }),
  ];

  const androidCommandRows = [
    {
      command: "start-android",
      env: "local",
      result: l.trans({
        en: "Runs on an emulator or phone. `--release` ships the web build instead of the dev server.",
        ko: "에뮬레이터나 폰에서 실행합니다. `--release`를 주면 개발 서버 대신 웹 빌드를 넣습니다.",
      }),
    },
    {
      command: "build-android",
      env: "debug",
      result: l.trans({
        en: "An APK signed with a local debug key, to check that the app builds.",
        ko: "앱이 빌드되는지 확인하는, 로컬 debug 키로 서명한 APK를 만듭니다.",
      }),
    },
    {
      command: "release-android",
      env: "main",
      result: l.trans({
        en: "An AAB for the Play Store, or an APK with `--assemble-type apk`, signed with your upload key.",
        ko: "업로드 키로 서명한 Play Store용 AAB를 만듭니다. `--assemble-type apk`면 APK입니다.",
      }),
    },
  ];

  const iosCommandRows = [
    {
      command: "start-ios",
      env: "local",
      result: l.trans({
        en: "Runs on a simulator or phone. `--release` ships the web build instead of the dev server.",
        ko: "시뮬레이터나 폰에서 실행합니다. `--release`를 주면 개발 서버 대신 웹 빌드를 넣습니다.",
      }),
    },
    {
      command: "build-ios",
      env: "debug",
      result: l.trans({
        en: "A simulator app, to check that the app builds.",
        ko: "앱이 빌드되는지 확인하는 시뮬레이터용 앱을 만듭니다.",
      }),
    },
    {
      command: "release-ios",
      env: "main",
      result: l.trans({
        en: "An iPhone app and its `.ipa`, signed for the App Store.",
        ko: "App Store용으로 서명한 iPhone 앱과 그 `.ipa`를 만듭니다.",
      }),
    },
  ];

  const commandColumns = [
    { key: "command", label: l.trans({ en: "Command", ko: "명령" }), code: true },
    { key: "env", label: l.trans({ en: "Default --env", ko: "기본 --env" }), code: true },
    { key: "result", label: l.trans({ en: "What you get", ko: "결과" }) },
  ];

  const commandFlags = [
    {
      key: "--target",
      type: "string",
      desc: l.trans({
        en: "A key of `mobile.targets`, or `all`. With a single target it is picked for you; `start-*` runs one at a time.",
        ko: "`mobile.targets`의 키나 `all`입니다. target이 하나뿐이면 자동으로 고르며, `start-*`는 한 번에 하나만 실행합니다.",
      }),
    },
    {
      key: "--env",
      type: "local | debug | develop | main",
      desc: l.trans({
        en: "The backend the app talks to. The default differs per command, as in the table above.",
        ko: "앱이 연결할 백엔드 환경입니다. 기본값은 위 표처럼 명령마다 다릅니다.",
      }),
    },
    {
      key: "--release",
      type: "boolean",
      default: "false",
      tags: ["start-*"],
      desc: l.trans({
        en: "Run a release build with the web build inside, so no dev server is needed.",
        ko: "웹 빌드를 담은 릴리스 빌드로 실행하므로 개발 서버가 필요 없습니다.",
      }),
    },
    {
      key: "--device",
      type: "string",
      tags: ["start-ios", "start-android"],
      desc: l.trans({
        en: "A simulator, emulator or device by id or name. A paired iPhone's name makes a signed phone build.",
        ko: "시뮬레이터, 에뮬레이터, 기기의 id나 이름입니다. 페어링한 iPhone 이름을 주면 서명한 폰 빌드를 만듭니다.",
      }),
    },
    {
      key: "-T, --team",
      type: "string",
      tags: ["start-ios", "release-ios"],
      desc: l.trans({
        en: "The Apple team id to sign with, when the Mac holds profiles of several teams.",
        ko: "Mac에 여러 팀의 프로필이 있을 때 서명에 쓸 Apple 팀 id입니다.",
      }),
    },
    {
      key: "--debug",
      type: "boolean",
      default: "false",
      tags: ["build-*"],
      desc: l.trans({ en: "A debug build instead of a release one.", ko: "릴리스 대신 디버그 빌드를 만듭니다." }),
    },
    {
      key: "--ad-hoc",
      type: "boolean",
      default: "false",
      tags: ["release-ios"],
      desc: l.trans({
        en: "Sign with an ad-hoc profile instead of an App Store one.",
        ko: "App Store 프로필 대신 ad-hoc 프로필로 서명합니다.",
      }),
    },
    {
      key: "--assemble-type",
      type: "aab | apk",
      default: "aab",
      tags: ["release-android"],
      desc: l.trans({
        en: "`aab` for a Play Store upload, `apk` to install the file directly.",
        ko: "`aab`는 Play Store 업로드용, `apk`는 파일을 직접 설치할 때 씁니다.",
      }),
    },
    {
      key: "-l, --allow-local-release",
      type: "boolean",
      default: "false",
      tags: ["release-*"],
      desc: l.trans({
        en: "Allow `--env local` in a release build. For local testing only.",
        ko: "릴리스 빌드에서 `--env local`을 허용합니다. 로컬 테스트용입니다.",
      }),
    },
  ];

  const signingNotes = [
    l.trans({
      en: (
        <>
          <strong>
            <code>MYAPP_RELEASE_STORE_FILE</code> is relative to the app folder.
          </strong>{" "}
          Keep the keystore under <code>secrets/</code>, never in <code>public/</code>.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>MYAPP_RELEASE_STORE_FILE</code>은 앱 폴더 기준 경로입니다.
          </strong>{" "}
          keystore 파일은 <code>secrets/</code>에 두고, <code>public/</code>에는 두지 마세요.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Keep passwords out of git.</strong> A CI sets the same names as secrets. The passwords reach the
          signer through the environment, never the command line or the log.
        </>
      ),
      ko: (
        <>
          <strong>비밀번호는 git에 올리지 마세요.</strong> CI에서는 같은 이름을 secret으로 넣습니다. 비밀번호는
          명령줄이나 로그가 아니라 환경 변수로만 서명 도구에 전달됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Where the file lands.</strong> <code>apps/myapp/.akan/mobile/default/native/android</code>.{" "}
          <code>release-android</code> prints the path.
        </>
      ),
      ko: (
        <>
          <strong>결과물 위치.</strong> <code>apps/myapp/.akan/mobile/default/native/android</code>에 생기며,{" "}
          <code>release-android</code>가 경로를 출력합니다.
        </>
      ),
    }),
  ];

  const signingChecks = [
    l.trans({
      en: (
        <>
          Sign in to your team in Xcode (Settings › Accounts) and download its profiles, so the Mac holds an Apple
          Development certificate and a profile for the app ID. The runtime reads Xcode's profile folders; there is no
          project to open.
        </>
      ),
      ko: (
        <>
          Xcode(Settings › Accounts)에서 팀에 로그인하고 프로필을 내려받아, Mac에 Apple Development 인증서와 이 App ID의
          프로필이 있게 합니다. 런타임은 Xcode의 프로필 폴더를 읽으며, 따로 열 프로젝트는 없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          The profile's App ID is <code>mobile.appId</code>. A wildcard ID is used only when the app asks for neither
          push nor associated domains.
        </>
      ),
      ko: (
        <>
          프로필의 App ID가 <code>mobile.appId</code>와 같아야 합니다. 와일드카드 ID는 앱이 푸시도 associated domains도
          요청하지 않을 때만 씁니다.
        </>
      ),
    }),
    l.trans({
      en: "For a phone run, the development profile lists that phone: register it once (build to it from Xcode, or add it on the developer site) and download the profile again. A release needs an Apple Distribution certificate and an App Store (or ad-hoc) profile.",
      ko: "폰에서 실행하려면 development 프로필에 그 폰이 들어 있어야 합니다. 폰을 한 번 등록하고(Xcode에서 그 폰으로 빌드하거나 개발자 사이트에서 추가) 프로필을 다시 내려받습니다. 출시에는 Apple Distribution 인증서와 App Store(또는 ad-hoc) 프로필이 필요합니다.",
    }),
    l.trans({
      en: "Run on a simulator first, then move to a phone for device-only features.",
      ko: "먼저 시뮬레이터에서 실행하고, 기기 전용 기능은 폰으로 옮겨 확인합니다.",
    }),
  ];

  const iosNotes = [
    l.trans({
      en: (
        <>
          <strong>
            <code>--device</code> picks the device.
          </strong>{" "}
          It takes a simulator's name or UDID, or a paired iPhone's name. Left out, a booted iPhone simulator is used,
          else the newest one is started.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>--device</code>로 기기를 고릅니다.
          </strong>{" "}
          시뮬레이터 이름이나 UDID, 페어링한 iPhone 이름을 받습니다. 생략하면 켜져 있는 iPhone 시뮬레이터를 쓰고, 없으면
          가장 최신 것을 띄웁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>The signing is found, not made.</strong> A phone run and a release pick the certificate and profile
          that fit, and print the one they used. <code>--team</code> chooses when several teams fit.
        </>
      ),
      ko: (
        <>
          <strong>서명은 만들지 않고 찾습니다.</strong> 폰 실행과 출시는 맞는 인증서와 프로필을 골라 쓰고, 무엇을 썼는지
          출력합니다. 여러 팀이 맞으면 <code>--team</code>으로 고릅니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>When nothing fits.</strong> The error lists every profile for the bundle ID and why it does not fit:
          expired, another team, a missing capability such as push, or the phone not in it.
        </>
      ),
      ko: (
        <>
          <strong>맞는 것이 없을 때.</strong> 오류가 그 bundle ID의 프로필마다 맞지 않는 이유를 보여 줍니다. 만료, 다른
          팀, 푸시 같은 capability 누락, 폰이 빠진 프로필 등입니다.
        </>
      ),
    }),
  ];

  const desktopPrereqs = [
    {
      name: "macOS",
      desc: l.trans({
        en: "Xcode command line tools (`xcode-select --install`).",
        ko: "Xcode command line tools (`xcode-select --install`).",
      }),
    },
    {
      name: "Windows",
      desc: l.trans({
        en: 'Visual Studio 2022 Build Tools with "Desktop development with C++".',
        ko: 'Visual Studio 2022 Build Tools의 "Desktop development with C++".',
      }),
    },
    {
      name: "Linux",
      desc: l.trans({
        en: "A C compiler, pkg-config, and the WebKitGTK 4.1, GTK 3 and libsoup 3 development packages.",
        ko: "C 컴파일러, pkg-config, WebKitGTK 4.1·GTK 3·libsoup 3 개발 패키지.",
      }),
    },
  ];

  const symptomRows = [
    {
      symptom: "`camera.takePhoto() is not supported on ios`",
      check: l.trans({
        en: "The target does not ship that plugin. Add its permission, or name it in `native.plugins`, then run again.",
        ko: "target에 그 플러그인이 들어 있지 않습니다. 권한을 적거나 `native.plugins`에 이름을 적고 다시 실행합니다.",
      }),
    },
    {
      symptom: l.trans({ en: "`No dev server answers on …`", ko: "`No dev server answers on …`" }),
      check: l.trans({
        en: "A dev build loads its pages from `akan start myapp`. Start it first, or pass `--release`.",
        ko: "개발 빌드는 `akan start myapp`에서 화면을 불러옵니다. 먼저 켜거나 `--release`를 줍니다.",
      }),
    },
    {
      symptom: l.trans({
        en: "A save reloads the whole app instead of updating it in place",
        ko: "저장하면 그 자리에서 바뀌지 않고 앱 전체가 다시 뜸",
      }),
      check: l.trans({
        en: "A component, store, page or layout edit applies in place and keeps state; a `*.constant.ts` change, an added or removed route, or a new npm dependency reloads. `AKAN_DEV_CSR=artifact` on `akan start` brings back the single-file dev bundle, which reloads on every save.",
        ko: "컴포넌트·store·페이지·레이아웃 수정은 state를 유지한 채 그 자리에서 바뀌고, `*.constant.ts`가 바뀌거나 라우트가 추가·삭제되거나 npm 의존성이 새로 들어오면 다시 뜹니다. `akan start`에 `AKAN_DEV_CSR=artifact`를 주면 저장할 때마다 다시 뜨는 예전 단일 파일 dev 번들로 돌아갑니다.",
      }),
    },
    {
      symptom: l.trans({
        en: "No permission prompt, or an iOS crash on first use",
        ko: "권한 창이 뜨지 않거나, iOS에서 처음 쓸 때 앱이 꺼짐",
      }),
      check: l.trans({
        en: "Add the feature to `permissions` and rerun, so the usage text and native entries are written.",
        ko: "`permissions`에 기능을 적고 다시 실행해, 사용 안내 문구와 네이티브 설정이 들어가게 합니다.",
      }),
    },
    {
      symptom: l.trans({ en: "A native file is missing", ko: "네이티브 파일이 없음" }),
      check: l.trans({
        en: "A `files` key is where the file lands (`ios/…`, `android/res/…`, `android/assets/…`); the value is the path in the app folder.",
        ko: "`files`의 키는 파일이 들어갈 자리(`ios/…`, `android/res/…`, `android/assets/…`)이고, 값이 앱 폴더 안의 경로입니다.",
      }),
    },
    {
      symptom: l.trans({ en: "A notification tap opens the wrong screen", ko: "알림을 누르면 엉뚱한 화면이 열림" }),
      check: l.trans({
        en: 'Send `url: "/some/path"` in the data and check that the tap opens that CSR route.',
        ko: '데이터에 `url: "/some/path"`를 넣어 보내고, 누르면 그 CSR route가 열리는지 확인합니다.',
      }),
    },
  ];

  const pushChecks = [
    {
      title: l.trans({ en: "Android push", ko: "Android 푸시" }),
      items: [
        l.trans({
          en: "The package name matches the Android app registered in Firebase.",
          ko: "package name이 Firebase에 등록한 Android 앱과 같습니다.",
        }),
        l.trans({
          en: (
            <>
              <code>native.android.googleServices</code> points at that app's <code>google-services.json</code>.
            </>
          ),
          ko: (
            <>
              <code>native.android.googleServices</code>가 그 앱의 <code>google-services.json</code>을 가리킵니다.
            </>
          ),
        }),
        l.trans({
          en: "The notification permission is granted on the phone.",
          ko: "폰에서 알림 권한을 허용했습니다.",
        }),
        l.trans({
          en: "The server's Firebase credentials are for the same project.",
          ko: "서버의 Firebase 인증 정보가 같은 프로젝트의 것입니다.",
        }),
      ],
    },
    {
      title: l.trans({ en: "iOS push", ko: "iOS 푸시" }),
      items: [
        l.trans({ en: "You test on a real device.", ko: "실기기에서 테스트합니다." }),
        l.trans({
          en: (
            <>
              The profile allows push; <code>aps-environment</code> follows it, <code>development</code> for a phone run
              and <code>production</code> for a release.
            </>
          ),
          ko: (
            <>
              프로필이 푸시를 허용합니다. <code>aps-environment</code>는 프로필을 따라 폰 실행에서는{" "}
              <code>development</code>, 출시에서는 <code>production</code>입니다.
            </>
          ),
        }),
        l.trans({
          en: "The server holds an APNs key (team ID, key ID, the .p8 file) for this bundle ID; iOS push does not go through Firebase.",
          ko: "서버에 이 bundle ID의 APNs 키(팀 ID, 키 ID, .p8 파일)가 있습니다. iOS 푸시는 Firebase를 거치지 않습니다.",
        }),
      ],
    },
  ];

  const nextLinks = [
    {
      href: "/cheatsheet/mobile/push",
      title: l.trans({ en: "Push Notifications", ko: "푸시 알림" }),
      desc: l.trans({
        en: "APNs, FCM and the client API, per platform.",
        ko: "플랫폼별 APNs, FCM 설정과 클라이언트 API입니다.",
      }),
    },
    {
      href: "/cheatsheet/mobile/links",
      title: l.trans({ en: "Deep Links", ko: "딥링크" }),
      desc: l.trans({
        en: "Custom URL schemes and verified HTTPS app links.",
        ko: "커스텀 URL scheme과 검증된 HTTPS 앱 링크입니다.",
      }),
    },
    {
      href: "/docs/core/config#mobile",
      title: l.trans({ en: "Every Mobile Field", ko: "mobile 필드 전체" }),
      desc: l.trans({
        en: "Icons, splash images, native files and the native block.",
        ko: "아이콘, 스플래시 이미지, 네이티브 파일, native 블록까지 모두 봅니다.",
      }),
    },
    {
      href: "/references/cli/application",
      title: l.trans({ en: "CLI Reference", ko: "CLI 레퍼런스" }),
      desc: l.trans({
        en: "Every flag of the mobile commands.",
        ko: "모바일 명령의 모든 플래그입니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Mobile Setup Flow", ko: "모바일 설정 흐름" })}>
        <Docs.Title>{l.trans({ en: "Mobile Setup Flow", ko: "모바일 설정 흐름" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "An Akan mobile app is your CSR web app running inside a native shell that akanjs's own runtime generates for iOS and Android, and for macOS, Windows and Linux too. The web app owns the pages and business logic. The shell owns the package ID, device permissions, plugins, native files, signing and store builds, all declared in akan.config.ts.",
              ko: "Akan 모바일 앱은 akanjs의 자체 런타임이 iOS·Android용으로, 그리고 macOS·Windows·Linux용으로도 만들어 내는 네이티브 셸 안에서 CSR 웹 앱을 실행한 것입니다. 페이지와 비즈니스 로직은 웹 앱이 맡습니다. 패키지 ID, 기기 권한, 플러그인, 네이티브 파일, 서명, 스토어 빌드는 셸이 맡으며, 모두 akan.config.ts에 선언합니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
          <Docs.SubSubTitle>{l.trans({ en: "Four steps", ko: "네 단계" })}</Docs.SubSubTitle>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {flowCards.map(({ title, desc }, idx) => (
              <div key={idx} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{title}</div>
                <div className="mt-1 text-foreground/70 text-sm">{desc}</div>
              </div>
            ))}
          </div>
          <div>
            {l.trans({
              en: "Push notifications and deep links are optional. Set them up after this page, and only if the app needs them.",
              ko: "푸시 알림과 딥링크는 선택 기능입니다. 이 페이지를 끝낸 뒤, 앱에 필요할 때만 설정하세요.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="mobile-config" title={l.trans({ en: "Mobile Config", ko: "mobile 설정" })}>
        <Docs.Title>{l.trans({ en: "Mobile Config", ko: "mobile 설정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The <code>mobile</code> block in <code>akan.config.ts</code> describes the native app: its name, ID,
                  version and targets. Values at the <code>mobile</code> root apply to every target, and a target
                  overrides the ones it sets.
                </span>
              ),
              ko: (
                <span>
                  <code>akan.config.ts</code>의 <code>mobile</code> 블록이 네이티브 앱의 이름, ID, 버전, target을
                  정합니다. <code>mobile</code> 루트의 값은 모든 target의 기본값이고, target이 직접 적은 값이 그 위를
                  덮습니다.
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/akan.config.ts"
            code={`import type { AppConfig } from "akanjs";

const config: AppConfig = {
  mobile: {
    appName: "Acme Shop",
    appId: "com.acme.shop",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      default: {
        indexPath: "/home",
        permissions: ["camera", "push"],
        native: {
          android: { googleServices: "secrets/google-services.json" },
        },
      },
    },
  },
};

export default config;`}
          />
          <Docs.OptionTable items={mobileFields} />
          <div>
            {l.trans({
              en: (
                <span>
                  Icons, splash images and deep links are also target fields; see{" "}
                  <Link href="/docs/core/config#mobile" className={inlineLink}>
                    Config
                  </Link>{" "}
                  and{" "}
                  <Link href="/cheatsheet/mobile/links" className={inlineLink}>
                    Deep Links
                  </Link>
                  .
                </span>
              ),
              ko: (
                <span>
                  아이콘, 스플래시 이미지, 딥링크도 target 필드입니다.{" "}
                  <Link href="/docs/core/config#mobile" className={inlineLink}>
                    설정
                  </Link>
                  과{" "}
                  <Link href="/cheatsheet/mobile/links" className={inlineLink}>
                    딥링크
                  </Link>{" "}
                  문서를 보세요.
                </span>
              ),
            })}
          </div>

          <Docs.SubSubTitle>
            {l.trans({ en: "What each permission adds", ko: "권한마다 들어가는 네이티브 설정" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A permission brings the feature's plugin and writes its native settings on the next run. For speech the runtime has no plugin yet: the build says so and ships without it, and a lib that claims the permission adds only its own entries.",
              ko: "권한을 적으면 다음 실행 때 그 기능의 플러그인이 들어가고 네이티브 설정이 쓰입니다. 음성은 런타임에 아직 플러그인이 없어, 빌드가 그렇게 알리고 없이 빌드합니다. 그 권한을 맡은 lib는 자기 항목만 더합니다.",
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "permission", label: l.trans({ en: "Permission", ko: "권한" }), code: true },
              { key: "plugin", label: l.trans({ en: "Plugin", ko: "플러그인" }) },
              { key: "android", label: "Android" },
              { key: "ios", label: "iOS" },
            ]}
            rows={permissionRows}
          />

          <Docs.SubSubTitle>
            {l.trans({ en: "Several native apps from one app", ko: "앱 하나로 네이티브 앱 여러 개 만들기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  When one repo ships separate customer, admin or partner apps, split the clients with{" "}
                  <code>basePath</code> and give each its own target. A target that sets its own <code>appId</code> is a
                  separate store app:
                </span>
              ),
              ko: (
                <span>
                  한 저장소에서 고객용, 관리자용, 파트너용 앱을 따로 낸다면 <code>basePath</code>로 클라이언트를 나누고
                  target도 하나씩 둡니다. <code>appId</code>를 따로 정한 target은 별개의 스토어 앱이 됩니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/akan.config.ts"
            code={`const config: AppConfig = {
  routes: [
    { basePath: "shop", domains: { main: ["shop.acme.com"] } },
    { basePath: "partner", domains: { main: ["partner.acme.com"] } },
  ],
  mobile: {
    appName: "Acme Shop",
    appId: "com.acme.shop",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      shop: { basePath: "shop" },
      partner: {
        basePath: "partner",
        appName: "Acme Partner",
        appId: "com.acme.partner",
      },
    },
  },
};`}
          />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      <code>basePath</code> must exist in <code>routes</code>.
                    </strong>{" "}
                    Declare the client first; the{" "}
                    <Link href="/docs/core/multi-client" className={inlineLink}>
                      Multi Client
                    </Link>{" "}
                    page shows how.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>basePath</code>는 <code>routes</code>에 있어야 합니다.
                    </strong>{" "}
                    클라이언트를 먼저 선언하세요. 방법은{" "}
                    <Link href="/docs/core/multi-client" className={inlineLink}>
                      다중 클라이언트
                    </Link>{" "}
                    문서에 있습니다.
                  </>
                ),
              })}
            </li>
            {configPitfalls.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Never change appId after release.</strong> Android and iOS treat a different{" "}
                  <code>appId</code> as a different app.
                </span>
              ),
              ko: (
                <span>
                  <strong>출시한 뒤에는 appId를 바꾸지 마세요.</strong> Android와 iOS는 <code>appId</code>가 다르면
                  완전히 다른 앱으로 봅니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="native-plugins" title={l.trans({ en: "Native Plugins", ko: "네이티브 플러그인" })}>
        <Docs.Title>{l.trans({ en: "Native Plugins", ko: "네이티브 플러그인" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The runtime ships a plugin only when the target asks for it. A base set every Akan page relies on is
                  always in; <code>permissions</code> bring their feature's plugin; anything else is named in{" "}
                  <code>native.plugins</code>. Calling a plugin the app does not ship rejects with{" "}
                  <code>UNSUPPORTED</code>.
                </span>
              ),
              ko: (
                <span>
                  런타임은 target이 요청한 플러그인만 앱에 넣습니다. 모든 Akan 페이지가 쓰는 기본 묶음은 항상 들어가고,{" "}
                  <code>permissions</code>가 그 기능의 플러그인을 가져오며, 그 밖의 것은 <code>native.plugins</code>에
                  적습니다. 앱에 없는 플러그인을 호출하면 <code>UNSUPPORTED</code>로 거부됩니다.
                </span>
              ),
            })}
          </div>
          <Docs.Matrix
            type={l.trans({ en: "Package", ko: "패키지" })}
            columns={pluginColumns}
            groups={pluginGroups}
            markLabel={l.trans({ en: "Yes", ko: "해당" })}
            emptyLabel={l.trans({ en: "No", ko: "해당 없음" })}
          />
          <div>
            {l.trans({
              en: "Beyond the base set and the permissions, name only the plugins the app actually calls. In-app purchase, for example, has no permission of its own:",
              ko: "기본 묶음과 권한 밖의 플러그인은 앱이 실제로 호출하는 것만 적습니다. 예를 들어 인앱 결제에는 따로 권한이 없습니다:",
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/akan.config.ts"
            code={`mobile: {
  targets: {
    default: {
      permissions: ["push"],
      native: { plugins: ["iap"] },
    },
  },
},`}
          />
          <ul className={bulletList}>
            {pluginNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Your Own Plugins", ko: "앱이 가진 플러그인" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  A device feature no builtin covers — a kiosk's boot receiver, a Windows registry setting — is a plugin
                  in the app's own <code>native/</code> folder, one folder per plugin, named after its id. It is not
                  listed anywhere: every target of the app ships it, and its manifest says what runs on each platform. A
                  lib's <code>native/</code> plugins reach the apps that depend on it, and an app's own plugin wins an
                  id a lib also uses.
                </span>
              ),
              ko: (
                <span>
                  빌트인에 없는 장치 기능(키오스크의 부팅 수신, Windows 레지스트리 설정 같은 것)은 앱의{" "}
                  <code>native/</code> 폴더에 플러그인으로 둡니다. 플러그인 하나가 폴더 하나이고, 폴더 이름은 그
                  id입니다. 어디에도 적지 않습니다. 앱의 모든 타깃에 들어가고, 플랫폼마다 무엇이 도는지는 manifest가
                  정합니다. lib의 <code>native/</code> 플러그인은 그 lib에 의존하는 앱에 들어가며, 같은 id를 앱도 가지면
                  앱 것이 쓰입니다.
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/myapp/native/kiosk"
            code={`native-plugin.json   { "id": "kiosk", "apiVersion": 1, "methods": ["hideTaskbar"], "desktop": "./src/desktop.ts", … }
src/index.ts         export const kiosk = definePlugin<KioskApi>("kiosk", { methods: ["hideTaskbar"] });
src/desktop.ts       export default defineDesktopPlugin<KioskApi>({ id: "kiosk", methods: { hideTaskbar: … } });
android/KioskPlugin.kt`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  <code>definePlugin</code> comes from <code>akanjs/client/native</code> and{" "}
                  <code>defineDesktopPlugin</code> from <code>akanjs/native/desktop</code>; the runtime's own package is
                  not installed in an app's workspace. A <code>webkit/</code> hook imports the plugin's API from{" "}
                  <code>../native/kiosk/src</code>, and pages call the hook.
                </span>
              ),
              ko: (
                <span>
                  <code>definePlugin</code>은 <code>akanjs/client/native</code>에서, <code>defineDesktopPlugin</code>은{" "}
                  <code>akanjs/native/desktop</code>에서 가져옵니다. 런타임 패키지 자체는 앱의 작업 공간에 설치되지
                  않습니다. 플러그인 API는 <code>webkit/</code> 훅이 <code>../native/kiosk/src</code>에서 가져오고,
                  페이지는 그 훅을 부릅니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="android-setup" title={l.trans({ en: "Android Setup", ko: "Android 설정" })}>
        <Docs.Title>{l.trans({ en: "Android Setup", ko: "Android 설정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  This gets the Android app running on an emulator or a phone. Keep one value consistent:{" "}
                  <code>mobile.appId</code> becomes the Android <code>applicationId</code>.
                </span>
              ),
              ko: (
                <span>
                  Android 앱을 에뮬레이터나 폰에서 띄우는 과정입니다. 꼭 맞춰야 할 값은 하나입니다.{" "}
                  <code>mobile.appId</code>가 Android의 <code>applicationId</code>가 됩니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Prerequisites", ko: "준비물" })}</Docs.SubSubTitle>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: "The Android SDK with build-tools 35 or newer, and an emulator or a phone with USB debugging. Android Studio installs both.",
                ko: "build-tools 35 이상이 설치된 Android SDK, 그리고 에뮬레이터나 USB 디버깅을 켠 폰. Android Studio가 둘 다 설치해 줍니다.",
              })}
              <ExternalLink
                href="https://developer.android.com/studio"
                label={l.trans({ en: "Open the Android Studio download", ko: "Android Studio 다운로드 열기" })}
              />
            </li>
            <li>
              {l.trans({
                en: "A JDK 17 or newer. Android Studio bundles one; `JAVA_HOME` picks another. The Kotlin compiler is fetched on the first build.",
                ko: "JDK 17 이상. Android Studio에 들어 있는 것을 쓰며, 다른 JDK는 `JAVA_HOME`으로 고릅니다. Kotlin 컴파일러는 첫 빌드 때 받아 옵니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    A stable <code>mobile.appId</code> such as <code>com.acme.shop</code>.
                  </>
                ),
                ko: (
                  <>
                    <code>com.acme.shop</code>처럼 바뀌지 않을 <code>mobile.appId</code>.
                  </>
                ),
              })}
              <ExternalLink
                href="https://developer.android.com/build/configure-app-module#set-application-id"
                label={l.trans({ en: "Open the Android application ID docs", ko: "Android application ID 문서 열기" })}
              />
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Run on a device", ko: "기기에서 실행하기" })}</Docs.SubSubTitle>
          <ol className={stepList}>
            <li>
              {l.trans({
                en: "When the SDK is not at ~/Library/Android/sdk, point your shell at it:",
                ko: "SDK가 ~/Library/Android/sdk에 없다면 터미널이 그 위치를 쓰도록 설정합니다:",
              })}
              <Code.Snippet
                className="w-full"
                title="Terminal"
                language="bash"
                code={`export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"`}
              />
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    Check that <code>mobile.appId</code> is final (see Mobile Config above), then start the dev server.
                    Without <code>--release</code>, the app loads its screens from it:
                  </>
                ),
                ko: (
                  <>
                    <code>mobile.appId</code>가 확정됐는지 확인하고(위 mobile 설정 참고) 개발 서버를 켭니다.{" "}
                    <code>--release</code> 없이 실행하면 앱이 이 서버에서 화면을 불러옵니다:
                  </>
                ),
              })}
              <Code.Snippet className="w-full" title="Terminal" language="bash" code="akan start myapp" />
            </li>
            <li>
              {l.trans({
                en: "In a second terminal, run the app on an emulator or a connected phone:",
                ko: "두 번째 터미널에서 에뮬레이터나 연결한 폰으로 앱을 실행합니다:",
              })}
              <Code.Snippet className="w-full" title="Terminal" language="bash" code="akan start-android myapp" />
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    Success looks like this: the app opens on the target's <code>indexPath</code>, and a save in the app
                    shows up without a rebuild. A phone reaches the dev server over its USB connection.
                  </>
                ),
                ko: (
                  <>
                    앱이 target의 <code>indexPath</code>로 열리고, 저장하면 다시 빌드하지 않아도 반영되면 성공입니다.
                    폰은 USB 연결로 개발 서버에 닿습니다.
                  </>
                ),
              })}
            </li>
          </ol>

          <Docs.SubSubTitle>{l.trans({ en: "Commands and store builds", ko: "명령과 스토어 빌드" })}</Docs.SubSubTitle>
          <Docs.Table columns={commandColumns} rows={androidCommandRows} stacked />
          <div>
            {l.trans({
              en: (
                <span>
                  Check that the app builds, then make the Play Store AAB against the <code>main</code> backend:
                </span>
              ),
              ko: (
                <span>
                  앱이 빌드되는지 확인한 뒤, Play Store에 올릴 AAB를 <code>main</code> 백엔드로 만듭니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`akan build-android myapp --target default
akan release-android myapp --target default --env main`}
          />
          <div>
            {l.trans({
              en: (
                <span>
                  <code>release-android</code> signs with your upload key, which it reads from the environment. Set
                  three names, and a fourth when the key has its own password; a missing one stops the command before it
                  builds:
                </span>
              ),
              ko: (
                <span>
                  <code>release-android</code>는 환경 변수에서 읽은 업로드 키로 서명합니다. 이름 세 개를 두고, 키에
                  비밀번호가 따로 있으면 네 번째도 둡니다. 하나라도 없으면 빌드 전에 멈춥니다:
                </span>
              ),
            })}
            <ExternalLink
              href="https://developer.android.com/studio/publish/app-signing"
              label={l.trans({ en: "Open the Android app signing docs", ko: "Android 앱 서명 문서 열기" })}
            />
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`export MYAPP_RELEASE_STORE_FILE=secrets/release.keystore
export MYAPP_RELEASE_STORE_PASSWORD=<store password>
export MYAPP_RELEASE_KEY_ALIAS=upload
export MYAPP_RELEASE_KEY_PASSWORD=<key password>`}
          />
          <ul className={bulletList}>
            {signingNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Mobile command flags", ko: "모바일 명령 플래그" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={commandFlags} />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="ios-setup" title={l.trans({ en: "iOS Setup", ko: "iOS 설정" })}>
        <Docs.Title>{l.trans({ en: "iOS Setup", ko: "iOS 설정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "This prepares the bundle ID, signing, simulator runs and store builds. There is no Xcode project: the runtime compiles the app with Xcode's tools and reads the signing Xcode keeps. Run on a simulator first, then on a phone for device-only features.",
              ko: "bundle ID, 서명, 시뮬레이터 실행, 스토어 빌드를 준비하는 과정입니다. Xcode 프로젝트는 없습니다. 런타임이 Xcode의 도구로 앱을 컴파일하고, Xcode가 둔 서명을 읽습니다. 먼저 시뮬레이터에서 실행하고, 기기 전용 기능은 폰에서 확인합니다.",
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Prerequisites", ko: "준비물" })}</Docs.SubSubTitle>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: "Xcode 26 or newer, with an iOS 26 simulator runtime (Xcode › Settings › Components).",
                ko: "Xcode 26 이상과 iOS 26 시뮬레이터 런타임 (Xcode › Settings › Components).",
              })}
              <ExternalLink
                href="https://developer.apple.com/xcode/"
                label={l.trans({ en: "Open the Xcode download", ko: "Xcode 다운로드 열기" })}
              />
            </li>
            <li>
              {l.trans({
                en: (
                  <>
                    A stable <code>mobile.appId</code>, used as the bundle ID.
                  </>
                ),
                ko: (
                  <>
                    bundle ID로 쓸, 바뀌지 않을 <code>mobile.appId</code>.
                  </>
                ),
              })}
              <ExternalLink
                href="https://developer.apple.com/help/account/identifiers/register-an-app-id"
                label={l.trans({ en: "Open the Apple bundle ID docs", ko: "Apple bundle ID 문서 열기" })}
              />
            </li>
            <li>
              {l.trans({
                en: "An Apple developer team, for phone runs and releases.",
                ko: "폰 실행과 출시에 쓸 Apple 개발자 팀.",
              })}
              <ExternalLink
                href="https://developer.apple.com/help/account/certificates/create-a-certificate-signing-request"
                label={l.trans({ en: "Open the Apple signing docs", ko: "Apple 서명 문서 열기" })}
              />
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Run on a device", ko: "기기에서 실행하기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  With <code>akan start myapp</code> running, launch the app on a simulator, or name a paired iPhone:
                </span>
              ),
              ko: (
                <span>
                  <code>akan start myapp</code>을 켜 둔 채 시뮬레이터에서 앱을 실행하거나, 페어링한 iPhone 이름을
                  줍니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`akan start-ios myapp
akan start-ios myapp --device "iPhone 17"
akan start-ios myapp --device "Jane's iPhone" --team ABCDE12345`}
          />
          <ul className={bulletList}>
            {iosNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Signing checks", ko: "서명에서 확인할 것" })}</Docs.SubSubTitle>
          <ol className={stepList}>
            {signingChecks.map((check, idx) => (
              <li key={idx}>{check}</li>
            ))}
          </ol>

          <Docs.SubSubTitle>{l.trans({ en: "Commands and store builds", ko: "명령과 스토어 빌드" })}</Docs.SubSubTitle>
          <Docs.Table columns={commandColumns} rows={iosCommandRows} stacked />
          <div>
            {l.trans({
              en: (
                <span>
                  Check that the app builds, then make the App Store build against the <code>main</code> backend, which{" "}
                  <code>release-ios</code> uses by default:
                </span>
              ),
              ko: (
                <span>
                  앱이 빌드되는지 확인한 뒤, App Store용 빌드를 <code>main</code> 백엔드로 만듭니다.{" "}
                  <code>release-ios</code>는 기본으로 <code>main</code>을 씁니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`akan build-ios myapp --target default
akan release-ios myapp --target default --env main`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="desktop" title={l.trans({ en: "Desktop", ko: "데스크톱" })}>
        <Docs.Title>{l.trans({ en: "Desktop", ko: "데스크톱" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The same target also runs as a desktop app, which is the quickest way to try a change outside the
                  browser. <code>akan start-desktop</code> builds for this computer's own OS, since a desktop app builds
                  only there, and loads its pages from <code>akan start</code> like the phone commands:
                </span>
              ),
              ko: (
                <span>
                  같은 target은 데스크톱 앱으로도 실행되며, 브라우저 밖에서 변경을 가장 빨리 확인하는 방법입니다.{" "}
                  <code>akan start-desktop</code>은 데스크톱 앱이 자기 OS에서만 빌드되므로 지금 컴퓨터의 OS용으로
                  빌드하고, 폰 명령처럼 <code>akan start</code>에서 화면을 불러옵니다:
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`akan start myapp
akan start-desktop myapp
akan start-desktop myapp --release true --env debug`}
          />
          <div>
            {l.trans({
              en: "It needs Rust through rustup, which installs the toolchain the build pins, plus this OS's native build tools:",
              ko: "rustup으로 설치한 Rust(빌드가 고정한 toolchain을 rustup이 받습니다)와 OS별 네이티브 빌드 도구가 필요합니다:",
            })}
            <ExternalLink href="https://rustup.rs" label={l.trans({ en: "Open rustup", ko: "rustup 열기" })} />
          </div>
          <Docs.IntroTable type="OS" items={desktopPrereqs} />
          <div>
            {l.trans({
              en: (
                <span>
                  A desktop app can also carry the app's own server, so it works on one computer with no backend
                  elsewhere. With <code>--server</code>, <code>akan start-desktop</code> starts <code>akan start</code>{" "}
                  in the same command when none is running, and <code>akan build-desktop</code> builds the app with the
                  server inside: it starts beside the window on a loopback port, serves the API only, and keeps its
                  SQLite data in the app data folder's <code>server/</code>.
                </span>
              ),
              ko: (
                <span>
                  데스크톱 앱에 앱의 서버를 넣을 수도 있습니다. 다른 곳에 백엔드 없이 컴퓨터 한 대에서 동작합니다.{" "}
                  <code>--server</code>를 주면 <code>akan start-desktop</code>은 떠 있는 개발 서버가 없을 때 같은
                  명령에서 <code>akan start</code>를 띄우고, <code>akan build-desktop</code>은 서버를 넣은 앱을
                  빌드합니다. 이 서버는 창과 함께 loopback 포트로 떠서 API만 서빙하고, SQLite 데이터를 앱 데이터 폴더의{" "}
                  <code>server/</code>에 둡니다.
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="Terminal"
            language="bash"
            code={`akan start-desktop myapp --server true
akan build-desktop myapp --server true --env main`}
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: "The server needs `single` in `database.modes`. `env.server.<env>.ts` ships inside the app in plain text, so keep deployment secrets such as cloud keys out of it.",
              ko: "서버를 넣으려면 `database.modes`에 `single`이 있어야 합니다. `env.server.<env>.ts`는 앱 안에 평문으로 들어가므로 클라우드 키 같은 배포용 비밀을 두지 마세요.",
            })}
          </Docs.Alert>
          <Docs.Alert type="info">
            {l.trans({
              en: "start-desktop is for development and testing, and build-desktop makes an app for this computer signed ad hoc. Distribution signing, notarization and installers are not akan commands yet.",
              ko: "start-desktop은 개발과 테스트용이고, build-desktop은 이 컴퓨터용으로 ad hoc 서명한 앱을 만듭니다. 배포 서명, 공증, 설치 프로그램은 아직 akan 명령에 없습니다.",
            })}
          </Docs.Alert>
          <div>
            {l.trans({
              en: (
                <span>
                  The carried server gets none of the image's <code>docker</code> steps. An executable its code spawns,
                  such as ffmpeg, goes in <code>bin</code> in <code>akan.config.ts</code>: per platform, a download
                  checked against its <code>sha256</code> or a file next to the config. The build fetches the one for
                  this computer, puts it in the app and its folder first on the server's PATH, so{" "}
                  <code>spawn("ffmpeg")</code> runs it and the user installs nothing. A package that builds itself at
                  install goes in <code>trustedDependencies</code>.
                </span>
              ),
              ko: (
                <span>
                  앱에 넣은 서버에는 이미지의 <code>docker</code> 단계가 하나도 들어가지 않습니다. 서버 코드가 실행하는
                  ffmpeg 같은 실행 파일은 <code>akan.config.ts</code>의 <code>bin</code>에 적습니다. 플랫폼마다{" "}
                  <code>sha256</code>로 확인하는 다운로드나 설정 파일 옆의 파일을 적으면, 빌드가 이 컴퓨터용 파일을 앱에
                  넣고 그 폴더를 서버 PATH 맨 앞에 둡니다. 그래서 <code>spawn("ffmpeg")</code>가 그 파일을 실행하고,
                  사용자는 아무것도 설치하지 않습니다. 설치하면서 스스로 빌드하는 패키지는{" "}
                  <code>trustedDependencies</code>에 적습니다.
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="akan.config.ts"
            language="typescript"
            code={`const config: AppConfig = {
  bin: {
    ffmpeg: {
      "darwin-arm64": { url: "https://files.example.com/ffmpeg-lgpl-darwin-arm64.zip", sha256: "…", file: "bin/ffmpeg" },
      "win32-x64": { url: "https://files.example.com/ffmpeg-lgpl-win64.zip", sha256: "…", file: "bin/ffmpeg.exe" },
      "linux-x64": { path: "tools/linux-x64/ffmpeg" },
    },
  },
  trustedDependencies: ["rclnodejs"],
};`}
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: "Carry a static LGPL build. A build that loads its own shared libraries runs only where it was built, and one configured with --enable-nonfree (the macOS binary npm's ffmpeg-static downloads) may not be redistributed.",
              ko: "정적 LGPL 빌드를 넣으세요. 공유 라이브러리를 따로 불러오는 빌드는 만든 컴퓨터에서만 돌고, --enable-nonfree로 빌드한 것(npm ffmpeg-static이 받는 macOS 파일)은 재배포할 수 없습니다.",
            })}
          </Docs.Alert>
          <div>
            {l.trans({
              en: (
                <span>
                  A file the user picks reaches that server as a grant, never as a copy or a path, so a video of several
                  gigabytes is not copied or uploaded. Add <code>file-picker</code> to the target's{" "}
                  <code>native.plugins</code>, pick with <code>forServer: true</code>, hand the grant to an endpoint,
                  and let the server exchange it with <code>NativeFile</code>: it gets the files the user picked and
                  nothing else.
                </span>
              ),
              ko: (
                <span>
                  사용자가 고른 파일은 복사본이나 경로가 아니라 허가(grant)로 서버에 전달됩니다. 그래서 수 GB 영상도
                  복사하거나 업로드하지 않습니다. 타깃의 <code>native.plugins</code>에 <code>file-picker</code>를
                  추가하고 <code>forServer: true</code>로 고른 뒤, grant를 엔드포인트에 넘기면 서버가{" "}
                  <code>NativeFile</code>로 경로를 받습니다. 서버는 사용자가 고른 파일만 얻습니다.
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="page → server"
            language="typescript"
            code={`// webkit/usePickVideo.tsx (akanjs/client/native)
const { files } = await filePicker.pickFiles({ types: ["video/*"], forServer: true });
await fetch.trimVideo(files[0].grant, 0, 30);

// lib/video/video.service.ts (akanjs/server)
const input = await NativeFile.resolve(grant, "read");
const output = await NativeFile.resolve(saveGrant, "write"); // from filePicker.saveFile({ name, forServer: true })`}
          />
          <Docs.Alert type="info">
            {l.trans({
              en: "Devices belong to native plugins, not to the server: displays and their changes (screen), windows placed on them (window), the system volume and mute (volume, on Android the media volume too), global shortcuts, keep-awake and launch at login. Add each to the target's native.plugins; volume and filePicker come from akanjs/client/native.",
              ko: "장치는 서버가 아니라 네이티브 플러그인이 다룹니다. 디스플레이와 그 변경(screen), 디스플레이에 놓는 창(window), 시스템 볼륨과 음소거(volume, Android는 미디어 볼륨), 전역 단축키, 절전 막기, 로그인 시 실행이 있습니다. 각각 타깃의 native.plugins에 추가하고, volume과 filePicker는 akanjs/client/native에서 가져옵니다.",
            })}
          </Docs.Alert>
          <Docs.SubSubTitle>{l.trans({ en: "An App Nobody Attends", ko: "지키는 사람이 없는 앱" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  A kiosk or a signage screen has nobody to click Reload. <code>desktop.recovery: "reload"</code> loads
                  a page whose process ended again every time, waiting longer after each end in a row, and relaunches
                  the app when the webview's browser process ends. <code>desktop.window</code> opens the main window
                  fullscreen and without a taskbar button from its first frame, and <code>app.relaunch()</code> starts
                  the app over in a new process on the desktop and Android.
                </span>
              ),
              ko: (
                <span>
                  키오스크나 전광판에는 새로고침을 누를 사람이 없습니다. <code>desktop.recovery: "reload"</code>는
                  프로세스가 끝난 페이지를 매번 다시 불러오되 연달아 끝날수록 오래 기다리고, webview 브라우저 프로세스가
                  끝나면 앱을 다시 띄웁니다. <code>desktop.window</code>는 주 창을 첫 프레임부터 전체화면, 작업 표시줄
                  버튼 없이 열고, <code>app.relaunch()</code>는 데스크톱과 Android에서 앱을 새 프로세스로 다시
                  시작합니다.
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/board/akan.config.ts"
            code={`mobile: {
  targets: {
    default: {
      native: {
        desktop: { recovery: "reload", window: { fullscreen: true, skipTaskbar: true } },
        android: { autoplay: true },
      },
    },
  },
},`}
          />
          <Docs.SubSubTitle>{l.trans({ en: "Installing On Windows", ko: "Windows에 설치하기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  <code>akan build-desktop myapp --installer true</code> on Windows adds a setup program next to the app
                  folder (NSIS: <code>winget install NSIS.NSIS</code>). It installs for the current user, so updates
                  swap the app without an administrator; <code>/S</code> installs silently and <code>/RUN</code> starts
                  the app afterwards, which is what a remote install passes; a PC without the WebView2 Runtime gets it
                  too. The program is not code-signed yet, so a copy downloaded in a browser meets a SmartScreen
                  warning.
                </span>
              ),
              ko: (
                <span>
                  Windows에서 <code>akan build-desktop myapp --installer true</code>를 실행하면 앱 폴더 옆에 설치
                  프로그램이 생깁니다(NSIS: <code>winget install NSIS.NSIS</code>). 현재 사용자로 설치하므로 업데이트가
                  관리자 권한 없이 앱을 바꿉니다. <code>/S</code>는 무인 설치, <code>/RUN</code>은 설치 뒤 실행으로,
                  원격 설치가 넘기는 인자입니다. WebView2 Runtime이 없는 PC에는 함께 설치합니다. 아직 코드 서명이
                  없어서, 브라우저로 받은 파일은 SmartScreen 경고를 만납니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "Updates", ko: "업데이트" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  An installed app updates itself from releases you sign. <code>akan update-keygen</code> makes the key
                  once and prints its public half for <code>mobile.updates</code>; <code>akan publish-update</code>{" "}
                  builds a release (the whole app on the desktop, the web bundle on a phone) into{" "}
                  <code>.akan/mobile/&lt;target&gt;/updates</code>, which you upload to <code>updates.url</code>, the
                  manifests last. A new release runs on trial until its first page mounts; when to check, download and
                  apply is the app's call.
                </span>
              ),
              ko: (
                <span>
                  설치된 앱은 직접 서명한 릴리스로 스스로 업데이트합니다. <code>akan update-keygen</code>이 키를 한 번
                  만들고 <code>mobile.updates</code>에 넣을 공개 키를 출력합니다. <code>akan publish-update</code>는
                  릴리스(데스크톱은 앱 전체, 폰은 웹 번들)를 <code>.akan/mobile/&lt;target&gt;/updates</code>에
                  빌드하고, 그 폴더를 <code>updates.url</code>에 올리되 manifest를 마지막에 올립니다. 새 릴리스는 첫
                  페이지가 마운트될 때까지 시험 실행이며, 언제 확인·다운로드·적용할지는 앱이 정합니다.
                </span>
              ),
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="webkit/useAppUpdates.tsx"
            language="typescript"
            code={`import { updates } from "akanjs/client/native";

// e.g. every 30 minutes; a kiosk applies at night, an app on its next launch
const { available } = await updates.check();
if (available) {
  await updates.download();
  await updates.apply();
}`}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="verify" title={l.trans({ en: "Verify Setup", ko: "설정 확인" })}>
        <Docs.Title>{l.trans({ en: "Verify Setup", ko: "설정 확인" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A green build is not the finish line. On a real device, check that plugins load, native files are in place, permission prompts appear, and push arrives and opens the right screen.",
              ko: "빌드 성공이 끝이 아닙니다. 실제 기기에서 플러그인이 불러와지는지, 네이티브 파일이 제자리에 있는지, 권한 창이 뜨는지, 푸시가 도착해 맞는 화면을 여는지 확인하세요.",
            })}
          </div>
          <Docs.Table
            columns={[
              { key: "symptom", label: l.trans({ en: "Symptom", ko: "증상" }) },
              { key: "check", label: l.trans({ en: "What to check", ko: "확인할 것" }) },
            ]}
            rows={symptomRows}
            stacked
          />

          <Docs.SubSubTitle>{l.trans({ en: "Push on each platform", ko: "플랫폼별 푸시 점검" })}</Docs.SubSubTitle>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {pushChecks.map(({ title, items }, idx) => (
              <div key={idx} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{title}</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground/70 text-sm">
                  {items.map((item, itemIdx) => (
                    <li key={itemIdx}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "Next", ko: "다음 단계" })}</Docs.SubSubTitle>
          <Docs.LinkGrid items={nextLinks} />
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
