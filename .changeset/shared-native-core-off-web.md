---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

An app using the `shared` and `util` libraries no longer loads `@akanjs/native/core` on its web pages. Their stores imported `akanjs/client/native` for `isNativeShell()` and for the push installation id. That put core and every native plugin wrapper on every page. Native SSO and `usePushNotification` now load the plugin they call on first use inside a shell. The `useCamera`, `useGeoLocation` and `usePurchase` hooks in `akanjs/webkit`, which `shared`'s `Field` and `User.Template` reach, import their plugin and the few core exports they use dynamically; `useCamera` fetches them at mount so a web file picker still opens on the tap. On the minimal app with `shared` merged into its store:

- a Link route drops from 148.7 KB raw (38.5 KB brotli) to 101.5 KB raw (23.3 KB brotli);
- a route drawing `Field` drops from 416.6 KB (113.8 KB brotli) to 370.2 KB (99.8 KB brotli);
- a route drawing `User.Template` drops from 526.8 KB (140.2 KB brotli) to 481.2 KB (126.3 KB brotli).

The runtime guideline and the `no-web-only-api-outside-webkit` message now name `akanjs/client` for `isNativeApp()`, and the native subpaths for push and haptics.
