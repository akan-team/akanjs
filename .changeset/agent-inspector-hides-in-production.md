---
"akanjs": patch
---

Hide `Agent.Dock` and `Agent.Context` in production.

Both are a developer inspector — they list every published tool, can run one by hand, and preview the turn snapshot. A layout that mounts them would have shown that to every visitor on `AKAN_PUBLIC_ENV=main`. They still render on local, debug, develop, and testing.
