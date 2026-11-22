---
"akanjs": minor
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

feat(akanjs): a CSR navigation in flight can be read too, with `usePendingNavigation()` and `pendingClassName`

`usePendingNavigation()` answered `null` throughout in a CSR app, and a `Link` rendered on a CSR stack took
`pendingClassName` without applying it. A CSR move is now pending from the press until the frame has drawn the page
it commits: a page that slides in once it is on screen, showing its `.loading()` if its layers are still loading, and
a page switched in place once it takes the screen. A newer move takes its place, and Back or a move to the page on
screen ends it. As under SSR, a page the browser already holds is never pending: one the stack keeps, and one with no
async layer or guard, which is drawn as it mounts. On a CSR stack, `usePendingNavigation().path` leaves the basePath
out, as `usePage().path` does.

A partial commit (`AKAN_PUBLIC_RSC_PARTIAL_COMMIT=1`) ended its navigation as it handed the new page to React, a
frame or more before the page was drawn, so a skeleton read from `usePendingNavigation()` dropped back to the page
being left. It now ends once the page is drawn, as a whole page's commit does.

**Upgrading.** Nothing to change. A CSR app that tracked its own loading state for links or a progress bar can read
`usePendingNavigation()` or `pendingClassName` instead.
