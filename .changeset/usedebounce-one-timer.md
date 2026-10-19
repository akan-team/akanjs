---
"akanjs": patch
---

`useDebounce` keeps one timer per component and runs the callback from the latest render. A `states` list that changed between calls used to start a new timer without clearing the old one, so a searchable `Select` with `onSearch` searched on every keystroke; it now searches once, after typing stops. A call still waiting at unmount runs then, instead of firing after the component is gone, where `Model.EditModal`'s submit check landed on whatever form the store held next. `states` is no longer read.
