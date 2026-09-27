---
"@akanjs/devkit": minor
---

Three grit rules keep app and lib code off the browser APIs that behave differently inside a native app, and each
message names what to use instead.

- `no-document-cookie` (error): an `app://localhost` page on iOS, macOS and Linux keeps no cookies, so
  `document.cookie` reads empty and drops writes in the app. Use `getCookie` / `setCookie` / `removeCookie` from
  `akanjs/client`.
- `no-web-storage` (error): `localStorage` / `sessionStorage` work in the shells but bypass the store akanjs picks
  per platform and throw during SSR. Use `storage`, or `secretStorage` for credentials, from `akanjs/client`.
- `no-web-only-api-outside-webkit` (warning): `navigator.share` / `canShare`, `navigator.serviceWorker`,
  `Notification.requestPermission` / `.permission`, `navigator.geolocation` and `navigator.vibrate` belong in a
  `webkit/` hook that branches on `isNativeApp()`.

The first two apply to `apps/**` and `libs/**` outside tests, the third to the same files outside `webkit/`.

**Breaking for a workspace that reads Web Storage or cookies directly:** `akan lint` now fails there. Move the
call to the `akanjs/client` helpers, or keep it with `// biome-ignore lint/plugin: <reason>`.
