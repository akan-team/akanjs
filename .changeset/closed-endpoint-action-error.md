---
"akanjs": patch
---

A generated store action whose verb the slice leaves closed (`cru: None`, or a verb set to `false`) now fails with `base.error.endpointClosed`, naming the endpoint, instead of `fetch[names.createModel] is not a function`.
