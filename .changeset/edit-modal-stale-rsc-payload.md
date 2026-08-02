---
"akanjs": patch
---

fix(ui): refresh EditModal when the hydrated edit payload is stale

RSC navigation can replay a cached page tree, and an edit shell hydrated from that payload can show
arbitrarily old form data. EditModal now treats a cache replay (or a `modelViewAt` older than 60s) as
stale and refetches via `edit<Model>` while keeping the modal open on the last known id.
