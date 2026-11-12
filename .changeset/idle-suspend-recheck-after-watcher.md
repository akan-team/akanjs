---
"@akanjs/devkit": patch
---

A dev server about to idle-suspend now decides again once its idle watcher has started, and stays awake if a builder request or builder message came in while the watcher was starting, or if the builder or backend stopped being ready. It used to release the builder anyway, so a `build-graph` or route request sent in that window waited for the next wake or failed. A dev file watcher stopped in the middle of a scan no longer reports what that scan found, which the next idle wake used to replay as a stale change.
