---
"akanjs": patch
---

A client navigation in an SSR app shows the not-found view the server renders for it. When a route guard or a `.param()` type refused the page, the page called `router.notFound()`, or no page matched the path, the server sent the nearest `.notFound()` view, but the client dropped it: the visitor stayed on the page they were leaving, with only a console error. The URL now moves and the view shows. It is never cached, so a later visit asks the server again.

In an SSR app, a back or forward move that keeps the page on screen, and a shallow `router.push` or `router.replace`, now cancel a navigation still loading. Before, the page that was loading replaced the entry the visitor had just moved to.

In an SSR app, a push that the server answers with a redirect, a route guard's for one, keeps the page it left in history, so back returns to it, as it does after a document navigation or in a CSR app. Before, the redirect's target replaced the page being left.

A `.head()` that calls `router.notFound()` renders the nearest `.notFound()` view under its layouts' head, instead of the built-in 404 page. Every not-found view that stands in for a refused page now carries only its layouts' head, not the page's own.

In an SSR app, `router.canGoBack()` stays true after an in-page `#anchor` link, so `Link.Back` and `router.backOrFallback()` go back instead of taking their fallback. Moving between a page's anchors no longer asks the server for the page again.

A CSR app — a native app's bundle — keeps the pages it holds off screen when `setAuth` hands it a token refreshed for the same account. It compares the account the token names, not the token, so a refresh no longer draws the back-stack and `cache` pages again and loses their state. Signing in as another account still does.

In a CSR app, `router.push`, `router.replace` and `router.redirect` to an explicit http(s) URL now load it, a replace or redirect in place of the current history entry, and an iOS or Android app opens it in its in-app browser, as `Link` does. Before, the app drew its not-found page and then threw a `SecurityError`.
