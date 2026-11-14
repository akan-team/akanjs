---
"use-agentic": minor
---

A context block can say that its text is someone else's, and a turn sent with one, or with a message that points at a record, asks before the next change.

- **`ContextBlock.untrusted`.** A host's `buildContext` marks a block `untrusted: true` when it holds text someone other than its developer or the user may have written, such as a record's title. A backend fences such a block as page content (`WIRE.md`).
- **A turn sent with a marked block counts as a `taint: "source"` read.** The first change after it pauses on `pendingApproval`, whatever the tool's own `confirm` says, until the user approves a call. The same marked text on a later turn does not ask again; changed text does. `askAfterUntrusted: false` turns this off with the rest of the rule.
- **A message with `references` counts as such a read too.** A reference's label and value are the record's own text, so the first change after the message asks first, once per set of references in the transcript. A transcript restored with references asks on its first change as well.
- **`ToolRunner.sending(request)`** is how a host that drives a `ToolRunner` itself reports what a turn sends: it returns the request it was given. `AgentSession` calls it for every turn.

**Upgrading.** A host that stages references (`session.stage`, `session.refer`) must render `pendingApproval`, as a host that publishes a `taint: "source"` tool already must: the first change after a mention now waits on it. To keep such changes running as each tool's own `confirm` decides, pass `askAfterUntrusted: false`. Nothing else changes for a host whose context blocks carry no `untrusted` field. A host that already used a field named `untrusted` on a context block for something else must rename it: any value but `false` or `undefined` now marks the block.
