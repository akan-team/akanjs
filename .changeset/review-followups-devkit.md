---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan update` waits until each package's document lists the version, and a route's `syncPageLibs` mistakes are refused by name.

- **`akan update`** already waited for the version and the tarball of every package of a release. It now also asks the package document an install resolves from, which can list a version minutes after the version's own document answers. The rc publish job waits for the same, and for the dist-tag.
- **`routes[].syncPageLibs`**: two routes of one `basePath` that set different values are refused, an unknown lib in a route's list is reported with the route's `basePath`, and the app's own list is checked even when every route overrides it.

Upgrade: nothing to change, unless `akan.config.ts` carries one of the mistakes above, which `akan sync` now reports.
