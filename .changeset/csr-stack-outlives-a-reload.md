---
"akanjs": minor
---

feat(csr): the page stack outlives a reload, popstate lands on any entry, and the page under the current one pauses
in the background

- **A reload keeps the stack.** The router writes its entries (`href` + `akanEntryId`) to `sessionStorage` on every
  settled navigation and reads them back at boot when the entry the tab reopened on is the one it was on. That
  covers a reload and a WebView whose content process died and reloaded. Only the current and previous entries
  mount; the rest are dormant until visited. Before this, back after a reload changed the address and left the
  page where it was.
- **Popstate lands on the entry it names,** not only a neighbour. A long-press back menu or `history.go(-n)` jumps
  there. An entry the stack never saw (from before a reload that kept no stack, or a hash the browser pushed)
  replaces the current one, in place when the route is the same.
- A popstate whose `hasUAVisualTransition` is set (Safari's own swipe back) skips the frame's back animation, so the
  page does not slide away twice.
- While the document is hidden (the app in the background), the page under the current one pauses its effects as
  well. `RouteState.isBackgrounded` carries it.
- On a macOS desktop shell, ⌘[, ⌘← and the mouse back button go back; a text field keeps ⌘←. WebView2 and the browser
  already do this themselves. `desktopPlatform()` is exported from `akanjs/client/native` beside `nativePlatform()`.
- `useHistory(locations, { idx, dormant })` takes a restored stack, and `setHistoryJump(idx)` moves several entries
  at once.
