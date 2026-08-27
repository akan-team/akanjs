---
"akanjs": patch
---

Allow the documented wsConnect root-layout export: the route source validator's root-layout export set was missing wsConnect (the runtime, generator, and docs all support it), and the runtime route tree builder now grants root-layout exports to user-authored base-path root layouts (page/<basePath>/_layout.tsx) instead of only the internal generated leaf.
