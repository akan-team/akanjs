---
"@akanjs/cli": patch
---

fix: `start-ios`, `start-android` and `start-desktop` see a dev server that is still rendering its first page

They probed the dev server by fetching its root path, which waits for a cold page render. On a Windows VM that took
longer than the probe's 3 s, so the command said no dev server answered while `akan start` was up. The probe reads
the gateway's own `/_akan/app/health` instead.
