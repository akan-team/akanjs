---
"akanjs": minor
---

`agentService.loop` can call other MCP servers as the run's account, each one a toolkit the model opens.

- `remotes: AgentLoopRemote[]` on the loop request. A remote is listed in `openToolkit` by its `name` and `description` and is not contacted until the model opens it; its tools then read `<name>.<tool>`. Opening one the account has no connection to ends the run `awaiting` with `connect: "<name>"`, and a resume with the stored messages opens it once connected.
- Opening a remote taints the run: its tool names, descriptions and schemas, or the error of a failed open, are another party's text. Without `approve` no call to a remote runs, whatever the remote calls its tool, so pass `approve` with `remotes`; it receives the target as `state.remote`, and a tool the remote does not call read-only as `needsConfirm`. One remote's listing stops at 120,000 characters, the rest counted in the open's `omitted`.
- A `toolResult` event carries `view` when the remote tool is a `page().app()`: where its screen is, for the page to draw. Only `href`, `static` and `resourceUri` are taken from what the remote sent. It reaches neither the model nor `onMessage`.
- `akanjs/server` exports the client half of `/mcp` and `/oauth`: `RemoteFetch` (https only, no private address, no redirect, the checked address pinned), `RemoteOAuth` (discovery, registration, PKCE, exchange, refresh, revoke), `RemoteMcp` (Streamable HTTP, request and answer) and `RemoteSource`, which implements `AgentLoopRemote` over them. A failure is a `RemoteError` with one of six `remote…` codes. Discovery refuses OAuth metadata that names a different issuer, or a resource outside the MCP endpoint's origin and path, and a token endpoint that is down, rate-limited or answers an error page is `remoteUnavailable`, so a refresh during an outage keeps the grant.
- `libs/shared` gains the `remote` service, off unless `remote.enabled`: `connectRemote`, `completeRemoteConnection`, `disconnectRemote`, `listRemoteConnections`, the `page/remote/callback` page and `<Remote.Util.Connect>`. A connection is the user's own OAuth grant at the other server, stored sealed; `remoteService.sources(account, refs)` hands them to the loop.

- A connected server's app is drawn in the chat by `<Remote.Zone.Screen>` (the server's script-less HTML for an app it declares `{ static: true }`, in a frame that runs no script) or `<Remote.Zone.View>` (its MCP Apps view, scripts on, no origin, under a policy that lets its script open no connection and load images, styles, fonts and media only from that server). `McpAppHost` in `akanjs/webkit` is the host half of the MCP Apps bridge the view talks to. `remoteScreen`, `remoteView` and `callRemoteView` serve them, each limited to what that server lists to the user. A link a card or view opens is followed only when it is https on that server's own origin.

Nothing changes for a request without `remotes`.
