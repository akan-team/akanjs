---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

fix(akanjs, devkit): the published packages leave their changelogs in the repository

`akanjs` shipped a `CHANGELOG.md` of 677K characters, plus the changelogs of the two packages it embeds, and
`@akanjs/devkit` one of 398K. Nothing in an install reads them, and an agent that opens a package to see what a
version changed pays for the whole file.

- The `akanjs` and `@akanjs/devkit` tarballs no longer carry `CHANGELOG.md`; `akanjs` also leaves out
  `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`. Each README links the file on GitHub.
- `akan verify-akan-publish-packages` fails a package whose tarball would hold a `CHANGELOG.md` at any depth.
