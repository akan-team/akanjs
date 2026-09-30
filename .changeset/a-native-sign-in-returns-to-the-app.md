---
"akanjs": minor
"@akanjs/devkit": patch
---

A native app can sign in through the system browser and hear the callback on every desktop OS.

- `akanjs/client/native` exports `authSession` and its `AuthSessionApi` type, the runtime's system-browser sign-in,
  and `isNativeShell()`, true in any native shell; `isNativeApp()` stays iOS and Android only.
- `getServerOrigin()` in `akanjs/base` is the server's origin as a browser outside the page opens it. For a page the
  native dev gateway served, that is the dev server (`http://localhost:<dev port>`), not the app origin the page
  calls; otherwise it is the origin of `getEnv().serverHttpUri`.
- A native dev build on Android reverses the dev server's port as well as the gateway's, so a browser on the device
  reaches it.
- A target with `deepLinks.schemes` ships `single-instance`. Windows and Linux open a link by starting the app again,
  and the hand-over is how the link reaches the running app. A second launch of such an app now hands over and exits
  instead of opening a second window, and a desktop debug build keeps the release app id, so it does the same while
  the release app runs.
- In an app with basePaths whose only target names none, `start-*` and `build-*` without `--target` ask for a basePath
  instead of opening the root, which has no CSR page.
