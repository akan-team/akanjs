---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan subspace plan <name>` prints what `akan subspace push` would ship, worked out from the checkout alone — no fetch, no remote, no clone: the apps and the libraries their closure pulls in, the file count, which workspace-root entries are pushed, excluded or left to the subspace's own copy, the root dependencies pruned from its manifest, and anything that would make a push refuse (a branch outside `pushableBranches`, a `bun.lock` resolving from a loopback registry). `--format json` prints the same as data.
