---
"akanjs": patch
"use-agentic": patch
---

feat!: `st.tool`, `st.expose` and `st.useState` become one chain, and a declaration's type is its mask

**Breaking.** The three declarations an app writes for the in-page agent had three different shapes and two
options that did not carry their weight. They are now one shape — `<entry>(name, …) → .desc(text) → <terminal>`,
where the terminal call is the hook — and every option left is one the runtime reads. Migration guide:
`local/tool-migration.md`.

```ts
st.tool("removeTask", { confirm: true }).desc("Remove one task.").arg("taskId", ID).opt("force", Boolean).exec(fn);
st.expose("openNote", cnst.LightNote).desc("The note on screen.").value(note);
const [tab, setTab] = st.useState("tab", String, { set: true }).desc("Which tab.").init("all");
```

**`.desc()` is required, and it is now load-bearing twice.** A model picks a tool by that sentence and by nothing
else, so a tool without one was a tool an agent could only guess at. It also replaces `shared: true`: a row
component registering fifty `removeTask` is fifty copies of one name *and one description*, which the surface now
reads as one declaration, while a second description arriving under a name already taken is two components that
collided and still warns. `shared` was an unverified claim whose only effect was suppressing that warning — a flag
that said "trust me" where the description already says the same thing, checkably.

**`effect` becomes `settle`, because only one of its three values ever did anything.** `"query"` skipped the wait
for the screen to settle before the call's effect was reported; `"state"` and `"mutation"` were indistinguishable
at runtime, were dropped before reaching the model, and coloured a badge. What is left is the fact the session
actually needs: `{ settle: false }` is a read that returns what is already there, and everything else is waited
out because a write may still be landing when `exec` resolves. `effect` also leaves `PublishedTool`, the relay
wire (`AgentWireTool`, `WIRE.md`) and the `/tools` dock badge.

**`.arg()` is required and `.opt()` is optional**, matching the filter builder's vocabulary, so an optional
argument is a different call rather than an options bag — and the `exec` parameter widens to `| null` only for
`.opt`.

**A readable value declares its type, and the type is the mask.** `st.expose(name, Type)` and
`st.useState(name, Type)` take a scalar, an enum, a model class, a one-level array of those, or `Any`. The type
typechecks what the component hands over — a model resolves to its state object, so a hydrated document and a
plain copy of one are equally accepted — and it decides how the value reads: a model strips its own `hidden`,
`secret` and `visual` fields by the model that was *named* rather than by whatever class the value still carries,
and a `Date` leaves as an ISO string. That subsumes `mask:` and `serialize:`, both of which are gone; `Any` is the
escape hatch and passes the value untouched. A type nothing can read is reported on the console and left
unpublished rather than thrown, the same degradation an undescribable `.arg` already had. `.value()` also takes a
thunk, read when the agent reads, for a value assembled out of a ref the children fill in after the render.
`st.useState`'s `set` is now a boolean, since the write schema comes from the same type.
