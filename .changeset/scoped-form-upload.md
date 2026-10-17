---
"akanjs": minor
---

Scope the generated `upload<Field>On<Model>` store actions to the form that started them, and expose their pending state. A new `<model>FormUploading` state key holds the uploads in flight per `File` field (`{}` when idle); `check<Model>Submitable` and `Model.EditModal` keep submit disabled while it is not empty. A result is dropped when the form was set whole meanwhile (`new` / `edit` / `reset`, a save, a draft restore, `set<Model>Form`, an edit shell's hydration — the store clears the key on every `set({ <model>Form })` — or another record) or, on a single field, when a newer upload or `set<Field>On<Model>` superseded it; an array field inserts into the list as it is when the upload lands, and the status poll stops once the field no longer holds the file.
