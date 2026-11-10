---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan preview` and the code agent's page preview bound a page only once the browser is up. Starting the browser has its own bound of 120 s, and running out of it reads `Timed out starting the chrome browser.` Before, a process's first page shared its `timeoutMs` with spawning Chrome, so a cold machine that took longer than that to start Chrome failed the first page as `Timed out loading …; the dev server may be rebuilding or stuck.`, and every later page passed.
