---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan verify` now typechecks a workspace package incrementally, keeping the cache under the workspace's git-ignored `.akan/typecheck/pkgs/<package>/`, so a second run over an unchanged package takes about as long as its lint instead of a full typecheck.
