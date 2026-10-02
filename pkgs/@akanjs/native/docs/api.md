# akan-native 프로그램 API (O2-1 초안)

- 상태: 초안(2026-09-26). akanjs 준비 트랙(notes/akanjs-akan-native-migration.md §4 O2-1)에서 akanjs devkit과 가장 먼저 합의할 인터페이스다. 코드보다 먼저 이 문서를 검토받는다.
- 목적: CLI(`akan-native build` 등)가 하는 일을 다른 도구가 프로세스 안에서 부른다. akanjs devkit이 첫 사용자다.
  - 설정은 파일(`akan-native.config.ts`) 없이 메모리의 객체로 넘긴다.
  - 결과와 오류는 구조화된 값으로 받는다. 콘솔 출력, `process.exit`, `process.cwd()`에 기대지 않는다.
  - CLI는 이 API 위의 얇은 층이 된다. 같은 동작을 두 번 구현하지 않는다.
- 범위 밖: 페이지 코드가 부르는 플러그인 JS API(`@akanjs/native/core`, `@akanjs/native/plugins/*`)는 이 문서의 대상이 아니다.

## 0. 구현 상태 (2026-09-26)

| 항목 | 상태 |
|---|---|
| `build`, `run`, `validateConfig`, `AkanNativeError`, `API_VERSION` 0.9.0 (0.2.0: `desktop.server`; 0.3.0: `desktop.server.bin`; 0.4.0: `desktop.recovery`, `desktop.window`, `android.autoplay`; 0.5.0: `publishUpdate`, `updateKeygen`, `windows.installer`; 0.6.0: `desktop.bin`, `desktop.server.bin` 없앰; 0.7.0: `desktop.screenCapture`; 0.8.0: `packUpdate`, `compareBundles`; 0.9.0: `checkPublishUpdate`) | 구현(`packages/cli/src/api.ts`, `@akanjs/native/api`). 테스트 `packages/cli/test/api.test.ts` |
| 로그 싱크 | 구현. 호출마다 AsyncLocalStorage로 분리한다. 동시 호출의 로그가 섞이지 않고, 이벤트에는 터미널 색이 없다. 자식 프로세스 출력(웹 빌드 등)은 `tool` 줄이다 |
| `signal` | 구현. 실행 중인 도구를 죽이고 `CANCELLED`로 거절한다 |
| `outDir`, `env`, `envFiles`, `resolveFrom`, `skipWebBuild` | 구현. 같은 `outDir`의 두 작업은 차례로 돈다(프로세스 안 잠금) |
| 기기 | `devices()`, `DeviceSelector`(문자열 또는 `{ id }`·`{ name }`·`{ kind }`), `RunningApp.device`, `DevSession.device`와 `reload()`. `doctor()`는 CLI doctor와 같은 검사를 구조화해 돌려준다 |
| `release` | Android(O1-5): `signing`(keystore, alias, 비밀번호), `formats`(기본 `["aab"]`, APK도 함께 나온다). iOS(O1-3): `signing`(모두 선택, 없으면 키체인과 Xcode 프로파일에서 찾는다, §3 "서명 찾기"), 결과에 iPhone .app과 .ipa, 고른 서명은 `BuildResult.signing`. 서명 실패는 `SIGNING_FAILED` |
| iPhone | `build({ ios: { device: true, signing } })`, `run({ device })`·`dev({ device })`에 페어링한 iPhone 이름을 주면 iPhone 빌드로 설치·실행한다. 서명은 찾고, `ios: { signing: { teamId } }`처럼 좁힐 수 있다 |
| `dev` | 구현(O4): `upstream`, `hmrPath`, `startPath`, `lan`(`device`가 페어링된 iPhone이면 기본으로 켠다. Mac에 사설 IPv4가 없으면 `DEVICE_FAILED`), `device`, `onLine`. 반환 `DevSession { gateway, build, rebuild(config?), exited, stop() }`. 파일 감시는 호출하는 쪽이 한다(설정이 바뀌면 `rebuild`) |
| `doctor`, `devices`, `upload` | 아직 |
| CLI | 같은 내부 함수(`prepare`, 플랫폼 빌더)를 부른다. `akan-native` 명령을 이 API 위로 옮기는 것은 dev·release가 붙은 뒤에 한다 |
| O2-3 서버 쪽 import | 구현. `packages/core/test/ssr-import.test.ts`가 모든 패키지를 DOM 없는 새 프로세스에서, react-server 조건으로도 import한다. 훅은 `import * as React`로 부른다(react-server의 react에는 훅이 없어서 이름 있는 import가 링크 단계에서 실패했다) |

## 1. 모양

```ts
import { build, run, dev, release, publishUpdate, updateKeygen, packUpdate, compareBundles, doctor, devices, validateConfig, AkanNativeError, API_VERSION } from "@akanjs/native/api";
```

- 함수마다 옵션 객체 하나를 받고 Promise를 돌려준다.
- `API_VERSION`은 semver 문자열이다. 호환되지 않게 바뀌면 major를 올린다. akanjs devkit은 시작할 때 major를 확인한다.
- 모든 함수는 동시에 여러 번 불러도 된다. 타깃마다 `outDir`이 다르면 서로 간섭하지 않는다(§6).

## 2. 공통 옵션

```ts
interface TaskOptions {
  /** 설정의 상대 경로(web.dir, icon, 상대 폴더 플러그인)의 기준 폴더. */
  appDir: string;
  /** akan-native.config.ts가 default export하는 것과 같은 모양(AkanNativeConfig). 파일을 읽지 않는다. */
  config: AkanNativeConfig;
  platform: "web" | "macos" | "windows" | "linux" | "ios" | "android";
  /** 산출물 폴더. 기본 <appDir>/.akan/native/build/<platform>. akanjs: .akan/native/<target>/build/<platform> */
  outDir?: string;
  /** .env.<mode>를 고른다. 기본 build·release는 "production", run·dev는 "development". */
  mode?: string;
  /** false면 appDir의 .env 파일을 읽지 않는다. 기본 true. */
  envFiles?: boolean;
  /** 가장 높은 우선순위의 PUBLIC_ 값. .env와 config.env를 덮는다. */
  env?: Record<string, string>;
  /** config.web.build를 건너뛰고 web.dir에 있는 것을 쓴다. akanjs는 web.dir을 직접 조립하므로 true. */
  skipWebBuild?: boolean;
  /** 플러그인을 패키지 이름으로 적었을 때 풀 기준 폴더. 기본 appDir. 내장 플러그인은 id("camera"), 그 밖은 폴더의 절대경로로 적으면 쓰지 않는다. */
  resolveFrom?: string;
  /** 로그 이벤트(§5). 없으면 아무것도 출력하지 않는다. */
  log?: (event: LogEvent) => void;
  /** 취소. 자식 프로세스(swiftc, kotlinc, cargo, 웹 빌드)를 끝내고 CANCELLED로 거절한다. */
  signal?: AbortSignal;
}
```

- `validateConfig(config, { appDir, resolveFrom })`는 빌드하지 않고 설정 문제 목록(`string[]`)만 돌려준다. 모르는 키도 문제다(§7). akanjs가 akan.config를 변환한 직후 부른다.
- 서명은 옵션으로만 받는다. API는 `AKAN_NATIVE_ANDROID_*`·`AKAN_NATIVE_IOS_*` 환경변수를 읽지 않는다(그 변수들은 개발 CLI용이다). 툴체인 위치 같은 기계 설정(`AKAN_NATIVE_HOME`, `AKAN_NATIVE_NO_AUTO_INSTALL`)은 API에도 적용된다.
- API는 앱 폴더에 env 타입 파일(`akan-native-env.d.ts`)을 쓰지 않는다(W5). 그 파일은 개발 CLI만 쓴다. `outDir`를 넘기면 산출물은 거기에, 툴체인·키·캐시는 `~/.akan/native`에 간다. 앱 폴더에 쓰는 예외는 하나다: `upstream` 없이 Bun dev 서버를 띄우는 `dev()`는 `<appDir>/.akan/native/dev/`에 서버 스크립트를 둔다.

## 3. 함수

### build — 개발·배포용 빌드

```ts
function build(o: TaskOptions & { profile?: "debug" | "release"; ios?: IosBuild; windows?: { installer?: boolean; signing?: WindowsSigning }; macos?: MacosBuild; linux?: { appImage?: boolean }; arch?: "arm64" | "x64" }): Promise<BuildResult>;

interface BuildResult {
  platform: TaskOptions["platform"];
  profile: "debug" | "release";
  outDir: string;
  artifacts: Artifact[];
  warnings: string[];
  durationMs: number;
  /** iPhone 빌드: 찾아서 쓴 서명(§3 "서명 찾기"). akanjs는 이것을 사용자에게 보여 준다. */
  signing?: IosSigningResult;
  /**
   * 고정 라이브러리가 든 Android 빌드(push의 FCM 모듈, iap): 라이선스 고지 파일(akan-native-licenses.json).
   * 같은 내용이 앱의 /akan-native-licenses.json에 있어 오픈소스 라이선스 화면에 쓴다(V15).
   */
  licenses?: string;
}

interface IosSigningResult {
  identity: string;       // "Apple Development: …"
  identitySha1: string;
  profile: string;        // 프로파일 이름
  profileUuid: string;
  teamId: string;
  kind: string;           // development, app-store, ad-hoc
  expires: string;        // ISO 날짜
}

interface Artifact {
  /** app: macOS·iOS 번들, folder: Windows·Linux 앱 폴더, installer: Windows NSIS 설치 프로그램(windows.installer), macOS dmg(macos.dmg), Linux AppImage(linux.appImage) */
  kind: "app" | "apk" | "aab" | "ipa" | "folder" | "web" | "installer";
  path: string;
  /** 누가 서명했는지: 서명하지 않음, adhoc(macOS dev), debug 키(Android), 개발(iOS 실기기, macOS Apple Development), 배포(macOS Developer ID) */
  signing: "none" | "adhoc" | "debug" | "development" | "distribution";
  /** 시뮬레이터용인지 실기기용인지(iOS), ABI(Android) */
  device?: "simulator" | "device";
}
```

- 기본 profile은 release다(CLI `akan-native build`와 같다). run과 dev는 debug로 빌드한다.
- iOS: 기본은 시뮬레이터 .app이다. `ios: { device: true, signing? }`(아래 release와 같은 `IosSigning`)를 주면 실기기 .app(O1-2)을 만든다.
- Windows: `windows: { installer: true }`(CLI `--installer`)면 앱 폴더 옆에 NSIS 설치 프로그램 `<fileName>-<version>-<arch>-setup.exe`도 만든다(`platforms/windows-installer.ts`). 사용자 단위(`%LOCALAPPDATA%\Programs\<name>`, 관리자 불필요, 제거 프로그램은 폴더 옆 `<name>.uninstall.exe`), `/S` 무인 설치, `/S /RUN`이면 설치 뒤 실행, `/D=`가 없으면 이미 설치된 곳(제거 항목의 `InstallLocation`)에 다시 설치, WebView2가 없으면 내장한 Evergreen Bootstrapper로 설치, 설치 폴더에서 도는 앱은 경로로 찾아 멈춘다. 설치와 제거는 한 번에 하나만 돈다. 여유 공간과 WebView2 확인, 새 파일 풀기(폴더 옆 `<name>.setup-new`), 새 제거 프로그램 쓰기는 앱을 멈추기 전에 하고, 폴더는 이름 바꾸기 두 번으로 바꾼다. 종료 코드는 새 빌드가 폴더를 차지했는지를 말한다. 0이면 차지했다. 그 뒤에 제거 프로그램·바로가기·제거 항목을 쓰지 못해도 0이고, 설치 로그와 대화형 창으로 알린다. 2면 차지하지 못했다(다른 설치·제거가 도는 중, 공간 부족, 풀거나 쓰지 못함, 폴더를 바꾸지 못함 등). 2로 끝난 설치는 `<name>.setup-new`와 새 제거 프로그램을 지우고, 이미 옮긴 옛 폴더는 제자리로 되살린다. 되살리기까지 실패하면 옛 앱은 `<name>.setup-old`에 남고 다음 설치가 되살린다. 앱을 멈춘 뒤의 실패이고 `/RUN`이면 자리에 있는 앱을 다시 띄운다. 제거는 자동 시작 등록(`Run` 값), 셸의 업데이트 상태(`%LOCALAPPDATA%\<id>\akan-native-updates`, debug 빌드는 `akan-native-updates-debug`)와 업데이트의 `RunOnce` 복구 명령, 알림 AUMID 키, 이 실행 파일을 여는 딥 링크 스킴 키도 지우고, 서버 데이터는 남긴다. 재설치와 제거는 폴더 안의 정션을 따라가지 않는다. 가장 긴 경로가 260자에 가까우면 경고한다. makensis가 필요하다(`winget install NSIS.NSIS`, `AKAN_NATIVE_MAKENSIS`). 서명은 아래 "Windows 배포 서명"이다.

#### macOS 배포 서명 (CLI-9)

```ts
interface MacosBuild {
  signing?: { identity?: string; certificate?: { path: string; password: string } };
  /** release 빌드, Developer ID 서명에만. App Store Connect API 키 또는 notarytool keychain 프로필 */
  notarize?: { key?: string; keyId?: string; issuer?: string; profile?: string };
  /** 앱 옆에 dmg(Applications 바로가기). 서명·공증·staple을 앱과 똑같이 한다 */
  dmg?: boolean;
}
```

- `signing.identity`는 키체인에 이미 있는 인증서 이름(`Developer ID Application: …`) 또는 SHA-1이다. `signing.certificate`는 .p12 파일이다. 빌드 동안만 쓰는 키체인을 만들어 넣고(사용자 검색 목록에 잠시 올려 codesign이 체인을 찾게 한다), 끝나면 지운다. `security import`가 .p12 비밀번호를 인자로만 받으므로 그 값은 그 명령의 인자에만 있고, 실패 메시지에는 넣지 않는다.
- Apple이 발급한 인증서(Developer ID, Apple Development)로 서명하면 모든 Mach-O 파일(`resources/server`·`resources/bin`, Frameworks dylib, 실행 파일)에 hardened runtime과 보안 타임스탬프를 붙이고 안쪽부터 서명한다. 실행 파일의 entitlements는 Bun JIT용 `com.apple.security.cs.allow-jit`·`allow-unsigned-executable-memory`, Info.plist의 사용 설명이 요구하는 것(`NSCameraUsageDescription` → `com.apple.security.device.camera`, 마이크 → `device.audio-input`, 위치·연락처·캘린더·사진), 그 위에 앱의 `native.macos.entitlements`(akanjs `native.desktop.entitlements`) 순서로 합친다. 다른 팀이 서명한 애드온을 싣는 앱은 `com.apple.security.cs.disable-library-validation`을 직접 더한다. 자체 서명(`akan-native signing setup`)과 ad-hoc은 예전 그대로 runtime 없이 서명한다.
- shell.json `signing`은 팀 서명이면 `"team"`(secure-storage가 in-process Keychain 항목을 쓴다), 자체 서명이면 `"identity"`, 아니면 `"adhoc"`이다.
- `notarize`가 있으면 앱을 zip(`ditto --keepParent`)으로 `xcrun notarytool submit --wait`에 내고, Accepted가 아니면 `notarytool log`의 문제 목록과 함께 `SIGNING_FAILED`로 끝난다. 받아들여지면 `stapler staple`과 `spctl --assess --type execute`로 확인한다. dmg도 같은 순서로 서명(타임스탬프만, runtime 없음)·공증·staple·확인(`--type open`)한다. Developer ID가 아닌 서명이나 debug 빌드의 공증은 거부한다.
- release 빌드가 Developer ID로 서명되지 않았거나 공증되지 않았으면 경고한다. 내려받은 사본은 Gatekeeper가 막기 때문이다.
- `publishUpdate`도 `macos: { signing, notarize }`를 받는다. 업데이터가 설치된 앱의 서명을 확인하므로(`codesign --verify --deep --strict`), 업데이트 릴리스는 내려받은 앱과 같은 인증서로 서명해야 한다. dmg는 만들지 않는다.
- API는 환경 변수를 읽지 않는다. `macosDistributionFromEnv(env)`가 `AKAN_NATIVE_MACOS_IDENTITY`, `AKAN_NATIVE_MACOS_CERTIFICATE`·`_CERTIFICATE_PASSWORD`, `AKAN_NATIVE_MACOS_NOTARY_KEY`·`_KEY_ID`·`_ISSUER` 또는 `AKAN_NATIVE_MACOS_NOTARY_PROFILE`을 `MacosBuild`로 바꿔 준다. CLI `akan-native build macos`와 akanjs `akan build-desktop`·`publish-update`가 이것을 쓴다. CLI `--installer`는 macOS에서 dmg다.

#### 데스크톱 CPU (CLI-9)

- `arch`(CLI `--arch`, `"arm64"` 또는 `"x64"`)는 데스크톱 앱이 도는 CPU다. 기본은 이 컴퓨터의 것이다. 같은 OS의 다른 CPU용으로 만들 수 있다(Windows·Linux의 arm64와 x64). OS 교차 빌드는 없다: WRY가 WebView2·webkit2gtk에 묶여 있다. macOS 앱은 Apple silicon(arm64)만 내므로 macOS에 `x64`를 주면 거부하고(Intel Mac은 지원하지 않는다), 폰 빌드에 주어도 거부한다.
- Rust 라이브러리는 그 CPU의 타깃으로 빌드한다(`rustup target add <triple>`이 필요할 수 있다). 실행 파일은 `bun build --compile --target=bun-<os>-<arch>`로 만든다(Bun이 그 런타임을 한 번 내려받는다).
- 서버의 네이티브 애드온 검사(위 표)는 그 CPU를 본다. akanjs는 서버 패키지를 `bun install --cpu=<arch>`로 설치해 그 CPU의 prebuild를 받고, `bin`은 그 CPU의 항목을 받는다.
- 산출물 이름의 CPU도 따른다: `<fileName>-<version>-<arch>.dmg`, `…-<arch>-setup.exe`, `…-<arch>.AppImage`. updates 플러그인은 실행 중인 CPU의 릴리스를 읽으므로 그대로 쓰지만, `publishUpdate`는 아직 이 컴퓨터의 CPU용 릴리스만 낸다.

#### Linux AppImage (CLI-9)

- `linux: { appImage: true }`(CLI `--installer`)면 앱 폴더 옆에 `<fileName>-<version>-<arch>.AppImage`를 만든다(`platforms/linux-appimage.ts`). 앱 폴더에 `AppRun`(옆의 실행 파일을 인자 그대로 실행), `<fileName>.desktop`(이름, 아이콘, `deepLinks.schemes`의 `x-scheme-handler/<scheme>`), 256px 아이콘과 `.DirIcon`을 더해 `mksquashfs -comp zstd -root-owned`로 묶고, 고정한 AppImage type 2 runtime(`lib/toolchains.ts`의 `appimageRuntime`, 날짜 릴리스와 SHA-256, `~/.akan/native/toolchains`에 받는다) 뒤에 붙인다. appimagetool은 쓰지 않는다. 그 자체가 FUSE가 필요한 AppImage이고 고정하지 않은 runtime을 내려받기 때문이다.
- `mksquashfs`가 필요하다(`apt install squashfs-tools`). 사용자 쪽은 폴더와 같이 시스템의 WebKitGTK 4.1·GTK 3을 쓰고, FUSE가 없으면 `--appimage-extract-and-run`으로 돈다.
- AppImage는 읽기 전용 이미지에서 돌므로 updates 플러그인이 자신을 바꿀 수 없다. `updates`가 있는 앱이면 경고한다. 릴리스마다 새 AppImage를 낸다.

#### Windows 배포 서명 (CLI-9)

```ts
interface WindowsSigning {
  certificate?: { path: string; password: string };   // .pfx
  thumbprint?: string;                                // 인증서 저장소의 인증서(토큰·HSM)
  command?: string[];                                 // 다른 서명 도구, 파일마다 한 번, {file}을 바꾼다
  timestampUrl?: string;                              // 기본 http://timestamp.digicert.com
}
```

- `windows.signing`이 있으면 앱 폴더의 모든 PE 파일(실행 파일, `akan_native_desktop.dll`, `resources/server`·`resources/bin`의 `.exe`·`.dll`·`.node`, 이름과 상관없이)을 Authenticode(SHA-256, RFC 3161 타임스탬프)로 서명하고 `signtool verify /pa`로 확인한다. `installer`면 setup.exe도 서명하고, NSIS가 설치 때 쓰는 제거 프로그램은 makensis의 `!uninstfinalize`가 같은 설정으로 서명한다. 설정은 환경 변수로만 넘겨 .pfx 비밀번호가 .nsi나 makensis 인자에 남지 않는다(signtool은 비밀번호를 인자로만 받으므로 그 명령의 인자에는 있다. 실패 메시지에는 넣지 않는다).
- signtool은 `AKAN_NATIVE_SIGNTOOL`, PATH, 가장 새 Windows 10/11 SDK의 이 CPU용 순서로 찾는다. `command`면 signtool이 없어도 된다. Azure Trusted Signing은 `["signtool", "sign", "/fd", "SHA256", "/tr", "http://timestamp.acs.microsoft.com", "/td", "SHA256", "/dlib", "<Azure.CodeSigning.Dlib.dll>", "/dmdf", "<metadata.json>", "{file}"]`처럼 쓴다.
- release 빌드를 서명하지 않으면 경고한다(SmartScreen이 내려받은 사본에 경고한다). `publishUpdate`도 `windows: { signing }`을 받는다.
- `windowsSigningFromEnv(env)`가 `AKAN_NATIVE_WINDOWS_CERTIFICATE`·`_CERTIFICATE_PASSWORD`, `AKAN_NATIVE_WINDOWS_THUMBPRINT`, `AKAN_NATIVE_WINDOWS_SIGN_COMMAND`(JSON 배열), `AKAN_NATIVE_WINDOWS_TIMESTAMP_URL`을 `WindowsSigning`으로 바꾼다. CLI와 akanjs가 쓴다.

### run — 빌드하고 띄우기

```ts
function run(o: TaskOptions & {
  profile?: "debug" | "release";
  device?: DeviceSelector;
  onLine?: (line: string) => void;
  headless?: boolean;
  /** device가 페어링한 iPhone일 때: 서명 찾기를 좁힌다(예: teamId만). 시뮬레이터에서는 쓰지 않는다. */
  ios?: { signing?: IosSigning };
}): Promise<RunningApp>;

interface RunningApp {
  build: BuildResult;
  device?: Device;   // iOS·Android에서 실제로 쓴 기기
  /** 앱(또는 로그 스트림)이 끝나면 종료 코드로 풀린다. */
  exited: Promise<number>;
  stop(): Promise<void>;
}
```

- `onLine`은 앱의 로그 줄이다(시뮬레이터 log stream, logcat, 데스크톱 stdout).
- akanjs `start-ios --device`: `run({ platform: "ios", device, ios: { signing: { teamId } } })`. 서명을 주지 않아도 찾는다.

### dev — 고쳐 가며 개발

```ts
function dev(o: TaskOptions & {
  device?: DeviceSelector;
  /** 외부 dev 서버(O4-1). 셸은 페이지를 gateway에서 가져오고, gateway가 이 주소로 프록시한다. 페이지 오리진은 앱 오리진 그대로다. */
  upstream?: string;
  /** 페이지가 여는 HMR WebSocket 경로(O4-2). gateway가 upstream으로 중계한다. 기본 "/_bun/hmr". akanjs: "/_akan/hmr" */
  hmrPath?: string;
  /** 첫 페이지의 경로와 쿼리(O4-5, dev 빌드만). 예: "/en/?csr=true&akanMobileTarget=default" */
  startPath?: string;
  /**
   * 앱이 자기 오리진에서 여는 WebSocket 경로(W4). 예: ["/ws"]. 페이지가 이 경로로 여는 소켓은 gateway를 거쳐
   * upstream으로 간다. 업그레이드가 아닌 요청(HTTP polling 대체)은 다른 경로처럼 upstream으로 프록시된다.
   * 실제 iPhone은 gateway의 LAN 주소로 붙으므로, Mac의 서버에 페이지와 같은 길로 닿는다.
   */
  wsPaths?: string[];
  /** Android: gateway 포트 말고도 기기의 같은 포트를 이 컴퓨터로 잇는다(adb reverse). 예: API 서버 포트 */
  reversePorts?: number[];
  onLine?: (line: string) => void;
  /** run과 같다: iPhone일 때 서명 찾기를 좁힌다. */
  ios?: { signing?: IosSigning };
}): Promise<DevSession>;

interface DevSession {
  /** gateway 주소(실기기는 LAN 주소 또는 adb reverse 포트) */
  gateway: string;
  device?: Device;   // iOS·Android에서 실제로 쓴 기기
  /** 네이티브 설정이 바뀌었을 때: 다시 빌드하고 설치하고 띄운다. */
  rebuild(config?: AkanNativeConfig): Promise<BuildResult>;
  /** 페이지만 다시 불러온다. */
  reload(): Promise<void>;
  exited: Promise<number>;
  stop(): Promise<void>;
}
```

- `upstream`이 없으면 지금의 `akan-native dev --hmr`처럼 Bun dev 서버를 akan-native가 띄운다.
- 페이지를 dev 서버에서 받으므로 `web.dir`에 index.html이 없어도 된다(W3). 그때 앱에 들어가는 페이지는 "dev 서버에 닿지 않는다"는 안내뿐이다. release 빌드는 여전히 index.html이 있어야 한다.
- dev 빌드에만 들어가는 것: iOS ATS의 LAN 예외(O4-3), Android cleartext 허용 목록, gateway 주소. release 빌드에는 들어가지 않는다.

### release — 스토어에 낼 파일

```ts
function release(o: TaskOptions & (
  | { platform: "ios"; signing?: IosSigning }                                      // iPhone .app + .ipa
  | { platform: "android"; signing: AndroidSigning; formats?: ("aab" | "apk")[] }  // 기본 ["aab"]
  // macOS는 build의 macos.signing·notarize, Windows는 windows.signing(§3 "macOS 배포 서명", "Windows 배포 서명").
)): Promise<BuildResult>;

/** 모두 선택이다. 주지 않은 것은 찾는다(아래 "서명 찾기"). 1단계(D7): Xcode가 이 Mac에 만든 인증서와 프로파일. */
interface IosSigning {
  /** 인증서의 키체인 이름("Apple Development: …") 또는 SHA-1 */
  identity?: string;
  /** .mobileprovision 파일. 주면 이 파일만 후보다. */
  provisioningProfile?: string;
  /** 이 팀의 프로파일만 */
  teamId?: string;
  /** release만: 기본 "app-store". ad-hoc 프로파일은 "ad-hoc"을 줄 때만 쓴다. */
  distribution?: "app-store" | "ad-hoc";
}

interface AndroidSigning {
  /** JKS 또는 PKCS12 키스토어. appDir 기준 상대 경로도 된다 */
  keystore: string;
  alias: string;
  /** 값 자체. 명령줄과 로그에 남기지 않는다(apksigner·jarsigner가 env:로 읽는다). akanjs는 자기 env에서 읽어 넘긴다 */
  storePassword: string;
  /** 기본값: storePassword (PKCS12는 비밀번호가 하나다) */
  keyPassword?: string;
}
```

#### 서명 찾기(iOS)

run·dev의 iPhone 빌드와 iOS release는 같은 규칙으로 인증서(identity)와 프로파일을 함께 고른다. 후보 프로파일은 `provisioningProfile`을 주면 그 파일 하나, 아니면 Xcode의 프로파일 폴더(`~/Library/Developer/Xcode/UserData/Provisioning Profiles`, `~/Library/MobileDevice/Provisioning Profiles`)에 있는 것 전부다. 프로파일은 다음을 모두 만족해야 맞는다.

1. 번들 id: 프로파일의 App ID가 `config.app.id`와 같거나 와일드카드(`TEAM.*`, `TEAM.com.akanjs.*`)로 덮는다. 와일드카드는 앱이 푸시(`aps-environment`)도 associated domains도 요청하지 않을 때만 쓴다(Apple이 와일드카드 App ID에 이 기능을 주지 않는다).
2. 목적: run·dev는 development, release는 app-store(기본) 또는 `distribution: "ad-hoc"`일 때만 ad-hoc. enterprise는 쓰지 않는다.
3. 만료되지 않았다.
4. `teamId`를 주면 그 팀이다.
5. run·dev가 페어링한 iPhone에 설치할 때: development·ad-hoc 프로파일은 그 기기의 UDID(devicectl의 hardware UDID)를 목록에 가져야 한다. 기기를 정하지 않는 `build({ ios: { device: true } })`(`ios.target`을 주면 검사한다)와 app-store release는 검사하지 않는다.
6. 앱이 요청하는 권한(푸시, associated domains, keychain 그룹, `native.ios.entitlements`)이 모두 프로파일에 있다. `aps-environment`는 프로파일의 값(development·production)을 따른다.
7. 프로파일이 허용하는 인증서 중 하나가 로그인 키체인에 유효한 identity로 있다(run·dev는 Apple Development, release는 Apple Distribution). `identity`를 주면 그 인증서여야 한다.

맞는 것이 여럿이면:

- 정확한 번들 id가 와일드카드보다 먼저다(정확한 것이 하나라도 있으면 와일드카드는 빠진다).
- 남은 후보가 여러 팀에 걸치면 고르지 않는다: `SIGNING_FAILED`, `problems`에 후보마다 `"<프로파일 이름>" (team <팀>, <종류>, until <만료일>) with <인증서>`. `teamId`로 고른다.
- 한 팀인데 쓸 수 있는 인증서가 여럿이면(키체인에 같은 팀 개발자 인증서가 둘, 프로파일이 둘 다 허용) 같은 방식으로 끝난다. `identity`로 고른다.
- 팀도 인증서도 하나면 가장 늦게 만료되는 프로파일을 쓴다(Xcode가 갱신할 때 새 프로파일을 만든다).

맞는 것이 없으면 `SIGNING_FAILED`, `problems`에 이 번들 id를 덮는 프로파일마다 맞지 않는 이유(`an app-store profile, not development`, `expired`, `team X, not Y`, `aps-environment: the profile's App ID does not have this capability`, `none of its certificates is a valid identity in this keychain`, `it does not include device "<이름>" (<udid>)`, 와일드카드와 푸시)가 들어간다. 기기 하나 때문에만 빠진 프로파일이 있으면 메시지가 기기를 등록하고(Xcode에서 그 기기로 한 번 빌드하거나 개발자 사이트에서 추가) 프로파일을 새로 받으라고 알려 준다. 고른 결과(인증서 이름과 SHA-1, 프로파일 이름과 UUID, 팀, 종류, 만료일)는 `BuildResult.signing`과 info 로그에 남는다. CLI는 같은 규칙을 env `AKAN_NATIVE_IOS_TEAM`·`AKAN_NATIVE_IOS_IDENTITY`·`AKAN_NATIVE_IOS_PROFILE`·`AKAN_NATIVE_IOS_DISTRIBUTION=ad-hoc`으로 좁힌다.

- 버전: `config.app.version`이 versionName·CFBundleShortVersionString이고, `config.app.build`가 versionCode·CFBundleVersion이다.
- 업로드(TestFlight, Play)는 별도 함수 `upload()`로 나중에 붙인다(O1-3, O1-6).

### publishUpdate와 updateKeygen — 업데이트 릴리스 (UP-1, UP-2)

```ts
const { publicKey, keyPath, created } = updateKeygen({ config });
const { dir, bundle, channel, files, size, build } = await publishUpdate({ appDir, config, platform: "windows", channel: "pilot", out });
```
- `updateKeygen`: 앱 id의 Ed25519 키를 한 번 만들고 그 뒤로는 읽는다(`AKAN_NATIVE_UPDATE_KEY`, 없으면 `~/.akan/native/keys/<app id>.update.key`). `publicKey`는 설정의 `updates.publicKey`로 간다.
- `publishUpdate`: release 빌드 뒤 `akan-native update publish`와 같은 일을 한다(`lib/publish.ts`). `out`(기본 `<appDir>/.akan/native/updates`) 아래 데스크톱은 `<os>-<arch>/`, 폰은 `<platform>/`에 `<channel>.json`, `.sig`, 파일을 쓴다. `channel` 기본은 설정의 `updates.channel`. 설정에 `updates`가 없거나, `channel`이 설정 `updates.channel`의 규칙(소문자·숫자·`.`·`_`·`-`, `packUpdate`의 파일과 겹치는 `bundle`·`manifest.template`·`compat`은 안 됨)을 어기거나, 이 PC에 서명 키가 없거나 `updates.publicKey`의 키가 아니면 빌드 전에 `CONFIG_INVALID`. 매니페스트는 서명한 뒤 `.sig`와 함께 쓴다. `sequence`는 `max(그 채널에 이미 있는 매니페스트 + 1, 지금)`이다(시계가 늦으면 경고). 데스크톱 매니페스트는 앱이 서버를 싣는지(`server`)를 적는다. 설정 `desktop.server`가 그 채널의 직전 릴리스와 다르면 빌드 전에 `CONFIG_INVALID`로 거부하고, 빌드된 앱으로 한 번 더 확인한다. 출력 폴더에는 올릴 파일만 남는다.
- `checkPublishUpdate`: `publishUpdate`가 빌드 전에 거부하는 것(`updates` 없음, 규칙에 맞지 않는 `channel`, 없거나 다른 서명 키, 그 채널의 직전 릴리스와 다른 서버 유무)을 빌드 없이 확인한다. `server`를 주지 않으면 설정의 `desktop.server`로 판단한다. akan처럼 `publishUpdate` 전에 자기 빌드가 긴 쪽이 모든 타깃에 먼저 부른다.
- akanjs: `akan update-keygen`, `akan publish-update`(devkit `NativeApp.updateKeygen`·`assertPublishable`·`publishUpdate`).

### packUpdate와 compareBundles — 서명하지 않은 웹 번들 업데이트 (UP-2, UP-3)

```ts
const { manifest, out } = await packUpdate({ appDir, config, platform: "android", out: "/tmp/pack" });
const { compatible, problems } = compareBundles("<스토어 빌드의 bundle.json>", `${out}/bundle.json`);
```
- `packUpdate`: 키 없이 폰 웹 번들을 release처럼 준비해 `out` 아래 `files/<sha256>`, `bundle.json`, `manifest.template.json`을 쓴다. 템플릿은 `channel`(`""`), `sequence`(`0`), `bundle`(`""`)만 비운 매니페스트다. 네이티브 앱은 빌드하지 않는다. 서명하는 쪽의 계약은 `architecture.md`의 "서명 분리"에 있다.
- `compareBundles`: 스토어 빌드의 `bundle.json`과 pack의 `bundle.json`을 비교해, 그 번들이 스토어 바이너리에서 돌 수 없으면 `problems`를 준다(새 바이너리가 필요하다).
- akanjs: `akan pack-update [--against]`(devkit `NativeApp.packUpdate`·`NativeApp.compareBundles`).

### doctor와 devices

```ts
function doctor(o?: { platforms?: TaskOptions["platform"][]; fix?: boolean; log?: (e: LogEvent) => void; signal?: AbortSignal }): Promise<DoctorReport>;
interface DoctorReport { ok: boolean; checks: DoctorCheck[] }
interface DoctorCheck {
  group: string;       // "Common", "iOS", "Android", "macOS desktop", …
  name: string;        // "Xcode", "kotlinc", "SDK licenses", …
  ok: boolean;
  warn: boolean;       // 동작하지만 고정 버전이 아니거나 선택 요소가 없다. 실패가 아니다
  detail: string;      // 찾은 것(버전, 경로) 또는 무엇이 문제인지
  hint?: string;       // 할 일
  fixable: boolean;    // fix: true가 고칠 수 있다
}

function devices(o: { platform: "ios" | "android"; log?; signal? }): Promise<Device[]>;
interface Device {
  platform: "ios" | "android";
  id: string;          // 시뮬레이터 UDID, iPhone의 devicectl id, adb serial, 꺼진 AVD는 그 이름
  name: string;
  kind: "simulator" | "emulator" | "device";
  os: string;          // iOS "26.5", Android "Android 17 (API 37)", 꺼진 AVD "API 37"
  state: "booted" | "shutdown" | "connected" | "unavailable" | "unpaired" | "unauthorized" | "offline";
}
type DeviceSelector = string | { id: string } | { name: string } | { kind: Device["kind"] };
```

- `platforms` 기본값은 이 컴퓨터가 빌드할 수 있는 것이다. `fix: true`는 akan-native가 고정해 관리하는 툴체인(kotlinc, bundletool, 고정 Rust, 라이선스를 수락한 뒤의 SDK 패키지)만 설치하고 다시 검사한다. JDK는 명시적일 때만이고(CLI `toolchain install jdk`), Android SDK 라이선스는 절대 대신 수락하지 않는다. fix 명령의 출력은 `tool` 로그로 온다.
- `devices()`는 실행 중·연결된 것을 먼저 준다. 페어링하지 않은 iPhone(`unpaired`)과 USB 디버깅을 허락하지 않은 Android(`unauthorized`)도 목록에 나온다.
- 선택자: 문자열은 이름이나 id 그대로다. `{ id }`와 `{ name }`은 하나와 맞아야 한다. `{ kind }`는 그 종류 중 실행 중인 것, 없으면 켤 수 있는 것을 고른다. 쓸 수 없는 상태의 기기(unpaired, unavailable, unauthorized, offline)를 고르면 그 이유와 함께 `DEVICE_FAILED`다. 문자열이 어느 시뮬레이터와도 맞지 않으면(예: 페어링하지 않은 iPhone 이름) 조용히 다른 시뮬레이터로 넘어가지 않고 `DEVICE_FAILED`다.
- `RunningApp.device`와 `DevSession.device`는 실제로 쓴 기기다. `DevSession.reload()`는 빌드하지 않고 설치된 앱을 다시 띄운다(새 프로세스가 첫 페이지를 다시 연다).

## 4. 오류

```ts
class AkanNativeError extends Error {
  name: "AkanNativeError";
  code:
    | "CONFIG_INVALID"      // problems에 목록
    | "TOOLCHAIN_MISSING"   // hint에 설치 방법
    | "WEB_INPUT_INVALID"   // web.dir/index.html 없음, __akan_native 폴더 등
    | "WEB_BUILD_FAILED"
    | "NATIVE_BUILD_FAILED" // swiftc, kotlinc, aapt2, cargo, d8, R8
    | "SIGNING_FAILED"      // 프로파일·키스토어·entitlements 불일치
    | "DEVICE_FAILED"       // 설치, 실행, 기기를 찾지 못함
    | "CANCELLED"
    | "INTERNAL";
  problems?: string[];
  hint?: string;
  /** 실패한 도구의 마지막 출력 줄들 */
  logTail?: string[];
  /** 위 세 값과 원인 오류(cause) */
  details: { problems?: string[]; hint?: string; logTail?: string[]; cause?: unknown };
}
```

- CLI는 `AkanNativeError`를 받아 지금처럼 메시지를 보여 주고 종료 코드로 바꾼다.
- 경고는 오류가 아니다. `BuildResult.warnings`와 `warn` 로그 이벤트로 받는다.

## 5. 로그

```ts
interface LogEvent {
  level: "step" | "info" | "ok" | "warn" | "error" | "tool";
  message: string;
  /** "tool"일 때 어느 도구의 출력인지: "web-build", "swiftc", "kotlinc", "cargo", "aapt2", "d8" … */
  tool?: string;
  platform?: TaskOptions["platform"];
  time: number;
}
```

- 서명 비밀번호, 키 내용, env 값은 로그에 넣지 않는다.
- CLI는 이 이벤트를 지금의 `›`, `✓`, `!` 줄로 찍는다.

## 6. 동시 실행과 상태

- 프로세스 전역 상태(`process.cwd()`, `process.env` 쓰기, 전역 로거)를 쓰지 않는다. 필요한 값은 옵션으로 받는다.
- 같은 `outDir`에 두 작업이 동시에 들어오면 두 번째는 첫 번째가 끝날 때까지 기다린다(outDir 잠금).
- 공유 캐시(`~/.akan/native/toolchains`, Cargo 대상 폴더, 컴파일 캐시)는 여러 작업이 같이 써도 안전해야 한다. 설치는 잠금 아래에서 한 번만 한다.
- 에뮬레이터와 시뮬레이터 부팅은 기기마다 한 번이다. 같은 기기에 두 앱을 동시에 설치하는 것은 허용하지만 실행 순서는 보장하지 않는다.

## 7. 이 트랙에서 설정(AkanNativeConfig)에 더한 것

API는 설정을 그대로 받으므로, 새 기능은 설정 필드로 들어온다. 이름은 코드(`packages/cli/src/config.ts`)와 같다. 모르는 키는 `validateConfig`와 빌드 모두 `CONFIG_INVALID`의 `problems`로 알린다. 예: `unknown key deeplinks (did you mean deepLinks?)`. 틀린 이름이 조용히 빠지지 않게 하기 위해서다(알려진 키 목록은 `lib/configkeys.ts`).

| 필드 | 작업 | 내용 |
|---|---|---|
| `native.macos.entitlements` | CLI-9 | 팀 서명한 macOS 실행 파일의 entitlements. hardened runtime의 것과 사용 설명이 요구하는 것 위에 합친다(§3 "macOS 배포 서명") |
| `native.ios.infoPlist`, `native.ios.entitlements` | O5-1 | 앱 수준 병합. 배열은 합치고 dict는 깊게 병합하며, 플러그인이 넣은 스칼라와 다르면 빌드 오류. 셸이 가진 키(번들 id, 실행 파일, 버전, 최소 OS)는 바꿀 수 없다 |
| `native.android.manifest`, `native.android.application`, `native.android.activity` | O5-1 | XML 조각 목록. 차례로 `<manifest>`, `<application>`, 앱 activity 안에 들어간다. `${applicationId}`는 바뀐다 |
| `native.resources: [{ from, to }]` | O5-3 | 논리 위치(`ios/…`, `android/res/<type>/<file>`, `android/assets/…`)로 파일 복사 |
| `deepLinks.schemes`, `deepLinks.domains: (string \| { host, pathPrefixes? })[]` | O5-2 | 스킴은 CFBundleURLTypes와 VIEW intent-filter. 도메인은 iOS associated-domains(`applinks:<host>`)와 Android 검증 app link(호스트마다 autoVerify intent-filter). 들어온 링크는 `app.urlOpen` |
| `icon`, `splash` (최상위) | CLI-8, SH-6 | 아이콘 PNG 하나에서 플랫폼별 아이콘을 만든다. 스플래시 색·이미지·autoHide·timeout |
| `android.debugAppIdSuffix` | O1-5 | 예 ".debug". debug 빌드의 applicationId에 붙는다 |
| `privacy` (앱이 더하는 required-reason API) | O1-4 | 셸과 플러그인 것은 akan-native가 합산해 PrivacyInfo.xcprivacy를 만든다 |
| `keyboard.resize: "resize" \| "none"` | O6-1 | 첫 프레임부터의 키보드 모드(기본 "resize"). 두 셸이 shell.json에서 읽으므로, JS가 돌기 전에도 그 모드다. 실행 중에는 `keyboard.setResizeMode()`로 바꾼다. Android 매니페스트는 `adjustResize` 그대로다: 셸이 IME inset만큼 직접 줄이며, API 29는 `adjustResize`일 때만 IME inset을 준다 |
| `push.android: { channel?: { id, name, importance?, description? }, smallIcon?, color? }` | N13 | Firebase가 앱이 앞에 없을 때 직접 띄우는 알림의 기본 채널·상태 표시줄 아이콘(흰색·투명 PNG)·색. 빌드가 매니페스트 meta-data와 리소스로 바꾸고, 플러그인이 시작할 때 채널을 만든다(사용자가 바꾼 중요도는 유지). 앞에서 띄우는 플러그인 자신의 알림도 같은 채널·아이콘·색을 쓴다. push 플러그인이 없으면 경고 |
| `ios.hideFormAccessoryBar` | N18 | 폼 필드 키보드 위의 이전·다음·완료 막대를 숨긴다. 기본 false |
| `desktop.recovery: "errorPage" \| "reload"` | 전광판(F3) | 페이지 프로세스가 끝났을 때(크래시, 멈춤, 메모리 부족). "errorPage"(기본)는 한 번 다시 불러오고 1분 안에 또 끝나면 오류 화면, WebView2 브라우저 프로세스가 끝나면 앱 종료. "reload"는 매번 다시 불러오되 연달아 끝날수록 오래 기다리고(1초부터 두 배씩, 최대 1분), 브라우저 프로세스가 끝나면 호스트가 앱을 다시 띄운다(못 하면 셸이 10초 뒤 종료). 지키는 사람이 없는 앱(키오스크, 전광판)용 |
| `desktop.window: { fullscreen?, skipTaskbar? }` | 전광판(F6) | 첫 프레임부터의 주 창: 테두리 없는 전체화면(창이 열리는 디스플레이), 작업 표시줄 버튼 없음(Windows·Linux). 플러그인의 launch 단계(`ctx.launch.setWindow`)가 다르게 정할 수 있다 |
| `desktop.screenCapture: "picker" \| "auto"` | 전광판(F5) | Windows: "auto"면 페이지의 `getDisplayMedia()`가 선택 창도 사용자 동작도 없이 첫 화면으로 답한다. 지키는 사람이 없는 화면의 원격 지원용. Chromium의 미디어 자동화 테스트용 스위치(`--use-fake-ui-for-media-stream`)이고 모든 미디어 요청에 쓰이므로, 카메라·마이크를 요청하지 않는 앱에만 켠다. 기본 "picker". macOS·Linux는 무시한다 |
| `android.autoplay` | 전광판(F6) | 소리 있는 미디어를 터치 없이 재생한다(WebView `mediaPlaybackRequiresUserGesture` 끔). iOS·데스크톱은 원래 그렇다. 기본 false |
| `desktop.server: { dir, entry, env? }` | akanjs `native.desktop.server`(타깃마다 `native.targets.<t>.desktop.server`) | 데스크톱 앱이 창 옆에서 띄우는 서버. 빌드가 `dir`을 `resources/server/`로 복사하고 `server.json`(entry, env)과 빈 `server.bunfig.toml`을 쓴다. macOS 빌드는 `resources/server`와 `resources/bin`의 Mach-O 파일을 이름과 상관없이 모두 서명한다. 플러그인 호스트가 실행 파일 자신을 `BUN_BE_BUN=1`로 다시 띄워 `entry`를 돌리고(`--no-env-file`, `--no-install`, `--config`, `--use-system-ca`), 127.0.0.1의 빈 포트(지난 세션의 포트가 비어 있으면 그것)를 세션 동안 고정해 페이지 env `PUBLIC_AKAN_SERVER_URL`로 넘긴다. launcher가 정하는 키(`PORT`, `JWT_SECRET`, `AKAN_LISTEN_HOST`, `AKAN_ALLOWED_HOSTS`, `AKAN_SQLITE_DIR`, `AKAN_WORKSPACE_ROOT`, `AKAN_RUNTIME_DIR`, `BUN_BE_BUN`, `BUN_RUNTIME_TRANSPILER_CACHE_PATH`)는 대소문자와 상관없이 `env`에 둘 수 없다. Windows는 변수 이름의 대소문자를 가리지 않으므로 대소문자만 다른 키 둘도, `PATH`가 아닌 `Path`도 거부한다. `env`의 키는 이름이 같은(대소문자 무시) 시스템 변수를 대신한다. 데이터는 `<app local data>/server`(Windows `%LOCALAPPDATA%\<id>\server`, debug 빌드는 `server-debug`). single-instance 플러그인이 없으면 경고 |
| `desktop.server`의 네이티브 애드온 | CLI-9 | 빌드가 `dir`의 `.node`를 패키지별로 읽는다(`lib/addons.ts`, Mach-O·ELF·PE 헤더를 직접 읽어 어느 OS에서든 같다). 대상 OS·CPU용 바이너리가 없는 패키지, 시스템 밖 절대 경로의 라이브러리를 링크하거나 그런 rpath·runpath를 가진 바이너리(`/opt/ros/…`, Homebrew), `binding.gyp`만 있고 컴파일된 바이너리가 없는 패키지(설치 스크립트가 돌지 않음: akanjs `trustedDependencies`)는 목록으로 알리고 빌드를 멈춘다. 이 컴퓨터에서 node-gyp로 컴파일된 애드온은 경고만 한다 |
| `desktop.bin` | akanjs `bin` | 앱이 싣는 실행 파일 폴더. `resources/bin/`으로 복사되고, 플러그인 호스트가 시작할 때 `process.env.PATH` 맨 앞에 붙인다. 서버는 그 환경으로 뜨므로 이름으로 찾고, 플러그인은 `ctx.binDir`로 찾는다. Bun의 `spawn`·`which`는 `env` 없이 부르면 앱이 시작할 때의 환경을 읽으므로 이름으로 실행하려면 `env: process.env`를 넘긴다(Bun 1.4.2에서 확인) |

서명 정보는 설정에 넣지 않고 `release()`와 iPhone용 `run`·`dev`의 옵션으로만 받는다(파일로 남지 않게).

## 8. 정해야 할 것

1. **패키지 위치(O2-2).** 지금은 `@akanjs/native/api`로 둔다. akanjs 레포로 옮길 때 이름이 바뀔 수 있다. 네이티브 소스(`native/`, 플러그인의 ios·android 폴더)는 npm 패키지에 같이 들어간다.
2. **툴체인 위치.** 기본 `~/.akan/native/toolchains`. akanjs가 자기 폴더를 쓰고 싶으면 `toolchainDir` 옵션을 더한다.
3. **iOS 검증 데이터(O6-3)와 푸시 토큰 형식(O6-2).** 이 API가 아니라 플러그인 계약이다. akanjs 서버와 따로 합의한다.
4. **런타임.** akan-native는 Bun 전용이다(bun:ffi, Bun.spawn). akanjs devkit도 Bun에서 돈다(CSR 빌드가 `Bun.build`, 서버가 `Bun.serve`; support-omni 보고). 그래서 프로세스 안에서 바로 부르고, Node용 층은 만들지 않는다.
