---
"@akanjs/devkit": minor
---

`akan build` writes one single-file view per `.app()` to `mcp-apps/<name>.html`, beside `csr/`. The server reads it for that app's `ui://<app>/apps/<name>` resource. `akan start` writes the views to `.akan/artifact/mcp-apps/` when a host first reads one, and again after a save, without rebuilding the CSR bundle.

- **What a view bundles.** The view bundles the app's page with its `.render()`, `.head()`, `.loading()` and `.guard()` replaced by functions that draw nothing. It therefore carries only the modules the page's `.app()` loads reach.
- **Its root layout.** The view sits under the root layout that renders `System.Provider`. That layout's `McpAppRoot` gives it the theme, fonts and providers.
- **Size.** A host loads one file, so a view inlines every module its loads reach, a `lazy(() => import(…))` included. A barrel with a top-level `lazy()` call brings along the module it imports. Write `/* @__PURE__ */ lazy(…)` to let the bundler drop one that nothing uses.
- **Names.** An `.app()` name must be a string literal. Two pages that declare one name fail the build.
- A desktop server stage carries `mcp-apps/`. The font pruner keeps a font that only a view references.
