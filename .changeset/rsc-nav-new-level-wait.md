---
"akanjs": patch
---

Some SSR navigations go to a page under a different layout, such as from an `(app)` group page to an `(auth)` group page. These no longer flash an empty area where the levels below that layout appear. Before, the navigation swapped the screen as soon as the response's first row arrived. A level mounted for the first time then showed its empty Suspense fallback, and React keeps a fallback on screen for at least 300ms, even when the level's content arrives a moment later.

Now such a navigation waits up to 150ms for the response to finish before it swaps the screen, and the previous page stays visible during the wait.
- If the response finishes in time, the new page appears complete.
- If it doesn't, the navigation commits at 150ms and the remaining levels fill in as they stream, as before.
- A navigation between pages under the same layouts doesn't wait, so a `.loading()` page there still shows its loading view right away. Under a different layout, that loading view can now appear up to 150ms later.
