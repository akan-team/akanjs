---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

A desktop app nobody attends recovers its page, relaunches itself and opens as a kiosk

`native.desktop.recovery: "reload"`, for the app or one target, loads a page whose web process ended (a crash, a hang,
out of memory) again, once per end, instead of showing an error page after the second end, waiting longer after each
end in a row (1 s, doubling to a minute). It relaunches the app when the webview's browser process ends, where the app
used to quit: at once the first time, then after 1 s doubling to a minute while each relaunched app dies within a
minute, and after ten in a row it exits with code 1 instead of restarting for good.
`native.desktop.window: { fullscreen, skipTaskbar }` opens the main window borderless fullscreen and without a taskbar
button (Windows, Linux) from its first frame; a plugin's launch phase decides the same per launch with
`ctx.launch.setWindow`. `app.relaunch()` ends the app and starts it again in a new process on the desktop and Android,
and reloads the page on the web; one process starts one new app, however many windows or calls asked for it.
`native.android.autoplay: true` lets media play with sound without a tap first, as it already does on iOS and the
desktop.

An app relaunched by an update on Windows no longer quits the moment it starts when `akan start-desktop` had started
the one before it.
