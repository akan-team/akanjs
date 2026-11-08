---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan start` now serves Akan Studio at `/_akan/studio`, a read-only view of the Akan Graph for the running app and the libs it reaches.

- **ERD:** models, scalars and enums with their fields. Each relation is drawn from the field that names it, and each referenced type sits to the right of the model that names it.
- **Signals:** one module laid out from left to right: components and pages, store actions, endpoints and slices with their guards, service methods, then queries and models.
- **Interaction:**
  - Hovering a box highlights its edges and neighbours, and clicking it pins the highlight.
  - The filter dims boxes whose name doesn't match.
  - Every name opens its source in VS Code or Cursor.
  - `/_akan/studio/graph` returns the same graph as JSON.
- **How it's built:**
  - The page is server-rendered SVG with a small inline script, and loads no client bundle.
  - The dev builder draws the graph on request through a new `build-graph` builder RPC, and keeps it until the next save.
  - It sits behind the same gate as the other `/_akan` devtools routes, and `akan tunnel` / `akan start --share` refuse it.
