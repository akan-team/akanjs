---
"akanjs": patch
"@akanjs/devkit": patch
---

Every SSR page now loads 72K less framework JavaScript (22K less after Brotli).

- **`akan build` narrows the vendor entries to the names the page code imports.** The `akanjs/*` and `tailwind-merge` entries in the page's import map used to re-export a whole facet. Each one now exports only the names the built route bundles import, lazy chunks included. On the minimal app, the framework floor, meaning the runtime plus the vendor entries every page loads, drops from 630.2K raw / 189.4K br to 558.4K raw / 167.4K br. `akan start` keeps whole facets, so a newly saved import never misses a name.
- **The agent runtime moved to `akanjs/store/agent`, which has its own vendor entry.** This covers `AgentContext`, `AgentVisual`, `AgentPrompts`, `StoreSurfaceSource`, the `Screen*` readers and the rest. A page now loads that entry (28.6K raw / 9.4K br) only when it mounts `Agent.Chat`, `Agent.Zone` or `Agent.Dock`. `akanjs/store` still re-exports these names for one minor, marked `@deprecated`. A build whose pages import none of them keeps the runtime out of the store entry. `ToolReturn`, `AgentAbort` and `AgentProgress` stay in `akanjs/store`.
- **A tab left open across a deploy loads its next page as a document when the import map changed.** Narrowed vendor entries differ from build to build, so a newer route chunk could import a name the tab's vendor entries lack. Each document now names its import map, and the server answers a navigation from another import map with 409. The client then loads the target as a document, with the current import map.
- **A narrowed build fails when route code imports a name its facet does not export**, and names the missing names. Before, the page threw a `SyntaxError` in the browser.
