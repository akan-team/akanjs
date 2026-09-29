# akan-native 플러그인·네이티브 기능 목록

> 요구사항: [requirements.md](requirements.md) §2.2·§2.4 · 아키텍처: [architecture.md](architecture.md) §6 · 최종 갱신: 2026-09-25
> 다른 프레임워크가 제공하는 네이티브 기능을 모아 akan-native가 지원할 기능과 순서를 정한다. 플러그인 규격(아키텍처 §6)은 그대로 쓴다.

**근거 저장소** (`study/<repo>/` 로컬 클론). 표에서는 `저장소/…/파일:줄`로 적는다. `…`은 저장소 안의 긴 패키지 경로이며, 파일 이름으로 찾을 수 있다.

| 저장소 | 커밋 | 본 범위 |
|---|---|---|
| capacitor | `145560e` (8.5.2) | 내장 플러그인: SystemBars, WebView, CapacitorHttp, CapacitorCookies |
| capacitor-plugins | `03fca06` (8.x) | 공식 플러그인 20개. camera는 8.1, local-notifications는 8.3부터 별도 저장소로 옮겨졌고, 이 클론이 마지막 코드다. keyboard·haptics·filesystem·geolocation은 이미 빠져서 클론에 없다 |
| tauri | `7dbfc1f` (2.11.5) | core 모듈(window, menu, tray, path, app), 공식 플러그인 목록(`tauri/crates/tauri-cli/src/helpers/plugins.rs:20-77`) |
| tauri-plugins-workspace | `1e166e9` | 플러그인 31개의 JS API, 플랫폼 지원 수준(각 `Cargo.toml`의 `platforms.support`), Android 의존성 |
| electrobun / electrobun-v1 | `8659d40` / `4eba723` | Bun 쪽 API: BrowserWindow, Tray, ApplicationMenu, ContextMenu, Utils, GlobalShortcut, Screen, Updater |
| tao / wry | `038bf39` / `547382d` | 창·WebView 기능, 플랫폼별 제약 |
| react-native | `b71d466` | 내장 네이티브 모듈, core에서 빠진 모듈 |
| lynx / lynx-stack / dioxus | `a5fd5dc` / `300c73e` / `c607e4e` | 내장 모듈, dioxus CLI의 권한·딥링크 manifest |

Expo SDK는 클론하지 않았다. Expo에만 있는 기능에는 †를 붙였고, 공개 문서를 기준으로 적었다.

## 0. 요약

- 기능은 네 가지로 나눈다 (§1).
  - **웹 표준**: 플러그인을 만들지 않는다.
  - **셸 내장**: 모든 앱에 들어간다.
  - **플러그인**: 앱이 등록해서 쓴다.
  - **결정 필요**: 원칙 2와 충돌한다.
- 단계
  - `P0`: MVP (requirements §4). 기존 hook 4개 외에 셸 항목 몇 개가 더 필요하다 (§8).
  - `P1`: MVP 직후. 대부분의 앱이 필요로 한다.
  - `P2`: 자주 쓰인다.
  - `P3`: 특수한 용도다.
- P1 범위
  - 플러그인 9개: `app`, `device`, `network`, `haptics`, `dialog`, `clipboard`, `share`, `opener`, `window`(데스크톱)
  - 셸 항목: 스플래시, 뒤로가기, 딥링크, JS 대화상자, 파일 입력, WebView 프로세스 복구, 데스크톱 드래그 영역·종료 흐름
- 결정이 필요한 항목은 6건이다 (§7). Android push(FCM), Android 바코드, Android 인앱 결제, Android 스토어 리뷰, Google 로그인, 그리고 데스크톱 메뉴·트레이·단축키를 무엇으로 구현할지다.

## 1. 분류 기준

| 분류 | 기준 | 예 |
|---|---|---|
| 웹 표준 | WebView가 이미 제공한다. 셸은 권한만 연결한다 | fetch, WebSocket, IndexedDB, getUserMedia, devicemotion, `prefers-color-scheme`, Intl |
| 셸 내장 | WebView나 창 자체의 동작이다. `akan-native.config.ts`로 설정한다. JS API가 필요하면 `@akanjs/native/core` 안의 내장 플러그인으로 둔다 (Capacitor의 SystemBars·WebView 방식, `capacitor/core/src/core-plugins.ts`) | 스플래시, 시스템 바, 뒤로가기, 딥링크 수신, macOS 기본 메뉴 |
| 플러그인 | 앱이 `plugins`에 등록한다 (PL-3). 권한은 manifest에 선언한다 | clipboard, share, haptics, notifications |
| 결정 필요 | 구현하려면 원칙 2가 막는 라이브러리(AndroidX, Play Services, Firebase)나 새 crate가 필요하다 | §7 |

셸 내장은 작게 유지한다. RN은 clipboard, NetInfo, geolocation, AsyncStorage, CameraRoll을 core에서 뺐고 (`react-native/CHANGELOG-0.6x.md:2389-2391`, `CHANGELOG-0.7x.md:4380`), Lynx는 기능 모듈을 하나도 넣지 않았다.

## 2. 공통 요구사항

조사에서 여러 플러그인에 반복해서 나온 요구사항이다. 개별 플러그인보다 먼저 셸과 플러그인 컨텍스트(아키텍처 §6 `AkanNativePluginContext`)에 넣는다.

| # | 항목 | 내용 | 근거 |
|---|---|---|---|
| C1 | 권한 상태 | `granted \| denied \| prompt \| prompt-with-rationale` 네 가지를 쓰고, iOS 사진 권한에는 `limited`를 더한다. Android에서는 `shouldShowRequestPermissionRationale`가 "요청한 적 없음"과 "영구 거부" 모두에서 false라 둘을 구분할 수 없다. 그래서 셸이 거부 이력을 저장한다(답을 받은 뒤 기록하고 허용되면 지운다. `noBackupFilesDir`라 백업·기기 이전에 따라가지 않는다) | `capacitor/core/src/definitions.ts:79`, `capacitor/android/…/Bridge.java:1167-1196`, `react-native/…/PermissionsModule.kt:67-98` |
| C2 | 콜드 스타트 이벤트 버퍼 | 딥링크, 알림 탭, push는 JS 리스너가 붙기 전에 도착한다. 첫 `$listen`이 올 때까지 버퍼에 둔다. 규칙은 커널 `RetainedEvents`(TS·Swift `AkanNativeRetained`·Kotlin `AkanNativeRetained`, 벡터 retained.json): 살아 있는 리스너 모두에게 전달, 아무도 받지 않았고 보존 이벤트면 최대 16개까지 두었다가 다음 리스너에게 순서대로 한 번, false를 돌려주는 리스너는 없는 것 | Capacitor `retainUntilConsumed` (`capacitor-plugins/app/…/AppPlugin.java:142-155`), `capacitor/ios/…/CAPSceneDelegateProxy.swift:17-35`, `electrobun/package/src/native/macos/nativeWrapper.mm:7114-7124` |
| C3 | Activity·Scene 콜백 전달 | Android는 `onNewIntent`, `onActivityResult`, `onRequestPermissionsResult`, `onConfigurationChanged`, `onPause`/`onResume`를, iOS는 scene의 `openURLContexts`와 `continueUserActivity`를 플러그인에 넘긴다 | `tauri/crates/tauri/mobile/android/…/plugin/Plugin.kt:49-293` |
| C4 | Android 파일 URI | AndroidX `FileProvider` 대신 셸에 ContentProvider를 하나 둔다. `openFile`을 구현하고, `query`는 `OpenableColumns`를 돌려주며, `grantUriPermissions`를 켠다. camera의 `EXTRA_OUTPUT`, share, 알림 첨부가 함께 쓴다 | `capacitor-plugins/camera/…/CameraUtils.java:20-29` |
| C5 | iOS 알림 delegate | `UNUserNotificationCenter.delegate`는 하나만 둘 수 있다. 셸이 소유하고 local/push로 나눠 보낸다 | `capacitor/ios/Capacitor/Capacitor/NotificationRouter.swift` |
| C6 | 프로세스 종료 대비 | Android에서는 외부 Activity(카메라 등)를 띄운 동안 앱 프로세스가 죽을 수 있다. 진행 중인 호출 상태를 `onSaveInstanceState`에 저장한다 | `capacitor-plugins/camera/…/CameraPlugin.java:883-897` |
| C7 | 호출별 허용 검사 지점 | 플러그인·메서드 단위로 허용 여부를 검사하는 훅. PL-11(권한 ACL)을 준비하는 자리다 | Lynx `AuthValidator` (`lynx/…/jsbridge/LynxModule.java:17-23`) |
| C9 | 문서 정리 | 페이지 로드 하나(문서)가 끝나면 그 문서가 연 것을 정리한다: 진행 중 호출 취소 → 구독 정지 → 자원 LIFO 닫기 → `onDocumentEnd`. keep-awake는 해제, sqlite는 ROLLBACK 후 close, 대화상자·다운로드도 여기에 든다 | Tauri `on_page_load`·ResourceTable, Capacitor `Bridge.reset`, RN `invalidate` |
| C10 | 실행 계약 | UI를 다루지 않는 플러그인 작업은 메인 스레드 밖에서 돈다. iOS manifest `ios.queue: "background"`(플러그인별 직렬 큐), Android `context.worker`·`context.io`(java.util.concurrent), 데스크톱 `ctx.offload()`(10ms 넘는 동기 작업) | – |
| C11 | App 서비스 | 프로세스에 한 번인 일(웹 번들 선택, 링크·알림 버퍼, FileRef 등록 표, 알림 delegate)은 창(scene·Activity)이 아니라 App 범위 객체가 맡는다. iOS `AkanNativeAppServices`(AppDelegate가 시작), Android `AkanNativeApplication`(manifest) | Tauri mobile `PluginManager.kt`(프로세스 싱글턴에 Activity를 붙였다 뗌) |
| C8 | 권한 전용 선언 | 웹 표준 API(getUserMedia, geolocation)만 써도 Info.plist 설명 문구와 Android 권한이 필요하다. 플러그인 없이 앱 설정 `permissions: ["camera", "microphone", "location"]`으로 선언할 수 있게 한다 | dioxus `[permissions]` (`dioxus/packages/cli/src/config/manifest.rs:32-114`, `manifest_mapper.rs:125-380`) |

**AndroidX 대체표.** minSdk 35라서 모두 프레임워크 API로 대체할 수 있다.

| 레퍼런스가 쓰는 것 | akan-native가 쓸 프레임워크 API |
|---|---|
| `WindowCompat`, `WindowInsetsControllerCompat`, `ViewCompat` | `Window.getInsetsController()`, `View.setOnApplyWindowInsetsListener`, `android.graphics.Insets` |
| `core-splashscreen` | `Activity.getSplashScreen()` (API 31) + `OnPreDrawListener` |
| `FileProvider` | 셸의 ContentProvider (C4) |
| ActivityResult API, `PickVisualMedia` | `startActivityForResult`, `MediaStore.ACTION_PICK_IMAGES` |
| `androidx.exifinterface` | `android.media.ExifInterface` |
| `androidx.browser` (Custom Tabs) | `ACTION_VIEW` intent에 `android.support.customtabs.extra.SESSION` extra(null binder)와 툴바 색 extra를 직접 넣는다 |
| `OnBackPressedCallback` | `OnBackInvokedDispatcher.registerOnBackInvokedCallback` (API 33) |
| `NotificationCompat`, `RemoteInput` | `Notification.Builder`, `android.app.RemoteInput` |
| `androidx.biometric` | `android.hardware.biometrics.BiometricPrompt` (API 28) |
| `AppCompatDelegate` (야간 모드, 로캘) | `UiModeManager.setApplicationNightMode` (API 31), `LocaleManager` (API 33) |
| `ContextCompat.registerReceiver` | `registerReceiver(receiver, filter, RECEIVER_NOT_EXPORTED)` |
| Play Services Fused Location | `LocationManager` + `FUSED_PROVIDER` (API 31) |
| `TextUtilsCompat` | `TextUtils.getLayoutDirectionFromLocale` |

## 3. 셸 내장 기능

### 3.1 모바일

| # | 기능 | 단계 | iOS | Android | 노하우·근거 |
|---|---|---|---|---|---|
| S1 | 시스템 바·safe area (SH-2) | P0 | VC 기반 `preferredStatusBarStyle` + `setNeedsStatusBarAppearanceUpdate`. 홈 인디케이터 숨김은 `prefersHomeIndicatorAutoHidden` | edge-to-edge(API 35부터 강제), `WindowInsetsController`로 아이콘 색 지정 | 아래 S1 참고 |
| S2 | 스플래시 (SH-6) | P1 | Info.plist `UILaunchScreen`. 첫 페인트 전까지 같은 모양의 뷰를 WebView 위에 덮는다 | 시스템 SplashScreen을 `OnPreDrawListener`로 유지한다 | 아래 S2 참고 |
| S3 | 뒤로가기 (SH-5) | P1 | – | `OnBackInvokedDispatcher` | 아래 S3 참고 |
| S4 | 딥링크 수신 | P1 | scene `openURLContexts`, 콜드 스타트 `connectionOptions.urlContexts`, universal link `NSUserActivityTypeBrowsingWeb` | `ACTION_VIEW` intent-filter, `onNewIntent`, `launchMode="singleTask"` | 아래 S4 참고 |
| S5 | 외부 링크 (SH-4) | P0 | `decidePolicyFor` | `shouldOverrideUrlLoading` | `capacitor/ios/…/WebViewDelegationHandler.swift:67-125` |
| S6 | WebView 권한 연결 | P0 | `requestMediaCapturePermissionFor` (getUserMedia) | `onPermissionRequest` → 런타임 권한, `onGeolocationPermissionsShowPrompt` | `wry/src/android/kotlin/RustWebChromeClient.kt:60,250`, `wry/src/wkwebview/class/wry_web_view_ui_delegate.rs:130`. 위치는 §4.7 geolocation 참고 |
| S7 | JS `alert`/`confirm`/`prompt` | P1 | WKUIDelegate의 `runJavaScript*Panel` 3개를 구현해야 한다. 없으면 호출이 무시된다 | `WebChromeClient`를 설정하면 기본 대화상자가 뜨지만, 제목에 페이지 주소가 나온다. WRY처럼 재정의한다 | `wry/src/android/kotlin/RustWebChromeClient.kt:141-249` |
| S8 | `<input type=file>` | P1 | WKWebView가 기본 지원한다. 카메라 항목이 나오므로 `NSCameraUsageDescription`이 필요할 수 있다 (확인) | `onShowFileChooser`를 구현하지 않으면 아무 일도 없다 | `wry/src/android/kotlin/RustWebChromeClient.kt:310` |
| S9 | 전체 화면 동영상, 인라인 재생 | P2 | `allowsInlineMediaPlayback`(iPhone 기본값 false), `mediaTypesRequiringUserActionForPlayback` | `onShowCustomView` / `onHideCustomView` | `wry/src/android/kotlin/RustWebChromeClient.kt:46-56` |
| S10 | WebView 프로세스 종료 복구 | P1 | `webViewWebContentProcessDidTerminate` → reload | `onRenderProcessGone` → WebView 재생성 | WRY에 macOS·iOS용 핸들러가 있다 (`wry/src/lib.rs` 확장 옵션 `:1613-1660`) |
| S11 | 시스템 다크 모드 따라가기 (SH-2) | P0 | 기본 동작 | manifest `configChanges`에 `uiMode`를 넣고 `onConfigurationChanged`에서 바 스타일을 다시 적용한다 | `react-native/…/ReactInstanceManager.java:861-870`, `capacitor/android/…/SystemBars.java:109-114` |

**S1 시스템 바·safe area** (Q6와 같이 본다)
- API 초안 (`@akanjs/native/core` 내장)
  - `systemBars.setStyle({ style: "light" | "dark" | "auto" })`
  - `systemBars.hide({ bar: "status" | "navigation" })` / `show(...)`
  - CSS는 `env(safe-area-inset-*)`를 쓰고, `--akan-native-safe-area-top/right/bottom/left`(CSS px, 키보드가 떠 있으면 bottom 0)를 iOS·Android 모두 함께 넣는다(N14). 한 이름으로 두 플랫폼을 읽으려면 `var(--akan-native-safe-area-top, env(safe-area-inset-top, 0px))`처럼 쓴다(웹은 변수가 없어 env()로 간다).
- Android
  - `viewport-fit=cover` 여부를 페이지 로드 후 JS로 확인하고 `requestApplyInsets()`를 부른다 (`capacitor/android/…/SystemBars.java:43-54, 91-105`).
  - WebView 140 이상에 `cover`면 inset을 WebView에 그대로 넘긴다. 아니면 decor view에 padding을 주고 inset을 0으로 한다. `CONSUMED`를 반환하면 다시 계산되지 않는다 (`:193-239`).
  - IME inset은 직접 빼야 한다. WebView 144 미만에서는 키보드가 떠 있는 동안 bottom inset을 0으로 둔다 (`:202, :226, :353-365`).
  - dp 단위 CSS 변수를 주입한다. WebView가 `env()`를 잘못 보고할 때 쓰는 대체 수단이다 (`:242-281`).
  - 상태 바 배경색은 API 35 이상에서 적용되지 않는다. `setBackgroundColor`는 만들지 않는다 (`capacitor-plugins/status-bar/…/StatusBar.java:121-142`).
- iOS
  - "navigation bar 숨김"은 홈 인디케이터 숨김으로 대응한다 (`capacitor/ios/Capacitor/Capacitor/Plugins/SystemBars.swift:91-114`).
  - RN은 deprecated된 UIApplication 상태 바 API를 쓴다. 따라 하지 않는다 (`react-native/…/RCTStatusBarManager.mm:58-69`).
  - 상태 바 탭 이벤트(`statusTap`)로 맨 위 스크롤을 지원할 수 있다 (`capacitor-plugins/status-bar/…/StatusBar.swift:28-30`).

**S2 스플래시**
- API: 설정 `splash: { backgroundColor, image, autoHide, timeout }`, JS `splash.hide({ fadeOutDuration })`
- Android
  - `OnPreDrawListener`가 hide나 타임아웃 전까지 false를 반환해 시스템 스플래시를 유지한다. 호환 라이브러리 없이 된다 (`capacitor-plugins/splash-screen/…/SplashScreen.java:95-158`).
  - 종료 애니메이션은 `setOnExitAnimationListener`로 처리한다 (`:104-128`).
  - 타임아웃으로 닫히면 경고 로그를 남긴다. 앱이 UI 준비 후 `hide()`를 부르도록 유도하는 것이다 (`:521-526`).
  - 테마 리소스(`windowSplashScreenBackground` 등)가 필요하다. Q7(리소스 없는 APK)과 함께 결정한다.
- iOS
  - Capacitor는 `UILaunchStoryboardName`을 VC로 로드해 WebView 위에 덮는다 (`capacitor-plugins/splash-screen/…/SplashScreen.swift:90-105`).
  - akan-native는 스토리보드 컴파일을 피하려고 Info.plist `UILaunchScreen`(색·이미지)을 쓴다. 색과 이미지는 asset catalog 이름을 가리키므로 `actool`이 필요하다 (확인).
- 데스크톱: 창을 숨긴 채 만들고 첫 로드가 끝나면 표시한다 (D2).
- Web: 앱 `index.html`의 CSS가 맡는다.

**S3 뒤로가기**
- API: `app` 플러그인 이벤트 `backButton { canGoBack }`, hook `useBackButton(handler)`
- 기본 동작: 리스너가 없으면 `history.back()`, 더 갈 곳이 없으면 시스템 기본 동작(홈으로)을 따른다.
- `OnBackInvokedDispatcher`는 JS 리스너가 있을 때만 등록한다. 계속 등록해 두면 시스템의 predictive back(홈으로 돌아가는 애니메이션)이 사라진다.
  - RN은 AndroidX 콜백을 켜고 끄는 방식으로 우회한다 (`react-native/…/ReactActivity.java:29-39, 123-131`).
  - Capacitor는 리스너가 없으면 `webView.goBack()`을 부르고, 스스로 Activity를 끝내지 않는다 (`capacitor-plugins/app/…/AppPlugin.java:46-62`).

**S4 딥링크**
- 설정 `deepLinks: { schemes, hosts }`에서 다음을 생성한다.
  - iOS·macOS: `CFBundleURLTypes`, Associated Domains entitlement (서명이 필요해서 실기기 단계부터)
  - Android: intent-filter (`autoVerify`)
  - 참고: dioxus `[deep_links]` (`dioxus/packages/cli/src/config/manifest.rs:135-160`), Tauri bundler (`tauri/crates/tauri-bundler/src/bundle/macos/app.rs:299`)
- 런타임: `app.getLaunchUrl()`, 이벤트 `urlOpen`. 버퍼는 C2를 따른다.
  - 실행 URL은 프로세스가 시작된 링크이고 프로세스 동안 바뀌지 않는다. 모든 호출과 문서가 같은 값을 받으므로 React StrictMode에서도 안전하다. 새 scene·Activity나 `onNewIntent`로 온 링크는 `urlOpen`으로만 받는다.
  - 실행 URL도 첫 `urlOpen` 리스너에게 한 번 전달된다. 링크 처리(화면 이동 등)는 `urlOpen`에서 한다. 그래야 다시 로드된 페이지가 같은 링크를 두 번 처리하지 않는다. (2026-09-26 아키텍처 검토. 데스크톱은 전부터 이렇게 동작했다.)
- iOS
  - 콜드 스타트 URL은 `connectionOptions`에 들어 있다 (`react-native/…/RCTReactNativeFactory.mm:45-70`).
  - 씬 기반 앱에서는 AppDelegate 경로가 호출되지 않는다 (`react-native/…/RCTLinkingManager.mm:129-137`).
- Android: `ACTION_VIEW` + data가 있는 intent만 받는다 (`react-native/…/IntentModule.kt:56-68`, `capacitor-plugins/app/…/AppPlugin.java:142-155`).
- Windows·Linux: 이벤트가 없고 URL이 `argv`로 들어온다. single-instance가 함께 필요하다 (§5).

### 3.2 데스크톱 (macOS 먼저)

| # | 기능 | 단계 | 구현 | 노하우·근거 |
|---|---|---|---|---|
| D1 | 기본 앱 메뉴 (앱 이름, Edit, Window) | **P0 (M2)** | NSMenu | macOS WKWebView는 메뉴 항목 단축키가 없으면 Cmd+C/V/X가 동작하지 않는다 (`wry/src/lib.rs:1389-1392`). 구성은 Tauri `Menu::default`를 참고한다 (`tauri/crates/tauri/src/menu/menu.rs:142-233`). 구현 수단은 Q-P6 |
| D2 | 흰 화면 방지 (SH-3) | P0 | 창을 숨긴 채 만들고, WRY 배경색을 지정하고, 첫 로드 후 표시 | |
| D3 | 창 드래그 영역 | P1 | `data-akan-native-drag-region` 또는 `-webkit-app-region: drag` → TAO `drag_window` | 더블클릭하면 최대화한다 (`tauri/crates/tauri/src/window/scripts/drag.js:11,103`). macOS `drag_window`가 mouse-up을 먹을 수 있다 (`tao/src/window.rs:1302`) |
| D4 | 종료 흐름 (`beforeQuit` 취소 가능) | P1 | `applicationShouldTerminate`에서 일단 취소하고, Worker에서 처리한 뒤 종료 | TAO는 이 콜백을 구현하지 않는다 (`tao/src/platform_impl/macos/app_delegate.rs:61,130`). Electrobun 방식을 따른다 (`electrobun/package/src/native/macos/nativeWrapper.mm:7097-7110`). Tauri의 동기 응답(`try_recv`)은 Worker 구조에 맞지 않는다 (`tauri/crates/tauri-runtime-wry/src/lib.rs:4272-4285`). "마지막 창을 닫으면 종료" 설정을 둔다 |
| D5 | Dock 아이콘 클릭 시 창 다시 열기 | P1 | TAO `Event::Reopen` | `tao/src/event.rs:138` |
| D6 | 딥링크·파일 열기 | P1 | TAO `Event::Opened` + Worker 준비 전 버퍼 (C2) | `tao/src/platform_impl/macos/app_delegate.rs:136-146` |
| D7 | JS `alert`/`confirm`/`prompt` | P1 | WRY의 WKUIDelegate에는 alert 패널 메서드가 없다 (`wry/src/wkwebview/class/wry_web_view_ui_delegate.rs`). 무시되는지 M2에서 확인하고, 필요하면 init.js에서 dialog로 대체한다 | |
| D8 | `window.print()` | P2 | WKWebView는 무시한다 → 네이티브 print로 대체 | `tauri/crates/tauri/src/webview/plugin.rs:198` |
| D9 | 파일 드래그 앤 드롭 | P2 | WRY drag-drop handler (파일 경로 전달) | Windows에서 켜면 HTML5 DnD가 꺼진다. 끌 수 있는 옵션으로 둔다 (`wry/src/lib.rs:1188`, `tauri/crates/tauri/src/webview/mod.rs:1048`) |
| D10 | 다운로드 | P3 | WRY download handler | macOS에서는 완료 경로가 항상 비어 있다 (`wry/src/lib.rs:1379`) |

## 4. 플러그인 (모바일·공통)

표기: ✓ 네이티브 구현 · `web` WebView 안에서 web 구현 사용(manifest `"desktop": "web"`) · △ 일부만 · – 미지원(`UNSUPPORTED`)

### 4.1 앱·기기

| 플러그인 | 단계 | API 초안 | Web | macOS | iOS | Android |
|---|---|---|---|---|---|---|
| `app-state` | P0 ✓ | (구현됨) | ✓ | ✓ | ✓ | ✓ |
| `app` | P1 ✓ | `getInfo() → { id, name, version, build }`, `getLaunchUrl()`, `exit()`, `minimize()`, `relaunch()`, 이벤트 `urlOpen`, `backButton` | △ | ✓ | ✓ | ✓ |
| `device` | P1 ✓ | `getInfo() → { platform, model, manufacturer, osName, osVersion, isVirtual, webViewVersion }`, `getId()`, `getLanguage() → { tag, code }`, `getBattery() → { level: 0..1 \| null, charging: bool \| null }` | △ | ✓ | ✓ | ✓ |
| `network` | P1 ✓ | `getStatus() → { connected, type: wifi \| cellular \| ethernet \| none \| unknown }`, 이벤트 `change` | ✓ | `web` | ✓ | ✓ |
| `screen-orientation` | P2 ✓ | `get()`, `lock({ orientation })`, `unlock()`, 이벤트 `change` | ✓ | – | ✓ | ✓ |
| `keep-awake`† | P2 ✓ | `keepAwake()`, `allowSleep()` | ✓ | ✓ | ✓ | ✓ |
| `appearance` | P2 ✓ | `get()`, `set("light" \| "dark" \| "system")`, 이벤트 `change` | △ (set 없음) | ✓ | ✓ | ✓ |
| `accessibility` | P3 ✓ | `getState() → { screenReader: bool \| null, reduceMotion, fontScale }`, `announce({ text, priority: polite \| assertive })`, 이벤트 `change` | △ | `web` | ✓ | ✓ (announce는 페이지) |

- **app-state 보강**
  - iOS: `memoryWarning` 이벤트를 추가한다. WillEnterForeground는 `background`로 두고, DidBecomeActive에서야 `active`로 바꾼다 (`react-native/…/RCTAppState.mm:115-131`).
  - Android: `inactive` 상태가 없다 (`react-native/…/AppStateModule.kt:42-59`).
  - `resume`은 `pause`가 먼저 있었을 때만 보낸다 (`capacitor-plugins/app/…/AppPlugin.java:164-170`).
- **app**
  - 근거: Capacitor app, Tauri app·process, RN Linking·BackHandler.
  - `exit`·`minimize`는 iOS에서 `UNSUPPORTED`다 (Capacitor와 같음).
  - 백 버튼·딥링크 연결은 셸(S3·S4)이 하고, 이 플러그인은 JS API만 맡는다.
- **device**
  - iOS
    - id는 `identifierForVendor`를 쓴다.
    - `name`은 entitlement가 없으면 일반 이름이 나온다.
    - 시뮬레이터 모델은 `SIMULATOR_MODEL_IDENTIFIER`에서 읽는다 (`capacitor-plugins/device/…/DevicePlugin.swift:29-34`).
  - Android
    - id는 `ANDROID_ID`다. 서명 키마다 값이 다르다 (`capacitor-plugins/device/…/Device.java:31-33`).
    - WebView 버전은 `WebView.getCurrentWebViewPackage()`로 읽는다 (`:73-89`).
    - 배터리는 sticky `ACTION_BATTERY_CHANGED`로 읽는다 (`:35-59`).
  - OS 정보는 Tauri `os` 플러그인 항목(platform, arch, locale, hostname)을 참고한다.
- **network**
  - connected는 `NET_CAPABILITY_VALIDATED`와 `INTERNET`을 모두 가져야 참이다. 단순히 연결만 된 것으로는 부족하다 (`capacitor-plugins/network/…/Network.java:74-93`).
  - pause 동안 해제했다가 resume에서 다시 등록하고, 그 사이 바뀐 상태를 비교해서 알린다 (`NetworkPlugin.java:44-69`).
  - iOS는 Reachability 대신 `NWPathMonitor`를 쓴다.
- **screen-orientation**
  - Android: `onConfigurationChanged`로는 180° 회전을 감지하지 못한다. `DisplayManager.DisplayListener`를 쓴다 (`capacitor-plugins/screen-orientation/…/ScreenOrientationPlugin.java`).
  - iOS: `requestGeometryUpdate`와 `setNeedsUpdateOfSupportedInterfaceOrientations`를 쓴다. landscape-primary는 `.landscapeRight`에 대응한다. 기기 방향과 화면 방향이 서로 반대이기 때문이다 (`…/ScreenOrientation.swift:29-47, 83-120`).
  - Android 16: targetSdk 36이면 큰 화면에서 방향 고정이 무시된다.
- **keep-awake**
  - Web: Screen Wake Lock API
  - iOS: `isIdleTimerDisabled`
  - Android: `FLAG_KEEP_SCREEN_ON`
  - macOS: IOPMAssertion
- **appearance**
  - 읽기만 필요하면 CSS `prefers-color-scheme`으로 충분하다. 강제 설정(`set`)이 필요할 때만 쓰는 플러그인이다.
  - iOS: 모든 scene의 모든 window에 `overrideUserInterfaceStyle`을 설정한다 (`react-native/…/RCTAppearance.mm:112-126`).
  - Android: AppCompatDelegate 대신 `UiModeManager.setApplicationNightMode`를 쓴다.
- **accessibility**
  - Android
    - reduce motion은 `TRANSITION_ANIMATION_SCALE == 0`으로 판단한다. 쉼표를 소수점으로 쓰는 로캘을 처리해야 한다 (`react-native/…/AccessibilityInfoModule.kt:101-121`).
    - 화면 낭독기가 켜졌는지는 touch exploration으로 판단한다.
  - iOS: content-size category를 fontScale로 바꾼다 (`react-native/…/RCTAccessibilityManager.mm:261-279`).
  - Capacitor `screen-reader`는 speak할 때마다 TTS를 새로 만들고 해제하지 않는다. 따라 하지 않는다 (`capacitor-plugins/screen-reader/…/ScreenReader.java:46-56`).

### 4.2 입력·UI

| 플러그인 | 단계 | API 초안 | Web | macOS | iOS | Android |
|---|---|---|---|---|---|---|
| `keyboard` | P0 ✓ | (구현됨) | ✓ | – | ✓ | ✓ |
| `haptics` | P1 ✓ | `impact({ style: light \| medium \| heavy \| soft \| rigid })`, `notification({ type: success \| warning \| error })`, `selection()`, `vibrate({ duration })` | △ | – | ✓ | ✓ |
| `dialog` | P1 ✓ | `alert`, `confirm`, `prompt`, `actionSheet({ title, options }) → { index, cancelled }` | ✓ | ✓ | ✓ | ✓ |
| `toast` | P3 ✓ | `show({ text, duration: short \| long, position: top \| center \| bottom })` | ✓ (DOM) | `web` (DOM) | `web` (DOM) | ✓ |

- **keyboard 보강**
  - Android
    - `WindowInsetsAnimation.Callback`(프레임워크 API)으로 열림·닫힘 애니메이션을 따라간다 (`lynx/…/tasm/behavior/KeyboardEvent.java:1018-1060`).
    - 높이는 `ime.bottom − systemBars.bottom`으로 계산한다. 키보드가 열린 채로 높이가 바뀌면(이모지 패널 등) 다시 보낸다 (`react-native/…/ReactRootView.java:937-986`).
  - iOS
    - 알림 6개를 구독하고, 화면 좌표를 key window 좌표로 바꾼다.
    - `UIKeyboardIsLocalUserInfoKey`로 다른 앱의 키보드를 거른다.
    - 애니메이션 duration과 curve를 이벤트에 담는다 (`react-native/…/RCTKeyboardObserver.mm:32-37, 98-134`).
- **haptics**
  - 근거: Tauri haptics의 함수 4개(`tauri-plugins-workspace/plugins/haptics/guest-js/index.ts`)
  - iOS: `UIImpactFeedbackGenerator`, `UINotificationFeedbackGenerator`, `UISelectionFeedbackGenerator`. RN Vibration은 iOS에서 시간을 무시한다 (`react-native/…/RCTVibration.mm:23-47`). 그래서 진동이 아니라 햅틱 API로 만든다.
  - Android: `VibratorManager`(API 31) + `VibrationEffect.createPredefined`, `VIBRATE` 권한(normal)
  - macOS: `NSHapticFeedbackManager` (트랙패드만)
  - Web: `navigator.vibrate` (지원하는 브라우저만)
- **dialog**
  - Capacitor의 dialog와 action-sheet를 합친 것이다. 데스크톱 message box도 여기서 맡는다 (Electrobun `showMessageBox`, `electrobun/package/src/sdks/main/core/Utils.ts:284`).
  - Android
    - 프레임워크 `android.app.AlertDialog`를 쓴다. 버튼은 최대 3개다 (`react-native/…/Alert/Alert.js:136-139`).
    - action sheet는 `AlertDialog.Builder.setItems` 목록 대화상자로 만든다(테마가 그대로 적용되고 검증됨). 메시지가 있으면 `setMessage`가 목록을 가리므로 사용자 정의 제목에 넣는다.
  - iOS 26: action sheet 바깥을 탭해 닫은 것을 `presentationController.delegate`로 감지할 수 있다 (`capacitor-plugins/action-sheet/…/ActionSheetPlugin.swift:57-73`).
- **toast**
  - Android 30 이상에서는 텍스트 toast의 위치 지정이 무시된다 (`capacitor-plugins/toast/…/Toast.java:24-28`).
  - 웹 UI로 만드는 편이 모든 플랫폼에서 일관적이라 우선순위를 낮게 둔다.

### 4.3 데이터·파일

| 플러그인 | 단계 | API 초안 | Web | macOS | iOS | Android |
|---|---|---|---|---|---|---|
| `preferences` | P0 ✓ | (구현됨) | ✓ | ✓ | ✓ | ✓ |
| `clipboard` | P1 ✓ | `writeText`, `readText`. 이후 `writeImage`/`readImage`(파일 URL), `writeHtml` | ✓ | ✓ | ✓ | ✓ |
| `filesystem` | P2 ✓ | `readFile`, `writeFile`, `readDir`, `stat`, `mkdir`, `remove`, `rename`, `copy`. 기준 폴더 `data \| cache \| documents \| temp`, 경로 조회 `paths()` | – | ✓ | ✓ | ✓ |
| `file-picker` | P2 ✓ | `pickFiles({ types, multiple }) → [{ url, name, mime, size }]`, `saveFile({ name, url })`, `pickDirectory()` | △ | ✓ | ✓ | ✓ |
| `secure-storage`† | P2 ✓ | `get`, `set`, `remove` | – | ✓ | ✓ | ✓ |
| `sqlite` | P3 ✓ | `open`→`{db}`, `execute`→`{changes,lastInsertId}`, `query`→`{columns,rows}`, `close`; 호출당 문장 하나; 값은 string·number·boolean·null·`{base64}`(BLOB) | – | ✓ (bun:sqlite) | ✓ (libsqlite3) | ✓ (SQLiteRawStatement) |
| `http` | P3 ✓ (WV-5) | `request({url,method,headers,body,bodyEncoding,responseType,timeout})`→`{status,headers,data,url}`, `fetch()`; 스코프 `{url}`을 리다이렉트마다 검사 | △ (페이지 fetch, CORS) | ✓ | ✓ | ✓ |

- **clipboard**
  - 플랫폼별 구현
    - Web: `navigator.clipboard`
    - iOS: `UIPasteboard`
    - Android: `ClipboardManager`
    - macOS: `NSPasteboard` (Electrobun `electrobun/package/src/sdks/main/core/Utils.ts:318-406`)
  - 읽기 제약
    - iOS 16 이상은 프로그램이 붙여넣기를 읽을 때 허용 프롬프트를 띄운다.
    - Android 10 이상은 앱에 포커스가 있을 때만 읽을 수 있다.
    - Android 13 이상은 복사하면 시스템이 확인 UI를 띄운다. 앱이 따로 토스트를 띄우지 않는다.
  - Capacitor는 Android에서 이미지를 텍스트로 쓴다 (`capacitor-plugins/clipboard/…/Clipboard.java:28-45`). akan-native는 C4의 ContentProvider URI로 이미지를 넣는다.
  - Tauri clipboard-manager는 모바일에서 텍스트만 지원한다.
- **filesystem**
  - 근거: Tauri fs·path (기준 폴더 22종, `tauri/packages/api/src/path.ts`), Electrobun `Utils.paths` (`electrobun/package/src/sdks/main/core/Utils.ts:415-708`)
  - 모바일은 앱 폴더로 제한한다 (Tauri도 모바일을 partial로 표시한다).
  - 결과는 PL-7처럼 파일 URL로 돌려준다.
  - 데스크톱은 Bun `fs`를 쓴다.
- **file-picker**
  - 플랫폼별 구현
    - iOS: `UIDocumentPickerViewController`
    - Android: `ACTION_OPEN_DOCUMENT` / `ACTION_CREATE_DOCUMENT`
    - macOS: `NSOpenPanel` / `NSSavePanel`
  - 파일 열기만 필요하면 S8(`<input type=file>`)로 충분하다. 이 플러그인의 핵심은 저장과 폴더 선택이다.
  - 데스크톱 `forServer`: 복사하지 않고 앱이 싣고 온 서버에 grant를 준다. 수 GB 영상도 복사 없이 서버가 원본을 읽고, 저장 위치(`saveFile`)에 서버가 직접 쓴다(architecture.md "데스크톱 내장 서버"). 다른 플랫폼은 대화상자 전에 `UNSUPPORTED`로 거절한다.
  - Tauri dialog는 모바일에서 폴더 선택을 지원하지 않는다. Electrobun에는 저장 대화상자가 없다.
- **secure-storage**
  - iOS·macOS는 Keychain을 쓴다.
  - Android는 Keystore AES-GCM 키로 값을 암호화해 SharedPreferences에 저장한다. EncryptedSharedPreferences는 AndroidX(security-crypto)라서 직접 구현한다.
  - 근거: Expo `expo-secure-store`†, Tauri stronghold
- **sqlite**
  - 세 플랫폼 모두 OS에 SQLite가 있어서 의존성이 늘지 않는다: iOS `libsqlite3`, Android `android.database.sqlite`, 데스크톱 `bun:sqlite`.
  - 근거: Tauri sql

### 4.4 카메라·미디어

| 플러그인 | 단계 | API 초안 | Web | macOS | iOS | Android |
|---|---|---|---|---|---|---|
| `camera` | P0 ✓ | (구현됨) `takePhoto`. P2: `pickImages({ limit })`, `saveToGallery({ url })` | ✓ | `web` | ✓ | ✓ |
| `barcode-scanner` | 결정 (Q-P2) | `scan({ formats }) → { value, format }` | △ | – | ✓ | ? |

- **camera: M4 전에 확인할 것**
  - Android에서 manifest에 `CAMERA`를 선언하면 `ACTION_IMAGE_CAPTURE` intent를 쓸 때도 그 권한이 필요하다. 선언하지 않으면 권한 없이 intent가 동작한다 (`capacitor-plugins/camera/…/CameraPlugin.java:200-215`). 아키텍처 §6 예시 manifest가 `CAMERA`를 선언하고 있으므로 intent 방식과 맞춰 본다.
- **camera: Android 노하우**
  - 촬영 결과는 `getExternalFilesDir(PICTURES)`에 C4의 URI를 `EXTRA_OUTPUT`으로 넘겨 받는다 (`:299-321`).
  - 저장 경로를 instance state에 남긴다 (C6).
  - 디코딩한 bitmap이 null이면 취소로 처리한다 (`:414-419`).
  - 갤러리 저장은 `MediaStore`에 `RELATIVE_PATH=DCIM`으로 한다 (`:608-640`).
- **camera: iOS 노하우**
  - swipe로 닫거나 popover 바깥을 눌러 닫으면 presentation delegate로 감지해 reject한다 (`capacitor-plugins/camera/…/CameraPlugin.swift:211-217`).
  - PHPicker는 권한이 필요 없다. Capacitor는 EXIF 때문에만 사진 권한을 묻는다 (`:425-445`).
- **pickImages**
  - iOS: `PHPickerViewController`
  - Android: `MediaStore.ACTION_PICK_IMAGES` + `EXTRA_PICK_IMAGES_MAX`
  - 둘 다 권한이 필요 없다.
- **barcode-scanner**
  - iOS는 VisionKit `DataScannerViewController`나 `AVCaptureMetadataOutput`으로 된다.
  - Android는 프레임워크에 디코더가 없다. Tauri는 CameraX와 MLKit(Play Services)를 쓴다 (`tauri-plugins-workspace/plugins/barcode-scanner/android/build.gradle.kts`).
  - 시뮬레이터에는 카메라가 없어서 어차피 실기기 단계에서 다룬다.
- **녹음·녹화**: 웹 표준(getUserMedia, MediaRecorder)을 쓰고, S6과 C8로 권한을 연결한다.

### 4.5 공유·외부 연동

| 플러그인 | 단계 | API 초안 | Web | macOS | iOS | Android |
|---|---|---|---|---|---|---|
| `share` | P1 ✓ | `share({ title, text, url, files: [url] }) → { completed, target? }`, `canShare()` | ✓ | `web` | ✓ | ✓ |
| `opener` | P1 ✓ | `openUrl(url)`, `canOpenUrl(url)`, `openSettings()`. 데스크톱은 `openPath`, `revealInFolder`, `moveToTrash` 추가(이후) | ✓ | ✓ | ✓ | △ (`canOpenUrl` UNSUPPORTED) |
| `browser` (인앱 브라우저) | P2 ✓ | `open({ url, toolbarColor })`, `close()`, 이벤트 `finished` | ✓ | – | ✓ | ✓ |
| `auth-session`† | P2 ✓ | `start({ url, callbackScheme }) → { url }` | △ | ✓ | ✓ | ✓ |

- **share**
  - 플랫폼별 구현
    - iOS: `UIActivityViewController`
    - Android: `ACTION_SEND` / `ACTION_SEND_MULTIPLE` + `createChooser`
    - macOS: `NSSharingServicePicker`
    - Web: `navigator.share`
  - Android에서 어느 앱을 골랐는지는 `createChooser(..., IntentSender)`로 받는다. akan-native는 명시적 intent와 `RECEIVER_NOT_EXPORTED`로 받는다 (`capacitor-plugins/share/…/SharePlugin.java:141-161`).
  - Android 대상 앱은 성공해도 `RESULT_CANCELED`를 돌려주는 경우가 많다. `onStop`까지 갔는지로 취소를 판단한다 (`:76-87, 215-219`).
  - 파일이 1개여도 `setClipData`를 해야 읽기 권한이 대상 앱에 전달된다 (`:195-200`).
  - iOS는 최상위 presented VC에서 띄우고, 이미 떠 있으면 reject한다. iPad는 popover 위치를 지정한다 (`capacitor-plugins/share/…/SharePlugin.swift:58-75`).
  - RN Share는 Android에서 취소를 감지하지 못한다 (`react-native/…/ShareModule.kt:37-54`).
  - Android WebView는 `navigator.share`를 지원하지 않으므로 네이티브 구현이 필요하다 (확인).
- **opener**
  - SH-4(자동 외부 링크)와 달리 앱이 직접 여는 API다.
  - `canOpenUrl`이 동작하려면 iOS는 `LSApplicationQueriesSchemes`, Android 11 이상은 `<queries>`에 대상을 선언해야 한다. manifest 항목으로 받는다 (`capacitor-plugins/app-launcher/README.md`).
  - Android
    - `Uri.normalizeScheme()`을 거치고, 다른 패키지를 열 때는 `FLAG_ACTIVITY_NEW_TASK`를 붙인다 (`react-native/…/IntentModule.kt:124, 255-279`).
    - `openSettings`는 `ACTION_APPLICATION_DETAILS_SETTINGS`로 연다 (`:169-189`).
  - 데스크톱: Electrobun `openExternal`, `openPath`, `showItemInFolder`, `moveToTrash` (`electrobun/package/src/sdks/main/core/Utils.ts:10-56`)
- **browser**
  - iOS: `SFSafariViewController`. http/https만 받는다 (`capacitor-plugins/browser/…/Browser.swift:19`).
  - Android
    - Custom Tabs를 intent extra로 직접 연다 (AndroidX 대체표).
    - Custom Tabs는 프로그램으로 닫을 수 없다. Capacitor는 trampoline Activity를 `CLEAR_TOP`으로 다시 띄워서 닫지만 (`capacitor-plugins/browser/…/BrowserControllerActivity.java:12-68`), **Android 15+에서는 탭 뒤에서 셸 Activity를 다시 시작하는 것이 막힌다(logcat `BAL_BLOCK`, 확인함).** akan-native는 자기 요청 코드로 탭을 띄우고 `finishActivity(requestCode)`로 닫는다(26ms, 확인함).
- **auth-session**
  - OAuth 로그인용이다.
  - iOS·macOS: `ASWebAuthenticationSession`
  - Android: Custom Tabs + 딥링크 (S4)
  - 근거: Expo `WebBrowser.openAuthSessionAsync`†. Google 로그인도 이것으로 대체할 수 있다 (Q-P5).

### 4.6 알림

| 플러그인 | 단계 | API 초안 | Web | macOS | iOS | Android |
|---|---|---|---|---|---|---|
| `local-notifications` | P2 ✓ | `schedule([{ id, title, body, at \| every, data }])`, `cancel`, `getPending`, `getDelivered`, `removeDelivered`, `createChannel`, 권한, 이벤트 `received`, `action` | △ | ✓ | ✓ | ✓ |
| `push` (`@akanjs/native/plugins/push`) | ✓ (akanjs O6-2) | `register() → { token, provider, platform }`, `unregister`, 권한, `setForegroundPresentation`, 이벤트 `token`, `received`, `action` | – | – | ✓ (APNs) | ✓ (옵트인 FCM) |
| `badge` | P3 ✓ | `set({ count })`, `clear()`, `checkPermission()`, `requestPermission()` | △ | ✓ (Dock, `dock.setBadge` op) | ✓ | – |

- **local-notifications**
  - 근거: Capacitor (`capacitor-plugins/local-notifications`), Tauri notification (모든 플랫폼 full)
  - Android
    - 예약 목록을 SharedPreferences에 저장하고, `BOOT_COMPLETED`에서 다시 등록한다. 재부팅하면 알람이 사라지기 때문이다 (`…/LocalNotificationRestoreReceiver.java:30-40`).
    - `canScheduleExactAlarms()`가 false면 부정확 알람으로 대신한다 (`…/LocalNotificationManager.java:374-396`).
    - `POST_NOTIFICATIONS`는 런타임 권한이다. 알림 탭은 `onNewIntent`로 들어온다 (C2, C3).
  - iOS
    - 반복 간격은 60초 이상이어야 한다.
    - foreground에서는 `willPresent`에서 표시를 결정한다 (C5).
  - macOS: 번들된 앱에서만 `UNUserNotificationCenter`가 동작한다. Electrobun은 dev에서 deprecated API로 대신한다 (`electrobun/package/src/native/macos/nativeWrapper.mm:8438-8470`).
- **push** (akanjs 준비 O6-2, 2026-09-27)
  - iOS는 APNs를 직접 쓴다(Firebase SDK 없음).
    - `register()`는 `registerForRemoteNotifications`를 부르고, 앱 delegate가 결과를 셸의 `AkanNativeRemoteNotifications`에 넘긴다. 토큰은 소문자 hex(`%02x`)이고 `provider: "apns"`다. 나중에 토큰이 바뀌면 `token` 이벤트.
    - 탭과 foreground 수신은 셸의 알림 라우터(C5 `AkanNativeNotifications`)로 들어온다. trigger가 `UNPushNotificationTrigger`인 것을 push가 가져가고 나머지는 local-notifications 것이다. 앱을 띄운 탭은 `action` 리스너가 붙을 때까지 기다린다(C2).
    - `aps-environment`는 manifest의 `development`이고, iPhone 빌드는 프로파일의 값을 쓴다(App Store 프로파일이면 `production`). 시뮬레이터는 등록이 실패해 `UNSUPPORTED`를 준다(`xcrun simctl push`로 수신 흐름만 시험할 수 있다).
  - Android는 옵트인 FCM 모듈이다(Q-P1 결정). manifest `android.maven: ["com.google.firebase:firebase-messaging:25.1.3", "androidx.core:core:1.10.0"]`(고정 폐포, architecture.md "고정 Maven 라이브러리". core 1.10.0은 play-services-basement가 부르는 `PendingIntentCompat` 때문에 함께 고정한다. FCM 그래프만으로는 core가 1.9.0으로 풀려 R8이 멈춘다)와 `AkanNativeMessagingService`(`FirebaseMessagingService`). 앱 설정 `android.googleServices`의 google-services.json을 Gradle 플러그인 대신 CLI가 `res/values/google_services.xml`로 바꾼다(`lib/googleservices.ts`: google_app_id, gcm_defaultSenderId, google_api_key, project_id …, debug 접미사면 기본 id의 client). 파일이 없으면 `register()`가 `UNSUPPORTED`와 안내를 준다.
    - foreground 메시지는 페이지에 `received`로 가고, `setForegroundPresentation({ banner: true })`면 셸이 알림을 직접 띄운다. background의 notification 메시지는 FCM이 띄우고 탭하면 인텐트 extras로 들어와 `action`이 된다.
    - 권한은 local-notifications와 같다(33 미만은 요청 없이 `areNotificationsEnabled`).
  - 웹과 데스크톱은 `UNSUPPORTED`다. akanjs 서버는 토큰의 `provider`로 APNs 발송기와 firebase-admin을 고른다(akanjs-change-requests.md).
- **badge**
  - iOS: `UNUserNotificationCenter.setBadgeCount`
  - macOS: dock badge label (`tao/src/platform_impl/macos/badge.rs:5`)
  - Android: 프레임워크 API가 없어서 알림 점만 가능하다.
  - Web: `navigator.setAppBadge` (PWA)

### 4.7 위치·보안·하드웨어

| 플러그인 | 단계 | API 초안 | Web | macOS | iOS | Android |
|---|---|---|---|---|---|---|
| `geolocation` | P2 ✓ | `getCurrentPosition`, 이벤트 `position`·`highAccuracyPosition`·`error`(watch), 권한 `{ location, precise }` | ✓ | – | ✓ | ✓ |
| `biometric` | P2 ✓ | `isAvailable() → { available, type: face \| fingerprint \| iris \| none, deviceCredential }`, `authenticate({ reason })` | – | – | ✓ | ✓ |
| `nfc` | P3 | `scan`, `write` | – | – | ✓ | ✓ |
| `bluetooth` | P3 | BLE scan·connect·read·write | △ | ✓ | ✓ | ✓ |
| `contacts`† | P3 ✓(읽기) | `checkPermission`·`requestPermission` → `{ contacts }`, `getContacts({ projection: { name, phones } }) → { contacts: [{ id, name, phones: [{ number, label }] }] }` | – | – | ✓ | ✓ |
| `calendar`† | P3 | 읽기·추가 | – | ✓ | ✓ | ✓ |

- **geolocation**
  - WebView의 `navigator.geolocation`
    - Android: `onGeolocationPermissionsShowPrompt`를 연결하면 동작한다 (S6).
    - iOS·macOS: WKWebView에는 위치 권한을 위임하는 공개 API가 없다. WRY도 지원하지 않는다 (`wry/src/permissions.rs:18`). 그래서 `CLLocationManager`로 네이티브 구현한다.
  - Android 네이티브 구현
    - Capacitor와 Tauri는 Play Services Fused Location을 쓴다 (`tauri-plugins-workspace/plugins/geolocation/android/build.gradle.kts`). akan-native는 `LocationManager.FUSED_PROVIDER`를 쓴다.
    - Android 12 이상에서는 사용자가 대략적 위치만 허용할 수 있다.
  - 웹 쪽 위치 API는 보안 컨텍스트가 필요하다. https 계열 오리진을 쓰는 이유 중 하나다 (`dioxus/packages/desktop/src/protocol.rs:15-16`).
- **biometric**
  - iOS·macOS: `LAContext`. `NSFaceIDUsageDescription`이 필요하다. 시뮬레이터에서는 Features > Face ID로 시험한다.
  - Android: 프레임워크 `BiometricPrompt`를 쓴다. Tauri는 androidx.biometric을 쓴다.
- **contacts**: 읽기만 한다. 추가와 macOS는 아직이다.
  - iOS: `CNContactStore`. `NSContactsUsageDescription`이 필요하다. iOS 18의 제한 접근은 `granted`로 알리고, 사용자가 공유한 연락처만 읽힌다.
  - Android: `ContactsContract`와 `READ_CONTACTS`. 연락처와 전화번호를 두 번의 쿼리로 읽어 메모리에서 합친다.
  - 번호는 주소록에 적힌 그대로다(정규화하지 않는다).
- **nfc**: iOS CoreNFC는 entitlement와 실기기가 필요하다. Android는 `android.nfc`를 쓴다.
- **센서**: 웹 표준(devicemotion)으로 충분하다. Capacitor motion도 순수 JS다. iOS에서는 사용자 제스처 안에서 `DeviceMotionEvent.requestPermission()`을 불러야 한다.

### 4.8 스토어·결제·계정

| 기능 | 단계 | iOS | Android |
|---|---|---|---|
| 인앱 결제 (`@akanjs/native/plugins/iap`) | ✓ (akanjs O6-3) | StoreKit 2 (OS 프레임워크) | Play Billing Library 9.1.0 (옵트인 고정 폐포) |
| 스토어 리뷰 요청 | 결정 (Q-P4) | `AppStore.requestReview(in:)` | Play In-App Review (Play Core 라이브러리) |
| Sign in with Apple | P3 | AuthenticationServices (entitlement, 서명 필요) | – |
| Google 로그인 | 결정 (Q-P5) | auth-session | Credential Manager (androidx.credentials) |
| 추적 허용 요청† | P3 | `ATTrackingManager` (광고 SDK를 쓸 때만) | – |

- **iap** (akanjs 준비 O6-3, 2026-09-27)
  - API: `canMakePayments`, `getProducts({ ids, type? })`, `purchase({ productId, offerToken?, promotionalOffer?, accountId?, quantity? })`, `finish({ transactionId, consume? })`, `getUnfinished`, `getEntitlements`, `restore`, `manageSubscriptions`, 이벤트 `transaction`. 웹·데스크톱은 `UNSUPPORTED`.
  - 흐름: 상품 조회 → 구매 → `transaction.verification`을 서버가 검증 → `finish`(소모품은 consume, 나머지는 acknowledge). 구매 호출의 답이 아닌 거래(Ask to Buy 승인, 결제 대기 완료, 갱신, 환불, 다른 기기 구매)는 `transaction` 이벤트이고, 리스너가 붙기 전 것은 첫 리스너에게 간다(C2). 시작할 때 `getUnfinished()`로 남은 것을 처리한다.
  - 검증 데이터: iOS `{ jws, transactionId, originalTransactionId, appReceipt? }`(appReceipt는 verifyReceipt를 쓰는 옛 서버용), Android `{ purchaseToken, orderId, packageName, originalJson, signature }`. 거래 id는 iOS 거래 id, Android 구매 토큰(대기 중에는 orderId가 없다).
  - iOS: `Transaction.updates`를 플러그인 생성(앱 시작) 때부터 읽는다. `accountId`는 UUID여야 한다(appAccountToken). 프로모션 오퍼는 서버가 서명한 JWS(`promotionalOffer(_:compactJWS:)`, iOS 15까지 back-deploy). iOS 17+는 구매 확인을 창 scene에 띄운다. 상품 종류(consumable 등)를 그대로 알려 준다.
  - Android: BillingClient 하나, 연결이 끊겼으면 호출이 다시 연결한다(자동 재연결은 쓰지 않는다: Play 결제가 없는 기기에서 설정을 OK로 알리고 호출마다 3초 재시도 뒤 SERVICE_DISCONNECTED가 된다). 일회성 상품의 결제 대기를 켠다. 상품 종류는 `oneTime`과 `subscription`뿐이다(소모 여부는 앱이 `finish`에서 정한다). `accountId`는 obfuscatedAccountId(64자 이하).
  - 오류: 사용자 취소 `CANCELLED`, 없는 상품 `NOT_FOUND`, 결제를 못 하는 기기 `UNSUPPORTED`, 이미 소유·잘못된 인자 `INVALID_ARGS`, 네트워크·서비스 `INTERNAL`.

## 5. 데스크톱 전용 플러그인

macOS를 먼저 구현하고, Windows·Linux 메모는 이후 단계를 위해 적어 둔다. 모바일에서는 전부 `UNSUPPORTED`다.

| 플러그인 | 단계 | API 초안 | macOS 구현 | Windows·Linux 메모 | 근거 |
|---|---|---|---|---|---|
| `window` | P1 | 현재 창: `setTitle`, `setSize`, `setPosition`, `center`, `minimize`, `maximize`, `setFullscreen`, `setAlwaysOnTop`, `show`/`hide`/`focus`, `close`. 이벤트 `resize`, `move`, `focus`, `closeRequested`(취소 가능) | TAO `Window` | always-on-bottom은 Wayland 미지원 (`tao/src/window.rs:1100-1105`) | Tauri `tauri/packages/api/src/window.ts`, Electrobun `electrobun/package/src/sdks/main/core/BrowserWindow.ts:291-449` |
| 다중 창 (SH-6) | P2 | `createWindow({ path, ... })` | TAO 창 + WRY WebView 추가 | | |
| `menu` | P2 ✓ | `setAppMenu(tree)`, `popupContextMenu(items)`, 이벤트 `click` | NSMenu (D1 확장) | 구현: 창마다 메뉴 바(Windows HMENU + 가속기 표와 WebView2 `AcceleratorKeyPressed`, Linux `GtkMenuBar` + `GtkAccelGroup`), 컨텍스트 메뉴(`TrackPopupMenuEx`, `GtkMenu`). 기본 메뉴 바는 없다. 역할 매핑은 `plugins/menu/src/index.ts`, `native/desktop/src/chrome.rs`. Electrobun은 Linux 앱 메뉴와 컨텍스트 메뉴를 지원하지 않는다 | macOS 메뉴 바에는 서브메뉴만 둘 수 있고, 창별 메뉴가 없다 (`tauri/crates/tauri/src/menu/mod.rs:147-151`) |
| `tray` | P2 ✓ | `create({ icon, tooltip, title, menu })`, `setIcon`, `setMenu`, `remove`, 이벤트 `click` | NSStatusItem | 구현: Windows `Shell_NotifyIconW`(TaskbarCreated 때 다시 추가). 아이콘이 없으면 exe에 든 앱 아이콘을 쓴다. 확인(VM 화면 캡처): 알림 영역 넘침 창에 앱 아이콘, 오른쪽 클릭 메뉴. Linux는 libappindicator 대신 StatusNotifierItem과 `com.canonical.dbusmenu`를 GDBus로 직접 내보내 클릭(Activate, ContextMenu)도 받는다. libappindicator를 쓰면 클릭 이벤트가 오지 않고, 메뉴를 넣어야 아이콘이 보이며, 아이콘을 임시 파일로 써야 한다 (`tauri/crates/tauri/src/tray/mod.rs:66,214,240,285`) | Electrobun `electrobun/package/src/sdks/main/core/Tray.ts:85-150` |
| `global-shortcut` | P2 ✓ | `register(accelerator)`, `unregister`, `unregisterAll`, `isRegistered`, 이벤트 | Carbon `RegisterEventHotKey` | 구현: Windows `RegisterHotKey`(숨은 창, `MOD_NOREPEAT`), Linux는 X11 `XGrabKey`(GDK의 디스플레이, NumLock·CapsLock 변형, GDK 필터). Wayland는 `UNSUPPORTED`(GlobalShortcuts 포털은 당분간 하지 않음, 사용자 결정 2026-09-25: 등록마다 사용자 승인이 필요하고 Ubuntu 24.04의 GNOME 46은 포털을 지원하지 않는다) (`electrobun/package/src/native/linux/nativeWrapper.cpp:11917-11924`) | Electrobun의 NSEvent global monitor는 쓰지 않는다. 자기 앱에 포커스가 있으면 이벤트가 오지 않고 손쉬운 사용 권한이 필요하다 (`electrobun/package/src/native/macos/nativeWrapper.mm:9171`) |
| `single-instance` | P2 | 설정으로 켠다. 두 번째 실행의 argv·URL을 첫 인스턴스에 이벤트로 전달한다 | Finder나 `open`으로 실행하면 OS가 기존 인스턴스를 활성화한다 | Windows·Linux는 딥링크가 argv로 오므로 필수다 | Tauri single-instance. Electrobun에는 없다 |
| `window-state` | P2 | 설정으로 켠다. 창 위치·크기를 저장하고 복원한다 | 앱 데이터 폴더의 JSON | | Tauri window-state |
| `dock` | P3 ✓ | `setBadge({ label })`, `setProgress({ progress, state })`, `setVisible({ visible })`, `getState()` | TAO `set_badge_label`, `set_progress_bar`, `set_activation_policy` | 구현: Windows는 창마다 작업 표시줄 버튼(배지를 그린 overlay icon, `ITaskbarList3` 진행률, `DeleteTab`). Linux는 libunity 대신 `com.canonical.Unity.LauncherEntry` 신호를 GDBus로 보낸다(`<app id>.desktop`, 숫자 배지만) (`tauri/crates/tauri-runtime-wry/src/lib.rs:3527-3545`) | |
| `screen` | P3 ✓ | `getDisplays() → [{ id, name, bounds, workArea, scale, primary }]`, `getCursorPoint()`, 이벤트 `change`, `useDisplays()` | TAO monitor. work area는 없어서 직접 구한다 | 구현: Windows `GetMonitorInfoW`의 rcWork, Linux GDK monitor의 workarea. 커서는 Windows `GetCursorPos`, Linux X11 seat pointer(Wayland는 `UNSUPPORTED`) | Electrobun Screen (`electrobun/package/src/sdks/main/proc/native.ts:3143-3258`) |
| `volume` | P3 ✓ | `getVolume() → { level, muted, settable }`, `setVolume({ level })`, `setMuted({ muted })`, 이벤트 `change` | CoreAudio 기본 출력 장치의 virtual main volume('vmvc')과 mute, 변경은 property listener. HDMI·DisplayPort 오디오처럼 볼륨이 없는 장치는 `level: null`, `settable: false` | 구현: Windows 기본 렌더 엔드포인트의 `IAudioEndpointVolume`(작업 표시줄 슬라이더와 같은 값, 변경은 1초마다 다시 읽음), Linux는 `pactl`(PulseAudio, PipeWire 공용)과 `pactl subscribe`. 오디오 서버가 없으면 `NOT_FOUND`. Android는 미디어 볼륨(STREAM_MUSIC, 볼륨 키가 움직이는 값), 변경은 시스템 방송 `VOLUME_CHANGED_ACTION`·`STREAM_MUTE_CHANGED_ACTION`. 음량을 바꾸면 음소거가 풀리므로 원래 음소거를 되돌린다. 고정 볼륨 기기는 `settable: false` | 전광판·키오스크 요구(2026-09-29). Electrobun·Tauri에는 없다 |
| `autostart` | P3 ✓ | `enable()`, `disable()`, `isEnabled() → { enabled, status }`, `openSettings()` | `SMAppService` | Windows Run 레지스트리, Linux `~/.config/autostart` | Tauri autostart |
| `updates` | ✓ (UP-1·UP-2) | `getState`, `check`, `download`, `apply`, `notifyReady`, `reset`, 이벤트 `progress` (iOS·Android는 웹 번들, macOS는 앱) | | Windows는 예약 작업으로 적용한다 (`electrobun/package/src/sdks/main/core/WindowsUpdateTask.ts`) | Electrobun Updater bsdiff 체인 (`electrobun/package/src/sdks/main/core/Updater.ts:1235-1258`), Tauri updater 서명 |

파일 대화상자, 메시지 박스, 알림, 클립보드, 경로는 공통 플러그인(`file-picker`, `dialog`, `local-notifications`, `clipboard`, `filesystem`)의 desktop 구현으로 처리한다.

## 6. 플러그인을 만들지 않는 것 (웹 표준)

| 기능 | 웹 API | 셸이 할 일 |
|---|---|---|
| HTTP, WebSocket | fetch, WebSocket | CORS 안내 (WV-4). 우회가 필요하면 WV-5 네이티브 HTTP (Capacitor CapacitorHttp 방식) |
| 저장소 | localStorage, IndexedDB | – |
| 카메라·마이크 스트림, 녹음·녹화 | getUserMedia, MediaRecorder | S6 권한 연결, C8 권한 선언 |
| 센서 | devicemotion, deviceorientation | – |
| 다크 모드 읽기, 애니메이션 줄이기 | `prefers-color-scheme`, `prefers-reduced-motion` | S11 |
| 로캘, 시간대, RTL | `navigator.languages`, Intl, `<html dir>` | 앱별 언어 변경만 네이티브(`LocaleManager`)가 필요하다. P3 |
| 오디오·동영상 재생 | `<audio>`, `<video>` | S9. 백그라운드 재생은 iOS `UIBackgroundModes: audio`와 AVAudioSession이 필요하다. P3 |

## 7. 결정 필요 (2026-09-25 모두 결정됨)

| # | 항목 | 문제 | 선택지 | 제안 |
|---|---|---|---|---|
| Q-P1 | Android push | FCM은 Firebase SDK(`firebase-messaging`)가 필요하고 프레임워크 대안이 없다 (`capacitor-plugins/push-notifications`) | (a) push 플러그인에 한해 Firebase 허용 (b) UnifiedPush (c) Android push 미지원 | **결정(2026-09-26, akanjs): (a)** push 플러그인의 옵트인 FCM 모듈에 한해 firebase-messaging과 그 전이 의존성을 버전·SHA-256으로 고정해 허용한다. push를 켠 앱에만 들어간다 |
| Q-P2 | Android 바코드 | 프레임워크에 디코더가 없다. Tauri는 CameraX + MLKit(Play Services)를 쓴다 | (a) Kotlin으로 디코더 직접 구현 (b) WebView 안 JS 디코더 + getUserMedia (c) MLKit 허용 | **결정: 앱 요구가 생길 때.** 그때는 (b) 직접 작성한 JS 디코더부터 검토(Chrome `BarcodeDetector`는 Android에서 Play Services에 기댈 수 있어 전제로 삼지 않는다) |
| Q-P3 | Android 인앱 결제 | Google Play 정책상 Play Billing Library를 써야 한다 | 허용 / 미지원 | **결정(2026-09-26, akanjs): 허용.** iap 플러그인이 Play Billing Library를 고정 폐포로 쓰고, iap를 쓰는 앱에만 들어간다 |
| Q-P4 | Android 스토어 리뷰 | In-App Review는 Play Core 라이브러리다 | 허용 / 스토어 페이지 열기(`market://details?id=`)로 대체 | **결정: 대체**(스토어 페이지 열기). 플러그인은 앱 요구가 생길 때 |
| Q-P5 | Google 로그인 | Credential Manager는 androidx.credentials다 | auth-session(OAuth + Custom Tabs)으로 대체 | **결정: 대체**(auth-session) |
| Q-P6 | 데스크톱 메뉴·트레이·단축키·대화상자·클립보드 구현 수단 | TAO 0.37은 메뉴·트레이·단축키를 별도 crate로 뺐다 (`tao/CHANGELOG.md:387-391`). Tauri는 muda, tray-icon, global-hotkey, rfd(dialog), arboard(clipboard), notify-rust(notification)를 쓴다 (`tauri/crates/tauri/Cargo.toml:87,91`, `tauri-plugins-workspace/plugins/*/Cargo.toml`) | (a) 이 crate들을 저수준 계층으로 허용 (b) TAO·WRY가 이미 쓰는 `objc2-app-kit` 등 바인딩 crate로 akan-native cdylib에 직접 구현 (새 crate 없이 feature만 추가) | **결정: (b).** 새 crate 없이 TAO·WRY가 이미 쓰는 objc2·objc2-app-kit·objc2-foundation(·block2)에 feature만 추가한다. 그 밖의 Apple 프레임워크(UserNotifications, Security, LocalAuthentication, CoreLocation, AVFoundation)는 새 `objc2-*` crate 대신 objc2 런타임(`msg_send!`) + 프레임워크 링크로 부른다. 호출이 많아지면 다시 본다 |

## 8. 구현 순서 제안

**MVP 마일스톤 안에서 해야 하는 것 (P0)**

| 마일스톤 | 항목 |
|---|---|
| M2 macOS | D1 기본 Edit 메뉴(없으면 샘플 앱에서 복사·붙여넣기가 안 된다), D2 흰 화면 방지, D7 alert 동작 확인 |
| M3 iOS | S6 getUserMedia 권한 위임, S1 상태 바 스타일, S11 |
| M4 Android | C1 권한 이력, C3 콜백 전달, C4 ContentProvider(camera `EXTRA_OUTPUT`에 필요), C6, S1 insets(Q6), camera manifest의 `CAMERA` 선언 재검토 |

**MVP 이후**

1. P1 셸: S2 스플래시, S3 뒤로가기, S4 딥링크, S7 JS 대화상자, S8 파일 입력, S10 프로세스 복구, D3–D6
2. P1 플러그인: `app` → `dialog` → `clipboard` → `share` → `opener` → `haptics` → `device` → `network` → `window`(데스크톱)
3. P2: `file-picker`, `filesystem`, `local-notifications`, `secure-storage`, `geolocation`, `biometric`, `screen-orientation`, `keep-awake`, `appearance`, `browser`, `auth-session`, camera 보강, 데스크톱 `menu`·`tray`·`global-shortcut`·`single-instance`·`window-state`·다중 창
4. P3와 결정 필요 항목은 앱 요구가 생길 때 진행한다.

플러그인 하나를 마칠 때는 다음을 모두 갖춘다.
- 4개 플랫폼 구현 또는 명시적 `UNSUPPORTED`
- manifest의 `methods`·`events`·권한
- 목 브리지 테스트 (PL-9)
- 공통 JS 테스트 묶음 (NF-3)

## 9. 구현 현황 (메인 세션 기록)

> 2026-09-25 기준. "(확인)" 항목의 결과도 여기에 적는다. 결정 필요 항목(§7)은 사용자 확인 전까지 진행하지 않는다.

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| D1 | macOS 기본 메뉴 | 구현 (M2) | objc2-app-kit으로 akan-native cdylib에 직접 구현했다(Q-P6 제안 (b), 새 crate 없음). Q-P6은 (b)로 결정됐다(2026-09-25). 지금은 menu 플러그인과 같은 빌더(`menu.rs`)로 만든다 |
| D2 | 흰 화면 방지 | 구현 (M2) | 창을 숨긴 채 만들고 첫 `pageLoad finished`(또는 3초)에 표시한다. 창·WebView 배경을 설정 색(다크 모드 반영)으로 칠한다 |
| D7 | JS `alert`/`confirm`/`prompt` (확인) | **확인함** | macOS에서 패널 없이 1ms 안에 반환한다. `confirm` → false, `prompt` → null. 대체 구현은 P1 |
| S1 | 시스템 바·safe area | iOS·Android 구현 | iOS: `preferredStatusBarStyle = .default`(다크 모드 따라감), `contentInsetAdjustmentBehavior = .never`. Android: edge-to-edge, insets를 소비하지 않음. 두 플랫폼 모두 `--akan-native-safe-area-*`를 모든 페이지에 넣는다(N14, init.js에 현재 값을 넣고 바뀌면 다시 넣는다) |
| S5 | 외부 링크 | 3개 플랫폼 구현 | iOS는 scene이 foregroundActive일 때만 연다. 데스크톱은 2026-09-26부터 http·https·mailto·tel만 OS로 넘기고, iframe은 외부로 보내지 않는다(architecture.md "데스크톱 내비게이션") |
| S6 | WebView 권한 연결 | iOS·Android·macOS 구현 | iOS·macOS는 앱 오리진만 grant. Android는 앱 오리진 + manifest에 선언된 권한만 런타임 요청 |
| S7 | JS 대화상자 | iOS·Android 구현 | iOS는 표시할 VC가 없으면 바로 완료한다(Capacitor에 있는 멈춤 버그 회피). Android는 `onJsAlert`/`onJsConfirm`/`onJsPrompt`를 framework AlertDialog로 재정의(제목에 URL이 나오지 않음, prompt 기본값 유지). macOS는 D7(`dialog` 플러그인 사용 권장) |
| S8 | `<input type=file>` | Android 구현 | `onShowFileChooser` → `ACTION_OPEN_DOCUMENT`(accept의 MIME·확장자 전부, `multiple`이면 여러 개). 2026-09-26: 결과는 다른 앱 provider의 `content:` URI만 받는다. 선택기는 intent에 답하는 아무 앱이라 `file:`이나 앱 자신의 provider URI로 앱의 내부 파일을 업로드시킬 수 있었다 |
| S10 | WebView 프로세스 종료 복구 | iOS·Android 구현 | iOS `reload()`, Android `recreate()` |
| S11 | 다크 모드 | 3개 플랫폼 | Android `configChanges`에 `uiMode`, 배경색 다시 적용 |
| C1 | 권한 요청 이력 | Android 구현 | "요청한 적 없음"과 "영구 거부"를 구분한다(`permissionState`). 2026-09-26: 요청 전에 기록하고 지우지 않던 것을 고쳤다. 이제 답을 받은 뒤 거부만 기록하고 허용되면 지운다(겹친 요청의 취소, "이번만" 만료가 거짓 denied가 되지 않는다). `noBackupFilesDir/akan-native-permissions` 파일이라 기기 이전에 따라가지 않는다. 요청은 하나씩 처리한다(Android는 겹친 요청을 취소한다) |
| C3 | Activity 콜백 전달 | Android 구현 | `onNewIntent`, `onConfigurationChanged`, `onActivityResult`(요청 코드 맵), `onRequestPermissionsResult` |
| C4 | 자체 ContentProvider | Android 구현 | `AkanNativeFileProvider`, `captureTarget(name)`. 에뮬레이터 카메라 촬영 → 페이지 표시까지 확인 |
| C6 | 프로세스 종료 대비 | Android 최소 구현 | 진행 중 요청을 `onSaveInstanceState`에 저장하고, 새 프로세스에서 결과가 오면 `onRestoredActivityResult(key, …)`로 넘긴다. 결과를 페이지에 전달하는 이벤트(C2 버퍼)는 이후 |
| camera | manifest의 CAMERA | **선언하지 않음** | 선언하면 `ACTION_IMAGE_CAPTURE`가 SecurityException. `checkPermission`은 `granted` |
| S3 | 뒤로가기 | Android 구현 | 히스토리가 있으면 `goBack()`. `app`의 `backButton`을 듣는 동안에는 셸이 뒤로가기를 페이지에 넘긴다(`setBackInterceptor`). 리스너도 히스토리도 없으면 콜백을 등록하지 않아 시스템의 predictive back이 유지된다. 에뮬레이터에서 확인 |
| S4 | 딥링크 (custom scheme) | 3개 플랫폼 구현 | 설정 `deepLinks.schemes` → iOS·macOS `CFBundleURLTypes`, Android VIEW intent-filter. 실행 URL(`getLaunchUrl`)과 이후 URL(`urlOpen`)은 리스너가 붙을 때까지 버퍼링(C2). 2026-09-26: 실행 URL은 프로세스 동안 고정되고 첫 `urlOpen` 리스너에게도 한 번 전달된다. 버퍼는 App 범위(C11)다. Android(콜드·실행 중)와 macOS(`open akansample://…`)에서 확인. iOS는 `simctl openurl`의 확인창 때문에 자동 확인하지 못했다. universal/app links는 이후 |
| D5 | Dock 아이콘 클릭 | 구현 | `Event::Reopen` → 창 표시·복원·포커스 |
| D6 | 딥링크·파일 열기 | 딥링크 구현 | `Event::Opened` → `opened` 네이티브 이벤트 → `app` 플러그인 |
| app | P1 플러그인 | 4개 플랫폼 | `getInfo`, `getLaunchUrl`, `exit`(iOS·web UNSUPPORTED), `relaunch`(새 프로세스로 다시 시작, iOS UNSUPPORTED, web은 새로고침), `minimize`, 이벤트 `urlOpen`·`backButton`. hook `useUrlOpen`, `useBackButton` |
| window | P1 플러그인 (데스크톱) | macOS 구현, web은 getState·setTitle만 | 새 C ABI `akan_native_shell(id, json)` + `shellReply` 이벤트. TAO의 macOS setter 일부가 비동기라 setter 직후 상태가 이전 값일 수 있다(setTitle은 요청 값으로 보정). 이벤트 `resize`·`move`·`focus`, hook `useWindowState` |
| clipboard | P1 플러그인 | 4개 플랫폼 | macOS는 `pbcopy`/`pbpaste`(Finder에서 띄운 앱은 `LANG`이 없어 UTF-8 로캘을 강제). iOS는 붙여넣기 프롬프트 거절을 PERMISSION_DENIED로, Android는 창 포커스가 없으면(Android 10+) PERMISSION_DENIED로 알린다 |
| opener | P1 플러그인 | 4개 플랫폼 | http·https·mailto·tel만 허용(Tauri 기본 목록). macOS `open -u`, `canOpenUrl`은 LaunchServices. Android `canOpenUrl`은 `<queries>`가 필요해 UNSUPPORTED(CLI는 이제 `android.manifestXml`을 지원) |
| share | P1 플러그인 | 4개 플랫폼 | iOS UIActivityViewController(iPad popover), Android chooser + 선택 결과 콜백, 파일은 `context.file(ref)` → 셸 ContentProvider로 복사해 read grant. macOS는 WKWebView의 `navigator.share`("web") |
| haptics | P1 플러그인 | web·iOS·Android | iOS generator 재사용 + Core Haptics 엔진 하나(vibrate), Android composition/predefined + `USAGE_TOUCH`. macOS는 네이티브 코드가 필요해 미지원 |
| device | P1 플러그인 | 4개 플랫폼 | iOS 시뮬레이터 모델은 `SIMULATOR_MODEL_IDENTIFIER`. WKWebView의 `navigator.language`가 사용자 첫 언어와 달라(`en-US` vs `en-KR`) `getLanguage`를 추가 |
| network | P1 플러그인 | 4개 플랫폼 | Android는 `INTERNET`+`VALIDATED`일 때만 connected, Wi-Fi→셀룰러 전환 때 1초 유예로 순간 오프라인을 거른다(에뮬레이터 확인). iOS `NWPathMonitor`는 필요할 때만 돈다 |
| 공통 | FileRef → 파일 | iOS·Android 구현 | `context.file("/__akan_native/file/<id>")`로 등록된 파일을 다시 얻는다(share가 사용) |

2026-09-25 `akan-native test all`: 샘플 앱(플러그인 12개) 자가 테스트 **web 22/22 · macOS 23/23 · iOS 22/22 · Android 22/22**.
| dialog | P1 플러그인 | 4개 플랫폼 | web은 `<dialog>` 모달(포커스 가두기, Escape = 취소, IME 조합 중 Enter/Escape 무시, `akan-native-dlg-` 접두어 스타일)이고 macOS도 이것을 쓴다("web"). iOS UIAlertController(iPad popover, 바깥 탭 = 취소), Android framework AlertDialog(버튼 최대 3개라 action sheet는 목록). 취소는 모든 플랫폼에서 `{ index: -1, cancelled: true }` |
| 공통 | Android 늦은 응답 | 수정 | 페이지 재로드 뒤 플러그인이 응답하면 닫힌 포트에 `postMessage`해 `IllegalStateException`으로 앱이 죽던 문제. 이제 버린다(dialog 에이전트가 재현) |

2026-09-25 `akan-native test all`(플러그인 13개): **web 23/23 · macOS 24/24 · iOS 23/23 · Android 23/23**.
| camera P2 | `pickImages`, `saveToGallery` | 4개 플랫폼 | iOS PHPicker(선택 수 제한, 권한 불필요), 저장은 add-only 권한 + `NSPhotoLibraryAddUsageDescription` 확인 후 `PHAssetCreationRequest`. Android Photo Picker(`EXTRA_PICK_IMAGES_MAX`), 저장은 MediaStore `DCIM/` + `IS_PENDING`(권한 불필요). 에뮬레이터에서 촬영 → 갤러리 저장까지 확인(MediaStore 행 `owner_package_name=com.akanjs.sample`). web은 `<input multiple>`, 저장은 UNSUPPORTED |
| D3 | 창 드래그 영역 | 구현 | `data-akan-native-drag-region`("deep"/"false"), Tauri `drag.js`와 같은 규칙. mousedown → `window.startDragging`(TAO `drag_window`), 더블클릭 → 최대화 전환(macOS는 mouseup). window 플러그인을 import하면 켜진다. 실제 마우스 드래그는 사람이 확인해야 한다 |
| keep-awake | P2 플러그인 | 4개 플랫폼 | iOS `isIdleTimerDisabled`, Android `FLAG_KEEP_SCREEN_ON`, web Wake Lock(visibilitychange 때 다시 요청), macOS `/usr/bin/caffeinate -d -i -w <pid>`(앱이 끝나면 같이 끝남). `useKeepAwake`는 보유자를 세어 컴포넌트끼리 풀어 버리지 않는다 |
| screen-orientation | P2 플러그인 | web·iOS·Android | iOS는 scene의 실제 방향을 읽고(잠금 중 Capacitor의 기기 방향 읽기 오류 회피) 셸 훅 `AkanNativeViewController.orientationLock`으로 고정한다. Android는 `requestedOrientation` + `DisplayListener`(180° 회전 감지). Android 16+의 600dp 이상 화면은 UNSUPPORTED |
| appearance | P2 플러그인 | 4개 플랫폼(web은 get만) | 설정은 실행 사이에 유지되고 첫 페인트 전에 적용된다(iOS·Android 확인). macOS는 새 셸 op `window.setTheme` + `themeChanged` 이벤트(TAO `set_theme`, 배경색도 다시 칠함). 자가 테스트로 macOS·iOS·Android 모두 `prefers-color-scheme` 전환 확인 |
| browser | P2 플러그인 | 4개 플랫폼 | iOS SFSafariViewController, Android Custom Tabs(raw intent extras + `<queries>`), 닫기는 `finishActivity`. macOS는 시스템 브라우저로 열고 `close`는 미지원(데스크톱 manifest 객체 형식으로 메서드 일부만 선언) |
| auth-session | P2 플러그인 | iOS·Android·macOS | iOS ASWebAuthenticationSession, Android Custom Tab + 딥링크(`onNewIntent`, 콜백 없이 돌아오면 1초 뒤 CANCELLED), macOS 시스템 브라우저 + `opened` 이벤트(Info.plist의 scheme 확인, 10분 제한). web은 manifest `null` |
| 공통 | 데스크톱 manifest 부분 선언 | CLI | `"desktop": { "module": "./src/desktop.ts", "methods": [...] }` 형식을 받는다 |

2026-09-25 `akan-native test all`(플러그인 18개): **web 29/29 · macOS 30/30 · iOS 29/29 · Android 29/29**.
| filesystem | P2 플러그인 | 4개 플랫폼 | 기준 폴더 `data`·`cache`·`documents`·`temp`(데스크톱·iOS는 `files` 하위 폴더로 앱의 다른 파일과 분리), `..`·절대 경로 거절, 심볼릭 링크는 실제 경로로 확인(Tauri fs 방식), 쓰기는 임시 파일 → rename, 인코딩 없는 `readFile`은 FileRef. web은 OPFS |
| file-picker | P2 플러그인 | 4개 플랫폼 | 결과는 항상 FileRef로 등록한 복사본. iOS document picker(asCopy), Android SAF(`OPEN_DOCUMENT`/`CREATE_DOCUMENT`/`OPEN_DOCUMENT_TREE`). macOS는 WRY 열기 패널이 `accept`를 무시하고 다운로드도 막혀서 `osascript`(JXA)로 시스템 패널을 띄운다(앱 창에 붙은 시트가 아니라 별도 창). 네이티브 패널은 Q-P6 결정 뒤 |
| 공통 | **Android 브리지 핸드셰이크 경쟁 수정** | 수정 | 작은 페이지는 `onPageStarted`보다 먼저 `/__akan_native/hello`를 보낼 수 있어서, 셸이 새 포트를 곧바로 닫았다(에이전트 재현: 콜드 스타트 6/6 실패). 이제 새 hello가 곧 새 문서라고 보고 그때 이전 포트·구독을 정리한다. hello는 앱 오리진 `Referer`만 받고(외부 iframe이 포트를 끊지 못하게), JS는 3초 안에 포트가 없으면 다시 울리며 응답 대기 중인 요청은 새 포트로 다시 보낸다. 같은 조건 콜드 스타트 6/6 통과 |
| 공통 | 데스크톱 Range | 수정 | `/__akan_native/file`·정적 파일이 206/416으로 응답(자가 테스트에 Range 검사 추가, macOS·iOS·Android 통과) |
| 공통 | manifest `infoPlist` 값 | CLI | 문자열 외에 불리언·배열 등 plist 값을 받는다(예: `UIFileSharingEnabled`) |
| 알려진 제약 | iOS 브리지의 JSON | 기록 | `JSONSerialization`은 문자열 맨 앞 U+FEFF를 버리고 짝 없는 서로게이트를 거절한다. 이런 텍스트는 base64로 보낸다(filesystem·file-picker가 그렇게 한다) |

2026-09-25 `akan-native test all`(플러그인 20개): **web 32/32 · macOS 33/33 · iOS 32/32 · Android 32/32**.
| secure-storage | P2 플러그인 | macOS·iOS·Android | iOS Keychain(`AfterFirstUnlockThisDeviceOnly`, 시뮬레이터도 `application-identifier` entitlement가 필요해 CLI가 링커로 넣는다), Android AndroidKeyStore AES-256-GCM(키가 사라지면 항목을 버림). macOS는 `security` CLI의 한계(ps 노출, stdin 128자·4KB 절단) 때문에 Keychain에 데이터 키 하나만 두고 값은 AES-GCM으로 암호화해 파일에 저장한다. 같은 사용자의 다른 프로세스가 `/usr/bin/security`로 키를 읽을 수 있다는 한계가 있다(Developer ID 서명 + Security.framework 직접 호출이 이후 과제) |
| biometric | P2 플러그인 | iOS·Android | iOS LAContext(호출마다 새로, Face ID 문구 확인), Android framework BiometricPrompt(`BIOMETRIC_WEAK`, DEVICE_CREDENTIAL과 음수 버튼을 같이 쓰지 않음). 시뮬레이터 `notifyutil`로 일치/불일치 확인. macOS는 네이티브 코드가 필요해 미지원 |
| geolocation | P2 플러그인 | web·iOS·Android | iOS CoreLocation(한 번·watch 분리, 권한 문구 확인), Android LocationManager(fused 우선, `getCurrentLocation` + CancellationSignal, 대략적 위치 선택 시 `precise: false`). 에뮬레이터는 네트워크 위치가 없어 balanced는 시간 초과될 수 있다. macOS는 WKWebView에 위치 권한 위임 API가 없어 미지원 |
| 공통 | iOS entitlement | CLI | `swiftc -Xlinker -sectcreate __TEXT __entitlements`로 `application-identifier`를 넣는다(Xcode와 같은 방식, `codesign --entitlements`는 시뮬레이터에서 실행 실패) |

2026-09-25 `akan-native test all`(플러그인 23개): **web 35/35 · macOS 36/36 · iOS 35/35 · Android 35/35**.
| local-notifications | P2 플러그인 | 4개 플랫폼(macOS 부분) | Android: framework NotificationManager + AlarmManager(정확 알람 권한은 요청하지 않아 늦을 수 있음: 20초 예약이 15초 늦음), 매니페스트 receiver, 재부팅·업데이트·앱 시작 때 다시 등록, 반복은 one-shot 알람 연쇄. iOS: UNUserNotificationCenter(당분간 플러그인이 delegate를 소유, C5는 push 플러그인 전에), 반복은 calendar trigger. web: Notification API + 페이지 타이머. macOS: AppleScript `display notification`("Script Editor"로 표시, 탭 이벤트 없음, 종료하면 사라짐) — 네이티브 UNUserNotificationCenter는 Q-P6 결정 뒤 |
| 공통 | R8 keep 규칙 | CLI | 플러그인 `applicationXml`에 선언한 컴포넌트 클래스를 자동으로 keep한다(release에서 receiver 생성자가 제거돼 "Unable to instantiate receiver"로 죽던 문제). 추가 규칙은 `android.proguard: []` |

2026-09-25 `akan-native test all`(플러그인 24개): **web 36/36 · macOS 37/37 · iOS 36/36 · Android 36/36**. Android release APK 293KiB, 콜드 스타트 312ms.
| D4 | 종료 흐름 | macOS 구현 | TAO delegate 클래스에 `applicationShouldTerminate:`를 런타임에 추가(objc2, 새 crate 없음). 사용자 종료(Cmd+Q·Dock·AppleScript)는 Cancel 후 호스트가 결정, 로그아웃·재시작·시스템 종료는 `NSTerminateLater` + `replyToApplicationShouldTerminate:`(Cancel이면 로그아웃이 중단됨). Worker가 2초 안에 요청을 꺼내 가지 않으면 셸이 종료, 페이지가 2초 안에 "받음"을 보내지 않으면 허락으로 본다. 설정 `desktop.quitOnLastWindowClosed`(기본 true, false면 창 숨김 + Dock 클릭으로 다시 표시). 데스크톱 플러그인 훅 `ctx.onQuit`·`onBeforeQuit`·`onCloseRequested`·`closeWindow`. 확인: AppleScript quit, 합성한 로그아웃 quit 이벤트(허락·거부·두 번째 허락), Worker 멈춤, 페이지 멈춤, `close window 1`(스크립팅으로 `performClose:`), 숨김 후 `open -a`로 다시 표시. Cmd+Q·Cmd+W 키 입력은 이 세션에 손쉬운 사용 권한이 없어 직접 누르지 못했다(같은 `terminate:`·`windowShouldClose:` 경로) |
| window | `onCloseRequested` | macOS | 페이지 API `onCloseRequested(handler)`·`useCloseRequested`, `event.preventDefault()`로 유지. `window.close()`는 묻지 않고 닫는다. 다른 플랫폼은 이벤트가 `none`(등록해도 불리지 않음) |
| app | `onBeforeQuit` | macOS | 페이지 API `onBeforeQuit(handler)`·`useBeforeQuit`, `event.reason`(`user`·`session`·`lastWindowClosed`). `app.exit()`는 묻지 않는다. manifest의 iOS·Android subset에는 `beforeQuit`·`answerBeforeQuit`가 없다 |

2026-09-25 D4 뒤: `bun test` 263 pass, `cargo test` 3 pass, **macOS 39/39 · web 38/38**(iOS·Android는 이 작업에서 돌리지 않음).

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| S2 | 스플래시 | iOS·Android 구현 | 설정 `splash: { backgroundColor, image, autoHide, timeout }`. 색 기본값은 `shell` 배경색, `autoHide` 기본 true, `timeout` 기본 10초. iOS: asset catalog의 `AkanNativeSplashBackground`(라이트·다크)와 `AkanNativeSplash`(136pt 상자, 1x·2x·3x)를 `UILaunchScreen`의 `UIColorName`·`UIImageName`으로 쓴다. 셸은 같은 그림을 WebView 위에 덮었다가 첫 `didFinish`·`hide()`·timeout에 걷는다. `simctl launch --wait-for-debugger`로 앱을 main 전에 멈춰 찍은 시스템 launch screen과 덮개의 이미지 위치·크기가 같다(408px@3x, 색은 RGB 1–4 차이). Android: 테마의 `windowSplashScreenBackground`·`windowSplashScreenAnimatedIcon`(288dp 캔버스 가운데 136dp, 에뮬레이터에서 359px = 136dp 확인). `OnPreDrawListener`로 첫 `onPageFinished`·`hide()`·timeout까지 유지하고, `setOnExitAnimationListener`로 페이드한다. 이미지가 없으면 Android는 앱 아이콘(플랫폼 기본), iOS는 색만 보인다. timeout에 걸리면 경고 로그. 두 플랫폼에서 콜드 스타트, 다크 모드, JS `hide()`, timeout을 스크린샷으로 확인 |
| S2 (확인) | `UILaunchScreen` 색·이미지와 actool | **확인함** | 색·이미지는 asset catalog 이름이라 `xcrun actool`(Xcode 도구)이 필요하다. 1024 universal 아이콘 하나만 넣어도 Xcode 26 actool이 나머지 크기와 `CFBundleIcons`(partial Info.plist)를 만든다. 첫 컴파일은 약 4초라 catalog 해시로 캐시한다. `akan-native doctor ios`가 actool을 점검한다 |
| CLI-8 | 앱 아이콘 | macOS·iOS·Android | 설정 `icon: "./icon.png"`(정사각 PNG, 1024 권장) 또는 `{ image, backgroundColor }`. PNG 디코더·인코더와 리사이즈(premultiplied alpha, 축소는 면적 평균)를 CLI에 직접 구현해 `sips` 같은 도구가 필요 없다. macOS: 불투명 원본은 Big Sur 격자(1024 안 824px, 반경 185px)로 마스크한 icns를 TS로 쓴다. macOS 26이 이를 규격 아이콘으로 보고 유리 테두리를 입힌다(NSWorkspace 렌더로 확인). iOS: actool, 투명 부분은 `backgroundColor`로 채운다. Android: adaptive icon(108dp 전경 가운데 72dp에 원본, 배경은 `backgroundColor` 또는 불투명 원본의 왼쪽 위 색), xxxhdpi 한 벌. 아이콘이 없으면 플랫폼 기본 아이콘. iOS 홈 화면과 Android 앱 서랍에서 확인 |
| 공통 | Android 리소스 | CLI | 이제 항상 `aapt2 compile`로 res/를 만든다(테마 `AkanNativeTheme`, 창 배경 = shell 색). res가 같으면 컴파일을 건너뛴다. Q7의 "리소스 없는 APK" 경로는 없앴다 |
| splash-screen | P1 플러그인 | 4개 플랫폼 | `hide({ fadeOutDuration })`. iOS·Android는 셸 훅 `context.hideSplash`, web·macOS는 바로 resolve("web", 데스크톱은 D2가 맡는다). 이미 걷힌 뒤 불러도 된다 |

2026-09-25 아이콘·스플래시 뒤 `akan-native test`(플러그인 25개): **web 38/38 · macOS 39/39 · iOS 38/38 · Android 38/38**, `bun test` 276 pass. Android release APK 345KiB(아이콘·스플래시 이미지 포함), 콜드 스타트 353ms.

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| 공통 | 데스크톱 launch 단계 | 구현 | 플러그인 `setup`이 창 생성 전에 돌고 async를 기다린다(플러그인마다 3초). `ctx.launch.setWindow(bounds)`·`ctx.launch.exit(code)`. Worker의 ready 메시지가 `{ type: "ready", window, exit }`를 main에 넘기고, main은 창 bounds를 `akan_native_run` 설정에 합치거나 창 없이 끝낸다. main은 실행 인자를 Worker에 넘긴다(Bun Worker의 `process.argv`에는 인자가 없어서 `new Worker(url, { argv })`) |
| window-state | P2 플러그인 | macOS | 이동·크기 변경이 멈추면(400ms) `window.getState`를 읽어 앱 데이터 폴더의 `window-state.json`에 저장(임시 파일 → rename). 일반 bounds만 저장하고 최대화는 플래그만 바꾼다(Tauri의 prev_x와 같은 목적: 다시 실행해 최대화를 풀면 마지막 일반 크기). 최소화·숨김·전체 화면은 무시하고 전체 화면은 복원하지 않는다(macOS에서 새 Space가 열림). 복원은 launch 단계라 창이 처음부터 그 자리에 뜬다. 셸이 제목 표시줄(위 28pt 띠의 80pt 이상)이 걸치는 디스플레이가 있는지 확인하고(`placement.rs`, Tauri의 "모서리 하나"보다 엄격), 없으면 가운데. 모니터보다 크면 줄인다. 페이지 API `getSaved`·`save`·`clear`, web·iOS·Android는 UNSUPPORTED. 확인: 이동·크기 → 재실행 복원(좌표 일치), 최대화 저장 → 최대화로 복원 → 풀면 저장된 일반 bounds, x=5000 저장 → 가운데 + 로그 |
| single-instance | P2 플러그인 | macOS | launch 단계에서 사용자별 임시 폴더(`$TMPDIR`, Linux는 `$XDG_RUNTIME_DIR`)의 `akan-native-<앱 id 해시>.sock`을 bind. 이미 있으면 연결해 `{ args, cwd }`를 보내고 ack를 받은 뒤 창 없이 종료(0.04초). 연결 거부·소켓 아닌 파일이면 오래된 파일로 보고 지운 뒤 다시 bind. Tauri와 다른 점: `/tmp`가 아니라 사용자 폴더(0700, 소켓은 0600), 먼저 bind하고 지우지 않음(동시 실행 경쟁 축소), ack. 받은 쪽은 창을 보이고(최소화 해제, 최대화 유지) 포커스한 뒤 `secondInstance` 이벤트(리스너 전에는 16개까지 버퍼, C2). 확인: 실행 파일 직접 실행(`--open "a b.txt"`, cwd 전달), `open -n --args`, 종료 시 소켓 삭제. SIGTERM도 종료 훅을 거친다(아래 "SIGTERM" 행). Finder·Dock·`open`은 원래 OS가 기존 앱을 쓴다 |
| 공통 | macOS 창 크기 보고 수정 | 수정 | WRY가 창의 contentView를 자기 뷰로 바꿔서 TAO `inner_size()`와 `Resized` 이벤트의 크기가 처음 크기에 머물렀다(`window.setSize` 후에도 1024×720으로 보고). Tauri처럼 WebView 프레임을 inner size로 쓴다(`tauri-runtime-wry/src/lib.rs:578-590`). 또 TAO는 macOS에서 크기·위치·최대화·전체 화면을 메인 큐에 비동기로 적용하므로, 셸 op의 응답은 요청한 값을 보고한다(setTitle과 같은 방식). 새 op `window.unminimize`(restore와 달리 최대화 유지) |
| 공통 | 저장 위치 적용 방식 | 기록 | TAO `WindowBuilder::with_position`은 macOS에서 콘텐츠 영역의 왼쪽 위로 해석돼(`tao/src/platform_impl/macos/window.rs:202-208`) 제목 표시줄 높이(32pt)만큼 위로 뜬다. 숨긴 창에 `set_outer_position` 후 `set_maximized` 순서로 부른다(둘 다 메인 큐 FIFO) |
| 공통 | CLI 신호 처리 | 수정 | `akan-native run`·`akan-native dev`·`akan-native test`가 SIGINT뿐 아니라 SIGTERM·SIGHUP에도 앱·logcat·`simctl log stream`·Chrome 자식을 정리한다(부모가 죽으면 자식이 launchd 밑에 남던 문제) |

2026-09-25 launch 단계·window-state·single-instance 뒤 `akan-native test all`(플러그인 27개): **web 40/40 · macOS 41/41 · iOS 40/40 · Android 40/40**, `bun test` 278 pass, `cargo test` 8 pass.
| S9 | 전체 화면 동영상, 인라인 재생 | iOS·Android | iOS는 M3부터 `allowsInlineMediaPlayback = true`, `mediaTypesRequiringUserActionForPlayback = []`(Capacitor와 같음), `isElementFullscreenEnabled = true`로 설정돼 있다(시뮬레이터에 탭 도구가 없어 전체 화면 진입은 직접 확인하지 못함). Android: Capacitor·wry는 `onShowCustomView`에서 곧바로 `onCustomViewHidden()`을 불러 전체 화면을 사실상 막는다. akan-native는 custom view를 decor view 위에 올리고 시스템 바를 숨긴다(`BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE`). 뒤로가기는 전체 화면을 먼저 끝내고(그동안만 콜백 등록), 페이지의 `exitFullscreen()`은 WebView가 `onHideCustomView`로 알린다. 포스터 없는 `<video>`의 회색 재생 아이콘 대신 투명 포스터. 에뮬레이터에서 `requestFullscreen`(탭) → 상태 바 숨김 → 뒤로가기로 복귀, JS `exitFullscreen` 복귀 확인. 처음 몰입 모드에서는 시스템 안내창("Viewing full screen")이 뜨고 첫 뒤로가기를 가져간다(OS 동작) |

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| 다중 창 (SH-6) | P2 | macOS 구현 | 페이지 API(`plugins/window`): `createWindow({ path, title, width, height, x, y })` → 그 창을 대상으로 하는 핸들(`setTitle`·`setSize`·`close` 등), `getCurrentWindow()`, `getAllWindows()`, `currentWindowId`, 이벤트 `created`·`destroyed`(모든 창에 전달). `appWindow`의 op는 부른 페이지의 창에 적용된다(`window` 인자로 다른 창 지정). 창은 모두 동등하다(Tauri·Electron·Electrobun과 같음): 창 1을 닫아도 다른 창이 있으면 앱이 남고, 마지막 창을 닫을 때만 `desktop.quitOnLastWindowClosed`를 따른다(숨긴 창도 센다). 닫기 veto(`onCloseRequested`)는 그 창의 페이지에만 묻는다. `beforeQuit`은 듣는 모든 창의 페이지에 묻고 하나라도 막으면 앱을 유지한다(창마다 저장하지 않은 내용이 있을 수 있어서). 딥링크 `urlOpen`과 `secondInstance`는 듣는 창 중 가장 최근에 포커스된 창 하나에만 간다(두 번 처리되지 않게). Dock 다시 열기, single-instance 포커스, 창 인자 없는 셸 op도 가장 최근 포커스 창을 쓴다. window-state는 창 1만 저장한다. 창끼리는 같은 저장소(localStorage·IndexedDB)와 BroadcastChannel로 통신한다(확인). web·iOS·Android는 `create`가 UNSUPPORTED이고 `getAllWindows()`는 현재 창 하나다. 확인(macOS 프로브): 경로가 다른 창 2개를 만들고 각 페이지가 자기 id를 앎, 창 2 크기 변경 시 창 2만 `resize`, 창 1 새로고침 뒤에도 창 2의 구독 유지, 창 2에서 부른 `setTitle`은 창 2에만 적용, 창 3 닫기(veto로 한 번 막고 두 번째는 허락), veto 없는 창 닫기, 다른 창이 있을 때 창 1 닫기, 마지막 창 닫기 → 종료, `quitOnLastWindowClosed: false`면 마지막 창 숨김 → `open -a`로 다시 표시(프로세스 1개), 창 3개에 beforeQuit 리스너(창 2가 막으면 유지, 다음 종료는 창 3의 500ms 결정을 기다린 뒤 종료), GURL Apple event 딥링크가 포커스된 창 2에만 전달. 닫기는 AppleScript `close window`(`performClose:`, 빨간 버튼과 같은 경로)로 보냈다 |
| 공통 | 셸: 창 레지스트리 | 구현 | 창 id(u32, 앱이 여는 창이 1, 재사용 없음) = WebView id = 프레임의 `webviewId` = 네이티브 이벤트의 `window` = 셸 op의 `window` 인자. init.js는 창마다 `window.__AKAN_NATIVE__.windowId`를 덧붙인다(Tauri가 현재 창 label을 창별 초기화 스크립트로 넣는 것과 같은 방식, `tauri/crates/tauri/src/manager/webview.rs:186-191`). 새 op `window.create`·`window.list`·`window.destroy`(마지막 창은 거절). 대기 중 IPC 응답은 WebView별로 버린다(한 창이 새로고침해도 다른 창의 호출은 살아 있음). `window.setTheme`은 앱 전체에 적용되므로 모든 창을 다시 칠한다. 새 창은 위치를 주지 않으면 포커스 창에서 (28, 28) 비켜 연다 |
| 공통 | 닫은 창의 페이지 | 기록 | WRY는 WebView를 drop해도 WKWebView를 retain해 살려 두고 창에서 떼기만 한다(`wry/src/wkwebview/mod.rs:1433-1436`). 떼어진 페이지의 타이머가 계속 도는 것을 확인했다(BroadcastChannel로 3초 더 수신). 그래서 셸은 창을 숨기고 `about:blank`를 로드한 뒤, 그 로드가 끝나면(또는 1초 뒤) drop한다. 이후 6초 동안 아무것도 오지 않음을 확인. 닫힌 NSWindow 객체는 화면 밖에 남아 AppleScript `every window`에 보인다(TAO·WRY drop 경로 안의 참조로 보이며, Tauri도 같은 crate·같은 경로다). 창을 아주 많이 열고 닫는 앱이 생기면 다시 확인한다 |
| 공통 | 데스크톱 플러그인의 창 문맥 | 구현 | 메서드 호출의 `ctx.window`(부른 페이지의 창), `ctx.shell`은 `args.window`가 없으면 그 창, `ctx.closeWindow(window?)`. 이벤트 소스의 `emit(data, target?)`는 `{ window }`(한 창), `"focused"`(최근 포커스 창 하나), 생략(모든 구독 창) 중 하나로 보내고 도달한 창 목록을 돌려준다. 구독은 창별로 세고, 소스는 모든 창의 마지막 `$unlisten`에서 멈춘다. `createPageVeto`는 창마다 답을 받고(`answer(args, ctx.window)`), 물어본 페이지가 새로고침되거나 창이 없어지면 요청을 버린다(`source(emit, ctx)`) |

2026-09-25 다중 창 뒤: `bun test` 289 pass, `cargo test` 10 pass, **macOS 42/42 · web 41/41**(iOS·Android는 이 작업에서 돌리지 않음).
| D8 | `window.print()` | macOS 구현 | WKWebView는 `window.print()`를 무시한다. `@akanjs/native/core`가 로드될 때 macOS면 `window.print`를 바꿔 예약 id `$host`의 `print`를 호스트에 보내고, 호스트는 부른 창의 셸 op `webview.print`(WRY `print()`, 창에 붙는 인쇄 시트)를 실행한다. Tauri `webview/scripts/print.js`와 같은 방식. 시트가 페이지 미리보기와 함께 뜨는 것을 창 캡처로 확인(인쇄는 하지 않음) |
| D9 | 파일 드래그 앤 드롭 | macOS 구현 | WRY drag-drop handler → `dragDrop` 네이티브 이벤트(창별). WRY는 Enter에만 무엇을 끄는지 알려 주므로 파일을 끌 때만 over·drop·leave를 전달한다. 핸들러는 `false`를 돌려 WebKit 기본 처리를 유지한다(페이지의 HTML5 drop과 `dataTransfer.files`도 그대로). 페이지 API `onDragDrop(handler)` / `appWindow.listen("dragDrop")`: `{ type, paths, position, files }`, drop의 `files`는 일반 파일마다 FileRef(+ path, name, 확장자로 MIME). 폴더는 paths에만. Rust 변환은 단위 테스트, JS 매핑은 목 테스트로 확인. Finder에서 실제로 끌어오는 것은 손쉬운 사용 권한이 없어 자동으로 확인하지 못했다. Windows는 이 핸들러를 켜면 HTML5 DnD가 꺼지므로 그 단계에서 끄는 설정을 둔다 |
| 공통 | `mimeFor` | core | 확장자 → MIME 표를 filesystem 플러그인에서 `@akanjs/native/core`로 옮겼다(filesystem은 다시 export). window 드롭 등 FileRef를 만드는 플러그인이 같이 쓴다 |

2026-09-25 다중 창·S9·D8·D9 뒤 `akan-native test all`(플러그인 27개): **web 41/41 · macOS 42/42 · iOS 41/41 · Android 41/41**, `bun test` 291 pass, `cargo test` 11 pass.
| 공통 | 데스크톱 SIGTERM | 수정 | main이 `akan_native_run` 안에 있는 동안 Bun Worker는 신호 핸들러를 받지 못해서(확인), SIGTERM(`akan-native run`·`akan-native test` 중지, `kill`, launchd)이면 `onQuit` 훅 없이 죽었다. 셸이 libc `signal`·`pipe`를 직접 선언해(crate 없음) 핸들러는 파이프에 1바이트만 쓰고, 스레드가 `signal` 이벤트로 바꿔 호스트가 veto 없이 `lifecycle.quit`(훅 → 종료)을 탄다. 두 번째 SIGTERM, Worker가 이벤트를 가져가지 않음(2초), 5초 안에 끝나지 않음이면 바로 종료(143). 확인: SIGTERM 후 0.03초에 exit 0, single-instance 소켓 삭제, window-state 저장. `akan-native test macos` 뒤 남는 소켓 없음 |
| C8 | 권한 전용 선언 | CLI · Android 셸 | 앱 설정 `permissions: { camera, microphone, location }`(값은 `true` 또는 사용자에게 보일 문구). iOS: `NSCameraUsageDescription`·`NSMicrophoneUsageDescription`·`NSLocationWhenInUseUsageDescription`. macOS: 카메라·마이크만(WKWebView에 위치 위임 API가 없다). Android: `CAMERA`, `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS`(Capacitor WebRTC와 같음), `ACCESS_COARSE/FINE_LOCATION`, 그리고 Play가 하드웨어를 필수로 보지 않게 `uses-feature required="false"`. 우선순위: 플러그인 문구 < 앱 `permissions` < `usageDescriptions`. dioxus `[permissions]`를 참고해 웹 API에 필요한 세 가지만 받는다(나머지는 플러그인이 선언) |
| S6 (보강) | Android 웹 위치 | Android 셸 | `onGeolocationPermissionsShowPrompt`가 없어 `navigator.geolocation`이 항상 거부되던 것을, 앱 오리진 + manifest에 위치 권한이 있을 때 런타임 권한을 요청하도록 했다(대략적 위치만 허용해도 허용). 에뮬레이터에서 `permissions.location`만 선언한 앱의 `getCurrentPosition` 성공 확인 |
| camera (보강) | 앱이 CAMERA를 선언한 경우 | Android | C8 `permissions.camera`로 CAMERA가 manifest에 있으면 촬영 intent가 권한 전까지 SecurityException을 내므로, 플러그인이 먼저 CAMERA를 요청하고 `checkPermission`도 실제 상태를 보고한다. 선언이 없으면 예전처럼 권한 없이 동작. 확인: 선언 + 권한 부여 → 카메라 앱 열림 → 뒤로 → CANCELLED |

2026-09-25 SIGTERM·C8 뒤: `bun test` 295 pass, Android 41/41, macOS 42/42.

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| file-picker (macOS) | 네이티브 파일 패널 | 구현 (Q-P6 (b)) | osascript(JXA) 대신 NSOpenPanel/NSSavePanel을 **부른 창의 시트**로 띄운다(`native/desktop/src/panels.rs`, 셸 op `panel.open`·`panel.save`·`panel.mime`). 형식은 MIME·확장자 → UTType(UniformTypeIdentifiers를 objc2 런타임으로, 새 crate 없음), 등록되지 않은 형식이 하나라도 있으면 필터를 끈다(이전 규칙). 셸은 경로만 돌려주고 복사·폴더 목록·저장은 같은 프로세스의 플러그인 호스트가 한다(패널이 TCC 보호 폴더 접근을 이 프로세스에 준다, APFS면 clone). 샌드박스가 아니므로 security-scoped URL은 필요 없다. 닫으면 기존 계약대로 `files: []`·`saved: false`·`name: null`, 두 번째 호출은 CANCELLED. 확인: 시트가 부른 창에 붙음(창 캡처), 형식 필터 동작(PDF·TXT만 선택 가능), 저장·폴더 선택·닫기 결과 경로 |
| dialog (macOS) | NSAlert 시트 | 구현 | 페이지 안 `<dialog>` 대신 부른 창의 NSAlert 시트(셸 op `alert.show`). 첫 버튼이 기본(Return), cancel 스타일은 Esc, destructive는 `hasDestructiveAction`. prompt는 NSTextField 보조 뷰(기본 텍스트·placeholder). actionSheet는 옵션마다 버튼, cancel 옵션은 맨 뒤(바깥 탭이 없으니 cancel 옵션이 없으면 하나를 골라야 한다). 다중 창에서 두 번째 창이 부르면 그 창에 붙는 것을 캡처로 확인 |
| D7 | JS `alert`/`confirm`/`prompt` | **구현** | WRY의 UI delegate 클래스(objc2가 `wry::…::WryWebViewUIDelegate0.57.0`으로 등록)에 `runJavaScriptAlert/Confirm/TextInputPanel…` 세 메서드를 런타임에 추가한다(D4와 같은 `class_addMethod`, 이미 있으면 건드리지 않음). 클래스는 이름 대신 WebView의 실제 delegate 객체에서 얻는다. WebKit은 delegate를 설정할 때 메서드 유무를 기억하므로 추가 뒤 delegate를 다시 설정한다. iOS S7과 같이 제목에 URL 없음, prompt 기본 텍스트 유지, 표시할 창이 없으면 바로 완료. 페이지 JS가 시트가 닫힐 때까지 멈추는 것 확인 |
| 공통 | 시트 테스트 훅 | 셸(dev 빌드만) | `AKAN_NATIVE_TEST_PANELS`가 있으면 시트를 실제로 띄운 뒤 타이머로 끝낸다(같은 완료 핸들러). `auto` = 알림은 첫 버튼, 파일 패널은 취소. `akan-native test macos`가 `auto`를 넘긴다. JSON(`{"delay","button","text","panel":"ok","directory","name"}`)으로 다른 답도 준다. 파일 패널은 프로세스 밖에서 돌아 `ok:`가 무시되고, 표시 뒤에 바꾼 폴더·이름도 반영되지 않았다(기본 이름으로 ~/Documents에 저장됨, 확인 후 삭제). 그래서 폴더·이름은 띄우기 전에 넣고 부모 창에서 `endSheet:returnCode:OK`로 끝낸다. 파일 여러 개를 고르는 OK는 이 방법으로 만들 수 없다(취소로 끝남) |
| file-picker (Windows·Linux) | 네이티브 파일 대화상자 | 구현 | macOS와 같은 셸 op(`panel.open`·`panel.save`·`panel.mime`)와 답 JSON(`native/desktop/src/dialog_args.rs`)이라 desktop.ts는 하나다(`process.platform` 막기를 뺐다). Windows(`win/dialogs.rs`): `IFileOpenDialog`/`IFileSaveDialog`(windows-rs COM, 부른 창이 owner, `FOS_FORCEFILESYSTEM`, 저장은 `FOS_OVERWRITEPROMPT` + 이름의 확장자를 기본 확장자로). 형식: 확장자 → `*.ext`, MIME → 레지스트리 MIME 데이터베이스(`HKCR\MIME\Database\Content Type\…\Extension`, `image/*`는 하위 키를 훑음) + 흔한 형식 표, 확장자를 모르는 형식이 있으면 필터를 끈다. `panel.mime`은 `HKCR\.ext`의 Content Type. Linux(`linux/dialogs.rs`): `GtkFileChooserNative`(Flatpak·Snap·`GTK_USE_PORTAL=1`이면 XDG 포털, 아니면 GTK 대화상자. electrobun `native_file_dialog.h`와 같음). 확장자는 대소문자를 무시하는 패턴(`*.[pP][dD][fF]`, GTK 3에는 add_suffix가 없다), MIME(`image/*` 포함)은 GTK MIME 필터, shared-mime-info에 없는 MIME이면 필터를 끈다. `panel.mime`은 GIO `content_type_guess`. 두 OS 모두 필터는 하나("모든 파일" 없음, macOS와 같음). `panel.types`(UTI)는 macOS 전용이라 UNSUPPORTED. 확인(Linux 컨테이너, Xvfb 캡처): 부른 창 위에 모달로 뜬 "Open File"(pdf 필터)·"Save File"·"Select Folder", 닫기 결과. Windows는 `cargo check`만(실행 확인은 VM에서) |
| dialog (Windows·Linux) | 네이티브 알림 | 구현 | Windows: `TaskDialogIndirect`(제목 = main instruction, 메시지 = content, 버튼은 주어진 순서, 첫 버튼이 기본, cancel 버튼이 있을 때만 Esc·닫기 버튼, destructive 스타일 없음). prompt는 TaskDialog에 입력란이 없어 직접 만든 대화상자(빈 메모리 템플릿, WM_INITDIALOG에서 dialog unit(MapDialogRect)으로 배치, Segoe UI 9pt, 굵은 제목, cue banner). 대화상자마다 스레드를 띄우고 앱 창을 owner로 준다(Tauri가 rfd로 하는 방식, `tauri-plugins-workspace/plugins/dialog/src/desktop.rs:142-150`): tao 이벤트 핸들러 안의 모달 루프는 그동안의 이벤트를 모두 버퍼에 묶는다(`tao/src/platform_impl/windows/event_loop/runner.rs` event_buffer, IPC 응답도 `UserEvent::Respond`로 온다). Common Controls 6: Bun 실행 파일에 manifest가 없어 `native/desktop/build.rs`가 DLL에 manifest(리소스 2, `/MANIFEST:EMBED` + `/MANIFESTDEPENDENCY`)를 넣고 대화상자 스레드가 `CreateActCtxW`(이 DLL, 리소스 2)로 켠다(electrobun `showTaskDialogWithDllActivationContext`). TaskDialogIndirect는 GetProcAddress로 찾으므로 없어도 DLL은 뜨고, 그때는 직접 만든 대화상자를 쓴다. Linux: `GtkMessageDialog`(제목 = 굵은 줄, 메시지 = secondary text), GNOME 순서(첫 버튼이 오른쪽, `suggested-action`), destructive는 `destructive-action`, prompt는 `GtkEntry`(Return = 첫 버튼). `gtk_dialog_run` 같은 중첩 루프 없이 response 시그널로 답한다. 부른 창에 창 그룹을 따로 줘 모달 grab이 그 창만 막는다(시트처럼). cancel 버튼이 없으면 닫기 버튼이 없고 Esc도 무시한다. 확인(Linux 캡처): confirm·prompt(기본 텍스트 선택)·action sheet(Cancel·Delete(빨강)·First(파랑)), 대화상자가 열린 동안 브리지 호출이 답을 받음(자가 테스트에 추가, 모든 데스크톱) |
| D7 (Windows·Linux) | JS `alert`/`confirm`/`prompt` | 웹뷰 기본 | 두 웹뷰는 자체 대화상자를 띄우므로 그대로 쓴다. `AKAN_NATIVE_TEST_PANELS`(dev 빌드)일 때만 셸이 답한다: Linux는 WebKitWebView `script-dialog` 시그널에서 대화상자를 잡아(ref, 비동기 형식) 답을 넣고 지연 뒤 `close`, Windows는 `ScriptDialogOpening` 핸들러 + `AreDefaultScriptDialogsEnabled=false`(웹뷰를 만든 직후, 첫 탐색 시작 전. 그 뒤 바꾼 설정은 다음 탐색부터 적용)에서 deferral을 받아 지연 뒤 `Accept`·`Complete`. 페이지 스크립트는 그동안 멈춘다. 이 모드에서는 대화상자가 화면에 보이지 않는다. prompt는 macOS처럼 기본 텍스트를 돌려준다 |
| 공통 (Windows·Linux) | 대화상자 테스트 훅 | 셸(dev 빌드만) | `TestAnswers`를 `dialog_args.rs`로 옮겨 세 OS가 같은 `AKAN_NATIVE_TEST_PANELS` 형식을 읽는다(`akan-native test`는 데스크톱 모두 `auto`). 타이머: Linux는 GLib timeout(알림은 response 시그널, 파일 선택기는 `hide()`가 response를 보내지 않으므로 같은 핸들러를 직접 부름), Windows는 TaskDialog `TDF_CALLBACK_TIMER`(`TDM_CLICK_BUTTON`), 직접 만든 대화상자는 WM_TIMER, 파일 대화상자는 대화상자 스레드의 message-only 창 타이머에서 `IFileDialog::Close`(OK 답은 대화상자 창에 IDOK), D7은 main 스레드 타이머 |
| local-notifications (Windows·Linux) | 알림 | 구현 | macOS와 같은 셸 op(`notify.*`)와 답 JSON이라 desktop.ts는 하나다(`process.platform` 막기를 뺐다. 모든 op에 `app {id, name}`을 붙이고 macOS는 무시한다). 두 OS 모두 앱 대신 예약해 주지 않으므로 셸이 예약 목록을 가진다(`notify_schedule.rs`: 스레드가 때가 되면 보여 준다. 반복은 `at`의 위상을 지키고 day·week는 현지 달력 날짜로 더한다(Linux GLib `g_date_time_add_days`, Windows `SystemTimeToTzSpecificLocalTime` 왕복). 잠든 동안 놓친 반복은 건너뛴다). 그래서 앱이 실행 중일 때만 전달된다(web 타이머와 같음). 대기 목록은 앱 데이터 폴더의 `notifications.json`(모든 op의 `store`)에 쓰고, 다음 실행 때 셸이 `init` 이벤트 뒤 `notify.restore`로 다시 예약한다(사용자 결정 2026-09-25: 재시작 후 유지, 꺼져 있는 동안의 전달은 하지 않음). 꺼져 있는 동안 때가 된 일회성 알림은 다음 실행 때 늦게 보이고, 반복은 놓친 회차를 건너뛴다. 확인(Linux 컨테이너): 미리 써 둔 목록에서 한 시간 뒤 알림은 남고, 지난 일회성 알림은 표시되어 빠지고, 사흘 전 시작한 매일 반복은 놓친 회차를 건너뛰었다. Linux(`linux/notify.rs`): 세션 버스의 `org.freedesktop.Notifications`를 GDBus로 부른다(Notify, CloseNotification, ActionInvoked·NotificationClosed 시그널. 새 crate 없음). 같은 id는 replaces_id로 바꾸고, 앱 아이콘은 64×64 `image-data`로 보낸다. 본문 클릭("default" 액션)이면 `action`을 보내고 셸이 닫는다(dunstctl action은 닫지 않았다, 확인). 권한은 서버가 답하면 granted이고, 서버가 없으면(활성화할 .service도 없으면) `UNSUPPORTED`. 전달 목록은 서버가 닫았다고 알릴 때까지 셸이 기억한다. Windows(`win/notify.rs`): 패키지 없는 앱의 토스트. `HKCU\Software\Classes\AppUserModelId\<id>`(DisplayName, IconUri = icon.rgba로 만든 PNG) + `SetCurrentProcessExplicitAppUserModelID`, `CreateToastNotifierWithId`, ToastGeneric XML(launch = 요청 JSON), tag = id·group `akan-native.ln`. `Activated` → `action`(앱 실행 중에만). 전달 목록·삭제는 `ToastNotificationHistory`, 권한은 `ToastNotifier.Setting`(꺼져 있으면 denied). 패키지 없는 앱은 첫 토스트 전까지 설정 항목이 없어 `Setting`이 ERROR_NOT_FOUND로 실패한다(Windows 11 26200에서 확인). 그때는 아무도 이 앱을 끄지 않았으므로 모든 앱 스위치(`HKCU\…\PushNotifications` `ToastEnabled`)만 본다. 확인(Linux 컨테이너, dunst): 자가 테스트(바로·1.5초 뒤 표시, `received`, 전달 목록·data, 삭제), 클릭 → `action`과 목록에서 빠짐, 서버 없는 세션 → UNSUPPORTED. 확인(Windows 11 ARM VM): 자가 테스트 통과, 토스트에 앱 이름·아이콘·제목·본문이 보임(화면 캡처). **남은 것**(당분간 하지 않기로 함): 앱이 꺼져 있을 때의 전달과 클릭(Windows `ScheduledToastNotification` + COM activator(`INotificationActivationCallback`, CustomActivator, 실행 때 class factory 등록), Linux는 OS에 예약 기능이 없음) |
| secure-storage (Windows·Linux) | OS 자격 증명 저장소 | 구현 | macOS와 같은 envelope 암호화(데이터 키 하나 + AES-256-GCM 파일)이고, 키는 OS 저장소에 셸 op `keychain.get/set/delete`로 둔다(macOS `keychain.rs`와 같은 op·JSON. `/usr/bin/security` 경로는 macOS 전용). Windows(`win/keychain.rs`): Credential Manager 일반 자격 증명(`CredWriteW/CredReadW/CredDeleteW`, 대상 이름 `<service>/<account>`, 이 사용자·이 PC(`CRED_PERSIST_LOCAL_MACHINE`), 값은 UTF-16, 라벨은 comment). Linux(`linux/keychain.rs`): Secret Service를 GDBus로("plain" 세션, 속성 service·account, default 컬렉션 = 로그인 키링, 없으면 CreateCollection). 잠긴 항목·컬렉션은 Unlock + Prompt로 연다(Completed 시그널은 그 스레드의 main context에서 기다린다). 창을 닫으면 `PERMISSION_DENIED`, Secret Service가 없으면 `UNSUPPORTED`. 확인(Linux 컨테이너): 자가 테스트 왕복, `secret-tool`로 항목(라벨·속성·64자 hex 키) 확인, 잠긴 키링 → 비밀번호 창(gcr-prompter)이 뜨고 닫으면 PERMISSION_DENIED, 서비스 없는 세션 → UNSUPPORTED. Windows는 `cargo check`만 했다 |
| 공통 (Linux 컨테이너) | 알림 서버·로그인 키링 | 수정 | 이미지에 dunst를 넣었다(D-Bus가 처음 쓸 때 띄운다). gnome-keyring 잠금 해제 비밀번호를 `printf ''` 대신 한 줄(`'\n'`)로 넘긴다. 개행이 없으면 로그인 키링이 생기지 않아 "default" 컬렉션이 없고, `secret-tool store`는 오지 않을 비밀번호 창을 기다렸다(확인) |

2026-09-25 네이티브 시트 뒤: `cargo test` 17 pass, `bun test` 299 pass, **macOS 44/44**(D7·dialog·파일 패널 시트 검사 추가), web 41/41.
| local-notifications | macOS 네이티브 | 구현 (Q-P6 (b1)) | AppleScript 임시 구현을 `UNUserNotificationCenter`(셸 `notify.rs`, objc2 런타임 `msg_send!` + 프레임워크 링크, 새 crate 없음)로 바꿨다. iOS와 같은 요청 구조(식별자 = id, userInfo에 표지·목표 시각·반복·data JSON 텍스트), 반복은 달력 트리거, 대기 목록의 반복 항목은 다음 시각을 보고한다. delegate(`define_class!`)는 Info.plist `AkanNativeUserNotifications`가 있으면 실행 직후(AppKit 실행 완료 전) 설치해 클릭으로 켜진 경우도 받고, 앞에 있을 때도 배너를 띄우며 `received`를 보낸다. 클릭은 페이지가 듣기 전까지 버퍼(C2). 확인(실제 앱): 권한 상태 읽기(프롬프트 없음), 권한 요청 시 시스템 프롬프트 표시(usernoted `askpermissions`), `add`·대기 목록(식별자·data·달력 다음 시각)·취소·전달 목록·삭제·인자 오류, 권한 없음 → `PERMISSION_DENIED`. **확인 못 함**: 실제 배너 표시와 `received`/`action` — 첫 프롬프트에 응답이 없는 채 앱이 종료되어(usernoted `fromUserAction: false`) 이후 상태가 denied로 읽혔고, 프롬프트는 한 번만 띄운다는 원칙으로 다시 묻지 않았다. **알아낸 것**: ad-hoc 서명 번들로 동작한다. 단 번들이 `/private/tmp` 아래에 있으면 usernoted가 "Failed to find or validate client"로 거절한다(스크래치 경로에서 재현, 홈 폴더·`~/Applications`에서는 통과, `lsregister` 등록 여부·직접 실행/`open` 무관). 권한은 번들 id 기준으로 기록되어(TCC처럼 cdhash가 아님) 재빌드 뒤에도 유지되는 것으로 보인다(같은 id의 다른 위치 복사본들이 같은 상태를 읽음) |
| camera | macOS 권한 상태 (Q9) | 구현 | `checkPermission`·`requestPermission`만 셸(`camera.rs`: `AVCaptureDevice authorizationStatusForMediaType:`/`requestAccessForMediaType:`, objc2 런타임, AVFoundation 링크)로, 촬영은 web 구현(getUserMedia·`<input type=file>`) 그대로. 이를 위해 native subset에 `web: true`(나머지 메서드는 web 구현) 형식을 추가했다(boot `PluginDecl`, CLI `pluginDecls`, core 라우팅, mock host). `NSCameraUsageDescription`이 없으면 요청하지 않고 오류(TCC가 앱을 죽임). 확인: `open`으로 띄운 앱은 notDetermined → 요청 시 TCC 프롬프트(tccd `AUTHREQ_PROMPTING`) → 사용자 허용 → granted. 셸에서 직접 실행하면 TCC가 실행한 터미널·편집기를 책임 프로세스로 보고 그 권한을 읽는다(`akan-native run`·`akan-native test`에서 보이는 값) |
| menu | P2 플러그인 (Q-P6 (b)) | macOS | 셸 `menu.rs`(objc2-app-kit, 새 crate 없음). `setAppMenu(items)`·`resetAppMenu`·`getAppMenu`·`popupContextMenu(items, {x, y})`·`triggerItem(id)`(테스트용), 이벤트 `click { id, source, checked? }`: 앱 메뉴 클릭은 마지막 포커스 창, 컨텍스트 메뉴 클릭은 연 창으로 간다. 항목: id, label, accelerator, enabled, checked(누르면 스스로 토글), submenu, separator, role. 항목 role 18개(about·hide·quit·undo…selectAll·minimize·zoom·close·toggleFullScreen·bringAllToFront)는 target 없이 responder chain으로 가서 페이지의 복사·붙여넣기가 그대로 되고 AppKit이 활성화를 정한다. 하위 메뉴 role(appMenu·editMenu·windowMenu·helpMenu·services)은 표준 항목을 채우고 NSApp의 windowsMenu/helpMenu/servicesMenu로 등록한다. 메뉴 막대에는 하위 메뉴만 둘 수 있어 최상위 일반 항목은 INVALID_ARGS. D1 기본 메뉴도 같은 빌더(appMenu + editMenu + windowMenu, Services 추가)로 옮겼다. 컨텍스트 메뉴는 호출한 창의 WKWebView(flipped) 좌표에 뜨고 닫힐 때 resolve된다. `closeAfterMs`(테스트용)는 절대 시각 NSTimer로 닫는다. `performSelector:afterDelay:inModes:`는 3초 요청이 0.3–0.7초 만에 닫혀서 쓰지 않았다. `getAppMenu`는 akan-native가 만든 항목만 돌려준다(tag 상위 16비트 표식). AppKit이 "Edit" 메뉴에 스스로 넣는 Writing Tools·AutoFill·받아쓰기·이모지 항목은 빠진다. 확인: 설정 → 되읽기(가속키 왕복 포함), triggerItem으로 click 4건(체크 토글 on/off), 잘못된 트리 3종 거절, 컨텍스트 메뉴 창(layer 101)이 요청 위치(창 내용 원점 + (60,80), 메뉴 위 여백 5pt)에 뜨는 것을 CGWindowList와 창 캡처로 확인. 실제 마우스 클릭은 손쉬운 사용 권한이 없어 직접 누르지 못했다(같은 target 메서드를 탄다) |
| tray | P2 플러그인 (Q-P6 (b)) | macOS | 셸 `tray.rs`(NSStatusBar/NSStatusItem). `create`(같은 id면 갱신: 페이지 새로고침 대비)·`update`·`setIcon`·`setTitle`·`setTooltip`·`setMenu`·`remove`·`list`·`trigger`(테스트용), 이벤트 `click { id, button }`·`menuClick { id, item }`(마지막 포커스 창). 버튼은 왼쪽·오른쪽 mouse-up에 action을 보낸다. 메뉴가 있으면 클릭할 때만 `setMenu → performClick → setMenu(nil)`로 열어서 click 이벤트와 메뉴를 함께 지원한다(`menuOnLeftClick`, 기본 true). 아이콘은 public/ 경로나 `/__akan_native/file` URL을 셸이 직접 읽어 18pt 높이로 맞추고, `iconAsTemplate`면 메뉴 막대 명암을 따른다. 아이콘도 제목도 없으면 INVALID_ARGS. 확인: macOS 26에서는 상태 항목 창을 앱이 아니라 Control Center 프로세스가 `Item-0`으로 그린다. 트레이를 만들면 새 창(49×33)이 생기고 캡처에 template 링 아이콘과 제목이 보이며, `remove` 뒤에는 onscreen=false가 된다. trigger로 left·right click 이벤트 확인. 실제 클릭으로 메뉴를 여는 것은 직접 확인하지 못했다 |
| global-shortcut | P2 플러그인 (Q-P6 (b1)) | macOS | 셸 `hotkey.rs`: Carbon `RegisterEventHotKey` + 앱 이벤트 대상 `InstallEventHandler`(C 함수를 직접 선언하고 Carbon.framework 링크, crate 없음). NSEvent global monitor와 달리 앱이 앞에 있어도 오고 권한이 필요 없다. `register`(이미 가진 조합은 성공: 새로고침 대비)·`unregister`·`unregisterAll`·`isRegistered`·`list`, 이벤트 `pressed { accelerator }`(등록한 문자열, 마지막 포커스 창). 같은 조합인지는 키 코드 + 수정키로 판단한다(macOS에서 Cmd+K = CmdOrCtrl+K). 확인: 등록·중복 등록·해제·잘못된 가속키 거절. Cmd+Space·Cmd+Tab(시스템 단축키)도 등록은 성공한다(문서화). 실제 키 입력으로 `pressed`가 오는지는 확인하지 못했다: CGEventPost는 손쉬운 사용 권한이 없어(`AXIsProcessTrusted` false) 전달되지 않았다 |
| 공통 | 가속키 파서 | 셸 `accelerator.rs` | Electron/Tauri 문법(CmdOrCtrl, Cmd, Ctrl, Alt/Option, Shift + A–Z, 0–9, F1–F20, 구두점, Space, Tab, Enter, Escape, Backspace, Delete, Insert, 화살표, Home/End, PageUp/Down, Num0–9). 메뉴 키 등가물(소문자 + 수정키 마스크, 기능 키는 AppKit 문자), Carbon 키 코드(kVK, US 배열 위치)와 수정키, getAppMenu용 역변환. 단위 테스트 4개 |

2026-09-25 menu·tray·global-shortcut 뒤(플러그인 30개): `cargo test` 18 pass, `bun test` 309 pass, **macOS 47/47 · web 44/44**(iOS·Android는 이 작업에서 돌리지 않음).

2026-09-25 Q-P6 구현(패널·대화상자·D7, 알림·카메라, 메뉴·트레이·단축키) 뒤 `akan-native test all`(플러그인 30개): **web 44/44 · macOS 47/47 · iOS 44/44 · Android 44/44**, `bun test` 309 pass, `cargo test` 18 pass. macOS release 빌드 실행·SIGTERM 정상 종료 확인.
| 공통 | 사람이 직접 확인한 경로 | 확인함 | 2026-09-25 사용자가 샘플로 직접 확인했다: 트레이 클릭·메뉴, 우클릭 컨텍스트 메뉴, 다른 앱이 앞에 있을 때 전역 단축키, 파일 패널에서 파일을 골라 열기, Cmd+Q·Cmd+W 키, Finder 파일 드롭, iOS 전체 화면 동영상. 알림 배너·클릭은 샘플에 알림 카드(`NotificationsCard`: 권한 요청, 5초 뒤 알림, 목록, received·action 로그)를 더해 확인하기로 했다 |
| local-notifications | macOS 알림 배너·클릭 | 확인함 | 2026-09-25 사용자가 샘플 알림 카드로 직접 확인: 권한 허용, 5초 뒤 배너, received·action(클릭) 이벤트 |
| C7 | 호출별 허용 검사 지점 | 구현(PL-11) | 데스크톱 dispatcher, iOS·Android `AkanNativeBridge`가 플러그인에 넘기기 전에 앱 capabilities로 검사하고(`aclCheck`, 부른 창 id 포함) 막힌 호출은 `NOT_ALLOWED`. 페이지는 web 구현에 같은 규칙을 적용. 스코프는 호출과 함께 플러그인에 간다 |
| 공통 | PL-11 권한 ACL | 구현 | 앱 설정 `capabilities`(identifier, windows, platforms, permissions), manifest에서 나온 권한 이름과 `defaultPermissions`·`permissionSets`·`scope`, deny 우선, 새 오류 코드 `NOT_ALLOWED`, `plugin.isAllowed()`. filesystem(`{ base, path }`, 데스크톱은 링크 실제 위치도)과 opener(`{ url }`) 스코프. 샘플 자가 테스트 web·iOS·Android 47/47, macOS는 프로브로 창별 확인(사용자 샘플 인스턴스가 실행 중이라 샘플 macOS 테스트는 건너뜀) |
| S1 (수정) | Android 시스템 바 아이콘 색 | 수정 | 프레임워크 `DeviceDefault.DayNight` 테마는 라이트 모드에서도 상태 표시줄·내비게이션 바 아이콘을 흰색으로 둬서 밝은 페이지 위에서 보이지 않았다(release 빌드 스크린샷에서 발견). 셸이 칠한 배경색의 밝기(`Color.luminance > 0.5`)로 `APPEARANCE_LIGHT_STATUS_BARS`·`APPEARANCE_LIGHT_NAVIGATION_BARS`를 정한다. 다크 모드 전환(`onConfigurationChanged`)에도 다시 적용. 라이트·다크 스크린샷으로 확인 |

2026-09-25 CLI-10·SEC-4·PL-11 뒤: `bun test` 353 pass, `cargo test` 18 pass, **web 47/47 · iOS 47/47 · Android 47/47**(strict CSP + capabilities), Android release 361KiB 실행 확인. macOS는 사용자가 샘플을 종료한 뒤 **50/50**.

| 영역 | 항목 | 상태 | 내용 |
|---|---|---|---|
| 공통 | PL-10 플러그인 코드 생성 | 구현 | `definePlugin<Api, Events>` 인터페이스에서 Swift·Kotlin 인자·결과 타입, `<Plugin>PluginSpec`, 이벤트 헬퍼를 생성한다. manifest `"codegen": true`면 빌드마다 생성하고, `akan-native plugin check/codegen/stub` 명령이 있다. preferences·haptics·device를 옮겼다. 30개 플러그인 전부의 생성 코드가 Swift 6과 kotlinc에서 경고 없이 컴파일된다(plugin-authoring.md §5) |
| 공통 | ENV-6·ENV-7 | 구현 | `env.platforms.<p>`, `.env.<p>`, `.env.<mode>.<p>`를 지원하고, 타입 파일 `akan-native-env.d.ts`를 생성한다. 샘플은 Android 에뮬레이터용 `10.0.2.2`를 `.env.development.android`로 둔다 |
| 공통 | UP-3 버전 호환 규칙 | 구현 | 네이티브 API 지문 `nativeApi`를 boot.json과 `@akanjs/native/core`에 넣고, 빌드마다 `bundle.json`을 쓴다. `akan-native compat <platform> --against <bundle.json>`으로 확인한다 |
| CLI | 창 없는 에뮬레이터 | 수정 | `akan-native test`가 켠 `-no-window` 에뮬레이터를 `akan-native run`·`akan-native dev`가 재사용하면, 앱이 보이지 않는다고 경고하고 `adb emu kill` 방법을 알려 준다 |
| macOS | 가려진 창에서 자가 테스트 멈춤 | 수정 | 테스트 창이 다른 앱 뒤에 열리면 WebKit이 페이지를 멈춰서(`visibilityState` hidden) 첫 파일 패널 이후 진행하지 않았다. `akan-native test`는 WRY `with_background_throttling(Disabled)`(`WKPreferences.inactiveSchedulingPolicy`)를 켠다(dev 빌드 + `AKAN_NATIVE_TEST_NO_THROTTLING`). 각 검사가 시작할 때 `selftest: <이름>`을 로그로 남겨, 시간 초과 때 멈춘 검사가 보인다 |

2026-09-25 ENV-6·7, PL-10, UP-3 뒤 `akan-native test all`: **web 49/49 · macOS 52/52 · iOS 50/50 · Android 50/50**, `bun test` 368 pass, `cargo test` 18 pass.

| 영역 | 항목 | 상태 | 내용 |
|---|---|---|---|
| 공통 | PL-10 전체 적용 | 구현 | 네이티브 구현이 있는 24개 플러그인이 모두 `codegen: true`. 4개 묶음을 병렬로 옮겼다. 타입 없는 메서드는 3개(filesystem `readFile`·`writeFile`, local-notifications `schedule`). 옮기면서 생성기에 넣은 것: Swift 구조체 `Equatable`, `none`→`none_`, `unknown`의 null, Kotlin enum `from(json)`과 Swift와 같은 오류 문구, `akanNativeDispatch`(메서드별로 느슨한 디코딩, `share.canShare`), `AkanNativeFileRef`, 빈 타입 정리, 교차 타입 이유 문구. 인자 타입 오류의 문구는 생성기 형식(`x is required`, `x must be one of …`)으로 바뀌었고, 전에는 조용히 받아들이던 잘못된 타입(숫자 → 문자열 등)을 이제 `INVALID_ARGS`로 거절한다 |
| 공통 | `akan-native plugin compile` | 구현 | 셸 + 고른 플러그인 + 생성 코드만 임시 폴더에서 컴파일(iOS `-typecheck`, Android kotlinc). 병렬 작업용 |
| 공통 | UP-2 웹 번들 업데이트 | 구현 | `@akanjs/native/plugins/updates`, 셸 `AkanNativeUpdates`(Swift·Kotlin). 샘플로 iOS 시뮬레이터·Android 에뮬레이터에서 적용·확정·5초 롤백·재다운로드 방지 확인 |
| macOS | UP-1 앱 업데이트 | 구현 | 데스크톱 플러그인이 `.app`을 교체하고 재실행. 블록 매칭 delta(`packages/desktop/src/delta.ts`), trial과 `.previous` 롤백. 샘플로 전체 archive(26 MiB) → 확정, delta(33 KiB) → 5초 롤백 확인 |
| 공통 | P3 플러그인 | 구현 | toast, badge, accessibility, dock, screen, autostart(모두 새로 만들고 codegen 사용). badge의 macOS는 dock 플러그인의 `dock.setBadge` op를 쓴다. autostart는 샘플 자가 테스트에서 읽기만 한다(`isEnabled`). 실제 로그인 항목 등록은 사용자 확인 후 |
| 공통 | sqlite, http(WV-5) | 구현 | sqlite는 호출당 문장 하나(여러 문장은 INVALID_ARGS, Android·bun이 첫 문장만 실행하는 문제를 막음). http는 CORS 없이 네이티브로 요청하고, 앱 capabilities의 `{ url }` 스코프를 리다이렉트마다 검사한다(샘플은 `https://blocked.example/*` 거부로 NOT_ALLOWED 확인). 평문 http는 Android cleartext 정책·iOS ATS 때문에 거부된다(dev 빌드의 Android는 localhost·127.0.0.1·10.0.2.2만 허용) |
| 공통 | `akan-native dev --hmr` | 구현 | Bun dev server + 게이트웨이, 호스트 프록시(macOS std TCP, iOS URLSession, Android HttpURLConnection + adb reverse). 네 플랫폼에서 상태 유지 Fast Refresh 확인 |
| macOS | `akan-native signing setup` | 구현 | 고정 자체 서명(TCC 유지). Keychain 무확인 접근은 Team ID가 있어야 한다(cdhash 파티션, 측정). autostart 실제 등록·해제를 ad-hoc 서명·/Applications 밖 빌드에서 확인(`notFound` → enable `enabled` → disable `notRegistered`) |
| 공통 | 자가 테스트 보고 | 수정 | 보고가 Android 로그 한 줄 한계(약 4 KB)를 넘어 잘리던 문제: base64 조각(`AKAN_NATIVE_SELFTEST_PART i/n`)으로 보내고 `akan-native test`가 합친다 |
| Windows | VM 확인 (Windows 11 ARM, 26200) | 확인함 | 자가 테스트 61/61. 화면 캡처로 확인: prompt 대화상자(메시지·입력·OK/Cancel), 파일 열기·폴더 선택 대화상자, 토스트, 알림 영역 아이콘과 오른쪽 클릭 메뉴. 딥 링크: 실행 중(두 번째 실행이 single-instance로 넘기고 끝남)과 콜드 스타트 모두 `useUrlOpen`까지 옴. autostart: enable → `Run` 값과 시작 앱 목록, 설정에서 끈 상태(`StartupApproved` 03) → `requiresApproval`, enable은 PERMISSION_DENIED. 고친 것: 파일 대화상자 테스트 타이머(`IFileDialog::Close`가 S_OK를 돌려주고도 닫지 않아 매 틱 IDOK/IDCANCEL을 보냄), 첫 토스트 전 `ToastNotifier.Setting`의 ERROR_NOT_FOUND, 업데이트 도우미가 앱과 함께 끝나던 문제(`cmd.exe start /b`), 트레이 기본 아이콘. VM은 UAC가 꺼져 있어(EnableLUA=0) 앱이 High 무결성으로 돈다 |

2026-09-25 PL-10 전체 적용, UP-1·UP-2, HMR, P3 플러그인 9개(updates 포함 39개) 뒤 `akan-native test all`: **web 58/58 · macOS 61/61 · iOS 59/59 · Android 59/59**, `bun test` 466 pass, `cargo test` 34 pass. macOS는 `akan-native dev: <user>` 인증서로 서명.

### 2026-09-26 검토 반영 (study-84 세션의 전체 검토)

사용자가 P0 보안, P0 동작 버그, 부록의 작은 수정을 모두 진행하기로 했다. 기본 권한은 보수적으로 두기로 결정했다. P1 구조 보완(스트림 채널, 페이지 리셋 훅, 이벤트 보존)과 제품화·배포(CLI-9 등)는 study-84의 아키텍처 검토 뒤로 미뤘다.

| 영역 | 항목 | 상태 | 내용 |
|---|---|---|---|
| Windows | 에셋 경로로 임의 파일 읽기 | 수정 | `:`가 든 경로는 파일로 찾지 않는다(네 호스트 공통), 데스크톱은 경로 구성 요소도 확인. VM에서 고치기 전 `/C:/Windows/win.ini` 200을 재현, 고친 뒤 셀프 테스트로 확인 |
| 데스크톱 | 외부 열기와 iframe | 수정 | http·https·mailto·tel만 OS로, iframe은 로드만 하고 아무것도 열지 않는다. macOS·Linux에서 교차 출처 iframe이 이제 로드된다 |
| 데스크톱 | `.env`·`bunfig.toml` 자동 로드 | 수정 | 컴파일 플래그로 끄고, 라이브러리·리소스 경로의 환경 변수 덮어쓰기를 없앴다. `BUN_BE_BUN`은 알려진 한계 |
| 공통 | URL 스코프 | 수정 | 스킴·호스트·포트·경로를 나눠 비교(`urlMatch`, `urlFields`). 공통 사례 70개를 TS·Swift·Kotlin에서 모두 돌린다(`scripts/native-vectors.ts`) |
| Android | 업데이트 폴더 | 수정 | `noBackupFilesDir`로 옮기고, 번들마다 서명한 매니페스트를 두어 시작할 때마다 다시 검증(iOS도 같게) |
| 공통 | 기본 권한 | 변경 | manifest `defaultScope`: filesystem은 data·cache·temp, http는 URL 없음. capabilities 없는 release 빌드는 경고 |
| Android | 브리지 포트 | 수정 | 문서당 포트 하나, 포트 전 요청은 한 번만, 셸은 반복 id를 버린다 |
| iOS | 화면 전환 중 표시 | 수정 | `AkanNativePresent`(전환이 끝나기를 기다리고, 표시하지 못하면 호출에 답함)를 dialog·camera·file-picker·browser·share·JS 패널이 같이 쓴다 |
| 데스크톱 | 업데이트 CPU 구분, progress 이벤트 | 수정 | `<os>-<arch>/` 경로와 서명되는 `arch`. desktop 모듈과 manifest 비교 검사를 빌드·`akan-native plugin check`에 넣었다 |
| 데스크톱·iOS | 큰 파일 | 수정 | Range 응답 1000 KiB 상한, 필요한 부분만 읽음 |
| CLI | 빌드 프로필 | 변경 | debug/release를 모드와 분리, 모르는 플래그는 오류 |
| 데스크톱 | dispatcher | 수정 | 플러그인 자신의 메서드·이벤트만 찾는다(`constructor` 등), 시작에 실패한 이벤트 source를 남기지 않는다 |
| 데스크톱 | 보조 창 닫기 감시 | 수정 | Worker가 바쁠 때 보조 창을 닫으면 그 창만 닫는다(예전: 앱 종료) |
| 공통 | 업데이트 다운로드 | 수정 | 크기 상한(매니페스트 1 MiB, 서명 1 KiB, 파일은 서명된 크기), 모바일은 디스크로 받으며 해시, 받는 중인 `.partial` 보호, 상태 쓰기 실패 처리(Android `AtomicFile`), release의 updates.url은 https |
| 데스크톱 | 업데이트 trial | 수정 | trial PID(두 번째 인스턴스가 정상 trial을 롤백하지 않게), macOS·Linux apply는 교체 전에 trial 기록 |
| 공통 | sqlite `ATTACH`·`VACUUM INTO` | 수정 | 세 플랫폼 모두 `NOT_ALLOWED`(filesystem 스코프를 우회하던 길). 셀프 테스트로 확인 |
| 데스크톱 | JSON 깊이, 퍼센트 인코딩 | 수정 | `json.rs` 중첩 128 제한(스택 넘침 방지), `%+1`·`\u+abc` 거절 |
| 데스크톱·Android | auth-session `state` | 수정 | 시작 URL에 `state`가 있으면 같은 `state`의 콜백만 받는다(다른 앱이나 웹 페이지가 보낸 링크 무시). iOS는 ASWebAuthenticationSession이라 해당 없음 |
| Android | 알림 탭·딥 링크 위조 | 수정 | 알림마다 무작위 일회용 토큰, app의 VIEW intent는 앱의 intent filter가 받는 링크만 |
| Android | secure-storage | 수정 | `AEADBadTagException`일 때만 항목을 지운다(키스토어 일시 오류는 호출 실패로), 영구 무효 키는 키와 항목을 함께 지운다 |
| Android | filesystem `documents` | 수정 | 대소문자를 무시하는 공유 저장소라 스코프를 소문자로 비교 |
| 데스크톱·Android | 답하지 않는 호출 | 수정 | Kotlin `AkanNativeCall`에 Cleaner 안전장치(iOS deinit과 같음), 데스크톱 IPC 대기 10,000개 넘으면 503, `akan_native_respond`는 잘못된 헤더에 500(프로세스 abort 대신), wake 콜백 해제 경쟁을 잠금으로 막음 |
| iOS | `window.open`의 앱 URL | 수정 | `app://localhost`는 시스템으로 넘기지 않는다 |

확인(2026-09-26): `bun test` 571 pass, 타입 검사 통과, `cargo test` 53 pass, 공통 스코프 사례 Swift·Kotlin 70/70. 자가 테스트 **macOS 63/63 · Linux 63/63 · Windows 63/63 · iOS 60/60 · Android 60/60**. UP-1(`scripts/vm/update-check.ts`) macOS·Linux·Windows 통과, UP-2 iOS·Android 적용·확정·재실행 통과(변조한 번들은 시작할 때 거부).

### 2026-09-26 아키텍처 검토 1단계 (문서·호출 식별)

study-84의 아키텍처 검토 결정(메모: CI 보류, 나머지는 추천대로)의 첫 단계다. 구조는 architecture.md §3.7(범위 모델)과 §4(v1.1)에 있다.

| 영역 | 항목 | 상태 | 내용 |
|---|---|---|---|
| ACL | URL 스코프 포트 | 수정 | 포트가 없는 패턴은 allow에서는 기본 포트만, deny에서는 모든 포트에 맞는다. deny를 `https://`로만 쓰면 빌드 경고(`aclWarnings`, manifest `scope.urlFields`). 공통 사례 87개(allow/deny 구분)가 TS·Swift·Kotlin에서 모두 통과. 샘플 설정은 로컬 서버를 `:*`로 바꿨다 |
| 브리지 | v1.1 doc·seq·once | 구현 | 문서 id, 호스트 쪽 번호와 페이지 쪽 순서 전달, 응답 뒤 이벤트는 다음 태스크, 요청 id 1회 실행과 진행 중 호출 표, 끝난 문서 거절. boot.json `bridge.features`와 UP-3 지문 |
| iOS | 문서 종료 시점 | 수정 | provisional 시작 대신 commit에 끝낸다 |
| iOS | App 서비스 (C11) | 구현 | `AkanNativeAppServices`: 번들 선택 1회(scene 재연결이 미확정 번들을 롤백하던 버그), `AkanNativeLinks`(실행 URL 고정, 사라진 리스너는 건너뜀), `AkanNativeNotifications`(C5, 셸이 delegate 소유, 앱 시작 완료 전에 등록, 페이지가 듣지 않는 탭은 셸이 보관) |
| Android | App 서비스 (C11) | 구현 | `AkanNativeApplication`/`AkanNativeApp`: 번들 선택 1회, FileRef 등록 표를 Activity에서 옮기고 id를 SecureRandom으로(전에는 순번과 nanoTime이라 추측 가능), `AkanNativeLinks`(실행 URL 고정, 최근 앱 화면에서 다시 연 intent의 옛 링크는 무시), 알림 탭 버퍼도 프로세스 범위 |
| 공통 | getLaunchUrl | 수정 | 프로세스 동안 같은 값, 실행 URL도 `urlOpen`으로 한 번 전달(iOS·Android를 데스크톱에 맞춤) |
| 공통 | 창이 끝날 때 | 수정 | scene 해제·Activity 종료·창 파괴에서 문서를 끝내 구독을 멈춘다 |

확인(2026-09-26): `bun test` 596 pass, 타입 검사 통과, 공통 스코프 사례 Swift·Kotlin 87/87. 자가 테스트 **macOS 64/64 · Linux 64/64 · Windows 64/64 · iOS 62/62 · Android 63/63**. 추가한 검사:
- 응답 직후 이벤트 1000회: 모든 플랫폼에서 페이지가 응답을 먼저 봤다. 이벤트가 응답보다 먼저 도착한 수는 macOS 6, Linux 7, Windows 58, iOS 1, Android 0이다.
- 창을 다시 만든 뒤 App 범위 유지(iOS·Android): 같은 프로세스, 번들 선택 1회, 실행 URL 같음.
- Android 다른 nonce 재링: 포트 1개 유지.

자동으로 확인하지 못한 것: iOS에서 앱이 꺼진 상태로 알림을 탭했을 때의 전달(C5). 탭 조작이 필요하다(전에는 XCUITest로 확인).

### 2026-09-26 아키텍처 검토 2단계 (계약 커널·벡터와 보안 계층)

구조는 architecture.md §5(커널·벡터)와 "보안 계층 L0~L4" 절에 있다.

| 영역 | 항목 | 상태 | 내용 |
|---|---|---|---|
| 계약 | 표·상수 생성 | 구현 | `packages/core/contract.json`에서 네 언어로 생성한다(오류 코드, MIME, id 문법, 스킴, 경로, init.js, 상한). 생성물이 낡으면 `bun test`가 실패한다 |
| 계약 | 커널과 벡터 | 구현 | 라우트·디코딩·MIME·Range·id·요청 검증·문서 수용·선언 게이트·ACL·스코프·내비게이션. 벡터 7종을 TS·Rust·Swift·Kotlin JVM과 기기에서 돌린다 |
| 계약 | 벡터가 찾은 차이 | 수정 | Kotlin `%+1`과 Range, Swift Range 끝값과 불리언 버전, FileRef id 확장자(데스크톱·iOS), 데스크톱 번들 id `.`·`..`, `shellError`의 NOT_ALLOWED, MIME 표 네 벌. Range는 RFC대로 잘못된 헤더를 무시(200) |
| L0 | 셸 정책 | 구현 | iOS·Android도 내비게이션 판정을 공유한다(외부 스킴만 OS로, iframe은 웹 콘텐츠만). `security.shell.externalSchemes`, 외부 열기 초당 1회(셸과 opener·browser·auth-session), macOS 카메라·마이크는 앱 오리진 메인 프레임만, Android 권한 오리진 정확 비교 |
| L2 | 선언 게이트 | 구현 | 선언하지 않은 메서드·이벤트는 모든 호스트에서 NOT_FOUND. 빌드가 `items: "*"`를 목록으로 펼친다 |
| L3 | ACL 로더 | 수정 | 형식이 잘못되면 모두 거부(fail-closed). 전에는 Swift 전체 허용·denial 전부 무시, Kotlin 크래시, TS 부분 문자열 비교였다 |
| L4 | 경로 스코프 | 구현 | allow의 와일드카드는 점 파일에 맞지 않음(deny는 맞음), 대소문자 무시 볼륨은 통일해 비교, filesystem 세 플랫폼이 실제 위치 재검사·재귀 작업의 하위 항목 검사·목록 필터 |
| L4 | URL | 수정 | http 정규화가 호스트의 퍼센트 이스케이프를 거절(세 플랫폼, 벡터 26개) |
| L4 | FileRef | 부분 | 데스크톱은 일반 파일만, 앱 데이터 폴더에서는 `files/`만. 모바일은 기준 폴더 containment뿐이고, 등록 제한은 이후 |
| CLI | 옛 문법 | 구현 | 스킴 없는 URL 패턴, 절대·`\`·`..` 경로 패턴, `urlFields` 없는 `url` 필드는 빌드 오류(고칠 형태 제안). 포트 없는 localhost 허용은 경고 |
| 1단계 보완 | doc 없는 요청 | 수정 | id 있는 문서가 현재 문서일 때 doc 없는 요청은 INVALID_ARGS("request has no document id")로 거절한다(study-84 확인). 벡터 bridge.json documents |

확인(2026-09-26): `bun test` 918 pass, 타입 검사, `cargo test` 53 pass, Swift·Kotlin 436/436, http 26/26. 자가 테스트는 **macOS·Linux·Windows·Android 65/65, iOS 64/64**였다. 추가한 검사는 기기 벡터 316개(iOS·Android)와 선언 게이트다.

자동으로 확인하지 못한 것:
- iOS·Android filesystem의 하위 항목 검사와 목록 필터. 컴파일과 데스크톱 단위 테스트, 공통 벡터만 확인했다. 기기에서는 샘플 스코프로 해당 상황을 만들 수 없었다.
- macOS 카메라·마이크 스위즐. 컴파일과 셀프 테스트 회귀만 확인했다. iframe의 getUserMedia는 따로 시험하지 않았다.

### 2026-09-26 차세대 레퍼런스 검토 A (결함) — study-84

| 항목 | 상태 | 내용 |
|---|---|---|
| N1 FileRef·`/__akan_native/*`가 앱 오리진 문서로 열림 | 수정 | 내비게이션 판정에 `/__akan_native/*` 규칙을 넣었다(최상위는 막고, iframe은 FileRef만). Android 서버는 메인 프레임 요청에 403을 준다. FileRef에 nosniff·CORP를 붙이고, 미디어가 아니면 CSP sandbox도 붙인다. 벡터와 셀프 테스트로 확인했다. 헤더를 빼면 스크립트가 부모에 닿는 것을 재현했다 |
| N2 데스크톱 렌더러 종료 | 부분 | 세 엔진 훅, 문서 종료, 1회 재로드, 1분 안에 다시 죽으면 오류 화면. 셀프 테스트는 macOS·Linux. 절전 복귀 알림은 이후 |
| N3 single-instance 경합 | 수정 | `flock` 잠금이 결정한다. busy면 실행하지 않는다. gate 실행 단계 |
| N4 권한 핸들러 | 수정 | macOS는 스위즐(2단계), Linux는 창의 최상위 URL이 앱 오리진일 때만 허용하고 DisplayCapture·Other는 거부 |
| N5 신호·세션 종료 | 수정 | SIGINT·SIGHUP. Windows `WM_QUERYENDSESSION`·`WM_ENDSESSION`(도우미 창) |
| N6 Windows 드롭 좌표 | 수정 | CSS 픽셀(DPI로 나눔) |
| N7 작은 것 | 수정·확인 | manifest의 sources와 desktop 모듈은 플러그인 폴더 안이어야 한다(`..`·절대 경로·밖을 가리키는 심볼릭 링크는 빌드 오류). console 포워딩 가드는 페이지 전역으로 옮겼다. Android `Limited.available()`은 Int 범위를 넘지 않아 결함이 아니었다. 이름 충돌·빌드 번호는 6단계다 |
| 2단계 검토 보완 | 수정 | 기기 벡터는 파일별 정확한 건수로 확인한다(468/468, 빠진 파일은 실패). 데스크톱 문서 판정은 kernel `admitDocument`를 쓴다. FileRef는 검사한 실제 경로로 등록한다. 볼륨 판정 전에는 allow를 정확히, deny를 통일해 비교한다. 데스크톱 외부 열기 카운터는 셸과 플러그인이 하나를 쓴다(C ABI `akan_native_external_open_allowed`). Linux의 제스처 규칙은 플랫폼 차이로 문서화했다 |

확인(2026-09-26): `bun test` 957 pass, 타입 검사, `cargo test` 54 pass, Swift·Kotlin 468/468, http 26/26. 자가 테스트 **macOS 67/67 · Linux 67/67 · Windows 66/66 · Android 66/66 · iOS 65/65**(기기 벡터 468/468).

### 2026-09-26 차세대 레퍼런스 검토 B (2단계 보강)

| 항목 | 상태 | 내용 |
|---|---|---|
| 보존 이벤트 벡터 | 구현 | 커널 `RetainedEvents`/`AkanNativeRetained`와 벡터 12건을 네 곳(TS, Mac Swift·Kotlin, 기기)에서 돌린다. iOS·Android `AkanNativeLinks`, 데스크톱 app 링크, single-instance 메시지 버퍼가 이것을 쓴다 |
| 결정적 순서 하네스 | 구현 | 런타임 타이머를 주입할 수 있게 했다. 가상 시계에서 도착 순서 150가지(시드 고정)와 빈 번호를 확인한다. 520ms를 실제로 기다리던 테스트를 없애 core 테스트가 100ms로 줄었다 |
| release 엔진 디버그 변수 정리 | 구현 | `akan_native_init`이 `WEBVIEW2_*`·`WEBKIT_INSPECTOR*`·`WEBKIT_DISABLE_SANDBOX*`·`SSLKEYLOGFILE`를 지운다. Bun의 `delete process.env`가 C 환경에 닿지 않는 것을 확인해서 Rust에서 한다 |
| C ABI v0.1 | 구현 | `akan_native_abi`(major 확인), `akan_native_init`, `akan_native_last_error`, `akan_native_run` `-5`(WebView2 Runtime 없음, 설치 안내). 심볼 표 스냅샷 테스트 |
| init의 엔진·오리진 | 구현 | `__AKAN_NATIVE__.origin`·`engine`·`engineVersion`을 모든 호스트가 싣는다. filesystem의 FileRef 오리진 비교가 이것을 쓴다. 셀프 테스트가 `location.origin`과 같은지 확인한다 |

확인(2026-09-26): `bun test` 971 pass, 타입 검사, `cargo test` 54 pass, Swift·Kotlin 480/480. 자가 테스트 **macOS 68/68 · Linux 68/68 · Windows 67/67 · Android 67/67 · iOS 66/66**(기기 벡터 480/480, 엔진: wkwebview 26.6.2, webkitgtk, webview2 154.0.4258.37, android-webview 154.0.8037.57).

### 2026-09-26 akanjs 준비 트랙 0단계 (점검 지적) — study-84

| 항목 | 상태 | 내용 |
|---|---|---|
| PDF FileRef와 sandbox | 수정 | sandbox PDF를 iframe에 띄워 보니 macOS WebKit만 아무것도 그리지 않았다(iOS, WebView2는 그린다). `application/pdf`를 sandbox에서 빼고(네 커널, 벡터 2건 추가) nosniff는 유지한다. 고친 뒤 macOS에서 그려지는 것을 확인했다. N1 셀프 테스트가 PDF FileRef의 헤더를 확인한다 |
| 잠금 파일 O_CLOEXEC | 수정 | Bun의 `openSync`는 close-on-exec를 붙이지 않아 fork/exec 자식이 잠금을 물려받았다(`system()`으로 재현). `O_CLOEXEC`(macOS 0x1000000, Linux 0o2000000)로 열고, busy면 fd를 닫는다. 테스트가 `fcntl F_GETFD`와 fd 재사용으로 확인하고, 두 수정을 각각 빼면 실패한다(macOS, Linux 컨테이너) |

확인(2026-09-26): `bun test` 974 pass, 타입 검사, `cargo test` 54 pass, Swift·Kotlin 482/482. 자가 테스트 **macOS 68/68 · Linux 68/68 · Windows 67/67 · Android 67/67 · iOS 66/66**.

### 2026-09-26 akanjs 준비 트랙 1단계 스파이크

| 항목 | 결과 |
|---|---|
| S1 iOS 16 | `swiftc -typecheck -continue-building-after-errors`로 5파일 약 12곳: 셸 `isInspectable`(16.4), accessibility 알림 우선순위(17.0), appearance 트레잇 등록(17.0), auth-session `callback:`(17.4), haptics `view:`(17.5). 동작 차이는 auth-session 하나(16~17.3은 custom scheme 콜백만). 페이지 JS는 Safari 15.4 API까지만 쓴다 |
| S1 Android 29 | `api-versions.xml`과 javap로 참조를 셌다(가드는 보지 않음). 65곳, 12파일: API 30 22곳(insets·IME·시스템 바, biometric, 진동 합성), 31 16곳(splash, 위치, VibratorManager, 정확한 알람, 야간 모드), 33 11곳(뒤로 가기, Cleaner, 사진 선택기, 진동 속성, share), 35 16곳(sqlite `SQLiteRawStatement` 전체). 상수라 잡히지 않은 것: `ACTION_PICK_IMAGES`, `RECEIVER_NOT_EXPORTED`(33 미만은 무시되어 동적 리시버가 export된다), `POST_NOTIFICATIONS`(33 미만에서 거부로 읽혀 알림 예약이 모두 거절된다) |
| S2 FCM·Play Billing 전이 의존성 | firebase-messaging 25.1.3은 62모듈, billing 9.1.0은 46모듈, 둘을 합치면 72모듈이다. d8 dex(Kotlin 표준 라이브러리 제외)는 5.0MB, 4.7MB, 6.7MB(48,231메서드)이다. 둘 다 kotlinx-coroutines를 끌어온다(FCM은 firebase-common이 직접, Billing은 AndroidX lifecycle을 거쳐서). FCM은 AndroidX DataStore(Okio, 재패키징한 protobuf, 네 ABI의 .so)를 끌어온다. Billing은 코드가 참조하지 않는 play-services-location도 끌어온다. 둘 다 datatransport 텔레메트리를 쓴다. 잠금 초안은 101개 아티팩트(SHA-256 포함) |
| S3 Origin(O7) | iOS `app://localhost`, Android `https://app.localhost`. "null"이 아니다. architecture.md §5 |
| S4 15MB HTML | 파싱과 실행이 DOMContentLoaded까지 iOS 시뮬레이터 161~198ms, Android 에뮬레이터 272~418ms 걸렸다(Mac CPU 위라 실기기는 따로 재야 한다). Android 첫 실행 FCP 1.3s, LCP 2.4s. iOS는 akan이 `location.origin`(app://)으로 WebSocket 주소를 만들어 SyntaxError를 던지고 그리지 못한다(akanjs R1-2). strict CSP에 더할 것은 `'wasm-unsafe-eval'`과 `base-uri 'self'`(architecture.md "보안: CSP와 프레임") |

### 2026-09-26 akanjs 준비 트랙 3단계 (1): 최소 OS, 개인정보 매니페스트, 프로그램 API 기반

| 항목 | 상태 | 내용 |
|---|---|---|
| O1-1 iOS 16 | 구현 | `#available` 분기 5묶음(셸 isInspectable, appearance·accessibility·auth-session·haptics). iOS 16 대상 타입 검사 통과. iOS 16.4 시뮬레이터 셀프 테스트 70/70(2026-09-27) |
| O1-1 Android 29 | 구현 | `ApiN` 규칙과 빌드 검사(`apilevel.ts`, 두 수정 각각을 빼면 실패함을 확인). 플러그인 `android.minSdk`(sqlite 35, updates 33). 셸 edge-to-edge·inset·바·전체 화면·뒤로 가기·다크닝·스플래시 분기, `LinkageError` 방어, 최소 WebView(기본 94) 화면. 플러그인 9개 분기. 조사: research/android-api29.md. API 29 에뮬레이터(Google APIs 이미지)는 WebView가 91로 고정이라 최소 WebView 화면까지만 확인(f259597에서 스플래시 겹침 수정). 셀프 테스트는 WebView를 올릴 수 있는 Google Play 이미지에서 |
| O1-4 PrivacyInfo.xcprivacy | 구현 | 플러그인 `ios.privacyApis` 합산(UserDefaults CA92.1, FileTimestamp C617.1)과 앱 `config.privacy`. plutil 검사 통과 |
| O2-1 프로그램 API | 기반 구현 | `@akanjs/native/api`: `build`, `run`, `validateConfig`, `AkanNativeError`(코드와 problems·logTail), 호출별 로그 싱크, `signal` 취소, `outDir`·`env`·`envFiles`·`resolveFrom`. dev·release·doctor·devices는 이후 |
| O2-3 SSR·RSC import | 구현 | 모든 패키지를 DOM 없이, react-server 조건으로도 import하는 테스트. 훅을 namespace import로 바꿨다 |
| O1-5 Android 릴리스 | 구현 | 업로드 키 서명(env 또는 API, 비밀번호는 명령줄에 없음), App Bundle(aapt2 proto + base 모듈 + 고정 bundletool 1.18.3 + jarsigner), versionCode 범위 검사, `android.debugAppIdSuffix`, 여러 dex. 테스트 키로 AAB → universal APK 설치·실행 확인 |
| O5 선언형 네이티브 설정 | 구현 | 검토 F 병합 규칙(`nativeconfig.ts`), 앱 `native.ios.infoPlist`·`entitlements`, 플러그인 `ios.entitlements`, Android `native.android.manifest`·`application`·`activity`, `deepLinks.domains`(universal link·app link, iOS `NSUserActivity`), `native.resources`. 실제 도메인 검증은 서버 준비 뒤 |
| O4 dev | 구현 | gateway의 외부 dev 서버 모드(`--upstream`), HMR 경로(`--hmr-path`), 시작 경로(`--start`, dev·run), iPhone용 `--lan`(dev 빌드만 ATS·로컬 네트워크 키), Android `--device` serial·AVD, API `dev()`. 시뮬레이터·에뮬레이터에서 가짜 akan dev 서버로 확인 |
| O6-1 keyboard | 구현 | `setResizeMode`(resize·none), `willShow`·`didShow`·`willHide`·`didHide`. Android에서 두 모드와 이벤트 확인, iOS는 수동 확인 필요 |
| O1-2·O1-3 iPhone 빌드·서명·IPA | 구현, 서명 미확인 | iphoneos 빌드와 빌드 환경 키, 키체인 식별자(폐기된 것 제외, SHA-1로 서명), Xcode 프로파일 선택, 프로파일과 entitlements 대조, `embedded.mobileprovision`, codesign, devicectl 설치·실행, release의 .ipa(ditto). 컴파일과 단위 테스트까지 확인했고, 이 Mac에 프로파일이 없어 실제 서명·설치는 확인하지 못했다 |
| O8 고정 AAR 장치 | 구현 | 잠금(FCM·Billing·둘 다, 69개), SHA-256 캐시, 자체 manifest 병합, 리소스 overlay와 R 클래스, 라이브러리 dex 캐시, R8 consumer 규칙과 aapt2 keep 규칙, 서비스 파일, `.so`. 시험 플러그인으로 debug·release·AAB를 에뮬레이터에서 실행 |
| 남긴 것 | 이후 | sqlite의 Cursor 경로(사용자 결정으로 하지 않음), Play 업로드(O1-6), TestFlight 업로드. 순수 Kotlin Ed25519는 939ab15에서 구현. 사용자 확인: iOS 16 셀프 테스트, iPhone 서명·설치, iOS 키보드 모드는 끝(2026-09-27). API 29 셀프 테스트는 Google Play 이미지 대기 |

확인(2026-09-26): `bun test` 통과, 타입 검사, Kotlin(API 검사 0건)·Swift(iOS 16) 컴파일. 자가 테스트(현재 OS) **macOS 68/68 · Linux 68/68 · Windows 67/67 · Android 67/67 · iOS 66/66**.


### 2026-09-27 akanjs 준비 트랙 4단계: push, iap

| 항목 | 상태 | 내용 |
|---|---|---|
| O6-2 push | 구현 | iOS APNs 직접(앱 delegate → `AkanNativeRemoteNotifications`, 알림 라우터), Android 옵트인 FCM(고정 폐포, `AkanNativeMessagingService`), `android.googleServices` → `google_services.xml`. 시험 앱: iOS 시뮬레이터 APNs 토큰과 `simctl push` 수신, Android FirebaseApp 초기화·등록 실패 처리·실행 중/콜드 스타트 탭 |
| O6-3 iap | 구현 | StoreKit 2와 Play Billing 9.1.0. 상품·구매·finish(consume/acknowledge)·미완료·보유·복원·구독 관리, `transaction` 이벤트(보존). 시험 앱: iOS 시뮬레이터(StoreKit 설정 없음), Android debug·R8 release(Play 계정 없음 → UNSUPPORTED). 스토어 연동은 사용자 앱에서 |

### 2026-09-27 아키텍처 검토 3단계 (호출 제어·자원)

| 항목 | 상태 | 내용 |
|---|---|---|
| C1 취소·TIMEOUT | 구현 | `(args, { signal })`, `$bridge.cancel`, 계약 코드 `TIMEOUT`, 오류 `data`·`retryable`, web 표준 오류 이름, `listen(…, { signal, once })`, dev DataCloneError. 네 호스트(데스크톱 `ctx.signal`, 모바일 `onCancel`)와 벡터 13건 |
| C2 문서 자원·수명 규칙 | 구현 | `own`/`disown`, 끝내기 4단계(호출 → 구독 → 자원 역순 → 훅), 두 번 불러도 한 번, 끝난 문서의 늦은 자원은 즉시 닫음, 창 종료 시 App 서비스 리스너를 소유자로 지움, page-veto가 문서 종료 훅을 씀 |
| C3 플러그인 이전 | 구현 | sqlite(문서별 연결, ROLLBACK 후 close, WAL·busy_timeout), keep-awake(페이지 것), dialog(셸 `alert.dismiss` 포함), biometric, updates·http(요청 중지), iap(iOS 스트림 App 범위), FileRef `releaseFile`과 C ABI 0.2 `akan_native_unregister_file`, Android 세션 파일 정리 |
| C4 생명주기·후속 호출 | 구현 | 데스크톱 setup 대기(5초, retryable), 리스너 스냅샷 순회, 종료 경로 표, `$bridge` op는 핸들 보유로 허가, manifest 예약 이름 거부 |
| C5 K13 누수 검사 | 구현 | dev `$host.info`의 표별 개수, 자가 테스트가 10번 다시 로드한 뒤(모바일은 창을 다시 만든 뒤도) 비교. `$host.hang`으로 취소 검사 |

확인(2026-09-27): `bun test` 1060 pass, 타입 검사, Swift·Kotlin 벡터 495/495, `cargo test` 54 pass. 자가 테스트 **macOS 70/70 · Linux 70/70 · Android 70/70 · iOS 69/69**. Windows는 VM이 SSH에 응답하지 않아 확인하지 못했다(아래 후속).

### 2026-09-27 아키텍처 검토 4~6단계 일부와 Android 업데이트 하한

| 항목 | 상태 | 내용 |
|---|---|---|
| 6단계 앱 식별·충돌 | 구현 | `app.name` 규칙, `app.fileName`(기본 id 끝), `--build`/`AKAN_NATIVE_BUILD`, WebView2 경로 경고, 이름·경로 충돌 빌드 오류, manifest 모르는 키·`dependencies`, `cargo build --locked` |
| 5단계 wake 예산·조기 오류 | 구현 | 셸 카운터와 `debug.stats`, drain 256프레임/4ms 양보, K-idle(유휴 5초 wake 0), dev 조기 오류 버퍼와 호출 위치 `cause` |
| 4단계 coalesce·Range | 구현 | manifest `coalesce`, 문서별 송신함(세 호스트), `fileStream`/`fileBlob`, 큰 통짜 FileRef 경고, 이벤트 바이트 금지 |
| updates Android 29 | 구현 | `AkanNativeEd25519.kt`(RFC 8032, 순수 Kotlin)로 33 미만도 검증. 벡터 ed25519.json을 Bun·CryptoKit·Kotlin(JVM, 기기)이 통과. updates의 `android.minSdk` 33을 뺐다 |
| 남긴 것 | 이후 | 4단계 pull 규칙(새 `/__akan_native/msg` 경로)과 5단계 실행기 가두기는 필요한 플러그인이 생길 때까지 보류(사용자 결정 2026-09-27), 6단계 엔진 전용 키·모듈 분리 |
| iOS 사용자 확인 | 완료(2026-09-27) | iOS 16.4 시뮬레이터 자가 테스트 70/70, iPhone 서명·설치(인증서 자동 선택 수정), 키보드 모드(사용자 확인), 실기기 push 세 경우(렌더러 종료 시 문서 종료 수정) |

확인(2026-09-27): `bun test` 1100 pass, 타입 검사, Swift·Kotlin 벡터 519/519, `cargo test` 54 pass. 자가 테스트 **macOS 72/72 · Linux 72/72 · Windows 71/71 · Android 71/71 · iOS 70/70**(기기 벡터 519/519).
