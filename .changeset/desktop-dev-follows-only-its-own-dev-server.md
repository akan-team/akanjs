---
"@akanjs/cli": patch
---

fix: `start-ios`, `start-android` and `start-desktop --server` follow only their own app's dev server

- A dev server that answered on the app's dev port was taken for the app's, even when it was another app's, and the
  app opened that server's pages. The command now reads the gateway's `/_akan/app/info` and stops with the name of the
  app it found; a port held by something that is not an akan dev server stops it too. Only the app's name is compared,
  so the same app's `akan start` from another checkout is still followed.
- `publish-update --platform android|ios --server` stops before it builds anything: only a desktop app carries its
  server.
