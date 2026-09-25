# akanjs/server

- Source: /references/akanjs/server
- Mirror: /llms/pages/references/akanjs/server.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/server (#akanjs-server)

## Content

akanjs/server

Gateway/orchestrator used by app `main.ts` files. It starts child server replicas, proxies HTTP and WebSocket traffic, reports metrics, and handles shutdown for local and production runs.

Constructor option type for `AkanApp`. It configures replica layout, server path, runtime directory, HTTP port, and WebSocket base port for the gateway process.

App/library option builder used by `lib/option.ts`. It registers env-derived use objects, signal middleware, and web proxies consumed by the server runtime.

Response helper for web proxy code. `next` continues the request, `rewrite` proxies to a different URL while preserving proxy metadata, and `redirect` returns a normal redirect response.

Type for server-side web proxy registrations. Libraries use it for locale routing, host/base-path routing, and custom request handling before the normal Akan router responds.

Legacy method decorator that catches errors and logs a warning instead of throwing. It appears in integration srvkit classes where a best-effort external API call should not crash the caller.

Legacy method decorators for server-side service/document helpers. `Transaction` wraps execution in the detected database transaction and `Cache` memoizes method results for a timeout window.

`akanjs/server` contains app startup, server options, web proxy helpers, decorators, runtime artifacts, and operational utilities. Import it from app entrypoints, `lib/option.ts`, and server-only srvkit integrations.

Usage

## Code Examples

No code snippets were extracted from this page.

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

