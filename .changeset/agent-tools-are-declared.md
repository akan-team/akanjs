---
"akanjs": patch
---

fix!: publish only what a component declared to the in-page agent

This supersedes the store-derived in-page surface described in the earlier entries of this release: the store
catalogue keeps its state half, and its action half is gone.

An in-page agent stands in for the person looking at the screen, so what it may do is what that screen offers them
and nothing else. Deriving its tools from the store missed that by one level: liveness was per *store*, so a single
`st.use.me()` in a gating component published every method the admin module had ever declared — `setAdminPassword`
among them — and `readState` reached every key of that store rather than the keys the screen reads. Levers the
screen does not have are not reach, they are noise the model pays for on every turn.

**`st.tool` is the only way an action reaches an agent.** The store catalogue's whole action half is gone: endpoint
argument borrowing, generated form setters, slice actions, no-argument custom actions, the arity check against the
same-named endpoint, the JSON-schema build, the argument checking, `AgentBridge.call`, and its transcript. A store
method reaches an agent by being wired into one — `.exec((id) => st.do.removeX(id))` — which is also the shape that
hands the same callable to `onClick`, so the person and the agent press one handler. `remove*` still confirms by
default; the gate moved to `StToolBuilder` with everything else.

**Reading is per key, not per store.** `AgentBridge.read` gates on the key being subscribed in that view, so a
component reading `userList` says the screen shows a list and says nothing about the `userForm` beside it in the
same store. The catalogue keeps its state half, because a read has to be masked and only the store declares which
model masks it.

**`static agent` is gone.** It existed to trim an exposure nothing derives any more, so a store class now says
nothing about agents at all — which is the same rule as the tools. `st.use.x({ agent: false })` is how the
component that subscribes a value keeps it off the surface, and it is the component's call because the component
is what put the value on screen. Delete any `static agent` declaration; there is no replacement to write.

Base-store plumbing follows the same rule as any other key: `st.use.path({ agent: false })` and
`st.use.tryJwt({ agent: false })` keep routing and the caller's credential off the surface at the call site. The
route block still carries pathname, params, and searchParams. A screen that wants an agent to read a base key
opts it in — ThemeToggle subscribes `theme` without the opt-out.

**`Agent.Dock` reads the surface** rather than the store, so its tool list is what the page declared, and
`AgenticSurface` keeps the last 200 calls so the transcript now covers every tool instead of the store's own.
