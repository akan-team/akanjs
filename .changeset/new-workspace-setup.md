---
"@akanjs/cli": patch
---

A new workspace with the `shared` or `util` library now passes `akan typecheck` and `akan build`: `akan create-workspace` writes `@types/react` and `@types/react-dom` into its devDependencies, and `akan install-library` adds `@types/react-dom` with `shared` and `@types/nodemailer` with `util`, whose `react-dom` and `nodemailer` imports had no declaration file before. Upgrade note: a workspace created earlier adds them with `bun add -d @types/react @types/react-dom`, plus `@types/nodemailer` if it installed `util`.

`akan install-library` now copies a library from the akanjs version the workspace has installed: one shallow clone of its `v<version>` tag, reused for every library in the run. Before, each library took a full clone of the repository's default branch, whose code can need a newer akanjs than the workspace's, and `akan create-workspace` with both libraries downloaded it twice. A version with no tag, such as a prerelease, still installs from the default branch, with a warning naming the version.
