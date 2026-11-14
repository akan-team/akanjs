---
"akanjs": patch
---

A page render no longer sends the whole client manifest to the RSC worker with every request. The worker process receives a manifest once and each render names it by revision, which takes a burst of cached pages from about 38 ms to about 7 ms at the median on the docs app.

A page the RSC worker has cached replays as one message instead of one message and one timer wait per chunk: a cached page of the docs app answers in about 0.3 ms instead of 4.7 ms.

A render that produces many small chunks at once sends them as a few messages of up to 32 KB. A page still waiting on data sends what it has rendered at once, as before.
