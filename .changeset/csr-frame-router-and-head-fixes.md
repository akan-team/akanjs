---
"akanjs": patch
---

A CSR frame's router keeps working on the stack it holds after the first render: `router.init` takes the frame's router once at mount, and every later `push`, `replace` and `back` used to run that first render's state, so a `replace` dropped the page under the current one and a `back` skipped the frame's snapshot when the app opened on a page with no transition. A stack or bottom-up back now slides by the frame's current width after a resize or a rotation, and an empty top-left action slot no longer catches clicks meant for the navbar's left edge on a page with no back button.

An RSC navigation's head patch anchors on and removes only the route head nodes still in `<head>`, and its rollback restores only what it removed. The CSR location keeps every value of a repeated query key, an empty one included (`?tag=&tag=b` reads `["", "b"]`, not `"b"`).
