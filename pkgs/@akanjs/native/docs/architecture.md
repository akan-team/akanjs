# akan-native 아키텍처 (초안 v0)

> 요구사항: [requirements.md](requirements.md) · 플러그인 목록: [plugins.md](plugins.md) · 최종 갱신: 2026-09-25
> 이 문서는 구현하면서 실제 동작에 맞게 고친다. 플랫폼별 사전 검증: [research/desktop-macos.md](research/desktop-macos.md), [research/ios.md](research/ios.md), [research/android.md](research/android.md).
> 반영 상태: M1(Web) · M2(macOS) · M3(iOS 시뮬레이터) · M4(Android 에뮬레이터) · M5(`akan-native dev`·`akan-native test`) 구현 완료. §12에 구현 메모.

## 1. 전체 그림

```
 개발자                                     akan-native
 ─────                                      ────
 React SPA ──(아무 번들러)──► dist/index.html (JS 인라인) + public/
                                   │
 akan-native.config.ts ───────────────► akan-native build <platform>
                                   │  ① HTML에 <script src="/__akan_native/init.js"> 삽입
                                   │  ② 플러그인 manifest 수집 → 플랫폼별 등록 코드 생성
                                   │  ③ env 병합 → env.runtime.json
                                   │  ④ 네이티브 프로젝트 생성 → 컴파일 → 패키징
                                   ▼
            ┌──────────────┬──────────────────┬───────────────┬───────────────────┐
            │ Web          │ macOS            │ iOS           │ Android           │
            │ 정적 파일    │ .app             │ .app (시뮬)   │ .apk              │
            │              │ Bun + TAO/WRY    │ Swift 셸      │ Kotlin 셸         │
            └──────────────┴──────────────────┴───────────────┴───────────────────┘

 앱 코드 ── useCamera() ── @akanjs/native/core 브리지 ──┬─ web 구현 (같은 번들 안)
                                              ├─ desktop: fetch /__akan_native/ipc → Bun Worker의 TS 구현
                                              ├─ iOS: messageHandlers.akanNative (WithReply) → Swift 구현
                                              └─ Android: MessagePort (postWebMessage로 받음) → Kotlin 구현
```

계약은 두 개다 (`notes/README.md §2.1`).
- **호스트 계약**: 브리지 프로토콜(§4), 에셋 경로(§5), 플러그인 규격(§6). 모든 플랫폼이 같은 명세를 구현한다.
- **렌더러 계약**: MVP에서는 DOM 하나뿐이다. 네이티브 렌더러는 MVP 범위가 아니다.

## 2. 저장소 구조

```
akan-native/
├─ package.json              Bun workspaces (packages/*, plugins/*, examples/*)
├─ docs/                     requirements.md, architecture.md
├─ packages/
│  ├─ core/                  @akanjs/native/core   WebView 안에서 도는 브리지 클라이언트, definePlugin, env, platform
│  ├─ react/                 @akanjs/native/react  hook 공통 도우미 (usePluginEvent 등)
│  ├─ desktop/               @akanjs/native/desktop 데스크톱 Bun 런타임: main.ts(FFI + 루프), host.ts(Worker, 플러그인 호스트)
│  └─ cli/                   @akanjs/native/config    akan-native 명령: doctor, build, run, dev
├─ native/
│  ├─ desktop/               Rust cdylib `akan_native_desktop` (TAO + WRY, C ABI)
│  ├─ ios/                   Swift 셸 소스
│  └─ android/               Kotlin 셸 소스
├─ plugins/
│  ├─ app-state/  preferences/  keyboard/  camera/
│  │    native-plugin.json, src/{index.ts, web.ts, desktop.ts}, ios/*.swift, android/*.kt
└─ examples/
   └─ sample/                샘플 React SPA + akan-native.config.ts
```

앱 프로젝트 쪽 생성물은 `<app>/.akan/native/build/<platform>/`에 둔다. 이 폴더는 git에서 제외하고 절대 편집하지 않는다 (D5).

## 3. 런타임 구조

### 3.1 공통: 페이지 부팅 순서

```
1. 호스트가 <origin>/ 로드 → index.html
2. <head> 첫 요소 <script src="/__akan_native/init.js">  (클래식 스크립트라 동기로 먼저 실행됨)
     → 호스트가 동적으로 만든 스크립트: window.__AKAN_NATIVE__ = { v, platform, runtimeVersion, env, plugins }
3. 앱 번들(인라인 module 스크립트) 실행 → @akanjs/native/core가 window.__AKAN_NATIVE__를 읽고 전송 방식 선택
4. React 렌더. env와 플러그인 목록은 이미 동기로 준비돼 있다
```

- 이 방식이면 **문서 시작 시 스크립트 주입 API가 필요 없다.** Android(AndroidX 없음)를 포함한 모든 플랫폼에서 규칙이 같고, 런타임에 HTML을 다시 쓰지 않는다.
- `plugins`에는 호스트가 플러그인을 제공하는 방식이 들어간다: `"web"`(WebView 안에서 web 구현 사용) 또는 `{ methods: [...], events: [...] }`(네이티브 구현). 목록에 없으면 그 호스트에서 미지원이다. JS는 이것으로 네이티브·web·미지원 중 하나를 고른다 (Capacitor `PluginHeaders` 방식, `notes/capacitor.md`).

**init.js 형식** (`packages/cli/src/lib/boot.ts`). 호스트는 JSON을 파싱하지 않고 문자열을 이어 붙이기만 한다.
```
init.js = INIT_PREFIX + <boot.json 내용> + "," + <env.runtime.json 내용> + ");\n"
INIT_PREFIX = "window.__AKAN_NATIVE__=(function(o,b,e){for(var k in b)o[k]=b[k];o.env=e;return o})(window.__AKAN_NATIVE__||{},"
boot.json = { v, platform, runtimeVersion, dev, app: { id, name, version }, plugins }   ← 빌드가 생성
env.runtime.json = { PUBLIC_...: "..." }                                                  ← 빌드가 생성, 패키징 때 교체 가능
```
- Web은 빌드가 완성된 `__akan_native/init.js`를 정적 파일로 쓴다. 배포 후 이 파일만 고치면 env가 바뀐다.
- 데스크톱은 Bun main이 `AKAN_NATIVE_PUBLIC_*`를 env에 덮어쓴 뒤 같은 형식으로 만들어 Rust에 넘긴다.
- iOS·Android의 **dev 빌드**도 실행할 때 env를 덮어쓸 수 있다. iOS는 프로세스 환경변수 `AKAN_NATIVE_PUBLIC_*`(`simctl launch`가 `SIMCTL_CHILD_AKAN_NATIVE_PUBLIC_*`를 넘김), Android는 intent extra `akanNativeEnv`(JSON)다. `akan-native run <platform>`은 CLI 환경의 `AKAN_NATIVE_PUBLIC_*`를 세 플랫폼 모두에 같은 방식으로 넘긴다. 자가 테스트(`PUBLIC_SELFTEST=1`)를 이 경로로 켠다.

### 3.2 Web

- `akan-native build web`의 출력: `index.html` + `public/` 파일 + **정적 `__akan_native/init.js`** (platform `web`, 병합된 env).
- 플러그인 호출은 모두 같은 번들 안의 web 구현으로 간다. 브리지 통신은 없다.
- 배포 후 `__akan_native/init.js`만 바꾸면 env를 바꿀 수 있다 (ENV-4).

### 3.3 macOS (데스크톱)

```
 Akan Native Sample.app  (프로세스 1개)
 ├─ main 스레드 ─ main-entry.ts → @akanjs/native/desktop main.ts (bun build --compile 결과물)
 │    1. Resources/boot.json·env.runtime.json·shell.json 읽기
 │    2. dlopen(Frameworks/libakan_native_desktop.dylib)
 │    3. new Worker(host-entry.ts) → "ready" 대기 (18초 = 플러그인 10초 + 서버 8초, error 이벤트는 여기서만 볼 수 있다)
 │       → init.js 문자열: env.runtime.json < ready의 env(내장 서버 URL) < AKAN_NATIVE_PUBLIC_*
 │    4. akan_native_run(configJson)  ← 반환하지 않음. TAO EventLoop가 main 스레드를 차지. 이후 main의 JS는 돌지 않는다
 │         └ WRY WebView: app://localhost (첫 로드가 끝날 때까지 창을 숨김, D2)
 │              ├ 정적 파일·/__akan_native/file/<id> → Rust가 백그라운드 스레드에서 읽고 main에서 응답
 │              ├ /__akan_native/init.js → config로 받은 문자열 + 창 id(`window.__AKAN_NATIVE__.windowId`)
 │              └ POST /__akan_native/ipc (Referer·x-akan-native-ipc 검사) → 큐에 프레임 추가 → wake()
 │
 └─ Worker 스레드 ─ host-entry.ts → @akanjs/native/desktop host.ts (플러그인 호스트)
      wake = new JSCallback(drain, { threadsafe: true })  ← 항상 이 Worker 스레드에서 실행된다 (Q3)
      akan_native_set_wake(wake.ptr), keepalive(setInterval), uncaughtException 처리, exit에서 akan_native_set_wake(null)
      drain(): while (frame = akan_native_poll(buf)) → dispatcher → akan_native_respond(reqId, JSON)  ← 즉시 반환, 응답은 main에서
      네이티브 이벤트(kind 2): pageLoad started → 그 창의 구독 초기화, window closeRequested → 종료 흐름(§12 D4)
      이벤트 push: 구독한 창마다 akan_native_emit(창 id, "window.__AKAN_NATIVE__.receive({...})") → EventLoopProxy → evaluate_script
      내장 서버(desktop.server, server.ts): launch 단계 뒤 자식 프로세스로 띄운다 → IPC ready(최대 8초) → ready에 env
         └ 자식 프로세스: 이 실행 파일 자신 + BUN_BE_BUN=1 → Resources/server/<entry>, 127.0.0.1:<세션 동안 고정한 포트>
```

설계 근거 (검증: [research/desktop-macos.md](research/desktop-macos.md) §1)
- **main = 네이티브 루프, JS = Worker** (`notes/tao.md §6` 방식 A). macOS에서는 TAO가 main 스레드가 아니면 panic한다. `akan_native_run`은 먼저 main 스레드인지 확인하고 -1을 반환한다.
- **네이티브 → Bun은 "데이터 없는 wake + 동기 poll"**: 네이티브가 문자열을 JS에 넘기지 않으므로, Electrobun v1의 문자열 수명 문제(1초 지연 free)와 2.x의 16ms polling이 모두 생기지 않는다 (`notes/electrobun-v1.md §7`). threadsafe JSCallback은 호출자를 막지 않는다(1~23µs).
- **Worker 수명**: 이벤트 루프가 빈 Worker는 바로 종료되고, 종료된 Worker의 JSCallback을 부르면 프로세스가 segfault한다. 그래서 keepalive 타이머와 `akan_native_set_wake(null)`이 필수다.
- **IPC 응답은 HTTP 응답 본문으로 돌려준다.** 다만 Worker에서 WRY responder를 바로 부르면 main이 바쁜 동안 Worker도 막힌다(1.2초 측정). 그래서 `akan_native_respond`는 responder를 main으로 넘기고 바로 반환한다.
- 정적 파일은 Rust가 바로 응답해서 JS를 거치지 않는다.
- **기본 메뉴**(App·Edit·Window)를 Rust에서 objc2-app-kit으로 만든다. 없으면 Cmd+C/V/A/Z/Q가 동작하지 않는다(plugins.md D1). 새 crate 없이 wry/tao가 쓰는 crate의 feature만 켠다.
- app-state는 `desktop: "web"`이다. WKWebView의 `visibilitychange`·`focus`·`blur`가 네이티브 상태와 같은 시점에 바뀐다(검증).

패키지 구조
```
Akan Native Sample.app/Contents/
├─ Info.plist                       CFBundle*, LSMinimumSystemVersion 26.0, 플러그인 macos.infoPlist (카메라 설명 등)
├─ MacOS/akan-native-sample                bun build --compile gen/main-entry.ts gen/host-entry.ts (Worker 엔트리도 넘겨야 한다, Q2)
├─ Frameworks/libakan_native_desktop.dylib install_name @rpath/…, 절대 경로로 dlopen
└─ Resources/ app/ · boot.json · env.runtime.json · shell.json
             server/ · server.json · server.bunfig.toml   desktop.server가 있을 때(내장 서버, §12 "데스크톱 내장 서버")
```
서명은 안쪽부터(`xattr -cr` → dylib → 번들, ad-hoc). 실행 파일은 약 62MB(Bun 런타임), dylib는 0.87MB.

### 3.4 iOS

```
 AkanNativeAppDelegate (@main) → configurationForConnecting: UISceneConfiguration(name: nil) + delegateClass
   → AkanNativeSceneDelegate → UIWindow → AkanNativeViewController
   AkanNativeWebView (WKWebView 하위 클래스, isOpaque=false + 배경색 = SH-3, isInspectable = dev)
   ├ WKURLSchemeHandler "app"   정적 파일 · /__akan_native/init.js · /__akan_native/file/<id> · SPA 폴백 · Range
   │    진행 중 task를 집합으로 추적, 응답은 main에서만 (stop된 task에 응답하면 앱이 죽는다)
   ├ WKScriptMessageHandlerWithReply "akan-native"  JSON 텍스트 → Promise로 JSON 텍스트 응답
   │    → app://localhost + main frame 확인 (SEC-1) → AkanNativeBridge → 플러그인
   ├ 이벤트 push: callAsyncJavaScript("__AKAN_NATIVE__.receive(m)", arguments: ["m": JSON 텍스트])
   └ WKUIDelegate: alert·confirm·prompt 패널, getUserMedia 권한(앱 오리진만 grant), 외부 링크 → UIApplication.open
 플러그인: 빌드가 생성한 AkanNativeGeneratedPlugins.swift의 목록으로 등록 (리플렉션 없음)
```
- 앱 진입점을 우리가 직접 소유한다(생성된 번들). 그래서 TAO iOS의 `UIApplicationMain` 제약과 무관하다.
- Xcode 프로젝트 없이 `swiftc`로 컴파일하고 `.app`을 조립한다. 시뮬레이터에서는 서명 없이도 실행된다(Q5).
- JSON 처리는 Foundation `JSONSerialization`만 쓴다. 직렬화 전에 반드시 `isValidJSONObject`로 검사한다(Date 하나로 잡을 수 없는 예외가 난다).
- 플러그인 API는 `@MainActor`다. Swift 6 언어 모드로 경고 없이 컴파일된다.

### 3.5 Android

```
 AkanNativeActivity : android.app.Activity   (AppCompat 없음, Theme.DeviceDefault.DayNight + FEATURE_NO_TITLE)
   WebView
   ├ WebViewClient.shouldInterceptRequest   https://app.localhost/*
   │    APK assets/app/ · /__akan_native/init.js · /__akan_native/hello · /__akan_native/file/<id> · SPA 폴백 · Range 206
   │    shouldOverrideUrlLoading: 메인 프레임이 앱 오리진 밖으로 가면 ACTION_VIEW (SH-4)
   ├ 브리지: MessagePort
   │    페이지가 "message" 리스너 등록 → fetch("/__akan_native/hello?n=<문서 nonce>") → createWebMessageChannel()
   │    → postWebMessage("akan-native:port:<nonce>" + 포트, targetOrigin = https://app.localhost)  ← 앱 오리진 메인 프레임만 받는다
   │    → 페이지가 자기 nonce의 포트만 받고 첫 메시지 "akan-native:claim" → 셸이 그때 이전 포트·구독을 정리 (SEC-4)
   │    요청·응답·이벤트: 같은 포트로 JSON 텍스트. 콜백은 main Looper에서 dispatch
   ├ WebChromeClient: console → Logcat "AkanNativeConsole" (WV-3), getUserMedia 권한, 파일 선택
   └ insets: systemBars+cutout+IME → 키보드 높이, IME만큼 컨테이너 padding (insets를 소비하지 않음)
 AkanNativeFileProvider (자체 ContentProvider, AndroidX FileProvider 대체) · onActivityResult / onRequestPermissionsResult 라우팅
 JSON: 프레임워크의 org.json
```
- **JavascriptInterface를 쓰지 않는다.** 교차 오리진 iframe에도 주입되어 iframe이 플러그인을 호출할 수 있었고(검증), iframe 로드는 `shouldOverrideUrlLoading`을 거치지 않는다. 프레임워크에는 `addWebMessageListener`가 없다. MessagePort + `postWebMessage(targetOrigin)`가 프레임워크 API만으로 되는 해법이다([research/android.md](research/android.md) §4.1).
- 포트는 hello마다 새로 "제안"하고, 페이지가 그 포트로 `akan-native:claim`을 보내면 그때 이전 포트와 구독을 정리한다(claim = 새 문서). `onPageStarted`에서 정리하면 작은 페이지가 그보다 먼저 hello를 보내는 경우 새 포트를 닫아 버린다(재현됨). hello는 `Referer`가 앱 오리진이고 nonce(`[0-9a-f]{16,64}`)가 있을 때만 받는다. JS는 3초 안에 포트가 없으면 다시 울린다.
- 문서당 포트는 하나다(2026-09-26 검토 반영). 셸이 늦게 답하면 다시 울린 hello에 대한 두 번째 포트가 올 수 있다. 예전에는 페이지가 그 포트도 받아서 셸이 첫 포트의 구독을 모두 끊었고, 대기 중인 요청을 다시 보내 비멱등 호출이 두 번 실행됐다. 포트가 오기 전의 요청도 두 번 나갔다(inflight와 queue 양쪽에 들어가 있었다).
  - 페이지: 첫 포트만 받고 뒤에 온 포트는 쓰지 않고 닫는다. 포트 전 요청은 포트가 올 때 한 번만 보낸다. 네 번 울려도 포트가 없으면 대기 중인 호출과 이후 호출을 `INTERNAL`로 끝낸다(포트가 나중에라도 오면 다시 쓴다).
  - 셸(`AkanNativeBridge.kt`): 같은 nonce의 제안을 모두 열어 두고, 페이지가 claim한 것만 쓰고 나머지는 닫는다(예전처럼 다시 울릴 때 이전 제안을 닫으면, 이미 그 포트를 받은 페이지가 닫힌 포트를 쓰게 된다). claim한 nonce로 온 hello는 무시한다. 요청 id는 문서 안에서 커지기만 하므로(런타임의 `nextId`) 이미 본 id 이하는 버린다.
- nonce와 claim은 SEC-4다. 예전에는 hello마다 곧바로 교체했는데, 앱 오리진에서 로드한 sandbox iframe의 fetch에도 앱 오리진 `Referer`가 붙어서(명세: 프레임 문서의 URL이 앱 오리진) 어떤 프레임이든 hello로 페이지의 포트와 구독을 끊을 수 있었다(셀프테스트로 재현: 포트 1 → 2). 이제 프레임의 hello는 페이지가 무시하는 포트만 만든다.
- Gradle 없이 SDK 도구로 빌드한다(§8). 리소스 없이 `aapt2 link`만으로 APK가 된다(Q7).

### 3.6 Windows · Linux (데스크톱)

- 구조는 macOS(§3.3)와 같다.
  - 프로세스 하나에서 main 스레드는 TAO 루프, JS는 Worker에서 돈다.
  - 네이티브 코드는 같은 `native/desktop` cdylib이고, 같은 C ABI와 같은 셸 op를 쓴다.
  - OS마다 다른 것만 `native/desktop/src/win/`, `src/linux/`에 있다.
    - 진입점은 `shell_op`(앱 전체), `window_op`(창 하나), `async_op`(나중에 `reply`로 응답), Windows는 `msg_hook`(TAO가 처리하기 전의 모든 Win32 메시지)이다.
    - 아직 없는 op 계열은 `lib.rs` `PLATFORM_OPS`가 `UNSUPPORTED: …`로 답한다. `host.ts`의 `shellError`가 앞의 코드를 AkanNativeError 코드로 바꾼다.
- 바인딩 crate: wry/tao 트리에 이미 있는 것만 feature를 더해 쓴다.
  - Windows: `windows`(windows-rs)
  - Linux: gtk-rs(`gtk`, 그 안의 `gio`·`glib`·`gdk`). D-Bus 서비스는 GDBus(`gio::DBusConnection`)로 호출하고, `dbus` crate는 쓰지 않는다.
- 오리진(WV-1):
  - Windows는 `https://app.localhost`다. WebView2에는 사용자 스킴이 없어서, wry가 `app://localhost`를 `with_https_scheme`으로 바꿔 서빙한다. Android와 같은 오리진이다.
  - Linux는 WebKitGTK가 스킴을 직접 서빙하므로 macOS처럼 `app://localhost`다.
  - IPC 검사(`ipc_allowed`): Chromium은 POST에 항상 `Origin`을 보내고, WebKit은 같은 오리진이면 `Referer`만 보낸다. 둘 다 받는다.
- WebView 컨텍스트:
  - 모든 창이 `wry::WebContext` 하나를 같이 쓴다.
  - 데이터 폴더(`packages/desktop/src/paths.ts`): Windows `%LOCALAPPDATA%\<id>\WebView2`, Linux `$XDG_DATA_HOME/<id>/webview`. WebView2의 기본값은 exe 옆이라 설치 후에는 쓸 수 없다.
  - Linux에서는 스킴이 컨텍스트에 한 번만 등록된다. 그래서 첫 창의 핸들러가 모든 창의 요청을 받고, wry가 넘겨 주는 webview id로 창을 구분한다(macOS·Windows도 같은 방식으로 바꿨다).
  - Linux의 POST 본문은 wry `linux-body` feature(WebKitGTK 2.40+)가 있어야 핸들러에 온다.
- Linux WebView는 TAO 창의 GTK box 안에 만든다(`build_gtk(default_vbox)`). `build()`는 X11에서만 된다.
- 창 테마와 배경: 창을 만든 뒤 `window.theme()`로 시스템 테마를 보고 배경을 칠한다(SH-3). 첫 로드까지 창을 숨기므로 깜빡임은 없다.
- 페이지의 오른쪽 클릭 메뉴(WV-6, `native/desktop/src/page_menu.rs`): 릴리스 빌드에서 엔진이 붙이는 브라우저 항목을 뺀다. 세 엔진 모두 이름으로 항목을 가린다.
  - WebView2: `ContextMenuRequested`(ICoreWebView2_11)에서 항목 Name을 본다. 확인한 이름: `back`·`forward`·`reload`·`saveAs`·`print`·`moreTools`(도구 하위 메뉴)·`copyLinkToHighlight`. 이름이 `other`이고 라벨이 없는 것은 구분선이다. 다 빠지면 `Handled`로 메뉴를 막는다.
  - WebKitGTK: `context-menu` 시그널에서 stock action을 본다. "Copy Link with Highlight"처럼 공개 action이 없는 WebKit 항목은 `Custom`으로 온다. 시그널이 true를 돌려주면 메뉴가 뜨지 않는다.
  - WKWebView: wry의 `WryWebView`에 `willOpenMenu:withEvent:`를 더하고, WKWebView의 구현을 먼저 부른 뒤 NSMenuItem identifier(`WKMenuItemIdentifierReload` 등)로 뺀다. WebKit은 메뉴를 띄우기 직전에 이 메서드를 부른다.
  - 확인(릴리스 빌드): Windows VM과 Linux 컨테이너에서 빈 곳을 오른쪽 클릭하면 메뉴가 없고, 선택한 글자 위에서는 "Copy"만 나왔다(화면 캡처, Linux는 xdotool). macOS는 사용자가 릴리스 빌드에서 직접 오른쪽 클릭해 확인했다(2026-09-26, 문제 없음).
  - WebView2의 브라우저 단축키는 모든 빌드에서 끈다(`with_browser_accelerator_keys(false)`). F12도 꺼지므로 dev 빌드의 DevTools는 메뉴의 "검사"로 연다.
- 창 아이콘: CLI가 `resources/icon.rgba`([u32 w][u32 h][RGBA])를 쓰고, 셸이 `tao::window::Icon`으로 읽는다. 셸에 이미지 디코더를 넣지 않기 위해서다.
- 카메라·마이크 권한 요청: WebView2는 자기 확인 창을 띄우고 답을 오리진별로 기억한다(Default). WebKitGTK는 답하지 않은 요청을 거부하고 Linux에는 OS 권한 창이 없어서, 셸이 허용한다.
- 화면 공유(`getDisplayMedia`): WebView2는 Chromium의 선택 창을 띄운다. `desktop.screenCapture: "auto"`(2026-09-30, 전광판 원격 지원)는 브라우저 인자 `--use-fake-ui-for-media-stream`을 더해 선택 창과 사용자 동작 없이 첫 화면으로 답한다.
  - VM에서 확인: `displaySurface: "monitor"` 트랙이 바로 오고, `--lang=ko`에서도 같다.
  - `--auto-select-desktop-capture-source=<제목>`은 쓰지 않는다. 선택 창의 "Entire screen" 같은 제목이 UI 언어를 따라, `--lang=ko`에서는 맞지 않아 실패했다(확인).
  - 이 스위치는 Chromium이 미디어 요청 전체에 쓰는 자동화 테스트용이다. 카메라·마이크 요청에서의 동작은 확인하지 않았으므로, 그런 요청을 하는 앱에는 켜지 않는다.
  - `with_additional_browser_args`는 wry의 기본 인자를 대신하므로, 셸이 기본 인자(`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required`)를 다시 적는다. DevTools 포트(`AKAN_NATIVE_WEBVIEW2_DEBUG_PORT`, dev 빌드)도 같은 줄에 붙는다.
- 종료 흐름(D4):
  - 창 닫기(Alt+F4 포함)와 `app.exit()`는 macOS와 같은 경로다.
  - Linux의 SIGTERM은 macOS와 같은 `sigterm` 모듈이 받는다.
  - Windows에는 SIGTERM이 없다. 그래서 `akan-native run`·`akan-native test`는 앱에 `AKAN_NATIVE_QUIT_ON_STDIN=1`과 파이프 stdin을 준다.
    - "quit" 한 줄이나 EOF가 오면 앱이 SIGTERM과 같은 `signal` 이벤트를 받아 onQuit 훅을 돈다(`lib.rs` `stdin_quit`).
    - 한 번 더 요청이 오거나 5초가 지나면 끝낸다. CLI는 6초 뒤에도 살아 있으면 TerminateProcess한다.
  - 로그오프(WM_QUERYENDSESSION)는 아직 처리하지 않는다.
- single-instance: Windows에서는 사용자별 named pipe(`\\.\pipe\akan-native-<hash>`)를 쓴다. node:net이 Windows에서는 파이프만 listen한다.
- 딥 링크(D6):
  - macOS는 Apple Event로 링크를 받는다. Windows·Linux는 링크를 인자로 새 프로세스를 띄운다.
  - 등록: 앱이 시작할 때마다 현재 사용자로 스킴을 등록한다(`packages/desktop/src/deeplinks.ts`). 그래서 설치 프로그램 없이 복사하거나 옮긴 폴더에서도 링크가 지금 실행 파일로 온다. Windows 설치 프로그램은 스킴을 등록하지 않고, 제거 프로그램이 명령이 자기 실행 파일을 가리키는 스킴 키만 지운다.
    - Windows: `HKCU\Software\Classes\<scheme>`
    - Linux: 숨긴 `<id>.desktop`과 `mimeapps.list`
  - 전달:
    - 콜드 스타트는 host가 `process.argv`를 보고 `opened` 이벤트로 넘긴다.
    - 실행 중일 때는 single-instance가 넘겨받은 인자를 `ctx.openLinks`로 넘긴다.
    - 인자가 하나이고 앱 스킴의 URL일 때만 링크로 본다(Tauri deep-link와 같은 규칙).
  - single-instance 없이 딥 링크를 쓰면 빌드가 경고한다. 링크마다 앱이 하나 더 뜨기 때문이다.
- 패키지:
  ```
  Windows  <Name>\<exe>.exe · akan_native_desktop.dll · resources\ (+ icon.rgba)
  Linux    <name>/<exe> · lib/libakan_native_desktop.so · resources/ (+ icon.rgba)
  ```
  - Windows exe는 `bun build --compile --windows-hide-console`로 만들고, 아이콘(.ico)과 버전 정보를 넣는다.
  - DLL은 C 런타임을 정적으로 링크한다(`+crt-static`). 그래서 VC++ 재배포 패키지가 필요 없다.
  - Windows 설치 프로그램은 `--installer`의 NSIS다(2026-09-30, `platforms/windows-installer.ts`). 사용자 단위로 설치해 업데이터가 관리자 권한 없이 폴더를 바꿀 수 있고, 제거 항목은 app id 키, 시작 메뉴 바로가기는 앱 이름이다. Linux는 `--installer`의 AppImage(2026-10-02, `platforms/linux-appimage.ts`), 서명은 CLI-9다(macOS `lib/macossigning.ts`, Windows `lib/windowssigning.ts`). deb는 아직 없다.
    - 설치 폴더는 앱의 것이다. 업데이트가 폴더를 통째로 바꾸므로 제거 프로그램은 폴더 밖, 옆에 둔다(`<폴더>.uninstall.exe`). 제거 프로그램은 제거 항목의 `InstallLocation`으로 폴더를 찾는다(비었거나 드라이브 루트면 제거하지 않는다). 다시 설치할 때와 제거할 때 앱 실행 파일이 있는 폴더는 통째로 지우고, 없으면 이 빌드가 만든 항목만 지운다. 그래서 `/D=`로 고른 폴더는 비어 있거나 이미 앱이 설치된 곳이어야 한다(아니면 거부). 기본 폴더(`%LOCALAPPDATA%\Programs\<name>`)만은 예외로 받는다. 같은 이름의 이전 앱(예: Electron으로 만든 전광판)이 그 폴더에 있으면, 처음 설치할 때는 이 빌드의 항목만 바꾸므로 이전 앱의 나머지 파일이 남는다. 앱 실행 파일이 생긴 뒤의 재설치·제거가 폴더를 통째로 지운다. 제거 프로그램을 쓸 수 없는 곳(드라이브 바로 아래의 `/D=` 등)이면 설치를 실패로 끝낸다.
    - 설치 위치: `/D=`가 없으면 제거 항목의 `InstallLocation`, 곧 이미 설치된 곳에 다시 설치한다(`InstallDirRegKey`). 항목이 없을 때만 기본 폴더다. 원격 업데이트는 `/S /RUN`만 넘기므로, 전에는 `/D=D:\Board`로 설치한 PC에 기본 폴더 사본이 하나 더 생기고 옛 앱이 계속 돌았다. `app.name`이 버전 사이에 바뀌어도 같은 폴더에 설치된다(2026-09-30 10 리뷰).
    - 한 번에 하나: 설치와 제거는 app id로 이름 지은 세션 뮤텍스(`Local\akan-native-setup-<id>`)를 잡고, 이미 잡혀 있으면 아무것도 건드리지 않고 2로 끝난다. 전에는 겹쳐 돈 두 설치가 서로 푼 파일을 지워, 실행 파일이 빠진 폴더를 0으로 설치할 수 있었다(2026-09-30 10 리뷰). 다른 사용자의 설치는 그 사용자의 폴더에 설치하므로 `Global\`을 쓰지 않는다.
    - 앱을 멈추기 전: 앞선 설치가 남긴 `<폴더>.setup-new`·`.setup-old`를 지운다(지우지 못하면 2) → 여유 공간 → WebView2 → 새 파일을 `<폴더>.setup-new`에 푼다 → 실행 파일과 `resources\boot.json`이 있는지 본다 → 새 제거 프로그램을 `<폴더>.setup-uninstall.exe`로 쓴다. 여기서 실패하면 설치된 앱은 멈춘 적 없이 그대로 돈다.
    - 교체: 설치 폴더에서 도는 앱을 경로로 찾아 멈추고, 풀어 둔 파일을 한 번 더 본 뒤 이름 바꾸기 두 번으로 폴더를 바꾼다(`<폴더>` → `.setup-old`, `.setup-new` → `<폴더>`, 각각 10초까지 재시도). 두 번째가 실패하면 `.setup-old`를 제자리로 되돌린다. 되돌리기도 실패하면 앱은 `.setup-old`에 남고, 다음 설치가 시작할 때 되살린다. 교체가 끝나면 `.setup-old`를 지우고, 제거 프로그램을 `<폴더>.uninstall.exe`로 옮기고, 바로가기와 제거 항목을 쓴다.
    - 실패한 설치(종료 코드 2)는 `.setup-new`와 새 제거 프로그램을 지운다(`.onInstFailed`). 디스크가 차면 NSIS는 `File` 안에서 곧바로 섹션을 끝내서, 풀기 뒤의 검사가 돌지 않는다(VM에서 확인). 앱을 멈춘 뒤에 실패했고 `/RUN`이면, 그때 자리에 있는 앱(보통 되살린 옛 빌드)을 다시 띄운다. 정지 스크립트가 설치 폴더에서 도는 프로세스가 남았다고 답했으면 띄우지 않는다. 하나 더 뜨기 때문이다.
    - 교체 뒤의 실패(제거 프로그램 옮기기, 바로가기, 제거 항목 쓰기)는 새 빌드가 이미 자리에 있으므로 0으로 끝나고, 설치 로그와 대화형 창으로만 알린다.
    - 여유 공간: 설치 드라이브에는 새 앱의 크기, `%TEMP%` 드라이브에는 설치 프로그램이 싣는 전부(앱과 WebView2 부트스트래퍼)가 비어 있어야 한다. `SetCompressor /SOLID`는 풀린 데이터를 `%TEMP%`의 파일에 먼저 쓰기 때문이다. 두 드라이브가 같으면 합을 본다. 크기는 빌드가 4 KiB 클러스터로 센다. 옛 앱은 교체 뒤에 지우므로 가장 많이 쓸 때는 옛 앱 + 임시 파일 + 새 앱이다.
    - 정션: 설치와 제거는 폴더를 NSIS `RMDir /r` 대신 `cmd /d /c rmdir /s /q`로 지운다. `RMDir /r`은 정션을 따라 들어가 가리키는 폴더를 비운다. `rd /s`(Vista부터)는 정션과 디렉터리 심볼릭 링크를 링크만 지운다(VM에서 확인, 설치 프로그램이 쓰는 32비트 cmd도 같다). 그래서 설치 폴더 안의 정션(예: `media` → `D:\SignageMedia`)은 재설치·제거 때 사라지지만 가리키던 파일은 남는다. 경로는 환경 변수로 넘겨 cmd가 `%`·`^`·`&`를 읽지 않는다. `rd`는 파일이 남아도 0으로 답하므로 폴더가 남았는지로 결과를 본다.
    - 제거 범위: 폴더, 옆에 남은 `.previous`·`.update-*`·`.failed-*`·`.setup-*`, 제거 프로그램, 바로가기, 제거 항목, 자동 시작(`Run`, `StartupApproved`), 셸의 업데이트 상태(`akan-native-updates`, debug 빌드의 `akan-native-updates-debug`, `akan-native-relaunch.json`), 업데이트가 옮기는 동안 걸어 둔 `RunOnce` 복구 명령(`akan-native-update <id>`), 알림 AUMID 키(`HKCU\Software\Classes\AppUserModelId\<id>`)와 알림 아이콘, 명령이 이 실행 파일을 가리키는 딥 링크 스킴 키. 다른 프로그램이 가져간 스킴과, 서버 데이터를 비롯한 `%LOCALAPPDATA%\<id>`의 나머지는 남긴다. 제거 프로그램은 `%TEMP%`의 사본으로 돌고 시작한 프로세스는 곧바로 끝나므로, 제거 프로그램 파일을 맨 마지막에 지운다. 그 파일이 없어지면 제거가 끝난 것이다.
    - 바로가기의 시작 위치와 `/RUN`·완료 페이지로 띄운 앱의 작업 폴더는 설치 폴더가 아니라 `%LOCALAPPDATA%`다. Windows는 어떤 프로세스의 작업 폴더인 폴더의 이름을 바꾸지 못하므로, 설치 폴더에서 시작한 앱과 그 업데이트 도우미는 폴더를 교체하지 못한다(재시도 10초 뒤 실패). 탐색기에서 exe를 직접 여는 경우는 셸이 launch 단계 뒤, 창(WebView2 프로세스)을 만들기 전에 작업 폴더를 `%LOCALAPPDATA%\<id>`로 옮기는 것으로 막는다(`main.ts` `leaveInstallFolder`; launch 단계에서는 single-instance가 두 번째 실행의 작업 폴더를 넘긴다).
    - `/RUN`은 `/S`일 때만 앱을 띄운다. 대화형 설치는 완료 페이지의 실행 체크로 띄우므로, 둘 다 띄우면 두 번 뜬다.
    - `/S`에서 끝내지 못한 설치는 0이 아닌 종료 코드(2)로 끝난다: 다른 설치·제거가 도는 중, 앞선 설치가 남긴 것을 지우지 못함, 여유 공간 부족, 파일을 쓰지 못함(`ManifestLongPathAware`는 PC가 긴 경로를 허용할 때만 효과가 있다), 풀어 둔 파일이 빠짐, WebView2 부트스트래퍼 뒤에도 런타임이 없음(대화형이면 묻는다), 남의 파일이 있는 `/D=` 폴더, 폴더를 바꾸지 못함. 빌드는 설치 뒤·업데이트 압축 해제 중 가장 긴 경로(사용자 이름 20자, bundle id는 문법의 최대 80자 가정)가 260자에 가까우면 경고한다.
    - WebView2 부트스트래퍼는 런타임을 인터넷에서 받는다. 인터넷이 없는 PC(LTSC 전광판 등)에는 Evergreen Standalone 설치 파일을 따로 설치해 두어야 한다. 설치 프로그램에 넣는 선택지는 아직 없다.
- 빌드는 그 OS에서만 한다(`requireHost`). Mac에서 테스트하는 방법(Linux는 Docker, Windows는 VM)은 [testing-windows-linux.md](testing-windows-linux.md)에 있다.

### 3.7 범위 모델 (App · Window · Document · Call)

2026-09-26 아키텍처 검토(study-84)의 결정이다. 플러그인과 셸의 상태는 수명이 다른 네 범위 중 하나에 속한다. 전에는 상태가 호스트 컨테이너(데스크톱 Worker, iOS scene, Android Activity)를 따라가서, 프로세스에 한 번이어야 하는 일이 scene·Activity를 다시 만들 때마다 다시 돌았다(예: scene이 다시 연결되면 미확정 웹 번들을 롤백).

| 범위 | 수명 | 데스크톱 | iOS | Android | 여기에 두는 것 |
|---|---|---|---|---|---|
| App | 프로세스 | 플러그인 호스트 Worker | `AkanNativeAppServices`(AppDelegate가 시작) | `AkanNativeApplication` / `AkanNativeApp`(manifest의 application 클래스) | 웹 번들 선택(1회), 링크 버퍼와 실행 URL(`AkanNativeLinks`), 알림 delegate와 탭 버퍼(iOS `AkanNativeNotifications`, C5), FileRef 등록 표 |
| Window | 창 | 창 id | scene의 뷰 컨트롤러 | Activity | 브리지, 플러그인 인스턴스(지금은 창마다), presenter, insets, back |
| Document | 페이지 로드 하나(commit부터 다음 문서까지) | `dispatcher`의 창별 문서 | `AkanNativeBridge`의 문서 | `AkanNativeBridge`의 문서(포트 하나) | 구독, 진행 중 호출, 순서 번호, 문서 자원(`own`): sqlite 연결, keep-awake, 대화상자, 다운로드 |
| Call | 요청 하나 | | | | 응답, 취소(v1.1 `cancel`). 4단계에서 스트림 |

- 창이 끝나면(iOS `sceneDidDisconnect`, Android `onDestroy`, 데스크톱 창 파괴) 그 문서도 끝난다. 끝난 문서의 구독은 멈춘다. 전에는 iOS에서 죽은 플러그인의 링크 리스너가 남아 딥링크가 사라졌다.
- Android 프로세스는 Activity 없이도 시작된다(알림 알람, 부팅). 그래서 웹 번들은 `Application.onCreate`가 아니라 첫 Activity가 물을 때 고른다. 그 뒤에는 `apply()`·롤백이 바꾼 현재 번들을 준다.
- 문서 수명 규칙(2026-09-27, 아키텍처 검토 3단계. 아래 "문서 자원과 수명 규칙")으로 플러그인이 문서 범위 상태를 둔다.

**문서 자원과 수명 규칙 (3단계)**
- API
  - 데스크톱: 메서드 호출의 `ctx.document`(`id`, `window`, `ended`, `own(dispose) → forget`), `ctx.signal`, `ctx.onDocumentEnd(fn)`, 플러그인의 `onDocumentEnd(doc, ctx)`.
  - iOS: `call.document`(`AkanNativeDocument`, `own { } → token`, `disown(token)`), `call.onCancel { }`, `call.isCancelled`, 플러그인의 `documentEnded(_ id:)`. 생성 코드의 `AkanNativeReply`도 `onCancel`·`isCancelled`를 넘긴다.
  - Android: `call.document`(`AkanNativeDocumentScope`), `call.onCancel { }`, `call.isCancelled`, 플러그인의 `documentEnded(document)`.
- 문서가 끝나면(새 문서, commit, 창 파괴, 렌더러 종료) 호스트가 페이지에 묻지 않고 이 순서로 끝낸다. 각 단계는 따로 감싸 하나가 실패해도 나머지를 돌고, 첫 오류만 자세히 남긴다.
  1. 진행 중 호출을 끝낸다: 플러그인의 signal·onCancel이 불리고, 답은 CANCELLED("the page that made this call is gone")이며 번호가 없어 페이지가 버린다.
  2. 구독을 멈춘다(듣는 문서가 없는 소스는 정지).
  3. `own`한 자원을 등록의 역순으로 닫는다.
  4. 플러그인 훅(`onDocumentEnd`/`documentEnded`)과 데스크톱 `ctx.onDocumentEnd` 리스너를 부른다.
  - 두 번 불러도 아무것도 두 번 돌지 않는다. 끝난 문서에 `own`하면(문서가 떠난 뒤 끝난 호출) 바로 닫는다.
- 창이 끝나면 App 서비스가 그 창의 리스너를 소유자 기준으로 지운다(iOS `AkanNativeLinks`·`AkanNativeNotifications`·`AkanNativeRemoteNotifications.removeAll(owner:)`, Android `AkanNativeLinks.removeAll`). 전에는 "다음 전달 때 지움"이라, 창을 다시 만들면 APNs 등록 리스너가 쌓였다.
- 데스크톱 page-veto(창 닫기·종료 확인)의 페이지 대기는 문서 종료 훅으로 바로 끝난다(전에는 pageLoad·창 파괴 두 네이티브 이벤트를 따로 들었다).
- 모듈 스코프는 App 범위다: 데스크톱 플러그인의 최상위 변수에 창·페이지별 상태를 두지 않고, `ctx.document.own`이나 창별 표 + `onDocumentEnd`로 둔다.
- 옮긴 플러그인: sqlite(문서마다 연결, 끝나면 ROLLBACK 후 close, 데스크톱·iOS WAL과 busy_timeout 5초, Android DELETE), keep-awake(웹 Wake Lock처럼 페이지 것. 데스크톱은 창별 보유자), dialog(취소·문서 종료에 닫음. 데스크톱 셸 `alert.dismiss`), biometric(LAContext.invalidate, CancellationSignal), updates(다운로드 중지), http(요청 중지), iap(iOS 업데이트 스트림을 App 범위로).

## 4. 브리지 프로토콜 v1 (v1.1 확장)

```ts
// JS → 호스트
type Request  = { v: 1; id: number; plugin: string; method: string; args?: unknown };
// 호스트 → JS (요청에 대한 응답)
type Response = { v: 1; id: number; ok: true; result?: unknown }
              | { v: 1; id: number; ok: false; error: { code: ErrorCode; message: string } };
// 호스트 → JS (push)
type Event    = { v: 1; plugin: string; event: string; data?: unknown };

type ErrorCode = "UNSUPPORTED" | "PERMISSION_DENIED" | "CANCELLED"
               | "INVALID_ARGS" | "NOT_FOUND" | "NOT_ALLOWED" | "INTERNAL";

// v1.1 (v는 1 그대로; 필드와 예약 이름만 더한다)
Request  += { doc?: string }            // 부른 문서. 페이지 런타임은 항상 보낸다
Response += { doc?: string; seq?: number }
Event    += { doc?: string; seq?: number }
```

**v1.1 (2026-09-26, 아키텍처 검토 1단계; `cancel`은 2026-09-27 3단계)**. 호스트가 말하는 기능은 boot.json `bridge.features`(`["doc", "seq", "once", "cancel"]`, `protocol.ts`의 `BRIDGE_FEATURES`)로 알린다. 이 목록은 UP-3 지문에도 들어가므로, 기능이 다른 셸에서는 웹 번들이 돌지 않는다.
- **cancel** (3단계, RN 0.87의 웹 표준 모양)
  - JS: 모든 메서드의 마지막 인자 `{ signal }`(`CallOptions`). 기한 옵션은 따로 없고 `AbortSignal.timeout(ms)`·`AbortSignal.any`를 쓴다. 이미 abort된 signal이면 보내지 않고 거절한다. 나중에 abort되면 `$bridge.cancel { id, reason: "abort" | "timeout" }`을 보내고 바로 거절한다(CANCELLED, timeout이면 TIMEOUT). 늦게 온 답은 대기 중 호출이 없어 버려진다. 웹 구현은 `ctx.signal`을 받는다. 구독은 `listen(event, fn, { signal, once })`.
  - 오류: 코드 `TIMEOUT`을 더했다(계약 errorCodes). `AkanNativeError.name`은 코드에서 만든다: CANCELLED→AbortError, TIMEOUT→TimeoutError, PERMISSION_DENIED·NOT_ALLOWED→NotAllowedError, UNSUPPORTED→NotSupportedError, NOT_FOUND→NotFoundError(나머지 AkanNativeError). 오류 본문에 선택 필드 `data`와 `retryable`을 더했다.
  - dev 빌드는 JSON이 바꾸거나 못 싣는 인자(함수, Map·Set, 클래스 인스턴스, Date, NaN·Infinity, BigInt, 순환)를 INVALID_ARGS(`name` DataCloneError)로 거절한다.
  - 호스트: 같은 문서의 진행 중 호출 표에서 찾아 바로 CANCELLED/TIMEOUT으로 답하고 플러그인에 알린다(데스크톱 `ctx.signal`, 모바일 `onCancel`). 이미 끝난 호출이면 `{ cancelled: false }`. 데스크톱은 요청이 HTTP로 따로 와서 취소가 호출을 앞지를 수 있다: 아직 받지 않은 id의 취소는 기억해 두고(최근 64개), 호출이 오면 실행하지 않고 답한다. iOS·Android는 한 줄로 오므로 필요 없다.
  - 후속 호출 허가: `$bridge.cancel`·`$bridge.release`는 예약 op이고 ACL 항목이 없다. 취소는 같은 문서의 호출 id만, 해제는 추측할 수 없는 FileRef URL을 가진 쪽만 할 수 있다. 플러그인 manifest의 메서드·이벤트 이름은 글자로 시작해야 하고(`$` 이름은 브리지 것) 예약 이름(id, listen, then …)이 아니어야 한다(빌드 오류).
  - 공통 벡터 bridge.json에 `$bridge` 요청 검사 13건(네 커널).
- **doc**: 페이지 런타임이 문서(페이지 로드)마다 추측할 수 없는 id(16바이트 hex)를 만들어 모든 요청에 붙인다.
  - 호스트는 창마다 현재 문서를 기억한다. 새 id의 요청이 오거나 메인 프레임 내비게이션이 commit되면 이전 문서를 끝낸다(구독 정지).
  - 끝난 문서의 요청은 거절한다("the page that made this call is gone").
  - 전에는 호스트마다 끝내는 신호가 달랐다(iOS provisional 시작, 데스크톱 commit, Android claim). iOS는 provisional 대신 commit(`didCommit`)으로 옮겼다. provisional 내비게이션은 실패하거나 다운로드로 바뀌어 페이지가 그대로 남을 수 있기 때문이다. Android는 포트 claim이 곧 새 문서다.
  - `doc`이 없는 요청(v1 호출자, 테스트)은 id 없는 문서로 처리하고, 번호도 거절도 없다. 다만 id 있는 문서가 현재 문서이면 INVALID_ARGS("request has no document id")로 거절한다. 그 답에 붙은 번호는 페이지 런타임이 보지 못해 빈 번호가 되고, 그 id는 런타임의 같은 id 요청을 막기 때문이다. 런타임은 항상 doc을 붙이므로 IPC를 직접 부르는 코드에서만 생긴다.
- **seq**: 호스트는 현재 문서의 응답과 이벤트에 1부터 번호를 붙인다. 붙이는 곳은 보내기 직전의 직렬화 지점이다(데스크톱 Worker, iOS 메인 액터, Android 메인 루퍼).
  - 페이지는 번호 순서로 전달한다. 응답과 이벤트는 다른 경로로 와서 순서가 바뀐다. 데스크톱은 HTTP 응답과 `evaluate_script`, iOS는 reply와 `callAsyncJavaScript`다.
  - 빠진 번호는 `SEQ_GAP_MS`(500ms)만 기다린 뒤 건너뛰고, dev 빌드에서 경고한다. 늦게 온 번호는 도착한 대로 전달한다.
  - 시험: 런타임의 타이머(`Runtime.timers`)를 가상 시계로 바꾼 `packages/core/test/order.test.ts`가 도착 순서 150가지(시드 고정 난수)를 돌린다. 모든 순서에서 페이지가 번호 순서로 받고, 응답을 await한 코드가 뒤따르는 이벤트보다 먼저 돈다. 빈 번호 타이머도 실제 대기 없이 가상 시간으로 확인한다.
  - 다른 문서의 메시지는 버린다. 다른 문서의 응답을 받은 호출은 INTERNAL로 끝난다.
- **응답 뒤 이벤트**: 응답 다음 번호의 이벤트는 다음 태스크까지 기다린다. 응답을 await한 코드는 마이크로태스크에서 돌기 때문에, 같은 태스크에서 리스너를 부르면 그 코드보다 먼저 돈다(예: 이벤트가 가리키는 id를 페이지가 아직 모름). 뒤따르는 메시지도 순서대로 함께 기다린다.
- **once**: 문서의 요청 id는 한 번만 실행한다. 같은 id가 다시 오면 id `-1`인 INVALID_ARGS로 답한다. 원래 호출은 첫 답을 기다리므로 다른 id로 답한다. Android는 답하지 않고 버린다.
  - 데스크톱 요청은 HTTP로 와서 서로 앞지를 수 있다. 그래서 "마지막 id보다 작으면 반복"이 아니라, 최근 id 1024개는 집합으로, 그보다 오래된 id는 하한으로 판정한다(`CallIds`, `AkanNativeCallIds`).
  - 호스트는 문서마다 진행 중인 호출을 안다. 끝난 문서의 호출이 늦게 끝나면 그 답에 번호를 붙이지 않는다(페이지가 doc으로 버림). 취소는 이 표 위에 붙였다(아래 cancel).
- **bfcache**: 뒤로가기 캐시에서 복원된 페이지(`pageshow`의 `persisted`)는 다시 로드한다. 호스트가 그 문서를 이미 끝내서 호출을 거절하고 구독도 없기 때문이다.
- **dev 빌드의 `$host` 셀프 테스트 메서드**(release에는 없음):
  - `echo`: 답한 직후 같은 값으로 `$host`/`echo` 이벤트를 보낸다.
  - `info`(모바일): App 인스턴스, 번들 선택 횟수, 만든 창 수를 준다.
  - `recreate`(모바일): 같은 프로세스에서 창을 다시 만든다. iOS는 scene 재연결처럼 뷰 컨트롤러를 새로 만들고, Android는 `recreate()`한다.
  - 셀프 테스트는 이 메서드로 순서 1000회와 App 범위 유지를 확인한다.
  - 실측(응답 → 이벤트 순으로 보냈을 때 이벤트가 먼저 도착한 수, 1000회 중): macOS 6, Linux 7, Windows 58, iOS 1, Android 0. 모든 경우 페이지는 응답을 먼저 보았다.

- 구독은 예약 메서드로 한다: `{ method: "$listen", args: { event } }`, `{ method: "$unlisten", args: { event } }`. 호스트는 플러그인·이벤트별 구독 수를 세서 네이티브 소스를 켜고 끈다.
  - JS는 같은 이벤트의 첫 리스너에서 `$listen`, 마지막 리스너가 빠질 때 `$unlisten`을 한 번만 보낸다. 해제는 마이크로태스크 하나만큼 미뤄서 StrictMode의 unmount→mount가 호스트까지 가지 않는다 (PL-6).
  - 같은 이벤트의 `$listen`/`$unlisten`은 앞 요청이 끝난 뒤 보낸다. fetch 전송(데스크톱)에서도 순서가 뒤바뀌지 않는다.
  - 페이지가 다시 로드되면 호스트는 그 페이지의 구독을 모두 버린다.
- 큰 결과는 `{ url: "/__akan_native/file/<id>", mime, size }` 형태로 돌려준다 (PL-7).
- **모든 전송에서 메시지는 JSON 텍스트다.** iOS도 `postMessage(JSON.stringify(req))`로 보내고 JSON 텍스트로 답한다. 값 변환(NSNumber 불리언, null, undefined)이 호스트마다 달라지지 않게 하기 위해서다.
- 요청 id는 무작위 값에서 시작한다. 페이지를 다시 로드하기 전에 보낸 요청의 늦은 응답이 새 요청과 섞이지 않게 하려는 것이다 (`capacitor/core/native-bridge.ts`의 `callbackIdCount`).
- web 구현은 **동기로** 호출한다(첫 await 전에 구현 함수에 들어감). `<input type=file>.click()`처럼 사용자 클릭의 user activation이 필요한 API 때문이다.

| 플랫폼 | JS → 호스트 | 응답 | 이벤트 push |
|---|---|---|---|
| Web | (없음, web 구현 직접 호출) | – | – |
| macOS | `fetch("/__akan_native/ipc", { method: "POST", headers: { "x-akan-native-ipc": "1" }, referrerPolicy: "same-origin", body: JSON 텍스트 })` | HTTP 응답 본문 | `evaluate_script("__AKAN_NATIVE__.receive({...})")` |
| iOS | `webkit.messageHandlers.akanNative.postMessage(JSON 텍스트)` | 반환된 Promise (WithReply, JSON 텍스트) | `callAsyncJavaScript` (인자로 JSON 텍스트) |
| Android | `port.postMessage(JSON 텍스트)` (포트는 `/__akan_native/hello?n=<nonce>` 뒤에 `postWebMessage`로 받고 `akan-native:claim`을 먼저 보냄) | 같은 포트 | 같은 포트 |

`@akanjs/native/core`는 `Transport { send(req): Promise<Response> }` 인터페이스 하나 뒤에서 위 구현 중 하나를 고른다. 플랫폼별 부분(`Channel.post`)은 요청을 보내고 답을 돌려줄 뿐이다. 응답(데스크톱·iOS는 `post`의 반환값, Android는 포트)과 이벤트(`__AKAN_NATIVE__.receive`, 문자열·객체 모두 받음)는 모두 같은 `receive()`를 지나며 doc과 seq를 거친다.

- 데스크톱 IPC 출처 확인(SEC-1): WebKit은 같은 오리진 POST에 `Origin`을 붙이지 않고 `Referer`만 보낸다. 그래서 `Origin`이 있으면 `app://localhost`, 없으면 `Referer`가 `app://localhost/`로 시작해야 한다. 커스텀 스킴에는 CORS preflight가 없으므로 `x-akan-native-ipc` 표식은 보안 수단이 아니라 우발적 폼 POST와 구분하는 용도다. `Blob` body는 0바이트로 도착하므로 쓰지 않는다.
- **dev 빌드의 페이지 console 포워딩(WV-3)**: `@akanjs/native/core`가 console과 잡히지 않은 오류를 예약 플러그인 `$console`(method = 레벨, args = `{ message }`)로 호스트에 보낸다. 호스트(데스크톱, iOS)는 메시지의 줄마다 `[page<+><#창> <level>] …` 태그를 붙여 stdout 한 곳으로 출력한다. `+`는 여러 줄 메시지의 이어지는 줄, `#n`은 첫 창이 아닌 창이다. akan CLI(devkit `NativeAppLine`)가 이 태그에서 레벨을 다시 읽어 자기 로거로 한 번만 찍는다. Android도 dev 빌드에서는 같은 `$console` 경로로 보내고(런타임이 먼저 `attach`를 보낸다), 호스트가 그 레벨을 logcat priority로 쓴다. `attach` 뒤로는 `WebChromeClient.onConsoleMessage`가 비켜서고, 그 전의 출력(런타임이 뜨기 전 오류)과 release 빌드는 여전히 이쪽으로 logcat에 남는다. iOS는 os_log에도 페이지 레벨 그대로 쓴다.

## 5. 에셋 서빙 규칙

| 오리진 | 플랫폼 |
|---|---|
| `app://localhost` | macOS, iOS (Linux도 같은 형태가 될 예정) |
| `https://app.localhost` | Android, Windows |

- 원격 서버가 받는 `Origin`(O7, 2026-09-26 실측: iOS 26.5 시뮬레이터, Android 17 에뮬레이터 WebView, 로컬 서버)
  - 앱 오리진 값 그대로다. "null"이 아니다. iOS는 `app://localhost`, Android는 `https://app.localhost`.
  - 교차 오리진 fetch GET, preflight OPTIONS, `Authorization`을 단 POST, `credentials: "include"`, no-cors POST, WebSocket 업그레이드가 모두 같다.
  - `Referer`는 보내지 않는다. `Sec-Fetch-Site: cross-site`다(Android WebSocket은 `Sec-Fetch-*` 없음).
  - 서버의 CORS·CSRF 검사는 이 두 값을 정확히 허용하면 된다. `Referer`에 기대면 안 된다.
- 페이지가 자기 오리진으로 서버 주소를 만들면 안 된다. `app:`은 WebSocket 스킴이 아니라서 iOS·macOS에서 `new WebSocket(new URL("/ws", location.origin))`은 SyntaxError를 던진다(akan CSR에서 재현). Android WebView는 `https:`를 `wss:`로 바꿔 받아 주지만(확인) 서버가 없는 주소다. 서버 주소는 env로 명시한다.

| 경로 | 응답 |
|---|---|
| `/__akan_native/init.js` | 호스트가 생성: platform, env(병합 결과), plugins, runtimeVersion |
| `/__akan_native/ipc` | (데스크톱만) 브리지 요청 |
| `/__akan_native/hello?n=<nonce>` | (Android만) 브리지 포트 요청. 204로 응답하고 포트는 `postWebMessage`로 보낸다(`akan-native:port:<nonce>`). nonce가 없거나 형식이 틀리면 400, `Referer`가 앱 오리진이 아니면 403 |
| `/__akan_native/file/<id>` | 플러그인이 등록한 임시 파일 (앱 세션 동안만 유효). id는 `[A-Za-z0-9_-]{1,128}` + 선택적 확장자(ASCII 영숫자 1~8자) |
| 그 외 `/__akan_native/*` | 404 |
| 앱 폴더에 있는 파일 | 그대로 (MIME은 확장자 기준) |
| 없는 경로, 마지막 조각에 확장자 없음 | `index.html` (SPA 폴백) |
| 없는 경로, 확장자 있음 | 404 (없는 이미지가 HTML로 응답되지 않게) |
| `..`, `.`, `\`, NUL이 든 경로, 잘못된 퍼센트 인코딩(`%+1` 포함) | 404 (정규화하지 않고 거절) |
| 조각에 `:`가 든 경로 | 파일로 찾지 않는다. 확장자가 없으면 SPA 폴백, 있으면 404 |

**계약 커널과 공통 벡터 (2026-09-26 아키텍처 검토 2단계)**. 모든 구현은 같은 벡터를 통과해야 한다. 예전에는 "TS 코드와 설명 문장"을 기준으로 삼아 호스트가 옮겼기 때문에, 언어별 라이브러리 동작이 섞여 들어왔다. 예: Kotlin `toIntOrNull(16)`이 `%+1`을 받음, 호스트마다 다른 Range 해석, Swift ACL 로더의 fail-open.
- **표와 상수는 생성한다.** 원천은 `packages/core/contract.json` 하나다(오류 코드, MIME, id 문법, 외부 열기·프레임 스킴과 절대 더할 수 없는 스킴, 예약 경로, INIT_PREFIX/SUFFIX, Range 상한, 외부 열기 빈도). `bun scripts/contract.ts`가 `packages/core/src/contract.ts`, `native/desktop/src/contract.rs`, `AkanNativeContract.swift`, `AkanNativeContract.kt`를 쓰고, 생성물이 낡았으면 `bun test`가 실패한다.
- **알고리즘은 생성하지 않고 언어마다 한 파일에 둔다.** TS `packages/core/src/kernel.ts`(+ `protocol.ts` validateRequest, `acl.ts`), Rust `routes.rs`·`navigation.rs`, Swift `AkanNativeKernel.swift`·`AkanNativeAcl.swift`, Kotlin `AkanNativeKernel.kt`·`AkanNativeAcl.kt`. 버그의 원인인 라이브러리 동작은 생성한 코드에도 그대로 남기 때문이다.
  - 대상: 경로 디코딩·라우트·호스트 경로, MIME, Range, id 문법, 요청 검증, 문서 수용 판정(doc), 선언 게이트, ACL 로딩·검사·스코프 매칭, 내비게이션 판정.
- **벡터**(`packages/core/vectors/`: scope, routes, ranges, ids, bridge, navigation, acl)를 네 곳에서 돌린다.
  - TS: `bun test`
  - Rust: `cargo test`(`vectors.rs`)
  - Mac: `bun scripts/native-vectors.ts`. Swift는 swiftc로, Kotlin은 고정한 kotlinc의 JVM에서 돌리며, Kotlin 쪽은 JSON 리더 없이 생성한 리터럴을 쓴다.
  - 기기: dev 빌드 셀프 테스트의 `$host.vectors`. Android ICU와 iOS Foundation은 Mac의 것과 다르다.
  - Swift는 러너(`AkanNativeVectors.swift`)가 JSONSerialization으로 읽는다. 브리지가 요청을 읽는 방식과 같다. release 빌드는 빈 데이터를 넣는다.
  - http 플러그인의 URL 정규화는 `plugins/http/test/vectors/canonical.json`으로 같은 방식을 쓴다.
  - 결과: TS·Rust 모두 통과, Swift·Kotlin 436/436(Mac)·316/316 이상(기기), http 26/26.
- 벡터가 찾아 고친 차이:
  - Kotlin: `%+1`을 디코딩함, 잘못된 Range 헤더에 다르게 답함, 이름 검증 없음, 검증 전에 문서를 끝냄.
  - Swift: Range 끝값이 잘못돼도 206, 버전이 `true`이거나 1.5여도 통과, ACL 로더 fail-open.
  - FileRef id 확장자: 데스크톱은 거르지 않고 iOS는 비ASCII를 통과시켜, 라우트가 거부하는 id를 만들었다.
  - 데스크톱 번들 id가 `.`과 `..`을 통과시킴.
  - `shellError`가 NOT_ALLOWED를 INVALID_ARGS로 바꿈.
  - MIME 표 네 벌이 서로 달랐고, iOS·Android는 OS 표로 빠졌다.
  - 이제 표 하나로 맞췄고, 모르는 확장자는 모두 octet-stream이다.
- `:` 규칙(2026-09-26 검토 반영): Windows에서 `app_dir.join("C:/Users/…")`는 기준 폴더를 버린다. 그래서 페이지가 `fetch("/C:/Users/<u>/.ssh/id_rsa")`로 사용자가 읽을 수 있는 모든 파일을 받을 수 있었다(VM에서 재현: `/C:/Windows/win.ini`가 200). `a:b`는 NTFS 대체 데이터 스트림이다. 데스크톱은 여기에 더해 `asset_path()`가 경로 구성 요소가 모두 일반 이름인지 확인한다. 셀프 테스트 "drive-letter paths stay in the app folder"가 모든 플랫폼에서 확인한다.
- Range: 한 응답은 최대 1000 KiB다(Tauri asset 프로토콜과 같음). 데스크톱은 요청 범위만 seek해서 읽고, iOS는 매핑한 파일에서 그만큼만 복사한다. Range 없는 요청은 파일 전체다. Android는 원래 스트림으로 보낸다.
  - `bytes=` 범위 하나만 지원한다(RFC 9110 §14). 다른 단위, 여러 범위, 문법 오류, 끝이 시작보다 앞인 경우는 무시하고 200으로 전체를 준다.
  - 문법이 맞지만 파일이 만족할 수 없는 범위(시작 ≥ 크기, `-0`, 빈 파일)는 416이다.
  - 숫자는 ASCII 18자리까지다. 예전에는 Rust·Swift가 잘못된 헤더에 416, Kotlin은 200이었다.

### 보안: CSP와 프레임 (SEC-4)

- `strict` 밖에 앱이 더해야 할 수 있는 것(O3, akan CSR 15MB로 2026-09-26 확인. 두 엔진 모두 같은 위반)
  - WebAssembly를 쓰면 `script-src`에 `'wasm-unsafe-eval'`. 없으면 `WebAssembly.instantiate()`가 거절된다. `'unsafe-eval'`은 필요 없다.
  - `<base href>`를 쓰면 `base-uri 'self'`. strict는 `base-uri 'none'`이다.
  - blob: Worker는 strict의 `worker-src 'self' blob:`로 이미 된다.
  - 원격 API와 WebSocket 서버는 `connect-src`에 적는다.

위협 모델과 막는 위치:

| 위협 | 막는 것 |
|---|---|
| 앱 페이지의 XSS(주입된 스크립트) | `security.csp`. 빌드가 index.html의 인라인 `<script>`·`<style>` 해시를 script-src·style-src에 넣으므로 `'unsafe-inline'`·`'unsafe-eval'` 없이 앱이 돈다. 주입된 인라인 스크립트, `eval`, 외부 스크립트 로드가 막힌다(셀프테스트: `script-src-elem` 위반). 기존 함수를 부르는 DOM XSS는 막지 못하며, 메인 프레임의 코드는 브리지를 온전히 쓴다 |
| 제3자·신뢰하지 않는 콘텐츠를 담은 iframe(광고, 위젯, sandbox iframe에 띄운 사용자 HTML) | 네이티브에 닿지 못한다. iOS: `frameInfo`가 메인 프레임 + `app://localhost`일 때만. Android: 포트는 `postWebMessage(targetOrigin)`로 메인 프레임에만, 페이지는 자기 nonce의 포트만 받고 셸은 claim 때만 교체(위 §3.5). 데스크톱: 불투명 오리진은 `Origin: null`이라 403(커스텀 헤더 때문에 preflight부터 실패할 수 있다). 교차 오리진 프레임은 `parent.__AKAN_NATIVE__`에 접근할 수 없다. 셀프테스트가 네 플랫폼에서 sandbox iframe으로 모든 전송(ipc, hello, messageHandlers, 부모 접근, 가짜 포트)을 시도해 부작용(preference 쓰기)이 없음을 확인한다 |
| 같은 오리진 iframe(앱 자신의 페이지) | 앱 코드와 같은 권한(부모를 직접 스크립트할 수 있다)이라 경계가 아니다. 다만 페이지의 브리지를 흔들지 못한다: 런타임은 하위 프레임에서 hello를 보내지 않고 즉시 UNSUPPORTED(SEC-1), Android hello는 claim 전까지 아무것도 바꾸지 않는다. 데스크톱 커스텀 스킴 요청은 프레임을 구별할 수 없어 같은 오리진 프레임의 raw fetch는 받는다 |
| 앱 오리진에서 서빙되는 사용자·원격 콘텐츠(고른 파일, 받은 파일, 쓴 파일의 FileRef) | FileRef는 앱의 문서가 되지 않는다(N1, Capacitor GHSA-rvm3-566m-v7fv와 같은 구조). 최상위 문서로 `/__akan_native/*`에 가는 이동은 네 호스트 모두 막고, iframe은 `/__akan_native/file/*`만 연다(`decideNavigation`, 벡터). Android는 서버도 메인 프레임의 `/__akan_native/*` 요청에 403을 준다(shouldOverrideUrlLoading이 보지 못하는 이동 때문). FileRef 응답에는 `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`을 붙이고, 이미지(SVG 제외)·오디오·비디오·폰트·PDF가 아니면 `Content-Security-Policy: sandbox`도 붙인다(`fileRefSandboxed`). PDF를 뺀 것은 macOS WebKit이 sandbox PDF를 그리지 않기 때문이다(iOS와 WebView2는 그린다, 2026-09-26 확인). PDF 뷰어는 페이지 스크립트를 돌리지 않고, nosniff 때문에 `.pdf` 이름의 HTML도 PDF로만 다뤄진다. sandbox 문서는 불투명 오리진이라 스크립트가 돌지 않고 브리지와 부모에 닿지 못한다. 셀프 테스트가 브리지와 부모를 건드리는 HTML FileRef를 iframe으로 열어 부작용이 없음을 확인한다(다섯 플랫폼). 헤더를 빼면 macOS에서 스크립트가 부모에 닿는 것을 재현했다. 문서로 보여 줘야 하는 파일은 opener나 share로 넘긴다 |
| 앱 안에서 여는 OAuth·외부 페이지 | auth-session은 시스템 브라우저·ASWebAuthenticationSession·Custom Tabs를 쓰므로 외부 로그인 페이지가 앱 WebView에서 돌지 않는다. 메인 프레임이 앱 오리진 밖으로 가면 외부 브라우저로 연다(SH-4) |

CSP 전달 방식: `<head>`의 `<meta http-equiv>`(있으면 `<meta charset>` 바로 뒤, 스타일·번들보다 앞). 네 플랫폼과 모든 정적 web 호스트에서 같게 동작하고 네이티브 변경이 필요 없다. meta가 못 하는 `frame-ancestors`·`report-to`·`sandbox`는 WebView의 최상위 앱 페이지에는 해당이 없다(빌드가 경고와 함께 뺀다). web 배포에서 clickjacking을 막으려면 서버 헤더로 `frame-ancestors`를 준다. public/의 다른 HTML 파일에는 index.html의 정책이 적용되지 않는다.

기본값은 정책 없음(이전과 같음)이다. 원격 API·CDN을 쓰는 앱이 설정 없이 깨지지 않게 하려는 것이고, release 빌드는 한 줄로 `security.csp`를 안내한다. 권장은 `"strict"`(`packages/cli/src/lib/csp.ts` `STRICT_CSP`)이고 샘플이 쓴다.

도입하지 않은 것: Tauri의 isolation pattern(sandbox iframe이 IPC를 암호화·검사)은 앱 코드 자체가 오염된 경우를 겨냥하며 비용이 크다. `freezePrototype`(Object.prototype 동결)은 필요해지면 설정으로 더할 수 있다.

### 데스크톱 내비게이션 (SH-4, 2026-09-26 검토 반영)
`native/desktop/src/navigation.rs`. 예전에는 앱 오리진 밖으로 가는 이동을 스킴과 프레임을 가리지 않고 OS에 넘겼다(Windows `ShellExecuteW`, macOS NSWorkspace). 그래서 링크나 iframe이 `smb:`·`search-ms:`·다른 앱의 스킴을 확인 없이 실행할 수 있었고, WebKit은 iframe 이동에도 핸들러를 불러서 교차 출처 iframe(동영상, 지도, 결제 위젯)이 로드되지 않고 브라우저가 열렸다.
- 최상위 페이지: 앱 오리진과 `about:`만 로드한다. 그 밖은 취소하고, `http`·`https`·`mailto`·`tel`만 OS로 넘긴다(Tauri opener의 allow-default-urls). `file:`·`data:`·`blob:`·다른 스킴은 로그만 남기고 아무것도 열지 않는다. 페이지가 다른 프로그램을 여는 길은 opener 플러그인과 그 capability뿐이다.
- iframe: `http`·`https`·`data:`·`blob:`·`about:`는 그대로 로드하고, 다른 스킴은 막는다. iframe은 OS로 아무것도 넘기지 않는다.
- `window.open`·`target=_blank`: 외부 URL은 위 규칙대로 OS로 넘긴다. 앱 오리진 URL은 아무것도 열지 않는다(앱 창은 window 플러그인이 연다).
- 엔진마다 프레임을 구분하는 방법이 다르다.
  - WebView2: wry 핸들러는 최상위만 받는다(NavigationStarting). iframe은 `FrameNavigationStarting`을 직접 연결한다.
  - WKWebView: wry가 URL만 넘기므로, `WryNavigationDelegate`의 정책 메서드를 감싸 `targetFrame.isMainFrame`이 아니면 스레드 로컬에 표시한 뒤 wry의 원래 구현을 부른다.
  - WebKitGTK: 이동 요청에 프레임 정보가 없다. 그래서 wry 핸들러를 쓰지 않고 `decide-policy`를 직접 연결한다. http(s)·data·blob은 시작하게 두고 응답 단계(`is_main_frame_main_resource`, WebKitGTK 2.40+)에서 최상위 문서만 판단한다. 응답 전에 실패한 최상위 이동은 `load-failed`에서 WebKit 오류 페이지 대신 브라우저로 넘긴다. mailto·tel은 사용자 클릭(`is_user_gesture`)일 때만 연다.
- 셀프 테스트 "frames load other origins (SH-4)": CSP가 없는 같은 출처 페이지(`public/selftest-nav.html`) 안에 data: iframe과 막아야 할 스킴의 iframe을 두고, data: iframe이 로드되는지와 페이지가 앱에 머무는지 본다. index.html의 strict CSP는 data: 프레임을 막으므로 이렇게 한 단계를 둔다.
- iOS도 `window.open`의 `app://localhost`는 시스템으로 넘기지 않는다(`app:` 스킴을 가진 다른 앱이 경로와 쿼리를 받게 된다).

### 보안 계층 L0~L4 (2026-09-26 아키텍처 검토 2단계)
호출 하나가 지나는 순서다. 앞 계층이 막으면 뒤 계층은 보지 않는다.
- **L0 셸 정책.**
  - 내비게이션: 네 호스트가 같은 판정(`decideNavigation`, 벡터)을 쓴다. 전에는 iOS·Android가 모든 스킴을 OS로 넘기고 iframe에서는 무엇이든 로드했다.
    - 앱 오리진과 `about:`는 로드한다.
    - 최상위 이동은 외부 스킴(http·https·mailto·tel과 앱이 `security.shell.externalSchemes`로 더한 것)이면 OS로 넘기고, 아니면 버린다.
    - iframe은 http·https·data·blob·about만 로드하고 아무것도 열지 않는다.
    - `javascript`, `vbscript`, `file`, `data`, `blob`, `about`, `content`, `intent`, `app`은 외부 스킴에 더할 수 없다(빌드 오류).
  - 외부 열기는 사용자 제스처를 요구하지 않는 대신 초당 1회로 제한한다(`EXTERNAL_OPENS_PER_SECOND`).
    - 페이지의 링크와 플러그인의 열기(opener, browser, auth-session)가 한 카운터를 쓴다.
    - 데스크톱: 셸의 `external_open_allowed`. 플러그인 호스트는 C ABI `akan_native_external_open_allowed`로 같은 것을 묻는다(`externalOpenAllowed()`).
    - 모바일: `AkanNativeExternal.allowed()`.
    - 넘으면 링크는 로그만 남기고, 플러그인은 NOT_ALLOWED로 답한다.
    - 플랫폼 차이(Linux): WebKitGTK는 이동을 요청하는 단계에서 프레임을 알려 주지 않는다. 그래서 mailto·tel·앱이 더한 스킴은 프레임과 관계없이 사용자 제스처(`is_user_gesture`)가 있을 때만 연다. iframe의 클릭으로도 열 수 있고, 제스처 없는 최상위 이동으로는 열리지 않는다. http·https는 응답 단계에서 프레임을 가려 규칙대로 처리한다.
  - 카메라·마이크 권한은 앱 오리진의 메인 프레임에만 준다.
    - macOS: wry의 UI delegate 미디어 메서드를 감싸 오리진과 프레임을 본다(`navigation.rs` `mac::media_trusted`).
    - iOS: 전부터 같은 규칙이었다.
    - Android: 오리진을 스킴·호스트·포트까지 정확히 비교한다. 전에는 호스트 이름만 봤다.
    - Linux: WebKitGTK가 프레임을 알려 주지 않는다. 메인 프레임은 항상 앱 오리진이고, 교차 출처 iframe은 Permissions Policy(앱이 `allow=`를 주지 않는 한)가 막는다.
    - Windows: WebView2가 오리진을 보여 주며 묻는다.
  - iframe 내용은 CSP `frame-src`로 제한한다(`strict`는 `'self'`).
- **L1 전송.** SEC-1(앱 오리진·메인 프레임)과 요청 검증(`validateRequest`, 벡터)이다. iOS·Android도 이제 플러그인·메서드 이름 문법, 정수 id, 불리언이 아닌 `v`를 검사한다.
- **L2 선언 게이트.** 플랫폼의 boot.json `plugins`에 선언하지 않은 메서드·이벤트는 ACL과 플러그인보다 먼저 NOT_FOUND다(`declares`, 벡터). 모듈이 구현했어도 마찬가지다. 빌드는 ACL의 `items: "*"`를 manifest의 메서드와 `listen:` 이벤트 목록으로 펼친다.
- **L3 ACL.**
  - boot.json의 ACL 형식이 잘못되면 모두 거부하고 로그를 남긴다(fail-closed, `aclProblem`/`loadAcl`, `AkanNativeAcl.from`, 벡터 acl.json).
    - 전에는 Swift는 한 항목만 잘못돼도 전체 허용이거나 denial을 모두 버렸다.
    - Kotlin은 onCreate에서 죽었다.
    - TS는 문자열 `items`를 부분 문자열로 비교했고, 호출이 끝나지 않았다.
  - ACL이 없는 boot.json(capabilities 없는 빌드, 단위 테스트)은 전처럼 모두 허용한다.
- **L4 스코프.**
  - 경로 패턴(manifest `scope.pathFields`)
    - allow 항목에서는 `*`·`?`·`**`가 점으로 시작하는 이름에 맞지 않는다. `.config/**`·`**/.env`처럼 점을 직접 써야 맞는다.
    - deny 항목은 점 파일에도 맞는다(`private/**`가 `private/.env`도 막는다). 포트 규칙처럼 allow는 좁게, deny는 넓게다.
    - 대소문자를 구분하지 않는 볼륨(macOS·Windows 기본, Android 공유 저장소)에서는 대소문자를 통일한 뒤 비교한다(`scopePermits(…, fold)`). 데스크톱은 기준 폴더마다 이름의 대소문자를 바꿔 같은 폴더가 나오는지로 판단하고, iOS는 `volumeSupportsCaseSensitiveNames`를 본다.
  - filesystem은 세 플랫폼 모두 다음을 지킨다.
    - 적힌 경로를 먼저 검사하고, realpath로 해석한 위치가 다르면(심볼릭 링크) 그 위치도 검사한 뒤 바로 그 경로를 쓴다.
    - 재귀 복사·이동·삭제는 하위 항목이 모두 스코프 안이어야 한다. 전에는 `notes`를 복사하면 deny된 `notes/secret`이 사본으로 읽혔다.
    - `readDir`는 스코프 밖 항목을 목록에서 뺀다.
    - 전에는 iOS·Android가 해석한 위치를 다시 검사하지 않았다.
  - URL 패턴(`scope.urlFields`)은 `urlMatch`다(위 권한 ACL 절). http 호스트의 정규화는 호스트에 퍼센트 이스케이프를 받지 않는다. 글자 하나를 이스케이프해 deny를 피하지 못하게 하려는 것이다.
  - 예약 저장소: 셸과 플러그인의 저장소(설정, 보안 저장소, DB, 업데이트 번들, 창 상태, WebView 데이터)는 어떤 filesystem 기준 폴더에도 들지 않는다.
    - 데스크톱 FileRef는 일반 파일만, 그리고 앱 데이터 폴더 안에서는 `files/`(data 기준 폴더)만 등록할 수 있다(`paths.ts` `reservedDirs`).
    - 모바일은 기준 폴더 containment가 막는다. FileRef 등록 자체의 제한(검증된 경로, 셸 임시 폴더, 사용자가 고른 파일)은 이후 과제다.
- **옛 문법은 빌드 오류다.**
  - 스킴 없는 URL 패턴은 `https://…`를 제안한다.
  - `/`로 시작하거나 `\`·`..`이 든 경로 패턴은 고칠 형태를 제안한다.
  - manifest의 `url` 필드는 `urlFields`에 있어야 한다.
  - 포트 없이 허용한 `localhost`·`127.0.0.1`은 `:*`를 제안하는 경고다.

## 6. 플러그인 규격 v1

```
plugins/camera/
├─ package.json            name: "@akanjs/native/plugins/camera", peerDependencies: react
├─ native-plugin.json
├─ src/index.ts            API (definePlugin) + hook(useCamera) + 타입
├─ src/web.ts              web 구현
├─ src/desktop.ts          desktop 구현 (Bun Worker에서 실행). 생략하면 web 구현을 WebView에서 사용
├─ ios/CameraPlugin.swift
└─ android/CameraPlugin.kt
```

```jsonc
// native-plugin.json
{
  "id": "camera",
  "apiVersion": 1,
  "methods": ["takePhoto", "checkPermission", "requestPermission"],   // JS API 전체. 네이티브 구현은 모두 처리해야 함
  "events": [],
  "web": "./src/web.ts",
  "desktop": "web",                       // "web" | "./src/desktop.ts" | null(미지원)
  "macos": { "infoPlist": { "NSCameraUsageDescription": "Take photos with the camera." } },   // desktop "web"이 쓰는 권한 문구
  "ios": {                                // 객체(네이티브) | "web" | null
    "sources": ["ios/*.swift"],
    "class": "CameraPlugin",
    "frameworks": ["AVFoundation", "PhotosUI"],
    "infoPlist": { "NSCameraUsageDescription": "Take photos with the camera." }
  },
  "android": {                            // 객체(네이티브) | "web" | null
    "sources": ["android/*.kt"],
    "class": "com.akanjs.plugins.camera.CameraPlugin"
    // "permissions": [...], "applicationXml": "<provider …/>" (선택)
    // CAMERA는 선언하지 않는다: 선언하면 ACTION_IMAGE_CAPTURE가 권한 허용 전까지 SecurityException을 낸다 (검증)
  }
}
```

플랫폼별 인터페이스 (초안)
```ts
// JS: src/index.ts
export const camera = definePlugin<CameraApi>("camera", { web });
export function useCamera() { /* camera API를 감싼 hook */ }

// desktop: src/desktop.ts  (Bun Worker)
export default defineDesktopPlugin({
  id: "preferences",
  methods: { async get({ key }, ctx) { ... } },   // ctx: emit, registerFile, appDataDir, appLocalDataDir
});
```
```swift
// iOS (native/ios/Sources/AkanNativePlugin.swift). Swift 6 모드, 플러그인 코드는 main actor에서 돈다
@MainActor protocol AkanNativePlugin: AnyObject {
  static var id: String { get }
  init(context: AkanNativePluginContext)     // presenter, webView, windowScene, emit, registerFile, temporaryFile
  func handle(_ call: AkanNativeCall)        // call.method, call.args, call.resolve(...) / call.reject(.code, msg): 아무 스레드에서, 한 번만
  func startListening(_ event: String) // 첫 $listen
  func stopListening(_ event: String)  // 마지막 $unlisten 또는 페이지 재로드
}
```
```kotlin
// Android (native/android/src/com/akanjs/runtime/AkanNativePlugin.kt). 생성자 (AkanNativePluginContext), main 스레드에서 호출
interface AkanNativePlugin {
  fun handle(call: AkanNativeCall)
  fun startListening(event: String) {}
  fun stopListening(event: String) {}
  fun onNewIntent(intent: Intent) {}                     // plugins.md C3
  fun onConfigurationChanged(config: Configuration) {}
  fun onRestoredActivityResult(key: String, resultCode: Int, data: Intent?) {}   // 프로세스 재생성 뒤 결과 (C6)
  fun destroy() {}
}
// AkanNativePluginContext: activity, webView, emit, registerFile, captureTarget(name) → (File, content:// Uri) (C4),
//   startActivityForResult(key, intent, cb), requestPermissions(perms, cb), permissionState(perm) (C1), insets, onInsetsChanged
```
- 네이티브 플러그인은 모르는 메서드에 `NOT_FOUND`로 답한다. 메서드 목록은 manifest `methods`가 기준이다.

JS 쪽 라우팅 (`packages/core/src/plugin.ts`)
- Web 플랫폼: 항상 web 구현. 없으면 `UNSUPPORTED`.
- 네이티브 플랫폼: init.js `plugins[id]`가 `{methods}`에 그 메서드를 포함하면 네이티브, `"web"`이면 WebView 안에서 web 구현, 둘 다 아니면 `UNSUPPORTED`. 네이티브 호스트에서 web 구현으로 **자동 폴백하지 않는다** (예: macOS의 `useKeyboard`는 `UNSUPPORTED`).
- `definePlugin`은 메서드 목록을 명시적으로 받는다(Proxy를 쓰지 않음). 그래서 `plugin.methods`로 지원 표를 만들 수 있고, `then`·`$$typeof` 같은 속성 접근 문제가 없다 (Capacitor는 Proxy라서 `runtime.ts`에서 `$$typeof`, `toJSON`을 따로 막는다).

기본 hook API (MVP)

| 플러그인 | Promise API | hook |
|---|---|---|
| app-state | `getState() → { state }`, 이벤트 `change` | `useAppState() → "active" \| "inactive" \| "background"` |
| preferences | `get/set/remove({key,value})`, `keys()`, `clear()` — 값은 문자열 | `usePreference(key) → [value, set, ready]` (`set(null)`은 삭제) |
| keyboard | `getState() → { visible, height }`, `hide()`, 이벤트 `change` | `useKeyboard() → { visible, height, supported, hide }` |
| camera | `takePhoto({ source, direction, quality }) → { url, mime, size, width?, height? }`, `checkPermission()`, `requestPermission()` | `useCamera() → { supported, photo, pending, error, takePhoto }` |

등록 흐름: `akan-native.config.ts`의 `plugins` → CLI가 각 `native-plugin.json`을 읽음 → 플랫폼별 등록 코드 생성(`AkanNativeGeneratedPlugins.swift`, `AkanNativeGeneratedPlugins.kt`, 데스크톱 `gen/host-entry.ts`) → boot.json의 `plugins` 목록(`packages/cli/src/lib/native-plugins.ts`). 권한 항목은 Info.plist와 AndroidManifest에 합친다. 사용 설명 문구는 앱 설정 `usageDescriptions`로 덮어쓸 수 있다.

## 7. env 처리

```
akan-native.config.ts env.defaults
   < .env, .env.<mode>          (akan-native build 시점. PUBLIC_ 접두어만)
   < env.platforms.<p>, .env.<p>, .env.<mode>.<p>   (ENV-6: 플랫폼 층은 공통 층 전체보다 우선)
   = 빌드 결과 env.runtime.json  ← 패키징할 때 교체 가능
   < (데스크톱) AKAN_NATIVE_PUBLIC_*    프로세스 환경변수 (접두어를 뗀 이름으로 덮어씀)
   < (iOS·Android dev 빌드) AKAN_NATIVE_PUBLIC_* 환경변수 / intent extra akanNativeEnv (§3.1)
   → 호스트가 /__akan_native/init.js로 전달 → import { env } from "@akanjs/native/core"
```
- "빌드 타임"은 **akan-native build 시점**이다. SPA 번들러의 `define`(컴파일 상수)은 앱이 알아서 쓰는 별개 수단이다.
- 앱 ID, 이름, 버전은 env가 아니라 `akan-native.config.ts`의 앱 정보로 관리한다. 여기서 Info.plist와 AndroidManifest를 만든다 (ENV-5).
- 플랫폼 층(ENV-6)은 공통 층(`defaults`, `.env`, `.env.<mode>`) 전체보다 우선한다. Tauri가 `tauri.<platform>.conf.json`을 기본 설정 위에 합치는 것과 같은 규칙이다(`tauri/crates/tauri-utils/src/config/parse.rs:50-66`). 플랫폼 층 안에서도 설정 < `.env.<p>` < `.env.<mode>.<p>` 순서다. 모드와 상관없는 플랫폼 값(스토어 URL 등)은 설정 `env.platforms`에 둔다. 개발 때만 다른 값(Android 에뮬레이터에서 호스트 Mac을 가리키는 `10.0.2.2`)은 `.env.development.android`에 둔다. 플랫폼 이름은 모드 이름으로 쓸 수 없다(`--mode android`는 오류).
- 타입(ENV-7): 빌드할 때마다 `akan-native.config.ts` 옆에 `akan-native-env.d.ts`를 쓴다. 이 파일은 `@akanjs/native/core`의 `AkanNativeEnv` 인터페이스에 키를 더하는 모듈 보강이다. 키 목록은 development·production과 `.env.<mode>` 파일이 있는 모든 모드를 빌드 대상 플랫폼마다 합쳐서 구한다. 모든 조합에 있는 키는 `string`, 일부에만 있는 키는 optional이다. 값은 쓰지 않고 키 이름과 출처만 쓴다. 실행 시점에만 생기는 키(`AKAN_NATIVE_PUBLIC_*`)는 인덱스 시그니처로 읽는다(`noUncheckedIndexedAccess`이면 `string | undefined`). 앱 폴더나 그 위에 tsconfig.json이 있을 때만 쓰고, 내용이 바뀔 때만 쓰며, `akan-native dev` 감시에서는 제외한다.

## 8. 빌드 파이프라인

| 단계 | Web | macOS | iOS (시뮬레이터) | Android (에뮬레이터) |
|---|---|---|---|---|
| 1. 공통 | HTML 검사·삽입, 플러그인 수집, env 병합 | 같음 | 같음 | 같음 |
| 2. 생성 | `__akan_native/init.js` | `Info.plist`, `gen/main-entry.ts`·`gen/host-entry.ts`, `shell.json`, `AppIcon.icns` | `Info.plist`, `AkanNativeGeneratedPlugins.swift`, `shell.json`, `gen/Assets.xcassets`(앱 아이콘, launch screen 색·이미지) | `AndroidManifest.xml`, `AkanNativeGeneratedPlugins.kt`, `proguard.pro`, `assets/akan-native/*.json`, `gen/res/`(테마, 색, adaptive icon, 스플래시 이미지) |
| 3. 컴파일 | – | `cargo build` (native/desktop, 증분) + `bun build --compile main-entry host-entry` | `xcrun -sdk iphonesimulator swiftc -swift-version 6 -parse-as-library -target arm64-apple-ios26.0-simulator` (소스 해시가 같으면 건너뜀), `xcrun actool` → `Assets.car` (catalog 해시가 같으면 건너뜀) | `aapt2 compile --dir res` (res 해시가 같으면 건너뜀), `kotlinc -no-jdk -no-stdlib -no-reflect` → dev: `d8 --debug` + 캐시한 kotlin-stdlib dex(`classes2.dex`), release: R8 (소스 해시가 같으면 건너뜀) |
| 4. 패키징 | 폴더 복사 | `.app` 조립 | 평평한 `.app` 조립 (실행 파일 + Info.plist + app/ + json 3개) | `aapt2 link`(manifest + 컴파일한 res) → **Bun APK 조립기**(dex STORED, assets, 4바이트 정렬; `zip`·`zipalign` 불필요) |
| 5. 서명 | – | `xattr -cr` → dylib → 번들 순서로 `codesign -s -` | `codesign -s -` (시뮬레이터에선 없어도 됨) | `apksigner --v1-signing-enabled false` + `~/.akan/native/debug.keystore`(없으면 keytool로 생성) |
| 6. 실행 (`akan-native run`) | `Bun.serve`로 정적 서빙 | 실행 파일을 직접 실행 (stdout = 로그) | 시뮬레이터 선택·생성·부팅 → `simctl install` → `simctl launch --console-pty` | 기기 없으면 `emulator -avd` → `adb install -r` → `am start -S -W` (+ `--es akanNativeEnv`) → `logcat --pid` |

측정(샘플 앱, 이 Mac): macOS dev 빌드 약 7초(cargo 증분 포함), iOS swiftc 약 2.3초, Android 첫 빌드 7.4초·이후 Kotlin 변경 없으면 약 1초. APK: debug 2.8MB(stdlib dex 포함), R8 release는 조사 기준 78KB + 웹 번들.

빌드 프로필(2026-09-26 검토 반영): debug와 release를 env 모드(`--mode`, `.env.<mode>`)와 분리했다. 예전에는 `production`이 아닌 모드가 모두 개발 빌드였다(staging이 inspectable WebView, debug 서명, localhost 평문 허용으로 나갔다). `--release`는 받기만 하고 쓰지 않았다.
- `akan-native build`는 release, `akan-native run`은 debug가 기본이다. `--release`·`--debug`로 바꾼다(Tauri `tauri build`·`tauri dev`와 같은 기본값). `akan-native dev`·`akan-native test`는 항상 debug, `akan-native update publish`는 release(`--debug`는 업데이트 흐름 시험용)다.
- 웹 빌드에는 `AKAN_NATIVE_MODE`와 함께 `AKAN_NATIVE_PROFILE`을 넘긴다. 샘플은 압축과 `NODE_ENV`를 프로필로 정한다.
- 명령마다 아는 플래그만 받는다. 모르는 플래그(`--relase` 같은 오타)는 오류다.
- 데스크톱 컴파일: `bun build --compile`은 PATH의 bun이 아니라 CLI를 실행 중인 bun(`process.execPath`)을 쓰고, `--no-compile-autoload-dotenv --no-compile-autoload-bunfig`를 붙인다. Bun의 standalone 실행 파일은 기본으로 실행 폴더의 `.env`·`bunfig.toml`을 읽어서, 앱 옆의 `.env`가 환경을 바꿀 수 있었다(예전 `AKAN_NATIVE_LIB`로 다른 라이브러리를 로드시키는 것까지 재현됨). 앱은 환경 변수로 라이브러리·리소스 경로를 바꾸지 않는다(`resolvePaths`).
  - 알려진 한계: `BUN_BE_BUN=1`로 앱 실행 파일을 띄우면 Bun CLI처럼 동작해 임의 JS를 실행한다(Electron의 `ELECTRON_RUN_AS_NODE`와 같은 부류). Bun 1.4.2에는 끄는 옵션이 없다. 환경 변수를 정할 수 있는 쪽은 이미 그 사용자 권한으로 코드를 실행할 수 있으므로 경계를 넘지는 않지만, 서명된 앱의 신뢰를 빌리는 경로가 된다.
  - 내장 서버(`desktop.server`)는 이 동작으로 서버를 띄운다. 런타임을 하나 더 넣으면 앱이 약 60MB 커진다. Bun CLI처럼 작업 폴더의 `.env`·`bunfig.toml`(preload 포함)을 읽고 없는 패키지를 설치하므로, `--no-env-file`, `--config=<Resources>/server.bunfig.toml`(빈 파일), `--no-install`로 모두 끈다(Bun 1.4.2에서 확인).
- 데스크톱 플러그인 모듈 검사: 빌드와 `akan-native plugin check`가 desktop 모듈을 불러 manifest(또는 `desktop` subset)의 메서드·이벤트와 비교한다. 선언한 이벤트의 source가 없으면 페이지의 `$listen`이 NOT_FOUND가 된다. 이 검사로 updates의 `progress`(다운로드 진행률이 페이지에 가지 않았다), app의 `backButton`, browser의 쓰이지 않는 `close`를 고쳤다.

## 9. 데스크톱 FFI 경계 (C ABI v0.2)

```c
uint32_t akan_native_abi(void);                              // major << 16 | minor. main.ts가 dlopen 직후 major를 확인한다
int32_t  akan_native_init(uint8_t dev);                      // Worker를 만들기 전에 main.ts가 부른다. release(dev 0)는 엔진 디버그 변수를 지운다
size_t   akan_native_last_error(uint8_t* buf, size_t cap);    // akan_native_run이 실패한 이유(UTF-8). 전체 길이를 반환
uint8_t  akan_native_external_open_allowed(void);            // 외부 열기 빈도 제한(L0)을 셸과 플러그인이 같이 쓴다
void     akan_native_set_wake(void (*wake)(void));          // Worker가 호출. wake는 threadsafe JSCallback.
                                                      // NULL = 호스트 종료: 보류·이후 IPC는 503 (죽은 콜백을 부르지 않는다)
int32_t  akan_native_run(const char* config_json);           // main 스레드 전용. 정상이면 반환하지 않음
                                                      // -1 main 아님, -2 설정 오류, -3 창, -4 웹뷰, -5 웹뷰 엔진 없음(설치 안내는 akan_native_last_error)
uint32_t akan_native_poll(uint8_t* buf, uint32_t cap);        // 다음 프레임 [u8 kind][u64 reqId LE][u32 webviewId LE][body]
                                                      // kind 1 = IPC(body = 페이지가 보낸 바이트), 2 = 네이티브 이벤트(JSON).
                                                      // kind 2의 reqId는 0 또는 감시 id(quitRequested·closeRequested, D4)
                                                      // 0 = 없음, cap보다 크면 필요한 크기를 반환(소비하지 않음). 호출마다 wake 플래그 해제
void     akan_native_respond(uint64_t req_id, uint16_t status,
                      const char* content_type, const uint8_t* body, uint32_t len);   // 즉시 반환, 응답은 main에서
void     akan_native_emit(uint32_t webview_id, const char* js);   // main 스레드로 넘겨 evaluate_script
void     akan_native_register_file(const char* id, const char* path, const char* mime);
uint8_t  akan_native_unregister_file(const char* id);        // v0.2: FileRef 해제($bridge.release). 1 = 등록돼 있었음
void     akan_native_quit(int32_t code);                     // 종료. quitRequested에 대한 "예"이기도 하다
void     akan_native_quit_cancel(void);                      // reason "session"(로그아웃) quitRequested에 대한 "아니오"
void     akan_native_shell(uint64_t id, const char* json);   // {"op":"window.setTitle",...} → main 스레드에서 실행,
                                                      // 답은 네이티브 이벤트 {"type":"shellReply","id",ok,result|error}
```
- 설정 JSON은 wry/tao 의존성 트리에 없는 serde 대신 작은 자체 파서로 읽는다(`native/desktop/src/json.rs`).
- v0.1(2026-09-26 차세대 검토)
  - `akan_native_abi`: 미리 빌드한 라이브러리가 다른 major 버전이면 앱이 시작하지 않는다.
  - `akan_native_init`: release 빌드는 엔진을 만들기 전에 다음 변수를 지운다. 사용자 환경의 이런 값이 디버거 포트를 열거나 WebKit 샌드박스를 끄거나 TLS 키를 남기기 때문이다(Tauri CEF #15995). 디버그 포트는 argv로 받지 않는다.
    - `WEBVIEW2_*`, `WEBKIT_INSPECTOR*`, `WEBKIT_DISABLE_SANDBOX*`, `WEBKIT_FORCE_SANDBOX`, `SSLKEYLOGFILE`
    - Bun의 `delete process.env`는 C 환경을 바꾸지 않아서(확인) Rust가 지우고, main.ts는 JS 쪽 사본만 지운다.
  - `akan_native_last_error`와 `-5`: main.ts가 실패 원인을 알린다. Windows에 WebView2 Runtime이 없으면 설치 링크를 보여 준다.
  - `packages/desktop/test/ffi.test.ts`가 `ffi.ts`의 심볼 표와 Rust의 `#[no_mangle]` 목록, ABI major를 비교한다.
- v0.2(2026-09-27 아키텍처 검토 3단계): `akan_native_unregister_file`. 셸 op `alert.dismiss { tag }`(대화상자의 `alert.show`에 `tag`)도 더했다: macOS는 시트를 `NSModalResponseAbort`로 끝내고, Windows는 TaskDialog의 버튼을 누르거나 자체 폼에 `WM_APP+1`을 보내고, Linux는 GtkMessageDialog를 -1로 끝낸다.
- init.js 끝에 셸이 `__AKAN_NATIVE__.origin`·`engine`·`engineVersion`을 붙인다. 모든 호스트가 같다: iOS `wkwebview`, Android `android-webview`, 데스크톱 `wkwebview`·`webview2`·`webkitgtk`. 오리진 비교는 이 값 하나로 한다(예: filesystem의 FileRef URL).
- 네이티브 이벤트: `init`, `pageLoad{started|finished,window,url}`, `window{focused|resized|moved|closeRequested|themeChanged|created|destroyed, window}`, `quitRequested{reason: user|session}`(D4), `opened{urls}`(딥링크, D6), `external{url}`, `shellReply`. `pageLoad started`에서 그 WebView의 보류 responder를 main에서 버린다. 셸 op는 `window` 인자(창 id)를 받는다(§12 다중 창).
- 데스크톱 플러그인은 `ctx.shell(op, args)`(창 조작 등)와 `ctx.onNativeEvent(type, cb)`, `ctx.quit(code)`, 종료 흐름 훅(`ctx.onQuit`·`onBeforeQuit`·`onCloseRequested`·`closeWindow`, §12 D4), 그리고 호스트 시작 때 한 번 불리는 `setup(ctx)`로 네이티브 셸을 쓴다(`plugins/window`, `plugins/app`).
규칙 (`notes/README.md §3` FFI 설계 규칙)
- 포인터 대신 id(`webview_id`, `req_id`)만 주고받는다.
- 인자는 적게 둔다. 복잡한 입력은 JSON 문자열로 넘긴다.
- 네이티브는 JS에 동기로 묻지 않는다. 모든 요청은 큐 → wake → poll로 흐른다.
- Rust 쪽 호출은 모두 스레드 안전해야 한다. UI 작업은 `EventLoopProxy`로 main 스레드에 보낸다.

## 10. 마일스톤

| M | 내용 | 완료 기준 |
|---|---|---|
| **M0** ✓ | 저장소 뼈대, 문서, `akan-native doctor` | `akan-native doctor`가 이 Mac에서 모든 항목을 통과한다 |
| **M1** ✓ | `@akanjs/native/core`(브리지, definePlugin, env), 플러그인 4개의 JS API·hook·web 구현, 샘플 앱, `akan-native build/run web` | 샘플 앱이 브라우저에서 동작하고, 목 브리지 테스트가 통과한다 |
| **M2** ✓ | `native/desktop`(TAO+WRY), `@akanjs/native/desktop`, 플러그인 desktop 구현, `akan-native build/run macos` | 같은 번들이 macOS 앱으로 동작한다. Q2~Q4 해결 |
| **M3** ✓ | iOS 셸, 플러그인 iOS 구현, `akan-native build/run ios` | 시뮬레이터에서 동작한다. Q5 해결 |
| **M4** ✓ | Android 셸, 플러그인 Android 구현, SDK 직접 빌드, `akan-native build/run android` | 에뮬레이터에서 동작한다. Q6·Q7 해결 |
| **M5** ✓ | `akan-native dev`(live reload), `akan-native test`(플랫폼 공통 자가 테스트), 문서 정리 | MVP 완료 기준 전체 충족 (requirements §4). 상태 유지 HMR은 이후 |

## 11. 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| Bun threadsafe JSCallback 동작이 문서화돼 있지 않음 (Q3은 관찰로 해결) | Bun 업그레이드 때 데스크톱 IPC가 깨질 수 있음 | 샘플 자가 테스트를 macOS에서 매번 돌린다. 조사 프로토타입의 FFI 계약 시나리오(`busy`·`throw`·`quitonly`) |
| 데스크톱 카메라: TCC와 ad-hoc 서명 | 재빌드마다 권한 기록이 맞지 않고, 문구가 없으면 getUserMedia가 끝나지 않는다 | manifest `macos.infoPlist`로 문구를 넣는다. 개발 서명 정책은 결정 필요 |
| 호스트 구현 네 벌이 서로 어긋남 | 플랫폼마다 동작 차이, 보안 검사 우회 | 표·상수는 `contract.json`에서 생성, 알고리즘은 언어마다 커널 한 파일, 모든 구현이 같은 벡터를 통과(TS·Rust·Swift·Kotlin JVM, 기기에서도, §5) + 샘플 자가 테스트(NF-3) |
| Android WebView 버전 차이 | 140 미만은 `env(safe-area-inset-*)` 없음 | iOS·Android 모두 모든 페이지에 `--akan-native-safe-area-*` CSS 변수를 넣는다(N14: init.js에 현재 값, 바뀔 때마다 다시). 셀프 테스트가 확인한다 |

## 12. 구현 메모

### M1 (Web)
- **단일 HTML 만들기**: Bun 1.4의 `Bun.build({ entrypoints: ["./index.html"], target: "browser", compile: true })`가 JS·CSS·CSS 안 에셋을 `index.html` 하나에 넣는다. `</script>`도 `<\/script>`로 알아서 이스케이프한다. 샘플은 이것만 쓴다 (`examples/sample/build.ts`). 별도 인라인 단계는 필요 없다.
  - HTML에 적은 `/akan-native.svg` 같은 절대 경로는 번들러가 빌드 시점에 해석하려다 실패한다. 번들에 넣을 에셋은 상대 경로(`./public/akan-native.svg`)로 쓰고, 런타임에 `public/`에서 읽을 에셋은 JS 안의 문자열(`<img src="/akan-native.svg">`)로 둔다.
- **init.js 중복 검사**: 인라인된 번들 텍스트에 `/__akan_native/init.js` 문자열이 들어 있을 수 있다(샘플 화면 문구). 그래서 부분 문자열이 아니라 실제 `<script src>` 태그만 찾는다.
- **Bun 1.4 workspace는 격리 설치**(pnpm 방식)다. 플러그인의 `peerDependencies: react`도 각 패키지 `node_modules`에 같은 react로 링크된다.
- **타입 검사**: `bun run typecheck` (TypeScript 7 + `@types/bun`·`@types/react`·`@types/react-dom`, devDependency만. Q1 결정).
- **web camera**: 터치 기기(`pointer: coarse`)와 `source: "library"`는 `<input type=file>`(Capacitor `fileInputExperience`와 같은 방식: DOM에 붙인 뒤 click, `cancel` 이벤트 처리)를 쓴다. 포인터 기기(데스크톱 브라우저, macOS WebView)는 `<input capture>`가 무시되므로 getUserMedia 미리보기 오버레이를 쓴다.
- 검증: `bun test`(core 브리지·목 호스트, CLI env·HTML·라우팅, desktop dispatcher) + headless Chrome을 CDP로 조작하는 E2E(카운터 저장, 새로고침 후 유지, SPA 이동, 딥링크 새로고침 폴백, `public/` 이미지, 콘솔 에러 없음).

### FileRef 해제와 세션 파일 (3단계)
- FileRef는 App(세션) 범위 그대로다. `releaseFile(ref)`(`@akanjs/native/core`)가 `$bridge.release { url }`을 보내 호스트가 URL을 잊는다. akan-native가 만든 사본(카메라 사진, 고른 파일의 복사본)은 지우고, 제자리 서빙한 사용자 파일은 둔다. 웹은 blob: URL을 revoke한다.
- 데스크톱은 C ABI 0.2 `akan_native_unregister_file`을 더했다.
- 시작할 때 지난 세션의 파일을 지운다: iOS는 `akan-native-files`를 비우고(전부터), Android는 `akan-native-capture`·`akan-native-picked`에서 한 시간보다 오래된 파일만 지운다. 프로세스가 죽은 사이 카메라가 쓴 사진은 복원된 액티비티가 받을 결과이기 때문이다(C6).

### 데스크톱 플러그인 setup과 종료 경로 (3단계)
- 창은 각 setup을 3초까지 기다린다(전부터). 그보다 오래 걸린 setup의 플러그인에 페이지가 호출이나 `$listen`을 보내면 setup을 5초까지 더 기다리고, 넘으면 INTERNAL(`retryable`)로 답한다(Tauri #16135).
- 네이티브 이벤트 리스너는 스냅샷으로 순회한다(리스너가 리스너를 더하거나 빼도 된다).
- onQuit 훅(2초 상한)이 도는 종료 경로: `app.exit()`·`ctx.quit()`, 사용자 종료 요청(Cmd+Q, Dock, 마지막 창)과 세션 종료(거부권 뒤), SIGTERM·SIGINT·SIGHUP, 업데이트 적용 후 재실행(`ctx.quit(0)`). 돌지 않는 경로: `ctx.launch.exit()`(창을 만들기 전, single-instance 넘김), fail-fast(호스트 Worker가 사라짐: 셸이 알림을 띄우고 끝내며 크래시 표식과 로그를 남긴다).

### stream·대용량 (아키텍처 검토 4단계 일부, 2026-09-27)
- `coalesce: "latest"` 이벤트(Tauri updater·upload, Capacitor edgeGesture, RN EventQueue)
  - 선언은 manifest의 `"coalesce": [이벤트]`(설계의 `events: [{ name, coalesce }]` 대신 별도 키: 이벤트 목록의 형태를 바꾸지 않으려고)이고, boot.json `plugins[].coalesce`로 호스트에 간다. 대상: updates `progress`, window `resize`·`move`, keyboard `change`, geolocation `position`·`highAccuracyPosition`.
  - 호스트는 문서마다 송신함을 둔다. coalesce 이벤트는 송신함의 마지막 항목이 같은 이벤트면 그것을 바꾸고, 아니면 뒤에 붙는다. 다른 메시지(응답, 다른 이벤트)가 나가기 전과 100ms 뒤에 송신함을 먼저 보낸다. 그래서 서로 다른 메시지 사이의 순서는 지켜지고, seq는 보낼 때 붙는다. 문서가 끝나면 버린다.
  - 자가 테스트: dev `$host.burst`가 coalesce 이벤트 200개를 보내고 답한다. 다섯 플랫폼 모두 마지막 값 하나만, 답보다 먼저 왔다.
- 큰 파일: `fileStream(ref, { chunkSize })`·`fileBlob(ref)`(`@akanjs/native/core`)가 Range 요청을 이어 붙인다(기본 4MiB 조각, Range를 모르는 서버는 그대로 스트림). 데스크톱 셸은 WRY에 스트리밍 응답이 없어 Range 없는 요청을 통째로 읽으므로, 32MB가 넘는 FileRef를 Range 없이 요청하면 경고한다. 자가 테스트가 다섯 플랫폼에서 `fileBlob`(3바이트 조각)과 해제 뒤 404를 확인한다.
- 바이트 소유: 이벤트 payload 타입에 바이트(Uint8Array, ArrayBuffer, Blob, DataView …)가 있으면 스펙 검사 오류다(`specProblems`).
- 남은 4단계: pull 규칙(큰 payload를 인라인 대신 `/__akan_native/msg`로 가져오기).

### 실행 계약 (아키텍처 검토 5단계 일부, 2026-09-27)
- 유휴 wake 예산(NF-4)
  - 셸이 wake 횟수, poll 횟수, 들어온·나간 프레임, 큐의 최대 깊이를 AtomicU64로 센다. dev 셸 op `debug.stats`(dev `$host.stats`)로 읽는다.
  - 호스트 drain은 256프레임이나 4ms마다 `setTimeout(drain, 0)`으로 양보한다. 그 사이 타이머·promise·시작한 답이 돈다. `akan_native_poll`이 wake 플래그를 지우므로 남은 프레임은 다음 wake가 아니라 이어 달리기가 가져간다.
  - K-idle 자가 테스트: 페이지가 아무것도 하지 않는 5초 동안 wake와 프레임이 0이다(측정 호출 자신의 두 프레임은 뺀다). 확인: macOS·Linux·Windows 0회.
- 늘 켜진 오류 경로(RN JsErrorHandler)
  - dev 빌드는 init.js 바로 뒤에 작은 스크립트를 넣는다(`html.ts` `EARLY_ERRORS_SCRIPT`, CSP는 인라인 스크립트 해시로 허용). @akanjs/native/core가 돌기 전의 error·unhandledrejection을 `__AKAN_NATIVE__.early`에 모은다. 첫 오류는 이름·메시지·스택(WebKit 스택에는 메시지가 없어서 붙인다), 이후는 메시지만, 50개까지.
  - core가 로드되면 `[before runtime]` 표시로 한 번 호스트 로그에 보낸다(`flushEarlyErrors`). core가 끝내 뜨지 않으면 5초 뒤 스크립트가 직접 보고한다: 데스크톱 `/__akan_native/ipc`의 `$console`, iOS 메시지 핸들러, Android는 logcat(WebView 콘솔이 이미 간다). 확인: macOS에서 모듈 최상위 throw가 `[page error] [before runtime] … Error: boom before core`로 남았다.
  - dev 빌드는 호출한 곳의 스택을 오류의 `cause`로 붙인다(답은 다른 스택에서 오므로). 메시지는 바꾸지 않는다(앱과 자가 테스트가 메시지를 비교한다).
- 남은 5단계: 플러그인 실행기 가두기(iOS 플러그인별 actor, Android `context.worker`, 데스크톱 `ctx.offload()`).

### 빌드 구조 (아키텍처 검토 6단계 일부, 2026-09-27)
- 앱 식별
  - `app.name`은 표시 이름이다: .app 폴더, Windows 설치 폴더·바로가기, CFBundleDisplayName, Android label. 어느 언어든 되지만 빈 값, 앞뒤 공백, 끝의 점, 제어 문자, `/\:*?"<>|`, Windows 장치 이름(CON, NUL, COM1 …)은 거절한다(Dioxus #5743, Electrobun #514).
  - `app.fileName`(선택)은 실행 파일, Swift 모듈, 아카이브 이름이다. `[A-Za-z0-9._-]`만, 기본값은 id의 끝 조각을 소문자로(`com.akanjs.sample` → `sample`). 전에는 표시 이름에서 만들어 한글 이름이 `app`이 됐다. 식별자 성격의 값(데이터·WebView2 폴더, Windows 제거 키·AUMID, Linux desktop 파일)은 app.id로만 만든다.
  - 빌드 번호: `akan-native build --build <n>` 또는 `AKAN_NATIVE_BUILD`가 한 빌드의 `app.build`를 덮어쓴다. 대상별로 검사한다: Android versionCode 2,100,000,000 이하, Windows 버전 칸 65535 이하, Apple은 양의 정수.
  - Windows: app.id가 40자를 넘으면 WebView2 프로필 아래 경로가 MAX_PATH(260)를 넘을 수 있다고 경고한다.
- 이름 충돌은 빌드 오류이고 자동으로 바꾸지 않는다(`lib/names.ts`; RN이 SPM에서 자동 개명을 넣었다가 되돌림, #58044 → #58290). 글자와 숫자만 소문자로 비교한다. iOS: 플러그인 접두어, 앱 모듈 하나의 최상위 Swift 타입(셸·플러그인·생성 코드, private 제외)과 소스 파일 이름, 앱 모듈 이름과 시스템 모듈. Android: 패키지까지 같은 클래스와 대소문자만 다른 클래스 파일(대소문자 무시 디스크에서 덮어씀), 셸 패키지의 `android.class`.
- manifest: 모르는 키는 오류, apiVersion이 더 새면 "더 새 akan-native 필요", `dependencies`(앱 plugins에 있어야 하고, 네이티브인 플랫폼에서 대상도 네이티브여야 함).
- `cargo build --locked`: Cargo.lock이 고정한 crate만 쓴다.
- 확인(2026-09-27): 샘플의 전체 플러그인으로 오탐 없이 빌드된다. 자가 테스트 다섯 플랫폼 통과(새 실행 파일 이름으로).
- 선택 기능은 쓸 때만 컴파일(Capacitor #8436·#8580: 선택으로 바꾼 기능을 셸이 그대로 참조해 끈 빌드가 깨짐). 셸은 생성된 표식으로만 이 부분에 닿는다.
  - iOS: swiftc `-D AKAN_NATIVE_DEV`(dev 빌드: `$host` 자가 테스트 메서드, AkanNativeVectors), `-D AKAN_NATIVE_UPDATES`(updates 설정이나 updates 플러그인: AkanNativeUpdates.swift). 파일과 참조는 모두 `#if` 안이다(테스트가 조건 밖의 참조를 찾는다).
  - Android: 생성된 `AkanNativeFeatures`의 `const val DEV`·`UPDATES`. kotlinc가 거짓 상수의 분기를 버리고 R8이 닿지 않는 클래스를 지운다.
  - `akan-native plugin compile`은 모든 부분을 켠 채 검사한다.
  - 확인: 샘플(모두 켬) 자가 테스트, 플러그인 0개 앱의 release(모두 끔: 바이너리와 dex에 AkanNativeUpdates·AkanNativeVectors 없음, iOS·Android 실행 확인)와 debug(dev만) 빌드.
  - 데스크톱의 `$host` dev 메서드는 런타임의 dev 검사만 한다(Bun 컴파일의 define으로 지우는 것은 이후).
- 남은 6단계: 엔진 전용 설정 키(`webview2.*` 등. 지금은 그런 키가 없다), 모듈 분리 규칙(akanjs로 옮길 때).

### 공통: 플랫폼 자가 테스트 (NF-3)
- 샘플 앱은 런타임 env `PUBLIC_SELFTEST=1`이면 같은 검사 11개(+macOS 1개)를 돌리고 `AKAN_NATIVE_SELFTEST {"pass":…}` 한 줄을 console에 남긴다(`examples/sample/src/selftest.ts`). 검사 항목: init.js가 번들보다 먼저 실행됨, env(PUBLIC_만 전달), preferences 왕복·INVALID_ARGS, app-state, keyboard(지원 또는 UNSUPPORTED), camera 경로·권한, `public/` 에셋 MIME, 없는 에셋 404, SPA 폴백, `/__akan_native/*` 404.
- 켜는 방법은 플랫폼마다 같다: `AKAN_NATIVE_PUBLIC_SELFTEST=1 akan-native run <platform>`. 결과 줄은 dev 빌드의 console 포워딩(WV-3)으로 CLI 출력에 나온다.
- 2026-09-25 결과: **web(Chrome) · macOS · iOS 26.5 시뮬레이터 · Android 17 에뮬레이터 모두 통과.**

### M2 (macOS)
- 조사 프로토타입(research/desktop-macos.md §2)을 제품 코드로 옮겼다. 검증용 `akan_native_debug`·`akan_native_thread_info`는 뺐고 `akan_native_register_file`, 페이지 세대별 responder 정리, 창 숨김 후 표시(D2), 다크 모드 배경, 라우팅 규칙(`native/desktop/src/routes.rs`, TS와 같은 테스트 표)을 넣었다.
- 정적 파일과 등록 파일은 백그라운드 스레드에서 읽고 응답만 main에서 한다(큰 파일이 main을 막지 않게).
- 창 닫기·Cmd+Q는 D4 종료 흐름을 따른다(아래 "D4 종료 흐름"). 그래도 플러그인은 상태를 즉시 저장하는 편이 안전하다(preferences desktop 구현은 set마다 write-then-rename).
- **D7 확인 결과**: WRY 0.57의 WKUIDelegate에 JS 패널이 없어서 `alert`·`confirm`·`prompt`는 패널 없이 1ms 안에 반환된다(`confirm` → false, `prompt` → null). 대체 구현은 P1(plugins.md D7).
- 남은 확인: 카메라 허용 후 실제 영상 수신(사람의 클릭 필요), Safari Web Inspector 연결.

### D4 종료 흐름 (macOS)
- TAO의 app delegate에는 `applicationShouldTerminate:`가 없다. 셸이 실행 중에 `TaoAppDelegateParent` 클래스에 이 메서드를 추가한다(objc2 `class_addMethod`, 새 crate 없음). TAO 자신의 종료는 `[NSApp stop:]` + `process::exit`라서 이 메서드를 거치지 않는다.
- Cmd+Q·Dock 종료·AppleScript `quit`(사용자 요청): `NSTerminateCancel`로 답하고 `quitRequested{reason:"user"}`를 보낸다(Electrobun과 같음). 호스트가 결정해서 `akan_native_quit`을 부르면 TAO 루프가 끝난다. AppleScript로 종료를 보낸 쪽은 앱이 실제로 끝나도 `-128 User canceled`를 받는다.
- 로그아웃·재시작·시스템 종료(quit Apple event의 `keyAEQuitReason`이 `logo`·`rlgo`·`rrst`·`rsdn`·`rest`·`shut`): `NSTerminateLater`로 답한다. Cancel이면 macOS가 로그아웃을 중단하기 때문이다. 기다리는 동안에도 TAO 루프, 페이지 이벤트, IPC, 셸 op가 돈다(확인함). 호스트가 허락하면 `replyToApplicationShouldTerminate:YES`, 막으면 `akan_native_quit_cancel` → `NO`(로그아웃 취소).
- 감시: `quitRequested`·`closeRequested`는 프레임 reqId에 감시 id를 싣는다. Worker가 2초 안에 꺼내 가지 않으면(멈춤) 셸이 스스로 행동한다. 꺼내 간 뒤의 결정은 호스트 몫이다.
  - 종료 요청(Cmd+Q, SIGTERM)은 종료한다.
  - 창 닫기 요청은 그 창만 닫는다(2026-09-26 검토 반영). 예전에는 어느 창이든 종료했다. 긴 동기 작업(큰 sqlite 질의, 큰 파일 복사) 중인 Worker는 멈춘 Worker와 구별되지 않아서, 보조 창 하나를 닫아도 앱 전체가 onQuit 없이 끝났다. 마지막 창이면 지금도 종료한다. 이 경우는 실제 창 닫기 클릭이 필요해 셀프 테스트로 확인하지 못했다.
- 호스트(`packages/desktop/src/lifecycle.ts`): 창 닫기 요청 → close veto → `closeWindow()` → `desktop.quitOnLastWindowClosed`(기본 true)면 종료 요청 `lastWindowClosed`, 아니면 창 숨김(Dock 클릭으로 다시 표시, D5). 종료 요청 → quit veto → `quit()` → `onQuit` 훅(함께 실행, 최대 2초) → `akan_native_quit`. 결정 중에 같은 요청이 다시 오면 같은 결정을 기다린다.
- 페이지 veto(`page-veto.ts`, `@akanjs/native/core` `vetoable`): 페이지가 듣고 있을 때만 묻는다. 페이지는 이벤트를 받자마자 `{id}`(받음)를, 핸들러가 끝나면 `{id, allow}`를 보낸다. 2초 안에 "받음"이 없으면(페이지 멈춤·미로드) 허락으로 본다. 받은 뒤에는 기다린다(대화상자). 페이지가 다시 로드되면 요청을 버린다(앱 유지).
- `app.exit()`·`window.close()`는 명시적 호출이라 해당 veto를 묻지 않는다. `window.close()`로 마지막 창이 닫히면 beforeQuit은 묻는다.

### 데스크톱 복구·종료 (2026-09-26 차세대 검토 N2·N3·N5·N6)
- **웹 콘텐츠 프로세스 종료(N2).** 페이지 프로세스가 죽으면(crashed, killed, oom, unresponsive) 다음 순서로 처리한다.
  - 엔진별 신호: macOS는 wry `with_on_web_content_process_terminate_handler`, Windows는 WebView2 `ProcessFailed`, Linux는 `web-process-terminated`다.
  - 셸은 그 창의 대기 중인 IPC를 끝내고 `webview/processTerminated` 이벤트를 보낸다.
  - 호스트는 문서를 끝낸다(`dispatcher.reset`).
  - 셸은 같은 페이지를 한 번 다시 불러온다. 다시 불러온 뒤 1분 안에 또 죽으면 내장 오류 화면을 보여 준다.
  - WebView2 브라우저 프로세스가 죽으면 앱을 끝낸다. 알림과 크래시 표식을 남기는 fail-fast는 감독 단계에서 한다.
  - `desktop.recovery: "reload"`(지키는 사람이 없는 앱, 2026-09-30): 오류 화면 대신 매번 다시 불러온다. 다시 불러온 뒤 1분 안에 또 죽으면 연달아 죽은 것으로 세고, 1초부터 두 배씩 최대 1분까지 기다렸다 불러온다(`lib.rs` `recovery_wait`). 브라우저 프로세스가 죽으면 호스트가 `relaunchAfterExit`(`packages/desktop/src/relaunch.ts`, 업데이터와 같은 도우미)로 앱을 다시 띄우고 종료한다. 창마다 오는 이벤트와 `app.relaunch()`를 합쳐 프로세스당 한 번만 띄운다. 다시 띄운 앱이 1분 안에 또 그러면 도우미가 1초부터 두 배씩 1분까지 기다렸다 띄우고(`<app local data>/akan-native-relaunch.json`), 연달아 10번이면 다시 띄우지 않고 코드 1로 끝난다. 호스트가 못 하면 셸이 10초 뒤 코드 1로 끝난다. Windows 도우미와 그것이 띄우는 앱의 작업 폴더는 임시 폴더다.
  - 셀프 테스트 "a page whose process ended loads again": dev 전용 `$host.crash`로 프로세스를 끝낸다. macOS는 `_killWebContentProcess`(dev 빌드만), Linux는 `terminate_web_process`를 쓴다. 다시 불러온 페이지가 호스트가 종료를 본 것을 확인한다. Windows는 자동 확인이 없다.
  - 같이 고친 것: 다시 불러온 페이지의 IPC가 `Referer: app://localhost`(끝 `/` 없음)로 거절되던 것. 이제 Referer가 오리진과 정확히 같아도 받는다.
  - 절전 복귀 알림(`app-state` `resumed`, `window.reloadWebview`)은 아직이다.
- **single-instance(N3).**
  - macOS·Linux는 잠금 파일에 `flock(LOCK_EX|LOCK_NB)`을 건다(bun:ffi로 libc `flock`만 부른다). 잠금을 쥔 쪽만 오래된 소켓을 지우고 bind한다.
  - 잠금 파일은 `O_CLOEXEC`로 연다. 앱이 fork/exec로 띄운 프로세스(네이티브 코드, xdg-open, 재실행)가 잠금을 물려받으면 앱이 끝난 뒤에도 잠금이 남아, 이후 실행이 모두 아무도 없는 소켓에 메시지를 넘기고 끝나기 때문이다. Bun의 `openSync`는 이 플래그를 붙이지 않는다(`fcntl F_GETFD`로 확인). 잠금이 사용 중이면 연 fd를 바로 닫는다.
  - 전에는 오래된 소켓을 동시에 본 두 실행이 서로의 소켓을 지우고 둘 다 첫 인스턴스로 떴다.
  - 잠금이 사용 중이면 절대 실행하지 않는다. 연결을 제한 시간 동안 다시 시도해 메시지를 넘기고 끝난다. 잠금 파일을 만들 수 없을 때만 경고하고 실행한다. Windows는 이름 있는 파이프 그대로다.
  - 테스트: 동시에 네 번 실행하면 주 인스턴스는 하나다.
  - 실행 단계 `launchPhase: "gate"`: gate 플러그인의 setup이 다른 모든 setup보다 먼저, 차례로 돈다. 거기서 `launch.exit`가 정해지면 나머지 setup은 돌지 않는다. single-instance가 gate다.
- **신호와 세션 종료(N5).**
  - SIGINT(터미널의 Ctrl+C)와 SIGHUP(터미널 닫힘)도 SIGTERM처럼 호스트의 quit 훅을 거쳐 끝난다. 두 번째 신호가 오거나 5초가 지나면 바로 끝낸다.
  - Windows 로그오프·종료: 숨긴 최상위 도우미 창(message-only 창은 받지 못한다)을 시작할 때 만든다.
    - `WM_QUERYENDSESSION`은 `quitRequested{reason:"session"}`으로 알린다.
    - `WM_ENDSESSION`에서는 quit 훅에 3초를 준다.
  - VM에서의 실제 로그오프는 확인하지 못했다.
- **드래그앤드롭 좌표(N6).** WebView2는 물리 픽셀을 준다. 창의 DPI(`GetDpiForWindow`/96)로 나눠 CSS 픽셀로 보낸다(단위 테스트: 150%).

### 데스크톱 다중 창 (SH-6)
- 창 id: u32. `akan_native_run`이 여는 창이 1, `window.create`가 2, 3, …(재사용 없음). 창과 WebView가 id를 공유한다: 프레임의 `webviewId`, 네이티브 이벤트의 `window`, 셸 op의 `window` 인자가 모두 같은 값이다. 셸은 `id → (Window, WebView)`와 TAO `WindowId → id` 맵, 포커스 순서를 가진다.
- 페이지가 자기 창을 아는 방법: init.js 응답에 `window.__AKAN_NATIVE__.windowId=N`을 덧붙인다. 커스텀 프로토콜 핸들러가 WebView id를 알아서 창마다 다르게 줄 수 있고, 페이지는 왕복 없이 동기로 안다(`currentWindowId`, `getCurrentWindow()`). 호스트 쪽은 IPC 프레임의 `webviewId`로 호출한 창을 안다.
- 호스트: dispatcher가 `(플러그인.이벤트) → 구독한 창 집합`을 센다. 이벤트 소스는 모든 창에 하나다(기존 플러그인이 그대로 동작). `emit(data, target)`: 생략하면 구독한 모든 창, `{ window }`면 그 창만(창 이벤트), `"focused"`면 구독한 창 중 가장 최근 포커스 창 하나(딥링크, secondInstance). 한 창의 `pageLoad started`·`destroyed`는 그 창의 구독만 지운다. 메서드 호출은 창별 문맥(`ctx.window`)을 받고, 그 문맥의 `ctx.shell`은 `window`가 없으면 호출한 창에 적용된다.
- 종료 흐름: 창의 닫기 요청 → 그 창 페이지의 close veto → 다른 창이 있으면 `window.destroy`, 마지막 창이면 종료 요청(`lastWindowClosed`) 또는 숨김. 창 1도 다른 창과 같다(Tauri·Electron·Electrobun). beforeQuit은 듣는 모든 창에 묻고 모두 허락해야 종료한다. page veto는 페이지별 "받음"과 답을 창 id로 구분한다.
- 창을 없앨 때: WRY가 WKWebView를 drop 뒤에도 살려 두고 페이지가 계속 돌기 때문에(확인) 창을 숨기고 `about:blank`를 로드한 뒤 로드가 끝나면(최대 1초) drop한다.
- 창 인자 없는 op(Dock 다시 열기, single-instance, 플러그인 setup)는 가장 최근 포커스 창, 포커스 기록이 없으면 창 1에 간다.

### macOS 알림·카메라 권한 (Q-P6 (b1), Q9)
- `notify.rs`·`camera.rs`: UserNotifications·AVFoundation을 `#[link(kind = "framework")]`로 링크하고 클래스를 이름으로 찾아 `msg_send!`로 부른다(새 `objc2-*` crate 없음, 블록은 이미 트리에 있는 block2). 완료 핸들러에서 답하는 op이므로 셸 이벤트 루프가 `notify.*`·`camera.*`를 먼저 이 모듈에 넘기고, 모듈이 나중에 `reply(id, …)`를 부른다.
- delegate는 Info.plist `AkanNativeUserNotifications`(플러그인 `macos.infoPlist`)가 있으면 `akan_native_run`에서 이벤트 루프 전에 설치한다. 알림 클릭으로 앱이 켜질 때는 실행 완료 전에 delegate가 있어야 한다.
- 번들이 `/private/tmp` 아래에 있으면 usernoted가 앱을 인정하지 않는다(권한 요청이 곧바로 "not allowed"). 일반 프로젝트 폴더는 괜찮다.
- 셸에서 직접 실행한 앱의 TCC(카메라)는 실행한 터미널이 책임 프로세스로 잡힌다. 앱 자신의 상태는 `open`(Finder)으로 띄워야 보인다.

### 데스크톱 메뉴·트레이·전역 단축키 (Q-P6 (b))
- 셸 모듈: `menu.rs`(앱 메뉴·컨텍스트 메뉴·트레이 메뉴 공용 빌더, D1 기본 메뉴 포함), `tray.rs`(NSStatusItem), `hotkey.rs`(Carbon), `accelerator.rs`(가속키 파서, 순수 함수). 셸 op `menu.*`·`tray.*`·`hotkey.*`는 창과 무관해서 `Windows::shell_op` 앞부분에서 처리하고, `menu.popup`만 호출한 창의 WKWebView를 쓴다.
- 클릭 경로: akan-native가 만든 클릭 항목은 모두 같은 Objective-C target(`AkanNativeMenuTarget`, objc2 `define_class!`)을 가리키고, `representedObject`에 이벤트 JSON의 앞부분(출처: 앱 메뉴, 컨텍스트 메뉴와 창 id, 트레이)을 담는다. target은 그것을 닫아(체크 항목이면 `checked`를 붙여) 네이티브 이벤트로 보낸다. role 항목은 target 없이 responder chain으로 간다.
- 이벤트 대상: 앱 메뉴·트레이·단축키는 앱 전체의 것이라 `"focused"`(마지막 포커스 창)로, 컨텍스트 메뉴 클릭은 연 창으로 보낸다.
- 메뉴·트레이·단축키는 네이티브 쪽 상태라 페이지를 새로고침해도 남는다. 그래서 트레이 `create`와 단축키 `register`는 같은 id·조합이면 갱신하거나 그대로 성공한다.

### 데스크톱 launch 단계 (window-state, single-instance)
- 순서: main 스레드가 Worker를 띄움 → Worker가 플러그인 `setup`을 모두 기다림(async 허용, 플러그인마다 3초) → `postMessage({ type: "ready", window, exit })` → main이 `exit`이면 창 없이 종료, 아니면 `window`(x, y, width, height, maximized)를 `akan_native_run` 설정에 합쳐 창을 만든다. 창은 D2대로 첫 로드까지 숨어 있으므로 복원 위치로 옮겨도 보이지 않는다.
- 셸(`placement.rs`): 저장 위치의 제목 표시줄 띠가 어느 모니터에도 충분히 걸치지 않으면 위치를 버리고(TAO 기본: 가운데) 로그를 남긴다. 크기는 그 모니터에 맞게 줄이고 최소 크기(320×240)를 지킨다.
- 위치는 `WindowBuilder::with_position`이 아니라 만든 뒤 `set_outer_position`으로 준다. TAO macOS는 builder position을 콘텐츠 영역 기준으로 해석해 제목 표시줄만큼 어긋난다. 최대화는 그 뒤에 `set_maximized(true)`(메인 큐 순서대로 실행되어, 최대화를 풀면 저장된 bounds로 돌아간다).
- macOS inner size는 WebView 프레임에서 읽는다. WRY가 contentView를 바꿔서 TAO `inner_size()`는 처음 크기에 머문다(Tauri도 같은 우회). 셸 op 응답은 TAO의 비동기 적용 때문에 요청한 크기·위치·최대화·전체 화면 값을 보고한다.
- Bun Worker의 `process.argv`에는 실행 인자가 없다. main이 `new Worker(url, { argv: process.argv.slice(2) })`로 넘긴다.
- Worker는 main이 막혀 있는 동안 SIGTERM 핸들러를 받지 못한다(확인). 그래서 셸이 SIGTERM을 받아(libc `signal` + self-pipe, `lib.rs` `sigterm`) `signal` 이벤트로 넘기고, 호스트는 veto 없이 `onQuit` 훅을 돌린 뒤 끝낸다. 두 번째 SIGTERM이나 5초 초과면 바로 종료한다.

### 데스크톱 내장 서버 (desktop.server, akanjs `native.desktop.server`)
- 빌드: `desktop.server.dir`를 `resources/server/`로 복사하고 `server.json`(entry, env)과 빈 `server.bunfig.toml`을 쓴다. macOS는 그 안의 Mach-O 파일을 이름과 상관없이(파일 머리로 판별) dylib보다 먼저 서명한다. single-instance가 없으면 경고한다.
- 시작(`packages/desktop/src/server.ts`): 플러그인 호스트가 launch 단계(`dispatcher.launched`) 뒤에 띄운다. `exit`이면(다른 인스턴스로 넘겼으면) 띄우지 않는다. 두 번째 인스턴스가 서버를 잠깐이라도 띄우면 같은 DB와 cron을 건드린다.
  - 포트: 지난 세션의 서버가 ready였던 포트(`<서버 데이터>/port`)가 비어 있으면 그것을, 아니면 127.0.0.1에서 0번 포트로 listen해 받은 번호를 쓴다. 등록해 둔 URL이 포트가 비어 있는 동안은 계속 맞는다(보장은 아니다). 첫 ready 전에 서버가 끝나고 페이지가 아직 URL을 받지 않았으면 새 포트로 다시 띄운다(고른 뒤 다른 프로그램이 먼저 잡은 경우). init.js가 포트를 담아 `akan_native_run`에 한 번 넘어간 뒤로는 세션 동안 바꾸지 않고, 재시작도 같은 포트로 한다.
  - env: 셸의 환경은 넘기지 않는다(`akan start-desktop`이 띄운 셸에는 CLI의 `AKAN_PUBLIC_*`·`PORT`가 있다). PATH·HOME 같은 시스템 변수 몇 개(프록시 `HTTP(S)_PROXY`·`NO_PROXY`, CA `NODE_EXTRA_CA_CERTS`·`NODE_USE_SYSTEM_CA`·`SSL_CERT_FILE`, 서버가 띄우는 도구가 화면·오디오·세션 버스에 닿는 데스크톱 세션 변수 `DISPLAY`·`XAUTHORITY`(GDM 세션의 X 서버는 쿠키 없는 클라이언트를 거부한다)·`WAYLAND_DISPLAY`·`DBUS_SESSION_BUS_ADDRESS`·`PULSE_SERVER`·`PULSE_COOKIE`·`PULSE_RUNTIME_PATH`·`XDG_*`, Windows의 `ProgramFiles`·`ComSpec`·`PATHEXT` 등 포함) + `server.json` env + launcher 값(`PORT`, `AKAN_LISTEN_HOST=127.0.0.1`, `AKAN_ALLOWED_HOSTS`, `JWT_SECRET`, `AKAN_SQLITE_DIR`, `AKAN_WORKSPACE_ROOT`, `AKAN_RUNTIME_DIR`, `BUN_BE_BUN`, `BUN_RUNTIME_TRANSPILER_CACHE_PATH=<서버 데이터>/runtime/transpiler-cache`). launcher 값이 이긴다. akanjs는 부팅 때 `BUN_BE_BUN`을 `process.env`에서 빼고, 자기 실행 파일을 다시 띄울 때만(ops snapshot) 돌려준다.
  - 인자: `--no-env-file --no-install --config=<빈 bunfig> --use-system-ca`. Bun은 기본으로 자기에게 든 CA 목록만 믿는다. 회사가 OS에 넣은 루트 CA(TLS 검사 프록시, 사설 CA)를 WebView는 믿고 서버는 믿지 않는 일이 없게 OS 저장소를 쓴다.
  - PATH: 플러그인 호스트가 시작할 때 `resources/bin`(설정 `desktop.bin`, akanjs `bin`)을 자기 `process.env.PATH` 맨 앞에 붙이고(`host.ts`, 이미 맨 앞이면 다시 붙이지 않는다: 재실행한 앱은 붙인 PATH를 물려받는다), 서버는 그 PATH를 시스템 변수로 받는다. `server.json` env가 PATH를 정해도 bin을 다시 맨 앞에 둔다. 그래서 서버 코드의 `spawn("ffmpeg")`가 앱이 싣고 온 파일을 쓴다.
    - Windows: 컴파일된 앱의 플러그인 호스트 Worker가 가진 `process.env` 사본은 이름을 Windows가 준 대소문자(`Path`, `windir`)로만 찾는다. 프로세스 자신의 env는 대소문자를 가리지 않는다. 그래서 예전에는 host가 `process.env.PATH`를 찾지 못해 PATH를 bin 폴더 하나로 새로 만들었고, 실린 서버는 `cmd.exe`조차 이름으로 띄우지 못했다(2026-10-01, 11의 E2E가 찾음). 지금 host는 PATH를 대소문자와 상관없이 읽어 `PATH` 한 이름으로 맞추고, launcher는 시스템 변수를 대소문자와 상관없이 읽는다(`envValue`).
  - 데이터: `<서버 데이터>` = `<app local data>/server`(작업 폴더, `db/`, `runtime/logs`, `jwt.secret`, `port`). `<app local data>`는 Windows에서 `%LOCALAPPDATA%\<id>`(Roaming은 사용자를 따라 동기화되고 파일 서버로 리디렉션될 수 있어 SQLite WAL이 동작하지 않는다), macOS·Linux에서는 `<app data>`다. debug 빌드는 release와 같은 app id이므로 `server-debug`를 따로 쓴다. `jwt.secret`은 macOS·Linux에서 0600이고 이미 있는 파일도 좁힌다(Windows는 사용자 프로필의 ACL). FileRef가 서빙하지 않는 예약 폴더다(L4).
  - IPC `ready`를 최대 8초 기다린다. 넘기면 창을 먼저 띄우고, 서버는 계속 뜬다. 포기가 정해지면(아래 크래시, 또는 데이터 폴더를 만들거나 `jwt.secret`을 읽지 못함) 기다리지 않는다.
  - 서버를 띄우지 못해도 페이지에는 loopback URL을 넘긴다(`server.json`을 읽지 못하면 `http://127.0.0.1:0`). URL이 없으면 페이지가 빌드 때의 서버(cloud 주소)를 불러 다른 데이터를 읽고 쓰기 때문이다. 이때도 `alert.show`로 알린다. 셸은 `akan_native_run` 전에는 op를 받지 않으므로, launch 단계에서 난 알림은 `drain`이 셸의 첫 프레임을 받을 때까지 호스트가 들고 있다. 호스트가 스스로 만드는 이벤트(콜드 스타트 딥 링크의 `openLinks`)는 `akan_native_run` 전에 올 수 있어 세지 않는다(예전에는 이것이 알림을 먼저 풀어 대화상자 없이 사라졌다. 2026-09-30 08 리뷰).
  - 플러그인은 `ctx.server`(서버를 싣지 않으면 null)의 `ready`로 서버가 떴는지, `state`·`onState`로 지금 어떤지 안다(`starting`, `up`, `restarting`, `gaveUp`, `stopped`). 페이지는 `app` 플러그인의 `serverState` 이벤트로 받는다. file-picker는 서버를 실은 debug 빌드에도 IPC grant를 준다(실린 서버는 edge라 dev grant를 받지 않는다). updates는 서버가 ready 뒤 `SERVER_SETTLE`(5초) 동안 살아 있었고 지금 `up`일 때만 확정한다. 부팅 중에 멈춘 서버는 `SERVER_BOOT_ALLOWANCE`(120초) 뒤 실패로 본다.
  - 서버의 표준 오류, 그리고 ready 전의 표준 출력은 `<서버 데이터>/runtime/logs/server-output.log`에도 남는다(1 MiB를 넘으면 `.1`로 옮긴다). 서버 자신의 로그 파일은 listen에서야 시작해서, 그 전에 실패한 이유(solo 거부, 없는 env 파일, DI init 실패)가 포기 알림이 가리키는 폴더에 남지 않았다(2026-09-30 10 리뷰).
- 크래시: 같은 포트로 다시 띄운다. 1초에서 두 배씩 30초까지. 연속 5회면 멈추고 `alert.show`로 알린다. 한 번도 ready가 되지 않은 서버는 250ms 간격(`BOOT_RESTART_DELAY`)으로 다시 띄운다. 부팅 때 죽는 서버의 포기가 창이 기다리는 8초 안에 정해져 창이 알림과 함께 뜬다(1·2·4·8초였을 때는 포기가 약 15초에 와서, 창은 8초 뒤 아무도 답하지 않는 URL로 떴다). 60초 이상 떠 있던 실행의 크래시는 횟수를 처음부터 센다. 다시 띄우다 예외가 나면(실행 중에 데이터 폴더가 지워짐, 프로세스 한도) 실패 한 번으로 센다. 플러그인 호스트 Worker는 끝나지 않는다.
- 종료: `onQuit`에서 IPC `shutdown` → 1.5초 안에 안 끝나면 SIGKILL(서버의 `AKAN_SHUTDOWN_TIMEOUT_MS`는 1초라 그 안에 끝난다. SIGTERM은 핸들러가 있는 서버를 끝내지 못한다). 셸이 먼저 죽으면 macOS·Linux에서는 서버가 IPC 끊김을 보고 스스로 내려간다(akanjs `AkanServer`). Windows에서는 Bun이 자식을 넣는 job object가 셸과 함께 서버를 바로 끝낸다(서버 로그에 종료 줄이 없다). SQLite WAL이 있어 데이터는 남는다.
  - macOS·Linux: 서버는 자기 프로세스 그룹의 리더로 뜬다(`detached`). 서버가 끝나면(정상 종료든 크래시든) 그룹에 남은 프로세스(서버가 띄운 bin 도구 등)를 끝낸다. 크래시면 SIGTERM, 유예 뒤 SIGKILL. 유예 안에 앱이 끝나면 `stop()`이 그 SIGKILL을 바로 보낸다(SIGTERM을 무시하는 도구가 남지 않게). Windows는 job object가 같은 일을 한다. 서버가 터미널의 SIGINT를 직접 받지 않으므로 IPC `shutdown`으로 멈춘다.
- 확인(E2E `pkgs/@akanjs/cli/application/desktopServer.e2e.test.ts`, 2026-09-29): macOS, Linux 컨테이너(WebKitGTK), Windows 11 ARM VM(WebView2) 모두 통과. 생성·목록·업로드와 되읽기, rebinding Host·외부 Origin·LAN 주소 거부, 두 번째 실행은 서버 없이 넘김, 종료(SIGTERM, Windows는 stdin quit) 뒤 graceful 종료와 데이터 유지, 강제 종료 뒤 서버도 내려감. 세 OS 모두 서버는 127.0.0.1에만 LISTEN하고 WebView(WebKit, msedgewebview2)가 그 포트에 연결한다. 네트워크 없는 Linux 컨테이너(`--network none`)에서도 동작했다.
- 로그: 서버의 stdout·stderr를 줄마다 `[server] ` 접두사로 셸 stdout·stderr에 넘긴다. 파일 로그는 `<서버 데이터>/runtime/logs`.
- 파일 허가(`packages/desktop/src/grants.ts`): file-picker `forServer`는 복사하지 않고, 원본을 FileRef로 서빙하며, 결과마다 불투명한 `grant`를 준다(읽기·쓰기·폴더). 서버가 IPC `file.resolve { id, grant }`를 보내면 셸이 `file.resolved { id, path, mode }`(모르는 grant면 `error`)로 답한다(akanjs `NativeFile`). 그래서 서버는 사용자가 고른 것만 얻고, 페이지는 경로를 갖지 않는다. 서버를 싣지 않은 dev 빌드의 서버는 셸의 자식이 아니므로(`akan start`) grant에 경로를 담고 `~/.akan/native/dev-file-grant.key`(0600)로 HMAC 서명한다. akanjs는 `operationMode` local에서만 그 서명을 확인해 받는다.

### macOS 네이티브 시트 (file-picker, dialog, D7)
- 셸 op `panel.open`·`panel.save`·`panel.mime`·`panel.types`·`alert.show`는 `native/desktop/src/panels.rs`가 처리한다. 시트는 나중에 답하므로 이 op들은 요청 id를 받아 완료 핸들러에서 `reply`한다(`lib.rs`의 Shell 이벤트에서 notify·camera와 함께 먼저 분기). 창이 숨어 있으면 먼저 보인다(숨은 창의 시트는 뜨지 않고 핸들러도 불리지 않는다).
- 파일 패널: 셸은 고른 경로만 돌려주고 복사·폴더 목록·저장은 플러그인 호스트(같은 프로세스)가 한다. UTType은 objc2 런타임 호출(Q-P6 부속 결정).
- D7: `js_panels.rs`가 WRY UI delegate의 클래스(실제 delegate 객체에서 얻음)에 JavaScript 패널 메서드 세 개를 `class_addMethod`로 붙이고, WebKit이 다시 읽도록 delegate를 재설정한다.
- 테스트: dev 빌드에서 `AKAN_NATIVE_TEST_PANELS`가 있으면 시트를 NSTimer로 끝낸다(`akan-native test macos`는 `auto`).
- Windows·Linux: 같은 op와 답 JSON을 `win/dialogs.rs`·`linux/dialogs.rs`가 처리한다(인자·답·테스트 답은 `dialog_args.rs`에서 세 OS가 공유). Windows는 대화상자마다 스레드를 띄우고 앱 창을 owner로 준다. tao 이벤트 핸들러 안에서 Win32 모달 루프를 돌리면 그동안 오는 이벤트(IPC 응답 포함)가 모두 버퍼에 묶이기 때문이다. Common Controls 6(TaskDialog, 테마 컨트롤)은 `build.rs`가 DLL에 넣은 manifest(리소스 2)를 대화상자 스레드에서 `CreateActCtxW`로 켠다(Bun 실행 파일에는 manifest가 없다). Linux는 중첩 루프 없이 response 시그널로 답하고, 부른 창에 창 그룹을 따로 줘 모달이 그 창만 막는다. D7은 두 OS 모두 웹뷰 자체 대화상자를 쓰고, `AKAN_NATIVE_TEST_PANELS`일 때만 셸이 타이머로 답한다(WebKitGTK `script-dialog`, WebView2 `ScriptDialogOpening`).

### 플러그인 코드 생성 (PL-10)
- 파서(`packages/cli/src/lib/spec.ts`):
  - TypeScript 컴파일러 없이 토큰을 읽는다. 런타임 의존성을 두지 않기 위해서이고, typescript는 devDependency로만 허용된다.
  - 최상위 interface·type 별칭과 `definePlugin<Api, Events>`의 타입 인자만 읽는다.
  - 받는 문법의 범위는 react-native-codegen이 TurboModule 스펙에 허용하는 것과 비슷하다(`react-native-codegen/src/parsers/typescript/`). 모르는 문법은 `unsupported` 노드로 남기고 파싱을 멈추지 않는다. 그래서 30개 플러그인 모두의 메서드·이벤트 이름을 manifest와 비교할 수 있다.
  - 플러그인 자신의 상대 경로 모듈에서 가져온 타입(`import type { X } from "./types.ts"`)도 따라간다.
- 모델(`codegen.ts`):
  - 타입을 이름 있는 struct·enum으로 푼다. 이름 짓기는 RN의 `Spec<Method><Param>` + 필드(`StructCollector.js:213`)와 같은 방식이고, 플러그인 접두어를 붙인다.
  - RN과 다른 점 두 가지:
    - 같은 이름에 다른 모양이 오면 덮어쓰지 않고 오류로 낸다. RN은 조용히 덮어쓴다(`StructCollector.js:228`).
    - 표현할 수 없는 타입을 `Any`나 `Promise<void>`로 바꾸지 않는다. 해당 메서드만 raw `AkanNativeCall`로 남긴다. RN은 이렇게 바꾼다(`parsers-primitives.js:345-381, 543-549`).
  - optional(`?`)과 nullable(`| null`)은 디코드에서는 같게("없음") 다룬다. 인코드에서는 다르다: nil인 optional은 빼고, nil인 nullable은 null로 쓴다.
- 생성물:
  - Swift는 `@MainActor protocol <P>PluginSpec: AkanNativePlugin`과 기본 `handle`을 가진 extension이다.
  - Kotlin은 `interface <P>PluginSpec : AkanNativePlugin`이고 `override fun handle`이 들어 있다.
  - 인자는 `AkanNativeJSON.decode(call)`로 먼저 디코드하고, 실패하면 `INVALID_ARGS`로 끝낸다. 성공한 경우에만 타입이 붙은 메서드를 부른다.
  - 런타임 쪽은 `native/ios/Sources/AkanNativeSpec.swift`와 `native/android/src/com/akanjs/runtime/AkanNativeSpec.kt`다.
    - JSON bool은 iOS에서 NSNumber로 오므로 CFBoolean인지 따로 확인한다.
    - `AkanNativeReply<T>`는 아무 스레드에서나 부를 수 있다. Swift의 인코더 클로저가 `@Sendable`인 이유다.
    - Kotlin의 void 메서드는 `AkanNativeVoidReply`를 받는다. 확장 함수를 쓰면 플러그인마다 import가 필요하기 때문이다.
- 빌드:
  - `gen/spec`을 비우고 `codegen: true`인 플러그인의 파일을 다시 쓴다. 컴파일 캐시는 내용 해시라서 바뀌지 않으면 다시 컴파일하지 않는다.
  - 스펙과 manifest가 다르면 빌드 오류다.
  - 플랫폼 subset(`ios.methods` 등)에 든 메서드만 프로토콜에 넣는다.
- 검증:
  - 30개 플러그인 전부의 생성 코드가 Swift 6(`-typecheck`)과 kotlinc 2.4.20에서 경고 없이 컴파일된다.
  - preferences·haptics·device를 옮겼다. 자가 테스트의 "generated argument checks (PL-10)"가 iOS·Android에서 필드 경로 메시지(`value must be a string`, `key is required`, enum 목록)를 확인한다.

### 권한 ACL (PL-11, plugins.md C7)
- 모델은 Tauri ACL(`tauri-utils/src/acl`, `tauri/src/ipc/authority.rs`)을 줄인 것이다. 권한 파일 없이 manifest에서 이름을 만든다: `<id>:allow-<method>`·`deny-<method>`, `allow-listen-<event>`·`deny-listen-<event>`, `<id>:default`(manifest `defaultPermissions`, 없으면 전부. manifest `defaultScope`가 있으면 그 스코프 안에서), `<id>:all`, manifest `permissionSets`의 묶음, `core:deny-print`.
- 앱 설정:
  ```ts
  capabilities: [
    { identifier: "main", windows: ["main"], permissions: ["preferences:default", "preferences:deny-clear",
      { identifier: "filesystem:all", allow: [{ base: "documents", path: "exports/**" }], deny: [{ path: "**/secret/**" }] }] },
    { identifier: "every-window", windows: ["*"], platforms: ["macos"], permissions: ["window:default"] },
  ]
  ```
  `capabilities`가 없으면 등록한 플러그인마다 `default`를 모든 창에 준다. 있으면 주지 않은 것은 모두 `NOT_ALLOWED`이고, deny는 창과 상관없이 모든 grant보다 이긴다(Tauri와 같음). `core`(window.print)는 막지 않는 한 허용.
- 보수적 기본값(사용자 결정 2026-09-26): 예전에는 `defaultPermissions`를 둔 플러그인이 없어서 capabilities 없는 앱이 사실상 모든 권한을 가졌다(데스크톱 filesystem은 `~/Documents` 쓰기·삭제, http는 사설망을 포함한 임의 URL). 이제 manifest `defaultScope`가 `<id>:default`의 스코프가 된다. capabilities가 있든 없든 같고, capability가 `<id>:default`에 `allow`를 주면 그것이 대신하고 `deny`는 더해진다.
  - filesystem: `data`·`cache`·`temp`만. `documents`는 앱이 capability로 줘야 한다.
  - http: `allow: []`. 앱이 URL을 적기 전에는 어떤 요청도 `NOT_ALLOWED`다.
  - capabilities 없이 release 빌드를 하면 경고한다. 샘플은 filesystem(documents 포함)과 http(자가 테스트 호스트)를 명시한다.
- CLI(`packages/cli/src/lib/acl.ts`)가 플랫폼마다 해석해 boot.json `acl`(`{ grants: [{ plugin, windows, items, allow?, deny? }], denied }`)로 쓴다. 알 수 없는 이름, 없는 메서드·이벤트, 스코프를 받지 않는 플러그인의 스코프, manifest에 없는 스코프 필드, deny에 붙은 스코프는 빌드 오류이고 비슷한 이름을 제안한다. 앱을 불러올 때 모든 capability를 검사한다.
- 강제(C7 지점): 데스크톱 dispatcher(부른 창 id로), iOS·Android `AkanNativeBridge`가 플러그인에 넘기기 전에 `aclCheck`를 한다. `$unlisten`은 항상 통과. 검사 코드는 TS(`packages/core/src/acl.ts`), Swift(`AkanNativeAcl.swift`), Kotlin(`AkanNativeAcl.kt`) 세 벌이고, 모두 공통 벡터(`scope.json`, `acl.json`, §5)를 통과해야 한다.
- URL 스코프(2026-09-26 검토 반영): 예전에는 URL 필드도 문자열 glob이라 `*`가 `.*`였다. 그래서 `https://*.example.com/*`가 `https://evil.com/x.example.com/`에 맞았다. 이제 플러그인이 `urlFields`로 지정한 필드(http·opener의 `url`)는 `urlMatch`로 비교한다.
  - 스킴·호스트·포트·경로를 나눠 비교하므로 와일드카드가 경계를 넘지 않는다. 스킴과 호스트는 대소문자를 무시하고, 호스트의 `*`는 점을 넘는다(`a.b.example.com`).
  - 포트가 없는 패턴은 allow에서는 스킴의 기본 포트(https 443, http·ws 80, wss 443)에만, deny에서는 모든 포트에 맞는다. 그래서 `https://api.example.com/*`을 허용해도 `:8443`의 디버그 서버에는 닿지 않고, 호스트 하나를 deny하면 그 호스트 전체가 막힌다. 모든 포트는 `:*`로 쓴다. Tauri의 URLPattern 문자열도 포트를 생략하면 기본 포트에만 맞는다. (2026-09-26 아키텍처 검토. 전에는 allow도 모든 포트에 맞았다.)
  - 경로가 없으면 모든 경로다. 스킴은 적은 대로 비교하므로 http까지 막으려면 `*://host/*`로 쓴다. deny를 `https://…`로만 쓰면 빌드가 경고하고 `*://…`를 제안한다(`aclWarnings`). 이 검사는 manifest `scope.urlFields`에 적힌 필드만 본다(http, opener).
  - 쿼리와 프래그먼트는 비교하지 않고, `?`는 항상 한 글자 와일드카드다. 스킴이 없는 패턴은 아무것에도 맞지 않는다(`*` 하나는 전부).
  - 같이 고친 것: Swift의 정규식 끝을 `$` 대신 `\z`로 바꿨다(`$`는 끝의 개행 앞에서도 맞았다). JS 정규식에 `u` 플래그를 붙여 `?`가 UTF-16 단위가 아니라 한 글자에 맞는다.
  - 대소문자를 구분하지 않는 볼륨에서는 경로와 패턴을 통일해 비교한다(`PRIVATE/x`로 `private/**` deny를 피하지 못하게). Android `documents`, macOS·Windows 기본 볼륨이 여기에 해당한다(아래 보안 계층 L4).
- 페이지: web 구현(웹 플랫폼, 또는 호스트가 web으로 둔 메서드)에는 페이지가 같은 ACL을 적용한다. 일관된 오류를 위한 것이고 보안 경계는 아니다(페이지 코드는 브라우저 API를 직접 부를 수 있다). `plugin.isAllowed(method)`로 UI에서 미리 볼 수 있다.
- 스코프는 호출과 함께 플러그인에 간다(`ctx.scope`, web `ctx.scope`, Swift·Kotlin `call.scope`). 맞는 grant 중 하나라도 allow가 없으면 allow 제한 없음, deny는 모두 합친다. filesystem은 `{ base, path }`(path는 경로 glob), http·opener는 `{ url }`(URL 패턴).
- 샘플: `preferences:deny-clear`와 `data/private/**` deny 스코프를 두고 자가 테스트가 `NOT_ALLOWED`를 확인한다(web·iOS·Android 47/47). macOS는 프로브에서 창별 capability(2번 창은 preferences·filesystem 거부, 창 조작 허용)를 확인했다.

### M3 (iOS 시뮬레이터)
- 조사 프로토타입(research/ios.md §2.3)을 akan-native 규격으로 옮겼다: `@MainActor` 플러그인 API, 공통 라우팅(`AkanNativeRoute`), init.js는 번들의 json을 이어 붙임, `$console` 처리, 이벤트도 JSON 텍스트.
- Info.plist 필수 키는 사실상 `CFBundleExecutable`·`CFBundleIdentifier`·`UILaunchScreen`이다(없으면 320×480 레터박스). scene delegate는 코드로 지정한다.
- 카메라: 시뮬레이터는 "카메라 없음"으로 보고 기본 source가 사진 보관함(PHPicker, 권한 불필요)으로 간다. `NSCameraUsageDescription` 없이 카메라 권한을 요청하면 TCC가 앱을 죽이므로 먼저 확인한다.
- `akan-native run ios`는 `simctl launch --console-pty`로 로그를 따라간다. 따라가기를 멈추면(Ctrl+C) 앱도 종료된다.
- 남은 확인: PHPicker에서 실제로 사진을 고른 결과(탭 필요), 실제 탭으로 입력에 포커스했을 때의 키보드 이벤트.

### M4 (Android 에뮬레이터)
- 브리지는 MessagePort다(§3.5). `addJavascriptInterface`는 쓰지 않는다.
- 실제 탭으로 확인한 것(Pixel_10 AVD, API 37, WebView 153): Hooks 탭 이동, 카운터 저장, 입력 포커스 → `useKeyboard` = `visible, 312px`이고 WebView가 키보드 위로 줄어듦, hide → hidden, 홈 → 복귀 시 app-state `inactive → background → inactive → active`, **카메라 촬영(camera2 셔터 → 확인) → `/__akan_native/file/<id>` 이미지 표시**.
- CAMERA 권한은 선언하지 않는다(선언하면 캡처 intent가 SecurityException). `checkPermission`은 `granted`를 돌려준다.
- 빌드 캐시: Kotlin 소스·플래그 해시가 같으면 kotlinc·dex를 건너뛴다. kotlin-stdlib dex는 `~/.akan/native/cache/`에 한 번만 만든다.
- 이 AVD는 하드웨어 키보드 설정이라 소프트 키보드를 보려면 `adb shell settings put secure show_ime_with_hard_keyboard 1`이 필요했다.
- 남은 확인: minSdk 35(Android 15) 실기기·AVD, WebView 140 미만의 CSS 변수 폴백 화면, Photo Picker에서 실제 사진 선택.

### 최소 OS: iOS 16, Android 10 (akanjs 준비 O1-1, 2026-09-26)
- 바닥: iOS 16.0(`IOS_MIN`), Android API 29(`MIN_SDK`). macOS는 26 그대로다. 사용자 결정(akanjs의 iOS 15·Android 8 사용자 일부는 전환한 버전을 받지 못한다).
- iOS: `#available` 분기 5곳 묶음.
  - 셸 `isInspectable`(16.4). 16.4 전에는 debug 빌드가 원래 검사 가능하다.
  - appearance 트레잇 등록(17). iOS 16은 `AkanNativeWebView.traitCollectionDidChange`가 알림을 보낸다.
  - accessibility 알림 우선순위(17), auth-session `callback:`(17.4, 같은 custom scheme 콜백), haptics `view:` 생성자(17.5).
  - 페이지 JS는 Safari 15.4 API까지만 쓴다. 앱 번들은 iOS 16.0~16.3에 없는 문법(class static block 16.4 등)을 쓰지 않아야 한다.
- Android: API N이 필요한 코드는 이름이 `ApiN`으로 끝나는 클래스나 중첩 object에 두고 `Build.VERSION.SDK_INT >= N`에서만 부른다(AndroidX `Api33Impl` 방식). ART가 부르는 쪽 클래스를 검증하다 실패하는 일도 막는다.
  - 빌드 검사 `packages/cli/src/lib/apilevel.ts`: kotlinc 결과의 상수 풀을 읽고 SDK의 `data/api-versions.xml`(lint가 쓰는 파일)과 비교한다. 참조하는 클래스·멤버(앱의 상위 타입을 거쳐 찾는다), 상위 타입, invokedynamic이 만드는 람다 인터페이스를 본다. 허용 수준보다 높으면 빌드가 실패하고 클래스·API·고칠 방법을 적는다. 약 40ms.
  - 보지 못하는 것: 인라인 상수(`Build.VERSION_CODES`, `RECEIVER_*`, 권한 이름), 나중에 붙은 인터페이스(`TypedArray`의 `AutoCloseable`은 31), 문자열로 고르는 기능(`"Ed25519"`, 인텐트 액션), SDK 확장(R-ext). 소스 검토와 API 29 에뮬레이터 셀프 테스트로 막는다.
  - 플러그인 `android.minSdk`: 앱보다 높은 수준이 필요한 플러그인은 그 수준부터만 만들고, 아래에서는 모든 호출이 `UNSUPPORTED`다(`AkanNativeUnsupportedPlugin`). 그 패키지는 그 수준까지 검사에서 허용된다. sqlite 35(`SQLiteRawStatement`). updates는 전에 33(플랫폼 Ed25519)이었는데, 2026-09-27부터 33 미만에서 순수 Kotlin Ed25519(`AkanNativeEd25519.kt`, RFC 8032 §5.1.7)를 써서 29부터 동작한다. 공통 벡터 ed25519.json(RFC 8032 TEST 1과 node:crypto로 만든 유효·무효 23건)을 Bun crypto·CryptoKit·AkanNativeEd25519가 모두 통과한다.
  - 플러그인 생성·호출·알림에서 `LinkageError`도 잡는다. 놓친 분기가 앱 종료 대신 거절된 호출이 된다.
  - 공용 분기 `AkanNativeCompat`: 디스플레이(30), 형식 있는 Parcelable(34, 13의 버그 때문), 야간 모드 덮어쓰기(31 미만).
  - 셸: 29~34는 edge-to-edge가 자동이 아니라 셸이 켠다(29는 `SYSTEM_UI_FLAG_LAYOUT_*`, 30+ `setDecorFitsSystemWindows(false)`, 투명 바, cutout `shortEdges`/`always`). 29의 inset은 `systemWindowInsets`·`stableInsets`·`displayCutout`에서 계산하고, 키보드는 `systemWindow.bottom > stable.bottom`일 때다(androidx 규칙). 바 아이콘 색은 30 이하에서 옛 플래그, 전체 화면은 30 미만에서 immersive 플래그(포커스를 되찾으면 다시 건다), 뒤로 가기는 33 미만에서 `onBackPressed`(루트에서 29·30은 `moveTaskToBack`, 페이지 유지), 다크닝 끄기는 33 미만에서 `forceDark`, 스플래시는 31 미만에서 테마 창 배경(layer-list: 스플래시 색 + 가운데 이미지).
  - 최소 WebView: `android.minWebViewVersion`(기본 94, akan-native 런타임과 ES2022 static block). 사용자 에이전트의 `Chrome/N`으로 읽고, 낮으면 페이지 대신 셸 화면("Android System WebView 업데이트" + Play 버튼)을 보인다. 인라인 단일 파일은 파싱이 실패하면 흰 화면뿐이라서다(Capacitor는 로그만 남긴다).
  - 플러그인: haptics(31 미만 `VIBRATOR_SERVICE`, 30 미만 프리미티브 없음, 33 미만 터치 피드백 설정을 직접 읽고 sonification 속성), biometric(29는 강한 생체만, 화면 잠금만 허용되면 KeyguardManager 확인 인텐트), geolocation(31 미만 fused 없음, 30 `getCurrentLocation`, 29는 한 번짜리 업데이트, `LocationListener` 세 메서드 모두 구현), appearance(31 미만은 셸이 시작할 때 override configuration을 걸고 `set()`이 activity를 다시 만든다), local-notifications(31 미만 정확한 알람 허용, 33 미만 `POST_NOTIFICATIONS`를 요청하지 않는다: 요청하면 대화 상자 없이 거절되고 기록이 남는다), share(33 미만 리시버를 서명 권한으로 보호, `FLAG_MUTABLE`은 31+), camera(사진 선택기: 33+ 또는 30+ R-ext 2, 다음은 Play 백포트, 다음은 문서 선택기. 결과는 다른 앱의 content URI만), dialog(`TypedArray`는 `recycle()`), keyboard(`hide`는 30+에서만 insets controller).
  - 근거: [research/android-api29.md](research/android-api29.md)(Capacitor SystemBars·StatusBar, RN WindowUtil·ReactRootView, androidx 동작, Lynx KeyboardMonitor, 항목별 레퍼런스 위치).
- 남은 것: iOS 16 시뮬레이터와 Android 10(API 29) 에뮬레이터에서의 셀프 테스트(이미지 설치 대기), updates의 순수 Kotlin Ed25519 검증(Android 10~12에서 OTA가 필요해질 때).

### iOS 개인정보 매니페스트 (akanjs 준비 O1-4)
- App Store는 Required Reason API를 부르면서 이유를 적지 않은 바이너리를 받지 않는다. 빌드가 `PrivacyInfo.xcprivacy`를 앱 번들 루트에 만든다(`packages/cli/src/lib/privacy.ts`).
- 셸은 해당 API를 쓰지 않는다. 플러그인 매니페스트가 `ios.privacyApis`로 선언한다: preferences·appearance `UserDefaults: CA92.1`, filesystem `FileTimestamp: C617.1`(앱 컨테이너 안).
- 앱은 `config.privacy`로 추적 여부, 추적 도메인, 수집 데이터 유형, 자기 네이티브 코드의 API를 더한다. 범주와 이유 코드 형식은 빌드가 검사한다.

### Android 릴리스 (akanjs 준비 O1-5)
- 서명: release 빌드는 앱의 업로드 키로 서명한다. API `release({ signing })` 또는 `AKAN_NATIVE_ANDROID_KEYSTORE`, `AKAN_NATIVE_ANDROID_KEY_ALIAS`, `AKAN_NATIVE_ANDROID_KEYSTORE_PASSWORD`, `AKAN_NATIVE_ANDROID_KEY_PASSWORD`(없으면 store 비밀번호). 비밀번호는 자식 프로세스 env로만 넘기고 apksigner·jarsigner가 `env:`로 읽어 명령줄에 나타나지 않는다. 키가 없으면 `~/.akan/native/debug.keystore`로 서명하고 경고한다(테스트용).
- App Bundle: `akan-native build android --aab` 또는 `release()`의 기본 형식. aapt2를 `--proto-format`으로 한 번 더 링크하고, 같은 dex와 assets로 base 모듈 zip(`manifest/AndroidManifest.xml`, `resources.pb`, `res/`, `dex/`, `assets/`)을 만든 뒤, 고정한 bundletool(1.18.3, SHA-256, 첫 사용에 설치, `akan-native toolchain install bundletool`)의 `build-bundle`, 그리고 JDK `jarsigner`로 서명한다.
- 확인(2026-09-26): 테스트 키로 만든 AAB가 `bundletool validate`와 `jarsigner -verify`를 통과하고, `build-apks --mode=universal`로 뽑은 APK가 에뮬레이터에서 실행되어 페이지를 그렸다(production). bundletool의 키 비밀번호는 `pass:`와 `file:`만 받으므로, 이후 로컬 AAB 설치를 붙일 때는 0600 임시 파일을 쓴다.
- 버전: versionName = `app.version`, versionCode = `app.build`(최대 2100000000, 빌드가 검사).
- `android.debugAppIdSuffix`(예: `.debug`): debug 빌드의 applicationId에 붙는다. manifest의 `package`, `${applicationId}` 치환, FileProvider authority, 설치·실행(adb)에 쓰인다. akanjs 서버 assetlinks의 `.debug` 항목과 맞춘다.
- R8·d8이 dex를 여러 개 쓰면(`classes2.dex`…) 모두 담는다(FCM·Billing을 켜면 64K 메서드 한도를 넘는다, S2).
- Play 업로드(Developer API)는 뒤로 둔다(O1-6).

### 선언형 네이티브 설정 (akanjs 준비 O5, 아키텍처 검토 F)
- 병합 규칙(`packages/cli/src/lib/nativeconfig.ts`): 배열은 합집합, dict는 깊은 병합, 두 기여자가 다른 스칼라를 두면 둘의 출처를 적은 빌드 오류, 앱 설정은 마지막이고 이긴다. 번들 id, 실행 파일, 버전, 최소 OS, scene 설정처럼 akan-native가 가진 키는 앱도 바꿀 수 없다. 예전에는 `Object.assign`이라 두 플러그인의 `UIBackgroundModes`가 합쳐지지 않았다.
- iOS: Info.plist = akan-native 키 → 플러그인 `ios.infoPlist` → 앱(권한 문구 C8, usageDescriptions, `native.ios.infoPlist`). entitlements = akan-native(`application-identifier`) → 플러그인 `ios.entitlements` → `deepLinks.domains`의 `applinks:<host>` → `native.ios.entitlements`. Xcode 변수 `$(AppIdentifierPrefix)`·`$(TeamIdentifierPrefix)`·`$(PRODUCT_BUNDLE_IDENTIFIER)`를 채운다(시뮬레이터는 팀 없음).
- Android: 플러그인 XML 다음에 앱의 `native.android.manifest`(manifest 수준), `.application`, `.activity`(앱 activity 안). `${applicationId}`는 debug 접미사를 포함한 값으로 바뀐다. 구조화 병합(Gradle manifest merger 같은)은 AAR 장치(O8)에서 필요해지면 한다.
- 링크(O5-2): `deepLinks.domains`(호스트, Android용 `pathPrefixes`). iOS는 associated-domains와 `NSUserActivityTypeBrowsingWeb`(콜드 스타트는 `connectionOptions.userActivities`, 실행 중에는 `scene(_:continue:)`)을 `AkanNativeLinks`로 넘겨 `app.urlOpen`이 된다. Android는 호스트마다 `autoVerify` intent-filter이고, 들어온 VIEW 인텐트는 기존 경로(`AkanNativeLinks.urlOf`)를 탄다. 사이트는 AASA와 assetlinks.json을 서빙해야 한다(akanjs 서버, debug 빌드는 접미사 붙은 id). 실제 도메인 검증은 서버가 준비된 뒤 확인한다.
- 리소스(O5-3): `native.resources: [{ from, to }]`. `to`는 논리 위치다: `ios/<path>`(앱 번들), `android/res/<type>/<name>`(예: `android/res/raw/chime.mp3`), `android/assets/<path>`(`app/`, `akan-native/`는 akan-native 것). akan-native가 쓰는 파일(Info.plist, PrivacyInfo, 서명)을 덮는 위치는 빌드가 거부한다.
- 확인: 시험 앱으로 iOS·Android 빌드를 만들어 Info.plist 배열 병합, entitlements, 리소스 위치, app link intent-filter, 앱 XML, debug 접미사 치환을 확인했다.

### dev: 외부 dev 서버, 시작 경로, 기기 (akanjs 준비 O4)
- 외부 dev 서버(O4-1): `akan-native dev <ios|android> --upstream <url>` 또는 API `dev({ upstream })`. gateway(lib/hmr.ts)가 Bun dev 서버 대신 그 서버를 프록시한다. `/__akan_native/*` 밖의 모든 경로를 넘기고, HTML 응답에는 init.js, 소켓 심, CSP를 넣고, dev 서버 자신의 오리진으로 가는 리디렉션은 상대 경로로 바꿔 페이지가 앱 오리진에 남게 한다. 셸은 dev 빌드에서 페이지를 gateway에서 가져오고 오리진은 그대로다(`app://localhost`, `https://app.localhost`).
- HMR 소켓 경로(O4-2): `--hmr-path /_akan/hmr`. 심은 그 경로의 같은 오리진 소켓만 gateway로 돌리고(쿼리 유지) gateway가 dev 서버로 중계한다. 다른 같은 오리진 소켓은 release처럼 실패한다(dev와 release의 규칙을 같게).
- 시작 경로(O4-5): `--start "/en/?csr=true&akanMobileTarget=default"`(dev, run) 또는 API `startPath`. dev 빌드의 shell.json `startPath`로 들어가고 셸이 첫 페이지로 연다. `/__akan_native/*`, `//`로 시작하는 값, 공백은 거부한다. release 빌드는 늘 `/`에서 시작한다.
- 실기기(O4-3): Android는 `adb reverse`로 기기의 localhost가 gateway에 닿는다(기존). iPhone은 `--lan`: gateway가 모든 인터페이스에서 듣고, dev 빌드가 Mac의 사설 LAN 주소를 쓴다. 그때만 Info.plist에 `NSAppTransportSecurity.NSAllowsLocalNetworking`과 `NSLocalNetworkUsageDescription`이 들어가고, iOS 셸은 dev 빌드에서 loopback과 사설 IPv4(10/8, 172.16/12, 192.168/16)만 dev 서버로 받는다.
- 기기 선택(O4-4): Android `--device`는 연결된 기기의 serial(USB·Wi-Fi 기기, 실행 중인 에뮬레이터) 또는 AVD 이름이다. iPhone 실기기 실행은 기기 빌드(O1-2)와 함께 붙인다.
- 확인(2026-09-26): 가짜 akan dev 서버(`?csr=true`에만 CSR HTML, `/_akan/hmr` 소켓)로 iOS 시뮬레이터와 Android 에뮬레이터에서 시작 경로와 쿼리, 앱 오리진, init.js, HMR 소켓 왕복을 확인했다. 단위 테스트가 upstream 프록시, HTML 재작성, 리디렉션, 소켓 중계를 검사한다.

### keyboard 모드와 전환 이벤트 (akanjs 준비 O6-1)
- `keyboard.setResizeMode({ mode })`: `"resize"`(기본)는 페이지 뷰포트가 키보드만큼 줄어든다(Android는 WebView 컨테이너 padding, iOS는 셸이 웹 뷰 아래 제약을 키보드 애니메이션과 함께 옮긴다). `"none"`은 키보드가 페이지를 덮고 앱이 이벤트의 높이로 UI를 옮긴다. iOS 기본이 전에는 사실상 none(측정만)이었는데 Android와 같은 resize로 맞췄다(Capacitor 기본과도 같다).
- 이벤트 `willShow`·`didShow`·`willHide`·`didHide`(`{ height, duration }`), 기존 `change`는 그대로. iOS는 키보드 알림 네 개, Android 11+는 `WindowInsetsAnimation`의 시작과 끝, Android 10과 웹은 바뀐 뒤 will과 did를 함께 보낸다. 높이는 내비게이션 바 위의 키보드 높이(CSS px)이고, iOS는 셸의 루트 뷰 기준으로 잰다(resize 모드에서는 웹 뷰가 덮이지 않으므로).
- 확인: Android 에뮬레이터에서 입력을 탭해 resize(innerHeight 914 → 578)와 none(914 유지), 네 이벤트와 285ms를 확인했다. iOS는 시뮬레이터가 하드웨어 키보드를 쓰고 탭 자동화가 없어 컴파일까지만 확인했다(수동 확인 필요).

### iPhone 빌드·서명·IPA (akanjs 준비 O1-2, O1-3)
- `akan-native build ios --device`(API `build({ ios: { device: true } })`): iphoneos SDK, `arm64-apple-ios16.0`, actool `--platform iphoneos`. 시뮬레이터 빌드와 폴더가 따로다(`.akan/native/build/ios/device`). Info.plist에 `CFBundleSupportedPlatforms: iPhoneOS`, `UIRequiredDeviceCapabilities: arm64`와 App Store Connect가 읽는 빌드 환경 키(DTXcode, DTSDKName, DTPlatformBuild, BuildMachineOSBuild …)를 넣는다.
- 서명(`packages/cli/src/lib/iossigning.ts`, D7 1단계: Xcode가 만든 인증서와 프로파일)
  - 식별자와 프로파일은 함께 찾는다(`chooseSigning`, 규칙은 docs/api.md §3 "서명 찾기"). 식별자는 로그인 키체인의 유효한 인증서다(`security find-identity -v`, 폐기된 것은 빠진다). 이름이 같은 인증서가 여럿이면 SHA-1을 요구하고, codesign에는 늘 SHA-1을 넘긴다. debug는 Apple Development, release는 Apple Distribution이다. 프로파일은 `AKAN_NATIVE_IOS_PROFILE`·`signing.provisioningProfile`, 없으면 Xcode의 프로파일 폴더에서 찾는다. 맞는 프로파일은 번들 id(와일드카드는 푸시·associated domains가 없을 때만), 종류(debug development, release app-store, ad-hoc은 `distribution: "ad-hoc"`일 때만), 만료, 팀(`teamId`), 설치할 iPhone의 UDID(run·dev, development·ad-hoc 프로파일만), 앱이 요청하는 권한, 키체인에 있는 인증서가 모두 맞는 것이다. 정확한 번들 id가 와일드카드보다 먼저다. 팀이나 인증서가 여럿 남으면 고르지 않고 후보 목록과 함께 SIGNING_FAILED로 끝낸다. 하나씩이면 가장 늦게 만료되는 프로파일을 쓴다. 고른 결과는 로그와 `BuildResult.signing`에 남는다. `AKAN_NATIVE_IOS_TEAM`·`AKAN_NATIVE_IOS_IDENTITY`·`AKAN_NATIVE_IOS_DISTRIBUTION`으로 좁힌다. `security cms -D`로 풀고 자체 XML plist 읽기로 읽는다(plutil의 JSON은 data·date를 못 담는다).
  - entitlements = 앱의 것(O5, Xcode 변수를 팀 접두어로 채움) + team-identifier + `get-task-allow`(development 프로파일만) + `beta-reports-active`(프로파일에 있으면). 프로파일의 App ID가 허용하지 않는 것은 빌드 전에 오류로 알린다(push의 aps-environment 값, associated-domains, 키체인 그룹 …).
  - `embedded.mobileprovision`을 넣고 `codesign --force --sign <SHA-1> --entitlements … --generate-entitlement-der`(debug는 `--timestamp=none`). 키체인이 codesign의 키 사용을 물으면 허용해야 한다.
- 실행(O4-4): `akan-native run ios --device "<페어링한 iPhone 이름·UDID>"`(API `run({ device })`, `dev({ device })`): 이름이 페어링한 기기면 iPhone 빌드를 만들어 `xcrun devicectl device install app`, `devicectl device process launch --terminate-existing --console`로 설치·실행하고 콘솔 출력을 로그로 받는다. 이름의 ’와 '는 같게 본다. 기기는 iOS의 개발자 모드가 켜져 있어야 한다.
- IPA(O1-3): release iPhone 빌드(API `release({ platform: "ios" })`)는 `Payload/<App>.app`을 `ditto -c -k --keepParent`로 묶은 .ipa도 만든다(Xcode와 같은 방식). TestFlight 업로드는 Xcode 동봉 도구로 붙인다(배포 인증서·App Store 프로파일·계정 준비 뒤).
- 확인(2026-09-26): 샘플의 iPhone 빌드가 컴파일된다(arm64, platform IOS, minos 16.0).
- 확인(2026-09-27): 사용자가 Xcode로 `com.akanjs.sample` 개발 프로파일(Push Notifications 포함)을 만든 뒤, `akan-native run ios --device`가 iPhone 13 mini(iOS 26.6.2)에 서명·설치·실행했다. 키체인에 개발 인증서가 둘이라 처음에는 선택을 요구했는데, 프로파일이 허용하는 인증서로 고르도록 고쳤다. push 확인 앱이 실제 APNs 토큰을 받았다. iOS 16.4 시뮬레이터 자가 테스트 70/70. 단위 테스트가 plist 읽기, 프로파일 해석·선택 조건, entitlements 검사, 식별자 선택을 검사한다.

### 고정 Maven 라이브러리 (akanjs 준비 O8)
- 옵트인 Android 모듈(push의 FCM, iap의 Play Billing)만 Maven AAR을 쓴다. 플러그인 manifest의 `android.maven`에 루트 좌표를 적고, 그 플러그인을 쓰는 앱에만 들어간다. 사용자 결정으로 두 모듈의 전이 의존성(kotlinx-coroutines, Okio, DataStore와 그 `.so`, datatransport)은 그대로 허용한다.
- 잠금 `native/android/maven.lock.json`: 루트 조합(FCM, Billing, 둘 다)마다 폐포 하나와 파일마다 URL·SHA-256·크기. 빌드 때 해석기는 없다. Kotlin 표준 라이브러리 계열은 빼고 akan-native의 2.4.20을 쓴다(Billing만의 폐포는 1.8.22와 1.6.21 jdk7·jdk8이 겹쳐 d8이 거절한다). 조사: research/android-aar-closure.md.
- 빌드(`lib/maven.ts`, `lib/manifestmerge.ts`, android.ts)
  - 받은 파일은 SHA-256을 확인하고 `~/.akan/native/maven`에 두며, AAR은 한 번 풀어 둔다(classes.jar, manifest, res, R.txt, proguard.txt, jni, jar의 `META-INF/services`).
  - manifest: 자체 병합기. `${applicationId}`(debug 접미사 포함) 치환, `tools:` 제거, 권한과 `<queries>`는 한 번씩, 같은 이름의 컴포넌트는 하나로(meta-data는 이름마다 한 번, intent-filter는 하나씩). Firebase의 `ComponentDiscoveryService`처럼 여러 AAR이 나눠 선언한 것을 합친다. `<application>` 속성은 `appComponentFactory`만 가져온다(Gradle과 같게).
  - 리소스: 각 AAR의 res를 aapt2로 한 번 컴파일해 두고 앱 패키지에 overlay로 링크한다(`-R`, `--auto-add-overlay`). R.txt가 있는 라이브러리 패키지마다 R 클래스를 만들고(`--java --extra-packages`) JDK javac로 컴파일한다. 그래서 링크를 Kotlin·dex보다 먼저 한다.
  - dex: kotlinc·d8의 classpath에 라이브러리 jar. debug는 라이브러리 dex를 폐포마다 한 번 만들어 캐시하고 R 클래스만 매번 dex한다. release R8은 라이브러리 jar, R 클래스, 각 AAR의 `proguard.txt`, aapt2 `--proguard`가 만든 manifest keep 규칙(컴포넌트와 `appComponentFactory`)을 받는다. dex가 여러 개면 모두 담는다.
  - APK·AAB: `META-INF/services/*`를 합쳐 루트에(AAB는 `root/`), `jni/<abi>/*.so`는 `lib/<abi>/`에(압축, 설치할 때 푼다).
- 확인(2026-09-26): FCM + Billing 폐포(69개)를 쓰는 시험 플러그인으로 debug(APK 10.8MB), release R8(1.28MB), AAB → universal APK를 만들어 에뮬레이터에서 실행했다. FirebaseApp 초기화, `FirebaseMessaging` 컴포넌트, `google_play_services_version` 리소스, Billing 서비스 연결(에뮬레이터에 Play 계정이 없어 BILLING_UNAVAILABLE)이 모두 동작했다. 첫 release에서 R8이 `CoreComponentFactory`를 지운 것을 aapt2 keep 규칙으로 고쳤다. 조사 초안의 URL 7개가 Maven Central 것이라 고쳤다(SHA-256은 그대로).
- 라이선스 고지(사용자 결정 2026-09-27)
  - 잠금이 각 라이브러리의 POM도 URL·SHA-256·크기로 고정하고, POM이 선언한 라이선스를 담는다(선언이 없으면 부모 POM의 것, `parents`에 고정). `scripts/maven-licenses.ts`가 채우고 `--check`가 다시 받아 비교한다. 추측한 라이선스는 없다.
  - 빌드는 이 라이선스와 AAR에 든 내장 코드 고지(`third_party_licenses.json`·`.txt`, Play services와 Billing)를 합쳐 웹 루트의 `/akan-native-licenses.json`(과 APK 옆)에 둔다. 앱은 이것을 오픈소스 라이선스 화면에 보여 주면 된다. web.dir에 같은 이름의 파일이 있으면 빌드 오류다.
  - 확인: push와 iap를 넣은 시험 앱(합친 폐포)에서 라이브러리 69개(Android SDK License 10개, 나머지 Apache 2.0·BSD-3-Clause)와 내장 고지 76건, 845KB를 페이지가 읽었다.
  - 데스크톱 앱에 든 Rust crate와 Bun 런타임의 고지는 아직 모으지 않는다(이후).

### push (akanjs 준비 O6-2)
- 플러그인 `@akanjs/native/plugins/push`(plugins.md 4.6). iOS는 APNs 직접, Android는 옵트인 FCM 모듈(고정 Maven 폐포 `fcm`).
- iOS 셸: `AkanNativeAppDelegate`가 `didRegisterForRemoteNotificationsWithDeviceToken`·`didFailToRegister…`·`didReceiveRemoteNotification(fetchCompletionHandler:)`를 `AkanNativeRemoteNotifications`에 넘긴다. 등록 결과는 마지막 값을 기억해 늦게 만든 플러그인도 받는다. 무음 push는 플러그인이 `received`를 듣고 있으면 `.newData`, 아니면 `.noData`로 끝낸다.
- Android: google-services Gradle 플러그인 대신 CLI가 `android.googleServices`(google-services.json)를 `google_services.xml` 문자열 리소스로 바꾼다. FirebaseApp은 `FirebaseInitProvider`(병합된 manifest)가 이 문자열로 초기화한다. push 플러그인이 있는데 설정이 없으면 빌드가 경고한다.
- 서명: iPhone 빌드의 `aps-environment`는 프로파일 entitlements의 값을 쓴다(App ID에 Push Notifications가 없으면 빌드 전 오류).
- 확인(2026-09-27, 시험 앱)
  - iOS 시뮬레이터(26.5): `register()`가 실제 APNs 토큰(hex)을 받았고, foreground에서 `xcrun simctl push`가 `received`(제목·본문·data)로 왔다. 탭은 자동화할 수 없어 보지 못했다(라우터 replay는 local-notifications와 같은 길).
  - Android 에뮬레이터: 가짜 google-services.json의 문자열로 FirebaseApp이 초기화됐고, 잘못된 API 키에서 `register()`가 거절로 끝났다(처음에는 실패한 Task의 `result`를 읽어 앱이 죽었다. 고침). FCM 알림 탭과 같은 인텐트 extras로 실행 중 탭과 콜드 스타트 탭(리스너가 붙은 뒤 한 번)이 `action`으로 왔고 `google.*`·`from`은 빠졌다.
  - 실기기(2026-09-27, iPhone 13 mini, iOS 26.6.2, Apple의 Push Notifications Console로 발송): 앱이 앞에 있을 때 배너와 `received`, 홈에서 탭하면 `action`, 앱을 닫은 뒤 탭하면 새로 켜진 페이지에 `action`이 한 번 왔다.
    - 처음에는 이벤트가 오지 않았다. 원인 하나는 시험 중 폰이 잠겨 앱이 앞에 없었던 것이다. 다른 하나는 셸의 빈틈이었다. 뒤로 간 앱의 WebView 프로세스를 iOS가 종료하면 셸은 페이지만 다시 불러오고 문서를 끝내지 않았다. 그래서 그 사이의 탭이 "듣는 페이지가 있다"며 죽은 페이지로 보내져 사라질 수 있었다. 이제 iOS(`webViewWebContentProcessDidTerminate`)와 Android(`onRenderProcessGone`)가 그 자리에서 문서를 끝내고, 탭은 보관됐다가 다음 페이지에 전달된다(3단계 "렌더러 종료는 문서 종료").
    - iOS 셸이 알림마다 어느 플러그인이 받았고 페이지에 전달했는지 한 줄씩 로그를 남긴다.
  - 실제 FCM 수신은 Firebase 프로젝트가 있어야 해 앱 쪽에서 확인한다.

### iap (akanjs 준비 O6-3)
- 플러그인 `@akanjs/native/plugins/iap`(plugins.md 4.8). iOS StoreKit 2, Android Play Billing 9.1.0(고정 Maven 폐포 `billing`, push와 함께면 `union`).
- 스토어 연동 시험은 사용자가 판매하는 앱에서 한다(사용자 결정). 여기서는 컴파일, 단위 테스트, 스토어가 없는 환경의 동작까지 확인했다.
- 확인(2026-09-27, 시험 앱)
  - iOS 시뮬레이터: `canMakePayments` true, StoreKit 설정 파일이 없어 상품은 모두 `invalidIds`, 미완료·보유 거래는 빈 목록, 없는 상품 구매 `NOT_FOUND`, UUID가 아닌 accountId와 숫자가 아닌 거래 id는 `INVALID_ARGS`.
  - Android 에뮬레이터(Play 계정 없음): debug와 release(R8) 모두 `canMakePayments` false, 나머지 호출은 바로 `BILLING_UNAVAILABLE`(`UNSUPPORTED`). 처음에는 자동 재연결 때문에 호출마다 3초 뒤 SERVICE_DISCONNECTED였다(고침).

### M5 (`akan-native dev`, `akan-native test`)
- **`akan-native test <platform|all>`**: dev 빌드를 만들고 `AKAN_NATIVE_PUBLIC_SELFTEST=1`로 실행한 뒤, 호스트 로그에서 `AKAN_NATIVE_SELFTEST {json}` 줄을 기다린다(기본 180초). web은 headless Chrome을 DevTools protocol로 띄워 console을 읽는다. macOS는 포커스를 뺏지 않는 모드(`AKAN_NATIVE_ACTIVATION=prohibited`)로, iOS·Android는 창을 열지 않고 돌린다. 결과(이 Mac, 캐시 있음): **web 11/11 · macOS 12/12 · iOS 11/11 · Android 11/11, 전체 약 5.5초.**
- 플랫폼마다 `launch(ctx, artifact, { env, headless, onLine })`가 있고, `akan-native run`과 `akan-native test`, `akan-native dev`가 이것을 쓴다(`packages/cli/src/lib/launch.ts`).
- **`akan-native dev <platform>`**: 앱 폴더를 감시한다(`node_modules`, `.akan`, `web.dir`은 제외). 바뀌면 SPA를 다시 빌드하고 플랫폼마다 다르게 반영한다.

  | 플랫폼 | 반영 방식 | 측정 |
  |---|---|---|
  | web | 정적 서버 + server-sent events(`/__akan_native/dev/events`, dev 전용). init.js 끝에 재로드 클라이언트를 붙인다 | 35ms 후 페이지 재로드 |
  | macOS | 실행 중인 `.app`의 `Resources/app`을 바꾼다. dev 빌드의 plugin host가 `AKAN_NATIVE_DEV_WATCH=1`이면 그 폴더를 감시해 `location.reload()` | 46ms |
  | iOS | 다시 빌드(Swift 캐시) → `simctl install` → 재시작 | 0.7초 |
  | Android | 다시 빌드(Kotlin 캐시) → `adb install -r` → `am start -S` | 2초 |
- **상태 유지 HMR: `akan-native dev <platform> --hmr`** (`packages/cli/src/lib/hmr.ts`).
  - 구성: Bun dev server(`web.devEntry`, 기본 `index.html`)를 자식 프로세스로 띄우고, 게이트웨이 한 포트만 밖에 노출한다.
  - Fast Refresh: Bun 1.4.2 dev server가 react-refresh 런타임을 자체로 들고 있으므로 새 의존성이 없다(조사: 리액트 renderer의 `scheduleRefresh` 경로).
  - 호스트: dev 빌드 호스트는 shell.json `devServer`가 있을 때 `/__akan_native/*` 밖의 요청을 게이트웨이에서 가져오되 오리진은 유지한다. 그래서 브리지, ACL, 저장소, CSP가 production과 같다.
    - macOS: std TCP HTTP/1.1 클라이언트(`native/desktop/src/devproxy.rs`)
    - iOS: URLSession
    - Android: HttpURLConnection + `adb reverse`. `10.0.2.2`로의 ws://는 https 페이지에서 막혀서 쓸 수 없다.
  - 소켓: 페이지 shim이 Bun의 `/_bun/hmr` 소켓을 `ws://localhost:<port>`로 돌린다.
  - dev CSP: `script-src blob:`, `connect-src ws://localhost:<port> ws://127.0.0.1:<port>`만 더한다. Bun의 인라인 스크립트와 shim은 해시로 넣는다.
  - 게이트웨이가 없으면 번들 파일을 쓴다.
  - 제약: build.ts의 `define`은 적용되지 않으므로 `bunfig.toml [serve.static] define`을 쓴다. Bun 내부(`/_bun/*`, 주입 스크립트)에 기대므로 Bun을 고정한다(CLI-10).
  - 확인: web, macOS, iOS 시뮬레이터, Android 에뮬레이터에서 레이블 수정·문법 오류 복구·CSS 수정 뒤 카운터 값이 유지됐다. 훅을 추가하면 React 규칙대로 초기화된다.
  - 확인(2026-09-26, Windows·Linux): 문구를 고치면 페이지를 다시 읽지 않고 바뀌었다.
    - Windows VM: CDP로 심은 `window.__hmr`가 남은 채 문구가 바뀌었다. 페이지 오리진이 `https://app.localhost`여도 `ws://localhost` 소켓은 막히지 않는다.
    - Linux 컨테이너: HMR 소켓 연결 로그는 한 번뿐이었고, 파일 끝에 붙인 `console.log`가 수정마다 찍혔다.
    - 샘플은 `build.ts`의 `define`(`__BUILD_TIME__`, `__BUILD_MODE__`)을 `examples/sample/bunfig.toml`에도 둔다. 없으면 dev server 페이지가 ReferenceError로 멈춘다.
- release 빌드 확인: Android R8 APK 161KiB(웹 번들 포함), 콜드 스타트 416ms · iOS `-Osize` · macOS release dylib. 세 가지 모두 실행해서 화면을 확인했다.

### 아이콘·스플래시 (CLI-8, SH-6)
- 설정은 `icon`(정사각 PNG 한 장, 1024 권장)과 `splash`(`backgroundColor`·`image`·`autoHide`·`timeout`)다. 스플래시 색의 기본값은 `shell` 배경색이라, 설정하지 않아도 launch screen → 페이지 사이에 색이 튀지 않는다.
- 이미지 처리는 CLI 자체 코드다(`lib/png.ts`: 비인터레이스 PNG 전 색 형식 디코드, RGBA 인코드와 행별 필터 선택 / `lib/image.ts`: premultiplied alpha 리사이즈, 축소는 면적 평균). `sips`·ImageMagick이 없어도 되고 Android 빌드는 호스트를 가리지 않는다.
- macOS: `AppIcon.icns`를 TS로 쓴다(PNG 청크 11개, `CFBundleIconFile`). 불투명(full-bleed) 원본은 Big Sur 격자(1024 안 824px 둥근 사각형, 반경 185px)로 마스크한다. macOS 26은 이를 규격 아이콘으로 보고 유리 테두리를 입힌다(NSWorkspace 렌더로 확인). 투명 원본은 그대로 쓴다.
- iOS: `Assets.xcassets`를 만들어 `xcrun actool`로 컴파일한다(`Assets.car` + `AppIcon60x60@2x.png` 등, partial Info.plist의 `CFBundleIcons`를 합친다). 1024 universal 이미지 하나면 actool이 나머지 크기를 만든다(Xcode 26 확인). 첫 컴파일은 약 4초라 catalog 해시로 캐시한다.
  - launch screen: `UILaunchScreen`의 `UIColorName: AkanNativeSplashBackground`(라이트·다크 color set), `UIImageName: AkanNativeSplash`(136pt 상자에 맞춘 1x·2x·3x).
  - 덮개: 셸이 같은 색·이미지를 WebView 위에 올리고 첫 `didFinish`(autoHide)·`splash-screen` 플러그인의 `hide()`·timeout에 걷는다. `simctl launch --wait-for-debugger`로 앱을 main 전에 멈춰 시스템 launch screen만 캡처해 비교하면 이미지 위치·크기(408px@3x)가 같다. 색은 스냅샷 색 변환 때문에 RGB 1–4 차이.
- Android: 이제 res/를 항상 만든다. 테마 `AkanNativeTheme`(DeviceDefault.DayNight 상속)가 `windowBackground`(shell 색)·`windowSplashScreenBackground`·`windowSplashScreenAnimatedIcon`(288dp 캔버스 가운데 136dp에 이미지; 없으면 시스템이 앱 아이콘을 쓴다)을 정한다. 셸은 `OnPreDrawListener`가 false를 돌려주는 동안 시스템 스플래시를 유지하고(androidx `setKeepOnScreenCondition`이 하는 일과 같다), 첫 `onPageFinished`·`hide()`·timeout에 놓는다. 걷힐 때는 `setOnExitAnimationListener`로 페이드한다. 아이콘은 adaptive icon(108dp 전경의 가운데 72dp에 원본, 배경은 `icon.backgroundColor` 또는 불투명 원본의 왼쪽 위 색), 비트맵은 xxxhdpi 한 벌.
- timeout(기본 10초)에 걸려 걷히면 셸이 경고를 남긴다(Capacitor와 같은 문구). `autoHide: false`면 앱이 첫 화면을 그린 뒤 `splashScreen.hide()`를 부른다.
- 아이콘이 없으면 각 플랫폼의 기본 아이콘이 쓰인다(기본 아이콘을 만들어 넣지 않는다). web은 앱의 `index.html`(favicon)이 맡는다.

### 버전 호환 규칙 (UP-3)
- 규칙: 웹 번들은 그것을 빌드할 때와 **네이티브 API 지문이 같은** 앱 바이너리에서만 돈다. 지문(`packages/cli/src/lib/compat.ts`)에 들어가는 것:
  - 브리지 프로토콜 버전
  - `@akanjs/native/core` 버전의 caret 범위. 0.x는 minor(`0.1`), 1.0부터는 major
  - 플랫폼
  - 그 플랫폼 boot.json의 플러그인 선언(메서드·이벤트·`web`)과 네이티브 구현 플러그인의 package 버전
  - 해석된 capabilities
  - 앱 권한(C8), 딥링크 스킴

  모두 바이너리에 구워지는 것(boot.json, Info.plist, AndroidManifest)이라, 하나라도 바뀌면 스토어에 새 바이너리를 내야 한다. 웹 코드와 env만 바뀌면 지문은 그대로다.
- 노출:
  - boot.json `nativeApi`(16자리 hex)로 넣고, 페이지에서는 `import { nativeApi } from "@akanjs/native/core"`로 읽는다(web은 null). `runtimeVersion`은 전과 같이 init.js에 있다.
  - 네이티브 빌드마다 `.akan/native/build/<platform>/bundle.json`을 쓴다. 들어가는 것:
    - `app`(id·version·build)
    - `runtimeVersion`
    - `nativeApi: { hash, inputs }`
    - `web: { hash, files }`. 서빙되는 index.html과 public/의 sha256이고, UP-2의 무결성 검사용이다.
- 확인: 스토어에 낸 빌드의 bundle.json을 보관해 두고 `akan-native compat ios --against release-1.2.json`을 돌린다. 호환되면 웹만 배포해도 된다고 하고, 아니면 바뀐 항목을 나열하고 exit 1로 끝나서 CI에서 막을 수 있다. 예: `plugin preferences is native: get, set, clear in the bundle, native: get, set in the app`.
- 참고: Capacitor는 바이너리의 versionCode·versionName이 바뀌면 라이브 업데이트 경로를 버린다(`capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java:429-455`, iOS `CAPBridgeViewController.swift:18-30`). 안전하지만 거칠다. 네이티브가 그대로인 새 바이너리에서도 웹 업데이트를 모두 버린다. akan-native는 지문을 비교하므로, UP-2에서 셸은 "받은 번들의 `nativeApi`가 자기 boot.json과 같을 때만 쓰고, 다르면 내장 번들로 돌아간다"는 규칙 하나만 지키면 된다.

### 업데이트 (UP-1 앱, UP-2 웹 번들)
- 도구: `akan-native update keygen`은 Ed25519 키를 `~/.akan/native/keys/<app id>.update.key`(0600)에 만든다. `AKAN_NATIVE_UPDATE_KEY`로 경로를 바꿀 수 있고, 있으면 덮어쓰지 않는다. 출력한 공개 키는 설정 `updates.publicKey`에 넣는다.
- 게시: `akan-native update publish <ios|android|macos|windows|linux>`는 release로 빌드한 뒤(`--debug`는 업데이트 흐름 시험용) `.akan/native/updates/<platform>/`에 다음을 쓴다. 데스크톱 앱은 CPU마다 따로 `.akan/native/updates/<os>-<arch>/`(예: `macos-arm64`)이고, 매니페스트에 서명되는 `arch`가 들어간다. 앱은 자기 CPU의 폴더만 보고 `arch`가 다르면 받지 않는다(다른 CPU용 앱은 시작도 못 해서 롤백도 할 수 없다).
  - `<channel>.json`: 매니페스트
  - `<channel>.json.sig`: 매니페스트 바이트 전체에 대한 서명
  - 웹 번들은 `files/<sha256>`에 내용 주소로 저장한다.
  - 앱은 `app/<tar sha>.tar.gz`와 직전 릴리스로부터의 `app/<from>-<to>.delta.gz`를 저장한다. 다음 delta는 직전 릴리스의 `.tar.gz`를 풀어 만든다. 예전에는 비압축 `<tar sha>.tar`를 같은 폴더에 두었는데, 폴더를 그대로 올리면 같이 올라가서 다음 게시가 지운다(2026-09-30 10 리뷰).
  - 매니페스트의 `server`는 앱이 서버를 싣는지다. 같은 채널의 직전 릴리스와 다르면 게시하지 않는다. 설치된 앱이 모두 그 릴리스와 그 뒤의 릴리스를 거부하기 때문이다. 다른 채널(`updates.channel`)로 게시하거나, `<channel>.json`을 지워 채널을 새로 시작한다.
  - 게시 폴더는 받을 수 있는 누구나 읽는다. 데스크톱 릴리스는 앱 전체이므로 실린 서버의 `private/`와 env 파일도 들어 있다. 업데이터는 인증 헤더를 보내지 않는다.

  `akan-native update serve`는 이 폴더를 `0.0.0.0:8790`에서 서빙한다. Android 에뮬레이터는 `adb reverse`를 거쳐 `127.0.0.1`로 들어온다.
- 채널 이름은 설정 `updates.channel`과 같은 규칙(소문자·숫자·`.`·`_`·`-`, 42자까지)이어야 게시된다. `--channel`과 API `publishUpdate({ channel })`는 빌드 전에 확인한다. 대문자나 경로 구분자가 든 이름은 파일은 써져도 어떤 앱도 받지 못하거나 폴더 밖에 쓰인다.
- `sequence`는 게시하는 컴퓨터의 시각(초)이다. 앱은 자기 것보다 큰 `sequence`만 받는데, 처음 설치된 앱의 기준은 그 앱을 빌드한 컴퓨터의 시각(`embeddedSequence`)이다. 그래서 게시하는 컴퓨터의 시계가 빌드한 컴퓨터보다 늦으면 새 릴리스가 오래된 것으로 보여 오류 없이 무시된다. 게시는 같은 폴더에 이미 있는 그 채널의 매니페스트보다 큰 값을 쓴다(`max(이전 + 1, 지금)`, 시계가 늦으면 경고). 다른 컴퓨터에서 빌드·게시할 때는 두 시계를 맞춘다.
- 게시 폴더를 CDN으로 서빙할 때: `app/*`와 `files/*`는 내용의 해시가 이름이라 오래 캐시해도 된다. `<channel>.json`과 `<channel>.json.sig`는 따로 받는 두 파일이라, 캐시하지 않거나 둘을 함께 무효화한다. 새 매니페스트와 옛 서명(또는 반대)이 짝지어지면 모든 앱이 "the release signature does not match updates.publicKey"로 캐시가 만료될 때까지 업데이트를 멈춘다(키가 바뀐 것처럼 보인다). 올릴 때는 `app/*`·`files/*`를 먼저, 두 파일을 마지막에 함께 올린다. 앱의 `cache: "no-store"`는 앱 자신의 캐시만 끈다.
- 서명 분리(웹 번들만): API `packUpdate`(akan은 `akan pack-update`)는 키 없이 `files/<sha256>`, `bundle.json`, `manifest.template.json`을 쓴다. 템플릿은 위 매니페스트에서 `channel`(`""`), `sequence`(`0`), `bundle`(`""`)만 비운 것이다. 키를 가진 쪽이 게시할 때 지킬 계약:
  - `channel`: 바이너리의 `updates.channel`과 같아야 한다. 다르면 앱이 "made for another app, platform or channel"로 버린다.
  - `sequence`: 게시 시각(초, 양수). 그 채널에 이미 게시한 값과 바이너리 빌드 시각(`embeddedSequence`)보다 커야 받는다. 롤백은 이전 번들을 새 `sequence`로 다시 게시하는 것이다.
  - `bundle`: `[A-Za-z0-9_.-]{1,80}`, `.`로 시작하지 않는다. 관례는 `<sequence>-<bundle.json web.hash 앞 8자>`.
  - 바이트: 채운 매니페스트를 직렬화한 바이트 그대로를 `<platform>/<channel>.json`으로 올리고, 그 바이트에 대한 Ed25519 서명(64바이트)의 base64를 `<channel>.json.sig`로 올린다. 앱은 받은 바이트로 검증한 뒤에 파싱하므로 키 순서·공백은 자유다. `update publish`는 `JSON.stringify(m, null, 2) + "\n"`을 쓴다. 서명 파일 앞뒤 공백은 무시한다.
  - 순서: `files/`를 먼저 올리고 매니페스트와 서명을 마지막에 올린다. 매니페스트가 먼저 보이면 아직 없는 파일을 받으려다 실패한다.
  - 스토어 판정: `compareBundles(<스토어 빌드의 bundle.json>, <pack의 bundle.json>)`에 문제가 있으면 그 번들은 새 바이너리가 필요하다(`akan pack-update --against`).
- release 빌드의 `updates.url`은 https여야 한다(이 기기의 http, 즉 localhost·127.x만 예외). 서명이 내용을 지키더라도 평문은 경로 위의 누구나 업데이트를 막거나 큰 매니페스트를 보낼 수 있게 한다.
- 받는 크기 상한(세 플랫폼): 매니페스트 1 MiB, 서명 1 KiB, 파일은 매니페스트에 서명된 크기까지. Content-Length가 넘거나 받는 도중 넘으면 멈춘다. 매니페스트와 서명은 검증 전에 받으므로 필요하다. iOS와 Android는 파일을 메모리가 아니라 디스크로 받으며 해시한다(iOS `URLSession.download`, Android 64 KiB씩 쓰며 `MessageDigest`). Android worker는 `OutOfMemoryError`도 잡아 호출에 답한다.
- 서명 범위: Tauri는 산출물만 서명하고 매니페스트는 열어 둔다. 그래서 다운그레이드를 막으려고 서명된 버전 문자열을 따로 비교한다(`tauri-plugins-workspace/plugins/updater/src/updater.rs:1661-1708`). Electrobun은 해시를 식별자로만 쓰고 HTTPS를 믿는다(`electrobun/package/src/sdks/main/core/Updater.ts:1426-1460`). akan-native는 매니페스트 전체를 서명한다. 서명된 `sequence`(게시 시각)가 커져야만 받아들이므로 오래된 정상 서명 릴리스를 다시 보내는 공격이 통하지 않는다. 서명이 맞기 전에는 매니페스트의 어떤 필드도 쓰지 않는다.
- 웹 번들(UP-2, iOS·Android):
  - 셸의 `AkanNativeUpdates`(Swift·Kotlin, 같은 규칙과 파일 형식)가 실행할 번들을 고른다. 상태는 `Application Support`(iOS) 또는 `noBackupFilesDir`(Android) 아래 `akan-native-updates/state.json`에 원자적으로 쓴다(`{ current, pending, trial, failed, rolledBack }`). 번들 파일은 `bundles/<bundle>/`에 둔다.
    - Android 위치(2026-09-26 검토 반영): 예전에는 `filesDir/akan-native-updates`였는데, `filesDir`는 filesystem 플러그인의 `data` base다. 페이지가 번들과 state.json을 써 넣으면 서명 없는 번들이 재시작 뒤에도 돌았다. 지금은 `noBackupFilesDir`이고(백업·기기 이전에서도 빠진다), 예전 폴더는 시작할 때 지운다. iOS의 filesystem `data`는 `Application Support/files`라 원래 분리돼 있었다.
    - 시작할 때마다 다시 검증한다: 플러그인이 번들 옆에 `manifest.json`과 받은 서명 `manifest.json.sig`를 두고, 셸은 서명, 매니페스트의 bundle·sequence·nativeApi·app·platform, 나열된 파일이 모두 그 크기로 있는지를 확인한 번들만 쓴다(해시는 받을 때 확인했다). 에뮬레이터·시뮬레이터에서 `index.html`에 한 바이트를 덧붙이면 내장 번들로 돌아가고 다시 받는 것을 확인했다.
    - 상태 파일: 쓰기 실패(디스크 가득)를 알려 준다(iOS는 `write(options: .atomic)`의 오류, Android는 `AtomicFile`로 sync한 뒤 rename). 기록하지 못한 trial은 되돌릴 방법이 없으므로 실행하지 않는다. pending은 기록할 수 있는 다음 시작까지 기다린다.
  - 스킴 핸들러와 에셋 서버는 번들 폴더를 루트로 서빙한다. `env.runtime.json`도 번들의 것을 쓴다. boot.json과 ACL은 바이너리의 것 그대로다.
  - 버리는 번들: 다른 `nativeApi`로 만든 번들과, 바이너리 빌드 시각(`updates.json`의 `embeddedSequence`)보다 오래된 번들. Capacitor는 새 바이너리가 설치되면 라이브 업데이트를 무조건 버린다(`CAPBridgeViewController.swift:18-29`, `Bridge.java:429-455`). akan-native는 이 규칙을 지문과 시각으로 좁혔다.
  - 플러그인 `@akanjs/native/plugins/updates`의 동작:
    - `check`, `download`: 서명을 검증하고, 파일마다 sha256을 확인한다. 실행 중인 번들에 같은 파일이 있으면 복사하고 없으면 받는다. `bundles/<id>.partial`에 다 받은 뒤, 모든 파일이 그 크기로 있는지 보고 rename한다. 셸의 정리(`prune`)는 `.partial`을 지우지 않는다(받는 도중 notifyReady가 불리면 예전에는 지워졌다).
    - `apply`: 지금 새 번들로 다시 로드한다.
    - `notifyReady`, `reset`
- 앱(UP-1, macOS·Windows·Linux): 데스크톱 플러그인(Bun Worker)이 앱 전체를 바꾼다. macOS는 `.app`, Windows·Linux는 앱 폴더다.
  - 상태(`state.json`)와 다음 delta의 기준 tar는 `<app local data>/akan-native-updates`에 둔다(`ctx.appLocalDataDir`, Windows `%LOCALAPPDATA%\<id>`). 기준 tar는 앱 전체이고 trial은 이 PC의 설치에 속하므로, 사용자를 따라 옮겨 다니는 Roaming에 두지 않는다(2026-09-30 08 리뷰, 배포한 적 없는 위치라 옮기지 않았다). debug 빌드(`--debug`, dev 빌드 포함. boot.json `dev`)는 배포본과 같은 id라 `akan-native-updates-debug`를 따로 쓴다. 서버 데이터의 `server-debug`와 같은 규칙이다. 예전에는 같은 폴더를 써서, 새로 빌드한 debug 앱이 배포본이 받아 둔 릴리스를 자기보다 오래된 것으로 보고 지웠다(2026-09-30 10 리뷰).
  - `state.json`은 임시 파일에 쓰고 fsync한 뒤, 이전 파일을 `state.json.bak`으로 옮기고 rename한다(macOS·Linux는 폴더도 fsync). 읽지 못하면 `.bak`을 읽는다. 정전 뒤 trial·`failed`를 잃으면 망가진 릴리스가 되돌려지지 않거나 되돌린 릴리스를 다시 받는다(2026-09-30 10 리뷰).
  - 릴리스는 tar다. macOS는 `/usr/bin/tar --no-mac-metadata`, Windows는 Windows 10부터 들어 있는 bsdtar(`tar.exe`)로 만든다. 받은 뒤의 tar sha256이 매니페스트와 맞아야 한다.
  - 자기 릴리스의 tar를 가진 앱(업데이트로 설치된 앱)은 delta만 받는다(`packages/desktop/src/delta.ts`). 처음 설치된 앱은 전체를 받는다. 직전 릴리스로부터의 패치만 게시하는 방식은 Electrobun과 같다(`electrobun-v1/package/src/cli/index.ts:3788-3927`).
  - delta 방식: bsdiff 대신 rsync식 블록 매칭(8 KiB 블록, 롤링 체크섬 + 강한 해시)을 쓴다.
    - bsdiff는 옛 파일 전체의 접미사 배열(크기의 약 8배 메모리)을 만든다. JS로 62 MB bun 실행 파일을 처리하면 수 분이 걸린다.
    - 릴리스 사이의 변화는 대부분 블록 단위(런타임 뒤에 붙은 앱 JS, 리소스)라서 한 번의 스캔으로 찾을 수 있다.
    - 측정: 샘플 앱 두 릴리스 사이 delta는 gzip 33 KiB(전체 26 MiB)이고, 만드는 데 0.6초, 적용에 약 40 ms가 걸렸다. 적용할 때 원본과 결과의 sha256을 모두 확인한다.
  - 적용 전 검사: 앱 옆(`<App>.app.update-<id>`, 같은 볼륨이라 rename 가능)에 풀고 앱 id를 확인한다. 받기 전에 그 폴더를 만들어 본다. 이 사용자가 쓸 수 없는 곳(관리자가 설치한 `/Applications`, Program Files, `/opt`)이면 받지 않고 `NOT_ALLOWED`로 답한다(로그는 세션에 한 번). 푼 파일은 교체 전에 디스크까지 내린다(Linux는 `sync`, 나머지는 파일마다 fsync). 릴리스의 앱은 tar의 최상위 항목 하나다. 이름은 빌드의 것(`app.name`, `<Name>.app`)이고 교체가 설치된 앱의 이름을 준다. 그래서 `/D=`로 다른 이름의 폴더에 설치한 앱과 이름을 바꾼 `.app`도 업데이트된다.
    - macOS: bundle id와 `codesign --verify --deep --strict`
    - Windows·Linux: `resources/boot.json`의 app id. Authenticode와 패키지 서명은 CLI-9다. 바이트는 매니페스트 서명이 이미 보증한다.
    - 서버를 싣는지(`resources/server.json`)가 설치된 앱과 같아야 한다. 서버를 빼면 페이지가 빌드 때의 백엔드 주소로 붙고, 더하면 빈 로컬 DB로 시작해 어느 쪽이든 앱의 데이터가 자리를 옮긴다. akanjs `native.desktop.server`(또는 타깃의 `desktop.server`)를 바꾼 앱은 다시 설치한다(2026-09-30 08 리뷰 P1-3).
      - 매니페스트에 `server`가 있으면 받기 전에 판정한다. `check()`는 `available: false`, `download()`는 `NOT_ALLOWED`로 답하고 `failed`에는 넣지 않는다(매니페스트만 보면 되므로).
      - `server`가 없는 매니페스트(그 전의 게시)는 풀어 본 뒤 판정한다. 다르면 받은 것을 지우고 `failed`에 넣은 뒤 `NOT_ALLOWED`로 거부한다.
      - `apply()`도 pending의 서버 유무를 다시 본다. 재설치로 서버 유무가 바뀐 뒤에 남은 pending을 적용하지 않는다.
  - 교체 순서: `apply()`가 `<App>.app → .previous`, 새 앱 → `<App>.app`으로 rename한 뒤 재실행한다.
    - macOS·Linux: 실행 중인 앱의 폴더도 rename된다. 재실행은 `/bin/sh`가 이전 PID가 끝나기를 기다렸다가 새 실행 파일을 exec하는 방식이다. 그래서 single-instance, 잠금, 환경이 이어진다.
    - Windows: 실행 중인 프로그램의 폴더는 rename되지 않는다. 그래서 숨긴 PowerShell 도우미가 앱이 끝나기를 기다렸다가 rename하고 실행한다. 경로는 환경 변수로 넘긴다. 잠금이 풀릴 때까지 다시 시도하고, 실패하면 옮긴 것을 되돌린다. 롤백도 같은 도우미로 한다.
      - 도우미는 창 없는 `cmd.exe /c start /b powershell …`로 띄우고, 앱은 그 `cmd.exe`가 끝난 뒤 종료한다. 이유는 둘이다(Windows 11 26200에서 확인).
        - Bun(libuv)은 자식을 job object에 넣고, 부모가 끝나면 job이 자식을 끝낸다.
        - `detached`로 띄우면 콘솔 없이(DETACHED_PROCESS) 뜨는데, 이때 powershell.exe는 스크립트를 실행하지 않고 바로 끝난다.
        - job은 자식이 띄운 손자가 빠져나가는 것(silent breakaway)을 허용하므로, `cmd.exe`의 자식인 도우미는 앱이 끝난 뒤에도 남는다.
      - 도우미는 새 앱을 `Start-Process -NoNewWindow`로 실행한다. 그래서 새 앱이 이전 앱의 표준 입출력을 물려받는다. macOS·Linux의 exec와 같다.
      - 도우미와 새 앱의 작업 폴더는 임시 폴더다(`cmd.exe`의 `cwd`, `Start-Process -WorkingDirectory`). Windows는 어떤 프로세스의 작업 폴더인 폴더의 이름을 바꾸지 못한다. 설치 폴더에서 뜬 앱(설치 프로그램, 시작 메뉴, 탐색기)의 도우미가 그 폴더를 물려받으면 교체가 10초 재시도 끝에 실패한다(2026-09-30 리뷰 50번. 그때는 옛 앱이 받은 릴리스를 버리고 다음에 또 받았고, 지금은 그 릴리스를 `failed`에 넣는다). 셸도 창을 만들기 전에 작업 폴더를 `%LOCALAPPDATA%\<id>`로 옮긴다.
      - 설치 프로그램으로 설치한 앱(폴더 옆에 `<폴더>.uninstall.exe`가 있음)은 확정할 때 제거 항목의 `DisplayVersion`을 새 버전으로 고친다. `reg.exe` 출력은 OEM 코드 페이지라 경로를 비교하지 않고 종료 코드만 본다.
      - 도우미는 옮기기 직전에 `HKCU\…\RunOnce`에 복구 명령을 걸고, 옮기기(또는 되돌리기)를 마치면 지운다. 옮기는 도중 정전이나 종료로 도우미가 끊기면 다음 로그온에 복구 스크립트(`akan-native-updates\recover.ps1`)가 돈다. 앱 실행 파일이 없을 때만, 옮긴 것을 거꾸로 되돌리고 앱을 띄운다. 스크립트는 `-File`이 아니라 텍스트로 읽어 실행하므로 .ps1을 막는 실행 정책에 걸리지 않는다. RunOnce 명령은 260자까지라 경로가 더 길면 걸지 않는다(2026-09-30 10 리뷰).
    - 적용 도구: 앱은 tar를 macOS·Linux는 `/usr/bin/tar`(없으면 `/bin/tar`), Windows는 `%SystemRoot%\System32\tar.exe`(bsdtar)로 푼다. PATH의 `tar.exe`는 쓰지 않는다. Git for Windows의 GNU tar가 앞에 있으면 `C:`를 원격 호스트로 읽는다.
- 시험 실행과 롤백(두 종류 공통):
  - 새 릴리스는 처음에 trial로 실행한다. 페이지가 `updates.readyTimeout`(기본 10초) 안에 `notifyReady()`를 부르면 확정한다.
  - trial 중에는 그 릴리스가 실행 중인 릴리스다. `check()`는 그 릴리스를 새것으로 보지 않고, `apply()`는 `NOT_ALLOWED`로 거부한다. 예전에는 trial을 보지 않고 빌드 시각과 비교해, 앱이 시작할 때 확인·적용하면 trial 중인 자기 릴리스를 다시 받아 `.previous`(마지막으로 확정된 앱)를 지웠다(2026-09-30 10 리뷰 P1).
  - 서버를 싣는 데스크톱 앱(2026-09-30 08 리뷰 P1, 10 리뷰):
    - 서버가 ready를 보낸 뒤 `SERVER_SETTLE`(5초) 동안 죽지 않아야 확정할 수 있다. ready 뒤에 init이 throw하는 서버는 ready를 먼저 보낸다.
    - `readyTimeout` 시계는 그때 시작한다. 새 릴리스의 첫 실행에서 백신 검사로 서버가 늦게 떠도 정상 릴리스를 되돌리지 않는다.
    - `notifyReady()`는 서버가 지금 `up`일 때 확정한다. 재시작 중이면 다시 `up`이 될 때까지 기다린다.
    - 서버가 포기하거나, 앱이 시작한 뒤 `SERVER_BOOT_ALLOWANCE`(120초) 안에 자리 잡지 못하면 곧바로 되돌린다. 원인이 그 PC의 순간적인 상태(다른 프로그램의 잠금, 백신)일 수 있으므로 `failed`에는 넣지 않고 횟수(`strikes`)만 센다. 되돌린 릴리스는 `<앱>.update-<id>/`에 pending으로 남아 다음 `apply()`가 받지 않고 다시 적용한다. `MAX_STRIKES`(3)번째에 `failed`에 넣는다. 더 새 릴리스를 이미 받아 두었으면 되돌린 것은 남기지 않는다.
    - 로그와 `state.json`의 `reasons`에 실제 이유를 남긴다("its server gave up", "its server was not up within 120 s").
  - 부르지 않거나, 확정 전에 한 번 더 실행되면(크래시·멈춤) 실패로 표시하고 이전 번들이나 `.previous` 앱으로 되돌린다.
  - 이전 것은 새 것이 확정될 때까지 지우지 않는다. Electrobun은 새 앱이 실행되자마자 `.previous`를 지우고(`extractor/main.zig:7811-7818`), Tauri는 마지막 rename이 실패하면 백업을 잃는다(`updater.rs:1429-1476`).
  - 데스크톱 보완(2026-09-26 검토 반영):
    - trial에 실행 중인 PID를 기록한다. trial 도중 두 번째 인스턴스가 뜨면(Windows·Linux는 딥 링크가 새 프로세스를 띄운다) 예전에는 그 인스턴스가 시도 횟수를 올리고 실행 중인 정상 앱을 `.failed-*`로 옮겼다. 지금은 기록된 PID가 살아 있으면 trial을 건드리지 않는다.
      - PID와 함께 시스템 시작 시각(`boot`)도 기록한다. 크래시나 정전 뒤 재부팅에서 다른 프로세스가 그 PID를 쓰면 확정도 롤백도 되지 않았다(2026-09-30 10 리뷰). 시작 시각이 다르면 그 PID는 trial이 아니다.
      - 서버를 싣는 앱은 PID를 보지 않는다. 늘 single-instance가 있어서(빌드가 없으면 거부한다) 두 번째 인스턴스는 gate에서 끝나고 updates의 setup까지 오지 않는다.
    - macOS·Linux `apply()`는 교체 전에 trial을 기록한다. 교체 도중 멈추면, 앱이 바뀌지 않은 trial은 다음 시작에 버려진다(바뀐 앱이 trial 없이 남지 않는다). rename이 실패하면 pending을 되돌린다. Windows는 원래 도우미가 교체하기 전에 기록했다.
    - 재설치(2026-09-30 08 리뷰): 지금 설치된 빌드보다 새롭지 않은 pending(재설치 전에 받아 둔 것)은 시작할 때 버리고, `apply()`도 적용하지 않는다. 그대로 두면 새로 설치한 앱이 옛 릴리스로 내려간다.
    - Windows 도우미가 교체하지 못하고 옛 앱을 되살리면(잠금이 10초 재시도를 넘김), 또는 도우미가 돌지 못하면(적용 직후 로그오프, PowerShell을 막은 정책) 다음 시작에도 적용한 빌드(`from`)가 돈다. 이것을 교체 실패로 보고 횟수를 센다. 받은 릴리스(`staged`)는 pending으로 되살려 다음 `apply()`가 다시 받지 않고 다시 시도한다. `MAX_STRIKES`(3)번째에 `failed`에 넣는다. 예전에는 한 번에 영구히 뺐다(2026-09-30 10 리뷰). 다른 빌드가 설치돼 trial의 앱이 없어진 경우는 실패로 보지 않는다.
    - 롤백은 옮기기 전에 표시(`rollback`)를 남긴다. 옮기기가 일어나지 않으면(rename 거부, 도우미가 첫 이동에서 실패) 다음 시작에 실패한 빌드가 그 표시를 보고 다시 옮긴다(세 번까지). 예전에는 trial을 먼저 지워 실패한 릴리스가 계속 돌았다.
    - 확정 뒤 `.previous`를 지우지 못하면(잠금) 확정은 그대로 두고 경고만 한다. 다음 시작에 확정된 릴리스가 돌고 있으면 지운다.
    - 재설치: 실행 중인 빌드가 기록된 설치 빌드(`installed`)와 다르고 업데이트로 받은 릴리스도 아니면 다시 설치된 것으로 보고 `failed`와 횟수를 비운다. 예전 설치가 거부한 릴리스(서버 유무가 달랐던 것 등)가 새 설치에서도 막혔다.
    - `reset()`은 받은 것과 거부 목록만 지운다. trial과 롤백 표시는 남긴다. 그것 없이는 실행 중인 앱을 확정하지도 되돌리지도 못한다.
    - setup이 3초를 넘긴 뒤의 `ctx.launch.exit`는 앱을 끝낸다. launch 단계의 롤백이 늦어도 도우미가 기다리는 앱이 창을 열고 계속 돌지 않는다.
    - 알려진 한계: 새 앱이 JS setup에 닿기 전에 죽으면(네이티브 크래시) 롤백하는 코드가 돌지 않는다. 재실행 도우미가 "setup 도달"을 기다리게 하는 방법이 있으나 아직 하지 않았다.
- 개발 빌드: Android 개발 빌드는 localhost·127.0.0.1·10.0.2.2로의 평문 HTTP만 허용한다(network security config). release 빌드는 기본 정책 그대로다.
- 2026-09-26 다시 확인(`<os>-<arch>` 경로, 크기 상한, trial PID): macOS·Linux·Windows 모두 A 전체 → 확정, B delta → 롤백, 남은 폴더 없음. 확인 스크립트는 이제 `--debug`로 빌드·게시한다(`akan-native build`가 모드와 상관없이 release가 됐기 때문). Windows에서 한 번은 B 게시 단계에서 출력 없이 끝났고(원인 미확인), 다시 돌리자 통과했다. 실패한 실행은 임시 폴더의 앱을 남겨 다음 실행이 single-instance로 넘겨 버리므로, 그런 프로세스를 먼저 끝내야 한다.
- Windows 확인(2026-09-25, `scripts/vm/update-check.ts`, Windows 11 ARM VM): A를 전체 archive(35.9 MiB)로 받아 trial → 확정했다. B는 12 KiB delta로 받았고, 확정하지 않자 A로 롤백됐다. 남은 폴더는 없었다.
- Linux 확인(2026-09-25, `scripts/vm/update-check.ts`, Docker): A를 전체 archive(47.5 MiB)로 받아 trial → 확정했다. B는 11 KiB delta로 받았고, 확정하지 않자 A로 롤백됐다. 남은 폴더는 없었다. 컨테이너는 `--init`으로 띄운다. PID 1이 고아 프로세스를 거두지 않으면 끝난 앱이 좀비로 남아 `kill -0`이 계속 성공하기 때문이다.
- 확인 결과(샘플, 2026-09-25): 세 플랫폼 모두에서 게시 → check → download → apply → 새 번들이 trial로 실행되고 `mark` 확인 → `notifyReady`로 확정, 이어서 확정하지 않는 v3가 5초 뒤 되돌아가고 다시 받지 않는 것까지 확인했다. macOS는 v2를 전체 archive로, v3를 33 KiB delta로 받았고, 롤백 뒤 남은 폴더가 없었다. 확인 스크립트는 샘플의 `PUBLIC_UPDATE_PROBE` 경로를 쓴다(`examples/sample/src/updates.ts`).

### 개발 서명 (`akan-native signing setup`, Q8 후속)
- 명령이 하는 일:
  - LibreSSL로 codeSigning EKU가 있는 자체 서명 인증서 `akan-native dev: <user>`를 만든다.
  - `security import -T /usr/bin/codesign`으로 login 키체인에 넣는다. codesign은 확인 창 없이 키를 쓴다.
  - `security add-trusted-cert -p codeSign`으로 코드 서명용 신뢰를 준다. 이때 macOS가 비밀번호를 묻는다. 신뢰가 없으면 codesign이 "no identity found"라고 한다(확인함).
  - 기록은 `~/.akan/native/signing.json`에 남긴다.
- 빌드: 이후 macOS 빌드(dev·release)는 이 인증서로 서명한다(`AKAN_NATIVE_SIGNING=adhoc`이면 ad-hoc). shell.json `signing`에 `"identity"` 또는 `"adhoc"`을 적는다.
- designated requirement가 `identifier "<id>" and certificate leaf = H"…"`로 빌드마다 같다. 그래서 TCC 기록(카메라·알림)이 다시 빌드해도 이어지고, UP-1이 받은 앱을 `codesign --verify --strict`로 확인할 수 있다.
- Keychain(측정, macOS 26):
  - 앱이 직접 추가한 항목(`native/desktop/src/keychain.rs`)의 ACL은 이 requirement를 믿는다. 하지만 파티션 목록에는 만든 빌드의 `cdhash:`가 들어간다. Team ID가 없는 서명이기 때문이다.
  - 그래서 다음 빌드는 "기밀 정보를 사용하려고 합니다" 창을 다시 띄운다.
  - secure-storage는 Team ID 서명(`signing: "team"`, CLI-9)일 때만 in-process 항목을 쓰고, 그 밖에는 지금처럼 `/usr/bin/security`의 데이터 키를 쓴다.
- 다른 Mac에서의 실행(Gatekeeper)과 배포에는 여전히 Developer ID와 공증이 필요하다(CLI-9).

### 툴체인 고정 (CLI-10)
- 한 파일(`packages/cli/src/lib/toolchains.ts`의 `TOOLCHAIN`)이 버전·출처·설치 가능 여부를 정한다. Gradle wrapper(고정 배포본 + SHA-256, 버전당 한 번 다운로드, 잠금, 원자적 설치 — React Native가 `gradle-wrapper.properties`로 Gradle을 고정하는 방식)와 dioxus-cli `bundler/tools.rs`(URL·해시 상수, "다운로드 끔" 스위치, 빌드 전에 도구 확정)를 참고했다.

| 도구 | 고정 | 출처 (우선순위) | akan-native가 설치 |
|---|---|---|---|
| kotlinc + kotlin-stdlib | 2.4.20 (JetBrains 공식 zip, SHA-256 고정) | `AKAN_NATIVE_KOTLIN_HOME` → `~/.akan/native/toolchains/kotlin/2.4.20` → 자동 설치 → PATH의 kotlinc(버전이 다르거나 설치 실패면 경고) | 자동(빌드 중 처음 필요할 때, `AKAN_NATIVE_NO_AUTO_INSTALL=1`이면 안 함), `akan-native toolchain install kotlin` |
| JDK | 17 이상 (설치용: Temurin 21.0.12.1+1) | `JAVA_HOME` → akan-native 설치본 → Android Studio JBR → `/usr/libexec/java_home` → PATH | 요청 시만(`akan-native toolchain install jdk`, 약 200 MB). 빌드는 절대 내려받지 않는다 |
| Android build-tools | 37.0.0 (최소 35.0.0) | SDK의 고정 버전 → 없으면 최소 이상 최신 + 경고 | 사용자의 sdkmanager로, 라이선스를 사용자가 이미 수락했을 때만 (`doctor --fix`, `toolchain install android`) |
| Android platform | android-36 | SDK | 위와 같음 |
| Rust | 1.98.1 | `native/desktop/rust-toolchain.toml` (CLI가 cargo를 그 폴더에서 실행) | rustup (`doctor --fix`, 첫 빌드) |
| Bun | 1.4.2 (최소 1.4.0) | 패키지 `package.json` `engines.bun` | 안 함 (doctor가 경고) |
| Xcode·iOS SDK | 26.0 이상 | 설치된 Xcode | 안 함 |

- 설치: `~/.akan/native/toolchains/<tool>/<version>/`(`AKAN_NATIVE_HOME`으로 옮김). 임시 폴더에 받으며 SHA-256을 계산하고, 불일치면 지우고 멈춘다. 풀어 둔 최상위 폴더를 버전 폴더로 `rename`해서 설치가 원자적이다. 같은 버전을 두 빌드가 동시에 설치하면 `<version>.lock`(O_EXCL, pid 기록)으로 한 번만 받는다. 주인 프로세스가 없거나 30분 넘은 잠금은 넘겨받는다.
- 빌드의 Java 도구(kotlinc, d8, R8, apksigner, keytool)는 모두 같은 JDK를 쓴다(`JAVA_HOME`과 PATH를 그 JDK로 맞춰 실행). 예전에는 Homebrew kotlinc가 자체 JRE(27)로, d8·R8은 PATH의 java(21)로 돌았다.
- 고정되지 않은 도구를 쓰는 경우(다른 버전의 kotlinc, 오래된 build-tools)는 빌드를 막지 않고 경고한다. 오프라인이나 사내망에서 빌드가 멈추지 않게 하기 위해서이고, 기본 경로는 항상 고정 버전이다.
- 라이선스: Android SDK 라이선스는 akan-native가 대신 수락하지 않는다(`sdkmanager` 실행 시 stdin을 닫아 둔다). 수락 안 됐으면 사용자가 칠 명령을 보여 준다. cmdline-tools(sdkmanager)도 akan-native가 직접 내려받지 않는다. 받는 순간 SDK 라이선스가 적용되기 때문이다.
