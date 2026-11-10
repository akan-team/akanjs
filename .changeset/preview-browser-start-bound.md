---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan preview` and the code agent's page preview bound a page only once the browser is up. Before, a process's first page shared its `timeoutMs` with starting the browser. On a cold machine where Chrome took longer than that to start, the first page failed as `Timed out loading …; the dev server may be rebuilding or stuck.`

Starting the browser now has its own bound of 120 s, `startTimeoutMs` on `PreviewView.probe`. Running out of it reads `Timed out starting the <engine> browser after 120 s.`, where the engine is `chrome` or `webkit`. Every later page in that process then fails with the same error at once, without waiting again. So a browser that never starts holds the first page for 120 s, where before it held it for `timeoutMs` (60 s for `akan preview`, 30 s for the code agent's check).
