---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
"@akanjs/language": patch
---

Akan Studio maps the framework itself, and `pkgs/akanjs/ARCHITECTURE.md` keeps its tables from the source.

- **The Framework view** (`/_akan/studio?view=framework`, `akan studio <app> --view framework`) lays the `akanjs` facets and `@akanjs/devkit` out by layer, with their largest classes, and draws value, lazy and type-only imports apart. Under it, one table per process channel names who sends and who handles each message, each linked to its source. It reads `pkgs/akanjs` in this repository and the installed `akanjs` in a consumer workspace (without its bundled `vendor/` and `types/`), and never joins the app's own graph or `get_graph`. The dev builder rebuilds it only when the installed version changes or a save lands under `pkgs/`.
- **`FrameworkMapBuilder`, `FrameworkChannelReader` and `FrameworkMapDoc`** in `@akanjs/language` build the map with the TypeScript compiler API: facets and their import layers, and for each channel union the classes that write a message's `type` literal or branch on it.
- **`pkgs/akanjs/ARCHITECTURE.md`** pairs a hand-kept walk through the processes and a request with a generated part between markers. `akan sync-architecture` regenerates that part, and a devkit test fails when it is stale, when a channel is gone, when two facets load values from each other, when a message has neither a recognised sender nor handler, or when the hand-kept part names a class the source no longer has.
