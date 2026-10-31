---
"akanjs": patch
---

A macOS desktop app no longer takes minutes to download an update while its window is hidden or covered. About 30 to 50 seconds after nobody looks at an app, macOS App Nap drops its threads to background priority. On a busy Mac, an 80 MB update then took minutes to download, unpack and check, instead of seconds. `download()` now holds an App Nap activity until it ends: the native shell's new `activity.begin` / `activity.end` ops, which allow idle system sleep. Measured with every core busy, the same download took 106 s napped and 3.4 s held.
