---
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`akan subspace plan <name>` prints what `akan subspace push` would ship, worked out from the checkout alone — no fetch, no remote, no clone: the apps and the libraries their closure pulls in, the file count, which workspace-root entries are pushed, excluded or left to the subspace's own copy, the root dependencies pruned from its manifest, and anything that would make a push refuse: a dirty working tree, a leftover root `akan.subspace.ts`, a branch outside `pushableBranches`, or a `bun.lock` resolving from a loopback registry, read from `HEAD` (`git show HEAD:bun.lock`) as a push reads it. It exits 1 when any of them is there. `--format json` prints the same as data. `akan subspace push` and `pull` also refuse while a root `akan.subspace.ts` exists.
