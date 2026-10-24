---
"akanjs": patch
---

An endpoint in a model's `endpoint()` that returns `Any`, such as `query(Any)` or `mutation([Any])`, is now typed `unknown` (or `unknown[]`) on the client, in `fetch` and in signal-test agents alike. Before, it was typed as the model's full class, because every model fits `unknown`.
