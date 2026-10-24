---
"akanjs": patch
---

An open `Load.Edit` or `Model.EditModal` form keeps what was typed when its page re-renders with the same seed, as it does on every `router.refresh()`. Before, the editor refilled the form whenever its `edit` prop was a new object, and every refresh hands it one.

- The editor now refills only when the seed itself changes. For an edit payload, that means the record's id and `updatedAt`, not `<model>ViewAt`, which is stamped on every fetch. For a new form, it means the seed's values.
- A record that changed on the server still refills, and an enabled draft is still offered back through the conflict bar.
- While any form of that model is open, an equal seed leaves it alone. Once a submit or a cancel has closed it, an equal seed opens a fresh form, as before.
