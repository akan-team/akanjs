---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

fix: a dev server whose replica crash-loops reports it at once

When an app's `init` threw at every boot, the gateway gave up on the replica and waited for a code change, but the dev
host kept reporting the app as starting: `akan start` showed no reason and held its next wave of apps for 180 s, and
`akan start-desktop` waited 180 s before it gave up. The host now reports the app `failed` with the gateway's message
as soon as it gives up; `akan start` keeps running and shows the app ready again after the fix is saved.
