---
"akanjs": patch
---

A view transition waits for the navigation's flight stream to finish before it starts, capped at one second.

The commit ran as soon as the RSC shell resolved. The page stays behind Suspense until the rest of the stream arrives, and that boundary is keyed by the URL, so the new boundary paints its loading fallback first. The transition snapshotted the fallback: a stack slide played the loader, and the page replaced it as the slide ended. The commit now waits out the stream, or one second, so the snapshot is the page. A route with `transition: "none"` still commits the shell immediately and shows its loading fallback.
