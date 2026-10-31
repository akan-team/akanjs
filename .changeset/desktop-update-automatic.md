---
"akanjs": patch
---

A desktop app now updates itself by default, as a phone does. About 30 seconds after it starts, and every hour after that, it looks for a release on its channel and downloads it in the background. When the app quits, the download is moved into place without a relaunch. The next launch runs it on trial, so a release that fails still rolls back. A quit while a release is on trial installs nothing, and a debug build never updates itself.

Set `native.updates.automatic: false`, or a target's `updates.automatic`, to leave checking, downloading and applying to the app's own `updates` calls, as before. A phone takes new web bundles by itself either way.

`updates.download()` called while a download runs, including the app's own background one, now answers with that download instead of rejecting with `CANCELLED`. On Windows and Linux an app without single-instance can run more than once; only one running copy updates by itself.
