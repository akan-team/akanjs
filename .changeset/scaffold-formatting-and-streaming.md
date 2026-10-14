---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

The files `akan page` writes, and those of the app and library component and scalar scaffolds, now pass `biome check` as written, instead of starting with a blank line and leaving imports unsorted. The CRUD page scaffolds and the sample app's task pages hand each `fetch.init*` / `view*` / `edit*` result to its section unawaited, so the page shell is sent first and each section fills in behind its own boundary, and the single-page CRUD scaffold gives `Model.New` a `trigger` instead of a `className` it does not take. The conventions guideline's page body rule says the same: await only what the shell reads, through one `Promise.all`. Scaffolds (`akan create-*`, `akan page`, workspace and package templates) format only the files they wrote: an existing file they left alone is no longer reformatted.
