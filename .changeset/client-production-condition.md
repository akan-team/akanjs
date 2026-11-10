---
"akanjs": patch
"@akanjs/devkit": patch
---

The framework no longer puts `@akanjs/native/core` on a web page. `isNativeApp()` and the other host checks read the platform the shell writes before the bundle runs, and a native shell still starts core with the page. A file that imports `akanjs/client/native` statically still brings core to every page that reaches it. On the minimal app this takes 15 KB raw (5.6 KB brotli) off the vendor floor and 20 KB raw (6.6 KB brotli) off every route entry. `akan build` also resolves the `production` export condition for the browser, SSR-client, CSR and MCP App view bundles, so a package such as Lexical ships its production build alone. On the minimal app the Agent editor chunk drops from 91 KB to 63 KB brotli. `akan start` is unchanged.
