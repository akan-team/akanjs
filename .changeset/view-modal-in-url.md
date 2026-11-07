---
"akanjs": patch
---

- `Data.ListContainer` and `Model.AdminPanel` take `viewInUrl`, which keeps the open view modal in the URL as `?action=view&modelId=<id>` alongside every other param. A link carrying those params opens that record whether or not the loaded page lists it, a link to another record replaces the open one, and an id that fails to load closes the modal and drops the params. The container draws one view modal of its own, not one per row.
- They also take `renderViewTitle`, the view modal's title apart from the edit modal's; `false` drops the view's title bar.
- The view modal's bottom bar now carries the record's `actions`, everything but "view", with labels: "edit" opens the edit form, which goes back to the view when it closes or saves (the URL keeps naming the view meanwhile), "remove" asks the row's confirm and then closes the view and its params, and a custom element renders as given. A function form is asked with the viewed record and its place on the loaded page (-1 when it is not listed). The bar is left out when nothing remains; `viewActions={false}` turns it off.
- Editing a record the loaded page does not list opens the edit form too, where it opened nothing before.
- `Model.ViewModal` draws a title bar only when it is given `renderTitle`, and an action bar only when `renderAction` answers something other than `null`, so a view with no actions no longer shows an empty footer. Without an `id` it opens for whichever record `view<Model>` loads.
- A dialog whose title or action slot goes away no longer keeps showing the last one.
- `Data.Item` cards are more compact: less padding and spacing, smaller action buttons, and the time moves to the left of the action row when it would be alone in the header.
