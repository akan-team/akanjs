# akanjs/client

- Source: /references/akanjs/client
- Mirror: /llms/pages/references/akanjs/client.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/client (#akanjs-client)

## Content

akanjs/client

Client navigation singleton that normalizes Akan language/base-path prefixes before delegating to the active router. Use it from pages, stores, templates, and utilities for push/replace/back/refresh.

Re-export of `clsx` for composing class names across Akan UI code. Most view/unit/template components import it from `akanjs/client` to keep UI dependencies consistent.

Common props for generated Unit, Zone, and list UI components. They carry model data, slice metadata, query/init settings, actions, columns, and click handlers.

Route module types for page/layout files. `PageConfig` controls transition, safe area, gesture, and cache behavior, while `LayoutProps` describes layout children and route params.

Font declaration types and client-side font factory shims. Layout modules use `Font` data so the server build can optimize local font assets while CSR code receives safe no-op shims.

Page dictionary and translation helpers generated from Akan dictionaries. Components use `usePage()` for locale-aware text and `msg`/`Err` for message rendering helpers.

Typed client fetch proxy built from registered signal metadata. It exposes generated endpoint and slice methods and keeps JWT state synchronized through auth helpers.

Cookie and account helpers that work across server and client contexts. `getAccount` decodes the JWT only when it belongs to the current app and environment.

Authentication helpers that update FetchClient JWT state, cookies, and client storage together. Stores call these after login/logout so future generated fetch calls include the right token.

Device singleton for Capacitor/native features such as safe-area values, keyboard listeners, haptics, scroll position, platform info, and language detection.

`akanjs/client` contains browser/UI-facing helpers: routing, typed fetch access, dictionary hooks, page/layout types, auth/cookie helpers, device utilities, font declarations, and common UI prop types.

Usage

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

