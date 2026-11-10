---
"@akanjs/devkit": patch
---

`@akanjs/devkit/apiReport/apiReport` renders a package's public API, one report per entry point, from its declaration emit. The akanjs repository now commits that report for `akanjs` and checks it in CI: a removed export or a changed declaration needs a `minor` changeset that says how to upgrade.
