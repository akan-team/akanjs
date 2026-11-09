---
"akanjs": patch
"@akanjs/devkit": patch
---

Every SSR page now loads 72K less framework JavaScript (22K less after Brotli).

- **`akan build` narrows the vendor entries to the names the page code imports.** The `akanjs/*` and `tailwind-merge` entries in the page's import map used to re-export a whole facet. Each one now exports only the names the built route bundles import, lazy chunks included. On the minimal app, the framework floor, meaning the runtime plus the vendor entries every page loads, drops from 630.2K raw / 189.4K br to 558.4K raw / 167.4K br. `akan start` keeps whole facets, so a newly saved import never misses a name.
- **The agent runtime moved to `akanjs/store/agent`, which has its own vendor entry.** This covers `AgentContext`, `AgentVisual`, `AgentPrompts`, `StoreSurfaceSource`, the `Screen*` readers and the rest. A page now loads that entry (28.6K raw / 9.4K br) only when it mounts `Agent.Chat`, `Agent.Zone` or `Agent.Dock`. `akanjs/store` still re-exports these names for one minor, marked `@deprecated`. A build whose pages import none of them keeps the runtime out of the store entry. `ToolReturn`, `AgentAbort` and `AgentProgress` stay in `akanjs/store`.
