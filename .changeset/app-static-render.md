---
"akanjs": minor
---

A page app can declare `{ static: true }` and send a host that asks its element as script-less HTML.

- `page().app(name, description, load, { static: true })` marks the app's tool `_meta["akanjs/static"]: true`, with or without a view, wherever the server renders pages.
- A `tools/call` on that tool whose `params._meta["akanjs/render"]` is `"html"` gets the usual result plus an embedded `text/html` resource `ui://<app>/static/<name>`: the element drawn under the caller's own credential after the route guards, inside the root layout's `McpAppRoot`, with the layout's theme, a `<base>` at the web origin, the stylesheet, every Suspense boundary resolved in place, and no `<script>`. The Flight payload never reaches the document.
- The HTML also leaves out event handlers, embedded documents, refreshes and `javascript:` links. The whole draw, the page's `load` included, ends within 10 seconds: past that the call answers that the page failed to load.
- No HTML is sent, and the call answers exactly as before, when the guards refuse, the drawing fails or passes 1 MB, the body is empty or only a fallback, or a component needs a browser. `lazy(…, { ssr: false })` says so itself; any other component calls the new `needsBrowser()` from `akanjs/webkit` while it renders.

**Upgrading.** No step is needed: `PageDefinition.app()` takes an optional fourth argument, and `RoutePromptMeta`, `PagePromptEntry`, `PagePromptSource` and `AkanRequestStore` each gain an optional member.
