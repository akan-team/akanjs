---
"@akanjs/devkit": patch
---

`akan build` and `akan verify` no longer print a `File Create:` line for each file the build writes into its own
output folder (`package.json`, `akan.env.json`, the lockfile, the `Dockerfile`, `akan.build.json`): five lines a
build, one a verify, each naming a file the summary's `Server output:` path already covers. The notice closing a
build for `local` says the same in 209 characters where it took 333.
