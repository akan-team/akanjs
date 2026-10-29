---
"@akanjs/devkit": patch
---

The warning `akan` prints when its own version differs from the workspace's installed `akanjs` now names a command that fixes it: the same command run through the matching CLI (`bunx -p @akanjs/cli@<akanjs version> akan …`, or `bunx akan …` when the workspace pins that CLI), plus `akan update` when the CLI is the newer one. Before, it always suggested `akan update`, which installs the newest release of a tag and could not bring an older CLI in line. It no longer prints for `akan update`, `akan create-workspace`, `--help` or `--version`, and it skips a workspace that links `akanjs` from its own source.
