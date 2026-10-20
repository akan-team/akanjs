---
"@akanjs/devkit": minor
---

`akan build` writes one single-file view per `.app()` to `mcp-apps/<name>.html`, beside `csr/`. The server reads it for that app's `ui://<app>/apps/<name>` resource. `akan start` writes the views to `.akan/artifact/mcp-apps/` when a host first reads one, and again after a save, without rebuilding the CSR bundle.

- **What a view bundles.** The view bundles the app's page with its `.render()`, `.head()`, `.loading()` and `.guard()` replaced by functions that draw nothing. It therefore carries only the modules the page's `.app()` loads reach.
- **Its root layout.** The view sits under the root layout that renders `System.Provider`. That layout's `McpAppRoot` gives it the theme, fonts and providers, and the `_overrides.tsx` over the page re-skin it as they do the page: one on the root layout's folder, or on a folder above it that holds no layout of its own, wraps that layout as it does on the web, so it also reaches the toasts and approvals the layout draws. A synced lib page, linked under `page/(libs)`, is trimmed like any other.
- **Size.** A host loads one file, so a view inlines every module its loads reach, a `lazy(() => import(…))` included. The view build marks each `const X = lazy(…)` pure, so one that nothing renders — a barrel's, the page's own that only its `.render()` drew, or one an `_overrides.tsx` manifest's import brings in — is dropped with the module it imports. A `lazy()` called anywhere else stays.
- **Names.** An `.app()` name must be a string literal that matches `^[A-Za-z0-9_-]{1,64}$`, on a chain written as the `export default` expression itself; a chain bound to a name and exported as `export default x` or `export { x as default }` fails the build. Two pages that declare one name fail the build, and so do two names that differ only in case, whose files would collide on a case-insensitive disk.
- **Rebuilds.** Views are built aside and moved into place one file at a time, so a host that reads a view while `akan start` rebuilds them gets the previous view or the new one. A file the bundler emits beside a view reaches no host, so it is dropped with a warning.
- A desktop server stage carries `mcp-apps/`. The font pruner keeps a font that only a view references.
