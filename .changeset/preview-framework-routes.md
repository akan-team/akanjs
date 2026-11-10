---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan preview <app> /_akan/studio` opens Studio instead of a 404. Preview added the default locale to every path, and the server routes `/_akan/*` without one, so `/en/_akan/studio` matched no page. A path under `/_akan`, `/__csr`, `/__rsc`, `/.well-known` or the app's API prefix, a file the app's `public/` holds, and the server's own `/favicon.ico`, `/robots.txt`, `sitemap.xml` and `manifest.webmanifest` now open as written: no locale, and no CSR boot query under `--csr`. Every other path, including one that already starts with a locale or ends in a dotted segment such as `/release/1.2.3`, is a page and gets the default locale as before. The `akan-debug` skill and the `akan preview` reference say so.
