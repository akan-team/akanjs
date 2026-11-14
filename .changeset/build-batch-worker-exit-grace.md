---
"@akanjs/devkit": patch
---

The dev builder now uses a build batch's result once the worker has sent it, and ends a worker that is still running half a second later. Before, if the release never reached the worker, as may happen with Bun on Windows, each batch waited up to 5 s for the worker to exit before its result was used.
