---
"akanjs": patch
"@akanjs/vscode": patch
---

**Akan: Open the module side by side** in the VS Code / Cursor extension lays one module out as an editor grid: its constant, dictionary, document, service, signal and store files, in that order, two to a column.

- It takes the active file's module, a service module (`lib/_<name>/`) or scalar (`lib/__scalar/<name>/`) included, or asks you to pick one.
- In the Studio panel, a pinned node with a module also offers **Open module**, which does the same. A browser tab does not show the button.
