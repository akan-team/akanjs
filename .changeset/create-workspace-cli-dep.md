---
"@akanjs/cli": patch
---

`akan create-workspace` now puts `@akanjs/cli` in the new workspace's `devDependencies`, at the version it was made with. Before, the workspace had no local `akan` bin, so `bunx akan …` in a fresh clone fetched and ran the unrelated npm package named `akan`. `akan update` now moves `@akanjs/cli` together with `akanjs` and `@akanjs/devkit`. An existing workspace can add it by hand: `bun add -d @akanjs/cli@<its akanjs version>`.

`--dir` is now resolved against the current directory instead of joined onto it, so an absolute `--dir /abs/path` creates `/abs/path/<name>` and no longer `<cwd>/abs/path/<name>`. The workspace name is still appended. The messages at the end print the workspace's absolute path.
