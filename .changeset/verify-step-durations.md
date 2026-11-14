---
"@akanjs/cli": patch
---

The `akan verify` header line now gives each step's own duration (`lint 0.7s typecheck 5.0s build 2.0s · 5.8s`), so a slow run shows which step to look at. No line is added.
