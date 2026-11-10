---
"@akanjs/cli": patch
"@akanjs/vscode": patch
---

`akan deploy-akan --registry npm` now also releases the editor extension. Once npm has the packages, it asks the `vscode-publish` workflow to publish the extension from the released commit, numbered `<major>.<even minor>.<run number>`, the even line under the pre-releases from `rc`. When that commit is not on `main` yet, or `pkgs/@akanjs/vscode` holds uncommitted changes, it prints the command to run after pushing instead. A push to `main` no longer publishes the extension, and neither channel publishes a build whose files match the version it last published there.
