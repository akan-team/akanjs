# iOS 셸 조사 · 프로토타입 검증 (M3 준비)

> 작성 2026-09-25 · 대상: [architecture.md](../architecture.md) §3.1·§3.4·§4·§5·§6·§8, [requirements.md](../requirements.md) Q5·SH-*·WV-*·MVP hook 표
> 환경: macOS 26.6.2 · Xcode 26.5 (17F42) · Swift 6.3.2 · iOS 26.5 시뮬레이터 런타임(23F77) · iPhone 17 Pro 시뮬레이터
> 프로토타입: `/private/tmp/claude-501/-Users-kangminseon-github-study/a6137b94-0c15-4f44-a151-6d5bde136a1d/scratchpad/proto-ios/` (임시 폴더라 **코드 전체를 §2에 옮겨 두었다**)
> 표기: **[검증]** 직접 빌드·실행해서 확인 · **[코드]** 참고 저장소 코드를 읽고 확인 · **[추론]** 확인하지 못한 추정
> 조사 에이전트가 결과를 본문으로 넘겼고, 메인 세션이 이 파일로 옮겼다.

## 1. 결론 요약

### 1.1 Q5 답: 된다

**[검증]** Xcode 프로젝트 없이 `swiftc` → 손으로 조립한 `.app` → `simctl install/launch`로 실행하면 **UIScene 수명주기대로 동작한다.**
- 호출 순서: `didFinishLaunching` → `configurationForConnecting` → `scene(_:willConnectTo:)` → `viewDidLoad` → `sceneWillEnterForeground` → `viewDidAppear` → `sceneDidBecomeActive`. 백그라운드와 복귀도 정상이다.
- **필수 Info.plist 키는 사실상 3개다.**
  - `CFBundleExecutable`, `CFBundleIdentifier`: 없으면 설치가 실패한다.
  - `UILaunchScreen`(빈 dict 가능): 없으면 **320×480 레터박스**로 실행된다.
  - 나머지 키는 시뮬레이터에서는 모두 빠져도 실행된다. 그래도 §2.2의 전체 목록을 쓰기를 권한다.
- **iOS 26은 `UIApplicationSceneManifest`가 없어도 scene 수명주기로 실행한다.** 다만 AppDelegate가 `configurationForConnecting`을 구현한 상태에서만 확인했다. TAO 변경 기록도 같은 내용이다([tao/CHANGELOG.md#L9](../../../tao/CHANGELOG.md#L9)).
- **시뮬레이터에서는 서명이 필요 없다.** `codesign`을 생략한 번들도 설치되고 실행된다. 링커가 arm64 바이너리에 ad-hoc 서명을 넣기 때문이다. `codesign -s -`는 해도 무해하다.
- 빌드 시간: 디버그 2.7초, `-Osize` 2.8초(파일 10개, 약 1000줄). 바이너리는 디버그 약 700KB, `-Osize` 약 420KB, strip 후 270KB.
- **Swift 6 언어 모드로 경고 없이 컴파일된다.** 필요한 조건은 둘이다.
  - 플러그인 프로토콜을 `@MainActor`로 둔다.
  - WebKit의 reply·decision 블록 타입을 `@MainActor`로 받는다. SDK의 `WK_SWIFT_UI_ACTOR` 때문이다.
- **이 Mac에는 시뮬레이터 기기가 하나도 없었다.** iOS 26.5 런타임만 있었다. 그래서 `simctl create "iPhone 17 Pro" …iPhone-17-Pro …iOS-26-5`로 새로 만들었다. `akan-native run ios`가 이 경우를 처리해야 한다(§4.8).

### 1.2 핵심 발견 (구현 전에 알아야 할 것)

| # | 발견 | 근거 |
|---|---|---|
| 1 | stop된 `WKURLSchemeTask`에 `didReceive`를 부르면 앱이 죽는다. `-[WKURLSchemeTaskImpl didReceiveResponse:]`에서 NSException → SIGABRT. 진행 중인 task를 집합으로 추적하고 main에서 확인한 뒤 응답하는 방식으로 막힌다 | [검증] 둘 다 재현 |
| 2 | `replyHandler`를 **두 번** 부르면 WebKit NSException으로 앱이 죽는다. **한 번도 안 부르면** JS Promise가 `"WKWebView API client did not respond to this postMessage"`로 reject된다(죽지 않음) | [검증] |
| 3 | plist 타입이 아닌 값(`URL` 등)으로 응답하면 Promise가 `"…unable to be serialized"`로 reject된다(죽지 않음). 반면 `JSONSerialization.data(withJSONObject:)`에 JSON이 아닌 값(**NSDate** 등)을 넣으면 Swift에서 잡을 수 없는 ObjC 예외로 앱이 죽는다. 반드시 `isValidJSONObject`로 먼저 검사한다 | [검증] 크래시 재현 |
| 4 | JS 객체를 그대로 postMessage하면 이렇게 바뀐다. `Date` → NSDate, `Uint8Array` → `{"0":1,…}` dict, `ArrayBuffer` → `{}`, `undefined` 키는 사라짐, `-0` → 0. 불리언은 CFBoolean으로 구분된다. 아키텍처의 **JSON 텍스트 전송 결정이 맞다.** JSON 텍스트 경로도 검증했다: 50건 동시 4ms, 1MB 인자 왕복 7ms | [검증] |
| 5 | `app://localhost`의 상태. `isSecureContext === true`, `crypto.subtle`·`crypto.randomUUID`·`navigator.mediaDevices.getUserMedia`가 있다. `serviceWorker`는 없다. `document.cookie`는 **동작하지 않는다**(항상 빈 문자열). localStorage와 IndexedDB는 재실행·재설치 후에도 남는다 | [검증] |
| 6 | 외부 API로 가는 `fetch`는 `Origin: app://localhost`를 보낸다. 서버 CORS에 이 값을 허용해야 한다(WV-4) | [검증] httpbin |
| 7 | 커스텀 스킴 요청에서도 **POST body가 `request.httpBody`로 전달된다**(10바이트 확인). 데스크톱 WRY IPC(`POST /__akan_native/ipc`)의 전제와 같은 WebKit 동작이다 | [검증] |
| 8 | `env(safe-area-inset-*)`는 CSS에서 잘 동작한다(62/0/34/0px). 하지만 **첫 모듈 스크립트가 도는 시점과 DOMContentLoaded에서는 0**이고, 약 88ms 뒤(첫 프레임들 이후)에 값이 들어온다. JS로 부팅 시점에 읽으면 0이다 | [검증] |
| 9 | 흰 화면 방지(SH-3). `isOpaque=false` + `backgroundColor`로 로딩 중에 설정 색(다크 #16181c)이 보인다. 기본값 `isOpaque=true`는 다크 모드에서도 **흰색**이 보인다. 로딩을 4초 늦추고 화면 중앙 픽셀로 비교했다 | [검증] |
| 10 | **iOS 26.5 시뮬레이터**의 카메라 상태. `UIImagePickerController.isSourceTypeAvailable(.camera) == true`이고 카메라 UI(회색 가짜 미리보기)도 뜬다. 그러나 `AVCaptureDevice.default(for:.video) == nil`이고, `takePicture()`를 불러도 결과가 오지 않았다. Capacitor처럼 `#if targetEnvironment(simulator)`로 "카메라 없음" 처리를 해야 한다 | [검증] |
| 11 | `NSCameraUsageDescription` 없이 `AVCaptureDevice.requestAccess`를 부르면 **TCC가 앱을 즉시 종료**한다(OS_REASON_TCC). PHPicker는 권한도, Info.plist 키도 필요 없다 | [검증] |
| 12 | `evaluateJavaScript`로 부른 `focus()`는 키보드를 띄운다. user gesture로 취급되기 때문이다. 페이지가 스스로(제스처 없이) 부른 `focus()`는 DOM 포커스만 옮기고 키보드는 **띄우지 않는다.** Capacitor는 이것을 private API swizzle로 푼다(쓰지 않는다) | [검증] |
| 13 | `webView.endEditing(true)`는 키보드만 내린다. `document.activeElement`는 INPUT으로 남는다. hide에는 JS `blur()`도 같이 해야 한다 | [검증] |
| 14 | 폼 입력 보조 막대(iOS 26의 ^ v ✓ 떠 있는 막대)는 **WKWebView 하위 클래스에서 `inputAccessoryView`를 nil로 override**하면 사라진다. 공개 API다(wry 방식). 키보드 높이는 403 → 335가 된다 | [검증] |
| 15 | `simctl openurl <custom-scheme>`은 "Open in “App”?" 확인창을 띄운다. 탭 없이는 테스트 채널로 쓸 수 없다. 앱 데이터 컨테이너의 파일로 명령을 넣는 채널이 대안이다(§2.5) | [검증] |
| 16 | `simctl privacy booted grant camera <id>`는 도움말 목록에 없지만 **동작한다.** 권한 프롬프트를 건너뛰는 자동 테스트에 쓸 수 있다 | [검증] |
| 17 | 권한 시스템 알림(카메라 등)이 뜨면 scene이 **inactive**로 바뀐다. app-state hook 사용자가 알아야 한다 | [검증] |
| 18 | `CFBundleDevelopmentRegion=ko`에 .lproj가 없으면, 앱 안의 시스템 UI(카메라 "사진" 버튼, WKError 메시지)가 한국어로 나온다. 시스템 TCC 알림은 기기 언어를 따른다 | [검증] |
| 19 | UA는 `…iPhone OS 18_7 like Mac OS X…`로 **고정**된다(iOS 26인데 18_7). `applicationNameForUserAgent`는 뒤에 붙는다. UA로 OS 버전을 판별하면 안 된다 | [검증] |

### 1.3 항목별 결과

| 과제 | 결과 |
|---|---|
| A1 scene 수명주기 · .app 조립 | [검증] 동작함(§1.1, §2.1, §2.6) |
| A2 스킴 핸들러 | [검증] 정적 파일, MIME, init.js, `/__akan_native/file`, SPA 폴백, `/__akan_native/*` 404, Range 206/416, `../` 이탈 차단, stop된 task 보호 |
| A3 WithReply 브리지 | [검증] 비동기 응답(백그라운드 스레드 → main), 오리진·main frame 검사(iframe 거절), `callAsyncJavaScript` 이벤트 push, 50건 동시 처리 5~7ms |
| A4 페이지 동작 | [검증] secure context, safe area, 다크 모드 실시간 변경(`change` 이벤트), 흰 화면 방지, `isInspectable` 설정, alert·confirm(UIDelegate), 외부 링크 → Safari, `target=_blank` → Safari, 제스처 없는 `window.open` → null, `mailto:` → 시뮬레이터에 Mail이 없어 `open` 결과 false, WebContent 프로세스를 kill하면 자동 reload |
| A5 키보드 | [검증] notification 높이 335(보조 막대 포함 403), duration 0.3833, curve 7. WKWebView가 스스로 `visualViewport.height`를 874 → 539/471로 줄인다 |
| A6 앱 상태 | [검증] active → inactive → background → inactive → active 순서가 JS까지 전달된다 |
| A7 카메라 | [검증] PHPicker 표시(권한 없음), 시뮬레이터 카메라 판정, 처리 파이프라인(방향 보정·JPEG·`/__akan_native/file` → `<img>` 200×400). **[미검증]** 실제 선택·촬영 결과(탭이 필요함) |
| A8 Preferences | [검증] `UserDefaults(suiteName:"akan-native.preferences")` → `Library/Preferences/akan-native.preferences.plist`, 재실행 후 유지 |
| 로그(WV-3) | [검증] `simctl launch --console-pty`(stdout), `--stdout=<홈 아래 경로>`, `log stream --predicate 'subsystem == "com.akanjs"'` 모두 동작. JS console은 init.js에서 가로채 `akanNativeLog` 핸들러로 보낸다 |

## 2. 검증한 프로토타입

### 2.1 빌드 · 설치 · 실행 명령 (그대로 동작 확인)

```sh
# 0) 시뮬레이터 준비 (기기가 없을 때). 런타임·기기 종류 id는 simctl list -j 로 고른다
xcrun simctl list runtimes                     # iOS 26.5 (26.5 - 23F77) - com.apple.CoreSimulator.SimRuntime.iOS-26-5
UDID=$(xcrun simctl create "iPhone 17 Pro" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro com.apple.CoreSimulator.SimRuntime.iOS-26-5)
xcrun simctl bootstatus "$UDID" -b             # 부팅하고 끝날 때까지 기다림 (첫 부팅 약 23초, 데이터 마이그레이션 포함)

# 1) 컴파일 (-framework 불필요: Swift 모듈 import 가 자동 링크한다. otool -L 로 확인)
SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
APP=build/AkanNativeProto.app; mkdir -p "$APP"
xcrun -sdk iphonesimulator swiftc \
  -target arm64-apple-ios26.0-simulator -sdk "$SDK" \
  -swift-version 6 -parse-as-library -module-name AkanNativeShell \
  -Onone -g \                      # release: -Osize (또는 -O) [-whole-module-optimization]
  Sources/*.swift Sources/plugins/*.swift \
  -o "$APP/AkanNativeShell"              # CFBundleExecutable 과 같은 이름

# 2) 조립 (평평한 iOS 번들: 실행 파일·Info.plist 가 .app 바로 아래)
cp Info.plist "$APP/Info.plist"    # XML plist 그대로 된다 (binary 변환 불필요). plutil -lint 로 검사
cp -R web "$APP/app"               # index.html + public/ …
cp akan-native.json "$APP/akan-native.json"      # 셸 설정(env, 배경색, dev). akan-native 에서는 env.runtime.json 등
codesign --force --sign - --timestamp=none "$APP"   # 시뮬레이터는 생략해도 실행됨

# 3) 설치 · 실행 · 로그
xcrun simctl install booted "$APP"
xcrun simctl launch --console-pty --terminate-running-process booted com.akanjs.proto   # stdout/stderr 를 터미널로 (Ctrl-C 로 분리)
#   또는 --stdout=<홈 아래 경로> --stderr=… (이 환경의 /private/tmp 경로에는 파일이 생기지 않았다. 홈 아래 경로는 됨)
xcrun simctl spawn booted log stream --level info --style compact --predicate 'subsystem == "com.akanjs"'
xcrun simctl io booted screenshot shot.png
xcrun simctl get_app_container booted com.akanjs.proto data     # 앱 데이터 컨테이너 (호스트 경로)
xcrun simctl terminate booted com.akanjs.proto
```

- `-parse-as-library`와 `@main` AppDelegate를 쓰면 `main.swift`가 필요 없다.
- `-module-name`은 Swift 클래스의 ObjC 이름 앞부분이 된다(`AkanNativeShell.AkanNativeSceneDelegate`). scene delegate를 **코드로** 지정하면 plist에 클래스 이름 문자열을 쓸 필요가 없다.
- 번들에 Swift 런타임을 넣을 필요가 없다. OS의 `/usr/lib/swift`를 쓴다(`otool -L`로 확인). Dioxus가 `swift-stdlib-tool`을 쓰는 것은 Swift Package 동적 라이브러리를 넣을 때만이다.
- 도움이 되는 simctl 명령:
  - `simctl ui booted appearance dark|light`: 다크 모드 전환. 앱 실행 중에도 `prefers-color-scheme` change 이벤트가 온다.
  - `simctl privacy booted grant|reset camera|photos <id>`
  - `simctl addmedia booted x.jpg`
  - 다른 앱을 `simctl launch`: 우리 앱이 background로 간다. 우리 앱을 다시 `launch`: foreground(재시작 아님).

### 2.2 Info.plist

권장 전체 목록(프로토타입이 쓴 것):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>ko</string>          <!-- 앱 안 시스템 UI 언어에 영향 (§1.2 #18) -->
  <key>CFBundleExecutable</key><string>AkanNativeShell</string>          <!-- 필수 -->
  <key>CFBundleIdentifier</key><string>com.akanjs.proto</string>     <!-- 필수 -->
  <key>CFBundleName</key><string>AkanNativeProto</string>
  <key>CFBundleDisplayName</key><string>AkanNative Proto</string>        <!-- 홈 화면 이름 -->
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>  <!-- 실기기: iPhoneOS -->
  <key>DTPlatformName</key><string>iphonesimulator</string>                            <!-- 실기기: iphoneos -->
  <key>MinimumOSVersion</key><string>26.0</string>
  <key>LSRequiresIPhoneOS</key><true/>
  <key>UIDeviceFamily</key><array><integer>1</integer><integer>2</integer></array>
  <key>UILaunchScreen</key><dict/>                                   <!-- 사실상 필수: 없으면 320x480 레터박스 -->
  <key>UIApplicationSceneManifest</key>
  <dict><key>UIApplicationSupportsMultipleScenes</key><false/></dict> <!-- delegate 는 코드로 지정 -->
  <key>UISupportedInterfaceOrientations</key>
  <array><string>UIInterfaceOrientationPortrait</string><string>UIInterfaceOrientationLandscapeLeft</string><string>UIInterfaceOrientationLandscapeRight</string></array>
  <key>UISupportedInterfaceOrientations~ipad</key>
  <array><string>UIInterfaceOrientationPortrait</string><string>UIInterfaceOrientationPortraitUpsideDown</string><string>UIInterfaceOrientationLandscapeLeft</string><string>UIInterfaceOrientationLandscapeRight</string></array>
  <key>UIViewControllerBasedStatusBarAppearance</key><true/>
  <key>NSCameraUsageDescription</key><string>사진 촬영에 카메라를 사용합니다</string>   <!-- camera 플러그인 manifest 에서 병합 -->
  <key>CFBundleURLTypes</key>                                          <!-- 프로토타입 테스트용 (딥링크는 이후 SH-6) -->
  <array><dict><key>CFBundleURLName</key><string>com.akanjs.proto</string>
    <key>CFBundleURLSchemes</key><array><string>akanproto</string></array></dict></array>
</dict>
</plist>
```

변형 실험(`variant.sh`: 같은 바이너리로 plist 키만 빼고 uninstall → install → launch):

| 변형 | 결과 [검증] |
|---|---|
| 전체 + `codesign -s -` | 정상. bounds 402×874, safeArea 62/34 |
| 전체, 서명 없음(`_CodeSignature` 삭제) | 정상 |
| `UILaunchScreen` 없음 | 실행되지만 **bounds 320×480**(레터박스, 스크린샷으로 확인) |
| `UIApplicationSceneManifest` 없음 | 정상. `configurationForConnecting`과 `willConnectTo`가 불린다 = scene 수명주기. UIKit 경고 로그 없음 |
| **최소**: `CFBundleExecutable` + `CFBundleIdentifier` + `UILaunchScreen`만, 서명 없음 | 정상(scene, 전체 화면, 테스트 통과) |
| 최소 − `CFBundleExecutable` | install 실패: `IXUserPresentableErrorDomain code=1 … has missing or invalid CF…`(메시지가 잘림. CFBundleExecutable로 추정) |
| 최소 − `CFBundleIdentifier` | install 실패: `IXErrorDomain code=13 Missing bundle ID` |
| 최소(`NSCameraUsageDescription` 없음) + `requestAccess` | **앱 강제 종료**: `OS_REASON_TCC … must contain an NSCameraUsageDescription` |

- `UISceneConfiguration(name: "Default", …)`처럼 이름을 주면 UIKit이 `Info.plist contained no UIScene configuration dictionary (looking for configuration named "Default")` 오류를 로그에 남긴다. **`name: nil`**을 쓴다.
- 아이콘이 없으면 홈 화면에 빈 아이콘이 나온다(CLI-8에서 처리).

### 2.3 Swift 소스 (production 형태)

- 아래는 프로토타입 `Sources/`에서 `#if AKAN_NATIVE_TESTS` 블록을 기계적으로 뺀 `prod-src/`다.
- 이 파일들만으로 `-swift-version 6 -Osize` 컴파일이 경고 없이 되고, 시뮬레이터에서 실행된다(스크린샷 `shots/18-prod.png`).
- 테스트 빌드는 `-D AKAN_NATIVE_TESTS`로 개발용 플러그인과 명령 채널을 더한다.
- 브리지는 객체 body와 **JSON 텍스트 body를 모두** 받는다. 아키텍처 §4는 JSON 텍스트로 정했으니 객체 경로는 지워도 된다.

#### AkanNativeApp.swift — 진입점 · scene
```swift
import UIKit

// 앱 진입점. -parse-as-library 로 컴파일하므로 @main 이 main 심볼을 만든다.
@main
final class AkanNativeAppDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication,
                   didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    AkanNativeLog.info("app didFinishLaunching args=\(ProcessInfo.processInfo.arguments.dropFirst())")
    AkanNativeFileRegistry.shared.resetSessionDirectory()
    return true
  }

  // Info.plist 의 UISceneConfigurations 대신 코드로 scene delegate 를 준다 (클래스 이름 문자열 불필요).
  // iOS 26 은 UIApplicationSceneManifest 가 없어도 scene 수명주기로 실행한다(검증). 그래도 명시해 둔다.
  // name: nil — 이름을 주면 plist 에서 같은 이름의 설정을 찾다가 오류 로그를 남긴다.
  func application(_ application: UIApplication,
                   configurationForConnecting connectingSceneSession: UISceneSession,
                   options: UIScene.ConnectionOptions) -> UISceneConfiguration {
    AkanNativeLog.info("app configurationForConnecting role=\(connectingSceneSession.role.rawValue)")
    let config = UISceneConfiguration(name: nil, sessionRole: connectingSceneSession.role)
    config.delegateClass = AkanNativeSceneDelegate.self
    return config
  }
}

final class AkanNativeSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
             options connectionOptions: UIScene.ConnectionOptions) {
    AkanNativeLog.info("scene willConnectTo urls=\(connectionOptions.urlContexts.map(\.url))")
    guard let windowScene = scene as? UIWindowScene else { return }
    let window = UIWindow(windowScene: windowScene)
    let vc = AkanNativeViewController(config: AkanNativeAppConfig.load())
    window.rootViewController = vc
    window.backgroundColor = vc.config.backgroundColor
    window.makeKeyAndVisible()
    self.window = window
  }

  func sceneDidBecomeActive(_ scene: UIScene) { AkanNativeLog.info("scene didBecomeActive") }
  func sceneWillResignActive(_ scene: UIScene) { AkanNativeLog.info("scene willResignActive") }
  func sceneWillEnterForeground(_ scene: UIScene) { AkanNativeLog.info("scene willEnterForeground") }
  func sceneDidEnterBackground(_ scene: UIScene) { AkanNativeLog.info("scene didEnterBackground") }
  func sceneDidDisconnect(_ scene: UIScene) { AkanNativeLog.info("scene didDisconnect") }

  // 딥링크 (앱 실행 중). simctl openurl 은 "Open in …?" 확인창을 띄우므로 자동 테스트 채널로는 못 쓴다.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
  }
}
```

#### AkanNativeSupport.swift — 로그 · 설정 · 파일 등록부
```swift
import UIKit
import os

enum AkanNativeLog {
  static let logger = Logger(subsystem: "com.akanjs", category: "shell")
  // stdout 은 `simctl launch --console-pty` / `--stdout=` 로, os_log 는 `log stream` 으로 본다.
  static func info(_ s: String) {
    print("[akan-native] \(s)")
    fflush(stdout)
    logger.info("\(s, privacy: .public)")
  }
  static func js(_ level: String, _ s: String) {
    print("[js:\(level)] \(s)")
    fflush(stdout)
    logger.info("[js:\(level, privacy: .public)] \(s, privacy: .public)")
  }
}

// 빌드가 생성하는 설정 (env.runtime.json + akan-native.json). 프로토타입은 번들의 akan-native.json 하나로 둔다.
struct AkanNativeAppConfig {
  var backgroundColor: UIColor
  var env: [String: Any]
  var dev: Bool
  var appVersion: String
  var hideFormAccessoryBar: Bool

  static func load() -> AkanNativeAppConfig {
    var bg = UIColor.systemBackground
    var env: [String: Any] = [:]
    var dev = false
    var hideBar = false
    if let url = Bundle.main.url(forResource: "akan-native", withExtension: "json"),
       let data = try? Data(contentsOf: url),
       let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      // backgroundColor: { light: "#rrggbb", dark: "#rrggbb" } → 다크 모드를 따라가는 동적 색
      if let c = obj["backgroundColor"] as? [String: String],
         let light = UIColor(hex: c["light"] ?? ""), let dark = UIColor(hex: c["dark"] ?? "") {
        bg = UIColor { $0.userInterfaceStyle == .dark ? dark : light }
      }
      env = obj["env"] as? [String: Any] ?? [:]
      dev = obj["dev"] as? Bool ?? false
      hideBar = obj["hideFormAccessoryBar"] as? Bool ?? false
    }
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    return AkanNativeAppConfig(backgroundColor: bg, env: env, dev: dev, appVersion: version, hideFormAccessoryBar: hideBar)
  }
}

extension UIColor {
  convenience init?(hex: String) {
    var s = hex.trimmingCharacters(in: .whitespaces)
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
    self.init(red: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255,
              blue: CGFloat(v & 0xff) / 255, alpha: 1)
  }
}

// /__akan_native/file/<id> 로 노출하는 세션 임시 파일 (PL-7). 앱 세션 동안만 유효.
final class AkanNativeFileRegistry: @unchecked Sendable {
  static let shared = AkanNativeFileRegistry()
  private let lock = NSLock()
  private var files: [String: (url: URL, mime: String)] = [:]

  let directory = FileManager.default.temporaryDirectory.appendingPathComponent("akan-native-files", isDirectory: true)

  func resetSessionDirectory() {
    try? FileManager.default.removeItem(at: directory)
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  }

  /// 파일을 등록하고 JS 가 쓸 경로("/__akan_native/file/<id>")를 돌려준다.
  func register(_ url: URL, mime: String) -> String {
    let id = UUID().uuidString.lowercased()
    lock.lock(); files[id] = (url, mime); lock.unlock()
    return "/__akan_native/file/\(id)"
  }

  func lookup(_ id: String) -> (url: URL, mime: String)? {
    lock.lock(); defer { lock.unlock() }
    return files[id]
  }
}
```

#### AkanNativeViewController.swift — WKWebView 구성 · 내비게이션 · UI delegate · init.js
```swift
import UIKit
import WebKit

/// 폼 입력 보조 막대(이전/다음/완료) 제거: 공개 API 인 inputAccessoryView 를 override (wry 방식)
final class AkanNativeWebView: WKWebView {
  var hidesFormAccessoryBar = false
  override var inputAccessoryView: UIView? { hidesFormAccessoryBar ? nil : super.inputAccessoryView }
}

final class AkanNativeViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
  let config: AkanNativeAppConfig
  private(set) var webView: WKWebView!
  let bridge = AkanNativeBridge()
  private(set) var schemeHandler: AkanNativeSchemeHandler!
  static let origin = URL(string: "app://localhost/")!

  init(config: AkanNativeAppConfig) {
    self.config = config
    super.init(nibName: nil, bundle: nil)
  }
  required init?(coder: NSCoder) { fatalError() }

  override func loadView() {
    let appRoot = Bundle.main.bundleURL.appendingPathComponent("app", isDirectory: true)
    schemeHandler = AkanNativeSchemeHandler(root: appRoot) { [weak self] in self?.makeInitScript() ?? Data() }

    let wk = WKWebViewConfiguration()
    wk.setURLSchemeHandler(schemeHandler, forURLScheme: "app")
    wk.allowsInlineMediaPlayback = true
    wk.mediaTypesRequiringUserActionForPlayback = []
    wk.applicationNameForUserAgent = "akan-native/0.1"
    wk.dataDetectorTypes = []
    wk.preferences.isElementFullscreenEnabled = true
    let proxy = WeakScriptHandler(bridge)
    wk.userContentController.addScriptMessageHandler(proxy, contentWorld: .page, name: "akanNative")
    if config.dev { wk.userContentController.add(proxy, name: "akanNativeLog") }

    let wv = AkanNativeWebView(frame: .zero, configuration: wk)
    wv.hidesFormAccessoryBar = config.hideFormAccessoryBar
    // SH-3: 흰 화면 방지. isOpaque=false 여야 첫 페인트 전 backgroundColor 가 보인다.
    wv.isOpaque = false
    wv.backgroundColor = config.backgroundColor
    wv.scrollView.backgroundColor = config.backgroundColor
    wv.underPageBackgroundColor = config.backgroundColor
    // SH-2: 페이지가 env(safe-area-inset-*) 로 직접 처리한다.
    wv.scrollView.contentInsetAdjustmentBehavior = .never
    wv.allowsLinkPreview = false
    wv.isInspectable = config.dev
    wv.navigationDelegate = self
    wv.uiDelegate = self
    webView = wv
    bridge.webView = wv
    bridge.viewController = self
    bridge.register(AkanNativeGeneratedPlugins.all)

    let root = UIView()
    root.backgroundColor = config.backgroundColor
    wv.translatesAutoresizingMaskIntoConstraints = false
    root.addSubview(wv)
    NSLayoutConstraint.activate([
      wv.leadingAnchor.constraint(equalTo: root.leadingAnchor),
      wv.trailingAnchor.constraint(equalTo: root.trailingAnchor),
      wv.topAnchor.constraint(equalTo: root.topAnchor),
      wv.bottomAnchor.constraint(equalTo: root.bottomAnchor),
    ])
    view = root
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    AkanNativeLog.info("vc viewDidLoad inspectable=\(webView.isInspectable)")
    webView.load(URLRequest(url: Self.origin))
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    AkanNativeLog.info("vc viewDidAppear safeArea=\(view.safeAreaInsets) bounds=\(view.bounds) scale=\(view.window?.screen.scale ?? 0)")
  }

  // /__akan_native/init.js
  func makeInitScript() -> Data {
    let payload: [String: Any] = [
      "v": 1, "platform": "ios", "runtimeVersion": "0.1.0", "dev": config.dev,
      "env": config.env, "plugins": bridge.pluginManifest,
    ]
    let json = (try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys, .withoutEscapingSlashes]))
      .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    var js = "window.__AKAN_NATIVE__=Object.assign(window.__AKAN_NATIVE__||{},\(json));\n"
    if config.dev { js += Self.consoleForwarder }
    return Data(js.utf8)
  }

  static let consoleForwarder = """
  (function(){var h=window.webkit&&webkit.messageHandlers&&webkit.messageHandlers.akanNativeLog;if(!h)return;
  function s(x){if(typeof x==='string')return x;if(x instanceof Error)return x.stack||String(x);try{return JSON.stringify(x)}catch(e){return String(x)}}
  ['log','info','warn','error','debug'].forEach(function(l){var o=console[l];console[l]=function(){try{h.postMessage({l:l,a:Array.prototype.map.call(arguments,s)})}catch(e){}return o.apply(console,arguments)}});
  addEventListener('error',function(e){h.postMessage({l:'error',a:['uncaught '+e.message+' @'+e.filename+':'+e.lineno]})});
  addEventListener('unhandledrejection',function(e){h.postMessage({l:'error',a:['unhandledrejection '+s(e.reason)]})});})();

  """

  // ───────── WKNavigationDelegate ─────────
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
               decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
    guard let url = action.request.url else { return decisionHandler(.cancel) }
    let isTop = action.targetFrame?.isMainFrame ?? true   // targetFrame nil = 새 창 (target=_blank, window.open)
    AkanNativeLog.info("nav policy \(url.absoluteString) top=\(isTop) type=\(action.navigationType.rawValue) newWindow=\(action.targetFrame == nil)")
    if url.scheme == "app" && url.host == "localhost" { return decisionHandler(.allow) }
    if !isTop { return decisionHandler(.allow) }          // iframe 은 허용 (브리지는 오리진 검사로 막힘)
    // SH-4: 앱 오리진 밖 → 시스템에 넘긴다 (https, mailto, tel ...)
    decisionHandler(.cancel)
    UIApplication.shared.open(url) { ok in AkanNativeLog.info("open external \(url.absoluteString) ok=\(ok)") }
  }

  func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    AkanNativeLog.info("nav didStartProvisional \(webView.url?.absoluteString ?? "")")
    bridge.resetListeners()
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    AkanNativeLog.info("nav didFinish \(webView.url?.absoluteString ?? "")")
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error) {
    AkanNativeLog.info("nav didFailProvisional \(error)")
  }
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    AkanNativeLog.info("web content process terminated → reload")
    webView.reload()
  }

  // ───────── WKUIDelegate ─────────
  // target=_blank / window.open: decidePolicyFor 에서 이미 cancel 하므로 보통 여기까지 오지 않는다.
  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
               for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if let url = action.request.url { UIApplication.shared.open(url) }
    return nil
  }

  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
               initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor () -> Void) {
    AkanNativeLog.info("alert: \(message)")
    let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
    a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
    present(a, animated: true)
  }

  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
               initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor (Bool) -> Void) {
    AkanNativeLog.info("confirm: \(message)")
    let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
    a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
    a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
    present(a, animated: true)
  }

  func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
               initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor (String?) -> Void) {
    let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
    a.addTextField { $0.text = defaultText }
    a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
    a.addAction(UIAlertAction(title: "OK", style: .default) { [weak a] _ in completionHandler(a?.textFields?.first?.text) })
    present(a, animated: true)
  }

  // getUserMedia: 앱 오리진이면 WebKit 의 2차 프롬프트 없이 허용 (OS 카메라 권한은 별도로 필요)
  func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
               initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
               decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void) {
    AkanNativeLog.info("media capture permission \(origin.protocol)://\(origin.host) type=\(type.rawValue)")
    decisionHandler(origin.protocol == "app" && origin.host == "localhost" ? .grant : .deny)
  }
}
```

#### AkanNativeSchemeHandler.swift — `app://localhost`
```swift
import UIKit
import WebKit
import UniformTypeIdentifiers

// app://localhost/* 서빙 (아키텍처 §5).
// - WKURLSchemeHandler 메서드는 main 스레드에서 불린다 (WK_SWIFT_UI_ACTOR).
// - stop 된 task 에 didReceive*/didFinish 를 부르면 ObjC 예외로 앱이 죽는다.
//   → 진행 중 task 를 Set 으로 들고, 응답은 항상 main 에서 "아직 살아 있는지" 확인한 뒤 보낸다.
//     stop 도 main 에서 오므로 확인과 응답 사이에 경쟁이 없다.
final class AkanNativeSchemeHandler: NSObject, WKURLSchemeHandler {
  let root: URL                               // <bundle>/app
  let initScript: @MainActor () -> Data       // /__akan_native/init.js 내용
  private var active = Set<ObjectIdentifier>()

  init(root: URL, initScript: @escaping @MainActor () -> Data) {
    self.root = root.standardizedFileURL
    self.initScript = initScript
  }

  func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
    let key = ObjectIdentifier(task)
    active.insert(key)
    let req = task.request
    let url = req.url!
    let path = url.path.isEmpty ? "/" : url.path       // URL.path 는 퍼센트 디코딩된 값
    let h = req.allHTTPHeaderFields ?? [:]
    AkanNativeLog.info("scheme \(req.httpMethod ?? "?") \(url.absoluteString) accept=\(h["Accept"] ?? "-") range=\(h["Range"] ?? "-") body=\(req.httpBody?.count ?? -1) mainDoc=\(req.mainDocumentURL?.absoluteString ?? "-")")

    // 1) /__akan_native/*
    if path == "/__akan_native/init.js" {
      respond(task, key, url: url, status: 200, mime: "text/javascript; charset=utf-8",
              body: initScript(), extra: ["Cache-Control": "no-store"])
      return
    }
    if path.hasPrefix("/__akan_native/file/") {
      let id = String(path.dropFirst("/__akan_native/file/".count))
      guard let f = AkanNativeFileRegistry.shared.lookup(id) else {
        return respond(task, key, url: url, status: 404, mime: "text/plain", body: Data("not found".utf8))
      }
      return serveFile(task, key, url: url, file: f.url, mime: f.mime, range: h["Range"])
    }
    if path.hasPrefix("/__akan_native/") {
      return respond(task, key, url: url, status: 404, mime: "text/plain", body: Data("not found".utf8))
    }
    // 2) 앱 폴더의 파일. 경로 이탈(../)을 막는다.
    let candidate = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
    var isDir: ObjCBool = false
    if candidate.path.hasPrefix(root.path + "/"),
       FileManager.default.fileExists(atPath: candidate.path, isDirectory: &isDir), !isDir.boolValue {
      return serveFile(task, key, url: url, file: candidate, mime: Self.mime(for: candidate), range: h["Range"])
    }

    // 3) SPA 폴백 → index.html. 확장자가 있는 경로(없는 에셋)는 404 로 둔다.
    //    단, HTML 을 원하는 요청(문서 이동: Accept 에 text/html)은 /u/john.doe 같은 경로라도 폴백한다.
    let wantsHTML = (h["Accept"] ?? "").contains("text/html")
    if !(path as NSString).pathExtension.isEmpty && !wantsHTML {
      return respond(task, key, url: url, status: 404, mime: "text/plain", body: Data("not found".utf8))
    }
    let index = root.appendingPathComponent("index.html")
    serveFile(task, key, url: url, file: index, mime: "text/html; charset=utf-8", range: nil)
  }

  func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {
    AkanNativeLog.info("scheme stop \(task.request.url?.absoluteString ?? "")")
    active.remove(ObjectIdentifier(task))
  }

  // 파일 읽기는 백그라운드, 응답은 main (살아 있는 task 인지 확인 후).
  private func serveFile(_ task: any WKURLSchemeTask, _ key: ObjectIdentifier, url: URL,
                         file: URL, mime: String, range: String?) {
    let box = TaskBox(task)
    DispatchQueue.global(qos: .userInitiated).async {
      let result: (Int, Data, [String: String])
      do {
        let data = try Data(contentsOf: file, options: .mappedIfSafe)
        if let range, let r = Self.parseRange(range, total: data.count) {
          let slice = data.subdata(in: r)
          result = (206, slice, ["Content-Range": "bytes \(r.lowerBound)-\(r.upperBound - 1)/\(data.count)",
                                 "Accept-Ranges": "bytes"])
        } else if range != nil {
          result = (416, Data(), ["Content-Range": "bytes */\(data.count)"])
        } else {
          result = (200, data, ["Accept-Ranges": "bytes"])
        }
      } catch {
        result = (404, Data("not found".utf8), [:])
      }
      DispatchQueue.main.async {
        MainActor.assumeIsolated {
          self.respond(box.task, key, url: url, status: result.0, mime: mime, body: result.1,
                       extra: result.2.merging(["Cache-Control": "no-cache"]) { a, _ in a })
        }
      }
    }
  }

  private func respond(_ task: any WKURLSchemeTask, _ key: ObjectIdentifier, url: URL, status: Int,
                       mime: String, body: Data, extra: [String: String] = [:]) {
    guard active.contains(key) else {
      AkanNativeLog.info("scheme skip stopped task \(url.absoluteString)")
      return
    }
    active.remove(key)
    var headers = extra
    headers["Content-Type"] = mime
    headers["Content-Length"] = String(body.count)
    let resp = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
    task.didReceive(resp)
    task.didReceive(body)
    task.didFinish()
  }

  nonisolated static func parseRange(_ header: String, total: Int) -> Range<Int>? {
    // "bytes=start-end" | "bytes=start-" | "bytes=-suffix" (단일 범위만)
    guard header.hasPrefix("bytes="), total > 0 else { return nil }
    let spec = header.dropFirst(6)
    guard !spec.contains(","), let dash = spec.firstIndex(of: "-") else { return nil }
    let a = spec[..<dash], b = spec[spec.index(after: dash)...]
    if a.isEmpty {
      guard let n = Int(b), n > 0 else { return nil }
      return max(0, total - n)..<total
    }
    guard let s = Int(a), s < total else { return nil }
    let e = b.isEmpty ? total - 1 : min(Int(b) ?? (total - 1), total - 1)
    guard e >= s else { return nil }
    return s..<(e + 1)
  }

  // 확장자 표. 표에 없으면 UTType 으로 찾는다.
  nonisolated static let mimeTable: [String: String] = [
    "html": "text/html; charset=utf-8", "htm": "text/html; charset=utf-8",
    "js": "text/javascript; charset=utf-8", "mjs": "text/javascript; charset=utf-8",
    "css": "text/css; charset=utf-8", "json": "application/json", "map": "application/json",
    "txt": "text/plain; charset=utf-8", "xml": "application/xml", "svg": "image/svg+xml",
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif",
    "webp": "image/webp", "avif": "image/avif", "ico": "image/x-icon", "heic": "image/heic",
    "wasm": "application/wasm", "woff": "font/woff", "woff2": "font/woff2", "ttf": "font/ttf", "otf": "font/otf",
    "mp4": "video/mp4", "m4v": "video/mp4", "webm": "video/webm", "mov": "video/quicktime",
    "mp3": "audio/mpeg", "m4a": "audio/mp4", "wav": "audio/wav", "ogg": "audio/ogg", "pdf": "application/pdf",
  ]
  nonisolated static func mime(for file: URL) -> String {
    let ext = file.pathExtension.lowercased()
    if let m = mimeTable[ext] { return m }
    return UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
  }
}

// WKURLSchemeTask 는 Sendable 이 아니다. main 으로 돌아와서만 쓰므로 unchecked 로 감싼다.
private final class TaskBox: @unchecked Sendable {
  let task: any WKURLSchemeTask
  init(_ t: any WKURLSchemeTask) { task = t }
}
```

#### AkanNativeBridge.swift — 플러그인 규격 · WithReply 브리지 · 이벤트 push
```swift
import UIKit
import WebKit

// ───────── 플러그인 규격 (iOS) ─────────
public enum AkanNativeErrorCode: String, Sendable {
  case UNSUPPORTED, PERMISSION_DENIED, CANCELLED, INVALID_ARGS, NOT_FOUND, INTERNAL
}

@MainActor
public protocol AkanNativePlugin: AnyObject {
  static var id: String { get }
  static var methods: [String] { get }          // init.js 의 plugins 목록과 NOT_FOUND 판정에 쓴다
  init(context: AkanNativePluginContext)
  func call(_ method: String, _ args: [String: Any], _ call: AkanNativeCall)
  func listenersChanged(event: String, count: Int)   // $listen/$unlisten 으로 구독 수가 바뀔 때
}
public extension AkanNativePlugin {
  func listenersChanged(event: String, count: Int) {}
}

@MainActor
public final class AkanNativePluginContext {
  public let pluginId: String
  weak var bridge: AkanNativeBridge?
  init(pluginId: String, bridge: AkanNativeBridge) { self.pluginId = pluginId; self.bridge = bridge }

  public var viewController: UIViewController? { bridge?.viewController }
  public var webView: WKWebView? { bridge?.webView }
  public var windowScene: UIWindowScene? { bridge?.webView?.window?.windowScene }
  /// 이벤트 push. 구독자가 없으면 보내지 않는다.
  public func emit(_ event: String, _ data: Any? = nil) { bridge?.emit(plugin: pluginId, event: event, data: data) }
  public func hasListeners(_ event: String) -> Bool { (bridge?.listenerCount(pluginId, event) ?? 0) > 0 }
  /// 파일을 /__akan_native/file/<id> 로 노출한다.
  public func registerFile(_ url: URL, mime: String) -> String { AkanNativeFileRegistry.shared.register(url, mime: mime) }
}

/// 요청 1건. resolve/reject 는 아무 스레드에서 불러도 된다 (main 으로 넘겨 reply).
/// 정확히 한 번만 응답한다. 두 번째 호출은 무시한다.
public final class AkanNativeCall: @unchecked Sendable {
  public let id: Int
  public let plugin: String
  public let method: String
  private let lock = NSLock()
  private var reply: (@MainActor (Any?, String?) -> Void)?

  init(id: Int, plugin: String, method: String, reply: @escaping @MainActor (Any?, String?) -> Void) {
    self.id = id; self.plugin = plugin; self.method = method; self.reply = reply
  }

  public func resolve(_ result: Any? = nil) {
    var r: [String: Any] = ["v": 1, "id": id, "ok": true]
    if let result { r["result"] = result }
    send(r)
  }
  public func reject(_ code: AkanNativeErrorCode, _ message: String) {
    send(["v": 1, "id": id, "ok": false, "error": ["code": code.rawValue, "message": message]])
  }

  // 플러그인이 응답하지 않고 call 을 놓아도 JS Promise 가 영원히 걸려 있지 않게 한다.
  deinit {
    guard let r = reply else { return }
    let box = UncheckedBox(r)
    let response: [String: Any] = ["v": 1, "id": id, "ok": false,
                                   "error": ["code": "INTERNAL", "message": "\(plugin).\(method) dropped without reply"]]
    let rbox = UncheckedBox(response)
    DispatchQueue.main.async { MainActor.assumeIsolated { box.value(rbox.value, nil) } }
  }

  private func send(_ response: [String: Any]) {
    lock.lock(); let r = reply; reply = nil; lock.unlock()
    guard let r else { AkanNativeLog.info("call \(plugin).\(method)#\(id) already settled; ignoring"); return }
    let box = UncheckedBox(response)
    if Thread.isMainThread {
      MainActor.assumeIsolated { r(box.value, nil) }
    } else {
      DispatchQueue.main.async { MainActor.assumeIsolated { r(box.value, nil) } }
    }
  }
}

final class UncheckedBox<T>: @unchecked Sendable { let value: T; init(_ v: T) { value = v } }

// ───────── 브리지 ─────────
@MainActor
final class AkanNativeBridge: NSObject, WKScriptMessageHandlerWithReply, WKScriptMessageHandler {
  weak var webView: WKWebView?
  weak var viewController: UIViewController?
  private(set) var plugins: [String: AkanNativePlugin] = [:]
  private var listeners: [String: Int] = [:]   // "plugin\u{0}event" → count
  var allowSubframes = false

  func register(_ types: [AkanNativePlugin.Type]) {
    for t in types { plugins[t.id] = t.init(context: AkanNativePluginContext(pluginId: t.id, bridge: self)) }
  }

  /// init.js 에 넣을 { id: [methods] }
  var pluginManifest: [String: [String]] {
    plugins.mapValues { type(of: $0).methods }
  }

  func listenerCount(_ plugin: String, _ event: String) -> Int { listeners["\(plugin)\u{0}\(event)"] ?? 0 }

  // JS: await webkit.messageHandlers.akanNative.postMessage(req)  → Promise<Response>
  func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage,
                             replyHandler: @escaping @MainActor (Any?, String?) -> Void) {
    let origin = message.frameInfo.securityOrigin
    let fromApp = origin.protocol == "app" && origin.host == "localhost" && origin.port == 0
    if !(fromApp && message.frameInfo.isMainFrame) { AkanNativeLog.info("bridge msg REJECT origin=\(origin.protocol)://\(origin.host):\(origin.port) mainFrame=\(message.frameInfo.isMainFrame) world=\(message.world.name ?? "page") bodyType=\(type(of: message.body))") }
    // SEC-1: 앱 오리진 + (기본) main frame 만
    guard fromApp, message.frameInfo.isMainFrame || allowSubframes else {
      replyHandler(nil, "akan-native: forbidden origin")
      return
    }
    // JSON 텍스트 전송 (architecture §4): postMessage(JSON.stringify(req)) → 응답도 JSON 문자열
    if let text = message.body as? String, text.hasPrefix("{") {
      guard let data = text.data(using: .utf8),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        return replyHandler("{\"v\":1,\"id\":-1,\"ok\":false,\"error\":{\"code\":\"INVALID_ARGS\",\"message\":\"bad json\"}}", nil)
      }
      handle(obj, replyHandler: { value, err in
        guard let value, JSONSerialization.isValidJSONObject(value),
              let out = try? JSONSerialization.data(withJSONObject: value, options: [.withoutEscapingSlashes]) else {
          // plist 는 되지만 JSON 이 아닌 값(Date 등)이 결과에 들어온 경우: 죽지 않고 INTERNAL 로 바꾼다
          return replyHandler("{\"v\":1,\"id\":\((obj["id"] as? NSNumber)?.intValue ?? -1),\"ok\":false,\"error\":{\"code\":\"INTERNAL\",\"message\":\"result is not JSON\"}}", err)
        }
        replyHandler(String(decoding: out, as: UTF8.self), err)
      })
      return
    }
    handle(message.body, replyHandler: replyHandler)
  }

  private func handle(_ rawBody: Any, replyHandler: @escaping @MainActor (Any?, String?) -> Void) {
    // SEC-3: 형식 검증
    guard let body = rawBody as? [String: Any],
          (body["v"] as? NSNumber)?.intValue == 1,
          let id = (body["id"] as? NSNumber)?.intValue,
          let plugin = body["plugin"] as? String,
          let method = body["method"] as? String else {
      replyHandler(["v": 1, "id": -1, "ok": false,
                    "error": ["code": "INVALID_ARGS", "message": "malformed request"]], nil)
      return
    }
    let call = AkanNativeCall(id: id, plugin: plugin, method: method, reply: replyHandler)
    let args = body["args"] as? [String: Any] ?? [:]
    guard let p = plugins[plugin] else { return call.reject(.NOT_FOUND, "plugin '\(plugin)' not registered") }

    switch method {
    case "$listen", "$unlisten":
      guard let event = args["event"] as? String else { return call.reject(.INVALID_ARGS, "event required") }
      let k = "\(plugin)\u{0}\(event)"
      let n = max(0, (listeners[k] ?? 0) + (method == "$listen" ? 1 : -1))
      listeners[k] = n
      p.listenersChanged(event: event, count: n)
      call.resolve(["count": n])
    default:
      guard type(of: p).methods.contains(method) else {
        return call.reject(.NOT_FOUND, "method '\(plugin).\(method)' not found")
      }
      p.call(method, args, call)
    }
  }

  // akanNativeLog: console 포워딩 (응답 없는 핸들러)
  func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let b = message.body as? [String: Any] else { return }
    let level = b["l"] as? String ?? "log"
    let parts = (b["a"] as? [Any] ?? []).map { "\($0)" }
    AkanNativeLog.js(level, parts.joined(separator: " "))
  }

  /// 페이지 재로드(내비게이션 시작) 때 구독 수를 0 으로 되돌린다.
  func resetListeners() {
    for (k, _) in listeners where listeners[k]! > 0 {
      let parts = k.split(separator: "\u{0}", maxSplits: 1).map(String.init)
      listeners[k] = 0
      plugins[parts[0]]?.listenersChanged(event: parts[1], count: 0)
    }
  }

  func emit(plugin: String, event: String, data: Any?) {
    guard listenerCount(plugin, event) > 0, let webView else { return }
    var m: [String: Any] = ["v": 1, "plugin": plugin, "event": event]
    if let data { m["data"] = data }
    // arguments 는 plist 호환 타입(NSString/NSNumber/NSDate/NSArray/NSDictionary/NSNull)만 가능
    webView.callAsyncJavaScript("window.__AKAN_NATIVE__ && window.__AKAN_NATIVE__.receive(m)", arguments: ["m": m],
                                in: nil, in: .page) { result in
      if case .failure(let e) = result { AkanNativeLog.info("emit \(plugin).\(event) failed: \(e)") }
    }
  }
}

/// WKUserContentController 는 핸들러를 강하게 잡는다 → 순환 참조를 끊는 약한 프록시.
final class WeakScriptHandler: NSObject, WKScriptMessageHandlerWithReply, WKScriptMessageHandler {
  weak var target: AkanNativeBridge?
  init(_ t: AkanNativeBridge) { target = t }
  func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage,
                             replyHandler: @escaping @MainActor (Any?, String?) -> Void) {
    guard let target else { return replyHandler(nil, "akan-native: bridge gone") }
    target.userContentController(ucc, didReceive: message, replyHandler: replyHandler)
  }
  func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
    target?.userContentController(ucc, didReceive: message)
  }
}
```

#### AkanNativeGeneratedPlugins.swift — 빌드가 생성할 파일의 모양
```swift
// 빌드가 생성하는 파일의 모양 (AkanNativeGeneratedPlugins.swift). 리플렉션 없이 타입 목록만.
@MainActor
enum AkanNativeGeneratedPlugins {
  static let all: [AkanNativePlugin.Type] = [
    AppStatePlugin.self, PreferencesPlugin.self, KeyboardPlugin.self, CameraPlugin.self,
  ]
}
```

#### plugins/AppStatePlugin.swift
```swift
import UIKit

// useAppState: UIScene 상태 → "active" | "inactive" | "background"
final class AppStatePlugin: AkanNativePlugin {
  static let id = "app-state"
  static let methods = ["getState"]
  private let ctx: AkanNativePluginContext
  private var observers: [NSObjectProtocol] = []
  private var last: String?

  init(context: AkanNativePluginContext) {
    ctx = context
    let nc = NotificationCenter.default
    let map: [(Notification.Name, String)] = [
      (UIScene.didActivateNotification, "active"),
      (UIScene.willDeactivateNotification, "inactive"),
      (UIScene.didEnterBackgroundNotification, "background"),
      (UIScene.willEnterForegroundNotification, "inactive"),   // 전경 복귀 직후는 아직 inactive
    ]
    for (name, state) in map {
      observers.append(nc.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
        let sceneBox = UncheckedBox(note.object as? UIScene)
        MainActor.assumeIsolated { self?.sceneChanged(sceneBox.value, state, name.rawValue) }
      })
    }
  }

  private func sceneChanged(_ scene: UIScene?, _ state: String, _ name: String) {
    // 이 WebView 가 붙은 scene 만 본다 (다중 scene 대비)
    if let mine = ctx.windowScene, let scene, scene !== mine { return }
    AkanNativeLog.info("app-state \(name) → \(state)")
    guard state != last else { return }
    last = state
    ctx.emit("change", ["state": state])
  }

  static func stateString(_ s: UIScene.ActivationState?) -> String {
    switch s {
    case .foregroundActive: "active"
    case .foregroundInactive: "inactive"
    case .background, .unattached, nil: "background"
    @unknown default: "background"
    }
  }

  func call(_ method: String, _ args: [String: Any], _ call: AkanNativeCall) {
    call.resolve(["state": Self.stateString(ctx.windowScene?.activationState)])
  }
}
```

#### plugins/PreferencesPlugin.swift
```swift
import Foundation

// usePreferences: 문자열 key-value. 별도 suite(= Library/Preferences/<suite>.plist) 에 둔다.
// suiteName 에 번들 ID 를 쓰면 안 된다 (standard 와 같은 도메인이라 동작하지 않음).
final class PreferencesPlugin: AkanNativePlugin {
  static let id = "preferences"
  static let methods = ["get", "set", "remove", "keys", "clear"]
  static let suite = "akan-native.preferences"
  private let defaults = UserDefaults(suiteName: PreferencesPlugin.suite)!

  init(context: AkanNativePluginContext) {}

  func call(_ method: String, _ args: [String: Any], _ call: AkanNativeCall) {
    let key = args["key"] as? String
    switch method {
    case "get":
      guard let key else { return call.reject(.INVALID_ARGS, "key required") }
      call.resolve(["value": (defaults.string(forKey: key) as Any?) ?? NSNull()])
    case "set":
      guard let key, let value = args["value"] as? String else {
        return call.reject(.INVALID_ARGS, "key and string value required")
      }
      defaults.set(value, forKey: key)
      call.resolve()
    case "remove":
      guard let key else { return call.reject(.INVALID_ARGS, "key required") }
      defaults.removeObject(forKey: key)
      call.resolve()
    case "keys":
      call.resolve(["keys": Array(defaults.persistentDomain(forName: Self.suite)?.keys ?? [:].keys).sorted()])
    case "clear":
      defaults.removePersistentDomain(forName: Self.suite)
      call.resolve()
    default:
      call.reject(.NOT_FOUND, method)
    }
  }
}
```

#### plugins/KeyboardPlugin.swift
```swift
import UIKit

// useKeyboard: 소프트 키보드가 WebView 를 가리는 높이 (CSS px = UIKit pt).
final class KeyboardPlugin: AkanNativePlugin {
  static let id = "keyboard"
  static let methods = ["getState", "hide"]
  private let ctx: AkanNativePluginContext
  private var observers: [NSObjectProtocol] = []
  private var state: [String: Any] = ["visible": false, "height": 0]
  private var lastEmitted: (Double, String)?

  init(context: AkanNativePluginContext) {
    ctx = context
    let nc = NotificationCenter.default
    // willChangeFrame 하나로 show/hide/크기 변경(예측 입력줄 등)을 모두 받는다. didHide 는 보정용.
    for name in [UIResponder.keyboardWillChangeFrameNotification, UIResponder.keyboardDidChangeFrameNotification,
                 UIResponder.keyboardWillHideNotification] {
      observers.append(nc.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
        let info = UncheckedBox(note.userInfo ?? [:])
        MainActor.assumeIsolated { self?.handle(name, info.value) }
      })
    }
  }

  private func handle(_ name: Notification.Name, _ info: [AnyHashable: Any]) {
    guard let webView = ctx.webView, let window = webView.window else { return }
    let end = (info[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue ?? .zero
    let duration = (info[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?.doubleValue ?? 0
    let curve = (info[UIResponder.keyboardAnimationCurveUserInfoKey] as? NSNumber)?.intValue ?? 0
    let local = (info[UIResponder.keyboardIsLocalUserInfoKey] as? NSNumber)?.boolValue ?? true
    // 키보드 frame 은 screen 좌표계. WebView 좌표계로 바꿔 겹치는 높이만 쓴다
    // (iPad 떠 있는 키보드·분할 화면·다른 앱 키보드에서도 맞게).
    let inView = webView.convert(end, from: window.screen.coordinateSpace)
    let overlap = name == UIResponder.keyboardWillHideNotification ? 0 : max(0, webView.bounds.intersection(inView).height)
    AkanNativeLog.info("keyboard \(name.rawValue) end=\(end) inView=\(inView) overlap=\(overlap) dur=\(duration) curve=\(curve) local=\(local)")
    let phase = name == UIResponder.keyboardDidChangeFrameNotification ? "did" : "will"
    let visible = overlap > 0
    state = ["visible": visible, "height": Double(overlap)]
    // 숨길 때 willChangeFrame + willHide 가 연달아 온다 → 같은 값은 한 번만
    guard lastEmitted.map({ $0.0 != Double(overlap) || $0.1 != phase }) ?? true else { return }
    lastEmitted = (Double(overlap), phase)
    ctx.emit("change", ["visible": visible, "height": Double(overlap), "duration": duration, "phase": phase])
  }

  func call(_ method: String, _ args: [String: Any], _ call: AkanNativeCall) {
    switch method {
    case "getState": call.resolve(state)
    case "hide":
      // endEditing 은 키보드만 내리고 DOM 포커스(document.activeElement)는 남긴다 → blur 도 같이
      ctx.webView?.evaluateJavaScript("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
      ctx.webView?.endEditing(true)
      call.resolve()
    default: call.reject(.NOT_FOUND, method)
    }
  }
}
```

#### plugins/CameraPlugin.swift
```swift
import UIKit
import AVFoundation
import PhotosUI
import UniformTypeIdentifiers

// useCamera: 사진 1장 → /__akan_native/file/<id> (JPEG)
// source: "auto"(기본, 카메라가 없으면 사진 보관함) | "camera" | "library"
final class CameraPlugin: NSObject, AkanNativePlugin, UIImagePickerControllerDelegate, UINavigationControllerDelegate,
                          PHPickerViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
  static let id = "camera"
  static let methods = ["checkPermissions", "requestPermissions", "getPhoto"]
  private let ctx: AkanNativePluginContext
  private var pending: (call: AkanNativeCall, opts: Options)?

  struct Options: Sendable { var quality: CGFloat = 0.9; var maxWidth: CGFloat = 0; var maxHeight: CGFloat = 0 }

  init(context: AkanNativePluginContext) { ctx = context }

  static var hasUsableCamera: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) && !isSimulator }

  static var isSimulator: Bool {
    #if targetEnvironment(simulator)
    true
    #else
    false
    #endif
  }

  static func cameraPermission() -> String {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: "granted"
    case .denied, .restricted: "denied"
    case .notDetermined: "prompt"
    @unknown default: "prompt"
    }
  }

  func call(_ method: String, _ args: [String: Any], _ call: AkanNativeCall) {
    switch method {
    case "checkPermissions":
      // PHPicker 는 권한이 필요 없다 → photos 는 항상 granted 로 본다
      call.resolve(["camera": Self.cameraPermission(), "photos": "granted",
                    "cameraAvailable": Self.hasUsableCamera,
                    "pickerReportsCamera": UIImagePickerController.isSourceTypeAvailable(.camera),
                    "avDefaultVideo": AVCaptureDevice.default(for: .video) != nil,
                    "simulator": Self.isSimulator])
    case "requestPermissions":
      guard Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription") != nil else {
        return call.reject(.INTERNAL, "Info.plist has no NSCameraUsageDescription")
      }
      AVCaptureDevice.requestAccess(for: .video) { _ in
        DispatchQueue.main.async { call.resolve(["camera": Self.cameraPermission(), "photos": "granted"]) }
      }
    case "getPhoto":
      getPhoto(args, call)
    default:
      call.reject(.NOT_FOUND, method)
    }
  }

  private func getPhoto(_ args: [String: Any], _ call: AkanNativeCall) {
    guard pending == nil else { return call.reject(.INTERNAL, "another getPhoto is in progress") }
    var opts = Options()
    if let q = args["quality"] as? NSNumber { opts.quality = min(1, max(0, CGFloat(q.doubleValue) / 100)) }
    if let w = args["maxWidth"] as? NSNumber { opts.maxWidth = CGFloat(w.doubleValue) }
    if let h = args["maxHeight"] as? NSNumber { opts.maxHeight = CGFloat(h.doubleValue) }
    let source = args["source"] as? String ?? "auto"
    // iOS 26 시뮬레이터는 isSourceTypeAvailable(.camera)=true 이고 카메라 UI 도 뜨지만
    // AVCaptureDevice 가 없고 촬영 결과를 확인하지 못했다 → 시뮬레이터에서는 카메라 없음으로 본다.
    let hasCamera = Self.hasUsableCamera
    switch source {
    case "camera" where !hasCamera:
      return call.reject(.UNSUPPORTED, "camera is not available on this device")
    case "camera":
      withCameraPermission(call) { [weak self] in self?.presentCamera(call, opts) }
    case "auto" where hasCamera:
      withCameraPermission(call) { [weak self] in self?.presentCamera(call, opts) }
    case "library", "auto":
      presentLibrary(call, opts)
    default:
      call.reject(.INVALID_ARGS, "unknown source '\(source)'")
    }
  }

  private func withCameraPermission(_ call: AkanNativeCall, _ go: @escaping @MainActor () -> Void) {
    // 설명 문구 없이 requestAccess 를 부르면 TCC 가 앱을 강제 종료한다 (OS_REASON_TCC)
    guard Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription") != nil else {
      return call.reject(.INTERNAL, "Info.plist has no NSCameraUsageDescription")
    }
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: go()
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { ok in
        DispatchQueue.main.async {
          MainActor.assumeIsolated { ok ? go() : call.reject(.PERMISSION_DENIED, "camera permission denied") }
        }
      }
    default: call.reject(.PERMISSION_DENIED, "camera permission denied")
    }
  }

  private var presenter: UIViewController? {
    var top = ctx.viewController
    while let p = top?.presentedViewController { top = p }
    return top
  }

  private func presentCamera(_ call: AkanNativeCall, _ opts: Options) {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.cameraCaptureMode = .photo
    picker.delegate = self
    pending = (call, opts)
    presenter?.present(picker, animated: true)
  }

  private func presentLibrary(_ call: AkanNativeCall, _ opts: Options) {
    var config = PHPickerConfiguration()          // photoLibrary 없이 만들면 권한 불필요, assetIdentifier 없음
    config.filter = .images
    config.selectionLimit = 1
    config.preferredAssetRepresentationMode = .current   // HEIC→JPEG 변환을 시스템이 하지 않게
    let picker = PHPickerViewController(configuration: config)
    picker.delegate = self
    picker.presentationController?.delegate = self      // 아래로 쓸어 닫기 → CANCELLED
    pending = (call, opts)
    presenter?.present(picker, animated: true)
    AkanNativeLog.info("camera: presented PHPicker")
  }

  // ───── UIImagePickerControllerDelegate ─────
  func imagePickerController(_ picker: UIImagePickerController,
                             didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
    let image = info[.originalImage] as? UIImage
    AkanNativeLog.info("camera didFinishPicking keys=\(info.keys.map(\.rawValue)) size=\(image?.size ?? .zero) orientation=\(image?.imageOrientation.rawValue ?? -1) scale=\(image?.scale ?? 0)")
    picker.dismiss(animated: true)
    guard let p = pending else { return }
    pending = nil
    guard let image else { return p.call.reject(.INTERNAL, "no image") }
    process(image, p.opts, p.call)
  }
  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: true)
    finishCancelled()
  }

  // ───── PHPickerViewControllerDelegate ─────
  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    guard let p = pending else { return }
    pending = nil
    guard let provider = results.first?.itemProvider else { return p.call.reject(.CANCELLED, "cancelled") }
    guard provider.canLoadObject(ofClass: UIImage.self) else { return p.call.reject(.INTERNAL, "not an image") }
    provider.loadObject(ofClass: UIImage.self) { [weak self] obj, err in   // 백그라운드 큐에서 온다
      guard let image = obj as? UIImage else { return p.call.reject(.INTERNAL, "load failed: \(String(describing: err))") }
      let box = UncheckedBox(image)
      DispatchQueue.main.async { MainActor.assumeIsolated { self?.process(box.value, p.opts, p.call) } }
    }
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { finishCancelled() }

  private func finishCancelled() {
    guard let p = pending else { return }
    pending = nil
    p.call.reject(.CANCELLED, "cancelled")
  }

  // 방향 보정 + 축소 + JPEG → 임시 파일 → /__akan_native/file/<id>
  private func process(_ image: UIImage, _ opts: Options, _ call: AkanNativeCall) {
    let ctx = self.ctx
    let box = UncheckedBox(image)
    DispatchQueue.global(qos: .userInitiated).async {
      let out = Self.normalize(box.value, maxWidth: opts.maxWidth, maxHeight: opts.maxHeight)
      guard let data = out.jpegData(compressionQuality: opts.quality) else { return call.reject(.INTERNAL, "jpeg encode failed") }
      let file = AkanNativeFileRegistry.shared.directory.appendingPathComponent("photo-\(UUID().uuidString).jpg")
      do { try data.write(to: file, options: .atomic) } catch { return call.reject(.INTERNAL, "write failed: \(error)") }
      let w = Int(out.size.width), h = Int(out.size.height)
      DispatchQueue.main.async {
        MainActor.assumeIsolated {
          let url = ctx.registerFile(file, mime: "image/jpeg")
          call.resolve(["url": url, "mime": "image/jpeg", "size": data.count, "width": w, "height": h])
        }
      }
    }
  }

  /// 그리기만 하면 imageOrientation 이 픽셀에 반영된다. scale=1 로 픽셀 크기 = 포인트 크기.
  nonisolated static func normalize(_ image: UIImage, maxWidth: CGFloat, maxHeight: CGFloat) -> UIImage {
    var size = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
    var ratio: CGFloat = 1
    if maxWidth > 0 { ratio = min(ratio, maxWidth / size.width) }
    if maxHeight > 0 { ratio = min(ratio, maxHeight / size.height) }
    size = CGSize(width: floor(size.width * ratio), height: floor(size.height * ratio))
    if image.imageOrientation == .up && ratio == 1 { return image }
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    return UIGraphicsImageRenderer(size: size, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: size))
    }
  }

}
```

### 2.4 페이지 쪽 (테스트 하네스의 핵심만)

```html
<head>
<script src="/__akan_native/init.js"></script>        <!-- 첫 요소. 클래식 스크립트라 모듈보다 먼저 동기로 실행됨 [검증] -->
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<style>
  #top { padding: env(safe-area-inset-top) 12px 8px; }                       /* 62px */
  main { padding-bottom: calc(env(safe-area-inset-bottom) + var(--kb, 0px)); } /* keyboard 이벤트가 --kb 를 설정 */
</style>
```
```js
// iOS transport (JSON 텍스트 판). 응답이 Response 가 아니라 reject 되는 경우(오리진 거절·핸들러 미응답)를 INTERNAL 로 바꾼다
const post = (req) => window.webkit.messageHandlers.akanNative.postMessage(JSON.stringify(req))
  .then((text) => JSON.parse(text),
        (e) => ({ v: 1, id: req.id, ok: false, error: { code: "INTERNAL", message: String(e && e.message || e) } }));
window.__AKAN_NATIVE__.receive = (m) => { /* {v, plugin, event, data} → 구독자에게 */ };
```

### 2.5 자동 검증 방법 (탭 없이)

- **결과 수집**
  - 페이지가 테스트 34개를 돌린 뒤 `dev.report`로 JSON을 보낸다.
  - 셸은 그것을 stdout, os_log, `<컨테이너>/tmp/akan-native-log.txt`에 쓴다.
  - 호스트는 `simctl get_app_container … data`로 그 파일을 읽는다(`run.sh`, `report.py`).
- **명령 주입**
  - 호스트가 `<컨테이너>/tmp/akan-native-cmd.json`에 `{"cmd":"js","code":"…"}`를 쓴다(`cmd.sh`).
  - 앱은 dev 빌드에서 0.3초마다 이 파일을 확인해 실행한다.
  - 명령 종류: `js`(evaluateJavaScript), `native-keyboard`(UITextField first responder), `take-picture`, `dismiss`, `hide-keyboard`.
  - `simctl openurl`은 확인창 때문에 쓸 수 없었다(§1.2 #15).
- 이 방식은 **NF-3(공통 JS 테스트 묶음)을 시뮬레이터에서 CI처럼 돌리는 데** 그대로 쓸 수 있다.

최종 테스트 결과(`-D AKAN_NATIVE_TESTS` 빌드, 34개 중 32개 OK)
- 실패 2개는 예상한 결과다.
  - safe-area: 모듈 실행 시점 값이 0이다(§1.2 #8).
  - cookie: 커스텀 스킴이라 빈 값이다.
- 확인한 값:
  - 타입 왕복: JS `true` → `Bool`(CFBoolean), `1` → `NSNumber(d)`(JSON 경로는 `NSNumber(q)`), `null` → `NSNull`.
  - 네이티브 → JS: `Date` → JS `Date`. `Int64` 2^53+1 → 9007199254740992(정밀도 손실).
  - 비동기 응답: 백그라운드 스레드에서 resolve → main으로 넘겨 reply, 824ms(800ms 대기).
  - iframe(`app://localhost/iframe.html`)에서 호출: `isMainFrame=false`라서 `"akan-native: forbidden origin"`으로 거절된다.
  - 이벤트: `$listen` 후 `emit` 도착. `$unlisten` 후에는 보내지 않는다.
  - `/public/missing.png` → 404. `/u/john.doe`(Accept `text/html`) → index.html. `/deep/spa/route` → index.html.
  - `/%2e%2e/Info.plist`: WebKit이 `/Info.plist`로 정규화한다 → 404. `/public/..%2f..%2fInfo.plist`: 디코딩 후 standardize하면 root 밖 → 404.
  - Range `bytes=0-4` → 206 + `Content-Range: bytes 0-4/25`.
  - `$debugProcess`: orientation `.right`인 400×200을 처리하면 `<img>`의 natural 크기가 200×400, `image/jpeg`이다.
- WebKit이 보낸 Accept 헤더:
  - 문서: `text/html,application/xhtml+xml,…`
  - `fetch`: `*/*`
  - `<img>`: `image/webp,image/avif,…`
  - CSS: `text/css,*/*;q=0.1`

### 2.6 측정값

| 항목 | 값 [검증, 시뮬레이터 · 디버그 빌드] |
|---|---|
| 콜드 스타트(`didFinishLaunching` → 첫 `didFinish`) | 첫 실행 약 0.85s, 이후 약 0.47s (WebContent 프로세스 생성 포함) |
| `webView.load` → 첫 `decidePolicyFor` | 약 0.4s (WebContent 기동) |
| 키보드 | iPhone 17 Pro 세로: 335pt(예측 입력줄 포함), 폼 보조 막대 포함 403pt. duration 0.3833, curve 7 |
| safeArea | top 62, bottom 34 (402×874pt, @3x) |
| 브리지 | 객체 body 50건 동시 5~7ms, JSON 텍스트 50건 4ms, 1MB 인자 왕복 7ms |

## 3. 참고 코드 노하우

링크는 이 문서 위치 기준이다. 줄 번호는 모두 확인했다(capacitor `145560e`, capacitor-plugins `03fca06`).

### 3.1 Capacitor 코어 (iOS)

**스킴 핸들러**
- stop 보호가 약하다.
  - `webView(_:stop:)`은 연결 객체(associated object)에 `stopped = true`만 기록한다([WebViewAssetHandler.swift#L114-L116](../../../capacitor/ios/Capacitor/Capacitor/WebViewAssetHandler.swift#L114-L116)). 값은 `OBJC_ASSOCIATION_ASSIGN`으로 저장한다([#L551-L562](../../../capacitor/ios/Capacitor/Capacitor/WebViewAssetHandler.swift#L551-L562)).
  - 이 값은 비동기 프록시 경로에서만 검사한다([#L155-L156](../../../capacitor/ios/Capacitor/Capacitor/WebViewAssetHandler.swift#L155-L156)).
  - 로컬 파일은 `start` 안에서 동기로 응답하므로 문제가 없는 구조다. akan-native는 파일을 백그라운드에서 읽으므로 **집합으로 추적하는 방식이 필요하다**(§2.3).
- `/_capacitor_file_<절대경로>`는 경로 검사 없이 임의 파일을 노출한다([#L49-L50](../../../capacitor/ios/Capacitor/Capacitor/WebViewAssetHandler.swift#L49-L50)). akan-native의 `/__akan_native/file/<id>` 등록 방식(PL-7)이 더 안전하다. JS용 URL은 `portablePath`로 만든다([CapacitorBridge.swift#L752-L758](../../../capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift#L752-L758)).
- MIME은 `UTType.preferredMIMEType`을 먼저 쓰고, 없으면 큰 표로 찾는다([#L118-L132](../../../capacitor/ios/Capacitor/Capacitor/WebViewAssetHandler.swift#L118-L132)).
- 헤더는 `Content-Type`과 `Cache-Control: no-cache`뿐이다([#L60-L63](../../../capacitor/ios/Capacitor/Capacitor/WebViewAssetHandler.swift#L60-L63)).
- Range 206을 지원한다([#L71-L89](../../../capacitor/ios/Capacitor/Capacitor/WebViewAssetHandler.swift#L71-L89)). 다만 `=`가 없으면 크래시하고 suffix 범위와 416을 처리하지 않는다.
- 동영상은 헤더 없는 `URLResponse`로 응답한다([#L92-L104](../../../capacitor/ios/Capacitor/Capacitor/WebViewAssetHandler.swift#L92-L104)). 없는 파일은 404가 아니라 `didFailWithError`다([#L107-L111](../../../capacitor/ios/Capacitor/Capacitor/WebViewAssetHandler.swift#L107-L111)).
- SPA 규칙: **확장자 없는 경로 → index.html**, 확장자가 있으면 파일로 본다([Router.swift#L16-L28](../../../capacitor/ios/Capacitor/Capacitor/Router.swift#L16-L28)). akan-native 프로토타입은 이 규칙에 "Accept에 text/html이 있으면 폴백"을 더해 `/u/john.doe` 같은 경로도 처리했다.

**WKWebView 구성**
- 구성 값([CAPBridgeViewController.swift#L119-L147](../../../capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift#L119-L147)):
  - `allowsInlineMediaPlayback = true`, `mediaTypesRequiringUserActionForPlayback = []`, `allowsAirPlayForMediaPlayback = true`
  - `limitsNavigationsToAppBoundDomains`는 설정값을 따른다(기본 false).
  - `preferences.isElementFullscreenEnabled = true`, `applicationNameForUserAgent`
- `prepareWebView`([#L292-L325](../../../capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift#L292-L325)):
  - `HTTPCookieStorage.shared.cookieAcceptPolicy = .always`
  - `scrollView.bounces = false`, `contentInsetAdjustmentBehavior`(기본 `.never`, [CAPInstanceDescriptor.m#L32-L55](../../../capacitor/ios/Capacitor/Capacitor/CAPInstanceDescriptor.m#L32-L55))
  - `backgroundColor`(없으면 `systemBackground`)를 webView와 scrollView에 둘 다 준다.
- 흰 화면 방지: 첫 로드 동안만 `isOpaque = false`로 두고 끝나면 원래대로 되돌린다([WebViewDelegationHandler.swift#L29-L39](../../../capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift#L29-L39)).
- `isInspectable`은 bridge에서 설정한다([CapacitorBridge.swift#L471-L480](../../../capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift#L471-L480)).
- `underPageBackgroundColor`와 `dataDetectorTypes`는 설정하지 않는다. 프로토타입은 둘 다 설정했다.

**private API (쓰지 않는다)**
- `WKContentView`의 `_elementDidFocus:userIsInteracting:…`를 swizzle해서 제스처 없는 `focus()`로도 키보드를 띄운다. 클래스 이름은 `"WK"+"ContentView"`로 나눠 숨긴다([WKWebView+Capacitor.swift#L29-L70](../../../capacitor/ios/Capacitor/Capacitor/WKWebView+Capacitor.swift#L29-L70)). 켜는 곳은 [CAPBridgeViewController.swift#L316](../../../capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift#L316).
- 상태 바 탭은 `UIStatusBarManager handleTapAction:`를 swizzle한다([UIStatusBarManager+CAPHandleTapAction.m#L7-L35](../../../capacitor/ios/Capacitor/Capacitor/UIStatusBarManager+CAPHandleTapAction.m#L7-L35)).

**내비게이션과 UI delegate**
- `decidePolicyFor`([WebViewDelegationHandler.swift#L67-L125](../../../capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift#L67-L125)):
  - 최상위 이동은 `targetFrame == nil || isMainFrame`으로 판정한다.
  - 앱 URL이 아니면 `UIApplication.shared.open`을 부르고 cancel한다. 이때 **scene이 `.foregroundActive`일 때만** 연다([#L108-L121](../../../capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift#L108-L121)).
  - `createWebViewWith`도 외부로 열고 nil을 돌려준다([#L334-L339](../../../capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift#L334-L339)).
- getUserMedia 권한(`requestMediaCapturePermissionFor`)과 기기 방향 권한은 **항상 grant**한다([#L50-L65](../../../capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift#L50-L65)). akan-native는 앱 오리진일 때만 grant한다.
- WebContent 프로세스가 종료되면 `bridge.reset()` 후 `reload()`한다([#L164-L168](../../../capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift#L164-L168)). akan-native도 같게 하고 구독 수를 초기화한다([검증] kill -9 후 reload).
- alert·confirm은 UIAlertController로 띄운다([#L234-L269](../../../capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift#L234-L269)). **VC가 없으면 completionHandler를 부르지 않는 버그**가 있다. prompt는 쿠키와 HTTP의 동기 채널로도 쓴다([#L271-L332](../../../capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift#L271-L332)).

**브리지**
- 응답 없는 `WKScriptMessageHandler` 하나("bridge")를 쓴다.
- 모든 플러그인 호출이 **하나의 직렬 큐** `DispatchQueue(label: "bridge")`에서 돈다([CapacitorBridge.swift#L127](../../../capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift#L127), [#L489-L559](../../../capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift#L489-L559)).
- 없는 플러그인이나 메서드는 로그만 남기고 **Promise를 영원히 끝내지 않는다**([#L496-L522](../../../capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift#L496-L522)). akan-native는 NOT_FOUND로 응답한다(SEC-2).
- 결과는 이스케이프 없이 `evaluateJavaScript("window.Capacitor.fromNative(...)")`로 돌려준다([#L598-L631](../../../capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift#L598-L631)). WithReply를 쓰면 이 과정이 필요 없다.
- 플러그인 목록은 WKUserScript(atDocumentStart, main frame만)로 `PluginHeaders`를 넣는다([JSExport.swift#L73-L109](../../../capacitor/ios/Capacitor/Capacitor/JSExport.swift#L73-L109)). akan-native는 init.js로 대신한다.
- scene 수명주기 이벤트는 UIScene willEnterForeground/didEnterBackground를 보고, **자기 scene인지** 확인한다([CapacitorBridge.swift#L266-L273](../../../capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift#L266-L273)).
- 콜드 스타트 딥링크는 플러그인이 로드된 뒤(첫 viewDidAppear)로 미뤄 전달한다([CAPSceneDelegateProxy.swift#L20-L34](../../../capacitor/ios/Capacitor/Capacitor/CAPSceneDelegateProxy.swift#L20-L34)). SH-6 때 참고한다.

**쿠키**
- 커스텀 스킴에서 `document.cookie`가 동작하지 않아 JS getter·setter를 덮어쓴다. 그 뒤는 동기 `prompt()` → `HTTPCookieStorage`로 처리한다([native-bridge.js#L369-L433](../../../capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js#L369-L433), [CapacitorCookieManager.swift#L129-L140](../../../capacitor/ios/Capacitor/Capacitor/Plugins/CapacitorCookieManager.swift#L129-L140)).
- WithReply는 비동기라서 같은 방식으로 **동기 `document.cookie`를 만들 수 없다.**

**safe area**
- iOS에서는 따로 주입하지 않고 WebKit의 `env()`에 맡긴다. CSS 변수 주입은 Android에만 있다([SystemBars.java#L266-L269](../../../capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java#L266-L269)).

### 3.2 capacitor-plugins (camera 8.0.2 동결본 · preferences · app · status-bar)

**camera**
- 촬영은 `UIImagePickerController(.camera)`([CameraPlugin.swift#L446-L464](../../../capacitor-plugins/camera/ios/Sources/CameraPlugin/CameraPlugin.swift#L446-L464)), 보관함은 **항상 PHPicker**다([#L485-L498](../../../capacitor-plugins/camera/ios/Sources/CameraPlugin/CameraPlugin.swift#L485-L498)).
  - `PHPickerConfiguration(photoLibrary: .shared())`는 assetIdentifier를 얻기 위한 것이라 보관함 권한이 필요해진다.
  - akan-native처럼 인자 없는 `PHPickerConfiguration()`을 쓰면 권한이 필요 없다.
- 시뮬레이터이거나 카메라가 없으면 바로 reject한다([#L398-L404](../../../capacitor-plugins/camera/ios/Sources/CameraPlugin/CameraPlugin.swift#L398-L404)). `isSimEnvironment`는 `#if targetEnvironment(simulator)`다([CapacitorBridge.swift#L48-L54](../../../capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift#L48-L54)). iOS 26 시뮬레이터가 카메라를 있다고 보고하므로 이 검사가 여전히 필요하다(§1.2 #10).
- 권한:
  - 카메라는 `authorizationStatus`가 denied·restricted이면 reject하고, 그 밖에는 `requestAccess`를 부른다([#L405-L420](../../../capacitor-plugins/camera/ios/Sources/CameraPlugin/CameraPlugin.swift#L405-L420)).
  - 사진 보관함은 PHPicker 앞에서 옛 `PHPhotoLibrary.authorizationStatus()`와 전체 권한을 요청한다(EXIF를 위해, [#L425-L443](../../../capacitor-plugins/camera/ios/Sources/CameraPlugin/CameraPlugin.swift#L425-L443)). akan-native에는 필요 없다.
  - 상태 이름 대응(granted·denied·prompt·limited): [CameraExtensions.swift#L8-L38](../../../capacitor-plugins/camera/ios/Sources/CameraPlugin/CameraExtensions.swift#L8-L38)
- Info.plist 키 3개가 모두 없으면 **호출 전에 reject**한다([#L134-L139](../../../capacitor-plugins/camera/ios/Sources/CameraPlugin/CameraPlugin.swift#L134-L139), [CameraTypes.swift#L63-L83](../../../capacitor-plugins/camera/ios/Sources/CameraPlugin/CameraTypes.swift#L63-L83)). TCC 강제 종료를 피하는 방법이고, akan-native 프로토타입도 같다.
- 처리([#L540-L552](../../../capacitor-plugins/camera/ios/Sources/CameraPlugin/CameraPlugin.swift#L540-L552)):
  - 그리기(`draw(in:)`)로 방향을 픽셀에 반영하고, 확대 없이 비율을 유지해 줄인다([CameraExtensions.swift#L70-L99](../../../capacitor-plugins/camera/ios/Sources/CameraPlugin/CameraExtensions.swift#L70-L99)).
  - JPEG에 메타데이터를 다시 넣고 Orientation을 1로 고친다([CameraTypes.swift#L121-L141](../../../capacitor-plugins/camera/ios/Sources/CameraPlugin/CameraTypes.swift#L121-L141)).
  - quality 기본값은 100이다.
- 임시 파일은 `NSTemporaryDirectory()/photo-N.jpg`이고 **지우지 않는다**([#L500-L509](../../../capacitor-plugins/camera/ios/Sources/CameraPlugin/CameraPlugin.swift#L500-L509)). akan-native는 실행할 때마다 `tmp/akan-native-files`를 비운다.
- PHPicker 결과는 `loadObject(ofClass: UIImage.self)`로 읽고, 안 되면 `loadDataRepresentation`을 쓴다([#L254-L288](../../../capacitor-plugins/camera/ios/Sources/CameraPlugin/CameraPlugin.swift#L254-L288)).
- 취소는 `imagePickerControllerDidCancel`과 결과 0개로 알아낸다. 에러 코드 없이 "User cancelled photos app" 메시지만 보낸다([#L206-L217](../../../capacitor-plugins/camera/ios/Sources/CameraPlugin/CameraPlugin.swift#L206-L217)).

**preferences**
- `UserDefaults.standard`에 `"CapacitorStorage."` 접두어를 붙인다([Preferences.swift#L18-L29](../../../capacitor-plugins/preferences/ios/Sources/PreferencesPlugin/Preferences.swift#L18-L29)). 접두어가 빈 그룹이면 `clear()`가 시스템 키까지 지운다.
- akan-native는 별도 suite를 쓴다. suite 이름에 **번들 ID를 쓰면 안 된다**(standard와 같은 도메인이 된다).

**app**
- UIApplication 알림 4개를 쓴다. `didBecomeActive`/`willResignActive` → `appStateChange{isActive}`, `didEnterBackground`/`willEnterForeground` → `pause`/`resume`([AppPlugin.swift#L19-L41](../../../capacitor-plugins/app/ios/Sources/AppPlugin/AppPlugin.swift#L19-L41)).
- scene 기반 앱에서도 UIApplication 알림은 계속 온다.

**status-bar**
- `UIViewControllerBasedStatusBarAppearance = YES`와 VC의 `preferredStatusBarStyle`을 쓴다.
- overlay를 끄면 webView frame을 상태 바 높이만큼 **내린다**(inset이 아님, [StatusBar.swift#L129-L153](../../../capacitor-plugins/status-bar/ios/Sources/StatusBarPlugin/StatusBar.swift#L129-L153)).
- akan-native는 MVP에서 edge-to-edge와 `env()`만 쓴다. 상태 바 글자색은 다크 모드를 자동으로 따라갔다([검증] 스크린샷).

**keyboard**
- 이 저장소에 없다(`ionic-team/capacitor-keyboard`로 분리됨).

### 3.3 React Native

**키보드**
- `RCTKeyboardObserver`는 Will/Did Show·Hide·ChangeFrame 6개를 관찰한다([RCTKeyboardObserver.mm#L28-L37](../../../react-native/packages/react-native/React/CoreModules/RCTKeyboardObserver.mm#L28-L37)).
- payload([#L114-L135](../../../react-native/packages/react-native/React/CoreModules/RCTKeyboardObserver.mm#L114-L135)):
  - 좌표계: end frame을 `window.convertRect:fromCoordinateSpace:screen.coordinateSpace`로 윈도 좌표로 바꾼다.
  - 시간·애니메이션: duration을 ms로 바꾸고, easing 이름을 붙인다(curve 7 → `"keyboard"`).
  - `isEventFromThisApp = UIKeyboardIsLocalUserInfoKey`
- `KeyboardAvoidingView`:
  - 겹치는 높이는 `max(frame.y + frame.height − (screenY − offset), 0)`로 계산한다([KeyboardAvoidingView.js#L104-L116](../../../react-native/packages/react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js#L104-L116)).
  - iOS에서는 **willShow/willHide만** 구독한다. 떠 있는·분리된 키보드는 WillHide로 오기 때문이다([#L204-L214](../../../react-native/packages/react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js#L204-L214)).
- Fabric ScrollView는 `max(viewLowerY − endFrame.origin.y, 0)`을 contentInset으로 쓴다([RCTScrollViewComponentView.mm#L205-L209](../../../react-native/packages/react-native/React/Fabric/Mounting/ComponentViews/ScrollView/RCTScrollViewComponentView.mm#L205-L209)).

**앱 상태**
- `RCTAppState`는 **UIApplication** 알림만 본다([RCTAppState.mm#L84-L100](../../../react-native/packages/react-native/React/CoreModules/RCTAppState.mm#L84-L100)).
- `willResignActive` → inactive, **`willEnterForeground` → background**(아직 보이지 않음), 그 밖에는 `applicationState`를 읽고, 같은 값이 연속이면 거른다([#L115-L131](../../../react-native/packages/react-native/React/CoreModules/RCTAppState.mm#L115-L131)).
- 프로토타입은 willEnterForeground를 inactive로 보냈다. 구현 쪽 AppStatePlugin은 RN처럼 background로 보낸다. 둘 다 합리적이지만 **플랫폼 공통 표를 정해야 한다**(§4.5).

**scene 판정**
- `RCTIsSceneDelegateApp`은 `UIApplicationSceneManifest.UISceneConfigurations`가 비어 있지 않은지로 판정한다([RCTUtils.mm#L679-L695](../../../react-native/packages/react-native/React/Base/RCTUtils.mm#L679-L695)). plist의 delegate 이름은 Xcode 변수 `$(PRODUCT_MODULE_NAME).SceneDelegate`다([HelloWorld/Info.plist#L37-L52](../../../react-native/private/helloworld/ios/HelloWorld/Info.plist#L37-L52)).
- swiftc로 빌드하면 이 변수를 치환해 주지 않는다. 그래서 **코드에서 delegateClass를 지정하는 편이 낫다.**

### 3.4 WRY · TAO · Tauri · Dioxus

**WRY stop 보호(가장 철저함)**
- `task.hash()` → UUID 맵에 넣고, stop 때 뺀다. 응답 전과 `didReceiveResponse`·`didReceiveData`·`didFinish` 각각 앞에서 UUID를 다시 확인한다(주소 재사용 대비, [url_scheme_handler.rs#L163-L203](../../../wry/src/wkwebview/class/url_scheme_handler.rs#L163-L203)).
- 그래도 확인과 호출 사이가 원자적이지 않아 `objc2::exception::catch`로 감싼다([#L260-L297](../../../wry/src/wkwebview/class/url_scheme_handler.rs#L260-L297)). responder를 아무 스레드에서나 부를 수 있게 한 대가다.
- Swift에서는 ObjC 예외를 잡을 수 없다. 대신 **응답을 main에서만 보내고**, task를 강하게 잡아(TaskBox) 주소 재사용 자체를 막는다. 이것으로 같은 효과가 난다(§2.3).
- 요청 body는 `HTTPBody`, 없으면 `HTTPBodyStream`에서 읽는다([url_scheme_handler.rs#L106-L123](../../../wry/src/wkwebview/class/url_scheme_handler.rs#L106-L123)).

**WRY 그 밖의 동작**
- 입력 보조 막대: WKWebView 하위 클래스의 `inputAccessoryView` override([wry_web_view.rs#L64-L72](../../../wry/src/wkwebview/class/wry_web_view.rs#L64-L72)). 프로토타입에서 동작을 확인했다(§1.2 #14).
- getUserMedia 권한: 핸들러가 없으면 **grant**한다([wry_web_view_ui_delegate.rs#L127-L169](../../../wry/src/wkwebview/class/wry_web_view_ui_delegate.rs#L127-L169)).
- alert·confirm delegate가 없다. 그래서 WRY 앱에서는 `alert()`이 조용히 무시된다.
- IPC는 문자열 body만 받는다([wry_web_view_delegate.rs#L45-L66](../../../wry/src/wkwebview/class/wry_web_view_delegate.rs#L45-L66)). 오리진 검사는 Tauri가 한다([tauri webview/mod.rs#L1955-L1995](../../../tauri/crates/tauri/src/webview/mod.rs#L1955-L1995)).
- `setInspectable`은 debug 빌드에서만 켠다([mod.rs#L538-L551](../../../wry/src/wkwebview/mod.rs#L538-L551)).
- Service Worker를 쓰려면 `limitsNavigationsToAppBoundDomains`와 `WKAppBoundDomains`가 필요하다([lib.rs#L1700-L1723](../../../wry/src/lib.rs#L1700-L1723)). 커스텀 스킴에서는 [검증] `'serviceWorker' in navigator === false`였다.

**TAO**
- iOS 26은 manifest가 없어도 scene 수명주기로 실행하므로 `configurationForConnectingSceneSession`을 **항상** 구현한다([CHANGELOG.md#L9](../../../tao/CHANGELOG.md#L9), [view.rs#L626-L646](../../../tao/src/platform_impl/ios/view.rs#L626-L646)).
- iPadOS 26 창 컨트롤이 WebView를 가리지 않게 `preferredWindowingControlStyleForScene:`를 쓴다([scene.rs#L205-L220](../../../tao/src/platform_impl/ios/scene.rs#L205-L220)). iPad 지원 때 참고한다.
- 키보드는 구현하지 않았다(`// todo`, [mod.rs#L98](../../../tao/src/platform_impl/ios/mod.rs#L98)).

**Tauri**
- iOS는 **xcodegen + xcodebuild**를 쓴다([tauri-cli/src/mobile/ios/project.rs#L205-L238](../../../tauri/crates/tauri-cli/src/mobile/ios/project.rs#L205-L238)). akan-native 원칙과 맞지 않아 참고만 한다.
- stdout·stderr를 `dup2`로 파이프에 연결해 os_log로 넘긴다([Logger.swift#L17-L28](../../../tauri/crates/tauri/mobile/ios-api/Sources/Tauri/Logger.swift#L17-L28), [#L104-L117](../../../tauri/crates/tauri/mobile/ios-api/Sources/Tauri/Logger.swift#L104-L117)). akan-native는 `print`와 `Logger`를 같이 쓰는 것으로 충분했다.

**Dioxus `dx`**
- Xcode 없이 평평한 `.app`을 조립한다.
- plist 템플릿은 [ios.plist.hbs](../../../dioxus/packages/cli/assets/ios/ios.plist.hbs)다.
  - `UILaunchStoryboardName=LaunchScreen`을 쓰지만 storyboard 파일을 만들지 않는다. 그래서 레터박스가 될 가능성이 있다([추론], 우리 실험 결과와 같은 현상).
  - `UILaunchScreen`, `MinimumOSVersion`, scene manifest가 없다.
- 시뮬레이터 빌드는 **서명하지 않는다**([request.rs#L720-L722](../../../dioxus/packages/cli/src/build/request.rs#L720-L722)).
- `simctl install booted` → `simctl launch --console booted <id>`의 stdout을 그대로 로그로 쓴다. 환경변수는 `SIMCTL_CHILD_*`로 넘긴다([builder.rs#L1044-L1082](../../../dioxus/packages/cli/src/build/builder.rs#L1044-L1082)).
- 시뮬레이터 선택은 정렬된 첫 런타임에서 가장 최근에 부팅한 기기다([apple.rs#L85-L145](../../../dioxus/packages/cli/src/build/apple.rs#L85-L145)).

## 4. akan-native 설계에 반영할 점 · 아키텍처 문서와 달라져야 할 점

### 4.1 §3.4 iOS 셸 구조
- AppDelegate에서 `configurationForConnecting`을 구현하고 `UISceneConfiguration(name: nil, sessionRole:)` + `delegateClass = AkanNativeSceneDelegate.self`를 쓴다. plist에는 `UIApplicationSupportsMultipleScenes=false`만 둔다.
- VC는 `loadView`에서 WKWebView를 만들고 `viewDidLoad`에서 `load(app://localhost/)`를 한다.
- WKWebView 설정 목록은 §2.3 `AkanNativeViewController`에 있다.
  - `isOpaque=false`로 계속 둔다. Capacitor처럼 로딩 뒤에 true로 되돌릴 필요가 없었다. 다크 모드 전환 뒤 배경도 동적 UIColor를 따른다.
  - `contentInsetAdjustmentBehavior=.never`, `underPageBackgroundColor`, `allowsLinkPreview=false`, `dataDetectorTypes=[]`
  - `mediaTypesRequiringUserActionForPlayback=[]`, `allowsInlineMediaPlayback=true`
- **SH-2 보강**: 부팅 직후 JS에서 읽는 `env()`는 0이다. CSS만 쓰라고 문서화하거나, 필요하면 이벤트로 준다.
- dev 빌드의 console 포워딩: init.js 끝에 붙인 가로채기 코드 + 응답 없는 `akanNativeLog` 핸들러(`add(_:name:)`)로 충분하다(WV-3). init.js보다 먼저 나는 오류(HTML 파싱 오류 등)는 잡지 못한다.
- `webViewWebContentProcessDidTerminate`에서는 `reload()`만 한다. 구독은 `didStartProvisionalNavigation`에서 초기화한다.

### 4.2 §4 브리지 프로토콜 (iOS 구현 규칙)
- **JSON 텍스트 전송을 확정한다.** 근거는 §1.2 #4다. Swift 쪽:
  - 받기: `message.body as? String` → `JSONSerialization.jsonObject`.
  - 보내기: `isValidJSONObject`를 검사한 뒤 `JSONSerialization.data`를 만들어 `String`으로 reply한다.
  - **isValidJSONObject 검사 없이 data(withJSONObject:)를 부르면 NSDate 하나로 앱이 죽는다**(§1.2 #3).
  - 플러그인은 결과에 Date·URL·Data를 넣지 않는다(문자열·숫자로 바꾼다). 넣으면 브리지가 INTERNAL로 바꾼다.
- **reply는 정확히 한 번**만 보낸다. 두 번 보내면 크래시다. `AkanNativeCall`의 잠금 + "이미 응답함" 플래그가 필수다.
  - 응답하지 않고 놓친 call은 WebKit이 알아서 reject한다. 그래서 `@akanjs/native/core`의 iOS transport는 **Promise reject를 `{ok:false, code:"INTERNAL"}`로 바꿔야 한다.** 오리진 거절(`replyHandler(nil, "…")`)도 같은 경로로 온다.
- `errorMessage` 인자(두 번째 인자)는 **보안 거절에만** 쓴다. 나머지는 Response `ok:false`로 보낸다.
- **SEC-1**: `frameInfo.securityOrigin`의 protocol `"app"`, host `"localhost"`, port 0 + `frameInfo.isMainFrame`을 검사한다. 메시지 핸들러는 **모든 frame에 노출된다**(iframe에서도 `webkit.messageHandlers.akanNative`가 있다 [검증]).
- 이벤트 push: `callAsyncJavaScript("window.__AKAN_NATIVE__ && window.__AKAN_NATIVE__.receive(m)", arguments: ["m": dict], in: nil, in: .page)`. JSON 텍스트 원칙을 이벤트에도 적용하려면 `["m": jsonString]`으로 넘긴다(`receive`는 문자열도 받는다).
- 백그라운드 스레드에서 resolve하면 main으로 넘긴 뒤 reply한다. WebKit의 reply 블록은 `WK_SWIFT_UI_ACTOR`(@MainActor)다.

### 4.3 §5 에셋 서빙
- SPA 폴백: 확장자 없는 경로 → index.html. 확장자가 있는데 파일이 없으면 → **404**(아키텍처 §5 결정표와 같음). 프로토타입은 "Accept에 text/html이 있으면 폴백"을 더했지만 akan-native 공통 규칙은 결정표를 따른다.
- Range(IN-5)는 30줄이면 된다. 단일 범위, suffix, 416을 처리한다.
- `/__akan_native/file/<id>`도 같은 경로로 서빙한다(Range 포함). 파일 등록부는 스레드 안전하게(NSLock) 만들고, 실행할 때마다 `tmp/akan-native-files`를 비운다.
- 응답 헤더: `Content-Type`(텍스트는 `; charset=utf-8`), `Content-Length`, `Cache-Control: no-cache`(init.js는 `no-store`), `Accept-Ranges: bytes`.
- **stop 규칙**: 응답(`didReceive`·`didFinish`)은 main에서만 보내고, 보내기 직전에 `active` 집합을 확인한다. 파일 읽기는 백그라운드에서 해도 된다.
- 쿠키는 `app://`에서 동작하지 않는다. 서버 세션은 `Authorization` 헤더 방식을 쓰도록 WV-4 문서에 적는다.

### 4.4 §6 플러그인 규격 (Swift 형태)
- **언어 모드**: `-swift-version 6`에서 경고 없이 빌드하려면 `@MainActor protocol AkanNativePlugin`, `@MainActor final class AkanNativePluginContext`, `AkanNativeCall: @unchecked Sendable`(NSLock + reply를 main으로), WebKit 블록은 `@escaping @MainActor`로 받는다. 초기 구현 쪽 프로토콜에는 `@MainActor`가 없었다.
- 메서드 목록은 `native-plugin.json`의 `methods`에 있으므로 Swift의 `static var methods`는 필요 없다.
- 구독: `startListening`/`stopListening`. **페이지 재로드 때 stop을 부르는 것**(`didStartProvisionalNavigation`)만 지키면 된다.
- 권한 흐름(PL-5): 플러그인이 Info.plist 키가 있는지 **먼저 확인한다**(`Bundle.main.object(forInfoDictionaryKey:)`). 없으면 INTERNAL(구성 오류). TCC 강제 종료를 막기 위해서다. 빌드는 manifest의 `ios.infoPlist`를 합친다.
- 컨텍스트: `viewController`(표시할 때는 맨 위 `presentedViewController`를 따라간다), `webView`(blur, 겹침 계산), `windowScene`(자기 scene만 거르기), `emit`, `registerFile`.

### 4.5 hook별 iOS 구현 메모
- **app-state**: UIScene 알림 4개, `note.object`가 자기 windowScene인지 확인. 초깃값은 `activationState`. willEnterForeground는 RN처럼 background. 권한 알림·제어 센터·앱 전환기에서는 inactive가 온다.
- **preferences**: `UserDefaults(suiteName: "akan-native.preferences")`, `keys`는 `persistentDomain(forName:)`, `clear`는 `removePersistentDomain(forName:)`.
- **keyboard**: `keyboardWillChangeFrame`(+ willHide에서 0으로 보정)로 겹침 높이를 계산한다. 이벤트에 `duration`을 넣을 수 있다. `hide` = JS `activeElement.blur()` + `endEditing(true)`. 보조 막대 숨김은 선택 설정(`AkanNativeWebView.inputAccessoryView`). 페이지가 스스로 `focus()`해도 키보드가 뜨지 않는 것은 플랫폼 제약이다.
- **camera**: `"camera"`는 `UIImagePickerController(.camera)`, 시뮬레이터이거나 카메라가 없으면 UNSUPPORTED. `"library"`는 인자 없는 `PHPickerConfiguration()`(권한 불필요). 기본값: 카메라가 있으면 camera, 없으면 library(시뮬레이터 샘플은 library로 간다). `UIGraphicsImageRenderer(format.scale=1)`로 방향 보정 + JPEG → `tmp/akan-native-files/photo-<uuid>.jpg` → `registerFile`. 코드로 dismiss하면 delegate가 불리지 않으므로 직접 CANCELLED로 끝낸다. 처리 중 두 번째 호출은 거절한다.

### 4.6 §8 빌드 파이프라인 (iOS 열)
- 컴파일: `xcrun -sdk iphonesimulator swiftc -target arm64-apple-ios26.0-simulator -sdk <path> -swift-version 6 -parse-as-library -module-name <Module> -Onone -g | -Osize <셸 + 플러그인 + AkanNativeGeneratedPlugins.swift> -o <App>.app/<exe>`. 시스템 프레임워크는 import로 자동 링크된다.
- 조립: `<App>.app/{<exe>, Info.plist, app/, boot.json, env.runtime.json, shell.json}`.
- 서명: 시뮬레이터에는 필요 없다. `codesign -s - --timestamp=none`은 무해하다.
- 실행: `simctl list -j`로 런타임과 기기를 찾고, 없으면 `simctl create`, 부팅되지 않았으면 `simctl boot` + `bootstatus -b` → `install` → `launch --console-pty --terminate-running-process`.

### 4.7 요구사항 표에 반영
- WV-1: `app://localhost`는 secure context다 [검증].
- WV-2: `isInspectable=true`는 설정만 확인했다. Safari 연결은 [미검증].
- SH-4: 외부 링크, `target=_blank`, `mailto:`를 모두 `decidePolicyFor`에서 cancel하고 `UIApplication.open`한다. scene이 foregroundActive일 때만 여는 조건을 권한다.
- SH-3: 설정 색을 VC 루트 뷰, WKWebView, scrollView, underPage, window에 모두 칠한다.

### 4.8 CLI(`akan-native run ios`)가 처리할 상황
- 기기 없음 → 기기를 만든다.
- 여러 기기가 부팅되어 있음 → UDID를 지정한다.
- 권한 프롬프트 → dev 자동 테스트에서는 `simctl privacy grant camera|photos`.
- 앱 데이터 초기화 → `simctl uninstall`. 덮어서 install하면 데이터가 남는다 [검증].

## 5. 남은 위험

| 위험 | 상태 | 대응 |
|---|---|---|
| 실제 사진 **선택·촬영** 결과 경로(PHPicker `loadObject`, 카메라 delegate) | 탭이 필요해 미검증. 처리 파이프라인은 합성 이미지로 검증함 | 사람이 시뮬레이터에서 한 번 탭해 본다 |
| iOS 26 시뮬레이터 카메라 UI에서 셔터를 탭했을 때 이미지가 오는지 | 미검증 | 오지 않으면 지금처럼 시뮬레이터는 UNSUPPORTED |
| 회전, iPad, 떠 있는·분리된 키보드, Stage Manager | 미검증 | 겹침 계산은 frame 교차로 해 두었다. iPad는 이후 |
| 실제 탭으로 입력에 포커스했을 때 키보드·스크롤 동작 | `evaluateJavaScript` focus로만 확인 | 샘플 앱에서 수동 확인 |
| Safari Web Inspector 연결 | 미검증 | M3에서 수동 확인 |
| getUserMedia(iOS WKWebView) | 시뮬레이터에 카메라가 없어 미검증 | iOS는 네이티브 camera를 쓰므로 MVP 영향 없음 |
| 서드파티 https API의 쿠키 | 미검증 | WV-4 문서에 토큰 방식을 권장 |
| `JSONSerialization` 예외 | 플러그인이 직접 JSON을 만들면 위험 | 플러그인 API는 `[String: Any]`만 받고 직렬화는 브리지가 한다(검사 포함) |
| 파일 서빙이 파일 전체를 메모리에 읽음(`mappedIfSafe`) | 큰 동영상에서 느려질 수 있음 | Range가 있으므로 WebKit이 나눠 요청한다 |
| 실기기와 배포(DT* 키, 서명) | MVP 범위 밖 | CLI-9 때 xcodebuild가 만든 plist와 비교한다 |
| Swift 동시성 규칙이 서드파티 플러그인 작성을 어렵게 함 | 설계 선택 | `@MainActor` 프로토콜과 "resolve는 아무 스레드에서" 규칙 |

**시뮬레이터 상태**: 기기 `iPhone 17 Pro (0F40880D-CF6E-4A71-B9C6-3A461601955D)`를 새로 만들어 부팅해 두었다. light 모드, `com.akanjs.proto` 설치, camera 권한 reset, 사진 보관함에 테스트 사진 1장. 스크린샷은 프로토타입 폴더의 `shots/`에 있다.
