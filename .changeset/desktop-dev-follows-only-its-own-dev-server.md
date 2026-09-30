---
"@akanjs/cli": patch
---

fix: `start-desktop --server`, `start-ios` and `start-android` follow only their own app's dev server

- A dev server that answered on the app's dev port was taken for the app's, even when it was another app's (another
  checkout's `akan start` on the same port, say), and the app opened that server's pages. The command now reads the
  gateway's `/_akan/app/info` and stops with the name of the app it found; a port held by something that is not an
  akan dev server stops it too.
- Ctrl+C on `start-desktop --server` stops the app, then the dev server it started, then the local database, one after
  another instead of all at once, and exits 130 as it does without `--server`.
- `publish-update --platform android|ios --server` stops before it builds anything: only a desktop app carries its
  server.
