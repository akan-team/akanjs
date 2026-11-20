---
"akanjs": minor
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

feat(akanjs): an SSR navigation in flight can be read, with `usePendingNavigation()` and `pendingClassName` on `Link`

Between a press and the page it loads, an app could tell that a navigation was running only by comparing the
store's path with the path its server render was handed. Two readings of it are now public:

- `usePendingNavigation()` from `akanjs/client` answers `{ href, pathname, path, searchParams }` for the location
  being loaded, from the press until its page is drawn, and `null` otherwise. A redirect moves it to where it leads.
- `Link` takes `pendingClassName` and carries a `data-pending` attribute for the same span, on a link the loading
  page would make active (`activeExact` and `activeMatch` apply as they do to `activeClassName`).

`activeClassName` following the press, not the commit, is now documented and tested as the contract. After a
navigation the server redirected, the store's `pathname`, `path` and `searchParams` follow where the redirect leads;
they stayed on the address that was pushed.

A CSR or native stack moves at once and never reports a pending navigation.

**Upgrading.** No code change is needed. A component that derived "loading" from the store's path differing from a
server-rendered prop can read `usePendingNavigation()` instead.
