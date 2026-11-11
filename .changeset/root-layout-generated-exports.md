---
"akanjs": patch
"@akanjs/devkit": patch
---

The build refuses a `LevelBoundary` or `McpAppRoot` export on an app's root layout: `page/_layout.tsx`, or a grouped or base-path root layout. The generated root layout defines both itself and reads neither from the app's, so such an export was silently ignored. The error names the export and the file and says why. Remove the export; it never took effect.

`akanjs/common` exports `GENERATED_ROOT_LAYOUT_EXPORTS`, the set of those names.
