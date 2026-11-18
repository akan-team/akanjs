---
"akanjs": patch
"use-agentic": patch
---

fix(agent): a write's change report carries a changed value the way the screen block does

After a tool call that changed something, its result lists the resources that changed. Each entry held the whole
new value, so free text published with `st.expose`, `st.useState` or `useAgentResource`, which the screen block
leaves out and `readState` answers as page content, reached the model as the app's own data on the first write. An
entry now keeps what the screen block keeps (a token, a number, a boolean, an ISO timestamp, a short list or object
of those, and a list scope's ids and token labels) and is marked `withheld: true` when anything was left out;
`readState(name)` answers the rest. The in-page agent and an MCP App view both report this way. `ResourceDiff` in
`use-agentic` gains the optional `withheld` field.
