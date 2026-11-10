---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan preview` opens `/openapi.json` and `/mcp` as written, as the server mounts them outside `/:lang`; before, they got the default locale and opened a 404 page. `sitemap.xml` is kept as written only at the root, the one place the server answers it, so `/blog/sitemap.xml` gets the default locale like any other page path; `manifest.webmanifest` under a base path still opens as written. A screenshot's file name now carries the page's query, so `/_akan/studio?view=runtime` and `?view=signals` save `_akan-studio.view-runtime.png` and `_akan-studio.view-signals.png` instead of one overwriting the other. The `akan-debug` skill, `akan preview --help` and the `akan preview` reference list the paths that open as written.
