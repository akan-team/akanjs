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

Guard classes decide whether a request can pass before endpoint or slice execution. `Public` always passes, `None` blocks, and `guard(name)` creates a named guard base class for app-specific rules. Guards run on every transport, so read the caller with `context.get("account")` instead of branching on http/websocket. Slice `guards` cover only the generated query/mutation endpoints — declare `guards` on each `pubsub`/`message` endpoint to protect a socket. Every guard declares `static scope: GuardScope`, and it is required: `"account"` when the verdict depends only on the caller, `"resource"` when it needs the arguments of the call. Only `account` guards are evaluated when filtering an MCP catalogue, and since exposure follows the guards, a wrong mark would list an endpoint to callers who cannot use it.

`prompt()` is the fifth endpoint kind and the one a *user* invokes by name — an MCP client renders it as a slash command — rather than one the model chooses. `exec` returns `PromptMessage[]`, or a bare string that is wrapped into a single user message. Build messages with `Msg.user`, `Msg.assistant`, `Msg.link`, `Msg.resource`, `Msg.image`, `Msg.audio`, and `Msg.imageOf`. A prompt takes `.param()` and `.search()` only, because `prompts/get` carries a flat string map. An embedded payload is masked by the model you name — `Msg.resource(uri, task, { model: cnst.Task })`, or `Msg.mask(cnst.Task, task)` for one piece of an assembly — and an undeclared value whose secret fields are populated is refused rather than sent.

Reports progress for a long-running MCP tool call. Reached through `AsyncLocalStorage`, so an endpoint reports from wherever the work happens — a service, an adapter, a loop several frames down — without threading a channel through every signature. Outside a streamed call it is a no-op, so the same code runs unchanged over plain HTTP, a websocket, and in tests. The server switches to an SSE response only once the first report arrives, and only when the client asked with both `Accept: text/event-stream` and a `_meta.progressToken`.

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

