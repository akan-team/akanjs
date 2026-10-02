# akan-native 요구사항

> React SPA 빌드 결과(단일 HTML + `public/`)를 받아 **Web · macOS · iOS · Android(이후 Windows · Linux)** 앱으로 만드는 Bun 기반 프레임워크.
> 최종 갱신: 2026-09-25 · 근거 자료: `../../notes/` (프레임워크 10종 구조 분석), [research/](research/) (플랫폼별 사전 검증), [plugins.md](plugins.md) (플러그인·네이티브 기능 목록)

## 0. 원칙

1. **처음부터 직접 구현한다.** 기존 프레임워크(Tauri, Capacitor, Electrobun 등)는 참고 자료로만 쓴다.
2. **외부 의존은 저수준 플랫폼 계층까지만 허용한다.**
   - 허용: OS SDK·프레임워크, 플랫폼 툴체인(Xcode·swiftc, JDK, kotlinc, Android SDK build-tools), Bun, React, **TAO·WRY**(데스크톱 창·WebView), Windows WebView2 SDK, `kotlin-stdlib`(언어 런타임으로 간주), 타입 검사 도구(`typescript`, `@types/*`, devDependency만)
   - 불허: 상위 프레임워크와 편의 라이브러리. 예: Tauri 본체, Capacitor, AndroidX, `kotlinx.*`, Gradle, CocoaPods·SPM 의존, xcodegen, Vite
   - 경계가 애매하면 쓰기 전에 결정을 받는다.
3. **최신 OS만 지원한다.** 레거시 폴백 코드는 만들지 않는다.

## 1. 확정된 결정

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| D1 | 데스크톱 런타임 | 앱에 **Bun 포함**. main 스레드는 네이티브 이벤트 루프, 앱·플러그인 JS는 Bun Worker | 데스크톱 플러그인을 TS 하나로 3개 OS에 대응 (`notes/electrobun-v1.md`) |
| D2 | 데스크톱 네이티브 계층 | **TAO + WRY**를 Rust cdylib(C ABI)로 감싸 `bun:ffi`로 호출 | `notes/tao.md §6`, `notes/wry.md §6` |
| D3 | 모바일 네이티브 계층 | TAO·WRY를 쓰지 않고 **직접 작성**. iOS는 Swift, Android는 Kotlin | WRY Android가 AndroidX·Gradle을 요구하고, 모바일에는 Bun이 없어 Rust가 중간 계층만 늘림 |
| D4 | Android 언어·빌드 | **Kotlin**(stdlib만). Gradle 없이 **SDK 도구로 직접 빌드** | 원칙 2 |
| D5 | 네이티브 프로젝트 | **빌드할 때마다 생성**. 생성물은 편집하지 않는다 | 사용자 편집 파일과 재생성 파일 분리 (`notes/README.md §2.6`) |
| D6 | 입력 형식 | **단일 HTML(JS 인라인) + `public/` 폴더** | |
| D7 | 서드파티 플러그인 | **내부 규격(akan-native plugin spec)**을 지킨 것만 받는다 | |
| D8 | 최소 OS | iOS 26 · macOS 26 · Android 15 (API 35) · Windows 11 · Linux GTK3 + WebKitGTK 4.1(2.40+) | WRY 기준 (`wry/Cargo.toml:54`). Linux 2.40은 IPC POST 본문(wry `linux-body`) 때문 |
| D9 | MVP 플랫폼 순서 | Web → macOS → iOS 시뮬레이터 → Android 에뮬레이터 | 개발 머신이 macOS |
| D10 | MVP 테스트 환경 | iOS 26.5 시뮬레이터(iPhone 17 Pro), Android 에뮬레이터(`Pixel_10` AVD, Android 17 / API 37, WebView 153). 실기기와 Apple 개발자 서명은 이후 | |
| D11 | 이름 | **akan-native** (CLI 명령 `akan-native`) | |
| D12 | Windows·Linux (MVP 이후, 2026-09-25) | wry/tao가 쓰는 OS 바인딩 crate만 feature를 더해 쓴다: Windows `windows`(windows-rs)·`webview2-com`, Linux gtk-rs(`gtk`·`gio`·`glib`)·`webkit2gtk`·`soup3`·`javascriptcore-rs`. D-Bus는 GDBus로 호출한다. Windows를 먼저 하고 Linux를 뒤따른다. 개발 중 테스트는 Mac의 VM(Windows 11 ARM)과 Docker(Ubuntu ARM64)에서, 최종 확인은 실제 x64 PC에서 한다 | macOS의 objc2와 같은 성격(얇은 OS API 바인딩). [testing-windows-linux.md](testing-windows-linux.md) |

## 2. 기능 요구사항

`MVP` = 첫 샘플 앱까지 필요 · `이후` = MVP 다음 · `확인` = 기술 검증이 먼저 필요

### 2.1 입력 (IN)

| ID | 요구사항 | 단계 |
|---|---|---|
| IN-1 | 입력은 SPA 번들러와 무관하게 `index.html`(JS 인라인) + `public/` 폴더면 된다 | MVP |
| IN-2 | `index.html`에 외부 `<script src>`가 있으면 경고한다 (단일 파일 원칙) | MVP |
| IN-3 | `akan-native build`가 `index.html`의 `<head>` 맨 앞에 `<script src="/__akan_native/init.js"></script>`를 삽입한다 (§2.3, 아키텍처 §3.1) | MVP |
| IN-4 | SPA 라우팅: 파일이 없는 경로는 `index.html`로 폴백한다 | MVP |
| IN-5 | 큰 에셋(동영상 등)은 `public/`에서 Range(206) 응답으로 서빙한다 | 이후 · 구현됨(macOS·iOS·Android의 정적 파일과 `/__akan_native/file`이 단일 범위에 206, 범위 밖이면 416. 자가 테스트에 Range 검사) |

### 2.2 플러그인과 hook (PL)

| ID | 요구사항 | 단계 |
|---|---|---|
| PL-1 | hook은 얇은 React 래퍼이고, 실제 API는 React와 무관한 Promise API다 | MVP |
| PL-2 | 한 플러그인 = JS API + hook + 플랫폼별 구현(web TS · desktop TS · iOS Swift · Android Kotlin) + manifest(`native-plugin.json`) | MVP |
| PL-3 | 플러그인은 앱 설정에 **명시적으로 등록**한다. 자동 탐색은 없다 | MVP |
| PL-4 | 플랫폼·메서드별 지원 여부를 알 수 있다 (`isSupported`). 미지원 호출은 `UNSUPPORTED` 에러로 reject한다 | MVP |
| PL-5 | 권한 흐름: 확인 → 요청 → 거부/영구 거부. manifest에 선언한 권한으로 빌드가 Info.plist와 AndroidManifest 항목을 생성한다 | MVP |
| PL-6 | 이벤트 구독: hook이 mount될 때 구독하고 unmount될 때 해제한다. StrictMode 이중 mount에도 안전해야 한다 | MVP |
| PL-7 | 큰 결과(사진 등)는 바이트 대신 **파일 URL**(`/__akan_native/file/<id>`)로 돌려준다 | MVP |
| PL-8 | 기본 hook 4개도 같은 플러그인 규격으로 구현한다 | MVP |
| PL-9 | 목(mock) 브리지로 브라우저·`bun test`에서 hook을 테스트할 수 있다 | MVP |
| PL-10 | TS 스펙에서 Swift/Kotlin 스텁과 타입을 생성한다 | 이후 · 구현됨(`definePlugin<Api, Events>` 인터페이스를 CLI 자체 파서로 읽어 인자·결과 타입, `<Plugin>PluginSpec` 프로토콜, 이벤트 헬퍼 생성. manifest `"codegen": true`면 빌드마다. `akan-native plugin check/codegen/stub`. preferences·haptics·device 적용. plugin-authoring.md §5) |
| PL-11 | 플러그인별 권한 ACL (Tauri capability 방식) | 이후 · 구현됨(앱 설정 `capabilities`, manifest에서 나온 권한 이름, 창·플랫폼 지정, deny 우선, 플러그인이 강제하는 스코프. 호스트가 검사하고 페이지는 web 구현에 같은 규칙을 적용. architecture.md "권한 ACL". 2026-09-26: capabilities 없는 앱의 기본값을 보수적으로(manifest `defaultScope`), URL 스코프는 스킴·호스트·포트·경로를 나눠 비교) |

**MVP hook 4개**

| hook | Web | macOS | iOS | Android |
|---|---|---|---|---|
| `useAppState` (active/inactive/background) | `visibilitychange` | 창 포커스·최소화 (TAO 이벤트) | UIScene 상태 | Activity 수명주기 |
| `usePreferences` (key-value) | `localStorage` | 앱 데이터 폴더의 JSON (Bun) | `UserDefaults` | `SharedPreferences` |
| `useKeyboard` (소프트 키보드 높이·표시) | `visualViewport` | 미지원 | 키보드 notification | `WindowInsets` IME |
| `useCamera` (사진 촬영 → 파일 URL) | `<input type=file capture>` | WebView `getUserMedia` + WRY 권한 핸들러 | `UIImagePickerController` | 카메라 intent + 파일 |

MVP 이후의 플러그인·셸 기능 목록과 단계(P0~P3), 결정 필요 항목은 [plugins.md](plugins.md)에 있다.

### 2.3 env (ENV)

| ID | 요구사항 | 단계 |
|---|---|---|
| ENV-1 | 값의 출처와 우선순위(낮음 → 높음): 앱 설정 `env.defaults` → `.env`, `.env.<mode>` (akan-native 빌드 시점) → 번들 안 `env.runtime.json` → (데스크톱만) 프로세스 환경변수 `AKAN_NATIVE_PUBLIC_*` | MVP |
| ENV-2 | `PUBLIC_` 접두어가 붙은 키만 앱에 전달한다. 그 외 키는 버리고 경고한다 (비밀값 차단) | MVP |
| ENV-3 | React가 렌더하기 **전에 동기로** 읽을 수 있다. `/__akan_native/init.js`가 `window.__AKAN_NATIVE__.env`를 채운다 | MVP |
| ENV-4 | SPA를 다시 빌드하지 않고 env를 바꿀 수 있다. Web은 배포된 `__akan_native/init.js`를 교체하고, 앱은 `env.runtime.json`만 바꿔 다시 패키징한다 | MVP |
| ENV-5 | 앱 ID, 이름, 버전 같은 네이티브 설정 값은 앱 설정에서 네이티브 프로젝트 생성으로 흘러간다 | MVP |
| ENV-6 | 플랫폼별로 값을 덮어쓸 수 있다 (`env.platforms.ios` 등) | 이후 · 구현됨(설정 `env.platforms.<platform>`, 파일 `.env.<platform>`·`.env.<mode>.<platform>`. 공통 층 전체보다 우선. architecture.md §7) |
| ENV-7 | `env.d.ts` 타입을 생성한다 | 이후 · 구현됨(빌드마다 `akan-native.config.ts` 옆에 `akan-native-env.d.ts`: 모든 모드·플랫폼에 있는 키는 `string`, 일부에만 있으면 optional. 키 이름만 쓴다. tsconfig.json이 있을 때만) |

### 2.4 앱 셸 (SH)

| ID | 요구사항 | 단계 |
|---|---|---|
| SH-1 | 앱 상태 이벤트(foreground/background/resume) | MVP |
| SH-2 | Safe area 값을 CSS에 전달하고, 시스템 다크 모드를 따라간다 | MVP |
| SH-3 | 흰 화면 방지: WebView 배경색을 설정값으로 먼저 칠한다 | MVP |
| SH-4 | 외부 오리진 링크는 시스템 브라우저로 열고, WebView는 앱 오리진 밖으로 이동하지 않는다 | MVP · 데스크톱은 2026-09-26부터 http·https·mailto·tel만 OS로 넘기고, iframe은 다른 출처를 로드하되 아무것도 열지 않는다(architecture.md "데스크톱 내비게이션") |
| SH-5 | Android 뒤로가기 버튼을 `history.back()`에 연결한다 | 이후 · 구현됨(plugins.md S3: 히스토리가 있으면 `goBack()`, `app`의 `backButton` 리스너가 있으면 페이지에 넘김, 둘 다 없으면 시스템 predictive back 유지) |
| SH-6 | 스플래시 화면, 딥링크, 데스크톱 다중 창·사용자 메뉴·트레이 | 이후 · 구현됨: 스플래시(iOS·Android, 설정 `splash`), 딥링크(custom scheme), 데스크톱 다중 창(macOS, `createWindow`), 사용자 메뉴·트레이(macOS, `@akanjs/native/plugins/menu`·`@akanjs/native/plugins/tray`). universal·app links는 서명이 필요해 이후 |
| SH-7 | macOS 기본 앱 메뉴(App·Edit·Window). 없으면 WebView에서 복사·붙여넣기·전체 선택·되돌리기·Cmd+Q가 동작하지 않는다 (plugins.md D1) | MVP |

### 2.5 WebView·네트워크 (WV)

| ID | 요구사항 | 단계 |
|---|---|---|
| WV-1 | 고정 오리진으로 서빙한다. macOS·iOS·Linux는 `app://localhost`, Android·Windows는 `https://app.localhost` | MVP |
| WV-2 | 디버깅: Safari Web Inspector(`isInspectable`), `chrome://inspect`를 dev 빌드에서 켠다 | MVP |
| WV-3 | 네이티브 로그와 JS `console`을 CLI 출력 한 곳에서 본다 | MVP |
| WV-4 | API 서버 호출 가이드: 서버 CORS에 앱 오리진 두 형태를 허용하도록 문서화한다 | MVP |
| WV-5 | 네이티브 HTTP 프록시 (CORS 우회) | 이후 |
| WV-6 | 데스크톱 웹뷰의 브라우저 기능을 앱에서 뺀다(사용자 결정 2026-09-26). 릴리스 빌드의 오른쪽 클릭 메뉴는 텍스트 편집(잘라내기·복사·붙여넣기·모두 선택·맞춤법)만 남기고 브라우저 항목(뒤로·앞으로·새로 고침·저장·인쇄·공유·검사·링크나 이미지 열기와 저장)을 뺀다. 남는 항목이 없으면 메뉴를 띄우지 않는다. dev 빌드는 엔진 메뉴 전체와 검사를 둔다. WebView2의 브라우저 단축키(Ctrl+R·F5, Ctrl+P, Ctrl+F, 확대, F12)는 모든 빌드에서 끈다 (`native/desktop/src/page_menu.rs`) | 완료 |

### 2.6 빌드·CLI (CLI)

| ID | 요구사항 | 단계 |
|---|---|---|
| CLI-1 | `akan-native doctor`: 필요한 툴체인을 점검하고 해결 방법을 안내한다 | MVP |
| CLI-2 | `akan-native build <web\|macos\|ios\|android>` | MVP · Windows·Linux 추가(`akan-native build windows\|linux`, 그 OS에서만. architecture.md §3.6) |
| CLI-3 | `akan-native run <platform>`: 빌드한 뒤 시뮬레이터·에뮬레이터·데스크톱에서 실행한다 | MVP |
| CLI-4 | `akan-native dev <platform>`: 바뀔 때마다 다시 빌드하고 반영(live reload, 네이티브는 재설치·재시작). 외부 dev server에 붙이는 상태 유지 HMR은 이후 | MVP (live reload) · 이후 (HMR) · HMR 구현됨(`akan-native dev <platform> --hmr`: Bun dev server + 게이트웨이, 호스트가 오리진을 유지한 채 프록시. 네 플랫폼에서 상태 유지 확인. architecture.md M5) |
| CLI-11 | `akan-native test <platform\|all>`: 앱의 자가 테스트를 플랫폼마다 실행하고 결과를 모은다 (NF-3) | MVP |
| CLI-5 | 앱 설정 파일은 `akan-native.config.ts` 하나다 (`defineConfig`, 타입 지원) | MVP |
| CLI-6 | 생성물은 `.akan/native/build/<platform>/`에 두고 git에서 제외한다 | MVP |
| CLI-7 | MVP 서명: macOS ad-hoc, iOS 시뮬레이터 ad-hoc, Android debug 키(`~/.akan/native/debug.keystore`를 자동 생성) | MVP |
| CLI-8 | 앱 아이콘을 원본 이미지 한 장에서 생성한다 | 이후 · 구현됨(설정 `icon`, macOS·iOS·Android. PNG 처리는 CLI 자체 코드) |
| CLI-9 | 배포용 서명: iOS provisioning, macOS 공증, Android release 키, Windows 서명 | 진행 중 · macOS 구현(`packages/cli/src/lib/macossigning.ts`: Developer ID, hardened runtime, 공증·staple, dmg), Windows 구현(`packages/cli/src/lib/windowssigning.ts`: Authenticode, setup.exe·제거 프로그램 서명), Linux AppImage(`packages/cli/src/platforms/linux-appimage.ts`), 같은 OS 안의 대상 CPU(`--arch`, Windows·Linux. macOS 앱은 Apple silicon만) |
| CLI-10 | 툴체인 버전 고정과 자동 설치 (kotlinc 등) | 이후 · 구현됨(`packages/cli/src/lib/toolchains.ts`에 고정 버전·URL·SHA-256. kotlinc 2.4.20은 `~/.akan/native/toolchains`에 자동 설치(`AKAN_NATIVE_NO_AUTO_INSTALL=1`로 끔), JDK는 요청 시만(`akan-native toolchain install jdk`), Android SDK는 사용자의 sdkmanager로만(라이선스는 사용자가 직접 수락), Rust는 `native/desktop/rust-toolchain.toml`, Bun은 패키지의 `engines.bun`. `akan-native doctor --fix`, `akan-native toolchain list/install`) |

### 2.7 보안 (SEC)

| ID | 요구사항 | 단계 |
|---|---|---|
| SEC-1 | 브리지는 앱 오리진의 메인 프레임에서만 동작한다. iOS는 `frameInfo`(오리진 + main frame)를, 데스크톱은 `Origin`/`Referer`를 확인한다. Android는 `postWebMessage(targetOrigin)`로 앱 오리진 메인 프레임에만 MessagePort를 준다(JavascriptInterface는 iframe에도 주입되므로 쓰지 않는다) | MVP |
| SEC-2 | 등록되지 않은 플러그인이나 메서드 호출은 `NOT_FOUND`로 거절한다 | MVP |
| SEC-3 | 브리지 메시지 형식을 검증한다 (버전, 필수 필드) | MVP |
| SEC-4 | CSP 해시 생성, iframe 브리지 차단 강화 | 이후 · 구현됨(설정 `security.csp`: `"strict"` 프리셋·문자열·지시문 맵, 빌드가 인라인 스크립트·스타일 sha256을 넣은 `<meta>`. Android hello에 문서별 nonce + claim, 런타임은 하위 프레임에서 UNSUPPORTED. 네 플랫폼 셀프테스트로 확인. architecture.md "보안: CSP와 프레임") |

### 2.8 배포·업데이트 (UP) — 이후 (UP-1·UP-2·UP-3 구현됨)

- UP-1 데스크톱 자동 업데이트 (bsdiff 패치 + 롤백) · 구현됨:
  - macOS `.app` 교체와 재실행, trial 실행 후 확정 또는 `.previous`로 롤백
  - 패치는 bsdiff 대신 블록 매칭 delta. 이유는 architecture.md "업데이트"
  - Ed25519로 매니페스트 전체를 서명
  - `akan-native update keygen/publish/serve`, `@akanjs/native/plugins/updates`
- UP-2 모바일 OTA (HTML 교체: 서명 검증, 롤백, 스토어 정책 준수) · 구현됨:
  - iOS·Android 웹 번들을 내용 주소 파일로 받고 파일마다 해시 확인
  - 같은 `nativeApi`에서만 실행, trial → `notifyReady()` 또는 롤백
  - 바이너리보다 오래된 번들은 버림
  - 네이티브 코드는 바꾸지 않으므로 스토어 정책(해석되는 코드만 교체)을 따른다
- UP-3 웹 번들과 네이티브 셸의 버전 호환 규칙 (`akan-native` 런타임 버전을 `init.js`로 노출) · 구현됨:
  - 네이티브 API 지문 `nativeApi`: 브리지 프로토콜, 런타임 minor, 플러그인 선언과 네이티브 플러그인 버전, capabilities, 권한, 딥링크 스킴의 해시
  - boot.json과 `@akanjs/native/core`의 `nativeApi`로 노출하고, 빌드마다 `bundle.json`에 입력과 함께 기록
  - `akan-native compat <platform> --against <bundle.json>`이 웹만 업데이트해도 되는지와 그 이유를 알려 준다
  - architecture.md "버전 호환 규칙"

## 3. 비기능 요구사항

| ID | 요구사항 |
|---|---|
| NF-1 | 콜드 스타트 목표치는 M2~M4에서 측정한 뒤 정한다 |
| NF-2 | 앱 크기: 모바일 셸은 SPA 번들 외에 수 MB 이내. 데스크톱은 Bun 런타임 크기를 측정해 기록한다 |
| NF-3 | 같은 JS 테스트 묶음이 모든 플랫폼에서 통과해야 한다 (호스트 구현이 3벌인 문제의 안전장치) |
| NF-4 | 유휴 시 데스크톱 네이티브 → 플러그인 호스트 Worker wake 0회 (2026-09-27, 아키텍처 검토 5단계. 자가 테스트 K-idle이 5초 동안 확인한다) |

## 4. MVP 완료 기준

샘플 앱(`examples/sample`) 하나가 다음을 만족한다.
1. **같은 `index.html` 번들**이 Web, macOS, iOS 시뮬레이터, Android 에뮬레이터에서 실행된다.
2. hook 4개가 플랫폼마다 표(§2.2)대로 동작하거나 `UNSUPPORTED`를 표시한다.
3. 빌드 타임 env와 런타임 env를 화면에 보여 주고, 런타임 값을 바꾸면 SPA를 다시 빌드하지 않아도 반영된다.
4. `public/` 이미지 로드와 SPA 라우팅 이동이 모든 플랫폼에서 동작한다.

## 5. 미해결·확인 필요

| # | 항목 | 해결 시점 |
|---|---|---|
| ~~Q1~~ | 타입 정의 패키지와 `typescript`를 devDependency로 허용할지 → **허용** (devDependency만, 런타임 의존 금지). 2026-09-24 결정 | 해결 |
| ~~Q2~~ | `bun build --compile` 실행 파일 안에 Worker 엔트리를 함께 넣을 수 있는지 → **된다.** Worker 엔트리를 두 번째 엔트리로 넘겨야 한다 (research/desktop-macos.md §1) | 해결 |
| ~~Q3~~ | Worker에서 만든 `threadsafe` JSCallback을 네이티브가 부르면 어느 스레드에서 실행되는지 → **항상 그 Worker 스레드**, 호출자는 막히지 않는다. Worker keepalive와 `akan_native_set_wake(null)`이 필수 | 해결 |
| ~~Q4~~ | macOS WKWebView에서 `app://`가 보안 컨텍스트인지 → **그렇다.** getUserMedia가 있고 TCC 프롬프트까지 확인. `NSCameraUsageDescription` 필수. 실제 영상 수신은 사람의 클릭이 필요해 미확인 | 해결 (일부 미확인) |
| ~~Q5~~ | swiftc로 조립한 `.app`이 scene 수명주기대로 실행되는지 → **된다** (research/ios.md §1.1) | 해결 |
| ~~Q6~~ | Android 15+ edge-to-edge에서 `env(safe-area-inset-*)` → **WebView 153에서 동작**(`viewport-fit=cover`). 140 미만용 CSS 변수 주입도 구현 | 해결 |
| ~~Q7~~ | 리소스 없이 `aapt2 link` + 프레임워크 테마만으로 APK를 만들 수 있는지 → **된다** (`Theme.DeviceDefault.DayNight` + `FEATURE_NO_TITLE`). 아이콘·스플래시 색은 이후 `aapt2 compile` 한 단계로 | 해결 |
| ~~Q8~~ | 개발 빌드 서명: macOS ad-hoc 서명은 빌드마다 바뀌어 카메라 권한 기록이 이어지지 않는다. 고정 자체 서명 인증서를 둘지 → **당분간 ad-hoc 유지.** 이후 선택형 `akan-native signing setup`(고정 자체 서명)을 둘 수 있다. 배포 서명(Developer ID, 공증)은 MVP 이후. 2026-09-25 결정. 후속: `akan-native signing setup` 구현. 자체 서명 인증서가 login 키체인에 만들어지고 코드 서명용으로 신뢰되며, 이후 macOS 빌드는 이 인증서로 서명된다. designated requirement가 빌드마다 같아서 TCC 기록이 이어진다. Keychain 항목은 Team ID가 없으면 파티션이 cdhash라 새 빌드마다 다시 묻는다. 그래서 secure-storage의 in-process Keychain은 Team ID 서명(CLI-9)에서만 쓴다 | 해결 |
| ~~Q9~~ | macOS 카메라 권한 상태를 정확히 읽으려면 AVFoundation이 필요하다(`objc2-av-foundation`은 새 crate). 웹 API로 충분한지 → **AVFoundation을 새 crate 없이 objc2 런타임(`msg_send!`)으로 부른다.** 2026-09-25 결정 | 해결 |
