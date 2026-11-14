---
"akanjs": patch
---

A page render no longer sends the whole client manifest to the RSC worker with every request. The worker process receives a manifest once and each render names it by revision, which takes a burst of cached pages from about 38 ms to about 7 ms at the median on the docs app.
