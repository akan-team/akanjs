---
"akanjs": patch
---

With partial RSC commit on (`AKAN_PUBLIC_RSC_PARTIAL_COMMIT=1`), a page reached by a patch is now replayed from the browser's cache on a revisit, even after a full navigation in between. Before, every full navigation dropped every cached patch, so a section change made every page of the section before it a network fetch again.

- **A cached patch remembers the full render it went under.** It is replayed only while that same render is on screen, which is the case when a navigation brings that page back from the full-page cache, a not-found view in between included.
- **It is never laid under other layouts.** A patch is refetched, never replayed, under another route group's layouts or another locale's at the same URL prefix. The same goes for a new render of the page it went under, for example after that page left the full-page cache or was asked for again with a fragment.
- **The cache stays bounded at 32 entries.** A patch whose full render can no longer come back is dropped. `clearRscNavigationCache()`, `refreshRsc()`, an HMR refresh and an account change still drop every cached patch.
- **The default is unchanged.** Partial commit is still off unless the flag is set.
