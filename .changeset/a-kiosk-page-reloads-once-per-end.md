---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

With `native.desktop.recovery: "reload"`, a page that keeps reporting itself unresponsive while its reload waits no
longer starts a second, longer wait and reloads the recovered page again.
