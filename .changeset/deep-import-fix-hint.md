---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan verify` adds a `fix:` line to a module file's two-parent import that names the layer barrel to import from instead, such as `import from "@apps/<app>/common"`. The lint message itself now points at the layer barrel too.
