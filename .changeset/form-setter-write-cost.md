---
"akanjs": patch
---

A form field setter now costs about one copy of the state, like any other store write. `set<Field>On<Model>`, `add<Field>On<Model>`, `sub<Field>On<Model>`, `writeOn<Model>` and the file upload setters used to hand `set` an updater, which ran immer over the whole state and then compared every key. A keystroke cost 284 µs at 1,740 keys and 600 µs at 3,480. They now produce the new form alone and write it as a patch: 42 µs at 1,740 keys and 79 µs at 3,480, against 37 µs and 74 µs for a bare copy of the state.

- **`merge<Model>` marks the open model loading under its own key.** It wrote a literal `modelLoading` key, so `<model>Loading` never showed the merge in flight and the state gained a stray key. The view modal now shows its loading state during a merge.
- **A failed model action ends the loading it started.** When `create<Model>`, `create<Model>InForm`, `update<Model>`, `update<Model>InForm`, `merge<Model>` or `view<Model>` fails, `<model>Loading` goes back to `false`; when `edit<Model>` fails, `<model>FormLoading` does. That also holds when the request succeeds but the write after it throws. Before, the flag stayed set and the view or edit modal stayed under its loading overlay.
- **A loading flag is cleared only by the action that set it last.** An action that another one overtook leaves the flag alone, even when both are on the same record. Before, a merge or update landing during a `view<Model>` of the same record showed that view as loaded early.
- **A model action no longer takes over what the store's own `view<Model>`, `edit<Model>` or `new<Model>` opened during its request.** A component that writes a record or form into the store itself, as the edit modal does from a page payload, does not count as an open.
  - `merge<Model>`, `update<Model>` and `update<Model>InForm` write the answer as the open model only while that record is still open.
  - Creates and updates leave the modal alone.
  - `update<Model>InForm` and `create<Model>InForm` leave the form to an `edit<Model>` or `new<Model>` opened meanwhile. A `view<Model>` does not take the form, so the saved form is still reset and its draft dropped.
  - A `view<Model>` or `edit<Model>` overtaken by a later one no longer lands its record over the later one.
  - Before, a view of another record was replaced or closed when the write landed, and an edit opened during a save lost its form.
- **A form opened under the same draft scope while `create<Model>InForm` or `update<Model>InForm` waits for the server opens without that draft**, so a second new form is not refilled with what the first is creating. The draft stays in storage until the request succeeds, so a reload during the save still restores it, and it is kept when the request fails. On success it is deleted only while it still holds the saved form, so a draft that a form opened meanwhile wrote is kept. A draft discarded or reset during the save stays gone when the save fails. A draft write still pending when the save starts is written first.
- **A failed `view<Model>` or `edit<Model>` that is still the latest open closes its modal**, unless the modal already shows that record, as when a page payload seeded it. Before, the modal stayed open over the previous record.
