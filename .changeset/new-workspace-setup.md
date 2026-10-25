---
"akanjs": patch
"@akanjs/cli": patch
"create-akan-workspace": patch
---

A new workspace with the `shared` or `util` library no longer fails `akan typecheck` and `akan build` with TS7016, "Could not find a declaration file", for `react-dom` and `nodemailer`: `akan create-workspace` writes `@types/react` and `@types/react-dom` into its devDependencies, and `akan install-library` adds `@types/react-dom` with `shared` and `@types/nodemailer` with `util`. Upgrade note: a workspace created earlier adds them with `bun add -d @types/react @types/react-dom`, plus `@types/nodemailer` if it installed `util`.

`akan install-library` now copies a library from the akanjs version the workspace has installed: one shallow clone of its `v<version>` tag, reused for every library in the run. Before, each library took a full clone of the repository's default branch, whose code can need a newer akanjs than the workspace's, and `akan create-workspace` with both libraries downloaded it twice. A version with no tag, such as a prerelease, still installs from the default branch, with a warning naming the version.

`akan` and `bunx create-akan-workspace` now stop on a Bun older than 1.4.4, the minimum their `engines.bun` declares, with one line asking for `bun upgrade`. Before, nothing checked the running Bun, so an older one went ahead and hit the bugs 1.4.4 fixed.

The `akanjs` peer on `react-server-dom-webpack` is now exactly `19.3.1`, the same pin as `react` and `react-dom`, and `akan create-workspace` writes it that way. Its caret range let a new workspace resolve the first `react-server-dom-webpack` released after 19.3.1, built for a different React than the one it renders with. Upgrade note: pin `react-server-dom-webpack` to `19.3.1` in an existing workspace as well.
