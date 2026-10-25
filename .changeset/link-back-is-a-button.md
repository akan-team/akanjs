---
"akanjs": patch
---

`Link.Back` renders a `<button type="button">` instead of a `<div>`, which a keyboard could not reach and a screen reader did not announce as an action.

Upgrade note: a `Link.Back` with no `className` setting `display` is now inline-block, as a button is, rather than a block.
