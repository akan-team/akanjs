---
"@akanjs/cli": patch
---

Release candidates now publish from CI with npm provenance. Each push to the `rc` branch runs the CI suite, then publishes the next `<version>-rc.N` of the version the pending changesets will release, and tags that commit `v<version>-rc.N`, so `akan install-library` on an rc copies the libraries from the commit it was built from. Stable releases are still published by hand.

- **`akan deploy-akan --prerelease <id>`** publishes the next `<version>-<id>.N` under the `<id>` dist-tag, even when the packages carry a stable version. It refuses a version npm has already released, because its prerelease would sort below it.
- **`akan deploy-akan --yes`** publishes without the confirmation and without `npm login`, with the credentials npm already has.
