---
"@akanjs/devkit": patch
---

fix: a mobile target's dev build has its own output folder

`akan start-ios`, `start-android` and `start-desktop` without `--release` built into the same
`.akan/mobile/<target>/native/<platform>` as `build-ios`, `build-android`, `build-desktop` and `--release`, so a dev
session deleted the release build there, a desktop installer included, and put a dev build under its name. Dev builds
now go to `.akan/mobile/<target>/dev/<platform>`; the first dev session after the update builds from scratch once.
