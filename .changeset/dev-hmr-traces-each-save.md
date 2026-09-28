---
"akanjs": patch
"@akanjs/devkit": patch
---

feat(dev): a dev save now says where its HMR latency went

- Each save carries epoch-ms marks from the file watcher to the page: the first fs event and the watcher's flush,
  the builder picking the batch up, the build worker's spawn, start and imports, the update on disk, the send, the
  backend's broadcast, and the page receiving and applying it. The page keeps the last 64 in `__AKAN_HMR_TRACES__`.
- `AKAN_DEV_WATCH_DEBOUNCE_MS` sets how long the watcher collects changes before it hands a batch over.
