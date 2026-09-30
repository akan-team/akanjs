---
"@akanjs/cli": patch
---

fix: `start-ios`, `start-android` and `start-desktop` follow only their own app's dev server

- A dev server that answered on the app's dev port was taken for the app's, even when it was another app's, and the
  app opened that server's pages. The command now reads the gateway's `/_akan/app/info` and stops with the name of the
  app it found; a port held by something that is not an akan dev server stops it too. A local dev server also names
  its checkout there (`workspaceRoot`), so the same app's `akan start` from another checkout (a worktree) stops it as
  well, with both paths; a dev server of an older akan that names none is still followed.
