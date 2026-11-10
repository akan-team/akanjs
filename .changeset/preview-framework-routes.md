---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan preview <app> /_akan/studio` opens Studio instead of a 404. Preview added the default locale to every path, and the server routes `/_akan/*` without one, so `/en/_akan/studio` matched no page. A path under `/_akan`, `/__csr`, `/__rsc`, `/.well-known` or the app's API prefix, and a file such as `/favicon.ico`, now opens as written: no locale, and no CSR boot query under `--csr`. A page path still gets the default locale as before. The `akan-debug` skill and the `akan preview` reference say so.
