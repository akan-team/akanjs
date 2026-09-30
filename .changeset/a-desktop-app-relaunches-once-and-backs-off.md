---
"akanjs": patch
---

fix: a desktop app relaunches once, backs off when relaunching does not help, and applies updates on Windows

- The webview's browser process ending in an app with several windows, or a page calling `app.relaunch()` twice,
  started as many new apps. A process now starts one.
- `native.desktop.recovery: "reload"` relaunches at once the first time, then waits 1 s doubling to a minute while
  each relaunched app dies within a minute, and stops after ten in a row instead of restarting the app every few
  seconds for good.
- On Windows an app started from its install folder (the installer, the Start menu, Explorer) could never apply an
  update or roll one back: Windows renames no folder that is a process's working folder, and the app, its webview
  and the update helper all ran in it. The app moves to its local data folder before the webview starts, and the
  helper and the app it starts run elsewhere.
- An update confirmed on Windows sets the version Settings > Apps shows for an app the installer put there.
- A relaunched app no longer puts its `bin` folder on `PATH` twice.
