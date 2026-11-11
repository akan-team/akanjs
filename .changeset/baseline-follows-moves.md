---
"@akanjs/devkit": patch
---

A file moved since the fork point keeps its `akan.baseline.json` entries, whether it was moved with `git mv` or a plain rename. The growth check reads the committed entries under the path git pairs the file with, and `--fix` rewrites the working entries there, so moving a recorded file no longer fails as new debt. A move that also rewrote more than half the file, or left a file at the old path, still reads as new, since git no longer sees it as a move.
