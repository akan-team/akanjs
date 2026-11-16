---
description: Services, signals, documents and srvkit adapters: calls, queries, injection and where errors are thrown.
paths:
  - "{apps,libs}/**/*.{service,signal,document}.ts"
  - "{apps,libs}/**/srvkit/**"
---

# Services And Signals

`serve(...)` services hold business operations. Signals hold contracts: `internal(...)` for init, interval, cron and
queue jobs, `slice(...)` for data views feeding stores and zones, `endpoint(...)` for queries and mutations. Guards
are the `auth` rule, queries and cascades the `module` rule. How-to and detail: the `akan-service`, `akan-transport`,
`akan-query`, `akan-mcp`, `akan-agent` and `akan-err` skills.

- **External APIs and infrastructure go through a `srvkit/` adapter**, never a vendor client in domain logic: an
  `adapt()` singleton injected with `plug(TheClass)`. It registers itself, so it never goes in `lib/option.ts`.
- **An injected field is named `<refName>Service` / `<refName>Signal`** — the suffix is required
  (`pkgs/akanjs/service/injectInfo.ts`).
- **`fetch.*` is one namespace across modules and a pubsub or message is routed by its bare name**, so the server
  refuses to boot on two claims of one name (`[DI:fetch]`, `[DI:socket]`), naming both.
- **On the wire**: `.body()` / `.param()` take `Int` / `Float`, never `Number`; bytes are `Binary`, never `Any`;
  `Upload` only in a `fileUpload: true` mutation. Without `{ timeout }` the client quits at 30 s and the handler runs
  on. A remote `Err` from `fetch.clone({ origin })` is rethrown as is, never wrapped or re-keyed.
- **MCP**: `/mcp` publishes every guarded endpoint by default; `mcp: false` is curation, not authorization. Never
  make a refusal message more helpful.
- **In-page agent**: `<Agent.Chat />` refuses every call until `option.setAgentAccess(<guard>)`; the LLM is
  `option.setLlm({ apiKey, model, host })`, never env; the surface is what components declare, never a store class.
- **Errors**: a state-machine precondition throws in `document.ts`, a cross-document rule in `service.ts`, request
  policy in a `signal.ts` guard. Best-effort code returns a sentinel (`null`, `undefined`, `[0, 0]`, `{}`) — no
  Result types. `try/catch` turns an exception into a decision, and a bodyless `catch {}` needs a one-line reason.
