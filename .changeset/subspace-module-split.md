---
"@akanjs/devkit": minor
---

`@akanjs/devkit/subspace` keeps the push and pull flow; its report text moved to `SubspaceReport` (`@akanjs/devkit/subspaceReport`) and its work on a subspace's clone to `SubspaceClone` (`@akanjs/devkit/subspaceClone`).

Upgrade note: code that imported these from `@akanjs/devkit/subspace` reads them from the new modules:

- `formatSubspaceStatuses`, `formatSubspacePushResults`, `formatSubspacePullResult`, `formatSubspaceEnvUpload` and `formatSubspaceDiff` are `SubspaceReport.statuses`, `.pushResults`, `.pullResult`, `.envUpload` and `.diff`.
- `Subspace.anchorFile`, `memberDirs`, `subspaceOwnedDirs`, `secretsMarkers` and `holdDir` are static fields of `SubspaceClone`.
- `Subspace.workspaceOnlyEntries` is gone; `Subspace.retiredConfigFile` names the file a subspace never receives.
