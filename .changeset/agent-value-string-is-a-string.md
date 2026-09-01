---
"akanjs": patch
---

fix: `st.expose` / `st.useState` typed `String` or `Boolean` resolve to the scalar, not to a model state object

`AgentValueOf` matched a declaration's `FIELD_META` before its `CLIENT_VALUE`, and `via.ts` augments the global
`String`, `Boolean`, `Date` and `Map` constructors with `DatabaseConstantStatics` — which carries `FIELD_META`. So
those constructors read as model classes: `st.useState("tab", String, { set: true }).desc("…").init("all")` handed
back `GetStateObject<String>` instead of `string`, and the same for `Boolean`. `Date` escaped only because it is
special-cased above, and `Int` / `Float` / `ID` / `Any` are declared classes rather than augmented globals.

Only the value `st.useState` returns was wrong. `.value()` on `st.expose` kept accepting the literal, because a
string is assignable to `GetStateObject<String>` — which is exactly why nothing caught it: the runtime, the
schemas, and every `st.expose` call site were correct throughout.

A scalar is now matched by `refName`, above the model branch. A model carries no `refName`, so nothing about the
model path changes — a model still resolves to its state object and still takes a hydrated document or a plain
copy of one. `AgentValueOf` is pinned branch by branch in `AgentValue.test.ts`, and `StStateBuilder.test.tsx`
covers a `String` and a `Boolean` state end to end.

Anyone on `3.0.0-alpha.53` who worked around this with `as unknown as string` / `as unknown as boolean` on an
`st.useState` result can delete those casts.
