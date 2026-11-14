---
"use-agentic": minor
---

A context block can say that its text is someone else's, and a turn sent with one asks before the next change.

- **`ContextBlock.untrusted`.** A host's `buildContext` marks a block `untrusted: true` when it holds text someone other than its developer or the user may have written, such as a record's title. A backend fences such a block as page content (`WIRE.md`).
- **A turn sent with a marked block counts as a `taint: "source"` read.** The first change after it pauses on `pendingApproval`, whatever the tool's own `confirm` says, until the user approves a call. The same marked text on a later turn does not ask again; changed text does. `askAfterUntrusted: false` turns this off with the rest of the rule.
- **`ToolRunner.sending(request)`** is how a host that drives a `ToolRunner` itself reports what a turn sends: it returns the request it was given. `AgentSession` calls it for every turn.

**Upgrading.** Nothing changes for a host whose context blocks carry no `untrusted` field. A host that already used a field named `untrusted` on a context block for something else must rename it: any value but `false` or `undefined` now marks the block.
