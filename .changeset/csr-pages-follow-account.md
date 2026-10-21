---
"akanjs": patch
---

A CSR app — a native app's bundle — no longer shows a page it kept for another account. `setAuth` and `resetAuth` now tell the frame, which lets go of the pages it kept off screen for the previous account (the entries kept for going back and every `cache` route), so each is drawn for the new account when it is next shown. It also draws the page under the current one again, so a swipe back shows the new account's page. The page on screen stays as it is until it is left. Before, signing in landed on `cache` routes and back-stack pages as they were drawn while signed out, and a sign-out that did not reload kept the previous account's pages.
