---
"@akanjs/devkit": patch
---

A dev server that stops no longer re-arms its idle-suspend timer or keeps a file watcher running. A wake that settles after the stop, a builder message or relayed request that arrives after it, and an idle watcher that finishes starting after it each used to re-arm the timer, report the host awake, or leave the watcher open. A request that reaches a host stopped while suspended is now refused at once instead of being held for a wake that never comes.
