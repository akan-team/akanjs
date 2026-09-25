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

Constructor option type for `AkanApp`. It configures replica layout, server path, runtime directory, HTTP port, and WebSocket base port for the gateway process, plus `openapi` and `modules`. `modules` boots only the named modules and the ones they depend on, in every child; omitted or empty mounts every enabled module.

`server.setWeb(true | false | { csr })` and the `AKAN_SSR` / `AKAN_CSR` env narrow what a process serves beyond its API: SSR is the RSC renderer and its RSC worker process, CSR is the mobile SPA bundle at `/__csr`. They only narrow — a surface `akan.config.ts` left out of the build cannot be switched back on — and `AKAN_SSR=false` takes CSR with it, because the CSR bundle inlines the stylesheet the SSR build compiles. The boot log names the resolved answer.

App/library option builder used by `lib/option.ts`. It registers env-derived use objects, signal middleware, adaptor overrides, and web proxies, and carries the settings an app owns: `setMcp` for the MCP server, `setAgentAccess` for the guards a caller must pass to spend the LLM key through the agent relay, and `setLlm` for the model that relay speaks to. Every lib's option is read in mount order with the app's last.

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

