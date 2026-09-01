---
"akanjs": patch
"use-agentic": patch
---

feat: akanjs/ui drives itself for an in-page agent

The framework's own components now publish the controls they draw, so an app gets a working agent surface for
list management, tabs, paging, forms, dialogs, and the app shell without writing a line. Names are the store
action's wherever one exists (`setSortOfTaskInOrg`, `removeTask`), so the tool an agent calls and the action the
button dispatches read the same.

- **`Data.ListContainer`**, and so every `Model.AdminPanel`: view mode, sort, page size, refresh, create, the two
  exports, and the row and modal verbs — `edit`/`view`/`remove` by id, plus `submit`, `cancelEditOf`,
  `closeViewOf`. It also opens a `<slice>.items` resource, which is where the id for a row verb comes from.
- **`Tab`**, **`Dialog`**, **`ScreenNavigator`** take a `namespace` prop and publish under it. Without one they
  publish nothing: two tabs on one screen would otherwise answer to a single name, and the first to mount would
  lose. `Tab`'s menu registry became a `Map` of menu to disabled, which also stopped the disabled-tab fallback
  from landing on another disabled tab.
- **Paging** is one shared `usePageTool`, spoken by all three components that draw a pager.
- **`Layout.Sider`**, **`System.SelectLanguage`**, **`Link.Back`** publish the shell controls.

**Forms fill themselves, from two sides.** An app writes no `st.tool` for a form.

A form control handed its setter **by reference** — `onChange={st.do.setTitleOnTask}` — publishes
`setTitleOnTask` while it is on screen. That is the same reference that already earned `data-akan-action`, so the
agent's tool and the person's control are one function, and an inline arrow still publishes nothing. Scoping
publication to the control rather than to the model is what keeps an agent out of a field the template draws
nothing for.

`st.use.taskForm()` adds one more: `fillTaskForm(patch)`. It takes several fields in a single call, and it is the
only way to reach a list, a map, or an embedded object — their rows are written through
`writeOnTask("payments.3.name", value)`, an inline call that can carry no annotation. It is a patch, so a field
left out keeps what the person typed. Its schema is every writable field, because a declaration is mount-static;
the **guard** is where the screen gets its say, refusing a plain field whose control is not on screen and naming
the ones that are. A composite is let through, because nothing can see whether its rows rendered — the one place
left where an agent reaches a field the screen may not draw, and server guards still apply.

Neither side touches a relation (picked or uploaded, never typed), a base document field, or a `hidden`/`secret`
one **at any depth**: a read of those is masked, so publishing a writer would open the door its reader is barred
from. A rejected third shape is worth naming — a single `writeOnTask(path, value)` tool — because its `value`
could only be `Any`, which this framework's own MCP layer refuses for telling a model nothing, and a mistyped
`path` writes a new key into the form that ships on the next submit.

Nothing publishes a lever the screen does not have. A model with fewer than two sort keys draws no sort control
and has no `setSortOf<Model>`; a panel with no template draws no create button and has no `new<Model>`; a list
that fits on one page has no pager and no `setPageOf<Model>`. Callables go to the controls by reference, so
`data-akan-action` lands on them and `readScreen` names each control with the word its tool has.

Three gaps in the surface had to close first, all of them consequences of the surface being declaration-only.

**A conditional surface had no legal shape.** `.exec()` is a hook, so a component can never skip the declaration —
which left no way to publish a tool only when the screen renders its control. A falsy name now declares the tool
and publishes nothing: the callable still drives the click a person makes, and the agent never learns it exists.
`st.useState` and `st.expose` take a falsy name the same way. An unpublished callable carries no
`data-akan-action`, because that attribute names a tool an agent can reach and this one cannot. This is what lets
a list toolbar publish `setSortOfTask` only when it actually draws the sort control, instead of paying for the
tool in every turn's prompt on every screen.

**A value set only the render knows had no way in.** An `enumOf` class was already a complete argument type —
`.arg("mode", TaskStatus)` publishes the values, refuses anything off them, and narrows the `.exec` parameter to
the union — but a component cannot build one, because `enumOf` registers globally. A slice's sort keys or the
options a prop carried could only be described in prose and hoped for. `.arg(name, type, { oneOf })` takes the
list the render has and publishes and enforces it the same way. Neither reaches a set that fills in *after* the
first render, since a declaration is mount-static; that belongs in the tool's `guard`, which is re-read per call
and can name the current values in its refusal — which is what `Tab` and the pagers do.

**A list inside an `Agent.Zone` was invisible to that zone's own agent.** `useScreenScope` opened its scope at the
root rather than under the scope it is mounted in, so `Load.Units` inside a zone registered `<slice>.items` at the
top. A zone view only sees keys in its own subtree, so the root agent could read the list and the zone agent
looking straight at it could not.
