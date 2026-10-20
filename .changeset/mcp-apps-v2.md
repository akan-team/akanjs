---
"akanjs": minor
---

MCP Apps v2: the unit of an MCP App is now one component, `page().app()`, instead of a whole `.prompt()` screen.

- **Tools.** Each `.app()` is a tool named after the app. Its input is the page's `.param()` and `.search()`. Its annotations are `readOnlyHint: true, openWorldHint: false`, since the load may only query. Its `_meta.ui.resourceUri` is `ui://<app>/apps/<name>`. A call checks the arguments, runs the route guards, and then runs the app's load alone: no layout body and no `.render()`. The model receives the briefing of what the load fetched plus `Open the full screen: <page URL>`. A view receives the raw values in `_meta`, and the route values it starts from in `structuredContent`.
- **`.prompt()` is a briefing again.** It stays a prompt and a text tool, with `readOnlyHint: false`, since its run renders the whole page. It no longer names a view.
- **Names.** Prompts and apps share one namespace. Two pages that claim one name fail the listing, whatever the kind of each claim. An endpoint keeps its name over an app's, with a warning at boot, as it already did over a prompt's. `prompts/get` serves only prompts.
- **Read-only deployments** (`option.setMcp({ readOnly: true })`) keep the app tools, their resources and the views. A prompt's text tool is left out, since its run may write; the prompt itself stays. An app result there carries `_meta["akanjs/readOnly"]`.
- **Resources.** Each app has its own `ui://<app>/apps/<name>` view, read from the `mcp-apps/` folder that the build writes beside `csr/`. The basePath shells (`ui://<app>/app[/<basePath>]`) are gone.
- The server speaks the modern MCP revision over `server/discover` once the listed pages declare no `.app()`, instead of no `.prompt()`.

Upgrade note: a `.prompt()` page is no longer drawn in an MCP Apps host. Declare `.app()` on the page for each component the host should draw.
