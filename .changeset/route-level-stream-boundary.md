---
"akanjs": patch
"@akanjs/devkit": patch
---

A route level whose server render fails after the page has started streaming now draws a notice ("This page could not be loaded.") with a "Try again" button in its own place, and the layouts above it stay. Before, the browser rethrew the error with no error boundary above it, so React unmounted the whole page (production error #441, a blank screen). That covered a page or layout below a `.loading()` that throws, and a fetch handle field that reaches no `Load.*` when the server refuses it: awaited in a component below the page, rendered as a child, or `use()`-d by a client component outside `Load.*`.

- The generated root layout exports `LevelBoundary`, and server rendering puts it around every route level, inside the level's Suspense. The notice is the one a failed level already draws in a CSR app. "Try again" calls `router.refresh()`, and the page's next payload renders the level again.
- A not-found or redirect raised below the route after the page started streaming renders nothing in that level's place, as the host answers it.
- An error that fails a level before the first byte has left still gets the nearest layout's `.error()` and its status: the server renders the same HTML as before, since React's server renderer runs no error boundary.
- **Propagation change:** an error the server streamed now stops at the nearest route level. An error boundary an app put above a layout's `children` no longer sees it. An error thrown while the browser renders a client component carries no digest and propagates as before, so render bugs still surface.
- What still differs from a refusal before the first byte: such a field takes the notice in place of its whole level, not the layout's `.error()`, and the page answers 200. Hand it to a `Load.*` to keep the rest of the level, or await the handle for `.error()`.
