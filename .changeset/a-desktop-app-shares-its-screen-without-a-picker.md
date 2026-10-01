---
"akanjs": minor
"@akanjs/devkit": minor
---

A Windows desktop app can share its screen without the picker

`native.desktop.screenCapture: "auto"` in `akan.config.ts`, or `desktop.screenCapture` on one target, makes the
Windows app answer the page's `getDisplayMedia()` with the first screen at once, without the picker and without a user
gesture, for remote support on a screen nobody attends. It is Chromium's switch for automated media tests and covers
every media request, so leave it off in an app whose pages ask for a camera or a microphone. The default `"picker"`
keeps the picker; macOS and Linux ignore it.
