# akanjs/base

- Source: /references/akanjs/base
- Mirror: /llms/pages/references/akanjs/base.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/base (#akanjs-base)

## Content

akanjs/base

24 hex string uuid used for document ids and signal payload ids. It validates as a string and keeps an empty string as the default placeholder value.

Integer primitive scalar for numeric fields that must be safe integers. It is common in counters, pagination values, metric samples, and scalar constant definitions.

Finite number primitive scalar for decimal values such as coordinates, rates, balances, and resource metrics. Use it when fractional values are valid business data.

Loose object scalar for payloads whose shape is intentionally open. Prefer explicit scalar/model fields when the shape is stable; use Any for integration blobs or flexible metadata.

Akan re-exports the configured dayjs function and Dayjs type from base. Apps and libs use it for document dates, store state dates, service calculations, and UI formatting.

Creates a typed enum scalar class from a literal value list. The generated enum exposes values, has, indexOf, find, filter, map, and forEach helpers used by constants and UI labels.

Reads and caches Akan runtime environment values from public/server environment variables. It returns client/server URI data, operation mode, app identity, and render mode.

Small id-keyed collection helper for light model arrays. It keeps a map from id to index and provides immutable-style set, delete, filter, slice, pick, and iteration helpers.

`akanjs/base` contains Akan's primitive scalar classes, runtime environment helpers, and foundational utility types. Import it when defining constants, document ids, date values, runtime-specific behavior, or type-level model helpers.

Usage

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

