---
"akanjs": minor
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`router.backOrReplace(href)` closes a page state a push opened, on the web and in a CSR or native stack alike.

A CSR or native stack rewrites a `router.push` that keeps the pathname (only the query or hash changes) instead of stacking it, while the web router stacks it. An overlay opened with `router.push("?ticketId=…")` and closed with `router.back()` therefore closed on the web and left the page in a native app, and the app could only tell the two apart by reading `getEnv().renderMode`. `router.back()` also left the site when the visitor had opened the address directly.

- **`router.backOrReplace(href)`** steps back when the entry under the current one is `href`, and replaces the current entry with `href` otherwise, keeping the scroll position. It looks one entry down, never further. Open the state with `router.push`, close it with `router.backOrReplace(<the address without it>)`: on the web the browser's back still closes it, and in a native app closing stays on the page.
- **How it knows:** every pushed history entry now records the address it was pushed from (`history.state.__akanRouter.from`), and a replace keeps it.

Upgrade: nothing to change. `Router` gains the `backOrReplace` method and `CsrLocation.entry()` gains `from`; a custom `RouterInstance` needs no new member. An app that branches on `renderMode` to choose between `router.back()` and `router.replace()` when closing a query state can call `router.backOrReplace(href)` instead.

The page skill gains three lines on this, so the budget of `akan-page/SKILL.md` is raised.
