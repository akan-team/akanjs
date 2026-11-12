# Akan.js Architecture

How the `akanjs` package is laid out, which process runs what, and how a request travels through them.

The sections above the generated marker are kept by hand. A test checks that every class they name in backticks still
exists, so rename a class here when you rename it in the code. The facet layers and the message tables below the marker
are generated from the source by `bun run akan sync-architecture`, and the same test fails when they are stale. Akan
Studio's Framework view (`/_akan/studio?view=framework` under `akan start`) draws the same map, linked to the source.

## Processes

| Process | Runs | Started by | Owns |
| --- | --- | --- | --- |
| Dev host | `AkanAppHost` | `akan start` | file watching, the builder, restarting the gateway after a server change, relaying the builder's messages |
| Builder | `IncrementalBuilder` | `IncrementalBuilderHost`, in the dev host | bundles and CSS, route builds on demand, the Akan Graph and this map for Studio |
| Gateway | `AkanApp` | the dev host (`apps/<app>/main.ts`), or the container of a deployment with several replicas or a batch replica | the public port, proxying to the children, pubsub and live-change fan-out between them, health, metrics and logs |
| Child | `AkanServer` | `AkanApp`, one per replica | dependency injection, the API, websocket rooms, page rendering |
| RSC worker | `RscRenderer` | `RscWorker`, in the child | rendering route modules to a Flight stream |
| Browser tab | — | — | hydration, and in dev the updates `HmrWsHub` pushes over its socket |

A deployment has no dev host and no builder. With several replicas or a batch replica, the container runs the gateway,
and the gateway runs the children. With one replica and no batch replica, the default, `AkanApp` runs solo: one
`AkanServer` in the container's own process, with no gateway, binding the port and answering `/_akan/app/health`
itself, so step 1 below does not happen.

## A request, end to end

1. The gateway `AkanApp` answers `/_akan/app/health` itself and proxies every other request and websocket upgrade to a
   child, over a Unix socket or TCP.
2. The child `AkanServer` boots dependency injection through `DiLifecycle`, which resolves each module's database with
   `DatabaseResolver`, its services with `ServiceResolver` and its signals with `SignalResolver`. It then mounts its
   routes with `ApiRouter.buildRoutes`: endpoints under `/api`, the socket at `/api/ws`, the builtins under `/_akan`
   (`DevtoolsRouter` among them), and the pages from `WebRouter` last, as the catch-all.
3. An endpoint call reaches the handler `SignalResolver` mounted for it. The handler opens a `SignalContext`, whose
   `init()` reads the request and whose `exec()` runs the endpoint's guards, parses its arguments, and runs the signal,
   which calls its service.
4. A page request goes to `WebRouter`, which asks `RscWorker` for the route. `RscWorker` sends `render` to the RSC
   worker process, where `RscRenderer` streams the Flight payload back as `meta`, `chunk` and `end`. For a full page
   load `SsrFromRscRenderer` turns the stream into HTML; a client-side navigation takes the Flight stream itself.
5. A websocket message runs the same `SignalContext` path. A publish reaches the other children through the gateway:
   the child's `SolidPubSub` sends `pubsub.publish`, and `AkanApp` answers every subscribed child with
   `pubsub.deliver`.

In dev, a save reaches the tabs like this: the builder rebuilds and sends `pages-updated` or `css-updated`; the dev
host relays it to the gateway, which passes it to the child's `BuilderRpc`; the child's `DevHmrController` then
broadcasts an `HmrMessage` to the tabs.

<!-- akan:framework-map:start -->
<!-- Generated from the framework source by `bun run akan sync-architecture`. Edit outside the markers. -->
<!-- Outside the markers, every backticked PascalCase name must be a framework class or channel. -->

## Facet layers

A facet loads values only from facets in lower layers. A type-only import loads nothing, so it may point anywhere.

| Layer | Facet | Loads values from | Imports only types from |
| --- | --- | --- | --- |
| 0 | `base` | — | — |
| 0 | `native` | — | — |
| 1 | `common` | `base` | — |
| 2 | `constant` | `base`, `common` | — |
| 2 | `dictionary` | `common` | `base`, `constant`, `document`, `signal` |
| 3 | `document` | `base`, `common`, `constant` | `service` |
| 3 | `fetch` | `base`, `common`, `constant` | `document`, `signal` |
| 4 | `client` | `base`, `common`, `constant`, `fetch` | `signal` |
| 4 | `service` | `base`, `common`, `constant`, `dictionary`, `document` | `signal` |
| 5 | `signal` | `base`, `common`, `constant`, `dictionary`, `document`, `fetch`, `service` | — |
| 5 | `store` | `base`, `client`, `common`, `constant`, `fetch` | `document`, `signal` |
| 6 | `webkit` | `base`, `client`, `common`, `fetch`, `signal`, `store` | `ui` |
| 7 | `server` | `base`, `client`, `common`, `constant`, `dictionary`, `document`, `fetch`, `service`, `signal`, `store`, `webkit` | — |
| 7 | `ui` | `base`, `client`, `common`, `constant`, `fetch`, `store`, `webkit` | `document`, `signal` |
| 8 | `@akanjs/devkit` | `base`, `client`, `common`, `server` | `native` |
| 8 | `test` | `base`, `common`, `constant`, `fetch`, `server`, `service` | `signal` |

## Process messages

Each channel is a union of messages told apart by `type`. A sender writes the message's `type` literal; a handler
branches on it or relays it. Both are named by the class or top-level function they sit in. A dash means no site
was recognised.

### `AkanIpcMessage`: gateway ⇄ child

Declared in [service/ipcTypes.ts](service/ipcTypes.ts).

| Message | Sent by | Handled by |
| --- | --- | --- |
| `ready` | `AkanServer` | `AkanApp` |
| `pubsub.publish` | `SolidPubSub` | `AkanApp` |
| `pubsub.deliver` | `GatewayRooms` | `SolidPubSub` |
| `pubsub.subscribe` | `SolidPubSub` | `AkanApp` |
| `pubsub.subscribed` | `GatewayRooms` | `SolidPubSub` |
| `pubsub.unsubscribe` | `SolidPubSub` | `AkanApp` |
| `pubsub.snapshot.request` | `GatewayRooms` | `SolidPubSub` |
| `pubsub.snapshot` | `SolidPubSub` | `AkanApp` |
| `live.change` | `SolidPubSub` | `AkanApp`, `SolidPubSub` |
| `live.models` | `SolidPubSub` | `AkanApp` |
| `queue.enqueued` | `SolidQueue` | `AkanApp` |
| `queue.wake` | `AkanApp` | `SolidQueue` |
| `health.ping` | `ChildSupervisor` | `ParentChannel` |
| `health.pong` | `ParentChannel` | `AkanApp` |
| `ws.opened` | — | — |
| `ws.closed` | — | — |
| `metrics.report` | `ServerMetrics` | `AkanApp` |
| `log.records` | `LogForwarder` | `AkanApp` |
| `log.level` | `ChildSupervisor`, `GatewayLogging` | `ParentChannel` |
| `shutdown` | `ChildSupervisor` | `ParentChannel` |
| `file.resolve` | `NativeFile` | — |
| `file.resolved` | — | `NativeFile` |
| `secret.request` | `NativeSecret` | — |
| `secret.answer` | — | `NativeSecret` |
| `error` | — | `AkanApp` |

### `BuilderMessage`: dev host ⇄ builder, relayed to the child

Declared in [server/artifact/ipcTypes.ts](server/artifact/ipcTypes.ts).

| Message | Sent by | Handled by |
| --- | --- | --- |
| `build-route` | `BuilderRpc` | `AkanApp`, `BuilderRequestRelay`, `DevBackend`, `IncrementalBuilder` |
| `build-csr` | `BuilderRpc` | `AkanApp`, `BuilderRequestRelay`, `DevBackend`, `IncrementalBuilder` |
| `build-graph` | `BuilderRpc` | `AkanApp`, `BuilderRequestRelay`, `DevBackend`, `IncrementalBuilder` |
| `build-route-res` | `BuilderRequestRelay`, `IncrementalBuilder` | `AkanApp`, `AkanAppHost`, `BuilderRpc`, `IncrementalBuilderHost` |
| `build-csr-res` | `BuilderRequestRelay`, `IncrementalBuilder` | `AkanApp`, `AkanAppHost`, `BuilderRpc`, `IncrementalBuilderHost` |
| `build-graph-res` | `BuilderRequestRelay`, `IncrementalBuilder` | `AkanApp`, `AkanAppHost`, `BuilderRpc`, `IncrementalBuilderHost` |
| `builder-shutdown` | `IncrementalBuilderHost` | `IncrementalBuilder` |
| `builder-ready` | `IncrementalBuilder` | `AkanApp`, `BuilderRpc`, `IncrementalBuilderHost` |
| `backend-ready` | `ChildSupervisor` | `DevBackend` |
| `invalidate` | `DevRecycler`, `prepareDevWatchBatch` | `AkanApp`, `AkanAppHost`, `BuilderRpc`, `DevBuilder`, `IncrementalBuilderHost` |
| `css-updated` | `BuildBatch`, `IncrementalBuilder` | `AkanApp`, `AkanAppHost`, `BuilderRpc`, `DevBuilder`, `IncrementalBuilderHost`, `shouldRelayRecycledFrontendState` |
| `pages-updated` | `BuildBatch`, `IncrementalBuilder` | `AkanApp`, `AkanAppHost`, `BuilderRpc`, `DevBuilder`, `IncrementalBuilderHost`, `shouldRelayRecycledFrontendState` |
| `csr-updated` | `BuildBatch`, `IncrementalBuilder` | `AkanApp`, `BuilderRpc`, `IncrementalBuilderHost` |
| `ssr-updated` | `BuildBatch`, `IncrementalBuilder` | `AkanApp`, `BuilderRpc`, `IncrementalBuilderHost` |
| `build-status` | `BuildBatch`, `DevBackend`, `DevHostChannel`, `IncrementalBuilder` | `AkanApp`, `AkanAppHost`, `BuildBatchRunner`, `BuilderRpc`, `DevBackend`, `DevBuilder`, `IncrementalBuilderHost` |
| `builder-metrics` | `IncrementalBuilder` | `AkanAppHost`, `DevBuilder`, `IncrementalBuilderHost` |
| `boot-armed` | `IncrementalBuilder` | `AkanAppHost`, `IncrementalBuilderHost` |

### `InMsg`: server → RSC worker

Declared in [server/rscWorker.tsx](server/rscWorker.tsx).

| Message | Sent by | Handled by |
| --- | --- | --- |
| `init` | `RscWorker` | `RscRenderer` |
| `render` | `RscWorker` | `RscRenderer` |
| `cancel` | `RscWorker` | `RscRenderer` |
| `reload` | `RscWorker` | `RscRenderer` |
| `updateCssAssets` | `RscWorker` | `RscRenderer` |
| `invalidate-cache` | `createRscWorkerInvalidateCacheMessage` | `RscRenderer` |
| `log-level` | `RscWorker` | `RscRenderer` |
| `page-prompts` | `RscWorker` | `RscRenderer` |
| `page-prompt.run` | `RscWorker` | `RscRenderer` |
| `page-prompts.visible` | `RscWorker` | `RscRenderer` |
| `web-manifest` | `RscWorker` | `RscRenderer` |

### `RscInMsg`: RSC worker → server

Declared in [server/rscWorkerHost.ts](server/rscWorkerHost.ts).

| Message | Sent by | Handled by |
| --- | --- | --- |
| `hello` | `RscRenderer` | `RscWorker` |
| `ready` | `RscRenderer` | `RscWorker` |
| `reloaded` | `RscRenderer` | `RscWorker` |
| `meta` | `RscRenderer` | `RscWorker` |
| `theme` | `RscRenderer` | `RscWorker` |
| `cache-state` | `RscRenderer` | `RscWorker` |
| `chunk` | `RscRenderer` | `RscWorker` |
| `end` | `RscRenderer` | `RscWorker` |
| `redirect` | `RscRenderer` | `RscWorker` |
| `late-redirect` | `RscRenderer` | `RscWorker` |
| `late-not-found` | `RscRenderer` | `RscWorker` |
| `not-found` | `RscRenderer` | `RscWorker` |
| `metrics` | `RscRenderer` | `RscWorker` |
| `log.records` | `LogForwarder` | `RscWorker` |
| `page-prompts.result` | `RscRenderer` | `RscWorker` |
| `page-prompt.result` | `RscRenderer` | `RscWorker` |
| `page-prompts.visible.result` | `RscRenderer` | `RscWorker` |
| `web-manifest.result` | `RscRenderer` | `RscWorker` |
| `error` | `RscRenderer` | `RscWorker` |

### `HmrMessage`: dev server → browser tab

Declared in [server/hmr/wsHub.ts](server/hmr/wsHub.ts).

| Message | Sent by | Handled by |
| --- | --- | --- |
| `hello` | `ApiRouter` | — |
| `reload` | `DevHmrController` | — |
| `csr-update` | `DevHmrController` | — |
| `ssr-update` | `SsrUpdateQueue` | — |
| `rsc-refresh` | `DevHmrController` | — |
| `css-update` | `DevHmrController` | — |
| `sync-navigation` | — | `isSyncNavigationMessage` |
| `ok` | — | — |
| `build-status` | `devBuildStatusToHmrMessage` | — |
| `error` | `WebRouteContext` | — |
<!-- akan:framework-map:end -->
