---
"akanjs": minor
"use-agentic": minor
---

feat(csr): only the current page publishes to the in-page agent, and a page can bind work to being looked at

A CSR page kept under the current one for a swipe back is mounted and live, so its `st.tool`s, resources, guides and
`st.use` keys used to sit in the agent's surface beside the current page's. The agent was offered a lever the user
could not see, and two pages declaring one name clashed.

- **`<AgentActivity active>`** (`use-agentic`) publishes what is registered below it only while `active`.
  Registrations stay in place, so turning it back on re-publishes without a remount. A parked registration shadows
  nothing and never clashes with a published one. Nested activities close with their parent. A registry kept outside
  the surface reads the same gate through `useAgentGate()`. Under it are `AgenticSurface.gate(active, parent?)` and
  `AgenticSurface.gated(gate)`, and the registration methods take the gate as an optional trailing argument.
- Every CSR page container renders one, open only for the current page. The store's live keys follow it, so
  `readState` answers for the screen the user sees.
- The agent's screen targeting (`highlight`, a zone's `readScreen`, the cursor) skips anything under an `inert`,
  `aria-hidden` or `hidden` ancestor, not only elements that carry one themselves.
- **`usePageFocusEffect(effect, deps)`** (`akanjs/webkit`) runs `effect` while the user is on the page and cleans it up
  when they leave: after the entrance settles, and as soon as the page starts to go. It is for a camera, a poll or a
  key binding that a live page under the current one must not keep running. **`usePageActivity()`** answers
  `"current" | "prev" | "pending" | "hidden"`, and `current` outside a CSR stack.
