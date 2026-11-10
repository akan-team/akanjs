---
"akanjs": patch
---

A `Load.Stream` whose promise rejects now renders a short notice ("This could not be loaded.") in its own place, and the rest of the page stays. Before, a rejection that reached the browser after the page had started streaming was rethrown outside any error boundary, so React unmounted the whole page (production error #441, a blank screen). `Load.Units`, `Load.View`, `Load.Edit` and `Load.Pagination` stream through it, so a list whose `init` the server refuses, such as a role-guarded slice or an expired session, keeps its page around it.

- `Load.Stream` takes an `error` node to render instead of the notice.
- A new promise after a failure clears it, so a refresh that loads renders the value.
- A rejection that settles before the first byte of the page has left still takes the render-error path, as any error there does: the nearest layout's `.error()`, or the 500 page.
