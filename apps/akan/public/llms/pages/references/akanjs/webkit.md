# akanjs/webkit

- Source: /references/akanjs/webkit
- Mirror: /llms/pages/references/akanjs/webkit.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/webkit (#akanjs-webkit)

## Content

akanjs/webkit

React lazy wrapper that supports `ssr: false`. It returns a fallback stub on the server and gates client rendering until mounted, which is useful for browser-only libraries such as maps, charts, and 3D scenes.

Returns a debounced callback that delays execution until input quiets down. Search boxes, image editors, and expensive field updates use it to avoid repeated work while users type or drag.

Runs the latest callback on a fixed interval and clears the timer on unmount. Zone components use it for polling metrics, game state, build logs, and realtime-like dashboards.

Returns a throttled callback that runs immediately, then ignores calls until the delay passes. Use it for scroll, pointer, resize, or drag handlers that can fire too frequently.

Client hook for promise-backed values. `useFetch` accepts a promise or immediate value, while `useFetchFn` memoizes a factory so re-renders do not duplicate network requests.

Capacitor camera/photos hook. It checks permissions, opens app settings on denial, and exposes `getPhoto`, `pickImage`, and permission state for upload UIs.

Capacitor contacts hook for mobile signup/social flows. It requests contact permission and returns phone/name contact data when native contacts are available.

Capacitor geolocation hook. It requests location permissions, redirects to app settings when denied, and returns current coordinates for map or location flows.

Unified push notification client hook for web and native apps. It requests permission, registers the runtime, returns a PushToken, and bridges notification clicks through `data.url` when supported.

CSR router hooks for translating hrefs into route state and tracking navigation history. They power cached page transitions, scroll restoration, and back/forward detection.

Shared login form type used by auth stores and bridge UI. It describes target auth mode, redirect behavior, unauthorized path, and optional JWT handoff.

`akanjs/webkit` contains browser-only React helpers and native-capability hooks. Import it for lazy browser components, debounce/throttle/interval hooks, promise state, CSR navigation state, and Capacitor camera/contact/location/push flows.

Usage

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

