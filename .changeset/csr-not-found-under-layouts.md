---
"akanjs": patch
---

A CSR app — a native app's bundle — now draws a not-found page instead of failing. A path no page matches draws under the layouts it sits under, as on the server: the deepest `.notFound()` among them, or a default page with a way back, once those layouts' guards let it in. `router.notFound()` moves to `/404`, which draws the same way. Before, a guard's `router.notFound()` (or a 403 or 404 from a query in a guard) threw `Not found: /en/404` and left the refused page blank, and a push to an unmatched path threw at its caller.
