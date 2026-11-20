---
"akanjs": minor
---

feat(akanjs): a partial commit renders the page alone on a move that changes only a param or a query value no layout above declares

Under `AKAN_PUBLIC_RSC_PARTIAL_COMMIT=1` a page with `rscPatchHeadSafe: true` was rendered whole whenever any route
param differed, so `/chat/a` to `/chat/b` ran every layout again though none of them reads `channelId`. The server
now compares what each layout above the page declares:

- a layout chain is kept when the `.param()` and `.search()` values it declares are the same for both pages, so a
  move between a page's own paths renders the page level alone, and its `.loading()` shows after one round trip;
- a layout that declares the param that moved (`.param("orgId", …)` on `/org/1/x` to `/org/2/x`) still renders
  whole, as does a legacy layout module (a default function), which receives every param;
- a hover prefetch of such a path renders the page level alone too, since a prefetch already names the page on
  screen.

This also fixes a kept layout drawn from a stale query: a layout that declares `.search("tab", …)` and draws from it
in its body was kept across a `?tab=` change unless its `.head()` changed with it. It now renders whole
(`search-changed`).

The trace reason of a same-route patch is `same-route-page` (was `same-route-search-params`), in the
`X-Akan-Rsc-Partial-Reason` header and the navigation trace.

**Upgrading.** Nothing to change with partial commit off. With it on, a layout above an `rscPatchHeadSafe` page is
no longer rendered again when only an undeclared param moves: one that draws the open row or section on the server
from the request path keeps the old one. Read the path on the client there (`usePathCtx()`, `Link`'s
`activeClassName`), as a sibling-page patch already required.
