# Script Policy

- Source: /cheatsheet/general/script-policy
- Mirror: /llms/pages/cheatsheet/general/script-policy.md
- Section: cheatsheet
- Category: General
- Priority: P2

## Headings

- Script Policy (#overview)
- Your Own Inline Scripts (#own-scripts)
- Reports And Settings (#reports)
- The Framework's Scripts (#framework-scripts)
- What Changes In A Page (#page-changes)
- What 3.5.0 Enforces (#enforcement)

## Content

Script Policy

Every HTML response carries `Content-Security-Policy-Report-Only` with a `script-src` that names each script the framework writes. In 3.4 the browser only reports what the policy would refuse; 3.5.0 moves the same `script-src` into the enforced `Content-Security-Policy`. An app with no inline script of its own has nothing to do.

What each response sends

Response

script-src it reports against

- A server-rendered page — 'self' 'nonce-…' 'sha256-<bootstrap>' 'sha256-<flush>' 'sha256-<import map>' 'strict-dynamic'

- The same page from the HTML cache — 'self' 'sha256-<bootstrap>' 'sha256-<flush>' 'sha256-<import map>' 'sha256-<each script React wrote>' 'strict-dynamic'

- The CSR document (?csr=true) — 'self' 'sha256-<the inlined bundle>' 'strict-dynamic'

- System pages (404, 500), the OAuth error page — 'self' 'strict-dynamic'

- The gateway's status page — 'self' 'sha256-<its reload script>' 'strict-dynamic'

- Under akan start — … 'nonce-…' 'strict-dynamic' 'unsafe-eval'

`'strict-dynamic'` turns `'self'` off in a current browser: a script runs because the policy names it by hash or nonce, or because a script that already runs added it. `'self'` is what an older browser falls back to.

The enforced header is unchanged: `frame-ancestors 'self'; base-uri 'self'`.

A page replayed from the HTML cache has no nonce: it lists the hash of every script its first render ran under one, which is one per boundary that streamed in.

A response names at most 32 hashes, which keeps the header under 2 KB: a proxy in front reads a response's headers into one buffer (4 KB in nginx unless configured) and answers 502 past it. A page whose replay would need more is rendered for each request and says so: `X-Akan-Cache: BYPASS` with `X-Akan-Cache-Reason: script-hashes`, counted under that reason in `akan_route_cache_lookups_total`, and one warning in the log per route. Hashes a `.head()` declares past the 32 are left out, with one warning per route.

Your Own Inline Scripts

An inline `<script>` a `.head()` or a layout writes is reported until the policy names it. Name a constant snippet by hash with `scriptHashes()`: the page stays cacheable, and the hash is the one the browser prints in its console report.

For text that differs per request, or a `<script src>` written in JSX, pass the response's nonce. Reading it makes the page dynamic, so neither result cache stores it.

Call both from `.head()`: the header leaves with the first byte, so a hash a component declares while it renders is too late. Both do nothing in the browser.

A third-party script loaded from another origin needs the nonce on its tag, or a script that already runs must add it (a tag manager's own loader does). Listing its host in the policy does nothing under 'strict-dynamic'. Whatever a trusted script then adds needs no entry.

An inline event handler attribute (`onclick="…"`) and a `javascript:` URL have no hash or nonce form: move them into a component's handler.

A script React inserts on a soft navigation is added by a script that already runs, so it needs neither.

Reports And Settings

A report-only violation shows in the browser console as a [Report Only] line that names the script and the hash that would allow it. To collect them from real visitors, point the header at an endpoint that accepts the browser's JSON report.

- AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY (string): `off` drops the report-only header. Any other value is sent as written in its place, with no hash or nonce added. — Example: `AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY=off`

- AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC (string): Source expressions added to every response's script-src, separated by spaces: `'wasm-unsafe-eval'` for a page that compiles WebAssembly, or the hash of a snippet every page carries. — Example: `AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC='wasm-unsafe-eval'`

- AKAN_CONTENT_SECURITY_POLICY_REPORT_URI (string): Where the browser posts each report: added as `report-uri` and `report-to`, with a `Reporting-Endpoints` header. — Example: `AKAN_CONTENT_SECURITY_POLICY_REPORT_URI=https://reports.example.com/csp`

- AKAN_CONTENT_SECURITY_POLICY (string, default frame-ancestors 'self'; base-uri 'self'): The enforced policy, as before: a value replaces it and `off` drops it. It does not change the report-only header.

The Framework's Scripts

Every inline script the framework writes, and why none of them is reported. Executable text is constant and named by hash; a value that differs per request is data a constant script reads.

Inline script

Where it is written

How the policy names it

- Bootstrap: chunk loader, theme init, the page's values — server/ssrInlineScripts.ts — Static text, by hash. Route state, dictionary URL, import map key and prefixes are a JSON block before it.

- Flight chunks, a late redirect, the end — server/ssrInlineScripts.ts — JSON blocks, which never run. One static flush call per batch reads them, by hash.

- Import map — server/ssrInlineScripts.ts — One per build, by hash.

- React's own scripts that reveal a streamed boundary — react-dom/server — The response's nonce. A cached page lists their hashes instead.

- The CSR document's inlined bundle — server/webCsrSurface.ts — Hashed once per built file.

- The gateway status page's reload loop — server/gateway/gatewayStatusPage.ts — Static text, by hash.

- Dev only: HMR client, the dev registry shim and shell, the error page's reload, Akan Studio — server/hmr/*, server/devtools/studio/* — The response's nonce (they import modules themselves); Studio's runtime by hash.

- An MCP app view, a native app's index.html — server/mcp/McpAppShell.ts, @akanjs/native — Not served as a page: the MCP host's sandbox sets the view's policy, and a native build hashes its own index.html.

What Changes In A Page

In the page source, the route state, the dictionary URL and each Flight chunk are `<script type="application/json">` blocks where there was script text, and the markup has no `<script type="module">` tag for the client entry: the bootstrap script adds it once the document has arrived.

A module a script adds does not hold the document's events back, so `DOMContentLoaded` and `load` can fire before the client entry runs (on a cached docs page, `load` at 31 ms and the entry at 63 ms). A listener for either that client code adds afterwards is never called: check `document.readyState` first.

For `DOMContentLoaded` the test is `document.readyState !== "loading"`.

A browser test that clicks or types as soon as navigation reports `load` can meet a page that has not hydrated, and the event is lost. Wait for something only the hydrated page does: assert the result of the action and let the runner retry it, or wait for a marker a client component sets in an effect, such as `document.documentElement.dataset.hydrated`.

What 3.5.0 Enforces

The script-src above joins the enforced Content-Security-Policy, so a script it does not name stops running instead of being reported.

Before upgrading, load your pages on 3.4 with the console open (or collect reports for a release) until none is left.

`AKAN_CONTENT_SECURITY_POLICY` stays the override: a value replaces the enforced policy whole, and `off` drops it.

## Code Examples

### apps/myapp/page/_layout.tsx

```ts
import { layout, scriptHashes } from "akanjs/client";

const consent = "window.dataLayer=window.dataLayer||[];";

export default layout()
  .head(() => {
    scriptHashes("sha256-djPdT5J1kuWFwawDhtbzz0YHt/63i3CUBG3CyUjLa4c=");
    return <script dangerouslySetInnerHTML={{ __html: consent }} />;
  })
  .render(({ children }) => children);
```

### apps/myapp/page/_layout.tsx

```ts
import { layout, scriptNonce } from "akanjs/client";

export default layout()
  .head(() => <script nonce={scriptNonce()} src="https://tags.example.com/loader.js" async />)
  .render(({ children }) => children);
```

### apps/myapp/webkit/useWindowLoad.tsx

```ts
if (document.readyState === "complete") onLoad();
else window.addEventListener("load", onLoad, { once: true });
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

