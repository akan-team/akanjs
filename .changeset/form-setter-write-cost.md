---
"akanjs": patch
---

A form field setter now costs about one copy of the state, like any other store write. `set<Field>On<Model>`, `add<Field>On<Model>`, `sub<Field>On<Model>`, `writeOn<Model>` and the file upload setters used to hand `set` an updater, which ran immer over the whole state and then compared every key. A keystroke cost 284 µs at 1,740 keys and 600 µs at 3,480. They now produce the new form alone and write it as a patch: 42 µs at 1,740 keys and 79 µs at 3,480, against 37 µs and 74 µs for a bare copy of the state.

- **`merge<Model>` marks the open model loading under its own key.** It wrote a literal `modelLoading` key, so `<model>Loading` never showed the merge in flight and the state gained a stray key. The view modal now shows its loading state during a merge.
- **A failed `merge<Model>`, `update<Model>` or `update<Model>InForm` ends the loading it started.** `<model>Loading` goes back to `false` when the request fails, unless a `view<Model>` of another record took it over meanwhile. Before, a failed update left the view modal under its loading overlay.
- **`merge<Model>`, `update<Model>` and `update<Model>InForm` no longer overwrite a `view<Model>` that started during their request.** They write the answer as the open model only if that record is still the open one, and clear `<model>Loading` only if the flag is still theirs. Before, a view of another record that landed first was replaced by the written record, and one still loading was shown as loaded.
