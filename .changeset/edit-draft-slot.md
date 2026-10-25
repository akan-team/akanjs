---
"akanjs": patch
---

A `Load.Edit` or `Model.EditModal` form filled from its page no longer saves that fill as a form draft. Before, the store took the fill for typing and, 400 ms later, saved it under the draft of the record open before it: coming back to an edit page with Back could delete its draft when the page's refresh took longer than that, a refresh bringing a newer version deleted the draft the conflict bar had just offered, and opening another record could save its form as the previous record's draft, which then kept that record's editor from opening and, re-saved on every visit, never expired. Keystrokes still waiting to be saved when the form refills now land under the draft they were typed for.

A draft write still waiting when `new<Model>`, `edit<Model>` or `load<Model>FormDraft` opens another form, or the same record at a newer version, is saved under the draft it was typed for. Before, it ran against the newly opened form instead, which lost it and could delete that form's draft.

A record's draft that 3.0 saved with another record's form is dropped when the record next opens, instead of filling its form.
