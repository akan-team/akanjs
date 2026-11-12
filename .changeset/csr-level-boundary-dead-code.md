---
"@akanjs/devkit": patch
---

A CSR bundle and each MCP App view no longer carry the route-level boundary, which only a server render draws. The generated root layout's `LevelBoundary` export is now undefined in a CSR build, which MCP App views share, so their `import * as root` of the layout no longer keeps it. In `akan build minimal --fast` each MCP App view and the CSR `index.html` are about 0.45KB smaller raw. A server render is unchanged.
