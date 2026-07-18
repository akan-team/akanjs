# akanjs/signal

- Source: /references/akanjs/signal
- Mirror: /llms/pages/references/akanjs/signal.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/signal (#akanjs-signal)

## Content

akanjs/signal

Guard classes decide whether a request can pass before endpoint or slice execution. `Public` always passes, `None` blocks, and `guard(name)` creates a named guard base class for app-specific rules.

Internal argument providers for advanced endpoints. `Req` gives the Bun request, `Res` gives the mutable response context, and `Ws` gives websocket subscription state and event hooks.

Middleware wraps endpoint execution. Built-ins include Logging, Cache, Timeout, and Retry, while custom middleware can read `SignalContext` and decide when to call `next()`.

Global registry for database and service signals. App `sig.ts` files register every module signal so serialized fetch metadata, server routes, and runtime signal lookup can be built consistently.

`akanjs/signal` declares the API boundary around services. Import it in `*.signal.ts` files to define endpoints, internal jobs, database slices, guards, middleware, request arguments, and registered server signals.

Usage

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

