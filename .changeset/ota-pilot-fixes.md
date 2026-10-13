---
"akanjs": patch
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

Fixes for over-the-air updates on a phone, plus the upload commands they were missing.

- **Hung releases:** a release on trial whose page hangs in a script now rolls back while the app runs.
  - The ready timer starts with the page, not when it finishes loading.
  - A page that does not answer gets a fresh renderer: a new web view window on iOS, an ended renderer process on Android.
- **Downloads:** update downloads ask for `*/*`, so a CDN that injects scripts into HTML responses can't change the signed bytes.
- **Inlined dictionary:** the dictionary a build inlines into the client bundle is key-sorted, so the same commit gives the same bytes.
- **`native.devtools: true`:** opens the web inspector of a release build, for an internal test target only.
- **`akan push-update <app> --platform`:** packs an update and uploads it to the Akan Cloud project, which signs and publishes it.
  - The pack goes straight to the project's storage, so a proxy's request time limit can't cut off a large one.
  - It exits 2 when the pack needs a new store build or the project rejects it.
- **`akan register-binary <app> --platform --distribution`:** registers the store build `release-*` made, with a pack of the same commit. It refuses when the two provide different native APIs.
