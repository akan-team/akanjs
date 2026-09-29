---
"@akanjs/cli": minor
---

`akan build-desktop` (`akan bd`) builds a mobile target as a desktop app for this computer: a `.app` on macOS, an
app folder on Windows and Linux, signed ad hoc or with the development identity, like `build-ios` after a
production web build against `--env` (default `debug`). The native runtime already built all three; only the
command was missing. Distribution signing, notarization and installers are not part of it.
