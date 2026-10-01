---
"akanjs": minor
"@akanjs/devkit": minor
---

A native platform section takes its own `indexPath`

`ios.indexPath`, `android.indexPath` and `desktop.indexPath` win over the section's (or the target's) `indexPath` on
that platform, so one target opens the phones on `/mobile` and the desktop app on `/` with no `--target`. It moves
both the dev build's first page and the `indexPath` a release bundle carries.
