---
"@akanjs/devkit": patch
---

perf(dev): a CSR patch reaches the tabs before its module files and graph.json are written

The dev registry announced a patch only after writing each changed module's file and the whole `graph.json`, which
only the next build reads. The patch file and the manifest now go first, and the rest follows the announcement; a
build that dies in between recompiles those files on its next run, since their mtimes no longer match the graph. The
dev entry also stopped parsing every page with TypeScript on each save to see whether its default export is async:
the result is kept per file until the file changes. On apps/akan a component save now reaches the tabs 72ms after the
builder picks it up, down from about 200ms.
