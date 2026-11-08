---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
"@akanjs/language": patch
---

`get_graph` takes `since`, a git revision, and returns the Change Map: the Akan Graph of what changed since HEAD forked from that revision, working tree and untracked files included. Every node, field and edge is marked `added`, `removed` or `changed`. The unchanged nodes a changed one calls, or is called by, stay in as context, and `unmapped` lists the changed files under `apps/` or `libs/` that no node covers. `since: "HEAD"` maps uncommitted work only. A revision git does not know returns a `graph-since-unknown` diagnostic. A revision that starts with `-` also returns it and never reaches git.

- **`AkanGraphDiff.between(base, head)`** in `@akanjs/language` diffs two graphs. `index.graph(readText, { digests: true })` gives each member, query and component a hash of its body text, so an edit inside a method marks it changed and moving it does not.
- **The change types** (`AkanGraphChange`, `AkanChangeMap`) live in `akanjs/common`.
