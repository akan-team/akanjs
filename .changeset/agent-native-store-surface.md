---
"akanjs": patch
---

feat: derive an agent surface from the store, annotate the DOM with it, and add a read-only insight query

The server half of agent support is the signal registry; this is the client half plus the layer-bypassing read. All
of it is derived — an app writes no declaration for any of it.

**`SerializedStore` and `StoreCatalogue`** describe one built store the way `SerializedSignal` describes a signal
registry: every key on `st.use` and every action on `st.do`, with argument schemas. Flat rather than grouped by
model, because that is what the store is — one namespace, where a key means the same thing to every reader.

The exposure default is the opposite of the MCP catalogue's, and deliberately: a key on `st.do` is the same call the
user's own click makes, under their own credential, with them watching, so an agent driving it cannot reach past what
the UI already permits. Every key is published unless something about it cannot be described, and each of those is
recorded as a refusal with the reason — a `hidden`/`secret` field setter (the masking boundary facing the other way),
a `Map` or relation field, a `FileList` upload, `selectModel` (it stores the list item it was handed, so an id would
leave a stub), and any action that declares arguments no endpoint or field describes.

Nothing re-derives a name rule. An action's arguments come from the endpoint it is named after — which is not luck
but the house rule that makes `st.do.X` read the same as `fetch.X` — or from the field metadata the setter was
generated from, or from the role the store recorded while it built the slice. Two things had to be added to make that
possible: arity is captured in `#mergeActions` (the `st.do` wrapper takes rest arguments, so `Function.length` is
zero for everything by the time anyone can ask), and `ACTION_OWNER_META` records which module declared each action,
which is what names the dictionary node its words are read from.

**`AgentBridge`** turns that into tools with JSON schemas, checks each argument against what it declared, dispatches
through `st.do`, masks reads, and keeps a transcript. It holds no model, provider, or key — an app wires whichever
agent it uses to `tools` / `call` / `read`. `Agent.Dock` in `akanjs/ui` renders the catalogue, the refusals and the
transcript, and can run a tool by hand; it is how you see what a page actually publishes.

Reads are masked because they have to be: `<model>Form` holds what the user just typed, credentials included, and an
in-page agent ships what it reads to a remote model. The mask is by the declared model rather than by the value's
class, since `immerify` copies a form into a plain object and the class is gone by then. `Msg.mask` moved to
`constant/mask.ts` so both audiences use one implementation.

**`data-akan-action` / `data-akan-state`** are emitted by the framework's own interactive primitives, with no app
code at all. `onChange={st.do.setNameOnUser}` — the house form for every model field — already carries everything an
annotation needs; it just had no way to be read off a function, and now it does. `Input` (every variant plus
`Checkbox`), `Select`, `Switch`, `Button`, and the `Field.*` fields all carry it. An inline arrow gets nothing,
because a closure the caller wrote says nothing about what it does. Accessibility trees, E2E selectors, and external
browser agents get the same names for free.

**`InsightQuery`** is one read-only SQL statement, for a question the domain endpoints cannot express. Read-only is
enforced four ways — the statement is wrapped as a derived table, where nothing but a query is legal in either
dialect; a pre-execution check runs on the statement with comments and string literals removed; forbidden keywords
are rejected rather than trusting that Postgres refuses a data-modifying CTE inside a subquery; and the `_doc` column
never crosses the boundary, since that is where every maskable field lives and an arbitrary SELECT names no model to
mask by. Rows are capped at 1000, which no caller can raise. The timeout bounds the wait, not the query —
`bun:sqlite` is synchronous and holds the loop, so the ceiling is what limits that case.

What the insight query costs is worth stating: it answers "how many, since when, grouped how" over base columns and
the search mirror, and it cannot read a domain field. Field-level reads go through the domain tools, which mask.

`libs/shared` exposes it as `runAdminSql` on the admin signal, guarded by `SuperAdmin` and returning the new
`insightRows` scalar. It is a `mutation` despite not being able to write, because a `query` is a GET that never sends
a body — the statement would have to travel in the URL, where it lands in every access log and hits the length limit
— and because a query's response is memoized per URL, which is wrong for an ad-hoc statement. It is not MCP-exposed:
the catalogue is built once at boot rather than per caller, so publishing it would tell every client that can reach
`/mcp` that an arbitrary-SQL tool exists.
