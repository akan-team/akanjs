# akanjs

## 2.4.1

### Patch Changes

- 473be34: fix(devkit): restart the backend for server code saved while the builder was away

  Nothing watches the source tree between a builder leaving and its replacement being ready: the idle
  suspend stops its own watcher before the wake's boot build, a recycle or crash takes the builder's
  watcher with it, and a fresh builder primes its mtime index from whatever it finds on disk — so a save
  that lands in that window is _baseline_ to it and produces no event anywhere. The client half of such a
  save is rescued by the boot build reading the new file; the backend half was not. A `.service.ts` saved
  in that window left the server running the code it replaced, with nothing on screen to say so.

  The dev host now stamps `(mtime, size)` for every file in the backend import graph when the builder goes
  away — at suspend, at a recycle request, at a crash exit — and compares them when a builder is ready
  again, restarting the backend for anything that moved. Comparing stamps rather than waiting for events
  also covers the watcher dropping one, which Bun's recursive `fs.watch` does.

  A config change while suspended is exempt, because it replaces the backend along with the builder on its
  own. Where the backend graph scan has never succeeded — path-role fallback rules — there is nothing to
  stamp, and the host says so rather than staying quiet about it.

- f5bfa27: perf(devkit): stop parsing every source file to find barrel imports

  `rewriteBarrelImports` ran a full TypeScript parse of every file it was given, to find import
  statements it then discarded for all but the barrel ones. It runs on every source file of every dev
  rebuild, which made it the single most expensive thing in one.

  - **63% of files import no barrel at all.** A static import cannot name a specifier without that
    specifier appearing literally in the source, so a substring test skips them before the parser is
    involved — 4ms for 1189 files. The bundler plugin already did this privately; it now lives in
    `rewriteBarrelImports` so the CSS and client-entry walks get it too.
  - **`setParentNodes: true` was paid for no reader.** Nothing reads `node.parent`; every position comes
    from `getStart(sourceFile)`, which takes the file explicitly.

  Measured across 1189 files: 299ms and 161MB of RSS become 88ms and 5MB. End to end on `apps/akan`,
  `CssCompiler.discoverCssAndSources` drops from 262ms to 190ms and the client-entry discovery walk from
  242ms to 176ms, retaining 107MB instead of 128MB. Verified output-identical on 1535 files: same import
  statements from the parser, and no file the pre-filter skips would have been rewritten.

  `CssCompiler` also memoises import resolution for the life of one rebuild, where a miss cost up to 13
  sequential `exists()` calls repeated per importer (a further 216ms → 190ms).

- 473be34: fix(devkit): bound the `ps` fallback that reads another process's memory

  Where there is no `/proc` (macOS), the dev host reads a process's RSS by shelling out to `ps`, with no
  timeout. An absent `ps` was already handled — it answers `null`, which callers read as "no new
  information" — but a stuck one was not, and its only caller awaits it at the end of a 20s settle before
  committing a builder recycle. A hang there meant the recycle silently never happened.

  Now spawned directly with a 2s kill timer, which is the same treatment the dev-stability harness already
  needed after `ps` hung under load.

- 068158b: feat(devkit): bound dev-server memory and stop losing watch events

  Two dev-server problems that compounded each other.

  - The builder grew without bound because `Bun.build` retains native bundler arenas that
    `Bun.gc(true)` never reclaims. It is now recycled once its RSS passes a ceiling derived
    from the container's cgroup limit, draining in flight work first.
  - Bun's recursive `fs.watch` reports roughly one path per coalescing window and discards
    the rest, so concurrent saves went unbuilt. Changes are now resolved against a
    `SourceMtimeIndex` baseline and events only decide _when_ to look.

- 46a1a4a: fix(devkit): flush all builder ipc through BuilderChannel and isolate the boot build

  `BuilderReply` only covered request responses, so recycle `process.exit` could still
  drop unflushed events like `css-updated` and leave the backend on a stale bundle. The
  boot `SsrBaseArtifactBuilder` also stayed in the long-lived watcher and retained most of
  its idle RSS.

  - Replace `BuilderReply` with `BuilderChannel` (`send` / `emit` / `drain`) so every
    builder→host message awaits ipc flush before recycle exit.
  - Run the boot base artifact build in the disposable `buildBatch` worker (`needs: ["base"]`)
    and keep only the serializable artifact/fonts in the watcher.
  - Split the idle resource-budget assertion so host+backend stays tight while the builder
    can swing within its RSS recycle ceiling.

- 90c6597: fix(devkit): answer in-flight builder requests on recycle and flush replies before exit

  Builder RSS recycle (and unexpected exits) left mid-flight `build-route` /
  `build-csr` promises hanging: the host never tracked correlation ids, and even a
  clean drain could lose a large `build-route-res` when `process.exit` truncated an
  unflushed ipc write past the pipe buffer.

  - Track in-flight ids on the host and fail them with a reloadable error when the
    builder recycles, crashes, or is stopped.
  - Send replies through `BuilderReply`, which awaits the ipc flush (with a timeout)
    so recycle drain means "answered", not "truncated".

- aca901d: fix(devkit): keep builder replies matched to the backend that asked for them

  `BuilderRpc` numbers its requests from 1 in each backend _process_, while the builder it
  talks to outlives the backend. After a restart the two generations collided on id 1: the
  builder answered the departed backend's request, the dev host relayed it, and the new
  backend settled its own id 1 with another route's manifest delta — a page rendered against
  client modules that were never built for it. The answer it was actually waiting for then
  arrived to an empty pending map and was dropped, discarding the correct build too.

  `BuilderRequestRouter` renumbers ids host-side, so neither the backend nor the builder
  learns anything changed and a reply whose generation is gone is discarded rather than
  misdelivered.

- 068158b: fix(cli): make `bun run akan <cmd>` concurrency-safe

  `bun run akan` rebuilds the CLI into a shared `dist/` before every command, so two
  commands started at once could read a half-written bundle.

- cb895b7: fix(devkit): find created directories on a filesystem with a coarse mtime clock

  `SourceMtimeIndex` finds new files by noticing their directory's mtime moved, which Linux
  stamps from a coarse clock: 400 back-to-back `mkdir`s left the parent's mtime unmoved 319
  times on overlayfs and 324 times on ext4, smallest observable step 1ms. macOS APFS
  (0.042ms) missed none, which is why this only ever showed up on Linux.

  A directory mutated in the same millisecond as the recorded value — but after the walk that
  recorded it — therefore left no trace, and because its files were never tracked, later edits
  to them went unreported for the life of the process. Directories whose mtime was still fresh
  when it was read are now re-walked on the next scan (`dirSettleMs`, 20ms default), and
  `HmrWatcher` schedules one more scan while any remain unsettled.

- f8a9bc5: perf(devkit): cache tailwind candidate tokens across builds

  The CSS rebuild read the full text of every source file on every save. Phase 2 moved css
  compilation into a per-generation batch worker, so an in-memory cache is discarded before
  the next save can use it — the cache goes to disk instead, the same way font subsetting
  does, which also survives a builder recycle and a dev-host restart.

  Measured on `apps/akan` (556 sources, 26800 candidates): the candidate scan drops from
  58-60ms to 13-19ms. Note that this is a smaller share of the rebuild than expected — the
  full CSS rebuild is ~380ms, so the scan was never the dominant cost. Nothing is written
  when nothing was re-read.

- d973712: perf(cli): keep heavy dependencies out of the long-lived dev processes

  `akan start` holds the CLI entry and the builder watcher for the whole dev session, so an
  eagerly imported dependency is resident for the whole session too.

  - The dev host reached `@inquirer/prompts` (~24MB) because `runCommands` shares a module
    with the interactive argument fallbacks. Those now load the prompt stack on first use,
    which for `akan start` is never.
  - The builder watcher reached `tailwindcss` and `@tailwindcss/node` (~40MB) through the
    `frontendBuild` barrel, which re-exports `cssCompiler` and `ssrBaseArtifactBuilder`. That
    has been dead weight since css compilation moved into the batch worker; the watcher now
    imports by module path.

  `entryModuleGraph.test.ts` guards both by walking each built entry's chunk closure. The
  previous check grepped the entry file alone, which cannot see a dependency reached through
  a shared chunk and so reported both of these as absent.

- 068158b: fix(devkit): pin the dev port and bound the waits that could hang forever

  - `AKAN_DEV_PORT` pins the dev port. It used to derive from an app's index in the `apps/`
    listing, so adding an app moved a running dev server's port at its next restart.
  - `BuilderRpc` created request promises with no timeout, and nothing else answers a lost
    request. Since the builder is recycled routinely, a page request that landed mid
    route-build left the SSR promise pending forever with nothing to retry. Now bounded by
    `AKAN_BUILDER_RPC_TIMEOUT_MS` (120s default) with a message naming the likely cause.

- cc3dd40: feat: expose local-dev metadata endpoints for devtools visualization

  Add four JSON endpoints, registered only when `AKAN_PUBLIC_ENV=local` (override with `AKAN_DEVTOOLS`),
  that describe the running system for an external developer-tools UI:

  - `GET /_akan/constant` — every model's Input/Object/Full/Light/Insight view, scalars, enums, filter
    query/sort, and derived relation edges.
  - `GET /_akan/signal` — declared and framework-generated endpoints, slices, internals, and a flattened
    route table with fully resolved HTTP/WS paths.
  - `GET /_akan/dictionary` — the merged i18n tree, module kinds, and flattened dotted keys (`?lang=` narrows it).
  - `GET /_akan/deps` — the DI graph: services, adaptors, signals, uses, middleware, env, roles, and the
    topological init stages.

  They live in `AkanServer.#createBuiltinRoutes()` next to `/openapi.json`, so they stay off the `/api` prefix
  and never enter the `serializedSignal` payload shipped to clients. Outside `local` the routes are not
  registered at all and fall through to the SSR catch-all.

  Supporting changes:

  - `DictionaryRegistry` collects each `makeTrans` root, which was previously closure-private and unreachable
    from the server.
  - `DiLifecycle` gains a read-only `modules` accessor and retains disabled-module reasons that were only logged.
  - `SignalResolver.getScheduleSkipReason` is now public so the reported schedule placement cannot drift from
    the scheduler's own rules.

  Secrets discipline: secret constant fields report name and type but no `default`/`example`, `env` carries
  values for `AKAN_PUBLIC_*` only and every other key by name alone, and `uses` are reported as key plus class
  name — never the instance. `env` inject keys are extracted by scanning the factory source, never by running it.

- 8a2b795: perf(devkit): stop retaining source text in client-entry discovery, and expire its misses

  `GraphClientEntryDiscovery` is created once per builder process, so its caches live for the
  whole dev session in the watcher.

  - It kept the full text of every file the walk had touched plus a barrel-rewritten copy of
    each, when the walk only ever asks two things of a file — is it a client entry, and what
    does it import — both of which were already cached separately under the same key. Those
    three caches collapse into one holding just the derived facts: measured on `apps/akan`,
    retention after a full walk drops from 135-142MB to 125-127MB.
  - `invalidate()` never cleared the file-existence and resolution caches. They are keyed by
    extension-less path and by `dir\0specifier`, neither of which maps back to a file that was
    just created, so a negative recorded before a module existed was permanent: adding a new
    module and importing it left the import unresolved until the next config change or builder
    recycle. Negative answers are now dropped on any invalidate; positive ones are keyed by a
    real path and are left alone.

- 068158b: perf(devkit): cache font subsetting across dev-server boots

  `FontOptimizer.optimize()` re-subset every font file on each builder boot even though it
  already computed a config hash and wrote hashed outputs. It now skips the
  `fonteditor-core` / `subset-font` work when the expected outputs are present, which also
  keeps those two packages out of the common path entirely.

- 473be34: fix(devkit): hold page requests during the recycle drain, not only after the builder exits

  A builder asked to recycle drains first — it stays alive finishing its queued work and refuses
  everything new — and throughout that window the dev host still reported it as `ready`. So a route or CSR
  request that arrived during the drain was sent, refused by the departing builder, and relayed to the
  backend as a failure: the same dev error page the request-holding fix was written to remove, in the half
  of the window it never covered. The hold was unreachable there, because it only runs when the send
  itself fails.

  The builder host now reports `recycling` for the drain, which `send()` refuses on and which the hold
  decision treats like a restart. `ready` — the field `onExit` reads to tell a planned exit from a builder
  that never came up — is deliberately unchanged.

- e5fde3b: fix(devkit): hold page requests while the builder restarts instead of failing them

  A route or CSR request that arrived while the builder was recycling or restarting was answered
  immediately with `builder is restarting; reload after the builder is ready`. Nothing retried, so the
  browser tab showed an error for a builder that was seconds from being back — and the builder is recycled
  routinely, whenever its RSS passes the ceiling.

  Those requests are now held and replayed when the builder reports ready, which is what the idle-suspend
  path already did for exactly this reason. `BuilderRpc`'s own timeout still bounds the wait, the queue is
  capped so a builder that never returns cannot grow it, and anything still held when the builder is
  stopped for good is failed rather than left silent.

- 473be34: fix(devkit): say when a build worker was killed rather than crashed

  The disposable build worker holds the largest transient in the dev tree (~548MB on a mid-size app, over
  1GB on a large one), so on a small sandbox it is the process the kernel reaches for first. A worker the
  OOM killer takes exits with code `null` and `SIGKILL`, and the build was reported as `build worker exited
with code null before reporting a result` — indistinguishable from an ordinary crash, though the two have
  opposite fixes: find the build error, or raise the memory limit.

  The failure path is unchanged and still safe (that generation goes red, the last-good artifact keeps
  serving); the message now names the signal, and calls out `SIGKILL` as most often the OOM killer.

- f28466f: fix(server): stop closing the database out from under its own schema setup

  `getStore()` returns a store synchronously while `ensure()` goes on creating tables and indexes, so a
  shutdown could close the connection mid-setup. The rejection was unhandled — `void store.ensure()` —
  and surfaced as `RangeError: Cannot use a closed database` blamed on whatever ran next, which read as a
  flaky test rather than a race at shutdown. Reproduced at 3 failures in 8 runs of the akanjs suite, 0 in
  10 after the fix.

  All three SQL adaptors (bun:sqlite, libsql, Postgres) now track those setups and let them finish before
  closing. Every statement `ensure()` runs is `IF NOT EXISTS`, so one cut short is simply redone next boot.

- 51851fa: perf: cut idle/dev-save memory with phase-1 quick wins

  Apply the phase-1 resource plan without architecture changes:

  - Self-arming CSR rebuild — skip the dead CSR artifact until `/__csr` or `?csr=true` first needs it
    (keeps mobile live-reload working once armed).
  - Bound RSC worker reload accumulation with threshold/RSS recycle instead of retaining every pages
    bundle generation.
  - Split `@akanjs/devkit` into subpath exports and move route/overrides AST validation out of the
    resident `executors` graph so `typescript` is not pulled into long-lived start processes.
  - Lazy-load CLI command modules via a command manifest so unused command graphs stay cold.

  Also await async endpoint guards (including in parallel) so `canPass` promises are honored.

- 1c3436f: perf: bound builder memory with RSS recycle and disposable batch workers

  Apply the phase-2 bounded-builder plan so Bun.build retention no longer grows without
  bound across a long `akan start` session:

  - Report builder RSS after each work item and recycle the builder process when it crosses
    a ceiling (`AKAN_BUILDER_MAX_RSS_MB`, else cgroup × 0.35, else 1200 MB), only when no
    build is in flight and the generation is green.
  - Extract shared `memoryLimit` helpers (also used by the RSC worker) and announce recovered
    pages/css state after a recycle-triggered boot so a live backend picks up the new
    `base-artifact.json`.
  - Move pages/css/csr `Bun.build` work into a disposable `buildBatch` worker that exits per
    generation (optional `AKAN_BUILD_WORKER_REUSE_COUNT`), keeping the watcher process thin.

- 128e9a3: fix(devkit): survive a container image with no `ps`

  `DevStabilityHarness` shells out to `ps` to find leftover dev processes, and slim images such as
  `oven/bun` ship without procps, so the spawn threw. It now returns the same `null` it already
  returns for a `ps` that does not answer in time — "could not look", not "nothing is running".
  Fixture liveness never depended on it (`process.kill(pid, 0)`), so sweeping still works.

- a5d4a8a: fix: register and correctly invoke `internal(... { process })` queue workers

  `process` internals accepted jobs but never ran them. Three defects:

  - `buildInternal.process` was the only scheduled factory that did not default `enabled: true`, so
    `SignalResolver.resolveSchedule` skipped it and no worker was ever registered. Placement is now governed by
    `serverMode`/`operationMode` alone, matching the existing `serverMode: "all"` default.
  - Registered workers were called with the `AkanJob` rather than the declared `msg` arguments. The job payload is
    now spread onto the declared args and deserialized against their declared types, so the `exec` signature
    `(...msgArgs, job)` holds at runtime.
  - `BullQueue` scoped its worker to queue `<prefix>:<key>` while enqueueing onto queue `<prefix>`, so cluster mode
    never consumed jobs. Producer and consumer now share one queue per process key.

  `resolveSchedule` also logs when a `process` internal gets no worker on the current server, since the producer is
  installed regardless of placement.

- 473be34: fix(devkit): stop turning the builder's memory ceiling off on the first page load

  The dev host stops enforcing the builder's RSS ceiling when recycling evidently cannot meet it. The
  evidence it used was "two over-ceiling reports within 30s of a recycle" — but a builder reports after
  every build, and one page load builds a route per navigation. On a container-derived ceiling (a 1.2GB
  sandbox gives the builder ~420MB, against ~247MB per route build) the first page load after a recycle
  switched the ceiling off for the rest of the session, leaving the builder unbounded on exactly the
  deployment shape the ceiling exists for.

  It now measures what it always claimed to: when a replacement builder becomes ready, before it has built
  anything on demand, the host reads its RSS from the OS. That is the floor every future replacement lands
  on, so a floor already over the ceiling means recycling cannot help — and only that stops enforcement,
  with the message naming `AKAN_BUILDER_MAX_RSS_MB`. Otherwise the ceiling stands and the existing 30s
  minimum interval bounds what it costs, now with a one-off warning when the builder keeps crossing back
  inside that interval.

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
- f518afd: Add expiration options to remote memory cache writes.

## 2.3.6

### Patch Changes

- 0a4815a: Improve `akan start` stability for incremental dev changes.

## 2.3.5

### Patch Changes

- Fix Akan document and service type regressions for extended constant, document, signal, and store models.

## 2.3.2

### Minor Changes

- 1a48756: Add rich sample workspace template with full Akan.js module examples (task, noti, workHistory scalar) to help AI agents and developers bootstrap faster. Templates include database modules, service modules, scalars, UI components, server/client helpers, and comprehensive AGENTS.md with workflow recipes and auto-generated API reference.

### Patch Changes

- 940d6db: Optimize generated fetch client type inference while preserving ordered signal override semantics.
- d6db24d: Fix dev runtime refresh for client components, dictionaries, and signal metadata while keeping regenerated server page bundles aligned with live app signal definitions.
- dc60773: apply hidden and secret type safety on server side
- ffe68ec: Fix fetch client type inference for composed app signals while preserving direct signal navigation.
- 1a48756: Add the internal route cache tag boundary for SSR/RSC result caches, including cache tag collection and scoped tag/path invalidation across host and worker caches.
- 1a48756: Fix intermittent SSR/RSC navigation stalls by upgrading React and patching React DOM to preserve pinged lanes during mid-render Suspense retries.
- 1a48756: Add RSC partial navigation patch handling and supporting SSR build updates, plus benchmark harness improvements for validating production behavior.
- 1a48756: Separate `field.secret` from `field.hidden` so secret fields are excluded from default server reads and only returned through explicit projections.
- 4fc2673: Fix SSR hydration path seeding so route-aware links render consistently between server and client.

## 2.2.12

### Patch Changes

- 666e46c: Improve SSR hydration payload handling, redirect status propagation, and restore dev HMR incremental refresh behavior.
- 666e46c: Align RSC not-found responses with HTTP 404 semantics and add request-scoped policy tracking for future cache decisions.

## 2.2.11

### Patch Changes

- 8190632: Add Akan server console support with CLI/build integration and documentation for console-oriented workflows.
- 4bce7f9: Add initial LLM discovery docs and stabilize Akan client/runtime behavior.

  - Add `/llms.txt` documentation discovery for Akan docs.
  - Add `wsConnect` support for automatic WebSocket connections.
  - Delay client bootstrap module execution until the SSR fizz stream is ready.
  - Improve route tree, HMR, fetch, store, and SSR/client runtime stability.

## 2.2.7

### Patch Changes

- bf51564: fix: base dictionary translation failed in some cases
- bf51564: fix: file upload contract workaround on shared Field.Img component

## 2.2.5

### Patch Changes

- d636456: add rich Map methods on memory() helper service
- a1ee4e8: fill nested constant defaults for arrays on document save and load, normalize date fields to a consistent epoch representation on store (accepting legacy ISO-string values on read), and correct falsy defaults in getDefault
- 5cdb05e: reverse dependency of file upload api
- a7da50e: remove dependency from radix dialog

## 2.2.3

### Patch Changes

- 587cc68: fix dictionary loading
- 587cc68: fix fetchClient for setting origin with clone or fetchPolicy

## 2.2.0

### Minor Changes

- cb5b07a: enable custom not found and error render on \_layout.tsx files
- 258284e: initial js bundle size is optimized as single language dictionary on ssr
