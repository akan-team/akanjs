---
"akanjs": minor
"@akanjs/devkit": minor
---

A CSR dev page — `?csr=true`, `/__csr`, and every native dev build — updates in place on save instead of reloading.

- `akan start` serves the CSR page as a module registry: each module is its own factory, and a save sends only the
  modules it changed. A component edit keeps hook and DOM state (React Fast Refresh), a store edit keeps the store,
  and a build error shows the overlay and recovers without a reload.
- A page or layout edit swaps that route in place through `replacePages`: the page stack, history and stores stay,
  and so does the state of the components under the edited page or layout. A `*.constant.ts`, an added or removed
  route, a new npm dependency or a signal/dictionary change still reloads.
- `AKAN_DEV_CSR=artifact` brings back the single-file dev bundle, which reloads on every save. `akan build` and a
  release mobile build are unchanged.
- HMR sockets now say what they are: a CSR page connects as `/_akan/hmr?client=csr` and gets `csr-update` instead of
  the SSR `reload` and `rsc-refresh`, and a page that missed an update while disconnected reloads
  when it reconnects.
