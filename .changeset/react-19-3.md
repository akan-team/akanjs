---
"akanjs": minor
---

chore(deps): React 19.3 — `react`, `react-dom` and `react-server-dom-webpack` 19.3.0, `react-refresh` 0.19,
`scheduler` 0.28

19.3.0 ships the `pingSuspendedRoot` fix that `patches/react-dom@19.2.7.patch` carried, so the patch and the workspace
template's copy are gone. The vendor shims name 19.3's new exports: `ViewTransition` and `addTransitionType` from
`react`, `browser` from `react-dom`, and the whole `react-refresh/runtime` surface.

**For an existing workspace:** `akanjs` depends on `react` and `react-dom` 19.3.0 exactly, so move any workspace pin to
19.3.0 in the same install — two React copies break every hook. Drop `patchedDependencies["react-dom@19.2.7"]` from the
root `package.json` and delete `patches/react-dom@19.2.7.patch`.
