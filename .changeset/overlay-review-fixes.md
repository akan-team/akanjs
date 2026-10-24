---
"akanjs": patch
---

`<Model.Edit modal="quick">` opens its form; it set the store's modal to `"quick"`, but nothing opened under that name. `Model.Edit` also takes `presentation` and `placement`, as `Model.New` does. A `Model.New` whose form is open under its own `modal` refuses another create, from its trigger or from the agent's `new<Model>` tool, instead of replacing what was typed; before, only a form open under the default modal was guarded.

Pressing Escape to close an open `Select` list, or the slash menu or panel of `Agent.Chat`, no longer also closes an open `Modal`. `Modal`, `BottomSheet`, `Popconfirm` and `Tooltip` now leave alone an Escape that a control already handled with `preventDefault()`, so a control of your own can keep them open the same way. Escape in the tag input of `Field.Tags` now only cancels the tag being typed, and leaves the `Modal` around it open.

In a CSR stack, a `Modal` or `LegacyModal` left open on a page you navigate away from no longer stays on top of the next page, where it still took clicks, Tab and Escape and kept the page from scrolling. It is hidden while its page is not the current one, and shows again with what was typed when you go back, as `BottomSheet` already did.
