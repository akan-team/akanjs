---
"@akanjs/cli": minor
"@akanjs/devkit": minor
---

`akan start-desktop <app>` (alias `sd`) runs a native target as a desktop app on this computer — macOS, Windows or
Linux, whichever it is — the way `start-ios` and `start-android` run it on a phone: a debug build whose pages come
from `akan start` through the dev gateway, so every save shows up, or with `--release` a release build of its own
bundle. It takes `--target`, `--env`, `--release` and `--write`. `NativeApp` accepts the desktop platforms, and
`NativeApp.desktopPlatform()` names this computer's.
