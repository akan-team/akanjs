---
"akanjs": patch
---

A page cut off by a client that disconnected mid-stream, such as a closed tab, a navigation away or a proxy timeout, is no longer stored in the server's RSC result cache. Before, the truncated render was cached, and the next visitor to that path got a page whose Suspense content never arrived until the entry expired or was invalidated. Now the next request renders the page anew and streams all of it, and a cancel that reaches the RSC worker after its render ended no longer leaves an entry behind that grows the worker's memory for its whole life.
