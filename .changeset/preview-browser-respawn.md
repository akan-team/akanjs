---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

A page preview starts a new browser when the one before it died. Bun refuses to start a new browser until a later event-loop turn has reaped the dead one. `akan preview` opens its pages back to back when the app's log socket does not answer. In that case, if Chrome died during one page, every page after it failed at once with `Failed to spawn Chrome (set BUN_CHROME_PATH, …)`. Now a preview whose browser fails to start for any reason other than running out of `startTimeoutMs` waits 100 ms and tries the start once more. A browser that cannot start at all still fails in about 100 ms, now with its own error, such as `Chrome process closed the pipe`.
