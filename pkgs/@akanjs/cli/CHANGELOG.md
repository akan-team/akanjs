# @akanjs/cli

## 2.4.0

### Minor Changes

- 23d43b3: Harden dev host recovery during failed builds:

  - Defer builder/backend recycle while a generation's build is still failing
  - Merge deferred invalidate batches so restarts cover every skipped change
  - Recover the builder with exponential backoff instead of giving up
  - Revive a backend that gave up once the build goes green again
  - Resurrect dev children after a failed recycle so the error overlay stays reachable
  - Enter degraded builder boot mode on compile errors and retry on the next edit
  - Announce recovered pages/css state after a degraded boot succeeds

- 18abf71: Improve dev server stability:

  - Add `isPortInUseError` utility for detecting EADDRINUSE across Bun versions
  - Stop crash-looping replicas after max boot failures in dev mode (`akan start`)
  - Handle parent IPC disconnect to prevent orphaned gateway/child processes
  - Report `wsUpstream` in ready IPC so gateway routes to the actual bound port
  - Fall back to ephemeral port when preferred WS port is in use
  - Support controlled dev-host restart on config changes (`akan.config.ts`, `tsconfig`)
  - Forward backend build-status IPC to dev host for error surfacing in HMR overlay
  - Limit backend recovery attempts (5 max) and idle until next server-side edit
  - Add integration tests for config-edit restart and boot-failure recovery

- 23d43b3: Improve the mobile Capacitor workflow:

  - Auto-declare default Capacitor plugins in the app package.json before iOS/Android launch
  - Expand mobile runtime peer dependencies and workspace-root preflight installs
  - Derive repo-scoped default bundle ids to avoid Apple portal collisions
  - Add `akan doctor --ios` to flag placeholder bundle identifiers
  - Add `--device` to `akan start ios` for non-interactive simulator/device selection
  - Prefer newer iOS runtimes and warn on SwiftUICore-incompatible simulators
  - Detect SwiftUICore dyld failures with actionable guidance
  - Select a routable LAN host for mobile live reload with override support
  - Raise Android minSdkVersion to 26 for bundled Capacitor plugins
  - Include `@capacitor-community/fcm` in push notification runtime packages
  - Resolve client port from `window.location` on the browser client

### Patch Changes

- d56a8f0: Ship Pretendard as the default font for newly created apps:

  - Bundle Pretendard woff2 files under the app template `public/fonts`
  - Declare `fonts` with `default: true` in the generated root `_layout.tsx`

- Updated dependencies [d56a8f0]
- Updated dependencies [23d43b3]
- Updated dependencies [18abf71]
- Updated dependencies [23d43b3]
  - akanjs@2.4.0

## 2.3,11

### Minor Changes

- 595390a: feat: UiOverride 시스템 및 \_overrides.tsx 지원 추가

  - `akanjs/ui/UiOverride` 추가: `Provider`, `createOverridable`, `useUiOverride`, `override` API로 UI 컴포넌트 커스터마이징 지원
  - 모든 akanjs UI 컴포넌트(Button, Modal, Select, Table 등)에 `useUiOverride()` 통합
  - 라우트 시스템에 `_overrides.tsx` 지원 추가 (routeConvention, routeTreeBuilder)
  - qualityScanner에 `_overrides.tsx` 파일 검증 로직 추가
  - 앱 예제: `apps/minimal`에 `_overrides.tsx`, `BrandModal`, `OverrideDemo` 추가
  - `apps/akan` 문서에 UI 커스터마이징 가이드 페이지 추가
  - devkit에 `no-throw-raw-error.grit` lint rule 추가
  - `PushNotificationServer.ts` 리팩토링
  - biome.json 업데이트 및 패키지 의존성 정리

### Patch Changes

- 5ce752a: enhance: add host option for staging server tests
- 5ce752a: add host option for staging server tests
- Updated dependencies [5ce752a]
- Updated dependencies [5ce752a]
- Updated dependencies [595390a]
  - akanjs@2.4.0

## 2.3.10

### Patch Changes

- b92003a: fix: cross-platform path handling using path.resolve/path.join/path.sep
- Updated dependencies [b92003a]
  - akanjs@2.3.10

## 2.3.9

### Patch Changes

- f518afd: Improve dictionary type inference and lint coverage for generated workspaces.
- 6bc2209: auto-select app when the workspace has only one app
- Updated dependencies [f518afd]
- Updated dependencies [f518afd]
  - akanjs@2.3.9

## 2.3.6

### Patch Changes

- 1919062: Pin DaisyUI to 5.5.23 so generated workspaces and published CLI artifacts avoid the 5.6.x theme resolution regression.
- 0802422: Remove the published CLI `types` export that points at an unpacked TypeScript source file.
- Updated dependencies [0a4815a]
  - akanjs@2.3.6

## 2.3.5

### Patch Changes

- Updated dependencies
  - akanjs@2.3.5

## 2.3.2

### Patch Changes

- 940d6db: Optimize generated fetch client type inference while preserving ordered signal override semantics.
- Updated dependencies [940d6db]
- Updated dependencies [d6db24d]
- Updated dependencies [dc60773]
- Updated dependencies [ffe68ec]
- Updated dependencies [1a48756]
- Updated dependencies [1a48756]
- Updated dependencies [1a48756]
- Updated dependencies [1a48756]
- Updated dependencies [1a48756]
- Updated dependencies [4fc2673]
  - akanjs@2.4.0

## 2.2.12

### Patch Changes

- Updated dependencies [666e46c]
- Updated dependencies [666e46c]
  - akanjs@2.2.12

## 2.2.11

### Patch Changes

- 8af7a9d: Add agent-oriented workspace context tooling, generated agent rule templates, and LLM documentation surfaces for Akan workspaces.
- 8190632: Add Akan server console support with CLI/build integration and documentation for console-oriented workflows.
- 4bce7f9: Add initial LLM discovery docs and stabilize Akan client/runtime behavior.

  - Add `/llms.txt` documentation discovery for Akan docs.
  - Add `wsConnect` support for automatic WebSocket connections.
  - Delay client bootstrap module execution until the SSR fizz stream is ready.
  - Improve route tree, HMR, fetch, store, and SSR/client runtime stability.

- Updated dependencies [8190632]
- Updated dependencies [4bce7f9]
  - akanjs@2.2.11

## 2.2.7

### Patch Changes

- Updated dependencies [bf51564]
- Updated dependencies [bf51564]
  - akanjs@2.2.7

## 2.2.5

### Patch Changes

- 5cdb05e: reverse dependency of file upload api
- Updated dependencies [d636456]
- Updated dependencies [a1ee4e8]
- Updated dependencies [5cdb05e]
- Updated dependencies [a7da50e]
  - akanjs@2.2.5

## 2.2.3

### Patch Changes

- 587cc68: add upload-env and download-env for on-premise use case
- 587cc68: fix dictionary loading
- 587cc68: fix fetchClient for setting origin with clone or fetchPolicy
- Updated dependencies [587cc68]
- Updated dependencies [587cc68]
  - akanjs@2.2.4

## 2.2.0

### Minor Changes

- cb5b07a: enable custom not found and error render on \_layout.tsx files
- 1d35d4e: Automatically install dependencies required by databaseMode during application setup.

### Patch Changes

- Updated dependencies [cb5b07a]
- Updated dependencies [258284e]
  - akanjs@2.2.0
