---
"akanjs": patch
---

A page whose server render streamed an error after its first byte is no longer replayed from the browser's navigation cache. Before, going back to it or following a link to it showed the same "This page could not be loaded." notice (or a `Load.*` section's failure) again without asking the server, and only "Try again" refetched. Now the next visit, a hover prefetch included, asks the server for the page. This covers the page a document loaded with, a page a navigation fetched, and, with `AKAN_PUBLIC_RSC_PARTIAL_COMMIT=1`, a cached patch. A not-found or redirect raised in the stream still counts as the page's answer and replays as before.
