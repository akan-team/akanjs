# akanjs

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
