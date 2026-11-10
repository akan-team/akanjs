---
"akanjs": patch
---

A `Load.Stream` whose promise rejects now renders a short notice ("This could not be loaded.") with a "Try again" button in its own place, and the rest of the page stays. Before, a rejection that reached the browser after the page had started streaming was rethrown outside any error boundary, so React unmounted the whole page (production error #441, a blank screen). `Load.Units`, `Load.View`, `Load.Edit` and `Load.Pagination` stream through it, so a list whose `init` the server refuses, such as a role-guarded slice or an expired session, keeps its page around it.

- "Try again" calls `router.refresh()`. A new promise after a failure clears the notice, so a refresh that loads renders the value.
- Outside production the notice also shows the error's message.
- `Load.Stream`, `Load.Units`, `Load.View`, `Load.Edit` and `Load.Pagination` take `error`: a node to render instead of the notice, or, where they render on the client, `(error, retry) => ReactNode`. `Load.Pagination` renders nothing by default, since the list sharing its `init` shows the notice.
- A not-found or redirect raised below the route after the page started streaming renders nothing in its place, as the host answers it.
- **Propagation change:** a rejection now stops at its `Load.*`. An error boundary an app put above one no longer sees it; pass `error` to replace the notice.
- A field of a fetch handle that a page hands to a `Load.*` unawaited (`const { memoInitInPublic } = fetch.initMemoInPublic()`) no longer turns the page into the nearest layout's `.error()` or the 500 page when it is refused before the first byte has left. The page answers 200 and the browser draws the notice in that section. Such a render is never stored in the RSC or HTML result cache, so the next visitor and "Try again" render it anew.
- A page or layout body that awaits the field, or a layout's `.notFound()` view that does, still gets its `.error()`. So does an awaited handle (`await fetch.initMemoInPublic()`) and any promise that is not a handle's field.
- **Limit:** the server cannot see where a field ends up, so a refused field is excused wherever it goes. One that reaches no `Load.*` used to take `.error()` or the 500 page when it was refused before the first byte. Now the page answers 200 and the browser blanks it (#441), as it already did when the refusal came later. That covers a server component below the page awaiting the field, the field rendered as a child, and a client component `use()`-ing it outside `Load.*`. Hand a field only to a `Load.*`, directly or through a Zone, or await the handle.
