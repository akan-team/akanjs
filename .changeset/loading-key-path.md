---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

fix(akanjs): a query-only navigation keeps the page drawn instead of remounting it behind its `.loading()`

The leaf page's `.loading()` boundary was keyed by the URL's path and query, so a move that changed only the query (`?peek=`, `?settings=`, a filter) on a page with a `.loading()` showed that skeleton over the whole page and mounted the page anew, dropping every client state under it (a canvas camera, an open menu, a scroll position). The boundary is now keyed by the path alone: a query-only move keeps the page on screen and swaps the new render in place, as a layout already does, and a move to another path still shows the skeleton.
