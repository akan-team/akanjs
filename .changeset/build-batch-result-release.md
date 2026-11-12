---
"@akanjs/devkit": patch
---

The dev build batch worker now waits for the runner to take its result before exiting, so a result can't be lost however fast the worker finishes. In the tests, workers that exited within milliseconds of starting could lose everything they sent and be reported as crashed.
