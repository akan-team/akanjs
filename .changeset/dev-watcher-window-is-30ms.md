---
"@akanjs/devkit": patch
---

perf(dev): a save starts building 50ms sooner

The dev file watcher collected changes for 80ms before handing a batch over, the largest fixed wait in a save once the
build is fast. It now waits 30ms. Measured on minimal, a CSR component save went from 340ms to 278ms, and a second write
30ms after the first (a format-on-save) still produced one update, because the build reads the file's latest content.
`AKAN_DEV_WATCH_DEBOUNCE_MS=80` restores the old window.
