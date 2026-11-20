---
"akanjs": patch
---

A built app's server bundles carry less code they never run. The RSC worker no longer holds `@akanjs/native/core` and the native error report, which `Link.Back`'s tab check pulled in although no shell runs on a server, nor the devtools access check, which the script policy pulled in for its dev-build test (`rscWorker.js` 27 KB smaller on `apps/minimal`). `server.js` loads Akan Studio on the first `/_akan/studio` request instead of at boot, so a server whose devtools are closed parses 37 KB less when it starts. Nothing changes in what a page, the studio or a native shell does.
