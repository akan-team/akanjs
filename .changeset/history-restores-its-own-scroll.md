---
"akanjs": patch
---

A back or forward move in an SSR app lands where the page was left. The RSC client re-renders the entry it moves to inside `popstate`, which React commits synchronously, so a long page replaced by a shorter one was clamped to the shorter page's bottom, and only the browser's own restoration, run after the event, moved it back. WebKit does not save the offset of an entry `pushState` leaves once the page has loaded, and skips the step after a user scroll, so in Safari the page could stay at the bottom. The client now keeps each entry's offset (in its history state, so a reload or a document loaded back into the entry restores it too), restores it in the commit that shows the page, and holds it while images and streamed sections size themselves; entries it has left are `history.scrollRestoration = "manual"`.
