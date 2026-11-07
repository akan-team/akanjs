---
"akanjs": patch
---

- `Data.ListContainer` and `Model.AdminPanel` take `viewInUrl`, which keeps the open view modal in the URL as `?action=view&modelId=<id>` alongside every other param. A link carrying those params opens that record whether or not the loaded page lists it, a link to another record replaces the open one, and an id that fails to load closes the modal and drops the params. The container draws one view modal of its own, not one per row.
- They also take `renderViewTitle`, the view modal's title apart from the edit modal's; `false` drops the view's title bar.
- `Model.ViewModal` draws a title bar or an action bar only when it is given the matching render function, so a view with no `renderAction` no longer shows an empty footer. Without an `id` it opens for whichever record `view<Model>` loads.
- `Data.Item` cards are more compact: less padding and spacing, smaller action buttons, and the time moves to the left of the action row when it would be alone in the header.
