---
name: akan-agent
description: "Build the in-page agent: mounting Agent.Chat, setAgentAccess and the request policy, the LLM, publishing st.tool actions and cards, forms, readable state, zones, route guidance and slash commands."
---

# Akan in-page agent

**The surface is what components declare, exactly.** `st.tool` publishes one action and `st.use` / `st.sel` /
`st.ref` make one store key readable while the reading component is mounted. A method on a store class gives an
agent nothing, and only the current page's declarations are live.

## Mount it

1. Mount `<Agent.Chat />` once, in a layout. It never executes tools: every tool runs in the caller's browser,
   gated by guards and the approval card.
2. It refuses every call until `option.setAgentAccess(<guard>)` in `lib/option.ts` names who may use it
   (`SignedIn` for a product with accounts). What a turn may ask is `option.setAgentRequestPolicy`.
3. The LLM is `option.setLlm({ apiKey, model, host })`, never env.

## Publish actions

- Declare the tool beside the control that already does it, and hand the result to the control:
  `st.tool("x").desc("…").arg("id", ID).exec((id) => st.do.removeX(id))`. One handler serves the person and the
  agent; `.desc()` is required and first.
- `.card(({ submit, cancel }) => <Form … />)` parks the call in the chat for an answer that is the user's to give.
- Store-driven forms publish themselves: `onChange={st.do.setFieldOnX}` by reference emits the `data-akan-action`
  the agent drives. A pass-through arrow publishes nothing and fails lint.
- Every `st.tool(…).exec()` / `.card()` is a hook: never behind a condition.

## Reads and guidance

- `st.use.x({ agent: false })` hides a key; `hidden`, `secret` and `visual` fields are stripped from every read.
- A tool value is capped at 20,000 characters.
- Route guidance is `<Agent.Guide instructions="…" />`; model-facing text is English.

Full detail: `get_guideline` with `agentRule`.
