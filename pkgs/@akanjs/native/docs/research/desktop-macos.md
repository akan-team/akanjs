# macOS 데스크톱 계층(M2) 사전 검증 보고서

> 작성 2026-09-25 · 대상: [architecture.md](../architecture.md) §3.3·§4·§5·§9, [requirements.md](../requirements.md) Q2·Q3·Q4
> 환경: macOS 26.6.2 (Apple Silicon), Bun 1.4.2, rustc 1.98.1, crates.io `wry 0.57.0`·`tao 0.37.0` (클론 소스의 `Cargo.toml` 버전과 같다. crates.io 최신도 이 버전)
> 프로토타입: `/private/tmp/claude-501/-Users-kangminseon-github-study/a6137b94-0c15-4f44-a151-6d5bde136a1d/scratchpad/proto-desktop/` (scratchpad라 지워질 수 있어서 코드 전문을 §2에 넣었다)
> 표기: **[실행]** 이번에 직접 돌려서 확인 · **[코드]** 소스를 읽어서 확인 · **[추정]** 관찰·코드에서 추론 · **[미확인]** 확인하지 못함

## 1. 결론 요약

### Q2. `bun build --compile` 실행 파일 하나에 Worker 엔트리를 넣을 수 있나 → **된다 [실행]**
- `bun build --compile ./js/main.ts ./js/host.ts --outfile <exe>`로 두 엔트리가 한 파일에 들어간다. main에서 `new Worker(new URL("./host.ts", import.meta.url).href)`와 `new Worker("./host.ts")` **둘 다** 동작했다. 컴파일 결과물을 셸에서 바로 실행한 경우와 `.app` 안에 넣고 `open`으로 실행한 경우 모두 확인했다.
- host.ts를 엔트리에 넣지 않으면 실행 중 Worker `error`: `BuildMessage: ModuleNotFound resolving "/$bunfs/root/host.ts" (entry point)`. Worker 엔트리는 자동으로 감지되지 않는다.
- 컴파일된 코드의 `import.meta.url`은 `file:///$bunfs/root/<outfile 이름>`이다(엔트리 파일 이름이 아니다). `process.execPath`는 실제 실행 파일의 절대 경로(`…/AkanNative Proto.app/Contents/MacOS/akan-native-proto`)여서, `open`으로 띄워 cwd가 `/`여도 `dirname(execPath)/../Frameworks`, `../Resources`로 경로를 만들 수 있다.
- 크기: Bun 런타임 61,884,464 B → 실행 파일 62,226,930 B (+0.34 MB). `--minify`는 차이 없음. `--minify --bytecode --format=esm`은 62,540,658 B이고 동작한다(`--format=esm` 없이 `--bytecode`만 주면 main.ts의 top-level await 때문에 빌드가 실패한다). `.app` 전체 60 MB(du), dylib 0.87 MB.

### Q3. Worker에서 만든 threadsafe JSCallback을 네이티브가 부르면 어디서 실행되나 → **그 Worker 스레드에서, 호출자를 막지 않고 [실행]**
- wake를 부른 스레드: main(커스텀 프로토콜 핸들러, NSNotification 블록)과 Rust가 만든 백그라운드 스레드. drain이 실행된 스레드는 **항상 Worker 스레드**였다(`pthread_threadid_np`로 비교, 232회 중 232회).
- 호출자는 기다리지 않는다. `wake()` 반환까지 1–23 µs(248회 측정). Worker가 JS에서 1초 동안 busy loop를 돌고 있을 때도 main의 wake 호출은 3 µs 만에 돌아왔고, 메시지는 Worker가 풀린 뒤 처리됐다. Bun이 Worker 이벤트 루프에 작업을 넣고 바로 반환한다.
- main 스레드가 `akan_native_run`(TAO → `[NSApp run]`) 안에 계속 머물러도 Worker 이벤트 루프는 정상이다. `setInterval`·`setTimeout`·`Bun.spawnSync`·`console.log`가 모두 동작했다. 반대로 **main 스레드의 JS는 akan_native_run 이후 한 줄도 실행되지 않는다**(`worker.onmessage`·`worker.onerror` 포함).
- 반드시 지켜야 할 점. 모두 재현했다.
  1. **Worker는 이벤트 루프가 비면 바로 종료된다.** JSCallback은 루프를 붙잡지 않는다. 종료된 Worker의 JSCallback을 네이티브가 부르면 프로세스 전체가 `SIGSEGV at 0x8`로 죽는다(Bun crash 출력, `~/Library/Logs/DiagnosticReports/bun-2026-09-24-2337*.ips`의 스택 `libakan_native_desktop → JIT 코드`). `setInterval(() => {}, 2 ** 31 - 1)`이나 `self.onmessage = () => {}` 하나로 해결된다(둘 다 확인).
  2. **Worker에서 잡히지 않은 예외가 나면 Worker가 exit(1)로 끝난다.** 에러는 main의 `error` 이벤트로만 가는데 main이 막혀 있어서 아무 데도 출력되지 않는다. Worker 안에 `process.on("uncaughtException")`을 등록하면 Worker가 살아남는다. drain은 메시지마다 try/catch로 감싼다.
  3. drain이 예외로 중간에 끊기면 "wake 합치기" 플래그가 선 채로 남아 이후 요청이 전부 멈췄다. `akan_native_poll`을 부를 때마다 플래그를 내리도록 바꿔서 해결했다(§2.4).
  4. Worker가 끝날 때 `akan_native_set_wake(NULL)`을 부르면 크래시 대신 보류 중인 IPC와 이후 IPC가 503으로 끝난다.
- **`akan_native_respond`를 Worker에서 그대로 실행하면(wry responder를 Worker 스레드에서 호출) main이 바쁜 동안 Worker도 멈춘다.** main을 1.5초 재운 상태에서 호출하니 1,200 ms 동안 반환하지 않았고, 반환 시점이 main이 풀린 시점과 같았다. WebKit이 `WKURLSchemeTask` 호출을 main으로 넘기고 끝날 때까지 기다리는 것으로 보인다 [추정]. responder를 `EventLoopProxy`로 main에 넘겨서 응답하게 바꾸니 Worker 쪽 호출은 0.0 ms에 끝났고, 페이지가 응답을 받는 시점은 같았다. 이것을 기본값으로 했다.

### Q4. `app://`가 보안 컨텍스트로 인정돼 getUserMedia가 되나 → **보안 컨텍스트 O, API O, 권한 흐름 O. 영상 수신은 [미확인]**
- [실행] `location.origin === "app://localhost"`, `window.isSecureContext === true`, `navigator.mediaDevices.getUserMedia`는 function, `enumerateDevices()`는 `["audioinput","videoinput"]`. 보안 컨텍스트 전용인 `crypto.subtle`·`navigator.clipboard`·`serviceWorker`도 있다.
- [실행] `getUserMedia({ video: true })`를 부르면 **macOS TCC 카메라 프롬프트가 먼저 뜬다**(tccd 로그 `AUTHREQ_PROMPTING … service=kTCCServiceCamera, subject=com.akanjs.proto`). 사용자가 응답한 **다음에** wry permission handler(`WKUIDelegate webView:requestMediaCapturePermissionForOrigin:…`)가 `PermissionKind::Camera`로 불렸다(프롬프트 23:45:47.870 → 응답 23:45:49.9 → handler 호출이 앱 시작 후 2,689 ms). handler가 `Deny`를 반환하면 `NotAllowedError`. 따라서 **우리 handler로 "시스템 프롬프트 없이 거절"은 할 수 없다.**
- [실행] Info.plist에 `NSCameraUsageDescription`이 없는 빌드에서는 getUserMedia Promise가 끝나지 않았다(2회 모두, handler도 불리지 않음). 같은 `Promise.race`에 넣은 6초 타이머도 끝내 settle되지 않았다(원인 미확인). → `NSCameraUsageDescription`은 필수.
- [실행] ad-hoc 서명은 빌드할 때마다 cdhash가 바뀐다. 재빌드 후 tccd가 `Failed to match existing code requirement for subject com.akanjs.proto and service kTCCServiceCamera`를 남겼다. 이전 빌드에서 받은 허용·거부가 다음 빌드에 적용되지 않는다는 뜻이다 [추정: 설명 문구가 있는 빌드에서 재프롬프트가 뜨는지는 사용자 방해를 피하려고 다시 확인하지 않았다].
- [미확인] 사용자가 "허용"을 누른 뒤 실제로 스트림을 받는지. 사용자 클릭이 필요해서 확인하지 않았다(검증 중 TCC 프롬프트가 한 번 떴고 사용자가 응답했다).
- [실행] `<input type=file>`: 사용자 제스처(합성 키 입력) 안에서 `input.click()` → wry의 `runOpenPanel` 구현이 `NSOpenPanel`을 modal로 띄웠다(`NSApp.modalWindow`의 클래스 = `NSKVONotifying_NSOpenPanel`). `abortModal` 하면 페이지에 `cancel` 이벤트가 온다. `plugins/camera/src/web.ts`의 `pickFile` 경로는 macOS에서 파일 선택 창이 된다(`capture` 속성은 무시됨 [추정]).

### 그 밖의 핵심 결과
| 항목 | 결과 |
|---|---|
| POST body [실행] | string(0 B–5 MB, 한글·이모지), Uint8Array(64 KB), ArrayBuffer(300 KB, **20 MB**), 문자열만 든 FormData, URLSearchParams 모두 길이·FNV 해시 일치. **`Blob`과 Blob이 든 FormData는 0바이트로 도착한다.** `await blob.arrayBuffer()`로 바꿔 보내면 정상 |
| 요청 헤더 [실행] | 같은 오리진 fetch POST에 **`Origin` 헤더가 없다.** `Referer: app://localhost/`만 온다. 샌드박스 iframe(opaque origin)의 cors 요청은 `Origin: null`, no-cors 요청은 Origin 없음 + `Referer: about:srcdoc`. 커스텀 스킴에는 **CORS preflight가 없다**: 비표준 헤더를 붙인 교차 오리진 요청도 핸들러까지 온다 |
| 편집 단축키 [실행] | 메뉴가 없으면 Cmd+A/C/V/Z/Q가 모두 동작하지 않는다(JS `keydown`은 온다). §2.4의 기본 NSMenu를 설치하면 모두 동작한다(전체 선택 0–11, 클립보드에 "hello world", 붙여넣기, 되돌리기, Cmd+Q 종료) |
| 앱 상태 [실행] | 최소화·앱 숨김·완전히 가려짐 → WKWebView의 `document.visibilityState`가 `hidden`, 포커스를 잃으면 `blur`. 네이티브 신호와 같은 시점에 바뀐다. `plugins/app-state`의 `desktop: "web"`으로 충분하다 |
| 외부 링크 [실행] | `location.href = 외부` → navigation handler, `window.open`·`target=_blank` → new window handler. 둘 다 앱 창은 그대로 남는다 |
| 늦은 응답 [실행] | 요청을 잡아 둔 채 페이지를 reload하고 1.5초 뒤에 응답해도 크래시가 없다(wry가 조용히 무시) |
| 종료 [실행] | `akan_native_quit(7)` → `LoopDestroyed` → 종료 코드 7(3·4·5·6·9도 확인). 메뉴 Quit(Cmd+Q = `terminate:`) → `LoopDestroyed` 후 **종료 코드 0으로 바로 끝난다**(Worker가 정리할 기회가 없다) |
| 성능 [실행] | echo 왕복 순차 p50 < 1 ms(페이지 타이머 해상도가 1 ms), 동시 200개 9–19 ms, 5 MB 문자열 72–129 ms, 20 MB ArrayBuffer 261–280 ms |
| 시작 시간 [실행] | 프로세스 시작 → Worker ready 15–22 ms → `pageLoad finished` 약 260–320 ms (`.app`을 `open`으로 3회, warm) |
| localStorage [실행] | `app://localhost`의 localStorage가 앱을 다시 실행해도 남아 있다(같은 bundle id) |
| 가려진 창 [실행] | 창이 가려지거나 최소화돼도 evaluate_script·IPC는 바로 처리된다. 페이지 타이머는 느려진다(500 ms 간격이 최대 약 1.5 s). `with_background_throttling(Disabled)`로 바꿔도 이 테스트에서는 차이가 없었다(그 옵션은 "창에 붙어 있지 않은 웹뷰"에 대한 정책이다 [코드] [lib.rs:2595-2604](../../../wry/src/lib.rs#L2595-L2604)) |
| 포커스 [실행] | wry는 웹뷰를 만들 때 앱을 activate한다. 테스트 중 사용자 키 입력이 테스트 창으로 들어간 적이 있다. 자동 테스트는 `ActivationPolicy::Prohibited`로 돌리면 포커스를 뺏지 않고 페이지도 정상 동작한다 |

## 2. 검증한 프로토타입

### 2.1 구성과 명령
```
proto-desktop/
├─ native/Cargo.toml, native/src/lib.rs   Rust cdylib `akan_native_desktop` (TAO + WRY, C ABI)
├─ js/ffi.ts                              경로 계산 + dlopen 심볼 정의 (main·host 공용)
├─ js/main.ts                             main 스레드: dlopen → Worker → ready 대기 → akan_native_run
├─ js/host.ts                             Worker: wake/drain/respond + 검증 시나리오
├─ app/index.html, app/public/dot.png     테스트 페이지 (자동 테스트 → 결과를 IPC로 보고)
├─ build-app.sh                           .app 조립·서명
└─ run*.log, open*.log                    실행 기록
```
```sh
P=/private/tmp/claude-501/-Users-kangminseon-github-study/a6137b94-0c15-4f44-a151-6d5bde136a1d/scratchpad/proto-desktop
source ~/.cargo/env
(cd $P/native && cargo build --release)             # 첫 빌드 약 1분, 이후 증분
# 1) 개발 실행: bun이 ts를 바로 실행 (.app 없음)
cd $P && AKAN_NATIVE_LIB=$P/native/target/release/libakan_native_desktop.dylib AKAN_NATIVE_APP_DIR=$P/app bun js/main.ts
# 2) 단일 실행 파일 (Q2)
bun build --compile ./js/main.ts ./js/host.ts --outfile out/akan-native-proto
AKAN_NATIVE_LIB=… AKAN_NATIVE_APP_DIR=… ./out/akan-native-proto
# 3) .app 조립 + ad-hoc 서명 + 실행 (stdout/stderr를 파일로)
$P/build-app.sh
open -W -n --stdout /tmp/o.log --stderr /tmp/o.log --env AKAN_NATIVE_SCENARIO=quitonly "$P/out/AkanNative Proto.app"
```
검증용 환경변수: `AKAN_NATIVE_SCENARIO=all|quitonly|keys|state|file|nav|blockonly|busy|throw|throttle`, `AKAN_NATIVE_MENU=0`, `AKAN_NATIVE_PERMISSION=allow|deny|default`, `AKAN_NATIVE_ACTIVATION=prohibited`(포커스를 뺏지 않음), `AKAN_NATIVE_SKIP_CAMERA=1`, `AKAN_NATIVE_KEEPALIVE=interval|onmessage|none`, `AKAN_NATIVE_RESPOND_MODE=inline`, `AKAN_NATIVE_QUIT=key`, `AKAN_NATIVE_TRACE_IPC=1`·`AKAN_NATIVE_TRACE_WAKE=1`·`AKAN_NATIVE_TRACE_RESPOND=1`.

### 2.2 실행 기록 (실제로 돌린 것)
| 실행 | 설정 | 결과 |
|---|---|---|
| run1 | keepalive 없음 | Worker가 1 ms 만에 `exit 0` → 첫 wake에서 `panic(main thread): Segmentation fault at address 0x8`, 종료 코드 139 |
| run2 | `self.onmessage` keepalive, `AKAN_NATIVE_TRACE_IPC` | 페이지 테스트 전부 실행. 처음에는 Origin 검사 때문에 403 → 헤더 로그로 "Origin 없음, Referer만"을 확인하고 규칙을 고침 |
| run3 | `all`, 메뉴 있음 | emit 5/5, main 블록 중 respond 1,200 ms, ticker 12개, 앱 상태, 파일 창, 외부 링크 3종, reload 후 늦은 응답 → 종료 코드 7. (이 실행의 키 테스트는 앞의 hide/unhide로 앱이 비활성이 돼서 무효 → run-keys로 다시 함) |
| run-keys-1 / -0 | 메뉴 있음 / 없음 | 있음: Cmd+A 선택 0–11, Cmd+C 클립보드 "hello world", Cmd+V "hello worldPASTED", Cmd+Z 되돌림. 없음: keydown만 오고 아무 변화 없음 |
| run-q-1 / -0 | Cmd+Q, 메뉴 있음 / 없음 | 있음: 종료 코드 0. 없음: 1.5초 뒤에도 살아 있음 → `akan_native_quit(9)` → 9 |
| run-c-url / -string | `--compile` 결과물, Worker 두 형태 | 둘 다 결과 정상, 종료 코드 7 |
| no-worker | host.ts를 엔트리에서 뺌 | `ModuleNotFound resolving "/$bunfs/root/host.ts"` |
| open.log | `.app` + `open`, 카메라 deny | TCC 프롬프트 → 사용자 응답 → handler(Deny) → `NotAllowedError` |
| open-nocam ×2 | `NSCameraUsageDescription` 없음 + allow | getUserMedia가 끝나지 않음, 앱은 알람으로 종료 |
| run-th-* | 최소화 중 타이머, throttling default/disabled | 둘 다 eval·IPC 즉시 처리, 타이머 간격 최대 약 1.5 s |
| run-throw* | 핸들러 예외 | 처리기 없음: Worker `exit 1`, 이후 멈춤. `uncaughtException` 등록: Worker 생존, 그러나 wake 플래그 때문에 멈춤 → poll마다 플래그 해제로 고친 뒤 복구 확인 |
| run-busy | Worker 1초 busy 중 main wake | wake 3 µs 반환, 메시지는 busy 끝난 뒤 처리 |
| run-resp-inline / -main | main 1.5초 블록 중 respond | inline: Worker 1,200 ms 막힘 / main 경유: 0.0 ms, 페이지 수신 시점 같음 |
| run-final-dead | keepalive 없음 + exit에서 `akan_native_set_wake(NULL)` | 크래시 없음, IPC가 503 |
| open-final, open-final2, open-t ×3 | 최종 코드 `.app` | 20 MB body, Blob 0바이트 재확인, localStorage 유지, 시작 시간 측정 |

### 2.3 Cargo.toml
macOS에 필요한 feature: `wry`는 `default-features = false`로 충분하다(기본 feature `os-webview`·`x11`은 Linux 의존성만 켠다 [코드] [wry/Cargo.toml:26-40](../../../wry/Cargo.toml#L26-L40)). `devtools`는 release 빌드에서 Web Inspector를 켜려면 필요하다(debug 빌드는 자동). `tao`는 `default-features = false, features = ["rwh_06"]`(wry가 raw-window-handle 0.6을 쓴다. `x11`·`dbus`는 Linux 전용 [tao/Cargo.toml:30-37](../../../tao/Cargo.toml#L30-L37)). 우리 코드가 직접 쓰는 `objc2`·`block2`·`objc2-foundation`·`objc2-app-kit`은 이미 wry/tao 의존성 트리에 있는 크레이트이고 feature만 더 켠다. 전체 트리는 proc-macro 포함 93개이며 serde는 없다(`cargo tree -e normal`).

```toml
[package]
name = "akan_native_desktop"
version = "0.0.1"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib"]

[dependencies]
# macOS: wry 기본 feature(os-webview, x11)는 Linux 전용 의존성만 켠다 → 끈다.
# devtools: release 빌드에서도 isInspectable/developerExtrasEnabled 를 켤 수 있게 (private KVC 포함)
wry = { version = "=0.57.0", default-features = false, features = ["devtools"] }
# tao 기본 feature = rwh_06 + x11 + dbus. macOS 에서는 rwh_06 (wry 가 raw-window-handle 0.6 사용) 만 필요.
tao = { version = "=0.37.0", default-features = false, features = ["rwh_06"] }

[target.'cfg(target_os = "macos")'.dependencies]
# wry/tao 가 이미 끌어오는 크레이트. 우리 쪽에서 feature 만 추가한다 (메뉴, 알림 옵저버, 키 이벤트 합성).
objc2 = "0.6"
block2 = "0.6"
objc2-foundation = { version = "0.3", default-features = false, features = ["std", "NSString", "NSNotification", "NSOperation", "NSObject", "NSThread", "NSURL"] }
objc2-app-kit = { version = "0.3", default-features = false, features = ["std", "NSApplication", "NSMenu", "NSMenuItem", "NSResponder", "NSEvent", "NSWindow", "NSGraphicsContext", "NSRunningApplication", "NSWorkspace"] }

[profile.release]
opt-level = "s"
lto = true
codegen-units = 1
strip = true
panic = "abort"
```

### 2.4 native/src/lib.rs (전문)
설계 요점
- 네이티브 → JS 메시지는 **바이너리 프레임** `[u8 kind][u64 reqId LE][u32 webviewId LE][body]`. kind 1 = IPC 요청(body는 페이지가 보낸 바이트 그대로), kind 2 = 네이티브 이벤트(JSON). Rust 쪽에 JSON 직렬화가 필요 없고, body를 이스케이프하지 않는다.
- wake 합치기: 큐가 비어 있다가 처음 들어올 때만 wake. `akan_native_poll`을 부를 때마다 플래그를 내린다(drain 중단 후 복구).
- `akan_native_respond`는 responder를 main으로 보낸다(`UserEvent::Respond`). 호출한 Worker는 바로 돌아온다.
- 설정 JSON은 외부 크레이트 없이 작은 파서(`mod json`)로 읽는다.
- `macos::debug`는 검증용(키 합성, main 블록, 최소화 등)이다. 제품 코드에는 넣지 않는다.

```rust
//! akan_native_desktop 프로토타입: TAO + WRY 를 bun:ffi 용 C ABI 로 감싼다 (macOS).
//!
//! 스레드 규칙
//! - akan_native_run: 프로세스 main 스레드에서만. 반환하지 않는다 (tao run -> process::exit).
//! - 나머지 akan_native_*: 아무 스레드에서나 호출 가능. UI 작업은 EventLoopProxy 로 main 에 넘긴다.
//! - 네이티브 -> JS: 큐에 쌓고 wake() 만 부른다 (데이터 없는 신호). JS 가 akan_native_poll 로 꺼낸다.
#![allow(clippy::missing_safety_doc)]

use std::{
  collections::{HashMap, VecDeque},
  ffi::{c_char, c_void, CStr},
  path::{Component, Path, PathBuf},
  ptr::NonNull,
  sync::{
    atomic::{AtomicU64, AtomicUsize, Ordering},
    LazyLock, Mutex, OnceLock,
  },
  time::{Duration, Instant},
};

use tao::{
  dpi::LogicalSize,
  event::{Event, StartCause, WindowEvent},
  event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy},
  platform::macos::WindowExtMacOS,
  window::{Window, WindowBuilder},
};
use wry::{
  http::{header::CONTENT_TYPE, Request, Response},
  BackgroundThrottlingPolicy,
  NewWindowResponse, PageLoadEvent, PermissionKind, PermissionResponse, RequestAsyncResponder,
  WebView, WebViewBuilder,
};

// ───────────────────────── 스레드 정보 (디버그/검증용) ─────────────────────────
extern "C" {
  fn pthread_main_np() -> i32;
  fn pthread_self() -> *mut c_void;
  fn pthread_threadid_np(thread: *mut c_void, id: *mut u64) -> i32;
}
fn thread_info() -> (bool, u64) {
  unsafe {
    let mut id = 0u64;
    pthread_threadid_np(pthread_self(), &mut id);
    (pthread_main_np() == 1, id)
  }
}
/// 상위 1비트 = main 스레드 여부, 나머지 = OS thread id
#[no_mangle]
pub extern "C" fn akan_native_thread_info() -> u64 {
  let (main, id) = thread_info();
  ((main as u64) << 63) | (id & 0x7fff_ffff_ffff_ffff)
}
static T0: LazyLock<Instant> = LazyLock::new(Instant::now);
macro_rules! log {
  ($($arg:tt)*) => {{
    let (main, tid) = thread_info();
    eprintln!("[native {:>7.1}ms {} tid={}] {}", T0.elapsed().as_secs_f64() * 1000.0,
      if main { "MAIN" } else { "bg  " }, tid, format!($($arg)*));
  }};
}

// ───────────────────────── 네이티브 -> JS 큐 ─────────────────────────
// 프레임(바이너리, little endian): [u8 kind][u64 reqId][u32 webviewId][body...]
//   kind 1 = IPC 요청 (body = 페이지가 POST 한 바이트 그대로)
//   kind 2 = 네이티브 이벤트 (body = JSON 텍스트)
const HDR: usize = 13;
struct Queue {
  items: VecDeque<Vec<u8>>,
  wake_pending: bool,
}
static QUEUE: Mutex<Queue> = Mutex::new(Queue { items: VecDeque::new(), wake_pending: false });
static WAKE: AtomicUsize = AtomicUsize::new(0);
static PENDING: LazyLock<Mutex<HashMap<u64, RequestAsyncResponder>>> =
  LazyLock::new(|| Mutex::new(HashMap::new()));
static NEXT_REQ: AtomicU64 = AtomicU64::new(1);
static PROXY: OnceLock<Mutex<EventLoopProxy<UserEvent>>> = OnceLock::new();
/// 기본 = main 스레드에서 응답 (검증: inline 이면 main 이 바쁠 때 Worker 가 그만큼 막힌다). AKAN_NATIVE_RESPOND_MODE=inline 으로 비교 가능
static RESPOND_ON_MAIN: LazyLock<bool> = LazyLock::new(|| std::env::var("AKAN_NATIVE_RESPOND_MODE").as_deref() != Ok("inline"));

fn frame(kind: u8, req_id: u64, webview_id: u32, body: &[u8]) -> Vec<u8> {
  let mut v = Vec::with_capacity(HDR + body.len());
  v.push(kind);
  v.extend_from_slice(&req_id.to_le_bytes());
  v.extend_from_slice(&webview_id.to_le_bytes());
  v.extend_from_slice(body);
  v
}

fn call_wake() {
  let f = WAKE.load(Ordering::Acquire);
  if f != 0 {
    let f: extern "C" fn() = unsafe { std::mem::transmute(f) };
    let t = Instant::now();
    f();
    let us = t.elapsed().as_micros();
    if std::env::var_os("AKAN_NATIVE_TRACE_WAKE").is_some() {
      log!("wake() returned after {us}us");
    }
  }
}

/// 큐에 넣고, JS 가 아직 깨어나지 않았으면 wake 한 번. (wake 를 합쳐서 JS 큐 폭주를 막는다)
fn push(msg: Vec<u8>) {
  let need_wake = {
    let mut q = QUEUE.lock().unwrap();
    q.items.push_back(msg);
    let need = !q.wake_pending;
    q.wake_pending = true;
    need
  };
  if need_wake {
    call_wake();
  }
}

fn push_event(json: &str) {
  push(frame(2, 0, 0, json.as_bytes()));
}

/// Worker 가 wake 콜백을 등록한다. null 을 넘기면(Worker 종료 시) 보류 중인 IPC 를 모두 503 으로 끝내고,
/// 이후 IPC 도 503 으로 거절한다 (죽은 JSCallback 을 부르면 프로세스가 segfault 한다 — 검증함)
#[no_mangle]
pub extern "C" fn akan_native_set_wake(f: Option<extern "C" fn()>) {
  WAKE.store(f.map_or(0, |f| f as usize), Ordering::Release);
  if f.is_none() {
    let pending: Vec<_> = PENDING.lock().unwrap().drain().collect();
    for (_, r) in pending {
      send(UserEvent::Respond(r, Response::builder().status(503).body(b"host gone".to_vec()).unwrap()));
    }
    return;
  }
  let need = {
    let mut q = QUEUE.lock().unwrap();
    if !q.items.is_empty() {
      q.wake_pending = true;
      true
    } else {
      false
    }
  };
  if need {
    call_wake();
  }
}

/// 다음 메시지를 buf 에 복사한다. 0 = 없음.
/// 메시지가 cap 보다 크면 소비하지 않고 필요한 크기를 반환한다.
/// poll 을 부를 때마다 wake_pending 을 내린다: JS drain 이 중간에 예외로 끊겨도
/// 다음 push 가 다시 wake 하도록 (검증: 빈 큐에서만 내리면 drain 예외 후 영구 정지)
#[no_mangle]
pub unsafe extern "C" fn akan_native_poll(buf: *mut u8, cap: u32) -> u32 {
  let mut q = QUEUE.lock().unwrap();
  q.wake_pending = false;
  match q.items.front() {
    None => 0,
    Some(m) if m.len() > cap as usize => m.len() as u32,
    Some(_) => {
      let m = q.items.pop_front().unwrap();
      std::ptr::copy_nonoverlapping(m.as_ptr(), buf, m.len());
      m.len() as u32
    }
  }
}

/// 아무 스레드에서나 호출. 보류 중인 커스텀 프로토콜 요청을 완료한다.
#[no_mangle]
pub unsafe extern "C" fn akan_native_respond(
  req_id: u64,
  status: u16,
  content_type: *const c_char,
  body: *const u8,
  len: u32,
) {
  let Some(responder) = PENDING.lock().unwrap().remove(&req_id) else {
    log!("akan_native_respond: unknown reqId {req_id}");
    return;
  };
  let ct = if content_type.is_null() {
    "application/octet-stream".to_string()
  } else {
    CStr::from_ptr(content_type).to_string_lossy().into_owned()
  };
  let body = if len == 0 { Vec::new() } else { std::slice::from_raw_parts(body, len as usize).to_vec() };
  let resp = Response::builder()
    .status(status)
    .header(CONTENT_TYPE, ct)
    .header("Cache-Control", "no-store")
    .body(body)
    .unwrap();
  let t = Instant::now();
  if *RESPOND_ON_MAIN {
    // 기본: main 스레드로 넘겨서 응답 (호출한 Worker 는 막히지 않는다. WKWebView/task 해제도 main 에서)
    send(UserEvent::Respond(responder, resp));
  } else {
    // 비교용(inline): 호출한 스레드에서 바로 응답. WebKit 이 main 으로 동기 전환하므로 main 이 바쁘면 여기서 막힌다
    responder.respond(resp);
  }
  let us = t.elapsed().as_micros();
  if us > 2000 || std::env::var_os("AKAN_NATIVE_TRACE_RESPOND").is_some() {
    log!("akan_native_respond(reqId={req_id}) took {us}us");
  }
}

#[no_mangle]
pub unsafe extern "C" fn akan_native_emit(webview_id: u32, js: *const c_char) {
  let js = CStr::from_ptr(js).to_string_lossy().into_owned();
  send(UserEvent::Emit { webview_id, js });
}

#[no_mangle]
pub extern "C" fn akan_native_quit(code: i32) {
  send(UserEvent::Quit(code));
}

/// 프로토타입 전용: main 스레드에서 디버그 명령 실행 (최소화, 키 합성, main 블록 등)
#[no_mangle]
pub unsafe extern "C" fn akan_native_debug(cmd: *const c_char) {
  let cmd = CStr::from_ptr(cmd).to_string_lossy().into_owned();
  send(UserEvent::Debug(cmd));
}

fn send(ev: UserEvent) {
  if let Some(p) = PROXY.get() {
    let _ = p.lock().unwrap().send_event(ev);
  }
}

enum UserEvent {
  Respond(RequestAsyncResponder, Response<Vec<u8>>),
  Emit { webview_id: u32, js: String },
  Quit(i32),
  Debug(String),
}

// ───────────────────────── 설정 ─────────────────────────
struct Config {
  title: String,
  width: f64,
  height: f64,
  app_dir: PathBuf,
  url: String,
  devtools: bool,
  menu: bool,
  background: (u8, u8, u8, u8),
  permission: String, // "allow" | "deny" | "default"
  init_js: String,
  external: String, // "open" | "log"
  throttling: String, // "default" | "disabled" | "suspend" | "throttle"
  activation: String, // "regular" | "prohibited"(테스트용: 포커스를 뺏지 않음)
}

fn parse_config(s: &str) -> Result<Config, String> {
  let j = json::parse(s)?;
  let get_s = |k: &str, d: &str| j.get(k).and_then(|v| v.as_str()).unwrap_or(d).to_string();
  let get_n = |k: &str, d: f64| j.get(k).and_then(|v| v.as_f64()).unwrap_or(d);
  let get_b = |k: &str, d: bool| j.get(k).and_then(|v| v.as_bool()).unwrap_or(d);
  let bg = get_s("background", "#ffffff");
  let hex = |i: usize| u8::from_str_radix(bg.get(i..i + 2).unwrap_or("ff"), 16).unwrap_or(255);
  Ok(Config {
    title: get_s("title", "akan-native"),
    width: get_n("width", 900.0),
    height: get_n("height", 640.0),
    app_dir: PathBuf::from(get_s("appDir", ".")),
    url: get_s("url", "app://localhost/"),
    devtools: get_b("devtools", false),
    menu: get_b("menu", true),
    background: (hex(1), hex(3), hex(5), 255),
    permission: get_s("permission", "default"),
    init_js: get_s("initJs", "window.__AKAN_NATIVE__={platform:'macos'};"),
    external: get_s("external", "open"),
    throttling: get_s("throttling", "default"),
    activation: get_s("activation", "regular"),
  })
}

// ───────────────────────── 커스텀 프로토콜 ─────────────────────────
fn mime_for(p: &Path) -> &'static str {
  match p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
    "html" | "htm" => "text/html; charset=utf-8",
    "js" | "mjs" => "text/javascript; charset=utf-8",
    "css" => "text/css; charset=utf-8",
    "json" | "map" => "application/json",
    "txt" => "text/plain; charset=utf-8",
    "svg" => "image/svg+xml",
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    "gif" => "image/gif",
    "webp" => "image/webp",
    "avif" => "image/avif",
    "ico" => "image/x-icon",
    "woff" => "font/woff",
    "woff2" => "font/woff2",
    "ttf" => "font/ttf",
    "otf" => "font/otf",
    "wasm" => "application/wasm",
    "mp4" => "video/mp4",
    "webm" => "video/webm",
    "mp3" => "audio/mpeg",
    "wav" => "audio/wav",
    _ => "application/octet-stream",
  }
}

fn respond_bytes(r: RequestAsyncResponder, status: u16, ct: &str, body: Vec<u8>) {
  r.respond(
    Response::builder()
      .status(status)
      .header(CONTENT_TYPE, ct)
      .body(body)
      .unwrap(),
  );
}

fn handle_app_protocol(
  app_dir: &Path,
  init_js: &str,
  webview_id: &str,
  req: Request<Vec<u8>>,
  responder: RequestAsyncResponder,
) {
  let path = req.uri().path().to_string();
  if path == "/__akan_native/ipc" {
    // SEC-1: 오리진 확인 (아래 규칙은 AKAN_NATIVE_TRACE_IPC 로그로 확인한 WKWebView 동작에 맞춘 것)
    let origin = req.headers().get("origin").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    if std::env::var_os("AKAN_NATIVE_TRACE_IPC").is_some() {
      let hdrs: Vec<String> = req.headers().iter().map(|(k, v)| format!("{k}={}", v.to_str().unwrap_or("?"))).collect();
      log!("IPC {} {} body={}B headers=[{}]", req.method(), req.uri(), req.body().len(), hdrs.join(", "));
    }
    if req.method() != "POST" {
      return respond_bytes(responder, 405, "text/plain", b"POST only".to_vec());
    }
    // 검증 결과 (WebKit, macOS 26.6):
    //   - 같은 오리진 fetch POST 에는 Origin 헤더가 없고 Referer: app://localhost/... 만 있다
    //   - 샌드박스 iframe(opaque origin) 의 cors 요청은 Origin: null, no-cors 요청은 Origin 없음 + Referer: about:srcdoc
    //   - 커스텀 스킴에는 CORS preflight 가 없다: 비표준 헤더를 붙인 교차 오리진 요청도 핸들러까지 온다
    // 그래서 규칙 = Origin 이 있으면 app://localhost, 없으면 Referer 가 app://localhost/ 로 시작.
    // x-akan-native-ipc 는 보안 수단이 아니라 "브리지 호출" 표식이다 (form submit/탐색과 구분).
    let referer = req.headers().get("referer").and_then(|v| v.to_str().ok()).unwrap_or("");
    let has_marker = req.headers().contains_key("x-akan-native-ipc");
    let origin_ok = if origin.is_empty() { referer.starts_with("app://localhost/") } else { origin == "app://localhost" };
    if !(origin_ok && has_marker) {
      log!("IPC rejected: origin={origin:?} referer={referer:?} marker={has_marker}");
      return respond_bytes(responder, 403, "text/plain", format!("forbidden origin={origin:?} referer={referer:?} marker={has_marker}").into_bytes());
    }
    if WAKE.load(Ordering::Acquire) == 0 {
      log!("IPC rejected: no host (503)");
      return respond_bytes(responder, 503, "text/plain", b"host not running".to_vec());
    }
    let id = NEXT_REQ.fetch_add(1, Ordering::Relaxed);
    let wv: u32 = webview_id.parse().unwrap_or(0);
    PENDING.lock().unwrap().insert(id, responder);
    push(frame(1, id, wv, req.body()));
    return;
  }
  if path == "/__akan_native/init.js" {
    return respond_bytes(responder, 200, "text/javascript; charset=utf-8", init_js.as_bytes().to_vec());
  }
  if path.starts_with("/__akan_native/") {
    return respond_bytes(responder, 404, "text/plain", b"not found".to_vec());
  }
  // 정적 파일: '..' 등은 거부. 없는 경로는 index.html (SPA 폴백)
  let rel = path.trim_start_matches('/');
  let rel = percent_decode(rel);
  let rel_path = Path::new(&rel);
  if rel_path.components().any(|c| !matches!(c, Component::Normal(_))) && !rel.is_empty() {
    return respond_bytes(responder, 400, "text/plain", b"bad path".to_vec());
  }
  let mut file = app_dir.join(rel_path);
  if rel.is_empty() || !file.is_file() {
    file = app_dir.join("index.html");
  }
  match std::fs::read(&file) {
    Ok(bytes) => respond_bytes(responder, 200, mime_for(&file), bytes),
    Err(e) => respond_bytes(responder, 500, "text/plain", format!("{e}").into_bytes()),
  }
}

fn percent_decode(s: &str) -> String {
  let b = s.as_bytes();
  let mut out = Vec::with_capacity(b.len());
  let mut i = 0;
  while i < b.len() {
    if b[i] == b'%' && i + 2 < b.len() {
      if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
        out.push(v);
        i += 3;
        continue;
      }
    }
    out.push(b[i]);
    i += 1;
  }
  String::from_utf8_lossy(&out).into_owned()
}

fn open_external(url: &str, mode: &str) {
  log!("external navigation -> {url} (mode={mode})");
  push_event(&format!(r#"{{"type":"external","url":{}}}"#, json::quote(url)));
  if mode == "open" {
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::{NSString, NSURL};
    if let Some(u) = NSURL::URLWithString(&NSString::from_str(url)) {
      NSWorkspace::sharedWorkspace().openURL(&u);
    }
  }
}

// ───────────────────────── akan_native_run ─────────────────────────
#[no_mangle]
pub unsafe extern "C" fn akan_native_run(config_json: *const c_char) -> i32 {
  LazyLock::force(&T0);
  if pthread_main_np() != 1 {
    eprintln!("akan_native_run must be called on the process main thread");
    return -1;
  }
  let cfg = match parse_config(&CStr::from_ptr(config_json).to_string_lossy()) {
    Ok(c) => c,
    Err(e) => {
      eprintln!("akan_native_run: bad config: {e}");
      return -2;
    }
  };
  log!("akan_native_run: appDir={:?} menu={} devtools={} permission={}", cfg.app_dir, cfg.menu, cfg.devtools, cfg.permission);

  let mut event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
  if cfg.activation == "prohibited" {
    use tao::platform::macos::{ActivationPolicy, EventLoopExtMacOS};
    event_loop.set_activation_policy(ActivationPolicy::Prohibited);
    event_loop.set_activate_ignoring_other_apps(false);
  }
  let _ = PROXY.set(Mutex::new(event_loop.create_proxy()));

  let window = WindowBuilder::new()
    .with_title(&cfg.title)
    .with_inner_size(LogicalSize::new(cfg.width, cfg.height))
    .with_background_color(cfg.background) // 흰 화면 방지 1: 창 배경
    .build(&event_loop)
    .expect("window");

  let app_dir = cfg.app_dir.clone();
  let init_js = cfg.init_js.clone();
  let perm = cfg.permission.clone();
  let ext_nav = cfg.external.clone();
  let ext_win = cfg.external.clone();

  let mut builder = WebViewBuilder::new();
  match cfg.throttling.as_str() {
    "disabled" => builder = builder.with_background_throttling(BackgroundThrottlingPolicy::Disabled),
    "suspend" => builder = builder.with_background_throttling(BackgroundThrottlingPolicy::Suspend),
    "throttle" => builder = builder.with_background_throttling(BackgroundThrottlingPolicy::Throttle),
    _ => {}
  }
  let webview = builder
    .with_id("1")
    .with_url(&cfg.url)
    .with_background_color(cfg.background) // 흰 화면 방지 2: drawsBackground=NO + underPageBackgroundColor
    .with_devtools(cfg.devtools)
    .with_asynchronous_custom_protocol("app".into(), move |id, req, responder| {
      handle_app_protocol(&app_dir, &init_js, &id, req, responder)
    })
    .with_navigation_handler(move |url| {
      // SH-4: 앱 오리진 밖으로는 이동하지 않는다
      let ok = url.starts_with("app://localhost/") || url == "app://localhost" || url.starts_with("about:");
      if !ok {
        open_external(&url, &ext_nav);
      }
      ok
    })
    .with_new_window_req_handler(move |url, _features| {
      open_external(&url, &ext_win);
      NewWindowResponse::Deny
    })
    .with_permission_handler(move |kind| {
      log!("permission request: {kind:?} -> {perm}");
      push_event(&format!(r#"{{"type":"permission","kind":"{kind:?}"}}"#));
      match (perm.as_str(), kind) {
        ("allow", PermissionKind::Camera | PermissionKind::Microphone) => PermissionResponse::Allow,
        ("deny", _) => PermissionResponse::Deny,
        _ => PermissionResponse::Default,
      }
    })
    .with_on_page_load_handler(|ev, url| {
      let e = match ev {
        PageLoadEvent::Started => "started",
        PageLoadEvent::Finished => "finished",
      };
      push_event(&format!(r#"{{"type":"pageLoad","event":"{e}","url":{}}}"#, json::quote(&url)));
    })
    .build(&window)
    .expect("webview");

  let mut webviews: HashMap<u32, WebView> = HashMap::new();
  webviews.insert(1, webview);
  let menu = cfg.menu;
  let app_name = cfg.title.clone();

  event_loop.run(move |event, _target, control_flow| {
    *control_flow = ControlFlow::Wait;
    match event {
      Event::NewEvents(StartCause::Init) => {
        if menu {
          macos::install_default_menu(&app_name);
        }
        macos::install_state_observers(&window);
        push_event(r#"{"type":"init"}"#);
      }
      Event::WindowEvent { event, .. } => match event {
        WindowEvent::Focused(f) => push_event(&format!(r#"{{"type":"window","event":"focused","value":{f}}}"#)),
        WindowEvent::CloseRequested => {
          push_event(r#"{"type":"window","event":"closeRequested"}"#);
          *control_flow = ControlFlow::ExitWithCode(0);
        }
        _ => {}
      },
      Event::UserEvent(UserEvent::Respond(r, resp)) => r.respond(resp),
      Event::UserEvent(UserEvent::Emit { webview_id, js }) => {
        if let Some(wv) = webviews.get(&webview_id) {
          let _ = wv.evaluate_script(&js);
        }
      }
      Event::UserEvent(UserEvent::Quit(code)) => {
        log!("quit requested with code {code}");
        *control_flow = ControlFlow::ExitWithCode(code);
      }
      Event::UserEvent(UserEvent::Debug(cmd)) => macos::debug(&cmd, &window, &webviews),
      Event::LoopDestroyed => log!("LoopDestroyed"),
      _ => {}
    }
  });
}

// ───────────────────────── macOS 전용: 메뉴, 상태 옵저버, 디버그 ─────────────────────────
mod macos {
  use super::*;
  use block2::RcBlock;
  use objc2::{rc::Retained, sel, MainThreadMarker, MainThreadOnly};
  use objc2_app_kit::{
    NSApplication, NSApplicationDidBecomeActiveNotification, NSApplicationDidHideNotification,
    NSApplicationDidResignActiveNotification, NSApplicationDidUnhideNotification, NSEvent,
    NSEventModifierFlags, NSEventType, NSMenu, NSMenuItem, NSWindow,
    NSWindowDidChangeOcclusionStateNotification, NSWindowDidDeminiaturizeNotification,
    NSWindowDidMiniaturizeNotification, NSWindowOcclusionState,
  };
  use objc2_foundation::{NSNotification, NSNotificationCenter, NSOperationQueue, NSPoint, NSString};

  fn item(
    mtm: MainThreadMarker,
    menu: &NSMenu,
    title: &str,
    action: Option<objc2::runtime::Sel>,
    key: &str,
    mods: NSEventModifierFlags,
  ) {
    let it = unsafe {
      NSMenuItem::initWithTitle_action_keyEquivalent(
        NSMenuItem::alloc(mtm),
        &NSString::from_str(title),
        action,
        &NSString::from_str(key),
      )
    };
    if !key.is_empty() {
      it.setKeyEquivalentModifierMask(mods);
    }
    menu.addItem(&it);
  }

  /// 기본 메뉴: App(About/Hide/Hide Others/Show All/Quit) + Edit(Undo…Select All) + Window.
  /// target=nil 이면 액션이 first responder 체인(WKWebView)으로 간다.
  pub fn install_default_menu(app_name: &str) {
    let mtm = MainThreadMarker::new().unwrap();
    let app = NSApplication::sharedApplication(mtm);
    let cmd = NSEventModifierFlags::Command;
    let bar = NSMenu::new(mtm);

    let app_item = NSMenuItem::new(mtm);
    bar.addItem(&app_item);
    let m = NSMenu::new(mtm);
    item(mtm, &m, &format!("About {app_name}"), Some(sel!(orderFrontStandardAboutPanel:)), "", cmd);
    m.addItem(&NSMenuItem::separatorItem(mtm));
    item(mtm, &m, &format!("Hide {app_name}"), Some(sel!(hide:)), "h", cmd);
    item(mtm, &m, "Hide Others", Some(sel!(hideOtherApplications:)), "h", cmd | NSEventModifierFlags::Option);
    item(mtm, &m, "Show All", Some(sel!(unhideAllApplications:)), "", cmd);
    m.addItem(&NSMenuItem::separatorItem(mtm));
    item(mtm, &m, &format!("Quit {app_name}"), Some(sel!(terminate:)), "q", cmd);
    app_item.setSubmenu(Some(&m));

    let edit_item = NSMenuItem::new(mtm);
    bar.addItem(&edit_item);
    let e = NSMenu::initWithTitle(NSMenu::alloc(mtm), &NSString::from_str("Edit"));
    item(mtm, &e, "Undo", Some(sel!(undo:)), "z", cmd);
    item(mtm, &e, "Redo", Some(sel!(redo:)), "z", cmd | NSEventModifierFlags::Shift);
    e.addItem(&NSMenuItem::separatorItem(mtm));
    item(mtm, &e, "Cut", Some(sel!(cut:)), "x", cmd);
    item(mtm, &e, "Copy", Some(sel!(copy:)), "c", cmd);
    item(mtm, &e, "Paste", Some(sel!(paste:)), "v", cmd);
    item(mtm, &e, "Paste and Match Style", Some(sel!(pasteAsPlainText:)), "v", cmd | NSEventModifierFlags::Option | NSEventModifierFlags::Shift);
    item(mtm, &e, "Delete", Some(sel!(delete:)), "", cmd);
    item(mtm, &e, "Select All", Some(sel!(selectAll:)), "a", cmd);
    edit_item.setSubmenu(Some(&e));

    let win_item = NSMenuItem::new(mtm);
    bar.addItem(&win_item);
    let w = NSMenu::initWithTitle(NSMenu::alloc(mtm), &NSString::from_str("Window"));
    item(mtm, &w, "Minimize", Some(sel!(performMiniaturize:)), "m", cmd);
    item(mtm, &w, "Zoom", Some(sel!(performZoom:)), "", cmd);
    item(mtm, &w, "Close", Some(sel!(performClose:)), "w", cmd);
    item(mtm, &w, "Enter Full Screen", Some(sel!(toggleFullScreen:)), "f", cmd | NSEventModifierFlags::Control);
    win_item.setSubmenu(Some(&w));
    app.setWindowsMenu(Some(&w));

    app.setMainMenu(Some(&bar));
    log!("default NSMenu installed");
  }

  /// useAppState 용 신호: 앱 활성/비활성, 숨김, 최소화, 가림(occlusion)
  pub fn install_state_observers(window: &Window) {
    let center = NSNotificationCenter::defaultCenter();
    let queue = NSOperationQueue::mainQueue();
    let ns_window_ptr = window.ns_window() as usize;
    let ns_window: &NSWindow = unsafe { &*(ns_window_ptr as *const NSWindow) };
    let names: [(&NSString, &str, bool); 7] = unsafe {
      [
        (NSApplicationDidBecomeActiveNotification, "appDidBecomeActive", false),
        (NSApplicationDidResignActiveNotification, "appDidResignActive", false),
        (NSApplicationDidHideNotification, "appDidHide", false),
        (NSApplicationDidUnhideNotification, "appDidUnhide", false),
        (NSWindowDidMiniaturizeNotification, "windowDidMiniaturize", true),
        (NSWindowDidDeminiaturizeNotification, "windowDidDeminiaturize", true),
        (NSWindowDidChangeOcclusionStateNotification, "windowOcclusion", true),
      ]
    };
    for (name, label, is_window) in names {
      let label = label.to_string();
      let block = RcBlock::new(move |_n: NonNull<NSNotification>| {
        let w: &NSWindow = unsafe { &*(ns_window_ptr as *const NSWindow) };
        let visible = w.occlusionState().contains(NSWindowOcclusionState::Visible);
        let mini = w.isMiniaturized();
        let key = w.isKeyWindow();
        let active = NSApplication::sharedApplication(MainThreadMarker::new().unwrap()).isActive();
        push_event(&format!(
          r#"{{"type":"appState","event":"{label}","occlusionVisible":{visible},"miniaturized":{mini},"keyWindow":{key},"appActive":{active}}}"#
        ));
      });
      let obj: Option<&objc2::runtime::AnyObject> = if is_window { Some(ns_window) } else { None };
      let token = unsafe { center.addObserverForName_object_queue_usingBlock(Some(name), obj, Some(&queue), &block) };
      std::mem::forget(token); // 앱 수명 동안 유지
    }
  }

  fn key_code(c: &str) -> u16 {
    match c {
      "a" => 0, "s" => 1, "x" => 7, "c" => 8, "v" => 9, "z" => 6, "q" => 12, "w" => 13, " " => 49,
      _ => 0,
    }
  }

  pub fn debug(cmd: &str, window: &Window, webviews: &HashMap<u32, WebView>) {
    let mtm = MainThreadMarker::new().unwrap();
    let app = NSApplication::sharedApplication(mtm);
    let ns_window: &NSWindow = unsafe { &*(window.ns_window() as *const NSWindow) };
    log!("debug: {cmd}");
    let (head, arg) = cmd.split_once(':').unwrap_or((cmd, ""));
    match head {
      "minimize" => window.set_minimized(true),
      "restore" => {
        window.set_minimized(false);
        window.set_focus();
      }
      "hide" => app.hide(None),
      "unhide" => {
        app.unhide(None);
        app.activate();
      }
      "activate" => app.activate(),
      "block" => std::thread::sleep(Duration::from_millis(arg.parse().unwrap_or(1000))),
      "reload" => {
        let _ = webviews.get(&1).map(|w| w.reload());
      }
      "state" => {
        push_event(&format!(
          r#"{{"type":"appState","event":"query","occlusionVisible":{},"miniaturized":{},"keyWindow":{},"appActive":{}}}"#,
          ns_window.occlusionState().contains(NSWindowOcclusionState::Visible),
          ns_window.isMiniaturized(),
          ns_window.isKeyWindow(),
          app.isActive()
        ));
      }
      "ticker" => {
        // 비 main 스레드에서 push+wake
        let n: u32 = arg.parse().unwrap_or(5);
        std::thread::spawn(move || {
          for i in 0..n {
            push_event(&format!(r#"{{"type":"tick","i":{i},"fromThread":{}}}"#, akan_native_thread_info() & 0x7fff_ffff_ffff_ffff));
            std::thread::sleep(Duration::from_millis(100));
          }
        });
      }
      "key" => {
        // key:<ch>:<mods>  mods = cmd,shift,opt,ctrl 조합. NSApp sendEvent 로 합성 (접근성 권한 불필요)
        let (ch, mods) = arg.split_once(':').unwrap_or((arg, ""));
        let mut flags = NSEventModifierFlags::empty();
        for m in mods.split(',') {
          flags |= match m {
            "cmd" => NSEventModifierFlags::Command,
            "shift" => NSEventModifierFlags::Shift,
            "opt" => NSEventModifierFlags::Option,
            "ctrl" => NSEventModifierFlags::Control,
            _ => NSEventModifierFlags::empty(),
          };
        }
        let chars = NSString::from_str(ch);
        for ty in [NSEventType::KeyDown, NSEventType::KeyUp] {
          let ev = NSEvent::keyEventWithType_location_modifierFlags_timestamp_windowNumber_context_characters_charactersIgnoringModifiers_isARepeat_keyCode(
            ty, NSPoint::new(0.0, 0.0), flags, 0.0, ns_window.windowNumber(), None, &chars, &chars, false, key_code(ch),
          );
          if let Some(ev) = ev {
            app.sendEvent(&ev);
          }
        }
      }
      "modal" => {
        let modal: Option<Retained<NSWindow>> = app.modalWindow();
        let desc = modal.as_ref().map(|w| w.class().name().to_string_lossy().into_owned());
        log!("modal window: {desc:?}");
        push_event(&format!(r#"{{"type":"modal","window":{}}}"#, desc.map(|d| json::quote(&d)).unwrap_or("null".into())));
        if modal.is_some() {
          app.abortModal();
        }
      }
      _ => log!("unknown debug cmd"),
    }
  }
}

// ───────────────────────── 최소 JSON (설정 파싱용, 외부 크레이트 없이) ─────────────────────────
mod json {
  pub enum V {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<V>),
    Obj(Vec<(String, V)>),
  }
  impl V {
    pub fn get(&self, k: &str) -> Option<&V> {
      if let V::Obj(o) = self { o.iter().find(|(kk, _)| kk == k).map(|(_, v)| v) } else { None }
    }
    pub fn as_str(&self) -> Option<&str> { if let V::Str(s) = self { Some(s) } else { None } }
    pub fn as_f64(&self) -> Option<f64> { if let V::Num(n) = self { Some(*n) } else { None } }
    pub fn as_bool(&self) -> Option<bool> { if let V::Bool(b) = self { Some(*b) } else { None } }
  }
  pub fn parse(s: &str) -> Result<V, String> {
    let mut p = P { b: s.as_bytes(), i: 0 };
    let v = p.val()?;
    p.ws();
    if p.i != p.b.len() { return Err(format!("trailing data at {}", p.i)); }
    Ok(v)
  }
  struct P<'a> { b: &'a [u8], i: usize }
  impl P<'_> {
    fn ws(&mut self) { while self.i < self.b.len() && matches!(self.b[self.i], b' ' | b'\n' | b'\r' | b'\t') { self.i += 1; } }
    fn eat(&mut self, c: u8) -> Result<(), String> {
      self.ws();
      if self.b.get(self.i) == Some(&c) { self.i += 1; Ok(()) } else { Err(format!("expected '{}' at {}", c as char, self.i)) }
    }
    fn val(&mut self) -> Result<V, String> {
      self.ws();
      match self.b.get(self.i).copied() {
        Some(b'{') => {
          self.i += 1;
          let mut o = Vec::new();
          self.ws();
          if self.b.get(self.i) == Some(&b'}') { self.i += 1; return Ok(V::Obj(o)); }
          loop {
            self.ws();
            let k = self.string()?;
            self.eat(b':')?;
            o.push((k, self.val()?));
            self.ws();
            match self.b.get(self.i) { Some(b',') => self.i += 1, Some(b'}') => { self.i += 1; return Ok(V::Obj(o)); } _ => return Err(format!("bad object at {}", self.i)) }
          }
        }
        Some(b'[') => {
          self.i += 1;
          let mut a = Vec::new();
          self.ws();
          if self.b.get(self.i) == Some(&b']') { self.i += 1; return Ok(V::Arr(a)); }
          loop {
            a.push(self.val()?);
            self.ws();
            match self.b.get(self.i) { Some(b',') => self.i += 1, Some(b']') => { self.i += 1; return Ok(V::Arr(a)); } _ => return Err(format!("bad array at {}", self.i)) }
          }
        }
        Some(b'"') => Ok(V::Str(self.string()?)),
        Some(b't') if self.b[self.i..].starts_with(b"true") => { self.i += 4; Ok(V::Bool(true)) }
        Some(b'f') if self.b[self.i..].starts_with(b"false") => { self.i += 5; Ok(V::Bool(false)) }
        Some(b'n') if self.b[self.i..].starts_with(b"null") => { self.i += 4; Ok(V::Null) }
        Some(_) => {
          let st = self.i;
          while self.i < self.b.len() && matches!(self.b[self.i], b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9') { self.i += 1; }
          std::str::from_utf8(&self.b[st..self.i]).unwrap().parse().map(V::Num).map_err(|_| format!("bad number at {st}"))
        }
        None => Err("unexpected end".into()),
      }
    }
    fn string(&mut self) -> Result<String, String> {
      if self.b.get(self.i) != Some(&b'"') { return Err(format!("expected string at {}", self.i)); }
      self.i += 1;
      let mut out = String::new();
      loop {
        let c = *self.b.get(self.i).ok_or("unterminated string")?;
        self.i += 1;
        match c {
          b'"' => return Ok(out),
          b'\\' => {
            let e = *self.b.get(self.i).ok_or("bad escape")?;
            self.i += 1;
            match e {
              b'"' => out.push('"'), b'\\' => out.push('\\'), b'/' => out.push('/'),
              b'b' => out.push('\u{8}'), b'f' => out.push('\u{c}'), b'n' => out.push('\n'), b'r' => out.push('\r'), b't' => out.push('\t'),
              b'u' => {
                let hex = |p: &mut Self| -> Result<u32, String> {
                  let h = std::str::from_utf8(p.b.get(p.i..p.i + 4).ok_or("bad \\u")?).map_err(|_| "bad \\u")?;
                  p.i += 4;
                  u32::from_str_radix(h, 16).map_err(|_| "bad \\u".to_string())
                };
                let mut cp = hex(self)?;
                if (0xD800..0xDC00).contains(&cp) && self.b.get(self.i..self.i + 2) == Some(b"\\u") {
                  self.i += 2;
                  let lo = hex(self)?;
                  cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                }
                out.push(char::from_u32(cp).unwrap_or('\u{fffd}'));
              }
              _ => return Err("bad escape".into()),
            }
          }
          _ => {
            // UTF-8 연속 바이트는 그대로 복사
            let st = self.i - 1;
            let len = match c { 0x00..=0x7f => 1, 0xc0..=0xdf => 2, 0xe0..=0xef => 3, _ => 4 };
            self.i = st + len;
            out.push_str(std::str::from_utf8(&self.b[st..self.i]).map_err(|_| "bad utf8")?);
          }
        }
      }
    }
  }
  pub fn quote(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    o.push('"');
    for c in s.chars() {
      match c {
        '"' => o.push_str("\\\""), '\\' => o.push_str("\\\\"), '\n' => o.push_str("\\n"), '\r' => o.push_str("\\r"), '\t' => o.push_str("\\t"),
        c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
        c => o.push(c),
      }
    }
    o.push('"');
    o
  }
}
```

### 2.5 js/ffi.ts
```ts
// main.ts 와 host.ts(Worker) 가 함께 쓰는 경로·FFI 정의. 양쪽 번들에 각각 들어간다.
import { dlopen } from "bun:ffi";
import { dirname, join } from "node:path";

/** 실행 파일 기준 경로. .app 안이면 Contents/MacOS/<exe> → ../Frameworks, ../Resources */
export function resolvePaths() {
  const compiled = import.meta.url.includes("$bunfs") || import.meta.url.includes("~BUN");
  const contents = join(dirname(process.execPath), "..");
  return {
    compiled,
    execPath: process.execPath,
    lib: process.env.AKAN_NATIVE_LIB ?? join(contents, "Frameworks", "libakan_native_desktop.dylib"),
    appDir: process.env.AKAN_NATIVE_APP_DIR ?? join(contents, "Resources", "app"),
  };
}

export const symbols = {
  akan_native_run: { args: ["ptr"], returns: "i32" },
  akan_native_set_wake: { args: ["ptr"], returns: "void" },
  akan_native_poll: { args: ["ptr", "u32"], returns: "u32" },
  akan_native_respond: { args: ["u64", "u16", "ptr", "ptr", "u32"], returns: "void" },
  akan_native_emit: { args: ["u32", "ptr"], returns: "void" },
  akan_native_quit: { args: ["i32"], returns: "void" },
  akan_native_debug: { args: ["ptr"], returns: "void" },
  akan_native_thread_info: { args: [], returns: "u64" },
} as const;

export function open(libPath: string) {
  return dlopen(libPath, symbols);
}

const enc = new TextEncoder();
/** NUL 종료 UTF-8. 네이티브는 호출 중에만 읽고 복사하므로 호출이 끝나면 GC 되어도 된다 */
export const cstr = (s: string) => enc.encode(s + "\0");

export function threadInfo(lib: ReturnType<typeof open>) {
  const t = BigInt(lib.symbols.akan_native_thread_info());
  return { main: t >> 63n === 1n, tid: Number(t & ((1n << 63n) - 1n)) };
}
```

### 2.6 js/main.ts
```ts
// 프로세스 main 스레드: dylib 로드 → Worker(host.ts) 시작 → ready 대기 → akan_native_run (반환 안 함)
import { cstr, open, resolvePaths, threadInfo } from "./ffi";

const P = resolvePaths();
const lib = open(P.lib);
console.log("[main] paths", JSON.stringify(P), "import.meta.url=", import.meta.url, "thread", JSON.stringify(threadInfo(lib)));

// Q2: 두 형태 모두 시험. AKAN_NATIVE_WORKER_FORM=string 이면 문자열 경로
const form = process.env.AKAN_NATIVE_WORKER_FORM ?? "url";
const worker =
  form === "string" ? new Worker("./host.ts") : new Worker(new URL("./host.ts", import.meta.url).href);
worker.addEventListener("error", (e) => console.error("[main] worker error", e));

await new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("worker ready timeout")), 10_000);
  worker.addEventListener("message", (e) => {
    if ((e as MessageEvent).data === "ready") {
      clearTimeout(t);
      resolve();
    }
  }, { once: true });
});
console.log(`[main] worker ready → akan_native_run (process uptime ${(performance.now()).toFixed(1)}ms)`);

const config = {
  title: "AkanNative Proto",
  width: 900,
  height: 640,
  appDir: P.appDir,
  devtools: true,
  menu: process.env.AKAN_NATIVE_MENU !== "0",
  background: "#1e1e2e",
  permission: process.env.AKAN_NATIVE_PERMISSION ?? "deny",
  external: "log",
  throttling: process.env.AKAN_NATIVE_THROTTLING ?? "default",
  activation: process.env.AKAN_NATIVE_ACTIVATION ?? "regular",
  initJs: `window.__AKAN_NATIVE__ = ${JSON.stringify({ v: 1, platform: "macos", env: { PUBLIC_X: "1", SKIP_CAMERA: process.env.AKAN_NATIVE_SKIP_CAMERA === "1" } })};`,
};
const rc = lib.symbols.akan_native_run(cstr(JSON.stringify(config)));
// 여기에 도달하면 akan_native_run 이 실패한 것 (정상이면 process::exit 로 끝난다)
console.error("[main] akan_native_run returned", rc);
process.exit(1);
```

### 2.7 js/host.ts (Worker. 앞부분과 끝부분 = 재사용할 런타임, `scenario()` = 검증 시나리오)
```ts
// Worker 스레드: 플러그인 호스트. threadsafe JSCallback(wake) → akan_native_poll 로 메시지 드레인 → akan_native_respond
import { JSCallback } from "bun:ffi";
import { cstr, open, resolvePaths, threadInfo } from "./ffi";

declare var self: Worker;
const P = resolvePaths();
const lib = open(P.lib);
const S = lib.symbols;
const T0 = performance.now();
const ts = () => (performance.now() - T0).toFixed(1).padStart(7);
const say = (...a: unknown[]) => console.log(`[host ${ts()}ms]`, ...a);
const workerThread = threadInfo(lib);
say("worker thread", JSON.stringify(workerThread));

const dec = new TextDecoder();
const enc = new TextEncoder();
let buf = new Uint8Array(64 * 1024);
const drainThreads = new Map<string, number>();
let drains = 0;

function fnv(bytes: Uint8Array) {
  let h = 0x811c9dc5;
  for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

function respond(reqId: bigint, status: number, obj: unknown) {
  const body = enc.encode(JSON.stringify(obj));
  S.akan_native_respond(reqId, status, cstr("application/json"), body.length ? body : null, body.length);
}
const emit = (js: string) => S.akan_native_emit(1, cstr(js));
const debug = (cmd: string) => S.akan_native_debug(cstr(cmd));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── 네이티브가 wake 를 부르면 여기서 실행된다 (어느 스레드인지 기록) ──
function drain() {
  drains++;
  const t = threadInfo(lib);
  const key = `${t.main ? "MAIN" : "bg"}:${t.tid}${t.tid === workerThread.tid ? "(worker)" : ""}`;
  drainThreads.set(key, (drainThreads.get(key) ?? 0) + 1);
  for (;;) {
    const n = S.akan_native_poll(buf, buf.length);
    if (n === 0) break;
    if (n > buf.length) { buf = new Uint8Array(Math.max(n, buf.length * 2)); continue; }
    const dv = new DataView(buf.buffer, buf.byteOffset, n);
    const kind = dv.getUint8(0);
    const reqId = dv.getBigUint64(1, true);
    const webviewId = dv.getUint32(9, true);
    const body = buf.slice(13, n); // 복사 (buf 는 재사용)
    try {
      if (kind === 1) onIpc(reqId, webviewId, body);
      else if (kind === 2) onNativeEvent(JSON.parse(dec.decode(body)));
    } catch (e) {
      // 메시지 하나의 예외가 drain 전체(=Worker)를 죽이지 않게. IPC 면 INTERNAL 로 응답
      say("handler error", String(e));
      if (kind === 1) respond(reqId, 500, { v: 1, ok: false, error: { code: "INTERNAL", message: String(e) } });
    }
  }
}
const wake = new JSCallback(drain, { args: [], returns: "void", threadsafe: true });
S.akan_native_set_wake(wake.ptr);

// ── IPC ──
const held: bigint[] = [];
let resultsSeen = false;
function onIpc(reqId: bigint, _wv: number, body: Uint8Array) {
  const isRpc = body.length > 6 && body[0] === 0x7b && dec.decode(body.subarray(0, 7)) === '{"v":1,';
  if (!isRpc) return respond(reqId, 200, { rawLen: body.length, fnv: fnv(body) });
  const req = JSON.parse(dec.decode(body));
  const ok = (result?: unknown) => respond(reqId, 200, { v: 1, id: req.id, ok: true, result });
  switch (req.method) {
    case "echo": return ok(req.args);
    case "boom": throw new Error("boom inside JSCallback drain");
    case "busy": { const until = performance.now() + req.args.ms; while (performance.now() < until) {} return ok("busy done"); }
    case "log": say("[page]", req.args.msg); return ok();
    case "hold": held.push(reqId); say("holding reqId", reqId); return;
    case "reloaded": say("page reloaded"); ok(); return;
    case "results":
      say("RESULTS\n" + JSON.stringify(req.args, null, 1));
      ok();
      if (!resultsSeen) { resultsSeen = true; scenario().catch((e) => say("scenario error", e)); }
      return;
    default: return respond(reqId, 404, { v: 1, id: req.id, ok: false, error: { code: "NOT_FOUND", message: req.method } });
  }
}

const tickLog: string[] = [];
function onNativeEvent(ev: any) {
  if (ev.type === "tick") { tickLog.push(`${ts()}ms tick${ev.i} from tid=${ev.fromThread}`); return; }
  say("native event", JSON.stringify(ev));
}

// ── 시나리오 ──
async function pageEval(js: string) { emit(js); await sleep(150); }
async function scenario() {
  const only = process.env.AKAN_NATIVE_SCENARIO ?? "all";
  if (only === "blockonly") {
    emit(`const __t0 = performance.now(); __call("hold", {}).then(r => __log("[page] held fetch resolved after " + (performance.now() - __t0).toFixed(0) + "ms"))`);
    await sleep(200);
    debug("block:1500");
    await sleep(300);
    const t = performance.now();
    const id = held.shift();
    if (id !== undefined) respond(id, 200, { v: 1, id: 0, ok: true, result: "late" });
    say(`akan_native_respond while main blocked took ${(performance.now() - t).toFixed(1)}ms`);
    await sleep(1800);
    S.akan_native_quit(6);
    return;
  }
  if (only === "busy") {
    // Worker 가 JS 를 1초 동안 붙잡고 있는 동안 main 이 wake 를 부르면 main 이 막히는가?
    emit(`__call("busy", {ms: 1000}); setTimeout(() => __call("log", {msg: "[page] request sent while worker busy"}), 100)`);
    await sleep(2000);
    S.akan_native_quit(4);
    return;
  }
  if (only === "throw") {
    emit(`__call("boom", {})`);
    await sleep(800);
    say("still alive after throw? sending another request");
    emit(`__call("log", {msg: "[page] after boom"})`);
    await sleep(800);
    S.akan_native_quit(5);
    return;
  }
  if (only === "throttle") {
    // 최소화된 동안 페이지 타이머·IPC·evaluate_script 가 도는지
    emit(`window.__n=0; setInterval(() => __call("log", {msg: "[page] timer tick " + (++__n) + " vis=" + document.visibilityState}), 500)`);
    await sleep(1200);
    debug("minimize");
    for (let i = 0; i < 6; i++) { await sleep(500); emit(`__call("log", {msg: "[page] eval while minimized #${i}"})`); }
    say("quit (still minimized)");
    S.akan_native_quit(3);
    return;
  }
  say("drain threads so far", JSON.stringify([...drainThreads]), "drains", drains);

  // 1) akan_native_emit + Worker setInterval (main 이 TAO 루프에 있는 동안 Worker 타이머가 도는지)
  let n = 0;
  await new Promise<void>((r) => { const h = setInterval(() => { emit(`window.__akan_nativeReceive({type:"tick",n:${n}})`); if (++n === 5) { clearInterval(h); r(); } }, 100); });
  await pageEval(`__log("[page] received pushes: " + __received.length)`);

  // 2) 비 main 스레드(Rust thread)에서 wake + main 을 1.5초 막는 동안의 동작
  emit(`__call("hold", {}).then(r => __log("[page] held fetch resolved " + JSON.stringify(r)), e => __log("[page] held fetch error " + e))`);
  await sleep(200);
  debug("ticker:12");
  debug("block:1500");
  await sleep(300);
  const t = performance.now();
  const id = held.shift();
  if (id !== undefined) respond(id, 200, { v: 1, id: 0, ok: true, result: "late" });
  say(`akan_native_respond while main blocked took ${(performance.now() - t).toFixed(1)}ms`);
  await sleep(1800);
  say("ticks:\n  " + tickLog.join("\n  "));
  say("drain threads", JSON.stringify([...drainThreads]));

  if (only === "all" || only === "state") {
    // 3) 앱 상태 신호
    for (const c of ["state", "minimize", "state", "restore", "state", "hide", "state", "unhide", "state"]) {
      debug(c);
      await sleep(c === "state" ? 200 : 1200);
    }
  }

  if (only === "all" || only === "keys") {
    // 4) 편집 단축키 (메뉴 유무에 따라)
    Bun.spawnSync(["pbcopy"], { stdin: enc.encode("CLIP-BEFORE") });
    await pageEval(`const t=document.getElementById("t"); t.value="hello world"; t.focus(); t.setSelectionRange(11,11); __log("[page] focused", document.activeElement.id)`);
    debug("key:a:cmd"); await sleep(500);
    await pageEval(`__log("[page] after cmd+a sel=" + t.selectionStart + "-" + t.selectionEnd)`);
    debug("key:c:cmd"); await sleep(500);
    say("pasteboard after cmd+c:", JSON.stringify(Bun.spawnSync(["pbpaste"]).stdout.toString()));
    Bun.spawnSync(["pbcopy"], { stdin: enc.encode("PASTED") });
    await pageEval(`t.setSelectionRange(t.value.length,t.value.length)`);
    debug("key:v:cmd"); await sleep(500);
    await pageEval(`__log("[page] after cmd+v value=" + JSON.stringify(t.value))`);
    debug("key:z:cmd"); await sleep(500);
    await pageEval(`__log("[page] after cmd+z value=" + JSON.stringify(t.value))`);
  }

  if (only === "all" || only === "file") {
    // 5) <input type=file>: 버튼에 포커스 → 합성 space 키(사용자 제스처) → input.click() → NSOpenPanel?
    await pageEval(`document.getElementById("b").focus()`);
    debug("key: :"); await sleep(1500);
    debug("modal"); await sleep(800);
  }

  if (only === "all" || only === "nav") {
    // 6) 외부 링크: 같은 창 이동 / window.open / target=_blank
    await pageEval(`location.href = "https://example.com/same-window"`);
    await pageEval(`window.open("https://example.org/popup")`);
    await pageEval(`document.getElementById("ext").click()`);
    await sleep(300);
    // 7) 응답 대기 중에 페이지가 reload → 늦은 응답 (크래시 여부)
    emit(`__call("hold", {})`);
    await sleep(200);
    debug("reload");
    await sleep(1500);
    const late = held.shift();
    if (late !== undefined) { respond(late, 200, { v: 1, id: 0, ok: true, result: "after-reload" }); say("responded to request of the previous page (after reload)"); }
    await sleep(500);
    await pageEval(`__log("[page] alive after late response; href=" + location.href)`);
  }

  if (process.env.AKAN_NATIVE_QUIT === "key") { say("sending cmd+q"); debug("key:q:cmd"); await sleep(1500); say("still alive after cmd+q → quitting with akan_native_quit(9)"); S.akan_native_quit(9); }
  else { say("akan_native_quit(7)"); S.akan_native_quit(7); }
}

process.on("exit", (c) => {
  say("worker process 'exit' event", c);
  if (process.env.AKAN_NATIVE_CLEAR_WAKE_ON_EXIT !== "0") S.akan_native_set_wake(null); // 죽은 JSCallback 을 네이티브가 부르지 않게
});
// main 스레드는 akan_native_run 안에 묶여 있어서 Worker 의 'error' 이벤트를 받을 수 없다 → Worker 안에서 직접 처리
process.on("uncaughtException", (e) => say("uncaughtException (worker survives)", String(e)));
process.on("unhandledRejection", (e) => say("unhandledRejection", String(e)));
// Worker 는 이벤트 루프가 비면 종료된다. JSCallback 은 루프를 붙잡지 않으므로 명시적으로 붙잡는다.
const KEEPALIVE = process.env.AKAN_NATIVE_KEEPALIVE ?? "interval";
if (KEEPALIVE === "interval") setInterval(() => {}, 2 ** 31 - 1);
else if (KEEPALIVE === "onmessage") self.onmessage = () => {};
self.postMessage("ready");
```

### 2.8 build-app.sh (Info.plist 포함)
- Info.plist 최소 키 [실행]: `CFBundleExecutable`(없으면 실행 불가), `CFBundleIdentifier`(TCC·WebKit 데이터 저장소·localStorage 위치의 기준), `CFBundleName`, `CFBundlePackageType=APPL`, `CFBundleShortVersionString`, `CFBundleVersion`, `CFBundleInfoDictionaryVersion`, `LSMinimumSystemVersion=26.0`, `NSHighResolutionCapable`. 카메라를 쓰면 `NSCameraUsageDescription`(+ 마이크면 `NSMicrophoneUsageDescription`). `NSPrincipalClass`는 필요 없다(tao가 `TaoApp`으로 `sharedApplication`을 직접 부른다 [코드] [platform_impl/macos/event_loop.rs:163-180](../../../tao/src/platform_impl/macos/event_loop.rs#L163-L180)).
- dylib는 절대 경로로 `dlopen`하므로 install_name·rpath는 로딩에 영향이 없다 [실행: 기본 install_name(빌드 폴더 절대 경로) 상태로도 로딩됨]. 빌드 머신 경로가 바이너리에 남지 않게 `-install_name @rpath/libakan_native_desktop.dylib`로 링크했다. 링크 후에 `install_name_tool`로 바꾸면 서명이 깨지므로 서명 전에 해야 한다.
- 서명 [실행]: `bun build --compile` 결과물과 cargo dylib는 이미 `adhoc,linker-signed` 상태다. 번들에 넣은 뒤 **안쪽부터**(dylib → 번들) `codesign --force -s -` 하면 `codesign --verify --strict`를 통과한다. `--deep`은 필요 없다(Tauri도 안쪽부터 서명한다).

```sh
#!/bin/bash
# .app 조립: cargo(cdylib) → bun --compile(main+host) → 번들 배치 → Info.plist → ad-hoc 서명 → 검증
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$PWD
APP="$ROOT/out/AkanNative Proto.app"
EXE=akan-native-proto
CAMERA_DESC=${CAMERA_DESC-"사진 촬영에 카메라를 사용합니다"}   # 빈 문자열이면 키를 넣지 않는다

source "$HOME/.cargo/env"
# install_name 을 @rpath 로 (절대 경로 dlopen 에는 영향 없음. 빌드 머신 경로가 바이너리에 남지 않게)
( cd native && RUSTFLAGS="-C link-arg=-Wl,-install_name,@rpath/libakan_native_desktop.dylib" cargo build --release -q )

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Frameworks" "$APP/Contents/Resources"
bun build --compile ./js/main.ts ./js/host.ts --outfile "$APP/Contents/MacOS/$EXE" >/dev/null
cp native/target/release/libakan_native_desktop.dylib "$APP/Contents/Frameworks/"
cp -R app "$APP/Contents/Resources/app"

CAM=""
if [ -n "$CAMERA_DESC" ]; then
  CAM="  <key>NSCameraUsageDescription</key><string>$CAMERA_DESC</string>
  <key>NSMicrophoneUsageDescription</key><string>$CAMERA_DESC</string>"
fi
cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>$EXE</string>
  <key>CFBundleIdentifier</key><string>com.akanjs.proto</string>
  <key>CFBundleName</key><string>AkanNative Proto</string>
  <key>CFBundleDisplayName</key><string>AkanNative Proto</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.0.1</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>LSMinimumSystemVersion</key><string>26.0</string>
  <key>NSHighResolutionCapable</key><true/>
$CAM
</dict>
</plist>
EOF
plutil -lint "$APP/Contents/Info.plist" >/dev/null

# 안쪽 코드부터 서명 → 번들 서명 (--deep 불필요). 개발용 ad-hoc (-s -)
codesign --force -s - "$APP/Contents/Frameworks/libakan_native_desktop.dylib"
codesign --force -s - "$APP"
codesign --verify --strict --verbose=2 "$APP" 2>&1 | tail -2
du -sh "$APP" "$APP/Contents/MacOS/$EXE" "$APP/Contents/Frameworks/libakan_native_desktop.dylib"
```

### 2.9 테스트 페이지 요점 (`app/index.html`)
```js
// 브리지 호출 (프로토타입). x-akan-native-ipc 표식 헤더를 붙인다
const r = await fetch("/__akan_native/ipc", { method: "POST", body, headers: { "X-Akan-Native-Ipc": "1" } });
// 호스트 → 페이지 push: akan_native_emit(1, "window.__akan_nativeReceive({...})")
window.__akan_nativeReceive = (ev) => { received.push(ev); };
```
그 밖에 body 종류·크기별 전송과 해시 비교, 왕복 지연, `isSecureContext`·`mediaDevices`·`enumerateDevices`·`getUserMedia`, SPA 폴백(`/some/deep/route` → index.html), `/__akan_native/*` 404, 샌드박스 iframe의 IPC 시도, `visibilitychange`·`focus`·`blur`·`keydown`·파일 입력 `cancel` 보고를 한다.

## 3. 참고 코드 노하우
링크는 이 파일 기준 상대 경로다(`../../../` = `study/`).

### 3.1 WRY 0.57.0
- **커스텀 프로토콜 태스크 수명** [코드]: 스킴마다 ObjC 클래스를 런타임에 만든다. 클래스 이름에 `WEBVIEW_STATE` 주소를 넣어 dylib마다 따로 만든다 ([url_scheme_handler.rs:29-54](../../../wry/src/wkwebview/class/url_scheme_handler.rs#L29-L54)). `startURLSchemeTask`에서 task 주소를 키로 UUID를 발급하고 ([url_scheme_handler.rs:68-69](../../../wry/src/wkwebview/class/url_scheme_handler.rs#L68-L69)), responder는 `did*`를 부르기 전마다 "webview가 아직 있는가 + task UUID가 같은가"를 다시 확인하고 ObjC 예외를 `objc2::exception::catch`로 삼킨다 ([url_scheme_handler.rs:163-203](../../../wry/src/wkwebview/class/url_scheme_handler.rs#L163-L203), [url_scheme_handler.rs:260-290](../../../wry/src/wkwebview/class/url_scheme_handler.rs#L260-L290)). `stopURLSchemeTask`는 키만 지운다 ([url_scheme_handler.rs:336-343](../../../wry/src/wkwebview/class/url_scheme_handler.rs#L336-L343)). 그래서 페이지가 떠난 뒤 늦게 응답해도 크래시하지 않는다 [실행]. 확인과 호출 사이에 stop이 끼어드는 경우는 예외 catch가 막는다. 키 맵은 `Mutex`라 다른 스레드에서 불러도 안전하다 ([wry_web_view.rs:34](../../../wry/src/wkwebview/class/wry_web_view.rs#L34), [wry_web_view.rs:125-153](../../../wry/src/wkwebview/class/wry_web_view.rs#L125-L153)).
- **responder가 WKWebView와 task를 retain한다** [코드] ([url_scheme_handler.rs:187-188](../../../wry/src/wkwebview/class/url_scheme_handler.rs#L187-L188)). 응답하지 않은 responder를 쥐고 있으면 그만큼 살아 있고, responder를 마지막으로 놓는 스레드에서 해제된다. main에서 응답·폐기해야 하는 또 하나의 이유다.
- **POST body** [코드]: `HTTPBody`가 있으면 그대로, 없으면 `HTTPBodyStream`을 열고 `hasBytesAvailable`인 동안 128바이트씩 읽는다 ([url_scheme_handler.rs:106-123](../../../wry/src/wkwebview/class/url_scheme_handler.rs#L106-L123)). Blob 본문은 스트림으로 오는데 열자마자 `hasBytesAvailable`이 false라서 0바이트가 되는 것으로 보인다 [추정, 증상은 실행으로 확인].
- **MIME** [코드]: wry는 추측하지 않는다. 응답에 `Content-Type`이 있을 때만 넣고 `Content-Length`는 항상 넣는다 ([url_scheme_handler.rs:220-248](../../../wry/src/wkwebview/class/url_scheme_handler.rs#L220-L248)). 확장자 → MIME 표는 우리가 가져야 한다(§2.4 `mime_for`).
- **핸들러는 main에서 불리고 `Send + Sync`여야 한다** [코드]: `WEBVIEW_STATE`에 `Rc<dyn Fn + Send + Sync>`로 저장 ([mod.rs:109-118](../../../wry/src/wkwebview/mod.rs#L109-L118)), 등록은 웹뷰 생성 전에 configuration에 한다 ([mod.rs:251-299](../../../wry/src/wkwebview/mod.rs#L251-L299)). `RequestAsyncResponder`는 "실제로는 Send"라며 `unsafe impl Send` ([lib.rs:436-454](../../../wry/src/lib.rs#L436-L454)). 예제 문서도 다른 스레드에서 응답한다 ([lib.rs:1110-1167](../../../wry/src/lib.rs#L1110-L1167)).
- **evaluate_script 스레드** [코드]: `WebView`는 `MainThreadMarker`를 들고 있어 `!Send`다 ([mod.rs:133-161](../../../wry/src/wkwebview/mod.rs#L133-L161)). 생성은 main이 아니면 `NotMainThread` ([mod.rs:202](../../../wry/src/wkwebview/mod.rs#L202)). eval은 첫 `didCommitNavigation` 전까지 큐에 쌓였다가 실행되고, 그 뒤로는 바로 실행된다 ([mod.rs:724-779](../../../wry/src/wkwebview/mod.rs#L724-L779), [navigation.rs:17-37](../../../wry/src/wkwebview/navigation.rs#L17-L37)). 반환값은 JSON 문자열이고 JS 예외는 전달되지 않는다 ([lib.rs:2100-2117](../../../wry/src/lib.rs#L2100-L2117)).
- **navigation / new window** [코드+실행]: `decidePolicyForNavigationAction`에서 URL 문자열로 우리 함수를 부른다. main frame·iframe 구분 없이 모든 프레임에 불린다 ([navigation.rs:50-83](../../../wry/src/wkwebview/navigation.rs#L50-L83), [lib.rs:1303-1310](../../../wry/src/lib.rs#L1303-L1310)). `window.open`·`target=_blank`는 `createWebViewWithConfiguration`에서 new window handler를 부른다. `Deny`면 창을 만들지 않는다 ([wry_web_view_ui_delegate.rs:171-292](../../../wry/src/wkwebview/class/wry_web_view_ui_delegate.rs#L171-L292), [lib.rs:1398-1411](../../../wry/src/lib.rs#L1398-L1411)).
- **권한** [코드]: `requestMediaCapturePermissionForOrigin`에서 handler를 부르는데 **origin 인자를 버린다**(`PermissionKind`만 넘김). **handler가 없으면 `Grant`** ([wry_web_view_ui_delegate.rs:127-169](../../../wry/src/wkwebview/class/wry_web_view_ui_delegate.rs#L127-L169)). `Default`는 `WKPermissionDecision::Prompt`(WebKit 자체 확인 창 [추정, 화면 확인 안 함]). 이미 결정된 권한은 handler를 부르지 않는다는 문서 ([lib.rs:1312-1350](../../../wry/src/lib.rs#L1312-L1350)).
- **파일 선택** [코드+실행]: `runOpenPanelWithParameters`를 구현한다. `NSOpenPanel.runModal`(중첩 루프)로 띄우고 다중 선택·폴더 옵션만 반영한다(accept 필터는 반영하지 않는다) ([wry_web_view_ui_delegate.rs:99-125](../../../wry/src/wkwebview/class/wry_web_view_ui_delegate.rs#L99-L125)).
- **devtools** [코드]: `with_devtools(true)` + (debug 빌드 또는 `devtools` feature)이면 `setInspectable(true)`와 private KVC `developerExtrasEnabled` ([mod.rs:538-551](../../../wry/src/wkwebview/mod.rs#L538-L551), [lib.rs:1274-1288](../../../wry/src/lib.rs#L1274-L1288)). App Store에는 private API 문제가 있다.
- **흰 화면 방지** [코드]: `with_background_color`가 있으면 `drawsBackground=NO`(private KVC) + macOS 12+ `underPageBackgroundColor`. 뒤에 창 배경이 보이므로 tao 창 배경색도 같이 줘야 한다 ([mod.rs:372-376](../../../wry/src/wkwebview/mod.rs#L372-L376), [mod.rs:429-444](../../../wry/src/wkwebview/mod.rs#L429-L444), [lib.rs:961-975](../../../wry/src/lib.rs#L961-L975), tao [window.rs:601](../../../tao/src/window.rs#L601)). 프로토타입은 둘 다 `#1e1e2e`로 줬다. 화면 캡처로 깜빡임을 확인하지는 않았다 [미확인].
- **웹뷰 생성 시 부수 효과** [코드+실행]: 창의 contentView를 `WryWebViewParent`로 바꾸고 `makeFirstResponder(webview)`, 그리고 **앱을 activate** 한다 ([mod.rs:666-705](../../../wry/src/wkwebview/mod.rs#L666-L705)). titlebar separator를 없앤다 ([mod.rs:608-619](../../../wry/src/wkwebview/mod.rs#L608-L619)).
- **`with_initialization_script`** [코드]: `WKUserScript(AtDocumentStart)` ([mod.rs:781-793](../../../wry/src/wkwebview/mod.rs#L781-L793)). akan-native는 `/__akan_native/init.js`로 대신한다. 프로토타입에서 `<head>` 첫 `<script src="/__akan_native/init.js">`가 앱 번들보다 먼저 실행돼 `window.__AKAN_NATIVE__`가 채워지는 것을 확인했다 [실행].
- **메뉴가 필요하다는 문서** [코드]: "macOS … your app will still need to add menu item accelerators to use the clipboard shortcuts" ([lib.rs:1389-1396](../../../wry/src/lib.rs#L1389-L1396)). child webview는 `performKeyEquivalent`를 막는 우회가 있다 ([wry_web_view.rs:44-56](../../../wry/src/wkwebview/class/wry_web_view.rs#L44-L56)). 우리는 창 전체 웹뷰(`build`)라 해당 없음.

### 3.2 TAO 0.37.0
- **main 스레드 강제** [코드]: macOS는 `EventLoop::new`가 main이 아니면 panic한다 ([platform_impl/macos/event_loop.rs:163-180](../../../tao/src/platform_impl/macos/event_loop.rs#L163-L180), 문서 [event_loop.rs:97-111](../../../tao/src/event_loop.rs#L97-L111)). FFI 너머에서 panic하면 abort되므로 `akan_native_run`은 먼저 `pthread_main_np()`를 확인하고 -1을 반환한다. Bun의 JS main 스레드가 프로세스 main 스레드인 것을 확인했다 [실행].
- **run** [코드+실행]: `run(self, F) -> !`는 `run_return`의 결과로 `process::exit(code)`를 부른다 ([platform_impl/macos/event_loop.rs:197-245](../../../tao/src/platform_impl/macos/event_loop.rs#L197-L245)). `ControlFlow::ExitWithCode(i32)`는 한 번 설정하면 되돌릴 수 없다 ([event_loop.rs:145-185](../../../tao/src/event_loop.rs#L145-L185)). 종료 코드가 셸까지 그대로 온다 [실행]. Worker 스레드가 돌고 있는 상태에서 `exit()`해도 크래시 리포트는 생기지 않았다 [실행].
- **Cmd+Q** [코드+실행]: `terminate:` → `applicationWillTerminate:` → `AppState::exit()`(`LoopDestroyed` 전달) 후 AppKit이 프로세스를 끝낸다 ([app_delegate.rs:124-134](../../../tao/src/platform_impl/macos/app_delegate.rs#L124-L134), [app_state.rs:272-282](../../../tao/src/platform_impl/macos/app_state.rs#L272-L282)). `ExitWithCode`를 거치지 않으므로 종료 코드는 0이다. tao는 `applicationShouldTerminate:`를 구현하지 않아 막을 방법이 없다.
- **EventLoopProxy** [코드]: 만들 때마다 CFRunLoopSource를 **common modes**에 붙이고 `send_event`는 채널 + `CFRunLoopSourceSignal` + `CFRunLoopWakeUp` ([platform_impl/macos/event_loop.rs:324-355](../../../tao/src/platform_impl/macos/event_loop.rs#L324-L355)). common modes라서 `NSOpenPanel.runModal` 같은 중첩 modal 루프 중에도 user event가 전달된다 [실행: 파일 창이 떠 있는 동안 보낸 `modal` 디버그 명령이 처리됨].
- **시작 시 activate** [코드]: `applicationDidFinishLaunching`에서 activation policy 적용 후 `activateIgnoringOtherApps` ([app_state.rs:284-307](../../../tao/src/platform_impl/macos/app_state.rs#L284-L307)). `EventLoopExtMacOS::set_activation_policy`·`set_activate_ignoring_other_apps` ([platform/macos.rs:310-360](../../../tao/src/platform/macos.rs#L310-L360), `ActivationPolicy` [platform/macos.rs:174-182](../../../tao/src/platform/macos.rs#L174-L182)).
- **useAppState용 이벤트** [코드+실행]: macOS에서 tao가 주는 것은 `WindowEvent::Focused(bool)`(`windowDidBecomeKey`/`ResignKey`)뿐이다 ([window_delegate.rs:374-392](../../../tao/src/platform_impl/macos/window_delegate.rs#L374-L392), [event.rs:348-351](../../../tao/src/event.rs#L348-L351)). `Suspended`/`Resumed`/`Started`/`Stopped`은 macOS 미지원 ([event.rs:293-325](../../../tao/src/event.rs#L293-L325)). 최소화·가림·앱 숨김 delegate는 등록돼 있지 않다 ([window_delegate.rs:170-265](../../../tao/src/platform_impl/macos/window_delegate.rs#L170-L265)). 그래서 프로토타입은 `NSNotificationCenter`에 7개 알림을 직접 등록했다. 관찰한 순서:

| 동작 | 네이티브 신호 (순서대로) | 페이지 DOM |
|---|---|---|
| 최소화 | `windowDidMiniaturize` → `windowOcclusion(visible=false)` → `Focused(false)` | `blur`, `visibilitychange → hidden` |
| 복원 | `windowDidDeminiaturize` → `windowOcclusion(true)` → `Focused(true)` | `focus`, `visible` |
| 앱 숨김(Cmd+H) | `appDidHide` → `Focused(false)` → `appDidResignActive` → `windowOcclusion(false)` | `hidden` |
| 숨김 해제 | `appDidUnhide` → `windowOcclusion(true)` (프로그램으로 activate는 안 됨) | `visible`, 포커스 없음 |
| 다른 앱으로 전환 | `appDidResignActive` → `Focused(false)` | `blur` |
| 다른 창이 완전히 덮음 | `windowOcclusion(false)` | `hidden` |

  매핑: **active** = 창이 key이고 보임 · **inactive** = 보이지만 key가 아님(다른 앱 활성) · **background** = occlusion visible=false(최소화·숨김·완전히 가려짐 포함). WKWebView의 `visibilityState`/`hasFocus()`가 이 매핑과 같다.

### 3.3 Electrobun v1 (v1.18.1)
- **경로** [코드]: `dirname(process.argv0)`(= MacOS 폴더) 기준으로 `libNativeWrapper`를 찾고, 실패하면 `resolve()`한 절대 경로로 다시 시도한다 ([launcher/main.ts:7-9](../../../electrobun-v1/package/src/launcher/main.ts#L7-L9), [launcher/main.ts:86-121](../../../electrobun-v1/package/src/launcher/main.ts#L86-L121)). 앱 코드는 `../Resources/app/bun/index.js`. akan-native는 `process.execPath`를 쓴다(컴파일 실행 파일에서 절대 경로임을 확인 [실행]).
- **Worker 시작 순서** [코드]: main에서 SIGINT/SIGTERM 무시 핸들러 등록 → `new Worker(path)` → 기다리지 않고 바로 `startEventLoop` → 루프가 반환되면 `_exit` ([launcher/main.ts:235-260](../../../electrobun-v1/package/src/launcher/main.ts#L235-L260)). cstring은 `ptr(new Uint8Array(Buffer.from(s + "\0")))`로 직접 인코딩한다.
- **threadsafe JSCallback으로 문자열을 받는다** [코드]: `new JSCallback(fn, { args: [u32, cstring, cstring], threadsafe: true })` ([bun/proc/native.ts:2501-2526](../../../electrobun-v1/package/src/bun/proc/native.ts#L2501-L2526), [bun/proc/native.ts:1918-1935](../../../electrobun-v1/package/src/bun/proc/native.ts#L1918-L1935)). 콜백이 Worker에서 늦게 돌기 때문에 네이티브는 `strdup` 후 **1초 뒤 free**한다 ([nativeWrapper.mm:2516-2532](../../../electrobun-v1/package/src/native/macos/nativeWrapper.mm#L2516-L2532)). akan-native는 wake에 인자를 싣지 않아 이 문제가 없다(§1 Q3에서 확인한 "비동기 큐" 동작이 이 우회의 원인이다).
- **JSCallback 관련 우회 주석** [코드]: 배치 전송 후 2 ms 잠금 "Bun JSCallback threading issue" ([bun/preload/internalRpc.ts:16-32](../../../electrobun-v1/package/src/bun/preload/internalRpc.ts#L16-L32)), 이벤트를 `setTimeout`으로 미룸 "race condition with Bun FFI" ([bun/preload/events.ts:10-12](../../../electrobun-v1/package/src/bun/preload/events.ts#L10-L12)). akan-native 프로토타입에서는 같은 증상을 보지 못했다.
- **Worker keepalive** [추정]: Electrobun의 Worker는 `Socket.ts`가 import될 때 여는 `Bun.serve`가 루프를 붙잡는다 ([bun/core/Socket.ts:67](../../../electrobun-v1/package/src/bun/core/Socket.ts#L67)). akan-native는 서버를 열지 않으므로 명시적 keepalive가 필요하다(§1 Q3-1).
- **메뉴 role → selector 표** [코드]: `quit→terminate:`, `selectAll→selectAll:`, `pasteAndMatchStyle→pasteAsPlainText:` 등 ([nativeWrapper.mm:111-150](../../../electrobun-v1/package/src/native/macos/nativeWrapper.mm#L111-L150)). 메뉴 JSON은 `strdup` 후 `dispatch_async(main)`에서 파싱해 `setMainMenu` ([nativeWrapper.mm:8192-8210](../../../electrobun-v1/package/src/native/macos/nativeWrapper.mm#L8192-L8210)).
- **번들·서명** [코드]: Info.plist는 `CFBundleExecutable=launcher` 등 소수 키 + 권한 설명 ([cli/index.ts:2474-2500](../../../electrobun-v1/package/src/cli/index.ts#L2474-L2500)), entitlement ↔ `NS…UsageDescription` 대응표 ([cli/index.ts:1567-1590](../../../electrobun-v1/package/src/cli/index.ts#L1567-L1590)). 공증용 hardened runtime에서 Bun이 돌려면 `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`이 필요하다고 기본값에 적혀 있다 ([cli/index.ts:1493-1507](../../../electrobun-v1/package/src/cli/index.ts#L1493-L1507)). `--deep` 대신 바이너리를 하나씩 서명한다 ([cli/index.ts:5030-5031](../../../electrobun-v1/package/src/cli/index.ts#L5030-L5031)).

### 3.4 Tauri
- **앱 데이터 폴더** [코드]: `app_data_dir = dirs::data_dir()/<bundle identifier>` → macOS에서 `~/Library/Application Support/<id>` ([tauri/src/path/desktop.rs:247-257](../../../tauri/crates/tauri/src/path/desktop.rs#L247-L257)). 로그는 `~/Library/Logs/<id>` ([desktop.rs:296-301](../../../tauri/crates/tauri/src/path/desktop.rs#L296-L301)). Bun에서는 `join(os.homedir(), "Library/Application Support", id)`로 같게 만든다. `dirs` 크레이트는 wry의 의존성이라 Rust 쪽에서도 쓸 수 있다.
- **Info.plist 생성** [코드]: `CFBundleDevelopmentRegion`, `CFBundleDisplayName`, `CFBundleExecutable`, `CFBundleIdentifier`, `CFBundleInfoDictionaryVersion`, `CFBundleName`, `CFBundlePackageType`, `CFBundleShortVersionString`, `CFBundleVersion`, `CSResourcesFileMapped`, `LSMinimumSystemVersion`, `LSRequiresCarbon`, `NSHighResolutionCapable` + 사용자 plist 병합 ([tauri-bundler/src/bundle/macos/app.rs:211-360](../../../tauri/crates/tauri-bundler/src/bundle/macos/app.rs#L211-L360)). `LSRequiresCarbon`·`CSResourcesFileMapped`는 레거시 키라 akan-native 프로토타입에는 넣지 않았고, 없이도 동작했다 [실행].
- **서명 순서** [코드]: "signing must be done inside out", 서명 전 확장 속성 제거(QA1940) ([app.rs:115-132](../../../tauri/crates/tauri-bundler/src/bundle/macos/app.rs#L115-L132)). 명령은 `codesign --force -s <identity> [--options runtime] [--entitlements]` ([tauri-macos-sign/src/keychain.rs:207-252](../../../tauri/crates/tauri-macos-sign/src/keychain.rs#L207-L252)).
- **기본 메뉴** [코드]: macOS에서 기본으로 켜진다(`enable_macos_default_menu: true`, [tauri/src/app.rs:1692](../../../tauri/crates/tauri/src/app.rs#L1692), [app.rs:2418-2423](../../../tauri/crates/tauri/src/app.rs#L2418-L2423)). 구성: 앱 이름(About, Services, Hide, Hide Others, Quit) · File(Close Window) · Edit(Undo, Redo, Cut, Copy, Paste, Select All) · View(Fullscreen) · Window(Minimize, Maximize, Close) · Help ([tauri/src/menu/menu.rs:141-236](../../../tauri/crates/tauri/src/menu/menu.rs#L141-L236)). muda를 거치지 않고 objc2-app-kit으로 같은 것을 만드는 코드가 §2.4 `install_default_menu`다(약 45줄).

## 4. akan-native 설계에 반영할 점 (아키텍처 문서와 달라져야 할 곳)

### 4.1 C ABI (§9) 수정안
```c
void     akan_native_set_wake(void (*wake)(void));       // NULL 허용: 호스트 종료 → 보류·이후 IPC 모두 503
int32_t  akan_native_run(const char* config_json);        // -1 = main 스레드 아님, -2 = 설정 오류. 정상이면 반환 안 함
uint32_t akan_native_poll(uint8_t* buf, uint32_t cap);    // 바이너리 프레임 [u8 kind][u64 reqId][u32 webviewId][body]
                                                   // 0 = 없음, >cap = 필요한 크기(소비 안 함). 호출마다 wake 플래그 해제
void     akan_native_respond(uint64_t req_id, uint16_t status, const char* content_type,
                      const uint8_t* body, uint32_t len);   // 즉시 반환. 실제 응답은 main에서
void     akan_native_emit(uint32_t webview_id, const char* js);
void     akan_native_register_file(const char* id, const char* path);   // (프로토타입에는 없음)
void     akan_native_quit(int32_t code);
```
- **poll 메시지를 JSON에서 바이너리 프레임으로 바꾼다.** IPC body를 JSON 안에 넣으려면 Rust에서 이스케이프하고 JS에서 다시 파싱해야 한다. 프레임이면 body를 그대로 넘기고 JS는 `TextDecoder` 한 번이면 된다. 이벤트(kind 2)만 JSON이다.
- **`akan_native_respond`는 main으로 넘긴다**(§1 Q3 마지막 항목). 아키텍처 §3.3의 "Worker에서 바로 응답할 수 있다"는 맞지만, 그러면 main이 바쁜 동안 Worker가 같이 멈춘다.
- **wake 플래그 규칙**: "큐가 비어 있다가 처음 들어올 때만 wake" + "poll 호출마다 플래그 해제".
- 네이티브 이벤트(kind 2)로 최소 `init`, `pageLoad{started|finished,url}`, `window{focused,closeRequested}`, `external{url}`을 보낸다. `pageLoad started`는 dispatcher의 `reset()`(페이지 재로드 → 구독 해제) 신호로 쓰기 좋다.
- 보류 중인 responder는 webview·"페이지 세대"와 함께 저장하고, `pageLoad started`에서 이전 세대 것을 main에서 버린다(응답하지 않은 fetch는 페이지와 함께 사라진다). 창을 닫을 때도 main에서 버린 뒤 웹뷰를 drop한다. (프로토타입은 아직 하지 않는다.)
- 설정 JSON 파싱: 프로토타입은 약 120줄짜리 파서를 넣었다. `serde_json`을 쓸지는 사용자 결정이 필요하다(wry/tao 트리에 serde가 없어서 새 의존성이 된다).

### 4.2 §3.3 실행 흐름
- main.ts: `dlopen` → `new Worker(new URL("./host.ts", import.meta.url).href)` → **ready를 기다린다**(main이 막히기 전에 Worker 로딩 오류를 볼 수 있는 유일한 기회다. 타임아웃과 `error` 이벤트를 받아 출력하고 종료) → `akan_native_run`. akan_native_run이 반환하면 오류이므로 `process.exit(1)`.
- host.ts 필수 골격(§2.7): keepalive, `process.on("uncaughtException"/"unhandledRejection")`, drain 메시지별 try/catch, `process.on("exit", () => akan_native_set_wake(null))`, `akan_native_set_wake(wake.ptr)`를 **한 다음에** `postMessage("ready")`.
- Worker 로그는 `console.log`로 stdout에 나온다. `open`으로 띄우면 stdout이 버려지므로 `akan-native run macos`는 실행 파일을 직접 실행하거나 `open --stdout/--stderr`를 쓴다(WV-3).
- 종료: `akan_native_quit(code)`는 코드가 보존된다. 메뉴 Quit(`terminate:`)는 코드 0으로 바로 끝나고 JS가 끼어들 수 없다. 플러그인 정리(설정 파일 flush 등)가 필요하면 Quit 메뉴를 `terminate:` 대신 우리 selector로 만들어 JS에 "quit 요청" 이벤트를 보내고 JS가 `akan_native_quit`을 부르게 한다(창 닫기 `CloseRequested`도 같은 방식).
- 패키지 구조는 문서대로 동작했다: `MacOS/<exe>`(bun --compile), `Frameworks/libakan_native_desktop.dylib`, `Resources/app/`.

### 4.3 §4 브리지 (`packages/core`의 desktop Transport)
현재 [runtime.ts:115-119](../../packages/core/src/runtime.ts#L115-L119)는 `content-type: application/json` + `JSON.stringify(req)`로 보낸다. 문자열 body라서 그대로 동작한다. 덧붙일 것:
- body는 **항상 문자열 또는 ArrayBuffer**. `Blob`/`File`을 그대로 넘기지 않는다(0바이트로 도착). 큰 바이너리는 `await blob.arrayBuffer()` 후 전송한다(20 MB까지 확인).
- fetch에 `referrerPolicy: "same-origin"`을 명시한다. 네이티브의 출처 확인이 `Referer`에 의존하는데, 앱이 `<meta name="referrer" content="no-referrer">`를 쓰면 브리지가 끊긴다.
- 표식 헤더(프로토타입의 `X-Akan-Native-Ipc: 1`)는 보안 수단이 아니다(preflight가 없다). form 제출 같은 우발적 POST와 구분하는 용도로만 쓸지 정한다.
- 이벤트 push(`evaluate_script("__AKAN_NATIVE__.receive(m)")`)는 첫 커밋 전에는 큐에 쌓이므로 부팅 직후 이벤트도 안전하다 [코드]. reload 중에 보낸 이벤트는 사라질 수 있다.

### 4.4 §5 에셋 · SEC-1
- IPC 출처 규칙(검증된 형태): `Origin`이 있으면 `app://localhost`여야 하고, 없으면 `Referer`가 `app://localhost/`로 시작해야 한다. 샌드박스 iframe의 세 가지 시도(cors·표식 헤더·no-cors)가 모두 거절됐다 [실행].
- navigation handler가 iframe에도 불리므로 SH-4 허용 목록(`app://localhost/`, `about:`)이 외부 iframe도 막는다. `about:srcdoc` iframe은 허용되지만 opaque origin이라 위 규칙에 걸린다.
- 정적 파일 응답에는 확장자 기반 MIME을 반드시 넣는다(wry는 넣지 않는다). SPA 폴백·`/__akan_native/*` 404·`..` 거부를 확인했다. 정적 파일 읽기가 main 스레드에서 일어나므로 큰 파일(IN-5 동영상)은 백그라운드 스레드에서 읽고 응답을 main으로 보낸다.

### 4.5 플러그인
- **app-state**: `desktop: "web"`이 맞다. WKWebView의 `visibilitychange`·`focus`·`blur`가 네이티브 상태와 일치했다(§3.2 표). 네이티브 구현이 필요해지면 §2.4 `install_state_observers`의 알림 7개를 쓴다.
- **camera**: `desktop: "web"`(getUserMedia 미리보기)이 가능하다. 대신
  - macOS 빌드의 Info.plist에 `NSCameraUsageDescription`이 들어가야 한다. 지금 `native-plugin.json` 규격(§6)에는 iOS용 `infoPlist`만 있으므로 macOS용 키(예: `"macos": { "infoPlist": {…} }`)가 필요하다. 없으면 getUserMedia가 끝나지 않는다.
  - wry permission handler는 Camera/Microphone에 `Allow`를 반환한다. 시스템(TCC) 프롬프트가 이미 사용자 동의를 받고, `Default`면 WebKit 확인 창이 한 번 더 뜰 수 있다 [추정]. handler에 origin이 오지 않지만 네비게이션이 앱 오리진으로 잠겨 있어 괜찮다.
  - `checkPermission`을 웹 API `navigator.permissions.query({ name: "camera" })`로 구현할 수 있는지 [미확인]. TCC 상태를 정확히 알려면 AVFoundation `authorizationStatusForMediaType:`가 필요하다(Rust objc2로 가능하지만 `objc2-av-foundation`은 지금 트리에 없는 크레이트라 사용자 결정이 필요하다).
- **preferences**: 앱 데이터 폴더 = `~/Library/Application Support/<bundle id>`(Tauri와 같음). `localStorage`도 재실행 후 유지되지만 WebKit 저장소에 묶이므로 JSON 파일 방식(현재 설계)이 낫다.

### 4.6 빌드·패키징 (§8)
- `bun build --compile ./main.ts ./host.ts --outfile .akan/native/build/macos/<App>.app/Contents/MacOS/<exe>`. Worker 엔트리를 반드시 같이 넘긴다.
- dylib: `RUSTFLAGS="-C link-arg=-Wl,-install_name,@rpath/libakan_native_desktop.dylib"`로 빌드. release 프로필 `opt-level="s"`, `lto`, `strip`, `panic="abort"`로 0.87 MB.
- 서명: `xattr -cr <App>.app`(Tauri) → `codesign --force -s - Frameworks/*.dylib` → `codesign --force -s - <App>.app` → `codesign --verify --strict`.
- **개발 중 TCC 반복 문제**: ad-hoc 서명은 빌드마다 designated requirement(cdhash)가 바뀐다. 개발용으로 키체인에 고정 자체 서명 인증서를 두거나, `akan-native run`이 권한 문제를 만나면 `tccutil reset Camera <bundle id>`를 안내한다. 둘 다 사용자 결정이 필요하다.
- 이후 공증: hardened runtime에서 Bun JIT를 위해 Electrobun과 같은 entitlement 3개가 필요할 것이다 [추정].
- 자동 테스트: 창이 포커스를 뺏는다(wry의 activate). CI나 테스트 묶음으로 네이티브를 돌릴 때는 `ActivationPolicy::Prohibited`(설정 키)로 띄운다. 키 입력이 필요한 테스트만 일반 모드로 돌린다.

### 4.7 메뉴 (새 항목)
- 메뉴는 "SH-6 이후"가 아니라 **MVP에 필수**다. 없으면 텍스트 입력에서 복사·붙여넣기·전체 선택·되돌리기와 Cmd+Q가 전부 안 된다.
- Rust 쪽에 기본 메뉴를 넣고 `config.menu: true|false`로 끈다(§2.4). 앱 이름·메뉴 문구 현지화는 설정 값으로 받는다. 추가 크레이트 없이 objc2-app-kit feature(`NSMenu`, `NSMenuItem`)만 켜면 된다.

## 5. 남은 위험
| 위험 | 내용 | 대응 |
|---|---|---|
| 카메라 스트림 [미확인] | "허용" 후 실제 프레임 수신, `facingMode` 폴백, 두 번째(WebKit) 프롬프트 여부를 확인하지 못했다 | M2 초반에 사람이 한 번 눌러서 확인. 안 되면 AVFoundation 네이티브 구현 |
| TCC와 ad-hoc 서명 | 재빌드마다 권한 기록이 맞지 않는다. 설명 문구가 없으면 영구 대기 | Info.plist 생성 검사(카메라 플러그인이 있는데 키가 없으면 빌드 실패), 개발 서명 정책 결정 |
| Bun threadsafe JSCallback 동작이 문서화돼 있지 않음 | "만든 스레드의 이벤트 루프로 비동기 전달"은 관찰 결과다. 종료된 Worker의 콜백을 부르면 segfault | Electrobun처럼 FFI 계약 테스트(프로토타입 시나리오 `quitonly`·`busy`·`throw`·`blockonly`)를 Bun 업그레이드마다 실행 |
| Worker 사망 | 예외·루프 비움으로 Worker가 끝나면 앱은 떠 있지만 브리지가 죽는다(503) | keepalive + uncaughtException 필수. 필요하면 네이티브가 오류 화면을 띄우거나 앱을 종료 |
| Blob body 0바이트 | wry의 스트림 읽기 방식 때문 [추정] | core에서 Blob을 막거나 변환. wry 업데이트 때 재확인 |
| 출처 확인이 Referer에 의존 | WebKit이 같은 오리진 POST에 Origin을 붙이지 않는다 | `referrerPolicy` 명시, 규칙을 공통 테스트 묶음(NF-3)에 넣기 |
| main 스레드 작업 | 정적 파일 읽기·메뉴·옵저버가 모두 main이다. main이 오래 막히면 IPC 응답도 멈춘다 | 큰 파일은 백그라운드에서 읽기, main에서 동기 I/O 금지 |
| 종료 경로 | Cmd+Q·`process::exit`은 JS 정리 없이 끝난다 | Quit 메뉴를 JS 경유로 바꾸거나, 플러그인이 즉시 저장하도록 규칙화 |
| 가려진 창의 타이머 | WebKit이 숨은 페이지 타이머를 늦춘다 | 이벤트는 push(evaluate_script)로 보내면 즉시 처리됨을 확인. 폴링에 의존하는 앱 코드는 문서화 |
| private API | `drawsBackground`, `developerExtrasEnabled`(wry) | App Store 배포 시 문제. MVP 범위 밖 |
| 흰 화면 방지 [미확인] | 코드상 창·웹뷰 배경을 모두 칠하지만 화면으로 확인하지 않았다 | 샘플 앱에서 눈으로 확인 |
| `devtools` [미확인] | release + `devtools` feature로 `isInspectable`이 켜지는지 Safari에서 보지 않았다 | M2에서 Safari 개발자 메뉴로 확인 |
