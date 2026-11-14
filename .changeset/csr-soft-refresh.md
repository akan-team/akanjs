---
"akanjs": patch
---

`router.refresh()` in a CSR bundle, which is what a native app runs, no longer reloads the document. It used to call `window.location.reload()`, so the screen went white and the store, scroll position, open modals, form drafts and the agent session were all lost.

Now it works the way the web's refresh does.
- The page on screen runs its async renders again: every layout and page level, and the root layouts, with fresh fetches.
- Each level keeps what it drew until its new render settles, so nothing blanks or falls back to `.loading()`. A component that stays in place keeps its state.
- The route's guards run again. A guard that now refuses moves the router, as it does on a navigation.
- A level whose new render fails shows the failure notice with a retry in its place. The document is not reloaded.
- Pages parked in the stack are left as they are.

Code that called `router.refresh()` in a CSR app to reset client state should reset that state itself.
