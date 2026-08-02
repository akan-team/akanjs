---
"akanjs": minor
---

feat(devkit): sync lib `page` trees into apps and honor `pageConfig.devOnly`

Apps can opt in with `syncPageLibs` (`true` / lib list) so `akan sync` links each lib's routes under
`page/(libs)/(<lib>)` — once per basePath when the app has subRoutes. The link is generated and
gitignored; the lib source stays the edit target. Collision on the resolved route pattern is a
sync-time error.

`pageConfig.devOnly: true` (literal only) keeps a route out of `akan build` while `akan start` still
serves it. On a `_layout` it excludes the whole subtree. Symlink-aware file ops avoid wiping a synced
lib when cleaning an app link, and dangling lib links no longer break `getApps`.
