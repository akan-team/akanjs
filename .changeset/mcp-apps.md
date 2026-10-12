---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

A page that declares `.prompt(name, description)` also answers as an MCP App: the one declaration is a prompt, a tool, and a `ui://` resource whose view is the app's own CSR bundle inside the host's sandboxed iframe. There is no separate setting to switch a screen on.

- **One declaration, three shapes.** The tool takes the page's params as required arguments and a free-form `search`; `_meta.ui.resourceUri` points at the `ui://` resource, so claude.ai, ChatGPT and VS Code show the screen while Claude Code reads the briefing plus the web URL it always did.
- **The view is the real page.** It boots the CSR shell with a memory history (`client/csrLocation`), routes and renders as a native shell does, and reaches data only through the host: `FetchClient` forwards query/mutation to `tools/call`, so there is no network and no websocket. Host theme, locale, time zone, radius and height map onto the app's tokens, links inside the page open in the view and outside it go through `ui/open-link`.
- **A screen may offer the model its levers.** `st.tool`, a form setter and the built-ins become app tools the view lists and calls, running the same `ToolRunner` in the caller's session; a tool declared with a `confirm` asks the person through the existing `Agent.Approval` slot, and `readOnlyHint` follows `settle`. The screen also pushes its guide and `AgentContext` blocks with `ui/update-model-context`, and `<a download>` / `downloadBlob` go through `ui/download-file`.
- **`mcp: false` becomes an app-only tool.** Kept off every model's shelf, it reaches only a client that renders views, and a `Person` act stays refused there. Visibility is a host's UX and never authorization, so the guards decide what a view may call exactly as for a model.
- **Negotiation.** A modern client declares the extension per request in `_meta`; a legacy one declares it at `initialize` and is issued a stateless `Mcp-Session-Id: ui.<uuid>`. An app that renders views speaks legacy by default — claude.ai mounts a view only for a server it reached through `initialize`, so `server/discover` answers `-32601`. `option.setMcp({ modern: true })` / `AKAN_MCP_MODERN` restores it, and `option.setMcp({ apps: false })` / `AKAN_MCP_APPS=false` keeps pages prompts only.
- **Resource CSP.** `_meta.ui.csp.resourceDomains` and `baseUriDomains` name the app's own origin, normalized before it reaches markup, which is what lets a font and a stored image load; `connect-src` stays closed. `/_akan/fonts/*` answers `Access-Control-Allow-Origin: *`, and a host that blocks `<base>` gets the origin patched onto root-relative `src`/`srcset`/`href` instead.
- **Dev.** A dev registry shell loads its modules from the server, which a sandbox cannot reach, so the CLI builds a single-file shell on demand through the builder (`buildCsr(…, { shell: true })`) and the web router serves it, rebuilding only when the generation moved.
