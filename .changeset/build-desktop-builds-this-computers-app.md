---
"@akanjs/cli": minor
---

`akan build-desktop` (`akan bd`) builds a native target as a desktop app for this computer: a `.app` on macOS, signed
ad hoc or with the development identity, and an unsigned app folder on Windows and Linux, like `build-ios` after a
production web build against `--env` (default `debug`). The native runtime already built all three; only the
command was missing. Distribution signing and notarization are not part of it yet.
