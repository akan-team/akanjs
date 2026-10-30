---
"akanjs": patch
---

Two fixes to how a desktop app rolls back a release whose carried server gave up.

The app now quits when it rolls back. Before, the app could roll back before its window opened, while it was still waiting on its server. Any quit requested in that phase (`app.exit()`, a plugin's `ctx.quit()`, or the rollback's own) was dropped. So the app stayed open behind the server's give-up alert, and the previous release came back only once someone pressed OK. A quit requested before the window exists now ends the app as soon as it starts, with the code it was given.

The app also no longer puts back the release it just rolled back. Until the app restarts, `getState().trial` stays true, `check()` answers `available: false`, and `download()` and `apply()` reject `NOT_ALLOWED`. Before, a page calling them in that window saw the rolled-back release as newer than the binary it was built from, and `apply()` moved it back into place. A release built from the running binary is no longer offered as newer, even when no trial or current entry names it.
