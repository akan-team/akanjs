---
"akanjs": minor
---

feat(csr): every history entry is a page of its own, the stack keeps three hidden entries, and a dev server can swap
route modules in place

The CSR frame rendered one container per route pattern. A push to the route on screen (`/item?id=1` → `/item?id=2`)
re-rendered the same page with new arguments: nothing sat under it for a swipe back, and going back handed the
first entry the second one's state.

- **A page container is a history entry.** A push mounts a new page over the old one, which waits under it with its
  state. A replace within one route keeps the entry, so the page updates in place. A `cache` route is still one page
  for the whole session.
- **The stack keeps the three nearest entries below the one a swipe back reveals,** mounted and hidden (their effects
  stopped), so going back shows each with its state. Older entries are released and mount again on back, with
  their scroll restored.
- `window.history` entries carry `{ akanEntryId }`, and popstate matches on it (falling back to the href), so two
  entries with one address are told apart.
- Frame slot targets are per entry too: `<slot>Content-<key>`, with the key in `pathContext.pageKey`. `Navbar`,
  `TopInset`, `TopLeftAction` and `BottomInset` portal into their own page's target, and a page container is
  `#pageContainer-<key>` with `data-path`.
- **`usePageLocation()`** (`akanjs/webkit`) is this page's own `{ pathname, params, searchParams }`. `st.use.*` follows
  the page on screen, so a page being prepared read the previous page's `?filter=`. `Data.ListContainer` and
  `Data.Dashboard` now seed from their own page.
- **`replacePages(context)`** (`akanjs/webkit`) rebuilds the route table from new route modules while history,
  mounted pages and stores keep going. It resolves `false` when the set of modules changed, which needs a reload.
  The table itself moved to `CsrRouteTable`, which `bootCsr` now boots.
- Same-route navigation now replays the enter animation and resets the spring after back, since both follow the
  entry rather than the pathname.
