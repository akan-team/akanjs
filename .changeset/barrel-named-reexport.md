---
"@akanjs/devkit": patch
---

The barrel-import rewrite maps a name that a barrel re-exports by name from another barrel (`export { migration } from "./migration"`) to the file that declares it, as it already did through `export *`. It used to stop at the inner barrel, so a page that imported one name loaded every module behind it.
