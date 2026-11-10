---
"akanjs": patch
---

With `AKAN_PUBLIC_RSC_PARTIAL_COMMIT=1`, a Link prefetch now carries the router state, so a prefetched sibling page comes back as a patch. A prefetched patch is used only under the full commit it was requested from, and a link the patch cache would replay is no longer prefetched.
