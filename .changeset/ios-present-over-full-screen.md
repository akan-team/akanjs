---
"akanjs": patch
---

On iOS, the camera, the in-app browser and any plugin controller presented `.fullScreen` through `context.present` now show `.overFullScreen`, so the page keeps its window underneath. `.fullScreen` took the web view out of the window, and iOS then suspended the page's process in the idle jetsam band; on a 4 GB iPhone a camera's memory could end it, which reloaded the page and lost the call's result. A plugin that reads `presentationController` before presenting must set `.overFullScreen` first, since reading it fixes the style; the shell logs a line when that happened.

A native `indexPath` with a query or hash (`/explore?tab=new`) now opens on that page with its query. The dev build used to start on `/en/explore?tab=new?csr=true&…`, and a release bundle opened from a link with a query did the same. Back on the index now leaves the app as it does for an index without a query.
