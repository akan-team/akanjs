---
"@akanjs/devkit": patch
---

A production build now writes `route-files.json` into the app's `.akan/cache` directory. It lists every client file with its raw and served size, and the files each route loads, so a heavy route can be traced to its files without patching the CLI. The sizes are the ones the route JS budget counts.
