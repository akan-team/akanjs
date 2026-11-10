---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

An app using the `shared` and `util` libraries no longer loads `@akanjs/native/core` on its web pages. Their stores imported `akanjs/client/native` for `isNativeShell()` and for the push installation id, which put core and every native plugin wrapper on every page. Native SSO and `usePushNotification` now load the plugin they call on first use inside a shell. On the minimal app with `shared` merged into its store, a Link route drops from 148.7 KB raw (38.5 KB brotli) to 101.4 KB raw (23.3 KB brotli). The runtime guideline and the `no-web-only-api-outside-webkit` message now name `akanjs/client` for `isNativeApp()`.
