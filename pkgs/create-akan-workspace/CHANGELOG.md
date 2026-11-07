# create-akan-workspace

## 3.1.1

## 3.1.0

### Patch Changes

- 2082ccd: Akan.js now requires Bun 1.4.4: every package's `engines.bun` reads `>=1.4.4`. akan-native's doctor fails on an older Bun and warns on any other, with `bun upgrade --version 1.4.4` as the fix. Before 1.4.4, bun:sqlite counted the rows a full-text index's triggers wrote, so `updateManyByQuery` and `removeManyByQuery` on a model with search fields reported far more `matchedCount` and `modifiedCount` than the documents they changed.

  Upgrade note: 3.0.2 accepted Bun 1.4.0; run `bun upgrade --version 1.4.4` first.

- bd6f9e6: Dependency refresh for the published packages:

  - **React 19.3.1** (`react`, `react-dom`, `react-server-dom-webpack`), together with the 19.0.9 / 19.1.10 / 19.2.9 backports of the same day.
  - **Majors**: `chalk` 6, `commander` 15, `fontaine` 1, `firebase` 13 (optional peer), `happy-dom` / `@happy-dom/global-registrator` 21 (optional peers; CSS and iframe loading are now off by default).
  - **Minors and patches**: `lexical` and every `@lexical/*` 0.52, `typebox` 1.3.37, `@biomejs/biome` 2.5.14, `@inquirer/prompts`, `@tailwindcss/node` / `tailwindcss` 4.3.3, `dayjs`, `immer`, `ignore`, `ora`, `string-width`, `subset-font`, `tailwind-merge`, `tailwind-variants`, `protobufjs`, `react-icons`, `@react-spring/web`, `@playwright/test`, `@types/bun`, and `bullmq` / `ioredis` to their latest 5.x.

  Held back on purpose: `typescript` 7 (no compiler API, which devkit's scanners and transforms need), `ink` 7/8 (drop bracketed-paste markers and mouse reports from `useInput`, which `akan code`'s paste and wheel scrolling read), `ioredis` 6 (RESP3 by default) and `bullmq` 6 (backend rewrite), which need the conformance suite against real Redis, and `@biomejs/biome` 2.5.15 (reports `Object.keys(…).sort()` and other string sorts under `useArraySortCompare`).

  Upgrade note: a workspace pins `react` / `react-dom` to `19.3.1` to match the `akanjs` peer range.

- fe1e27d: A new workspace with the `shared` or `util` library no longer fails `akan typecheck` and `akan build` with TS7016, "Could not find a declaration file", for `react-dom` and `nodemailer`: `akan create-workspace` writes `@types/react` and `@types/react-dom` into its devDependencies, and `akan install-library` adds `@types/react-dom` with `shared` and `@types/nodemailer` with `util`. Upgrade note: a workspace created earlier adds them with `bun add -d @types/react @types/react-dom`, plus `@types/nodemailer` if it installed `util`.

  `akan install-library` now copies a library from the akanjs version the workspace has installed: one shallow clone of its `v<version>` tag, reused for every library in the run. Before, each library took a full clone of the repository's default branch, whose code can need a newer akanjs than the workspace's, and `akan create-workspace` with both libraries downloaded it twice. A version with no tag, such as a prerelease, still installs from the default branch, with a warning naming the version.

  `akan` and `bunx create-akan-workspace` now stop on a Bun older than 1.4.4, the minimum their `engines.bun` declares, with one line asking for `bun upgrade`. Before, nothing checked the running Bun, so an older one went ahead and hit the bugs 1.4.4 fixed.

  The `akanjs` peer on `react-server-dom-webpack` is now exactly `19.3.1`, the same pin as `react` and `react-dom`, and `akan create-workspace` writes it that way. Its caret range let a new workspace resolve the first `react-server-dom-webpack` released after 19.3.1, built for a different React than the one it renders with. Upgrade note: pin `react-server-dom-webpack` to `19.3.1` in an existing workspace as well.

- 6b5646e: - The akan CLI runs in a workspace with no root `.env`: the workspace root is the folder with `package.json`, `tsconfig.json` and an `apps/`, `libs/` or `pkgs/` folder. Unset, `AKAN_PUBLIC_REPO_NAME` falls back to the origin remote's name and `AKAN_PUBLIC_SERVE_DOMAIN` to `localhost`; `akan build` and the redis/postgres tunnels refuse either fallback for any environment but `local`.
  - The theme contrast check reads every theme block. It used to read every other block, and none after an `@source` line, so on the framework stylesheet it checked only the light theme. `akan lint` may now report contrast failures in a `:root` or dark theme that were always there.
  - `declaredCustomProperties` skips a whole `@theme` block, nested `@keyframes` included, and ignores tokens inside comments. Theme CSS and the generated `useClient.ts` are parsed in linear time.
  - `akan agent install` writes an `AGENTS.md` about 60% smaller: the conventions guideline keeps the rules and points at the on-demand guidelines for the detail, and a new `pageRule` guideline covers routing.

## 3.0.2

## 3.0.1

## 3.0.0

### Patch Changes

- 2d8de1c: fix(cli): a freshly created workspace builds and starts

  The sample app wrote `srvkit/AuthGuard.ts` and `srvkit/SessionInternalArg.ts`, but a `srvkit/` barrel exports only
  camelCase file names, so no `srvkit/index.ts` was generated. The first `akan build` failed with
  `TS2307: Cannot find module '@apps/<app>/srvkit'` and `akan start` with `Cannot find package '@apps/<app>'`. The
  sample now writes `srvkit/guards.ts` and `srvkit/internalArgs.ts`, the names the conventions give those files.

## 2.4.2

## 2.4.1

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

## 2.3.11

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

## 2.3.10

### Patch Changes

- b92003a: fix: cross-platform path handling using path.resolve/path.join/path.sep

## 2.3.9

### Patch Changes

- f518afd: Improve dictionary type inference and lint coverage for generated workspaces.

## 2.3.6

## 2.3.5

## 2.3.2

## 2.2.12

## 2.2.11

### Patch Changes

- 4bce7f9: Add initial LLM discovery docs and stabilize Akan client/runtime behavior.

  - Add `/llms.txt` documentation discovery for Akan docs.
  - Add `wsConnect` support for automatic WebSocket connections.
  - Delay client bootstrap module execution until the SSR fizz stream is ready.
  - Improve route tree, HMR, fetch, store, and SSR/client runtime stability.

## 2.2.7

## 2.2.5

## 2.2.3

## 2.2.0
