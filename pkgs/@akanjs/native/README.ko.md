# @akanjs/native

Akan.js의 네이티브 런타임입니다. 앱의 CSR 빌드(번들을 인라인한 HTML 파일 하나와 `public/`)를 iOS,
Android, macOS, Windows, Linux 앱으로 만듭니다. Capacitor, Xcode 프로젝트, Gradle, CocoaPods는 쓰지
않습니다.

이 패키지는 akanjs 내부용입니다. 따로 배포하지 않습니다(`private: true`).
- akanjs가 이 패키지를 `dist/vendor/`로 복사합니다.
- 앱은 `akanjs/native` 래퍼를 씁니다.
- akanjs devkit은 빌드 API를 부릅니다.

문서에서는 줄여서 akan-native라고 부릅니다.

## 구성

| 부분 | 위치 | 하는 일 |
|---|---|---|
| 페이지 런타임 | `packages/core`, `packages/react` | WebView 안의 브리지 클라이언트, `definePlugin`, env, React 훅 |
| 플러그인 | `plugins/<id>` | 41개. TypeScript API, 웹 대체 구현, Swift·Kotlin·데스크톱 코드를 `native-plugin.json`이 기술합니다 |
| iOS 셸 | `native/ios` | Swift: WKWebView, `app://` 스킴 핸들러, 응답형 브리지 |
| Android 셸 | `native/android` | Kotlin: WebView, MessagePort 브리지, 에셋 서버. push(FCM)와 iap(Play Billing) 모듈용 Maven 잠금도 여기 있습니다 |
| 데스크톱 셸 | `native/desktop`, `packages/desktop` | Rust cdylib(TAO + WRY, C ABI). 플러그인 호스트는 Bun Worker에서 돕니다 |
| 빌드 도구 | `packages/cli` | 설정, 프로그램 빌드 API, 플랫폼별 빌더. Swift는 `swiftc`로, Android는 aapt2·kotlinc·d8·apksigner로, 데스크톱은 cargo와 `bun build --compile`로 빌드합니다 |

## 진입점

| import | 내용 |
|---|---|
| `@akanjs/native/api` | akanjs devkit용 빌드 API: `build`, `run`, `dev`, `release`, `validateConfig` ([docs/api.md](docs/api.md)) |
| `@akanjs/native/config` | `defineConfig`와 설정 타입 |
| `@akanjs/native/core` | 페이지 런타임: `platform`, `env`, `AkanNativeError`, `fileBlob`, `definePlugin` |
| `@akanjs/native/react` | `useLiveValue`, `usePluginEvent` |
| `@akanjs/native/plugins/<id>` | 플러그인의 페이지 API. 예: `@akanjs/native/plugins/camera` |
| `@akanjs/native/desktop` | 데스크톱 플러그인 코드용 `defineDesktopPlugin` |

설정의 플러그인은 내장 id(`"camera"`)나 플러그인 폴더의 절대경로로 적습니다. akanjs는 절대경로를 넘깁니다.

## akanjs에 넣을 때

- 패키지 안의 모듈은 서로 상대 경로로 import합니다. 그래서 복사본은 그대로 동작합니다. 고쳐 써야 하는 것은 akanjs 쪽의 `@akanjs/native/...` import뿐입니다.
- 패키지 루트는 `package.json`이 아니라 `native/android/maven.lock.json`을 찾아 올라가며 정합니다.
  - 복사할 때 `package.json`, `tsconfig.json`, `docs/`, `scripts/`, `examples/`, 모든 `test/` 폴더는 빼도 됩니다.
  - 반드시 남길 것: `packages/*/src`, `packages/core/vectors`(debug 빌드가 넣습니다), `test/`를 뺀 `plugins/*`, `native/`
- 빌드 산출물은 패키지 밖에 둡니다.
  - 앱 빌드는 부르는 쪽이 넘기는 `outDir`에 둡니다(기본 `<앱>/.akan/native/build/<platform>`).
  - 툴체인, 키, 캐시는 `~/.akan/native`(`AKAN_NATIVE_HOME`)에 둡니다.
  - Cargo 빌드는 `~/.akan/native/cache/desktop-target`(`CARGO_TARGET_DIR`)에 둡니다.

## 필요한 것

- Bun 1.4 이상
- iOS: Xcode 26 이상. 앱은 iOS 16 이상에서 돕니다.
- Android: Android SDK(build-tools 35 이상, 37 권장, platform 36)와 JDK 21(Android Studio의 JBR도 됩니다). SDK 라이선스는 직접 수락해야 합니다. 앱은 Android 10(API 29) 이상에서 돕니다.
- 데스크톱: rustup으로 설치한 Rust. 버전은 `native/desktop/rust-toolchain.toml`에 고정되어 있습니다.
- kotlinc, bundletool, 고정한 Maven 라이브러리는 `~/.akan/native`로 받습니다. 받을 때 각각 고정된 SHA-256으로 검사합니다. Android SDK 라이선스는 대신 수락하지 않습니다.

## 개발

```sh
bun install
bun test                                     # TypeScript 테스트
bun run typecheck
bun scripts/native-vectors.ts                # 공유 벡터를 Swift·Kotlin 커널로 실행
CARGO_TARGET_DIR=~/.akan/native/cache/desktop-target/dev cargo test --manifest-path native/desktop/Cargo.toml

bun run akan-native doctor                   # 툴체인: 고정 버전과 찾은 것 비교
bun run akan-native test macos --app examples/sample     # 샘플 앱 셀프 테스트(ios, android, web도)
bun run akan-native test android --app examples/sample --avd <이름>
bun scripts/vm/linux.ts bun run akan-native test linux --app examples/sample   # Docker 안의 Linux
bun scripts/vm/windows.ts test               # SSH로 붙는 VM의 Windows
```

`bun run akan-native`은 이 패키지를 개발할 때 쓰는 CLI입니다(셀프 테스트, 툴체인, doctor, 플러그인
코드 생성). 앱 빌드는 `akan`과 API로 합니다.

## 문서

- [docs/api.md](docs/api.md): akanjs devkit이 부르는 빌드 API
- [docs/architecture.md](docs/architecture.md): 셸, 브리지 프로토콜, 보안 계층, 빌드와 서명
- [docs/plugins.md](docs/plugins.md): 플러그인과 플랫폼별 지원
- [docs/plugin-authoring.md](docs/plugin-authoring.md): 플러그인 작성법
- [docs/requirements.md](docs/requirements.md): 요구사항과 결정
- [docs/testing-windows-linux.md](docs/testing-windows-linux.md): Mac에서 Windows·Linux 테스트하기
- [docs/move-checklist.md](docs/move-checklist.md): akanjs로 옮기기 전 확인(`bun scripts/move-check.ts`)

## 라이선스

MIT입니다. [LICENSE](LICENSE)를 보세요. 서드파티 소프트웨어는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다.
