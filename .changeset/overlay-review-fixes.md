---
"akanjs": patch
---

`<Model.Edit modal="quick">` opens its form; it set the store's modal to `"quick"`, but nothing opened under that name. `Model.Edit` also takes `presentation` and `placement`, as `Model.New` does. A `Model.New` whose form is open under its own `modal` refuses another create, from its trigger or from the agent's `new<Model>` tool, instead of replacing what was typed; before, only a form open under the default modal was guarded.
