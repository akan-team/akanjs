---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan verify`'s SSR check now reads only the apps and libs with a changed `.tsx` file, plus every lib's signals, instead of running the whole-workspace quality scan, so it takes a fraction of the time and reports the same warnings. `AkanQualityScanner` gains `scanSsr(workspaceRoot, dirs)` for this; `akan quality` still scans the whole workspace.
