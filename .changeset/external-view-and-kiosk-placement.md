---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

The `external-view` native plugin (`akanjs/client/native/external-view`) shows a third-party page first-party over a desktop window: a browser profile of its own, navigation held to the origins it was opened for, an init script for the top document, `evaluate`, a trusted `sendKey`, `capture` of its content, `setMuted`, `clearData`, autoplay with sound by default, and `load` / `loadFailed` / `gone` (it reloads, and is rebuilt when its browser process ends, counting `restarts`) / `consoleMessage` (warn and up by default, with source and line, rate-capped) events — every method on Windows, most on macOS 14+. The `window` plugin adds `placeOnDisplay({ display | index, bounds, unit: "logical" | "physical", fullscreen })`, `setDecorations`, `setCursorVisible`, `setMinSize` and `create({ frameless })`, and `native.desktop.window.frameless` opens the main window without a frame. `AkanServer.start({ schedules: false })` runs no internal.
