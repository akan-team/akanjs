---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
"@akanjs/language": patch
---

`get_graph` takes `since`, a git revision, and returns the Change Map: the Akan Graph of what changed since HEAD forked from that revision, working tree and untracked files included. Every node, field and edge is marked `added`, `removed` or `changed`. The unchanged nodes a changed one calls, or is called by, stay in as context, and `unmapped` lists the changed files under `apps/` or `libs/` that no node covers, each marked the same way. `since: "HEAD"` maps uncommitted work only. Files `.gitignore` covers stay out, a renamed file reads as removed and added, and a CRLF checkout of an unchanged file reads as unchanged. A revision git does not know returns a `graph-since-unknown` diagnostic, and so does one HEAD shares no commit with (a shallow clone, say) instead of comparing with its tip. A revision that starts with `-` also returns it and never reaches git.

- **`AkanGraphDiff.between(base, head)`** in `@akanjs/language` diffs two graphs. `index.graph(readText, { digests: true })` gives each member, query, component and field a hash of its body text, so an edit inside a method, or to a field's options, marks it changed and moving it does not.
- **The change types** (`AkanGraphChange`, `AkanChangeMap`, `AkanChangedFile`) live in `akanjs/common`.
