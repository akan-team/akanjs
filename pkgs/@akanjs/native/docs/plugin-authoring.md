# akan-native 플러그인 작성 가이드

> 규격: [architecture.md](architecture.md) §4(브리지)·§6(플러그인). 예시: `plugins/app-state`, `plugins/preferences`, `plugins/keyboard`, `plugins/camera`.
> 원칙: OS SDK와 kotlin-stdlib만 쓴다. AndroidX·kotlinx·Play Services·CocoaPods·SPM 의존은 쓰지 않는다([requirements.md](requirements.md) §0).

## 1. 폴더

```
plugins/<id>/
├─ package.json          name "@akanjs/native/plugins/<id>", exports ".": "./src/index.ts", "./native-plugin.json"
├─ native-plugin.json      manifest (§2)
├─ src/index.ts          JS API (definePlugin) + hook + 타입
├─ src/web.ts            web 구현 (defineWebPlugin)
├─ src/desktop.ts        (선택) 데스크톱 Bun 구현 (defineDesktopPlugin)
├─ ios/<Name>Plugin.swift
├─ android/<Name>Plugin.kt
└─ test/<id>.test.ts     목 호스트 테스트 (bun test)
```

## 2. manifest

```jsonc
{
  "id": "clipboard",                       // [a-z][a-z0-9-]*
  "apiVersion": 1,
  "methods": ["writeText", "readText"],    // JS API 전체. 네이티브 구현은 모두 처리하거나 UNSUPPORTED로 답한다
  "events": [],
  "codegen": true,                         // (선택) 스펙에서 Swift·Kotlin 타입과 프로토콜 생성 (§5)
  "web": "./src/web.ts",                   // 없으면 null
  "desktop": "web",                        // "web" | "./src/desktop.ts" | null
  "macos": { "infoPlist": {} },            // (선택) desktop "web" 구현이 필요로 하는 Info.plist 문구
  "ios": { "sources": ["ios/*.swift"], "class": "ClipboardPlugin", "frameworks": ["UIKit"], "infoPlist": {} },   // 또는 "web" | null
  "android": { "sources": ["android/*.kt"], "class": "com.akanjs.plugins.clipboard.ClipboardPlugin", "permissions": [], "applicationXml": "" }  // 또는 "web" | null
}
```
- 플랫폼 값이 `null`이거나 없으면 그 플랫폼에서 `UNSUPPORTED`다. `"web"`이면 WebView 안에서 web 구현을 쓴다.
- 네이티브 구현이 manifest의 메서드 일부만 지원하면 플랫폼 항목에 `"methods": [...]`를 적는다. 데스크톱은 `"desktop": { "module": "./src/desktop.ts", "methods": [...] }` 형식을 쓴다. 적지 않은 메서드는 그 플랫폼에서 `UNSUPPORTED`이고 `isSupported()`도 false다.
- 일부만 네이티브이고 나머지는 web 구현으로 충분하면 `"web": true`를 더한다. 예: macOS camera는 `"desktop": { "module": "./src/desktop.ts", "methods": ["checkPermission", "requestPermission"], "events": [], "web": true }` — 권한 상태는 셸(AVFoundation), 촬영은 getUserMedia. manifest에 `web` 항목이 있어야 한다.
- macOS에서 셸이 실행 직후 `UNUserNotificationCenter`의 delegate가 되어야 하는 플러그인(알림 클릭으로 앱이 켜져도 받으려면)은 `"macos": { "infoPlist": { "AkanNativeUserNotifications": true } }`를 둔다(`plugins/local-notifications`).
- 빌드가 거절하는 것(아키텍처 검토 6단계, 2026-09-27)
  - 모르는 키(`"ios": { "clas": … }` 같은 오타). apiVersion이 1보다 크면 "더 새 akan-native가 필요하다"는 오류다.
  - `$`로 시작하거나 글자로 시작하지 않는 메서드·이벤트 이름(`$` 이름은 브리지 것: `$listen`, `$bridge` …)과 예약 메서드 이름(`id`, `methods`, `events`, `listen`, `then`, `toJSON`, `constructor` …).
  - 이름 충돌: 플러그인 접두어(`pascal(id)`), iOS 앱 모듈 하나 안의 최상위 Swift 타입과 소스 파일 이름(셸·다른 플러그인·생성 코드와), Android의 같은 클래스나 대소문자만 다른 클래스 파일, 셸 패키지(`com.akanjs.runtime`, `com.akanjs.generated`) 안의 `android.class`. 자동으로 이름을 바꾸지 않는다. 오류에 두 출처와 겹친 방식(같음, 대소문자만, 구두점만)을 적는다. 그래서 플러그인의 Swift 보조 타입은 `private`로 두거나 플러그인 접두어를 붙인다.
- 진행률·크기·위치처럼 스냅샷인 이벤트는 `"coalesce": ["progress"]`에 적는다. 호스트는 한꺼번에 쏟아지면 마지막 값만, 100ms마다 한 번쯤 보낸다(다른 메시지가 나가기 전에는 먼저 보내 순서를 지킨다). payload는 누적값이나 절대값이어야 하고, 끝 상태는 이벤트가 아니라 메서드 결과로 알린다. 이벤트 payload에는 바이트(Uint8Array, ArrayBuffer, Blob …)를 싣지 않는다(스펙 검사 오류): FileRef나 짧은 base64를 쓴다.
- 다른 플러그인의 네이티브 코드를 쓰면 `"dependencies": ["other-id"]`. 그 플러그인이 앱의 plugins에 없거나, 이 플러그인이 네이티브인 플랫폼에서 그쪽이 web·null이면 빌드 오류다(자동으로 더하지 않는다).

### 권한 (PL-11)
앱은 설정 `capabilities`로 플러그인 호출을 창·플랫폼별로 허용하거나 막는다. 권한 이름은 manifest에서 자동으로 나온다: `<id>:allow-<method>`·`deny-<method>`, `<id>:allow-listen-<event>`·`deny-listen-<event>`, `<id>:default`, `<id>:all`. manifest에 더할 수 있는 것:

```jsonc
{
  "defaultPermissions": ["read"],          // (선택) "<id>:default"가 주는 것. 없으면 모든 메서드·이벤트(빌드가 목록으로 펼친다)
  "permissionSets": {                      // (선택) "<id>:read" 같은 이름 있는 묶음. allow-*·다른 묶음·"all"만
    "read": { "description": "…", "permissions": ["allow-readFile", "allow-stat"] }
  },
  "scope": {                               // (선택) 플러그인이 강제하는 스코프 필드. 앱의 스코프 항목은 이 필드만 쓸 수 있다
    "description": "…",
    "fields": { "base": "…", "path": "glob relative to base", "url": "URL pattern" },
    "pathFields": ["path"],                // 경로 glob으로 비교하는 필드(빌드가 절대 경로·"\\"·".."를 오류로 낸다)
    "urlFields": ["url"]                   // URL 패턴으로 비교하는 필드(urlMatch). "url"이라는 필드는 반드시 여기 있어야 한다
  }
}
```
- 검사는 호스트가 하고(데스크톱 dispatcher, iOS·Android AkanNativeBridge), 막힌 호출은 플러그인에 오지 않고 `NOT_ALLOWED`로 끝난다. 플러그인은 스코프만 챙기면 된다.
- 선언 게이트(L2): 호스트는 manifest의 그 플랫폼 목록에 없는 메서드·이벤트를 플러그인에 넘기지 않고 `NOT_FOUND`로 답한다. 구현만 하고 선언하지 않은 메서드는 불리지 않는다.
- 스코프: 호스트가 호출마다 해당 권한의 allow·deny 항목을 넘긴다. 항목은 필드 → glob이고(`*`·`?`, 경로 필드에서는 `**`가 폴더를 넘고 `dir/**`는 `dir` 자신도 포함), deny가 이기며, allow가 없으면 제한이 없다.
  - 경로 필드: allow 항목의 와일드카드는 점으로 시작하는 이름에 맞지 않고(점을 직접 써야 한다), deny 항목은 맞는다.
  - 대소문자를 구분하지 않는 볼륨의 경로라면 `fold`를 켠다.
  - 경로는 해석한 실제 위치(realpath)로도 검사하고 그 경로를 그대로 쓴다. 재귀 작업은 하위 항목까지 검사한다(filesystem이 예).
  - 데스크톱: `ctx.scope`와 `scopePermits(ctx.scope, { path }, ["path"], [], fold)`(`@akanjs/native/core`).
  - web: 메서드의 두 번째 인자 `ctx?: WebCallContext`의 `ctx.scope`, 같은 `scopePermits`.
  - iOS: `call.inScope(["path": p], pathFields: ["path"], fold:, what: p)`(false면 이미 NOT_ALLOWED로 답했다). Android: `call.inScope(mapOf("path" to p), setOf("path"), p)`, `AkanNativeScope.permits(…, fold = …)`.
  - 예: `plugins/filesystem`(`{ base, path }`, 실제 위치와 하위 항목도 검사, 목록에서 스코프 밖 항목을 뺀다), `plugins/opener`(`{ url }`, 정규화한 URL에 맞춘다).
- URL을 OS에 넘기는 플러그인(L0)
  - 셸의 외부 스킴만 연다: 데스크톱 `ctx.externalSchemes`, 모바일 `AkanNativeExternal.schemes`. http·https·mailto·tel과 앱의 `security.shell.externalSchemes`다.
  - 열기 전에 빈도를 확인한다. 데스크톱은 `externalOpenAllowed()`(`@akanjs/native/desktop`), 모바일은 `AkanNativeExternal.allowed()`다. false면 `NOT_ALLOWED`로 답한다.
- 스코프 밖이면 `NOT_ALLOWED`로 거절한다. `PERMISSION_DENIED`는 OS나 사용자가 거부한 경우에만 쓴다.

> 앱이 플러그인 없이 웹 표준 API(getUserMedia, `navigator.geolocation`)만 쓸 때는 앱 설정 `permissions: { camera, microphone, location }`으로 권한을 선언한다(plugins.md C8). 플러그인은 자기 manifest(`ios.infoPlist`, `android.permissions`)로 선언한다.

## 3. JS (`src/index.ts`, `src/web.ts`)

```ts
import { definePlugin, defineWebPlugin, AkanNativeError } from "@akanjs/native/core";
export interface ClipboardApi { writeText(args: { text: string }): Promise<void>; readText(): Promise<{ text: string }> }
export const clipboard = definePlugin<ClipboardApi>("clipboard", { methods: ["writeText", "readText"], web });
```
- 메서드 인자는 객체 하나, 결과는 JSON 값(문자열·숫자·불리언·null·배열·객체)만 쓴다. Date·Uint8Array는 쓰지 않는다. 큰 바이너리는 파일 URL(`FileRef`)로 돌려준다.
- 에러는 `AkanNativeError(code, message)`. 코드: `UNSUPPORTED`, `PERMISSION_DENIED`(OS·사용자 거부), `CANCELLED`, `INVALID_ARGS`, `NOT_FOUND`, `NOT_ALLOWED`(앱의 capabilities가 허용하지 않음, PL-11), `INTERNAL`.
- `plugin.isAllowed(method)`: 이 창에서 capabilities가 허용하는지. `isSupported()`(플랫폼 지원)와 따로 본다.
- web 구현은 호출된 즉시(첫 await 전에) user activation이 필요한 API를 부를 수 있게 동기 경로를 유지한다.
- hook은 얇게 만든다. 값 구독은 `createLiveValue` + `@akanjs/native/react`의 `useLiveValue`, 이벤트는 `usePluginEvent`.
- 모듈을 import할 때 브라우저 전역(`window`, `document`)을 건드리지 않는다. 서버(SSR)와 React Server Components에서도 import된다. React 훅은 `import * as React from "react"`로 가져와 `React.useEffect`처럼 부른다(react-server 조건의 react에는 훅이 없어 이름 있는 import가 링크에서 실패한다). `packages/core/test/ssr-import.test.ts`가 모든 패키지를 검사한다.
- web 구현과 페이지 쪽 코드는 앱의 strict CSP(`security.csp: "strict"`, SEC-4)에서도 돌아야 한다. 해시는 빌드 때 index.html에 있던 것만 들어간다.
  - 실행 중에 만든 인라인 `<script>`, `eval`·`new Function`, `onclick=` 같은 이벤트 핸들러 속성을 쓰지 않는다.
  - 스타일은 `element.style`·`style.cssText`(CSSOM)로 준다. `setAttribute("style", …)`과 `innerHTML`의 `style=`은 막힌다.
  - 실행 중에 CSS를 더해야 하면 `<style>` 요소 대신 `adoptedStyleSheets`(constructable stylesheet)를 쓴다(`plugins/dialog/src/web.ts`).
  - blob:·data: 이미지와 미디어, `fetch(blob:)`는 strict 프리셋이 허용한다. 원격 오리진은 앱이 정책에 더해야 한다.

## 4. 데스크톱 (`src/desktop.ts`, Bun Worker)

```ts
import { defineDesktopPlugin } from "@akanjs/native/desktop";
export default defineDesktopPlugin<ClipboardApi>({ id: "clipboard", methods: { async readText(_args, ctx) { ... } } });
```
- Bun API와 macOS 명령(`Bun.spawn(["open", url])` 등)을 쓸 수 있다. Finder에서 띄운 앱은 PATH와 LANG이 최소라서 명령은 절대 경로로 부르고 로캘을 지정한다(clipboard, device 참고).
- `ctx.appDataDir`, `ctx.emit(event, data)`, `ctx.registerFile(path, mime)`(MIME은 `@akanjs/native/core`의 `mimeFor(name)`), `ctx.quit(code)`.
- `ctx.binDir`: 앱이 싣는 실행 파일 폴더(설정 `desktop.bin`, akanjs `bin`), 없으면 null. 호스트가 이 폴더를 `process.env.PATH` 맨 앞에 붙이지만, Bun의 `spawn`·`which`는 `env` 없이 부르면 앱이 시작할 때의 환경을 읽는다(Bun 1.4.2). 이름으로 실행하려면 `Bun.spawn(["svcl", …], { env: process.env })`처럼 환경을 넘기거나 `join(ctx.binDir, "svcl.exe")`로 부른다. `node:child_process`는 바뀐 `process.env`를 쓴다.
- `ctx.server`: 앱이 싣는 서버(`desktop.server`), 없으면 null. `ready`는 세션에 한 번 정해진다. 서버가 처음 ready를 보내면 true, 띄우지 못했거나 그 전에 포기했으면 false다. 그 뒤의 일은 `state`와 `onState(listener)`로 안다.
  - `"starting"`: ready 전(ready 전에 죽어 다시 띄우는 중도 포함)
  - `"up"`: ready를 보낸 뒤
  - `"restarting"`: ready였다가 죽어 다시 띄우는 중
  - `"gaveUp"`: 이 세션에는 다시 띄우지 않는다
  - `"stopped"`: 앱이 끝나는 중
  - 페이지는 `app` 플러그인의 `serverState` 이벤트로 같은 값을 받는다(첫 페이지가 들을 때 지금 값, 그 뒤 바뀔 때마다).
- 네이티브 셸: `ctx.shell("window.setTitle", { title })`(main 스레드에서 실행, 결과는 Promise), `ctx.onNativeEvent("window" | "opened" | "pageLoad", cb)`. 새 창 op가 필요하면 `native/desktop/src/lib.rs`의 `window_op`에 추가한다. 나중에 답하는 op(시트, 권한 요청)는 모듈 파일에 두고 요청 id로 `reply`한다(`panels.rs`: `panel.open`·`panel.save`·`alert.show`, 부른 창의 시트). macOS UI는 새 crate 없이 objc2·objc2-app-kit·block2, 그 밖의 Apple 프레임워크는 objc2 런타임(`msg_send!`)으로 부른다(plugins.md Q-P6).
- 다중 창(SH-6): 앱에는 창이 여러 개일 수 있다(창 id, 1은 앱이 연 창).
  - 메서드 호출의 `ctx.window`는 부른 페이지의 창이다(setup·이벤트 소스에서는 undefined). 그 호출 안의 `ctx.shell`은 `args.window`가 없으면 그 창에 적용되므로, 창 op를 부르는 기존 플러그인은 부른 창을 대상으로 한다. 다른 창은 `ctx.shell(op, { window: 2 })`.
  - 네이티브 이벤트에는 `window` 필드가 있다(`window` 이벤트, `pageLoad`).
  - 이벤트 소스의 `emit(data, target?)`: 생략하면 듣는 모든 창, `{ window: n }`이면 그 창만(창마다 다른 이벤트: resize 등), `"focused"`면 듣는 창 중 가장 최근 포커스 창 하나(한 번만 처리해야 하는 것: 딥링크). 도달한 창 id 배열을 돌려준다. 이벤트 소스 함수는 창이 몇 개든 한 번만 시작된다.
  - 페이지에 묻는 veto는 `veto.source(emit, ctx)`로 넘겨 페이지가 새로고침·창 닫힘으로 사라지면 요청을 버리게 하고, 답 메서드는 `veto.answer(args, ctx.window)`로 창을 알려 준다. `veto.ask(data, { window })`는 한 창에만, 생략하면 듣는 모든 창에 묻고 모두 허락해야 true다.
- `setup(ctx)`는 호스트가 시작할 때 한 번 불린다. 페이지가 호출하기 전에 오는 네이티브 이벤트(예: 딥링크)를 받을 때 쓴다(`plugins/app`). 3초를 넘긴 setup은 창을 막지 않지만, 그 플러그인에 온 페이지 호출은 setup을 5초까지 기다리고 넘으면 INTERNAL(`retryable`)이다.
- 호출 취소와 문서 범위(아키텍처 검토 3단계)
  - `ctx.signal`: 페이지가 호출을 포기했거나(AbortSignal) 페이지가 사라지면 발생한다. 페이지는 이미 답(CANCELLED·TIMEOUT)을 받았으니 일을 멈추고 자원을 놓는다(`fetch(url, { signal: ctx.signal })`, 대화상자 닫기).
  - `ctx.document.own(() => close())`: 부른 페이지(문서)가 끝날 때 닫을 자원. 끝난 뒤 늦게 `own`하면 바로 닫힌다. 반환 함수는 닫지 않고 잊는다(요청으로 이미 닫았을 때).
  - 모듈 최상위 변수는 App 범위다. 페이지·창별 상태는 `ctx.document`나 창별 표 + `onDocumentEnd`(플러그인 필드) / `ctx.onDocumentEnd(fn)`에 둔다.
- launch 단계: `setup`은 창이 만들어지기 전에 불리고 async여도 된다. 호스트는 모든 플러그인의 `setup`을 기다린 뒤(플러그인마다 최대 3초, 넘으면 경고 후 진행) main 스레드에 창을 만들라고 알린다. 이 동안만 쓸 수 있는 것:
  - `ctx.launch.setWindow({ x, y, width, height, maximized, fullscreen, skipTaskbar })`: 설정 크기 대신 이 bounds(논리 포인트, x·y는 바깥 프레임 왼쪽 위)로 창을 만든다. `fullscreen`은 첫 프레임부터 x·y가 있는 디스플레이에서 테두리 없는 전체화면, `skipTaskbar`는 작업 표시줄 버튼 없음(Windows·Linux)이다. 둘 다 설정 `desktop.window`보다 우선한다. 제목 표시줄을 잡을 수 있는 디스플레이가 없으면 셸이 위치를 버리고 가운데에 연다(`plugins/window-state`).
  - `ctx.launch.exit(code)`: 창을 만들지 않고 종료한다. `onQuit` 훅은 돌지 않는다(`plugins/single-instance`). setup이 3초를 넘겨 창이 이미 만들어진 뒤에 부르면 앱을 끝낸다(`ctx.quit(code)`와 같다). `setWindow`는 그때 무시된다.
  - `setup`이 끝난 뒤의 호출은 경고만 남기고 무시된다. launch 단계에서는 창이 없으므로 `ctx.shell`을 기다리지 않는다.
- 종료 흐름(plugins.md D4, 등록 함수는 모두 해제 함수를 반환한다)
  - `ctx.onQuit(fn: () => void | Promise<void>)`: 앱이 어떤 경로로든 끝나기 직전의 정리(Cmd+Q, 창 닫기, `app.exit()`, 로그아웃). 모든 훅을 함께 실행하고 최대 2초 기다린다. 창 위치 저장, 소켓 정리 등.
  - `ctx.onBeforeQuit(fn: ({ reason }) => boolean | void | Promise<…>)`: 종료 요청 veto. `false`면 앱을 유지한다. reason은 `user`·`session`(로그아웃, 막으면 로그아웃이 취소된다)·`lastWindowClosed`.
  - `ctx.onCloseRequested(fn: ({ window }) => …)`: 닫기 버튼·Cmd+W veto. `false`면 그 창을 유지한다.
  - `ctx.quit(code)`: veto 없이 `onQuit` 훅 후 종료. `ctx.closeWindow(window?)`: veto 없이 창을 닫는다(다른 창이 있으면 없애고, 마지막 창이면 종료 요청 또는 숨김). 메서드 호출 안에서는 기본값이 부른 창이다.
  - 페이지에 묻는 veto는 `createPageVeto()`로 만든다: 이벤트 소스에 `veto.source(emit)`, 답을 받는 메서드에 `veto.answer(args)`, veto 함수에서 `veto.ask(data)`. 페이지 쪽은 `@akanjs/native/core`의 `vetoable(listen, answer)`로 `onX(handler)`를 만든다(`plugins/window` `onCloseRequested`, `plugins/app` `onBeforeQuit`).

## 5. 생성 코드 (PL-10, 권장)

`src/index.ts`의 `definePlugin<Api, Events>` 인터페이스가 플러그인 스펙이다. manifest에 `"codegen": true`를 넣으면 iOS·Android 빌드마다 스펙에서 Swift·Kotlin 코드를 만든다.
- 메서드마다 인자 타입을 만든다. 호출 JSON을 디코드하고, 맞지 않으면 필드 경로를 담아 `INVALID_ARGS`로 거절한다(`key is required`, `options.style must be one of light, medium`).
- 결과 타입을 만들고 JSON으로 인코드한다. `x?: T`는 nil이면 빼고, `x: T | null`은 nil이면 null로 쓴다.
- `<Plugin>PluginSpec` 프로토콜(Swift)과 인터페이스(Kotlin)를 만든다. 타입이 붙은 메서드를 선언하고, `handle(call)` 분기는 생성 코드가 한다.
- 이벤트마다 `<Plugin>Events(context).<event>(data)` emit 헬퍼를 만든다.

플러그인은 `handle`을 쓰지 않고 이 프로토콜을 구현한다.

```swift
final class PreferencesPlugin: PreferencesPluginSpec {
    func get(_ args: PreferencesGetArgs, _ reply: AkanNativeReply<PreferencesGetResult>) {
        reply.resolve(PreferencesGetResult(value: defaults.string(forKey: args.key)))
    }
    func clear(_ reply: AkanNativeReply<Void>) { ...; reply.resolve() }
}
```
```kotlin
class PreferencesPlugin(context: AkanNativePluginContext) : PreferencesPluginSpec {
    override fun get(args: PreferencesGetArgs, reply: AkanNativeReply<PreferencesGetResult>) =
        reply.resolve(PreferencesGetResult(value = prefs.getString(args.key, null)))
    override fun clear(reply: AkanNativeVoidReply) { ...; reply.resolve() }
}
```

**타입 이름 규칙**
- 모든 이름 앞에 플러그인 id의 PascalCase를 붙인다(iOS 플러그인은 한 Swift 모듈에 모이기 때문). 선언한 타입은 `Photo` → `CameraPhoto`이고, 이름이 이미 그 접두어로 시작하면 그대로 둔다(`DeviceInfo`).
- 이름 없는 객체는 위치로 이름을 짓는다: `<Plugin><Method>Args`, `<Plugin><Method>Result`, 필드는 `…<Field>`, 배열 원소는 `…Item`, 이벤트 payload는 `<Plugin><Event>Event`.
- 문자열 리터럴 유니언은 enum이 된다. Swift 케이스는 lowerCamel, Kotlin 항목은 UPPER_SNAKE이고 `json`/`rawValue`가 원래 값이다.
- `number`는 `Double`이다. 정수·범위 같은 의미 검사는 플러그인 코드가 한다.

**TS 문법 범위**
- 받는 것:
  - `string`, `number`, `boolean`, `unknown`
  - 문자열 리터럴 유니언, 리터럴 유니언 별칭의 유니언, `| null`, `?`
  - `T[]`, `Array<T>`, `Record<string, T>`, `Record<string, never>`(빈 객체)
  - 객체 리터럴, 같은 파일이나 플러그인 자신의 상대 경로 모듈에 선언한 interface(`extends` 포함)·type 별칭, `&`(객체끼리)
  - `@akanjs/native/core`의 `FileRef`·`Platform`·`ErrorCode`
- 표현할 수 없는 타입은 조용히 넘어가지 않는다: 문자열·숫자 유니언, 함수 타입, 객체 유니언, 오버로드. 그런 메서드는 raw `AkanNativeCall`을 받는 메서드로 남고, 이유가 주석으로 붙는다(`akan-native plugin check`가 목록을 보여준다).
- 같은 이름에 모양이 다른 두 타입, 프로토콜 자신의 메서드(`handle`, `destroy` 등)와 겹치는 메서드 이름은 빌드 오류다.

**명령**

| 명령 | 하는 일 |
|---|---|
| `akan-native plugin check [dir]` | 스펙과 manifest의 `methods`·`events`·플랫폼 subset 비교. 플러그인 폴더면 그 플러그인, 앱 폴더면 앱의 모든 플러그인. 타입 없는 멤버도 보여준다 |
| `akan-native plugin codegen [dir]` | 생성 코드를 `<plugin>/.akan/native/codegen/{ios,android}`에 써서 읽어 볼 수 있게 한다 |
| `akan-native plugin stub <ios\|android> [dir]` | 프로토콜을 구현하는 빈 클래스를 출력한다. 새 플러그인의 출발점 |
| `akan-native plugin compile <ios\|android> [dir] [--only a,b]` | 셸과 고른 플러그인(생성 코드 포함)만 컴파일한다 |

**런타임 도우미**(`AkanNativeSpec.swift`, `AkanNativeSpec.kt`)
- FileRef: 결과의 FileRef는 런타임 타입 `AkanNativeFileRef`다. `context.fileRef(url, mime:)`(Swift), `context.fileRef(file, mime)`(Kotlin)로 만든다. `interface Photo extends FileRef`처럼 FileRef를 확장한 타입은 `CameraPhoto(file: ref, width: …)` 생성자를 받는다.
- 문자열 enum:
  - Swift는 `init?(rawValue:)`로, Kotlin은 `X.from(json)`으로 플랫폼 문자열(권한 상태 등)을 enum으로 바꾼다.
  - Swift 케이스 `none`·`some`은 `none_`·`some_`이 된다. `Optional<Enum>`에서 `.none`은 nil로 읽히기 때문이다.
- 비교: Swift 구조체는 `Any` 필드가 없으면 `Equatable`이다(Kotlin data class와 같음). 이벤트 중복을 거를 때 `==`로 비교한다.
- `unknown`은 JSON null을 포함한다(`NSNull`, `JSONObject.NULL`).
- 수는 `Double`이다. `Int(x)`로 바꾸기 전에 범위를 확인한다. 범위 밖이면 Swift가 크래시한다.
- 디코딩을 한 메서드만 느슨하게: 생성된 분기 코드는 `akanNativeDispatch(call)`이다. `handle`을 직접 구현해 특별한 경우를 처리한 뒤 `akanNativeDispatch(call)`로 넘긴다. 예: `share.canShare`는 해석할 수 없는 옵션에 거절 대신 false를 답한다.
- 결과가 스펙보다 넓을 때(예: Android `paths`의 null)는 그 경우만 `reply.call.resolve(…)`로 보낸다. 가능하면 스펙을 맞추는 편이 낫다.

네이티브 구현이 있는 모든 플러그인이 `codegen: true`다. 타입이 없는 메서드는 filesystem `readFile`(오버로드)·`writeFile`(객체 유니언과의 교차)과 local-notifications `schedule`(`string | number`)의 세 개다. 스펙과 manifest가 맞는지는 CLI 테스트가 모든 플러그인에 대해 확인한다.

`akan-native plugin compile <ios|android> [dir] [--only a,b]`는 셸, 고른 플러그인, 그 생성 코드만 임시 폴더에서 컴파일한다(iOS는 `-typecheck`). 앱 전체를 빌드하지 않고 플러그인을 확인할 때 쓰고, 여러 개를 동시에 돌려도 서로 방해하지 않는다.

## 6. iOS (Swift 6, `@MainActor`)

```swift
final class ClipboardPlugin: AkanNativePlugin {
    static let id = "clipboard"
    private let context: AkanNativePluginContext
    init(context: AkanNativePluginContext) { self.context = context }
    func handle(_ call: AkanNativeCall) {
        switch call.method {
        case "readText": call.resolve(["text": UIPasteboard.general.string ?? ""])
        default: call.reject(.notFound, "unknown method \(call.method)")
        }
    }
}
```
- `call.resolve`/`call.reject`는 아무 스레드에서나 한 번 부른다. 결과는 JSONSerialization이 받는 값만 넣는다(`[String: Any]`, 배열, 문자열, NSNumber, NSNull). `reject(code, message, data:, retryable:)`로 페이지가 쓸 세부 정보를 붙일 수 있다.
- 취소와 문서 범위: `call.onCancel { … }`(페이지가 포기했거나 사라짐, 셸이 이미 답함: 시트를 닫고 요청을 멈춘다), `call.isCancelled`, `call.document?.own { … }`(페이지가 끝날 때 닫을 자원, 토큰으로 `disown`). 플러그인의 `documentEnded(_ id:)`는 문서별 상태를 지울 때. App 서비스(`AkanNativeLinks`, `AkanNativeNotifications`, `AkanNativeRemoteNotifications`)에는 `context.owner`로 등록한다(창이 끝나면 셸이 지운다).
- 화면 표시는 `context.presenter`, WebView는 `context.webView`, 이벤트는 `context.emit(event, data)`.
- 파일: `context.temporaryFile("jpg")`(세션 임시 폴더), `context.registerFile(url, mime)` → FileRef, `context.file("/__akan_native/file/<id>")` → 등록된 파일.
- 딥링크: `AkanNativeLinks.shared`(App 범위, plugins.md C11). `launchURL`은 프로세스 동안 바뀌지 않는다. `listen { url in … return true }`의 리스너는 전달했으면 true, 사라졌으면 false를 돌려준다(false면 셸이 다음 리스너까지 보관).
- 알림 delegate: 셸의 `AkanNativeNotifications.shared.register(id, Handler(claims:willPresent:didReceive:))`(C5). `UNUserNotificationCenter.delegate`를 직접 바꾸지 않는다. 페이지가 듣지 않을 때 `didReceive`가 false를 돌려주면 셸이 보관하고, 들을 때 `replay(id)`로 다시 받는다.
- 스플래시: `context.hideSplash(fadeOutDuration:)`(초). 셸의 launch screen 덮개를 걷는다. 이미 걷혔으면 아무 일도 없다.
- 권한 문구가 필요한 API는 호출 전에 `Bundle.main.object(forInfoDictionaryKey:)`로 확인한다(없으면 TCC가 앱을 죽인다).
- 최소 iOS는 16.0이다. 그보다 새 API는 `if #available(iOS 17, *)`로 나누고, 저장 프로퍼티 타입이 새 API면 `Any?`로 두고 캐스트한다(appearance 플러그인).
- `ios.infoPlist`와 `ios.entitlements`는 다른 플러그인과 앱의 것과 합쳐진다: 배열은 합집합, dict는 깊은 병합, 다른 플러그인과 값이 다르면 빌드 오류, 앱 설정이 마지막(architecture.md "선언형 네이티브 설정").
- Required Reason API(UserDefaults, 파일 타임스탬프 `stat`·`modificationDate`, 디스크 용량, 부팅 시각, 활성 키보드)를 부르면 manifest의 `ios.privacyApis`에 범주와 이유 코드를 적는다. 예: `"privacyApis": { "UserDefaults": ["CA92.1"] }`. 빌드가 앱의 PrivacyInfo.xcprivacy에 합친다.
- 검사: `akan-native plugin compile ios`(셸과 함께 iOS 16 대상으로 타입 검사), 직접이라면 `xcrun -sdk iphonesimulator swiftc -typecheck -swift-version 6 -parse-as-library -target arm64-apple-ios16.0-simulator -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" native/ios/Sources/*.swift plugins/*/ios/*.swift <registry stub>`

## 7. Android (Kotlin, 프레임워크 API만)

```kotlin
package com.akanjs.plugins.clipboard
class ClipboardPlugin(private val context: AkanNativePluginContext) : AkanNativePlugin {
    override fun handle(call: AkanNativeCall) {
        when (call.method) {
            "readText" -> call.resolve(JSONObject().put("text", "..."))
            else -> call.reject(AkanNativeErrorCode.NOT_FOUND, "unknown method ${call.method}")
        }
    }
}
```
- 모든 진입점은 main 스레드에서 불린다. 오래 걸리는 일은 스레드로 옮기고 `call.resolve`는 아무 스레드에서나 부른다.
- 결과는 `JSONObject`/`JSONArray`/기본 값. `context.activity`, `context.webView`, `context.startActivityForResult(key, intent, cb)`, `context.requestPermissions(perms, cb)`, `context.permissionState(perm)`, `context.captureTarget(name)`(다른 앱에 넘길 content:// URI), `context.registerFile(file, mime)`, `context.file(ref)`(FileRef → 파일), `context.insets`/`onInsetsChanged`, `context.setBackInterceptor(cb)`, `context.hideSplash(fadeOutMs)`(시스템 스플래시를 놓는다, 이미 걷혔으면 아무 일도 없음).
- 셸이 넘겨주는 Activity 콜백: `onNewIntent`, `onConfigurationChanged`, `onRestoredActivityResult`(프로세스가 다시 만들어진 뒤 도착한 결과), `destroy`.
- 취소와 문서 범위: `call.onCancel { }`(main 스레드), `call.isCancelled`, `call.document?.own { }` / `disown(token)`, 플러그인의 `documentEnded(document)`. `reject(code, message, data, retryable)`.
- manifest의 `android.applicationXml`은 `<application>` 안에, `android.manifestXml`은 `<manifest>` 바로 아래(예: `<queries>`)에 들어간다. `${applicationId}`는 앱 id로 바뀐다. `applicationXml`에 적은 컴포넌트 클래스(receiver 등)는 release(R8)에서 자동으로 keep된다. 리플렉션처럼 추가 규칙이 필요하면 `android.proguard: ["-keep ..."]`.
- 매니페스트에 권한을 선언하면 앱 매니페스트에 합쳐진다. 선언이 동작을 바꾸는 경우가 있다(예: CAMERA를 선언하면 캡처 intent가 권한을 요구한다).
- 최소 Android는 API 29다. 그보다 새 프레임워크 API는 이름이 `ApiN`으로 끝나는 중첩 object에 두고 `Build.VERSION.SDK_INT >= N`일 때만 부른다. 빌드가 컴파일된 클래스를 검사해 어기면 실패한다(architecture.md "최소 OS").
  ```kotlin
  if (Build.VERSION.SDK_INT >= 31) Api31.defaultVibrator(activity) else @Suppress("DEPRECATION") activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
  private object Api31 { fun defaultVibrator(a: Activity): Vibrator? = a.getSystemService(VibratorManager::class.java)?.defaultVibrator }
  ```
  - `ApiN` object 안에는 `inline` 함수를 두지 않는다(호출한 쪽으로 복사되어 검사를 벗어난다). 새 API 인터페이스를 구현하는 람다·클래스를 필드 초기화에서 만들지 않는다(생성할 때 클래스 로드가 실패한다).
  - 검사가 보지 못하는 것은 직접 확인한다: 인라인 상수(`RECEIVER_*`, 새 권한 이름, `FLAG_MUTABLE`), 나중에 붙은 인터페이스(`TypedArray.use {}`는 31), 문자열로 고르는 알고리즘과 인텐트 액션.
  - 공용 분기는 `AkanNativeCompat`(`display`, `parcelableExtra`)에 있다.
  - Google의 Maven 라이브러리가 꼭 필요하면(FCM, Play Billing) manifest의 `"android": { "maven": ["group:artifact:version"] }`에 루트를 적는다. 폐포는 `native/android/maven.lock.json`에 고정되어 있어야 하고(루트 조합마다 하나, SHA-256), 그 플러그인을 쓰는 앱에만 들어간다. AndroidX·kotlinx 금지의 예외는 이 두 모듈뿐이다(architecture.md "고정 Maven 라이브러리").
  - 플러그인 전체가 더 새 Android를 요구하면 manifest에 `"android": { "minSdk": 35 }`. 그 아래에서는 플러그인이 만들어지지 않고 모든 호출이 `UNSUPPORTED`다.
- 검사: `akan-native plugin compile android`(셸과 함께 컴파일하고 API 수준까지 검사), 직접이라면 `kotlinc native/android/src plugins/*/android <registry stub> -d /tmp/x.jar -classpath $ANDROID_HOME/platforms/android-36/android.jar:<kotlin-stdlib.jar> -jvm-target 17 -no-jdk -no-stdlib -no-reflect`

## 8. 테스트

```ts
import { installMockHost } from "@akanjs/native/core/testing";
const host = installMockHost({ platform: "ios", plugins: { clipboard: { methods: { readText: () => ({ text: "x" }) } } } });
// JS API가 네이티브로 라우팅되는지, 인자·결과 모양, UNSUPPORTED 처리를 확인한다
host.uninstall();
```
- web 구현은 DOM이 없는 `bun test`에서 부분만 테스트할 수 있다. 전체 동작은 샘플 앱의 자가 테스트(`examples/sample/src/selftest.ts`, `akan-native test all`)로 확인한다.

## 9. akanjs 앱·lib이 가진 플러그인

빌트인에 없는 장치 기능(키오스크의 부팅 수신, Windows 레지스트리 설정 같은 것)은 앱이 자기 플러그인으로 만든다. 폴더와 파일은 §1~§7과 같고, 두는 곳과 import 경로만 다르다.

```
apps/<app>/native/<id>/        (lib이면 libs/<lib>/native/<id>/)
├─ native-plugin.json           id는 폴더 이름과 같다
├─ src/index.ts                 definePlugin — akanjs/client/native
├─ src/desktop.ts               defineDesktopPlugin — akanjs/native/desktop
├─ android/<Name>Plugin.kt
└─ ios/<Name>Plugin.swift
```
- 설정에 적지 않는다. akanjs가 `native/` 아래 폴더를 찾아 앱의 모든 모바일·데스크톱 타깃에 폴더 경로로 넘긴다(`pkgs/@akanjs/devkit/mobile/nativePluginFolders.ts`). 플랫폼마다 무엇이 도는지는 manifest가 정한다(null이면 그 플랫폼에서 `UNSUPPORTED`).
- lib의 `native/` 플러그인은 그 lib에 의존하는 앱에만 들어간다. 앱이 같은 id의 플러그인을 가지면 앱 것이 쓰이고, 두 lib이 같은 id를 가지면 빌드가 멈춘다. 같은 id의 빌트인이 함께 들어가면 이 런타임이 "provided by both"로 거절한다.
- 앱 쪽 코드는 `@akanjs/native`를 직접 import하지 않는다. 배포된 akanjs 안에 복사본(vendor)으로만 있어서, 앱의 작업 공간에서는 그 이름이 풀리지 않는다. 페이지 쪽은 `akanjs/client/native`(`definePlugin`, `defineWebPlugin`, `AkanNativeError`, `createLiveValue`, `useLiveValue`, `usePluginEvent`), 데스크톱 쪽은 `akanjs/native/desktop`(`defineDesktopPlugin`, `DesktopContext`, `AkanNativeError`, `createPageVeto`)에서 가져온다.
- 페이지 API는 앱의 `webkit/` 훅이 `../native/<id>/src`에서 가져오고, 페이지와 컴포넌트는 그 훅을 부른다.
- 린트: `native/` 폴더는 `no-throw-raw-error`(에러는 `AkanNativeError`로 던진다)와 `no-web-only-api-outside-webkit`의 범위 밖이다.
- 예: `apps/minimal/native/probe`(데스크톱만). 데스크톱 E2E(`pkgs/@akanjs/cli/application/desktopServer.e2e.test.ts`)가 셸에 실렸는지 확인한다.
