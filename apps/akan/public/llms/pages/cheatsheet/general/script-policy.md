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
- Upgrading (#upgrading)

## Content

Script Policy

Every HTML response's `Content-Security-Policy` carries a `script-src` that names each script the framework writes. The browser refuses any other inline script and reports it to the app. An app with no inline script of its own has nothing to do.

What each response sends

Response

script-src it enforces

- A server-rendered page — 'self' 'nonce-…' 'sha256-<bootstrap>' 'sha256-<flush>' 'sha256-<import map>' 'strict-dynamic'

- The same page from the HTML cache — 'self' 'sha256-<bootstrap>' 'sha256-<flush>' 'sha256-<import map>' 'sha256-<each script React wrote>' 'strict-dynamic'

- The CSR document (?csr=true) — 'self' 'sha256-<the inlined bundle>' 'strict-dynamic'

- System pages (404, 500), the OAuth error page — 'self' 'strict-dynamic'

- The gateway's status page — 'self' 'sha256-<its reload script>' 'strict-dynamic'

- Under akan start — … 'nonce-…' 'strict-dynamic' 'unsafe-eval'

`'strict-dynamic'` turns `'self'` off in a current browser: a script runs because the policy names it by hash or nonce, or because a script that already runs added it. `'self'` is what an older browser falls back to.

It follows `frame-ancestors 'self'; base-uri 'self'` in the same header, and ends with `'wasm-unsafe-eval'`, so WebAssembly compiles, then `report-uri /_akan/csp-report; report-to akan-csp`.

A page replayed from the HTML cache has no nonce: it lists the hash of every script its first render ran under one, which is one per boundary that streamed in.

A response names at most 32 hashes, which keeps the header under 2 KB. A page whose replay needs more is rendered per request and says so with `X-Akan-Cache-Reason: script-hashes`. Hashes a `.head()` declares past 32 are left out.

Your Own Inline Scripts

An inline `<script>` a `.head()` or a layout writes is refused until the policy names it. Name a constant snippet by hash with `scriptHashes()`: the page stays cacheable, and the hash is the one the browser prints in its console error.

For text that differs per request, or a `<script src>` written in JSX, pass the response's nonce. Reading it makes the page dynamic, so neither result cache stores it.

Call both from `.head()`: the header leaves with the first byte, so a hash a component declares while it renders is too late. Both do nothing in the browser.

A third-party script from another origin needs the nonce on its tag, unless a script that already runs adds it, as a tag manager's loader does. Listing its host in the policy does nothing under 'strict-dynamic'.

An inline event handler attribute (`onclick="…"`) and a `javascript:` URL have no hash or nonce form: move them into a component's handler.

A script React inserts on a soft navigation is added by a script that already runs, so it needs neither.

Reports And Settings

The browser console shows a refused script as an error naming the directive and, for an inline script, the hash that would allow it. The browser also posts a report to /_akan/csp-report, which logs one [ScriptPolicy] warning per route, directive and blocked source.

- AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY (string, default off): `on` sends the script policy as `Content-Security-Policy-Report-Only` instead, so the browser reports what it would refuse and runs it. Any other value is sent as a report-only header of its own, as written. — Example: `AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY=on`

- AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC (string, default 'wasm-unsafe-eval'): The source expressions that end every response's script-src, separated by spaces, in place of the default: keep `'wasm-unsafe-eval'` in it while a page compiles WebAssembly. `off` adds none. — Example: `AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC="'wasm-unsafe-eval' 'sha256-…'"`

- AKAN_CONTENT_SECURITY_POLICY_REPORT_URI (string, default /_akan/csp-report): Where the browser posts each report, as `report-uri` and `report-to` with a `Reporting-Endpoints` header. `off` asks for none. — Example: `AKAN_CONTENT_SECURITY_POLICY_REPORT_URI=https://reports.example.com/csp`

- AKAN_CONTENT_SECURITY_POLICY (string, default frame-ancestors 'self'; base-uri 'self'): The enforced policy besides script-src. A value replaces the whole enforced policy as written and `off` drops it; either way the script policy then only reports.

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

- An MCP app view, a native app's index.html — server/mcp/McpAppShell.ts, server/mcp/McpAppFrame.ts, @akanjs/native — Not under this policy: an MCP host's sandbox sets a view's, a view a page draws runs in /_akan/app-frame, which sandboxes itself, and a native build hashes its own index.html.

What Changes In A Page

In the page source, the route state, the dictionary URL and each Flight chunk are `<script type="application/json">` blocks where there was script text, and the markup has no `<script type="module">` tag for the client entry: the bootstrap script adds it once the document has arrived.

`DOMContentLoaded` and `load` can fire before the client entry runs, since a module a script adds does not hold them back. A listener client code adds after that is never called: check `document.readyState` first.

For `DOMContentLoaded` the test is `document.readyState !== "loading"`.

A browser test that clicks or types at `load` can meet an unhydrated page and lose the event. Assert the action's result and let the runner retry, or wait for a marker a client effect sets, such as `document.documentElement.dataset.hydrated`.

Upgrading

Load your pages with the console open, or deploy once with `AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY=on`, which only reports, and read the `[ScriptPolicy]` warnings until no new one comes.

Name each inline script of your own with `scriptHashes()` or `nonce={scriptNonce()}`, and move `onclick="…"` attributes and `javascript:` URLs into a component's handler.

An `AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC` from before replaces the default now: add `'wasm-unsafe-eval'` to it if a page compiles WebAssembly.

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

