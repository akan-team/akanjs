---
"akanjs": minor
"use-agentic": patch
---

fix(agent): a write's change report carries a changed value the way the screen block does

After a tool call that changed something, its result lists the resources that changed. Each entry held the whole
new value, so free text published with `st.expose`, `st.useState` or `useAgentResource`, which the screen block
leaves out and `readState` answers as page content, reached the model as the app's own data on the first write. An
entry now keeps what the screen block keeps (a token, a number, a boolean, an ISO timestamp, a short list or object
of those, and a list scope's ids and token labels) and is marked `withheld: true` when anything was left out;
`readState(name)` answers the rest. The in-page agent and an MCP App view both report this way.

- `AgentContext.reported(view)` returns a surface view whose change report follows the rule.
- `ResourceDiff` gains the optional `withheld` field.

**Upgrading.** No code change is needed: both additions are optional. A model that read a sentence from a tool
result's `changes` now finds the entry marked `withheld` and reads it with `readState`, which makes the next change
ask for approval. Where an agent should act on a changed value without that ask, publish an id, a count or an enum
member, or return the value from the tool itself. A host that builds its own `ToolRunner` over the store surface
wraps the surface with `AgentContext.reported` to report the same way.
